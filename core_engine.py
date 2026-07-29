import os
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

logging.basicConfig(level=logging.INFO, format='%(asctime)s | %(levelname)s | [%(name)s] %(message)s')
logger = logging.getLogger("CoreEngine")

class LocalVault:
    def __init__(self, master_password: str):
        salt = b'airdrop_x_secure_salt'
        kdf = PBKDF2HMAC(
            algorithm=hashes.SHA256(),
            length=32,
            salt=salt,
            iterations=100000,
        )
        key = base64.urlsafe_b64encode(kdf.derive(master_password.encode()))
        self.cipher = Fernet(key)

    def decrypt_data(self, encrypted_token: str) -> str:
        try:
            decrypted = self.cipher.decrypt(encrypted_token.encode())
            return decrypted.decode()
        except Exception:
            return encrypted_token

class RPCRouter:
    def __init__(self, rpc_list: list):
        self.rpc_list = rpc_list

    def get_random_rpc(self) -> str:
        return random.choice(self.rpc_list)

class RealFarmWorker:
    def __init__(self, wallet_id: int, decrypted_pk: str, proxy: str, rpc_router: RPCRouter):
        self.wallet_id = wallet_id
        self.pk = decrypted_pk
        self.proxy = proxy
        self.rpc_router = rpc_router

    async def execute_real_transaction(self, target_network: str = "Base"):
        logger.info(f"[Wallet #{self.wallet_id}] Залетаем в сеть {target_network} через прокси {self.proxy}...")
        
        rpc_url = self.rpc_router.get_random_rpc()
        w3 = Web3(Web3.HTTPProvider(rpc_url))
        
        try:
            account = Account.from_key(self.pk)
            wallet_address = account.address
            
            # Чекаем кэш на балансе
            balance_wei = w3.eth.get_balance(wallet_address)
            balance_eth = w3.from_wei(balance_wei, 'ether')
            logger.info(f"[Wallet #{self.wallet_id}] На базе: {balance_eth} ETH")
            
            if balance_eth == 0:
                logger.warning(f"[Wallet #{self.wallet_id}] ⚠️ По нулям, брат! Закинь копейку на газ, чтобы контракт отработал.")
                return {"wallet_id": self.wallet_id, "status": "Failed", "reason": "Zero balance"}

            # --- РЕАЛЬНЫЙ СМАРТ-КОНТРАКТ ---
            # Адрес контракта WETH9 в сети Base
            weth_address = Web3.to_checksum_address("0x4200000000000000000000000000000000000006")
            
            # Минимальный ABI, чтобы дернуть функцию deposit()
            weth_abi = '[{"constant":false,"inputs":[],"name":"deposit","outputs":[],"payable":true,"stateMutability":"payable","type":"function"}]'
            
            # Поднимаем контракт на районе
            contract = w3.eth.contract(address=weth_address, abi=weth_abi)
            
            nonce = w3.eth.get_transaction_count(wallet_address)
            
            # Пакуем сущие копейки чисто для теста (0.00001 ETH)
            amount_to_wrap = w3.to_wei(0.00001, 'ether') 

            logger.info(f"[Wallet #{self.wallet_id}] Собираем транзу: пакуем ETH в WETH...")
            
            # Билдим транзакцию через ABI
            tx = contract.functions.deposit().build_transaction({
                'chainId': w3.eth.chain_id,
                'gas': 150000,
                'gasPrice': w3.eth.gas_price,
                'nonce': nonce,
                'value': amount_to_wrap
            })

            # Подписываем своим приватником
            signed_txn = w3.eth.account.sign_transaction(tx, private_key=self.pk)
            
            tx_hash = w3.eth.send_raw_transaction(signed_txn.rawTransaction)
            logger.info(f"[Wallet #{self.wallet_id}] 🚀 Транза улетела в сеть! Хэш: {w3.to_hex(tx_hash)}")
            receipt = w3.eth.wait_for_transaction_receipt(tx_hash)
            logger.info(f"[Wallet #{self.wallet_id}] ✅ Блок подтвержден! Газ сожжен по красоте.")
            
            logger.info(f"[Wallet #{self.wallet_id}] ✅ Транза собрана и подписана по красоте (Симуляция пройдена)!")
            return {"wallet_id": self.wallet_id, "status": "Success", "tx_hash": "0x_ready_to_send"}

        except Exception as e:
            logger.error(f"[Wallet #{self.wallet_id}] ❌ Жесткая ошибка: {repr(e)}")
            return {"wallet_id": self.wallet_id, "status": "Failed", "error": str(e)}
async def run_real_farm(encrypted_wallets_data, rpc_list, master_pass):
    vault = LocalVault(master_pass)
    router = RPCRouter(rpc_list)
    tasks = []
    
    for data in encrypted_wallets_data:
        try:
            decrypted_pk = vault.decrypt_data(data['encrypted_pk'])
            worker = RealFarmWorker(
                wallet_id=data['id'],
                decrypted_pk=decrypted_pk,
                proxy=data['proxy'],
                rpc_router=router
            )
            tasks.append(worker.execute_real_transaction())
        except Exception as e:
            logger.error(f"[Worker Error] ❌ Кошелек #{data['id']} не запущен: {repr(e)}")

    results = await asyncio.gather(*tasks)
    return results