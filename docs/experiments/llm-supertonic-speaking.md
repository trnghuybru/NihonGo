# Thử nghiệm Nói: LLM thường + Supertonic

Luồng này dùng LLM thường, Google Cloud Speech-to-Text và Supertonic, không gọi Gemini Live. Web mở theo cờ local/staging; backend chỉ mở khi `SPEAKING_TTS_EXPERIMENT=1`.

## Chạy

- Backend local/staging: `SPEAKING_TTS_EXPERIMENT=1`, `SUPERTONIC_TTS_ENABLED=true`; model và S3-compatible storage đã cấu hình trong `.env` (không commit). Staging build bật `VITE_BETA_SPEAKING_MODE=true`.
- Cấu hình `GAME_SPEECH_PROJECT_ID` (hoặc `VERTEX_PROJECT_ID`) và `GOOGLE_APPLICATION_CREDENTIALS` trong `backend/.env` cho Google Cloud Speech-to-Text. Bật API Speech-to-Text và cấp service account quyền Cloud Speech Client; không lưu credential trong Git.
- Khởi động lại backend và Vite. Bản local mở mục Nói; chọn kịch bản, giữ/thả micro hoặc nhập tin nhắn.
- Micro gửi PCM 16 kHz tới backend, backend nhận dạng tiếng Nhật bằng Google Cloud Speech-to-Text; không gọi Gemini Live. Audio chỉ được giữ trong bộ nhớ để nhận dạng, không lưu thành file.
- Sau lượt nói thành công, transcript có nút nghe lại giọng người học; tối đa 20 WAV gần nhất được giữ tạm trong trình duyệt và bị xóa khi đóng màn hình hội thoại. Muốn nghe lại sau khi tải lại cần bật tùy chọn lưu âm thanh của phiên.
- `frontend/src/config/speakingExperiment.ts`: đổi cờ thành `false` để trở về transport Live; cần credentials Live hợp lệ để so sánh.

## Luồng

Web Speech → transcript → API LLM theo kịch bản và 6 tin nhắn gần nhất → JSON lời thoại/cảm xúc → lưu transcript → Supertonic F1 → R2 → tải WAV → Aoi phát âm.

Nhãn cảm xúc: neutral, happy, sad, surprised, concerned. Lời thoại theo cảm xúc; Aoi có nghiêng người nhẹ theo nhãn. Model hiện chưa có rig biểu cảm khuôn mặt được xác minh. Miệng chuyển động theo trạng thái phát, không phải lip-sync phoneme. Supertonic dùng giọng F1 cố định: không có điều khiển emotional prosody riêng trong thử nghiệm này.

## Đo trên Mac ngày 11/11/2026

Hai lượt gọi thực tế, không dùng Live, câu trả lời khác nhau:

| Lượt | LLM | TTS + R2 | Tải WAV | Tổng |
|---|---:|---:|---:|---:|
| Đầu tiến trình | 1666 ms | 3923 ms | 592 ms | 6181 ms |
| Tiếp theo | 1509 ms | 3424 ms | 834 ms | 5767 ms |

Đây là số đo backend + tải WAV, chưa gồm micro/STT và audio device. Chưa đủ mẫu để suy ra p95 hay tải đồng thời/VPS. Không có số đo Live cùng điều kiện nên chưa thể kết luận so sánh trực tiếp.

## Giới hạn

- Ghép tuần tự, chưa stream từng câu; 5–6 giây chưa phải hội thoại tức thì. Hướng tối ưu tiếp: phát câu đầu sớm, sinh câu tiếp khi đang phát, tách upload R2 khỏi đường phát đầu tiên.
- Chưa kiểm thử micro/audio thật trong trình duyệt hoặc so sánh Live cùng máy. Cần thử trực tiếp để đánh giá cảm giác trò chuyện.
- Transcript được lưu theo luồng cũ; WAV nằm trong cache R2, chưa gắn vào lịch sử bản thu của phiên. Bản thử không ghi lại micro.
- Nhãn cảm xúc chỉ trả ở lượt sinh mới; retry câu đã lưu dùng neutral. Không sửa schema database chỉ để lưu nhãn thử nghiệm.
- Không tự chuyển qua giọng máy nếu TTS lỗi, để kết quả thử không bị nhầm nguồn âm thanh.

Kiểm tra tối thiểu: TypeScript; quyền sở hữu, cờ local-only, idempotent retry; hồi quy API hội thoại cũ; hai lượt LLM/TTS/R2 thật.
