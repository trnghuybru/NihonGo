# Luyện viết

Các đề mặc định dùng tiếng Nhật theo N5–N3. Tiêu đề, yêu cầu và gợi ý đồng bộ theo ID; đề tự tạo và bài viết được giữ nguyên.

## Tiêu chí nhận xét (version 1)

| Tiêu chí (tối đa 25 điểm) | Các mục nhỏ (0–5 điểm/mục) |
| --- | --- |
| Đáp ứng đề bài | Đúng chủ đề; phát triển ý/ví dụ; hình thức/độ dài theo đề |
| Tổ chức và liên kết | Trình tự ý; liên kết câu/ý; bố cục theo dạng bài |
| Ngữ pháp | Độ chính xác; cấu trúc phù hợp trình độ; dấu câu/kết thúc câu |
| Từ vựng và chính tả | Vốn từ; dùng từ; Kana/Kanji/chính tả |

Điểm tiêu chí = trung bình ba mục × 5, làm tròn tới số nguyên (0,5 làm tròn lên). Tổng điểm = tổng bốn tiêu chí. Đây là điểm luyện tập theo đề và JLPT mục tiêu. N5 không yêu cầu bố cục luận văn, Kanji hoặc ngữ pháp nâng cao. Độ dài chỉ nhận xét theo yêu cầu thực tế của đề. Bài tự do gửi `level` từ hồ sơ; chấm lại dùng trình độ đã lưu.

Mỗi lần nộp/chấm lại gọi AI một lần, trả cả tiêu chí, tối đa 6 gợi ý sửa ưu tiên và một bài tập tiếp theo. Giới hạn output 4096 token, không tự thử lại. Nhận xét/giải thích tiếng Việt; đoạn trích và đề xuất sửa tiếng Nhật.

Backend kiểm tra đầy đủ tiêu chí, điểm 0–5 và từng đoạn trích. Đoạn trích phải khớp duy nhất với bản gốc, không chồng nhau. Bản sửa dựng từ các đoạn hợp lệ, không có thay đổi ngoài danh sách. Offset `start`/`end` là số Unicode code point, end không bao gồm ký tự tại vị trí đó. Web dùng `Array.from` để xử lý đúng emoji. `kind` phân biệt lỗi thật và gợi ý phong cách.

`writing_submissions.assessment` lưu JSON nullable qua migration `bc4d5e6f7182`. API giữ `score`, `corrected_text`, `feedback`. Bài cũ có assessment null hiển thị nhận xét cũ; người dùng chủ động chọn Phân tích lại bằng AI để có bộ tiêu chí mới. Không tự chấm lại dữ liệu cũ.

## Giao diện

Trước khi viết có danh sách tiêu chí. Màn kết quả có Chỉnh sửa / Bản gốc / Đã sửa; đoạn bỏ gạch ngang màu đỏ, đoạn đề xuất gạch chân màu xanh. Bấm đoạn sửa hoặc số thứ tự để xem nguyên nhân và quy tắc; có nút trước/sau. Điểm tiêu chí có thể mở chi tiết các mục nhỏ. Desktop đặt giải thích cạnh bài; màn hẹp xếp dọc.

## Kiểm tra

```sh
cd backend
venv/bin/python -m unittest tests.test_writing tests.test_writing_rubric tests.test_beta_ai -q
```

Các test dùng provider giả, không gọi AI thực tế. Frontend kiểm tra `WritingAssessmentView`, `WritingScreen` và timeout trong `writingService`.


## Workspace web/PWA

Web/PWA dùng `WritingWorkspaceScreen`: thư viện đề/nháp/bài đã nộp và vùng làm bài trong cùng một trang. Nộp bài, nhận xét, chỉnh sửa và so sánh không đổi route. Điện thoại dùng sheet cho thư viện và giải thích.

`useWritingDocuments` tự lưu sau 1,5 giây ngừng gõ, tối thiểu 4 ký tự theo API hiện có. Lưu được tuần tự hóa theo từng tài liệu; nếu chữ thay đổi trong lúc đang lưu, lưu tiếp bản mới bằng draft ID đã nhận. Không ghi đè ô nhập từ phản hồi lưu. Đổi đề hoặc rời workspace sẽ cố lưu phần còn lại. Lỗi không tạo vòng tự thử lại; có nút Lưu nháp để thử lại. Chỉ bản lưu thành công trên server tồn tại sau khi tải lại trang.

Sau nộp thành công, người dùng xem nhận xét tại chỗ và có thể quay lại chỉnh sửa; bài đã nộp không bị thay đổi. Nộp nội dung đã được chấm chuyển thành Xem nhận xét đã có để tránh gọi AI trùng. Chấm lại vẫn cần thao tác chủ động. Trong khi AI chấm, khóa đổi tài liệu để không gắn nhầm kết quả.


## Thư viện đề

Lần đầu vào web hiển thị thư viện, chưa có tài liệu hay giấy viết cho tới khi người dùng chủ động chọn đề/nháp/bài nộp hoặc Viết tự do. Sau khi chọn, web mở lại thư viện bằng nút Đổi đề; Bản nháp và Đã nộp mở các tab cùng modal. Chọn đề giữ bộ đệm nháp, không chuyển route. Tìm kiếm debounce 300 ms; lỗi có Thử lại, không gọi AI.

`GET /api/writing/prompts?page=1&level=N5&category=daily&q=...` phân trang trên server, tối đa 12 đề/trang. Kết quả có `items`, `categories`, `pagination` (`page`, `per_page`, `total`, `has_more`). Tìm literal trong tên/yêu cầu; bỏ đề `custom` khỏi thư viện chung. Không truyền `page` giữ API cũ cho native.

`writing_prompts.category` thêm qua migration `cd5e6f718293` (sau `bc4d5e6f7182`), mặc định `daily`, các nhóm `daily`, `study`, `work`, `society`. Seed cập nhật nhóm cho đề mặc định theo ID, giữ dữ liệu nháp/bài nộp. Chạy migration trước khi dùng backend mới. Đề tạo mới cần chọn nhóm phù hợp.
