from extensions import db


class LearningPreferences(db.Model):
    __tablename__ = "learning_preferences"

    user_id = db.Column(db.String(36), db.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    level = db.Column(db.String(16), nullable=False)
    goal = db.Column(db.String(24), nullable=False)
    daily_minutes = db.Column(db.Integer, nullable=False)
    level_confirmed_at = db.Column(db.BigInteger, nullable=False)
    created_at = db.Column(db.BigInteger, nullable=False)
    updated_at = db.Column(db.BigInteger, nullable=False)
    version = db.Column(db.Integer, nullable=False)

    __table_args__ = (
        db.CheckConstraint("level IN ('beginner', 'N5', 'N4', 'N3', 'N2', 'N1')", name="ck_learning_level"),
        db.CheckConstraint("goal IN ('communication', 'jlpt', 'travel', 'work', 'culture')", name="ck_learning_goal"),
        db.CheckConstraint("daily_minutes IN (5, 10, 15, 30, 60)", name="ck_learning_minutes"),
        db.CheckConstraint("version > 0", name="ck_learning_version"),
    )

    def public(self):
        return {**{key: getattr(self, key) for key in (
            "level", "goal", "daily_minutes", "level_confirmed_at", "created_at", "updated_at", "version"
        )}, "level_source": "manual"}
