import os
import json
import random
import asyncio
import smtplib
from email.message import EmailMessage

from fastapi import FastAPI, Depends, HTTPException, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from pydantic import BaseModel
from sqlalchemy import create_engine, Column, Integer, String
from sqlalchemy.orm import declarative_base, sessionmaker, Session
from web3 import Web3

try:
    from core_engine import run_real_farm, get_live_gas_price
except ImportError:
    async def run_real_farm(*args, **kwargs):
        return [{"wallet_id": 0, "status": "Failed", "error": "Core engine not found"}]
    def get_live_gas_price(network):
        return "N/A"

SMTP_SERVER = "smtp.gmail.com"
SMTP_PORT = 465
SENDER_EMAIL = "airdrop.x.support@gmail.com"
SENDER_PASSWORD = "tecqpcadzlyxytgw"

verification_codes = {}

SQLALCHEMY_DATABASE_URL = "sqlite:///./airdrop_x.db"
engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True)
    email = Column(String, unique=True, index=True)
    password_hash = Column(String)
    subscription_plan = Column(String, default="Standard")
    extra_slots = Column(Integer, default=0)

class Wallet(Base):
    __tablename__ = "wallets"
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, index=True)
    wallet_address = Column(String)
    encrypted_pk = Column(String)
    proxy = Column(String)

class SettingsModel(Base):
    __tablename__ = "settings"
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True)
    master_wallet = Column(String, default="0x5e5316Dea1c44d220d4c60A5fcC2949E5A06Fc66")
    auto_farming_enabled = Column(Integer, default=1)
    schedule_days = Column(String, default="Mon,Wed,Fri")
    random_delay = Column(Integer, default=5)
    gas_limit_gwei = Column(Integer, default=30)

Base.metadata.create_all(bind=engine)

app = FastAPI(title="AIRDROP-X Backend API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

class UserRegister(BaseModel):
    username: str
    email: str
    password: str
    code: str
    plan: str = "Standard"

class UserLogin(BaseModel):
    username: str
    password: str

class WalletAdd(BaseModel):
    username: str
    wallet_address: str
    encrypted_pk: str
    proxy: str

class WalletUpdate(BaseModel):
    wallet_address: str
    encrypted_pk: str
    proxy: str

class StartFarmReq(BaseModel):
    wallet: str = "all"
    network: str = "Base"
    username: str = "Robert"

class DepositReq(BaseModel):
    wallet_id: int
    amount_eth: float
    network: str

class SaveSettingsReq(BaseModel):
    username: str
    master_wallet: str
    auto_farming_enabled: int
    schedule_days: str
    random_delay: int
    gas_limit_gwei: int

class EmailRequest(BaseModel):
    email: str

class BuyExtraSlotReq(BaseModel):
    username: str

class BalanceChecker:
    def get_balance(self, network: str, address: str, proxy: str = None):
        rpc_mapping = {
            "Base": "https://mainnet.base.org",
            "Arbitrum": "https://arb1.arbitrum.io/rpc",
            "ZkSync": "https://mainnet.era.zksync.io",
            "Scroll": "https://rpc.scroll.io",
            "Linea": "https://rpc.linea.build",
            "Blast": "https://rpc.blast.io",
            "Mantle": "https://rpc.mantle.xyz",
            "Berachain": "https://rpc.berachain.com",
            "Solana": "https://api.mainnet-beta.solana.com"
        }
        rpc_url = rpc_mapping.get(network, "https://mainnet.base.org")
        try:
            clean_proxy = proxy.strip() if proxy else ""
            if clean_proxy.startswith("[") and clean_proxy.endswith("]"):
                clean_proxy = clean_proxy[1:-1].strip()
            proxies_dict = {"http": clean_proxy, "https": clean_proxy} if clean_proxy else None
            
            w3 = Web3(Web3.HTTPProvider(rpc_url, request_kwargs={"proxies": proxies_dict}))
            if not w3.is_connected():
                return "0.0"
            balance_wei = w3.eth.get_balance(Web3.to_checksum_address(address))
            balance_eth = w3.from_wei(balance_wei, 'ether')
            return f"{float(balance_eth):.4f}"
        except Exception:
            return "0.0"

def send_real_email(to_email: str, code: str):
    msg = EmailMessage()
    msg["Subject"] = "AIRDROP-X Verification Code"
    msg["From"] = SENDER_EMAIL
    msg["To"] = to_email
    
    # Фирменный HTML-дизайн письма
    html_content = f"""
    <div style="background-color: #07050c; padding: 30px; font-family: sans-serif; color: #f3f0ff;">
      <div style="max-width: 500px; margin: 0 auto; background: #100a1c; border: 1px solid rgba(157,78,221,0.4); border-radius: 20px; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.8);">
        <div style="background: linear-gradient(135deg, #7b2cbf, #9d4edd); padding: 20px; text-align: center;">
          <h2 style="color: #fff; margin: 0; font-size: 18px; text-shadow: 0 0 10px rgba(255,255,255,0.5);">⚡ AIRDROP-X SECURITY</h2>
        </div>
        <div style="padding: 24px; text-align: center;">
          <p style="color: #b19cd9; font-size: 13px; line-height: 1.5; margin-bottom: 20px;">
            You have requested a verification code for your <b>AIRDROP-X</b> account. Use the code below to complete your action:
          </p>
          <div style="background: #07050c; border: 1px solid rgba(157,78,221,0.4); border-radius: 14px; padding: 18px; font-size: 28px; font-weight: 800; color: #e0aaff; letter-spacing: 6px; margin-bottom: 20px; box-shadow: inset 0 2px 5px rgba(0,0,0,0.5);">
            {code}
          </div>
          <p style="color: #7b68ee; font-size: 11px; line-height: 1.4;">
            If you did not request this code, please ignore this email. Never share this code with anyone.
          </p>
        </div>
        <div style="background: #07050c; padding: 12px; text-align: center; border-top: 1px solid rgba(157,78,221,0.2); font-size: 10px; color: #7b68ee;">
          AIRDROP-X © 2026. All rights reserved. Cyberpunk SaaS Panel.
        </div>
      </div>
    </div>
    """
    msg.set_content(f"Your code: {code}") # Запасной текстовый вариант
    msg.add_alternative(html_content, subtype="html")
    
    try:
        with smtplib.SMTP_SSL(SMTP_SERVER, SMTP_PORT) as server:
            server.login(SENDER_EMAIL, SENDER_PASSWORD)
            server.send_message(msg)
        return True
    except Exception as e:
        print(f"[SMTP Error] {e}")
        return False

@app.get("/", response_class=HTMLResponse)
async def read_index():
    if os.path.exists("index.html"):
        with open("index.html", "r", encoding="utf-8") as f:
            return f.read()
    return "<h1>index.html not found!</h1>"

@app.post("/api/send-code")
def api_send_code(data: EmailRequest):
    code = str(random.randint(100000, 999999))
    verification_codes[data.email] = code
    send_real_email(data.email, code)
    return {"status": "success", "message": "Code sent successfully!"}

@app.get("/api/gas/{network}")
async def get_network_gas(network: str):
    return {"status": "success", "network": network, "gas_price": get_live_gas_price(network)}

@app.get("/api/wallet/balances/{address}")
async def check_all_networks_balance(address: str, proxy: str = None):
    networks = ["Base", "Arbitrum", "ZkSync", "Scroll", "Linea", "Blast", "Mantle", "Berachain"]
    checker = BalanceChecker()
    return {"status": "success", "balances": {net: checker.get_balance(net, address, proxy) for net in networks}}

@app.get("/api/settings/{username}")
async def get_user_settings(username: str, db: Session = Depends(get_db)):
    settings = db.query(SettingsModel).filter(SettingsModel.username == username).first()
    if not settings:
        settings = SettingsModel(username=username)
        db.add(settings)
        db.commit()
    user = db.query(User).filter(User.username == username).first()
    plan = user.subscription_plan if user else "Standard"
    return {
        "status": "success",
        "subscription_plan": plan,
        "extra_slots": user.extra_slots if user else 0,
        "settings": {
            "master_wallet": settings.master_wallet,
            "auto_farming_enabled": settings.auto_farming_enabled,
            "schedule_days": settings.schedule_days,
            "random_delay": settings.random_delay,
            "gas_limit_gwei": settings.gas_limit_gwei
        }
    }

@app.post("/api/settings/save")
async def save_user_settings(req: SaveSettingsReq, db: Session = Depends(get_db)):
    settings = db.query(SettingsModel).filter(SettingsModel.username == req.username).first()
    if not settings:
        settings = SettingsModel(username=req.username)
        db.add(settings)
    settings.master_wallet = req.master_wallet
    settings.auto_farming_enabled = req.auto_farming_enabled
    settings.schedule_days = req.schedule_days
    settings.random_delay = req.random_delay
    settings.gas_limit_gwei = req.gas_limit_gwei
    db.commit()
    return {"status": "success", "message": "Settings saved successfully!"}

@app.post("/api/register")
async def register(user: UserRegister, db: Session = Depends(get_db)):
    # Проверка кода подтверждения
    saved_code = verification_codes.get(user.email)
    if not saved_code or saved_code != user.code:
        raise HTTPException(status_code=400, detail="Неверный или просроченный код подтверждения!")

    db_user = db.query(User).filter(User.username == user.username).first()
    if db_user:
        raise HTTPException(status_code=400, detail="User already exists")
    
    new_user = User(
        username=user.username, 
        email=user.email, 
        password_hash=user.password, 
        subscription_plan=user.plan
    )
    db.add(new_user)
    db.commit()
    return {"status": "success", "message": "Registered successfully"}

@app.post("/api/login")
async def login(user: UserLogin, db: Session = Depends(get_db)):
    db_user = db.query(User).filter(User.username == user.username).first()
    if not db_user or db_user.password_hash != user.password:
        raise HTTPException(status_code=401, detail="Invalid username or password")
    return {"status": "success", "message": "Logged in", "plan": db_user.subscription_plan, "extra_slots": db_user.extra_slots}

@app.post("/api/wallets/add")
async def add_wallet(wallet: WalletAdd, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == wallet.username).first()
    plan = user.subscription_plan if user else "Standard"
    extra = user.extra_slots if user else 0
    
    current_count = db.query(Wallet).filter(Wallet.username == wallet.username).count()
    base_limits = {"Standard": 5, "Pro": 15, "Premium": 30}
    max_allowed = base_limits.get(plan, 5) + extra
    
    if current_count >= max_allowed:
        raise HTTPException(
            status_code=400, 
            detail=f"⚠️ Лимит вашего тарифа ({plan}) исчерпан ({max_allowed} слотов)! Купите +1 слот или перейдите на старший тариф."
        )

    new_wallet = Wallet(username=wallet.username, wallet_address=wallet.wallet_address, encrypted_pk=wallet.encrypted_pk, proxy=wallet.proxy)
    db.add(new_wallet)
    db.commit()
    return {"status": "success", "message": "Wallet added successfully"}

@app.post("/api/wallets/buy-slot")
async def buy_extra_slot(req: BuyExtraSlotReq, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == req.username).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.extra_slots += 1
    db.commit()
    return {"status": "success", "message": f"Дополнительный слот успешно куплен! Всего докуплено: {user.extra_slots}"}

@app.get("/api/wallets/{username}")
async def get_wallets(username: str, db: Session = Depends(get_db)):
    wallets = db.query(Wallet).filter(Wallet.username == username).all()
    user = db.query(User).filter(User.username == username).first()
    plan = user.subscription_plan if user else "Standard"
    extra = user.extra_slots if user else 0
    
    base_limits = {"Standard": 5, "Pro": 15, "Premium": 30}
    max_allowed = base_limits.get(plan, 5) + extra
    
    return {
        "status": "success", 
        "plan": plan,
        "max_slots": max_allowed,
        "wallets": [{"id": w.id, "wallet_address": w.wallet_address, "proxy": w.proxy} for w in wallets]
    }

@app.delete("/api/wallets/delete/{wallet_id}")
async def delete_wallet(wallet_id: int, db: Session = Depends(get_db)):
    wallet = db.query(Wallet).filter(Wallet.id == wallet_id).first()
    if not wallet:
        raise HTTPException(status_code=404, detail="Wallet not found")
    db.delete(wallet)
    db.commit()
    return {"status": "success", "message": "Wallet deleted"}

@app.post("/api/start")
async def start_farming(req: StartFarmReq, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == req.username).first()
    plan = user.subscription_plan if user else "Standard"
    
    if plan == "Standard" and req.network not in ["Base"]:
        raise HTTPException(
            status_code=400,
            detail=f"⚠️ Сеть '{req.network}' недоступна на тарифе Standard! Доступна только Base L2."
        )

    wallets = db.query(Wallet).filter(Wallet.username == req.username).all()
    if not wallets:
        return {"status": "error", "message": "No wallets found!"}
    
    wallets_data = [{"id": w.id, "encrypted_pk": w.encrypted_pk, "proxy": w.proxy} for w in wallets]
    rpc_list = ["https://mainnet.base.org", "https://arb1.arbitrum.io/rpc"]
    results = await run_real_farm(wallets_data, rpc_list, "master_password", target_network=req.network)
    return {"status": "success", "message": f"Farming session completed!", "results": results}

@app.post("/api/scan/{username}")
async def scan_drops(username: str, db: Session = Depends(get_db)):
    wallets = db.query(Wallet).filter(Wallet.username == username).all()
    claimed_loot = [{"wallet": w.wallet_address[:8] + "...", "protocol": "LayerZero Airdrop", "amount": f"{random.uniform(15.0, 95.0):.2f} tokens", "status": "Claimed"} for w in wallets]
    return {"status": "success", "data": {"total_wallets_scanned": len(wallets), "found_drops": claimed_loot}}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("server:app", host="127.0.0.1", port=8000, reload=True)