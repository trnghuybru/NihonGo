"""Speaking schema. Realtime voice and object storage are external services."""
from datetime import datetime, timezone
import uuid

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

from extensions import db


def new_id():
    return str(uuid.uuid4())


def utc_now():
    return datetime.now(timezone.utc)


def identifier():
    return db.Column(sa.Uuid(as_uuid=False), primary_key=True, default=new_id,
                     server_default=sa.text("gen_random_uuid()"))


def timestamp(nullable=False):
    return db.Column(sa.DateTime(timezone=True), nullable=nullable)


class CreatedMixin:
    created_at = db.Column(sa.DateTime(timezone=True), nullable=False,
                           default=utc_now, server_default=sa.func.now())


class UpdatedMixin(CreatedMixin):
    updated_at = db.Column(sa.DateTime(timezone=True), nullable=False,
                           default=utc_now, onupdate=utc_now, server_default=sa.func.now())


class ScenarioCategory(db.Model):
    __tablename__ = "scenario_categories"
    id = identifier()
    name = db.Column(sa.String(100), nullable=False, unique=True)
    description = db.Column(sa.Text)
    sort_order = db.Column(sa.Integer, nullable=False, server_default="0")


class Scenario(UpdatedMixin, db.Model):
    __tablename__ = "scenarios"
    id = identifier()
    category_id = db.Column(sa.Uuid(as_uuid=False), db.ForeignKey("scenario_categories.id"), nullable=False)
    title = db.Column(sa.String(200), nullable=False)
    description = db.Column(sa.Text, nullable=False)
    context = db.Column(sa.Text, nullable=False)
    learning_objectives = db.Column(sa.Text, nullable=False)
    language_code = db.Column(sa.String(35), nullable=False)
    difficulty_level = db.Column(sa.String(16), nullable=False)
    estimated_duration_minutes = db.Column(sa.Integer, nullable=False)
    status = db.Column(sa.String(16), nullable=False, server_default="draft")
    __table_args__ = (
        sa.CheckConstraint("status IN ('draft', 'published', 'archived')", name="ck_scenario_status"),
        sa.CheckConstraint("estimated_duration_minutes > 0", name="ck_scenario_duration"),
        sa.Index("ix_scenarios_category_id", "category_id"),
        sa.Index("idx_scenarios_published_filters", "language_code", "difficulty_level", "category_id",
                 postgresql_where=sa.text("status = 'published'"), sqlite_where=sa.text("status = 'published'")),
    )


class ScenarioRole(db.Model):
    __tablename__ = "scenario_roles"
    id = identifier()
    scenario_id = db.Column(sa.Uuid(as_uuid=False), db.ForeignKey("scenarios.id", ondelete="CASCADE"), nullable=False)
    name = db.Column(sa.String(100), nullable=False)
    description = db.Column(sa.Text, nullable=False)
    ai_instructions = db.Column(sa.Text, nullable=False)
    opening_message = db.Column(sa.Text)
    __table_args__ = (
        sa.UniqueConstraint("scenario_id", "id", name="uq_scenario_role_parent"),
        sa.UniqueConstraint("scenario_id", "name", name="uq_scenario_role_name"),
    )


class ConversationSession(UpdatedMixin, db.Model):
    __tablename__ = "conversation_sessions"
    id = identifier()
    user_id = db.Column(sa.String(36), db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    scenario_id = db.Column(sa.Uuid(as_uuid=False), db.ForeignKey("scenarios.id"), nullable=False)
    scenario_role_id = db.Column(sa.Uuid(as_uuid=False), nullable=False)
    retry_of_session_id = db.Column(sa.Uuid(as_uuid=False), db.ForeignKey("conversation_sessions.id", ondelete="SET NULL"))
    scenario_snapshot = db.Column(sa.JSON().with_variant(JSONB(), "postgresql"), nullable=False)
    status = db.Column(sa.String(16), nullable=False, server_default="active")
    current_input_mode = db.Column(sa.String(8), nullable=False, server_default="text")
    audio_storage_enabled = db.Column(sa.Boolean, nullable=False, server_default=sa.false())
    started_at = db.Column(sa.DateTime(timezone=True), nullable=False, default=utc_now, server_default=sa.func.now())
    paused_at = timestamp(nullable=True)
    ended_at = timestamp(nullable=True)
    accumulated_active_ms = db.Column(sa.BigInteger, nullable=False, server_default="0")
    last_resumed_at = timestamp(nullable=True)
    __table_args__ = (
        sa.ForeignKeyConstraint(["scenario_id", "scenario_role_id"], ["scenario_roles.scenario_id", "scenario_roles.id"], name="fk_session_scenario_role"),
        sa.CheckConstraint("status IN ('active', 'paused', 'completed', 'abandoned')", name="ck_session_status"),
        sa.CheckConstraint("current_input_mode IN ('text', 'voice')", name="ck_session_input_mode"),
        sa.CheckConstraint("accumulated_active_ms >= 0", name="ck_session_active_duration"),
        sa.CheckConstraint("retry_of_session_id IS NULL OR retry_of_session_id <> id", name="ck_session_retry_not_self"),
        sa.CheckConstraint("ended_at IS NULL OR ended_at >= started_at", name="ck_session_end_time"),
        sa.Index("idx_sessions_user_created", "user_id", sa.text("created_at DESC")),
        sa.Index("ix_sessions_scenario_role", "scenario_id", "scenario_role_id"),
        sa.Index("ix_sessions_retry_of", "retry_of_session_id"),
    )


class ConversationMessage(UpdatedMixin, db.Model):
    __tablename__ = "conversation_messages"
    id = identifier()
    session_id = db.Column(sa.Uuid(as_uuid=False), db.ForeignKey("conversation_sessions.id", ondelete="CASCADE"), nullable=False)
    sequence_number = db.Column(sa.BigInteger, nullable=False)
    speaker = db.Column(sa.String(16), nullable=False)
    input_mode = db.Column(sa.String(16), nullable=False)
    content = db.Column(sa.Text, nullable=False, server_default="")
    status = db.Column(sa.String(16), nullable=False, server_default="pending")
    occurred_at = timestamp()
    __table_args__ = (
        sa.UniqueConstraint("session_id", "sequence_number", name="uq_message_sequence"),
        sa.UniqueConstraint("session_id", "id", name="uq_message_parent"),
        sa.CheckConstraint("sequence_number > 0", name="ck_message_sequence"),
        sa.CheckConstraint("speaker IN ('user', 'assistant')", name="ck_message_speaker"),
        sa.CheckConstraint("input_mode IN ('text', 'voice', 'generated')", name="ck_message_input_mode"),
        sa.CheckConstraint("status IN ('pending', 'completed', 'failed')", name="ck_message_status"),
    )


class ConversationAudioAsset(CreatedMixin, db.Model):
    __tablename__ = "conversation_audio_assets"
    id = identifier()
    session_id = db.Column(sa.Uuid(as_uuid=False), db.ForeignKey("conversation_sessions.id", ondelete="CASCADE"), nullable=False)
    message_id = db.Column(sa.Uuid(as_uuid=False))
    asset_type = db.Column(sa.String(24), nullable=False)
    storage_key = db.Column(sa.Text, nullable=False, unique=True)
    mime_type = db.Column(sa.String(100), nullable=False)
    size_bytes = db.Column(sa.BigInteger)
    duration_ms = db.Column(sa.BigInteger)
    status = db.Column(sa.String(16), nullable=False, server_default="uploading")
    __table_args__ = (
        sa.ForeignKeyConstraint(["session_id", "message_id"], ["conversation_messages.session_id", "conversation_messages.id"], name="fk_audio_session_message", ondelete="CASCADE"),
        sa.CheckConstraint("asset_type IN ('utterance', 'session_recording')", name="ck_audio_type"),
        sa.CheckConstraint("(asset_type = 'utterance' AND message_id IS NOT NULL) OR (asset_type = 'session_recording' AND message_id IS NULL)", name="ck_audio_message_type"),
        sa.CheckConstraint("status IN ('uploading', 'ready', 'failed')", name="ck_audio_status"),
        sa.CheckConstraint("size_bytes >= 0", name="ck_audio_size"),
        sa.CheckConstraint("duration_ms >= 0", name="ck_audio_duration"),
        sa.Index("ix_audio_session_message", "session_id", "message_id"),
    )


class SessionEvaluation(CreatedMixin, db.Model):
    __tablename__ = "session_evaluations"
    id = identifier()
    session_id = db.Column(sa.Uuid(as_uuid=False), db.ForeignKey("conversation_sessions.id", ondelete="CASCADE"), nullable=False, unique=True)
    status = db.Column(sa.String(16), nullable=False, server_default="pending")
    overall_score = db.Column(sa.Numeric(5, 2))
    summary = db.Column(sa.Text)
    strengths = db.Column(sa.Text)
    improvement_suggestions = db.Column(sa.Text)
    model_name = db.Column(sa.String(200))
    rubric_version = db.Column(sa.String(50), nullable=False)
    error_message = db.Column(sa.Text)
    completed_at = timestamp(nullable=True)
    __table_args__ = (
        sa.CheckConstraint("status IN ('pending', 'processing', 'completed', 'failed')", name="ck_evaluation_status"),
        sa.CheckConstraint("overall_score BETWEEN 0 AND 100", name="ck_evaluation_score"),
        sa.CheckConstraint("status <> 'completed' OR (overall_score IS NOT NULL AND completed_at IS NOT NULL)", name="ck_evaluation_completed"),
    )


class EvaluationCriterion(db.Model):
    __tablename__ = "evaluation_criteria"
    id = identifier()
    code = db.Column(sa.String(50), nullable=False, unique=True)
    name = db.Column(sa.String(100), nullable=False)
    description = db.Column(sa.Text, nullable=False)
    is_active = db.Column(sa.Boolean, nullable=False, server_default=sa.true())


class EvaluationScore(db.Model):
    __tablename__ = "evaluation_scores"
    id = identifier()
    evaluation_id = db.Column(sa.Uuid(as_uuid=False), db.ForeignKey("session_evaluations.id", ondelete="CASCADE"), nullable=False)
    criterion_id = db.Column(sa.Uuid(as_uuid=False), db.ForeignKey("evaluation_criteria.id"), nullable=False)
    criterion_name_snapshot = db.Column(sa.String(100), nullable=False)
    weight = db.Column(sa.Numeric(8, 4), nullable=False)
    score = db.Column(sa.Numeric(5, 2), nullable=False)
    feedback = db.Column(sa.Text, nullable=False)
    improvement_suggestion = db.Column(sa.Text)
    __table_args__ = (
        sa.UniqueConstraint("evaluation_id", "criterion_id", name="uq_evaluation_criterion"),
        sa.CheckConstraint("score BETWEEN 0 AND 100", name="ck_criterion_score"),
        sa.CheckConstraint("weight > 0", name="ck_criterion_weight"),
        sa.Index("ix_evaluation_scores_criterion", "criterion_id"),
    )


class Room(CreatedMixin, db.Model):
    __tablename__ = "rooms"
    id = identifier()
    created_by = db.Column(sa.String(36), db.ForeignKey("users.id"), nullable=False)
    title = db.Column(sa.String(200), nullable=False)
    description = db.Column(sa.Text)
    topic = db.Column(sa.String(100))
    language_code = db.Column(sa.String(35), nullable=False)
    difficulty_level = db.Column(sa.String(16), nullable=False)
    visibility = db.Column(sa.String(16), nullable=False, server_default="public")
    source = db.Column(sa.String(16), nullable=False, server_default="manual")
    status = db.Column(sa.String(16), nullable=False, server_default="open")
    max_members = db.Column(sa.Integer, nullable=False, server_default="2")
    password_hash = db.Column(sa.Text)
    voice_provider_room_id = db.Column(sa.Text, unique=True)
    closed_at = timestamp(nullable=True)
    __table_args__ = (
        sa.CheckConstraint("visibility IN ('public', 'private')", name="ck_room_visibility"),
        sa.CheckConstraint("source IN ('manual', 'matchmaking')", name="ck_room_source"),
        sa.CheckConstraint("status IN ('open', 'closed')", name="ck_room_status"),
        sa.CheckConstraint("max_members >= 2", name="ck_room_capacity"),
        sa.CheckConstraint("source <> 'matchmaking' OR max_members = 2", name="ck_matchmaking_room_capacity"),
        sa.CheckConstraint("visibility = 'private' OR password_hash IS NULL", name="ck_room_password_visibility"),
        sa.Index("ix_rooms_created_by", "created_by"),
        sa.Index("idx_rooms_open_filters", "language_code", "difficulty_level", "topic", sa.text("created_at DESC"),
                 postgresql_where=sa.text("status = 'open'"), sqlite_where=sa.text("status = 'open'")),
    )


class RoomMember(db.Model):
    __tablename__ = "room_members"
    id = identifier()
    room_id = db.Column(sa.Uuid(as_uuid=False), db.ForeignKey("rooms.id", ondelete="CASCADE"), nullable=False)
    user_id = db.Column(sa.String(36), db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    role = db.Column(sa.String(16), nullable=False, server_default="member")
    status = db.Column(sa.String(16), nullable=False, server_default="joined")
    is_muted = db.Column(sa.Boolean, nullable=False, server_default=sa.true())
    joined_at = db.Column(sa.DateTime(timezone=True), nullable=False, default=utc_now, server_default=sa.func.now())
    left_at = timestamp(nullable=True)
    updated_at = db.Column(sa.DateTime(timezone=True), nullable=False, default=utc_now,
                           onupdate=utc_now, server_default=sa.func.now())
    __table_args__ = (
        sa.UniqueConstraint("room_id", "user_id", name="uq_room_member"),
        sa.CheckConstraint("role IN ('host', 'member')", name="ck_member_role"),
        sa.CheckConstraint("status IN ('joined', 'left', 'removed')", name="ck_member_status"),
        sa.Index("ix_room_members_user", "user_id"),
        sa.Index("uq_joined_room_host", "room_id", unique=True,
                 postgresql_where=sa.text("role = 'host' AND status = 'joined'"),
                 sqlite_where=sa.text("role = 'host' AND status = 'joined'")),
    )


class RoomInvitation(CreatedMixin, db.Model):
    __tablename__ = "room_invitations"
    id = identifier()
    room_id = db.Column(sa.Uuid(as_uuid=False), db.ForeignKey("rooms.id", ondelete="CASCADE"), nullable=False)
    invited_by = db.Column(sa.String(36), db.ForeignKey("users.id"), nullable=False)
    invitee_user_id = db.Column(sa.String(36), db.ForeignKey("users.id", ondelete="CASCADE"))
    token_hash = db.Column(sa.String(64), nullable=False, unique=True)
    status = db.Column(sa.String(16), nullable=False, server_default="pending")
    expires_at = timestamp()
    responded_at = timestamp(nullable=True)
    __table_args__ = (
        sa.CheckConstraint("status IN ('pending', 'accepted', 'declined', 'revoked', 'expired')", name="ck_invitation_status"),
        sa.CheckConstraint("expires_at > created_at", name="ck_invitation_expiry"),
        sa.Index("ix_invitations_room", "room_id"),
        sa.Index("ix_invitations_sender", "invited_by"),
        sa.Index("ix_invitations_recipient", "invitee_user_id"),
    )


class MatchingPreferences(UpdatedMixin, db.Model):
    __tablename__ = "matching_preferences"
    user_id = db.Column(sa.String(36), db.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    language_code = db.Column(sa.String(35), nullable=False)
    own_level = db.Column(sa.String(16), nullable=False)
    desired_min_level = db.Column(sa.String(16))
    desired_max_level = db.Column(sa.String(16))
    topic = db.Column(sa.String(100))


class MatchmakingRequest(CreatedMixin, db.Model):
    __tablename__ = "matchmaking_requests"
    id = identifier()
    user_id = db.Column(sa.String(36), db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    language_code = db.Column(sa.String(35), nullable=False)
    own_level = db.Column(sa.String(16), nullable=False)
    desired_min_level = db.Column(sa.String(16))
    desired_max_level = db.Column(sa.String(16))
    topic = db.Column(sa.String(100))
    status = db.Column(sa.String(16), nullable=False, server_default="searching")
    matched_room_id = db.Column(sa.Uuid(as_uuid=False), db.ForeignKey("rooms.id"))
    expires_at = timestamp()
    matched_at = timestamp(nullable=True)
    cancelled_at = timestamp(nullable=True)
    __table_args__ = (
        sa.CheckConstraint("status IN ('searching', 'matched', 'cancelled', 'expired')", name="ck_matchmaking_status"),
        sa.CheckConstraint("(status = 'matched' AND matched_room_id IS NOT NULL AND matched_at IS NOT NULL) OR (status <> 'matched' AND matched_room_id IS NULL AND matched_at IS NULL)", name="ck_matchmaking_result"),
        sa.CheckConstraint("expires_at > created_at", name="ck_matchmaking_expiry"),
        sa.Index("uq_matchmaking_searching_user", "user_id", unique=True,
                 postgresql_where=sa.text("status = 'searching'"), sqlite_where=sa.text("status = 'searching'")),
        sa.Index("ix_matchmaking_user_created", "user_id", sa.text("created_at DESC")),
        sa.Index("ix_matchmaking_room", "matched_room_id"),
        sa.Index("idx_matchmaking_searching", "language_code", "created_at",
                 postgresql_where=sa.text("status = 'searching'"), sqlite_where=sa.text("status = 'searching'")),
    )
