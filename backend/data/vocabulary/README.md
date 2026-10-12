# Dữ liệu giáo trình từ vựng

N5: nguồn https://jtest.net/tu-vung-n5, dataset `jtest-n5.json` giữ 10 chủ đề và
50 bài, **1.050 mục và 3.048 ví dụ** theo các bảng thực tế (tiêu đề nguồn ghi 1000).
Có 1.030 cặp từ/cách đọc khác nhau; không loại bỏ mục lặp khác bài.
Lấy từ, furigana nguồn, nghĩa tiếng Việt, ví dụ chính và ví dụ thêm cùng
bản dịch. Hán Việt không có trong nguồn nên giữ `null`; các ví dụ có bản dịch
trống giữ `meaning_vi: null` và ghi `quality_warnings`.
Nguồn có 4 ví dụ trống bản dịch ở bài về chữ viết; 1 mục có Kanji thiếu cách đọc,
giữ `reading: ""` và ghi cảnh báo, không coi chính Kanji là cách đọc.
Số thứ tự từ tạo theo chapter/bài/dòng; `source.row_number` giữ dòng trong bài,
ID dựa trên chapter/bài/dòng. Giữ nguyên mục lặp ở các bài khác nhau.
Link MP3 riêng từng từ giữ trong `source.audio_url`, chưa tải audio N5 vào RustFS,
API không coi đường dẫn nguồn là audio đã lưu (`has_audio=false`).

Chạy từ thư mục gốc:

```sh
backend/venv/bin/python -m pip install -r backend/scripts/requirements-crawl.txt
backend/venv/bin/python backend/scripts/crawl_jtest_n5.py --delay 3
```

Crawler kiểm tra robots.txt, chỉ tải tuần tự bài công khai trên jtest.net,
không chạy script, khoảng cách tối thiểu 2 giây. Cache mặc định
`datn-jtest-n5-cache` trong thư mục tạm Python; chạy lại dùng cache, có thể chọn
`--cache-dir`. Khi lỗi hoặc yêu cầu xác minh, dừng và lưu `.partial.json`, không
ghi đè dữ liệu đầy đủ đã có. Không tự vượt xác minh. Dataset N5 chỉ đánh dấu đầy đủ
khi tải đủ 50 bài; importer từ chối dataset chưa đầy đủ.
Số lượng trong `counts` phản ánh số dòng thực tế, không lấy số 1000 trên tiêu đề
làm số lượng bắt buộc. Nguồn chưa hiệu đính; xuất xứ không phải giấy phép sử dụng.

Nhập trong `backend`:

```sh
venv/bin/flask --app app vocabulary-import --source data/vocabulary/jtest-n5.json
```

Mở **Bài học → N5** trong app. Tra cứu thường vẫn dùng N2, độc lập trình độ bài học.

N1: `mimikara-n1.json` trích từ `Mimikara_Oboeru_N1_T_Vng.apkg` người dùng cung cấp:
**1.200 mục, 1.200 ví dụ kèm bản dịch, 48 bài × 25 mục**. Giữ thứ tự note ID
tăng dần và giữ 7 mục lặp (1.193 cặp từ/cách đọc khác nhau). Các bài do app chia,
không khẳng định là chương nguyên bản trong giáo trình. Nhãn từ loại giữ trong
`source.tags`; deck gốc tên `N2::Mimi N1`, trình độ N1 theo file và xác nhận của
người dùng. Trường `Back` là từ tiếng Nhật, `Front` là nghĩa tiếng Việt,
`KATAKANA` là cách đọc; không suy đoán chiều mặt thẻ từ tên trường.

Gói có 816 file media phục vụ 820 tham chiếu audio, đã kiểm tra đều tồn tại.
Tham chiếu tên file/thành viên ZIP nằm trong `source.audio`. Lệnh nhập audio riêng
đã upload RustFS và gắn 820 mục với 810 object khác nhau theo hash nội dung;
380 mục không có audio. Xem [hướng dẫn audio](../../VOCABULARY.md#audio-từ-vựng-n1).
Hán Việt `—` được chuyển thành `null`. Giữ ví dụ và bản dịch nguồn, chưa hiệu đính.

Tái tạo từ thư mục gốc (thư viện chuẩn Python):

```sh
backend/venv/bin/python backend/scripts/extract_n1_anki.py \
  --apkg /path/to/Mimikara_Oboeru_N1_T_Vng.apkg
```

Nhập trong thư mục `backend`:

```sh
venv/bin/flask --app app vocabulary-import --source data/vocabulary/mimikara-n1.json
```

Mở **Bài học → N1** trong app. Không chạy template/script Anki hay sao chép tiến độ ôn tập.

Nhập audio trong `backend` sau khi RustFS đã chạy:

```sh
venv/bin/flask --app app vocabulary-audio-import \
  --apkg /path/to/Mimikara_Oboeru_N1_T_Vng.apkg
```

Nhấn icon loa cạnh từ có audio để nghe. File được giữ trong RustFS/S3, metadata
liên kết trong PostgreSQL; JSON nguồn không chứa URL ký hoặc khóa object runtime.

N4: `anki-n4.json` trích từ `T_Vng_N4.apkg` người dùng cung cấp, gồm **728 mục từ,
728 ví dụ có bản dịch, 7 nhóm và 31 bài**. Nhóm danh từ, động từ, tính từ i/na,
trợ từ, trạng từ và Katakana giữ theo deck gốc. Bài được ứng dụng chia tối đa
25 mục, không phải chương của giáo trình. Giữ mọi note kể cả từ xuất hiện ở nhiều
nhóm; không khẳng định có 728 từ khác nhau. ID dựa trên note ID, xuất xứ lưu
SHA-256, note ID và tên deck; số thứ tự được tạo theo note ID tăng dần.

23 mục trợ từ thiếu cách đọc; dùng cách viết kana của chính mục đó, không đoán
cách đọc Kanji. Nội dung nguồn giữ nguyên, chỉ bỏ HTML định dạng và nối dòng;
không chạy template/script Anki. File không có media/audio. Tái tạo từ thư mục gốc:

```sh
backend/venv/bin/python backend/scripts/extract_n4_anki.py --apkg /path/to/T_Vng_N4.apkg
```

Trong thư mục `backend`, nhập bằng:

```sh
venv/bin/flask --app app vocabulary-import --source data/vocabulary/anki-n4.json
```

Script chỉ dùng thư viện chuẩn Python, ưu tiên `collection.anki21` vì
`collection.anki2` trong gói này là dữ liệu placeholder. Không sao chép lịch ôn,
tiến độ học hay file `.apkg` vào repository. Tra cứu thường hiện vẫn dùng N2;
N4 được mở qua **Bài học → N4**.

Nguồn Mimi kara N2: https://www.vnjpclub.com/mimi-kara-n2-goi/

Nguồn Mimi kara N3: https://www.vnjpclub.com/mimikara-n3-tu-vung/

N3 đã hoàn tất trong `mimikara-n3.json`: **12 Unit, 66 bài, 880 từ,
1.991 ví dụ và 833 mục liên quan**. Đã nhập PostgreSQL và có thể chọn N3 trong app.
772 từ thuộc 58 bài tải được từ website giữ nguyên. 108 từ thuộc 8 bài còn thiếu
được bổ sung từ PDF người dùng cung cấp và xác nhận được phép sử dụng:
`[Tiengnhatcoban.net]_tong-hop-tu-vung-mimikara-n3.pdf` (36 trang).
Mỗi từ bổ sung lưu tên file, SHA-256 và trang PDF trong `source`; không ghi nhận
các bài này là đã crawl từ website. `coverage.complete=true` và số thứ tự 1–880
đủ, không trùng. File `mimikara-n3.partial.json` vẫn giữ phiên bản crawl 772 từ.

Hai từ số 813 (`オフィス`) và 838 (`煮える`) không có ví dụ trong PDF; giữ
`examples: []` và ghi `quality_warnings`. Các ví dụ bổ sung giữ nguyên nội dung,
chỉ bỏ ngắt dòng do bố cục. PDF có lỗi gõ; chưa hiệu đính (`source_review.proofread=false`).
Không tự tạo ví dụ hoặc furigana câu. Khi cột cách đọc Katakana trống, dùng chính
cách viết Katakana và ghi phương thức này trong `source.reading_method`.

Chỉ mục N3 có 12 Unit, gồm 63 bài chính/Katakana A/B và ba trang tổng hợp
`unit-2-a.html`, `unit-3-a.html`, `unit-11-a.html`. Sau khi kiểm tra số thứ tự từ
trong các bài chính, crawler đã bổ sung ba trang tổng hợp vào phạm vi tải:
chúng được xếp cuối Unit 2, 3 và 11. Đã đối chiếu nội dung trang tổng hợp Unit 2;
hai trang tổng hợp còn lại và các bài thiếu đã được bổ sung bằng PDF theo
khoảng số thứ tự được đối chiếu với chỉ mục.

Dataset N2 hiện tại gồm **13 Unit, 89 bài, 1.160 từ, 3.232 ví dụ và 1.698 mục liên quan**.
Đã kiểm tra số thứ tự từ liên tục từ 1 đến 1160, không trùng hoặc thiếu số;
toàn bộ 89 bài có URL audio nguồn. `coverage.complete` là `true`.
Nguồn thiếu bản dịch của 2 mục liên quan ở từ số 1099; các mục này giữ
`meaning_vi: null` và được ghi trong `quality_warnings`, không tự thêm bản dịch.

`mimikara-n2.json` và `mimikara-n3.json` là nguồn nhập của chức năng UC-V1. Dữ liệu chạy ứng dụng được
lưu trong PostgreSQL qua lệnh `flask --app app vocabulary-import`; xem [hướng dẫn](../../VOCABULARY.md).
Nếu có bài không truy cập được, crawler xuất `mimikara-n2.partial.json` kèm danh sách lỗi
trong `coverage.failures`, và kết thúc với mã lỗi. File đầy đủ trước đó được giữ nguyên.
Cấu trúc: `textbook` → `units[]` → `lessons[]` → `words[]`. Trình độ gắn với giáo trình;
không gán riêng cho từng từ vì giáo trình có thể chứa từ đã học ở trình độ thấp hơn.

Mỗi bài giữ tiêu đề, thứ tự, link nguồn và `audio_urls`. Mỗi từ giữ số thứ tự gốc,
từ tiếng Nhật, cách đọc, Hán Việt, nghĩa tiếng Việt, `examples` và `related`.
`segments` lưu chữ và furigana riêng để hiển thị ruby; `reading` ghép cách đọc với okurigana.
Các mục liên quan giữ nguyên nhãn và cụm từ gốc, không tự suy đoán hay tách thành từ độc lập.

Audio chỉ lưu URL nguồn của **cả bài**, không phải audio riêng từng từ. Không tải file audio
vào RustFS/S3. Nghĩa và ví dụ giữ nguyên từ nguồn, cần biên tập nếu có lỗi dịch.
Link nguồn là thông tin xuất xứ, không phải giấy phép sử dụng lại nội dung.

Tái tạo N3 từ PDF (thư mục gốc dự án, không gọi mạng):

```sh
backend/venv/bin/python -m pip install -r backend/scripts/requirements-pdf.txt
backend/venv/bin/python backend/scripts/supplement_mimikara_n3_pdf.py \
  --pdf '/path/to/[Tiengnhatcoban.net]_tong-hop-tu-vung-mimikara-n3.pdf' \
  --index-html /path/to/cached-n3-index.html
```

Script dùng `mimikara-n3.partial.json` làm dữ liệu nền, chỉ bổ sung các bài thiếu.
`--index-html` là HTML chỉ mục N3 đã cache; nếu bỏ tham số này, dùng chỉ mục trong
cache crawler mặc định. Cần giữ bản sao chỉ mục trước khi hệ thống dọn thư mục tạm.
Không đưa PDF cá nhân vào repository. 8 bài bổ sung không có URL audio từ PDF.

Chạy từ thư mục gốc dự án:

```sh
backend/venv/bin/python -m pip install -r backend/scripts/requirements-crawl.txt
backend/venv/bin/python backend/scripts/crawl_mimikara_n2.py
```

Crawler đọc trang công khai, kiểm tra robots.txt, tải tuần tự với khoảng cách tối thiểu
1 giây, có timeout và thử lại khi lỗi tạm thời. Chế độ HTTP không thực thi JavaScript;
HTML được mã hóa để trình duyệt hiển thị được giải mã theo bộ định dạng công khai của trang.
Nếu nội dung thiếu hoặc cấu trúc thay đổi, crawler báo lỗi và giữ nguyên dataset đầy đủ đã có.
Khi gặp 403/429 hoặc trang xác minh, ngừng gửi request mới, vẫn xử lý bài đã có
trong cache và xuất file `.partial.json`. Nếu robots.txt/chỉ mục không truy cập
được, kết thúc ngay và giữ nguyên cả dữ liệu đầy đủ lẫn dữ liệu tạm trước đó.

HTML được cache trong thư mục tạm `datn-mimikara-n2-cache`. Chạy lại sẽ dùng cache để
tiếp tục sau lỗi mạng. Để lấy phiên bản mới, dùng một thư mục cache mới, ví dụ:

```sh
backend/venv/bin/python backend/scripts/crawl_mimikara_n2.py \
  --cache-dir /tmp/datn-mimikara-n2-refresh
```

Khi website cho truy cập lại, chạy tiếp N3 từ thư mục gốc dự án:

```sh
backend/venv/bin/python backend/scripts/crawl_mimikara_n3.py --delay 15
```

Cache mặc định là `datn-mimikara-n3-cache` trong thư mục tạm do Python xác định
(trên macOS thường nằm dưới `/var/folders`, không nhất thiết là `/tmp`). Dùng lại
cùng cache để không tải lại bài đã có. Có thể truyền `--cache-dir` để chọn vị trí
khác. Crawler N3 mặc định cách nhau 5 giây; không tự vượt bước xác minh của website.
Có thể dùng Chrome/Chromium và Node.js 22+ để trang công khai tự chạy JavaScript
trong profile riêng, không đọc cookies/profile cá nhân:

```sh
backend/venv/bin/python backend/scripts/crawl_mimikara_n3.py --browser --delay 30
```

Để thử từ bài cuối lên đầu, thêm `--reverse`; dữ liệu xuất ra vẫn được sắp theo
Unit/bài đúng thứ tự nguồn:

```sh
backend/venv/bin/python backend/scripts/crawl_mimikara_n3.py --reverse --delay 30
```

Đổi thứ tự tải không thay thế bước kiểm tra robots.txt hoặc xác minh của website.

Chế độ này vẫn kiểm tra robots.txt bằng HTTP trước khi mở các bài, chỉ tải trang
còn thiếu và giữ khoảng cách tối thiểu 30 giây. Có thể truyền
`--browser-executable /path/to/chrome`. Khi nguồn báo giới hạn hoặc xác minh không
hoàn tất, dừng Chrome và xuất dữ liệu tạm từ cache, không tự chuyển sang HTTP để
tải lại các trang bị chặn. Chế độ trình duyệt không giải quyết được giới hạn truy cập
của website.
Sau khi lệnh thành công và có `mimikara-n3.json` đầy đủ, nhập trong thư mục `backend`:

```sh
venv/bin/flask --app app vocabulary-import --source data/vocabulary/mimikara-n3.json
```

ID của N3 có tiền tố `mimikara-n3`, tách biệt N2. API/app hiện có hỗ trợ duyệt N3
theo trình độ nên không cần đổi giao diện để hiển thị dữ liệu sau khi nhập đầy đủ.
Importer từ chối file `.partial.json` có `coverage.complete=false`.

Kiểm tra parser (trong thư mục `backend`):

```sh
venv/bin/python -m unittest discover -s tests -p test_vocabulary_crawler.py -v
```
