# NihonGO

Dự án ứng dụng học tiếng Nhật, gồm thiết lập mục tiêu học tập, luyện hội thoại theo tình huống với AI, nhân vật Aoi 3D và lịch sử hội thoại. Ứng dụng di động sử dụng React Native/TypeScript; backend sử dụng Flask và PostgreSQL.

## Cấu trúc dự án

```text
DATN/
├── backend/         # Flask API, xác thực, dữ liệu học tập và hội thoại
│   ├── migrations/ # Migration cơ sở dữ liệu bằng Flask-Migrate
│   ├── tests/      # Kiểm thử backend
│   └── .env.example
├── frontend/        # Ứng dụng React Native cho Android và iOS
│   ├── android/
│   ├── ios/
│   └── src/
├── compose.yaml     # PostgreSQL và Mailpit cho môi trường local
└── design.md        # Thiết kế ứng dụng
```

## Yêu cầu môi trường

- Node.js **>= 22.11.0** và npm theo `frontend/package.json`.
- Python **3.12** để tạo môi trường backend.
- Docker và Docker Compose để chạy PostgreSQL 17 và Mailpit.
- Android: Android Studio, JDK và Android SDK; mở emulator hoặc kết nối thiết bị thật. Cấu hình hiện tại sử dụng SDK 37, Build Tools 37.0.0 và NDK 27.1.12297006 trong `frontend/android/build.gradle`.
- iOS: máy macOS, Xcode, Ruby, Bundler và CocoaPods.

Các lệnh dưới đây dùng terminal macOS/Linux. Trên Windows, lệnh kích hoạt môi trường Python trong PowerShell là `.\venv\Scripts\Activate.ps1`.

## 1. Khởi động PostgreSQL và Mailpit

Tại thư mục gốc dự án, khi Docker đang chạy:

```sh
docker compose up -d
docker compose ps
```

Đợi PostgreSQL chuyển sang trạng thái `healthy` trước khi chạy migration.

| Dịch vụ | Địa chỉ / thông tin local |
| --- | --- |
| PostgreSQL | `localhost:5432`, database `nihongo`, user `nihongo`, password `nihongo_local` |
| SMTP Mailpit | `localhost:1025` |
| Hộp thư Mailpit | <http://localhost:8025> |

Docker Compose chỉ chạy hai dịch vụ hỗ trợ. Backend và ứng dụng di động chạy riêng theo các bước tiếp theo.

## 2. Cài đặt và chạy backend

Từ thư mục gốc:

```sh
cd backend
python3 -m venv venv
source venv/bin/activate
python -m pip install -r requirements.txt
```

Nếu chưa có `backend/.env`, sao chép mẫu:

```sh
cp .env.example .env
```

Nếu đã có `.env`, bổ sung biến còn thiếu từ `.env.example` để giữ các API key hiện có. Tạo khóa xác thực:

```sh
python -c 'import secrets; print(secrets.token_urlsafe(48))'
```

Dán kết quả vào `AUTH_SECRET_KEY` trong `.env`. Khóa cần ít nhất 32 ký tự. Những biến chính:

| Biến | Cách cấu hình |
| --- | --- |
| `APP_ENV` | `development` cho môi trường local |
| `DATABASE_URL` | `postgresql+psycopg://nihongo:nihongo_local@localhost:5432/nihongo` |
| `AUTH_SECRET_KEY` | Khóa ngẫu nhiên vừa tạo |
| `PUBLIC_BASE_URL` | `http://localhost:5001` khi chạy local; dùng địa chỉ backend mà trình duyệt truy cập được nếu cấu hình OAuth |
| `PORT` | `5001` |
| `SMTP_HOST`, `SMTP_PORT` | `localhost`, `1025` để gửi mã xác thực vào Mailpit |
| `SMTP_SSL`, `SMTP_STARTTLS` | `false` khi dùng Mailpit local |
| `GEMINI_API_KEY` | API key phía backend để dùng hội thoại Aoi qua Gemini Live |
| `GEMINI_LIVE_MODEL`, `GEMINI_LIVE_VOICE` | Giá trị mẫu trong `.env.example`; đổi model nếu tài khoản dùng model Live khác |
| `OPENROUTER_API_KEY` | Cần khi dùng hội thoại văn bản qua OpenRouter hoặc endpoint demo `/api/chat/voice-stream` |
| `OPENROUTER_MODEL` | Model OpenRouter, có giá trị mẫu trong `.env.example` |

Các biến Twilio và OAuth Google/Facebook/Apple chỉ cần khi sử dụng nhà cung cấp tương ứng. Giữ API key trong backend; không đưa vào frontend hoặc commit file `.env`.

Trong terminal backend đã kích hoạt `venv`, tạo bảng và dữ liệu tình huống mẫu:

```sh
flask --app app db upgrade
flask --app app speaking-seed
python app.py
```

Lệnh `speaking-seed` có thể chạy lại, không ghi đè tình huống đã tồn tại cùng ID. Backend mặc định lắng nghe tại `0.0.0.0:5001`, cho phép thiết bị cùng mạng kết nối.

Để dùng bài học N1–N5 và ví dụ video mẫu, chạy thêm trong thư mục backend:

```sh
flask --app app vocabulary-import
flask --app app vocabulary-import --source data/vocabulary/mimikara-n3.json
flask --app app vocabulary-import --source data/vocabulary/anki-n4.json
flask --app app vocabulary-import --source data/vocabulary/mimikara-n1.json
flask --app app vocabulary-import --source data/vocabulary/jtest-n5.json
flask --app app video-examples-import
```

N1 có audio riêng từng từ trong bộ Anki đã cung cấp. Sau khi RustFS chạy, nhập
audio từ thư mục backend (chạy lại không tạo file trùng):

```sh
flask --app app vocabulary-audio-import --apkg /path/to/Mimikara_Oboeru_N1_T_Vng.apkg
```

App hiện icon loa cạnh từ có audio. File lưu riêng trong bucket `vocabulary-audio`;
xem [cấu hình, nhập audio và chuyển sang S3](backend/VOCABULARY.md#audio-từ-vựng-n1).

Kho video mẫu có 327 đoạn phụ đề tiếng Nhật. Trong app, tìm `社会`, `日本` hoặc
`人生`, chọn **Video** rồi chạm **Xem đoạn này**. Chọn **Từ vựng** để tra bài học
theo JLPT. Xem [hướng dẫn dữ liệu video](backend/data/video_examples/README.md).

Mở terminal khác để kiểm tra:

```sh
curl http://localhost:5001/
curl http://localhost:5001/api/auth/config
```

Endpoint `/` trả JSON với `status: "ok"`. Trường `openrouter_configured` chỉ phản ánh có cấu hình khóa OpenRouter; không kiểm tra Gemini hay kết nối database. Endpoint `/api/auth/config` kiểm tra thêm dịch vụ tài khoản.

## 3. Cài đặt và chạy ứng dụng di động

Mở terminal mới tại thư mục gốc:

```sh
cd frontend
npm ci
```

### Địa chỉ kết nối backend

API chính được cấu hình trong [`frontend/src/config/api.ts`](frontend/src/config/api.ts):

| Môi trường | Địa chỉ backend |
| --- | --- |
| Android Emulator của Android Studio | `http://10.0.2.2:5001` (mặc định) |
| iOS Simulator | `http://localhost:5001` (mặc định) |
| Điện thoại thật | `http://<IP-LAN-của-máy-chạy-backend>:5001` |

Khi dùng điện thoại thật, sửa `DEVELOPMENT_API_URL` thành địa chỉ LAN của máy tính, ví dụ `http://192.168.1.10:5001`. Máy tính và điện thoại phải cùng mạng Wi-Fi, backend đang chạy và firewall cho phép kết nối cổng 5001.

Nếu dùng dịch vụ chat streaming cũ, sửa thêm `DEFAULT_HOST_IP` trong [`frontend/src/services/chatStreamService.ts`](frontend/src/services/chatStreamService.ts), hiện đang cố định là `192.168.1.31`. Nếu đổi cổng backend, cập nhật cả cổng trong địa chỉ frontend. Khi tạo bản release, cấu hình `PRODUCTION_API_URL` bằng địa chỉ HTTPS của backend.

### Khởi động Metro

Trong thư mục `frontend`, chạy và giữ terminal này mở:

```sh
npm start
```

### Android

Mở emulator hoặc kết nối điện thoại đã bật USB debugging. Tại terminal khác, từ thư mục gốc:

```sh
cd frontend
npm run android
```

### iOS

Trước lần build đầu hoặc sau khi thay dependency native, từ thư mục gốc:

```sh
cd frontend
bundle install
cd ios
bundle exec pod install
cd ..
npm run ios
```

Metro và backend cần tiếp tục chạy trong các terminal riêng. Khi dùng tính năng giọng nói, cấp quyền microphone cho ứng dụng. Sau khi thêm hoặc đổi dependency native, build lại ứng dụng bằng `npm run android` hoặc `npm run ios`.

## 4. Dùng thử

1. Mở ứng dụng và đăng ký tài khoản bằng email.
2. Mở <http://localhost:8025> trên máy tính để lấy mã xác thực gửi qua Mailpit.
3. Xác thực tài khoản, đăng nhập và hoàn tất thiết lập trình độ, mục tiêu, thời lượng học.
4. Vào **Luyện tập → Nói**, chọn **Cuộc trò chuyện mới** và chọn tình huống đã seed.
5. Để hội thoại với Aoi, cấu hình `GEMINI_API_KEY` và model Live mà tài khoản được phép sử dụng, rồi khởi động lại backend.

## Lưu âm thanh và nghe lại với RustFS

Transcript lưu trong PostgreSQL. Audio lưu riêng theo từng tin nhắn trong S3-compatible storage: bản thu mới của người dùng ở 44,1/48 kHz theo tần số thiết bị, giọng Aoi ở 24 kHz, định dạng WAV PCM16 mono. Giới hạn 3 phút mỗi bản thu. Bảng `conversation_audio_assets` đã có trong migration hiện tại, không cần migration mới. Bản thu người dùng 16 kHz đã lưu vẫn nghe lại được.

App thu micro ở 44,1/48 kHz để lưu bản nghe lại riêng. Luồng gửi Gemini vẫn ở 16 kHz, dùng bộ lọc chống alias và giữ trạng thái resample qua các buffer. iOS dùng `playAndRecord` với mode `default` cho thao tác giữ mic để nói rồi thả để nghe; không dùng mode `voiceChat`. Khởi động lại backend và reload app trước khi tạo bản thu mới để thử thay đổi này; file cũ giữ nguyên chất lượng gốc.

Khi nghe lại giọng người dùng, app tự tăng âm lượng bản thu nhỏ bằng một mức gain cố định cho cả câu, giới hạn tối đa 26 dB và chừa biên độ để tránh clipping. Áp dụng cả file đã lưu; không sửa audio gốc trong S3. Không khuếch đại phần gần im lặng và không xử lý giọng Aoi. Cơ chế này cải thiện âm nhỏ, không khôi phục chi tiết đã mất hoặc loại bỏ tiếng rè từ micro. Khi thử trên simulator, kiểm tra thiết bị đầu vào và mức input trong cài đặt âm thanh của máy; nên đối chiếu bằng micro tích hợp trên điện thoại thật.

1. Dùng chung file `backend/.env` cho Flask và cấu hình RustFS. Nếu chưa có, sao chép `backend/.env.example` thành `backend/.env`. Đặt `RUSTFS_ACCESS_KEY` riêng cho máy và `RUSTFS_SECRET_KEY` ngẫu nhiên (có thể tạo bằng `openssl rand -hex 24`). Docker Compose đọc file này qua `--env-file backend/.env`; không cần `.env` ở thư mục gốc. Không commit credentials. RustFS không cần token LocalStack.
2. Nếu đang chạy LocalStack ở cổng 4566, dừng riêng dịch vụ đó bằng `docker compose --env-file backend/.env --profile audio-localstack stop localstack`. Khởi động dịch vụ, chờ RustFS `healthy`:

   ```sh
   docker compose --env-file backend/.env --profile audio up -d
   docker compose --env-file backend/.env --profile audio ps
   ```

3. Bổ sung các biến lưu trữ từ `backend/.env.example` vào `backend/.env`:

   ```dotenv
   S3_BUCKET=nihongo-audio
   AWS_DEFAULT_REGION=us-east-1
   S3_ENDPOINT_URL=http://localhost:4566
   S3_PUBLIC_ENDPOINT_URL=http://localhost:4566
   S3_ADDRESSING_STYLE=path
   AWS_ACCESS_KEY_ID=<giá trị RUSTFS_ACCESS_KEY trong backend/.env>
   AWS_SECRET_ACCESS_KEY=<giá trị RUSTFS_SECRET_KEY trong backend/.env>
   ```

   `S3_ENDPOINT_URL` là địa chỉ backend dùng để kiểm tra file. `S3_PUBLIC_ENDPOINT_URL` là địa chỉ ứng dụng dùng để upload/nghe lại: với điện thoại thật, đặt `http://<IP-LAN-của-máy>:4566`; với Android Emulator có thể dùng `http://10.0.2.2:4566`. Một địa chỉ LAN truy cập được dùng chung cho cả hai nền tảng. Cho phép thiết bị truy cập cổng 4566. Không sửa hostname của URL sau khi ký vì sẽ làm sai chữ ký.

4. Trong thư mục `backend`, với `venv` đã kích hoạt:

   ```sh
   python -m pip install -r requirements.txt
   flask --app app audio-storage-init
   python app.py
   ```

   Khởi động lại backend nếu đang chạy để nạp credentials mới. RustFS ghi file vào named volume `rustfs_data` tại `/data`, giữ dữ liệu khi stop/start, khởi động lại Docker hoặc tạo lại container. Dùng `docker compose --env-file backend/.env --profile audio stop` để dừng và `docker compose --env-file backend/.env --profile audio up -d` để bật lại. `docker compose down` giữ volume; **không dùng `down -v` hoặc xóa volume `datn_rustfs_data` nếu cần giữ audio**. Giao diện quản lý: `http://localhost:9001`, đăng nhập bằng credentials RustFS trong `backend/.env`. [Hướng dẫn volume của RustFS](https://docs.rustfs.com/en/installation/container/docker).

   LocalStack vẫn có profile riêng `audio-localstack` nếu cần dùng lại; không chạy cùng RustFS vì trùng cổng. Persistence native của LocalStack cần license phù hợp, gói freemium không lưu trạng thái S3 qua restart. File đã mất từ LocalStack không thể khôi phục bằng `audio-storage-init`; transcript trong PostgreSQL vẫn giữ nguyên.

5. Tạo cuộc trò chuyện mới với tùy chọn **Lưu âm thanh để nghe lại** được bật. Sau khi lưu lượt nói, icon loa nhỏ xuất hiện cạnh bong bóng tin nhắn có audio, cùng hàng và ngoài khung chat, không hiện số giây; bấm lần nữa để dừng. Có thể mở lại phiên từ lịch sử hoặc popup **Hội thoại** để nghe từng câu của bạn và Aoi. Lời mở đầu của phiên mới cũng được lưu khi Aoi đọc.

Phiên cũ chưa thu/lưu audio chỉ có transcript; không tạo lại giọng nói từ văn bản. Tin nhắn gõ tay không có audio của người dùng, nhưng vẫn có audio Aoi trả lời. Không phát nhiều bản thu cùng lúc; ứng dụng dừng nghe lại khi vào nền, đóng màn hình hoặc chuyển sang lượt Live. Nếu upload lỗi, **Thử lưu lại** tiếp tục lưu audio mà không tạo thêm tin nhắn. Audio đang chờ upload nằm trong bộ nhớ của lượt hiện tại; đóng hẳn app trước khi lưu xong có thể mất phần audio đó.

### Xóa buổi hội thoại (UC-S15)

Trong lịch sử luyện nói, bấm icon thùng rác màu xám ở góc phải trên thẻ, sau đó xác nhận. Có thể xóa cả phiên đang dở và phiên đã kết thúc. Hủy giữ nguyên dữ liệu; nếu yêu cầu thất bại, thẻ vẫn hiện cùng thông báo để thử lại. Sau khi xóa, phiên biến mất khỏi lịch sử và không thể mở, tiếp tục, nghe lại hay nhận xét qua API.

Backend xóa audio trong đúng prefix của phiên trên RustFS/S3. Phiên có audio được đánh dấu xóa trong PostgreSQL trước khi dọn file, để lỗi kho lưu trữ không làm hội thoại xuất hiện lại. Bản ghi ẩn cùng transcript/nhận xét được xóa hẳn sau lượt dọn cuối, ít nhất 16 phút để URL upload đã cấp hết hạn và bắt được file tải lên muộn. Phiên không có audio được xóa hẳn ngay. Không có chức năng khôi phục.

Chạy tiến trình dọn ở terminal riêng trong thư mục `backend` với `venv` đã kích hoạt:

```sh
flask --app app audio-cleanup-deleted --watch
```

Tiến trình kiểm tra mỗi 30 giây và thử lại khi kho audio/database hoạt động trở lại. Dọn một lần: `flask --app app audio-cleanup-deleted`. Khi triển khai thật, chạy tiến trình này cùng backend hoặc gọi CLI theo lịch; công việc chờ dọn nằm trong PostgreSQL nên vẫn giữ qua restart.

### Nhận xét sau hội thoại và xem điểm (UC-S11 / UC-S12)

Khi đang trò chuyện, bấm **bóng đèn cạnh icon loa** ở câu của bạn đã lưu để nhận xét riêng câu đó. Nhận xét không kết thúc phiên, không chấm điểm và không đánh giá phát âm; kết quả được lưu để mở lại. Bấm **icon mắt gạch (Ẩn Aoi)** cạnh toggle mic/nhập để mở rộng vùng chat; bấm **icon mắt (Hiện Aoi)** để hiện lại nhân vật. Nút **Kết thúc** ở góc trên bên phải chỉ kết thúc và lưu phiên. Sau đó chọn **Xem điểm & nhận xét** nếu muốn tổng kết toàn hội thoại. Nhận xét gồm điểm ngữ pháp (40%), từ vựng (30%), độ tự nhiên của cách diễn đạt (30%), điểm mạnh, câu sửa và gợi ý luyện tiếp. Không đánh giá phát âm hoặc gửi audio đến API nhận xét. Phiên ít hơn ba lượt người dùng không được chấm điểm; AI cũng có thể báo chưa đủ dữ liệu khi nội dung quá ít. Với giọng nói, nhận xét dựa trên bản chép lời, có thể có sai sót nhận dạng.

Từ lịch sử, mở phiên đã kết thúc và chọn **Xem điểm & nhận xét** để xem kết quả đã lưu. Mở lại không gọi AI lại. Nếu phân tích lỗi, bấm **Thử phân tích lại**; transcript vẫn được giữ. Quay lại lịch sử khi chưa kết thúc vẫn cho phép tiếp tục phiên đó.

Màn hình tổng kết hiển thị điểm tổng quan ở đầu, hội thoại ở giữa và tối đa ba gợi ý luyện tập ở cuối. Nhận xét gắn ngay dưới đúng tin nhắn người dùng, mặc định thu gọn; mở một câu sẽ đóng nhận xét câu trước. Mỗi góp ý chia thành chỗ cần sửa/cách nói hiện tại, lý do và câu gợi ý. Lỗi và cách diễn đạt thay thế có nhãn riêng; câu chưa có góp ý không được đánh dấu là đúng. Icon loa vẫn nghe lại bản thu gốc. Nút **Xem câu liên quan** cuộn về và mở nhận xét đúng câu, không tự cuộn xuống cuối khi mở góp ý. Không tạo audio mới cho câu sửa.

Backend dùng OpenRouter với `OPENROUTER_API_KEY`. Cấu hình mẫu dùng `SPEAKING_EVALUATION_MODEL=nvidia/nemotron-3-super-120b-a12b:free` và `SPEAKING_EVALUATION_FORMAT=json_schema` cho phần nhận xét. Để trống model sẽ dùng `OPENROUTER_MODEL`; không đặt format sẽ dùng `text`. Backend luôn kiểm tra JSON và trích dẫn, kể cả khi đã bật [structured outputs của OpenRouter](https://openrouter.ai/docs/guides/features/structured-outputs). Khi đổi model, cần kiểm tra hỗ trợ `json_schema`; với model không hỗ trợ, dùng `text`.

Nếu model trả lỗi bên trong HTTP 200, backend báo dịch vụ model gián đoạn thay vì báo nhận xét sai định dạng. Mỗi lần phân tích thử lại tự động tối đa một lần khi provider gián đoạn hoặc output không hợp lệ. Góp ý lặp cùng câu gốc và câu sửa được gộp; trích dẫn không có trong transcript vẫn bị từ chối. Model miễn phí vẫn có thể giới hạn lượt gọi, khi đó cần thử lại sau.

Chạy `flask --app app db upgrade` trong môi trường backend để cập nhật các trường nhận xét. Prompt nhận xét từng câu nằm ở [`message_feedback_prompt.txt`](backend/speaking/message_feedback_prompt.txt): chỉ xét `target_message_id`, tối đa ba góp ý có trích dẫn đúng câu, ngữ pháp/từ vựng/độ tự nhiên; các câu trước chỉ làm bối cảnh. API chỉ gửi tối đa tám tin nhắn đã lưu tới câu được chọn và bối cảnh công khai, không gửi audio, credentials hoặc private role instructions. Một câu đủ nội dung có thể được nhận xét mà không cần ba lượt hay điểm tổng quan. System prompt thực tế nằm ở [`evaluation_prompt.txt`](backend/speaking/evaluation_prompt.txt), schema và phần gọi API nằm ở [`evaluation_ai.py`](backend/speaking/evaluation_ai.py). Payload chỉ có bối cảnh công khai và transcript, không có thông tin tài khoản, private role instructions hoặc URL audio; nội dung cá nhân đã nói trong transcript vẫn có thể được gửi.

### Chuyển sang Amazon S3

Giữ nguyên luồng frontend và API. Tạo bucket riêng tư, đặt `S3_BUCKET`/`AWS_DEFAULT_REGION` theo AWS, để trống `S3_ENDPOINT_URL` và `S3_PUBLIC_ENDPOINT_URL`, đổi `S3_ADDRESSING_STYLE=auto`. Xóa credentials RustFS local; dùng IAM role của backend hoặc credentials AWS phù hợp, không đưa vào frontend. Backend cần quyền `s3:PutObject`, `s3:GetObject`, `s3:DeleteObject` trong prefix `sessions/` và `s3:ListBucket` trên bucket (giới hạn prefix `sessions/`) để dọn audio khi xóa phiên; quyền tạo bucket chỉ cần nếu chủ động chạy lệnh khởi tạo.

Database lưu `storage_key` và metadata, không lưu URL ký sẵn. URL upload hết hạn sau 15 phút; URL nghe lại cấp mới theo tài khoản, hết hạn sau 5 phút. Nếu muốn giữ audio local, sao chép object sang bucket AWS với cùng key. Kiểm tra lại IAM, upload và playback trên AWS trước khi phát hành. Nếu có client web, cấu hình thêm CORS phù hợp ở bucket.

Kiểm thử upload/download thực tế bằng RustFS và PostgreSQL, trong thư mục `backend` (hai biến credentials test lấy từ `backend/.env`):

```sh
TEST_DATABASE_URL=postgresql+psycopg://nihongo:nihongo_local@localhost:5432/nihongo \
TEST_S3_ENDPOINT_URL=http://localhost:4566 \
TEST_S3_ACCESS_KEY_ID='thay bằng RUSTFS_ACCESS_KEY' \
TEST_S3_SECRET_ACCESS_KEY='thay bằng RUSTFS_SECRET_KEY' \
  python -m unittest discover -s tests -v
```

Kiểm thử dùng schema và bucket ngẫu nhiên riêng, dọn sau khi chạy. Không có `TEST_S3_ENDPOINT_URL` thì kiểm thử storage thực tế được bỏ qua.

## Kiểm tra dự án

Backend, trong thư mục `backend` và môi trường `venv` đã kích hoạt:

```sh
TEST_DATABASE_URL=postgresql+psycopg://nihongo:nihongo_local@localhost:5432/nihongo \
  python -m unittest discover -s tests -v
flask --app app db check
```

Các bài kiểm thử PostgreSQL tạo schema tạm riêng; user database cần quyền tạo schema. Nếu không đặt `TEST_DATABASE_URL`, các kiểm thử migration PostgreSQL sẽ được bỏ qua.

Frontend, trong thư mục `frontend`:

```sh
npm run lint
npx tsc --noEmit
npm test -- --runInBand --watchman=false
```

## Lỗi thường gặp

- **Không kết nối được backend:** kiểm tra `curl`, địa chỉ trong `api.ts`, Wi-Fi và cổng 5001. `localhost` trên điện thoại thật là chính điện thoại đó.
- **Dịch vụ tài khoản chưa được cấu hình:** kiểm tra `DATABASE_URL`, `AUTH_SECRET_KEY` đủ 32 ký tự, PostgreSQL đang chạy và đã thực hiện `db upgrade`.
- **Danh sách tình huống trống:** chạy `flask --app app speaking-seed` trong môi trường backend.
- **Không nhận được mã xác thực:** kiểm tra Mailpit đang chạy, cấu hình SMTP theo `.env.example` và hộp thư tại cổng 8025.
- **Gemini Live hoặc OpenRouter báo lỗi:** kiểm tra API key, model, quyền sử dụng và kết nối Internet; khởi động lại backend sau khi sửa `.env`.
- **iOS thiếu module native:** chạy lại `bundle exec pod install` trong `frontend/ios`, rồi build lại ứng dụng.

Để dừng PostgreSQL và Mailpit, chạy `docker compose down` tại thư mục gốc. Dữ liệu PostgreSQL vẫn được giữ trong volume `postgres_data`. Dừng backend và Metro bằng `Ctrl+C` trong từng terminal.

## Tài liệu chi tiết

- [Học từ vựng JLPT, lưu trữ và cách nhập dữ liệu](backend/VOCABULARY.md)
- [Dữ liệu từ vựng N1–N5 và cách nhập từ website/PDF/Anki](backend/data/vocabulary/README.md)
- [Thiết lập học tập](backend/LEARNING.md)
- [API và luồng hội thoại](backend/SPEAKING.md)
- [Cơ sở dữ liệu và migration hội thoại](backend/SPEAKING_DATABASE.md)
- [Thiết kế ứng dụng](design.md)
