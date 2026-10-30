# Checkpoint nhận dạng chữ viết tay

Đặt checkpoint tại `backend/models/handwriting/best.pt` (đã chuyển từ `backend/best.pt`).
Đây là tài nguyên chỉ dành cho server, được bỏ qua bởi Git, không nằm trong `static`
và không được đóng gói vào frontend. Khi triển khai, provision file vào đường dẫn này
hoặc đặt biến môi trường `HANDWRITING_CHECKPOINT` thành đường dẫn tuyệt đối khác.

Checkpoint hiện tại:

- Kiến trúc `mobilenet_v3_small`, đầu vào RGB 128×128, 3036 nhãn đúng thứ tự trong checkpoint.
- SHA-256: `9f0922067a0d8da639de174615cae2b71805cf2a1a816b6903ef5521b55f1106`.
- Không tải ImageNet, không train lại, không có endpoint tải checkpoint.

Xem [tích hợp và API](../../HANDWRITING.md).
