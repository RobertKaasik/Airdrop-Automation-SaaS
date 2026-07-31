import requests

BASE_URL = "http://127.0.0.1:8000"

def test_integration():
    print("--- Запуск интеграционного тестирования бэкенда AIRDROP-X ---")
    
    session_id = "test_sess_session_abc123"
    plan = "Pro"
    amount = 150
    txid = "0x987654321fedcba0987654321"

    # 1. Тест создания сессии оплаты
    print("\n[1/3] Тестирование создания сессии (/api/payment/create-session)...")
    res = requests.post(f"{BASE_URL}/api/payment/create-session", json={
        "plan": plan,
        "amount": amount,
        "client_session_id": session_id
    })
    print(f"Статус ответа: {res.status_code}")
    data = res.json()
    print(f"Данные ответа: {data}")
    assert res.status_code == 200, "Ошибка создания сессии"
    payment_session_id = data["payment_session_id"]
    print(f"Получен payment_session_id: {payment_session_id}")

    # 2. Тест подтверждения оплаты по TXID
    print("\n[2/3] Тестирование подтверждения оплаты (/api/payment/confirm)...")
    res = requests.post(f"{BASE_URL}/api/payment/confirm", json={
        "payment_session_id": payment_session_id,
        "client_session_id": session_id,
        "txid": txid
    })
    print(f"Статус ответа: {res.status_code}")
    data = res.json()
    print(f"Данные ответа: {data}")
    assert res.status_code == 200, "Ошибка подтверждения оплаты"
    token = data["payment_token"]
    print(f"Получен payment_token: {token[:10]}...")

    # 3. Тест восстановления доступа по TXID из другого сеанса
    print("\n[3/3] Тестирование восстановления доступа (/api/payment/recover)...")
    res = requests.post(f"{BASE_URL}/api/payment/recover", json={
        "txid": txid,
        "client_session_id": "new_browser_session_xyz999"
    })
    print(f"Статус ответа: {res.status_code}")
    data = res.json()
    print(f"Данные ответа: {data}")
    assert res.status_code == 200, "Ошибка восстановления сессии по TXID"
    print(f"Новый токен восстановления: {data['payment_token'][:10]}...")

    print("\n✅ Все интеграционные тесты бэкенда успешно пройдены!")

if __name__ == "__main__":
    try:
        test_integration()
    except AssertionError as ae:
        print(f"\n❌ Тест провален: {ae}")
    except requests.exceptions.ConnectionError:
        print("\n❌ Ошибка соединения: Убедись, что сервер (server.py) запущен на http://127.0.0.1:8000")