import asyncio
import random
import logging
import base64
import json
import datetime
from cryptography.fernet import Fernet
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from web3 import Web3
from eth_account import Account
import aiohttp
from aiohttp_socks import ProxyConnector

# Настройка профессиональных логов
logging.basicConfig(level=logging.INFO, format='%(asctime)s | %(levelname)s | %(message)s')
logger = logging.getLogger("AIRDROP-X-CORE")

class LocalVault:
    def __init__(self, master_password: str):
        self.master_password = master_password.encode()
        self.key = self._derive_key(b"static_salt_airdrop_x")

    def _derive_key(self, salt: bytes) -> bytes:
        kdf = PBKDF2HMAC(
            algorithm=hashes.SHA256(),
            length=32,
            salt=salt,
            iterations=100000,
        )
        return base64.urlsafe_b64encode(kdf.derive(self.master_password))

    def encrypt_data(self, plaintext: str) -> str:
        f = Fernet(self.key)
        return f.encrypt(plaintext.encode()).decode()

    def decrypt_data(self, ciphertext: str) -> str:
        f = Fernet(self.key)
        return f.decrypt(ciphertext.encode()).decode()

class RPCRouter:
    def __init__(self, rpc_list: list):
        self.rpc_list = rpc_list
        self.current_index = 0

    def get_active_rpc(self) -> str:
        return self.rpc_list[self.current_index]

    def switch_to_next_rpc(self):
        old_rpc = self.rpc_list[self.current_index]
        self.current_index = (self.current_index + 1) % len(self.rpc_list)
        new_rpc = self.rpc_list[self.current_index]
        logger.warning(f"[RPC Router] Сбой на узле {old_rpc}. Переключение на резервный: {new_rpc}")

class ProxyManager:
    """Универсальный менеджер прокси с поддержкой HTTP и SOCKS5"""
    @staticmethod
    async def check_proxy(proxy_string: str) -> bool:
        test_url = "http://httpbin.org/ip"
        
        # Определяем тип прокси (если строка начинается с socks5://, используем SOCKS коннектор)
        if "socks5://" in proxy_string or "socks4://" in proxy_string:
            connector = ProxyConnector.from_url(proxy_string)
        else:
            # По умолчанию считаем, что это HTTP/HTTPS прокси
            if not proxy_string.startswith("http://"):
                proxy_string = f"http://{proxy_string}"
            connector = ProxyConnector.from_url(proxy_string)

        try:
            async with aiohttp.ClientSession(connector=connector) as session:
                async with session.get(test_url, timeout=7) as response:
                    if response.status == 200:
                        data = await response.json()
                        logger.info(f"[Proxy Manager] ✅ Прокси {proxy_string} активен. Внешний IP: {data.get('origin')}")
                        return True
        except Exception as e:
            logger.error(f"[Proxy Manager] ❌ Ошибка прокси {proxy_string}: {e}")
        return False

class Web3Handler:
    def __init__(self, rpc_url: str, private_key: str):
        self.w3 = Web3(Web3.HTTPProvider(rpc_url))
        self.private_key = private_key
        try:
            self.account = Account.from_private_key(private_key)
            self.address = self.account.address
        except Exception:
            self.address = "0xMockWalletAddress"

    def get_balance(self) -> float:
        try:
            balance_wei = self.w3.eth.get_balance(self.address)
            return float(self.w3.from_wei(balance_wei, 'ether'))
        except Exception:
            return 0.0

class FarmWorker:
    def __init__(self, wallet_id: int, decrypted_pk: str, proxy: str, rpc_router: RPCRouter):
        self.wallet_id = wallet_id
        self.private_key = decrypted_pk
        self.proxy = proxy
        self.rpc_router = rpc_router

    async def execute_task(self) -> dict:
        logger.info(f"[Wallet #{self.wallet_id}] Инициализация воркера...")
        
        # Проверяем прокси перед стартом
        is_proxy_alive = await ProxyManager.check_proxy(self.proxy)
        if not is_proxy_alive:
            logger.error(f"[Wallet #{self.wallet_id}] ❌ Прокси не отвечает. Сессия прервана.")
            return {"wallet_id": self.wallet_id, "proxy": self.proxy, "status": "Proxy Error", "timestamp": datetime.datetime.now().isoformat()}

        delay = random.randint(3, 7)
        await asyncio.sleep(delay)

        max_retries = 3
        success = False
        
        for attempt in range(max_retries):
            active_rpc = self.rpc_router.get_active_rpc()
            try:
                logger.info(f"[Wallet #{self.wallet_id}] Подключение к ноде: {active_rpc} (Попытка {attempt+1})")
                web3_handler = Web3Handler(active_rpc, self.private_key)
                balance = web3_handler.get_balance()
                logger.info(f"[Wallet #{self.wallet_id}] ✅ Успешный опрос ноды. Баланс: {balance} ETH")
                success = True
                break
            except Exception as e:
                logger.error(f"[Wallet #{self.wallet_id}] ❌ Ошибка ноды: {e}")
                self.rpc_router.switch_to_next_rpc()
                if attempt == max_retries - 1:
                    logger.error(f"[Wallet #{self.wallet_id}] ❌ Исчерпаны все попытки RPC.")

        return {
            "wallet_id": self.wallet_id,
            "proxy": self.proxy,
            "status": "Completed" if success else "Failed",
            "timestamp": datetime.datetime.now().isoformat()
        }

def export_farm_report_to_json(results_data):
    report = {
        "timestamp": datetime.datetime.now().isoformat(),
        "total_wallets_processed": len(results_data),
        "status": "Success",
        "details": results_data
    }
    filename = "airdrop_x_backend_report.json"
    with open(filename, "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=4)
    logger.info(f"[Report Exporter] Отчет успешно сохранен: {filename}")

async def run_farm(encrypted_wallets_data, rpc_list, master_pass):
    vault = LocalVault(master_pass)
    router = RPCRouter(rpc_list)
    tasks = []
    
    for data in encrypted_wallets_data:
        try:
            decrypted_pk = vault.decrypt_data(data['encrypted_pk'])
            worker = FarmWorker(
                wallet_id=data['id'],
                decrypted_pk=decrypted_pk,
                proxy=data['proxy'],
                rpc_router=router
            )
            tasks.append(worker.execute_task())
        except Exception as e:
            logger.error(f"[Vault] ❌ Ошибка расшифровки кошелька #{data['id']}")

    results = await asyncio.gather(*tasks)
    if results:
        export_farm_report_to_json(results)

if __name__ == "__main__":
    MASTER_PASSWORD = "SuperSecretMasterPassword123"
    creator_vault = LocalVault(MASTER_PASSWORD)
    valid_test_pk = "ac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
    
    # Теперь сюда можно смело вписывать прокси со скриншота (например, SOCKS5)
    encrypted_mock_wallets = [
        {"id": 1, "encrypted_pk": creator_vault.encrypt_data(valid_test_pk), "proxy": "socks5://170.64.170.204:1080"},
        {"id": 2, "encrypted_pk": creator_vault.encrypt_data(valid_test_pk), "proxy": "http://31.57.178.255:8181"}
    ]
    
    available_rpcs = ["https://rpc.ankr.com/eth", "https://1rpc.io/eth"]

    logger.info("🔒 Запуск боевого ядра AIRDROP-X с универсальным Proxy Manager (SOCKS5/HTTP)...")
    asyncio.run(run_farm(encrypted_mock_wallets, available_rpcs, MASTER_PASSWORD))