"""Daily study time: merge real intervals so retries and overlapping tabs never double count."""
from datetime import datetime, time, timedelta
import time as clock
from zoneinfo import ZoneInfo

from sqlalchemy import select

from api_errors import ApiError
from auth.models import User
from extensions import db
from .models import LearningPreferences, LearningStudyDay

STUDY_TIMEZONE = ZoneInfo('Asia/Ho_Chi_Minh')
MAX_INTERVAL_MS = 60_000
MAX_AGE_MS = 24 * 60 * 60 * 1000


def timestamp_ms():
    return int(clock.time() * 1000)


def merge_intervals(intervals):
    merged = []
    for start, end in sorted(intervals):
        if merged and start <= merged[-1][1]:
            merged[-1][1] = max(merged[-1][1], end)
        else:
            merged.append([start, end])
    return merged


def day_start(day):
    return int(datetime.combine(day, time.min, tzinfo=STUDY_TIMEZONE).timestamp() * 1000)


def parse_intervals(data, now_ms):
    if not isinstance(data, dict) or set(data) != {'account_id', 'intervals'}:
        raise ApiError('Dữ liệu thời gian học không hợp lệ.')
    rows = data['intervals']
    if not isinstance(rows, list) or not 1 <= len(rows) <= 60:
        raise ApiError('Vui lòng gửi từ 1 đến 60 khoảng thời gian học.')
    result = []
    for row in rows:
        if (not isinstance(row, list) or len(row) != 2 or
                any(type(value) is not int for value in row)):
            raise ApiError('Khoảng thời gian học không hợp lệ.')
        start, end = row
        if not 0 < end - start <= MAX_INTERVAL_MS or start < now_ms - MAX_AGE_MS or end > now_ms + 5000:
            raise ApiError('Thời gian học phải nằm trong 24 giờ gần nhất, tối đa 60 giây mỗi khoảng.')
        # Ignore clock-calibration jitter beyond the server's current time.
        end = min(end, now_ms)
        if start < end:
            result.append([start, end])
    return result


def daily_progress(user_id, now_ms=None):
    now_ms = timestamp_ms() if now_ms is None else now_ms
    day = datetime.fromtimestamp(now_ms / 1000, STUDY_TIMEZONE).date()
    profile = db.session.get(LearningPreferences, user_id)
    row = db.session.get(LearningStudyDay, (user_id, day))
    seconds = row.seconds if row else 0
    goal = profile.daily_minutes * 60 if profile else None
    return {'date': day.isoformat(), 'timezone': str(STUDY_TIMEZONE), 'server_time_ms': now_ms,
            'seconds': seconds, 'goal_seconds': goal, 'completed': goal is not None and seconds >= goal,
            'intervals': row.intervals if row else []}


def record_study(user_id, data):
    now_ms = timestamp_ms()
    intervals = parse_intervals(data, now_ms)
    if data['account_id'] != user_id:
        raise ApiError('Tài khoản đã thay đổi. Vui lòng tải lại tiến độ.', 403, 'study_account_changed')
    # Serialize all devices on the user, including the first study day insert.
    db.session.execute(select(User.id).where(User.id == user_id).with_for_update()).scalar_one()
    if db.session.get(LearningPreferences, user_id) is None:
        raise ApiError('Vui lòng đặt mục tiêu học tập trước.', 409, 'learning_setup_required')
    days = {}
    for start, end in intervals:
        day = datetime.fromtimestamp(start / 1000, STUDY_TIMEZONE).date()
        while start < end:
            boundary = day_start(day + timedelta(days=1))
            days.setdefault(day, []).append([start, min(end, boundary)])
            start, day = boundary, day + timedelta(days=1)
    for day, additions in sorted(days.items()):
        row = db.session.get(LearningStudyDay, (user_id, day), populate_existing=True)
        if row is None:
            row = LearningStudyDay(user_id=user_id, day=day, intervals=[], seconds=0)
            db.session.add(row)
        row.intervals = merge_intervals([*row.intervals, *additions])
        row.seconds = sum(end - start for start, end in row.intervals) // 1000
        row.updated_at = now_ms
    db.session.commit()
    return daily_progress(user_id, now_ms)
