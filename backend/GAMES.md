# Phòng chơi từ vựng

Vào **Luyện tập → Phòng chơi từ vựng**, hoặc **Chơi cùng bạn bè** trên trang chủ.
Phòng có 2–8 người, một mode cố định, JLPT N5–N1, nguồn random theo JLPT hoặc một bài học, 1–30 câu và 10/15/20/30 giây mỗi câu. Từ lấy từ database, không lặp trong trận; nguồn thiếu từ sẽ báo lỗi để giảm số câu.

## Luật chơi

- **Viết cách đọc:** mỗi người gửi một đáp án kana/câu; đáp án đúng được 10, 8, 6, 4, 2 rồi 1 điểm theo thứ tự server nhận. Chỉ công bố đáp án sau khi mọi người gửi hoặc hết giờ.
- **Giành mic:** người giành lượt đầu tiên được đọc tối đa 8 giây, mọi người nghe trực tiếp. Backend cấp quyền xuất bản microphone riêng cho người đó. Đọc xong/hết giờ thì thu quyền mic, worker nhận dạng bằng Whisper tiếng Nhật trên server và chấm 10 điểm nếu đúng. Sai cũng kết thúc câu, không chuyển mic cho người khác.
- Lỗi âm thanh, quá nhỏ, không nhận dạng được hoặc worker hết thời gian xử lý: thông báo lỗi, không tính điểm câu đó. Whisper so khớp nội dung/cách đọc; đây không phải bộ chấm chất lượng phát âm.
- Chủ phòng bắt đầu khi ít nhất hai người đều sẵn sàng. Người chơi mode đọc kết nối thử âm thanh trong phòng chờ trước khi sẵn sàng. Người đang chơi có thể kết nối lại bằng phòng đã lưu; không nhận người mới giữa trận.
- Rời phòng chuyển chủ cho người còn lại. Không còn ai thì đóng phòng; phòng hết hạn sau hai giờ.

## Chạy cục bộ

Từ `backend`:

```sh
venv/bin/pip install -r requirements.txt
venv/bin/flask --app app db upgrade
# Dùng IP LAN hiện tại của máy; chạy lại lệnh này khi đổi Wi-Fi/IP.
GAME_MEDIA_IP=192.168.1.16 venv/bin/python -m games.setup_local
```

Script chỉ tạo khóa LiveKit khi chưa có, lưu trong `.env` và `.runtime/games/livekit.yaml` (đều không commit). `GAME_MEDIA_IP` được cập nhật khi truyền lại. Sau đó từ thư mục gốc:

```sh
docker compose --profile games up -d --build games-redis livekit games-voice-worker
# Nếu vừa đổi GAME_MEDIA_IP:
docker compose --profile games restart livekit
```

Chạy backend và frontend ở hai terminal:

```sh
cd backend
venv/bin/python app.py
```

```sh
cd frontend
npm install
npm run web
```

Mở `http://localhost:5173`. Dùng hai tài khoản và hai cửa sổ trình duyệt riêng để thử. Native iOS cần chạy `bundle exec pod install` trong `frontend/ios` sau khi cài dependency.

Worker dùng lại volume `shadowing_models` và model `small` của Shadowing; không cần tài khoản Google hay LiveKit Cloud. Lần đầu chưa có model thì tải model về volume. Audio chỉ được giữ trong RAM tối đa 10 giây cho mỗi lượt, không lưu file hay upload S3.

## Cấu hình

- `LIVEKIT_URL`: URL backend truy cập để quản lý quyền mic (local `ws://127.0.0.1:7880`; worker Compose dùng hostname nội bộ).
- `LIVEKIT_PUBLIC_URL`: URL client truy cập, mặc định dùng `LIVEKIT_URL`. Android emulator đặt `ws://10.0.2.2:7880`; iOS simulator/browser local dùng `ws://localhost:7880`. Thiết bị thật cần địa chỉ LAN hoặc WSS. Khi cần truy cập LAN, đặt `LIVEKIT_BIND_ADDRESS=0.0.0.0` và chạy Compose với `--env-file backend/.env`.
- `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`: chỉ trên server, khớp cấu hình LiveKit.
- `GAME_MEDIA_IP`: IP server dùng cho ICE. Script local cũng quảng bá IP nội bộ để worker Docker kết nối.
- `GAME_REDIS_URL`: Redis cho Socket.IO khi có nhiều process; local `redis://127.0.0.1:6379/4`.
- `GAME_SOCKET_ORIGINS`: danh sách origin phân tách bằng dấu phẩy; mặc định localhost và 127.0.0.1 cổng 5173. Thêm origin thực tế khi đổi host/cổng.
- `GAME_WHISPER_MODEL`: mặc định dùng `SHADOWING_WHISPER_MODEL` hoặc `small`.
- `GAME_WHISPER_THREADS`: mặc định 2, CPU int8; mỗi worker nạp model một lần và xếp inference tuần tự.
- `GAME_TIMERS_ENABLED=0`: tắt timer cho lệnh migration/kiểm thử.

Khi triển khai thật, dùng HTTPS/WSS và reverse proxy cả `/api` lẫn `/socket.io` với WebSocket upgrade. Trình duyệt truy cập qua IP LAN bằng HTTP không có quyền microphone như localhost. Cấu hình firewall/TURN theo [hướng dẫn LiveKit](https://docs.livekit.io/transport/self-hosting/ports-firewall/); cấu hình Compose hiện tại dành cho phát triển cục bộ. Giữ `LIVEKIT_URL` là địa chỉ backend truy cập được, dùng `LIVEKIT_PUBLIC_URL` cho địa chỉ dành cho thiết bị. File `frontend/src/config/api.ts` chứa cấu hình API native.

## Cấu trúc và kiểm thử

`games/engine.py` giữ luật và whitelist dữ liệu public; `routes.py` là API có xác thực; PostgreSQL khóa hàng phòng cho các thao tác giành lượt/chấm điểm, dùng thời gian server. `games/__init__.py` quản lý Socket.IO, timer và cập nhật client; client có polling dự phòng. `voice_worker.py` nghe track thật của người thắng, cố định ngôn ngữ `ja`; không nhận transcript từ client và không đưa đáp án vào prompt Whisper. Token audio không chứa khóa LiveKit. Không đưa ngân hàng đáp án ra frontend.

```sh
cd backend
GAME_TIMERS_ENABLED=0 venv/bin/python -m unittest discover -s tests -p test_games.py -v
cd ../frontend
npm test -- --runInBand __tests__/VocabularyGameScreen.test.tsx
npx tsc --noEmit
npm run web:build
```
