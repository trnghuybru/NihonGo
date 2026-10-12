# Học từ vựng theo JLPT (UC-V1)

Tab **Từ vựng** tách thành **Bài học** và **Tra cứu**. Bài học cho phép chọn N5–N1.
Hiện N2 có 13 Unit, 89 bài và 1.160 từ; N3 có 12 Unit, 66 bài và 880 từ.
N4 có 728 mục từ trong 7 nhóm, chia thành 31 bài tối đa 25 mục từ bộ Anki người dùng cung cấp.
N1 có 1.200 mục, chia 48 bài, mỗi bài 25 mục theo thứ tự note trong bộ Anki cung cấp.
N5 lấy từ JTest, giữ 10 chủ đề, 50 bài và 1.050 mục theo các bảng nguồn.
Các trình độ khác hiện trạng thái chưa có dữ liệu;
trình độ đang duyệt không thay đổi trình độ đã lưu trong hồ sơ học tập.

Luồng giao diện: trình độ → grid bài học gọn (3 cột, tự giảm khi màn hình hẹp/chữ lớn)
→ danh sách từ. N1–N5 mở trực tiếp danh sách bài,
đánh số liên tục và hiện nhóm từ tiếng Việt, không hiện tên giáo trình hoặc nguồn
trong giao diện. Metadata xuất xứ vẫn được giữ trong database và JSON crawl.
Mỗi thẻ có từ, kana, nghĩa và Hán Việt; mở rộng để xem ví dụ và từ liên quan. Có chế độ ẩn nghĩa
để tự ôn và hiện nghĩa từng từ; bài học không có ô tra cứu. Chưa có lưu tiến độ/SRS.

Mục Tra cứu có ô nhập và hai chế độ **Video** / **Từ vựng**. Tra cứu thường hỗ trợ
từ tiếng Nhật, kana và nghĩa tiếng Việt trên dữ liệu N2 hiện có; phân trang 20
kết quả, không phụ thuộc trình độ đang chọn ở Bài học. Khi chưa nhập truy vấn,
hiện hướng dẫn và không gọi API tìm kiếm. Tra từ trên Home mở thẳng Tra cứu,
mặc định Video; chạm tab Từ vựng hoặc thẻ từ vựng trên Home mở Bài học.
Đổi giữa hai mục giữ truy vấn và trình độ đang duyệt. Quay lại từ kết quả về
Tra cứu; từ chi tiết bài về danh sách bài. Chuyển sang Bài học dừng player video.
Kho phụ đề và API video độc lập với JLPT, mô tả và lệnh nhập nằm tại
[`data/video_examples/README.md`](data/video_examples/README.md).

## Lưu trữ

- PostgreSQL: `vocabulary_textbooks`, `vocabulary_lessons`, `vocabulary_words`.
  Khóa ngoại liên kết giáo trình → bài → từ; index trình độ và unique index theo
  thứ tự bài/từ phục vụ duyệt từng bài. Không sao chép nội dung giáo trình theo user.
- `details` của mỗi từ dùng JSONB trên PostgreSQL, giữ `segments`, `examples`,
  `related` và xuất xứ `source` của từ bổ sung từ PDF. Không thêm GIN index khi chưa truy vấn nội dung JSONB.
- JSON crawl trong `backend/data/vocabulary` giữ nguồn nhập có thể tái tạo.
  App không bundle hoặc tải toàn bộ JSON; API chỉ trả danh sách đang mở hoặc một bài.
- `audio_urls` trỏ tới audio **cả bài** của website và chưa được phát trên màn hình.
  Audio riêng từng từ N1 từ Anki được lưu trong bucket `VOCABULARY_S3_BUCKET`
  (mặc định `vocabulary-audio`), khác bucket bản thu hội thoại. `details.audio`
  giữ khóa object, SHA-256, kích thước và MIME; API danh sách chỉ trả `has_audio`.
  App có icon loa 18px cạnh từ có audio, tải file khi nhấn, dừng khi đổi từ,
  đổi bài hoặc app vào nền. URL nghe ký trong 300 giây, không lưu URL trong database.
- Khi triển khai lưu từ đã thuộc/SRS, thêm bảng tiến độ riêng có `user_id`,
  `word_id`, lịch ôn; nội dung từ vựng vẫn dùng chung. Offline có thể bổ sung SQLite
  cache từng bài trên điện thoại khi có yêu cầu.

## Nhập dữ liệu

Trong thư mục `backend`, dùng `.env` tại đây và PostgreSQL đã chạy:

```sh
venv/bin/flask --app app db upgrade
venv/bin/flask --app app vocabulary-import
venv/bin/flask --app app vocabulary-import --source data/vocabulary/mimikara-n3.json
venv/bin/flask --app app vocabulary-import --source data/vocabulary/anki-n4.json
venv/bin/flask --app app vocabulary-import --source data/vocabulary/mimikara-n1.json
venv/bin/flask --app app vocabulary-import --source data/vocabulary/jtest-n5.json
```

Importer chỉ nhận dataset schema 1 với `coverage.complete=true`, kiểm tra số lượng
và ID, cập nhật theo ID ổn định trong một transaction. Chạy lại không tạo bản trùng;
không tự xóa các bài/từ không có trong file mới. Lỗi rollback toàn bộ lần nhập.
Không chạy importer tự động mỗi lần backend khởi động. File khác:

```sh
venv/bin/flask --app app vocabulary-import --source /path/to/dataset.json
```

## Audio từ vựng N1

Chạy RustFS bằng Docker Compose profile `audio` như hướng dẫn README. Dùng cùng
`S3_ENDPOINT_URL`, `S3_PUBLIC_ENDPOINT_URL` và thông tin AWS hiện có; bucket riêng
`VOCABULARY_S3_BUCKET=vocabulary-audio`. Trong `backend`, sau khi nhập nội dung N1:

```sh
venv/bin/flask --app app vocabulary-audio-import \
  --apkg /path/to/Mimikara_Oboeru_N1_T_Vng.apkg
```

Lệnh tạo bucket nếu chưa có, đối chiếu hash gói với nguồn đã nhập, kiểm tra ánh xạ
note/audio trước khi upload và chỉ công bố liên kết khi tất cả file được lưu.
Khóa `n1/<sha256-nội-dung>.mp3` gộp file trùng nội dung; bộ hiện tại có 820 mục
có audio, tương ứng 810 object. 380 mục thiếu audio không hiện nút loa.
Chạy lại kiểm tra metadata và bỏ qua object đã có; lỗi giữa chừng có thể chạy lại.
Nhập lại JSON cùng nguồn giữ liên kết audio; nguồn khác hash xóa liên kết cũ để
tránh phát nhầm. Không xóa object cũ tự động.

Bucket riêng tư; quyền S3 cho lệnh nhập cần tạo bucket (nếu chưa có), kiểm tra bucket,
PutObject và GetObject. Runtime chỉ cần GetObject để kiểm tra file và ký URL nghe.
Điện thoại thật phải truy cập được host trong `S3_PUBLIC_ENDPOINT_URL`; URL ký
không được thay host sau khi tạo. Android emulator có thể dùng `10.0.2.2:4566`;
simulator iOS dùng localhost khi chạy trên cùng máy.

Chuyển AWS S3: sao chép các object giữ nguyên khóa vào bucket đích, cấu hình bucket,
region và credentials AWS, bỏ hai endpoint local, đặt addressing style `auto`.
Không cần đổi API hoặc màn hình. RustFS giữ file trong Docker volume `rustfs_data`;
không dùng `docker compose down -v` khi muốn giữ dữ liệu.

Hai mục liên quan của từ 1099 thiếu nghĩa ngay từ nguồn; giữ `null` và không hiển thị
dòng dịch trống. Cảnh báo nguồn nằm trong JSON crawl.

N3 giữ 772 từ từ website và bổ sung 108 từ bằng PDF người dùng cung cấp.
Hai từ 813 và 838 không có ví dụ trong PDF nên để trống; ví dụ còn lại giữ nội dung
nguồn, chưa hiệu đính lỗi gõ. Hướng dẫn tái tạo nằm trong
[`data/vocabulary/README.md`](data/vocabulary/README.md).

## API

Tất cả endpoint yêu cầu `Authorization: Bearer <access_token>`.

| GET | Nội dung |
| --- | --- |
| `/api/vocabulary/textbooks?level=N2` | Giáo trình và số bài/từ, không trả toàn bộ từ |
| `/api/vocabulary/textbooks/mimikara-n2` | Unit và metadata các bài |
| `/api/vocabulary/textbooks?level=N3` | Danh sách giáo trình N3 đã nhập |
| `/api/vocabulary/textbooks/mimikara-n3` | 12 Unit và metadata 66 bài N3 |
| `/api/vocabulary/lessons/<lesson_id>` | Nội dung từ của một bài, giữ thứ tự nguồn |
| `/api/vocabulary/words?level=N2&q=人生&page=1&page_size=20` | Tìm từ; tối đa 40 kết quả/trang |
| `/api/vocabulary/words/<word_id>/audio/playback` | URL nghe riêng tư 300 giây; yêu cầu đăng nhập, `Cache-Control: no-store` |

Trình độ chưa được nhập dữ liệu trả danh sách rỗng, trình độ không hợp lệ trả 400,
ID không tồn tại trả 404. Truy vấn tối đa 100 ký tự, `%` và `_` được tìm như ký tự
thường. Lỗi mạng/database trả lỗi có thể thử lại, không giả thành danh sách rỗng.
