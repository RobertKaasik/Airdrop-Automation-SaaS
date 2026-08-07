import os
import random
import asyncio
import smtplib
import time
import secrets
import uuid
import datetime
import requests
import logging
import hashlib
import hmac
import bcrypt
from email.message import EmailMessage
from pathlib import Path
from dotenv import load_dotenv

# Securely load environment variables from .env
BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")

SMTP_SERVER = "smtp.gmail.com"
SMTP_PORT = 465
SENDER_EMAIL = "airdrop.x.support@gmail.com"
SENDER_PASSWORD = os.getenv("SMTP_PASSWORD")
TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")
TELEGRAM_BOT_USERNAME = os.getenv("TELEGRAM_BOT_USERNAME", "").strip().lstrip("@")
WALLETCONNECT_PROJECT_ID = os.getenv("WALLETCONNECT_PROJECT_ID", "").strip()

MASTER_WALLET_ADDRESS = "0x5e5316Dea1c44d220d4c60A5fcC2949E5A06Fc66"
BASE_RPC_URL = "https://mainnet.base.org"

from fastapi import FastAPI, APIRouter, Depends, HTTPException, Header
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Dict, List, Optional
from sqlalchemy import create_engine, Column, Integer, String, Float, Boolean, text
from sqlalchemy.orm import declarative_base, sessionmaker, Session
from sqlalchemy.exc import IntegrityError
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from web3 import Web3

# --- LOGGING AND SETTINGS ---
logging.getLogger('apscheduler.executors.default').setLevel(logging.WARNING)
logging.getLogger('apscheduler.scheduler').setLevel(logging.WARNING)

try:
    from core_engine import run_real_farm, get_live_gas_price
except ImportError:
    async def run_real_farm(*args, **kwargs):
        return [{"wallet_id": 0, "status": "Failed", "error": "Core engine not found"}]
    def get_live_gas_price(network):
        return "N/A"
    
USER_SETTINGS_DB = {}
verification_codes = {}
SUBSCRIPTION_DURATION_SECONDS = 30 * 24 * 60 * 60
PLAN_PRICES = {"Standard": 29, "Pro": 49, "Premium": 89}
ONBOARDING_PRICE = 49
BASE_SLOT_LIMITS = {"Standard": 5, "Pro": 15, "Premium": 30}
payment_sessions = {}
payment_tokens = {}
gas_cache = {}
AUTH_SESSION_DURATION_SECONDS = 12 * 60 * 60
EMAIL_CODE_TTL_SECONDS = 10 * 60
EMAIL_CODE_RESEND_SECONDS = 60
PAYMENT_SESSION_TTL_SECONDS = 30 * 60
TELEGRAM_LINK_TTL_SECONDS = 10 * 60
TELEGRAM_TEST_COOLDOWN_SECONDS = 60

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
    balance = Column(Float, default=0.0)
    fingerprint = Column(String, nullable=True)
    subscription_activated_at = Column(Integer, nullable=True)
    onboarding_purchased = Column(Boolean, default=False)

class Wallet(Base):
    __tablename__ = "wallets"
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, index=True)
    wallet_address = Column(String)
    encrypted_pk = Column(String)
    label = Column(String, nullable=True)
    proxy = Column(String)

class Transaction(Base):
    __tablename__ = "transactions"
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, index=True)
    tx_type = Column(String)
    amount = Column(Float)
    date_str = Column(String)
    status = Column(String)

class AuthSession(Base):
    __tablename__ = "auth_sessions"
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, index=True, nullable=False)
    token_hash = Column(String, unique=True, index=True, nullable=False)
    expires_at = Column(Integer, nullable=False)
    created_at = Column(Integer, nullable=False)

class ProcessedBlockchainTransaction(Base):
    __tablename__ = "processed_blockchain_transactions"
    txid = Column(String, primary_key=True)
    purpose = Column(String, nullable=False)
    username = Column(String, nullable=True)
    created_at = Column(Integer, nullable=False)

class BudgetPlan(Base):
    __tablename__ = "budget_plans"
    username = Column(String, primary_key=True)
    network = Column(String, nullable=False, default="Base")
    planned_operations = Column(Integer, nullable=False, default=1)
    max_cost_per_operation = Column(Float, nullable=False, default=1.0)
    extra_cost_reserve = Column(Float, nullable=False, default=0.0)
    daily_cap = Column(Float, nullable=False, default=10.0)
    monthly_cap = Column(Float, nullable=False, default=50.0)
    updated_at = Column(Integer, nullable=False)

class TelegramLinkCode(Base):
    __tablename__ = "telegram_link_codes"
    code = Column(String, primary_key=True)
    username = Column(String, index=True, nullable=False)
    language = Column(String, nullable=False, default="ru")
    expires_at = Column(Integer, nullable=False)
    used = Column(Boolean, nullable=False, default=False)
    created_at = Column(Integer, nullable=False)

class TelegramSubscription(Base):
    __tablename__ = "telegram_subscriptions"
    username = Column(String, primary_key=True)
    chat_id = Column(String, unique=True, index=True, nullable=False)
    language = Column(String, nullable=False, default="ru")
    last_test_at = Column(Integer, nullable=True)
    linked_at = Column(Integer, nullable=False)
    updated_at = Column(Integer, nullable=False)

Base.metadata.create_all(bind=engine)

def ensure_schema_columns():
    with engine.connect() as conn:
        columns = {row[1] for row in conn.execute(text("PRAGMA table_info(users)"))}
        if "subscription_activated_at" not in columns:
            conn.execute(text("ALTER TABLE users ADD COLUMN subscription_activated_at INTEGER"))
            conn.commit()
        if "balance" not in columns:
            conn.execute(text("ALTER TABLE users ADD COLUMN balance FLOAT DEFAULT 0.0"))
            conn.commit()
        if "onboarding_purchased" not in columns:
            conn.execute(text("ALTER TABLE users ADD COLUMN onboarding_purchased BOOLEAN DEFAULT 0"))
            conn.commit()
        wallet_columns = {row[1] for row in conn.execute(text("PRAGMA table_info(wallets)"))}
        if wallet_columns and "label" not in wallet_columns:
            conn.execute(text("ALTER TABLE wallets ADD COLUMN label VARCHAR"))
            conn.commit()
        telegram_code_columns = {row[1] for row in conn.execute(text("PRAGMA table_info(telegram_link_codes)"))}
        if telegram_code_columns and "language" not in telegram_code_columns:
            conn.execute(text("ALTER TABLE telegram_link_codes ADD COLUMN language VARCHAR DEFAULT 'ru'"))
            conn.commit()
        telegram_subscription_columns = {row[1] for row in conn.execute(text("PRAGMA table_info(telegram_subscriptions)"))}
        if telegram_subscription_columns and "language" not in telegram_subscription_columns:
            conn.execute(text("ALTER TABLE telegram_subscriptions ADD COLUMN language VARCHAR DEFAULT 'ru'"))
            conn.commit()

ensure_schema_columns()

app = FastAPI(title="AIRDROP-X Backend API")

allowed_origins = [
    origin.strip()
    for origin in os.getenv("APP_ALLOWED_ORIGINS", "http://127.0.0.1:8000,http://localhost:8000").split(",")
    if origin.strip()
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=False,
    allow_methods=["GET", "POST", "DELETE"],
    allow_headers=["Content-Type", "Authorization"],
)

@app.middleware("http")
async def add_security_headers(request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    if os.getenv("APP_ENV", "development").lower() == "production":
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    return response

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def send_telegram_notification(chat_id: str, message: str):
    if not TELEGRAM_BOT_TOKEN or not chat_id:
        return False
    clean_chat_id = chat_id.strip()
    url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage"
    payload = {
        "chat_id": clean_chat_id,
        "text": message,
        "parse_mode": "Markdown"
    }
    try:
        response = requests.post(url, json=payload, timeout=10)
        return response.status_code == 200 and response.json().get("ok", False)
    except Exception as e:
        logging.warning("Telegram notification failed: %s", e)
        return False

def get_telegram_subscription(db: Session, username: str) -> Optional[TelegramSubscription]:
    return db.query(TelegramSubscription).filter(TelegramSubscription.username == username).first()

def classify_gas_level(network: str, gas: str) -> str:
    try:
        value = float(str(gas).split()[0])
    except (ValueError, IndexError):
        return "unavailable"
    thresholds = {
        "Ethereum": (15, 35),
        "Base": (0.03, 0.12),
        "Arbitrum": (0.05, 0.15),
        "Optimism": (0.05, 0.15),
        "Polygon": (50, 150),
        "BNB Chain": (3, 6),
        "Solana": (1000, 5000),
        "Tron": (20, 50),
    }
    low_threshold, medium_threshold = thresholds.get(network, (10, 30))
    if value <= low_threshold:
        return "low"
    if value <= medium_threshold:
        return "medium"
    return "high"

# --- REAL BLOCKCHAIN TX VERIFICATION ---
def verify_blockchain_tx(txid: str, expected_amount: float) -> bool:
    try:
        clean_txid = txid.strip()
        if expected_amount <= 0 or not clean_txid.startswith("0x") or len(clean_txid) != 66:
            return False
            
        w3 = Web3(Web3.HTTPProvider(BASE_RPC_URL, request_kwargs={"timeout": 10}))
        if not w3.is_connected():
            print("[Web3 Error] No connection to Base node")
            return False 
            
        receipt = w3.eth.get_transaction_receipt(clean_txid)
        if not receipt or receipt.get("status") != 1:
            return False
            
        tx = w3.eth.get_transaction(clean_txid)
        if not tx:
            return False
            
        to_addr = tx.get("to")
        if not to_addr or to_addr.lower() != MASTER_WALLET_ADDRESS.lower():
            return False
            
        value_wei = tx.get("value", 0)
        value_eth = float(w3.from_wei(value_wei, 'ether'))
        
        # The sender pays network fees separately, so the transfer itself must cover
        # the expected payment amount.
        if value_eth < (expected_amount * 0.95):
            return False
            
        return True
    except Exception as e:
        print(f"[Blockchain Verify Exception] {e}")
        return False

scheduler = AsyncIOScheduler()

async def run_scheduled_farming_job():
    logging.warning("Scheduled signing is disabled until non-custodial wallet signing is implemented.")
    return
    now = datetime.datetime.now()
    current_day_map = {0: 'Mon', 1: 'Tue', 2: 'Wed', 3: 'Thu', 4: 'Fri', 5: 'Sat', 6: 'Sun'}
    current_day_str = current_day_map.get(now.weekday())
    current_time_str = now.strftime("%H:%M")

    for username, settings in USER_SETTINGS_DB.items():
        if not settings.get("schedulerEnabled", False):
            continue
        
        active_days = settings.get("days", [])
        daily_schedule = settings.get("schedule", {})
        
        # Map RU days to EN for internal checks if needed, but assuming frontend sends English days or we match exact
        if current_day_str in active_days and current_day_str in daily_schedule:
            task_info = daily_schedule[current_day_str]
            task_time = task_info.get("time") if isinstance(task_info, dict) else task_info.time
            
            if task_time == current_time_str:
                chat_id = settings.get("telegram")
                notify_start = settings.get("notifyStart", True)
                notify_success = settings.get("notifySuccess", True)
                notify_error = settings.get("notifyError", True)

                if chat_id and notify_start:
                    send_telegram_notification(
                        chat_id, 
                        f"🚀 **Scheduled Auto-Farm!**\n"
                        f"• User: `{username}`\n"
                        f"• Day: `{current_day_str}` ({current_time_str})\n"
                        f"• Gas limit: `{settings.get('gwei', 30)} Gwei`\n"
                        f"✅ Status: Farming session launched successfully."
                    )

                db = SessionLocal()
                try:
                    user_wallets = db.query(Wallet).filter(Wallet.username == username).all()
                    wallets_data = [{"id": w.id, "encrypted_pk": w.encrypted_pk, "proxy": w.proxy} for w in user_wallets]
                    
                    if wallets_data:
                        results = await run_real_farm(wallets_data, [], "master_password", target_network="Base")
                        if chat_id and notify_success:
                            send_telegram_notification(
                                chat_id, 
                                f"✅ **Scheduled farm successfully completed!**\n"
                                f"• User: `{username}`\n"
                                f"• Workers processed: `{len(wallets_data)}`"
                            )
                    else:
                        if chat_id and notify_error:
                            send_telegram_notification(
                                chat_id, 
                                f"⚠️ **Farm skipped:** user `{username}` has no wallets added."
                            )
                except Exception as e:
                    if chat_id and notify_error:
                        send_telegram_notification(chat_id, f"❌ **Auto-farm error:** `{str(e)}`")
                finally:
                    db.close()

@app.on_event("startup")
async def startup_event():
    scheduler.add_job(run_scheduled_farming_job, 'interval', minutes=1)
    scheduler.start()
    print("✅ Background async task scheduler started.")

class DailyScheduleItem(BaseModel):
    time: str
    minDelay: Optional[int] = 60
    maxDelay: Optional[int] = 300
    delay: Optional[int] = None

class ProfileSettingsRequest(BaseModel):
    username: str
    schedulerEnabled: bool
    days: List[str]
    schedule: Dict[str, DailyScheduleItem]
    gwei: int
    telegram: Optional[str] = None
    notifySettings: Optional[bool] = True
    notifyStart: Optional[bool] = True
    notifySuccess: Optional[bool] = True
    notifyError: Optional[bool] = True
    language: Optional[str] = "ru"

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
    label: Optional[str] = None
    proxy: str

class StartFarmReq(BaseModel):
    wallet: str = "all"
    network: str = "Base"
    username: str = "Robert"

class EmailRequest(BaseModel):
    email: str

class BuyExtraSlotReq(BaseModel):
    username: str

class DepositReq(BaseModel):
    username: str
    amount: float
    txid: str

class PaymentSessionCreateReq(BaseModel):
    plan: str
    amount: int
    client_session_id: str
    onboarding: bool = False

class PaymentSessionConfirmReq(BaseModel):
    payment_session_id: str
    client_session_id: str
    txid: str

class BudgetPlanRequest(BaseModel):
    network: str
    planned_operations: int
    max_cost_per_operation: float
    extra_cost_reserve: float
    daily_cap: float
    monthly_cap: float

class TelegramLinkRequest(BaseModel):
    language: Optional[str] = "ru"

def normalize_language(language: Optional[str]) -> str:
    return language if language in {"ru", "en", "zh"} else "ru"

def issue_payment_token(client_session_id: str, plan: str, amount: float, onboarding: bool = False) -> str:
    token = secrets.token_urlsafe(32)
    payment_tokens[token] = {
        "client_session_id": client_session_id,
        "plan": plan,
        "amount": amount,
        "onboarding": onboarding,
        "created_at": int(time.time()),
        "used": False,
    }
    return token

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt(rounds=12)).decode("utf-8")

def is_legacy_password_hash(hashed_password: str) -> bool:
    return len(hashed_password) == 64 and not hashed_password.startswith("$2")

def verify_password(plain_password: str, hashed_password: str) -> bool:
    if not plain_password or not hashed_password:
        return False
    try:
        if hashed_password.startswith("$2"):
            return bcrypt.checkpw(plain_password.encode("utf-8"), hashed_password.encode("utf-8"))
        # Existing accounts are migrated on their next successful login. This path
        # is only for compatibility with the original legacy database format.
        legacy_salt = "AirdropX_Secure_Salt_2026_"
        legacy_hash = hashlib.sha256((legacy_salt + plain_password[:72]).encode("utf-8")).hexdigest()
        return hmac.compare_digest(legacy_hash, hashed_password)
    except (ValueError, TypeError):
        return False

def issue_access_token(username: str, db: Session) -> str:
    raw_token = secrets.token_urlsafe(32)
    now_ts = int(time.time())
    db.query(AuthSession).filter(AuthSession.expires_at <= now_ts).delete()
    db.add(AuthSession(
        username=username,
        token_hash=hashlib.sha256(raw_token.encode("utf-8")).hexdigest(),
        created_at=now_ts,
        expires_at=now_ts + AUTH_SESSION_DURATION_SECONDS,
    ))
    db.commit()
    return raw_token

def get_current_user(
    authorization: Optional[str] = Header(default=None),
    db: Session = Depends(get_db),
) -> User:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Authentication required")
    raw_token = authorization.removeprefix("Bearer ").strip()
    if not raw_token:
        raise HTTPException(status_code=401, detail="Authentication required")
    token_hash = hashlib.sha256(raw_token.encode("utf-8")).hexdigest()
    auth_session = db.query(AuthSession).filter(AuthSession.token_hash == token_hash).first()
    now_ts = int(time.time())
    if not auth_session or auth_session.expires_at <= now_ts:
        if auth_session:
            db.delete(auth_session)
            db.commit()
        raise HTTPException(status_code=401, detail="Session expired or invalid")
    current_user = db.query(User).filter(User.username == auth_session.username).first()
    if not current_user:
        raise HTTPException(status_code=401, detail="Session user not found")
    return current_user

def require_owned_username(username: str, current_user: User) -> None:
    if username != current_user.username:
        raise HTTPException(status_code=403, detail="You do not have access to this account")

def reserve_verified_transaction(
    db: Session, txid: str, expected_amount: float, purpose: str, username: Optional[str] = None
) -> None:
    clean_txid = txid.strip().lower()
    if db.query(ProcessedBlockchainTransaction).filter(ProcessedBlockchainTransaction.txid == clean_txid).first():
        raise HTTPException(status_code=409, detail="This blockchain transaction has already been used")
    if not verify_blockchain_tx(clean_txid, expected_amount):
        raise HTTPException(status_code=400, detail="Blockchain transaction was not confirmed or amount did not match")
    db.add(ProcessedBlockchainTransaction(
        txid=clean_txid,
        purpose=purpose,
        username=username,
        created_at=int(time.time()),
    ))
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="This blockchain transaction has already been used")

def send_payment_receipt_email(to_email: str, plan: str, amount: float, txid: str):
    msg = EmailMessage()
    msg["Subject"] = "[AIRDROP-X] Payment confirmation and plan activation"
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
            Payment successfully confirmed via blockchain gateway. Account activated.
          </p>
          <div style="background: #07050c; border: 1px solid rgba(157,78,221,0.3); border-radius: 8px; padding: 16px; font-size: 13px; color: #fff; margin-bottom: 20px;">
            <div style="margin-bottom: 8px;"><b>Plan:</b> <span style="color: #c77dff;">{plan}</span></div>
            <div style="margin-bottom: 8px;"><b>Amount:</b> <span style="color: #00d95f;">${amount}</span></div>
            <div style="word-break: break-all;"><b>TXID:</b> <span style="color: #b19cd9; font-size: 11px;">{txid}</span></div>
          </div>
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
        print(f"🔥 EMAIL SEND ERROR: {e}")
        return False

@app.post("/api/settings/save")
async def save_user_settings(data: ProfileSettingsRequest, current_user: User = Depends(get_current_user)):
    try:
        require_owned_username(data.username, current_user)
        for day, item in data.schedule.items():
            max_d = item.maxDelay if item.maxDelay is not None else (item.delay if item.delay is not None else 300)
            if max_d > 7200:
                raise HTTPException(status_code=400, detail=f"Delay limit exceeded for day {day}: max 7200 seconds")

        USER_SETTINGS_DB[data.username] = data.dict()
        subscription = get_telegram_subscription(db, data.username)
        if subscription:
            subscription.language = normalize_language(data.language)
            subscription.updated_at = int(time.time())
            db.commit()
        
        return {"status": "success", "message": "Settings saved successfully"}
    except HTTPException as he:
        raise he
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/api/telegram/status")
def telegram_status(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    subscription = get_telegram_subscription(db, current_user.username)
    return {
        "linked": bool(subscription),
        "bot_configured": bool(TELEGRAM_BOT_TOKEN and TELEGRAM_BOT_USERNAME),
    }

@app.get("/api/walletconnect/config")
def walletconnect_config(current_user: User = Depends(get_current_user)):
    if not WALLETCONNECT_PROJECT_ID:
        raise HTTPException(status_code=503, detail="WalletConnect is not configured")
    return {"project_id": WALLETCONNECT_PROJECT_ID, "chain_id": 8453}

@app.post("/api/telegram/link-code")
def create_telegram_link_code(
    data: TelegramLinkRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not TELEGRAM_BOT_TOKEN or not TELEGRAM_BOT_USERNAME:
        raise HTTPException(status_code=503, detail="Telegram bot is not configured")

    now_ts = int(time.time())
    db.query(TelegramLinkCode).filter(
        (TelegramLinkCode.username == current_user.username) |
        (TelegramLinkCode.expires_at <= now_ts)
    ).delete(synchronize_session=False)
    code = secrets.token_urlsafe(24).replace("=", "")
    db.add(TelegramLinkCode(
        code=code,
        username=current_user.username,
        language=normalize_language(data.language),
        expires_at=now_ts + TELEGRAM_LINK_TTL_SECONDS,
        used=False,
        created_at=now_ts,
    ))
    db.commit()
    return {
        "code": code,
        "expires_in": TELEGRAM_LINK_TTL_SECONDS,
        "bot_link": f"https://t.me/{TELEGRAM_BOT_USERNAME}?start={code}",
    }

@app.post("/api/telegram/test")
def send_telegram_test(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    subscription = get_telegram_subscription(db, current_user.username)
    if not subscription:
        raise HTTPException(status_code=409, detail="Telegram is not linked")

    now_ts = int(time.time())
    if subscription.last_test_at and now_ts - subscription.last_test_at < TELEGRAM_TEST_COOLDOWN_SECONDS:
        raise HTTPException(status_code=429, detail="Please wait before sending another test")
    messages = {
        "ru": "AIRDROP-X: Telegram подключён. Вы будете получать только выбранные вами уведомления.",
        "en": "AIRDROP-X: Telegram connection is active. You will only receive notifications that you enabled.",
        "zh": "AIRDROP-X：Telegram 已连接。您只会收到自己启用的通知。",
    }
    if not send_telegram_notification(subscription.chat_id, messages[normalize_language(subscription.language)]):
        raise HTTPException(status_code=502, detail="Telegram message could not be delivered")
    subscription.last_test_at = now_ts
    subscription.updated_at = now_ts
    db.commit()
    return {"status": "success"}

@app.get("/api/gas/{network}")
async def get_network_gas(network: str):
    now_ts = int(time.time())
    cached = gas_cache.get(network)
    if cached and now_ts - cached["updated_at"] < 20:
        return {"status": "success", "network": network, **cached["data"], "cached": True}
    gas = get_live_gas_price(network)
    data = {
        "gas": gas,
        "gas_level": classify_gas_level(network, gas),
    }
    gas_cache[network] = {"updated_at": now_ts, "data": data}
    return {"status": "success", "network": network, **data, "cached": False}

@app.post("/api/payment/recover")
async def recover_payment_session(req: PaymentRecoverReq):
    raise HTTPException(status_code=410, detail="Payment recovery is disabled for security. Contact support with your transaction ID.")

@app.post("/api/send-code")
def api_send_code(data: EmailRequest):
    now_ts = int(time.time())
    existing = verification_codes.get(data.email)
    if existing and now_ts - existing.get("sent_at", 0) < EMAIL_CODE_RESEND_SECONDS:
        raise HTTPException(status_code=429, detail="Please wait before requesting another verification code")
    code = str(random.randint(100000, 999999))
    verification_codes[data.email] = {
        "code": code,
        "attempts": 0,
        "sent_at": now_ts,
        "expires_at": now_ts + EMAIL_CODE_TTL_SECONDS,
    }
    
    success = send_real_email(data.email, code)
    if not success:
        raise HTTPException(status_code=500, detail="SMTP Error. Check App Password in .env")
        
    return {"status": "success", "message": "Code sent successfully!"}  

@app.post("/api/payment/create-session")
async def create_payment_session(req: PaymentSessionCreateReq):
    base_amount = PLAN_PRICES.get(req.plan)
    if base_amount is None:
        raise HTTPException(status_code=400, detail="Unknown plan")
    
    unique_amount = round(base_amount + (ONBOARDING_PRICE if req.onboarding else 0) + 0.47, 2)
    
    payment_session_id = str(uuid.uuid4())
    payment_sessions[payment_session_id] = {
        "client_session_id": req.client_session_id,
        "plan": req.plan,
        "amount": unique_amount,
        "onboarding": req.onboarding,
        "status": "pending",
        "created_at": int(time.time()),
    }
    return {
        "status": "success",
        "payment_session_id": payment_session_id,
        "wallet": MASTER_WALLET_ADDRESS,
        "amount": unique_amount,
        "plan": req.plan,
        "onboarding": req.onboarding,
    }

@app.post("/api/payment/confirm")
async def confirm_payment_session(req: PaymentSessionConfirmReq, db: Session = Depends(get_db)):
    session_data = payment_sessions.get(req.payment_session_id)
    if not session_data:
        raise HTTPException(status_code=404, detail="Payment session not found")
    if session_data["client_session_id"] != req.client_session_id:
        raise HTTPException(status_code=403, detail="Payment confirmed for a different session")
    if int(time.time()) - session_data["created_at"] > PAYMENT_SESSION_TTL_SECONDS:
        raise HTTPException(status_code=410, detail="Payment session expired. Create a new payment session.")
    if session_data.get("status") == "paid":
        raise HTTPException(status_code=409, detail="Payment session has already been confirmed")

    reserve_verified_transaction(db, req.txid, session_data["amount"], "subscription_payment")
    session_data["status"] = "paid"
    session_data["txid"] = req.txid.strip()
    session_data["paid_at"] = int(time.time())
    
    payment_token = issue_payment_token(
        client_session_id=session_data["client_session_id"],
        plan=session_data["plan"],
        amount=session_data["amount"],
        onboarding=session_data.get("onboarding", False),
    )
    return {
        "status": "success",
        "payment_token": payment_token,
        "plan": session_data["plan"],
        "amount": session_data["amount"],
        "onboarding": session_data.get("onboarding", False),
    }

@app.post("/api/balance/deposit")
async def deposit_balance(req: DepositReq, current_user: User = Depends(get_current_user)):
    require_owned_username(req.username, current_user)
    raise HTTPException(
        status_code=503,
        detail="Balance deposits are disabled until a signed, chain-specific payment flow and price reconciliation are implemented.",
    )

@app.get("/api/balance/{username}")
async def get_balance(username: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    require_owned_username(username, current_user)
    user = db.query(User).filter(User.username == username).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
        
    txs = db.query(Transaction).filter(Transaction.username == username).order_by(Transaction.id.desc()).all()
    tx_list = [{"id": t.id, "type": t.tx_type, "amount": f"+${t.amount:.2f} USD" if t.tx_type=="deposit" else f"-${t.amount:.2f} USD", "date": t.date_str, "status": t.status} for t in txs]
    
    return {"status": "success", "balance": user.balance, "transactions": tx_list}

@app.post("/api/register")
async def register(user: UserRegister, db: Session = Depends(get_db)):
    payment_data = payment_tokens.get(user.payment_token)
    if not payment_data or payment_data.get("used"):
        raise HTTPException(status_code=403, detail="Payment not confirmed or token already used")
    if payment_data["client_session_id"] != user.client_session_id:
        raise HTTPException(status_code=403, detail="Payment confirmed for a different session")
    if payment_data["plan"] != user.plan:
        raise HTTPException(status_code=400, detail="Registration plan does not match the paid one")

    code_data = verification_codes.get(user.email)
    if not code_data:
        raise HTTPException(status_code=400, detail="Please request a verification code first!")
    if int(time.time()) > code_data.get("expires_at", 0):
        verification_codes.pop(user.email, None)
        raise HTTPException(status_code=400, detail="Verification code expired. Request a new code.")
        
    if code_data["attempts"] >= 3:
        verification_codes.pop(user.email, None)
        raise HTTPException(status_code=400, detail="Attempt limit exceeded (3/3). Request a new code.")

    if code_data["code"] != user.code:
        code_data["attempts"] += 1
        left_attempts = 3 - code_data["attempts"]
        raise HTTPException(status_code=400, detail=f"Invalid code! Attempts left: {left_attempts}")

    db_user = db.query(User).filter((User.username == user.username) | (User.email == user.email)).first()
    if db_user:
        if db_user.email == user.email:
            raise HTTPException(status_code=400, detail="An account with this email is already registered!")
        else:
            raise HTTPException(status_code=400, detail="A user with this username already exists!")
    
    if len(user.password.encode("utf-8")) > 72:
        raise HTTPException(status_code=400, detail="Password must be no more than 72 bytes")
    if len(user.password) < 12:
        raise HTTPException(status_code=400, detail="Password must be at least 12 characters")
    hashed_password = hash_password(user.password)

    new_user = User(
        username=user.username, 
        email=user.email,
        password_hash=hashed_password, 
        subscription_plan=user.plan,
        fingerprint=user.fingerprint,
        balance=0.0,
        subscription_activated_at=int(time.time()),
        onboarding_purchased=payment_data.get("onboarding", False)
    )
    db.add(new_user)
    db.commit()
    
    payment_data["used"] = True
    verification_codes.pop(user.email, None)
    
    try:
        send_payment_receipt_email(user.email, user.plan, payment_data["amount"], "Base Blockchain Gateway")
    except Exception as e:
        print(f"[Warning] Failed to send email: {e}")

    return {"status": "success", "message": "Registered successfully", "onboarding": payment_data.get("onboarding", False)}

@app.post("/api/login")
async def login(user: UserLogin, db: Session = Depends(get_db)):
    db_user = db.query(User).filter((User.username == user.username) | (User.email == user.username)).first()
    
    if not db_user or not verify_password(user.password, db_user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid login or password")

    now_ts = int(time.time())
    if is_legacy_password_hash(db_user.password_hash):
        db_user.password_hash = hash_password(user.password)
    if not db_user.subscription_activated_at:
        db_user.subscription_activated_at = now_ts
    db.commit()

    expires_at = db_user.subscription_activated_at + SUBSCRIPTION_DURATION_SECONDS
    days_left = max(0, int((expires_at - now_ts) / (24 * 60 * 60)))

    return {
        "status": "success",
        "message": "Logged in",
        "username": db_user.username,
        "plan": db_user.subscription_plan,
        "extra_slots": db_user.extra_slots,
        "balance": db_user.balance,
        "days_left": days_left,
        "renewal_price": PLAN_PRICES.get(db_user.subscription_plan, PLAN_PRICES["Standard"]),
        "onboarding_purchased": db_user.onboarding_purchased,
        "access_token": issue_access_token(db_user.username, db),
        "token_type": "Bearer",
        "expires_in": AUTH_SESSION_DURATION_SECONDS,
    }
    
@app.post("/api/wallets/add")
async def add_wallet(wallet: WalletAdd, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    require_owned_username(wallet.username, current_user)
    user = current_user
    wallet_address = wallet.wallet_address.strip()
    wallet_label = (wallet.label or "").strip()
    if len(wallet_label) > 40 or any(ord(char) < 32 for char in wallet_label):
        raise HTTPException(status_code=400, detail="Wallet label is invalid")
    if not (wallet_address.startswith("0x") and len(wallet_address) == 42 and all(char in "0123456789abcdefABCDEF" for char in wallet_address[2:])):
        raise HTTPException(status_code=400, detail="Enter a valid EVM wallet address")
    if db.query(Wallet).filter(Wallet.username == wallet.username, Wallet.wallet_address.ilike(wallet_address)).first():
        raise HTTPException(status_code=400, detail="This wallet has already been added")
    plan = user.subscription_plan
    extra = user.extra_slots
    
    current_count = db.query(Wallet).filter(Wallet.username == wallet.username).count()
    max_allowed = BASE_SLOT_LIMITS.get(plan, 5) + extra
    
    if current_count >= max_allowed:
        raise HTTPException(status_code=400, detail=f"⚠️ Plan limit reached: {max_allowed} slots allowed for {plan}")

    new_wallet = Wallet(username=wallet.username, wallet_address=wallet_address, encrypted_pk=None, label=wallet_label or None, proxy=wallet.proxy)
    db.add(new_wallet)
    db.commit()
    return {"status": "success", "message": "Wallet added"}

@app.post("/api/wallets/buy-slot")
async def buy_extra_slot(req: BuyExtraSlotReq, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    require_owned_username(req.username, current_user)
    user = current_user
    if user.balance < 10.0:
        raise HTTPException(status_code=400, detail="Insufficient balance ($10 required)")
        
    user.balance -= 10.0
    user.extra_slots += 1
    
    date_str = datetime.datetime.now().strftime("%Y-%m-%d %H:%M")
    new_tx = Transaction(username=req.username, tx_type="slot_purchase", amount=10.0, date_str=date_str, status="Success")
    db.add(new_tx)
    db.commit()
    
    return {"status": "success", "message": f"Slot purchased! Total slots: {user.extra_slots}", "balance": user.balance}

@app.get("/api/wallets/{username}")
async def get_wallets(username: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    require_owned_username(username, current_user)
    wallets = db.query(Wallet).filter(Wallet.username == username).all()
    user = db.query(User).filter(User.username == username).first()
    plan = user.subscription_plan if user else "Standard"
    extra = user.extra_slots if user else 0
    max_allowed = BASE_SLOT_LIMITS.get(plan, 5) + extra
    
    return {
        "status": "success", 
        "plan": plan,
        "max_slots": max_allowed,
        "wallets": [{"id": w.id, "wallet_address": w.wallet_address, "label": w.label, "proxy": w.proxy} for w in wallets]
    }

@app.post("/api/wallets/test-proxy/{wallet_id}")
async def test_wallet_proxy(wallet_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    wallet = db.query(Wallet).filter(Wallet.id == wallet_id, Wallet.username == current_user.username).first()
    if not wallet or not wallet.proxy:
        raise HTTPException(status_code=404, detail="Wallet or proxy not found")
    
    proxy_raw = wallet.proxy.strip()
    
    if "://" not in proxy_raw:
        parts = proxy_raw.rsplit(':', 3)
        if len(parts) == 4:
            ip, port, user, pwd = parts
            if ":" in ip and not ip.startswith("["):
                ip = f"[{ip}]"
            proxy_url = f"socks5://{user}:{pwd}@{ip}:{port}" 
        else:
            proxy_url = proxy_raw
    else:
        proxy_url = proxy_raw
        
    proxies = {"http": proxy_url, "https": proxy_url}
    start_time = time.time()
    try:
        resp = requests.get("https://api.ipify.org?format=json", proxies=proxies, timeout=6)
        ping_ms = int((time.time() - start_time) * 1000)
        if resp.status_code == 200:
            external_ip = resp.json().get("ip", "Unknown")
            return {"status": "success", "message": f"Proxy is working! Ping: {ping_ms}ms (IP: {external_ip})"}
        else:
            return {"status": "error", "message": "Proxy responded with an error"}
    except Exception as e:
        return {"status": "error", "message": f"Connection error: {str(e)}"}

@app.delete("/api/wallets/delete/{wallet_id}")
async def delete_wallet(wallet_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    wallet = db.query(Wallet).filter(Wallet.id == wallet_id, Wallet.username == current_user.username).first()
    if not wallet:
        raise HTTPException(status_code=404, detail="Wallet not found")
    db.delete(wallet)
    db.commit()
    return {"status": "success", "message": "Wallet deleted"}

@app.get("/api/budget-plan")
async def get_budget_plan(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    plan = db.query(BudgetPlan).filter(BudgetPlan.username == current_user.username).first()
    if not plan:
        return {
            "status": "success",
            "plan": {
                "network": "Base",
                "planned_operations": 1,
                "max_cost_per_operation": 1.0,
                "extra_cost_reserve": 0.0,
                "daily_cap": 10.0,
                "monthly_cap": 50.0,
            },
        }
    return {
        "status": "success",
        "plan": {
            "network": plan.network,
            "planned_operations": plan.planned_operations,
            "max_cost_per_operation": plan.max_cost_per_operation,
            "extra_cost_reserve": plan.extra_cost_reserve,
            "daily_cap": plan.daily_cap,
            "monthly_cap": plan.monthly_cap,
        },
    }

@app.post("/api/budget-plan")
async def save_budget_plan(
    payload: BudgetPlanRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    supported_networks = {"Ethereum", "Base", "Arbitrum", "ZkSync", "Scroll", "Linea", "Solana", "BNB Chain", "Polygon", "Optimism", "Tron"}
    if payload.network not in supported_networks:
        raise HTTPException(status_code=400, detail="Unsupported network")
    if not 1 <= payload.planned_operations <= 1000:
        raise HTTPException(status_code=400, detail="Planned operations must be between 1 and 1000")
    values = [payload.max_cost_per_operation, payload.extra_cost_reserve, payload.daily_cap, payload.monthly_cap]
    if any(value < 0 or value > 100000 for value in values):
        raise HTTPException(status_code=400, detail="Budget values are outside the permitted range")
    planned_total = round(payload.planned_operations * payload.max_cost_per_operation + payload.extra_cost_reserve, 2)
    if payload.max_cost_per_operation > payload.daily_cap or payload.daily_cap > payload.monthly_cap:
        raise HTTPException(status_code=400, detail="Budget caps are inconsistent")
    if planned_total > payload.monthly_cap:
        raise HTTPException(status_code=400, detail="Planned cost exceeds the monthly cap")

    plan = db.query(BudgetPlan).filter(BudgetPlan.username == current_user.username).first()
    if not plan:
        plan = BudgetPlan(username=current_user.username, updated_at=int(time.time()))
        db.add(plan)
    plan.network = payload.network
    plan.planned_operations = payload.planned_operations
    plan.max_cost_per_operation = payload.max_cost_per_operation
    plan.extra_cost_reserve = payload.extra_cost_reserve
    plan.daily_cap = payload.daily_cap
    plan.monthly_cap = payload.monthly_cap
    plan.updated_at = int(time.time())
    db.commit()
    return {"status": "success", "planned_total": planned_total, "message": "Budget plan saved"}

@app.post("/api/start")
async def start_farming(req: StartFarmReq, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    require_owned_username(req.username, current_user)
    raise HTTPException(
        status_code=503,
        detail="Automated signing is disabled until non-custodial wallet signing is implemented.",
    )
    user = current_user
    if user and user.balance < 1.50:
        raise HTTPException(status_code=400, detail="Insufficient funds for gas ($1.50 required)")
        
    if user:
        user.balance -= 1.50
        date_str = datetime.datetime.now().strftime("%Y-%m-%d %H:%M")
        new_tx = Transaction(username=req.username, tx_type="gas_fee", amount=1.50, date_str=date_str, status="Success")
        db.add(new_tx)
        db.commit()

    wallets = db.query(Wallet).filter(Wallet.username == req.username).all()
    wallets_data = [{"id": w.id, "encrypted_pk": w.encrypted_pk, "proxy": w.proxy} for w in wallets]
    
    settings = USER_SETTINGS_DB.get(req.username, {})
    chat_id = settings.get("telegram")
    notify_start = settings.get("notifyStart", True)
    notify_success = settings.get("notifySuccess", True)

    telegram_sent = False
    if chat_id and notify_start:
        send_telegram_notification(chat_id, f"⚡ **Manual farm started**\n• Network: `{req.network}`\n• Status: Running...")

    results = await run_real_farm(wallets_data, [], "master_password", target_network=req.network)
    
    if chat_id and notify_success:
        telegram_sent = send_telegram_notification(chat_id, f"✅ **Farming session completed!**\n• Network: `{req.network}`\n• Workers processed: `{len(wallets_data)}`")

    return {
        "status": "success", 
        "message": "Farming session completed!", 
        "results": results, 
        "new_balance": user.balance if user else 0,
        "telegram_sent": telegram_sent,
        "chat_id_configured": bool(chat_id)
    }

@app.post("/api/scan/{username}")
async def scan_wallets(username: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    require_owned_username(username, current_user)
    user = current_user
    wallets = db.query(Wallet).filter(Wallet.username == username).all()
    
    valid_wallets = [w for w in wallets if w.wallet_address.startswith("0x") and len(w.wallet_address) == 42]
    
    return {
        "status": "success",
        "data": {
            "total_wallets_scanned": len(wallets),
            "valid_wallets_checked": len(valid_wallets),
            "found_drops": [],
            "notice": "Eligibility scanning is not available until verified protocol integrations are implemented.",
        }
    }

@app.get("/api/stats")
def get_platform_stats(db: Session = Depends(get_db)):
    total_users = db.query(User).count()
    return {
        "current_slots": min(total_users, 300),
        "max_slots": 300,
        "is_sold_out": total_users >= 300
    }

app.mount("/", StaticFiles(directory=".", html=True), name="static")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("server:app", host="127.0.0.1", port=8000, reload=True)
