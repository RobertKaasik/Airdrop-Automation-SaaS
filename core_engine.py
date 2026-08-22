import time
import logging
import requests
from web3 import Web3

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
            nodes = router.rpc_mapping.get(network, [])
            # Перебираем все доступные ноды по очереди, чтобы исключить N/A из-за сбоя одной
            for rpc_url in nodes:
                try:
                    w3 = Web3(Web3.HTTPProvider(rpc_url, request_kwargs={"timeout": 3}))
                    if w3.is_connected():
                        gas_price_wei = w3.eth.gas_price
                        gas_gwei = w3.from_wei(gas_price_wei, 'gwei')
                        return f"{float(gas_gwei):.2f} Gwei"
                except Exception:
                    continue
            return "N/A"
    except Exception:
        return "N/A"

if __name__ == "__main__":
    print("Core Engine provides read-only network information.")
