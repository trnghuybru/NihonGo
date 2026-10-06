# API tình huống hội thoại

Triển khai UC-S1–S6: xem danh sách, lọc, xem chi tiết, bắt đầu tình huống,
hội thoại bằng văn bản và giọng nói.
Các endpoint cần `Authorization: Bearer <access_token>` và dùng cơ chế xác thực,
giới hạn request, giới hạn body 16 KiB và `Cache-Control: no-store` hiện có.

## Chuẩn bị

Trong thư mục `backend`, cấu hình PostgreSQL trong `.env`, rồi chạy:

```sh
venv/bin/flask --app app db upgrade
venv/bin/flask --app app speaking-seed
venv/bin/flask --app app run --port 5001
```

Lệnh seed tạo 4 nhóm và 8 tình huống tiếng Nhật (N5/N4/N3), mỗi tình huống
có một vai AI và lời mở đầu. Có thể chạy lại; không ghi đè tình huống đã có
cùng ID. ID trong database là UUID, khác các slug mock hiện tại của frontend.
Frontend đã lấy ID từ API để gọi chi tiết và bắt đầu.

Để nhận phản hồi AI, cấu hình `OPENROUTER_API_KEY` trong `.env` backend.
`OPENROUTER_MODEL` mặc định là `nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free`;
có thể chọn model khác qua biến này. Khóa API và chỉ dẫn vai chỉ nằm trên server.
Không trả phản hồi mẫu khi dịch vụ AI thiếu cấu hình hoặc gặp lỗi.

## Danh sách và lọc

`GET /api/speaking/scenarios`

| Query | Ý nghĩa |
|---|---|
| `category_id` | UUID nhóm tình huống |
| `level` | `beginner`, `N5`, `N4`, `N3`, `N2`, `N1` |
| `language_code` | Mã ngôn ngữ khớp chính xác, ví dụ `ja-JP` |
| `q` | Tìm chuỗi trong tiêu đề/mô tả, tối đa 200 ký tự |
| `page` | Trang, mặc định 1, tối đa 1.000.000 |
| `page_size` | Số phần tử, mặc định 20, tối đa 100 |

Các bộ lọc kết hợp bằng AND. Kết quả chỉ gồm tình huống `published` có ít
nhất một vai AI. Sắp xếp theo thời điểm tạo giảm dần, sau đó theo ID.
Không có kết quả hoặc trang vượt tổng số trang trả `200` với `items: []`.
Tham số lạ, trùng tham số hoặc giá trị không hợp lệ trả `400`.
`%` và `_` trong `q` được tìm như ký tự thường, không phải wildcard.

Ví dụ: `/api/speaking/scenarios?level=N5&language_code=ja-JP&page_size=10`.

```json
{
  "items": [
    {
      "id": "<scenario_uuid>",
      "title": "Làm quen bạn mới",
      "description": "Chào hỏi tự nhiên; nói tên và quê quán; hỏi tên người đối diện.",
      "language_code": "ja-JP",
      "difficulty_level": "N5",
      "estimated_duration_minutes": 5,
      "category": {"id": "<category_uuid>", "name": "Đời sống", "description": "Những cuộc gặp gỡ thường ngày."}
    }
  ],
  "pagination": {"page": 1, "page_size": 10, "total": 4, "total_pages": 1}
}
```

`GET /api/speaking/scenario-categories` trả `200 {"items": [...]}` với các nhóm
có tình huống khả dụng, sắp xếp theo `sort_order`, tên và ID. Dùng endpoint
này lấy UUID và nhãn cho bộ lọc.

## Chi tiết

`GET /api/speaking/scenarios/<scenario_uuid>`

Trả `200 {"scenario": ...}`. Ngoài các trường trong danh sách, chi tiết có:

```json
{
  "context": "Bạn gặp một người bạn mới tại lớp học tiếng Nhật.",
  "learning_objectives": "Chào hỏi tự nhiên; nói tên và quê quán; hỏi tên người đối diện.",
  "roles": [
    {
      "id": "<role_uuid>",
      "name": "Bạn cùng lớp",
      "description": "Đóng vai bạn cùng lớp trong tình huống này.",
      "opening_message": "はじめまして！お名前は何ですか？"
    }
  ]
}
```

`learning_objectives` là văn bản theo schema hiện tại; `opening_message`
có thể NULL. Không trả `ai_instructions` cho client. ID không tồn tại,
sai định dạng, tình huống draft/archived hoặc không có vai AI trả `404`.

## Bắt đầu

`POST /api/speaking/scenarios/<scenario_uuid>/sessions`

Body phải là JSON object, có thể gửi `{}` để dùng mặc định:

```json
{
  "role_id": "<role_uuid>",
  "input_mode": "voice",
  "audio_storage_enabled": false
}
```

- `role_id`: có thể bỏ qua nếu tình huống chỉ có một vai; nếu có nhiều vai
  phải chọn một vai thuộc tình huống đó.
- `input_mode`: `text` hoặc `voice`, mặc định `text`.
- `audio_storage_enabled`: boolean, mặc định `false`. Chỉ gửi `true` sau
  khi người dùng chọn đồng ý lưu audio.
- Không nhận chủ sở hữu, snapshot, trạng thái hoặc timestamp từ client.

Thành công trả `201`:

```json
{
  "session": {
    "id": "<session_uuid>",
    "scenario_id": "<scenario_uuid>",
    "scenario_role_id": "<role_uuid>",
    "status": "active",
    "current_input_mode": "voice",
    "audio_storage_enabled": false,
    "started_at": "2026-10-01T13:00:00+00:00",
    "accumulated_active_ms": 0
  },
  "scenario": {
    "id": "<scenario_uuid>",
    "title": "Làm quen bạn mới",
    "description": "Chào hỏi và giới thiệu bản thân.",
    "language_code": "ja-JP",
    "difficulty_level": "N5",
    "estimated_duration_minutes": 5,
    "category": {"id": "<category_uuid>", "name": "Đời sống", "description": "Những cuộc gặp gỡ thường ngày."},
    "context": "Bạn gặp một người bạn mới tại lớp học tiếng Nhật.",
    "learning_objectives": "Chào hỏi và giới thiệu bản thân.",
    "role": {"id": "<role_uuid>", "name": "Bạn cùng lớp", "description": "Bạn mới", "opening_message": "こんにちは！"}
  },
  "opening_message": {
    "id": "<message_uuid>",
    "sequence_number": 1,
    "speaker": "assistant",
    "input_mode": "generated",
    "content": "こんにちは！",
    "status": "completed",
    "occurred_at": "2026-10-01T13:00:00+00:00"
  }
}
```

Nếu vai không có lời mở đầu, `opening_message` là NULL và chưa tạo transcript.
Backend khóa dòng tình huống/vai, chụp nội dung gồm chỉ dẫn AI riêng tư vào
`scenario_snapshot`, tạo buổi và lời mở đầu trong cùng transaction. Thay đổi
tình huống sau này không làm đổi snapshot buổi đã bắt đầu. `last_resumed_at`
được khởi tạo cùng `started_at` để tính thời lượng ở các bước tiếp theo.

Mỗi POST thành công tạo một buổi mới. Endpoint chưa có idempotency key;
client cần chặn nhấn lặp và tránh tự động retry POST sau lỗi mất kết nối
không rõ máy chủ đã lưu hay chưa.

## Lỗi

Lỗi nghiệp vụ có dạng `{"error": "Thông báo tiếng Việt", "code": "..."}`.

| HTTP | Ý nghĩa |
|---|---|
| 400 | Query/body sai, `role_required`, `invalid_role` |
| 401 | Chưa đăng nhập, token hết hạn/bị thu hồi hoặc tài khoản bị vô hiệu hóa |
| 404 | `scenario_not_found`, `session_not_found` (kể cả buổi của người khác) |
| 409 | `session_inactive`, `request_conflict`, `turn_pending`, `turn_unresolved`, `turn_conflict` |
| 413 | Body vượt 16 KiB, do Flask xử lý |
| 429 | `rate_limited` hoặc `ai_rate_limited`, có header `Retry-After` và `retry_after` trong JSON |
| 502 | `ai_failed` khi provider lỗi hoặc phản hồi sai định dạng |
| 503 | `speaking_unavailable` khi database lỗi; `auth_unavailable` hoặc `ai_unavailable` khi chưa cấu hình |
| 504 | `ai_timeout` khi provider hết thời gian chờ |

## Gửi và tải hội thoại

`GET /api/speaking/sessions/<session_uuid>/messages?after_sequence=0&limit=100`
trả transcript từ database theo `sequence_number` tăng dần. Response gồm
`items`, `session` (ID, trạng thái, chế độ nhập), `has_more`, `next_sequence`.
`after_sequence` mặc định 0; `limit` từ 1 đến 100, mặc định 100.
Khi `has_more=true`, dùng `next_sequence` để tải trang tiếp theo.

`POST /api/speaking/sessions/<session_uuid>/messages`:

```json
{
  "request_id": "<client_generated_uuid>",
  "content": "こんにちは！",
  "input_mode": "text"
}
```

`content` từ 1 đến 2000 ký tự, `input_mode` là `text` hoặc `voice`.
Chỉ chủ sở hữu được gửi vào buổi `active`. Thành công trả `200` với
`user_message` và `assistant_message`, cùng cấu trúc tin nhắn mở đầu ở trên.
Phản hồi được lưu thành công trước khi trả về giao diện. AI nhận snapshot
tình huống/vai đã lưu khi bắt đầu và tối đa 6 tin nhắn gần nhất.
System prompt luôn là tin nhắn đầu tiên, gồm bối cảnh, mục tiêu, vai/chỉ dẫn
riêng tư, ngôn ngữ và trình độ. AI được yêu cầu chỉ nói lời của nhân vật,
trả lời 1–2 câu ngắn và giữ cuộc hội thoại trong tình huống.

Hai luồng chat gửi `reasoning: {"enabled": false, "exclude": true}` và giới hạn
256 token đầu ra để tránh bật thinking mặc định và trả lời dài. Chỉ ẩn reasoning
không tắt tính toán; tham số `enabled=false` mới yêu cầu tắt reasoning.
Tham khảo [OpenRouter reasoning](https://openrouter.ai/docs/guides/best-practices/reasoning-tokens).
Transcript đầy đủ vẫn được lưu trong database. API buổi luyện tập chờ phản hồi
hoàn tất và lưu vào database trước khi hiển thị; độ trễ thực tế còn tùy provider.
Khởi động lại backend sau khi sửa `.env` để áp dụng model mới.

`request_id` là ID tin nhắn người dùng để chống trùng khi mất kết nối.
Thử lại phải giữ nguyên ID, nội dung và chế độ. Lượt đã hoàn tất trả lại
cặp tin nhắn đã lưu; cùng ID với nội dung khác trả `409`. Chỉ một lượt
được xử lý trong mỗi buổi. Backend khóa dòng để đặt trước lượt, thả khóa
trước khi gọi AI; lỗi provider lưu phản hồi ở trạng thái `failed` để thử lại.
Lượt `pending` dưới 120 giây trả `turn_pending`; sau đó có thể thử lại cùng
ID. Worker cũ không được ghi đè kết quả của lần thử lại mới.

Nhận dạng giọng nói chạy bằng native speech recognition trên thiết bị.
Người dùng xem/sửa văn bản nhận dạng rồi gửi với `input_mode=voice`.
Backend lưu transcript; frontend dùng native TTS để đọc phản hồi đã lưu.
Chức năng này chưa upload/lưu file audio (UC-S10).

## Kiểm thử

```sh
venv/bin/python -m unittest discover -s tests -p 'test_speaking.py' -v
TEST_DATABASE_URL=postgresql+psycopg://nihongo:nihongo_local@localhost:5432/nihongo \
  venv/bin/python -m unittest discover -s tests -v
```

PostgreSQL tests chạy trong schema tạm riêng. Kiểm tra khả dụng, bộ lọc,
phân trang, xác thực, lựa chọn vai, snapshot, transcript mở đầu, rollback khi
lưu lỗi, seed chạy lại, quyền sở hữu transcript, chống gửi trùng, thử lại và
gửi đồng thời. Test provider dùng mock, không gọi AI trả phí. Nhận dạng và
TTS cần kiểm tra thêm trên thiết bị thật có microphone và ngôn ngữ hỗ trợ.

## Giao diện React Native

`SpeakingScenariosScreen` đã kết nối API qua `speakingService`, dùng lại
`authenticatedRequest` và phiên đăng nhập lưu trong Keychain. Truy cập từ
thẻ **Luyện tập → Nói** hoặc ô kỹ năng **Nói** trên trang chủ.

- Mở thẳng danh sách tình huống. Chủ đề và trình độ hiển thị cùng màn hình
  bằng các lựa chọn cuộn ngang; chọn là lọc ngay, không cần mở màn hình
  chọn chủ đề hoặc hộp thoại bộ lọc. Nhóm lấy từ API và dùng UUID để lọc.
- Đóng popup hoặc quay lại danh sách giữ chủ đề, trình độ và từ khóa đã chọn.
- Tìm kiếm theo tên/mô tả, gửi khi nhấn **Tìm kiếm** hoặc phím search.
- Danh sách phân trang 20 mục, có nút **Tải thêm tình huống**.
- Chạm tình huống mở popup ngay trên danh sách, tải chi tiết từ API. Popup
  chỉ hiển thị tên, trình độ, thời lượng, bối cảnh/mục tiêu, nút **Đóng** và
  **Tiếp tục**. Chỉ hiện lựa chọn vai khi tình huống có nhiều vai AI.
- **Tiếp tục** bắt đầu bằng văn bản, không lưu audio; có thể chuyển sang
  giọng nói ngay trong màn hình hội thoại.
- Bắt đầu gửi POST; chỉ mở màn hình buổi luyện tập sau khi backend lưu thành công.
  `ConversationScreen` tải transcript từ database, không lấy dữ liệu mẫu frontend.
- Chọn **Văn bản** để nhập/gửi; chọn **Giọng nói** để bật/dừng microphone,
  xem/sửa phần nhận dạng rồi gửi. Phản hồi voice được đọc tự động, có nút
  đọc lại/dừng đọc. Đổi chế độ hoặc rời màn hình sẽ dừng microphone/TTS.
- Khi gửi lỗi, giữ nội dung và mã yêu cầu để thử lại. Khi tải lại buổi có lượt
  lỗi, phục hồi mã từ transcript để không tạo trùng. Không gửi lượt mới khi
  lượt trước chưa hoàn tất. Transcript tải lỗi có nút tải lại riêng.
- Provider trả 429 thì hiện thông báo model bị giới hạn lượt gọi và đếm
  ngược trước khi cho thử lại; dùng `Retry-After`, mặc định 30 giây nếu thiếu.
  Không đổi sang model khác. Khi POST lỗi kết nối nhưng câu trả lời đã lưu,
  tải lại transcript để hiển thị phản hồi đã hoàn tất, không gọi AI lần nữa.
  Nếu lượt vẫn `pending`, app kiểm tra transcript mỗi giây trong tối đa 30
  giây để nhận câu trả lời lưu muộn; dừng khi hoàn tất, thất bại hoặc rời màn hình.
- iOS cần quyền microphone và speech recognition; Android cần quyền
  `RECORD_AUDIO`. Các quyền và native dependencies Voice/TTS đã có trong
  dự án. Thiết bị không hỗ trợ hiển thị lỗi để chuyển sang nhập văn bản.
- Có trạng thái tải, lỗi/thử lại và kết quả rỗng riêng. Bỏ qua response cũ
  khi đổi bộ lọc hoặc rời màn hình. Chặn nhấn bắt đầu trùng trong lúc request chạy.
- Khi quay lại danh sách và chọn lại cùng tình huống trong màn hình này,
  **Tiếp tục** mở lại buổi đã tạo mà không gửi thêm POST. Rời danh sách hoặc đổi kỹ năng không
  tự kết thúc/pause buổi ở backend; các API vòng đời chưa được triển khai.

Địa chỉ backend cấu hình tại `frontend/src/config/api.ts`: iOS simulator dùng
`http://localhost:5001`, Android emulator dùng `http://10.0.2.2:5001`. Thiết bị
thật cần địa chỉ LAN của máy chạy backend. Để backend nhận kết nối từ thiết bị:

```sh
venv/bin/flask --app app run --host 0.0.0.0 --port 5001
```

Trong thư mục `frontend`, kiểm tra bằng:

```sh
npx tsc --noEmit
npm test -- --runInBand --watchman=false
```
