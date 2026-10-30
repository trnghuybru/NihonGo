# Nhận dạng chữ viết tay tiếng Nhật

Trong **Tra cứu**, chọn **Viết tay**, viết một ký tự bằng chuột/ngón tay/bút,
hệ thống tự nhận dạng sau khi dừng nét khoảng 300 ms, rồi chọn một trong 5 gợi ý. Ký tự được chọn nối vào cuối nội dung ô tìm kiếm (tối đa 100 ký tự), giữ các chữ đã nhập. Một chữ Hán đơn mở tra cứu Hán tự; chuỗi nhiều ký tự hoặc kana mở tra cứu từ. **Xóa nét** bắt đầu lại, **Đóng viết tay** thoát.
Đây là nhận dạng một ký tự, không phải OCR cả câu hoặc đánh giá thứ tự nét.

## Chạy backend

```sh
cd backend
venv/bin/python -m pip install -r requirements.txt
venv/bin/python app.py
```

Checkpoint nằm tại `models/handwriting/best.pt`, bên ngoài thư mục static và frontend.
Có thể đặt `HANDWRITING_CHECKPOINT=/absolute/path/best.pt` trong `backend/.env`.
Xem [thông tin file model](models/handwriting/README.md).

Model được nạp khi khởi tạo Flask, một lần trên mỗi worker. Thiếu checkpoint hoặc
sai kiến trúc/nhãn/state dict làm backend báo lỗi khi khởi động. Không chuyển sang
model khác. Nạp bằng `torch.load(..., map_location='cpu', weights_only=True)`,
khởi tạo `mobilenet_v3_small(weights=None)`, thay lớp cuối theo 3036 nhãn,
`load_state_dict(strict=True)` và `eval()`. Inference dùng `torch.inference_mode()`.
Ưu tiên CUDA → MPS → CPU; máy triển khai cần wheel PyTorch tương ứng với GPU.
Không dùng Gunicorn `--preload` để khởi tạo GPU trong tiến trình cha; mỗi worker có
model riêng nên chọn số worker theo bộ nhớ thiết bị. Một lock tuần tự hóa inference
trên model dùng chung trong worker. Không lưu ảnh người dùng hoặc ghi ảnh vào log.

## Tiền xử lý

1. Ghép alpha lên trắng; chuyển grayscale.
2. Lấy pixel bốn cạnh, đảo màu khi trung bình <127.5.
3. Mask pixel <200, crop bounding box vùng mực; không có mực trả 422.
4. Resize bilinear giữ tỷ lệ vào 102×102, căn giữa canvas trắng 128×128.
5. Chuyển RGB, ToTensor [0,1], normalize mean `[.485,.456,.406]`, std `[.229,.224,.225]`.

Không augmentation. Softmax trên cả 3036 lớp rồi lấy top 5, ánh xạ bằng thứ tự
`labels[index]['character']`. Score là xác suất model, không phải điểm viết đúng.

## API

`POST /api/kanji/recognize`, JSON, yêu cầu `Authorization: Bearer <access_token>`
theo phiên đăng nhập hiện có, gồm refresh token ở frontend và giới hạn tần suất
các API ghi của dự án.

```json
{"image":"data:image/png;base64,..."}
```

```json
{"predictions":[{"character":"一","score":0.98}],"elapsed_ms":87.88}
```

Response thật luôn có 5 phần tử giảm dần theo score. `elapsed_ms` bao gồm tiền xử lý,
chờ khóa và inference, không bao gồm truyền mạng. Không trả metadata hoặc trọng số model.

Giới hạn: request 1 MiB, PNG giải mã 512 KiB, mỗi cạnh 1–1024 pixel, chỉ PNG tĩnh.
Kích thước được kiểm tra trước khi decode pixel. Lỗi JSON/base64/PNG: 400; chưa đăng nhập:
401; quá giới hạn: 413; ảnh trống: 422; giới hạn tần suất: 429; lỗi inference: 500.
Lỗi trả JSON `{ "error": "Thông báo tiếng Việt", "code": "..." }`, không tiết lộ lỗi nội bộ.

## Kiểm tra

```sh
cd backend
venv/bin/python -m unittest discover -s tests -p test_handwriting.py -v
```

Bộ kiểm tra dùng checkpoint thật; cần provision file trước. Có kiểm tra pipeline,
ảnh alpha/đảo màu, crop/normalize, xác thực, giới hạn, lỗi, top 5, thứ tự nhãn và việc
không nạp lại checkpoint giữa các request. Frontend có `HandwritingLookup.test.tsx`.

Tham khảo API chính thức: [torch.load](https://docs.pytorch.org/docs/stable/generated/torch.load.html),
[MobileNet V3 Small](https://docs.pytorch.org/vision/stable/models/generated/torchvision.models.mobilenet_v3_small.html).

Frontend nhận ảnh sau mỗi nét và debounce 300 ms; luôn cho phép viết tiếp và xóa nét khi request đang chạy. Mỗi popup chỉ có tối đa một request đang xử lý, chỉ giữ ảnh mới nhất trong hàng chờ. Khi bắt đầu nét mới, xóa, chọn ký tự hoặc đóng popup, kết quả cũ bị vô hiệu hóa. Lỗi nhận dạng có nút Thử lại.

Popup dành sẵn 5 ô gợi ý cao 72 px và dòng trạng thái cao 40 px. Khi trống, đang chờ, có kết quả hoặc lỗi, kích thước vùng gợi ý được giữ nguyên để canvas không dịch chuyển trong lúc viết.
