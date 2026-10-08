# Speaking UI

Stack hiện tại: React Native 0.87, WebView/Three.js cho Aoi; animation dùng
`Animated` có sẵn và native driver. Không thêm dependency. Giữ nguyên luồng API/audio; thêm callback đo mức âm thanh từ buffer đang thu.

## Cấu trúc

- `src/hooks/useSpeakingPresentation.ts`: một reducer, bảy trạng thái
  `idle | ai_speaking | transition_to_user | user_turn | user_speaking | processing | error`.
  Context giữ trạng thái transport/audio để giải quyết sự kiện không đồng thời,
  transcript và tiến độ hiển thị; giao diện suy ra từ phase.
- `src/components/SpeakingStage.tsx`: avatar, glow và animation chuyển lượt. Chuyển cảnh 380 ms với cubic easing;
  Reduce Motion dùng fade 150 ms, không scale/slide/pulse.
- `SpeakingMessages.tsx`: bong bóng tin nhắn và tự cuộn.
- `SpeakingMicrophone.tsx`: nút giữ nói với hiệu ứng theo mức âm thanh.
- `ConversationScreen.tsx`: nối callback hiện có vào reducer, bố cục và composer.
  Avatar cố định ở nửa trên vùng nội dung đo bằng onLayout trên cả màn hẹp/rộng.
  Tin nhắn ở phần dưới dùng FlatList tự cuộn cuối khi nội dung hoặc chiều cao
  vùng chat thay đổi; avatar không nằm trong vùng cuộn. Nhiệm vụ mở bằng icon bóng đèn.
  Bộ chuyển Nói/Nhắn tin nằm cùng hàng với bóng đèn, dùng typography.button.
  Chế độ mặc định là Nói với mic tròn 80 px ở giữa. Chỉ hiện textbox/nút gửi
  khi chọn Nhắn tin; chuyển chế độ giữ draft và không kết nối lại Gemini.
- `CharacterView3D.tsx` và HTML `/api/character-view` trong `backend/app.py`:
  thêm framing chân dung qua postMessage. Giữ kéo/xoay/pinch; framing không reset
  khi đổi lượt hoặc có transcript mới.

## Lời mở đầu

Phiên mới có opening_message được yêu cầu đọc qua Gemini Live sau khi nạp lịch sử.
Yêu cầu đọc là thao tác nội bộ: không lưu tin nhắn user giả, không thêm bong bóng AI trùng.
Chỉ áp dụng khi last_sequence bằng 1; mở lịch sử hoặc kết nối lại thành công không tự đọc lại.
Mic khóa trong lúc tạo/phát lời chào; khi hết audio, chuyển đến lượt bạn.

## Giả định

Hội thoại dùng bong bóng tin nhắn thông thường: AI ở trái trên nền trắng,
người dùng ở phải trên nền đào nhạt, chữ Readex Pro theo token chung. Không dùng
khung speak box viền đổi màu hoặc highlight từng ký tự; transcript hiện ngay
khi Gemini gửi về và danh sách tự cuộn cuối.

Mic đọc RMS từ chính buffer PCM đang thu, lọc mức nền thấp, chuẩn hóa 0–1 và
đưa qua callback onMicLevel vào reducer. PCM gửi Gemini giữ nguyên. Khi có âm
thanh vượt ngưỡng, mic rung nhẹ (dịch ngang/xoay), phóng nhẹ và có vòng sóng theo
mức âm lượng; im lặng, thả mic hoặc lỗi sẽ dừng hiệu ứng. Đây là mức âm thanh,
không phải bộ phân loại giọng nói; tiếng động lớn cũng có thể kích hoạt.
Reduce Motion chỉ thay đổi opacity, không rung/xoay/scale.

App chưa có web/desktop target. Layout 1440 px áp dụng cho cửa sổ native rộng;
không bổ sung React Native Web trong thay đổi này.

## Kiểm tra thủ công (không cần sửa backend)

| Trạng thái/chuyển lượt | Thao tác | Kết quả mong đợi |
|---|---|---|
| idle → user_turn | Mở phiên active, chờ kết nối | Mic khóa khi kết nối; sau đó nhãn Đến lượt bạn, mic mở |
| user_turn → user_speaking | Giữ mic, cấp quyền nếu được hỏi | Mic cam, nhãn thả để gửi, vòng sóng/rung nhẹ theo âm lượng; transcript hiện khi provider trả |
| user_speaking → processing | Thả tay | Dừng thu; mic khóa; nhãn Aoi đang chuẩn bị trả lời |
| processing → ai_speaking | Chờ audio trả về | Glow nhẹ, AI đang nói; lời AI hiện như tin nhắn và tự cuộn |
| ai_speaking → transition_to_user | Chờ hết audio và lưu lượt | Avatar thu nhỏ/giảm sáng trong 380 ms, nhãn Đến lượt bạn; mic còn khóa |
| transition_to_user → user_turn | Chờ chuyển cảnh kết thúc | Mic mở; nhập text hoặc giữ mic được |
| → error → kết nối lại | Từ chối mic hoặc tắt mạng, sau đó khôi phục | Thông báo cụ thể, mic khóa, nút Kết nối lại; lỗi lưu giữ Thử lưu lại/Bỏ lượt chưa lưu |

Kiểm tra thêm:

1. Tạo phiên mới: Aoi đọc lời chào, tin nhắn chỉ xuất hiện một lần; chờ hết âm thanh
   rồi nói/nhắn. Mở phiên từ lịch sử và kết nối lại không tự đọc lời chào.
2. Bấm bóng đèn để xem/đóng nhiệm vụ; chọn Nhắn tin để nhập/gửi text, chọn Nói để
   quay lại mic lớn. Avatar giữ vị trí khi tin mới tự cuộn xuống.
2. Kích thước 360 × 800 và 1440 × 900, tên/bối cảnh dài và transcript 2000 ký tự:
   nội dung cuộn được, composer không chồng text, vùng transcript không bị cắt ba dòng.
3. Mở bàn phím, tăng cỡ chữ hệ thống, xoay màn hình: header vẫn dưới camera,
   chiều cao nội dung đo lại; ô text co giãn, nút có vùng chạm 48 px.
4. Bật Reduce Motion khi app đang mở: không pulse/slide/scale, popup transcript fade.
5. Bật VoiceOver/TalkBack: tin nhắn trực tiếp có live region, mic có nhãn theo trạng thái;
   màu không phải dấu hiệu duy nhất (nhãn xác định lượt).
6. Chuyển nền trong lúc nói/phát: microphone/audio dừng và lỗi kết nối hiện ra.
7. Mở phiên completed: chỉ xem transcript, không mở mic hoặc kết nối Live.

Tự động: `npm test -- --runInBand --watchman=false` và `npx tsc --noEmit`.
Test reducer kiểm tra cả hai thứ tự kết thúc audio/lưu lượt và khoảng lặng giữa
các chunk, Unicode, reset transcript, lỗi; test screen kiểm tra breakpoint,
chiều cao avatar, văn bản dài, nhãn mic và Reduced Motion. Các test không
thay thế kiểm tra trực quan và âm thanh trên thiết bị với key thật.
