# Kế hoạch beta NihonGO

**Cập nhật 01/11/2026.** Web đang chạy tại <https://momonihongo.app>. Chỉ các email trong danh sách mời mới đăng ký được. Backend dùng Vertex AI cho tác vụ AI thông thường và Gemini Developer API cho hội thoại Live.

## Giới hạn sử dụng

| Tính năng | Mỗi tài khoản | Cách tính |
| --- | ---: | --- |
| Xử lý hoặc dịch video mới | 1 video/ngày | Một video YouTube mới được xử lý hoặc yêu cầu dịch trong ngày. Thử lại cùng video và xem kết quả đã lưu không dùng thêm lượt. |
| Nói trực tiếp với Aoi | 2 phiên/ngày | Mỗi phiên tối đa 4 phút từ khi mở kết nối; tối đa 2 phiên đồng thời trên toàn hệ thống. Kết nối thất bại trước khi Gemini xác nhận phiên được hoàn lượt. |

Ngày được tính theo **Asia/Ho_Chi_Minh**, đặt lại lúc 00:00. Các chức năng tra cứu, đọc, viết, học từ vựng và hội thoại theo lượt không bị giới hạn bằng số USD trong ứng dụng. API vẫn có giới hạn tốc độ và độ dài đầu ra để tránh quá tải. Quota này là giới hạn sử dụng của sản phẩm, không phải trần thanh toán của Google Cloud hay AI Studio.

## Trạng thái triển khai

- [x] VPS, HTTPS, PostgreSQL, hàng đợi, worker, Brevo và danh sách mời tối đa 50 email.
- [x] Quota video và Live lưu trên PostgreSQL, kiểm tra ở backend, hiển thị số lượt còn lại ở trang Cá nhân.
- [x] Gateway Live giữ API key ở backend; kiểm thử WebSocket qua domain bằng tài khoản tạm đã nhận `setupComplete` và được xóa sau kiểm thử.
- [x] Web đã bật Nói Live; người dùng xác nhận Aoi đáp bằng giọng trên Chrome.
- [x] Backup database và volume âm thanh hằng ngày trên VPS; bản ngày 01/11 đã sao về Mac và đối chiếu checksum.
- [x] Bật lưu/nghe lại âm thanh; kiểm thử upload và phát lại WAV bằng dữ liệu tạm trên backend production.
- [x] Bật game nhiều người và giọng nói. DNS, HTTPS, Redis, LiveKit và voice worker đã chạy; hai người chơi tạm nhìn thấy nhau, và worker đã tham gia phòng Đọc tạm.
- [x] Người dùng xác nhận phát lại bản thu trên Chrome; hai tài khoản thật nghe thấy nhau và điểm game Đọc cập nhật.
- [ ] Kiểm tra lại luồng video không có phụ đề nếu muốn mở đầy đủ Whisper cho người dùng beta.
- [ ] Mời người dùng trong giới hạn 50 email; thử đồng thời 2 rồi 5 người, xem log lỗi và tốc độ máy.

## Kiểm thử trước khi mời đủ người

1. Đăng nhập bằng email được mời; thử tra cứu, đọc, viết và học từ vựng.
2. Gửi một video có phụ đề, xem trạng thái và bản dịch; video thứ hai trong cùng ngày phải bị chặn, còn video đầu tiên vẫn xem được.
3. Trong Nói, mở Live, nói bằng micro và nghe Aoi đáp. Kết thúc sau 4 phút; phiên thứ ba cùng ngày phải bị chặn. Nếu kết nối thất bại trước khi bắt đầu, lượt phải được hoàn.
4. Kiểm tra trang Cá nhân hiển thị lượt còn lại; kiểm tra lại sau 00:00 giờ Việt Nam.
5. Thử khôi phục PostgreSQL và archive âm thanh từ bản backup; định kỳ sao bản backup ra ngoài VPS.

Game dùng `https://voice.momonihongo.app` cho kết nối LiveKit. Hạ tầng đã kiểm thử bằng hai người chơi tạm; người dùng cũng đã xác nhận micro và chấm điểm với hai tài khoản thật.

## Vận hành

- Dùng `python3 deploy/beta/manage_invites.py --add` trên VPS để thêm email; khởi động lại backend và worker sau khi đổi danh sách.
- Dùng `python3 deploy/beta/set_quota_mode.py daily` để chọn quota theo ngày. Production hiện ở chế độ `daily`.
- Dùng `python3 deploy/beta/set_live_mode.py on|off`, rồi khởi động lại backend để mở hoặc tạm dừng Live.
- Giữ API key và JSON service account ở VPS, không đưa vào Git hay tin nhắn. Theo dõi billing của cả Vertex và Gemini Developer API riêng vì số lượt trong app không tự dừng hóa đơn provider.
