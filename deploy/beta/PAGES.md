# Cloudflare Pages frontend

API, PostgreSQL, workers và LiveKit tiếp tục ở VPS. Dựng frontend từ nhánh
`staging` để giữ các cờ beta production, không lấy nhầm cấu hình develop.

## Build và deploy

Trong `frontend/`, Node 22.11 trở lên:

```sh
npm ci
VITE_API_ORIGIN=https://api.momonihongo.app \
VITE_BETA_MODE=true VITE_BETA_LIVE_MODE=true \
VITE_BETA_AUDIO_STORAGE_MODE=true VITE_BETA_GAMES_MODE=true \
VITE_BETA_SPEAKING_MODE=true npm run web:build
```

Chỉ upload `frontend/dist-web`, không upload backend hoặc thư mục backup.
Wrangler được xác thực riêng; không đặt token trong VITE_* hoặc Git.

## SPA và cache

Pages có SPA fallback mặc định khi không có `404.html` ở gốc output. Các deep link
như `/learn/...` và `/games/...` nhận index.html; asset thật vẫn được phục vụ đúng.
Không thêm catch-all redirect nuốt file JS/CSS. Kiểm tra response deep link và
Content-Type của các asset trên bản preview trước khi chuyển domain.

`public/_headers` được Vite copy vào output: HTML/các đường SPA revalidate;
`/assets/*` có tên hash được cache 1 năm immutable. Quy tắc asset phải detach
Cache-Control trước khi đặt giá trị mới, tránh hai max-age mâu thuẫn.
`sw.js` không cache dài; worker quảng cáo cũ tiếp tục tự unregister.

## URL cũ và OAuth

`_worker.js` chỉ proxy `/api/*`, `/static/*`, `/socket.io/*` về API hostname cố
định. Điều này giữ callback Google trên domain website và client cũ hoạt động
sau khi DNS chuyển sang Pages; giữ nguyên method/body/query, redirect và WebSocket.
`_routes.json` chỉ chạy Function ở ba nhóm đường này; frontend static đi thẳng
Pages. Request tương thích vẫn dùng hạn mức Pages Functions/Workers của account.
Không đổi PUBLIC_BASE_URL/WEB_BASE_URL, R2 hoặc Brevo trong đợt này.

## Preview và chuyển domain

1. Deploy nhánh preview trên project Pages, lấy origin preview ổn định.
2. Thêm chính xác origin đó vào APP_CORS_ORIGINS, GAME_SOCKET_ORIGINS và R2 CORS.
   Gemini Live dùng APP_CORS_ORIGINS. Không mở wildcard toàn bộ pages.dev.
3. Kiểm tra login/refresh, học tập, R2 upload/playback, Socket.IO, voice và tài
   nguyên 3D. Không dùng bản thử để gửi email thật nếu chưa được yêu cầu.
4. Trước đổi nameserver, export/đối chiếu đủ DNS zone: apex, api, voice, MX,
   Brevo TXT/DKIM/DMARC, CAA và các subdomain khác. Giữ api/voice DNS-only trỏ VPS.
5. Apex Pages cần zone cùng account Cloudflare và nameserver Cloudflare hoạt động.
   Thêm custom domain trong Pages trước khi đổi bản ghi apex sang project.
6. Giữ nguyên `frontend/dist-web` và web server VPS. Các client dùng DNS cũ/mới
   đều gọi API hostname cũ ở VPS và cùng database.
7. Kiểm tra domain thật từ Wi-Fi và mạng di động; theo dõi lỗi và giữ snapshot DNS.

Rollback: đổi apex về A `178.238.231.247` (DNS-only để đi thẳng VPS); không đổi API,
voice hay database. Cần chờ TTL/DNS cache và xác minh HTTPS trên VPS. Không xóa
custom domain hoặc project trong lúc còn client dùng DNS cũ của Pages.
