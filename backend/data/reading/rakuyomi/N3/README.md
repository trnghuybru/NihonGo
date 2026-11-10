# Rakuyomi N3 — snapshot kiểm tra ngày 06/11/2026

> JSON và báo cáo của snapshot dưới đây đã chuyển sang nhánh `archive/learning-data-2026-11-10`. CSV vẫn ở đây để nhập; xem [khôi phục dữ liệu](../../../ARCHIVE.md).

Nguồn: https://rakuyomi.net/vi/passages/n3

- 209 bài, 429 câu hỏi; mỗi câu có 4 lựa chọn và đáp án nguồn.
- 11 bài có bảng; không phát hiện hình ảnh trong vùng bài đọc đã lấy.
- `N3.json`: nội dung chữ, HTML đã lọc, cấu trúc bảng, câu hỏi/lựa chọn dạng chữ và HTML, nguồn từng bài.
- `N3.csv`: định dạng tương thích với `reading-import` của app.
- `report.json`: thống kê và lỗi thu thập; lần hoàn tất không có bài lỗi.

Đáp án nguồn đánh số từ 0, đã chuyển thành 1–4. Câu hỏi/lựa chọn CSV được bỏ thẻ HTML và furigana phụ; định dạng gạch chân vẫn giữ trong JSON. Bảng trong CSV dùng một dòng cho mỗi hàng và ` | ` ngăn các ô; dùng bản JSON khi triển khai hiển thị bảng đúng bố cục.

Thu thập tuần tự qua trang công khai, không gọi AI. Đã thay kho đọc hiểu local và VPS/staging ngày 06/11/2026: mỗi môi trường có 209 bài N3, 429 câu hỏi. Kho 180 bài cũ cùng lượt làm bài và phân tích đã được sao lưu riêng trước khi xóa; backup không đưa vào Git. Đáp án trong dataset là dữ liệu backend, không đưa nguyên file vào frontend/public.

Chạy từ thư mục `backend` để kiểm tra trước khi nhập:

```bash
venv/bin/flask --app app reading-import data/reading/rakuyomi/N3/N3.csv --dry-run
```

Đây là dữ liệu từ nguồn được ghi trong từng bản ghi, không phải nội dung do NihonGO biên soạn hoặc dữ liệu được xác nhận phát hành theo giấy phép mở.
