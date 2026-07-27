import asyncio
import random
import logging
import base64
import json
import datetime
from cryptography.fernet import Fernet
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC

# Настройка профессиональных логов
logging.basicConfig(level=logging.INFO, format='%(asctime)s | %(levelname)s | %(message)s')
logger = logging.getLogger("AIRDROP-X-CORE")

class LocalVault:
    def __init__(self, master_password: str):
        self.master_password = master_password.encode()
        self.key = self._derive_key(b"static_salt_airdrop_x")

    def _derive_key(self, salt: bytes) -> bytes:
        """Генерация криптографического ключа на основе мастер-пароля"""
        kdf = PBKDF2HMAC(
            algorithm=hashes.SHA256(),
            length=32,
            salt=salt,
            iterations=100000,
        )
        return base64.urlsafe_b64encode(kdf.derive(self.master_password))

    def encrypt_data(self, plaintext: str) -> str:
        """Шифрование приватного ключа"""
        f = Fernet(self.key)
        return f.encrypt(plaintext.encode()).decode()

    def decrypt_data(self, ciphertext: str) -> str:
        """Расшифровка данных перед запуском воркера"""
        f = Fernet(self.key)
        return f.decrypt(ciphertext.encode()).decode()

class RPCRouter:
    def __init__(self, rpc_list: list):
        self.rpc_list = rpc_list
        self.current_index = 0

    def get_active_rpc(self) -> str:
        return self.rpc_list[self.current_index]

    def switch_to_next_rpc(self):
        """Интеллектуальное переключение на резервную ноду при сбое"""
        old_rpc = self.rpc_list[self.current_index]
        self.current_index = (self.current_index + 1) % len(self.rpc_list)
        new_rpc = self.rpc_list[self.current_index]
        logger.warning(f"[RPC Router] Сбой на узле {old_rpc}. Переключение на резервный: {new_rpc}")

class FarmWorker:
    def __init__(self, wallet_id: int, decrypted_pk: str, proxy: str, rpc_router: RPCRouter):
        self.wallet_id = wallet_id
        self.private_key = decrypted_pk
        self.proxy = proxy
        self.rpc_router = rpc_router

    async def execute_task(self) -> dict:
        """Изолированная сессия для конкретного кошелька с RPC Fallback"""
        logger.info(f"[Wallet #{self.wallet_id}] Запуск сессии через прокси: {self.proxy}")
        
        # Рандомизированная задержка для защиты от Anti-Sybil
        delay = random.randint(3, 7)
        await asyncio.sleep(delay)

        max_retries = 3
        success = False
        
        for attempt in range(max_retries):
            active_rpc = self.rpc_router.get_active_rpc()
            try:
                logger.info(f"[Wallet #{self.wallet_id}] Запрос к блокчейну через RPC: {active_rpc} (Попытка {attempt+1})")
                
                # Искусственная симуляция сбоя сети для первого кошелька на первой попытке
                if attempt == 0 and self.wallet_id == 1:
                    raise Exception("Rate limit / Timeout error")

                await asyncio.sleep(1) # Имитация сетевого ответа от ноды
                logger.info(f"[Wallet #{self.wallet_id}] ✅ Успешный ответ от ноды {active_rpc}")
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
    """Экспорт итогового отчета работы фермы в JSON-файл"""
    report = {
        "timestamp": datetime.datetime.now().isoformat(),
        "total_wallets_processed": len(results_data),
        "status": "Success",
        "details": results_data
    }
    filename = "airdrop_x_backend_report.json"
    with open(filename, "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=4)
    logger.info(f"[Report Exporter] Отчет успешно сохранен локально в файл: {filename}")

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
            logger.error(f"[Vault] ❌ Ошибка расшифровки кошелька #{data['id']}: неверный мастер-пароль?")

    # Ожидаем выполнение всех потоков воркеров
    results = await asyncio.gather(*tasks)
    
    # Выгружаем отчет в JSON, если есть успешные результаты
    if results:
        export_farm_report_to_json(results)

if __name__ == "__main__":
    MASTER_PASSWORD = "SuperSecretMasterPassword123"
    
    # Инициализируем хранилище для симуляции зашифрованной базы данных кошельков
    creator_vault = LocalVault(MASTER_PASSWORD)
    encrypted_mock_wallets = [
        {"id": 1, "encrypted_pk": creator_vault.encrypt_data("0xSecretPrivateKeyWalletOne111"), "proxy": "185.22.10.1:8080"},
        {"id": 2, "encrypted_pk": creator_vault.encrypt_data("0xSecretPrivateKeyWalletTwo222"), "proxy": "45.12.15.8:1080"}
    ]
    
    available_rpcs = [
        "https://mainnet.infura.io/v3/YOUR_KEY",
        "https://rpc.ankr.com/eth",
        "https://1rpc.io/eth"
    ]

    logger.info("🔒 Запуск защищенного ядра AIRDROP-X с полным набором модулей...")
    asyncio.run(run_farm(encrypted_mock_wallets, available_rpcs, MASTER_PASSWORD))