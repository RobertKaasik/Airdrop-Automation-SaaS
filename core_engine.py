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
        # ВРЕМЕННАЯ ЗАГЛУШКА ДЛЯ ТЕСТОВ
        # В рабочей версии тут будет реальный пинг, а сейчас всегда возвращаем True
        logger.info(f"[Proxy Manager] 🌐 Прокси {proxy_url} симулирует успешное подключение (Test Mode)")
        await asyncio.sleep(0.5) # Имитируем небольшую задержку проверки
        return True

class RealDeFiActions:
    @staticmethod
    def execute_real_swap(w3: Web3, account, router_contract_address: str, abi: list, token_in: str, token_out: str, amount_wei: int) -> str:
        router_contract = w3.eth.contract(address=Web3.to_checksum_address(router_contract_address), abi=abi)
        nonce = w3.eth.get_transaction_count(account.address)
        
        tx = router_contract.functions.swapExactTokensForTokens(
            amount_wei,
            0,
            [Web3.to_checksum_address(token_in), Web3.to_checksum_address(token_out)],
            account.address,
            int(w3.eth.get_block('latest')['timestamp']) + 120
        ).build_transaction({
            'from': account.address,
            'nonce': nonce,
            'gas': 250000,
            'maxFeePerGas': w3.to_wei(30, 'gwei'),
            'maxPriorityFeePerGas': w3.to_wei(1.5, 'gwei'),
            'chainId': w3.eth.chain_id
        })

        signed_tx = w3.eth.account.sign_transaction(tx, account.key)
        tx_hash = w3.eth.send_raw_transaction(signed_tx.rawTransaction)
        return w3.to_hex(tx_hash)

    @staticmethod
    def execute_real_claim(w3: Web3, account, claim_contract_address: str, abi: list) -> str:
        claim_contract = w3.eth.contract(address=Web3.to_checksum_address(claim_contract_address), abi=abi)
        nonce = w3.eth.get_transaction_count(account.address)
        
        tx = claim_contract.functions.claim().build_transaction({
            'from': account.address,
            'nonce': nonce,
            'gas': 150000,
            'maxFeePerGas': w3.to_wei(30, 'gwei'),
            'maxPriorityFeePerGas': w3.to_wei(1.5, 'gwei'),
            'chainId': w3.eth.chain_id
        })

        signed_tx = w3.eth.account.sign_transaction(tx, account.key)
        tx_hash = w3.eth.send_raw_transaction(signed_tx.rawTransaction)
        return w3.to_hex(tx_hash)

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
            decrypted_pk = vault.decrypt_data(data['encrypted_pk'])
            worker = FarmWorker(
                wallet_id=data['id'],
                decrypted_pk=decrypted_pk,
                proxy=data['proxy'],
                rpc_router=router
            )
            tasks.append(worker.execute_task())
        except Exception as e:
            logger.error(f"[Worker Error] ❌ Кошелек #{data['id']} не расшифровался: {repr(e)}")

    results = await asyncio.gather(*tasks)
    if results:
        export_farm_report_to_json(results)

if __name__ == "__main__":
    MASTER_PASSWORD = "SuperSecretMasterPassword123"
    creator_vault = LocalVault(MASTER_PASSWORD)
    
    valid_test_pk = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
    encrypted_pk = creator_vault.encrypt_data(valid_test_pk)

    # 🟢 Рабочие тестовые слоты без искусственных ошибок прокси
    encrypted_mock_wallets = [
        {"id": 1, "encrypted_pk": encrypted_pk, "proxy": "http://31.57.178.255:8181"},
        {"id": 2, "encrypted_pk": encrypted_pk, "proxy": "http://31.57.178.255:8181"}
    ]
    
    # 🟢 Используем стабильную ноду
    available_rpcs = [
        "https://1rpc.io/eth"
    ]

    logger.info("🚀 Запуск штатного режима AIRDROP-X. Всё под контролем, фармим профит...")
    asyncio.run(run_farm(encrypted_mock_wallets, available_rpcs, MASTER_PASSWORD))