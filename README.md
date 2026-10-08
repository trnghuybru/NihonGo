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

- [Thiết lập học tập](backend/LEARNING.md)
- [API và luồng hội thoại](backend/SPEAKING.md)
- [Cơ sở dữ liệu và migration hội thoại](backend/SPEAKING_DATABASE.md)
- [Thiết kế ứng dụng](design.md)
