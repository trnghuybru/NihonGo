# Momo — NihonGO mascot

`momo-wave.png` là asset PNG RGBA 768×768, nền trong suốt, được tạo bằng công cụ image generation tích hợp cho NihonGO. Đây là nhân vật tanuki nguyên bản, không dựa trên hình dáng mascot của ứng dụng khác.

Màu chủ đạo: cam đào `#FCA04B`, kem `#FFF8F1`, nâu than gần `#252526` và hồng nhạt `#FFF1F2`. Giữ tỉ lệ vuông, dùng `resizeMode="contain"`, không thêm nền hoặc cắt mất tai, đuôi, bàn chân.

Prompt sản xuất: mascot tanuki chibi Nhật Bản thân thiện, một tay vẫy, khăn cổ kem, minh họa 2D vector-like cho ứng dụng học ngôn ngữ, silhouette tròn dễ đọc ở 80–160 px, bảng màu NihonGO, nền alpha trong suốt, không chữ/logo/watermark, không cú và không giống mascot hiện có.

## Homepage và thương hiệu

- `momo-listening.png`, `momo-speaking.png`, `momo-reading.png`, `momo-writing.png`: bộ tư thế đã có trong project, dùng cho bốn kỹ năng qua prop `pose` của `NihongoMascot`.
- `momo-head.png`: đầu Momo nền alpha, 384×384. `BrandLogo` ghép hình với chữ native **NihonGO**, dùng Readex Pro và các token `typography.brand`, `colors.dark`, `colors.primary` theo `design.md`. Bố cục đầu Momo cạnh chữ giữ theo mẫu người dùng; artwork icon launcher là asset riêng.
- `nihongo-app-icon.png`: icon gốc 1024×1024, nền kem, không alpha; dùng để xuất các kích thước icon iOS, Android và LaunchBrand. Hai asset thương hiệu mới được tạo bằng công cụ `image_gen` tích hợp; không dùng CLI/API fallback. Prompt đầy đủ ở [GENERATION.md](GENERATION.md).

`StartupSplash` dùng hình vẫy tay hiện có, tạo chuyển động nhún và nghiêng bằng React Native Animated (native driver). Chỉ chạy một lần khi mount app, chờ khôi phục phiên đăng nhập, tắt chuyển động khi bật Reduce Motion; không phát lại khi chuyển tab. Native launch hiển thị logo tĩnh trước khi JavaScript sẵn sàng.

Icon Android có inset riêng để phần đầu và chữ nằm trong vùng an toàn của adaptive icon. Cấu hình splash Android 12+ theo [tài liệu Android](https://developer.android.com/develop/ui/views/launch/splash-screen).

Sau khi thay icon hoặc launch screen native, build/cài lại app bằng `npm run ios` hoặc `npm run android`; Fast Refresh chỉ cập nhật phần JavaScript. Không chạy test trong lần cập nhật này theo yêu cầu người dùng.
