# CI/CD cho beta NihonGO

## Luồng nhánh

| Nhánh | Mục đích | Tự triển khai? |
| --- | --- | --- |
| `develop` | Tích hợp và kiểm thử thay đổi từ máy dev | Không |
| `staging` | Bản được chọn để đưa lên VPS beta `momonihongo.app` | Có, sau khi CI đạt |
| `main` | Giữ làm mốc phát hành riêng | Không |

Đưa code lên VPS bằng PR `develop` → `staging`. Mỗi push lên `develop` hoặc PR vào `develop`/`staging` chạy kiểm thử backend, TypeScript, Jest và build web. Push lên `staging` chỉ deploy khi cả hai job CI đạt. Tên `staging` ở đây là **nhánh triển khai tới VPS beta hiện có**, chưa phải một máy chủ staging độc lập.

## Quy trình triển khai

Workflow [`.github/workflows/beta.yml`](../../.github/workflows/beta.yml) build web với các cờ beta, đóng gói source bằng `build_bundle.sh`, kiểm tra SHA-256 rồi gửi gói qua SSH. VPS chỉ nhận gói qua user `nihongo-deploy`; user này được phép gọi đúng lệnh root `/usr/local/sbin/nihongo-deploy` qua sudo. Host key đã ghim trong `known_hosts`.

Lệnh triển khai trên VPS kiểm tra thành phần gói, sao lưu PostgreSQL và âm thanh, lưu snapshot mã cũ, áp dụng code, chạy migration, build image backend và game, khởi động lại dịch vụ rồi kiểm tra HTTPS/backend. Nếu lỗi, nó khôi phục **mã và image cũ**; migration database không tự đảo ngược, nên migration mới phải tương thích ngược trong ít nhất một lần phát hành.

`.env`, JSON Vertex, YAML LiveKit, dữ liệu PostgreSQL, bản thu, model dịch và cache Whisper luôn ở VPS; chúng không được đưa vào Git hoặc gói CI. Không sửa code trực tiếp trên VPS sau khi bật CI/CD. Thay đổi cấu hình bí mật vẫn thực hiện trên VPS qua các script `configure_*`/`set_*`.

## Thiết lập một lần

1. Kết nối tài khoản GitHub có quyền ghi repository `trnghuybru/NihonGo` để push `develop` và `staging`. Repo hiện dùng remote SSH; nếu GitHub từ chối public key, cấu hình quyền GitHub trước.
2. Trên VPS, tạo user `nihongo-deploy` và thư mục `/home/nihongo-deploy/incoming`; cài bản root-owned của `deploy_release.sh` thành `/usr/local/sbin/nihongo-deploy`, cho phép user này chạy **chỉ** lệnh đó qua sudo.
3. Tạo cặp SSH key riêng cho CI. Chỉ public key vào `authorized_keys` của `nihongo-deploy`; private key vào GitHub Actions repository secret `BETA_DEPLOY_PRIVATE_KEY`. Không dùng key root hiện có, không đưa private key vào Git/chat.
4. Bảo vệ nhánh `staging` bằng PR và CI bắt buộc trước khi merge. Nếu tài khoản GitHub hỗ trợ, thêm GitHub Environment/required reviewer để duyệt deploy. Chính sách branch cần cấu hình trong GitHub Settings.
5. Push `develop`; mở PR `develop` → `staging` và merge sau khi CI xanh. Kiểm tra Actions log, `https://momonihongo.app` và `https://voice.momonihongo.app`.

## Khôi phục và theo dõi

- Gói backup trước mỗi deploy: `/opt/momonihongo/backups/before-<sha>-*.dump` và `*-audio.tar.gz`.
- Snapshot mã trước deploy: `/opt/momonihongo/releases/rollback-<sha>/`.
- Revision thành công: `/opt/momonihongo/deploy/beta/DEPLOYED_SHA`.
- Kiểm tra dịch vụ: `cd /opt/momonihongo && docker compose --env-file backend/.env -f compose.beta.yaml ps`.
- CI không thay thế việc sao bản backup ra ngoài VPS; `daily_backup.sh` vẫn chạy và bản sao Mac cần cập nhật định kỳ.

## Kho bản thu

`AUDIO_LOCAL_ROOT=/audio` dùng volume cũ; giá trị rỗng dùng bucket S3/R2 riêng tư.
Compose giữ giá trị rỗng thay vì tự chuyển về local. `configure_r2.py` chỉ chuẩn bị
key ẩn, chưa đổi kho. Trước khi chuyển, sao lưu và chạy
`python -m speaking.storage_migration --copy` trong container backend với môi trường
R2; chạy lại không có `--copy` để đối chiếu SHA-256. Công cụ không đổi database,
không chuyển các phiên đã xoá và không xoá bản gốc. Sau khi xác minh mới để
`AUDIO_LOCAL_ROOT=` rồi recreate backend và worker để nhận cấu hình mới.
`backup_audio.sh` lấy âm thanh từ kho đang được chọn, bao gồm cả R2.
Bucket cần CORS trong `r2-cors.json`; không bật public access. Các URL nghe/tải
lên vẫn có chữ ký và thời hạn, quyền sở hữu vẫn kiểm tra trong app.
