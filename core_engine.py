import time
import asyncio
import random
import logging
import requests
from web3 import Web3
from eth_account import Account

logging.basicConfig(level=logging.INFO, format="%(asctime)s | %(levelname)s | [%(name)s] %(message)s")
logger = logging.getLogger("CoreEngine")

class MultiRouteRpcRouter:
    def __init__(self, network: str):
        self.network = network
        self.rpc_mapping = {
            "Ethereum": ["https://eth.llamarpc.com", "https://rpc.ankr.com/eth"],
            "Base": ["https://mainnet.base.org", "https://base.publicnode.com"],
            "Arbitrum": ["https://arb1.arbitrum.io/rpc", "https://rpc.ankr.com/arbitrum"],
            "ZkSync": ["https://mainnet.era.zksync.io", "https://zksync.drpc.org"],
            "Scroll": ["https://rpc.scroll.io", "https://scroll-mainnet.public.blastapi.io"],
            "Linea": ["https://rpc.linea.build", "https://linea.drpc.org"],
            "Blast": ["https://rpc.blast.io", "https://blast.din.dev"],
            "Mantle": ["https://rpc.mantle.xyz", "https://mantle-mainnet.public.blastapi.io"],
            "Berachain": ["https://rpc.berachain.com", "https://berachain-rpc.publicnode.com"],
            "Solana": ["https://api.mainnet-beta.solana.com", "https://solana-rpc.publicnode.com"],
            "BNB Chain": ["https://bsc-dataseed.binance.org", "https://rpc.ankr.com/bsc"],
            "Polygon": ["https://polygon-rpc.com", "https://rpc.ankr.com/polygon"],
            "Optimism": ["https://mainnet.optimism.io", "https://rpc.ankr.com/optimism"],
            "Tron": ["https://api.trongrid.io", "https://rpc.ankr.com/tron"]
        }
    
    def get_rpc(self):
        nodes = self.rpc_mapping.get(self.network, self.rpc_mapping["Base"])
        return nodes[0]

def get_live_gas_price(network: str) -> str:
    try:
        if network == "Solana":
            payload = {
                "jsonrpc": "2.0",
                "id": 1,
                "method": "getRecentPrioritizationFees",
                "params": [[]]
            }
            resp = requests.post("https://api.mainnet-beta.solana.com", json=payload, timeout=5)
            data = resp.json()
            fees = [item.get("prioritizationFee", 0) for item in data.get("result", [])]
            avg_fee = sum(fees) / len(fees) if fees else 0
            return f"{avg_fee:.2f} micro-lamports"
            
        elif network == "Tron":
            resp = requests.get("https://api.trongrid.io/wallet/getchainparameters", timeout=5)
            data = resp.json()
            params = data.get("chainParameter", [])
            fee_limit = 10 
            for p in params:
                if p.get("key") == "getTransactionFee":
                    fee_limit = p.get("value", 10)
                    break
            return f"{fee_limit} Sun"
            
        else:
            router = MultiRouteRpcRouter(network)
            w3 = Web3(Web3.HTTPProvider(router.get_rpc()))
            if not w3.is_connected():
                return "N/A"
            gas_price_wei = w3.eth.gas_price
            gas_gwei = w3.from_wei(gas_price_wei, 'gwei')
            return f"{float(gas_gwei):.2f} Gwei"
    except Exception:
        return "N/A"

class RealFarmWorker:
    def __init__(self, wallet_id: int, encrypted_pk: str, proxy: str, target_network: str = "Base"):
        self.wallet_id = wallet_id
        self.pk = encrypted_pk
        
        clean_proxy = proxy.strip() if proxy else ""
        if clean_proxy.startswith("[") and clean_proxy.endswith("]"):
            clean_proxy = clean_proxy[1:-1].strip()
            
        # ⬇️ УНИВЕРСАЛЬНЫЙ ПАРСЕР ДЛЯ IPv4 И IPv6
        if "://" not in clean_proxy:
            parts = clean_proxy.rsplit(':', 3)
            if len(parts) == 4:
                ip, port, user, pwd = parts
                # Если это IPv6 и он без квадратных скобок — оборачиваем для корректного URL
                if ":" in ip and not ip.startswith("["):
                    ip = f"[{ip}]"
                clean_proxy = f"http://{user}:{pwd}@{ip}:{port}"
        # ⬆️ КОНЕЦ БЛОКА
            
        self.proxy = clean_proxy
        self.target_network = target_network
        self.rpc_router = MultiRouteRpcRouter(self.target_network)

    async def execute_real_transaction(self):
        anti_sybil_delay = random.uniform(1.0, 7.0)
        logger.info(f"[Wallet #{self.wallet_id}] Anti-Sybil Shield: ожидание {anti_sybil_delay:.2f} сек перед вылетом...")
        await asyncio.sleep(anti_sybil_delay)

        logger.info(f"[Wallet #{self.wallet_id}] Залетаем в сеть {self.target_network} через прокси [{self.proxy}]...")
        
        rpc_url = self.rpc_router.get_rpc()
        proxies_dict = {"http": self.proxy, "https": self.proxy} if self.proxy else None
        session = Web3.HTTPProvider(rpc_url, request_kwargs={"proxies": proxies_dict})
        w3 = Web3(session)
        
        try:
            account = Account.from_key(self.pk)
            wallet_address = account.address
            
            balance_wei = w3.eth.get_balance(wallet_address)
            balance_eth = w3.from_wei(balance_wei, 'ether')
            
            native_symbol = "ETH"
            if self.target_network == "BNB Chain": native_symbol = "BNB"
            elif self.target_network == "Polygon": native_symbol = "POL"
            
            logger.info(f"[Wallet #{self.wallet_id}] Баланс в сети {self.target_network}: {balance_eth} {native_symbol}")
            
            if balance_eth == 0:
                err_msg = f"По нулям в сети {self.target_network}! Закинь копейку на газ."
                logger.warning(f"[Wallet #{self.wallet_id}] ⚠️ {err_msg}")
                return {"wallet_id": self.wallet_id, "status": "Failed", "reason": err_msg}

            weth_addresses = {
                "Base": "0x4200000000000000000000000000000000000006",
                "Arbitrum": "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1",
                "ZkSync": "0x5aea5775956fbc2d5ffbefcd1489bb0987fa490f",
                "Optimism": "0x4200000000000000000000000000000000000006"
            }
            
            weth_address = Web3.to_checksum_address(weth_addresses.get(self.target_network, weth_addresses["Base"]))
            weth_abi = '[{"constant":false,"inputs":[],"name":"deposit","outputs":[],"payable":true,"stateMutability":"payable","type":"function"}]'
            
            contract = w3.eth.contract(address=weth_address, abi=weth_abi)
            nonce = w3.eth.get_transaction_count(wallet_address)
            
            random_amount_factor = random.uniform(0.000008, 0.000015)
            amount_to_wrap = w3.to_wei(random_amount_factor, 'ether') 

            logger.info(f"[Wallet #{self.wallet_id}] Билдим Anti-Sybil Swap / Wrap транзу (сумма: {random_amount_factor:.6f} {native_symbol})...")
            
            latest_block = w3.eth.get_block('latest')
            base_fee = latest_block.get('baseFeePerGas', w3.eth.gas_price)
            max_priority_fee = w3.to_wei(random.uniform(1.2, 1.8), 'gwei')
            max_fee = (base_fee * 2) + max_priority_fee

            tx = contract.functions.deposit().build_transaction({
                'chainId': w3.eth.chain_id,
                'gas': random.randint(145000, 160000),
                'maxFeePerGas': max_fee,
                'maxPriorityFeePerGas': max_priority_fee,
                'nonce': nonce,
                'value': amount_to_wrap
            })

            signed_txn = w3.eth.account.sign_transaction(tx, private_key=self.pk)
            tx_hash = w3.eth.send_raw_transaction(signed_txn.raw_transaction)
            logger.info(f"[Wallet #{self.wallet_id}] 🚀 Транза улетела в {self.target_network}! Хэш: {w3.to_hex(tx_hash)}")
            
            receipt = w3.eth.wait_for_transaction_receipt(tx_hash)
            logger.info(f"[Wallet #{self.wallet_id}] ✅ Блок подтвержден в сети {self.target_network}! Объем набит успешно.")
            
            return {"wallet_id": self.wallet_id, "status": "Success", "tx_hash": w3.to_hex(tx_hash)}

        except Exception as e:
            err_str = str(e)
            if "insufficient funds" in err_str:
                clean_err = "❌ Ошибка: Недостаточно средств на балансе для оплаты газа!"
            else:
                clean_err = f"❌ Ошибка блокчейна: {err_str}"
            
            logger.error(f"[Wallet #{self.wallet_id}] {clean_err}")
            return {"wallet_id": self.wallet_id, "status": "Failed", "error": clean_err}

async def run_real_farm(wallets_data, rpc_list, master_password: str, target_network: str = "Base"):
    logger.info(f"🚀 Старт антифрод-ядра фермы (Swaps & Bridges). Сеть: {target_network}")
    
    shuffled_wallets = list(wallets_data)
    random.shuffle(shuffled_wallets)

    tasks = []
    for w in shuffled_wallets:
        worker = RealFarmWorker(
            wallet_id=w["id"],
            encrypted_pk=w["encrypted_pk"],
            proxy=w["proxy"],
            target_network=target_network
        )
        tasks.append(worker.execute_real_transaction())
    
    results = await asyncio.gather(*tasks)
    logger.info("🏁 Все воркеры завершили рандомизированную Anti-Sybil сессию.")
    return results

if __name__ == "__main__":
    print("Core Engine запущен в автономном режиме.")