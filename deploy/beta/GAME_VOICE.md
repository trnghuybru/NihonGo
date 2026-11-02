# Game giành mic: chấm giọng và đồng bộ kết quả

## Cấu hình Google Cloud

Game dùng **Cloud Speech-to-Text V2**, model `short`, tiếng Nhật `ja-JP`. Gemini Live và các tác vụ Vertex hiện tại giữ cấu hình riêng.

1. Trong project `true-shore-451709-f3`, mở **APIs & Services → Library → Cloud Speech-to-Text API → Enable**.
2. Vào **IAM & Admin → IAM**, sửa đúng service account app đang dùng với Vertex.
3. Thêm role **Cloud Speech Client** (`roles/speech.client`), giữ nguyên các role cũ.
4. Không cần tải key mới. Compose mount `deploy/beta/secrets/vertex.json` ở chế độ chỉ đọc vào worker; `GOOGLE_APPLICATION_CREDENTIALS` trỏ tới `/run/vertex-secrets/vertex.json`.
5. Worker lấy project từ `GAME_SPEECH_PROJECT_ID`; nếu bỏ trống thì dùng `VERTEX_PROJECT_ID`, rồi `GOOGLE_CLOUD_PROJECT`.

Đọc thêm: [API nhận dạng đồng bộ](https://docs.cloud.google.com/speech-to-text/docs/reference/rest/v2/projects.locations.recognizers/recognize), [ngôn ngữ và model được hỗ trợ](https://docs.cloud.google.com/speech-to-text/docs/speech-to-text-supported-languages), [role Speech Client](https://docs.cloud.google.com/iam/docs/roles-permissions/speech).

## Luồng chơi

- Máy chủ khóa lượt giành mic; chỉ người thắng được cấp quyền phát. Khi kết nối lại trong lượt của mình, token mới vẫn giữ đúng quyền đó.
- Worker thu PCM 16 kHz mono từ track LiveKit của người giữ lượt. Sau ít nhất 120 ms có âm thanh và 800 ms im lặng, worker tự chuyển sang chấm; nút **Đọc xong** và giới hạn 8 giây vẫn hoạt động.
- Mỗi lượt chỉ gửi một lần nhận dạng, tối đa 10 giây audio. Không gửi đáp án làm gợi ý và không nhận transcript do trình duyệt cung cấp.
- Yêu cầu STT có thêm 100 ms im lặng đầu và 800 ms cuối để hỗ trợ những từ ngắn khi bấm Đọc xong ngay sau lúc nói; tổng audio vẫn dưới 10 giây.
- Máy chủ chuẩn hóa kana, hoặc chuyển kết quả Kanji sang cách đọc bằng Sudachi, rồi so khớp đầy đủ. Đúng được 10 điểm. Đây là kiểm tra đúng từ, **không phải đánh giá chi tiết âm vị, trọng âm hay ngữ điệu**.
- Kết quả lưu thời gian từ lúc hiện câu đến lúc kết thúc phần nói, loại bỏ thời gian chờ STT. Không dùng thời gian do client tự báo để chấm.
- Âm thanh không rõ, confidence thấp, thiếu quyền API hoặc lỗi nhà cung cấp: báo lỗi kỹ thuật, không cộng điểm. Không tự chuyển ngầm về Whisper.
- Bản ghi game chỉ ở bộ nhớ worker và gửi tới dịch vụ nhận dạng; không được lưu thành file hoặc ghi audio/transcript vào log.

Ngưỡng âm lượng dùng để phát hiện kết thúc câu là ngưỡng RMS đơn giản. Trong môi trường nhiều tiếng ồn, người chơi có thể dùng **Đọc xong**; cần thử với micro thật trước khi khẳng định độ chính xác/độ trễ.

## Âm thanh và kết quả

- Client gắn track mới và tháo track cũ theo lượt, phục hồi track sau reconnect. Các thao tác bật/tắt mic được xếp thứ tự để tránh mở lại mic sau khi đã hết lượt.
- Khi trình duyệt chặn tự phát, hiện nút **Bật âm thanh người chơi**; thao tác phát chạy ngay trong cử chỉ bấm của người dùng.
- Bộ đồng bộ vẫn xét phòng vừa kết thúc trong 2 phút để phát thông báo cuối tới mọi thành viên, kể cả thay đổi từ tiến trình khác. Client tiếp tục có polling dự phòng.
- Trang tổng kết đưa bảng điểm **tất cả người chơi** lên trước lịch sử từ vựng và cuộn về đầu khi trận kết thúc. Người từng tham gia được xem lại kết quả đã hoàn tất; người lạ không được truy cập.

## Kiểm tra trước khi phát hành

1. Deploy qua nhánh `staging` sau khi CI xanh; không sửa code trực tiếp trên VPS.
2. Hai tài khoản trên hai thiết bị: kết nối âm thanh, lần lượt A nói/B nghe rồi B nói/A nghe, chuyển lượt nhiều lần.
3. Thử từ ngắn, từ có âm ngắt/kéo dài, một đáp án sai và một lượt im lặng. Đối chiếu văn bản STT và kết quả; hướng dẫn này không thay thế thử giọng thật.
4. Hoàn tất trận, kiểm tra cả hai màn hình đều có bảng điểm và lịch sử. Chủ phòng thoát trước; người còn lại vẫn xem được tổng kết.
5. Kiểm tra trường hợp reload trong lúc giữ mic và khi đang ở tổng kết.
