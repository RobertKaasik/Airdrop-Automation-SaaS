from sqlalchemy import (
    CheckConstraint,
    Column,
    DateTime,
    ForeignKey,
    Integer,
    JSON,
    String,
    UniqueConstraint,
)
from sqlalchemy.sql import func

from .database import Base


class UserProfile(Base):
    __tablename__ = "user_profiles"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    profile_name = Column(String(120), nullable=False)

    proxy_configuration = Column(String(2048), nullable=True)
    evm_wallet_address = Column(String(128), nullable=False)
    okx_subaccount_address = Column(String(128), nullable=True)
    exchange_subaccount_id = Column(String(128), nullable=True)

    # Stable, ordinary UI-test settings such as viewport and locale.
    environment_metadata = Column(JSON, nullable=False, default=dict)
    status = Column(String(32), nullable=False, default="active")
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    __table_args__ = (
        UniqueConstraint("user_id", "profile_name", name="uq_user_profiles_user_name"),
        CheckConstraint(
            "status IN ('active', 'disabled')",
            name="ck_user_profiles_status",
        ),
    )


class FinancialTransferIntent(Base):
    """A server-side record of intent; no wallet key or signature is stored."""

    __tablename__ = "financial_transfer_intents"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    profile_id = Column(
        Integer,
        ForeignKey("user_profiles.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    operation_type = Column(String(64), nullable=False)
    asset = Column(String(32), nullable=False)
    amount = Column(String(80), nullable=False)
    target_address = Column(String(128), nullable=False)

    status = Column(String(32), nullable=False, default="draft")
    tx_hash = Column(String(128), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    approved_at = Column(DateTime(timezone=True), nullable=True)
    executed_at = Column(DateTime(timezone=True), nullable=True)

    __table_args__ = (
        CheckConstraint(
            "status IN ('draft', 'pending_approval', 'approved', "
            "'executed', 'failed', 'cancelled')",
            name="ck_transfer_intents_status",
        ),
    )


class ProfileRun(Base):
    __tablename__ = "profile_runs"

    id = Column(Integer, primary_key=True, index=True)
    profile_id = Column(
        Integer,
        ForeignKey("user_profiles.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    start_time = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    end_time = Column(DateTime(timezone=True), nullable=True)
    status = Column(String(32), nullable=False, default="starting")
    proxy_ip = Column(String(128), nullable=True)
    log_message = Column(String(500), nullable=True)

    __table_args__ = (
        CheckConstraint(
            "status IN ('starting', 'running', 'completed', 'stopped', 'failed')",
            name="ck_profile_runs_status",
        ),
    )
