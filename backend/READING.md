# Luyện đọc

Phạm vi hiện tại: UC-R1–UC-R5 (danh sách, lọc, mở bài, furigana, tra nhanh), UC-R8 (làm câu hỏi) và UC-R9 (chấm điểm). Có UC-R7 (tips), UC-R10 (giải thích đáp án), UC-R11 + UC-R12 (phân tích bài đọc gộp). Chưa triển khai bản dịch toàn bài riêng.

## Dữ liệu

CSV được lưu ở `data/reading/JLPT_Dokkai_N5-N1.csv`: 368 dòng câu hỏi, nhóm thành 180 đoạn theo trình độ/tên bài/số đoạn/nguồn. N5: 46; N4: 45; N3: 23; N2: 12; N1: 54. Không gộp hai đoạn chỉ vì trùng nội dung khi mã nguồn khác nhau.

```bash
venv/bin/flask --app app db upgrade
venv/bin/flask --app app reading-import data/reading/JLPT_Dokkai_N5-N1.csv --dry-run
venv/bin/flask --app app reading-import data/reading/JLPT_Dokkai_N5-N1.csv
```

Dry run chỉ kiểm tra file. Import xác thực toàn bộ trước khi ghi; dùng ID ổn định, cập nhật khi chạy lại, không nhân bản và không xóa bài khác. Toàn bộ import chạy trong một transaction. Giữ nguyên văn bản và xuống dòng; chỉ chuẩn hóa CRLF/CR thành LF.

Báo cáo import liệt kê `answer_mismatch_lines` (số dòng CSV gồm dòng tiêu đề): 27 dòng có nội dung đáp án khác lựa chọn đã đánh dấu. Giữ nguyên dữ liệu đó trong cột JSON nội bộ và không tự sửa đáp án. Phần đọc hiểu loại 27 câu không khớp đáp án khỏi bộ câu hỏi công khai và chấm điểm; hiện có 341 câu hợp lệ trong 166 bài. 14 bài không có câu hợp lệ vẫn đọc và tra từ bình thường, không hiện phần bài tập.

## API

Tất cả endpoint giữ xác thực Bearer của dự án.

- `GET /api/reading/passages?level=N5&type=short&q=学校&page=1&page_size=12`
- `GET /api/reading/passages/:id`
- `POST /api/reading/passages/:id/attempts`

Level trống nghĩa là tất cả. Dạng bài: `short`, `medium`, `long`, `information`, `opinion`. Truy vấn tối đa 100 ký tự; page từ 1–10000, page_size từ 1–40. Danh sách có phân trang và metadata dạng bài; chi tiết có văn bản, từng dòng token và metadata từ (không nạp trước toàn bộ nghĩa).

Bộ phân tích Sudachi hiện có tạo cách đọc/dạng gốc. Cache lưu trong bảng `reading_passages`, làm mới khi nội dung hoặc phiên bản phân tích thay đổi. Furigana là dữ liệu phân tích tự động; có thể cần biên tập riêng cho tên riêng/cách đọc theo ngữ cảnh trong tương lai.

Frontend dùng popup từ điển chung. Nghĩa chỉ tải khi bấm từ, từ đã tra đi vào lịch sử từ điển chung. Công tắc furigana lưu theo tài khoản: localStorage trên web, Keychain trên native. Tra từ và furigana không gọi Gemini. Phần phân tích/giải thích dùng Gemini theo yêu cầu, qua cấu hình GEMINI_API_KEY hiện có.

## Kiểm tra

```bash
venv/bin/python -m unittest discover -s tests -p test_reading.py -v
```

Các kiểm tra dùng SQLite cô lập; không xóa hay ghi dữ liệu tài khoản thực.

## Làm câu hỏi và chấm điểm (UC-R8–UC-R9)

Chi tiết bài đọc có `quiz: {version, questions, last_attempt}`. Mỗi câu công khai chỉ có `id`, `text`, `options`; không trả đáp án trước khi nộp. Câu có đáp án thiếu/sai kiểu/không khớp nội dung lựa chọn bị loại. Không sinh câu hỏi, giải thích hoặc đáp án bằng AI.

Frontend trên web desktop đặt bài đọc bên trái và Đọc hiểu bên phải, hai cột cuộn độc lập; màn hẹp/native xếp bài đọc rồi câu hỏi. Lựa chọn được giữ khi đổi kích thước cửa sổ. Cho chọn một đáp án mỗi câu và đổi lựa chọn trước khi nộp. Nút Nộp bài chỉ bật khi trả lời đủ. Backend yêu cầu đúng tập ID câu hỏi, chỉ số lựa chọn nguyên từ 0, từ chối bool/chuỗi/chỉ số ngoài phạm vi. Mỗi câu có trọng số bằng nhau: `score = round(correct / total * 100, 1)`.

Ví dụ request:

```json
{"request_id":"c31cafcc-d786-4ee6-905f-f967ed3cb7da","version":"<quiz.version>","answers":{"q1":0,"q2":2}}
```

Response gồm `id`, `version`, `submitted_at` (epoch ms), `correct`, `total`, `score` (0–100), `results`. Mỗi result có câu hỏi/lựa chọn, `selected_index`, `correct_index`, `correct`. Điểm luôn tính ở backend; không sử dụng điểm client gửi. Trả 201 khi lưu mới; gửi lại cùng request ID và bài làm trả kết quả cũ, không nhân bản. Request ID đã dùng với bài làm khác trả 409. Trường hợp nội dung/câu hỏi thay đổi, phiên bản cũ trả 409 yêu cầu tải lại.

Bảng `reading_attempts` lưu snapshot kết quả theo tài khoản, có khóa ngoại CASCADE và unique `(user_id, request_id)`. GET chi tiết chỉ phục hồi bài làm gần nhất của chính tài khoản và đúng phiên bản hiện tại. Làm lại xóa lựa chọn/kết quả đang hiển thị, lần nộp kế tiếp tạo lượt mới. Lỗi mạng giữ lựa chọn và request ID để nộp lại an toàn. Bài tập độc lập với flashcard, game và SRS.

Kiểm thử backend bao gồm chấm đúng/sai, dữ liệu không hợp lệ, nguồn lỗi đáp án, chống nộp trùng, phiên bản thay đổi, xác thực và tách kết quả từng tài khoản. Frontend kiểm tra khóa nộp khi chưa đủ câu, chỉ hiện đáp án sau chấm, khôi phục kết quả, làm lại, thử lại lỗi mạng và chặn bấm nộp liên tiếp.

## Tips, giải thích và phân tích (UC-R7, UC-R10–UC-R12)

Phương pháp gốc lưu ở `reading/resources/reading-skill.md` (bản người dùng cung cấp); `study_prompts.py` chắt lọc quy tắc và chỉ thêm hướng dẫn phù hợp từng tác vụ. Không gửi nguyên tài liệu hoặc toàn bộ ví dụ vào mỗi request. Tips là thư viện điểm cố định trong `ReadingTips.tsx`, chọn tối đa 3 điểm theo dấu hiệu đơn giản như từ nối, ô trống; mở tips hoặc đổi chế độ không gọi AI.

- `POST /api/reading/passages/:id/analysis`: tóm tắt tiếng Việt 1–2 câu, mạch bài, từ vựng và ngữ pháp. Cấu trúc chi tiết tạo riêng khi người học chọn câu; không sinh trước cho cả bài.
- `POST /api/reading/passages/:id/sentences/:sentenceId/analysis`: phân tích riêng một câu khi người học chọn câu chưa có trong phân tích đã tải.
- `POST /api/reading/passages/:id/questions/:questionId/explanation`, JSON `{"attempt_id":"…"}`: giải thích đáp án và bằng chứng, chỉ mở sau bài làm đã được chấm của chính tài khoản, đúng phiên bản nội dung hiện tại. Kết quả đã có trong DB vẫn kiểm tra quyền xem trước khi trả.

Phần phân tích bài/câu chỉ nhận nội dung nguồn và trình độ, không nhận câu hỏi hay đáp án. Phần giải thích đáp án nhận câu hỏi hợp lệ và đáp án nguồn từ backend; model không được thay điểm/đáp án khi chấm. Nếu AI thấy đáp án nguồn chưa đủ bằng chứng, trả `answer_supported=false` và caution để người học nhận biết nghi vấn. Không tự sửa bài gốc hoặc 27 đáp án nguồn đang bị loại khỏi chấm điểm.

Gemini dùng JSON Schema, kiểm tra response hoàn chỉnh (`STOP`), bỏ phần thinking, rồi chuẩn hóa/giới hạn chuỗi và số mục ở backend. Mỗi bằng chứng, mục từ vựng, ngữ pháp và thành phần câu phải có sentence ID hợp lệ và quote nguyên văn trong đúng câu. Backend suy ra paragraph và khoảng UTF-16 dùng cho web; không tin offset do AI tự đưa. Trích sai bị từ chối và thử lại một lần; không lưu dữ liệu lỗi. UI highlight theo token giao với khoảng trích, giữ furigana và tra nhanh.

`reading_insights` lưu kết quả đã chuẩn hóa trong DB, không cache nội dung qua một danh sách RAM chung. Khóa `(passage_id, kind)`, fingerprint gồm nội dung, trình độ, câu hỏi (chỉ khi giải thích), phiên bản hợp đồng dữ liệu và hash bộ skill; đổi nguồn thì kết quả cũ không được dùng. Lease 120 giây chống gọi trùng giữa process, không giữ row lock trong lúc chờ mạng, request lỗi giải phóng lease để thử lại. Giới hạn 12 lượt tạo mới/tài khoản/phút; xem lại kết quả đã lưu không gọi AI. Giới hạn nguồn 16.000 ký tự/300 câu chỉ áp dụng AI, không cản đọc bài gốc.

Cấu hình dùng `GEMINI_API_KEY`, tùy chọn `READING_AI_MODEL` trong `.env.example`, mặc định `gemini-3.5-flash-lite` riêng cho phần Đọc. Giữ nguyên model các tính năng khác. Tham khảo [model](https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash-lite) và [structured output](https://ai.google.dev/gemini-api/docs/structured-output). Frontend timeout 90 giây; backend tổng thời gian gọi khoảng 65 giây, tối đa 2 lần thử, có lỗi cấu hình, bận, kết quả không hợp lệ và thử lại. GET bài đọc chỉ trả danh sách câu và phân tích đã có; không tự gọi AI.

UI desktop giữ bài trái, nội dung hỗ trợ phải với tab Câu hỏi/Phân tích và Tips thu gọn. Chế độ Nguyên bản giữ cách đọc cũ; chế độ Phân tích đánh số câu, chọn câu để xem lõi S–V–O, các lớp rút gọn, nghĩa và phần bổ nghĩa. Từ/ngữ pháp trong panel và bằng chứng trong giải thích có thể bấm để chuyển highlight và cuộn tới đúng chỗ. Các mục có thể thu gọn; đổi tab giữ bài làm, đổi chế độ vẫn tra từ được. Mobile xếp dọc, không kéo ngang.

Kiểm thử: `venv/bin/python -m unittest discover -s tests -p 'test_reading*.py' -v`; frontend `ReadingStudy.test.tsx`, `ReadingScreen.test.tsx`, `ReadingQuiz.test.tsx` và các kiểm thử Shadowing/Từ điển dùng chung renderer.

## Tối ưu token và cấu trúc câu thu gọn

- Trên cùng bài thử 232 ký tự, `countTokens` đo tổng đầu vào (kể cả schema) từ 9.212 xuống 621 token, giảm khoảng 93%. Đây là token đầu vào, không phải phần trăm giảm tổng tiền: chi phí còn có đầu ra, thinking và lượt thử lại. Không tính đây là mức cố định cho mọi bài.
- Mỗi request chỉ gửi nội dung một lần qua danh sách câu với `paragraph_id` để giữ đúng người nói. Tác vụ câu chỉ gửi câu đích, hai câu xung quanh và câu mở đầu lượt nói; không lặp cả bài ở dạng text + paragraphs + sentences. Tóm tắt toàn bài dùng `minimal`; phân tích câu dùng `low` để phân biệt chủ ngữ chính với chủ ngữ trong mệnh đề phụ.
- Phân tích toàn bài mới không tạo cấu trúc câu hàng loạt (`sentences: []`); khi chọn câu mới gọi endpoint câu. Bản phân tích/giải thích hợp lệ đã lưu vẫn dùng lại sau tối ưu prompt. Riêng hợp đồng câu mới có phiên bản 4, nâng cấp khi người học yêu cầu; không gọi lại tất cả bài để chuyển đổi dữ liệu.
- Response câu có `segments`: từng phần gồm text nguyên văn, role (`subject`, `predicate`, `object`, `modifier`, `adjunct`, `other`), `is_core`, giải thích và location do server suy ra. Các segment phải nối lại đúng toàn bộ câu gốc, theo đúng thứ tự, không thêm/bớt ký tự. Từ chối chủ ngữ trong mệnh đề phụ bị gán thêm vào lõi hoặc mất tần suất quan trọng như いつも. Luôn phải có vị ngữ chính trong lõi.
- `core_text` được server nối từ các segment cốt lõi; `core_translation_vi` là bản dịch riêng của lõi, `translation_vi` là nghĩa đầy đủ. Dữ liệu S/V/O, layers và parts tương thích client cũ được suy ra từ segment, không yêu cầu AI lặp lại nhiều lần.
- UI mặc định thu gọn, không có ba tab. Bấm chip hiện vai trò và đoạn Nhật, không hiện lời giải thích tiếng Việt riêng cho thành phần. Nút **Đầy đủ câu** mở mọi phần và hiện nghĩa đầy đủ; mở hết các chip cũng tự chuyển nghĩa tương ứng. **Thu gọn câu** hoặc đóng một phần đưa về nghĩa lõi. Các thao tác này không gọi thêm AI.
