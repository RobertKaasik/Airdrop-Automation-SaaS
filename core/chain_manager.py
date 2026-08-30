from web3 import AsyncWeb3
from .database import SessionLocal
from .models import UserProfile

class ChainManager:
    def __init__(self, rpc_url: str):
        self.w3 = AsyncWeb3(AsyncWeb3.AsyncHTTPProvider(rpc_url))

    async def prepare_transfer_payload(self, profile_id: int, user_id: int, amount_eth: float):
        """
        Только готовит данные. Подпись происходит на фронтенде пользователя.
        """
        with SessionLocal() as db:
            profile = db.query(UserProfile).filter(
                UserProfile.id == profile_id, 
                UserProfile.user_id == user_id
            ).first()
            
            if not profile or not profile.okx_subaccount_address:
                raise RuntimeError("Целевой субсчет не привязан к профилю.")

            target = profile.okx_subaccount_address

        # Собираем параметры транзакции для передачи на фронт (MetaMask)
        return {
            "to": AsyncWeb3.to_checksum_address(target),
            "value": hex(AsyncWeb3.to_wei(amount_eth, 'ether')),
            "chainId": await self.w3.eth.chain_id,
            "data": "0x" 
        }

    async def get_balance(self, address: str):
        b = await self.w3.eth.get_balance(AsyncWeb3.to_checksum_address(address))
        return AsyncWeb3.from_wei(b, 'ether')
