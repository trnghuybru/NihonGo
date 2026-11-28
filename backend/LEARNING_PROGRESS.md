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

## Tiến độ bài học từ vựng

`GET /api/vocabulary/progress?level=N2` trả tiến độ theo từng `lesson_id`:
`total`, `studied`, `percent`, `due` và `status` (`not_started`, `in_progress`,
`completed`). `studied` là số từ khác nhau đã nhận đánh giá flashcard ít nhất một
lần, kể cả đánh giá chưa nhớ. Học lại hoặc ôn cùng từ qua bộ yêu thích không cộng
trùng; dữ liệu chỉ thuộc tài khoản đăng nhập. Mở bài để đọc không tự tăng tiến độ.
100% thể hiện đã ôn hết các từ, không có nghĩa đã thuộc hết. `due` chỉ tính thẻ
đang hoạt động và đến hạn tại thời điểm truy vấn.

API dùng một truy vấn tổng hợp theo trình độ, không cần migration hoặc ghi lại
lịch sử. Phản hồi có `Cache-Control: no-store`. Client tải tiến độ riêng với nội
dung bài học, cập nhật khi trở lại danh mục, quay lại ứng dụng và sau khi đánh giá
flashcard. Lỗi tải tiến độ không ngăn mở bài và không hiển thị thành 0%.

## Tab Cá nhân: kiến thức và lộ trình thực hành

`GET /api/learning/journey` tổng hợp thẻ đã đánh giá ít nhất một lần, thẻ đang
hoạt động đến hạn, số bài đọc khác nhau đã nộp và số bài viết đã nộp. Tối đa 20
thẻ ôn gần nhất cung cấp từ, cách đọc và nghĩa; giao diện mở đầu với 4 thẻ.
Đây là lịch sử tiếp xúc/thực hành, không suy ra đã thuộc hay thành thạo ngữ pháp.

Gợi ý cố định theo tài khoản và ngày Việt Nam gồm ôn thẻ đến hạn (hoặc học từ),
shadowing, đọc và viết. Người học có thể chọn bất kỳ hoạt động nào. Phần kiến thức vẫn cập nhật khi tải lại. Video sẵn sàng và
bài đọc chưa làm cùng trình độ được ưu tiên theo số từ trùng với thẻ ôn gần đây;
phạm vi xét là 80 video mới nhất và 80 bài đọc ngắn nhất ở trình độ đó. Nếu chưa
có từ trùng, giao diện nói rõ căn cứ còn hạn chế; không tự gán trình độ cho video.
Nội dung thư viện thiếu sẽ được thông báo và bỏ khỏi lộ trình hôm đó. Tổng thời
lượng gợi ý bằng mục tiêu phút/ngày. Thay đổi thiết lập áp dụng cho lộ trình mới
ngày sau; lộ trình đang làm giữ ổn định.

`POST /api/learning/journey/complete` nhận `date`, `step_id`, cho xác nhận
bất kỳ hoạt động nào trong ngày, gửi lại cùng bước không cộng trùng. Các bước ôn/nghe/đọc do người
học xác nhận; mở bài không tự hoàn thành. Bài viết hoàn thành sau khi nộp thành
công. Tiến độ các bước không được dùng để tăng số thẻ đã ôn hoặc số bài đã nộp.

`POST /api/learning/journey/writing-topic` nhận `date`, tạo đề thật bằng Gemini
qua lớp AI/quota hiện có, dùng trình độ, mục tiêu và tối đa 12 thẻ ôn gần đây.
Đề gồm tiêu đề, yêu cầu và gợi ý dàn ý; lưu riêng trong lộ trình, không đưa vào
kho đề chung. Có lease 90 giây chống tạo trùng và kiểm tra đầu ra trước khi lưu.
Gửi lại trả đề đã lưu; AI lỗi cho thử lại, không thay bằng nội dung giả sinh bởi AI.
Bài viết và bản nháp lưu qua dịch vụ Viết hiện có. Trong màn luyện luôn có nút
quay lại lộ trình, không cần tìm lại tab hoặc bài đang làm.

Migration mới: `b1c2d3e4f5a6` thêm `learning_journeys`. Cần chạy
`venv/bin/flask --app app db upgrade` trước khi dùng endpoint mới.
Kiểm tra backend: `venv/bin/python -m unittest discover -s tests -p test_learning_journey.py -v`.
Kiểm tra frontend: `npx jest __tests__/PersonalLearningHub.test.tsx __tests__/AccountScreen.test.tsx __tests__/ReadingScreen.test.tsx --runInBand`.
