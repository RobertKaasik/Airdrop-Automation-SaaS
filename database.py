import bcrypt
from sqlalchemy import create_engine, Column, Integer, String, Boolean, ForeignKey
from sqlalchemy.orm import declarative_base, relationship, sessionmaker

# 1. Настройка подключения к SQLite
SQLALCHEMY_DATABASE_URL = "sqlite:///./airdrop_x.db"

engine = create_engine(
    SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False}
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

# 2. Legacy compatibility helpers. The running app authenticates in server.py.
# These helpers use bcrypt as well, so this file cannot introduce weaker hashes.
def get_password_hash(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt(rounds=12)).decode("utf-8")

def verify_password(plain_password: str, stored_password: str) -> bool:
    try:
        return bcrypt.checkpw(plain_password.encode("utf-8"), stored_password.encode("utf-8"))
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

# 4. Legacy read-only wallet model. The production model is declared in server.py.
class Wallet(Base):
    __tablename__ = "wallets"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    wallet_address = Column(String, index=True)  # Публичный адрес или метка
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
