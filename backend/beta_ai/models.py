from extensions import db
from auth.models import now, new_id


class AiWallet(db.Model):
    __tablename__ = "beta_ai_wallets"
    user_id = db.Column(db.String(36), db.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    spent_micro_usd = db.Column(db.BigInteger, nullable=False, default=0)
    held_micro_usd = db.Column(db.BigInteger, nullable=False, default=0)
    started_at = db.Column(db.BigInteger, nullable=False, default=now)


class AiAttempt(db.Model):
    __tablename__ = "beta_ai_attempts"
    id = db.Column(db.String(36), primary_key=True, default=new_id)
    user_id = db.Column(db.String(36), db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    model = db.Column(db.String(100), nullable=False)
    action = db.Column(db.String(100), nullable=False)
    status = db.Column(db.String(16), nullable=False, default="held")
    held_micro_usd = db.Column(db.BigInteger, nullable=False)
    charged_micro_usd = db.Column(db.BigInteger, nullable=False, default=0)
    created_at = db.Column(db.BigInteger, nullable=False, default=now)
    finished_at = db.Column(db.BigInteger)
    expires_at = db.Column(db.BigInteger)
