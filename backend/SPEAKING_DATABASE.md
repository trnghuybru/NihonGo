# Migration PostgreSQL cho chức năng hội thoại

Revision `c9f41b2a6e80` nối tiếp `ab7248e36f10`, tạo 14 bảng mới và sử dụng
bảng `users` của hệ thống xác thực hiện tại. Không cần cài thêm dependency.

## Chạy migration

Từ thư mục gốc dự án:

```sh
cd backend
venv/bin/flask --app app db current
venv/bin/flask --app app db upgrade
venv/bin/flask --app app db check
```

`DATABASE_URL` trong `backend/.env` phải trỏ đến PostgreSQL. Cấu hình Docker
hiện tại dùng PostgreSQL 17, hỗ trợ sẵn `gen_random_uuid()`.

Để xuất SQL và xem trước thay đổi mà không kết nối database:

```sh
venv/bin/flask --app app db upgrade ab7248e36f10:c9f41b2a6e80 --sql
```

## Các bảng mới

- Tình huống: `scenario_categories`, `scenarios`, `scenario_roles`.
- Luyện tập: `conversation_sessions`, `conversation_messages`,
  `conversation_audio_assets`.
- Đánh giá: `session_evaluations`, `evaluation_criteria`, `evaluation_scores`.
- Phòng: `rooms`, `room_members`, `room_invitations`.
- Ghép cặp: `matching_preferences`, `matchmaking_requests`.

Các model được khai báo trong `speaking/models.py` và đăng ký khi import `app`,
giúp Alembic autogenerate nhận diện đầy đủ schema.

## Quy ước dữ liệu

- ID của các bảng mới dùng UUID; khóa tham chiếu `users.id` dùng VARCHAR(36)
  để tương thích schema xác thực hiện có.
- Thời gian ở bảng mới dùng TIMESTAMPTZ; thời lượng dùng mili giây.
  Không đổi kiểu thời gian của các bảng đã tồn tại.
- `scenario_snapshot` dùng JSONB trên PostgreSQL.
- `sequence_number` bắt đầu từ 1 và duy nhất trong mỗi buổi.
- Điểm có hai chữ số thập phân, trong khoảng 0–100; điểm tổng có thể NULL
  khi đánh giá chưa hoàn tất. Trọng số phải lớn hơn 0.
- `matched_room_id` và `matched_at` chỉ có giá trị khi yêu cầu là `matched`.
- Mỗi người có tối đa một yêu cầu `searching`. Mỗi phòng có tối đa một host
  đang `joined`; ràng buộc này không tự tạo host cho phòng.
- `desired_min_level` và `desired_max_level` có thể NULL nếu không giới hạn.
  Thứ tự trình độ, ví dụ beginner < N5 < N4 < N3 < N2 < N1, cần được xử lý
  trong service; không so sánh các chuỗi này theo thứ tự chữ cái.
- `created_at` có giá trị mặc định tại database. `updated_at` được cập nhật
  bởi SQLAlchemy khi UPDATE; SQL thô phải tự cập nhật trường này.

## Trách nhiệm của service

Migration tạo cấu trúc và ràng buộc dữ liệu. API cho UC-S1–S4 và lệnh
`speaking-seed` đã được triển khai; xem `SPEAKING.md`. Chưa seed tiêu chí
đánh giá. Service cho các bước tiếp theo cần:

- Kiểm tra quyền truy cập, đồng ý lưu audio, hạn lời mời, trạng thái phòng
  và tình huống trước khi thực hiện thao tác.
- Đảm bảo tình huống được publish có ít nhất một vai AI.
- Chỉ cho làm lại buổi thuộc cùng người dùng. API bắt đầu đã chụp nội dung
  tình huống/vai AI khi tạo buổi.
- Khóa dòng phòng trong transaction khi thêm thành viên, kiểm tra sức chứa;
  xử lý chuyển host hoặc đóng phòng khi host rời.
- Ghép hai yêu cầu và tạo phòng/thành viên trong cùng một transaction có
  khóa dòng; chuyển yêu cầu hết hạn khỏi `searching` trước khi tìm lại.
- Khi pause/resume/end, cập nhật trạng thái và thời lượng hoạt động cùng nhau.
- Lưu file audio ngoài database. Khi xóa buổi, thu thập storage key và đưa
  vào hàng đợi xóa file trước khi xóa metadata trong transaction.

Xóa buổi sẽ cascade xuống transcript, metadata audio, đánh giá và điểm.
Buổi làm lại được giữ, với `retry_of_session_id` chuyển thành NULL khi buổi
gốc bị xóa. Tình huống/vai AI/tiêu chí đã được tham chiếu không thể xóa;
nên archive hoặc ngừng kích hoạt. Xóa người dùng đang được tham chiếu là
người tạo phòng/người gửi lời mời cần được xử lý trước hoặc vô hiệu hóa
tài khoản qua trường `users.active`.

## Kiểm thử PostgreSQL

```sh
TEST_DATABASE_URL=postgresql+psycopg://nihongo:nihongo_local@localhost:5432/nihongo \
  venv/bin/python -m unittest discover -s tests -p 'test_speaking_migration.py' -v
```

Kiểm thử tạo schema `test_speaking_<uuid>` riêng, chạy toàn bộ migration,
kiểm tra khóa ngoại ghép, unique index có điều kiện, cascade, giới hạn điểm,
đối chiếu schema với model và downgrade/upgrade. Schema tạm được xóa sau
kiểm thử; không chạy migration vào schema ứng dụng. User database cần quyền
tạo schema. Không có `TEST_DATABASE_URL` thì các kiểm thử này được skip.

## Rollback

Khi database đang ở revision `c9f41b2a6e80`:

```sh
venv/bin/flask --app app db downgrade ab7248e36f10
```

Rollback xóa 14 bảng mới cùng dữ liệu trong đó, giữ lại bảng xác thực và
`learning_preferences`. Chỉ dùng khi đã sao lưu dữ liệu cần giữ.
