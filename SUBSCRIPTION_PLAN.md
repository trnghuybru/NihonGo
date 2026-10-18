# Dự thảo subscription cho NihonGO

Ngày thiết kế: 13/10/2026. Trạng thái: đề xuất cho beta, chưa triển khai vào ứng dụng.

Các giá $5, $10, $20, $50 được hiểu là USD cho một tháng. Các hạn mức và ngân sách
dưới đây là giả định kinh doanh để thử nghiệm, chưa phải kết quả đo chi phí thực tế.
Chưa tính thuế, phí cửa hàng ứng dụng/thanh toán, máy chủ, lưu trữ và hỗ trợ.

## 1. Nguyên tắc sản phẩm

- Người dùng thấy số phút và số lượt còn lại theo chức năng; không phải tự tính token.
- Backend ghi nhận token, loại dữ liệu, model và chi phí cho từng lần gọi provider.
- Mọi gói dùng cùng chất lượng model ban đầu: Gemini Live cho hội thoại;
  Gemini 3.1 Flash-Lite cho đánh giá, nhận xét, câu hỏi và dịch phụ đề.
- Gói cao hơn tăng dung lượng sử dụng, không mặc định tạo câu trả lời chính xác hơn.
- Tra từ, bài học đã nhập, xem video/phụ đề/bản dịch đã có và xem lại nhận xét không
  tiêu hao quota AI. Các hoạt động này vẫn có giới hạn tốc độ để bảo vệ hệ thống.
- Mỗi chức năng có quota riêng; đồng thời có ngân sách Gemini tổng cho tài khoản.
  Không cộng token âm thanh và văn bản thành một hạn mức token chung.
- Không quảng cáo AI không giới hạn trong beta. Hạn mức beta có thể được điều chỉnh
  cho kỳ tiếp theo sau khi thông báo; không âm thầm giảm quyền đã mua trong kỳ hiện tại.

## 2. Các gói và hạn mức

Trial là quyền dùng một lần trong 7 ngày sau khi tài khoản được xác minh, không tự
cấp lại mỗi tháng. Khi hết Trial, tài khoản Free vẫn dùng nội dung có sẵn.

| Quyền sử dụng | Trial / Free | Starter $5/tháng | Plus $10/tháng | Pro $20/tháng | Intensive $50/tháng |
|---|---:|---:|---:|---:|---:|
| Tra từ, học bài đã nhập, xem video có sẵn | Có | Có | Có | Có | Có |
| Hội thoại Live: phút/kỳ | 3 phút một lần | 15 | 40 | 80 | 220 |
| Hội thoại Live: tối đa phút/ngày | 3 | 5 | 10 | 20 | 40 |
| Hội thoại Live: tối đa phút/phiên | 3 | 5 | 10 | 15 | 15 |
| Tạo đánh giá toàn buổi: lượt/kỳ | 1 | 5 | 10 | 20 | 50 |
| Tạo nhận xét từng câu: lượt/kỳ | 2 | 10 | 25 | 60 | 150 |
| Tạo câu hỏi: số câu/kỳ | 2 | 10 | 20 | 50 | 100 |
| Số câu tối đa mỗi lần tạo | 2 | 3 | 5 | 10 | 10 |
| Yêu cầu dịch mới: phút phụ đề/kỳ | 0 | 10 | 20 | 40 | 100 |
| Nhập URL video mới có phụ đề sẵn: video/kỳ | 0 | 2 | 5 | 10 | 20 |
| Thiết bị có phiên đăng nhập còn hiệu lực | 1 | 2 | 2 | 3 | 3 |
| Phiên hội thoại Live đồng thời | 1 | 1 | 1 | 1 | 1 |
| Trần chi phí Gemini nội bộ/kỳ | $0,25 | $1,50 | $3,00 | $6,00 | $15,00 |

Hạn mức paid reset ở đầu kỳ subscription, không phải mặc định ngày 1 hàng tháng.
Quota ngày reset lúc 00:00 theo Asia/Ho_Chi_Minh. Thời gian lưu UTC, giao diện hiển
thị theo múi giờ tài khoản. Không chuyển hạn mức chưa dùng sang kỳ tiếp theo trong beta.

“Phút Live” là thời gian phiên kết nối hoạt động, kể cả nhập chữ qua Live và nghe AI
trả lời. Tạm dừng chỉ ngừng tính phút sau khi backend đã đóng/ngắt phiên Gemini.
Backend cộng thời gian chính xác bằng giây, không làm tròn mỗi lần người dùng giữ micro.
Ngắt phiên khi app chuyển nền hoặc không có hoạt động người dùng/phát audio 60 giây.
Các giới hạn phiên có thể cần rút ngắn nếu context tăng nhanh hoặc gần hết ngân sách.

Các quota trên là mức tối đa theo từng chức năng và còn phụ thuộc ngân sách AI tổng.
Nếu chạm trần ngân sách trước khi hết số phút/lượt, AI mới sẽ tạm dừng. Phải hiển thị
điều kiện này trước khi mua beta và trong trang hạn mức. Nếu muốn bán số phút/lượt
được bảo đảm đầy đủ, cần đo chi phí, dành ngân sách đủ cho trường hợp xấu và để hệ
thống chịu sai lệch thay vì cắt sớm quyền của người dùng.

## 3. Quy tắc theo từng chức năng

### Hội thoại

Giữ model/phong cách hội thoại hiện tại. Không thêm chat văn bản REST độc lập vào
bảng giá trong beta; nhập chữ trong ConversationScreen vẫn đi qua Gemini Live và
tiêu phút Live. Endpoint POST /messages còn tồn tại cần được kiểm soát quyền; không
được trở thành đường gọi AI miễn phí ngoài quota. Có thể khoá endpoint này với
người dùng beta, chỉ giữ cho nội bộ/kiểm thử cho đến khi có chính sách riêng.

Giữ trước ngân sách cho từng đoạn hội thoại ngắn, gia hạn chỉ khi đủ quota.
Báo còn 1 phút trước khi hết hạn mức; dừng cấp thêm lượt khi hết, vẫn lưu transcript
đã hoàn tất. Phần tổng kết dùng quota chấm điểm riêng. Không xoá nội dung khi hết quota.

### Đánh giá toàn buổi và nhận xét câu

- Một kết quả mới thành công tương ứng một lượt. Xem lại kết quả đã lưu không trừ.
- Chưa đủ nội dung thì kiểm tra trước khi gọi Gemini và không trừ lượt.
- Hệ thống tự retry nằm trong cùng một thao tác của người dùng. Chi phí provider
  của từng attempt vẫn được ghi riêng, kể cả khi output bị từ chối.
- Thao tác thất bại hoàn quota chức năng; chi phí thực đã phát sinh vẫn phải được
  ghi vào sổ chi phí. Chi phí retry/lỗi hệ thống được theo dõi riêng để xem xét hỗ trợ
  và phát hiện lạm dụng, không giả định lỗi đồng nghĩa provider không tính phí.
- Đánh giá dùng transcript đã lưu, không cho phép user gửi văn bản dài tuỳ ý.
- Cần giới hạn kích thước transcript và output theo ngân sách. Transcript quá dài
  phải dùng quy trình chia đoạn/tóm tắt có tính phí, hoặc từ chối rõ ràng; không cắt
  âm thầm rồi báo đã đánh giá cả buổi.

### Câu hỏi video

- Trừ theo số câu tạo thành công: bộ 3 câu trừ 3, bộ 10 câu trừ 10.
- Quota câu hỏi tách khỏi số lần API gọi. Hiện code gọi theo từng cửa sổ nội dung,
  nên tạo 3 câu có thể là 3 lần gọi và có thể thêm lần retry.
- Không lưu câu hỏi sau khi rời video theo yêu cầu hiện tại. Tạo lại là thao tác mới,
  vẫn trừ quota; sổ usage không cần lưu nội dung câu hỏi để theo dõi chi phí.
- Nếu bộ câu hỏi bị lỗi và không trả được bộ hoàn chỉnh, không trừ số câu cho user;
  vẫn ghi chi phí các attempt đã chạy và giới hạn số lần thử lại.
- Video dùng tạo câu hỏi tối đa 20 phút trong beta; đồng thời phải giới hạn token
  thực tế. Video ngắn nhưng rất nhiều chữ vẫn có thể bị từ chối trước khi gọi AI.

### Dịch phụ đề

- Bản dịch có sẵn dùng chung: không trừ hạn mức khi đọc lại.
- Chỉ yêu cầu tạo bản dịch mới mới dùng quota. Tính theo thời lượng video, làm tròn
  lên đơn vị một phút tại lúc giữ quota; hoàn phần không xử lý được khi thất bại.
- Một video tối đa 20 phút và không vượt số phút dịch còn lại; yêu cầu 20 phút với
  gói chỉ còn 10 phút phải bị từ chối trước khi tạo job, không âm thầm dịch một nửa.
- Nếu hai người cùng yêu cầu một video, chỉ tạo một job. Người yêu cầu đầu giữ
  quota; người sau xem tiến độ/đọc bản dịch, không bị trừ lại.
- Chi phí bản dịch dùng chung thuộc ngân sách nội dung hệ thống, có attribution
  tới người khởi tạo để kiểm soát quyền yêu cầu. Bảng ước lượng ở dưới phân bổ nó
  theo người khởi tạo để tính chi phí kinh doanh, không tính phí lần nữa cho người sau.
- Hệ thống cần thêm trần ngân sách nội dung dùng chung theo tháng và giới hạn hàng
  đợi. Khi trần này hết, dừng yêu cầu dịch mới nhưng giữ quyền đọc bản dịch đã có.

### Video, từ điển, bài học và bản thu

- Chỉ nhập URL YouTube có phụ đề Nhật gốc hoặc phụ đề tự động sẵn. Video trong kho
  không tính thành video nhập mới. Cùng một URL chỉ tạo một job chung.
- Trong beta công khai, không tự chạy Whisper khi video thiếu phụ đề. Whisper
  hiện là chi phí CPU/worker, không phải token Gemini; cần dự toán riêng trước
  khi mở quyền ASR. Kho video có sẵn vẫn tiếp tục xem được.
- Tra từ hiện là truy vấn database; không dùng Gemini cho mọi lần tìm kiếm.
  Giải thích nghĩa bằng AI là chức năng tương lai, chưa nằm trong gói này.
- Chưa thêm quyền lưu từ/SRS hoặc quyền nội dung chưa có trong app vào bảng giá.
- Lịch sử đã lưu vẫn đọc được sau khi hết gói. Người dùng vẫn có thể xoá dữ liệu.
- Nếu lưu bản thu đang bật, áp dụng trần lưu trữ và thời gian lưu riêng; chưa mở
  lưu audio không giới hạn. Trước khi bán gói cần chốt mức lưu trữ sau khi đo
  kích thước các bản ghi WAV/PCM thực tế. Không tự xoá audio đã cam kết lưu.

## 4. Giới hạn tài khoản và tốc độ

| Hành động | Trial | Starter | Plus | Pro | Intensive |
|---|---:|---:|---:|---:|---:|
| Đánh giá mới tối đa/ngày | 1 | 2 | 3 | 5 | 10 |
| Nhận xét câu mới tối đa/ngày | 2 | 5 | 10 | 20 | 40 |
| Câu hỏi mới tối đa/ngày | 2 | 5 | 10 | 20 | 40 |
| Yêu cầu dịch mới tối đa/ngày | 0 | 1 | 1 | 2 | 3 |
| Nhập video mới tối đa/ngày | 0 | 1 | 2 | 3 | 5 |

Quota ngày và quota kỳ áp dụng đồng thời, không cộng thêm vào nhau.
Mỗi tài khoản chỉ chạy một thao tác AI văn bản hoặc job dịch do mình khởi tạo
đồng thời. Một bộ câu hỏi có thể chạy các request nội bộ song song, nhưng chúng
chia sẻ cùng reservation. Hội thoại Live có slot riêng và vẫn chịu ngân sách chung.

Chặn bấm tạo liên tục, cooldown 10 giây giữa thao tác tạo và tối đa 3 lần retry thủ
công cho cùng thao tác trong 10 phút. Đối soát/reservation quyết định có được gọi
thêm hay không. Request đọc có giới hạn tốc độ riêng phù hợp polling/player, không
áp một rate limit chung gây lỗi tải phụ đề. Áp rate limit theo user và IP cho đăng
ký, đăng nhập, cấp token và các endpoint phát sinh phí.

Quyền Trial cần tài khoản xác minh, bảo vệ đăng ký và giới hạn cấp Trial theo IP/
thiết bị có xem xét mạng dùng chung. Không coi cùng IP là bằng chứng chắc chắn
của cùng người. Không dùng fingerprint xâm lấn mặc định. Có trang quản lý phiên
đăng nhập để người dùng tự thu hồi thiết bị cũ; chỉ revoke thêm khi vượt trần.

## 5. Ước lượng chi phí

Giá provider tham khảo tại ngày thiết kế:

- Gemini 3.1 Flash-Lite: input text $0,25/triệu token; output gồm thinking
  $1,50/triệu token.
- Gemini 3.8 Live: input text $0,75/triệu; output text $4,50/triệu; audio input
  $3/triệu (khoảng $0,005/phút audio); audio output $12/triệu (khoảng $0,018/phút audio).

Nguồn: [Google Gemini API pricing](https://ai.google.dev/gemini-api/docs/pricing).
Một phút audio input, một phút audio output và một phút phiên kết nối là ba đại
lượng khác nhau; không dùng giá audio/phút để cam kết thẳng chi phí/phút Live.

Để lập ngân sách beta, dùng các mức dự phòng sau. Đây là giả định ước lượng theo
thao tác, không phải giá niêm yết của Gemini hoặc bảo đảm chi phí tối đa:

| Hạng mục | Chi phí dự phòng dùng tính bảng |
|---|---:|
| Một phút phiên Live | $0,04 |
| Một đánh giá buổi | $0,03 |
| Một nhận xét câu | $0,008 |
| Một câu hỏi | $0,015 |
| Một phút phụ đề mới được dịch | $0,005 |

Các mức dự phòng văn bản cần giới hạn token đầu vào/đầu ra và retry khi triển khai.
Giả định chấm điểm dưới 20.000 token input, tối đa 4.096 output/lần; nhận xét câu
dưới 6.000 input, tối đa 1.024 output; mỗi câu hỏi dưới 20.000 input, tối đa 1.024
output; tối đa hai attempt cho thao tác văn bản. Những giới hạn output này khác
code hiện tại và phải kiểm tra chất lượng trước khi áp dụng. Nếu JSON thường bị
cắt hoặc không đủ để chấm điểm, tăng ngân sách/giảm quota hoặc chia bài toán;
không tăng retry vô hạn. Các limits có thể điều chỉnh theo model và phiên bản giá.

| Gói | Live | Chấm điểm | Nhận xét câu | Câu hỏi | Dịch mới phân bổ | Tổng chi phí giả định dùng hết quota | Trần AI |
|---|---:|---:|---:|---:|---:|---:|---:|
| Trial | $0,12 | $0,03 | $0,016 | $0,03 | $0 | $0,196 | $0,25 |
| Starter | $0,60 | $0,15 | $0,08 | $0,15 | $0,05 | $1,03 | $1,50 |
| Plus | $1,60 | $0,30 | $0,20 | $0,30 | $0,10 | $2,50 | $3,00 |
| Pro | $3,20 | $0,60 | $0,48 | $0,75 | $0,20 | $5,23 | $6,00 |
| Intensive | $8,80 | $1,50 | $1,20 | $1,50 | $0,50 | $13,50 | $15,00 |

Trần AI paid bằng 30% giá gói, tăng so với gợi ý ngân sách 20–25% ban đầu để có
thêm dự phòng beta. Chi phí thực tế có thể cao hơn bảng do lịch sử Live, văn bản
transcript, thời gian AI nói, phụ đề dày, retries và thay đổi giá. Trần nội bộ chỉ
có ý nghĩa khi thực thi bằng backend. Chi phí phát sinh trên provider trước lúc
ngắt/timeout vẫn có thể tạo sai lệch nhỏ; cần dự phòng và đối soát hoá đơn.

Không lấy doanh thu trừ Gemini rồi gọi phần còn lại là lợi nhuận. Ví dụ 100 tài
khoản Plus có doanh thu danh nghĩa $1.000/kỳ và ngân sách AI phân bổ tối đa $300;
vẫn phải trả các chi phí vận hành và thanh toán khác. 100 người Trial dùng hết
quota theo giả định tiêu khoảng $19,60; nên mở đợt mời nhỏ thay vì Trial công khai
không giới hạn số tài khoản.

## 6. Thiết kế thực thi và sổ sử dụng

1. `subscription_plans`: mã gói, giá, phiên bản, limits theo chức năng, ngân sách.
2. `subscriptions`: user, gói, trạng thái, bắt đầu/kết thúc kỳ, nguồn thanh toán.
3. `usage_periods`: quota đã tiêu/đang giữ và ngân sách đã dùng/đang giữ của kỳ.
4. `ai_reservations`: thao tác, mức giữ, trạng thái, deadline, idempotency key.
5. `ai_provider_attempts`: mỗi lần gọi Gemini, user/feature/job/session, model,
   input/output/thinking/cached tokens theo modality, cost, price_version và trạng thái.
6. `usage_events`: ghi tăng/giảm quota chức năng, điều chỉnh/hỗ trợ và attribution.
7. `user_sessions`: phiên đăng nhập/thiết bị, thời điểm dùng cuối và revoke.

Không lưu API key, audio hoặc toàn bộ prompt trong ledger. Dùng số nguyên micro-USD
cho tiền, số nguyên token/giây cho lượng sử dụng. Sổ chi phí toàn hệ thống gồm cả
calls thất bại, gọi nội bộ và nội dung dùng chung, không chỉ những calls trừ quota user.

Backend kiểm tra đồng thời gói hiệu lực, quota ngày/kỳ, slot đồng thời và budget;
khóa/cập nhật atomically trong database trước khi tạo reservation. Ước lượng input
bằng tokenizer/countTokens khi cần và đặt output cap. Nếu dùng countTokens, tính
thêm độ trễ/rate limit của bước này. Chi phí kết quả đọc từ usageMetadata, phân
biệt cached input, input thường và output/thinking để tránh tính trùng token.
Model và bảng giá do server chọn, không nhận từ client.

Sau mỗi attempt: lưu usage kể cả JSON không hợp lệ. Sau mỗi thao tác: commit quota
thành công, hoàn reservation chưa dùng, giữ trường hợp timeout chưa rõ đã tính phí
ở trạng thái cần đối soát. Worker cần mang reservation/user attribution; idempotency
ngăn queue gửi lại gây trừ quota hai lần. Quota câu hỏi cộng theo bộ thành công,
nhưng chi phí cộng từng request trong bộ. Giá cũ vẫn gắn với usage cũ khi đổi bảng giá.

Live hiện kết nối trực tiếp từ app bằng ephemeral token. Trước khi bán subscription,
ưu tiên proxy WebSocket ở backend để nhận usage đáng tin cậy và ngắt phiên khi hết
quota. Client-reported usage chỉ hỗ trợ chẩn đoán, không là căn cứ duy nhất cho billing.
Theo dõi usage theo phiên/turn và semantics của provider để tránh cộng metadata luỹ
kế nhiều lần. Rút ngắn context/gia hạn phiên với quy trình có giới hạn; không mở
token Live 30 phút cho tài khoản chỉ còn vài phút/quota nhỏ.

Tài liệu tham khảo: [Live API usage metadata](https://ai.google.dev/api/live),
[ephemeral tokens](https://ai.google.dev/gemini-api/docs/live-api/ephemeral-tokens),
[project rate limits](https://ai.google.dev/gemini-api/docs/rate-limits).
Quota provider theo project không thay thế quota mỗi user. Hàng đợi cần giới hạn
RPM/TPM/concurrent Live trên toàn hệ thống và công bằng giữa các tài khoản.

API đề xuất: GET /api/subscription/plans, GET /api/me/subscription,
GET /api/me/usage, GET /api/me/usage/history, GET/DELETE /api/me/devices.
Tạo quyền subscription bằng webhook đã xác minh hoặc thao tác admin được audit;
không nhận trạng thái thanh toán thành công từ client làm bằng chứng.

## 7. Giao diện, hết hạn và thay đổi gói

Trang Cá nhân có mục Gói của bạn, giá/kỳ, ngày gia hạn và hạn mức còn lại từng chức
năng. Mỗi lần tạo AI hiển thị lượng sẽ dùng trước khi xác nhận. Cảnh báo ở 80% quota
hoặc ngân sách, hết quota hiện thời điểm reset/nâng gói. Hết quota ngày hiện rõ là
giới hạn ngày để không khiến người dùng nghĩ mất toàn bộ quyền tháng.

- Hết gói: về Free, dừng tạo AI mới; vẫn đọc lịch sử và nội dung đã có.
- Huỷ gia hạn: giữ quyền đến cuối kỳ đã trả tiền.
- Hạ gói: áp dụng ở kỳ sau. Nâng gói beta: tăng quota theo chênh lệch khi thanh toán
  được xác minh, không reset số đã dùng; cách tính tiền chênh lệch phải thống nhất
  với nhà cung cấp thanh toán trước khi triển khai.
- Reservation đang chạy phải được xử lý một lần theo kỳ gốc; không chuyển sang
  kỳ mới rồi hoàn/trừ sai số dư. Thu hồi quyền do chargeback/refund theo chính sách
  thanh toán được công bố, vẫn giữ quyền truy cập/xoá dữ liệu cá nhân.

## 8. Điều kiện mở beta

Thứ tự triển khai: ledger và đo usage -> quota/reservations -> kiểm soát Live ->
giao diện hạn mức -> cấp gói thủ công cho nhóm mời -> tích hợp thanh toán.

Chạy thử 10–20 người trong 1–2 tuần, đo chi phí mỗi phút/phiên, mỗi thao tác,
p50/p95, tỷ lệ retry, tỷ lệ token thinking và tải worker. So sánh ledger với billing
Gemini. Kiểm tra hai thiết bị gọi đồng thời, request gửi lại, lỗi timeout, reset kỳ,
queue replay, ngân sách chung và nội dung cache. Có công tắc tắt từng tính năng AI
phát sinh phí và trần chi phí toàn beta được thực thi trong backend.

Chỉ chốt bảng giá thương mại sau khi các phép đo cho thấy đủ ngân sách cấp đầy đủ
quyền sử dụng đã công bố. Bản này không sửa luồng ứng dụng, chưa tạo migration,
chưa tích hợp thanh toán và chưa bật quota thật.
