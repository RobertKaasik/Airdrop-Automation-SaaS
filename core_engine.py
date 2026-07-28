import asyncio
import os 
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

from strategies import FarmingStrategies

# Настройка логов
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
        logger.warning(f"[RPC Router] Сбой на узле {old_rpc}. Перекидываем трафик на резервный: {new_rpc}")

class ProxyManager:
    @staticmethod
    async def check_proxy(proxy_url: str) -> bool:
        logger.info(f"[Proxy Manager] 🌐 Прокси {proxy_url} симулирует успешное подключение (Test Mode)")
        await asyncio.sleep(0.5)
        return True

class FarmWorker:
    def __init__(self, wallet_id: int, decrypted_pk: str, proxy: str, rpc_router: RPCRouter):
        self.wallet_id = wallet_id
        self.private_key = decrypted_pk
        self.proxy = proxy
        self.rpc_router = rpc_router
        self.account = Account.from_key(decrypted_pk)

    async def execute_task(self) -> dict:
        logger.info(f"[Wallet #{self.wallet_id}] Заряжаем воркера...")
        
        is_proxy_alive = await ProxyManager.check_proxy(self.proxy)
        if not is_proxy_alive:
            logger.error(f"[Wallet #{self.wallet_id}] ❌ Прокси дохлый. Скипаем этот акк.")
            return {"wallet_id": self.wallet_id, "proxy": self.proxy, "status": "Proxy Error", "timestamp": datetime.datetime.now().isoformat()}

        route = FarmingStrategies.generate_random_route(self.wallet_id)

        max_retries = 3
        success = True
        
        for action in route:
            step_success = False
            for attempt in range(max_retries):
                active_rpc = self.rpc_router.get_active_rpc()
                try:
                    logger.info(f"[Wallet #{self.wallet_id}] Ломимся в ноду: {active_rpc} | Шаг '{action}' (Трай {attempt+1})")
                    
                    w3 = Web3(Web3.HTTPProvider(active_rpc))
                    balance_wei = w3.eth.get_balance(self.account.address)
                    balance_eth = float(w3.from_wei(balance_wei, 'ether'))
                    logger.info(f"[Wallet #{self.wallet_id}] Бабки на базе: {balance_eth} ETH")
                    
                    await FarmingStrategies.execute_action(action, self.wallet_id)
                    
                    step_success = True
                    break
                except Exception as e:
                    logger.error(f"[Wallet #{self.wallet_id}] ❌ Нода выдала ошибку: {e}")
                    self.rpc_router.switch_to_next_rpc()
            
            if not step_success:
                logger.error(f"[Wallet #{self.wallet_id}] ❌ Шаг {action} заруинился. Тормозим кошелек.")
                success = False
                break

        return {
            "wallet_id": self.wallet_id,
            "proxy": self.proxy,
            "status": "Completed" if success else "Failed",
            "route_executed": route,
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
    logger.info(f"[Report Exporter] Отчет закинут в архив: {filename}")

async def run_farm(encrypted_wallets_data, rpc_list, master_pass):
    vault = LocalVault(master_pass)
    router = RPCRouter(rpc_list)
    tasks = []
    
    for data in encrypted_wallets_data:
        try:
            # Пытаемся расшифровать, а если не получается (например, ключ тестовый или строка чистая), берем как есть
            try:
                decrypted_pk = vault.decrypt_data(data['encrypted_pk'])
            except Exception:
                decrypted_pk = data['encrypted_pk'] # Запасной вариант на случай нешифрованного ключа
                
            worker = FarmWorker(
                wallet_id=data['id'],
                decrypted_pk=decrypted_pk,
                proxy=data['proxy'],
                rpc_router=router
            )
            tasks.append(worker.execute_task())
        except Exception as e:
            logger.error(f"[Worker Error] ❌ Кошелек #{data['id']} не запустился: {repr(e)}")

    results = await asyncio.gather(*tasks)
    if results:
        export_farm_report_to_json(results)

if __name__ == "__main__":
    MASTER_PASSWORD = "SuperSecretMasterPassword123"
    
    # Пытаемся прочитать конфиг, который сформировал server.py из базы данных
    config_file = "active_farm_config.json"
    encrypted_mock_wallets = []
    
    try:
        if os.path.exists(config_file):
            with open(config_file, "r", encoding="utf-8") as f:
                encrypted_mock_wallets = json.load(f)
            logger.info(f"[Core Engine] Загружено кошельков из базы через конфиг: {len(encrypted_mock_wallets)}")
        else:
            # Запасной вариант для автономного запуска
            creator_vault = LocalVault(MASTER_PASSWORD)
            valid_test_pk = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
            encrypted_pk = creator_vault.encrypt_data(valid_test_pk)
            encrypted_mock_wallets = [
                {"id": 1, "encrypted_pk": encrypted_pk, "proxy": "http://31.57.178.255:8181"}
            ]
            logger.warning("[Core Engine] Конфиг не найден, запущен тестовый дефолтный кошелек.")
    except Exception as e:
        logger.error(f"[Core Engine Error] Ошибка чтения конфига: {e}")

    available_rpcs = [
        "https://1rpc.io/eth"
    ]

    logger.info("🚀 Запуск боевого ядра AIRDROP-X через FastAPI-мост...")
    if encrypted_mock_wallets:
        asyncio.run(run_farm(encrypted_mock_wallets, available_rpcs, MASTER_PASSWORD))
    else:
        logger.error("❌ Нет данных для запуска воркеров!")