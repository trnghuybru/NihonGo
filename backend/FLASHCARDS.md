# Flashcard (UC-V13 – UC-V20)

Vào **Bài học → Flashcard**. Giao diện dùng chung React Native/web, gradient và token trong `design.md`.

- **UC-V13:** Có sẵn = các bài từ vựng theo N5–N1; Tự tạo = bộ riêng của tài khoản; Yêu thích = những từ được đánh dấu sao trong bài học hoặc từ điển. Bộ tự tạo có tên và 1–100 thẻ, hỗ trợ sửa. Mỗi thẻ gồm từ, cách đọc tuỳ chọn và nghĩa.
- **UC-V14:** Mặt trước là từ tiếng Nhật; chạm lật để xem cách đọc và nghĩa. Chạm lại để trở về mặt trước. Giao diện dùng thư viện `react-native-flip-card` 3.5.7 để lật 3D dọc, khoá đánh giá đến `onFlipEnd` và tôn trọng tuỳ chọn giảm chuyển động của hệ điều hành.
  Ngôi sao ở góc thẻ lưu/bỏ yêu thích ngay trong phiên, ở cả hai mặt. Không lật thẻ khi bấm sao.
  `GET/PUT/DELETE /api/flashcards/sessions/<id>/favorite/<card_id>` kiểm tra sở hữu phiên và thẻ
  thuộc snapshot, dùng ID nguồn/`srs_id` để đồng bộ với bài học/từ điển và bộ yêu thích.
  Bộ tự tạo lưu snapshot theo nguồn `custom`; giữ lịch FSRS nếu thẻ bị bỏ khỏi bộ gốc nhưng
  vẫn được yêu thích. Bỏ yêu thích không thay đổi snapshot phiên đang học hoặc tự đánh giá.
- **UC-V15:** Luôn hiện bốn mức: Chưa nhớ (0), Mơ hồ (1), Nhớ (2), Rất nhớ (3); mặt trước khoá nút, chỉ mở khi mặt sau lật xong. Chỉ sang thẻ tiếp theo khi server xác nhận lưu. Lỗi giữ nguyên thẻ và có thể thử lại/tải lại phiên.
- **UC-V16:** Hết thẻ tự tổng kết; có thể kết thúc sớm. Server trả tổng thẻ, số đã đánh giá, số thẻ ở từng mức và tỷ lệ nhớ = (Nhớ + Rất nhớ) / số đã đánh giá. Khi chưa đánh giá thẻ nào, tỷ lệ là 0%. Đây là tự đánh giá, không phải điểm kiểm tra.

Bốn nút mức nhớ nằm trên một hàng. Trên web, nhấn **Space** để lật thẻ; **1 / 2 / 3 / 4** lần lượt là **Chưa nhớ / Mơ hồ / Nhớ / Rất nhớ**. Chỉ đánh giá khi mặt sau đã lật xong. Phím tắt không chạy trong ô nhập liệu, khi giữ phím, dùng phím bổ trợ, đang lưu, hoặc rời phiên học.

Tạo/sửa bộ hỗ trợ **Nhập hàng loạt** bằng dán văn bản. Hai cột: từ, nghĩa; ba cột: từ, cách đọc, nghĩa. Chọn dấu phân cách giữa cột (Tab/dấu phẩy/tuỳ chỉnh) và giữa thẻ (xuống dòng/chấm phẩy/tuỳ chỉnh), có bỏ dòng tiêu đề và xem trước. Nội dung trong ngoặc kép được giữ nguyên dấu phân cách/xuống dòng; hai ngoặc kép liên tiếp biểu diễn một ngoặc kép. Chỉ thêm khi toàn bộ dữ liệu hợp lệ và tổng bộ không vượt 100 thẻ, tính cả thẻ đơn đang nhập. Dữ liệu xem trước chưa thêm sẽ chặn lưu để tránh mất nội dung; nút lưu vẫn dùng API bộ thẻ hiện có. Không tải tệp CSV hay thêm dependency.

Phiên học lưu snapshot bộ thẻ: sửa bộ hoặc bỏ yêu thích không làm thay đổi phiên đang học. Mỗi thẻ được đánh giá một lần; gửi lại cùng thẻ/cùng mức là idempotent, gửi mức khác hoặc sai thứ tự bị từ chối. Rời màn giữ phiên đang học; chọn Tiếp tục mở thẻ chưa đánh giá đầu tiên. Học lại tạo phiên mới sau tổng kết.

## Dữ liệu

Migration `e8f901a2b3c4` tạo `flashcard_decks`, `flashcard_favorites`, `flashcard_sessions` (FK tài khoản, cascade khi xoá tài khoản). Mọi endpoint yêu cầu đăng nhập; bộ tự tạo, yêu thích và phiên chỉ truy cập bởi chủ tài khoản. Ghi phiên dùng khoá hàng, tạo phiên dùng khoá tài khoản để không tạo trùng khi thử lại. Các request Flashcard có quota riêng, không làm hết quota đăng nhập.

```sh
cd backend
venv/bin/flask --app app db upgrade
venv/bin/python -m unittest discover -s tests -p test_flashcards.py -v
```

## API `/api/flashcards`

| Phương thức / đường dẫn | Nội dung |
| --- | --- |
| GET `/decks?kind=lesson\|custom\|favorites&level=N5&page=1` | Danh mục phân trang (20 bộ), phiên đang học gần nhất |
| POST `/decks` | Tạo bộ `{title, cards: [{front, reading, back}]}` |
| GET, PUT `/decks/<id>` | Xem/sửa bộ tự tạo thuộc tài khoản |
| GET, PUT, DELETE `/favorites/<lesson\|dictionary>/<word_id>` | Xem/lưu/bỏ yêu thích; nội dung từ do backend lấy từ DB |
| POST `/sessions` | Bắt đầu/tiếp tục `{kind, deck_id}` |
| GET `/sessions/<id>` | Khôi phục phiên và tổng kết |
| POST `/sessions/<id>/rate` | Lưu `{card_id, grade}` |
| POST `/sessions/<id>/finish` | Kết thúc sớm và trả tổng kết |

Giới hạn: 100 bộ tự tạo/tài khoản, 100 thẻ/bộ tự tạo, 500 từ yêu thích. Bộ có sẵn lấy toàn bộ từ trong bài. Không gọi AI, không dịch lúc học. Nghĩa dictionary ưu tiên Việt theo nhóm nghĩa; nghĩa Anh còn lại có nhãn.

## Ôn tập và thử thách trên Home

Migration `f901a2b3c4d5` thêm bảng `flashcard_daily_quizzes` (unique tài khoản/ngày Việt Nam,
FK cascade) và `flashcard_sessions.rating_times` để xác định mức tự đánh giá mới nhất khi ôn
cùng một từ qua nhiều phiên. Dữ liệu cũ dùng thời điểm bắt đầu phiên làm mốc dự phòng.

- `GET /home`: phiên đang dở gần nhất, số từ yếu/số từ đã đánh giá và tình trạng thử thách hôm nay.
  Đọc tối đa 30 snapshot gần nhất; gộp từ theo cách viết/cách đọc, chọn đánh giá có thời gian mới nhất.
  GET không tạo thử thách hay phiên học. Đang dở được tìm riêng, không giới hạn trong 30 snapshot.
- `POST /review` với `{mode: "weak"}`: tạo/tiếp tục snapshot tối đa 50 từ Chưa nhớ/Mơ hồ.
  `{mode: "quiz", quiz_id}` chỉ lấy câu sai trong thử thách đã hoàn thành của người dùng.
  `{mode: "repeat", session_id}` học lại đúng snapshot ôn tập, kể cả sau khi đã nhớ các từ đó.
  Phiên ôn dùng `kind=custom`, `deck_id=review:...`; không tạo bộ giả trong danh mục.
- `POST /daily-quiz`: tạo/tiếp tục duy nhất một thử thách của ngày Asia/Ho_Chi_Minh. Tối đa 5 câu,
  có thể ít hơn nếu chưa đủ từ phù hợp; chưa có câu trả 409 với hướng dẫn học thêm. So sánh tối đa
  500 từ phù hợp gần nhất để giới hạn chi phí xử lý. Từ mục tiêu phải
  từng được tự đánh giá; nghĩa ngắn tối đa 160 ký tự và không có nhãn Anh. Ưu tiên từ yếu, đáp án nhiễu
  từ cùng snapshot trước, rồi các snapshot gần đây. Loại nghĩa trùng/chéo cụm khi tách dấu câu; không
  suy luận đồng nghĩa bằng AI, nên bộ tự tạo vẫn phụ thuộc chất lượng nội dung người dùng nhập.
- `POST /daily-quiz/<id>/answer` với `{question_id, option_id}`: xác nhận đúng thứ tự, khoá hàng,
  lưu idempotent cùng lựa chọn, 409 khi đổi lựa chọn đã lưu. Chỉ trả đáp án đúng/cách đọc sau khi
  đã trả lời câu đó; các câu chưa trả lời không lộ khóa đáp án. Câu cuối tự kết thúc.

Tất cả endpoint yêu cầu đăng nhập và kiểm tra sở hữu. Tạo thử thách/ôn tập khoá tài khoản để
ngăn tạo trùng trên nhiều tab. Kết quả trắc nghiệm độc lập với tự đánh giá flashcard; không gọi
AI/API ngoài. Thời gian làm câu hỏi và ôn tập từ Home dùng cơ chế đếm mục tiêu sẵn có.

## Lịch ôn FSRS (UC-V17 – UC-V20)

Thư viện Python `fsrs==6.3.2` thực hiện FSRS-6, dùng bộ tham số mặc định và mục tiêu ghi nhớ 90%.
Tắt fuzzing để ngày dự kiến trên bốn nút và ngày lưu dùng cùng phép tính, không lệch do ngẫu nhiên.
Mỗi response phiên học có `rating_options` cho thẻ chưa đánh giá hiện tại (grade 0–3, `due_at` UTC ms).
Preview không cập nhật trạng thái thẻ hoặc thêm log. Thời điểm đánh giá thật là lúc server nhận yêu cầu.
API lịch có `reviewed_today_count`, đếm `card_id` duy nhất đã đánh giá từ 00:00 Việt Nam đến hiện tại;
bao gồm cả thẻ mới học, không cộng nhiều lần khi cùng thẻ ôn lại trong ngày.
Số **Đến hạn hôm nay** trên giao diện dùng `today_count` (gồm quá hạn và mọi hạn còn lại hôm nay).
Thẻ vừa ôn nhưng được hẹn lại trong ngày vẫn được tính. `due_count` chỉ gồm thẻ đã đến đúng giờ,
dùng để mở nút/bắt đầu phiên. Khi đang chờ, hiện giờ Việt Nam từ `next_due_at`; frontend hẹn làm mới
ở thời điểm đó. Home chuyển sang xem lịch, không tự mở lượt ôn từ yếu trước giờ hẹn.
Đây là tính toán cục bộ trên backend; không cần dịch vụ AI, Firebase hoặc API trả phí.

- **UC-V17:** Sau mỗi đánh giá hợp lệ, backend cập nhật `flashcard_schedules` và thêm một
  `flashcard_review_logs` trong cùng transaction với phiên học. Grade 0/1/2/3 tương ứng
  Again/Hard/Good/Easy. “Mơ hồ” có nghĩa vẫn nhớ nhưng khó; khi quên phải chọn “Chưa nhớ”.
  Giữ learning steps 1 phút, 10 phút và relearning 10 phút của thư viện. Chưa đến đúng thời điểm
  thì không đưa vào phiên đến hạn. Thẻ có cùng ID dùng chung trạng thái giữa bài học/yêu thích;
  các thẻ tự tạo riêng biệt vẫn độc lập dù cùng chữ. Ôn từ yếu/câu sai giữ `srs_id` gốc.
- **UC-V18:** `POST /api/flashcards/due-review` tạo/tiếp tục phiên gồm tối đa 100 thẻ đang đến hạn,
  ưu tiên thẻ quá hạn lâu nhất. Hết một phiên có thể bắt đầu lượt tiếp theo nếu còn thẻ.
  Chỉ lấy thẻ đã học, không tự đưa thẻ mới vào. Khi chưa có thẻ trả 409 với thông báo rõ ràng.
  Khi thẻ trong snapshot đã được ôn qua phiên khác, chặn đánh giá lại; tải lại phiên sẽ loại
  thẻ chưa đánh giá không còn đến hạn. Home có nút ôn đến hạn, màn Flashcard có nút riêng.
- **UC-V19:** `GET /api/flashcards/schedule?days=30` (1–90 ngày) trả số thẻ đang đến hạn,
  quá hạn, đến hạn trong ngày, tổng thẻ đang có lịch và hạn gần nhất. Lịch gộp quá hạn vào hôm nay;
  các ngày sau chỉ đếm hạn kế tiếp hiện tại, không dự đoán những lần ôn chưa diễn ra.
  UI hiện 3 ngày gần nhất, có thể mở rộng 30 ngày trong khung cuộn ngắn. Desktop đặt
  lịch/thống kê ở sidebar phải và danh mục bộ thẻ dạng grid 2–3 cột bên trái. Ngày học dùng
  `Asia/Ho_Chi_Minh`; thời điểm FSRS lưu UTC/millisecond.
- **UC-V20:** Theo lựa chọn sản phẩm, sử dụng **thông báo cục bộ trên điện thoại** bằng
  `@notifee/react-native` 9.1.8; không phải push từ server. Người dùng bật trong màn Flashcard,
  cấp quyền thông báo, chọn giờ HH:mm (mặc định 19:00 giờ Việt Nam). Backend lưu cấu hình qua
  `PUT /api/flashcards/reminder` với `{enabled, hour, minute}`. API lịch trả kế hoạch nhắc
  một lần/ngày cho tối đa 30 ngày; chỉ các ngày có thẻ đã đến hạn ở giờ nhắc. Tính cả thẻ tồn
  từ trước, dùng nội dung chung để không lộ từ đang học trên màn khoá.

Ứng dụng đồng bộ lịch thông báo khi vào màn chính sau đăng nhập, trở lại foreground,
và sau khi tự đánh giá/sửa bộ thẻ. Khi đang mở, làm mới mỗi phút. Các trigger đã hẹn do hệ điều hành
thực hiện khi đóng app hoặc offline. Mở app offline không xoá lịch nhắc cùng tài khoản.
Tắt nhắc hoặc đăng xuất sẽ huỷ trigger và thông báo đã hiện; đổi tài khoản xoá lịch của người trước.
Chạm thông báo dẫn tới phiên ôn đến hạn sau đăng nhập đúng tài khoản. Nếu không còn thẻ đến hạn,
hiển thị thông báo và danh mục lịch ôn. Web có lịch/phiên ôn, chỉ bật nhắc trong ứng dụng native.

Giới hạn thông báo cục bộ: lịch đã hẹn chỉ dựa trên dữ liệu lần đồng bộ gần nhất. Học trên thiết bị
khác hoặc không mở app hơn 30 ngày sẽ cần mở app để cập nhật. Bật sau giờ nhắc sẽ hẹn ngày kế tiếp.
Android dùng WorkManager mặc định, không yêu cầu quyền exact-alarm; chế độ tiết kiệm pin có thể
làm trễ giờ nhắc. Giờ nhắc giữ theo Việt Nam kể cả khi điện thoại đổi múi giờ.

### Cài đặt và chuyển dữ liệu

```sh
cd backend
venv/bin/python -m pip install -r requirements.txt
venv/bin/python -m flask --app app db upgrade
venv/bin/python -m flask --app app backfill-flashcard-srs
```

Migration `0a12b3c4d5e6` thêm lịch FSRS, log ôn và cấu hình nhắc. Lệnh backfill replay lịch sử
gốc theo `rating_times` (thiếu thì dùng `started_at`), có thể chạy lại mà không nhân đôi log.
Chạy sau migration, trước khi đưa tính năng vào sử dụng. Snapshot ôn cũ có ID ngẫu nhiên, không có
`srs_id`, được bỏ qua để tránh ghép nhầm thẻ; những snapshot mới giữ nguyên danh tính thẻ.
Thẻ tự tạo không thay đổi nội dung giữ ID khi sửa bộ; thẻ bị bỏ/thay nội dung được ngừng lịch cũ,
vẫn giữ lịch sử và snapshot để tổng kết. Tối ưu tham số cá nhân tự động chưa nằm trong UC-V17–V20;
log lưu đầy đủ để có thể triển khai sau.

Sau `npm install` ở frontend, chạy `pod install` trong `frontend/ios` và build lại Android/iOS
để liên kết native module. Android khai báo `POST_NOTIFICATIONS`; iOS xin quyền qua Notifee.
Không cần APNs entitlement, GoogleService-Info.plist hoặc google-services.json cho thông báo cục bộ.

Kiểm thử backend bao gồm tính lịch FSRS thực, ngày Việt Nam, quá hạn, tính riêng tư,
idempotency, phiên cũ, backfill, sửa bộ và gửi đồng thời trên PostgreSQL. Kiểm thử frontend
bao gồm lịch/ngày trống, mở phiên đến hạn, lỗi mạng, quyền thông báo, giới hạn trigger, đăng xuất,
đổi tài khoản và mở thông báo. Vẫn cần xác nhận hành vi hệ điều hành trên điện thoại thực
(foreground/background/đã đóng app, từ chối quyền, tắt tiết kiệm pin).
