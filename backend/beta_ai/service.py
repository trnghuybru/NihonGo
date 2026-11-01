"""Reserve and settle Gemini spend before provider I/O in beta mode."""
import json as jsonlib
import os
import re
from decimal import Decimal, InvalidOperation, ROUND_CEILING

import requests
from flask import g, has_request_context, request
from sqlalchemy import func, select, text

from api_errors import ApiError
from auth.beta import enabled
from auth.models import User, now
from extensions import db
from .models import AiAttempt, AiWallet
from services.gemini_provider import prepare_request

MICRO = Decimal("1000000")
USER_BUDGET = 2_000_000
MODEL_PATH = re.compile(r"/models/([A-Za-z0-9._-]+):generateContent$")


def _prices(model):
    try:
        table = jsonlib.loads(os.getenv("BETA_GEMINI_PRICES_JSON", ""))
        rates = table[model]
        input_rate = Decimal(str(rates["input_usd_per_million"]))
        output_rate = Decimal(str(rates["output_usd_per_million"]))
        if not input_rate.is_finite() or not output_rate.is_finite() or input_rate <= 0 or output_rate <= 0:
            raise ValueError()
        return input_rate, output_rate
    except (ValueError, KeyError, TypeError, ArithmeticError, InvalidOperation):
        raise ApiError("Chưa cấu hình giá Gemini cho model beta.", 503, "beta_price_unavailable") from None


def _micro(value):
    return int((value * MICRO).to_integral_value(rounding=ROUND_CEILING))


def _cost(model, input_tokens, output_tokens):
    input_rate, output_rate = _prices(model)
    return max(1, _micro((Decimal(input_tokens) * input_rate +
                          Decimal(output_tokens) * output_rate) / MICRO))


def _user():
    if not has_request_context() or not getattr(g, "user", None):
        raise ApiError("Không xác định được tài khoản dùng AI beta.", 503, "beta_ai_unavailable")
    return g.user.id


def balance(user_id):
    wallet = db.session.get(AiWallet, user_id)
    spent = wallet.spent_micro_usd if wallet else 0
    held = wallet.held_micro_usd if wallet else 0
    expires = wallet.started_at + 14 * 86400 if wallet else None
    return {"budget_usd": 2.0, "spent_usd": spent / 1_000_000,
            "held_usd": held / 1_000_000,
            "available_usd": (max(0, USER_BUDGET - spent - held) / 1_000_000
                              if expires is None or expires > now() else 0),
            "expires_at": expires}


def _hold(user_id, model, action, micro, *, live=False):
    # Locking the user row serializes all reservations for the account.
    user = db.session.scalar(select(User).where(User.id == user_id).with_for_update())
    if user is None:
        raise ApiError("Tài khoản không khả dụng.", 403, "beta_ai_unavailable")
    wallet = db.session.get(AiWallet, user_id)
    if wallet is None:
        wallet = AiWallet(user_id=user_id)
        db.session.add(wallet)
        db.session.flush()
    # A process may die after reservation; retain the conservative charge.
    expired = db.session.scalars(select(AiAttempt).where(
        AiAttempt.user_id == user_id, AiAttempt.status == "held",
        AiAttempt.expires_at <= now())).all()
    for old in expired:
        wallet.held_micro_usd -= old.held_micro_usd
        wallet.spent_micro_usd += old.held_micro_usd
        old.charged_micro_usd = old.held_micro_usd
        old.status, old.finished_at = "expired", now()
    if wallet.started_at + 14 * 86400 <= now():
        raise ApiError("Đợt dùng thử AI đã kết thúc.", 403, "beta_ai_expired")
    if wallet.spent_micro_usd + wallet.held_micro_usd + micro > USER_BUDGET:
        raise ApiError("Ví AI 2 USD không đủ cho thao tác này.", 403, "beta_ai_budget_exhausted")
    if live:
        if db.session.get_bind().dialect.name == "postgresql":
            db.session.execute(text("SELECT pg_advisory_xact_lock(782651010)"))
        active = db.session.scalars(select(AiAttempt).where(
            AiAttempt.action == "live", AiAttempt.status.in_(("held", "live")),
            AiAttempt.expires_at > now())).all()
        if any(item.user_id == user_id for item in active):
            raise ApiError("Bạn đang có một phiên Nói đang hoạt động.", 409, "beta_live_active")
        if len(active) >= 2:
            raise ApiError("Các phiên Nói đang bận. Vui lòng thử lại sau.", 429, "beta_live_busy")
    else:
        if db.session.get_bind().dialect.name == "postgresql":
            db.session.execute(text("SELECT pg_advisory_xact_lock(782651011)"))
        busy = db.session.scalar(select(func.count()).select_from(AiAttempt).where(
            AiAttempt.action != "live", AiAttempt.status == "held",
            AiAttempt.expires_at > now()))
        if busy >= 3:
            raise ApiError("AI đang xử lý nhiều yêu cầu. Vui lòng thử lại sau.", 429, "beta_ai_busy")
    wallet.held_micro_usd += micro
    attempt = AiAttempt(user_id=user_id, model=model, action=action,
                        held_micro_usd=micro, expires_at=now() + (190 if live else 125))
    db.session.add(attempt)
    db.session.commit()
    return attempt.id


def settle(attempt_id, charge, *, live=False):
    attempt = db.session.get(AiAttempt, attempt_id)
    if attempt is None or attempt.status != "held":
        return
    db.session.scalar(select(User).where(User.id == attempt.user_id).with_for_update())
    db.session.refresh(attempt)
    if attempt.status != "held":
        db.session.rollback()
        return
    wallet = db.session.get(AiWallet, attempt.user_id)
    wallet.held_micro_usd -= attempt.held_micro_usd
    wallet.spent_micro_usd += max(0, charge)
    attempt.charged_micro_usd = max(0, charge)
    attempt.status = "live" if live else "settled"
    attempt.finished_at = now()
    db.session.commit()


def post(url, *, json=None, **kwargs):
    """Drop-in requests.post for Gemini generateContent calls."""
    url, kwargs = prepare_request(url, kwargs)
    if not enabled():
        return requests.post(url, json=json, **kwargs)
    match = MODEL_PATH.search(url)
    if not match or not isinstance(json, dict):
        raise ApiError("Lời gọi AI chưa được kiểm soát ngân sách.", 503, "beta_ai_unavailable")
    model = match.group(1)
    output = json.get("generationConfig", {}).get("maxOutputTokens")
    if type(output) is not int or not 1 <= output <= 8192:
        raise ApiError("Lời gọi AI thiếu giới hạn output.", 503, "beta_ai_unavailable")
    from beta_daily.service import daily_mode
    if daily_mode():
        return requests.post(url, json=json, **kwargs)
    # UTF-8 bytes and a 2x margin intentionally over-reserve tokens.
    input_bound = len(jsonlib.dumps(json, ensure_ascii=False).encode("utf-8")) * 2
    estimate = _cost(model, input_bound, output * 2)
    action = request.path if has_request_context() else "unknown"
    attempt_id = _hold(_user(), model, action, estimate)
    try:
        response = requests.post(url, json=json, **kwargs)
    except Exception:
        settle(attempt_id, estimate)
        raise
    if response.status_code == 200:
        try:
            usage = response.json().get("usageMetadata", {})
            prompt = int(usage["promptTokenCount"])
            total = int(usage["totalTokenCount"])
            if prompt < 0 or total < prompt:
                raise ValueError()
            charge = _cost(model, prompt, total - prompt)
        except (KeyError, ValueError, TypeError, AttributeError):
            charge = estimate
    else:
        charge = 0 if response.status_code in (400, 401, 402, 403, 404, 429) else estimate
    settle(attempt_id, charge)
    return response


def hold_live(model):
    if not enabled():
        return None
    # Ephemeral token expiry does not prove that an established client session
    # ended. Keep direct Gemini Live off until server-side usage can be measured.
    if os.getenv("BETA_LIVE_ENABLED", "false").lower() != "true":
        raise ApiError("Nói trực tiếp chưa mở trong đợt thử nghiệm này.", 503, "beta_live_disabled")
    try:
        reserve = Decimal(os.getenv("BETA_LIVE_RESERVE_USD", ""))
        if not reserve.is_finite() or reserve <= 0 or reserve > Decimal("2"):
            raise ValueError()
    except (ValueError, ArithmeticError, InvalidOperation):
        raise ApiError("Chưa cấu hình mức giữ trước cho Gemini Live.", 503, "beta_live_unavailable") from None
    return _hold(_user(), model, "live", _micro(reserve), live=True)


def finish_live(attempt_id, *, success):
    if attempt_id is None:
        return
    attempt = db.session.get(AiAttempt, attempt_id)
    settle(attempt_id, attempt.held_micro_usd if success else 0, live=success)
