from flask import Blueprint, g, jsonify
from sqlalchemy import select
from sqlalchemy.exc import OperationalError, ProgrammingError

from api_errors import ApiError
from auth.security import body, require_auth
from extensions import db
from .evaluation import evaluate_writing
from .models import WritingDraft, WritingPrompt, WritingSubmission, now

bp = Blueprint("writing", __name__, url_prefix="/api/writing")


@bp.errorhandler(ApiError)
def api_error(error):
    response = jsonify({"error": error.message, "code": error.code, **error.details})
    if error.status == 429:
        response.headers["Retry-After"] = str(error.details.get("retry_after", 60))
    return response, error.status


DEFAULT_PROMPTS = [
    {
        "id": "self-introduction",
        "title": "Giới thiệu bản thân",
        "level": "N5",
        "prompt_type": "sentence",
        "instruction": "Viết 3 đến 5 câu ngắn để giới thiệu tên, nghề nghiệp và thói quen học tiếng Nhật của bạn.",
        "model_hint": "Bắt đầu bằng tên và sở thích, dùng các câu đơn giản. Không cần viết dài, ưu tiên rõ ràng.",
        "sort_order": 1,
    },
    {
        "id": "daily-routine",
        "title": "Thói quen hằng ngày",
        "level": "N5",
        "prompt_type": "routine",
        "instruction": "Mô tả lịch trình của bạn trong ngày bằng tiếng Nhật, kể từ khi thức dậy đến khi đi ngủ.",
        "model_hint": "Dùng thì hiện tại, các động từ quen thuộc như 起きます, 食べます, 勉強します.",
        "sort_order": 2,
    },
    {
        "id": "family",
        "title": "Gia đình",
        "level": "N5",
        "prompt_type": "sentence",
        "instruction": "Viết ngắn về thành viên trong gia đình và mối quan hệ giữa bạn với họ.",
        "model_hint": "Dùng các cụm từ như 父, 母, 兄弟, 〜です, 〜ます.",
        "sort_order": 3,
    },
    {
        "id": "favorite-place",
        "title": "Nơi yêu thích",
        "level": "N4",
        "prompt_type": "description",
        "instruction": "Viết một đoạn ngắn về nơi bạn thích nhất và lý do bạn thích nó.",
        "model_hint": "Dùng từ miêu tả: きれい, 静か, 便利, やすらぎ. Có thể viết 4 đến 6 câu.",
        "sort_order": 4,
    },
    {
        "id": "memorable-trip",
        "title": "Chuyến đi đáng nhớ",
        "level": "N4",
        "prompt_type": "description",
        "instruction": "Kể lại một chuyến đi mà bạn nhớ nhất, nơi bạn đến và điều khiến bạn ấn tượng.",
        "model_hint": "Sử dụng thì quá khứ và các từ chỉ nơi chốn, thời gian, cảm xúc như きれい, 楽しかった, すごく.",
        "sort_order": 5,
    },
    {
        "id": "hobby",
        "title": "Sở thích",
        "level": "N4",
        "prompt_type": "description",
        "instruction": "Viết về sở thích của bạn, bạn làm điều đó như thế nào và vì sao bạn thích nó.",
        "model_hint": "Dùng các cấu trúc như 〜が好きです, 〜をしています, 〜の時間を楽しみます.",
        "sort_order": 6,
    },
    {
        "id": "technology-life",
        "title": "Công nghệ trong cuộc sống",
        "level": "N3",
        "prompt_type": "description",
        "instruction": "Viết một đoạn về cách công nghệ ảnh hưởng đến cuộc sống hàng ngày của bạn.",
        "model_hint": "Nhấn mạnh sự tiện lợi, rủi ro và cách bạn sử dụng công nghệ trong học tập hoặc làm việc.",
        "sort_order": 7,
    },
    {
        "id": "learning-language",
        "title": "Học ngoại ngữ",
        "level": "N3",
        "prompt_type": "discussion",
        "instruction": "Viết về lý do bạn học ngoại ngữ, phương pháp học và những khó khăn bạn gặp phải.",
        "model_hint": "Bạn có thể nêu lợi ích, động lực và kế hoạch học tập dài hạn bằng câu mạch lạc.",
        "sort_order": 8,
    },
    {
        "id": "future-goal",
        "title": "Mục tiêu tương lai",
        "level": "N3",
        "prompt_type": "discussion",
        "instruction": "Viết về mục tiêu tương lai của bạn và kế hoạch để đạt được nó.",
        "model_hint": "Sử dụng câu điều kiện, kế hoạch, và các động từ như 目指します, 勉強します, なるつもりです.",
        "sort_order": 9,
    },
]


def ensure_seed_prompts():
    try:
        if db.session.query(WritingPrompt).count():
            return
    except (ProgrammingError, OperationalError):
        if db.engine.dialect.name == "sqlite":
            db.create_all()
            if db.session.query(WritingPrompt).count():
                return
        raise ApiError("Dịch vụ viết đang chưa sẵn sàng. Vui lòng chạy migration hoặc thử lại sau.",
                       503, "writing_unavailable")
    for prompt in DEFAULT_PROMPTS:
        db.session.add(WritingPrompt(**prompt))
    db.session.commit()


@bp.get("/prompts")
@require_auth
def list_prompts():
    ensure_seed_prompts()
    prompts = db.session.scalars(
        select(WritingPrompt).order_by(WritingPrompt.sort_order, WritingPrompt.created_at)
    ).all()
    return jsonify({"items": [prompt.public() for prompt in prompts]})


@bp.get("/drafts")
@require_auth
def list_drafts():
    drafts = db.session.scalars(
        select(WritingDraft)
        .where(WritingDraft.user_id == g.user.id)
        .order_by(WritingDraft.updated_at.desc())
    ).all()
    return jsonify({"items": [draft.public() for draft in drafts]})


@bp.post("/drafts")
@require_auth
def create_draft():
    data = body()
    prompt_id = data.get("prompt_id")
    text = data.get("text")
    if not isinstance(text, str):
        raise ApiError("Nội dung viết phải là chuỗi văn bản.", 400, "invalid_text")
    trimmed = text.strip()
    if len(trimmed) < 4:
        raise ApiError("Bản nháp quá ngắn. Hãy viết ít nhất 4 ký tự.", 400, "invalid_text")

    prompt = None
    if isinstance(prompt_id, str) and prompt_id.strip():
        prompt = db.session.get(WritingPrompt, prompt_id.strip())
        if not prompt:
            raise ApiError("Chủ đề viết không tồn tại.", 400, "invalid_prompt")

    if prompt is None:
        custom_title = data.get("custom_title")
        if not isinstance(custom_title, str) or not custom_title.strip():
            custom_title = "Bài viết tự do"

        custom_prompt = WritingPrompt(
            id=f"custom-{g.user.id}-{now()}",
            title=custom_title.strip()[:160],
            level=data.get("custom_level") or "Tùy chọn",
            prompt_type="custom",
            instruction="Người dùng tự viết theo ý của mình.",
            model_hint="Hãy viết tự do, rõ ràng và mạch lạc.",
            sort_order=9999,
            created_at=now(),
            updated_at=now(),
        )
        db.session.add(custom_prompt)
        db.session.flush()
        prompt = custom_prompt

    draft = WritingDraft(
        user_id=g.user.id,
        prompt_id=prompt.id,
        text=trimmed,
        word_count=len(trimmed.split()),
        status="draft",
        created_at=now(),
        updated_at=now(),
    )
    db.session.add(draft)
    db.session.commit()
    return jsonify({"draft": draft.public()}), 201


@bp.put("/drafts/<draft_id>")
@require_auth
def update_draft(draft_id):
    data = body()
    text = data.get("text")
    if not isinstance(text, str):
        raise ApiError("Nội dung viết phải là chuỗi văn bản.", 400, "invalid_text")
    trimmed = text.strip()
    if len(trimmed) < 4:
        raise ApiError("Bản nháp quá ngắn. Hãy viết ít nhất 4 ký tự.", 400, "invalid_text")
    draft = db.session.scalar(
        select(WritingDraft).where(WritingDraft.id == draft_id, WritingDraft.user_id == g.user.id)
    )
    if not draft:
        raise ApiError("Bản nháp không tồn tại hoặc không thuộc về bạn.", 404, "not_found")
    draft.text = trimmed
    draft.word_count = len(trimmed.split())
    draft.updated_at = now()
    db.session.commit()
    return jsonify({"draft": draft.public()})


@bp.delete("/drafts/<draft_id>")
@require_auth
def delete_draft(draft_id):
    draft = db.session.scalar(
        select(WritingDraft).where(WritingDraft.id == draft_id, WritingDraft.user_id == g.user.id)
    )
    if not draft:
        raise ApiError("Bản nháp không tồn tại hoặc không thuộc về bạn.", 404, "not_found")
    db.session.delete(draft)
    db.session.commit()
    return jsonify({"deleted": True, "draft_id": draft_id})


@bp.get("/submissions")
@require_auth
def list_submissions():
    items = db.session.scalars(
        select(WritingSubmission)
        .where(WritingSubmission.user_id == g.user.id)
        .order_by(WritingSubmission.submitted_at.desc())
    ).all()
    return jsonify({"items": [item.public() for item in items]})


@bp.post("/submissions")
@require_auth
def create_submission():
    data = body()
    text = data.get("text")
    if not isinstance(text, str):
        raise ApiError("Nội dung viết phải là chuỗi văn bản.", 400, "invalid_text")
    trimmed = text.strip()
    if len(trimmed) < 4:
        raise ApiError("Bài nộp quá ngắn. Hãy viết ít nhất 4 ký tự.", 400, "invalid_text")

    prompt_id = data.get("prompt_id")
    prompt = None
    if isinstance(prompt_id, str) and prompt_id.strip():
        prompt = db.session.get(WritingPrompt, prompt_id.strip())
        if not prompt:
            raise ApiError("Chủ đề viết không tồn tại.", 400, "invalid_prompt")

    prompt_title = data.get("prompt_title")
    if not isinstance(prompt_title, str) or not prompt_title.strip():
        prompt_title = prompt.title if prompt else "Bài viết tự do"

    prompt_title = prompt.title if prompt else prompt_title.strip()[:160]
    assessment = evaluate_writing(
        trimmed,
        prompt_title,
        prompt.level if prompt else "",
        prompt.instruction if prompt else "",
    )

    submission = WritingSubmission(
        user_id=g.user.id,
        prompt_id=prompt.id if prompt else None,
        prompt_title=prompt_title,
        text=trimmed,
        corrected_text=assessment["corrected_text"],
        score=assessment["score"],
        feedback=assessment["feedback"],
        submitted_at=now(),
        created_at=now(),
        updated_at=now(),
    )
    db.session.add(submission)
    db.session.commit()
    return jsonify({"submission": submission.public()}), 201


@bp.post("/submissions/<submission_id>/evaluate")
@require_auth
def reevaluate_submission(submission_id):
    submission = db.session.scalar(
        select(WritingSubmission).where(
            WritingSubmission.id == submission_id,
            WritingSubmission.user_id == g.user.id,
        )
    )
    if not submission:
        raise ApiError("Bài nộp không tồn tại hoặc không thuộc về bạn.", 404, "not_found")

    prompt = db.session.get(WritingPrompt, submission.prompt_id) if submission.prompt_id else None
    assessment = evaluate_writing(
        submission.text,
        submission.prompt_title,
        prompt.level if prompt else "",
        prompt.instruction if prompt else "",
    )
    submission.corrected_text = assessment["corrected_text"]
    submission.score = assessment["score"]
    submission.feedback = assessment["feedback"]
    submission.updated_at = now()
    db.session.commit()
    return jsonify({"submission": submission.public()})
