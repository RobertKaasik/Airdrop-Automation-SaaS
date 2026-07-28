import os
import json
import subprocess
from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session
from airdrop_scanner import AirdropScanner


# Импортируем нашу базу данных, модели и функции из database.py
from database import SessionLocal, User, Wallet, get_password_hash, verify_password, get_db

app = FastAPI(title="AIRDROP-X Backend with DB")

# Настройка CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Pydantic схемы для валидации входящих данных от фронтенда
class UserCreate(BaseModel):
    username: str
    email: str
    password: str

class UserLogin(BaseModel):
    username: str
    password: str

class FarmRequest(BaseModel):
    wallet: str = "all"

class WalletCreate(BaseModel):
    username: str
    wallet_address: str
    encrypted_pk: str
    proxy: str


# 1. Отдаем наш интерфейс (index.html)
@app.get("/")
async def get_index():
    if os.path.exists('index.html'):
        return FileResponse('index.html')
    return JSONResponse(status_code=404, content={"message": "Файл index.html не найден!"})


# 2. API Регистрации нового пользователя в SQLite
@app.post("/api/register")
async def register_user(user_data: UserCreate, db: Session = Depends(get_db)):
    # Простейшая валидация почты на бэкенде
    if "@" not in user_data.email or "." not in user_data.email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Некорректный формат электронной почты!"
        )
        
    existing_user = db.query(User).filter((User.username == user_data.username) | (User.email == user_data.email)).first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Пользователь с таким именем или почтой уже существует!"
        )
    
    hashed_password = get_password_hash(user_data.password)
    
    new_user = User(
        username=user_data.username,
        email=user_data.email,
        hashed_password=hashed_password,
        subscription_tier="PRO FARMER"
    )
    
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    
    return {"status": "success", "message": f"Аккаунт {new_user.username} успешно создан!"}

# 3. API Авторизации (проверка логина и пароля из базы)
@app.post("/api/login")
async def login_user(user_data: UserLogin, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == user_data.username).first()
    
    if not user or not verify_password(user_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Неверный логин или пароль!"
        )
        
    return {
        "status": "success", 
        "message": "Успешный вход!",
        "user": {
            "username": user.username,
            "email": user.email,
            "tier": user.subscription_tier
        }
    }


# 4. API Добавления кошелька в базу данных
@app.post("/api/wallets/add")
async def add_wallet(data: WalletCreate, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == data.username).first()
    if not user:
        raise HTTPException(status_code=404, detail="Пользователь не найден!")
    
    new_wallet = Wallet(
        user_id=user.id,
        wallet_address=data.wallet_address,
        encrypted_pk=data.encrypted_pk,
        proxy=data.proxy
    )
    
    db.add(new_wallet)
    db.commit()
    db.refresh(new_wallet)
    
    return {"status": "success", "message": f"Кошелек {data.wallet_address} успешно добавлен в базу!"}


# 5. API Получения списка кошельков пользователя
@app.get("/api/wallets/{username}")
async def get_user_wallets(username: str, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == username).first()
    if not user:
        raise HTTPException(status_code=404, detail="Пользователь не найден!")
    
    wallets_list = []
    for w in user.wallets:
        wallets_list.append({
            "id": w.id,
            "wallet_address": w.wallet_address,
            "proxy": w.proxy
        })
        
    return {"status": "success", "wallets": wallets_list}


scanner_module = AirdropScanner()

# API для реального сканирования кошельков из базы
@app.post("/api/scan/{username}")
async def trigger_wallet_scan(username: str):
    try:
        result = scanner_module.scan_allocations(username)
        return {"status": "success", "data": result}
    except Exception as e:
        return JSONResponse(status_code=500, content={"status": "error", "message": str(e)})

# 6. Запуск боевого ядра core_engine.py с реальными кошельками из БД
@app.post("/api/start")
async def start_farm_core(data: FarmRequest = None, db: Session = Depends(get_db)):
    print("\n[+] Получен запрос от панели на запуск фермы через БД-сессию!")
    try:
        # Находим кошельки (для примера берем все или по текущему пользователю)
        wallets_query = db.query(Wallet).all()
        if not wallets_query:
            return JSONResponse(status_code=400, content={"status": "error", "message": "Нет доступных кошельков в базе данных!"})
        
        # Формируем чистый список для ядра
        active_wallets = []
        for w in wallets_query:
            # Убираем возможный мусор/форматирование из строки прокси
            clean_proxy = w.proxy.split(']')[0].replace('[', '') if '[' in w.proxy else w.proxy
            
            active_wallets.append({
                "id": w.id,
                "encrypted_pk": w.encrypted_pk,
                "proxy": clean_proxy
            })
            
        # Сохраняем во временный конфиг, который ядро может прочитать
        with open("active_farm_config.json", "w", encoding="utf-8") as f:
            json.dump(active_wallets, f, indent=4)

        # Запускаем ядро
        subprocess.Popen(["python", "core_engine.py"])
        return {"status": "success", "message": f"🔥 Ядро запущенно! В работу взято кошельков: {len(active_wallets)}."}
    except Exception as e:
        return JSONResponse(status_code=500, content={"status": "error", "message": f"Ошибка: {str(e)}"})

# 7. Получение отчета JSON
@app.get("/api/report")
async def get_report():
    report_file = "airdrop_x_backend_report.json"
    if os.path.exists(report_file):
        try:
            with open(report_file, "r", encoding="utf-8") as f:
                data = json.load(f)
            return data
        except Exception as e:
            return JSONResponse(status_code=500, content={"status": "error", "message": str(e)})
    else:
        return {"status": "pending", "message": "Ожидание первого запуска..."}


if __name__ == "__main__":
    import uvicorn
    print("🚀 FastAPI сервер с поддержкой базы данных запущен!")
    print("👉 Открой панель управления в браузере: http://127.0.0.1:8000")
    uvicorn.run(app, host="127.0.0.1", port=8000)