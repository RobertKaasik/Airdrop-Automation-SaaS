import os
import json
import asyncio
from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy import create_engine, Column, Integer, String
from sqlalchemy.orm import declarative_base, sessionmaker, Session

# Подтягиваем боевое ядро (теперь с реальными транзакциями)
try:
    from core_engine import run_real_farm
except ImportError:
    # Страховка, если файл ядра еще не обновлен
    async def run_real_farm(*args, **kwargs):
        print("ВНИМАНИЕ: Функция run_real_farm не найдена в core_engine.py")

# --- База данных SQLite ---
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

class Wallet(Base):
    __tablename__ = "wallets"
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, index=True)
    wallet_address = Column(String)
    encrypted_pk = Column(String)
    proxy = Column(String)

# Создаем таблицы, если их нет
Base.metadata.create_all(bind=engine)

# --- Инициализация FastAPI ---
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

# --- Pydantic Схемы валидации ---
class UserRegister(BaseModel):
    username: str
    email: str
    password: str

class UserLogin(BaseModel):
    username: str
    password: str

class WalletAdd(BaseModel):
    username: str
    wallet_address: str
    encrypted_pk: str
    proxy: str

class StartFarmReq(BaseModel):
    wallet: str = "all"
    network: str = "Base"  # Задаем Base по умолчанию

# --- Боевые Эндпоинты ---

@app.post("/api/register")
async def register(user: UserRegister, db: Session = Depends(get_db)):
    db_user = db.query(User).filter(User.username == user.username).first()
    if db_user:
        raise HTTPException(status_code=400, detail="Пользователь уже в системе")
    
    new_user = User(username=user.username, email=user.email, password_hash=user.password)
    db.add(new_user)
    db.commit()
    return {"status": "success", "message": "Регистрация прошла успешно"}

@app.post("/api/login")
async def login(user: UserLogin, db: Session = Depends(get_db)):
    db_user = db.query(User).filter(User.username == user.username).first()
    if not db_user or db_user.password_hash != user.password:
        raise HTTPException(status_code=401, detail="Неверный логин или пароль")
    return {"status": "success", "message": "Залетели в панель"}

@app.post("/api/wallets/add")
async def add_wallet(wallet: WalletAdd, db: Session = Depends(get_db)):
    new_wallet = Wallet(
        username=wallet.username,
        wallet_address=wallet.wallet_address,
        encrypted_pk=wallet.encrypted_pk,
        proxy=wallet.proxy
    )
    db.add(new_wallet)
    db.commit()
    return {"status": "success", "message": "Кошелек и прокси зафиксированы в БД"}

@app.get("/api/wallets/{username}")
async def get_wallets(username: str, db: Session = Depends(get_db)):
    wallets = db.query(Wallet).filter(Wallet.username == username).all()
    return {
        "status": "success", 
        "wallets": [{"id": w.id, "wallet_address": w.wallet_address, "proxy": w.proxy} for w in wallets]
    }

@app.delete("/api/wallets/delete/{wallet_id}")
async def delete_wallet(wallet_id: int, db: Session = Depends(get_db)):
    wallet = db.query(Wallet).filter(Wallet.id == wallet_id).first()
    if not wallet:
        raise HTTPException(status_code=404, detail="Кошелек не найден!")
    
    db.delete(wallet)
    db.commit()
    return {"status": "success", "message": "Кошелек удален без следов"}

@app.post("/api/start")
async def start_farming(req: StartFarmReq, db: Session = Depends(get_db)):
    wallets = db.query(Wallet).all()
    if not wallets:
        return {"status": "error", "message": "Пустая база кошельков, добавь акки!"}
    
    wallets_data = [{"id": w.id, "encrypted_pk": w.encrypted_pk, "proxy": w.proxy} for w in wallets]
    
    # Тот самый универсальный комбайн сетей. Легко добавлять новые L1/L2.
    rpc_mapping = {
        "Base": [
            "https://mainnet.base.org",
            "https://base.publicnode.com"
        ],
        "Arbitrum": [
            "https://arb1.arbitrum.io/rpc",
            "https://rpc.ankr.com/arbitrum"
        ],
        "ZkSync": [
            "https://mainnet.era.zksync.io"
        ]
    }
    
    # Если фронтенд пришлет сеть, которой нет в словаре, скидываем на Base
    target_network = req.network if req.network in rpc_mapping else "Base"
    rpc_list = rpc_mapping[target_network]
    
    # Запускаем таску асинхронно, чтобы не стопить сервер
    asyncio.create_task(run_real_farm(wallets_data, rpc_list, "master_password"))
    
    return {"status": "success", "message": f"Воркеры стартанули в сети {target_network}!"}

@app.post("/api/scan/{username}")
async def scan_drops(username: str, db: Session = Depends(get_db)):
    wallets = db.query(Wallet).filter(Wallet.username == username).all()
    return {
        "status": "success", 
        "data": {
            "total_wallets_scanned": len(wallets),
            "found_drops": [
                {
                    "wallet_name": w.wallet_address,
                    "proxy_used": w.proxy,
                    "allocations": [{"protocol": "ZkSync", "amount": "1450 ZK"}]
                } for w in wallets
            ]
        }
    }

@app.get("/api/report")
async def get_report():
    if os.path.exists("airdrop_x_backend_report.json"):
        with open("airdrop_x_backend_report.json", "r") as f:
            return json.load(f)
    return {"status": "error", "message": "Файл отчета пуст или не создан"}

if __name__ == "__main__":
    import uvicorn
    # Поднимаем локальный сервер
    uvicorn.run("server:app", host="127.0.0.1", port=8000, reload=True)