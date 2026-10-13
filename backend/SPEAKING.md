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

Màn hình Aoi dùng Gemini Live. Cấu hình trong `backend/.env`:

```dotenv
GEMINI_API_KEY=your_key_from_google_ai_studio
GEMINI_LIVE_MODEL=gemini-3.8-live
GEMINI_LIVE_VOICE=Kore
```

Khởi động lại backend sau khi thay `.env`. Model mặc định lấy từ
[tài liệu WebSocket của Google](https://ai.google.dev/gemini-api/docs/live-api/get-started-websocket);
đổi biến model nếu tài khoản dùng model Live khác. Không đặt API key trong frontend.
Hội thoại văn bản `/messages` cũng dùng `GEMINI_API_KEY`;
`GEMINI_CHAT_MODEL` mặc định `gemini-3.1-flash-lite`.

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

API hội thoại văn bản dùng Gemini REST, giới hạn 1024 token đầu ra và đặt
`thinkingLevel: "minimal"` cho model Gemini 3. Backend chỉ trả các phần văn bản
hội thoại, bỏ qua phần thinking.
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

## Gemini Live

`POST /api/speaking/sessions/<session_uuid>/live-token` với `{}` cấp token
ngắn hạn cho phiên active của chính người dùng. Backend gọi `v1beta/auth_tokens`,
khóa toàn bộ cấu hình Live theo snapshot bối cảnh/mục tiêu/vai AI riêng tư.
Response gồm `token`, `model`, `lease`, `last_sequence` và tối đa 20 tin nhắn
hoàn tất gần nhất dưới dạng `history`. Không trả API key hoặc system prompt.
Token dùng một lần để mở kết nối trong một phút, có hạn 30 phút;
lease lưu transcript có hạn một giờ. Khi hết hạn, kết nối lại và nạp lịch sử.
Phiên có lượt legacy pending/failed phải xử lý lượt đó trước khi dùng Live.

Frontend kết nối trực tiếp WebSocket `BidiGenerateContentConstrained` bằng
[token tạm thời](https://ai.google.dev/gemini-api/docs/live-api/ephemeral-tokens).
Nạp lịch sử bằng `historyConfig.initialHistoryInClientContent`, không tự tạo
phản hồi mới khi mở lại phiên. Giữ micro gửi `activityStart` và PCM16LE 16 kHz;
thả tay dừng thu, gửi hết buffer cuối rồi gửi `activityEnd`. AI trả PCM16LE
24 kHz, phát bằng `react-native-audio-api`. Văn bản gửi trên cùng kết nối;
không dùng nhận dạng giọng nói hoặc TTS legacy trong luồng này.

`POST /api/speaking/sessions/<session_uuid>/live-turns`:

```json
{
  "lease": "<signed_lease>",
  "request_id": "<client_uuid>",
  "after_sequence": 1,
  "input_mode": "voice",
  "user_text": "こんにちは！",
  "assistant_text": "こんにちは。お名前は？"
}
```

Chỉ lưu khi lượt Gemini hoàn tất và có cả hai transcript (1–2000 ký tự mỗi
phía). Backend kiểm tra lease, chủ sở hữu, phiên active và sequence hiện tại;
lưu cả hai tin nhắn trong một transaction rồi trả `user_message`,
`assistant_message`. Thử lại giữ nguyên payload và UUID để chống trùng;
xung đột sequence trả 409 `session_changed`. Lỗi lưu giữ lượt trong bộ nhớ
và hiện “Thử lưu lại”, chặn lượt mới cho đến khi lưu thành công. Nếu phiên đã
đổi ở thiết bị khác hoặc lease hết hạn, “Bỏ lượt chưa lưu” bỏ transcript cục bộ
của lượt đó và kết nối lại theo lịch sử hiện tại.

Transcript do client báo lại, không phải bằng chứng xác thực độc lập của
Gemini; không dùng dữ liệu này để chấm điểm đáng tin cậy hoặc quyết định quyền
truy cập. Phiên bật `audio_storage_enabled` lưu audio từng tin nhắn qua
S3-compatible storage; xem phần nghe lại bên dưới.
Mất kết nối hoặc đóng app trước khi nhận đủ transcript có thể mất lượt đang
nói; các lượt đã lưu vẫn có trong lịch sử.

## Kiểm thử

```sh
venv/bin/python -m unittest discover -s tests -p 'test_speaking.py' -v
TEST_DATABASE_URL=postgresql+psycopg://nihongo:nihongo_local@localhost:5432/nihongo \
  venv/bin/python -m unittest discover -s tests -v
```

PostgreSQL tests chạy trong schema tạm riêng. Kiểm tra khả dụng, bộ lọc,
phân trang, xác thực, lựa chọn vai, snapshot, transcript mở đầu, rollback khi
lưu lỗi, seed chạy lại, quyền sở hữu transcript, chống gửi trùng, thử lại và
gửi đồng thời. Test provider dùng mock, không gọi AI trả phí. Âm thanh Live và nhân vật 3D cần kiểm tra thêm trên thiết bị thật, với API key có quyền sử dụng model.

## Giao diện React Native

`SpeakingScenariosScreen` đã kết nối API qua `speakingService`, dùng lại
`authenticatedRequest` và phiên đăng nhập lưu trong Keychain. Truy cập từ
thẻ **Luyện tập → Nói** hoặc ô kỹ năng **Nói** trên trang chủ.

- Vào Nói mở lịch sử; “Cuộc trò chuyện mới” mở popup chọn ngữ cảnh theo design.md.
- Chọn tình huống/vai rồi bắt đầu phiên đã lưu ở backend; giữ nguyên bộ lọc khi đóng popup.
- `ConversationScreen` hiển thị Aoi 3D phía trên và chat cuộn phía dưới.
  Nút icon mắt cạnh toggle mic/nhập ẩn/hiện Aoi để mở rộng chat; nút Kết thúc ở góc trên bên phải.
  Bóng đèn trong toolbar mở nhiệm vụ/vai AI trong popup; có thể
  xoay nhân vật bằng kéo và phóng to/thu nhỏ bằng hai ngón tay.
- Mặc định Nói với mic lớn ở giữa; chọn Nhắn tin mới hiện ô text/nút gửi.
  Chuyển mode giữ draft và không kết nối lại. Aoi cử động
  miệng khi có audio đang phát (hoạt ảnh demo theo trạng thái, chưa đồng bộ phoneme).
- Nút “Hội thoại” mở transcript đã lưu. Nút quay lại dẫn tới lịch sử;
  không có nút tạo phiên mới trong màn hình buổi luyện tập.
- Có trạng thái kết nối, đang nghe, AI trả lời, đang lưu và lỗi/thử lại.
  Khi app chuyển nền, dừng micro/audio và WebSocket; giữ lượt chờ lưu để thử lại.
  Mở lại phiên nạp tối đa 20 tin gần nhất vào Gemini, transcript đầy đủ vẫn xem được.
- Phiên không active chỉ xem lại, không kết nối Gemini. WebView tải lỗi có nút tải lại;
  hoạt động hội thoại không phụ thuộc việc tải xong mô hình 3D.
- iOS cần quyền microphone; Android cần `RECORD_AUDIO`. Thêm module native
  `react-native-audio-api` nên cần build lại binary, Fast Refresh không đủ.
  iOS đã cập nhật Pods; khi cài lại dependencies chạy `pod install` trong `frontend/ios`.

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


## Lịch sử hội thoại

### Audio và nghe lại

Màn chọn tình huống có tùy chọn **Lưu âm thanh để nghe lại**, mặc định bật;
người dùng có thể bỏ chọn trước khi bắt đầu. Backend vẫn mặc định `false`
khi client không gửi `audio_storage_enabled`. Không upload audio cho phiên
chưa bật tùy chọn này.

Audio người dùng mới là WAV PCM16 mono 44,1/48 kHz; audio Aoi là 24 kHz.
Tiếp tục hỗ trợ bản thu người dùng 16 kHz từ client cũ. Micro callback dùng
tần số 44,1/48 kHz theo thiết bị; lưu PCM trước khi lọc và resample về 16 kHz
để gửi Gemini. Bộ lọc giữ trạng thái qua callback để tránh alias và mất frame
ở tần số 44,1 kHz. iOS dùng mode `default` với category `playAndRecord`.
Mỗi file tối đa 3 phút. File nằm trong S3/RustFS, PostgreSQL chỉ lưu metadata
và `storage_key`. Cấu hình và chuyển sang AWS xem [README](../README.md).

- `POST /api/speaking/sessions/<session_id>/messages/<message_id>/audio-upload`:
  metadata nhận thêm `sample_rate` (người dùng: 16000/44100/48000, Aoi: 24000).
  Client cũ không gửi trường này mặc định 16000 cho người dùng, 24000 cho Aoi.
  Ví dụ bản thu người dùng: `{ "size_bytes": 96044, "duration_ms": 1000, "sample_rate": 48000 }`, nhận `asset`,
  `upload_url` và `headers`. Tin nhắn phải đã lưu thành công, thuộc phiên
  active của tài khoản. UUID asset/key ổn định theo tin nhắn để thử lại không
  tạo bản thu trùng. Asset đã ready trả `upload_url: null`.
- Frontend PUT file trực tiếp vào URL ký sẵn, có thời hạn 15 phút. Không
  gửi access token tài khoản hoặc AWS credentials tới frontend storage.
- `POST /api/speaking/sessions/<session_id>/audio/<asset_id>/complete`:
  backend kiểm tra dung lượng, MIME và WAV header qua S3 trước khi đổi
  trạng thái sang ready. Có thể gọi lại sau khi mất phản hồi.
- `GET /api/speaking/sessions/<session_id>/audio/<asset_id>/playback`:
  chỉ chủ sở hữu đọc được asset ready; trả URL GET có thời hạn 5 phút.
  Phiên completed/paused vẫn nghe lại được.
- Transcript trả thêm `audio: null | { id, mime_type, size_bytes, duration_ms }`
  cho mỗi tin nhắn. Không trả storage key hoặc URL hết hạn trong transcript.

Icon loa nhỏ nằm cạnh và ngoài bong bóng tin nhắn có audio, cùng hàng, không hiện số giây,
dùng chung một player
cho chat và popup transcript. Bấm lại để dừng; dừng khi app chuyển nền hoặc
rời màn hình. Có thể nghe bản thu đã lưu khi Gemini Live đang lỗi. Khi Live
đang thu/phát/phản hồi thì khóa replay; khi replay đang chạy thì khóa mic/gửi
tin nhắn để tránh âm thanh chồng nhau.

Player tăng âm lượng bản thu micro nhỏ khi nghe lại (bao gồm file đã lưu),
nhắm RMS -20 dBFS, giới hạn gain 20 lần và peak 0.95. Gain cố định cho cả
lượt để không thay đổi âm lượng giữa các từ; bỏ qua bản thu gần im lặng.
Chỉ áp dụng giọng người dùng, giữ nguyên số frame, sample rate và file gốc S3.
Không khử nhiễu hay phục hồi chi tiết âm thanh bị mất từ thiết bị đầu vào.

Sau khi lưu transcript, client upload audio người dùng và AI. Upload lỗi
giữ file trong bộ nhớ để **Thử lưu lại**; thử lại không POST transcript thêm
lần nữa nếu đã nhận phản hồi lưu thành công. Nếu app bị đóng hẳn trước khi
upload xong, phần audio chưa upload có thể mất. Các phiên cũ không có bản
thu vẫn đọc transcript, không tổng hợp giọng thay cho audio gốc.

`GET /api/speaking/sessions?page=1&page_size=20` trả các phiên của người dùng
đang đăng nhập, xếp theo thời gian tin nhắn cuối (hoặc thời gian bắt đầu khi
chưa có tin nhắn), mới nhất trước. `page_size` tối đa 100. Mỗi mục gồm `id`,
`title`, `role_name`, `status`, `last_activity_at` và `last_message` (trích đoạn
tối đa 160 ký tự). Response có `items` và `pagination` như danh sách tình huống.

`GET /api/speaking/sessions/<session_id>` trả `session`, `scenario` và
`opening_message: null`. `scenario` lấy từ bản chụp lúc tạo phiên, không phụ
thuộc tình huống hiện còn published hay đã được chỉnh sửa. Chỉ dẫn AI nội bộ
không được trả về. Dùng API messages hiện có để tải transcript và gửi tiếp
vào cùng ID nếu trạng thái là `active`; các trạng thái khác chỉ xem lại.
Phiên của tài khoản khác và ID không tồn tại đều trả 404.

Màn hình Luyện nói hiển thị lịch sử ngay khi vào; nút “Cuộc trò chuyện mới”
mở popup chọn ngữ cảnh. Khi quay lại từ chat, danh sách được tải lại. Không
cần migration hoặc bảng mới cho tính năng này.

## UC-S11 / UC-S12: nhận xét sau hội thoại

Chạy `flask --app app db upgrade` để áp dụng revision `f4b5c6d7e8a9`.

| API | Hành vi |
| --- | --- |
| `POST /sessions/<id>/messages/<message_id>/feedback` với `{}` | Nhận xét câu người dùng đã completed, kể cả phiên active; trả cache hoặc 202 nếu đang xử lý; không kết thúc/chấm điểm phiên |
| `POST /sessions/<id>/finish` với `{}` | Kết thúc phiên sở hữu; idempotent; 409 nếu còn tin nhắn chưa hoàn tất hoặc upload đang chờ |
| `POST /sessions/<id>/evaluation` với `{}` | Đánh giá phiên đã completed; trả cache khi đã có kết quả, 202 nếu lần khác đang xử lý |
| `GET /sessions/<id>/evaluation` | Đọc trạng thái/kết quả; không gọi provider |

Các đường dẫn trên có prefix `/api/speaking` và yêu cầu Bearer token.
Trạng thái trả về: `not_started`, `pending`, `processing`, `completed`,
`insufficient_data`, `failed`. Response gồm `result`, `overall_score`,
`rubric_version`, `completed_at`, `error` khi phù hợp. Trường hợp thiếu dữ liệu
có `overall_score: null`, không phải điểm 0. Các phiên ít hơn ba lượt người
dùng được trả thiếu dữ liệu mà không gọi AI. Model có thể từ chối chấm nếu ba
lượt vẫn không đủ nội dung. Kết quả hoàn tất được lưu lại và không tự chấm lại.

Chỉ phân tích bản chép lời: ngữ pháp 40%, từ vựng 30%, độ tự nhiên 30%.
Không đánh giá phát âm, ngữ điệu hay tốc độ nói. Backend tính điểm tổng một
chữ số thập phân; model chỉ trả điểm từng tiêu chí. Model output được kiểm
tra schema, khoảng điểm và trích dẫn thuộc đúng tin nhắn người dùng. Mỗi góp
ý phân biệt `error` với `alternative`. Payload có bối cảnh công khai, trình
độ và transcript hoàn tất; không có private AI instructions, thông tin tài
khoản hoặc audio/URL S3. Nội dung cá nhân nói trong transcript vẫn có thể gửi
đến provider.

Prompt thực tế: `speaking/evaluation_prompt.txt`; schema và provider:
`speaking/evaluation_ai.py`. Chấm điểm toàn buổi và nhận xét từng câu đều dùng
Gemini với `GEMINI_API_KEY`; `SPEAKING_EVALUATION_MODEL` mặc định
`gemini-3.1-flash-lite`. Gọi REST `generateContent`
với `systemInstruction`, transcript trong `contents` và JSON Schema trong
`generationConfig.responseJsonSchema`. Mức thinking minimal cho model Gemini 3.x.
Đặt model trong `.env` bằng tên
model Gemini và khởi động lại backend; không cần migration và kết quả đã lưu
vẫn được đọc lại như trước.

Lần gọi AI đầu dùng timeout kết nối 5 giây, đọc tối đa 60 giây; frontend chờ POST tối
đa 90 giây. Thử lại tự động tối đa một lần khi lỗi provider tạm thời hoặc output
không hợp lệ; lần thứ hai đọc tối đa 30 giây và giảm theo ngân sách chờ còn lại
(80 giây từ đầu lần phân tích). Không tự thử lại rate limit, lỗi cấu hình hay timeout.
HTTP 200 có `error` vẫn được coi là lỗi provider. Chỉ nhận candidate có
`finishReason=STOP`; bỏ các phần thinking và không thử lại khi Gemini chặn nội dung. Một code fence JSON ngoài cùng
được bỏ trước khi kiểm tra; góp ý trùng câu gốc/câu sửa được gộp, các gợi ý khác
nhau cho cùng câu vẫn được giữ. Trích dẫn bịa hoặc điểm không hợp lệ không được
chấp nhận. Log chỉ chứa loại lỗi, không ghi response body/transcript/credentials.
Lưu claim UUID trước khi gọi, thả khóa DB trong lúc chờ, chỉ lần
giữ đúng claim được ghi kết quả. Claim hết hạn sau 120 giây cho phép retry;
lần cũ không ghi đè kết quả mới. Chưa có worker; nếu request bị mất kết nối,
frontend có thể mở lại GET để xem trạng thái hoặc thử lại sau khi claim hết
hạn. JSON sai/timeout/rate limit giữ phiên completed và lưu trạng thái lỗi.

Khi sửa output, system prompt và schema giữ nguyên; gửi thêm user message cố định:

```text
Return the complete JSON object again, following the system output schema exactly. The previous response failed backend validation. Use numeric scores for all three criteria when scored; for insufficient_data use null scores and an empty items array. Copy message_id and original quotations exactly from learner messages in the supplied transcript, never from assistant messages. Do not repeat a correction for the same quotation. Include all required fields and no markdown or extra text.
```


### Nhận xét từng câu trong lúc luyện

Bóng đèn cạnh loa chỉ có trên câu người dùng đã lưu đầy đủ, kể cả câu gõ không có audio.
Bấm để mở/thu gọn nhận xét ngay dưới tin nhắn; không đóng Gemini Live hay kết thúc phiên.
Mỗi câu lưu `feedback_payload` và claim/lease riêng trong PostgreSQL. Khi mở lại, POST
trả kết quả đã lưu mà không gọi AI lại; lỗi cho phép thử lại. Lease 120 giây tránh gọi
trùng, thả khóa phiên trước provider IO để việc lưu lượt mới tiếp tục hoạt động.

Prompt đầy đủ: `speaking/message_feedback_prompt.txt`. Schema chỉ gồm `summary` và
`items` (tối đa ba góp ý); không có điểm hay yêu cầu ba lượt. Backend gửi tối đa tám
messages completed đến câu đích, `target_message_id` và bối cảnh công khai. Câu đích
là bằng chứng duy nhất; các câu trước chỉ tạo ngữ cảnh. Không gửi audio/URL S3,
private instructions hay thông tin tài khoản. Trích dẫn phải thuộc đúng câu đích.
Dùng cùng model/format và transport thử lại có giới hạn với tổng kết, prompt riêng
không đánh giá phát âm hoặc toàn phiên. Câu chưa đủ nội dung được giải thích giới
hạn; câu phù hợp có thể trả `items=[]`, không bắt AI tạo lỗi.


## UC-S15: xóa buổi hội thoại

`DELETE /api/speaking/sessions/<id>` yêu cầu Bearer token, không body/query.
Chỉ chủ sở hữu được xóa, kể cả phiên active/paused/completed. UUID sai trả 400,
phiên không tồn tại/không thuộc tài khoản trả 404. Response 200:
`{"deleted": true, "audio_cleanup_pending": false}`; pending=true nếu kho audio
lỗi trong lượt dọn đầu. Lịch sử và mọi API owned-session loại `deleted_at` ngay.
Xóa một phiên không xóa scenario hoặc phiên người dùng khác.

Migration `a7b8c9d0e1f2` thêm `deleted_at`, `audio_cleanup_after`. Nếu không có asset,
xóa parent ngay, database cascade transcript/nhận xét/audio metadata và SET NULL
liên kết retry của các phiên khác. Nếu có asset, commit tombstone trước storage IO,
xóa object trong đúng `sessions/<uuid>/`, giữ deadline 16 phút rồi quét lần cuối
và cascade xóa database. URL PUT ký trước đó có thể còn hiệu lực 15 phút, vì vậy
không xóa dấu chờ dọn trước deadline. Không xuất object key hoặc lỗi S3 thô ra client.
Lỗi DeleteObjects trong HTTP 200 cũng là dọn chưa hoàn tất, được thử lại.

Chạy `flask --app app audio-cleanup-deleted --watch` ở tiến trình riêng (30 giây/lượt),
hoặc CLI không --watch qua scheduler. Lỗi S3 giữ tombstone; lỗi DB ở watch cũng
được thử lại. Bucket không còn tồn tại được coi là không còn audio để xóa. Không
xóa bucket hay object ngoài prefix của phiên. Bucket AWS dùng versioning cần
cấu hình thêm chính sách vòng đời cho các phiên bản cũ nếu muốn xóa vật lý chúng.

Frontend dùng Alert native có Hủy/Xóa, icon thùng rác rõ ràng, khóa thao tác mở/xóa
trong lúc DELETE đang chạy, không lồng nút xóa bên trong vùng bấm mở thẻ. Chỉ bỏ
thẻ sau khi API thành công và tải lại phân trang để tránh bỏ sót phiên.
