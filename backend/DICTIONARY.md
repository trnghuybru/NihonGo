# Từ điển từ vựng và Hán tự

Màn **Tra cứu** có ba tab: **Từ vựng**, **Hán tự**, **Video**. Home mở từ điển
từ vựng trước; Video dùng kho ví dụ phụ đề hiện có, không tìm toàn bộ YouTube.
Tra cứu nhanh trong bài học mở cùng module. Bấm từ trong shadowing mở popup nhỏ,
lấy các nhóm nghĩa qua cùng API từ điển; video dừng và không tự phát lại khi đóng.

Tìm từ tự mở chi tiết kết quả đầu tiên trong vùng chính. Web có cột phụ cho kết
quả khớp, Hán tự cấu thành và từ vựng liên quan; điện thoại xếp các khối này bên
dưới. Các ứng viên khớp gần và mục JMdict liên quan được trình bày ở phần từ liên
quan, không trải thành danh sách thẻ lớn. Nhấn ứng viên thay từ chính và giữ ngữ
cảnh tra cứu để quay lại. Nếu không có kết quả thì không gọi API chi tiết từ.

Tab Hán tự cũng tự mở chi tiết chữ đầu tiên, với cột kết quả để chuyển chữ.
Tra từ có nhiều chữ Hán trả các chữ theo thứ tự xuất hiện, bỏ chữ lặp.
Chi tiết trình bày Kunyomi, Onyomi bên cạnh sơ đồ nét đánh số; số nét, bộ thủ
và tần suất lấy từ nguồn. Không hiện nghĩa Anh, cách đọc theo tên hoặc mô tả
thừa về đánh số nét. Từ ghép chỉ hiện nghĩa Việt có sẵn. Mobile xếp các khối dọc. Sơ đồ KanjiVG tự viết lần lượt từng nét khi mở chữ, chỉ có nút phát lại nhỏ ở góc,
dùng dữ liệu đường nét đã lưu; không tải
thêm dữ liệu hoặc gọi API ngoài khi phát animation.

## Dữ liệu và xuất xứ

| Nguồn | Nội dung | Bản đã nhập ngày 18/10/2026 |
| --- | --- | --- |
| [JMdict, EDRDG](https://www.edrdg.org/wiki/JMdict-EDICT_Dictionary_Project.html) | Cách viết, cách đọc, từ loại, các nhóm nghĩa tiếng Anh | 218.927 mục |
| [Wiktionary tiếng Việt, qua Kaikki/Wiktextract](https://kaikki.org/viwiktionary/) | Định nghĩa Việt của mục tiếng Nhật, gồm cả tên riêng; loại mục rỗng và chỉ Latinh hóa | 6.272 mục |
| [KANJIDIC2, EDRDG](https://www.edrdg.org/kanjidic/kanjd2index.html) | Hán tự, On/Kun, âm Hán Việt, nghĩa, bộ thủ, số nét | 13.108 chữ |
| [KanjiVG, Ulrich Apel](https://kanjivg.tagaini.net/) | Đường nét SVG và thứ tự nét, bản `r20260714` | 6.417 sơ đồ khớp KANJIDIC2 |

JMdict/KANJIDIC2 tuân theo [EDRDG Dictionary Licence](https://www.edrdg.org/edrdg/licence.html).
KanjiVG có giấy phép [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/).
Wiktionary tiếng Việt giữ [ghi công và giấy phép của Wiktionary](https://vi.wiktionary.org/wiki/Wiktionary:Bản_quyền).
Mỗi mục giữ URL trang gốc để tra lịch sử tác giả. Bản nhập chỉ chuẩn hóa cấu trúc,
giữ định nghĩa và cách đọc nguồn, bổ sung cách đọc JMdict nếu từ chính khớp duy nhất.
Sơ đồ chỉ chuyển từ SVG thành danh sách path để vẽ lại; không thay đổi hình nét.
Ghi công/giấy phép được giữ trong DB và tài liệu dự án; giao diện đã bỏ mục **Nguồn dữ liệu**, không đặt khối nguồn,
tên giáo trình hay thông báo hiệu đính trong thẻ nghĩa và thẻ Hán tự.

Tra cứu từ vựng, từ liên quan và từ ghép Hán tự dùng JMdict và Wiktionary tiếng Việt. Dữ liệu giáo trình
phục vụ Bài học; các mục `local:` đã nhập trước đây vẫn giữ trong DB nhưng bị loại
khỏi API từ điển, kể cả khi truy cập trực tiếp ID. Lịch sử nhập 4.738 cặp từ/cách
đọc giáo trình không phản ánh số mục đang dùng để tra cứu.

Bản `JMdict_e` có nghĩa Anh; không có bản nghĩa Việt chính thức của JMdict.
Nghĩa Việt ưu tiên nguồn Wiktionary độc lập; phần thiếu có thể bổ sung bằng bộ
nghĩa Việt bổ sung đã được dịch trước và lưu trong DB. Không lấy nghĩa giáo trình.
Độ phủ nguồn Việt nhỏ hơn JMdict, nhiều mục là tên riêng; không coi 6.272 mục là
6.272 từ vựng thông dụng. Khi tra Nhật/kana/romaji, ưu tiên mục Việt cùng cặp từ/cách
đọc; mục chưa có nghĩa Việt vẫn hiển thị nghĩa Anh có nhãn. Giữ nguyên các nhóm
nghĩa độc lập, không ghép bản dịch Việt vào một nghĩa JMdict theo phỏng đoán.
Chế độ **Tự động** nhận Nhật/kana/romaji/Việt/Anh. Chọn **Việt → Nhật** để chỉ tìm
nghĩa Việt và tránh nhầm từ không dấu như `an` với romaji. Âm Hán Việt
của KANJIDIC2 vẫn tìm được bằng tiếng Việt, nhưng không phải bản dịch nghĩa Việt.
Không hiển thị chỉ số JLPT cũ của KANJIDIC2 như các cấp N1–N5 hiện hành.

Mỗi file nhập lưu tên, SHA-256, số mục và thời điểm trong `dictionary_sources`.
Dữ liệu lớn lưu PostgreSQL, không đóng gói vào bundle JS và không commit các file tải.

## Cài đặt và nhập dữ liệu

Trong `backend`, sau khi cấu hình `.env` và PostgreSQL:

```sh
venv/bin/flask --app app db upgrade
```

Migration thêm bảng riêng và chỉ mục GIN `pg_trgm`. Tài khoản chạy migration phải
có quyền bật extension này; trên hệ thống được quản lý có thể nhờ DBA bật trước.

Tải file chính thức vào thư mục do bạn quản lý. Ví dụ trong `backend`:

```sh
curl -fL https://www.edrdg.org/pub/Nihongo/JMdict_e.gz -o /tmp/JMdict_e.gz
curl -fL https://www.edrdg.org/kanjidic/kanjidic2.xml.gz -o /tmp/kanjidic2.xml.gz
curl -fL https://github.com/KanjiVG/kanjivg/releases/download/r20260714/kanjivg-20260714.xml.gz -o /tmp/kanjivg.xml.gz
curl -fL https://kaikki.org/viwiktionary/raw-wiktextract-data.jsonl.gz -o /tmp/viwiktionary.jsonl.gz

venv/bin/flask --app app dictionary-import \
  --jmdict /tmp/JMdict_e.gz \
  --kanjidic /tmp/kanjidic2.xml.gz \
  --kanjivg /tmp/kanjivg.xml.gz \
  --vietnamese /tmp/viwiktionary.jsonl.gz
```

Từng tùy chọn cũng chạy độc lập. Nhập KANJIDIC2 trước KanjiVG.
`--vietnamese` nhận JSONL hoặc JSONL.gz của bản trích xuất **Wiktionary tiếng Việt**,
lọc `lang_code=ja` và giữ mục có định nghĩa. Nhập sau JMdict để bổ sung cách đọc
khớp duy nhất; không suy đoán cách đọc khi từ có nhiều cách đọc khác nhau.
Tùy chọn cũ
`--vocabulary` chỉ còn tương thích với dữ liệu tham chiếu lịch sử, không dùng
trong quá trình cài đặt từ điển và không làm mục giáo trình xuất hiện trong tra cứu.
Không cần API key, không gọi mạng/AI trong lúc tra cứu. Cần backend có kết nối
PostgreSQL; bản đầu chưa hỗ trợ từ điển offline trên điện thoại.

Importer cập nhật theo ID ổn định, không tạo thêm mục khi nhập lại; toàn bộ lần
chạy nằm trong một transaction. Lỗi XML/file/DB rollback lần chạy. Nhập lại metadata
Hán tự vẫn giữ sơ đồ đã có. Không tự xóa các mục đã biến mất khỏi một bản nguồn mới.
Nguồn được cập nhật hằng ngày có thể thay số lượng; giữ bản tải cùng checksum nếu
cần tái tạo chính xác snapshot. Sao lưu PostgreSQL để lưu dữ liệu sau khi `/tmp` bị dọn.

## Nghĩa Việt đã lưu

Đợt xử lý đã hoàn tất: 213.892 mục JMdict có bản dịch Việt, tổng 248.099 nhóm
nghĩa Việt; 5.719 nhóm giữ nghĩa Anh vì model trả lại nguyên nội dung nguồn.
Đây là bản dịch máy chưa hiệu đính. Nguồn OPUS-MT, phiên bản và giấy phép được
lưu trong DB và tài liệu dự án.

Ứng dụng chỉ đọc kết quả PostgreSQL, không tải model hay chạy dịch khi tra cứu.
Mã CLI dịch, model, tokenizer, cache, log và thư viện dịch đã được dọn khỏi dự án.
Giữ gloss Anh gốc, cách viết/đọc, từ loại và giới hạn áp dụng. Gloss Việt bổ sung
có `machine: true`; metadata `sense.translation` giữ xuất xứ của dữ liệu đã nhập.
Giao diện ưu tiên nghĩa Việt, không có nút xem nghĩa Anh gốc. Nhóm chưa có nghĩa
Việt vẫn giữ nghĩa Anh có nhãn. Nhãn từ loại JMdict được Việt hóa tại giao diện;
thuật ngữ và nghĩa Anh trong DB vẫn được giữ để phục vụ các ngôn ngữ sau này.

Nhập lại JMdict giữ nghĩa Việt của nhóm nghĩa nguồn không đổi; nếu nghĩa nguồn
thay đổi thì không gắn bản dịch cũ vào nghĩa mới. Chỉ mục `meaning_vi` phục vụ tra
Việt → Nhật. Sao lưu PostgreSQL để bảo toàn bản dịch; nhập file JMdict tiếng Anh
vào DB trống sẽ không tự tạo lại nghĩa Việt đã bổ sung.

## API

Tất cả endpoint cần phiên đăng nhập hợp lệ:

| Endpoint | Công dụng |
| --- | --- |
| `GET /api/dictionary/words?q=学校&page=1` | Tìm từ, không giới hạn giáo trình/JLPT; phân biệt exact/prefix/contains |
| `GET /api/dictionary/words?q=nhat%20ban&language=vi` | Chỉ tìm nghĩa Việt, có dấu hoặc không dấu |
| `GET /api/dictionary/words/<id>` | Các cách viết/đọc, nhóm nghĩa, ví dụ, nguồn, Hán tự kèm cách đọc/Hán Việt và mục JMdict liên quan |
| `GET /api/dictionary/kanji?q=học&page=1` | Tìm chữ, âm Hán Việt, On/Kun hoặc nghĩa nguồn |
| `GET /api/dictionary/kanji/学` | Thông tin chữ, sơ đồ và tối đa 20 từ chứa chữ |
| `GET /api/dictionary/sources` | Nguồn, giấy phép, phiên bản nhập và số lượng |

Tìm kiếm chuẩn hóa NFKC, Katakana → Hiragana, không phân biệt hoa/thường và dấu
tiếng Việt; giữ phân biệt dakuten/handakuten. Romaji Hepburn cơ bản và một số biến
thể bàn phím chuyển sang kana, ví dụ `gakkou` → `がっこう`. Chưa hỗ trợ đầy đủ macron,
biến thể trường âm hoặc đưa động từ đã chia về dạng từ điển.

Ưu tiên cách viết/cách đọc khớp chính xác, rồi khớp đầu, rồi khớp chứa/nhóm nghĩa.
Hán tự ưu tiên chữ chính xác, âm đọc khớp nguyên mục và thứ hạng thông dụng nguồn.
Ký tự `%`/`_` được tìm như ký tự thường. Tối đa 100 ký tự, 40 mục/trang, 1.000 trang.

Kết quả gồm JMdict và Wiktionary tiếng Việt, gộp preview cùng cặp cách viết/cách đọc
chính và ưu tiên nghĩa Việt ở cùng độ khớp. Mục giáo
trình không được trộn vào nghĩa, ví dụ, kết quả hay từ liên quan của từ điển.
Giữ các giới hạn cách viết/cách đọc của từng nghĩa và của từng cách đọc trong JMdict.

## Kiểm thử

```sh
venv/bin/python -m unittest discover -s tests -p test_dictionary.py -v
```

Mặc định dùng SQLite in-memory. Đặt `TEST_DATABASE_URL` tới PostgreSQL để chạy
trong schema tạm riêng, tự xóa schema sau test. Frontend có kiểm thử luồng tra cứu,
đi từ vựng → Hán tự → từ ghép → quay lại, phân trang, lỗi/thử lại và popup shadowing.

## Lịch sử tra cứu gần đây

Migration `d7e8f901a2b3` thêm `dictionary_history`, mỗi tài khoản giữ tối đa 30 mục.
`GET /api/dictionary/history` trả danh sách mới nhất trước; `POST` nhận
`{kind: "word" | "kanji", target: <entry_id hoặc literal>}` để ghi mục đã xem;
`DELETE` xoá lịch sử của người đăng nhập. Backend kiểm tra mục từ có thật,
tạo preview từ DB, đưa mục trùng lên đầu và khoá theo tài khoản khi ghi/xoá.
Lịch sử không dùng chung giữa tài khoản. Ghi/xoá có quota riêng, không tiêu quota đăng nhập.

Web/app hiện lịch sử dạng dropdown ngay dưới input khi focus, lọc theo chữ đang nhập,
cuộn tối đa 30 mục; chọn mở đúng chi tiết. Bấm ra ngoài, Escape hoặc gửi tìm kiếm đóng dropdown. Chỉ ghi sau khi tải chi tiết thành công,
kể cả popup shadowing; GET dữ liệu, gõ tìm kiếm, lỗi và kết quả rỗng không ghi.
