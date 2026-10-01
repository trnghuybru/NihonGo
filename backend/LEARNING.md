# Thiết lập học tập

Hồ sơ học tập thuộc tài khoản đã đăng nhập, dùng PostgreSQL. Người dùng xác nhận trình độ tự đánh giá, một mục tiêu chính và số phút học mỗi ngày. Không tạo hồ sơ mặc định khi đăng ký hoặc khi chỉ đọc dữ liệu.

## Cấu trúc

- `learning/options.py`: ID ổn định, nhãn và danh sách lựa chọn cho ứng dụng.
- `learning/service.py`: kiểm tra dữ liệu, khóa hàng người dùng và lưu trong transaction.
- `learning/models.py`: một hàng mỗi người dùng, foreign key cascade, CHECK constraints.
- `learning/routes.py`: GET/PUT, lấy chủ sở hữu từ phiên đăng nhập; không nhận `user_id` từ client.
- `extensions.py`: SQLAlchemy dùng chung; `api_errors.py`: lỗi API có cấu trúc.
- Frontend: `learningService` gọi HTTP dùng lại phiên Keychain và cơ chế refresh; `useLearningPreferences` tải/lưu; `AuthenticatedScreen` điều phối; `LearningSetupScreen` quản lý bản nháp cục bộ.

Trình độ: `beginner`, `N5`, `N4`, `N3`, `N2`, `N1`. Mô tả ngắn tham khảo [JLPT level summary](https://www.jlpt.jp/e/about/levelsummary.html); đây là tự đánh giá, không phải kết quả thi. Mục tiêu: `communication`, `jlpt`, `travel`, `work`, `culture`. Thời lượng: 5, 10, 15, 30 hoặc 60 phút/ngày.

## API

Cả hai endpoint cần `Authorization: Bearer <access_token>`, áp dụng giới hạn request/body và `Cache-Control: no-store` như API tài khoản.

`GET /api/learning/preferences` → `200 {"profile": null | LearningProfile, "options": {"levels": [...], "goals": [...], "daily_minutes": [...]}}`.

`PUT /api/learning/preferences`, JSON đầy đủ:

```json
{
  "level": "N5",
  "goal": "communication",
  "daily_minutes": 15,
  "level_confirmed": true,
  "version": 0
}
```

`version: 0` cho lần đầu, các lần tiếp theo gửi version đã đọc. Thành công `200 {"profile": ...}`; hồ sơ gồm ba lựa chọn, `level_source: "manual"`, `level_confirmed_at`, `created_at`, `updated_at` (Unix seconds) và version tăng 1. Mỗi lần lưu xác nhận lại toàn bộ lựa chọn.

Lỗi `400`: thiếu/thừa field, sai kiểu hoặc giá trị, chưa xác nhận; `401`: phiên không hợp lệ; `409 preferences_conflict`: dữ liệu đã thay đổi, cần GET lại trước khi sửa; `429`: giới hạn request; `503`: database không sẵn sàng. Không coi lỗi GET là hồ sơ chưa tồn tại. Nếu máy chủ đã lưu nhưng client mất phản hồi, lần thử lại có thể nhận 409; tải lại để xem kết quả đã lưu.

Khóa hàng `users` bảo vệ cả lần tạo đầu tiên; kiểm tra version sau khi khóa ngăn hai thiết bị ghi đè lẫn nhau. Validation chạy trước khi thay đổi dữ liệu. Client không được gửi chủ sở hữu hoặc timestamp.

## Migration và kiểm tra

Trong thư mục `backend`, với `.env` local đã cấu hình:

```sh
venv/bin/flask --app app db upgrade
venv/bin/flask --app app db check
TEST_DATABASE_URL=postgresql+psycopg://nihongo:nihongo_local@localhost:5432/nihongo venv/bin/python -m unittest discover -s tests -v
```

Migration `ab7248e36f10` chỉ thêm bảng, không thay đổi tài khoản hiện tại. Các tài khoản cũ chưa có hồ sơ sẽ thấy bước thiết lập ở lần đăng nhập tiếp theo. Bộ test tạo schema ngẫu nhiên riêng, không xóa dữ liệu ứng dụng.

Trong `frontend`: `npx tsc --noEmit`, `npm test -- --runInBand --watchman=false`. Mở ứng dụng, đăng nhập, chọn trình độ → mục tiêu/thời lượng → quay lại kiểm tra lựa chọn → xác nhận. Đóng/mở lại ứng dụng để kiểm tra lưu; vào thẻ **Thiết lập học tập** để sửa hoặc hủy. Tắt backend để kiểm tra lỗi và thử lại.

Phạm vi hiện tại là lưu và chỉnh sửa thiết lập. Thời lượng là mục tiêu do người dùng đặt; chưa tự đo thời gian học, gửi nhắc nhở, tạo lộ trình hay thay đổi chức năng hội thoại.
