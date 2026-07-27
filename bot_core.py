import time
import random
from web3 import Web3

# Подключение к ноде Sepolia
RPC_URL = "https://ethereum-sepolia-rpc.publicnode.com"
web3 = Web3(Web3.HTTPProvider(RPC_URL))

if web3.is_connected():
    print("[+] Успешное подключение к сети Sepolia!")
    print(f"[*] Текущий блок: {web3.eth.block_number}")
else:
    print("[-] Ошибка подключения к ноде.")
    exit()

def perform_anti_sybil_delay():
    # Случайная пауза от 5 до 15 секунд между аккаунтами
    delay = random.randint(5, 15)
    print(f"[*] Anti-Sybil пауза: ждем {delay} секунд...")
    time.sleep(delay)

def process_single_wallet(wallet_address, private_key):
    print(f"\n[>] Обработка кошелька: {wallet_address[:6]}...{wallet_address[-4:]}")
    
    balance_wei = web3.eth.get_balance(wallet_address)
    balance_eth = web3.from_wei(balance_wei, 'ether')
    print(f"[*] Баланс: {balance_eth} SepETH")
    
    if balance_eth < 0.0002:
        print("[-] Пропуск: недостаточно средств на балансе для газа и перевода.")
        return False

    try:
        nonce = web3.eth.get_transaction_count(wallet_address)
        
        tx = {
            'nonce': nonce,
            'to': wallet_address,
            'value': web3.to_wei(0.0001, 'ether'),
            'gas': 21000,
            'maxFeePerGas': web3.eth.gas_price + web3.to_wei(1, 'gwei'),
            'maxPriorityFeePerGas': web3.to_wei(1, 'gwei'),
            'chainId': 11155111
        }
        
        signed_tx = web3.eth.account.sign_transaction(tx, private_key)
        tx_hash = web3.eth.send_raw_transaction(signed_tx.raw_transaction)
        
        print(f"[+] Транзакция отправлена! Хэш: {web3.to_hex(tx_hash)}")
        
        receipt = web3.eth.wait_for_transaction_receipt(tx_hash)
        print(f"[🚀] Успех! Блок: {receipt.blockNumber}")
        return True
        
    except Exception as e:
        print(f"[-] Ошибка при отправке транзакции: {str(e)}")
        return False

def run_farming_session(wallets_data):
    print(f"\n=== Запуск сессии фарминга для {len(wallets_data)} кошельков ===")
    
    # Рандомизируем порядок кошельков для защиты от антифрода
    random.shuffle(wallets_data)
    
    for index, (wallet, key) in enumerate(wallets_data, 1):
        print(f"\n--- Кошелек {index} из {len(wallets_data)} ---")
        process_single_wallet(wallet, key)
        
        if index < len(wallets_data):
            perform_anti_sybil_delay()
            
    print("\n=== Сессия фарминга успешно завершена! ===")

def load_wallets_from_file(filename="wallets.txt"):
    wallets_data = []
    try:
        with open(filename, "r", encoding="utf-8") as file:
            for line in file:
                line = line.strip()
                if not line or line.startswith("#"):
                    continue
                parts = line.split(":")
                if len(parts) == 2:
                    wallet, key = parts[0].strip(), parts[1].strip()
                    wallets_data.append((wallet, key))
        print(f"[+] Успешно загружено кошельков из файла: {len(wallets_data)}")
    except FileNotFoundError:
        print(f"[-] Ошибка: файл {filename} не найден!")
    return wallets_data

if __name__ == "__main__":
    test_wallets = load_wallets_from_file("wallets.txt")
    if test_wallets:
        run_farming_session(test_wallets)
    else:
        print("[-] Нет кошельков для запуска фарминга.")


# Эта функция должна быть снаружи блока if __name__ == "__main__": (без отступа слева)
def run_single_wallet_from_server(wallet_address):
    wallets_data = load_wallets_from_file("wallets.txt")
    # Ищем приватный ключ по переданному адресу кошелька
    target_wallet = None
    for wallet, key in wallets_data:
        if wallet.lower() == wallet_address.lower():
            target_wallet = (wallet, key)
            break

    if target_wallet:
        print(f"[+] Найден ключ для кошелька {wallet_address}, запускаем транзакцию...")
        success = process_single_wallet(target_wallet[0], target_wallet[1])
        return success
    else:
        print(f"[-] Не найден приватный ключ для кошелька {wallet_address} в wallets.txt")
        return False