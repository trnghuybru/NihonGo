"""Add speaking scenarios, conversation history, rooms, and matchmaking.

Revision ID: c9f41b2a6e80
Revises: ab7248e36f10

Existing authentication users keep their VARCHAR(36) identifiers. New entity
identifiers use PostgreSQL UUID; timestamps use TIMESTAMP WITH TIME ZONE.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "c9f41b2a6e80"
down_revision = "ab7248e36f10"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table('evaluation_criteria',
    sa.Column('id', sa.Uuid(as_uuid=False), server_default=sa.text('gen_random_uuid()'), nullable=False),
    sa.Column('code', sa.String(length=50), nullable=False),
    sa.Column('name', sa.String(length=100), nullable=False),
    sa.Column('description', sa.Text(), nullable=False),
    sa.Column('is_active', sa.Boolean(), server_default=sa.text('true'), nullable=False),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('code')
    )
    op.create_table('scenario_categories',
    sa.Column('id', sa.Uuid(as_uuid=False), server_default=sa.text('gen_random_uuid()'), nullable=False),
    sa.Column('name', sa.String(length=100), nullable=False),
    sa.Column('description', sa.Text(), nullable=True),
    sa.Column('sort_order', sa.Integer(), server_default='0', nullable=False),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('name')
    )
    op.create_table('matching_preferences',
    sa.Column('user_id', sa.String(length=36), nullable=False),
    sa.Column('language_code', sa.String(length=35), nullable=False),
    sa.Column('own_level', sa.String(length=16), nullable=False),
    sa.Column('desired_min_level', sa.String(length=16), nullable=True),
    sa.Column('desired_max_level', sa.String(length=16), nullable=True),
    sa.Column('topic', sa.String(length=100), nullable=True),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('user_id')
    )
    op.create_table('rooms',
    sa.Column('id', sa.Uuid(as_uuid=False), server_default=sa.text('gen_random_uuid()'), nullable=False),
    sa.Column('created_by', sa.String(length=36), nullable=False),
    sa.Column('title', sa.String(length=200), nullable=False),
    sa.Column('description', sa.Text(), nullable=True),
    sa.Column('topic', sa.String(length=100), nullable=True),
    sa.Column('language_code', sa.String(length=35), nullable=False),
    sa.Column('difficulty_level', sa.String(length=16), nullable=False),
    sa.Column('visibility', sa.String(length=16), server_default='public', nullable=False),
    sa.Column('source', sa.String(length=16), server_default='manual', nullable=False),
    sa.Column('status', sa.String(length=16), server_default='open', nullable=False),
    sa.Column('max_members', sa.Integer(), server_default='2', nullable=False),
    sa.Column('password_hash', sa.Text(), nullable=True),
    sa.Column('voice_provider_room_id', sa.Text(), nullable=True),
    sa.Column('closed_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.CheckConstraint("source <> 'matchmaking' OR max_members = 2", name='ck_matchmaking_room_capacity'),
    sa.CheckConstraint("source IN ('manual', 'matchmaking')", name='ck_room_source'),
    sa.CheckConstraint("status IN ('open', 'closed')", name='ck_room_status'),
    sa.CheckConstraint("visibility = 'private' OR password_hash IS NULL", name='ck_room_password_visibility'),
    sa.CheckConstraint("visibility IN ('public', 'private')", name='ck_room_visibility'),
    sa.CheckConstraint('max_members >= 2', name='ck_room_capacity'),
    sa.ForeignKeyConstraint(['created_by'], ['users.id'], ),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('voice_provider_room_id')
    )
    op.create_index('idx_rooms_open_filters', 'rooms', ['language_code', 'difficulty_level', 'topic', sa.literal_column('created_at DESC')], unique=False, postgresql_where=sa.text("status = 'open'"), sqlite_where=sa.text("status = 'open'"))
    op.create_index('ix_rooms_created_by', 'rooms', ['created_by'], unique=False)
    op.create_table('scenarios',
    sa.Column('id', sa.Uuid(as_uuid=False), server_default=sa.text('gen_random_uuid()'), nullable=False),
    sa.Column('category_id', sa.Uuid(as_uuid=False), nullable=False),
    sa.Column('title', sa.String(length=200), nullable=False),
    sa.Column('description', sa.Text(), nullable=False),
    sa.Column('context', sa.Text(), nullable=False),
    sa.Column('learning_objectives', sa.Text(), nullable=False),
    sa.Column('language_code', sa.String(length=35), nullable=False),
    sa.Column('difficulty_level', sa.String(length=16), nullable=False),
    sa.Column('estimated_duration_minutes', sa.Integer(), nullable=False),
    sa.Column('status', sa.String(length=16), server_default='draft', nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.CheckConstraint("status IN ('draft', 'published', 'archived')", name='ck_scenario_status'),
    sa.CheckConstraint('estimated_duration_minutes > 0', name='ck_scenario_duration'),
    sa.ForeignKeyConstraint(['category_id'], ['scenario_categories.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index('idx_scenarios_published_filters', 'scenarios', ['language_code', 'difficulty_level', 'category_id'], unique=False, postgresql_where=sa.text("status = 'published'"), sqlite_where=sa.text("status = 'published'"))
    op.create_index('ix_scenarios_category_id', 'scenarios', ['category_id'], unique=False)
    op.create_table('matchmaking_requests',
    sa.Column('id', sa.Uuid(as_uuid=False), server_default=sa.text('gen_random_uuid()'), nullable=False),
    sa.Column('user_id', sa.String(length=36), nullable=False),
    sa.Column('language_code', sa.String(length=35), nullable=False),
    sa.Column('own_level', sa.String(length=16), nullable=False),
    sa.Column('desired_min_level', sa.String(length=16), nullable=True),
    sa.Column('desired_max_level', sa.String(length=16), nullable=True),
    sa.Column('topic', sa.String(length=100), nullable=True),
    sa.Column('status', sa.String(length=16), server_default='searching', nullable=False),
    sa.Column('matched_room_id', sa.Uuid(as_uuid=False), nullable=True),
    sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('matched_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('cancelled_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.CheckConstraint("(status = 'matched' AND matched_room_id IS NOT NULL AND matched_at IS NOT NULL) OR (status <> 'matched' AND matched_room_id IS NULL AND matched_at IS NULL)", name='ck_matchmaking_result'),
    sa.CheckConstraint("status IN ('searching', 'matched', 'cancelled', 'expired')", name='ck_matchmaking_status'),
    sa.CheckConstraint('expires_at > created_at', name='ck_matchmaking_expiry'),
    sa.ForeignKeyConstraint(['matched_room_id'], ['rooms.id'], ),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index('idx_matchmaking_searching', 'matchmaking_requests', ['language_code', 'created_at'], unique=False, postgresql_where=sa.text("status = 'searching'"), sqlite_where=sa.text("status = 'searching'"))
    op.create_index('ix_matchmaking_room', 'matchmaking_requests', ['matched_room_id'], unique=False)
    op.create_index('ix_matchmaking_user_created', 'matchmaking_requests', ['user_id', sa.literal_column('created_at DESC')], unique=False)
    op.create_index('uq_matchmaking_searching_user', 'matchmaking_requests', ['user_id'], unique=True, postgresql_where=sa.text("status = 'searching'"), sqlite_where=sa.text("status = 'searching'"))
    op.create_table('room_invitations',
    sa.Column('id', sa.Uuid(as_uuid=False), server_default=sa.text('gen_random_uuid()'), nullable=False),
    sa.Column('room_id', sa.Uuid(as_uuid=False), nullable=False),
    sa.Column('invited_by', sa.String(length=36), nullable=False),
    sa.Column('invitee_user_id', sa.String(length=36), nullable=True),
    sa.Column('token_hash', sa.String(length=64), nullable=False),
    sa.Column('status', sa.String(length=16), server_default='pending', nullable=False),
    sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('responded_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.CheckConstraint("status IN ('pending', 'accepted', 'declined', 'revoked', 'expired')", name='ck_invitation_status'),
    sa.CheckConstraint('expires_at > created_at', name='ck_invitation_expiry'),
    sa.ForeignKeyConstraint(['invited_by'], ['users.id'], ),
    sa.ForeignKeyConstraint(['invitee_user_id'], ['users.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['room_id'], ['rooms.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('token_hash')
    )
    op.create_index('ix_invitations_recipient', 'room_invitations', ['invitee_user_id'], unique=False)
    op.create_index('ix_invitations_room', 'room_invitations', ['room_id'], unique=False)
    op.create_index('ix_invitations_sender', 'room_invitations', ['invited_by'], unique=False)
    op.create_table('room_members',
    sa.Column('id', sa.Uuid(as_uuid=False), server_default=sa.text('gen_random_uuid()'), nullable=False),
    sa.Column('room_id', sa.Uuid(as_uuid=False), nullable=False),
    sa.Column('user_id', sa.String(length=36), nullable=False),
    sa.Column('role', sa.String(length=16), server_default='member', nullable=False),
    sa.Column('status', sa.String(length=16), server_default='joined', nullable=False),
    sa.Column('is_muted', sa.Boolean(), server_default=sa.text('true'), nullable=False),
    sa.Column('joined_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('left_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.CheckConstraint("role IN ('host', 'member')", name='ck_member_role'),
    sa.CheckConstraint("status IN ('joined', 'left', 'removed')", name='ck_member_status'),
    sa.ForeignKeyConstraint(['room_id'], ['rooms.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('room_id', 'user_id', name='uq_room_member')
    )
    op.create_index('ix_room_members_user', 'room_members', ['user_id'], unique=False)
    op.create_index('uq_joined_room_host', 'room_members', ['room_id'], unique=True, postgresql_where=sa.text("role = 'host' AND status = 'joined'"), sqlite_where=sa.text("role = 'host' AND status = 'joined'"))
    op.create_table('scenario_roles',
    sa.Column('id', sa.Uuid(as_uuid=False), server_default=sa.text('gen_random_uuid()'), nullable=False),
    sa.Column('scenario_id', sa.Uuid(as_uuid=False), nullable=False),
    sa.Column('name', sa.String(length=100), nullable=False),
    sa.Column('description', sa.Text(), nullable=False),
    sa.Column('ai_instructions', sa.Text(), nullable=False),
    sa.Column('opening_message', sa.Text(), nullable=True),
    sa.ForeignKeyConstraint(['scenario_id'], ['scenarios.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('scenario_id', 'id', name='uq_scenario_role_parent'),
    sa.UniqueConstraint('scenario_id', 'name', name='uq_scenario_role_name')
    )
    op.create_table('conversation_sessions',
    sa.Column('id', sa.Uuid(as_uuid=False), server_default=sa.text('gen_random_uuid()'), nullable=False),
    sa.Column('user_id', sa.String(length=36), nullable=False),
    sa.Column('scenario_id', sa.Uuid(as_uuid=False), nullable=False),
    sa.Column('scenario_role_id', sa.Uuid(as_uuid=False), nullable=False),
    sa.Column('retry_of_session_id', sa.Uuid(as_uuid=False), nullable=True),
    sa.Column('scenario_snapshot', sa.JSON().with_variant(postgresql.JSONB(astext_type=sa.Text()), 'postgresql'), nullable=False),
    sa.Column('status', sa.String(length=16), server_default='active', nullable=False),
    sa.Column('current_input_mode', sa.String(length=8), server_default='text', nullable=False),
    sa.Column('audio_storage_enabled', sa.Boolean(), server_default=sa.text('false'), nullable=False),
    sa.Column('started_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('paused_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('ended_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('accumulated_active_ms', sa.BigInteger(), server_default='0', nullable=False),
    sa.Column('last_resumed_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.CheckConstraint("current_input_mode IN ('text', 'voice')", name='ck_session_input_mode'),
    sa.CheckConstraint("status IN ('active', 'paused', 'completed', 'abandoned')", name='ck_session_status'),
    sa.CheckConstraint('accumulated_active_ms >= 0', name='ck_session_active_duration'),
    sa.CheckConstraint('ended_at IS NULL OR ended_at >= started_at', name='ck_session_end_time'),
    sa.CheckConstraint('retry_of_session_id IS NULL OR retry_of_session_id <> id', name='ck_session_retry_not_self'),
    sa.ForeignKeyConstraint(['retry_of_session_id'], ['conversation_sessions.id'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['scenario_id', 'scenario_role_id'], ['scenario_roles.scenario_id', 'scenario_roles.id'], name='fk_session_scenario_role'),
    sa.ForeignKeyConstraint(['scenario_id'], ['scenarios.id'], ),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index('idx_sessions_user_created', 'conversation_sessions', ['user_id', sa.literal_column('created_at DESC')], unique=False)
    op.create_index('ix_sessions_retry_of', 'conversation_sessions', ['retry_of_session_id'], unique=False)
    op.create_index('ix_sessions_scenario_role', 'conversation_sessions', ['scenario_id', 'scenario_role_id'], unique=False)
    op.create_table('conversation_messages',
    sa.Column('id', sa.Uuid(as_uuid=False), server_default=sa.text('gen_random_uuid()'), nullable=False),
    sa.Column('session_id', sa.Uuid(as_uuid=False), nullable=False),
    sa.Column('sequence_number', sa.BigInteger(), nullable=False),
    sa.Column('speaker', sa.String(length=16), nullable=False),
    sa.Column('input_mode', sa.String(length=16), nullable=False),
    sa.Column('content', sa.Text(), server_default='', nullable=False),
    sa.Column('status', sa.String(length=16), server_default='pending', nullable=False),
    sa.Column('occurred_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.CheckConstraint("input_mode IN ('text', 'voice', 'generated')", name='ck_message_input_mode'),
    sa.CheckConstraint("speaker IN ('user', 'assistant')", name='ck_message_speaker'),
    sa.CheckConstraint("status IN ('pending', 'completed', 'failed')", name='ck_message_status'),
    sa.CheckConstraint('sequence_number > 0', name='ck_message_sequence'),
    sa.ForeignKeyConstraint(['session_id'], ['conversation_sessions.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('session_id', 'id', name='uq_message_parent'),
    sa.UniqueConstraint('session_id', 'sequence_number', name='uq_message_sequence')
    )
    op.create_table('session_evaluations',
    sa.Column('id', sa.Uuid(as_uuid=False), server_default=sa.text('gen_random_uuid()'), nullable=False),
    sa.Column('session_id', sa.Uuid(as_uuid=False), nullable=False),
    sa.Column('status', sa.String(length=16), server_default='pending', nullable=False),
    sa.Column('overall_score', sa.Numeric(precision=5, scale=2), nullable=True),
    sa.Column('summary', sa.Text(), nullable=True),
    sa.Column('strengths', sa.Text(), nullable=True),
    sa.Column('improvement_suggestions', sa.Text(), nullable=True),
    sa.Column('model_name', sa.String(length=200), nullable=True),
    sa.Column('rubric_version', sa.String(length=50), nullable=False),
    sa.Column('error_message', sa.Text(), nullable=True),
    sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.CheckConstraint("status <> 'completed' OR (overall_score IS NOT NULL AND completed_at IS NOT NULL)", name='ck_evaluation_completed'),
    sa.CheckConstraint("status IN ('pending', 'processing', 'completed', 'failed')", name='ck_evaluation_status'),
    sa.CheckConstraint('overall_score BETWEEN 0 AND 100', name='ck_evaluation_score'),
    sa.ForeignKeyConstraint(['session_id'], ['conversation_sessions.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('session_id')
    )
    op.create_table('conversation_audio_assets',
    sa.Column('id', sa.Uuid(as_uuid=False), server_default=sa.text('gen_random_uuid()'), nullable=False),
    sa.Column('session_id', sa.Uuid(as_uuid=False), nullable=False),
    sa.Column('message_id', sa.Uuid(as_uuid=False), nullable=True),
    sa.Column('asset_type', sa.String(length=24), nullable=False),
    sa.Column('storage_key', sa.Text(), nullable=False),
    sa.Column('mime_type', sa.String(length=100), nullable=False),
    sa.Column('size_bytes', sa.BigInteger(), nullable=True),
    sa.Column('duration_ms', sa.BigInteger(), nullable=True),
    sa.Column('status', sa.String(length=16), server_default='uploading', nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.CheckConstraint("(asset_type = 'utterance' AND message_id IS NOT NULL) OR (asset_type = 'session_recording' AND message_id IS NULL)", name='ck_audio_message_type'),
    sa.CheckConstraint("asset_type IN ('utterance', 'session_recording')", name='ck_audio_type'),
    sa.CheckConstraint("status IN ('uploading', 'ready', 'failed')", name='ck_audio_status'),
    sa.CheckConstraint('duration_ms >= 0', name='ck_audio_duration'),
    sa.CheckConstraint('size_bytes >= 0', name='ck_audio_size'),
    sa.ForeignKeyConstraint(['session_id', 'message_id'], ['conversation_messages.session_id', 'conversation_messages.id'], name='fk_audio_session_message', ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['session_id'], ['conversation_sessions.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('storage_key')
    )
    op.create_index('ix_audio_session_message', 'conversation_audio_assets', ['session_id', 'message_id'], unique=False)
    op.create_table('evaluation_scores',
    sa.Column('id', sa.Uuid(as_uuid=False), server_default=sa.text('gen_random_uuid()'), nullable=False),
    sa.Column('evaluation_id', sa.Uuid(as_uuid=False), nullable=False),
    sa.Column('criterion_id', sa.Uuid(as_uuid=False), nullable=False),
    sa.Column('criterion_name_snapshot', sa.String(length=100), nullable=False),
    sa.Column('weight', sa.Numeric(precision=8, scale=4), nullable=False),
    sa.Column('score', sa.Numeric(precision=5, scale=2), nullable=False),
    sa.Column('feedback', sa.Text(), nullable=False),
    sa.Column('improvement_suggestion', sa.Text(), nullable=True),
    sa.CheckConstraint('score BETWEEN 0 AND 100', name='ck_criterion_score'),
    sa.CheckConstraint('weight > 0', name='ck_criterion_weight'),
    sa.ForeignKeyConstraint(['criterion_id'], ['evaluation_criteria.id'], ),
    sa.ForeignKeyConstraint(['evaluation_id'], ['session_evaluations.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('evaluation_id', 'criterion_id', name='uq_evaluation_criterion')
    )
    op.create_index('ix_evaluation_scores_criterion', 'evaluation_scores', ['criterion_id'], unique=False)


def downgrade():
    op.drop_table('evaluation_scores')
    op.drop_table('conversation_audio_assets')
    op.drop_table('session_evaluations')
    op.drop_table('conversation_messages')
    op.drop_table('conversation_sessions')
    op.drop_table('scenario_roles')
    op.drop_table('room_members')
    op.drop_table('room_invitations')
    op.drop_table('matchmaking_requests')
    op.drop_table('scenarios')
    op.drop_table('rooms')
    op.drop_table('matching_preferences')
    op.drop_table('scenario_categories')
    op.drop_table('evaluation_criteria')
