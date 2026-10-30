# Web routing

Web dùng React Router (BrowserRouter), URL bắt đầu từ `/`. Native giữ cơ chế điều hướng hiện tại; router web được nạp qua `AuthenticatedScreen.web.tsx` và `web/WebRouter.tsx`.

| Khu vực | URL |
| --- | --- |
| Trang chủ | `/` |
| Đăng nhập / đăng ký | `/login`, `/register` |
| Khôi phục tài khoản | `/forgot-password`, `/verify`, `/reset-password` |
| Thiết lập học tập | `/onboarding`, `/profile/learning` |
| Luyện tập | `/practice` |
| Shadowing | `/practice/listening`, `/practice/listening/:videoId` |
| Hội thoại | `/practice/speaking`, `/practice/speaking/new`, `/practice/speaking/scenarios/:scenarioId`, `/practice/speaking/sessions/:sessionId` |
| Luyện đọc | `/practice/reading?level=N5&type=short&page=1`, `/practice/reading/:passageId` |
| Luyện viết | `/practice/writing` |
| Bài học từ vựng | `/lessons?level=N5`, `/lessons/:lessonId?level=N5` |
| Tra cứu | `/lookup?q=学校`, `/lookup/videos?q=学校`, `/lookup/words/:wordId`, `/lookup/kanji/:literal` |
| Flashcard | `/flashcards?kind=custom`, `/flashcards/review`, `/flashcards/sessions/:sessionId` |
| Biên tập bộ thẻ | `/flashcards/new`, `/flashcards/decks/:deckId/edit` |
| Thử thách | `/flashcards/quiz` |
| Game từ vựng | `/games`, `/games/:code` |
| Cá nhân / lộ trình | `/profile`, `/plan` |

Các bộ lọc, truy vấn và phân trang được giữ trong query string. URL không tồn tại hiển thị trang 404 trong ứng dụng. Thanh điều hướng hỗ trợ Back/Forward và mở link trong tab mới.

Dịch câu nằm trong tab Từ vựng, dùng chung URL `/lookup?q=...`. Sau khi gửi tìm kiếm, mục từ khớp chính xác được ưu tiên; truy vấn giống câu sẽ hiển thị thẻ dịch ngay tại chỗ. `/lookup/translate` cũ chuyển về `/lookup`.

## Xác thực và khôi phục

- Link cần đăng nhập chuyển tới `/login?returnTo=...`; đăng nhập xong trở lại URL nội bộ hợp lệ. Tài khoản chưa thiết lập học tập đi qua onboarding trước.
- Tải lại link chi tiết sẽ đọc lại dữ liệu từ API, bao gồm phiên flashcard, bộ thẻ, bài học và phòng game. Quyền truy cập vẫn được kiểm tra ở backend.
- Mở link phòng game: thành viên cũ tải trạng thái phòng; người chưa tham gia được thử tham gia theo quy tắc hiện có của backend.
- Bản nháp chưa lưu không được giữ qua F5. Luồng OTP cần challenge trong bộ nhớ; F5 tại `/verify` hoặc `/reset-password` sẽ trở về bước yêu cầu mã tương ứng. Không đưa mật khẩu, token hay mã OTP vào URL.

## Chạy và triển khai

Chạy `npm run web` để thử ở `http://localhost:5173`. Vite dev server đã hỗ trợ history fallback và proxy `/api`, `/static`, `/socket.io` tới backend.

Chạy `npm run web:build` tạo `dist-web/`. Khi phục vụ bản build, cần cấu hình history fallback: những URL giao diện như `/games/ABC234` phải trả `index.html`, còn API và tài nguyên phải được xử lý riêng. File `nginx.conf` là cấu hình mẫu:

1. Chép nội dung `dist-web/` vào `/usr/share/nginx/html` hoặc đổi `root`.
2. Đổi upstream `nihongo_api` theo địa chỉ backend thực tế. Trong Docker, `127.0.0.1` chỉ đúng nếu backend chạy cùng network namespace; thông thường dùng tên service backend.
3. Đặt file trong phần cấu hình `http` của Nginx (ví dụ `/etc/nginx/conf.d/default.conf`), chạy `nginx -t` trước khi reload. Cấu hình HTTPS/tên miền theo môi trường triển khai; các chức năng microphone cần secure context.

Không rewrite `/api`, `/static`, `/socket.io` hoặc `/assets/` sang HTML. Cấu hình mẫu chưa tự động được triển khai lên máy chủ. Nếu host dưới một đường dẫn con, cần cấu hình thêm `basename`, Vite `base` và các URL điều hướng tương ứng; hiện tại ứng dụng phục vụ tại `/`.

## Khi bấm tab mà URL không đổi trong môi trường dev

Nếu thêm file nền tảng như `AuthenticatedScreen.web.tsx` khi Vite đã chạy, Vite có thể vẫn giữ kết quả phân giải tới `AuthenticatedScreen.tsx` cũ. Khởi động lại Vite (`Ctrl+C`, sau đó `npm run web`) rồi tải lại trang. Nếu chạy nhiều cổng frontend, kiểm tra từng cổng đang phục vụ đúng bản web có router.
