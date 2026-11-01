# Xem NihonGO trên web

Bản web dùng React Native Web và Vite, tái sử dụng màn hình và API của app.
Bản web có bố cục desktop riêng từ 1100 px: sidebar và vùng nội dung responsive; giữ badge trình độ/mục tiêu mỗi ngày.

## Chạy local

Chạy backend ở cổng 5001 với PostgreSQL và cấu hình hiện có. Sau đó:

```sh
cd frontend
npm install
npm run web
```

Mở http://localhost:5173 và đăng nhập bằng tài khoản ứng dụng hiện có.
Vite proxy `/api` và `/static` tới http://127.0.0.1:5001. Nếu backend ở máy/cổng khác:

```sh
VITE_API_PROXY_TARGET=http://127.0.0.1:5002 npm run web
```

Chỉ đặt địa chỉ backend vào biến này, không đặt GEMINI_API_KEY hoặc credentials
trong frontend. Các thao tác thực trên web dùng cùng database với app.
Worker vẫn cần chạy cho các job dịch/nhập video nền.

### Kiểm thử chế độ beta trên máy dev

Source code beta nằm trong repository này; VPS nhận bản sao source và bản build web từ đây. `backend/.env` trên Mac và `backend/.env` trên VPS là **hai file cấu hình riêng**. Hiện file trên Mac chưa bật `BETA_MODE`, còn VPS dùng `BETA_MODE=true` và `BETA_QUOTA_MODE=daily`.

Muốn thử giao diện beta ở local, chuẩn bị PostgreSQL, Redis, LiveKit và tài khoản thử **riêng trên máy dev**; đặt `BETA_MODE=true`, `BETA_QUOTA_MODE=daily`, `BETA_INVITE_EMAILS` và các khóa cần thiết trong `backend/.env` local. File [`.env.example`](../backend/.env.example) là mẫu tên biến; không sao chép `.env` production về máy dev. Sau khi chạy backend/worker local, khởi động web bằng:

```sh
cd frontend
VITE_BETA_MODE=true VITE_BETA_LIVE_MODE=true VITE_BETA_AUDIO_STORAGE_MODE=true VITE_BETA_GAMES_MODE=true npm run web
```

Nếu chỉ làm giao diện hoặc chức năng thường, cứ dùng `npm run web` như trên; các cờ beta không cần bật. Những cờ `VITE_` được đóng vào bản web khi build, còn giới hạn lượt và quyền truy cập được backend kiểm tra khi chạy.

## Build

```sh
npm run web:build
```

Kết quả nằm ở `frontend/dist-web`. Khi deploy cần reverse proxy `/api` và `/static`
đến backend cùng origin và phục vụ SPA index.html. Lệnh `web:preview` chỉ phục vụ
file build, không thay thế backend/reverse proxy production.

## Phần được chuyển cho web

- Nội dung rộng tối đa 1160 px. Desktop có sidebar 240 px và không bị thanh nav
  che nội dung; màn hình hẹp dùng navigation nổi. Font và mascot dùng cùng asset.
- Trang chủ chia khu vực học thành hai cột; form tài khoản giới hạn 480 px. Typography dùng đúng kích thước trong `design.md`, không tăng riêng trên web.
  Shadowing có grid 1–3 cột theo vùng nội dung, form nhập video thu gọn trên desktop,
  video/phụ đề đặt cạnh nhau và dialog AI có chiều rộng vừa đọc.
- Có focus ring cho bàn phím; màu web dùng chung bảng màu trong `design.md` với app.
- Video và nhân vật Aoi sử dụng iframe với bridge thông điệp thay cho native WebView.
  Chỉ nhận message từ iframe của component và đúng origin/channel.
- Audio dùng Web Audio và getUserMedia. Microphone cần localhost hoặc HTTPS;
  trình duyệt có thể yêu cầu thao tác người dùng trước khi phát tiếng.
- Phiên đăng nhập bản preview lưu trong sessionStorage của tab, không phải native
  Keychain. Không lưu API key. Khi đóng tab có thể cần đăng nhập lại. Trước khi
  phát hành web cần thiết kế phiên đăng nhập/cookie phù hợp thay cho adapter preview.
- Adapter thu âm hiện dùng ScriptProcessor; nên chuyển sang AudioWorklet khi
  hoàn thiện bản web production. Native audio của app giữ nguyên.

## Giới hạn kiểm chứng

Build web, TypeScript và kiểm thử app được chạy. Kiểm tra Chrome gồm màn hình đăng
nhập dùng backend local và luồng đăng nhập/home với API fixtures tách biệt, reload
phiên, kích thước mobile, iframe bridge và microphone giả. Chưa kiểm chứng một
phiên hội thoại Gemini thật, OAuth end-to-end hoặc toàn bộ video trên các trình
duyệt khác. Các chức năng này vẫn cần thử bằng tài khoản/thiết bị thực.
