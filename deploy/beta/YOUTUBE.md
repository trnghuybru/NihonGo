# YouTube trên VPS

Nếu worker báo `source_blocked`, YouTube đã yêu cầu xác nhận bot hoặc giới hạn truy cập từ địa chỉ máy chủ. Không phải lỗi Gemini. Cập nhật yt-dlp không bảo đảm khắc phục được giới hạn này.

## Thử cookie trước khi dùng proxy

- Xuất chỉ cookie YouTube theo định dạng Netscape, dùng tài khoản riêng. Không commit/gửi nội dung file vào chat.
- Lưu ở `/opt/momonihongo/deploy/beta/secrets/youtube-cookies.txt`, quyền `600`. Thư mục secrets đã được mount read-only trong container.
- Đặt `SHADOWING_YOUTUBE_COOKIE_FILE=/run/vertex-secrets/youtube-cookies.txt` trong `backend/.env` trên VPS.
- Worker sao chép cookie vào thư mục tạm riêng của job (quyền `600`), dùng cho yt-dlp và request phụ đề, rồi supervisor xoá thư mục sau khi xử lý. Không cho yt-dlp ghi ngược lên file secrets.
- Cookie không bảo đảm khắc phục việc IP VPS bị chặn. Cookie có thể hết hạn; yt-dlp cảnh báo nguy cơ tài khoản bị hạn chế. Kiểm tra một video trước, không retry hàng loạt.
- Tái tạo worker sau khi đổi env bằng lệnh trong mục dưới. Beta chỉ lấy metadata/phụ đề, không yêu cầu có format audio tải xuống.

## Tiếp tục thêm video trên web với proxy

- Cần một HTTP/HTTPS proxy do quản trị viên cung cấp và được phép truy cập YouTube. Không tự mua dịch vụ hoặc dùng proxy công khai không rõ nguồn.
- Đặt `SHADOWING_YOUTUBE_PROXY` trong `backend/.env` trên VPS: URL đầy đủ gồm scheme, host, port và thông tin xác thực nếu có. Không đưa URL chứa mật khẩu vào chat/Git/log.
- Worker dùng cùng proxy cho metadata và tải phụ đề. Không đổi đường gọi Gemini/Vertex hoặc quota người dùng.
- Sau khi triển khai code, tái tạo worker để nhận env mới: `docker compose --env-file backend/.env -f compose.beta.yaml up -d --no-deps --force-recreate shadowing-worker`.
- Thử một video công khai có phụ đề tiếng Nhật. Proxy cũng có thể bị YouTube chặn; cần kiểm thử trước khi cam kết dịch vụ.
- Không tự động thử lại hàng loạt các job thất bại. Chỉ thử lại job cần kiểm tra sau khi cấu hình nguồn đã hoạt động.

## Chẩn đoán

Worker chỉ ghi mã lỗi, không ghi URL proxy/cookie hoặc đường dẫn phụ đề có chữ ký. `source_configuration` là proxy sai định dạng; `source_blocked` là yêu cầu xác nhận bot/429; `source_unavailable` là lỗi lấy nguồn khác.

Các bài đã có phụ đề trong thư viện vẫn dùng được. Có thể chuẩn bị dữ liệu phụ đề trên máy quản trị rồi nhập lên VPS theo công cụ import hiện có; cách này không khôi phục thêm video tự động trên web.

Tham khảo: https://github.com/yt-dlp/yt-dlp/wiki/Extractors
