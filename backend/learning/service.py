"""Validation and transactional persistence, independent of HTTP handlers."""
from dataclasses import dataclass

from sqlalchemy import select

from api_errors import ApiError
from auth.models import User, now
from extensions import db
from .models import LearningPreferences
from .options import DAILY_MINUTES, GOAL_IDS, LEVEL_IDS


@dataclass(frozen=True)
class PreferencesInput:
    level: str
    goal: str
    daily_minutes: int
    version: int

    @classmethod
    def parse(cls, data):
        fields = {"level", "goal", "daily_minutes", "version", "level_confirmed"}
        if not isinstance(data, dict) or set(data) != fields:
            raise ApiError("Vui lòng gửi đầy đủ thông tin thiết lập học tập.")
        if not isinstance(data["level"], str) or data["level"] not in LEVEL_IDS:
            raise ApiError("Vui lòng chọn trình độ hiện tại.")
        if not isinstance(data["goal"], str) or data["goal"] not in GOAL_IDS:
            raise ApiError("Vui lòng chọn mục tiêu học tập.")
        if type(data["daily_minutes"]) is not int or data["daily_minutes"] not in DAILY_MINUTES:
            raise ApiError("Vui lòng chọn thời gian học mỗi ngày hợp lệ.")
        if data["level_confirmed"] is not True:
            raise ApiError("Vui lòng xác nhận trình độ trước khi lưu.")
        if type(data["version"]) is not int or not 0 <= data["version"] < 2147483647:
            raise ApiError("Phiên bản thiết lập không hợp lệ.")
        return cls(data["level"], data["goal"], data["daily_minutes"], data["version"])


def save_preferences(user_id, values):
    # Lock the owner even on the first save, when no preference row exists yet.
    # This serializes concurrent creates/updates across devices and workers.
    db.session.execute(select(User.id).where(User.id == user_id).with_for_update()).scalar_one()
    profile = db.session.get(LearningPreferences, user_id, populate_existing=True)
    if values.version != (profile.version if profile else 0):
        raise ApiError("Thiết lập đã thay đổi trên một phiên khác. Vui lòng tải lại trước khi chỉnh sửa.",
                       409, "preferences_conflict")
    timestamp = now()
    if profile is None:
        profile = LearningPreferences(user_id=user_id, created_at=timestamp)
        db.session.add(profile)
    profile.level = values.level
    profile.goal = values.goal
    profile.daily_minutes = values.daily_minutes
    profile.level_confirmed_at = timestamp
    profile.updated_at = timestamp
    profile.version = values.version + 1
    db.session.commit()
    return profile
