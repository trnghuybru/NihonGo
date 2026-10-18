# Phương án VPS cho 50 người dùng thử

Ngày: 13/10/2026. Đây là kế hoạch, chưa thuê server hoặc triển khai.

## Quy mô và cấu hình

50 tài khoản thử nghiệm; mục tiêu ban đầu 5–10 người dùng đồng thời, không giả định
50 phiên AI đồng thời. Capacity này cần xác nhận bằng kiểm thử tải trước khi mời đủ
50 người. Database local đã kiểm tra khoảng 31 MB, 52 video và 5.018 từ vựng.
Video phát từ YouTube, không lưu/phát lại toàn bộ video trên VPS.

Phương án chính: DigitalOcean Basic Regular, Singapore SGP1, 4 vCPU shared,
8 GiB RAM, 160 GiB SSD, 5.000 GiB transfer, $48/tháng. Dùng Ubuntu 24.04 LTS x86_64,
Docker Compose; backend, PostgreSQL và một worker trên cùng máy.

Phương án tiết kiệm: Basic Regular 2 vCPU shared, 4 GiB RAM, 80 GiB SSD,
4.000 GiB transfer, $24/tháng. Chỉ chọn khi hạn chế worker, không chạy Whisper và
kiểm thử cho thấy RAM còn đủ. Giới hạn worker local hiện tại là 4 GB; không giữ
nguyên giới hạn đó khi chạy chung database/API trên máy 4 GB.

Giá tham khảo: [DigitalOcean Droplets](https://www.digitalocean.com/pricing/droplets).
Khu vực: [Regional availability](https://docs.digitalocean.com/platform/regional-availability/).
Không tính credit khuyến mại, thuế hoặc giá tên miền cụ thể.

## Kiến trúc triển khai

App -> HTTPS api.<domain> -> Caddy -> backend qua Gunicorn.
Backend và worker kết nối PostgreSQL, ElasticMQ bằng mạng Docker nội bộ.
App phát video trực tiếp từ YouTube. Backend gọi Gemini; Live ban đầu giữ luồng
token tạm hiện có, nhưng cần kiểm soát quota trước beta rộng hơn.
Audio và các file backup database lưu trong DigitalOcean Spaces SGP1,
qua cấu hình S3-compatible hiện có. Bucket backup và bucket audio tách quyền.

Không cần thuê load balancer, managed database hay một máy queue riêng cho đợt này.
Caddy làm HTTPS/reverse proxy. PostgreSQL/ElasticMQ chỉ truy cập nội bộ; không
publish cổng ra internet. Không chạy Mailpit, RustFS hoặc LocalStack cho bản beta.
Mailpit phải được thay bằng SMTP thật để người thử nghiệm nhận thư xác minh.
CDN chỉ áp dụng nội dung public phù hợp; không cache API tài khoản/transcript
hoặc công khai audio cá nhân.

Một VPS là điểm lỗi chung: khi máy hỏng hoặc bảo trì, app có thể tạm gián đoạn.
Backup giúp khôi phục, không tạo high availability. Đây là lựa chọn cho thử nghiệm.

## Dự toán hạ tầng theo tháng

| Khoản | Máy 4 GB | Máy 8 GB đề xuất |
|---|---:|---:|
| VPS | $24 | $48 |
| Backup máy hàng tuần, 20% giá VPS | $4,80 | $9,60 |
| Spaces | $5 | $5 |
| Tên miền, khoản dự phòng phân bổ/tháng | $1–2 | $1–2 |
| Cộng trước dự phòng | $34,80–35,80 | $63,60–64,60 |
| Ngân sách hạ tầng làm tròn | $35–40 | $65–70 |

Spaces gồm 250 GiB và 1.024 GiB outbound/tháng dùng chung; vượt mức tính thêm.
Backup hàng tuần của VPS là ảnh hệ thống, không thay thế backup PostgreSQL nhất quán.
Giá: [Spaces](https://docs.digitalocean.com/products/spaces/details/pricing/),
[Droplet backups](https://www.digitalocean.com/pricing/backups).

Bảng chưa gồm Gemini, SMTP/SMS/OAuth trả phí nếu có, thuế, phí thanh toán hoặc
lưu lượng vượt gói. Giá tên miền là khoản dự phòng, cần kiểm tra tên/TLD cụ thể,
thường trả theo năm. Dùng email cho beta; không bật SMS phát sinh phí mặc định.

## Gemini và quyền thử nghiệm

Quota subscription mới là tài liệu thiết kế, chưa thực thi trong code. Không coi
trần trong SUBSCRIPTION_PLAN.md là đã ngăn được chi phí provider.

Với 50 người dùng Trial một lần, giả định mỗi người dùng hết 3 phút Live,
1 đánh giá, 2 nhận xét câu và 2 câu hỏi, chi phí Gemini dự kiến khoảng
50 x $0,196 = $9,80 cho cả đợt Trial 7 ngày, không phải hạn mức tự reset hàng tháng.
Cộng VPS 8 GB là khoảng $75–80 cho tháng đầu theo giả định đó.
Nếu cần trải nghiệm dài hơn, dành riêng $30–50 Gemini cho một tháng beta:
tổng dự toán ban đầu $95–120/tháng. Ngân sách này không tự quy đổi thành quyền
AI không giới hạn; cần quota, đo usage và cơ chế chặn thật.

Trước khi mời rộng: cấp tài khoản bằng danh sách mời, một phiên Live/user,
giới hạn phiên và requests; ghi nhận token/chi phí cho từng request và retry.
Client gửi usage Live không đủ làm căn cứ billing tin cậy. Muốn chặn chính xác
theo ngân sách cần proxy Live ở backend hoặc chính sách token ngắn hạn/reservation
với sai số được chấp nhận và đo rõ. Khi proxy Live, kiểm thử lại băng thông/CPU
và khả năng giữ WebSocket của backend.

Trong beta không tự chạy Whisper cho video thiếu phụ đề. Đây là thay đổi cần
triển khai trong backend/worker, chưa phải chính sách đã có. Worker xử lý một job
video/dịch tại một thời điểm, có queue và giới hạn tài nguyên. Yêu cầu tạo câu hỏi
nội bộ song song vẫn cần tính vào giới hạn request Gemini của toàn hệ thống.
Thử nhập video có phụ đề từ VPS trước: YouTube có thể chặn IP datacenter, nên
chuẩn bị sẵn kho 52 video cho beta thay vì phụ thuộc import trực tiếp thành công.

## Backup và vận hành

- Backup PostgreSQL mỗi ngày bằng pg_dump; mã hoá file và đưa ra Spaces, giữ
  7 bản ngày và 4 bản tuần. Không đặt mọi bản backup trên ổ đĩa VPS.
- Backup VPS hàng tuần để phục hồi hệ điều hành/config; kiểm tra restore database
  sang môi trường tách biệt trước khi mở beta. Mục tiêu ban đầu mất tối đa một ngày
  dữ liệu nếu có sự cố, khôi phục trong vài giờ; đây là mục tiêu cần thực hành.
- API/worker tự khởi động lại, health check và log rotation. Theo dõi RAM, disk,
  CPU, HTTP errors, queue và chi phí Gemini. Không ghi credentials/transcript
  vào log mặc định.
- Credentials thật giữ ở backend; dùng SSH key, chỉ public HTTPS/HTTP và giới hạn
  truy cập quản trị. Đặt API base URL production bằng HTTPS và kiểm tra callback
  OAuth, URL audio, CORS. Không dùng Flask development server cho beta.

## Trình tự đưa lên

1. Chuẩn bị Compose production: backend, Caddy, PostgreSQL, queue, worker; secret,
   volume, health check, logging, quota AI và tắt ASR fallback.
2. Thuê VPS/Spaces và cấu hình domain sau khi người dùng quyết định nhà cung cấp.
3. Chạy migration, chuyển database bằng dump/restore; chuyển audio nếu sử dụng.
4. Kiểm tra login/email, tra từ/video, phụ đề, quiz, dịch, hội thoại và chấm điểm,
   audio, backup/restore và app kết nối từ điện thoại thật.
5. Kiểm thử mức 5, rồi 10 người đồng thời. Quan sát API, queue và Live riêng;
   chưa suy ra capacity từ số tài khoản hoặc dung lượng database.
6. Mời 5 người trước, theo dõi 1–2 ngày, rồi tăng tới 50. Tách worker hoặc tăng
   máy khi RAM thường xuyên vượt khoảng 80%, CPU cao kéo dài, queue chậm hay
   độ trễ API tăng; các ngưỡng là tín hiệu vận hành, không cam kết capacity.

Đề xuất chốt: một VPS 8 GB Singapore và Spaces, ngân sách hạ tầng $70/tháng,
thêm $30–50 Gemini nếu beta kéo dài một tháng. Không mua gói server dài hạn
trước khi kiểm thử trên nhà cung cấp được chọn.
