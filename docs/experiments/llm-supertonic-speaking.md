# Thử nghiệm Nói: LLM thường + Supertonic

Nhánh: `experiment/llm-supertonic-speaking`. Chỉ thử web local; endpoint từ chối môi trường production.

## Chạy

- Backend local: `SPEAKING_TTS_EXPERIMENT=1`, `SUPERTONIC_TTS_ENABLED=true`; model và R2 đã cấu hình trong `.env` (không commit).
- Khởi động lại backend và Vite. Vào Nói, chọn kịch bản, giữ/thả micro hoặc nhập tin nhắn.
- Chrome nhận dạng tiếng Nhật bằng Web Speech; không gọi Gemini Live. Nếu trình duyệt không hỗ trợ, dùng nhắn tin.
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

UI hiển thị độ trễ STT sau thả micro, LLM (gồm DB), TTS/R2 (gồm chờ lock/cache), tải/giải mã và tổng đến lúc lập lịch phát. Nếu nhận dạng tự kết thúc trước khi thả micro, STT tail tính từ sự kiện final, không phải thời điểm âm tiết cuối. Retry có thể dùng lại câu trả lời và WAV nên không nên tính là mẫu tạo mới.

## Giới hạn

- Ghép tuần tự, chưa stream từng câu; 5–6 giây chưa phải hội thoại tức thì. Hướng tối ưu tiếp: phát câu đầu sớm, sinh câu tiếp khi đang phát, tách upload R2 khỏi đường phát đầu tiên.
- Chưa kiểm thử micro/audio thật trong trình duyệt hoặc so sánh Live cùng máy. Cần thử trực tiếp để đánh giá cảm giác trò chuyện.
- Transcript được lưu theo luồng cũ; WAV nằm trong cache R2, chưa gắn vào lịch sử bản thu của phiên. Bản thử không ghi lại micro.
- Nhãn cảm xúc chỉ trả ở lượt sinh mới; retry câu đã lưu dùng neutral. Không sửa schema database chỉ để lưu nhãn thử nghiệm.
- Không tự chuyển qua giọng máy nếu TTS lỗi, để kết quả thử không bị nhầm nguồn âm thanh.

Kiểm tra tối thiểu: TypeScript; quyền sở hữu, cờ local-only, idempotent retry; hồi quy API hội thoại cũ; hai lượt LLM/TTS/R2 thật.
