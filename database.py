import hashlib
import os
from sqlalchemy import create_engine, Column, Integer, String, Boolean, ForeignKey
from sqlalchemy.orm import declarative_base, relationship, sessionmaker

# 1. Настройка подключения к SQLite
SQLALCHEMY_DATABASE_URL = "sqlite:///./airdrop_x.db"

engine = create_engine(
    SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False}
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

# 2. Хеширование паролей через hashlib
def get_password_hash(password: str) -> str:
    salt = os.urandom(16).hex()
    pwd_hash = hashlib.sha256((password + salt).encode('utf-8')).hexdigest()
    return f"{salt}${pwd_hash}"

def verify_password(plain_password: str, stored_password: str) -> bool:
    try:
        salt, pwd_hash = stored_password.split('$')
        check_hash = hashlib.sha256((plain_password + salt).encode('utf-8')).hexdigest()
        return check_hash == pwd_hash
    except Exception:
        return False

# 3. Модель пользователя
class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True)
    email = Column(String, unique=True, index=True)
    hashed_password = Column(String)
    is_active = Column(Boolean, default=True)
    subscription_tier = Column(String, default="PRO FARMER")

    # Связь с кошельками пользователя
    wallets = relationship("Wallet", back_populates="owner", cascade="all, delete-orphan")

# 4. 🔥 НОВАЯ МОДЕЛЬ: Кошельки и прокси пользователей
class Wallet(Base):
    __tablename__ = "wallets"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    wallet_address = Column(String, index=True)  # Публичный адрес или метка
    encrypted_pk = Column(String)                # Зашифрованный приватный ключ
    proxy = Column(String)                       # Индивидуальный прокси (http/socks5)

    owner = relationship("User", back_populates="wallets")

# 5. Создаем таблицы в базе (если их еще нет)
Base.metadata.create_all(bind=engine)

# 6. Функция для получения сессии БД
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()