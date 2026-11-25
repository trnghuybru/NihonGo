# CI/CD cho beta NihonGO

## Luồng nhánh

| Nhánh | Mục đích | Tự triển khai? |
| --- | --- | --- |
| `develop` | Tích hợp và kiểm thử thay đổi từ máy dev | Không |
| `staging` | Bản được chọn để đưa lên VM Google Cloud Singapore phục vụ `momonihongo.app` | Có, sau khi CI đạt |
| `main` | Giữ làm mốc phát hành riêng | Không |

Đưa code lên VM bằng PR `develop` → `staging`. Mỗi push lên `develop` hoặc PR vào `develop`/`staging` chạy kiểm thử backend, TypeScript, Jest và build web. Push lên `staging` chỉ deploy khi cả hai job CI đạt. Tên `staging` ở đây là **nhánh triển khai tới VM Google Cloud hiện có**, chưa phải một máy chủ staging độc lập.

## Quy trình triển khai

Workflow [`.github/workflows/beta.yml`](../../.github/workflows/beta.yml) giữ nguyên
kiểm thử backend/frontend và artifact web đã xác minh. Job deploy xác thực Google
Cloud bằng OIDC/WIF rồi mở IAP tới `momonihongo-sg`, `asia-southeast1-b`, project
`true-shore-451709-f3`. Không mở SSH public và không lưu service-account JSON key.

WIF chỉ chấp nhận push `refs/heads/staging` từ repository ID `1398925426`, owner ID
`118419973`. Service account `nihongo-ci-tunnel` chỉ được tra cứu VM và mở tunnel
tới IP nội bộ `10.42.0.2:22`. Bên trong tunnel, khóa `BETA_DEPLOY_PRIVATE_KEY` cũ
đăng nhập user `nihongo-deploy`, chỉ được sudo script `/usr/local/sbin/nihongo-deploy`.
Host key được ghim trong [`deploy/gcp/known_hosts`](../gcp/known_hosts).

Job gọi [`deploy/gcp/deploy_ci.sh`](../gcp/deploy_ci.sh), chuyển bundle qua SCP rồi
chạy script deploy có kiểm tra SHA-256 và backup/rollback. Job Pages vẫn chờ
backend deploy thành công. Google credentials được tạo tạm cho job; private SSH
key và tunnel được dọn bằng EXIT trap.

VM tắt theo lịch 01:00–05:40 giờ Việt Nam. Job deploy sẽ báo rõ và dừng nếu VM
không RUNNING, không tự bật máy ngoài lịch; re-run khi VM hoạt động. CI tests
vẫn chạy độc lập khi VM tắt.

Lệnh triển khai trên VM kiểm tra thành phần gói, sao lưu PostgreSQL và âm thanh, lưu snapshot mã cũ, áp dụng code, chạy migration, build image backend và game, khởi động lại dịch vụ rồi kiểm tra HTTPS/backend. Nếu lỗi, nó khôi phục **mã và image cũ**; migration database không tự đảo ngược, nên migration mới phải tương thích ngược trong ít nhất một lần phát hành.

`.env`, JSON Vertex, YAML LiveKit, dữ liệu PostgreSQL, bản thu, model dịch và cache Whisper luôn ở VM; chúng không được đưa vào Git hoặc gói CI. Không sửa code trực tiếp trên VM sau khi bật CI/CD. Thay đổi cấu hình bí mật vẫn thực hiện trên VM qua các script `configure_*`/`set_*`.

## Thiết lập một lần

1. Kết nối tài khoản GitHub có quyền ghi repository `trnghuybru/NihonGo` để push `develop` và `staging`. Repo hiện dùng remote SSH; nếu GitHub từ chối public key, cấu hình quyền GitHub trước.
2. Trên VM, tạo user `nihongo-deploy` và thư mục `/home/nihongo-deploy/incoming`; cài bản root-owned của `deploy_release.sh` thành `/usr/local/sbin/nihongo-deploy`, cho phép user này chạy **chỉ** lệnh đó qua sudo.
3. Tạo cặp SSH key riêng cho CI. Chỉ public key vào `authorized_keys` của `nihongo-deploy`; private key vào GitHub Actions repository secret `BETA_DEPLOY_PRIVATE_KEY`. Không dùng key root hiện có, không đưa private key vào Git/chat.
4. Bảo vệ nhánh `staging` bằng PR và CI bắt buộc trước khi merge. Nếu tài khoản GitHub hỗ trợ, thêm GitHub Environment/required reviewer để duyệt deploy. Chính sách branch cần cấu hình trong GitHub Settings.
5. Push `develop`; mở PR `develop` → `staging` và merge sau khi CI xanh. Kiểm tra Actions log, `https://momonihongo.app` và `https://voice.momonihongo.app`.

## Khôi phục và theo dõi

- Gói backup trước mỗi deploy: `/opt/momonihongo/backups/before-<sha>-*.dump` và `*-audio.tar.gz`.
- Snapshot mã trước deploy: `/opt/momonihongo/releases/rollback-<sha>/`.
- Revision thành công: `/opt/momonihongo/deploy/beta/DEPLOYED_SHA`.
- Kiểm tra dịch vụ: `cd /opt/momonihongo && docker compose --env-file backend/.env -f compose.beta.yaml ps`.
- CI không thay thế việc sao bản backup ra ngoài VM; `daily_backup.sh` vẫn chạy và bản sao Mac cần cập nhật định kỳ.

## API origin riêng (Đợt 2)

Frontend web được build với `VITE_API_ORIGIN=https://api.momonihongo.app`.
Giá trị là origin HTTPS, không có `/api`, query hoặc credentials. Bỏ trống giữ
same-origin để rollback hoặc chạy Vite proxy local. Socket.IO, Gemini Live và
nhân vật 3D cùng dùng API origin; link chia sẻ/phát YouTube vẫn dùng origin web.

DNS `api` A trỏ cùng VM; Caddy phục vụ hostname API qua HTTPS và giữ nguyên
`/api/*`, `/static/*`, `/socket.io/*` trên domain website trong thời gian chuyển.
Trước khi deploy frontend, đặt `APP_CORS_ORIGINS` và `GAME_SOCKET_ORIGINS` thành
danh sách origin chính xác, gồm `https://momonihongo.app` (không wildcard preview).
Giữ `PUBLIC_BASE_URL`/`WEB_BASE_URL=https://momonihongo.app` để không đổi callback
OAuth đã đăng ký hoặc URL website. R2/Brevo và `voice.momonihongo.app` giữ nguyên.
Khi thêm Pages preview sau này, thêm đúng origin preview vào CORS, Socket.IO,
Live gateway và R2 CORS trước khi thử upload; không mở toàn bộ `*.pages.dev`.

Gói code loại `backend/backups`; không upload backup hoặc credentials vào release.

## Kho bản thu (cấu hình hiện có)

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

## Frontend Cloudflare Pages

Push `staging` dùng cùng workflow beta: backend/frontend CI → một build web →
artifact `beta-web-<sha>` → deploy VM → deploy Pages. Job Pages chỉ publish sau
backend healthy; khi Pages lỗi, trạng thái job riêng báo lỗi, không rollback DB.
Hai đích nhận cùng artifact đã kiểm tra, không build frontend lần hai khi deploy.

Thiết lập secret `CLOUDFLARE_API_TOKEN` trong repository Actions với quyền Pages
Edit, giới hạn account. Không cần DNS Edit/Workers hoặc token trên máy VM.
Chi tiết và rollback xem [PAGES.md](PAGES.md). Chỉ push staging tự publish;
develop/pull request không deploy. Artifact giữ 3 ngày để re-run job thất bại.
