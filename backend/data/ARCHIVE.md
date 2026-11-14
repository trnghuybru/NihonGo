# Lưu trữ dữ liệu nguồn

Nhánh GitHub: [`archive/learning-data-2026-11-10`](https://github.com/trnghuybru/NihonGo/tree/archive/learning-data-2026-11-10).
Nhánh giữ toàn bộ source, dữ liệu từ vựng, đọc hiểu, phụ đề, game và tài liệu skill
được Git theo dõi tại thời điểm lưu. Đây không phải backup database, tài khoản,
lịch sử học, bản thu hay file bí mật.

## Dữ liệu giữ ở local

- `video_examples/cjtmDEG-B7U.ja.json`: nguồn mặc định của importer và test.
- Các file hướng dẫn, tài liệu skill, prompt, migration và seed trong code.

Các JSON từ vựng N1–N5, bản N3 tạm và bộ từ Công thành đã được bỏ khỏi
checkout sau khi nhập database. Công thành hiện truy vấn bảng từ vựng;
importer yêu cầu `--source` khi cần nhập lại. File JSON có thể khôi phục từ lịch sử Git.

## File chuyển sang nhánh lưu trữ

64 file, 17.437.510 byte: Toàn bộ CSV đọc hiểu, CSV ghép N2–N1,
JSON nguồn/báo cáo Rakuyomi, bản crawl N5 dở dang, bản SRT trùng JSON và snapshot
playlist video cũ. Danh sách, kích thước và SHA-256 nằm trong
[`data_cleanup_manifest.json`](../../deploy/beta/data_cleanup_manifest.json).
Các file này không được runtime hay test hiện tại đọc; dữ liệu đã nhập trong
database không bị thay đổi. Crawler vẫn có thể tạo lại đầu ra khi chạy thủ công.

Khôi phục một file (từ thư mục gốc repo):

```sh
git fetch origin archive/learning-data-2026-11-10
git restore --source=origin/archive/learning-data-2026-11-10 -- backend/data/reading/JLPT_Dokkai_N5-N1.csv
```

Xem trước hoặc dọn đúng danh sách đã lưu:

```sh
python3 deploy/beta/cleanup_unused_data.py
python3 deploy/beta/cleanup_unused_data.py --apply
```

Script kiểm tra toàn bộ checksum trước khi xoá. Nếu VPS có file cùng tên nhưng
nội dung khác, script dừng để lưu riêng; không xoá file ngoài danh sách, model,
cache đang dùng, database, bản thu, cookie, key hay các bản backup.

## Dọn VPS ngày 10/11/2026

Nhánh archive có thêm `archive/vps/imports/` (25 file, 9.131.245 byte), được
đẩy thành công ở commit `f031e5a` trước khi dọn máy chủ. Inventory/checksum và
quyết định giữ/xoá nằm ở
[`archive/vps/manifest.json`](https://github.com/trnghuybru/NihonGo/blob/archive/learning-data-2026-11-10/archive/vps/manifest.json).

VPS không có thư mục `backend/data`; runtime dùng database. Đã xoá 9 file
(6.938.785 byte) sau khi đối chiếu checksum: hai bộ nguồn nhập đọc hiểu tạm
trong `imports/reading-*-20261106/`, script nhập dùng một lần, gói tar chuyển
nguồn và báo cáo playlist đã bị thay thế. Không xoá backup database.

Giữ `imports/bitesize-under30/` cùng script nhập playlist: batch đang tạm dừng
vì `source_rate_limited`, chưa hoàn thành. Manifest, báo cáo hiện tại và phụ đề
cache cần giữ để tiếp tục nhập. Không thay đổi database, cấu hình, model hay
dịch vụ. Các file nguồn đầy đủ có thể khôi phục từ nhánh archive.
