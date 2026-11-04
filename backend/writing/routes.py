from flask import Blueprint, g, jsonify, request
from sqlalchemy import select, func, or_
from sqlalchemy.exc import OperationalError, ProgrammingError

from api_errors import ApiError
from auth.security import body, require_auth
from extensions import db
from .evaluation import evaluate_writing
from .rubric import normalize_level
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
        "title": "じこしょうかい",
        "level": "N5",
        "prompt_type": "sentence",
        "instruction": "じぶんの なまえ、しごと、すきなことを ３〜５つの 文で かいてください。",
        "model_hint": "① なまえと しごとを かきましょう。\n② すきなことを かきましょう。\n③ にほんごを いつ べんきょうするか かきましょう。\nつかう ことば：わたしは〜です。／〜が すきです。",
        "sort_order": 1,
    },
    {
        "id": "daily-routine",
        "title": "わたしの一日",
        "level": "N5",
        "prompt_type": "routine",
        "instruction": "あさ おきてから よる ねるまで、なにを しますか。３〜５つの 文で かいてください。",
        "model_hint": "① あさ、なんじに おきますか。\n② ひる、なにを しますか。\n③ よる、なんじに ねますか。\nつかう ことば：〜じに おきます。／ごはんを たべます。／べんきょうします。",
        "sort_order": 2,
    },
    {
        "id": "family",
        "title": "わたしのかぞく",
        "level": "N5",
        "prompt_type": "sentence",
        "instruction": "あなたの かぞくについて、３〜５つの 文で かいてください。",
        "model_hint": "① かぞくは なんにんですか。\n② だれが いますか。\n③ かぞくと なにを しますか。\nつかう ことば：ちち／はは／あに／あね／〜にん／いっしょに〜ます。",
        "sort_order": 3,
    },
    {
        "id": "favorite-place",
        "title": "好きな場所",
        "level": "N4",
        "prompt_type": "description",
        "instruction": "あなたの好きな場所について、４〜６文で書いてください。どんな場所か、どうして好きなのかを説明してください。",
        "model_hint": "① どこにある、どんな場所ですか。\n② そこで何ができますか。行ったとき、何をしましたか。\n③ 好きな理由を書きましょう。\n使ってみましょう：〜たり〜たりします。／〜ことができます。／〜からです。",
        "sort_order": 4,
    },
    {
        "id": "memorable-trip",
        "title": "思い出の旅行",
        "level": "N4",
        "prompt_type": "description",
        "instruction": "思い出に残っている旅行について、４〜６文で書いてください。行った場所、したこと、感じたことを紹介してください。",
        "model_hint": "① いつ、だれと、どこへ行きましたか。\n② 何を見たり、食べたりしましたか。\n③ 何がいちばん楽しかったですか。\n使ってみましょう：〜たことがあります。／〜たり〜たりしました。／〜と思いました。",
        "sort_order": 5,
    },
    {
        "id": "hobby",
        "title": "私のしゅみ",
        "level": "N4",
        "prompt_type": "description",
        "instruction": "あなたのしゅみについて、４〜６文で書いてください。いつ、どのように楽しんでいるか、好きな理由も書いてください。",
        "model_hint": "① しゅみと、始めた時期を書きましょう。\n② どのくらいしますか。だれとしますか。\n③ 楽しいところを説明しましょう。\n使ってみましょう：〜ことが好きです。／〜ときに〜ます。／〜ので、〜。",
        "sort_order": 6,
    },
    {
        "id": "technology-life",
        "title": "技術と私たちの生活",
        "level": "N3",
        "prompt_type": "description",
        "instruction": "身近な技術が生活にどのような変化をもたらしたか、８〜１０文で書いてください。便利な点と注意する点を挙げ、自分の考えを述べてください。",
        "model_hint": "① スマートフォンなど、身近な技術を一つ取り上げましょう。\n② 便利になった点を、具体的な経験とともに説明しましょう。\n③ 使いすぎなどの問題を挙げ、上手な使い方を提案しましょう。\n使ってみましょう：〜ようになりました。／〜おかげで、〜。／〜一方で、〜。",
        "sort_order": 7,
    },
    {
        "id": "learning-language",
        "title": "外国語を学ぶ理由",
        "level": "N3",
        "prompt_type": "discussion",
        "instruction": "外国語を学ぶ理由や学習方法について、８〜１０文で書いてください。これまでの経験、困っていること、これからの工夫を含めてください。",
        "model_hint": "① 学び始めたきっかけと目標を書きましょう。\n② 効果があった学習方法を、例を挙げて説明しましょう。\n③ 今の課題と、それを解決するための計画をまとめましょう。\n使ってみましょう：〜ために、〜。／〜ようにしています。／〜ことによって、〜。",
        "sort_order": 8,
    },
    {
        "id": "future-goal",
        "title": "将来の目標",
        "level": "N3",
        "prompt_type": "discussion",
        "instruction": "将来の目標と、その目標を実現するための計画について、８〜１０文で書いてください。目標を持った理由や、予想される課題も説明してください。",
        "model_hint": "① 目標と、それを目指す理由を述べましょう。\n② 今取り組んでいることを、具体的に説明しましょう。\n③ 今後の課題と、次に行うことをまとめましょう。\n使ってみましょう：〜ようになるために、〜。／〜ば、〜。／〜ことにしました。",
        "sort_order": 9,
    }
]

PROMPT_CATEGORIES = [
    {"id": "daily", "label": "Đời sống"},
    {"id": "study", "label": "Học tập"},
    {"id": "work", "label": "Công việc"},
    {"id": "society", "label": "Xã hội"},
]
for seed in DEFAULT_PROMPTS:
    seed["category"] = {"technology-life": "society", "learning-language": "study", "future-goal": "work"}.get(seed["id"], "daily")

def ensure_seed_prompts():
    # Stable IDs update the built-in content without replacing drafts or custom topics.
    seed_ids = [prompt["id"] for prompt in DEFAULT_PROMPTS]
    statement = select(WritingPrompt).where(WritingPrompt.id.in_(seed_ids))
    try:
        existing = {prompt.id: prompt for prompt in db.session.scalars(statement)}
    except (ProgrammingError, OperationalError):
        db.session.rollback()
        if db.engine.dialect.name != "sqlite":
            raise ApiError("Dịch vụ viết đang chưa sẵn sàng. Vui lòng chạy migration hoặc thử lại sau.",
                           503, "writing_unavailable")
        db.create_all()
        existing = {prompt.id: prompt for prompt in db.session.scalars(statement)}

    changed = False
    for seed in DEFAULT_PROMPTS:
        prompt = existing.get(seed["id"])
        if prompt is None:
            db.session.add(WritingPrompt(**seed))
            changed = True
            continue
        for field, value in seed.items():
            if field != "id" and getattr(prompt, field) != value:
                setattr(prompt, field, value)
                changed = True
    if changed:
        db.session.commit()


@bp.get("/prompts")
@require_auth
def list_prompts():
    ensure_seed_prompts()
    statement = select(WritingPrompt).order_by(WritingPrompt.sort_order, WritingPrompt.id)
    # Preserve the existing unpaginated contract for native clients.
    if "page" not in request.args:
        prompts = db.session.scalars(statement).all()
        return jsonify({"items": [prompt.public() for prompt in prompts]})
    try:
        page = max(1, int(request.args.get("page", "1")))
        per_page = min(12, max(1, int(request.args.get("per_page", "12"))))
    except ValueError:
        raise ApiError("Trang không hợp lệ.", 422, "invalid_page")
    statement = statement.where(WritingPrompt.prompt_type != "custom")
    level = request.args.get("level", "").strip()
    category = request.args.get("category", "").strip()
    query = request.args.get("q", "").strip()[:160]
    if level:
        if level not in {"N5", "N4", "N3", "N2", "N1"}:
            raise ApiError("Trình độ không hợp lệ.", 422, "invalid_level")
        statement = statement.where(WritingPrompt.level == level)
    if category:
        if category not in {item["id"] for item in PROMPT_CATEGORIES}:
            raise ApiError("Chủ đề không hợp lệ.", 422, "invalid_category")
        statement = statement.where(WritingPrompt.category == category)
    if query:
        statement = statement.where(or_(WritingPrompt.title.icontains(query, autoescape=True), WritingPrompt.instruction.icontains(query, autoescape=True)))
    total = db.session.scalar(select(func.count()).select_from(statement.order_by(None).subquery()))
    prompts = db.session.scalars(statement.offset((page - 1) * per_page).limit(per_page)).all()
    return jsonify({"items": [prompt.public() for prompt in prompts], "categories": PROMPT_CATEGORIES,
                    "pagination": {"page": page, "per_page": per_page, "total": total, "has_more": page * per_page < total}})


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
        prompt.level if prompt and prompt.level in ('N5', 'N4', 'N3', 'N2', 'N1') else normalize_level(data.get('level')),
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
        assessment=assessment.get("assessment"),
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
        prompt.level if prompt and prompt.level in ('N5', 'N4', 'N3', 'N2', 'N1') else (submission.assessment or {}).get('level', 'N5'),
        prompt.instruction if prompt else "",
    )
    submission.corrected_text = assessment["corrected_text"]
    submission.score = assessment["score"]
    submission.feedback = assessment["feedback"]
    submission.assessment = assessment.get("assessment")
    submission.updated_at = now()
    db.session.commit()
    return jsonify({"submission": submission.public()})
