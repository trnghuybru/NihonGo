> Các file CSV/JSON nguồn đã chuyển hết sang nhánh `archive/learning-data-2026-11-10`. Thư mục này chỉ giữ tài liệu; cần khôi phục nguồn trước khi chạy các lệnh nhập bên dưới.

# Kho đọc hiểu Rakuyomi

Snapshot kiểm tra ngày 06/11/2026:

| Trình độ | Bài đọc | Câu hỏi hợp lệ | Bài có bảng |
| --- | ---: | ---: | ---: |
| N3 | 209 | 429 | 11 |
| N2 | 233 | 443 | 5 |
| N1 | 261 | 602 | 3 |
| Tổng | 703 | 1474 | 19 |

Mỗi thư mục trình độ giữ CSV để nhập. JSON định dạng nguồn, báo cáo thu thập và bộ CSV ghép `N2-N1` đã chuyển sang nhánh `archive/learning-data-2026-11-10`; xem [hướng dẫn khôi phục](../../ARCHIVE.md).

Thu thập qua HTML công khai, có cache và giới hạn tốc độ; không gọi AI. Đáp án nguồn từ 0 được đổi thành 1–4; đã kiểm tra đủ 1474 câu bằng bộ chấm hiện tại, không lệch lựa chọn. Giữ nguồn từng bài. Không đặt các file có đáp án vào frontend/public.

N2/N1 được nhập bổ sung, giữ nguyên N3 và lịch sử học hiện có. Trước khi nhập có sao lưu riêng ba bảng đọc hiểu; backup không đưa vào Git. Kho cũ 180 bài không còn là dữ liệu đang dùng.

VPS/staging giữ đủ kho trên. Riêng database local đã rút gọn còn 15 bài để kiểm thử: một bài cho mỗi dạng ở từng trình độ (N3: 4, N2: 5, N1: 6). CSV nguồn vẫn giữ đầy đủ; JSON được lưu ở nhánh lưu trữ; kho local trước khi rút gọn đã được sao lưu riêng.
