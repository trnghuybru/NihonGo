"""Public choices in display order. IDs are stable API/storage values."""

LEVELS = (
    {"id": "beginner", "label": "Mới bắt đầu", "description": "Mình chưa học hoặc mới làm quen với tiếng Nhật."},
    {"id": "N5", "label": "N5 · Sơ cấp", "description": "Hiểu một số câu đơn giản, đọc hiragana, katakana và kanji cơ bản."},
    {"id": "N4", "label": "N4 · Cơ bản", "description": "Đọc chủ đề quen thuộc, hiểu hội thoại hằng ngày khi nói chậm."},
    {"id": "N3", "label": "N3 · Trung cấp", "description": "Hiểu phần lớn nội dung quen thuộc trong đời sống hằng ngày."},
    {"id": "N2", "label": "N2 · Trung cao cấp", "description": "Hiểu nhiều tình huống, đọc bài viết và nghe ở tốc độ gần tự nhiên."},
    {"id": "N1", "label": "N1 · Cao cấp", "description": "Hiểu nội dung phức tạp, trừu tượng trong nhiều ngữ cảnh."},
)
GOALS = (
    {"id": "communication", "label": "Giao tiếp hằng ngày", "description": "Tự tin sử dụng tiếng Nhật trong cuộc sống."},
    {"id": "jlpt", "label": "Ôn thi JLPT", "description": "Củng cố kiến thức cho kỳ thi năng lực tiếng Nhật."},
    {"id": "travel", "label": "Du lịch Nhật Bản", "description": "Chủ động hỏi đường, mua sắm và khám phá."},
    {"id": "work", "label": "Công việc", "description": "Sử dụng tiếng Nhật trong môi trường làm việc."},
    {"id": "culture", "label": "Văn hóa & sở thích", "description": "Hiểu thêm về phim, âm nhạc và văn hóa Nhật."},
)
DAILY_MINUTES = (5, 10, 15, 30, 60)
LEVEL_IDS = frozenset(option["id"] for option in LEVELS)
GOAL_IDS = frozenset(option["id"] for option in GOALS)


def public_options():
    return {"levels": LEVELS, "goals": GOALS, "daily_minutes": DAILY_MINUTES}
