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

Worker chỉ ghi mã lỗi, không ghi URL proxy/cookie hoặc đường dẫn phụ đề có chữ ký. `source_configuration` là proxy sai định dạng; `source_blocked` là yêu cầu xác nhận bot hoặc tải phụ đề bị từ chối; `source_rate_limited` là HTTP 429; `captions_unavailable` là có track nhưng tải phụ đề lỗi/rỗng; `source_unavailable` là lỗi lấy nguồn khác.

Các bài đã có phụ đề trong thư viện vẫn dùng được. Có thể chuẩn bị dữ liệu phụ đề trên máy quản trị rồi nhập lên VPS theo công cụ import hiện có; cách này không khôi phục thêm video tự động trên web.

Tham khảo: https://github.com/yt-dlp/yt-dlp/wiki/Extractors

## Đợt nhập The Bite Size Japanese Podcast

- Playlist: `PLQcOOIxIw8dIZFPPnHzSBoCFXVPqBhYjP`.
- Công cụ vận hành: `deploy/beta/import_youtube_playlist.py` (chạy trong image backend đã có cookie).
- Giới hạn: 100 video **mới**, thời lượng thực tế **< 1800 giây**. Video đã có, đang xử lý hoặc không có phụ đề Nhật không tính vào 100 video mới.
- Chỉ metadata/phụ đề Nhật gốc, ưu tiên manual; không tải audio, chạy ASR, dịch, tạo quiz hoặc trừ quota người dùng.
- VPS lưu manifest, snapshot và report tại `/opt/momonihongo/imports/bitesize-under30/`; service `nihongo-import-bitesize.service` chạy tác vụ riêng.
- Xem tiến độ: `sudo systemctl status nihongo-import-bitesize` hoặc đọc `report.json` trong thư mục trên. Nếu `status=paused`, xử lý `stop_reason` trước khi chạy tiếp; không tự lặp lại nguồn đang chặn.
- Có thể chạy lại cùng manifest/output với `--max-imports 100 --max-seconds 1800 --delay 60`: công cụ giữ tiến độ và bỏ các mục đã xử lý.
- Các file JSON là nội dung video công khai; cookie vẫn ở thư mục secrets riêng, không nằm trong báo cáo hoặc snapshot.

### Khi YouTube giới hạn tải phụ đề

- Không coi HTTP 429, 401/403, lỗi mạng hoặc nội dung phụ đề rỗng là “không có phụ đề”. Importer dừng ngay khi gặp các lỗi nguồn tạm thời, giữ nguyên video để thử lại sau; không quét tiếp cả playlist.
- Mặc định nghỉ 60 giây giữa các video cần lấy dữ liệu. Đây là biện pháp giảm tải, không bảo đảm tránh giới hạn từ YouTube.
- `--retry-skipped-captions` sao lưu báo cáo cũ và đưa các mục từng bị gắn nhầm `captions_required` về danh sách cần kiểm tra, giữ nguyên video đã nhập và video vượt giới hạn thời lượng.
- Exit 75: HTTP 429 hoặc phụ đề tạm chưa tải được, có thể lên lịch thử lại sau thời gian nghỉ. Exit 2: nguồn chặn hoặc cấu hình sai, cần kiểm tra trước khi chạy lại. Chỉ `status=complete` với `target_reached` mới là đã đủ mục tiêu; hết playlist nhưng chưa đủ là `exhausted`.
- Không tự xoá 13 video đã nhập thành công và không trừ lượt sử dụng của người dùng khi nhập theo công cụ quản trị.
