import uuid

from auth.models import now
from extensions import db


class WritingPrompt(db.Model):
    __tablename__ = "writing_prompts"
    id = db.Column(db.String(64), primary_key=True, default=lambda: uuid.uuid4().hex)
    title = db.Column(db.String(160), nullable=False)
    level = db.Column(db.String(8), nullable=False, default="N5")
    prompt_type = db.Column(db.String(24), nullable=False, default="sentence")
    instruction = db.Column(db.Text, nullable=False)
    model_hint = db.Column(db.Text, nullable=False)
    sort_order = db.Column(db.Integer, nullable=False, default=0)
    created_at = db.Column(db.BigInteger, nullable=False, default=now)
    updated_at = db.Column(db.BigInteger, nullable=False, default=now, onupdate=now)

    def public(self):
        return {
            "id": self.id,
            "title": self.title,
            "level": self.level,
            "prompt_type": self.prompt_type,
            "instruction": self.instruction,
            "model_hint": self.model_hint,
            "sort_order": self.sort_order,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
        }


class WritingDraft(db.Model):
    __tablename__ = "writing_drafts"
    id = db.Column(db.String(64), primary_key=True, default=lambda: uuid.uuid4().hex)
    user_id = db.Column(db.String(36), db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    prompt_id = db.Column(db.String(64), db.ForeignKey("writing_prompts.id", ondelete="CASCADE"), nullable=False, index=True)
    text = db.Column(db.Text, nullable=False, default="")
    word_count = db.Column(db.Integer, nullable=False, default=0)
    status = db.Column(db.String(16), nullable=False, default="draft")
    created_at = db.Column(db.BigInteger, nullable=False, default=now)
    updated_at = db.Column(db.BigInteger, nullable=False, default=now, onupdate=now)

    prompt = db.relationship("WritingPrompt", lazy="joined")

    def public(self):
        return {
            "id": self.id,
            "user_id": self.user_id,
            "prompt_id": self.prompt_id,
            "text": self.text,
            "word_count": self.word_count,
            "status": self.status,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
            "prompt": self.prompt.public() if self.prompt else None,
        }


class WritingSubmission(db.Model):
    __tablename__ = "writing_submissions"
    id = db.Column(db.String(64), primary_key=True, default=lambda: uuid.uuid4().hex)
    user_id = db.Column(db.String(36), db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    prompt_id = db.Column(db.String(64), db.ForeignKey("writing_prompts.id", ondelete="CASCADE"), nullable=True, index=True)
    prompt_title = db.Column(db.String(160), nullable=False, default="Bài viết tự do")
    text = db.Column(db.Text, nullable=False, default="")
    corrected_text = db.Column(db.Text, nullable=False, default="")
    score = db.Column(db.Integer, nullable=False, default=0)
    feedback = db.Column(db.Text, nullable=False, default="")
    submitted_at = db.Column(db.BigInteger, nullable=False, default=now)
    created_at = db.Column(db.BigInteger, nullable=False, default=now)
    updated_at = db.Column(db.BigInteger, nullable=False, default=now, onupdate=now)

    prompt = db.relationship("WritingPrompt", lazy="joined")

    def public(self):
        return {
            "id": self.id,
            "user_id": self.user_id,
            "prompt_id": self.prompt_id,
            "prompt_title": self.prompt_title,
            "text": self.text,
            "corrected_text": self.corrected_text,
            "correctedText": self.corrected_text,
            "score": self.score,
            "feedback": self.feedback,
            "submitted_at": self.submitted_at,
            "submittedAt": self.submitted_at,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
            "prompt": self.prompt.public() if self.prompt else None,
        }
