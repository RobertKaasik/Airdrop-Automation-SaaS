import json
import os
from sqlalchemy.orm import Session
from database import SessionLocal, User, Wallet

class AirdropScanner:
    def __init__(self):
        print("[AirdropScanner] 🔍 Модуль сканирования и чека наград инициализирован.")

    def fetch_user_wallets(self, username: str) -> list:
        """Загружает кошельки конкретного юзера из базы данных SQLite"""
        db: Session = SessionLocal()
        try:
            user = db.query(User).filter(User.username == username).first()
            if not user:
                print(f"[AirdropScanner] ⚠️ Пользователь {username} не найден в базе!")
                return []
            
            wallets_data = []
            for w in user.wallets:
                wallets_data.append({
                    "id": w.id,
                    "address": w.wallet_address,
                    "proxy": w.proxy,
                    "encrypted_pk": w.encrypted_pk
                })
            return wallets_data
        finally:
            db.close()

    def scan_allocations(self, username: str) -> dict:
        """
        Симулирует/реализует проверку распределений по всем кошелькам юзера.
        В боевой версии здесь идет опрос RPC-нод или API чекеров проектов.
        """
        wallets = self.fetch_user_wallets(username)
        if not wallets:
            return {"status": "error", "message": "Нет кошельков для сканирования."}

        report = {
            "username": username,
            "total_wallets_scanned": len(wallets),
            "found_drops": []
        }

        print(f"[AirdropScanner] Запуск сканирования для юзера '{username}' ({len(wallets)} кошельков)...")

        for w in wallets:
            # Имитируем проверку балансов и ретродропов в сетях Base / ZkSync / LayerZero
            # В будущем тут будет реальный Web3-запрос через указанный прокси `w['proxy']`
            mock_allocation = {
                "wallet_name": w["address"],
                "proxy_used": w["proxy"],
                "allocations": [
                    {"protocol": "ZkSync Era", "amount": "$24.50", "claimable": True},
                    {"protocol": "Gas Refund", "amount": "$1.80", "claimable": True}
                ]
            }
            report["found_drops"].append(mock_allocation)

        # Сохраняем отчет в JSON для фронтенда
        report_file = "airdrop_x_backend_report.json"
        with open(report_file, "w", encoding="utf-8") as f:
            json.dump(report, f, indent=4, ensure_ascii=False)

        print(f"[AirdropScanner] ✅ Сканирование завершено. Отчет сохранен в {report_file}")
        return report

if __name__ == "__main__":
    # Тестовый запуск модуля напрямую
    scanner = AirdropScanner()
    scanner.scan_allocations("Robert")