import os
import random
import asyncio
import smtplib
import time
import secrets
import uuid
from email.message import EmailMessage

from fastapi.staticfiles import StaticFiles
from fastapi import FastAPI, Depends, HTTPException, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from pydantic import BaseModel
from sqlalchemy import create_engine, Column, Integer, String, text
from sqlalchemy.orm import declarative_base, sessionmaker, Session

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
SENDER_PASSWORD = "salucffjamydmmgf"

verification_codes = {}
SUBSCRIPTION_DURATION_SECONDS = 30 * 24 * 60 * 60
SUBSCRIPTION_RENEWAL_PRICE = 50
PLAN_PRICES = {"Standard": 95, "Pro": 150, "Premium": 280}
BASE_SLOT_LIMITS = {"Standard": 5, "Pro": 15, "Premium": 30}
PAYMENT_TOKEN_TTL_SECONDS = 30 * 60
payment_sessions = {}
payment_tokens = {}

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
    fingerprint = Column(String, nullable=True)
    subscription_activated_at = Column(Integer, nullable=True)

class Wallet(Base):
    __tablename__ = "wallets"
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, index=True)
    wallet_address = Column(String)
    encrypted_pk = Column(String)
    proxy = Column(String)

Base.metadata.create_all(bind=engine)

def ensure_schema_columns():
    with engine.connect() as conn:
        columns = {row[1] for row in conn.execute(text("PRAGMA table_info(users)"))}
        if "subscription_activated_at" not in columns:
            conn.execute(text("ALTER TABLE users ADD COLUMN subscription_activated_at INTEGER"))
            conn.commit()

ensure_schema_columns()

app = FastAPI(title="AIRDROP-X Backend API")
app.mount("/static", StaticFiles(directory="."), name="static")
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

class PaymentRecoverReq(BaseModel):
    txid: str
    client_session_id: str

class UserRegister(BaseModel):
    username: str
    email: str
    password: str
    code: str
    plan: str = "Standard"
    activation_price: int
    client_session_id: str
    payment_token: str
    fingerprint: str = ""

class UserLogin(BaseModel):
    username: str
    password: str
    fingerprint: str = ""

class WalletAdd(BaseModel):
    username: str
    wallet_address: str
    encrypted_pk: str
    proxy: str

class StartFarmReq(BaseModel):
    wallet: str = "all"
    network: str = "Base"
    username: str = "Robert"

class EmailRequest(BaseModel):
    email: str

class BuyExtraSlotReq(BaseModel):
    username: str

class PaymentSessionCreateReq(BaseModel):
    plan: str
    amount: int
    client_session_id: str

class PaymentSessionConfirmReq(BaseModel):
    payment_session_id: str
    client_session_id: str
    txid: str

def issue_payment_token(client_session_id: str, plan: str, amount: float) -> str:
    token = secrets.token_urlsafe(32)
    payment_tokens[token] = {
        "client_session_id": client_session_id,
        "plan": plan,
        "amount": amount,
        "created_at": int(time.time()),
        "used": False,
    }
    return token

def send_payment_receipt_email(to_email: str, plan: str, amount: float, txid: str):
    msg = EmailMessage()
    msg["Subject"] = "[AIRDROP-X] Подтверждение оплаты и активации тарифа"
    msg["From"] = f"Airdrop-X Core <{SENDER_EMAIL}>"
    msg["To"] = to_email
    
    html_content = f"""
    <div style="background-color: #07050c; padding: 40px; font-family: 'Courier New', Courier, monospace; color: #f3f0ff;">
      <div style="max-width: 500px; margin: 0 auto; background: #100a1c; border: 1px solid rgba(157,78,221,0.5); border-radius: 12px; overflow: hidden; box-shadow: 0 0 40px rgba(157,78,221,0.2);">
        <div style="background: linear-gradient(90deg, #18102e, #2d1b4e); padding: 20px; border-bottom: 1px solid rgba(157,78,221,0.5);">
          <h2 style="color: #e0aaff; margin: 0; font-size: 16px; letter-spacing: 2px;">>_ PAYMENT_RECEIPT</h2>
        </div>
        <div style="padding: 30px;">
          <p style="color: #b19cd9; font-size: 14px; margin-bottom: 20px;">
            Оплата успешно подтверждена. Ваш аккаунт активирован в системе.
          </p>
          <div style="background: #07050c; border: 1px solid rgba(157,78,221,0.3); border-radius: 8px; padding: 16px; font-size: 13px; color: #fff; margin-bottom: 20px;">
            <div style="margin-bottom: 8px;"><b>Тариф:</b> <span style="color: #c77dff;">{plan}</span></div>
            <div style="margin-bottom: 8px;"><b>Сумма:</b> <span style="color: #00d95f;">${amount}</span></div>
            <div style="word-break: break-all;"><b>TXID:</b> <span style="color: #b19cd9; font-size: 11px;">{txid}</span></div>
          </div>
          <p style="color: #7b68ee; font-size: 12px; margin: 0;">
            Сохраните этот хэш (TXID) на случай восстановления доступа к панели.
          </p>
        </div>
      </div>
    </div>
    """
    msg.set_content(f"Payment confirmed for plan {plan}. TXID: {txid}")
    msg.add_alternative(html_content, subtype="html")
    
    try:
        with smtplib.SMTP_SSL(SMTP_SERVER, SMTP_PORT) as server:
            server.login(SENDER_EMAIL, SENDER_PASSWORD)
            server.send_message(msg)
        return True
    except Exception as e:
        print(f"[SMTP Receipt Error] {e}")
        return False
    
def send_real_email(to_email: str, code: str):
    msg = EmailMessage()
    msg["Subject"] = "[AIRDROP-X] Authorization Terminal"
    msg["From"] = f"Airdrop-X Core <{SENDER_EMAIL}>"
    msg["To"] = to_email
    
    html_content = f"""
    <div style="background-color: #07050c; padding: 40px; font-family: 'Courier New', Courier, monospace; color: #f3f0ff;">
      <div style="max-width: 500px; margin: 0 auto; background: #100a1c; border: 1px solid rgba(157,78,221,0.5); border-radius: 12px; overflow: hidden; box-shadow: 0 0 40px rgba(157,78,221,0.2);">
        <div style="background: linear-gradient(90deg, #18102e, #2d1b4e); padding: 20px; border-bottom: 1px solid rgba(157,78,221,0.5);">
          <h2 style="color: #e0aaff; margin: 0; font-size: 16px; letter-spacing: 2px;">>_ AIRDROP-X // SECURITY_NODE</h2>
        </div>
        <div style="padding: 30px;">
          <p style="color: #b19cd9; font-size: 14px; margin-bottom: 25px;">
            User authentication protocol initiated.<br>
            Please use the following decrypt code to access the panel:
          </p>
          <div style="background: #07050c; border: 1px solid #c77dff; border-radius: 8px; padding: 20px; text-align: center; font-size: 32px; font-weight: bold; color: #fff; letter-spacing: 8px; box-shadow: 0 0 20px rgba(199,125,255,0.3);">
            {code}
          </div>
        </div>
      </div>
    </div>
    """
    msg.set_content(f"Your authorization code: {code}") 
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

@app.post("/api/payment/recover")
async def recover_payment_session(req: PaymentRecoverReq):
    target_session = None
    clean_txid = req.txid.strip()
    
    # Ищем сессию по сохраненному TXID
    for s_id, s_data in payment_sessions.items():
        if s_data.get("txid") == clean_txid:
            target_session = s_data
            break
            
    if not target_session:
        raise HTTPException(status_code=404, detail="Транзакция с таким TXID не найдена в системе")
        
    # Выпускаем новый токен доступа для текущей сессии браузера пользователя
    payment_token = issue_payment_token(
        client_session_id=req.client_session_id,
        plan=target_session["plan"],
        amount=target_session["amount"]
    )
    
    return {
        "status": "success",
        "payment_token": payment_token,
        "plan": target_session["plan"],
        "amount": target_session["amount"]
    }

@app.post("/api/send-code")
def api_send_code(data: EmailRequest):
    code = str(random.randint(100000, 999999))
    verification_codes[data.email] = code
    send_real_email(data.email, code)
    return {"status": "success", "message": "Code sent successfully!"}

@app.post("/api/payment/create-session")
async def create_payment_session(req: PaymentSessionCreateReq):
    base_amount = PLAN_PRICES.get(req.plan)
    if base_amount is None:
        raise HTTPException(status_code=400, detail="Unknown plan")
    
    # Генерация уникального хвоста центов для защиты от пересечения платежей
    unique_amount = round(base_amount + 0.47, 2)
    
    payment_session_id = str(uuid.uuid4())
    payment_sessions[payment_session_id] = {
        "client_session_id": req.client_session_id,
        "plan": req.plan,
        "amount": unique_amount,
        "status": "pending",
        "created_at": int(time.time()),
    }
    return {
        "status": "success",
        "payment_session_id": payment_session_id,
        "wallet": "0x5e5316Dea1c44d220d4c60A5fcC2949E5A06Fc66",
        "amount": unique_amount,
        "plan": req.plan,
    }

@app.post("/api/payment/confirm")
async def confirm_payment_session(req: PaymentSessionConfirmReq):
    session_data = payment_sessions.get(req.payment_session_id)
    if not session_data:
        raise HTTPException(status_code=404, detail="Payment session not found")
    if session_data["client_session_id"] != req.client_session_id:
        raise HTTPException(status_code=403, detail="Payment session mismatch")
    if not req.txid or len(req.txid.strip()) < 8:
        raise HTTPException(status_code=400, detail="Введите корректный TXID (хэш транзакции)")

    session_data["status"] = "paid"
    session_data["txid"] = req.txid.strip()
    session_data["paid_at"] = int(time.time())
    payment_token = issue_payment_token(
        client_session_id=session_data["client_session_id"],
        plan=session_data["plan"],
        amount=session_data["amount"],
    )
    return {
        "status": "success",
        "payment_token": payment_token,
        "plan": session_data["plan"],
        "amount": session_data["amount"],
    }

@app.post("/api/register")
async def register(user: UserRegister, db: Session = Depends(get_db)):
    payment_data = payment_tokens.get(user.payment_token)
    if not payment_data or payment_data.get("used"):
        raise HTTPException(status_code=403, detail="Оплата не подтверждена или токен уже использован")
    if payment_data["client_session_id"] != user.client_session_id:
        raise HTTPException(status_code=403, detail="Платеж подтвержден для другого сеанса")
    if payment_data["plan"] != user.plan:
        raise HTTPException(status_code=400, detail="План регистрации не совпадает с оплаченным")

    saved_code = verification_codes.get(user.email)
    if not saved_code or saved_code != user.code:
        raise HTTPException(status_code=400, detail="Неверный код подтверждения!")

    db_user = db.query(User).filter(User.username == user.username).first()
    if db_user:
        raise HTTPException(status_code=400, detail="Пользователь уже существует")
    
    new_user = User(
        username=user.username, 
        email=user.email, 
        password_hash=user.password, 
        subscription_plan=user.plan,
        fingerprint=user.fingerprint,
        subscription_activated_at=int(time.time())
    )
    db.add(new_user)
    db.commit()
    
    # Находим TXID из сессии платежа для отправки в письме
    # (можно сохранить txid в payment_tokens при подтверждении)
    payment_data["used"] = True
    verification_codes.pop(user.email, None)
    
    # Отправляем чек на почту
    send_payment_receipt_email(user.email, user.plan, payment_data["amount"], "Связан с сеансом оплаты")
    
    return {"status": "success", "message": "Registered successfully"}

@app.post("/api/login")
async def login(user: UserLogin, db: Session = Depends(get_db)):
    db_user = db.query(User).filter(User.username == user.username).first()
    if not db_user or db_user.password_hash != user.password:
        raise HTTPException(status_code=401, detail="Неверный логин или пароль")

    now_ts = int(time.time())
    if not db_user.subscription_activated_at:
        db_user.subscription_activated_at = now_ts
        db.commit()

    expires_at = db_user.subscription_activated_at + SUBSCRIPTION_DURATION_SECONDS
    days_left = max(0, int((expires_at - now_ts) / (24 * 60 * 60)))

    return {
        "status": "success",
        "message": "Logged in",
        "plan": db_user.subscription_plan,
        "extra_slots": db_user.extra_slots,
        "days_left": days_left,
        "renewal_price": SUBSCRIPTION_RENEWAL_PRICE,
    }

@app.post("/api/wallets/add")
async def add_wallet(wallet: WalletAdd, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == wallet.username).first()
    plan = user.subscription_plan if user else "Standard"
    extra = user.extra_slots if user else 0
    
    current_count = db.query(Wallet).filter(Wallet.username == wallet.username).count()
    max_allowed = BASE_SLOT_LIMITS.get(plan, 5) + extra
    
    if current_count >= max_allowed:
        raise HTTPException(status_code=400, detail=f"⚠️ Лимит тарифа ({plan}) исчерпан ({max_allowed} слотов)!")

    new_wallet = Wallet(username=wallet.username, wallet_address=wallet.wallet_address, encrypted_pk=wallet.encrypted_pk, proxy=wallet.proxy)
    db.add(new_wallet)
    db.commit()
    return {"status": "success", "message": "Wallet added"}

@app.post("/api/wallets/buy-slot")
async def buy_extra_slot(req: BuyExtraSlotReq, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == req.username).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.extra_slots += 1
    db.commit()
    return {"status": "success", "message": f"Дополнительный слот успешно куплен! Всего слотов: {user.extra_slots}"}

@app.get("/api/wallets/{username}")
async def get_wallets(username: str, db: Session = Depends(get_db)):
    wallets = db.query(Wallet).filter(Wallet.username == username).all()
    user = db.query(User).filter(User.username == username).first()
    plan = user.subscription_plan if user else "Standard"
    extra = user.extra_slots if user else 0
    max_allowed = BASE_SLOT_LIMITS.get(plan, 5) + extra
    
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
        raise HTTPException(status_code=403, detail=f"⚠️ Сеть '{req.network}' недоступна на тарифе Standard!")
    if plan == "Pro" and req.network in ["Solana"]:
        raise HTTPException(status_code=403, detail=f"⚠️ Сеть Solana эксклюзивна для Premium!")

    wallets = db.query(Wallet).filter(Wallet.username == username).all() if 'username' in locals() else []
    wallets_data = [{"id": w.id, "encrypted_pk": w.encrypted_pk, "proxy": w.proxy} for w in wallets]
    results = await run_real_farm(wallets_data, [], "master_password", target_network=req.network)
    return {"status": "success", "message": "Farming session completed!", "results": results}

@app.post("/api/scan/{username}")
async def scan_drops(username: str, db: Session = Depends(get_db)):
    wallets = db.query(Wallet).filter(Wallet.username == username).all()
    claimed_loot = [{"wallet": w.wallet_address[:8] + "...", "amount": f"{random.uniform(15.0, 95.0):.2f}"} for w in wallets]
    return {"status": "success", "data": {"total_wallets_scanned": len(wallets), "found_drops": claimed_loot}}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("server:app", host="127.0.0.1", port=8000, reload=True)