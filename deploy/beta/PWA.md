# NihonGO trên màn hình chính

## Sử dụng trên iPhone

1. Mở `https://momonihongo.app` trong Safari.
2. Chọn **Chia sẻ → Thêm vào màn hình chính**.
3. Nếu có **Mở dưới dạng ứng dụng web**, bật tuỳ chọn này.
4. Giữ tên **NihonGO**, chọn **Thêm**, sau đó mở từ icon Momo trên màn hình chính.
5. Đăng nhập nếu ứng dụng yêu cầu. Trình duyệt và ứng dụng màn hình chính có thể có phiên đăng nhập riêng.

Ứng dụng cần Internet cho video, AI và dữ liệu máy chủ. Bản này không có chế độ offline.

## Phần đã cấu hình

- `frontend/public/manifest.webmanifest`: id, scope và start URL `/`, `display: standalone`, tên và màu nhận diện.
- Icon manifest 192/1024 và Apple Touch Icon 180 dùng lại asset NihonGO hiện có; Vite sao chép public assets vào dist-web.
- Meta iOS: tên NihonGO, web-app-capable và thanh trạng thái mặc định; giữ viewport-fit=cover. Chiều cao giao diện dùng dynamic viewport, điều hướng dưới tiếp tục dùng safe area sẵn có.
- Thẻ hướng dẫn ở Trang chủ chỉ hiện trên trình duyệt iPhone/iPad, ẩn trong standalone; lựa chọn đóng được lưu riêng trên trình duyệt.
- Không thêm service worker, Cache Storage, cơ chế tải sẵn hoặc web push. Không đổi quota hay provider AI.

## Kiểm tra sau triển khai

- `/manifest.webmanifest` trả JSON và các icon trả PNG; không trả trang index HTML thay cho file thiếu.
- Thêm từ Safari vào màn hình chính và xác nhận tên/icon, mở không có thanh địa chỉ, không hiện hướng dẫn cài đặt.
- Kiểm tra trên iPhone thật: đăng nhập/OTP, mở lại app, điều hướng, bàn phím/ô nhập, video có phụ đề, micro và phát giọng Live, lưu/phát lại bản thu.
- Kiểm tra cả máy có phần khuyết camera/home indicator và đổi chiều màn hình. Mô phỏng kích thước/standalone trong trình duyệt không thay thế kiểm thử micro/âm thanh và cài đặt trên iPhone thật.

Nguồn: https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/

Hướng dẫn Apple: https://support.apple.com/guide/iphone/iphea86e5236/ios
