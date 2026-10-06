"""Optional starter content; deterministic IDs make the command repeatable."""
import uuid

import click
from flask.cli import with_appcontext
from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError

from extensions import db
from .models import Scenario, ScenarioCategory, ScenarioRole

CATEGORIES = (
    ("daily", "Đời sống", "Những cuộc gặp gỡ thường ngày."),
    ("food", "Ăn uống", "Gọi món và trao đổi tại quán."),
    ("travel", "Du lịch", "Hỏi đường và lưu trú ở Nhật."),
    ("work", "Công việc", "Giao tiếp trong môi trường làm việc."),
)

# slug, category, level, minutes, title, context, partner role, goals, opening
SCENARIOS = (
    ("introduce-yourself", "daily", "N5", 5, "Làm quen bạn mới",
     "Bạn gặp một người bạn mới tại lớp học tiếng Nhật.", "Bạn cùng lớp",
     "Chào hỏi tự nhiên; nói tên và quê quán; hỏi tên người đối diện.",
     "はじめまして！お名前は何ですか？"),
    ("convenience-store", "daily", "N5", 6, "Mua đồ ở cửa hàng tiện lợi",
     "Bạn chọn một món đồ tại cửa hàng tiện lợi ở Nhật.", "Nhân viên thu ngân",
     "Hỏi giá món đồ; xác nhận số lượng; thanh toán lịch sự.",
     "いらっしゃいませ。こちらはいかがですか？"),
    ("order-food", "food", "N5", 7, "Gọi món tại quán ăn",
     "Bạn vừa ngồi xuống một quán ăn nhỏ tại Tokyo.", "Nhân viên phục vụ",
     "Xin thực đơn; gọi món mình thích; hỏi món được gợi ý.",
     "いらっしゃいませ。ご注文はお決まりですか？"),
    ("order-coffee", "food", "N5", 5, "Mua cà phê ở quán",
     "Bạn ghé một quán cà phê và gọi đồ tại quầy.", "Nhân viên quán",
     "Gọi một đồ uống; chọn kích cỡ; nói muốn mang đi.",
     "いらっしゃいませ。ご注文をどうぞ。"),
    ("ask-directions", "travel", "N4", 8, "Hỏi đường đến nhà ga",
     "Bạn cần tìm nhà ga gần nhất trong một khu phố lạ.", "Người đi đường",
     "Mở lời lịch sự; hỏi đường đến ga; xác nhận lại lối đi.",
     "こんにちは。何かお困りですか？"),
    ("hotel-check-in", "travel", "N4", 8, "Nhận phòng khách sạn",
     "Bạn tới quầy lễ tân để nhận phòng đã đặt trước.", "Lễ tân",
     "Báo tên đặt phòng; xác nhận số đêm; hỏi giờ trả phòng.",
     "いらっしゃいませ。ご予約のお名前をお願いします。"),
    ("schedule-meeting", "work", "N4", 7, "Sắp xếp lịch họp",
     "Bạn cần hẹn đồng nghiệp trao đổi công việc tuần này.", "Đồng nghiệp",
     "Đề xuất thời gian; hỏi lịch rảnh; xác nhận giờ họp.",
     "今週、いつ会議ができますか？"),
    ("job-interview", "work", "N3", 10, "Phỏng vấn việc làm",
     "Bạn tham gia một buổi phỏng vấn làm thêm bằng tiếng Nhật.", "Người phỏng vấn",
     "Giới thiệu bản thân; nói về kinh nghiệm; trình bày thời gian có thể làm.",
     "本日はよろしくお願いします。まず自己紹介をお願いします。"),
)


def seed_id(kind, slug):
    return str(uuid.uuid5(uuid.NAMESPACE_URL, f"nihongo/speaking/{kind}/{slug}"))


@click.command("speaking-seed")
@with_appcontext
def seed_scenarios():
    """Add eight starter scenarios without overwriting existing content."""
    created = 0
    try:
        category_ids = {}
        for order, (slug, name, description) in enumerate(CATEGORIES):
            category = db.session.scalar(select(ScenarioCategory).where(ScenarioCategory.name == name))
            if category is None:
                category = ScenarioCategory(id=seed_id("category", slug), name=name,
                                            description=description, sort_order=order)
                db.session.add(category)
                db.session.flush()
            category_ids[slug] = category.id
        for slug, category, level, minutes, title, context, role_name, goals, opening in SCENARIOS:
            scenario_id = seed_id("scenario", slug)
            if db.session.get(Scenario, scenario_id) is not None:
                continue
            db.session.add(Scenario(
                id=scenario_id, category_id=category_ids[category], title=title,
                description=goals, context=context, learning_objectives=goals,
                language_code="ja-JP", difficulty_level=level,
                estimated_duration_minutes=minutes, status="published",
            ))
            db.session.flush()
            db.session.add(ScenarioRole(
                id=seed_id("role", slug), scenario_id=scenario_id, name=role_name,
                description=f"Đóng vai {role_name.lower()} trong tình huống này.",
                ai_instructions=(f"Bạn đóng vai {role_name} trong bối cảnh: {context} "
                                 f"Hội thoại bằng tiếng Nhật ở trình độ {level}. "
                                 "Giữ đúng vai, phản hồi ngắn và giúp người học thực hành các mục tiêu: " + goals),
                opening_message=opening,
            ))
            created += 1
        db.session.commit()
    except SQLAlchemyError as error:
        db.session.rollback()
        raise click.ClickException("Không thể tạo dữ liệu mẫu. Kiểm tra kết nối và chạy db upgrade trước.") from error
    click.echo(f"Đã tạo {created} tình huống mẫu.")
