import hashlib
import os
from sqlalchemy import create_engine, Column, Integer, String, Boolean
from sqlalchemy.orm import declarative_base, sessionmaker

# 1. Настройка подключения к SQLite
SQLALCHEMY_DATABASE_URL = "sqlite:///./airdrop_x.db"

engine = create_engine(
    SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False}
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

# 2. Надежное хеширование через встроенный hashlib (без ошибок passlib/bcrypt)
def get_password_hash(password: str) -> str:
    # Генерируем случайную соль
    salt = os.urandom(16).hex()
    # Создаем хэш пароля с солью
    pwd_hash = hashlib.sha256((password + salt).encode('utf-8')).hexdigest()
    # Возвращаем связку соль$хэш, чтобы потом можно было проверить
    return f"{salt}${pwd_hash}"

def verify_password(plain_password: str, stored_password: str) -> bool:
    try:
        salt, pwd_hash = stored_password.split('$')
        check_hash = hashlib.sha256((plain_password + salt).encode('utf-8')).hexdigest()
        return check_hash == pwd_hash
    except Exception:
        return False

# 3. Создаем модель пользователя (Таблица в БД)
class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True)
    email = Column(String, unique=True, index=True)
    hashed_password = Column(String)
    is_active = Column(Boolean, default=True)
    subscription_tier = Column(String, default="PRO FARMER")

# 4. Создаем таблицы в базе при запуске
Base.metadata.create_all(bind=engine)

# 5. Функция для получения сессии БД
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()