# Phòng chơi từ vựng

Vào **Luyện tập → Phòng chơi từ vựng**, hoặc **Chơi cùng bạn bè** trên trang chủ.
Phòng có 2–8 người, một mode cố định, JLPT N5–N1, nguồn random theo JLPT hoặc một bài học, 1–30 câu và 10/15/20/30 giây mỗi câu. Từ lấy từ database, không lặp trong trận; nguồn thiếu từ sẽ báo lỗi để giảm số câu.

## Luật chơi

- **Viết cách đọc:** mỗi người gửi một đáp án kana/câu; đáp án đúng được 10, 8, 6, 4, 2 rồi 1 điểm theo thứ tự server nhận. Chỉ công bố đáp án sau khi mọi người gửi hoặc hết giờ.
- **Giành mic:** người giành lượt đầu tiên được đọc tối đa 8 giây, mọi người nghe trực tiếp. Backend cấp quyền xuất bản microphone riêng cho người đó. Sau một khoảng im lặng ngắn, bấm Đọc xong hoặc hết giờ thì thu quyền mic; worker nhận dạng bằng Google Cloud Speech-to-Text V2 (`short`, `ja-JP`) và chấm 10 điểm nếu đúng. Sai cũng kết thúc câu, không chuyển mic cho người khác.
- Lỗi âm thanh, quá nhỏ, không nhận dạng được hoặc worker hết thời gian xử lý: thông báo lỗi, không tính điểm câu đó. Hệ thống so khớp đầy đủ nội dung/cách đọc; đây không phải bộ chấm chi tiết âm vị hoặc trọng âm. Thời gian trả lời đo ở server, không cộng thời gian chờ API.
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

Trước khi chạy worker, cần bật **Cloud Speech-to-Text API** và thêm role **Cloud Speech Client** cho service account Google Cloud. Dùng lại JSON hiện có, lưu tại `deploy/beta/secrets/vertex.json` với quyền `600`; không đưa JSON vào Git/chat. Đặt `GAME_SPEECH_PROJECT_ID` hoặc `VERTEX_PROJECT_ID` trong `backend/.env`. Compose mount JSON ở chế độ chỉ đọc; game không tải/nạp model Whisper nữa. LiveKit vẫn tự host. Audio chỉ ở RAM tối đa 10 giây mỗi lượt rồi gửi tới dịch vụ nhận dạng, không lưu file hoặc upload S3. Chi tiết: [GAME_VOICE.md](../deploy/beta/GAME_VOICE.md).

## Cấu hình

- `LIVEKIT_URL`: URL backend truy cập để quản lý quyền mic (local `ws://127.0.0.1:7880`; worker Compose dùng hostname nội bộ).
- `LIVEKIT_PUBLIC_URL`: URL client truy cập, mặc định dùng `LIVEKIT_URL`. Android emulator đặt `ws://10.0.2.2:7880`; iOS simulator/browser local dùng `ws://localhost:7880`. Thiết bị thật cần địa chỉ LAN hoặc WSS. Khi cần truy cập LAN, đặt `LIVEKIT_BIND_ADDRESS=0.0.0.0` và chạy Compose với `--env-file backend/.env`.
- `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`: chỉ trên server, khớp cấu hình LiveKit.
- `GAME_MEDIA_IP`: IP server dùng cho ICE. Script local cũng quảng bá IP nội bộ để worker Docker kết nối.
- `GAME_REDIS_URL`: Redis cho Socket.IO khi có nhiều process; local `redis://127.0.0.1:6379/4`.
- `GAME_SOCKET_ORIGINS`: danh sách origin phân tách bằng dấu phẩy; mặc định localhost và 127.0.0.1 cổng 5173. Thêm origin thực tế khi đổi host/cổng.
- `GAME_SPEECH_PROJECT_ID`: project dùng Cloud Speech-to-Text; bỏ trống để dùng `VERTEX_PROJECT_ID` hoặc `GOOGLE_CLOUD_PROJECT`.
- `GOOGLE_APPLICATION_CREDENTIALS`: đường dẫn JSON của service account. Compose đã trỏ tới `/run/vertex-secrets/vertex.json`; chạy worker ngoài Docker cần đặt đường dẫn file thực trên máy. Worker xử lý tối đa hai yêu cầu nhận dạng đồng thời.
- `GAME_TIMERS_ENABLED=0`: tắt timer cho lệnh migration/kiểm thử.

Khi triển khai thật, dùng HTTPS/WSS và reverse proxy cả `/api` lẫn `/socket.io` với WebSocket upgrade. Trình duyệt truy cập qua IP LAN bằng HTTP không có quyền microphone như localhost. Cấu hình firewall/TURN theo [hướng dẫn LiveKit](https://docs.livekit.io/transport/self-hosting/ports-firewall/); cấu hình Compose hiện tại dành cho phát triển cục bộ. Giữ `LIVEKIT_URL` là địa chỉ backend truy cập được, dùng `LIVEKIT_PUBLIC_URL` cho địa chỉ dành cho thiết bị. File `frontend/src/config/api.ts` chứa cấu hình API native.

## Cấu trúc và kiểm thử

`games/engine.py` giữ luật và whitelist dữ liệu public; `routes.py` là API có xác thực; PostgreSQL khóa hàng phòng cho các thao tác giành lượt/chấm điểm, dùng thời gian server. `games/__init__.py` quản lý Socket.IO, timer và cập nhật client, kể cả trạng thái kết thúc từ worker; client có polling dự phòng. `voice_worker.py` nghe track thật của người thắng; `speech.py` nhận dạng tiếng Nhật `ja-JP` từ PCM 16 kHz. Token audio không chứa khóa LiveKit. Không đưa ngân hàng đáp án ra frontend.

### Thử nghiệm nhận dạng trình duyệt trong beta

Web/PWA ưu tiên `SpeechRecognition` / `webkitSpeechRecognition`, `ja-JP`, tối đa 3 phương án, không truyền đáp án làm gợi ý. Người giành mic khai báo `recognizer: browser` khi buzz. Chỉ bắt đầu nhận dạng sau khi thắng lượt và LiveKit đã bật micro. Chữ tạm thời chỉ để hiển thị; kết quả cuối gửi đến `/speech-answer`. Backend kiểm tra thành viên, người giữ mic, round, thời hạn và đối chiếu Kanji/Kana; tự tính điểm, chống cộng lặp khi gửi lại. Đây là chế độ giao lưu: transcript do client gửi có thể bị giả mạo, không dùng làm bằng chứng phát âm cho thi đấu có thưởng.

Worker vẫn giữ PCM trong RAM nhưng không tự kết thúc theo im lặng và không gọi Cloud Speech khi lượt còn dùng trình duyệt. Khi bấm Đọc xong, ưu tiên chấm ngay chữ đang hiển thị, kể cả kết quả tạm thời; khi trình duyệt kết thúc/báo lỗi sau khi đã nhận được chữ, cũng giữ chữ đó để chấm. Chỉ chuyển về Cloud Speech khi không có chữ, không hỗ trợ nhận dạng hoặc hết 8 giây. `finish-reading` với `fallback: true` chuyển bộ nhận dạng mà giữ micro để người chơi tiếp tục đọc; lần bấm Đọc xong bình thường kết thúc thu âm. Không cần API key mới. Native giữ Cloud Speech; PWA không sử dụng trực tiếp API native của Android/iOS. Thời gian giành mic (`buzz_ms`) do server ghi nhận; không lấy độ trễ nhận dạng làm tốc độ đọc.

```sh
cd backend
GAME_TIMERS_ENABLED=0 venv/bin/python -m unittest discover -s tests -p test_games.py -v
cd ../frontend
npm test -- --runInBand __tests__/VocabularyGameScreen.test.tsx
npx tsc --noEmit
npm run web:build
```
