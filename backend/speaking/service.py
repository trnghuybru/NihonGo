"""Scenario discovery and atomic creation of practice sessions."""
from dataclasses import dataclass
import uuid

from sqlalchemy import exists, func, select

from api_errors import ApiError
from extensions import db
from learning.options import LEVEL_IDS
from .models import (
    ConversationMessage, ConversationSession, Scenario, ScenarioCategory,
    ScenarioRole, utc_now,
)


def parse_id(value, field="id", status=400):
    try:
        if not isinstance(value, str):
            raise ValueError()
        return str(uuid.UUID(value))
    except (ValueError, AttributeError):
        raise ApiError(f"Thông tin {field} không hợp lệ.", status,
                       "scenario_not_found" if status == 404 else "invalid_request") from None


@dataclass(frozen=True)
class ScenarioFilters:
    page: int
    page_size: int
    category_id: str | None
    level: str | None
    language_code: str | None
    q: str | None

    @classmethod
    def parse(cls, args):
        allowed = {"page", "page_size", "category_id", "level", "language_code", "q"}
        if set(args) - allowed or any(len(args.getlist(key)) != 1 for key in args):
            raise ApiError("Tham số lọc không hợp lệ.")

        def number(key, default, maximum):
            value = args.get(key, str(default))
            if not value.isascii() or not value.isdecimal() or len(value) > 7:
                raise ApiError(f"Tham số {key} phải là số nguyên dương.")
            value = int(value)
            if not 1 <= value <= maximum:
                raise ApiError(f"Tham số {key} phải từ 1 đến {maximum}.")
            return value

        level = args.get("level")
        if level is not None and level not in LEVEL_IDS:
            raise ApiError("Trình độ không hợp lệ.")
        language = args.get("language_code")
        if language is not None and (not language.strip() or len(language) > 35):
            raise ApiError("Ngôn ngữ không hợp lệ.")
        query = args.get("q")
        if query is not None and len(query) > 200:
            raise ApiError("Từ khóa tìm kiếm tối đa 200 ký tự.")
        category = args.get("category_id")
        return cls(number("page", 1, 1000000), number("page_size", 20, 100),
                   parse_id(category, "category_id") if category is not None else None,
                   level, language.strip() if language is not None else None,
                   query.strip() if query is not None else None)


def available_conditions():
    # A published scenario without an AI role cannot be started.
    return (Scenario.status == "published",
            exists().where(ScenarioRole.scenario_id == Scenario.id))


def public_category(category):
    return {"id": category.id, "name": category.name, "description": category.description}


def public_scenario(scenario, category):
    return {
        "id": scenario.id, "title": scenario.title, "description": scenario.description,
        "language_code": scenario.language_code, "difficulty_level": scenario.difficulty_level,
        "estimated_duration_minutes": scenario.estimated_duration_minutes,
        "category": public_category(category),
    }


def public_role(role):
    # AI instructions are server-only, including in the private session snapshot.
    return {"id": role.id, "name": role.name, "description": role.description,
            "opening_message": role.opening_message}


def list_scenarios(filters):
    conditions = list(available_conditions())
    for column, value in ((Scenario.category_id, filters.category_id),
                          (Scenario.difficulty_level, filters.level),
                          (Scenario.language_code, filters.language_code)):
        if value is not None:
            conditions.append(column == value)
    if filters.q:
        # Treat LIKE wildcard characters as text entered by the user.
        escaped = filters.q.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        pattern = f"%{escaped}%"
        conditions.append(Scenario.title.ilike(pattern, escape="\\") |
                          Scenario.description.ilike(pattern, escape="\\"))
    total = db.session.scalar(select(func.count()).select_from(Scenario).where(*conditions))
    rows = db.session.execute(
        select(Scenario, ScenarioCategory).join(ScenarioCategory, Scenario.category_id == ScenarioCategory.id)
        .where(*conditions).order_by(Scenario.created_at.desc(), Scenario.id)
        .limit(filters.page_size).offset((filters.page - 1) * filters.page_size)
    ).all()
    return {"items": [public_scenario(scenario, category) for scenario, category in rows],
            "pagination": {"page": filters.page, "page_size": filters.page_size, "total": total,
                           "total_pages": (total + filters.page_size - 1) // filters.page_size}}


def get_scenario(scenario_id, lock=False):
    scenario_id = parse_id(scenario_id, status=404)
    statement = select(Scenario).where(Scenario.id == scenario_id, *available_conditions())
    if lock:
        statement = statement.with_for_update()
    scenario = db.session.scalar(statement)
    if scenario is None:
        raise ApiError("Không tìm thấy tình huống.", 404, "scenario_not_found")
    category = db.session.get(ScenarioCategory, scenario.category_id)
    roles_statement = select(ScenarioRole).where(ScenarioRole.scenario_id == scenario.id).order_by(ScenarioRole.id)
    if lock:
        roles_statement = roles_statement.with_for_update()
    roles = db.session.scalars(roles_statement).all()
    if not roles:
        raise ApiError("Không tìm thấy tình huống.", 404, "scenario_not_found")
    return scenario, category, roles


def scenario_detail(scenario, category, roles):
    return {**public_scenario(scenario, category), "context": scenario.context,
            "learning_objectives": scenario.learning_objectives,
            "roles": [public_role(role) for role in roles]}


@dataclass(frozen=True)
class StartSessionInput:
    role_id: str | None
    input_mode: str
    audio_storage_enabled: bool

    @classmethod
    def parse(cls, data):
        if not isinstance(data, dict) or set(data) - {"role_id", "input_mode", "audio_storage_enabled"}:
            raise ApiError("Yêu cầu phải là JSON object với các trường được hỗ trợ.")
        mode = data.get("input_mode", "text")
        if not isinstance(mode, str) or mode not in {"text", "voice"}:
            raise ApiError("Chế độ nhập phải là text hoặc voice.")
        recording = data.get("audio_storage_enabled", False)
        if type(recording) is not bool:
            raise ApiError("Tùy chọn lưu audio phải là boolean.")
        role = parse_id(data["role_id"], "role_id") if "role_id" in data else None
        return cls(role, mode, recording)


def start_session(user_id, scenario_id, values):
    scenario, category, roles = get_scenario(scenario_id, lock=True)
    if values.role_id is None:
        if len(roles) != 1:
            raise ApiError("Vui lòng chọn vai AI cho tình huống.", 400, "role_required")
        role = roles[0]
    else:
        role = next((item for item in roles if item.id == values.role_id), None)
        if role is None:
            raise ApiError("Vai AI không thuộc tình huống này.", 400, "invalid_role")
    timestamp = utc_now()
    # Copy immutable primitive values rather than exposing mutable ORM objects.
    snapshot = {**public_scenario(scenario, category), "context": scenario.context,
                "learning_objectives": scenario.learning_objectives,
                "role": {**public_role(role), "ai_instructions": role.ai_instructions}}
    session = ConversationSession(
        user_id=user_id, scenario_id=scenario.id, scenario_role_id=role.id,
        scenario_snapshot=snapshot, status="active", current_input_mode=values.input_mode,
        audio_storage_enabled=values.audio_storage_enabled, started_at=timestamp,
        last_resumed_at=timestamp, accumulated_active_ms=0,
    )
    db.session.add(session)
    db.session.flush()
    opening = None
    if role.opening_message and role.opening_message.strip():
        opening = ConversationMessage(
            session_id=session.id, sequence_number=1, speaker="assistant", input_mode="generated",
            content=role.opening_message, status="completed", occurred_at=timestamp,
        )
        db.session.add(opening)
        db.session.flush()
    response = {
        "session": {"id": session.id, "scenario_id": scenario.id, "scenario_role_id": role.id,
                    "status": session.status, "current_input_mode": session.current_input_mode,
                    "audio_storage_enabled": session.audio_storage_enabled,
                    "started_at": timestamp.isoformat(), "accumulated_active_ms": 0},
        "scenario": {**public_scenario(scenario, category), "context": scenario.context,
                     "learning_objectives": scenario.learning_objectives, "role": public_role(role)},
        "opening_message": ({"id": opening.id, "sequence_number": 1, "speaker": "assistant",
                             "input_mode": "generated", "content": opening.content,
                             "status": "completed", "occurred_at": timestamp.isoformat()}
                            if opening else None),
    }
    db.session.commit()
    return response
