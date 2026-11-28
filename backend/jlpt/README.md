# Luyện thi JLPT trên local

Đề mẫu: **N3 tháng 7/2017**, lấy từ `jlpt-n3-2010-2024.json` người dùng cung cấp.
35 câu từ vựng, 39 câu ngữ pháp/đọc hiểu, 28 câu nghe; tổng 102 câu.
Giữ nguyên thứ tự phần, nhóm và số câu của kỳ gốc. Số câu ở phần nghe khởi động lại theo từng nhóm;
ID nội bộ phân biệt phần/nhóm để không ghi đè đáp án.

Đã thêm **N3 tháng 12/2016**, cũng đủ 35 + 39 + 28 = 102 câu, theo đúng kỳ riêng.
Đáp án đối chiếu ảnh trang 1 của `Đáp án+Script N3 12-2016.pdf` trong JSON nguồn.
Nhập lại bằng `venv/bin/python -m jlpt.import_2016_12 /path/to/jlpt-n3-2010-2024.json`
sau khi đã có đề 2017-07 (dùng lại nhãn hướng dẫn chung, không dùng lại câu hỏi).
Danh sách xếp theo kỳ mới đến cũ và nhận dữ liệu mới trên local mà không cần khởi động lại API.

## Chuẩn bị dữ liệu

```sh
cd backend
venv/bin/python -m jlpt.import_sample /path/to/jlpt-n3-2010-2024.json
```

Importer chỉ hỗ trợ kỳ 2017-07 được chọn và có kiểm tra số câu, số lựa chọn, số đáp án.
Không phải bộ phân tích tổng quát cho mọi kỳ: cấu trúc PDF/OCR của từng kỳ khác nhau.
Dữ liệu đã chuẩn hóa nằm trong `data/n3-2017-07.json` và được phục vụ trực tiếp;
không cần migration, không nhập vào ngân hàng bài đọc hiện có, không gọi AI.
SHA-256 của JSON nguồn và tên tài liệu được ghi trong bản nhập để truy vết.

Đáp án được đối chiếu thủ công với **ảnh trang 1** của `Đáp án+Script N3 7-2017.pdf`
nhúng trong JSON, thay vì suy ra từ OCR của bảng đáp án. Các ảnh cho bài đọc câu 38–39,
nghe nhóm 1 câu 2, nghe nhóm 4 câu 1–4 được giữ từ dữ liệu nguồn.
Các bài đọc nối trang được ghép lại và chia sẻ giữa các câu cùng bài.
Từ được hỏi đọc/viết và từ đồng nghĩa ở phần từ vựng được gạch chân lại do PDF text mất định dạng.
Nội dung chữ vẫn có thể có lỗi chuyển đổi từ tài liệu gốc; không tự viết lại câu hỏi bằng AI.

## API

Tất cả endpoint yêu cầu đăng nhập:

- `GET /api/jlpt/exams`: danh sách kỳ thi đang được nhập.
- `GET /api/jlpt/exams/:id`: toàn bộ câu hỏi và ảnh; **không gửi đáp án**.
- `POST /api/jlpt/exams/:id/grade`: `{version: 1, answers: {"v-1": 2}}`, lựa chọn bắt đầu từ 0.
  Kiểm tra ID, phiên bản và miền lựa chọn; cho phép câu bỏ trống. Trả kết quả từng câu và từng phần.

Kết quả là **số câu đúng**, không phải điểm JLPT chuẩn hóa, không kết luận đỗ/trượt.
Chưa lưu lịch sử thi vào DB. Bài làm tự lưu lâu dài theo tài khoản và kỳ thi trong localStorage
trên web, Keychain trên native; bộ nhớ đệm chỉ phục vụ hiển thị tức thời. Đáp án, câu đang xem,
đánh dấu xem lại, thời gian đã luyện và trạng thái nộp được khôi phục khi mở lại trên cùng thiết bị.
Web chuyển bản nháp sessionStorage cũ sang localStorage khi tải danh sách.
Danh sách có nhãn Đang làm dở/Đã nộp và CTA Tiếp tục/Xem kết quả.
Bài đang dở hiện số câu đã trả lời; bài đã nộp hiện số câu đúng/tổng câu từ tóm tắt kết quả
được lưu cùng bài làm. Bản lưu cũ chưa có tóm tắt hiện Đã hoàn thành bài làm; mở kết quả
sẽ chấm lại và lưu tóm tắt. Không quy đổi thành điểm JLPT chuẩn hóa.
Bài chưa nộp cập nhật gần nhất được đánh dấu Lần làm gần nhất. Thẻ mẫu không có tiến độ giả.
Lỗi lưu hiển thị trong màn thi, giữ bài trong bộ nhớ và có Lưu lại bài làm. Dữ liệu lưu được kiểm tra
phiên bản và tính hợp lệ trước khi dùng; chưa đồng bộ giữa các thiết bị.

## Âm thanh

Theo yêu cầu hiện tại, `audio_url` là **null**. Không tạo giọng đọc thay thế đề nghe,
không gắn URL giả. Giao diện ghi rõ chưa có tệp nghe, nhưng giữ đủ các câu và ảnh phần nghe.
Nhóm 3/4/5 chỉ có nút lựa chọn số vì lựa chọn được đọc trong audio của đề gốc.

## Luồng giao diện

Luyện tập → Luyện thi JLPT → Mở đề thi. Desktop có bảng câu hỏi bên phải, nhóm theo phần
và 問題, cuộn riêng, bám khi đọc bài dài. Màn hẹp mở bảng phía trên nội dung bằng một nút.
Chọn/bỏ chọn đáp án, đánh dấu xem lại, chuyển phần, câu trước/tiếp, xác nhận nộp bài,
xem đúng/sai/bỏ trống, lọc câu cần xem lại và làm lại đề.
Luyện tự do hiển thị thời gian đã luyện. Bật Thi thử tính giờ trong màn đề thi, xem thời lượng
và bấm Bắt đầu tính giờ để bắt đầu lượt mới; hủy giữ nguyên bài đang luyện. Danh sách đề không có bộ chọn chế độ.
Thi thử tính giờ dùng các phần 30/70/40 phút,
đối chiếu tài liệu JLPT chính thức:
https://www.jlpt.jp/statistics/pdf/2016_2_1.pdf và https://www.jlpt.jp/statistics/pdf/2017_1_9.pdf.
Thời lượng và nguồn nằm trong metadata API. Hạn kết thúc mỗi phần được lưu tuyệt đối trong bản nháp;
đóng/tải lại trang không kéo dài giờ. Không chuyển phần tùy ý hoặc sửa phần đã kết thúc.
Sau mỗi phần, học viên chủ động bắt đầu phần tiếp theo; hết phần cuối tự nộp bài.
Vì chưa có audio, phần nghe không thể bắt đầu: có thể nộp các phần đã làm, không giả vờ thi nghe đầy đủ.

## Ôn sau khi nộp

`grade` trả `review_token` được ký bằng khóa AUTH, gắn tài khoản, đề và fingerprint nội dung, có hạn 7 ngày.
Mở lại kết quả sẽ cấp token mới. Các endpoint sau đều yêu cầu auth và token này:

- `POST /api/jlpt/exams/:id/questions/:qid/review`: `{review_token}`, tách từ prompt/bài đọc
  bằng Sudachi; không gọi AI. Frontend dùng popup từ điển hiện có khi bấm từ.
- `POST /api/jlpt/exams/:id/questions/:qid/explanation`: `{review_token, option_index}`,
  Momo giải thích đáp án được bấm. Model `JLPT_AI_MODEL` (fallback `READING_AI_MODEL`,
  mặc định gemini-3.5-flash-lite), dùng cùng provider/budget của app; giới hạn 12 lượt/phút/tài khoản.
  JSON được kiểm tra, trích dẫn phải có thật trong nguồn; correct_index luôn lấy từ đáp án backend.
  Cache bộ nhớ tối đa 128 lời giải theo fingerprint/câu/lựa chọn. Không tự gọi khi đổi câu hoặc nộp bài;
  không đoán bài nghe thiếu lời thoại. Frontend giữ nguyên lựa chọn đã nộp khi bấm xem giải thích.

Đây là chế độ luyện trên thiết bị, không phải hệ thống giám sát hoặc chứng nhận thi chính thức.

```sh
cd backend
venv/bin/python -m unittest tests.test_jlpt
cd ../frontend
npm test -- --runInBand JlptScreen
npx tsc --noEmit
```

## Database và ảnh R2

Migration `c2d3e4f5a6b7` tạo `jlpt_exams`, `jlpt_images`, `jlpt_imports`.
Nguồn N3 2010–2024 được nhập toàn bộ: 30 kỳ (28 có đề), 101 tài liệu/975 trang
kể cả phụ lục. Có 299 ảnh WebP duy nhất (hình câu hỏi và trang đáp án), được đưa
vào bucket R2 riêng tư dưới `jlpt/images/<sha256>.webp`. Database chỉ lưu khóa,
bucket, checksum và kích thước; không lưu base64 ảnh. API cấp URL có hạn 6 giờ.

`jlpt_exams.source_data` giữ nguyên trang văn bản OCR/PDF, metadata và liên kết
ảnh cho tất cả kỳ. Hai đề đã tách câu hiện có thêm trường `normalized` phục vụ
chấm điểm; các kỳ còn lại có tài liệu gốc/đáp án/script và chưa chấm tự động.
Hai kỳ thiếu đề trong nguồn không xuất hiện như đề có thể làm. Phụ lục được lưu
trong metadata của lần nhập. Không suy diễn đáp án bị mất trong OCR.

```sh
# Chỉ chạy khi muốn chuẩn bị/đổi dữ liệu: upload và verify ảnh trước khi xuất JSON.
venv/bin/python -m jlpt.prepare_import --source /path/to/jlpt-n3-2010-2024.json \
  --output jlpt/import_data/n3-2010-2024.json
# Sau schema migration, có thể nhập lại an toàn, không tạo bản trùng.
venv/bin/flask --app app jlpt-import-json --source jlpt/import_data/n3-2010-2024.json
```

R2 dùng cấu hình kết nối hiện có của `_tts_client`; bucket lấy từ `JLPT_S3_BUCKET`
hoặc `TTS_S3_BUCKET`. Bộ chuẩn bị không tạo bucket và chỉ ghi prefix `jlpt/images/`.
Compose migrate chạy `python -m jlpt.migrate`: migrate schema, kiểm tra cả 299 ảnh
bằng tài khoản R2 của staging, rồi commit dữ liệu vào DB trước khi phục vụ phiên
bản mới. Lỗi kiểm tra dừng deploy; không tự xóa đề hay ảnh của lần nhập trước.
Dữ liệu chuẩn bị được lưu trong release để deploy không phụ thuộc file Downloads.
API ưu tiên dữ liệu DB; JSON hai đề mẫu chỉ là fallback khi máy local chưa import.

## Tạm giữ hai đề (theo yêu cầu người dùng)

Migration `d3e4f5a6b7c8` xóa các kỳ chưa tách câu từ lần nhập 2010–2024, chỉ giữ
N3 12/2016 và 7/2017. Gói seed cũng chỉ còn hai kỳ để deploy sau không nhập lại
các đề đã xóa. `jlpt_images` và toàn bộ 299 object R2 được giữ nguyên, không có
thao tác xóa ảnh. Đây là migration dọn dữ liệu một lần; việc nhập dữ liệu mới sau
này vẫn dùng bộ nhập bình thường, không bị chính sách dọn định kỳ xóa lại.

## Năm đề N2 từ PDF gốc

Gói `import_data/n2-2022-2024.json` bổ sung N2 12/2024, 7/2024, 12/2023,
7/2023 và 12/2022: mỗi đề có 71 câu phần chữ/đọc và 30 câu nghe, tổng 505 câu.
Các đề này dùng **nội dung chữ và hình cần thiết từ PDF gốc**, có chọn đáp án,
chấm điểm, lưu tiến độ, tra từ sau khi nộp và làm lại như hai đề N3. Câu nghe
問題5 có nhãn 2(1)/2(2) để giữ số gốc và lưu hai lựa chọn độc lập.

`pdf_sources/n2-2022-2024.json` lưu Drive ID, checksum PDF, ánh xạ câu/trang và
khóa đáp án đã đọc từ tài liệu đi kèm. Bài đọc nhiều trang được liên kết đủ trang
ngữ cảnh. Toàn bộ 265 ảnh trang PDF (đề/đáp án/script), cùng 5 hình cắt cần thiết,
nằm trên R2; DB giữ khóa ảnh và metadata. Chữ OCR thô lưu bổ trợ trong tài liệu
nguồn; bản chữ đã rà soát nằm trong `normalized`. Backend vẫn chặn gọi AI cho
các câu đánh dấu chỉ có ảnh, còn bản chữ hỗ trợ tra từ và Momo. Âm thanh vẫn null.

N2 giữ hai phần gốc, 105 phút và 50 phút; không tách lịch tính giờ theo ba phần N3.
Khi chưa có tệp nghe, chế độ tính giờ tiếp tục chặn bắt đầu phần nghe.

Chuẩn bị offline (PyMuPDF chỉ cần cho công cụ này, không phải dependency server):

```sh
# source-dir chứa jlpt-n2-2024-12/exam.pdf, answers.pdf, listening-script.pdf, ...
python -m jlpt.prepare_pdf_import --manifest jlpt/pdf_sources/n2-2022-2024.json \
  --source-dir /path/to/downloaded-pdfs --output /tmp/n2-prepared.json
# Thêm --upload để upload và xác minh ảnh trước khi xuất gói release.
```

`jlpt.migrate` kiểm tra ảnh và nhập lần lượt **mọi gói JSON** trong `import_data/`.
Nhập lại chỉ cập nhật đúng ID trong gói, không xóa hai đề N3 hoặc các ảnh đang giữ.

### Chuyển N2 sang chữ và giữ hình cần thiết

Năm đề dùng chữ để hỗ trợ tra từ sau khi nộp và Momo giải thích ngữ pháp.
`text_sources/` giữ nội dung đã rà
soát, vị trí dấu ★ được kiểm tra bằng ảnh, cùng các chỉnh sửa thủ công. OCR dùng
Google Gemini sau khi người dùng cho phép; đề và các phương án nhiễu không được
AI tự viết lại hoặc đổi khóa đáp án. Sửa đổi đề xuất từ AI chỉ là gợi ý kiểm tra,
không được tự áp dụng hàng loạt (có đề xuất sửa cả phương án sai cố ý).

`prepare_text_import` ghép chữ vào gói ảnh trước đó, giữ nguyên ID câu, thứ tự lựa
chọn, phiên bản đề và đáp án để tiếp tục bài đang làm. Các câu 70/71 giữ ảnh tài
liệu tìm thông tin; bảng ứng viên, memo, tranh minh họa và sơ đồ ghế được cắt từ
ảnh gốc, kiểm tra đủ nhãn. Gói có 270 object R2 (265 ảnh trang gốc và 5 hình cắt);
phần chữ thông thường không hiển thị lại toàn trang PDF. Âm thanh vẫn null.

```sh
python -m jlpt.prepare_text_import --source /tmp/n2-image-package.json \
  --text-dir jlpt/text_sources --asset-dir /tmp/n2-image-package.assets \
  --output /tmp/n2-text-package.json
```
