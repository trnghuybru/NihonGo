# Thời gian học theo mục tiêu mỗi ngày

Ứng dụng tự đếm khi người dùng ở Bài học, Tra cứu hoặc khu Nghe/Nói/Viết và app
đang foreground. Web dừng khi tab bị ẩn hoặc cửa sổ mất focus. Trang chủ, Cá nhân,
thiết lập, kế hoạch và mục Đọc chưa có bài học không tính thời gian. Đây là thời
gian ở khu học; không phải bằng chứng hoàn thành bài hay thuộc từ.

Home có thẻ Mục tiêu hôm nay, thời gian mm:ss và thanh tiến độ theo daily_minutes.
Badge nhỏ cập nhật từng giây khi học. Đạt mục tiêu vẫn tiếp tục ghi nhận thời gian.
Ngày mới bắt đầu lúc 00:00 Asia/Ho_Chi_Minh. Dữ liệu bắt đầu từ khi có tính năng;
không suy đoán thời gian học trước đây.

## API và dữ liệu

- `GET /api/learning/progress?account_id=<id>` trả date, timezone, server_time_ms,
  seconds, goal_seconds, completed và các intervals đã gộp của ngày hiện tại.
- `POST /api/learning/progress` nhận `account_id` và `intervals` dạng
  `[[start_ms, end_ms], ...]`: tối đa 60 khoảng, mỗi khoảng không quá 60 giây,
  trong 24 giờ gần nhất. Cả hai API dùng phiên đăng nhập; account_id chỉ kiểm tra
  phiên đã đổi, không cho phép chọn chủ dữ liệu khác.
- Bảng learning_study_days có khóa (user_id, day), các khoảng UTC đã gộp,
  tổng seconds và updated_at. Khóa hàng user trước khi ghi để tránh tạo trùng hay
  mất cập nhật từ nhiều tab/thiết bị. Khoảng qua nửa đêm chia theo ngày Việt Nam.
- Gửi lại cùng khoảng, khoảng chồng nhau, hoặc mất phản hồi sau khi server đã ghi
  đều được hợp nhất nên không cộng hai lần. Thay đổi mục tiêu giữ nguyên seconds.
- Endpoint heartbeat có giới hạn riêng: 30 yêu cầu/tài khoản/phút và 600/IP/phút,
  không dùng chung quota ghi đăng nhập, vì nhiều người có thể dùng chung IP.

Client dùng mốc thời gian server và đồng hồ monotonic, bỏ khoảng tick bị trì hoãn
quá 5 giây. Chỉ các context tiến độ cập nhật mỗi giây, không render lại cả app.
Đồng bộ mỗi 15 giây khi có khoảng chờ, ngay khi rời khu học/chạy nền; đọc lại khi
quay foreground và tối đa mỗi phút để nhận tiến độ từ thiết bị khác.
Khoảng chờ và mốc đã đồng bộ lưu theo account_id bằng Keychain (web dùng lớp
sessionStorage hiện có). Không đảm bảo giữ phần cuối khi app bị buộc đóng trước
lần lưu kế tiếp, hoặc tab web đóng trong lúc còn offline. Lỗi sync có Thử lại.

## Migration và kiểm tra

```sh
cd backend
venv/bin/flask --app app db upgrade
venv/bin/python -m unittest discover -s tests -p test_learning.py -v
```

Migration `c6d7e8f901a2` chỉ thêm bảng tiến độ. Test PostgreSQL dùng schema tạm,
bao gồm ghi đồng thời, cách ly tài khoản, đổi mục tiêu, qua ngày và gửi lại.
Frontend kiểm tra foreground, context học, đổi đồng hồ, retry, nửa đêm và cache.
