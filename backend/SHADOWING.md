# Shadowing local

Mở **Nghe** từ Trang chủ hoặc Luyện tập. Dán link YouTube, theo dõi trạng thái
chuẩn bị, rồi chọn **Luyện shadowing**. Mặc định video phát liên tục; danh sách
phụ đề tô sáng và cuộn theo thời gian video, kể cả khi tua hoặc đổi tốc độ.
Player giữ nguyên khi chuyển câu. Cuộn tay tạm ngừng tự cuộn; bấm **Về câu hiện tại**
để theo dõi lại. Chọn **Từng đoạn** để dừng cuối câu hoặc bật **Lặp đoạn** để luyện
lặp câu đã chọn. Replay phát lại câu hiện tại. Bấm nút tốc độ để chuyển
1× → 0.75× → 0.5×; nút mắt ẩn/hiện phụ đề của app.
Phụ đề tự động có thể sai. Video phát bằng YouTube IFrame, không lưu bản video.

## Chạy

Backend dùng `.env` trong thư mục `backend`. Migration trước khi khởi động worker:

```sh
cd backend
venv/bin/flask --app app db upgrade
```

Từ thư mục gốc:

```sh
docker compose --env-file backend/.env --profile shadowing up -d --build
```

Backend Flask và app vẫn chạy bằng các lệnh README hiện có. Nếu backend đang
chạy mà không tự reload, khởi động lại để nhận các route mới.
Không cần profile audio/RustFS để tạo phụ đề; các chức năng audio hội thoại/từ vựng
vẫn dùng kho riêng như trước.

Compose thêm:

- `elasticmq`: SQS-compatible API tại `http://localhost:9324`, chỉ bind loopback.
  Hàng đợi `shadowing` và `shadowing-dlq`; bật H2 persistence trong volume
  `elasticmq_data`. Container chạy root để ghi được named volume local.
- `shadowing-worker`: một worker xử lý một video tại một thời điểm, giới hạn
  2 CPU và 4 GiB RAM. Faster-Whisper CPU int8, model `small` đa ngôn ngữ.
  Model tải lần đầu vào volume `shadowing_models`; các lần sau dùng lại file model.
  Inference mỗi job chạy trong tiến trình con để có thể chấm dứt khi timeout.

Cấu hình tùy chọn trong `backend/.env`:

```dotenv
SHADOWING_SQS_ENDPOINT=http://localhost:9324
SHADOWING_SQS_QUEUE_URL=
SHADOWING_WHISPER_MODEL=small
SHADOWING_CPU_THREADS=2
SHADOWING_MAX_SECONDS=1200
SHADOWING_JOB_TIMEOUT=2400
```

Compose tự đổi endpoint queue sang `http://elasticmq:9324` và database sang
service `postgres` cho worker. Không đổi `.env` của backend đang chạy trên máy.
Nếu sửa code worker, chạy lại lệnh Compose có `--build`.

Xem trạng thái:

```sh
docker compose --env-file backend/.env --profile shadowing logs --tail 50 shadowing-worker
```

## Luồng xử lý và dữ liệu

API chỉ kiểm tra link, tạo job và thử đưa vào queue; không tải video hoặc chạy model
trong request. Job giữ trong `shadowing_jobs`; `shadowing_requests` liên kết người
dùng với job. Một video dùng một job chung, còn danh sách/trạng thái yêu cầu đăng nhập
và kiểm tra liên kết của người dùng. Link chuẩn/shorts/live/embed/youtu.be được chuẩn hóa
thành video ID; không cho backend lấy URL tùy ý.

Video đã có phụ đề trong `example_videos`/`video_caption_segments` dùng ngay, không
nhận dạng lại. Video mới mặc định tối đa 20 phút, không livestream, private hoặc
nguồn yêu cầu đăng nhập. Một tài khoản có tối đa một video đang xử lý và 5 yêu cầu
tạo/thử lại xử lý mới mỗi ngày theo cửa sổ rate limit. Nhiều người gửi cùng video
chia sẻ kết quả thay vì nhân đôi tác vụ.

Worker ưu tiên phụ đề tiếng Nhật gốc, sau đó phụ đề tiếng Nhật tự động; bỏ track
dịch máy có tham số `tlang`. Nếu không lấy được phụ đề, yt-dlp lấy audio vào thư mục
tạm, Faster-Whisper nhận dạng và kiểm tra ngôn ngữ là tiếng Nhật. Có Node.js trong
image để yt-dlp xử lý các bước JavaScript thông thường; không lấy cookies cá nhân
hay tự vượt xác minh. Nguồn có thể chặn tải; job báo lỗi thật và có nút thử lại.

Giữ các đoạn gốc và timestamp từng từ (nếu nguồn có) trong `shadowing_jobs.raw_captions`.
Đoạn luyện/search vẫn dùng `video_caption_segments`; phụ đề đang phát dùng
`shadowing_jobs.display_captions` riêng. API lesson trả `segments` và `captions`,
mỗi caption có `segment_id` trỏ về câu luyện để replay/lặp nguyên câu.
Phụ đề hiển thị giữ mốc bắt đầu gốc, cắt thời gian kết thúc đoạn trước khi chồng nhau,
không đẩy đoạn sau sang muộn. Chia khoảng 28 ký tự/4 giây tại mốc từ do YouTube hoặc
Faster-Whisper cung cấp; Whisper bật `word_timestamps=True`. Không chia đều thời gian.
Nguồn không có mốc từ giữ toàn văn, app cho cuộn trong khung tối đa hai dòng và đọc
câu đầy đủ ở bảng phụ đề. Dữ liệu cũ không thể khôi phục mốc từ đã bỏ khỏi snapshot.

Sau migration, cập nhật video đã có bằng dữ liệu gốc local (không gọi YouTube/ASR):

```sh
cd backend
venv/bin/flask --app app db upgrade
venv/bin/flask --app app shadowing-rebuild-captions
```

Lệnh cập nhật atomically, có thể chạy lại; bỏ qua job chưa ready. Video cache cũ
không có raw snapshot giữ đoạn hiện có. Build lại worker sau khi migration để
video mới sử dụng pipeline này.
Chỉ công bố video/phụ đề và trạng thái ready trong cùng transaction.

Không upload audio lên S3/RustFS. Audio, log xử lý và kết quả trung gian nằm trong
`TemporaryDirectory` do supervisor quản lý, được xóa khi xong/lỗi/timeout.
Khi container bị kill đột ngột, file tạm có thể còn trên filesystem của container;
chúng không nằm trong volume. Model cache và dữ liệu PostgreSQL/ElasticMQ được giữ
trong volume. Không chạy `docker compose down -v` nếu cần giữ dữ liệu.

Worker dùng lease và token để tránh chạy trùng và chặn worker cũ ghi đè kết quả.
PostgreSQL đồng thời là outbox: job chưa gửi được sẽ được worker gửi lại; job đang
chạy bị mất worker được phục hồi sau khi lease hết hạn. Sau 3 lần gián đoạn job
chuyển failed. Lỗi nguồn/nhận dạng thông thường chuyển failed để người dùng chủ động
thử lại. SQS message lỗi nhiều lần chuyển DLQ; không giả định giao đúng một lần.

## API

Tất cả route yêu cầu Bearer token:

| Method | Route | Nội dung |
| --- | --- | --- |
| GET | `/api/listening/shadowing/jobs?scope=all` | Video ready của mọi người và job riêng của người xem; mặc định all |
| GET | `/api/listening/shadowing/jobs?scope=mine` | Video người xem đã thêm, bao gồm job đang xử lý/lỗi |
| POST | `/api/listening/shadowing/jobs` | JSON `{"url":"https://youtu.be/..."}`; 202 nếu chuẩn bị, 200 nếu có sẵn |
| GET | `/api/listening/shadowing/jobs/<id>` | Trạng thái, lỗi và tên video |
| POST | `/api/listening/shadowing/jobs/<id>/retry` | Thử lại job failed, giữ ID |
| GET | `/api/listening/shadowing/jobs/<id>/lesson` | Video và các đoạn luyện có timestamp; 409 nếu chưa ready |

Danh sách trả tối đa 50 mục/trang và `next_cursor`; truyền `cursor` để tải tiếp.
Cursor gắn với scope. `is_mine` cho biết video thuộc danh sách cá nhân; nhiều người
thêm cùng một video dùng chung job. Lesson ready có thể xem bởi mọi tài khoản đã
đăng nhập; việc mở bài không tạo subscription. Status/retry và job chưa ready
vẫn chỉ truy cập được qua subscription riêng, không công khai lỗi của người khác.

App kiểm tra danh sách mỗi 5 giây khi ở foreground, ngừng gọi khi vào nền/rời màn.
Người dùng có thể đổi chức năng và quay lại; công việc chạy ở worker độc lập.

## Kiểm thử

```sh
cd backend
venv/bin/python -m unittest discover -s tests -p test_shadowing.py -v
```

Frontend:

```sh
cd frontend
npm test -- --runInBand ShadowingScreen.test.tsx VideoExamplePlayback.test.ts
npx tsc --noEmit
```

Chưa triển khai lên AWS. Phần core `shadowing/processor.py` không phụ thuộc Flask,
database hoặc queue; adapter local nằm trong `shadowing/worker.py`. Việc chuyển
sang Lambda sau này cần handler, đóng gói runtime, quyền và kiểm thử AWS riêng.


## Popup tra từ phụ đề

Bấm từ có gạch chân ở phụ đề lớn của câu hiện tại để xem chữ, cách đọc,
dạng gốc, từ loại và nghĩa tiếng Việt từ bộ từ vựng N5–N1. Bấm chữ tạm dừng video;
đóng popup không tự phát tiếp. Nút play bên trái câu vẫn dùng để luyện câu.
Không gọi AI hoặc API từ điển ngoài, không thêm các nút lưu từ/audio chưa có.

SudachiPy + sudachidict_core chạy ở backend/worker, không đóng gói từ điển vào app.
Worker phân tích trước khi ready; cache `shadowing_jobs.word_analysis` chứa token
và fingerprint phiên bản + nội dung. Cue cắt ngang một từ tham chiếu từ nguyên vẹn
trong câu luyện khi vị trí duy nhất, giữ toàn bộ chữ và khoảng trắng.
API lesson trả `tokens.segments`, `tokens.captions` và bảng `words` dùng chung;
nghĩa lấy bằng truy vấn chính xác có index theo từ/cách đọc, gộp truy vấn và loại trùng.
Dữ liệu nghĩa đọc lại khi mở bài để nhận cập nhật nhập từ vựng. Bấm từ chỉ mở popup
local, không gửi request. Từ ngoài dữ liệu được hiển thị thiếu nghĩa, không đoán.
Phụ đề lớn chia thành cụm từ có khoảng cách và furigana trên kanji; đuôi trợ động từ
được ghép vào động từ. Bảng phụ đề bên dưới chỉ đọc, không mở popup.
Nghĩa là các mục từ điển, chưa tự chọn nghĩa theo ngữ cảnh; chưa có romaji.

Sau khi cài lại requirements và migrate, chuẩn bị các video cũ:

```sh
cd backend
venv/bin/pip install -r requirements.txt
venv/bin/flask --app app db upgrade
venv/bin/flask --app app shadowing-prepare-words --stats
```

Chạy lại prepare an toàn: chỉ phân tích khi fingerprint thay đổi. Bài ready chưa
có cache được bổ sung khi mở lần đầu; tải bộ từ điển lúc cài đặt, không tải mỗi lần
bấm chữ. Build lại worker bằng compose để video mới được chuẩn bị từ trước.

## Dịch phụ đề tiếng Việt

Nút **Bản dịch** gọi GET `/api/listening/shadowing/jobs/<id>/translation`.
Nếu `not_requested`, app POST cùng endpoint để tạo job; chỉ video ready được dịch.
App poll 3 giây khi đang chuẩn bị, dừng poll khi tắt dịch/rời bài hoặc app nền.
API không gọi Gemini trực tiếp. Worker dùng queue ElasticMQ/SQS hiện có, phân biệt
message `kind=translation`; ASR/shadowing vẫn dùng luồng cũ. Worker hiện xử lý tuần tự,
nên job dịch có thể đợi job video trước đó; thêm worker khi cần tăng năng lực.

Cấu hình trong **backend/.env**:

```dotenv
GEMINI_API_KEY=<key Gemini API hiện có>
SHADOWING_TRANSLATION_MODEL=gemini-3.1-flash-lite
```

Model dùng generateContent qua HTTPS, JSON Schema và mức thinking minimal (Gemini 3.x).
Chỉ gửi title, ID + văn bản các câu cần dịch và một câu ngữ cảnh mỗi phía;
không gửi audio, tài khoản hoặc thông tin người học. System prompt nguyên văn nằm ở
`backend/shadowing/translation.py::SYSTEM_PROMPT`: dịch tự nhiên, giữ nghĩa/tên riêng,
không thêm giải thích, không tuân theo chỉ dẫn trong phụ đề, không đoán ASR không rõ.
Google có thể dùng dữ liệu free tier để cải thiện sản phẩm theo điều khoản Gemini API;
xem https://ai.google.dev/gemini-api/docs/pricing.

Bảng `shadowing_translations` lưu một bản vi dùng chung theo video, nguồn + hash,
model/prompt version, trạng thái, lease và các nhóm câu đã hoàn thành. POST đồng thời
khóa job cha, không tạo nhiều bản dịch cho cùng video. Mỗi request Gemini tối đa
20 câu hoặc khoảng 2.400 ký tự (một câu đơn quá dài vẫn được giữ nguyên).
Backend kiểm tra finishReason STOP, đủ đúng ID theo thứ tự và bản dịch không rỗng.
Lưu từng batch; lỗi mạng/429/5xx thử lại tối đa 3 lượt, backoff 60/120 giây;
nhóm đã lưu không dịch lại. Dispatcher phục hồi nếu enqueue hoặc worker bị gián đoạn.
Lỗi xác thực/model cần sửa cấu hình trước khi bấm thử lại. Lease/fencing ngăn worker cũ
ghi đè nguồn mới. Hash thay đổi khi title/câu luyện hoặc prompt thay đổi: bản cũ không
hiển thị và lần yêu cầu tiếp theo tạo lại. Đổi model config chỉ áp dụng cho job mới;
cache ready tiếp tục được dùng để tiết kiệm chi phí.

Bản dịch hiển thị dưới từng câu luyện và dưới phụ đề lớn theo `segment_id` câu luyện;
không chia bản dịch bằng số ký tự để khớp cue Nhật ngắn. Tiếng Nhật vẫn đồng bộ video;
bản Việt có thể giữ nguyên qua nhiều cue của cùng câu luyện. Bản dịch dài ở khu vực
phụ đề lớn có thể cuộn trong vùng tối đa 72 px để giữ diện tích danh sách.

Áp dụng migration rồi build lại worker:

```sh
cd backend
venv/bin/flask --app app db upgrade
cd ..
docker compose --env-file backend/.env --profile shadowing up -d --build shadowing-worker
```

## Câu hỏi AI trong lúc xem (tuỳ chọn)

Trong bài Shadowing, bấm **Câu hỏi AI**, chọn 1–10 câu và trình độ **N5–N1** rồi **Tạo câu hỏi**.
Không gọi AI khi mở bài hoặc chỉ mở bảng tuỳ chọn. Số câu tối đa còn phụ thuộc số
đoạn phụ đề. Tạo thành công sẽ xem lại từ đầu ở chế độ nghe liên tục để gặp đủ câu.
Video tạm dừng khi mở bảng tuỳ chọn/tạo câu hỏi. Dấu **×** ở góc phải đóng bảng;
nếu đang tạo, kết quả tới sau khi đóng được bỏ qua. Trong popup câu hỏi, **×**
đóng popup và ngừng các mốc hỏi tự động, vẫn giữ câu hỏi/kết quả để xem lại.

Sau khi tạo xong, mở lại **Câu hỏi AI** để xem **Các mốc câu hỏi**. Mỗi nút
**Tới câu hỏi** hiển thị số câu và thời gian; bấm để tua thẳng tới cuối phần bằng
chứng rồi mở đúng câu đó. Nội dung câu hỏi/đáp án không hiện trong danh sách mốc.
Player đợi vị trí tua thực tế đạt mốc rồi mới hiện câu hỏi. Khi nhảy thẳng tới một
câu sau, các câu trước chưa trả lời vẫn có thể chọn từ danh sách, nhưng không tự
chen vào khi xem tiếp từ mốc mới. Câu đã trả lời được đánh dấu, hiện lại nội dung,
đáp án đã chọn/đáp án đúng và giải thích; nút **Xem lại câu hỏi** mở lại kết quả
không tính điểm lần nữa. Câu hỏi và kết quả chỉ hiện trong bảng mở bằng icon AI,
không chiếm diện tích màn hình phụ đề. Chỉ rời bài mới xoá bộ câu hỏi và kết quả;
tạo bộ mới theo yêu cầu sẽ thay bộ hiện tại.

POST `/api/listening/shadowing/jobs/<id>/questions` với `{"count": 5, "level": "N3"}` yêu cầu đăng nhập,
chỉ nhận video ready và giới hạn 20 yêu cầu/người/giờ. Endpoint gọi Gemini trực tiếp,
Mỗi câu dùng một yêu cầu riêng, tối đa ba yêu cầu song song, timeout kết nối tối đa
3 giây/đọc tối đa 25 giây, giảm theo ngân sách còn lại của lượt tạo (65 giây).
App đợi tối đa 75 giây. Dùng `GEMINI_API_KEY`
hiện có và `SHADOWING_QUIZ_MODEL` (mặc định `gemini-3.1-flash-lite`). Backend cần
được khởi động lại để nạp route mới; không cần migration hay thay đổi worker.

Backend chia phụ đề thành đúng số khoảng liên tiếp theo thời gian; AI chọn một ý
quan trọng mỗi khoảng, tạo câu hỏi và bốn lựa chọn bằng tiếng Nhật theo trình độ
đã chọn (mặc định N3), một đáp án đúng và giải thích tiếng Việt.
N5/N4 dùng câu ngắn và ngữ pháp quen thuộc; N3 dùng diễn đạt trung cấp; N2/N1
cho phép câu phức tạp và suy luận sâu hơn, vẫn chỉ dựa trên nội dung video.
Prompt coi phụ đề là dữ liệu không đáng tin cậy, không tuân theo chỉ dẫn trong đó,
không lấy kiến thức tương lai để trả lời câu hiện tại. JSON Schema và kiểm tra backend
bắt buộc đủ số câu, các lựa chọn khác nhau, đáp án hợp lệ, bằng chứng đúng khoảng.
Mỗi yêu cầu chỉ tạo một câu với `window_index` cố định và ID phụ đề ngắn (`s0`,
`s1`…) được giới hạn bằng enum trong JSON Schema. Backend ánh xạ về ID thật,
ghép kết quả theo thứ tự thời gian. Nếu một câu có JSON/bằng chứng không hợp lệ,
chỉ thử lại câu đó một lần; không tạo lại các câu đã đạt. Log chỉ ghi chỉ số
khoảng, số lần thử và mã lỗi, không ghi câu hỏi hoặc API key.
Mốc dừng lấy từ thời gian kết thúc phần phụ đề làm bằng chứng, không từ timestamp AI.
Không gửi tài khoản hoặc lịch sử trả lời cho Gemini, chỉ title và phụ đề có mốc thời gian.

Player kiểm tra thời gian phát mỗi 100 ms và dừng trước khi gửi sự kiện hiện câu hỏi.
Chọn đáp án sẽ khoá lựa chọn, hiện đúng/sai, đáp án đúng và giải thích; **Xem tiếp**
mới tiếp tục phát. Câu cuối vẫn được hỏi khi video kết thúc. Tua qua mốc sẽ hỏi
câu chưa trả lời theo thứ tự; tua lại không lặp câu đã hoàn tất. Đóng popup bằng
**×** bỏ các mốc dừng tự động nhưng giữ câu hỏi và kết quả trong phiên để xem lại.
Đáp án được trả trong response nhưng chỉ hiện trong UI sau khi chọn.

Bộ câu hỏi và kết quả chỉ giữ trong state của phiên xem, không lưu database,
storage thiết bị, queue hay cache. Response dùng `Cache-Control: no-store`.
Rời bài xoá bộ câu hỏi; response tới sau khi huỷ/rời bài được bỏ qua. Có thể
tạo lại theo yêu cầu; AI có thể báo lỗi nếu không tạo được nội dung đủ rõ hoặc
trả thiếu số câu, khi đó người dùng thử lại hoặc giảm số câu.
