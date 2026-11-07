# Vận hành beta NihonGO

**01/11/2026:** Web production là <https://momonihongo.app>. Mọi tài khoản phải nằm trong danh sách tối đa 50 email được mời; hệ thống cho phép tối đa 50 tài khoản beta. Backend dùng Vertex AI cho tác vụ thông thường và API key Gemini riêng cho Live. Cấu hình `BETA_QUOTA_MODE=daily` đã triển khai; ví USD cũ không còn được dùng để giới hạn người dùng beta.

## Quota theo ngày

- `beta_daily_quotas` lưu một `video_id` và số phiên Live cho từng người/ngày theo `Asia/Ho_Chi_Minh`.
- Mỗi người được xử lý/dịch **một video mới mỗi ngày**. Kết quả đã có và thao tác thử lại cùng video được dùng tiếp.
- Mỗi người được mở **hai phiên Live mỗi ngày**, mỗi phiên tối đa **240 giây**. Gateway chặn ở backend; tối đa hai phiên Live đồng thời trên VPS. Phiên lỗi trước `setupComplete` được hoàn lượt.
- `GET /api/auth/daily-quota` trả giới hạn và số lượt còn lại cho trang Cá nhân. `GET /api/auth/ai-budget` không dùng trong chế độ `daily`.
- Các request AI REST vẫn kiểm tra model, kích thước đầu ra và giới hạn đồng thời; chúng không trừ ví USD trong chế độ `daily`.

## Lệnh vận hành

Từ `/opt/momonihongo` trên VPS:

```bash
python3 deploy/beta/validate_env.py backend/.env
python3 deploy/beta/manage_invites.py --add
python3 deploy/beta/set_quota_mode.py daily
python3 deploy/beta/set_live_mode.py on
docker compose --env-file backend/.env -f compose.beta.yaml up -d --no-deps --force-recreate backend shadowing-worker
docker compose --env-file backend/.env -f compose.beta.yaml ps
```

Kiểm thử đường WebSocket Live bằng tài khoản tạm tự xóa, không dùng lượt của người dùng thật:

```bash
docker compose --env-file backend/.env -f compose.beta.yaml exec -T backend python - < deploy/beta/smoke_live.py
```

Script đã nhận `setupComplete` và phản hồi AI qua domain trên VPS. Người dùng đã xác nhận micro và Aoi đáp bằng giọng trên Chrome. Giới hạn 4 phút được áp dụng trong gateway; chưa chạy phép đo đồng hồ đủ 4 phút trên trình duyệt. Nếu gặp lỗi, xem log backend rồi tắt tạm bằng `set_live_mode.py off` và khởi động lại backend.

## Âm thanh và game

- Lưu/nghe lại âm thanh đã bật. File WAV ở volume `beta_audio`; `backup_audio.sh` chạy cùng backup database hằng ngày. Bản backup ngày 01/11 đã sao về Mac và checksum khớp. Script `smoke_audio.py` đã upload, phát lại và dọn dữ liệu tạm thành công trên backend production. Người dùng đã xác nhận phát lại được trên Chrome.
- Game nhiều người đã bật. Redis, LiveKit và voice worker chạy trên VPS. Caddy cấp HTTPS cho `voice.momonihongo.app`; `smoke_game_transport.py` đã kết nối hai người chơi tạm và xác nhận họ nhìn thấy nhau. `smoke_game_worker.py` xác nhận worker tham gia phòng Đọc và gửi heartbeat. Người dùng đã xác nhận hai tài khoản thật nghe thấy nhau và điểm Đọc cập nhật. Dùng `python3 deploy/beta/set_games_mode.py on|off` rồi khởi động lại backend để bật/tắt.
- Mô hình Whisper của game/worker video được lưu ở `model-cache/` trên VPS để không tải lại sau mỗi lần tái tạo container.

## Việc còn cần xác nhận

- Video không có phụ đề: worker beta hiện yêu cầu phụ đề có sẵn. Cần quyết định mở Whisper CPU và thử tải trên VPS trước khi quảng bá là hỗ trợ mọi video.

Giữ `backend/.env`, khóa Gemini và JSON Vertex khỏi Git. Nếu key đã lộ, thay key tại nhà cung cấp rồi cập nhật VPS. Quota ứng dụng không thay thế việc theo dõi chi phí provider.
