# Dịch câu trong Tra cứu (bản thử)

Model: `facebook/m2m100_418M`, revision `55c2e61`, metadata giấy phép MIT trên [repository của Meta](https://huggingface.co/facebook/m2m100_418M). Chỉ chạy inference, không train và không gọi Gemini. Checkpoint chính thức FP32 khoảng 1,94 GB (dung lượng file tải, không phải RAM tối đa khi chạy).

## Cài và chạy

```bash
venv/bin/pip install -r requirements.txt
venv/bin/flask --app app translation-download
```

Model nằm trong `backend/models/translation/m2m100_418M/`, không đưa vào git hoặc frontend. CLI tải snapshot theo revision cố định. Có thể cấu hình `TRANSLATION_MODEL_PATH`; `TRANSLATION_DEVICE=auto` ưu tiên CUDA → MPS → CPU, hoặc đặt `cpu`/`mps`/`cuda`.

Service không tải model từ Internet trong request. Lần dịch đầu tiên nạp checkpoint cục bộ vào bộ nhớ, các lần sau tái sử dụng cùng instance trong process. `weights_only=True`, `local_files_only=True`, không chạy remote model code. Dùng `eval()` và `torch.inference_mode()`; khóa cả tokenizer (src_lang thay đổi) lẫn model để hai chiều dịch không ghi đè trạng thái nhau.

## API và giới hạn

`POST /api/dictionary/translate`, giữ Bearer authentication và JSON error của dự án:

```json
{"text":"学校へ行きます。","source":"ja","target":"vi"}
```

Trả `text`, `translation`, `source`, `target`, `model`, `cached`, `elapsed_ms`. Chỉ hỗ trợ `ja→vi` và `vi→ja`, tối đa 500 ký tự và 512 input token. Không cắt input âm thầm. Output giới hạn 384 token; nếu chưa kết thúc, trả lỗi yêu cầu chia câu. Một request xử lý tại một thời điểm/process; request khác nhận 429 để tránh dồn tài nguyên. Giới hạn 12 lượt/tài khoản/phút.

Không cache câu và bản dịch trong RAM, không lưu lịch sử câu vào DB. Trường `cached` luôn là `false`, giữ tương thích response hiện tại. Model vẫn được nạp một lần và giữ trong bộ nhớ để phục vụ inference. Chỉ gọi API khi truy vấn tìm kiếm đã được gửi, không gọi theo từng phím gõ. F5 một URL tìm câu sẽ yêu cầu dịch lại. Trong bản thử, nội dung đang nhập và kết quả chưa được lưu lâu dài.

Web: dùng chung tab Từ vựng và `/lookup?q=...`; URL `/lookup/translate` cũ chuyển về Tra cứu. Mục từ khớp chính xác được ưu tiên. Nếu không có khớp chính xác, frontend dùng dấu câu, cấu trúc/đuôi câu Nhật, số từ hoặc độ dài để nhận diện truy vấn giống câu; đây là heuristic, không phải bộ phân loại ngôn ngữ hoàn chỉnh. Câu có ký tự Nhật được dịch Nhật→Việt; câu khác được coi là tiếng Việt. Kết quả hiển thị tiếng Nhật có furigana/tra nhanh/nghe phát âm, tiếng Việt bên dưới và nhãn Dịch tự động. API bổ sung `japanese`, `vietnamese`, `paragraphs`, `words` từ bộ phân tích Sudachi hiện có. Bản dịch vẫn là đầu ra máy, cần đánh giá trước khi dùng làm nội dung học đã biên tập.

## Kiểm tra

```bash
venv/bin/python -m unittest discover -s tests -p test_translation.py -v
```

Test dùng model giả để kiểm tra auth, validation, chọn ngôn ngữ, giới hạn token, dịch lại khi lặp truy vấn và khóa request. Chất lượng/tốc độ model thật được kiểm tra riêng sau khi tải checkpoint.

## Kết quả thử cục bộ (2026-10-27)

Thiết bị MPS, FP32, beam search 4. Lần đầu khoảng 10 giây gồm nạp model/khởi tạo GPU; ba câu ngắn tiếp theo khoảng 0,50–0,58 giây/câu. Đây là mẫu nhỏ trên máy phát triển, không phải cam kết độ trễ server khác hoặc câu dài.

- `私は毎日日本語を勉強しています。` → `Tôi học tiếng Nhật mỗi ngày.`
- `Tôi muốn học tiếng Nhật.` → `日本語を学びたい。`
- Lỗi chất lượng: `雨が降っているので、傘を持っていってください。` → `Khi trời mưa, hãy mang gương đi.` (`傘` bị dịch sai thành gương).

Kết luận thử: model đáp ứng được luồng dịch cục bộ, nhưng chưa đủ tin cậy để xem là bản dịch chuẩn cho học tập. Cần đánh giá thêm trước khi chọn làm engine chính; không tự sửa các từ sai bằng quy tắc thay chuỗi.
