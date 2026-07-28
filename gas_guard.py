import time

class GasGuard:
    def __init__(self, max_acceptable_gwei: float = 25.0):
        # Максимальный порог газа в Gwei, выше которого софт не запускает транзакции
        self.max_gwei = max_acceptable_gwei
        print(f"[GasGuard] 🛡️ Модуль контроля газа активирован. Лимит: {self.max_gwei} Gwei")

    def check_current_gas_price(self, network: str) -> float:
        """
        Имитирует или запрашивает через RPC текущую цену газа в сети.
        В боевом режиме здесь будет реальный Web3-запрос к ноде.
        """
        # Симулируем текущую цену газа для примера (например, 14.5 Gwei - сеть свободна)
        current_gwei = 14.5 
        return current_gwei

    def wait_for_optimal_gas(self, network: str):
        """Проверяет газ и ждет, если сеть перегружена"""
        while True:
            gwei = self.check_current_gas_price(network)
            if gwei <= self.max_gwei:
                print(f"[GasGuard] [OK] Газ в сети {network} в норме ({gwei} Gwei). Безопасно отправлять транзакцию.")
                break
            else:
                print(f"[GasGuard] ⚠️ Внимание! Газ высок ({gwei} Gwei > лимит {self.max_gwei}). Ожидание 30 секунд...")
                time.sleep(30)

if __name__ == "__main__":
    guard = GasGuard(max_acceptable_gwei=20.0)
    guard.wait_for_optimal_gas("Base L2")