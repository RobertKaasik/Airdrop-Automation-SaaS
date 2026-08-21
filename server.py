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
import ipaddress
import hashlib
import hmac
import bcrypt
import re
import math
from core.database import Base, SessionLocal, engine, init_db
from core.models import FinancialTransferIntent, ProfileRun, UserProfile
from core.browser_profile_manager import (
    BrowserProfileManager,
    ProfileBusyError,
    ProfileConfigurationError,
)
from decimal import Decimal
from email.message import EmailMessage
from pathlib import Path
from urllib.parse import urlparse
from dotenv import load_dotenv

# Securely load environment variables from .env
BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")

browser_manager = BrowserProfileManager(
    base_profiles_path=str(BASE_DIR / "browser_profiles")
)

SMTP_SERVER = "smtp.gmail.com"
SMTP_PORT = 465
SENDER_EMAIL = "airdrop.x.support@gmail.com"
SENDER_PASSWORD = os.getenv("SMTP_PASSWORD")
TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")
TELEGRAM_BOT_USERNAME = os.getenv("TELEGRAM_BOT_USERNAME", "").strip().lstrip("@")
WALLETCONNECT_PROJECT_ID = os.getenv("WALLETCONNECT_PROJECT_ID", "").strip()
UNISWAP_API_KEY = os.getenv("UNISWAP_API_KEY", "").strip()
LIFI_API_KEY = os.getenv("LIFI_API_KEY", "").strip()
SUBSCRIPTION_PAYMENTS_ENABLED = os.getenv("SUBSCRIPTION_PAYMENTS_ENABLED", "false").strip().lower() == "true"
ADMIN_USERNAMES = {
    username.strip()
    for username in os.getenv("AIRDROP_ADMIN_USERNAMES", "").split(",")
    if username.strip()
}

MASTER_WALLET_ADDRESS = "0x5e5316Dea1c44d220d4c60A5fcC2949E5A06Fc66"
BASE_RPC_URL = "https://mainnet.base.org"
BASE_SEPOLIA_RPC_URL = "https://sepolia.base.org"
BASE_USDC_MAINNET_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"
BASE_USDC_SEPOLIA_ADDRESS = "0x036CbD53842c5426634e7929541eC2318f3dCF7e"
SUBSCRIPTION_PAYMENT_MODE = os.getenv("SUBSCRIPTION_PAYMENT_MODE", "testnet").strip().lower()
SUBSCRIPTION_PAYMENT_RECEIVER = os.getenv(
    "SUBSCRIPTION_PAYMENT_RECEIVER", MASTER_WALLET_ADDRESS
).strip()
# Testnet payments follow the exact same USDC verification path as production,
# but use a faucet-friendly amount. This value is never used on Base mainnet.
SUBSCRIPTION_TEST_AMOUNT_USDC = Decimal("1.00")

DEFAULT_OFFICIAL_OPPORTUNITY_SOURCES = [
    {
        "source_key": "base",
        "name": "Base",
        "network": "Base",
        "official_url": "https://www.base.org/",
        "status": "official_updates",
        "summary_ru": "Следите за новостями и объявлениями Base на официальном сайте. Сейчас AIRDROP-X не заявляет о подтверждённом аирдропе.",
        "summary_en": "Follow Base news and announcements on the official website. AIRDROP-X does not claim a confirmed airdrop at this time.",
        "summary_zh": "请在 Base 官方网站关注新闻和公告。AIRDROP-X 目前不声称存在已确认的空投。",
    },
    {
        "source_key": "arbitrum",
        "name": "Arbitrum",
        "network": "Arbitrum",
        "official_url": "https://arbitrum.io/",
        "status": "official_updates",
        "summary_ru": "Официальный сайт Arbitrum. Следите за новостями и объявлениями проекта только через его официальные каналы.",
        "summary_en": "Official Arbitrum website. Follow project news and announcements only through its official channels.",
        "summary_zh": "Arbitrum 官方网站。请仅通过项目官方渠道关注新闻和公告。",
    },
    {
        "source_key": "optimism",
        "name": "Optimism",
        "network": "Optimism",
        "official_url": "https://optimism.io/",
        "status": "official_updates",
        "summary_ru": "Официальный сайт Optimism. Страница не означает наличие активного аирдропа или права на получение токенов.",
        "summary_en": "Official Optimism website. This page does not mean an active airdrop or token eligibility exists.",
        "summary_zh": "Optimism 官方网站。此页面不表示存在活跃空投或代币领取资格。",
    },
    {
        "source_key": "zksync",
        "name": "ZKsync",
        "network": "ZKsync",
        "official_url": "https://www.zksync.io/",
        "status": "official_updates",
        "summary_ru": "Официальный сайт ZKsync для новостей и объявлений. Проверяйте условия распределений только в официальных сообщениях.",
        "summary_en": "Official ZKsync website for news and announcements. Verify distribution terms only in official communications.",
        "summary_zh": "ZKsync 官方新闻与公告网站。仅在官方公告中核实分发条件。",
    },
    {
        "source_key": "polygon",
        "name": "Polygon",
        "network": "Polygon",
        "official_url": "https://polygon.technology/",
        "status": "official_updates",
        "summary_ru": "Официальный сайт Polygon. Не вводите seed-фразу или приватный ключ на сторонних страницах.",
        "summary_en": "Official Polygon website. Never enter a seed phrase or private key on third-party pages.",
        "summary_zh": "Polygon 官方网站。切勿在第三方页面输入助记词或私钥。",
    },
    {
        "source_key": "bnb-chain",
        "name": "BNB Chain",
        "network": "BNB Chain",
        "official_url": "https://www.bnbchain.org/en",
        "status": "official_updates",
        "summary_ru": "Официальный сайт BNB Chain. Используйте его для проверки новостей и ссылок на официальные приложения.",
        "summary_en": "Official BNB Chain website. Use it to verify news and links to official applications.",
        "summary_zh": "BNB Chain 官方网站。请用它核实新闻和官方应用链接。",
    },
    {
        "source_key": "solana",
        "name": "Solana",
        "network": "Solana",
        "official_url": "https://solana.com/",
        "status": "official_updates",
        "summary_ru": "Официальный сайт Solana. Наличие источника не означает подтверждённый аирдроп.",
        "summary_en": "Official Solana website. A listed source does not mean an airdrop is confirmed.",
        "summary_zh": "Solana 官方网站。列出来源并不表示空投已确认。",
    },
]

from fastapi import FastAPI, APIRouter, Depends, HTTPException, Header, Request
from fastapi.responses import Response
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Any, Dict, List, Optional
from sqlalchemy import Column, Integer, String, Float, Boolean, text
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from web3 import Web3

# --- LOGGING AND SETTINGS ---
logging.getLogger('apscheduler.executors.default').setLevel(logging.WARNING)
logging.getLogger('apscheduler.scheduler').setLevel(logging.WARNING)

try:
    from core_engine import get_live_gas_price
except ImportError:
    def get_live_gas_price(network):
        return "N/A"
    
USER_SETTINGS_DB = {}
verification_codes = {}
SUBSCRIPTION_DURATION_SECONDS = 30 * 24 * 60 * 60
PLAN_PRICES = {"Standard": 29, "Pro": 49, "Premium": 89}
BASE_SLOT_LIMITS = {"Standard": 5, "Pro": 15, "Premium": 30}
request_rate_limits = {}
gas_cache = {}
wallet_health_cache = {}
network_balance_cache = {}
native_usd_price_cache = {}
transaction_status_cache = {}
defi_positions_cache = {}
aave_supply_quote_sessions = {}
aave_withdraw_quote_sessions = {}
WALLET_HEALTH_CACHE_TTL_SECONDS = 20
ETH_USD_PRICE_CACHE_TTL_SECONDS = 60
TRANSACTION_STATUS_CACHE_TTL_SECONDS = 20
DEFI_POSITIONS_CACHE_TTL_SECONDS = 30
AAVE_SUPPLY_QUOTE_TTL_SECONDS = 120
ASSET_DISPLAY_THRESHOLD_USD = 1.0
AUTH_SESSION_DURATION_SECONDS = 12 * 60 * 60
EMAIL_CODE_TTL_SECONDS = 10 * 60
EMAIL_CODE_RESEND_SECONDS = 60
PAYMENT_SESSION_TTL_SECONDS = 30 * 60
PAYMENT_TOKEN_TTL_SECONDS = 30 * 60
PAYMENT_REGISTRATION_RESUME_TTL_SECONDS = 7 * 24 * 60 * 60
PASSWORD_RESET_TTL_SECONDS = 10 * 60
PASSWORD_RESET_RESEND_SECONDS = 60
DEVICE_CHANGE_WINDOW_SECONDS = 30 * 24 * 60 * 60
MAX_DEVICE_CHANGES_PER_WINDOW = 1
TELEGRAM_LINK_TTL_SECONDS = 10 * 60
TELEGRAM_TEST_COOLDOWN_SECONDS = 60
BASE_CHAIN_ID = 8453
BASE_NATIVE_TOKEN_ADDRESS = "0x0000000000000000000000000000000000000000"
BASE_USDC_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"
BASE_USDC_DECIMALS = 6
AAVE_V3_BASE_POOL = "0xA238Dd80C259a72e81d7e4664a9801593F98d1c5"
ERC20_BALANCE_OF_ABI = [{
    "constant": True,
    "inputs": [{"name": "account", "type": "address"}],
    "name": "balanceOf",
    "outputs": [{"name": "", "type": "uint256"}],
    "stateMutability": "view",
    "type": "function",
}]
ERC20_ALLOWANCE_ABI = [{
    "constant": True,
    "inputs": [
        {"name": "owner", "type": "address"},
        {"name": "spender", "type": "address"},
    ],
    "name": "allowance",
    "outputs": [{"name": "", "type": "uint256"}],
    "stateMutability": "view",
    "type": "function",
}]

# Official Aave V3 Base address from the Aave DAO address book.  The provider
# is used only for eth_call reads of an already-public wallet address.
AAVE_V3_BASE_PROTOCOL_DATA_PROVIDER = "0x0F43731EB8d45A581f4a36DD74F5f358bc90C73A"
AAVE_V3_POOL_DATA_PROVIDER_ABI = [
    {
        "inputs": [],
        "name": "getAllReservesTokens",
        "outputs": [{
            "components": [
                {"name": "symbol", "type": "string"},
                {"name": "tokenAddress", "type": "address"},
            ],
            "name": "",
            "type": "tuple[]",
        }],
        "stateMutability": "view",
        "type": "function",
    },
    {
        "inputs": [{"name": "asset", "type": "address"}],
        "name": "getReserveConfigurationData",
        "outputs": [
            {"name": "decimals", "type": "uint256"},
            {"name": "ltv", "type": "uint256"},
            {"name": "liquidationThreshold", "type": "uint256"},
            {"name": "liquidationBonus", "type": "uint256"},
            {"name": "reserveFactor", "type": "uint256"},
            {"name": "usageAsCollateralEnabled", "type": "bool"},
            {"name": "borrowingEnabled", "type": "bool"},
            {"name": "stableBorrowRateEnabled", "type": "bool"},
            {"name": "isActive", "type": "bool"},
            {"name": "isFrozen", "type": "bool"},
        ],
        "stateMutability": "view",
        "type": "function",
    },
    {
        "inputs": [{"name": "asset", "type": "address"}],
        "name": "getPaused",
        "outputs": [{"name": "isPaused", "type": "bool"}],
        "stateMutability": "view",
        "type": "function",
    },
    {
        "inputs": [{"name": "asset", "type": "address"}],
        "name": "getReserveData",
        "outputs": [
            {"name": "unbacked", "type": "uint256"},
            {"name": "accruedToTreasuryScaled", "type": "uint256"},
            {"name": "totalAToken", "type": "uint256"},
            {"name": "totalStableDebt", "type": "uint256"},
            {"name": "totalVariableDebt", "type": "uint256"},
            {"name": "liquidityRate", "type": "uint256"},
            {"name": "variableBorrowRate", "type": "uint256"},
            {"name": "stableBorrowRate", "type": "uint256"},
            {"name": "averageStableBorrowRate", "type": "uint256"},
            {"name": "liquidityIndex", "type": "uint256"},
            {"name": "variableBorrowIndex", "type": "uint256"},
            {"name": "lastUpdateTimestamp", "type": "uint40"},
        ],
        "stateMutability": "view",
        "type": "function",
    },
    {
        "inputs": [
            {"name": "asset", "type": "address"},
            {"name": "user", "type": "address"},
        ],
        "name": "getUserReserveData",
        "outputs": [
            {"name": "currentATokenBalance", "type": "uint256"},
            {"name": "currentStableDebt", "type": "uint256"},
            {"name": "currentVariableDebt", "type": "uint256"},
            {"name": "principalStableDebt", "type": "uint256"},
            {"name": "scaledVariableDebt", "type": "uint256"},
            {"name": "stableBorrowRate", "type": "uint256"},
            {"name": "liquidityRate", "type": "uint256"},
            {"name": "stableRateLastUpdated", "type": "uint40"},
            {"name": "usageAsCollateralEnabled", "type": "bool"},
        ],
        "stateMutability": "view",
        "type": "function",
    },
]

# The universal bridge only supports EVM chains in this application.  Solana and
# Tron use different wallet providers and must not be presented as MetaMask
# routes.  Token data and transaction requests are obtained from LI.FI, while
# signatures are always requested locally from the user's connected wallet.
LIFI_API_URL = "https://li.quest/v1"
LIFI_CATALOG_CACHE_TTL_SECONDS = 5 * 60
LIFI_QUOTE_TTL_SECONDS = 55
LIFI_TOKEN_CATALOG_CACHE = {}
LIFI_EVM_NETWORKS = {
    "Ethereum": {"chain_id": 1, "native_symbol": "ETH", "rpc_url": "https://ethereum-rpc.publicnode.com"},
    "Base": {"chain_id": 8453, "native_symbol": "ETH", "rpc_url": BASE_RPC_URL},
    "Arbitrum": {"chain_id": 42161, "native_symbol": "ETH", "rpc_url": "https://arb1.arbitrum.io/rpc"},
    "Optimism": {"chain_id": 10, "native_symbol": "ETH", "rpc_url": "https://mainnet.optimism.io"},
    "Polygon": {"chain_id": 137, "native_symbol": "POL", "rpc_url": "https://polygon-bor-rpc.publicnode.com"},
    "Linea": {"chain_id": 59144, "native_symbol": "ETH", "rpc_url": "https://rpc.linea.build"},
    "BNB Chain": {"chain_id": 56, "native_symbol": "BNB", "rpc_url": "https://bsc-rpc.publicnode.com"},
}
LIFI_NATIVE_TOKEN_ADDRESS = "0x0000000000000000000000000000000000000000"

# Public, read-only RPCs used only to show an already public wallet balance.
# Transaction building and signing are deliberately not enabled for these routes.
PUBLIC_NETWORK_BALANCE_CONFIG = {
    "Base": {
        "rpc_url": BASE_RPC_URL,
        "native_symbol": "ETH",
        "usdc_address": BASE_USDC_ADDRESS,
        "usdc_decimals": 6,
        "gas_reserve": "0.0003",
    },
    "Arbitrum": {
        "rpc_url": "https://arb1.arbitrum.io/rpc",
        "native_symbol": "ETH",
        "usdc_address": "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
        "usdc_decimals": 6,
        "gas_reserve": "0.0003",
    },
    "Optimism": {
        "rpc_url": "https://mainnet.optimism.io",
        "native_symbol": "ETH",
        "usdc_address": "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85",
        "usdc_decimals": 6,
        "gas_reserve": "0.0003",
    },
    "Linea": {
        "rpc_url": "https://rpc.linea.build",
        "native_symbol": "ETH",
        "usdc_address": "0x176211869cA2b568f2A7D4EE941E073a821EE1ff",
        "usdc_decimals": 6,
        "gas_reserve": "0.0003",
    },
    "Ethereum": {
        "rpc_url": "https://ethereum-rpc.publicnode.com",
        "native_symbol": "ETH",
        "usdc_address": "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
        "usdc_decimals": 6,
        "gas_reserve": "0.0015",
    },
    "Polygon": {
        "rpc_url": "https://polygon-bor-rpc.publicnode.com",
        "native_symbol": "POL",
        "usdc_address": "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
        "usdc_decimals": 6,
        "gas_reserve": "0.5",
    },
    "BNB Chain": {
        "rpc_url": "https://bsc-rpc.publicnode.com",
        "native_symbol": "BNB",
        "gas_reserve": "0.003",
    },
}
UNISWAP_TRADE_API_URL = "https://trade-api.gateway.uniswap.org/v1"
SWAP_QUOTE_TTL_SECONDS = 45
swap_quote_sessions = {}
SWAP_SUBMISSION_TTL_SECONDS = 10 * 60
swap_submission_sessions = {}
BRIDGE_PLAN_DESTINATIONS = {"Ethereum", "Arbitrum", "Optimism", "Polygon", "Linea", "BNB Chain"}

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

class PaymentCheckoutSession(Base):
    """Short-lived checkout state, persisted so a local reload cannot lose it."""
    __tablename__ = "payment_checkout_sessions"
    id = Column(String, primary_key=True)
    client_session_id = Column(String, index=True, nullable=False)
    plan = Column(String, nullable=False)
    amount_usdc = Column(String, nullable=False)
    amount_atomic = Column(String, nullable=False)
    onboarding = Column(Boolean, nullable=False, default=False)
    payment_mode = Column(String, nullable=False)
    status = Column(String, nullable=False, default="pending")
    txid = Column(String, nullable=True)
    created_at = Column(Integer, nullable=False)
    paid_at = Column(Integer, nullable=True)

class PaymentAccessToken(Base):
    """Hashed, short-lived registration access issued after a verified payment."""
    __tablename__ = "payment_access_tokens"
    token_hash = Column(String, primary_key=True)
    checkout_session_id = Column(String, index=True, nullable=True)
    client_session_id = Column(String, index=True, nullable=False)
    plan = Column(String, nullable=False)
    amount = Column(String, nullable=False)
    onboarding = Column(Boolean, nullable=False, default=False)
    created_at = Column(Integer, nullable=False)
    expires_at = Column(Integer, nullable=False)
    used_at = Column(Integer, nullable=True)

class EmailVerificationCode(Base):
    """Registration code state survives a safe server restart."""
    __tablename__ = "email_verification_codes"
    email = Column(String, primary_key=True)
    code_hash = Column(String, nullable=False)
    attempts = Column(Integer, nullable=False, default=0)
    sent_at = Column(Integer, nullable=False)
    expires_at = Column(Integer, nullable=False)

class PasswordResetCode(Base):
    __tablename__ = "password_reset_codes"
    email = Column(String, primary_key=True)
    code_hash = Column(String, nullable=False)
    attempts = Column(Integer, nullable=False, default=0)
    sent_at = Column(Integer, nullable=False)
    expires_at = Column(Integer, nullable=False)

class UserDeviceAccess(Base):
    """One trusted browser/device per account with a deliberate monthly change limit."""
    __tablename__ = "user_device_access"
    username = Column(String, primary_key=True)
    device_hash = Column(String, nullable=False)
    window_started_at = Column(Integer, nullable=False)
    changes_in_window = Column(Integer, nullable=False, default=0)
    updated_at = Column(Integer, nullable=False)

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
    notify_transaction_submitted = Column(Boolean, nullable=False, default=False)
    notify_transaction_final = Column(Boolean, nullable=False, default=True)
    notify_reminders = Column(Boolean, nullable=False, default=True)
    notify_errors = Column(Boolean, nullable=False, default=True)
    notify_defi_supply_submitted = Column(Boolean, nullable=False, default=False)
    notify_defi_withdraw_submitted = Column(Boolean, nullable=False, default=False)
    notify_defi_final = Column(Boolean, nullable=False, default=False)
    notify_defi_errors = Column(Boolean, nullable=False, default=False)

class OfficialOpportunitySource(Base):
    __tablename__ = "official_opportunity_sources"
    id = Column(Integer, primary_key=True, index=True)
    source_key = Column(String, unique=True, index=True, nullable=False)
    name = Column(String, nullable=False)
    network = Column(String, nullable=False)
    official_url = Column(String, nullable=False)
    claim_url = Column(String, nullable=True)
    status = Column(String, nullable=False, default="official_updates")
    summary_ru = Column(String, nullable=False)
    summary_en = Column(String, nullable=False)
    summary_zh = Column(String, nullable=False)
    is_system = Column(Boolean, nullable=False, default=False)
    created_at = Column(Integer, nullable=False)
    updated_at = Column(Integer, nullable=False)

class WalletTransferTemplate(Base):
    __tablename__ = "wallet_transfer_templates"
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, index=True, nullable=False)
    name = Column(String, nullable=False)
    recipient_wallet_id = Column(Integer, nullable=False)
    recipient_address = Column(String, nullable=False)
    default_amount = Column(String, nullable=False)
    network = Column(String, nullable=False, default="Base")
    created_at = Column(Integer, nullable=False)
    updated_at = Column(Integer, nullable=False)

class WalletTransferRecord(Base):
    __tablename__ = "wallet_transfer_records"
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, index=True, nullable=False)
    template_id = Column(Integer, nullable=True)
    from_address = Column(String, nullable=False)
    to_address = Column(String, nullable=False)
    amount = Column(String, nullable=False)
    tx_hash = Column(String, unique=True, index=True, nullable=False)
    network = Column(String, nullable=False, default="Base")
    status = Column(String, nullable=False, default="submitted")
    created_at = Column(Integer, nullable=False)

class BaseSwapRecord(Base):
    __tablename__ = "base_swap_records"
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, index=True, nullable=False)
    wallet_address = Column(String, nullable=False)
    amount_in = Column(String, nullable=False)
    amount_out = Column(String, nullable=True)
    tx_hash = Column(String, unique=True, index=True, nullable=False)
    status = Column(String, nullable=False, default="submitted")
    created_at = Column(Integer, nullable=False)

class DefiOperationRecord(Base):
    """A public, wallet-confirmed Aave action recorded for the DeFi screen."""
    __tablename__ = "defi_operation_records"
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, index=True, nullable=False)
    wallet_address = Column(String, nullable=False)
    operation_type = Column(String, nullable=False)  # supply | withdraw
    protocol = Column(String, nullable=False, default="Aave V3")
    network = Column(String, nullable=False, default="Base")
    asset_symbol = Column(String, nullable=False, default="USDC")
    amount = Column(String, nullable=False)
    tx_hash = Column(String, unique=True, index=True, nullable=False)
    status = Column(String, nullable=False, default="submitted")
    created_at = Column(Integer, nullable=False)

class UniversalBridgeRecord(Base):
    __tablename__ = "universal_bridge_records"
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, index=True, nullable=False)
    wallet_address = Column(String, nullable=False)
    from_network = Column(String, nullable=False)
    to_network = Column(String, nullable=False)
    from_symbol = Column(String, nullable=False)
    to_symbol = Column(String, nullable=False)
    amount_in = Column(String, nullable=False)
    amount_out = Column(String, nullable=True)
    amount_out_min = Column(String, nullable=True)
    provider = Column(String, nullable=False, default="LI.FI")
    bridge = Column(String, nullable=True)
    tx_hash = Column(String, unique=True, index=True, nullable=False)
    status = Column(String, nullable=False, default="submitted")
    provider_status = Column(String, nullable=True)
    created_at = Column(Integer, nullable=False)
    updated_at = Column(Integer, nullable=False)

class ActionReminder(Base):
    __tablename__ = "action_reminders"
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True, nullable=False)
    network = Column(String, nullable=False, default="Base")
    day_of_week = Column(String, nullable=False, default="Mon")
    time_of_day = Column(String, nullable=False, default="18:00")
    enabled = Column(Boolean, nullable=False, default=False)
    telegram_enabled = Column(Boolean, nullable=False, default=True)
    last_sent_slot = Column(String, nullable=True)
    updated_at = Column(Integer, nullable=False)

class BridgePlan(Base):
    __tablename__ = "bridge_plans"
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, index=True, nullable=False)
    wallet_address = Column(String, nullable=False)
    from_network = Column(String, nullable=False, default="Base")
    to_network = Column(String, nullable=False)
    asset = Column(String, nullable=False, default="ETH")
    amount = Column(String, nullable=False)
    status = Column(String, nullable=False, default="planned")
    created_at = Column(Integer, nullable=False)

init_db()

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
        transfer_columns = {row[1] for row in conn.execute(text("PRAGMA table_info(wallet_transfer_records)"))}
        if transfer_columns and "status" not in transfer_columns:
            conn.execute(text("ALTER TABLE wallet_transfer_records ADD COLUMN status VARCHAR DEFAULT 'submitted'"))
            conn.commit()
        telegram_code_columns = {row[1] for row in conn.execute(text("PRAGMA table_info(telegram_link_codes)"))}
        if telegram_code_columns and "language" not in telegram_code_columns:
            conn.execute(text("ALTER TABLE telegram_link_codes ADD COLUMN language VARCHAR DEFAULT 'ru'"))
            conn.commit()
        telegram_subscription_columns = {row[1] for row in conn.execute(text("PRAGMA table_info(telegram_subscriptions)"))}
        if telegram_subscription_columns and "language" not in telegram_subscription_columns:
            conn.execute(text("ALTER TABLE telegram_subscriptions ADD COLUMN language VARCHAR DEFAULT 'ru'"))
            conn.commit()
        telegram_filter_columns = {
            "notify_transaction_submitted": "BOOLEAN DEFAULT 0",
            "notify_transaction_final": "BOOLEAN DEFAULT 1",
            "notify_reminders": "BOOLEAN DEFAULT 1",
            "notify_errors": "BOOLEAN DEFAULT 1",
            "notify_defi_supply_submitted": "BOOLEAN DEFAULT 0",
            "notify_defi_withdraw_submitted": "BOOLEAN DEFAULT 0",
            "notify_defi_final": "BOOLEAN DEFAULT 0",
            "notify_defi_errors": "BOOLEAN DEFAULT 0",
        }
        for column_name, column_type in telegram_filter_columns.items():
            if telegram_subscription_columns and column_name not in telegram_subscription_columns:
                conn.execute(text(f"ALTER TABLE telegram_subscriptions ADD COLUMN {column_name} {column_type}"))
                conn.commit()
        opportunity_columns = {row[1] for row in conn.execute(text("PRAGMA table_info(official_opportunity_sources)"))}
        if opportunity_columns and "claim_url" not in opportunity_columns:
            conn.execute(text("ALTER TABLE official_opportunity_sources ADD COLUMN claim_url VARCHAR"))
            conn.commit()

ensure_schema_columns()

def ensure_default_opportunity_sources() -> None:
    db = SessionLocal()
    try:
        now_ts = int(time.time())
        for source in DEFAULT_OFFICIAL_OPPORTUNITY_SOURCES:
            existing = db.query(OfficialOpportunitySource).filter(
                OfficialOpportunitySource.source_key == source["source_key"]
            ).first()
            if not existing:
                db.add(OfficialOpportunitySource(
                    **source,
                    is_system=True,
                    created_at=now_ts,
                    updated_at=now_ts,
                ))
        db.commit()
    finally:
        db.close()

ensure_default_opportunity_sources()

app = FastAPI(title="AIRDROP-X Backend API")

# Never expose the project directory itself: it contains server code, the local
# database, and environment files. The UI only needs this small allow-list.
PUBLIC_STATIC_PATHS = {
    "",
    "index.html",
    "app.js",
    "style.css",
    "autofarm.gif",
    "wallets.gif",
    "looter.gif",
    "support.gif",
    "demo-gas.gif",
    "demo-wallets.gif",
    "demo-checks.gif",
    "demo-telegram.gif",
    "demo-gas-ru.gif",
    "demo-wallets-ru.gif",
    "demo-checks-ru.gif",
    "demo-telegram-ru.gif",
    "demo-gas-en.gif",
    "demo-wallets-en.gif",
    "demo-checks-en.gif",
    "demo-telegram-en.gif",
    "demo-gas-zh.gif",
    "demo-wallets-zh.gif",
    "demo-checks-zh.gif",
    "demo-telegram-zh.gif",
    "ui-dist/react-ui.js",
    "ui-dist/react-ui.css",
    "favicon.svg",
    "locales/ru.js",
    "locales/en.js",
    "locales/zh.js",
}

class RestrictedStaticFiles(StaticFiles):
    async def get_response(self, path: str, scope):
        # Starlette resolves a mounted path with Windows separators when the
        # application runs locally on Windows.  Keep the allow-list in one
        # canonical (URL) format so nested public files such as locales/ru.js
        # are served, while every non-listed file remains unavailable.
        normalized_path = "" if path in {"", "."} else path.replace("\\", "/").lstrip("/")
        if normalized_path not in PUBLIC_STATIC_PATHS:
            return Response(status_code=404)
        return await super().get_response(normalized_path, scope)

allowed_origins = [
    origin.strip()
    for origin in os.getenv("APP_ALLOWED_ORIGINS", "http://127.0.0.1:8000,http://localhost:8000").split(",")
    if origin.strip()
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=False,
    allow_methods=["GET", "POST", "PATCH", "DELETE"],
    allow_headers=["Content-Type", "Authorization"],
)

@app.middleware("http")
async def add_security_headers(request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    # API responses can carry session-scoped state, account data, or payment
    # progress. Never let a browser or an intermediate proxy reuse them.
    if request.url.path.startswith("/api/"):
        response.headers.setdefault("Cache-Control", "no-store")
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

def get_native_usd_price(native_symbol: str) -> Optional[float]:
    """Fetch a native asset spot price for display filtering; no wallet data is sent."""
    price_ids = {
        "ETH": "ethereum",
        "BNB": "binancecoin",
        "POL": "polygon-ecosystem-token",
    }
    price_id = price_ids.get(native_symbol)
    if not price_id:
        return None
    now_ts = int(time.time())
    cached = native_usd_price_cache.get(price_id)
    if cached and cached["expires_at"] > now_ts:
        return cached["price"]
    try:
        response = requests.get(
            f"https://api.coingecko.com/api/v3/simple/price?ids={price_id}&vs_currencies=usd",
            timeout=5,
            headers={"Accept": "application/json"},
        )
        response.raise_for_status()
        price = float(response.json()[price_id]["usd"])
        if price <= 0:
            raise ValueError("native asset price must be positive")
    except Exception:
        price = None
    native_usd_price_cache[price_id] = {
        "price": price,
        "expires_at": now_ts + ETH_USD_PRICE_CACHE_TTL_SECONDS,
    }
    return price

def estimate_operation_value_usd(amount: str, symbol: str) -> Optional[float]:
    """Current display-only estimate used in the journal; it is not an execution price."""
    try:
        amount_value = float(amount)
    except (TypeError, ValueError):
        return None
    if not math.isfinite(amount_value) or amount_value < 0:
        return None
    if str(symbol).upper() in {"USDC", "USDT", "DAI"}:
        return round(amount_value, 2)
    price = get_native_usd_price(str(symbol).upper())
    return round(amount_value * price, 2) if price is not None else None

def get_displayable_wallet_assets(
    native_balance: str,
    native_symbol: str,
    usdc_balance: Optional[str],
    gas_reserve: str,
):
    """Only return known balances whose individual estimated value is at least $1."""
    visible_assets = []
    native_amount = float(native_balance)
    native_reserve = float(gas_reserve)
    native_price_usd = get_native_usd_price(native_symbol)
    if native_price_usd is not None:
        native_value_usd = native_amount * native_price_usd
        if native_value_usd >= ASSET_DISPLAY_THRESHOLD_USD:
            visible_assets.append({
                "symbol": native_symbol,
                "amount": native_balance,
                "available_to_send": format(max(native_amount - native_reserve, 0), ".6f").rstrip("0").rstrip(".") or "0",
                "gas_reserve": gas_reserve,
                "unit_price_usd": round(native_price_usd, 2),
                "estimated_usd": round(native_value_usd, 2),
            })
    if usdc_balance is not None and float(usdc_balance) >= ASSET_DISPLAY_THRESHOLD_USD:
        visible_assets.append({
            "symbol": "USDC",
            "amount": usdc_balance,
            "available_to_send": usdc_balance,
            "unit_price_usd": 1,
            "estimated_usd": round(float(usdc_balance), 2),
        })
    return visible_assets, native_price_usd is not None, native_reserve

# --- REAL BLOCKCHAIN TX VERIFICATION ---
def get_subscription_payment_config() -> Optional[dict]:
    """Return the one explicit USDC settlement route, or None when disabled."""
    if not SUBSCRIPTION_PAYMENTS_ENABLED:
        return None
    if not re.fullmatch(r"0x[0-9a-fA-F]{40}", SUBSCRIPTION_PAYMENT_RECEIVER):
        logging.error("Subscription payment receiver is not a valid EVM address")
        return None
    if SUBSCRIPTION_PAYMENT_MODE in {"testnet", "base-sepolia"}:
        return {
            "mode": "testnet",
            "is_testnet": True,
            "network": "Base Sepolia",
            "chain_id": 84532,
            "rpc_url": BASE_SEPOLIA_RPC_URL,
            "usdc_contract": BASE_USDC_SEPOLIA_ADDRESS,
            "receiver": Web3.to_checksum_address(SUBSCRIPTION_PAYMENT_RECEIVER),
        }
    if SUBSCRIPTION_PAYMENT_MODE in {"mainnet", "base-mainnet"}:
        return {
            "mode": "mainnet",
            "is_testnet": False,
            "network": "Base",
            "chain_id": 8453,
            "rpc_url": BASE_RPC_URL,
            "usdc_contract": BASE_USDC_MAINNET_ADDRESS,
            "receiver": Web3.to_checksum_address(SUBSCRIPTION_PAYMENT_RECEIVER),
        }
    logging.error("Unknown subscription payment mode: %s", SUBSCRIPTION_PAYMENT_MODE)
    return None

def decode_erc20_transfer_call(call_data: Any) -> Optional[tuple[str, int]]:
    """Decode exactly ERC-20 transfer(address,uint256), without ABI fallbacks."""
    if isinstance(call_data, (bytes, bytearray)):
        data = "0x" + bytes(call_data).hex()
    else:
        data = str(call_data or "")
    data = data.lower()
    if not re.fullmatch(r"0xa9059cbb[0-9a-f]{128}", data):
        return None
    payload = data[2:]
    recipient = "0x" + payload[8 + 24:8 + 64]
    amount_atomic = int(payload[8 + 64:8 + 128], 16)
    return recipient, amount_atomic


ERC20_TRANSFER_EVENT_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"


def normalize_hex_value(value: Any) -> str:
    """Convert JSON-RPC hex values and HexBytes values to lower-case 0x form."""
    if isinstance(value, (bytes, bytearray)):
        return "0x" + bytes(value).hex()
    try:
        hex_value = value.hex()
    except (AttributeError, TypeError):
        hex_value = str(value or "")
    hex_value = str(hex_value).lower()
    return hex_value if hex_value.startswith("0x") else "0x" + hex_value


def receipt_has_exact_usdc_transfer(
    receipt: Any,
    payment_config: dict,
    expected_atomic_amount: int,
) -> bool:
    """Match one exact official-USDC Transfer event in a successful receipt.

    Smart-account wallets can wrap an ERC-20 transfer inside a user operation,
    meaning the top-level transaction is sent to an account/entry-point contract
    instead of directly to USDC. The USDC Transfer event remains the canonical
    on-chain proof of the exact payment.
    """
    for log in receipt.get("logs", []):
        if normalize_hex_value(log.get("address")).lower() != payment_config["usdc_contract"].lower():
            continue
        topics = log.get("topics") or []
        if len(topics) != 3:
            continue
        normalized_topics = [normalize_hex_value(topic) for topic in topics]
        if normalized_topics[0] != ERC20_TRANSFER_EVENT_TOPIC:
            continue
        recipient = "0x" + normalized_topics[2][-40:]
        data = normalize_hex_value(log.get("data"))
        if not re.fullmatch(r"0x[0-9a-f]{64}", data):
            continue
        amount_atomic = int(data[2:], 16)
        if (
            recipient.lower() == payment_config["receiver"].lower()
            and amount_atomic == expected_atomic_amount
        ):
            return True
    return False


def get_usdc_payment_verification_state(txid: str, payment_config: dict, expected_atomic_amount: int) -> str:
    """Return confirmed, pending, or invalid for one exact USDC transfer."""
    try:
        clean_txid = txid.strip()
        if expected_atomic_amount <= 0 or not re.fullmatch(r"0x[0-9a-fA-F]{64}", clean_txid):
            return "invalid"

        w3 = Web3(Web3.HTTPProvider(payment_config["rpc_url"], request_kwargs={"timeout": 10}))
        if not w3.is_connected():
            return "pending"
        try:
            receipt = w3.eth.get_transaction_receipt(clean_txid)
        except Exception:
            # A wallet can return a hash before the node can see its receipt.
            return "pending"
        if not receipt or receipt.get("status") != 1:
            return "invalid"
        tx = w3.eth.get_transaction(clean_txid)
        if not tx:
            return "pending"

        if int(tx.get("chainId", 0)) != payment_config["chain_id"]:
            return "invalid"
        contract_address = tx.get("to")
        if contract_address and contract_address.lower() == payment_config["usdc_contract"].lower():
            # Standard EOA path: the outer transaction itself is USDC.transfer.
            decoded = decode_erc20_transfer_call(tx.get("input") or tx.get("data"))
            if not decoded:
                return "invalid"
            recipient, amount_atomic = decoded
            return "confirmed" if (
                recipient.lower() == payment_config["receiver"].lower()
                and amount_atomic == expected_atomic_amount
            ) else "invalid"

        # Smart-account path: trust only the exact official USDC Transfer event
        # emitted in this successful transaction receipt.
        return "confirmed" if receipt_has_exact_usdc_transfer(
            receipt, payment_config, expected_atomic_amount
        ) else "invalid"
    except Exception:
        return "pending"

def verify_usdc_payment_tx(txid: str, payment_config: dict, expected_atomic_amount: int) -> bool:
    return get_usdc_payment_verification_state(txid, payment_config, expected_atomic_amount) == "confirmed"

scheduler = AsyncIOScheduler()

async def run_scheduled_action_reminder_job():
    """Send an opt-in reminder only. This job never builds or signs a blockchain transaction."""
    now = datetime.datetime.now()
    current_day_map = {0: 'Mon', 1: 'Tue', 2: 'Wed', 3: 'Thu', 4: 'Fri', 5: 'Sat', 6: 'Sun'}
    current_day_str = current_day_map.get(now.weekday())
    current_time_str = now.strftime("%H:%M")
    current_slot = now.strftime("%Y-%m-%d %H:%M")
    db = SessionLocal()
    try:
        reminders = db.query(ActionReminder).filter(
            ActionReminder.enabled.is_(True),
            ActionReminder.day_of_week == current_day_str,
            ActionReminder.time_of_day == current_time_str,
        ).all()
        for reminder in reminders:
            if reminder.last_sent_slot == current_slot:
                continue
            subscription = get_telegram_subscription(db, reminder.username)
            if subscription and reminder.telegram_enabled and subscription.notify_reminders:
                messages = {
                    "ru": (
                        "🗓 *AIRDROP-X: напоминание о плане*\n"
                        f"Сеть: `{reminder.network}`\n"
                        "Откройте Центр действий, проверьте условия и подтвердите только нужное действие в кошельке."
                    ),
                    "en": (
                        "🗓 *AIRDROP-X: plan reminder*\n"
                        f"Network: `{reminder.network}`\n"
                        "Open the Action Center, review the terms, and approve only the action you choose in your wallet."
                    ),
                    "zh": (
                        "🗓 *AIRDROP-X：计划提醒*\n"
                        f"网络：`{reminder.network}`\n"
                        "请打开操作中心、检查条件，并且只在钱包中确认您自己选择的操作。"
                    ),
                }
                send_telegram_notification(
                    subscription.chat_id,
                    messages[normalize_language(subscription.language)],
                )
            reminder.last_sent_slot = current_slot
        db.commit()
    except Exception:
        db.rollback()
        logging.exception("Unable to process manual action reminders")
    finally:
        db.close()

def get_request_client_key(request: Request) -> str:
    """Return a rate-limit key without accepting spoofed client addresses.

    A reverse proxy is trusted only when an operator explicitly enables it in
    the deployment environment. This keeps local/ngrok development safe by
    default while allowing Render-style deployments to rate-limit per visitor.
    """
    if os.getenv("APP_TRUST_PROXY_HEADERS", "false").strip().lower() == "true":
        forwarded = request.headers.get("x-forwarded-for", "").split(",", 1)[0].strip()
        try:
            return str(ipaddress.ip_address(forwarded))
        except ValueError:
            pass
    return str(request.client.host if request.client else "unknown")[:80]

def enforce_request_rate_limit(scope: str, key: str, limit: int, window_seconds: int) -> None:
    """Small in-memory abuse guard for public endpoints; no personal data is logged."""
    now_ts = int(time.time())
    for bucket_key, bucket in list(request_rate_limits.items()):
        if bucket["reset_at"] <= now_ts:
            request_rate_limits.pop(bucket_key, None)
    bucket_key = f"{scope}:{key[:160]}"
    bucket = request_rate_limits.get(bucket_key)
    if not bucket or bucket["reset_at"] <= now_ts:
        request_rate_limits[bucket_key] = {"count": 1, "reset_at": now_ts + window_seconds}
        return
    if bucket["count"] >= limit:
        retry_after = max(1, bucket["reset_at"] - now_ts)
        raise HTTPException(
            status_code=429,
            detail="Too many requests. Please wait and try again",
            headers={"Retry-After": str(retry_after)},
        )
    bucket["count"] += 1

def normalize_registration_email(value: str) -> str:
    email = (value or "").strip().lower()
    if len(email) > 254 or not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", email):
        raise HTTPException(status_code=422, detail="Enter a valid email address")
    return email

def normalize_proxy_configuration(value: Optional[str]) -> Optional[str]:
    """Validate proxy settings without logging or returning credentials."""
    proxy = (value or "").strip()
    if not proxy:
        return None
    if len(proxy) > 512 or any(ord(character) < 32 for character in proxy):
        raise HTTPException(status_code=422, detail="Proxy configuration is invalid")

    try:
        if "://" in proxy:
            parsed = urlparse(proxy)
            if parsed.scheme.lower() not in {"http", "https", "socks5", "socks5h"}:
                raise ValueError("unsupported scheme")
            host = parsed.hostname or ""
            port = parsed.port
        else:
            host, port_text, _login, _password = proxy.rsplit(":", 3)
            port = int(port_text)
    except (TypeError, ValueError):
        raise HTTPException(status_code=422, detail="Proxy configuration is invalid")

    if not host or port is None or not 1 <= int(port) <= 65535:
        raise HTTPException(status_code=422, detail="Proxy configuration is invalid")

    try:
        address = ipaddress.ip_address(host.strip("[]"))
        if not address.is_global:
            raise HTTPException(status_code=422, detail="Proxy must use a public address")
    except ValueError:
        hostname = host.lower().rstrip(".")
        if hostname in {"localhost", "localhost.localdomain"} or hostname.endswith(".local"):
            raise HTTPException(status_code=422, detail="Proxy must use a public address")
        if not re.fullmatch(r"[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?", hostname):
            raise HTTPException(status_code=422, detail="Proxy configuration is invalid")

    return proxy

def validate_client_session_id(value: str) -> str:
    session_id = (value or "").strip()
    if not re.fullmatch(r"[A-Za-z0-9_-]{16,128}", session_id):
        raise HTTPException(status_code=422, detail="Payment session identifier is invalid")
    return session_id

async def run_defi_status_notification_job():
    """Check only recorded Aave receipts and send the user's opted-in final status."""
    db = SessionLocal()
    try:
        records = db.query(DefiOperationRecord).filter(
            DefiOperationRecord.status.in_(["submitted", "in_progress"]),
        ).order_by(DefiOperationRecord.created_at.desc()).limit(12).all()
        refresh_defi_operation_statuses(db, records)
    except Exception:
        db.rollback()
        logging.exception("Unable to refresh Aave DeFi notification statuses")
    finally:
        db.close()

@app.on_event("startup")
async def startup_event():
    scheduler.add_job(run_scheduled_action_reminder_job, 'interval', minutes=1)
    scheduler.add_job(run_defi_status_notification_job, 'interval', minutes=2, id='defi_status_notifications', replace_existing=True)
    scheduler.start()
    logging.info("Background async task scheduler started.")


@app.on_event("shutdown")
async def shutdown_event():
    """Release local resources cleanly when the API process stops."""
    if scheduler.running:
        scheduler.shutdown(wait=False)
    await browser_manager.shutdown()
    logging.info("AIRDROP-X backend stopped cleanly.")

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
    notifyTransactionSubmitted: Optional[bool] = False
    notifyTransactionFinal: Optional[bool] = True
    notifyReminders: Optional[bool] = True
    notifyErrors: Optional[bool] = True
    notifyDefiSupplySubmitted: Optional[bool] = False
    notifyDefiWithdrawSubmitted: Optional[bool] = False
    notifyDefiFinal: Optional[bool] = False
    notifyDefiErrors: Optional[bool] = False
    interfaceHints: Optional[bool] = True
    language: Optional[str] = "ru"

class PaymentRecoverReq(BaseModel):
    txid: str
    client_session_id: str
    plan: str
    onboarding: bool = False

class UserRegister(BaseModel):
    username: str
    email: str
    password: str
    code: str
    plan: str = "Standard"
    client_session_id: str
    payment_token: str
    fingerprint: str = ""

class UserLogin(BaseModel):
    username: str
    password: str
    fingerprint: str = ""

class PasswordResetConfirmRequest(BaseModel):
    email: str
    code: str
    password: str

class PaymentRegistrationResumeRequest(BaseModel):
    client_session_id: str

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

class ActionReminderRequest(BaseModel):
    network: str
    day_of_week: str
    time_of_day: str
    enabled: bool = False
    telegram_enabled: bool = True

class BridgePlanRequest(BaseModel):
    wallet_address: str
    to_network: str
    amount: str

class UniversalBridgeQuoteRequest(BaseModel):
    wallet_address: str
    from_network: str
    to_network: str
    from_token_address: str
    to_token_address: str
    amount: str

class UniversalBridgeSubmissionRequest(BaseModel):
    wallet_address: str
    from_network: str
    to_network: str
    from_token_address: str
    to_token_address: str
    amount_in: str
    amount_out: str
    amount_out_min: str
    provider: str = "LI.FI"
    bridge: str = ""
    tx_hash: str

class TelegramLinkRequest(BaseModel):
    language: Optional[str] = "ru"

class OpportunitySourceCreateRequest(BaseModel):
    source_key: str
    name: str
    network: str
    official_url: str
    claim_url: Optional[str] = None
    summary_ru: str
    summary_en: str
    summary_zh: str

class TransferTemplateCreateRequest(BaseModel):
    name: str
    recipient_wallet_id: int
    default_amount: str

class TransferRecordCreateRequest(BaseModel):
    template_id: int
    from_address: str
    to_address: str
    amount: str
    tx_hash: str

class DirectTransferRecordCreateRequest(BaseModel):
    recipient_wallet_id: int
    from_address: str
    to_address: str
    amount: str
    tx_hash: str

class WalletBatchAddRequest(BaseModel):
    wallet_addresses: List[str]

class WalletLabelUpdateRequest(BaseModel):
    label: str

class BaseSwapQuoteRequest(BaseModel):
    wallet_address: str
    amount: str
    slippage: float = 0.5

class BaseSwapBuildRequest(BaseModel):
    quote_id: str

class BaseSwapSubmissionRequest(BaseModel):
    submission_id: str
    tx_hash: str

class AaveSupplyQuoteRequest(BaseModel):
    wallet_address: str
    amount: str

class AaveSupplySubmissionRequest(BaseModel):
    quote_id: str
    tx_hash: str

class AaveWithdrawQuoteRequest(BaseModel):
    wallet_address: str
    amount: str

class AaveWithdrawSubmissionRequest(BaseModel):
    quote_id: str
    tx_hash: str

def normalize_language(language: Optional[str]) -> str:
    return language if language in {"ru", "en", "zh"} else "ru"

def hash_secret(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()

def issue_payment_token(
    db: Session,
    client_session_id: str,
    plan: str,
    amount: str,
    onboarding: bool = False,
    checkout_session_id: Optional[str] = None,
) -> str:
    """Create a one-use access token without persisting its raw value."""
    now_ts = int(time.time())
    db.query(PaymentAccessToken).filter(
        PaymentAccessToken.client_session_id == client_session_id,
        PaymentAccessToken.used_at.is_(None),
    ).delete(synchronize_session=False)
    raw_token = secrets.token_urlsafe(32)
    db.add(PaymentAccessToken(
        token_hash=hash_secret(raw_token),
        checkout_session_id=checkout_session_id,
        client_session_id=client_session_id,
        plan=plan,
        amount=amount,
        onboarding=onboarding,
        created_at=now_ts,
        expires_at=now_ts + PAYMENT_TOKEN_TTL_SECONDS,
    ))
    db.commit()
    return raw_token

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
    # A new successful login immediately invalidates every older browser session.
    db.query(AuthSession).filter(AuthSession.username == username).delete(synchronize_session=False)
    db.add(AuthSession(
        username=username,
        token_hash=hashlib.sha256(raw_token.encode("utf-8")).hexdigest(),
        created_at=now_ts,
        expires_at=now_ts + AUTH_SESSION_DURATION_SECONDS,
    ))
    db.commit()
    return raw_token

def authorize_login_device(username: str, fingerprint: str, db: Session, local_development: bool = False) -> None:
    """Keep one recognised device per account; permit one deliberate replacement per 30 days."""
    device_value = (fingerprint or "").strip()
    if len(device_value) < 16 or len(device_value) > 256:
        raise HTTPException(status_code=400, detail="Device identity is invalid. Refresh the page and try again")
    now_ts = int(time.time())
    device_hash = hash_secret(device_value)
    record = db.query(UserDeviceAccess).filter(UserDeviceAccess.username == username).first()
    if not record:
        db.add(UserDeviceAccess(
            username=username,
            device_hash=device_hash,
            window_started_at=now_ts,
            changes_in_window=0,
            updated_at=now_ts,
        ))
        db.commit()
        return
    # localhost and 127.0.0.1 are separate browser origins. They are only used
    # for local development, so treating them as separate paid "devices" would
    # incorrectly lock out the developer while they test the app.
    if local_development:
        record.device_hash = device_hash
        record.window_started_at = now_ts
        record.changes_in_window = 0
        record.updated_at = now_ts
        db.commit()
        return
    if hmac.compare_digest(record.device_hash, device_hash):
        record.updated_at = now_ts
        db.commit()
        return
    if now_ts - record.window_started_at >= DEVICE_CHANGE_WINDOW_SECONDS:
        record.window_started_at = now_ts
        record.changes_in_window = 0
    if record.changes_in_window >= MAX_DEVICE_CHANGES_PER_WINDOW:
        remaining_days = max(1, math.ceil((DEVICE_CHANGE_WINDOW_SECONDS - (now_ts - record.window_started_at)) / 86400))
        db.commit()
        raise HTTPException(status_code=429, detail=f"Device change limit reached. Try again in {remaining_days} days")
    record.device_hash = device_hash
    record.changes_in_window += 1
    record.updated_at = now_ts
    db.commit()

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


@app.post("/api/profiles/{profile_id}/launch")
async def launch_browser_profile(
    profile_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    profile = (
        db.query(UserProfile)
        .filter(
            UserProfile.id == profile_id,
            UserProfile.user_id == current_user.id,
        )
        .first()
    )

    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")

    try:
        await browser_manager.launch_profile(
            profile_id=profile.id,
            user_id=current_user.id,
        )

        return {
            "status": "success",
            "profile_id": profile.id,
            "message": "Profile session started",
        }

    except ProfileBusyError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    except ProfileConfigurationError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    except ValueError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except Exception:
        logging.exception("Unable to launch browser profile_id=%s", profile_id)
        raise HTTPException(
            status_code=500,
            detail="Unable to start profile session",
        )


@app.post("/api/profiles/{profile_id}/close")
async def close_browser_profile(
    profile_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    profile = (
        db.query(UserProfile)
        .filter(
            UserProfile.id == profile_id,
            UserProfile.user_id == current_user.id,
        )
        .first()
    )

    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")

    try:
        closed = await browser_manager.close_profile(profile.id)

        return {
            "status": "success",
            "profile_id": profile.id,
            "closed": closed,
            "message": (
                "Profile session closed"
                if closed
                else "No active session for this profile"
            ),
        }

    except ProfileBusyError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    except ProfileConfigurationError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    except ValueError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except Exception:
        logging.exception("Unable to close browser profile_id=%s", profile_id)
        raise HTTPException(
            status_code=500,
            detail="Unable to close profile session",
        )

@app.post("/api/logout")
async def logout(
    authorization: Optional[str] = Header(default=None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Revoke the current bearer token when the user explicitly signs out."""
    raw_token = (authorization or "").removeprefix("Bearer ").strip()
    if raw_token:
        token_hash = hashlib.sha256(raw_token.encode("utf-8")).hexdigest()
        db.query(AuthSession).filter(
            AuthSession.username == current_user.username,
            AuthSession.token_hash == token_hash,
        ).delete(synchronize_session=False)
        db.commit()
    return {"status": "success"}

def require_owned_username(username: str, current_user: User) -> None:
    if username != current_user.username:
        raise HTTPException(status_code=403, detail="You do not have access to this account")

def require_admin_user(current_user: User) -> None:
    if current_user.username not in ADMIN_USERNAMES:
        raise HTTPException(status_code=403, detail="Administrator access required")

def serialize_opportunity_source(source: OfficialOpportunitySource) -> dict:
    return {
        "id": source.id,
        "source_key": source.source_key,
        "name": source.name,
        "network": source.network,
        "official_url": source.official_url,
        "claim_url": source.claim_url,
        "status": source.status,
        "is_system": source.is_system,
        "summaries": {
            "ru": source.summary_ru,
            "en": source.summary_en,
            "zh": source.summary_zh,
        },
    }

def validate_opportunity_source(payload: OpportunitySourceCreateRequest) -> dict:
    source_key = payload.source_key.strip().lower()
    if not re.fullmatch(r"[a-z0-9-]{2,40}", source_key):
        raise HTTPException(status_code=422, detail="Source key must use 2-40 lowercase letters, digits, or hyphens")

    parsed_url = urlparse(payload.official_url.strip())
    if parsed_url.scheme != "https" or not parsed_url.netloc or parsed_url.username or parsed_url.password:
        raise HTTPException(status_code=422, detail="Official source URL must be a valid HTTPS address")

    claim_url = (payload.claim_url or "").strip()
    if claim_url:
        parsed_claim_url = urlparse(claim_url)
        if (
            parsed_claim_url.scheme != "https"
            or not parsed_claim_url.netloc
            or parsed_claim_url.username
            or parsed_claim_url.password
            or len(claim_url) > 500
        ):
            raise HTTPException(status_code=422, detail="Claim check URL must be a valid HTTPS address")

    fields = {
        "name": payload.name.strip(),
        "network": payload.network.strip(),
        "summary_ru": payload.summary_ru.strip(),
        "summary_en": payload.summary_en.strip(),
        "summary_zh": payload.summary_zh.strip(),
    }
    limits = {"name": 80, "network": 80, "summary_ru": 500, "summary_en": 500, "summary_zh": 500}
    for field_name, value in fields.items():
        if not value or len(value) > limits[field_name] or any(ord(char) < 32 for char in value):
            raise HTTPException(status_code=422, detail=f"Invalid {field_name} value")

    return {
        "source_key": source_key,
        "official_url": payload.official_url.strip(),
        "claim_url": claim_url or None,
        **fields,
    }

def is_valid_evm_address(value: str) -> bool:
    return bool(re.fullmatch(r"0x[a-fA-F0-9]{40}", value.strip()))

def normalize_eth_amount(value: str) -> str:
    clean_value = value.strip()
    if not re.fullmatch(r"(?:0|[1-9]\d*)(?:\.\d{1,18})?", clean_value):
        raise HTTPException(status_code=422, detail="Transfer amount must be a positive ETH value")
    whole, _, fraction = clean_value.partition(".")
    if int(whole) > 1000000 or (int(whole) == 0 and not fraction.strip("0")):
        raise HTTPException(status_code=422, detail="Transfer amount is outside the permitted range")
    return clean_value.rstrip("0").rstrip(".") if "." in clean_value else clean_value

def eth_to_wei(amount: str) -> str:
    whole, _, fraction = amount.partition(".")
    return str(int(whole) * 10**18 + int((fraction + "0" * 18)[:18]))

def uniswap_headers() -> dict:
    if not UNISWAP_API_KEY:
        raise HTTPException(status_code=503, detail="Base Swap is not configured. Add UNISWAP_API_KEY on the server")
    return {
        "x-api-key": UNISWAP_API_KEY,
        "Content-Type": "application/json",
        "Accept": "application/json",
        "x-erc20eth-enabled": "true",
        "x-permit2-disabled": "true",
        "x-universal-router-version": "2.0",
    }

def get_saved_base_wallet(db: Session, username: str, address: str) -> str:
    clean_address = address.strip()
    if not is_valid_evm_address(clean_address):
        raise HTTPException(status_code=422, detail="Connect a valid Base wallet")
    wallet = db.query(Wallet).filter(
        Wallet.username == username,
        Wallet.wallet_address.ilike(clean_address),
    ).first()
    if not wallet:
        raise HTTPException(status_code=403, detail="Save this wallet in AIRDROP-X before requesting a swap")
    return wallet.wallet_address

def lifi_headers() -> dict:
    """Keep an optional LI.FI key on the server; it is never returned to the browser."""
    headers = {"Accept": "application/json"}
    if LIFI_API_KEY:
        headers["x-lifi-api-key"] = LIFI_API_KEY
    return headers

def normalize_token_address(value: str) -> str:
    address = (value or "").strip()
    if address.lower() == LIFI_NATIVE_TOKEN_ADDRESS:
        return LIFI_NATIVE_TOKEN_ADDRESS
    if not is_valid_evm_address(address):
        raise HTTPException(status_code=422, detail="Invalid token address")
    return address.lower()

def normalize_token_amount(value: str, decimals: int) -> tuple[str, str]:
    """Return a normalized display amount and its smallest-unit representation."""
    clean_value = (value or "").strip()
    if not 0 <= decimals <= 36 or not re.fullmatch(r"(?:0|[1-9]\d*)(?:\.\d+)?", clean_value):
        raise HTTPException(status_code=422, detail="Invalid token amount")
    whole, _, fraction = clean_value.partition(".")
    if len(fraction) > decimals or len(whole) > 30:
        raise HTTPException(status_code=422, detail="Token amount is outside the permitted range")
    atomic = int(whole) * (10 ** decimals) + int((fraction + ("0" * decimals))[:decimals] or "0")
    if atomic <= 0:
        raise HTTPException(status_code=422, detail="Token amount must be greater than zero")
    normalized_fraction = fraction.rstrip("0")
    normalized = f"{int(whole)}.{normalized_fraction}" if normalized_fraction else str(int(whole))
    return normalized, str(atomic)

def format_token_amount(raw_amount: int, decimals: int, precision: int = 8) -> str:
    if decimals < 0:
        return "0"
    whole = raw_amount // (10 ** decimals)
    fraction = str(raw_amount % (10 ** decimals)).zfill(decimals)[:precision].rstrip("0")
    return f"{whole}.{fraction}" if fraction else str(whole)

def format_journal_token_amount(value: Optional[str], decimals: int) -> Optional[str]:
    """Format stored smallest-unit values for journal display without changing the record."""
    if value is None:
        return None
    clean_value = str(value).strip()
    if not clean_value:
        return None
    if re.fullmatch(r"\d+", clean_value):
        return format_token_amount(int(clean_value), decimals)
    return clean_value

def get_base_transaction_status(tx_hash: str) -> Optional[str]:
    """Read the Base receipt for a submitted operation; this never sends a transaction."""
    clean_tx_hash = (tx_hash or "").strip()
    if not re.fullmatch(r"0x[a-fA-F0-9]{64}", clean_tx_hash):
        return None

    now_ts = int(time.time())
    cached = transaction_status_cache.get(clean_tx_hash.lower())
    if cached and cached["expires_at"] > now_ts:
        return cached["status"]

    status = None
    try:
        web3 = Web3(Web3.HTTPProvider(BASE_RPC_URL, request_kwargs={"timeout": 8}))
        if web3.is_connected():
            receipt = web3.eth.get_transaction_receipt(clean_tx_hash)
            if receipt is None:
                status = "submitted"
            else:
                receipt_status = receipt.get("status")
                status = "completed" if int(receipt_status) == 1 else "failed"
    except Exception:
        status = None

    if status is not None:
        transaction_status_cache[clean_tx_hash.lower()] = {
            "status": status,
            "expires_at": now_ts + TRANSACTION_STATUS_CACHE_TTL_SECONDS,
        }
    return status

def get_aave_v3_base_positions(wallet_address: str, refresh: bool = False) -> list[dict]:
    """Read Aave V3 Base supply and borrow positions without creating a transaction."""
    if not is_valid_evm_address(wallet_address):
        raise HTTPException(status_code=422, detail="Invalid wallet address")

    cache_key = wallet_address.lower()
    now_ts = int(time.time())
    cached = defi_positions_cache.get(cache_key)
    if not refresh and cached and cached["expires_at"] > now_ts:
        return cached["positions"]

    try:
        web3 = Web3(Web3.HTTPProvider(BASE_RPC_URL, request_kwargs={"timeout": 12}))
        if not web3.is_connected():
            raise RuntimeError("Base RPC unavailable")
        provider = web3.eth.contract(
            address=Web3.to_checksum_address(AAVE_V3_BASE_PROTOCOL_DATA_PROVIDER),
            abi=AAVE_V3_POOL_DATA_PROVIDER_ABI,
        )
        owner = Web3.to_checksum_address(wallet_address)
        reserves = provider.functions.getAllReservesTokens().call()
    except Exception:
        raise HTTPException(status_code=503, detail="Aave Base data is temporarily unavailable")

    positions = []
    for reserve in reserves:
        try:
            symbol = str(reserve[0] or "Asset")
            asset_address = Web3.to_checksum_address(reserve[1])
            user_data = provider.functions.getUserReserveData(asset_address, owner).call()
            supplied_raw = int(user_data[0])
            borrowed_raw = int(user_data[1]) + int(user_data[2])
            if supplied_raw <= 0 and borrowed_raw <= 0:
                continue
            reserve_data = provider.functions.getReserveConfigurationData(asset_address).call()
            decimals = int(reserve_data[0])
            if not 0 <= decimals <= 36:
                decimals = 18
            positions.append({
                "asset": symbol,
                "asset_address": asset_address,
                "supplied": format_token_amount(supplied_raw, decimals),
                "borrowed": format_token_amount(borrowed_raw, decimals),
                "has_supply": supplied_raw > 0,
                "has_borrow": borrowed_raw > 0,
                "collateral_enabled": bool(user_data[8]),
            })
        except Exception:
            # One unavailable reserve must not prevent the rest of the public
            # portfolio from being shown.
            continue

    positions.sort(key=lambda item: (not item["has_borrow"], item["asset"].lower()))
    defi_positions_cache[cache_key] = {
        "positions": positions,
        "expires_at": now_ts + DEFI_POSITIONS_CACHE_TTL_SECONDS,
    }
    return positions

def build_aave_supply_calldata(asset_address: str, amount_atomic: str, wallet_address: str) -> str:
    """Encode Aave Pool.supply(asset, amount, onBehalfOf, 0) from fixed inputs."""
    selector = Web3.keccak(text="supply(address,uint256,address,uint16)")[:4].hex()
    encoded_asset = asset_address.lower().replace("0x", "").rjust(64, "0")
    encoded_amount = format(int(amount_atomic), "x").rjust(64, "0")
    encoded_wallet = wallet_address.lower().replace("0x", "").rjust(64, "0")
    encoded_referral_code = "0".rjust(64, "0")
    return f"0x{selector}{encoded_asset}{encoded_amount}{encoded_wallet}{encoded_referral_code}"

def get_aave_v3_base_usdc_supply_quote(wallet_address: str, amount: str) -> dict:
    """Prepare a fixed, user-confirmed USDC supply request for Aave V3 on Base."""
    normalized_amount, amount_atomic = normalize_token_amount(amount, BASE_USDC_DECIMALS)
    if not is_valid_evm_address(wallet_address):
        raise HTTPException(status_code=422, detail="Invalid wallet address")
    last_error = None
    for attempt in range(2):
        try:
            web3 = Web3(Web3.HTTPProvider(BASE_RPC_URL, request_kwargs={"timeout": 12}))
            if not web3.is_connected():
                raise RuntimeError("Base RPC unavailable")
            owner = Web3.to_checksum_address(wallet_address)
            usdc_address = Web3.to_checksum_address(BASE_USDC_ADDRESS)
            pool_address = Web3.to_checksum_address(AAVE_V3_BASE_POOL)
            usdc = web3.eth.contract(address=usdc_address, abi=[*ERC20_BALANCE_OF_ABI, *ERC20_ALLOWANCE_ABI])
            provider = web3.eth.contract(
                address=Web3.to_checksum_address(AAVE_V3_BASE_PROTOCOL_DATA_PROVIDER),
                abi=AAVE_V3_POOL_DATA_PROVIDER_ABI,
            )
            balance_raw = int(usdc.functions.balanceOf(owner).call())
            allowance_raw = int(usdc.functions.allowance(owner, pool_address).call())
            native_balance_raw = int(web3.eth.get_balance(owner))
            configuration = provider.functions.getReserveConfigurationData(usdc_address).call()
            paused = bool(provider.functions.getPaused(usdc_address).call())
            reserve_data = provider.functions.getReserveData(usdc_address).call()
            break
        except Exception as error:
            last_error = error
            if attempt == 0:
                time.sleep(0.35)
    else:
        logging.warning("Aave Base supply read failed: %s", last_error)
        raise HTTPException(status_code=503, detail="Aave Base supply data is temporarily unavailable")

    requested_raw = int(amount_atomic)
    if requested_raw > balance_raw:
        raise HTTPException(status_code=422, detail="The requested USDC amount exceeds the wallet balance")
    # Aave configuration: index 8 is active, index 9 is frozen.
    if not bool(configuration[8]) or bool(configuration[9]) or paused:
        raise HTTPException(status_code=409, detail="Aave USDC supply is temporarily unavailable")

    liquidity_rate_raw = int(reserve_data[5])
    annual_rate_percent = round((liquidity_rate_raw / (10 ** 27)) * 100, 4)
    native_balance = format_token_amount(native_balance_raw, 18)
    gas_reserve = PUBLIC_NETWORK_BALANCE_CONFIG["Base"]["gas_reserve"]
    return {
        "amount": normalized_amount,
        "amount_atomic": amount_atomic,
        "asset": {
            "symbol": "USDC",
            "address": BASE_USDC_ADDRESS,
            "decimals": BASE_USDC_DECIMALS,
        },
        "network": "Base",
        "pool_address": AAVE_V3_BASE_POOL,
        "wallet_balance": format_token_amount(balance_raw, BASE_USDC_DECIMALS),
        "annual_supply_rate_percent": annual_rate_percent,
        "rate_is_variable": True,
        "native_balance": native_balance,
        "gas_reserve": gas_reserve,
        "gas_reserve_met": native_balance_raw >= int(float(gas_reserve) * (10 ** 18)),
        "approval": {
            "required": allowance_raw < requested_raw,
            "spender": AAVE_V3_BASE_POOL,
            "amount_atomic": amount_atomic,
        },
        "transaction": {
            "chain_id": BASE_CHAIN_ID,
            "from": wallet_address,
            "to": AAVE_V3_BASE_POOL,
            "data": build_aave_supply_calldata(BASE_USDC_ADDRESS, amount_atomic, wallet_address),
            "value": "0",
        },
    }

def build_aave_withdraw_calldata(asset_address: str, amount_atomic: str, wallet_address: str) -> str:
    """Encode Aave Pool.withdraw(asset, amount, to) from fixed inputs."""
    selector = Web3.keccak(text="withdraw(address,uint256,address)")[:4].hex()
    encoded_asset = asset_address.lower().replace("0x", "").rjust(64, "0")
    encoded_amount = format(int(amount_atomic), "x").rjust(64, "0")
    encoded_wallet = wallet_address.lower().replace("0x", "").rjust(64, "0")
    return f"0x{selector}{encoded_asset}{encoded_amount}{encoded_wallet}"

def get_aave_v3_base_usdc_withdraw_quote(wallet_address: str, amount: str) -> dict:
    """Prepare a fixed, user-confirmed USDC withdrawal from Aave V3 on Base."""
    normalized_amount, amount_atomic = normalize_token_amount(amount, BASE_USDC_DECIMALS)
    if not is_valid_evm_address(wallet_address):
        raise HTTPException(status_code=422, detail="Invalid wallet address")
    requested_raw = int(amount_atomic)

    last_error = None
    for attempt in range(2):
        try:
            web3 = Web3(Web3.HTTPProvider(BASE_RPC_URL, request_kwargs={"timeout": 12}))
            if not web3.is_connected():
                raise RuntimeError("Base RPC unavailable")
            owner = Web3.to_checksum_address(wallet_address)
            usdc_address = Web3.to_checksum_address(BASE_USDC_ADDRESS)
            pool_address = Web3.to_checksum_address(AAVE_V3_BASE_POOL)
            provider = web3.eth.contract(
                address=Web3.to_checksum_address(AAVE_V3_BASE_PROTOCOL_DATA_PROVIDER),
                abi=AAVE_V3_POOL_DATA_PROVIDER_ABI,
            )
            user_data = provider.functions.getUserReserveData(usdc_address, owner).call()
            a_token_balance_raw = int(user_data[0])
            if requested_raw > a_token_balance_raw:
                raise HTTPException(status_code=422, detail="The requested amount exceeds the Aave USDC position")
            native_balance_raw = int(web3.eth.get_balance(owner))
            transaction_data = build_aave_withdraw_calldata(BASE_USDC_ADDRESS, amount_atomic, wallet_address)
            # Read-only simulation catches an unavailable reserve or insufficient
            # pool liquidity before the wallet displays a signature request.
            web3.eth.call({"from": owner, "to": pool_address, "data": transaction_data, "value": 0})
            break
        except HTTPException:
            raise
        except Exception as error:
            last_error = error
            if attempt == 0:
                time.sleep(0.35)
    else:
        logging.warning("Aave Base withdrawal read failed: %s", last_error)
        raise HTTPException(status_code=503, detail="Aave Base withdrawal data is temporarily unavailable")

    gas_reserve = PUBLIC_NETWORK_BALANCE_CONFIG["Base"]["gas_reserve"]
    return {
        "amount": normalized_amount,
        "amount_atomic": amount_atomic,
        "asset": {
            "symbol": "USDC",
            "address": BASE_USDC_ADDRESS,
            "decimals": BASE_USDC_DECIMALS,
        },
        "network": "Base",
        "pool_address": AAVE_V3_BASE_POOL,
        "position_balance": format_token_amount(a_token_balance_raw, BASE_USDC_DECIMALS),
        "native_balance": format_token_amount(native_balance_raw, 18),
        "gas_reserve": gas_reserve,
        "gas_reserve_met": native_balance_raw >= int(float(gas_reserve) * (10 ** 18)),
        "transaction": {
            "chain_id": BASE_CHAIN_ID,
            "from": wallet_address,
            "to": AAVE_V3_BASE_POOL,
            "data": transaction_data,
            "value": "0",
        },
    }

def refresh_base_operation_statuses(
    db: Session,
    swap_records: List[BaseSwapRecord],
    transfer_records: List[WalletTransferRecord],
):
    """Update recent pending Base receipts before returning the operation journal."""
    pending_records = [
        record for record in [*swap_records, *transfer_records]
        if (record.status or "submitted") in {"submitted", "in_progress"}
    ][:24]
    changed_records = []
    for record in pending_records:
        current_status = get_base_transaction_status(record.tx_hash)
        if current_status and record.status != current_status:
            record.status = current_status
            changed_records.append(record)
    if changed_records:
        db.commit()
        for record in changed_records:
            notify_base_operation_status(get_telegram_subscription(db, record.username), record)

def notify_base_operation_status(subscription: Optional[TelegramSubscription], record: Any) -> bool:
    """Send one opt-in final status message when a saved Base receipt changes."""
    if not subscription or record.status not in {"completed", "failed"}:
        return False
    if record.status == "completed" and not subscription.notify_transaction_final:
        return False
    if record.status == "failed" and not subscription.notify_errors:
        return False

    is_swap = isinstance(record, BaseSwapRecord)
    if is_swap:
        amount = f"{record.amount_in} ETH → {format_journal_token_amount(record.amount_out, BASE_USDC_DECIMALS)} USDC"
        operation = {"ru": "обмен", "en": "swap", "zh": "兑换"}
    else:
        amount = f"{record.amount} ETH"
        operation = {"ru": "перевод", "en": "transfer", "zh": "转账"}

    completed = record.status == "completed"
    icon = "✅" if completed else "⚠️"
    status = (
        {"ru": "подтверждён", "en": "confirmed", "zh": "已确认"}
        if completed else {"ru": "не выполнен", "en": "failed", "zh": "失败"}
    )
    recipient = ""
    if not is_swap:
        recipient = f"\nПолучатель: `{record.to_address}`"
    messages = {
        "ru": f"{icon} *AIRDROP-X: {operation['ru']} {status['ru']}*\nСеть: `Base`\nСумма: `{amount}`{recipient}\nTX: `{record.tx_hash}`",
        "en": f"{icon} *AIRDROP-X: {operation['en']} {status['en']}*\nNetwork: `Base`\nAmount: `{amount}`\nTX: `{record.tx_hash}`",
        "zh": f"{icon} *AIRDROP-X：{operation['zh']}{status['zh']}*\n网络：`Base`\n数量：`{amount}`\n交易：`{record.tx_hash}`",
    }
    return send_telegram_notification(subscription.chat_id, messages[normalize_language(subscription.language)])

def notify_base_transfer_submitted(subscription: Optional[TelegramSubscription], amount: str, tx_hash: str) -> bool:
    """Send a direct-transfer notification only when the user explicitly enabled it."""
    if not subscription or not subscription.notify_transaction_submitted:
        return False
    messages = {
        "ru": f"↗️ *AIRDROP-X: перевод отправлен*\nСеть: `Base`\nСумма: `{amount} ETH`\nTX: `{tx_hash}`",
        "en": f"↗️ *AIRDROP-X: transfer submitted*\nNetwork: `Base`\nAmount: `{amount} ETH`\nTX: `{tx_hash}`",
        "zh": f"↗️ *AIRDROP-X：转账已提交*\n网络：`Base`\n数量：`{amount} ETH`\n交易：`{tx_hash}`",
    }
    return send_telegram_notification(subscription.chat_id, messages[normalize_language(subscription.language)])

def serialize_defi_operation_record(record: DefiOperationRecord) -> Dict[str, Any]:
    return {
        "id": record.id,
        "wallet_address": record.wallet_address,
        "operation_type": record.operation_type,
        "protocol": record.protocol,
        "network": record.network,
        "asset_symbol": record.asset_symbol,
        "amount": record.amount,
        "tx_hash": record.tx_hash,
        "status": record.status,
        "created_at": record.created_at,
    }

def save_verified_aave_operation(
    db: Session,
    username: str,
    wallet_address: str,
    operation_type: str,
    amount_atomic: str,
    tx_hash: str,
    created_at: int,
) -> DefiOperationRecord:
    """Persist only a transaction already matched to the exact Aave calldata."""
    existing = db.query(DefiOperationRecord).filter(DefiOperationRecord.tx_hash == tx_hash).first()
    if existing:
        if existing.username != username:
            raise HTTPException(status_code=409, detail="Transaction is already recorded")
        return existing

    record = DefiOperationRecord(
        username=username,
        wallet_address=wallet_address,
        operation_type=operation_type,
        protocol="Aave V3",
        network="Base",
        asset_symbol="USDC",
        amount=format_token_amount(int(amount_atomic), BASE_USDC_DECIMALS),
        tx_hash=tx_hash,
        status="submitted",
        created_at=created_at,
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    return record

def notify_defi_operation_status(subscription: Optional[TelegramSubscription], record: DefiOperationRecord) -> bool:
    """Send an opt-in final Aave status update once a public Base receipt changes."""
    if not subscription or record.status not in {"completed", "failed"}:
        return False
    if record.status == "completed" and not subscription.notify_defi_final:
        return False
    if record.status == "failed" and not subscription.notify_defi_errors:
        return False
    operation = {
        "supply": {"ru": "внесение", "en": "supply", "zh": "存入"},
        "withdraw": {"ru": "вывод", "en": "withdrawal", "zh": "提取"},
    }.get(record.operation_type, {"ru": "действие", "en": "action", "zh": "操作"})
    status_icon = "✅" if record.status == "completed" else "⚠️"
    status_label = {"ru": "подтверждено", "en": "confirmed", "zh": "已确认"} if record.status == "completed" else {"ru": "не выполнено", "en": "failed", "zh": "失败"}
    messages = {
        "ru": f"{status_icon} *AIRDROP-X: Aave — {operation['ru']} {status_label['ru']}*\nСеть: `Base`\nСумма: `{record.amount} {record.asset_symbol}`\nTX: `{record.tx_hash}`",
        "en": f"{status_icon} *AIRDROP-X: Aave {operation['en']} {status_label['en']}*\nNetwork: `Base`\nAmount: `{record.amount} {record.asset_symbol}`\nTX: `{record.tx_hash}`",
        "zh": f"{status_icon} *AIRDROP-X：Aave {operation['zh']}{status_label['zh']}*\n网络：`Base`\n数量：`{record.amount} {record.asset_symbol}`\n交易：`{record.tx_hash}`",
    }
    return send_telegram_notification(subscription.chat_id, messages[normalize_language(subscription.language)])

def refresh_defi_operation_statuses(db: Session, records: List[DefiOperationRecord]) -> None:
    """Refresh a small set of pending Base receipts; this never creates a transaction."""
    changed_records = []
    for record in [item for item in records if (item.status or "submitted") in {"submitted", "in_progress"}][:12]:
        current_status = get_base_transaction_status(record.tx_hash)
        if current_status and current_status != record.status:
            record.status = current_status
            changed_records.append(record)
    if changed_records:
        db.commit()
        for record in changed_records:
            notify_defi_operation_status(get_telegram_subscription(db, record.username), record)

def get_lifi_tokens(network: str) -> list[dict]:
    """Fetch LI.FI's official catalog for one supported EVM chain and cache it briefly."""
    config = LIFI_EVM_NETWORKS.get(network)
    if not config:
        raise HTTPException(status_code=422, detail="This network is not supported by the universal bridge")
    now_ts = int(time.time())
    cached = LIFI_TOKEN_CATALOG_CACHE.get(network)
    if cached and cached["expires_at"] > now_ts:
        return cached["tokens"]
    try:
        response = requests.get(
            f"{LIFI_API_URL}/tokens",
            params={"chains": str(config["chain_id"]), "chainTypes": "EVM"},
            headers=lifi_headers(),
            timeout=15,
        )
        response.raise_for_status()
        payload = response.json()
    except (requests.RequestException, ValueError):
        raise HTTPException(status_code=503, detail="Universal bridge token catalog is temporarily unavailable")

    token_map = payload.get("tokens", payload) if isinstance(payload, dict) else {}
    raw_tokens = token_map.get(str(config["chain_id"]), []) if isinstance(token_map, dict) else []
    if not isinstance(raw_tokens, list):
        raise HTTPException(status_code=502, detail="Universal bridge returned an invalid token catalog")

    core_addresses = {LIFI_NATIVE_TOKEN_ADDRESS}
    configured_usdc = PUBLIC_NETWORK_BALANCE_CONFIG.get(network, {}).get("usdc_address")
    if configured_usdc:
        core_addresses.add(configured_usdc.lower())
    unique_tokens = {}
    for raw_token in raw_tokens[:5000]:
        if not isinstance(raw_token, dict):
            continue
        try:
            address = normalize_token_address(str(raw_token.get("address", "")))
            decimals = int(raw_token.get("decimals"))
        except (ValueError, TypeError, HTTPException):
            continue
        symbol = str(raw_token.get("symbol", "")).strip()
        name = str(raw_token.get("name", "")).strip()
        if not symbol or len(symbol) > 32 or len(name) > 120 or not 0 <= decimals <= 36:
            continue
        price = raw_token.get("priceUSD")
        try:
            price_value = float(price)
            price_usd = price_value if math.isfinite(price_value) and price_value >= 0 else None
        except (ValueError, TypeError):
            price_usd = None
        unique_tokens[address] = {
            "address": address,
            "symbol": symbol,
            "name": name,
            "decimals": decimals,
            "price_usd": price_usd,
            "is_core": address.lower() in core_addresses,
        }
    tokens = sorted(unique_tokens.values(), key=lambda token: (
        not token["is_core"],
        token["address"] != LIFI_NATIVE_TOKEN_ADDRESS,
        token["symbol"].upper() not in {"USDC", "USDT", "DAI"},
        token["symbol"].lower(),
    ))
    if not tokens:
        raise HTTPException(status_code=502, detail="Universal bridge returned no supported tokens for this network")
    LIFI_TOKEN_CATALOG_CACHE[network] = {"tokens": tokens, "expires_at": now_ts + LIFI_CATALOG_CACHE_TTL_SECONDS}
    return tokens

def get_lifi_token(network: str, address: str) -> dict:
    normalized_address = normalize_token_address(address)
    token = next((item for item in get_lifi_tokens(network) if item["address"].lower() == normalized_address.lower()), None)
    if not token:
        raise HTTPException(status_code=422, detail="This token is not supported for the selected network")
    return token

def validate_lifi_transaction_request(transaction: dict, expected_chain_id: int, expected_address: str) -> dict:
    if not isinstance(transaction, dict):
        raise HTTPException(status_code=502, detail="Universal bridge returned no transaction request")
    try:
        chain_id = int(transaction.get("chainId"))
    except (TypeError, ValueError):
        raise HTTPException(status_code=502, detail="Universal bridge returned an invalid transaction network")
    to_address = str(transaction.get("to", "")).strip()
    calldata = str(transaction.get("data", "")).strip()
    value = str(transaction.get("value", "0")).strip()
    from_address = str(transaction.get("from", expected_address)).strip()
    if (
        chain_id != expected_chain_id
        or not is_valid_evm_address(to_address)
        or not re.fullmatch(r"0x(?:[a-fA-F0-9]{2})*", calldata)
        or len(calldata) > 120000
        or not re.fullmatch(r"(?:0|[1-9]\d*|0x[0-9a-fA-F]+)", value)
        or not is_valid_evm_address(from_address)
        or from_address.lower() != expected_address.lower()
    ):
        raise HTTPException(status_code=502, detail="Universal bridge transaction validation failed")
    return {
        "chain_id": chain_id,
        "from": from_address,
        "to": to_address,
        "data": calldata,
        "value": value,
        "gas_limit": str(transaction.get("gasLimit", "")).strip(),
        "gas_price": str(transaction.get("gasPrice", "")).strip(),
        "max_fee_per_gas": str(transaction.get("maxFeePerGas", "")).strip(),
        "max_priority_fee_per_gas": str(transaction.get("maxPriorityFeePerGas", "")).strip(),
    }

def serialize_transfer_template(template: WalletTransferTemplate) -> dict:
    return {
        "id": template.id,
        "name": template.name,
        "recipient_wallet_id": template.recipient_wallet_id,
        "recipient_address": template.recipient_address,
        "default_amount": template.default_amount,
        "network": template.network,
    }

def reserve_verified_usdc_payment(
    db: Session,
    txid: str,
    payment_config: dict,
    expected_atomic_amount: int,
    purpose: str,
    username: Optional[str] = None,
) -> None:
    clean_txid = txid.strip().lower()
    if db.query(ProcessedBlockchainTransaction).filter(ProcessedBlockchainTransaction.txid == clean_txid).first():
        raise HTTPException(status_code=409, detail="This blockchain transaction has already been used")
    verification_state = get_usdc_payment_verification_state(clean_txid, payment_config, expected_atomic_amount)
    if verification_state == "pending":
        raise HTTPException(status_code=409, detail="USDC payment is waiting for Base confirmation")
    if verification_state != "confirmed":
        raise HTTPException(status_code=400, detail="USDC payment was not confirmed or did not match the session")
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
        logging.exception("Email delivery failed: %s", e)
        return False

def send_password_reset_email(to_email: str, code: str) -> bool:
    msg = EmailMessage()
    msg["Subject"] = "[AIRDROP-X] Password reset code"
    msg["From"] = f"Airdrop-X Core <{SENDER_EMAIL}>"
    msg["To"] = to_email
    msg.set_content(
        f"Your AIRDROP-X password reset code is: {code}\n\n"
        "It expires in 10 minutes. If you did not request this, you can ignore this email."
    )
    msg.add_alternative(f"""
    <div style="background:#07050c;padding:32px;font-family:Arial,sans-serif;color:#f3f0ff;">
      <div style="max-width:500px;margin:auto;background:#100a1c;border:1px solid rgba(157,78,221,.5);border-radius:12px;padding:28px;">
        <div style="color:#e0aaff;font-weight:700;letter-spacing:1px;">AIRDROP-X // SECURITY</div>
        <h2 style="color:#fff;">Password reset</h2>
        <p style="color:#d8c9f1;line-height:1.5;">Use this code to choose a new password. It expires in 10 minutes.</p>
        <div style="margin:20px 0;padding:16px;text-align:center;border:1px solid #c77dff;border-radius:8px;background:#07050c;color:#fff;font-size:30px;font-weight:700;letter-spacing:7px;">{code}</div>
        <p style="color:#a3a3a3;font-size:12px;">If you did not request a reset, simply ignore this message.</p>
      </div>
    </div>
    """, subtype="html")
    try:
        with smtplib.SMTP_SSL(SMTP_SERVER, SMTP_PORT) as server:
            server.login(SENDER_EMAIL, SENDER_PASSWORD)
            server.send_message(msg)
        return True
    except Exception:
        return False

@app.post("/api/settings/save")
async def save_user_settings(
    data: ProfileSettingsRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
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
            subscription.notify_transaction_submitted = bool(data.notifyTransactionSubmitted)
            subscription.notify_transaction_final = bool(data.notifyTransactionFinal)
            subscription.notify_reminders = bool(data.notifyReminders)
            subscription.notify_errors = bool(data.notifyErrors)
            subscription.notify_defi_supply_submitted = bool(data.notifyDefiSupplySubmitted)
            subscription.notify_defi_withdraw_submitted = bool(data.notifyDefiWithdrawSubmitted)
            subscription.notify_defi_final = bool(data.notifyDefiFinal)
            subscription.notify_defi_errors = bool(data.notifyDefiErrors)
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
    filters = None
    if subscription:
        filters = {
            "transactionSubmitted": bool(subscription.notify_transaction_submitted),
            "transactionFinal": bool(subscription.notify_transaction_final),
            "reminders": bool(subscription.notify_reminders),
            "errors": bool(subscription.notify_errors),
            "defiSupplySubmitted": bool(subscription.notify_defi_supply_submitted),
            "defiWithdrawSubmitted": bool(subscription.notify_defi_withdraw_submitted),
            "defiFinal": bool(subscription.notify_defi_final),
            "defiErrors": bool(subscription.notify_defi_errors),
        }
    return {
        "linked": bool(subscription),
        "bot_configured": bool(TELEGRAM_BOT_TOKEN and TELEGRAM_BOT_USERNAME),
        "filters": filters,
    }

@app.get("/api/security/overview")
def security_overview(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Return only account safety indicators; never exposes keys, tokens, or wallet secrets."""
    now_ts = int(time.time())
    active_session = db.query(AuthSession).filter(
        AuthSession.username == current_user.username,
        AuthSession.expires_at > now_ts,
    ).order_by(AuthSession.expires_at.desc()).first()
    wallet_count = db.query(Wallet).filter(Wallet.username == current_user.username).count()
    telegram_linked = bool(get_telegram_subscription(db, current_user.username))
    return {
        "status": "success",
        "session_active": bool(active_session),
        "session_expires_at": active_session.expires_at if active_session else None,
        "single_session_enforced": True,
        "wallet_count": wallet_count,
        "telegram_linked": telegram_linked,
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
async def recover_payment_session(
    req: PaymentRecoverReq,
    request: Request,
    db: Session = Depends(get_db),
):
    """Recover only a Base Sepolia checkout interrupted by a local reload."""
    payment_config = get_subscription_payment_config()
    if not payment_config or not payment_config["is_testnet"]:
        raise HTTPException(status_code=410, detail="Payment recovery is unavailable for this network")
    enforce_request_rate_limit("payment-recovery", get_request_client_key(request), 6, 15 * 60)
    client_session_id = validate_client_session_id(req.client_session_id)
    if req.plan not in PLAN_PRICES:
        raise HTTPException(status_code=400, detail="Unknown plan")
    amount_usdc = SUBSCRIPTION_TEST_AMOUNT_USDC.quantize(Decimal("0.01"))
    reserve_verified_usdc_payment(
        db,
        req.txid,
        payment_config,
        int(amount_usdc * Decimal(1_000_000)),
        "subscription_payment_test_recovery",
    )
    recovery_session = PaymentCheckoutSession(
        id=str(uuid.uuid4()),
        client_session_id=client_session_id,
        plan=req.plan,
        amount_usdc=format(amount_usdc, ".2f"),
        amount_atomic=str(int(amount_usdc * Decimal(1_000_000))),
        onboarding=False,
        payment_mode=payment_config["mode"],
        status="paid",
        txid=req.txid.strip(),
        created_at=int(time.time()),
        paid_at=int(time.time()),
    )
    db.add(recovery_session)
    db.commit()
    payment_token = issue_payment_token(
        db=db,
        client_session_id=client_session_id,
        plan=req.plan,
        amount=format(amount_usdc, ".2f"),
        onboarding=False,
        checkout_session_id=recovery_session.id,
    )
    return {
        "status": "success",
        "payment_token": payment_token,
        "plan": req.plan,
        "amount": format(amount_usdc, ".2f"),
        "onboarding": False,
    }

@app.post("/api/send-code")
def api_send_code(data: EmailRequest, request: Request, db: Session = Depends(get_db)):
    email = normalize_registration_email(data.email)
    enforce_request_rate_limit("email-code", get_request_client_key(request), 5, 15 * 60)
    now_ts = int(time.time())
    existing = db.query(EmailVerificationCode).filter(EmailVerificationCode.email == email).first()
    if existing and now_ts - existing.sent_at < EMAIL_CODE_RESEND_SECONDS:
        raise HTTPException(status_code=429, detail="Please wait before requesting another verification code")
    code = f"{secrets.randbelow(1_000_000):06d}"
    success = send_real_email(email, code)
    if not success:
        raise HTTPException(status_code=502, detail="Email service is temporarily unavailable")
    if existing:
        existing.code_hash = hash_password(code)
        existing.attempts = 0
        existing.sent_at = now_ts
        existing.expires_at = now_ts + EMAIL_CODE_TTL_SECONDS
    else:
        db.add(EmailVerificationCode(
            email=email,
            code_hash=hash_password(code),
            attempts=0,
            sent_at=now_ts,
            expires_at=now_ts + EMAIL_CODE_TTL_SECONDS,
        ))
    db.commit()
        
    return {"status": "success", "message": "Code sent successfully!"}  

@app.post("/api/payment/resume-registration")
def resume_paid_registration(
    req: PaymentRegistrationResumeRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    """Re-issue registration access after a page/server restart for the same browser session."""
    enforce_request_rate_limit("payment-registration-resume", get_request_client_key(request), 12, 15 * 60)
    client_session_id = validate_client_session_id(req.client_session_id)
    now_ts = int(time.time())
    payment_session = db.query(PaymentCheckoutSession).filter(
        PaymentCheckoutSession.client_session_id == client_session_id,
        PaymentCheckoutSession.status == "paid",
    ).order_by(PaymentCheckoutSession.paid_at.desc()).first()
    if not payment_session:
        raise HTTPException(status_code=404, detail="No confirmed payment is available for this browser session")
    if not payment_session.paid_at or now_ts - payment_session.paid_at > PAYMENT_REGISTRATION_RESUME_TTL_SECONDS:
        raise HTTPException(status_code=410, detail="Paid registration session expired. Contact support with your payment TXID")
    payment_token = issue_payment_token(
        db=db,
        client_session_id=payment_session.client_session_id,
        plan=payment_session.plan,
        amount=payment_session.amount_usdc,
        onboarding=payment_session.onboarding,
        checkout_session_id=payment_session.id,
    )
    return {
        "status": "success",
        "payment_token": payment_token,
        "plan": payment_session.plan,
        "amount": payment_session.amount_usdc,
        "onboarding": payment_session.onboarding,
    }

@app.post("/api/password-reset/request")
def request_password_reset(data: EmailRequest, request: Request, db: Session = Depends(get_db)):
    """Send a reset code without revealing whether an account exists for the email."""
    email = normalize_registration_email(data.email)
    client_key = get_request_client_key(request)
    enforce_request_rate_limit("password-reset-email", f"{client_key}:{email}", 5, 15 * 60)
    enforce_request_rate_limit("password-reset-ip", client_key, 10, 15 * 60)
    now_ts = int(time.time())
    account = db.query(User).filter(User.email == email).first()
    existing = db.query(PasswordResetCode).filter(PasswordResetCode.email == email).first()
    if existing and now_ts - existing.sent_at < PASSWORD_RESET_RESEND_SECONDS:
        # Keep the response identical so this endpoint cannot be used to enumerate users.
        return {"status": "success", "message": "If an account exists, a reset code was sent"}
    if account:
        code = f"{secrets.randbelow(1_000_000):06d}"
        if not send_password_reset_email(email, code):
            raise HTTPException(status_code=502, detail="Email service is temporarily unavailable")
        if existing:
            existing.code_hash = hash_password(code)
            existing.attempts = 0
            existing.sent_at = now_ts
            existing.expires_at = now_ts + PASSWORD_RESET_TTL_SECONDS
        else:
            db.add(PasswordResetCode(
                email=email,
                code_hash=hash_password(code),
                attempts=0,
                sent_at=now_ts,
                expires_at=now_ts + PASSWORD_RESET_TTL_SECONDS,
            ))
        db.commit()
    return {"status": "success", "message": "If an account exists, a reset code was sent"}

@app.post("/api/password-reset/confirm")
def confirm_password_reset(data: PasswordResetConfirmRequest, request: Request, db: Session = Depends(get_db)):
    email = normalize_registration_email(data.email)
    enforce_request_rate_limit("password-reset-confirm", get_request_client_key(request), 8, 15 * 60)
    if len(data.password.encode("utf-8")) > 72:
        raise HTTPException(status_code=400, detail="Password must be no more than 72 bytes")
    if len(data.password) < 12:
        raise HTTPException(status_code=400, detail="Password must be at least 12 characters")
    reset = db.query(PasswordResetCode).filter(PasswordResetCode.email == email).first()
    now_ts = int(time.time())
    if not reset or reset.expires_at <= now_ts:
        if reset:
            db.delete(reset)
            db.commit()
        raise HTTPException(status_code=400, detail="Password reset code is invalid or expired")
    if reset.attempts >= 5:
        db.delete(reset)
        db.commit()
        raise HTTPException(status_code=400, detail="Password reset code is invalid or expired")
    if not re.fullmatch(r"\d{6}", data.code or "") or not verify_password(data.code, reset.code_hash):
        reset.attempts += 1
        db.commit()
        raise HTTPException(status_code=400, detail="Password reset code is invalid or expired")
    account = db.query(User).filter(User.email == email).first()
    if not account:
        db.delete(reset)
        db.commit()
        raise HTTPException(status_code=400, detail="Password reset code is invalid or expired")
    account.password_hash = hash_password(data.password)
    db.query(AuthSession).filter(AuthSession.username == account.username).delete(synchronize_session=False)
    # A verified password reset is also the safe account-recovery route when a
    # browser was lost or its local storage was cleared.
    db.query(UserDeviceAccess).filter(UserDeviceAccess.username == account.username).delete(synchronize_session=False)
    db.delete(reset)
    db.commit()
    return {"status": "success", "message": "Password updated. Sign in with your email or nickname."}

@app.post("/api/payment/create-session")
async def create_payment_session(
    req: PaymentSessionCreateReq,
    request: Request,
    db: Session = Depends(get_db),
):
    payment_config = get_subscription_payment_config()
    if not payment_config:
        raise HTTPException(
            status_code=503,
            detail="Subscription payments are temporarily unavailable while exact USDC settlement is configured.",
        )
    enforce_request_rate_limit("payment-session", get_request_client_key(request), 12, 15 * 60)
    client_session_id = validate_client_session_id(req.client_session_id)
    base_amount = PLAN_PRICES.get(req.plan)
    if base_amount is None:
        raise HTTPException(status_code=400, detail="Unknown plan")

    amount_usdc = (
        SUBSCRIPTION_TEST_AMOUNT_USDC
        if payment_config["is_testnet"]
        else Decimal(base_amount)
    ).quantize(Decimal("0.01"))
    amount_atomic = int(amount_usdc * Decimal(1_000_000))
    
    now_ts = int(time.time())
    db.query(PaymentCheckoutSession).filter(
        PaymentCheckoutSession.status == "pending",
        PaymentCheckoutSession.created_at < now_ts - PAYMENT_SESSION_TTL_SECONDS,
    ).delete(synchronize_session=False)
    payment_session_id = str(uuid.uuid4())
    db.add(PaymentCheckoutSession(
        id=payment_session_id,
        client_session_id=client_session_id,
        plan=req.plan,
        amount_usdc=format(amount_usdc, ".2f"),
        amount_atomic=str(amount_atomic),
        onboarding=False,
        payment_mode=payment_config["mode"],
        status="pending",
        created_at=now_ts,
    ))
    db.commit()
    return {
        "status": "success",
        "payment_session_id": payment_session_id,
        "payment": {
            "network": payment_config["network"],
            "chain_id": payment_config["chain_id"],
            "asset": "USDC",
            "decimals": 6,
            "contract": payment_config["usdc_contract"],
            "receiver": payment_config["receiver"],
            "amount": format(amount_usdc, ".2f"),
        },
        "plan": req.plan,
        "onboarding": False,
        "is_testnet": payment_config["is_testnet"],
    }

@app.post("/api/payment/confirm")
async def confirm_payment_session(
    req: PaymentSessionConfirmReq,
    request: Request,
    db: Session = Depends(get_db),
):
    enforce_request_rate_limit("payment-confirm", get_request_client_key(request), 30, 15 * 60)
    payment_config = get_subscription_payment_config()
    if not payment_config:
        raise HTTPException(status_code=503, detail="Subscription payments are temporarily unavailable while exact USDC settlement is configured.")
    session_data = db.query(PaymentCheckoutSession).filter(
        PaymentCheckoutSession.id == req.payment_session_id,
    ).first()
    if not session_data:
        raise HTTPException(status_code=404, detail="Payment session not found")
    if session_data.client_session_id != req.client_session_id:
        raise HTTPException(status_code=403, detail="Payment confirmed for a different session")
    if int(time.time()) - session_data.created_at > PAYMENT_SESSION_TTL_SECONDS:
        raise HTTPException(status_code=410, detail="Payment session expired. Create a new payment session.")
    if session_data.status == "paid":
        payment_token = issue_payment_token(
            db=db,
            client_session_id=session_data.client_session_id,
            plan=session_data.plan,
            amount=session_data.amount_usdc,
            onboarding=session_data.onboarding,
            checkout_session_id=session_data.id,
        )
        return {
            "status": "success",
            "payment_token": payment_token,
            "plan": session_data.plan,
            "amount": session_data.amount_usdc,
            "onboarding": session_data.onboarding,
        }
    if session_data.payment_mode != payment_config["mode"]:
        raise HTTPException(status_code=409, detail="Payment session network changed. Create a new payment session.")

    reserve_verified_usdc_payment(
        db,
        req.txid,
        payment_config,
        int(session_data.amount_atomic),
        "subscription_payment",
    )
    session_data.status = "paid"
    session_data.txid = req.txid.strip()
    session_data.paid_at = int(time.time())
    db.commit()
    
    payment_token = issue_payment_token(
        db=db,
        client_session_id=session_data.client_session_id,
        plan=session_data.plan,
        amount=session_data.amount_usdc,
        onboarding=session_data.onboarding,
        checkout_session_id=session_data.id,
    )
    return {
        "status": "success",
        "payment_token": payment_token,
        "plan": session_data.plan,
        "amount": session_data.amount_usdc,
        "onboarding": session_data.onboarding,
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
    user.email = normalize_registration_email(user.email)
    user.username = user.username.strip()
    if not re.fullmatch(r"[A-Za-z0-9_.-]{3,32}", user.username):
        raise HTTPException(status_code=400, detail="Username must contain 3-32 letters, digits, dots, hyphens, or underscores")
    payment_data = db.query(PaymentAccessToken).filter(
        PaymentAccessToken.token_hash == hash_secret(user.payment_token or ""),
    ).first()
    if not payment_data or payment_data.used_at:
        raise HTTPException(status_code=403, detail="Payment not confirmed or token already used")
    if int(time.time()) > payment_data.expires_at:
        db.delete(payment_data)
        db.commit()
        raise HTTPException(status_code=410, detail="Payment confirmation expired. Create a new payment session.")
    if not hmac.compare_digest(payment_data.client_session_id, user.client_session_id):
        raise HTTPException(status_code=403, detail="Payment confirmed for a different session")
    if payment_data.plan != user.plan:
        raise HTTPException(status_code=400, detail="Registration plan does not match the paid one")

    code_data = db.query(EmailVerificationCode).filter(EmailVerificationCode.email == user.email).first()
    if not code_data:
        raise HTTPException(status_code=400, detail="Please request a verification code first!")
    if int(time.time()) > code_data.expires_at:
        db.delete(code_data)
        db.commit()
        raise HTTPException(status_code=400, detail="Verification code expired. Request a new code.")
        
    if code_data.attempts >= 3:
        db.delete(code_data)
        db.commit()
        raise HTTPException(status_code=400, detail="Attempt limit exceeded (3/3). Request a new code.")

    if not re.fullmatch(r"\d{6}", user.code or "") or not verify_password(user.code, code_data.code_hash):
        code_data.attempts += 1
        left_attempts = 3 - code_data.attempts
        db.commit()
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
        onboarding_purchased=payment_data.onboarding,
    )
    db.add(new_user)
    payment_data.used_at = int(time.time())
    if payment_data.checkout_session_id:
        checkout = db.query(PaymentCheckoutSession).filter(
            PaymentCheckoutSession.id == payment_data.checkout_session_id,
        ).first()
        if checkout:
            checkout.status = "registered"
    db.delete(code_data)
    db.commit()
    
    try:
        send_payment_receipt_email(user.email, user.plan, payment_data.amount, "Base Blockchain Gateway")
    except Exception as e:
        logging.warning("Failed to send email: %s", e)

    return {"status": "success", "message": "Registered successfully", "onboarding": payment_data.onboarding}

@app.post("/api/login")
async def login(user: UserLogin, request: Request, db: Session = Depends(get_db)):
    login_value = user.username.strip()
    login_key = f"{get_request_client_key(request)}:{login_value.lower()}"
    enforce_request_rate_limit("login-account", login_key, 8, 15 * 60)
    enforce_request_rate_limit("login-ip", get_request_client_key(request), 30, 15 * 60)
    db_user = db.query(User).filter((User.username == login_value) | (User.email == login_value.lower())).first()
    
    if not db_user or not verify_password(user.password, db_user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid login or password")

    now_ts = int(time.time())
    if is_legacy_password_hash(db_user.password_hash):
        db_user.password_hash = hash_password(user.password)
    if not db_user.subscription_activated_at:
        db_user.subscription_activated_at = now_ts
    db.commit()
    request_host = (request.url.hostname or "").lower()
    authorize_login_device(
        db_user.username,
        user.fingerprint,
        db,
        local_development=request_host in {"127.0.0.1", "localhost", "::1"},
    )

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
    
def ensure_wallet_profile(db: Session, user: User, wallet: Wallet) -> tuple[UserProfile, bool]:
    """Create one owner-scoped local profile for a saved public wallet address.

    The profile contains no private key and does not start a browser session.  It
    only keeps the address, optional proxy configuration, and isolated-profile
    settings that may be used later by an explicit, authenticated action.
    """
    profiles = (
        db.query(UserProfile)
        .filter(UserProfile.user_id == user.id)
        .all()
    )
    wallet_address = wallet.wallet_address.lower()
    profile = next(
        (
            item
            for item in profiles
            if item.evm_wallet_address.lower() == wallet_address
        ),
        None,
    )

    if profile:
        profile.proxy_configuration = wallet.proxy
        profile.status = "active"
        return profile, False

    profile = UserProfile(
        user_id=user.id,
        profile_name=f"wallet-{wallet.id}",
        proxy_configuration=wallet.proxy,
        evm_wallet_address=wallet.wallet_address,
        status="active",
    )
    db.add(profile)
    db.flush()
    return profile, True


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

    new_wallet = Wallet(
        username=wallet.username,
        wallet_address=wallet_address,
        label=wallet_label or None,
        proxy=normalize_proxy_configuration(wallet.proxy),
    )
    db.add(new_wallet)
    db.flush()
    profile, _ = ensure_wallet_profile(db, user, new_wallet)
    db.commit()
    return {
        "status": "success",
        "message": "Wallet and local profile added",
        "wallet_id": new_wallet.id,
        "profile_id": profile.id,
    }

@app.post("/api/wallets/buy-slot")
async def buy_extra_slot(req: BuyExtraSlotReq, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    require_owned_username(req.username, current_user)
    raise HTTPException(
        status_code=503,
        detail="Additional slots are temporarily unavailable. Choose a subscription plan with the required wallet limit.",
    )

@app.post("/api/wallets/add-batch")
async def add_wallet_batch(
    payload: WalletBatchAddRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not payload.wallet_addresses or len(payload.wallet_addresses) > 30:
        raise HTTPException(status_code=422, detail="Choose between 1 and 30 wallet accounts")
    addresses = []
    seen = set()
    for raw_address in payload.wallet_addresses:
        address = str(raw_address).strip()
        if not is_valid_evm_address(address):
            raise HTTPException(status_code=422, detail="MetaMask returned an invalid wallet address")
        lowered = address.lower()
        if lowered not in seen:
            seen.add(lowered)
            addresses.append(address)

    existing_wallets = db.query(Wallet).filter(Wallet.username == current_user.username).all()
    existing_addresses = {wallet.wallet_address.lower() for wallet in existing_wallets}
    new_addresses = [address for address in addresses if address.lower() not in existing_addresses]
    max_allowed = BASE_SLOT_LIMITS.get(current_user.subscription_plan, 5) + current_user.extra_slots
    if len(existing_wallets) + len(new_addresses) > max_allowed:
        raise HTTPException(
            status_code=409,
            detail=f"Selected wallets exceed your plan limit of {max_allowed} slots",
        )
    profiles_created = 0
    for address in new_addresses:
        wallet = Wallet(
            username=current_user.username,
            wallet_address=address,
            label=None,
            proxy=None,
        )
        db.add(wallet)
        db.flush()
        _profile, created = ensure_wallet_profile(db, current_user, wallet)
        profiles_created += int(created)
    if new_addresses:
        db.commit()
    return {
        "status": "success",
        "added": len(new_addresses),
        "already_saved": len(addresses) - len(new_addresses),
        "profiles_created": profiles_created,
    }


@app.post("/api/wallets/{wallet_id}/profile")
async def create_wallet_profile(
    wallet_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a missing local profile for one existing saved wallet."""
    wallet = db.query(Wallet).filter(
        Wallet.id == wallet_id,
        Wallet.username == current_user.username,
    ).first()
    if not wallet:
        raise HTTPException(status_code=404, detail="Wallet not found")

    profile, created = ensure_wallet_profile(db, current_user, wallet)
    db.commit()
    return {
        "status": "success",
        "profile_id": profile.id,
        "created": created,
        "message": "Local profile ready",
    }

@app.patch("/api/wallets/{wallet_id}/label")
async def update_wallet_label(
    wallet_id: int,
    payload: WalletLabelUpdateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    wallet = db.query(Wallet).filter(
        Wallet.id == wallet_id,
        Wallet.username == current_user.username,
    ).first()
    if not wallet:
        raise HTTPException(status_code=404, detail="Wallet not found")
    label = payload.label.strip()
    if not label or len(label) > 40 or any(ord(char) < 32 for char in label):
        raise HTTPException(status_code=422, detail="Wallet label is invalid")
    wallet.label = label
    db.commit()
    return {"status": "success", "label": wallet.label}

@app.get("/api/wallets/{wallet_id}/health")
async def get_wallet_health(wallet_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    wallet = db.query(Wallet).filter(
        Wallet.id == wallet_id,
        Wallet.username == current_user.username,
    ).first()
    if not wallet or not is_valid_evm_address(wallet.wallet_address):
        raise HTTPException(status_code=404, detail="Wallet not found")

    cache_key = f"{current_user.username}:{wallet.id}"
    now_ts = int(time.time())
    cached = wallet_health_cache.get(cache_key)
    if cached and cached["expires_at"] > now_ts:
        return {"status": "success", **cached["data"], "cached": True}

    try:
        web3 = Web3(Web3.HTTPProvider(BASE_RPC_URL, request_kwargs={"timeout": 10}))
        if not web3.is_connected():
            raise RuntimeError("Base RPC is unavailable")
        address = Web3.to_checksum_address(wallet.wallet_address)
        balance_wei = web3.eth.get_balance(address)
        transaction_count = web3.eth.get_transaction_count(address, "latest")
        balance_eth = format(Web3.from_wei(balance_wei, "ether"), ".6f").rstrip("0").rstrip(".") or "0"
        try:
            usdc_contract = web3.eth.contract(
                address=Web3.to_checksum_address(BASE_USDC_ADDRESS),
                abi=ERC20_BALANCE_OF_ABI,
            )
            usdc_raw = usdc_contract.functions.balanceOf(address).call()
            usdc_balance = format(usdc_raw / (10 ** BASE_USDC_DECIMALS), ".6f").rstrip("0").rstrip(".") or "0"
        except Exception:
            usdc_balance = None
    except Exception:
        raise HTTPException(status_code=503, detail="Base public data is temporarily unavailable")

    health_data = {
        "network": "Base Mainnet",
        "balance_eth": balance_eth,
        "usdc_balance": usdc_balance,
        "transaction_count": transaction_count,
        "checked_at": now_ts,
    }
    wallet_health_cache[cache_key] = {"data": health_data, "expires_at": now_ts + WALLET_HEALTH_CACHE_TTL_SECONDS}
    return {"status": "success", **health_data, "cached": False}

@app.get("/api/wallets/{wallet_id}/network-balance/{network}")
async def get_wallet_network_balance(
    wallet_id: int,
    network: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return public balances for a saved EVM address; never handles private keys."""
    wallet = db.query(Wallet).filter(
        Wallet.id == wallet_id,
        Wallet.username == current_user.username,
    ).first()
    if not wallet or not is_valid_evm_address(wallet.wallet_address):
        raise HTTPException(status_code=404, detail="Wallet not found")

    config = PUBLIC_NETWORK_BALANCE_CONFIG.get(network)
    if not config:
        raise HTTPException(status_code=422, detail="Public balance reading is not configured for this network")

    cache_key = f"{current_user.username}:{wallet.id}:{network}"
    now_ts = int(time.time())
    cached = network_balance_cache.get(cache_key)
    if cached and cached["expires_at"] > now_ts:
        return {"status": "success", **cached["data"], "cached": True}

    try:
        web3 = Web3(Web3.HTTPProvider(config["rpc_url"], request_kwargs={"timeout": 10}))
        if not web3.is_connected():
            raise RuntimeError(f"{network} RPC is unavailable")
        address = Web3.to_checksum_address(wallet.wallet_address)
        native_raw = web3.eth.get_balance(address)
        native_balance = format(Web3.from_wei(native_raw, "ether"), ".6f").rstrip("0").rstrip(".") or "0"
        usdc_balance = None
        try:
            usdc_address = config.get("usdc_address")
            if not usdc_address:
                raise RuntimeError("USDC is not configured for this network")
            usdc_contract = web3.eth.contract(
                address=Web3.to_checksum_address(usdc_address),
                abi=ERC20_BALANCE_OF_ABI,
            )
            usdc_raw = usdc_contract.functions.balanceOf(address).call()
            usdc_balance = format(
                usdc_raw / (10 ** config["usdc_decimals"]), ".6f"
            ).rstrip("0").rstrip(".") or "0"
        except Exception:
            # The native balance is still useful even if the token call is unavailable.
            usdc_balance = None
    except Exception:
        raise HTTPException(status_code=503, detail=f"{network} public data is temporarily unavailable")

    visible_assets, price_available, native_gas_reserve = get_displayable_wallet_assets(
        native_balance,
        config["native_symbol"],
        usdc_balance,
        config["gas_reserve"],
    )
    balance_data = {
        "network": network,
        "native_symbol": config["native_symbol"],
        "native_balance": native_balance,
        "usdc_balance": usdc_balance,
        "visible_assets": visible_assets,
        "price_available": price_available,
        "native_gas_reserve": config["gas_reserve"],
        "native_gas_reserve_met": float(native_balance) >= native_gas_reserve,
        "checked_at": now_ts,
    }
    network_balance_cache[cache_key] = {
        "data": balance_data,
        "expires_at": now_ts + WALLET_HEALTH_CACHE_TTL_SECONDS,
    }
    return {"status": "success", **balance_data, "cached": False}

@app.get("/api/universal-bridge/networks")
async def get_universal_bridge_networks(current_user: User = Depends(get_current_user)):
    """Return only networks that can be switched and signed by the connected EVM wallet."""
    return {
        "status": "success",
        "networks": [
            {"key": name, "chain_id": config["chain_id"], "native_symbol": config["native_symbol"]}
            for name, config in LIFI_EVM_NETWORKS.items()
        ],
    }

@app.get("/api/defi/aave-base-positions/{wallet_id}")
async def get_aave_base_positions(
    wallet_id: int,
    refresh: bool = False,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return the user's Aave V3 Base positions through official read-only calls."""
    wallet = db.query(Wallet).filter(
        Wallet.id == wallet_id,
        Wallet.username == current_user.username,
    ).first()
    if not wallet:
        raise HTTPException(status_code=404, detail="Wallet not found")
    positions = get_aave_v3_base_positions(wallet.wallet_address, refresh=refresh)
    return {
        "status": "success",
        "protocol": "Aave V3",
        "network": "Base",
        "wallet_address": wallet.wallet_address,
        "positions": positions,
        "read_only": True,
        "checked_at": int(time.time()),
    }

@app.post("/api/defi/aave-base/usdc-supply-quote")
async def get_aave_base_usdc_supply_quote(
    payload: AaveSupplyQuoteRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Prepare only the official Aave V3 Base USDC supply call; never sign it here."""
    wallet_address = get_saved_base_wallet(db, current_user.username, payload.wallet_address)
    quote = get_aave_v3_base_usdc_supply_quote(wallet_address, payload.amount)
    now_ts = int(time.time())
    quote_id = secrets.token_urlsafe(24)
    aave_supply_quote_sessions[quote_id] = {
        "username": current_user.username,
        "wallet_address": wallet_address.lower(),
        "amount_atomic": quote["amount_atomic"],
        "created_at": now_ts,
    }
    for session_id, session in list(aave_supply_quote_sessions.items()):
        if session["created_at"] < now_ts - AAVE_SUPPLY_QUOTE_TTL_SECONDS:
            aave_supply_quote_sessions.pop(session_id, None)
    return {
        "status": "success",
        "quote_id": quote_id,
        "expires_in": AAVE_SUPPLY_QUOTE_TTL_SECONDS,
        **quote,
    }

@app.post("/api/defi/aave-base/supply-submissions")
async def save_aave_base_supply_submission(
    payload: AaveSupplySubmissionRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Notify about a wallet-submitted Aave supply after validating its short-lived quote session."""
    quote_id = payload.quote_id.strip()
    session = aave_supply_quote_sessions.get(quote_id)
    now_ts = int(time.time())
    if (
        not session
        or session["username"] != current_user.username
        or session["created_at"] < now_ts - AAVE_SUPPLY_QUOTE_TTL_SECONDS
    ):
        aave_supply_quote_sessions.pop(quote_id, None)
        raise HTTPException(status_code=410, detail="The Aave supply request expired. Check the amount again")
    tx_hash = payload.tx_hash.strip()
    if not re.fullmatch(r"0x[a-fA-F0-9]{64}", tx_hash):
        raise HTTPException(status_code=422, detail="Transaction hash is invalid")

    verified = False
    try:
        web3 = Web3(Web3.HTTPProvider(BASE_RPC_URL, request_kwargs={"timeout": 8}))
        transaction = web3.eth.get_transaction(tx_hash)
        raw_input = transaction.get("input") or transaction.get("data") or ""
        tx_input = raw_input.hex() if hasattr(raw_input, "hex") else str(raw_input)
        if not tx_input.startswith("0x"):
            tx_input = f"0x{tx_input}"
        expected_input = build_aave_supply_calldata(
            BASE_USDC_ADDRESS,
            session["amount_atomic"],
            session["wallet_address"],
        )
        verified = (
            str(transaction.get("from") or "").lower() == session["wallet_address"]
            and str(transaction.get("to") or "").lower() == AAVE_V3_BASE_POOL.lower()
            and tx_input.lower() == expected_input.lower()
            and int(transaction.get("value") or 0) == 0
        )
    except Exception:
        verified = False

    subscription = get_telegram_subscription(db, current_user.username)
    telegram_sent = False
    record = None
    if verified:
        record = save_verified_aave_operation(
            db,
            current_user.username,
            session["wallet_address"],
            "supply",
            session["amount_atomic"],
            tx_hash,
            now_ts,
        )
    if verified and subscription and subscription.notify_defi_supply_submitted:
        amount = record.amount if record else format_token_amount(int(session["amount_atomic"]), BASE_USDC_DECIMALS)
        messages = {
            "ru": f"💧 *AIRDROP-X: USDC внесён в Aave*\nСеть: `Base`\nСумма: `{amount} USDC`\nTX: `{tx_hash}`",
            "en": f"💧 *AIRDROP-X: USDC supplied to Aave*\nNetwork: `Base`\nAmount: `{amount} USDC`\nTX: `{tx_hash}`",
            "zh": f"💧 *AIRDROP-X：USDC 已存入 Aave*\n网络：`Base`\n数量：`{amount} USDC`\n交易：`{tx_hash}`",
        }
        telegram_sent = send_telegram_notification(
            subscription.chat_id,
            messages[normalize_language(subscription.language)],
        )
    aave_supply_quote_sessions.pop(quote_id, None)
    return {
        "status": "success",
        "verified": verified,
        "telegram_sent": telegram_sent,
        "record": serialize_defi_operation_record(record) if record else None,
    }

@app.post("/api/defi/aave-base/usdc-withdraw-quote")
async def get_aave_base_usdc_withdraw_quote(
    payload: AaveWithdrawQuoteRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Prepare only the official Aave V3 Base USDC withdraw call; never sign it here."""
    wallet_address = get_saved_base_wallet(db, current_user.username, payload.wallet_address)
    quote = get_aave_v3_base_usdc_withdraw_quote(wallet_address, payload.amount)
    now_ts = int(time.time())
    quote_id = secrets.token_urlsafe(24)
    aave_withdraw_quote_sessions[quote_id] = {
        "username": current_user.username,
        "wallet_address": wallet_address.lower(),
        "amount_atomic": quote["amount_atomic"],
        "created_at": now_ts,
    }
    for session_id, session in list(aave_withdraw_quote_sessions.items()):
        if session["created_at"] < now_ts - AAVE_SUPPLY_QUOTE_TTL_SECONDS:
            aave_withdraw_quote_sessions.pop(session_id, None)
    return {
        "status": "success",
        "quote_id": quote_id,
        "expires_in": AAVE_SUPPLY_QUOTE_TTL_SECONDS,
        **quote,
    }

@app.post("/api/defi/aave-base/withdraw-submissions")
async def save_aave_base_withdraw_submission(
    payload: AaveWithdrawSubmissionRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Notify about an on-chain-verified Aave USDC withdrawal submitted by the user's wallet."""
    quote_id = payload.quote_id.strip()
    session = aave_withdraw_quote_sessions.get(quote_id)
    now_ts = int(time.time())
    if (
        not session
        or session["username"] != current_user.username
        or session["created_at"] < now_ts - AAVE_SUPPLY_QUOTE_TTL_SECONDS
    ):
        aave_withdraw_quote_sessions.pop(quote_id, None)
        raise HTTPException(status_code=410, detail="The Aave withdrawal request expired. Check the amount again")
    tx_hash = payload.tx_hash.strip()
    if not re.fullmatch(r"0x[a-fA-F0-9]{64}", tx_hash):
        raise HTTPException(status_code=422, detail="Transaction hash is invalid")

    verified = False
    try:
        web3 = Web3(Web3.HTTPProvider(BASE_RPC_URL, request_kwargs={"timeout": 8}))
        transaction = web3.eth.get_transaction(tx_hash)
        raw_input = transaction.get("input") or transaction.get("data") or ""
        tx_input = raw_input.hex() if hasattr(raw_input, "hex") else str(raw_input)
        if not tx_input.startswith("0x"):
            tx_input = f"0x{tx_input}"
        expected_input = build_aave_withdraw_calldata(
            BASE_USDC_ADDRESS,
            session["amount_atomic"],
            session["wallet_address"],
        )
        verified = (
            str(transaction.get("from") or "").lower() == session["wallet_address"]
            and str(transaction.get("to") or "").lower() == AAVE_V3_BASE_POOL.lower()
            and tx_input.lower() == expected_input.lower()
            and int(transaction.get("value") or 0) == 0
        )
    except Exception:
        verified = False

    subscription = get_telegram_subscription(db, current_user.username)
    telegram_sent = False
    record = None
    if verified:
        record = save_verified_aave_operation(
            db,
            current_user.username,
            session["wallet_address"],
            "withdraw",
            session["amount_atomic"],
            tx_hash,
            now_ts,
        )
    if verified and subscription and subscription.notify_defi_withdraw_submitted:
        amount = record.amount if record else format_token_amount(int(session["amount_atomic"]), BASE_USDC_DECIMALS)
        messages = {
            "ru": f"💧 *AIRDROP-X: USDC выведен из Aave*\nСеть: `Base`\nСумма: `{amount} USDC`\nTX: `{tx_hash}`",
            "en": f"💧 *AIRDROP-X: USDC withdrawn from Aave*\nNetwork: `Base`\nAmount: `{amount} USDC`\nTX: `{tx_hash}`",
            "zh": f"💧 *AIRDROP-X：USDC 已从 Aave 提取*\n网络：`Base`\n数量：`{amount} USDC`\n交易：`{tx_hash}`",
        }
        telegram_sent = send_telegram_notification(
            subscription.chat_id,
            messages[normalize_language(subscription.language)],
        )
    aave_withdraw_quote_sessions.pop(quote_id, None)
    return {
        "status": "success",
        "verified": verified,
        "telegram_sent": telegram_sent,
        "record": serialize_defi_operation_record(record) if record else None,
    }

@app.get("/api/defi/aave-base/history")
async def get_aave_base_history(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List verified Aave actions for this user and refresh pending Base receipts."""
    records = db.query(DefiOperationRecord).filter(
        DefiOperationRecord.username == current_user.username,
    ).order_by(DefiOperationRecord.created_at.desc()).limit(20).all()
    refresh_defi_operation_statuses(db, records)
    return {"status": "success", "records": [serialize_defi_operation_record(record) for record in records]}

@app.get("/api/universal-bridge/tokens/{network}")
async def get_universal_bridge_tokens(network: str, current_user: User = Depends(get_current_user)):
    return {"status": "success", "network": network, "tokens": get_lifi_tokens(network)}

@app.get("/api/wallets/{wallet_id}/universal-bridge-balance/{network}/{token_address}")
async def get_universal_bridge_token_balance(
    wallet_id: int,
    network: str,
    token_address: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Read a selected LI.FI-listed token balance; this endpoint never signs or transfers."""
    wallet = db.query(Wallet).filter(
        Wallet.id == wallet_id,
        Wallet.username == current_user.username,
    ).first()
    if not wallet or not is_valid_evm_address(wallet.wallet_address):
        raise HTTPException(status_code=404, detail="Wallet not found")
    network_config = LIFI_EVM_NETWORKS.get(network)
    if not network_config:
        raise HTTPException(status_code=422, detail="This network is not supported by the universal bridge")
    token = get_lifi_token(network, token_address)
    try:
        web3 = Web3(Web3.HTTPProvider(network_config["rpc_url"], request_kwargs={"timeout": 10}))
        if not web3.is_connected():
            raise RuntimeError("RPC unavailable")
        owner = Web3.to_checksum_address(wallet.wallet_address)
        if token["address"] == LIFI_NATIVE_TOKEN_ADDRESS:
            raw_balance = int(web3.eth.get_balance(owner))
            gas_reserve = PUBLIC_NETWORK_BALANCE_CONFIG.get(network, {}).get("gas_reserve", "0")
            reserve_whole, _, reserve_fraction = str(gas_reserve).partition(".")
            reserve_atomic = (
                int(reserve_whole or "0") * (10 ** token["decimals"])
                + int((reserve_fraction + ("0" * token["decimals"]))[:token["decimals"]] or "0")
            )
        else:
            contract = web3.eth.contract(
                address=Web3.to_checksum_address(token["address"]),
                abi=ERC20_BALANCE_OF_ABI,
            )
            raw_balance = int(contract.functions.balanceOf(owner).call())
            gas_reserve = "0"
            reserve_atomic = 0
    except Exception:
        raise HTTPException(status_code=503, detail=f"{network} public token data is temporarily unavailable")

    balance = format_token_amount(raw_balance, token["decimals"])
    available_atomic = max(raw_balance - reserve_atomic, 0)
    available_to_send = format_token_amount(available_atomic, token["decimals"])
    unit_price_usd = token.get("price_usd")
    estimated_usd = (raw_balance / (10 ** token["decimals"])) * unit_price_usd if unit_price_usd is not None else None
    return {
        "status": "success",
        "network": network,
        "token": token,
        "amount": balance,
        "available_to_send": available_to_send,
        "gas_reserve": gas_reserve,
        "unit_price_usd": unit_price_usd,
        "estimated_usd": round(estimated_usd, 4) if estimated_usd is not None else None,
        "is_dust": estimated_usd is not None and estimated_usd < ASSET_DISPLAY_THRESHOLD_USD,
    }

@app.post("/api/universal-bridge/quote")
async def get_universal_bridge_quote(
    payload: UniversalBridgeQuoteRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get one current route. The returned request is validated before the wallet ever sees it."""
    from_network = payload.from_network.strip()
    to_network = payload.to_network.strip()
    from_config = LIFI_EVM_NETWORKS.get(from_network)
    to_config = LIFI_EVM_NETWORKS.get(to_network)
    if not from_config or not to_config:
        raise HTTPException(status_code=422, detail="Choose supported EVM networks")
    wallet_address = get_saved_base_wallet(db, current_user.username, payload.wallet_address)
    from_token = get_lifi_token(from_network, payload.from_token_address)
    to_token = get_lifi_token(to_network, payload.to_token_address)
    normalized_amount, from_amount_atomic = normalize_token_amount(payload.amount, from_token["decimals"])
    params = {
        "fromChain": str(from_config["chain_id"]),
        "toChain": str(to_config["chain_id"]),
        "fromToken": from_token["address"],
        "toToken": to_token["address"],
        "fromAmount": from_amount_atomic,
        "fromAddress": wallet_address,
        "toAddress": wallet_address,
        "slippage": "0.005",
        "order": "CHEAPEST",
    }
    try:
        response = requests.get(
            f"{LIFI_API_URL}/quote",
            params=params,
            headers=lifi_headers(),
            timeout=20,
        )
    except requests.RequestException:
        raise HTTPException(status_code=503, detail="Universal bridge quote service is temporarily unavailable")
    if not response.ok:
        logging.warning("LI.FI quote rejected with status %s", response.status_code)
        raise HTTPException(status_code=422, detail="No current route is available for this pair and amount")
    try:
        quote = response.json()
        estimate = quote["estimate"]
        transaction = validate_lifi_transaction_request(
            quote["transactionRequest"], from_config["chain_id"], wallet_address,
        )
        to_amount = str(estimate["toAmount"])
        to_amount_min = str(estimate["toAmountMin"])
        if not re.fullmatch(r"\d+", to_amount) or not re.fullmatch(r"\d+", to_amount_min):
            raise ValueError("Invalid output amount")
    except (KeyError, TypeError, ValueError, HTTPException):
        raise HTTPException(status_code=502, detail="Universal bridge returned an invalid quote")

    approval_address = str(estimate.get("approvalAddress", "")).strip()
    if from_token["address"] != LIFI_NATIVE_TOKEN_ADDRESS and not is_valid_evm_address(approval_address):
        raise HTTPException(status_code=502, detail="Universal bridge returned an invalid token approval address")
    fee_costs = estimate.get("feeCosts") if isinstance(estimate.get("feeCosts"), list) else []
    gas_costs = estimate.get("gasCosts") if isinstance(estimate.get("gasCosts"), list) else []
    return {
        "status": "success",
        "expires_in": LIFI_QUOTE_TTL_SECONDS,
        "from_network": from_network,
        "to_network": to_network,
        "from_token": from_token,
        "to_token": to_token,
        "amount_in": normalized_amount,
        "amount_in_atomic": from_amount_atomic,
        "amount_out": format_token_amount(int(to_amount), to_token["decimals"]),
        "amount_out_min": format_token_amount(int(to_amount_min), to_token["decimals"]),
        "tool": str((quote.get("toolDetails") or {}).get("name") or quote.get("tool") or "LI.FI")[:80],
        "tool_key": str(quote.get("tool") or "")[:80],
        "estimated_seconds": (estimate.get("executionDuration") or 0),
        "fee_costs": fee_costs[:8],
        "gas_costs": gas_costs[:8],
        "approval": {
            "required": from_token["address"] != LIFI_NATIVE_TOKEN_ADDRESS,
            "spender": approval_address if from_token["address"] != LIFI_NATIVE_TOKEN_ADDRESS else "",
            "amount_atomic": from_amount_atomic,
        },
        "transaction": transaction,
        "transaction_id": str(quote.get("transactionId", ""))[:160],
    }

@app.get("/api/universal-bridge/status/{tx_hash}")
async def get_universal_bridge_status(
    tx_hash: str,
    from_network: str,
    to_network: str,
    bridge: str = "",
    current_user: User = Depends(get_current_user),
):
    if not re.fullmatch(r"0x[a-fA-F0-9]{64}", tx_hash) or from_network not in LIFI_EVM_NETWORKS or to_network not in LIFI_EVM_NETWORKS:
        raise HTTPException(status_code=422, detail="Invalid bridge status request")
    params = {
        "txHash": tx_hash,
        "fromChain": str(LIFI_EVM_NETWORKS[from_network]["chain_id"]),
        "toChain": str(LIFI_EVM_NETWORKS[to_network]["chain_id"]),
    }
    if bridge and re.fullmatch(r"[A-Za-z0-9_-]{1,80}", bridge):
        params["bridge"] = bridge
    try:
        response = requests.get(f"{LIFI_API_URL}/status", params=params, headers=lifi_headers(), timeout=15)
        if not response.ok:
            raise requests.RequestException("status unavailable")
        data = response.json()
    except (requests.RequestException, ValueError):
        raise HTTPException(status_code=503, detail="Universal bridge status is temporarily unavailable")
    return {
        "status": "success",
        "substatus": str(data.get("substatus", ""))[:80],
        "sending": data.get("sending") if isinstance(data.get("sending"), dict) else {},
        "receiving": data.get("receiving") if isinstance(data.get("receiving"), dict) else {},
        "lifi_status": str(data.get("status", ""))[:80],
    }

def serialize_universal_bridge_record(record: UniversalBridgeRecord) -> Dict[str, Any]:
    return {
        "id": record.id,
        "wallet_address": record.wallet_address,
        "from_network": record.from_network,
        "to_network": record.to_network,
        "from_symbol": record.from_symbol,
        "to_symbol": record.to_symbol,
        "amount_in": record.amount_in,
        "amount_out": record.amount_out,
        "amount_out_min": record.amount_out_min,
        "provider": record.provider,
        "bridge": record.bridge,
        "tx_hash": record.tx_hash,
        "status": record.status,
        "provider_status": record.provider_status,
        "created_at": record.created_at,
        "updated_at": record.updated_at,
    }

def normalize_universal_bridge_status(lifi_status: str, substatus: str) -> str:
    provider_state = f"{lifi_status} {substatus}".upper()
    if any(word in provider_state for word in ("DONE", "COMPLETED", "SUCCESS")):
        return "completed"
    if any(word in provider_state for word in ("FAILED", "INVALID", "REFUNDED")):
        return "failed"
    if provider_state and "NOT_FOUND" not in provider_state:
        return "in_progress"
    return "submitted"

def notify_universal_bridge_status(subscription: Optional[TelegramSubscription], record: UniversalBridgeRecord) -> bool:
    if not subscription or record.status not in {"completed", "failed"}:
        return False
    if record.status == "completed" and not subscription.notify_transaction_final:
        return False
    if record.status == "failed" and not subscription.notify_errors:
        return False
    route = f"{record.from_network} → {record.to_network}"
    amount = f"{record.amount_in} {record.from_symbol}"
    expected = f"{record.amount_out or '—'} {record.to_symbol}"
    provider_status = record.provider_status or record.status
    messages = {
        "ru": (
            f"{'✅' if record.status == 'completed' else '⚠️'} *AIRDROP-X: статус моста*\n"
            f"Маршрут: `{route}`\nОтправлено: `{amount}`\nОжидалось: `{expected}`\nСтатус: `{provider_status}`\nTX: `{record.tx_hash}`"
        ),
        "en": (
            f"{'✅' if record.status == 'completed' else '⚠️'} *AIRDROP-X: bridge status*\n"
            f"Route: `{route}`\nSent: `{amount}`\nExpected: `{expected}`\nStatus: `{provider_status}`\nTX: `{record.tx_hash}`"
        ),
        "zh": (
            f"{'✅' if record.status == 'completed' else '⚠️'} *AIRDROP-X：跨链状态*\n"
            f"路线：`{route}`\n已发送：`{amount}`\n预计：`{expected}`\n状态：`{provider_status}`\n交易：`{record.tx_hash}`"
        ),
    }
    return send_telegram_notification(subscription.chat_id, messages[normalize_language(subscription.language)])

@app.post("/api/universal-bridge/submissions")
async def save_universal_bridge_submission(
    payload: UniversalBridgeSubmissionRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from_network = payload.from_network.strip()
    to_network = payload.to_network.strip()
    if from_network not in LIFI_EVM_NETWORKS or to_network not in LIFI_EVM_NETWORKS:
        raise HTTPException(status_code=422, detail="Choose supported EVM networks")
    wallet_address = get_saved_base_wallet(db, current_user.username, payload.wallet_address)
    tx_hash = payload.tx_hash.strip()
    if not re.fullmatch(r"0x[a-fA-F0-9]{64}", tx_hash):
        raise HTTPException(status_code=422, detail="Transaction hash is invalid")

    existing = db.query(UniversalBridgeRecord).filter(UniversalBridgeRecord.tx_hash == tx_hash).first()
    if existing:
        if existing.username != current_user.username:
            raise HTTPException(status_code=409, detail="Transaction is already recorded")
        return {"status": "success", "record": serialize_universal_bridge_record(existing), "already_saved": True}

    from_token = get_lifi_token(from_network, payload.from_token_address)
    to_token = get_lifi_token(to_network, payload.to_token_address)
    amount_in, _ = normalize_token_amount(payload.amount_in, from_token["decimals"])
    amount_out, _ = normalize_token_amount(payload.amount_out, to_token["decimals"])
    amount_out_min, _ = normalize_token_amount(payload.amount_out_min, to_token["decimals"])
    provider = re.sub(r"[^A-Za-z0-9 ._-]", "", payload.provider).strip()[:80] or "LI.FI"
    bridge = re.sub(r"[^A-Za-z0-9_-]", "", payload.bridge).strip()[:80] or None
    now_ts = int(time.time())
    record = UniversalBridgeRecord(
        username=current_user.username,
        wallet_address=wallet_address,
        from_network=from_network,
        to_network=to_network,
        from_symbol=from_token["symbol"][:24],
        to_symbol=to_token["symbol"][:24],
        amount_in=amount_in,
        amount_out=amount_out,
        amount_out_min=amount_out_min,
        provider=provider,
        bridge=bridge,
        tx_hash=tx_hash,
        status="submitted",
        provider_status="SUBMITTED",
        created_at=now_ts,
        updated_at=now_ts,
    )
    db.add(record)
    db.commit()
    db.refresh(record)

    subscription = get_telegram_subscription(db, current_user.username)
    telegram_sent = False
    if subscription and subscription.notify_transaction_submitted:
        route = f"{from_network} → {to_network}"
        amount = f"{amount_in} {from_token['symbol']}"
        messages = {
            "ru": f"🌉 *AIRDROP-X: мост отправлен*\nМаршрут: `{route}`\nСумма: `{amount}`\nTX: `{tx_hash}`",
            "en": f"🌉 *AIRDROP-X: bridge submitted*\nRoute: `{route}`\nAmount: `{amount}`\nTX: `{tx_hash}`",
            "zh": f"🌉 *AIRDROP-X：跨链已提交*\n路线：`{route}`\n金额：`{amount}`\n交易：`{tx_hash}`",
        }
        telegram_sent = send_telegram_notification(
            subscription.chat_id,
            messages[normalize_language(subscription.language)],
        )
    return {"status": "success", "record": serialize_universal_bridge_record(record), "telegram_sent": telegram_sent}

@app.get("/api/universal-bridge/history")
async def get_universal_bridge_history(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    records = db.query(UniversalBridgeRecord).filter(
        UniversalBridgeRecord.username == current_user.username,
    ).order_by(UniversalBridgeRecord.created_at.desc()).limit(20).all()
    return {"status": "success", "records": [serialize_universal_bridge_record(record) for record in records]}

@app.post("/api/universal-bridge/history/{record_id}/refresh")
async def refresh_universal_bridge_record(
    record_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    record = db.query(UniversalBridgeRecord).filter(
        UniversalBridgeRecord.id == record_id,
        UniversalBridgeRecord.username == current_user.username,
    ).first()
    if not record:
        raise HTTPException(status_code=404, detail="Bridge record not found")
    params = {
        "txHash": record.tx_hash,
        "fromChain": str(LIFI_EVM_NETWORKS[record.from_network]["chain_id"]),
        "toChain": str(LIFI_EVM_NETWORKS[record.to_network]["chain_id"]),
    }
    if record.bridge:
        params["bridge"] = record.bridge
    try:
        response = requests.get(f"{LIFI_API_URL}/status", params=params, headers=lifi_headers(), timeout=15)
        if not response.ok:
            raise requests.RequestException("status unavailable")
        data = response.json()
    except (requests.RequestException, ValueError):
        return {"status": "success", "record": serialize_universal_bridge_record(record), "provider_available": False}

    lifi_status = str(data.get("status", ""))[:80]
    substatus = str(data.get("substatus", ""))[:80]
    provider_status = substatus or lifi_status or "PENDING"
    previous_status = record.status
    record.status = normalize_universal_bridge_status(lifi_status, substatus)
    record.provider_status = provider_status
    record.updated_at = int(time.time())
    db.commit()
    db.refresh(record)

    telegram_sent = False
    if record.status != previous_status:
        telegram_sent = notify_universal_bridge_status(get_telegram_subscription(db, current_user.username), record)
    return {"status": "success", "record": serialize_universal_bridge_record(record), "provider_available": True, "telegram_sent": telegram_sent}

@app.get("/api/wallets/{username}")
async def get_wallets(username: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    require_owned_username(username, current_user)
    wallets = db.query(Wallet).filter(Wallet.username == username).all()
    profiles = (
        db.query(UserProfile)
        .filter(UserProfile.user_id == current_user.id)
        .all()
    )
    profiles_by_address = {
        profile.evm_wallet_address.lower(): profile
        for profile in profiles
    }
    user = db.query(User).filter(User.username == username).first()
    plan = user.subscription_plan if user else "Standard"
    extra = user.extra_slots if user else 0
    max_allowed = BASE_SLOT_LIMITS.get(plan, 5) + extra
    
    return {
        "status": "success", 
        "plan": plan,
        "max_slots": max_allowed,
        "wallets": [
            {
                "id": wallet.id,
                "wallet_address": wallet.wallet_address,
                "label": wallet.label,
                "has_proxy": bool(wallet.proxy),
                "profile_id": (
                    profiles_by_address[wallet.wallet_address.lower()].id
                    if wallet.wallet_address.lower() in profiles_by_address
                    else None
                ),
                "profile_status": (
                    profiles_by_address[wallet.wallet_address.lower()].status
                    if wallet.wallet_address.lower() in profiles_by_address
                    else None
                ),
                "profile_has_proxy": bool(
                    profiles_by_address.get(wallet.wallet_address.lower())
                    and profiles_by_address[wallet.wallet_address.lower()].proxy_configuration
                ),
            }
            for wallet in wallets
        ]
    }

@app.post("/api/wallets/test-proxy/{wallet_id}")
async def test_wallet_proxy(
    wallet_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    enforce_request_rate_limit(
        "proxy-test",
        f"{current_user.username}:{get_request_client_key(request)}",
        10,
        60,
    )
    wallet = db.query(Wallet).filter(Wallet.id == wallet_id, Wallet.username == current_user.username).first()
    if not wallet or not wallet.proxy:
        raise HTTPException(status_code=404, detail="Wallet or proxy not found")
    
    proxy_raw = normalize_proxy_configuration(wallet.proxy)
    
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
    except Exception:
        return {"status": "error", "message": "Proxy connection failed"}

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

@app.get("/api/action-reminder")
async def get_action_reminder(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    reminder = db.query(ActionReminder).filter(ActionReminder.username == current_user.username).first()
    subscription = get_telegram_subscription(db, current_user.username)
    if not reminder:
        return {
            "status": "success",
            "reminder": {
                "network": "Base",
                "day_of_week": "Mon",
                "time_of_day": "18:00",
                "enabled": False,
                "telegram_enabled": True,
            },
            "telegram_linked": bool(subscription),
        }
    return {
        "status": "success",
        "reminder": {
            "network": reminder.network,
            "day_of_week": reminder.day_of_week,
            "time_of_day": reminder.time_of_day,
            "enabled": reminder.enabled,
            "telegram_enabled": reminder.telegram_enabled,
        },
        "telegram_linked": bool(subscription),
    }

@app.post("/api/action-reminder")
async def save_action_reminder(
    payload: ActionReminderRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    supported_networks = {"Ethereum", "Base", "Arbitrum", "ZkSync", "Scroll", "Linea", "Solana", "BNB Chain", "Polygon", "Optimism", "Tron"}
    allowed_days = {"Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"}
    if payload.network not in supported_networks:
        raise HTTPException(status_code=400, detail="Unsupported network")
    if payload.day_of_week not in allowed_days:
        raise HTTPException(status_code=400, detail="Unsupported reminder day")
    if not re.fullmatch(r"(?:[01]\d|2[0-3]):[0-5]\d", payload.time_of_day):
        raise HTTPException(status_code=400, detail="Invalid reminder time")

    reminder = db.query(ActionReminder).filter(ActionReminder.username == current_user.username).first()
    if not reminder:
        reminder = ActionReminder(username=current_user.username, updated_at=int(time.time()))
        db.add(reminder)
    reminder.network = payload.network
    reminder.day_of_week = payload.day_of_week
    reminder.time_of_day = payload.time_of_day
    reminder.enabled = payload.enabled
    reminder.telegram_enabled = payload.telegram_enabled
    reminder.last_sent_slot = None
    reminder.updated_at = int(time.time())
    db.commit()
    return {
        "status": "success",
        "telegram_linked": bool(get_telegram_subscription(db, current_user.username)),
        "message": "Action reminder saved",
    }

@app.get("/api/bridge-plans")
async def get_bridge_plans(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    plans = db.query(BridgePlan).filter(
        BridgePlan.username == current_user.username,
    ).order_by(BridgePlan.created_at.desc()).limit(30).all()
    return {
        "status": "success",
        "plans": [
            {
                "id": plan.id,
                "wallet_address": plan.wallet_address,
                "from_network": plan.from_network,
                "to_network": plan.to_network,
                "asset": plan.asset,
                "amount": plan.amount,
                "status": plan.status,
                "created_at": plan.created_at,
            }
            for plan in plans
        ],
    }

@app.post("/api/bridge-plans")
async def create_bridge_plan(
    payload: BridgePlanRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    wallet_address = payload.wallet_address.strip()
    amount = payload.amount.strip()
    if payload.to_network not in BRIDGE_PLAN_DESTINATIONS:
        raise HTTPException(status_code=400, detail="Unsupported bridge destination")
    if not re.fullmatch(r"0x[a-fA-F0-9]{40}", wallet_address):
        raise HTTPException(status_code=400, detail="Invalid wallet address")
    if len(amount) > 32 or not re.fullmatch(r"(?:0|[1-9]\d*)(?:\.\d{1,18})?", amount) or float(amount) <= 0 or float(amount) > 100000:
        raise HTTPException(status_code=400, detail="Invalid bridge amount")
    wallet = db.query(Wallet).filter(
        Wallet.username == current_user.username,
        Wallet.wallet_address.ilike(wallet_address),
    ).first()
    if not wallet:
        raise HTTPException(status_code=409, detail="Save the active wallet before creating a bridge plan")

    plan = BridgePlan(
        username=current_user.username,
        wallet_address=wallet.wallet_address,
        from_network="Base",
        to_network=payload.to_network,
        asset="ETH",
        amount=amount,
        status="planned",
        created_at=int(time.time()),
    )
    db.add(plan)
    db.commit()
    return {
        "status": "success",
        "plan": {
            "id": plan.id,
            "wallet_address": plan.wallet_address,
            "from_network": plan.from_network,
            "to_network": plan.to_network,
            "asset": plan.asset,
            "amount": plan.amount,
            "status": plan.status,
            "created_at": plan.created_at,
        },
    }

@app.delete("/api/bridge-plans/{plan_id}")
async def delete_bridge_plan(plan_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    plan = db.query(BridgePlan).filter(
        BridgePlan.id == plan_id,
        BridgePlan.username == current_user.username,
    ).first()
    if not plan:
        raise HTTPException(status_code=404, detail="Bridge plan not found")
    db.delete(plan)
    db.commit()
    return {"status": "success"}

@app.post("/api/start")
async def start_farming(req: StartFarmReq, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    require_owned_username(req.username, current_user)
    raise HTTPException(
        status_code=503,
        detail="Automated signing is unavailable. AIRDROP-X only prepares actions that you sign in your own wallet.",
    )

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
            "notice_key": "eligibility_integrations_pending",
        }
    }

@app.get("/api/eligibility/{username}")
async def get_airdrop_eligibility_center(
    username: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_owned_username(username, current_user)
    wallets = db.query(Wallet).filter(Wallet.username == username).all()
    public_wallets = [
        {
            "id": wallet.id,
            "address": wallet.wallet_address,
            "label": wallet.label,
        }
        for wallet in wallets
        if wallet.wallet_address.startswith("0x") and len(wallet.wallet_address) == 42
    ]
    claim_sources = db.query(OfficialOpportunitySource).filter(
        OfficialOpportunitySource.claim_url.isnot(None)
    ).order_by(OfficialOpportunitySource.id.asc()).all()

    return {
        "status": "success",
        "wallets": public_wallets,
        "claim_checks": [serialize_opportunity_source(source) for source in claim_sources],
        "confirmed_claims": [],
        "notice_key": "official_claim_check_required",
    }

@app.get("/api/transfer-center")
async def get_transfer_center(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    wallets = db.query(Wallet).filter(Wallet.username == current_user.username).all()
    templates = db.query(WalletTransferTemplate).filter(
        WalletTransferTemplate.username == current_user.username
    ).order_by(WalletTransferTemplate.updated_at.desc()).all()
    history = db.query(WalletTransferRecord).filter(
        WalletTransferRecord.username == current_user.username
    ).order_by(WalletTransferRecord.created_at.desc()).limit(20).all()
    return {
        "status": "success",
        "wallets": [{"id": wallet.id, "address": wallet.wallet_address, "label": wallet.label} for wallet in wallets],
        "templates": [serialize_transfer_template(template) for template in templates],
        "history": [
            {
                "id": record.id,
                "from_address": record.from_address,
                "to_address": record.to_address,
                "amount": record.amount,
                "tx_hash": record.tx_hash,
                "network": record.network,
                "created_at": record.created_at,
            }
            for record in history
        ],
    }

@app.post("/api/transfer-templates")
async def create_transfer_template(
    payload: TransferTemplateCreateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    name = payload.name.strip()
    if not name or len(name) > 60 or any(ord(char) < 32 for char in name):
        raise HTTPException(status_code=422, detail="Transfer template name is invalid")
    recipient = db.query(Wallet).filter(
        Wallet.id == payload.recipient_wallet_id,
        Wallet.username == current_user.username,
    ).first()
    if not recipient or not is_valid_evm_address(recipient.wallet_address):
        raise HTTPException(status_code=422, detail="Choose one of your saved EVM wallets as recipient")
    amount = normalize_eth_amount(payload.default_amount)
    now_ts = int(time.time())
    template = WalletTransferTemplate(
        username=current_user.username,
        name=name,
        recipient_wallet_id=recipient.id,
        recipient_address=recipient.wallet_address,
        default_amount=amount,
        network="Base",
        created_at=now_ts,
        updated_at=now_ts,
    )
    db.add(template)
    db.commit()
    db.refresh(template)
    return {"status": "success", "template": serialize_transfer_template(template)}

@app.delete("/api/transfer-templates/{template_id}")
async def delete_transfer_template(
    template_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    template = db.query(WalletTransferTemplate).filter(
        WalletTransferTemplate.id == template_id,
        WalletTransferTemplate.username == current_user.username,
    ).first()
    if not template:
        raise HTTPException(status_code=404, detail="Transfer template not found")
    db.delete(template)
    db.commit()
    return {"status": "success"}

@app.post("/api/transfer-records")
async def save_transfer_record(
    payload: TransferRecordCreateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    template = db.query(WalletTransferTemplate).filter(
        WalletTransferTemplate.id == payload.template_id,
        WalletTransferTemplate.username == current_user.username,
    ).first()
    if not template:
        raise HTTPException(status_code=404, detail="Transfer template not found")
    from_address = payload.from_address.strip()
    to_address = payload.to_address.strip()
    if not is_valid_evm_address(from_address) or not is_valid_evm_address(to_address):
        raise HTTPException(status_code=422, detail="Transfer contains an invalid EVM address")
    if from_address.lower() == to_address.lower():
        raise HTTPException(status_code=422, detail="Sender and recipient must be different wallets")
    if to_address.lower() != template.recipient_address.lower():
        raise HTTPException(status_code=403, detail="Recipient does not match the saved template")
    if not db.query(Wallet).filter(
        Wallet.username == current_user.username,
        Wallet.wallet_address.ilike(from_address),
    ).first():
        raise HTTPException(status_code=403, detail="Connect one of your saved wallets before sending")
    tx_hash = payload.tx_hash.strip()
    if not re.fullmatch(r"0x[a-fA-F0-9]{64}", tx_hash):
        raise HTTPException(status_code=422, detail="Transaction hash is invalid")
    if db.query(WalletTransferRecord).filter(WalletTransferRecord.tx_hash == tx_hash).first():
        return {"status": "success", "already_saved": True}
    record = WalletTransferRecord(
        username=current_user.username,
        template_id=template.id,
        from_address=from_address,
        to_address=to_address,
        amount=normalize_eth_amount(payload.amount),
        tx_hash=tx_hash,
        network="Base",
        status="submitted",
        created_at=int(time.time()),
    )
    db.add(record)
    db.commit()
    telegram_sent = notify_base_transfer_submitted(
        get_telegram_subscription(db, current_user.username), record.amount, tx_hash,
    )
    return {"status": "success", "telegram_sent": telegram_sent}

@app.post("/api/transfer-records/direct")
async def save_direct_transfer_record(
    payload: DirectTransferRecordCreateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from_address = payload.from_address.strip()
    to_address = payload.to_address.strip()
    if not is_valid_evm_address(from_address) or not is_valid_evm_address(to_address):
        raise HTTPException(status_code=422, detail="Transfer contains an invalid EVM address")
    if from_address.lower() == to_address.lower():
        raise HTTPException(status_code=422, detail="Sender and recipient must be different wallets")
    sender = db.query(Wallet).filter(
        Wallet.username == current_user.username,
        Wallet.wallet_address.ilike(from_address),
    ).first()
    recipient = db.query(Wallet).filter(
        Wallet.id == payload.recipient_wallet_id,
        Wallet.username == current_user.username,
    ).first()
    if not sender or not recipient or not is_valid_evm_address(recipient.wallet_address):
        raise HTTPException(status_code=403, detail="Choose saved sender and recipient wallets")
    if recipient.wallet_address.lower() != to_address.lower():
        raise HTTPException(status_code=403, detail="Recipient does not match the saved wallet")
    tx_hash = payload.tx_hash.strip()
    if not re.fullmatch(r"0x[a-fA-F0-9]{64}", tx_hash):
        raise HTTPException(status_code=422, detail="Transaction hash is invalid")
    if db.query(WalletTransferRecord).filter(WalletTransferRecord.tx_hash == tx_hash).first():
        return {"status": "success", "already_saved": True}
    record = WalletTransferRecord(
        username=current_user.username,
        template_id=None,
        from_address=from_address,
        to_address=to_address,
        amount=normalize_eth_amount(payload.amount),
        tx_hash=tx_hash,
        network="Base",
        status="submitted",
        created_at=int(time.time()),
    )
    db.add(record)
    db.commit()
    telegram_sent = notify_base_transfer_submitted(
        get_telegram_subscription(db, current_user.username), record.amount, tx_hash,
    )
    return {"status": "success", "telegram_sent": telegram_sent}

@app.post("/api/base-swap/quote")
async def get_base_swap_quote(
    payload: BaseSwapQuoteRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    wallet_address = get_saved_base_wallet(db, current_user.username, payload.wallet_address)
    amount = normalize_eth_amount(payload.amount)
    if payload.slippage < 0.1 or payload.slippage > 1.0:
        raise HTTPException(status_code=422, detail="Slippage must be between 0.1% and 1%")

    quote_payload = {
        "tokenIn": BASE_NATIVE_TOKEN_ADDRESS,
        "tokenOut": BASE_USDC_ADDRESS,
        "tokenInChainId": BASE_CHAIN_ID,
        "tokenOutChainId": BASE_CHAIN_ID,
        "type": "EXACT_INPUT",
        "amount": eth_to_wei(amount),
        "swapper": wallet_address,
        "slippageTolerance": payload.slippage,
    }
    try:
        response = requests.post(
            f"{UNISWAP_TRADE_API_URL}/quote",
            headers=uniswap_headers(),
            json=quote_payload,
            timeout=15,
        )
    except requests.RequestException:
        raise HTTPException(status_code=503, detail="Base Swap quote service is temporarily unavailable")
    if not response.ok:
        logging.warning("Uniswap quote rejected with status %s", response.status_code)
        raise HTTPException(status_code=502, detail="Unable to get a Base Swap quote")
    try:
        quote_response = response.json()
        quote = quote_response["quote"]
    except (ValueError, KeyError, TypeError):
        raise HTTPException(status_code=502, detail="Base Swap returned an invalid quote")

    # ETH input needs no token approval. Refuse any unexpected permit request.
    if quote_response.get("permitData"):
        raise HTTPException(status_code=502, detail="This quote requires an unsupported token approval")
    now_ts = int(time.time())
    quote_id = secrets.token_urlsafe(24)
    swap_quote_sessions[quote_id] = {
        "username": current_user.username,
        "wallet_address": wallet_address.lower(),
        "quote": quote,
        "amount_in": amount,
        "amount_out": str((quote.get("output") or {}).get("amount", "")),
        "created_at": now_ts,
    }
    # Keep this in-memory cache small even if a user repeatedly refreshes a quote.
    stale_before = now_ts - SWAP_QUOTE_TTL_SECONDS
    for session_id, session in list(swap_quote_sessions.items()):
        if session["created_at"] < stale_before:
            swap_quote_sessions.pop(session_id, None)

    output = quote.get("output") or {}
    return {
        "status": "success",
        "quote_id": quote_id,
        "expires_in": SWAP_QUOTE_TTL_SECONDS,
        "amount_in": amount,
        "amount_out": str(output.get("amount", "")),
        "routing": quote.get("routing") or quote_response.get("routing") or "UNISWAP",
        "token_out": "USDC",
    }

@app.post("/api/base-swap/build")
async def build_base_swap_transaction(
    payload: BaseSwapBuildRequest,
    current_user: User = Depends(get_current_user),
):
    quote_id = payload.quote_id.strip()
    session = swap_quote_sessions.get(quote_id)
    now_ts = int(time.time())
    if not session or session["username"] != current_user.username or session["created_at"] < now_ts - SWAP_QUOTE_TTL_SECONDS:
        swap_quote_sessions.pop(quote_id, None)
        raise HTTPException(status_code=410, detail="The Base Swap quote expired. Request a new quote")

    try:
        response = requests.post(
            f"{UNISWAP_TRADE_API_URL}/swap",
            headers=uniswap_headers(),
            json={
                "quote": session["quote"],
                "deadline": now_ts + 180,
                "refreshGasPrice": True,
                "simulateTransaction": True,
                "safetyMode": "SAFE",
            },
            timeout=15,
        )
    except requests.RequestException:
        raise HTTPException(status_code=503, detail="Base Swap transaction service is temporarily unavailable")
    if not response.ok:
        logging.warning("Uniswap swap build rejected with status %s", response.status_code)
        raise HTTPException(status_code=502, detail="Unable to prepare the Base Swap transaction")
    try:
        swap = response.json()["swap"]
        chain_id = int(swap["chainId"])
        to_address = swap["to"]
        from_address = swap["from"]
        calldata = swap["data"]
        value = str(swap.get("value", "0"))
    except (ValueError, KeyError, TypeError):
        raise HTTPException(status_code=502, detail="Base Swap returned an invalid transaction")

    if (
        chain_id != BASE_CHAIN_ID
        or not is_valid_evm_address(to_address)
        or not is_valid_evm_address(from_address)
        or from_address.lower() != session["wallet_address"]
        or not isinstance(calldata, str)
        or not calldata.startswith("0x")
        or len(calldata) <= 2
        or not re.fullmatch(r"(?:0|[1-9]\d*|0x[0-9a-fA-F]+)", value)
    ):
        raise HTTPException(status_code=502, detail="Base Swap transaction validation failed")

    submission_id = secrets.token_urlsafe(24)
    swap_submission_sessions[submission_id] = {
        "username": current_user.username,
        "wallet_address": from_address.lower(),
        "amount_in": session["amount_in"],
        "amount_out": session["amount_out"],
        "created_at": now_ts,
    }
    for session_id, submission in list(swap_submission_sessions.items()):
        if submission["created_at"] < now_ts - SWAP_SUBMISSION_TTL_SECONDS:
            swap_submission_sessions.pop(session_id, None)

    # A quote can be built once; another click always begins with a fresh quote.
    swap_quote_sessions.pop(quote_id, None)
    return {
        "status": "success",
        "submission_id": submission_id,
        "transaction": {
            "chain_id": BASE_CHAIN_ID,
            "from": from_address,
            "to": to_address,
            "data": calldata,
            "value": value,
        },
    }

@app.post("/api/base-swap/submissions")
async def save_base_swap_submission(
    payload: BaseSwapSubmissionRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    submission_id = payload.submission_id.strip()
    submission = swap_submission_sessions.get(submission_id)
    now_ts = int(time.time())
    if (
        not submission
        or submission["username"] != current_user.username
        or submission["created_at"] < now_ts - SWAP_SUBMISSION_TTL_SECONDS
    ):
        swap_submission_sessions.pop(submission_id, None)
        raise HTTPException(status_code=410, detail="The Base Swap submission session expired")
    tx_hash = payload.tx_hash.strip()
    if not re.fullmatch(r"0x[a-fA-F0-9]{64}", tx_hash):
        raise HTTPException(status_code=422, detail="Transaction hash is invalid")

    existing = db.query(BaseSwapRecord).filter(BaseSwapRecord.tx_hash == tx_hash).first()
    if not existing:
        db.add(BaseSwapRecord(
            username=current_user.username,
            wallet_address=submission["wallet_address"],
            amount_in=submission["amount_in"],
            amount_out=submission["amount_out"] or None,
            tx_hash=tx_hash,
            status="submitted",
            created_at=now_ts,
        ))
        db.commit()

    subscription = get_telegram_subscription(db, current_user.username)
    telegram_sent = False
    if subscription and subscription.notify_transaction_submitted:
        messages = {
            "ru": f"🔄 *AIRDROP-X: обмен отправлен*\nСеть: `Base`\nСумма: `{submission['amount_in']} ETH`\nTX: `{tx_hash}`",
            "en": f"🔄 *AIRDROP-X: swap submitted*\nNetwork: `Base`\nAmount: `{submission['amount_in']} ETH`\nTX: `{tx_hash}`",
            "zh": f"🔄 *AIRDROP-X：兑换已提交*\n网络：`Base`\n金额：`{submission['amount_in']} ETH`\n交易：`{tx_hash}`",
        }
        telegram_sent = send_telegram_notification(
            subscription.chat_id,
            messages[normalize_language(subscription.language)],
        )

    swap_submission_sessions.pop(submission_id, None)
    return {"status": "success", "telegram_sent": telegram_sent}

@app.get("/api/base-swap/history")
async def get_base_swap_history(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    records = db.query(BaseSwapRecord).filter(
        BaseSwapRecord.username == current_user.username
    ).order_by(BaseSwapRecord.created_at.desc()).limit(20).all()
    return {
        "status": "success",
        "records": [
            {
                "id": record.id,
                "wallet_address": record.wallet_address,
                "amount_in": record.amount_in,
                "amount_out": record.amount_out,
                "tx_hash": record.tx_hash,
                "status": record.status,
                "created_at": record.created_at,
            }
            for record in records
        ],
    }

@app.get("/api/operations/history")
async def get_operations_history(
    status: str = "all",
    operation_type: str = "all",
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    allowed_statuses = {"all", "submitted", "in_progress", "completed", "failed"}
    allowed_types = {"all", "bridge", "swap", "transfer"}
    if status not in allowed_statuses or operation_type not in allowed_types:
        raise HTTPException(status_code=422, detail="Invalid operation history filter")

    operations = []
    bridge_records: List[UniversalBridgeRecord] = []
    swap_records: List[BaseSwapRecord] = []
    transfer_records: List[WalletTransferRecord] = []
    if operation_type in {"all", "bridge"}:
        bridge_records = db.query(UniversalBridgeRecord).filter(
            UniversalBridgeRecord.username == current_user.username,
        ).order_by(UniversalBridgeRecord.created_at.desc()).limit(100).all()
    if operation_type in {"all", "swap"}:
        swap_records = db.query(BaseSwapRecord).filter(
            BaseSwapRecord.username == current_user.username,
        ).order_by(BaseSwapRecord.created_at.desc()).limit(100).all()
    if operation_type in {"all", "transfer"}:
        transfer_records = db.query(WalletTransferRecord).filter(
            WalletTransferRecord.username == current_user.username,
        ).order_by(WalletTransferRecord.created_at.desc()).limit(100).all()

    refresh_base_operation_statuses(db, swap_records, transfer_records)

    for record in bridge_records:
        operations.append({
            "id": f"bridge-{record.id}",
            "type": "bridge",
            "status": record.status or "submitted",
            "provider_status": record.provider_status,
            "from_network": record.from_network,
            "to_network": record.to_network,
            "from_symbol": record.from_symbol,
            "to_symbol": record.to_symbol,
            "amount_in": record.amount_in,
            "amount_out": record.amount_out,
            "estimated_usd": estimate_operation_value_usd(record.amount_in, record.from_symbol),
            "provider": record.provider,
            "tx_hash": record.tx_hash,
            "created_at": record.created_at,
        })
    for record in swap_records:
        operations.append({
            "id": f"swap-{record.id}",
            "type": "swap",
            "status": record.status or "submitted",
            "provider_status": None,
            "from_network": "Base",
            "to_network": "Base",
            "from_symbol": "ETH",
            "to_symbol": "USDC",
            "amount_in": record.amount_in,
            "amount_out": format_journal_token_amount(record.amount_out, BASE_USDC_DECIMALS),
            "estimated_usd": estimate_operation_value_usd(record.amount_in, "ETH"),
            "provider": "Uniswap",
            "tx_hash": record.tx_hash,
            "created_at": record.created_at,
        })
    for record in transfer_records:
        operations.append({
            "id": f"transfer-{record.id}",
            "type": "transfer",
            "status": record.status or "submitted",
            "provider_status": None,
            "from_network": record.network,
            "to_network": record.network,
            "from_symbol": "ETH",
            "to_symbol": "ETH",
            "amount_in": record.amount,
            "amount_out": None,
            "estimated_usd": estimate_operation_value_usd(record.amount, "ETH"),
            "provider": "",
            "recipient": record.to_address,
            "tx_hash": record.tx_hash,
            "created_at": record.created_at,
        })

    if status != "all":
        operations = [record for record in operations if record["status"] == status]
    operations.sort(key=lambda record: int(record["created_at"]), reverse=True)
    return {"status": "success", "records": operations[:100]}

@app.get("/api/opportunities")
async def get_official_opportunities(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    sources = db.query(OfficialOpportunitySource).order_by(OfficialOpportunitySource.id.asc()).all()
    return {
        "status": "success",
        "sources": [serialize_opportunity_source(source) for source in sources],
        "can_manage": current_user.username in ADMIN_USERNAMES,
    }

@app.post("/api/opportunities")
async def create_official_opportunity(
    payload: OpportunitySourceCreateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_admin_user(current_user)
    source_data = validate_opportunity_source(payload)
    if db.query(OfficialOpportunitySource).filter(
        OfficialOpportunitySource.source_key == source_data["source_key"]
    ).first():
        raise HTTPException(status_code=409, detail="A source with this key already exists")

    now_ts = int(time.time())
    source = OfficialOpportunitySource(
        **source_data,
        status="official_updates",
        is_system=False,
        created_at=now_ts,
        updated_at=now_ts,
    )
    db.add(source)
    try:
        db.commit()
        db.refresh(source)
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="A source with this key already exists")
    return {"status": "success", "source": serialize_opportunity_source(source)}

@app.delete("/api/opportunities/{source_id}")
async def delete_official_opportunity(
    source_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_admin_user(current_user)
    source = db.query(OfficialOpportunitySource).filter(OfficialOpportunitySource.id == source_id).first()
    if not source:
        raise HTTPException(status_code=404, detail="Official source not found")
    if source.is_system:
        raise HTTPException(status_code=403, detail="System sources cannot be deleted")
    db.delete(source)
    db.commit()
    return {"status": "success"}

@app.get("/api/stats")
def get_platform_stats(db: Session = Depends(get_db)):
    total_users = db.query(User).count()
    return {
        "current_slots": min(total_users, 300),
        "max_slots": 300,
        "is_sold_out": total_users >= 300
    }


@app.get("/api/health")
def get_service_health():
    """Return a minimal, secret-free readiness report for local monitoring."""
    database_ready = False
    db = SessionLocal()
    try:
        db.execute(text("SELECT 1"))
        database_ready = True
    except Exception:
        logging.exception("Health check could not reach the database")
    finally:
        db.close()

    scheduler_ready = bool(getattr(scheduler, "running", False))
    ready = database_ready and scheduler_ready
    payload = {
        "status": "ok" if ready else "degraded",
        "database": "ok" if database_ready else "unavailable",
        "scheduler": "running" if scheduler_ready else "stopped",
        "capabilities": {
            "walletconnect_configured": bool(WALLETCONNECT_PROJECT_ID),
            "telegram_configured": bool(TELEGRAM_BOT_TOKEN and TELEGRAM_BOT_USERNAME),
            "subscription_payments_enabled": SUBSCRIPTION_PAYMENTS_ENABLED,
        },
    }
    if not ready:
        raise HTTPException(status_code=503, detail=payload)
    return payload

app.mount("/", RestrictedStaticFiles(directory=".", html=True), name="static")

if __name__ == "__main__":
    import uvicorn
    # Hot reload is useful only while developing.  Keep it opt-in so a normal
    # `python server.py` run starts one predictable process for MVP testing.
    reload_enabled = os.getenv("APP_RELOAD", "false").strip().lower() == "true"
    if reload_enabled:
        # Uvicorn needs an import string to create its reloader child process.
        uvicorn.run("server:app", host="127.0.0.1", port=8000, reload=True)
    else:
        # Passing the already-created app prevents server.py from being
        # imported twice in one process, which would duplicate SQLAlchemy
        # model declarations such as the users table.
        uvicorn.run(app, host="127.0.0.1", port=8000)
