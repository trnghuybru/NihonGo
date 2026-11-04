# NihonGO — Đặc tả giao diện

## Định hướng

Giao diện ấm, nhẹ và thân thiện với ứng dụng học ngôn ngữ. Tham chiếu hình và component mẫu người dùng cung cấp: nền kem pha hồng nhạt, thẻ trắng bo tròn lớn, màu cam đào, biểu tượng nét tròn, nút viên thuốc và bóng đổ ấm rất nhẹ.

Áp dụng cho đăng nhập, đăng ký, xác thực email, khôi phục mật khẩu, thiết lập học tập và tài khoản. Nội dung, dữ liệu và các thao tác lấy từ chức năng thực tế của NihonGO. Không đưa số điểm, chuỗi ngày học, khóa học, thử thách hoặc thanh điều hướng trong hình mẫu vào màn hình tài khoản.

Nguồn cấu hình: `frontend/src/theme/theme.ts`. Các component dùng chung nằm tại `frontend/src/components/AuthForm.tsx` và `AuthIcon.tsx`.

## Nội dung giao diện

- Ưu tiên nhãn ngắn và trực tiếp. Không tự thêm slogan, lời dẫn, câu động viên hoặc mô tả phụ dưới nút/thẻ khi chức năng đã rõ.
- Giữ dữ liệu, trạng thái và lỗi cần thiết cho thao tác. Không lặp lại nội dung nút bằng một câu giải thích bên dưới.

## Màu sắc

| Token | Giá trị | Vai trò |
| --- | --- | --- |
| `background` | `#FFFBF7` | Nền kem của màn hình |
| `backgroundRose` | `#FFF1F2` | Nền hồng rất nhạt cho các biến thể |
| `surface` | `#FFFFFF` | Thẻ nội dung và nền nút phụ |
| `surfaceTint` | `#FFF8F1` | Nền input, hướng dẫn |
| `primary` | `#FCA04B` | Nút chính, dấu bước hiện tại, điểm nhấn |
| `primaryPressed` | `#F28D35` | Nút chính khi nhấn |
| `primaryText` | `#FCA04B` | Liên kết, icon nhấn mạnh, chữ cam |
| `onPrimary` | `#FFFFFF` | Chữ/icon trên nền cam |
| `dark` | `#252526` | Tiêu đề, giá trị quan trọng |
| `body` | `#4D4D4F` | Nội dung chính |
| `muted` | `#77716C` | Chú thích, nhãn phụ |
| `placeholder` | `#82766C` | Gợi ý trong input |
| `border` | `#E5D9CF` | Viền input mặc định |
| `divider` | `#F1E7DE` | Đường phân chia nhẹ |
| `focus` | `#B65A13` | Viền input đang nhập |
| `track` | `#F8EDE2` | Bước chưa đến hoặc nền trung tính ấm |
| `badgeBg` / `badgeText` | `#FFF0DE` / `#91430E` | Trạng thái chờ xác thực |
| `successBg` / `success` | `#EFF8ED` / `#34704A` | Đã xác thực |
| `dangerBg` / `danger` | `#FFF0EF` / `#B33A37` | Lỗi và cảnh báo cần xử lý |
| `disabled` / `disabledText` | `#F0E8E1` / `#7C7065` | Điều khiển bị vô hiệu hóa |

Theo mẫu typography được người dùng chốt: nút chính dùng chữ trắng trên nền cam `#FCA04B`; liên kết và nút viền dùng chữ cam `#FCA04B`. Tiêu đề dùng `#252526`, mô tả dùng `#4D4D4F`. Lỗi vẫn dùng đỏ riêng và có thông báo bằng chữ.

Toàn ứng dụng dùng lớp nền `AppBackground` chung ở gốc `App`, gồm nền kem
`background` và hai vùng sáng SVG radial gradient: hồng `#F9CCD6` và đào `#FFDDB7`, opacity tối đa 0.5 rồi giảm về 0. Đây là lớp trang trí, không nhận thao tác và không được đọc bởi screen reader. Không dùng ảnh bitmap hoặc blur kích thước lớn. Màn hình, ScrollView và vùng
bao nội dung để trong suốt, không đặt lại nền màu đặc hoặc vẽ gradient riêng.
Modal/toàn màn hình và ngăn tra nhanh nằm ở lớp portal dùng cùng `AppBackground`.
Thẻ, input, sidebar và thanh điều hướng giữ màu surface theo vai trò.

## Typography

Ứng dụng nhúng **Readex Pro thật** với ba file TTF: Regular (400), Medium (500), SemiBold (600). Nguồn và giấy phép SIL Open Font License được lưu tại `frontend/src/assets/fonts/README.md` và `OFL.txt`. Các font đã được kiểm tra hỗ trợ ký tự tiếng Việt.

iOS đăng ký bằng `UIAppFonts` và Copy Bundle Resources; dùng family `Readex Pro` với weight tương ứng. Android đóng gói vào `android/app/src/main/assets/fonts`, chọn chính xác từng face `ReadexPro-Regular`, `ReadexPro-Medium`, `ReadexPro-SemiBold`; giữ `fontWeight: normal` ở style Android vì độ đậm đã nằm trong file, tránh bold giả. Dùng helper `readexFont` khi cần một weight cụ thể.

Inter Tight trong ví dụ chỉ xuất hiện ở giờ trên status bar; giữ status bar thật của hệ điều hành. Không nhúng Inter Tight hoặc tự dựng đồng hồ để giả lập status bar.

| Token | Cỡ / chiều cao dòng | Độ đậm | Sử dụng |
| --- | --- | --- | --- |
| `title` | 18 / 24 | 600 | Tiêu đề màn hình, tương ứng tiêu đề thẻ trong mẫu |
| `heading` | 16 / 20 | 500 | Tiêu đề nhóm thông tin |
| `body` | 12 / 16 | 400 | Mô tả và hướng dẫn |
| `label` | 14 / 20 | 500 | Nhãn input, thông tin tài khoản |
| `caption` | 12 / 16 | 500 | Badge và nhãn bước |
| `button` | 14 / 20 | 600 | CTA chính và nút viền |
| `link` | 12 / 16 | 500 | Quên mật khẩu, đăng ký ngay, gửi lại mã |
| `input` | 14 / 20 | 400 | Nội dung nhập và placeholder |
| `code` | 18 / 24 | 600 | OTP |
| `brand` | 24 / 32 | 600 | Logo chữ NihonGO; tracking -0.6 |

Các kiểu chữ nội dung dùng khoảng cách ký tự mặc định, không siết tracking. OTP có khoảng cách ký tự 7 và chữ số có cùng độ rộng. Cho phép font scale theo hệ điều hành và xuống dòng khi cần. Không cắt email, tên người dùng hoặc nhãn nút để ép vừa kích thước cố định. `wordWrap: break-word` trong mẫu web được thể hiện bằng flex layout, `flexShrink` và cơ chế xuống dòng của React Native; không đưa thuộc tính CSS web này vào native style.

## Bố cục và khoảng cách

- Đơn vị khoảng cách: **4, 8, 12, 16, 20, 24, 32**.
- Lề màn hình: **20** mỗi bên. Nội dung rộng tối đa **480**, căn giữa trên màn hình lớn.
- Thanh thương hiệu: `BrandLogo` giữ đầu Momo theo mẫu logo người dùng, ghép với chữ `NihonGO` dùng token `typography.brand`: Readex Pro SemiBold 600, 24/32, tracking -0.6. Phần `Nihon` dùng `dark`, `GO` dùng `primary`. Dấu đầu Momo 40 px, khoảng cách đến chữ 8 px; bản khởi động có dấu 56 px và giữ typography thương hiệu. Screen reader đọc một nhãn `NihonGO`. Bên phải là nhãn tĩnh `日本語`, không phải bộ chọn ngôn ngữ.
- Khoảng cách sau thanh thương hiệu: **32**. Màn hình đăng nhập và tài khoản vào thẳng tiêu đề, không có dòng “Tài khoản của bạn” hoặc hàng icon trống. Các bước đăng ký/khôi phục có thể dùng icon tròn 52 và nhãn ngữ cảnh trước tiêu đề.
- Khoảng cách giữa tiêu đề và thẻ đầu: **24**. Khoảng cách giữa các thẻ: **20**.
- Thẻ: nền trắng, padding **20**, gap nội dung **16**, bo góc **32**.
- Bóng thẻ: `0px 2px 30px rgba(231, 142, 58, 0.10)`; không dùng bóng đen đậm.
- Bo input **18**, khối chú thích **16**, nút và badge **999**. Dùng `borderCurve: continuous`.
- Kích thước là logical point/dp của React Native; không sao chép tọa độ absolute từ bản export HTML.

### Bố cục web theo yêu cầu cập nhật

- Dùng cùng bảng màu, font Readex Pro, typography, radius và bóng đổ với điện thoại; không đổi token theo nền tảng.
- Từ 1100 px, dùng sidebar 240 px thay thanh điều hướng đáy. Vùng dashboard/danh mục rộng tối đa 1160 px, vẫn giữ lề 20 px. Màn hình hẹp giữ navigation nổi rộng tối đa 480 px.
- Trang chủ chia hai cột; danh mục shadowing dùng grid 1–3 cột theo chiều rộng thực tế. Bài shadowing đặt video và bảng phụ đề cạnh nhau trên desktop, không thêm card bao video.
- Thanh trên cùng của desktop cao tối thiểu `layout.desktopHeaderHeight` (96 px), căn giữa theo chiều dọc cùng logo sidebar; nút quay về, tiêu đề và badge cùng trục ngang. Thanh có nền trong suốt để lộ gradient chung; giữ badge trình độ và mục tiêu phút/ngày lấy từ hồ sơ thật bên phải. Trong bài shadowing, nút quay về và tiêu đề nằm bên trái trên cùng thanh này, dùng chung component và kiểu nút với app; không lặp lại trong cột video.
- Form xác thực và thiết lập giữ khung tối đa 480 px. Trang Cá nhân trên desktop dùng khung tối đa 1160 px, hai cột cách 24 px; cột chính co giãn, cột thiết lập rộng 340 px. Trên màn hẹp giữ một cột tối đa 480 px. Hội thoại/nhận xét giữ chiều rộng đọc gọn; dialog câu hỏi AI trên web có thể rộng tối đa 720 px.

## Component và trạng thái

### AuthShell / AuthCard

`AuthShell` dùng nền chung của ứng dụng, xử lý safe area, thanh thương hiệu, tiêu đề, nội dung cuộn và footer. Mặc định bọc form trong một `AuthCard`; màn hình tài khoản dùng nhiều thẻ qua `card={false}`.

iOS dùng `contentInsetAdjustmentBehavior="automatic"`; Android cộng safe area vào padding. Không cộng safe area hai lần trên iOS. Form cuộn được khi bàn phím hiện; `KeyboardAvoidingView` xử lý iOS. Các hành động nằm trong nội dung cuộn, không bị ghim lên bàn phím.

### AuthField

- Nhãn luôn hiển thị phía trên, cách input **8**.
- Chiều cao tối thiểu **56**; nền kem nhạt và viền **1**.
- Icon nét tròn **20**, bên trái; chữ nhập đủ khoảng trống và có thể mở rộng theo font scale.
- Focus: nền trắng, viền `focus`, giữ nguyên độ dày để tránh nhảy bố cục.
- Lỗi: viền đỏ khi có `error`; thông báo đỏ có nội dung cụ thể. Lỗi API toàn form hiển thị bằng `AuthNotice` trước hành động chính.
- Mật khẩu: nút hiện/ẩn bằng icon mắt, vùng chạm tối thiểu **48 × 48**, có nhãn accessibility.
- OTP vẫn là **một TextInput** để giữ thao tác dán mã, xóa và autofill; không tách thành sáu ô gây khó sử dụng.

### AuthButton

- `primary`: nền cam, chữ trắng, bo viên thuốc, chiều cao tối thiểu **52**.
- `outline`: nền trắng, viền cam **1.5**, chữ cam `#FCA04B`; dành cho social login và thao tác phụ quan trọng.
- `text`: không viền, chiều cao tối thiểu **48**; dùng cho quên mật khẩu, gửi lại mã, quay lại và hủy.
- Loading giữ kích thước nút, hiển thị spinner, chặn thao tác lặp và công bố trạng thái busy.
- Disabled dùng bảng màu riêng, không chỉ giảm opacity toàn bộ chữ. Pressed đổi nền nhẹ, không làm dịch chuyển bố cục.

### Liên kết đăng ký

Footer đăng nhập là dòng chữ căn giữa: “Chưa có tài khoản?” màu `body`, tiếp theo “Đăng ký ngay” màu `primaryText`, Readex Pro Medium 12/16, weight 500. Chỉ phần “Đăng ký ngay” tương tác được, có accessibility role `link`, không nền, không viền, không khung nút. Vùng chạm cao tối thiểu 48; cho phép dòng chữ xuống hàng trên màn hình nhỏ. Liên kết bị vô hiệu hóa khi đang xử lý đăng nhập.

### AuthNotice / AuthSteps / AuthContact

- `AuthNotice`: khối hướng dẫn nền kem; lỗi nền đỏ nhạt, thông báo qua accessibility live region.
- `AuthSteps`: hai bước có thật — **Thông tin → Xác thực email**. Bước hiện tại dùng vòng cam, bước hoàn tất dùng dấu tick. Đây là chỉ báo, không phải nút chuyển bước.
- `AuthContact`: icon tròn, tên trường, giá trị có thể chọn/copy, badge xác thực. Badge luôn có chữ và dấu trạng thái, không truyền đạt chỉ bằng màu.

## Áp dụng cho từng luồng

| Màn hình | Bố cục |
| --- | --- |
| Đăng nhập | Khối giới thiệu → thẻ thông tin đăng nhập → liên kết quên mật khẩu → CTA chính → social nếu khả dụng → dòng chữ “Chưa có tài khoản? Đăng ký ngay” ngoài thẻ |
| Đăng ký | Giới thiệu → chỉ báo bước 1 → tên/email/SĐT/mật khẩu/xác nhận → CTA tiếp tục → liên kết quay lại |
| Xác thực | Icon email → chỉ báo bước 2 → thông tin nơi nhận mã → input OTP → CTA xác thực → gửi lại có đếm ngược |
| Quên/đặt lại mật khẩu | Icon email/khóa → thẻ form tương ứng → hướng dẫn và lỗi → CTA → quay lại |
| Thiết lập học tập | Ba bước: chọn trình độ → mục tiêu và thời lượng → xem lại và xác nhận lưu |
| Tài khoản | Tiêu đề Cá nhân và avatar chữ cái → thông tin cá nhân, xác thực liên hệ → thiết lập học tập → phiên đăng nhập với nút đăng xuất gọn |

## Điều hướng chính

Thanh điều hướng xuất hiện sau khi người dùng đã hoàn tất thiết lập học tập. Năm tab theo thứ tự: **Trang chủ**, **Luyện tập**, **Tra cứu**, **Bài học**, **Cá nhân**. Tra cứu dùng kính lúp, Bài học dùng sách; icon 24 px và nhãn nhỏ 10/14. Nghe, Nói, Đọc, Viết nằm trong màn Luyện tập để giảm số icon ở thanh dưới. Màn hình đăng nhập, xác thực và thiết lập lần đầu không hiển thị thanh này để giữ một hành động chính rõ ràng.

- Nền trắng, bo đủ bốn góc 44 px, bóng `0 -2px 12px rgba(231, 142, 58, 0.10)`. Khối nổi cách hai cạnh màn hình 16 px.
- Padding ngang trong khối 8 px để năm tab vừa màn hình 320 px; mỗi tab giữ vùng chạm ít nhất 48 × 48 px, giãn đều và không cuộn ngang. Thanh cao tối thiểu 72 px, padding trên 14 px và dưới 12 px; lớp ngoài đặt toàn bộ khối phía trên home indicator theo safe-area inset của thiết bị. Giữ lề ngoài 16 px và khung rộng tối đa 480 px.
- Icon 24 px. Tab đang chọn dùng `primary #FCA04B`; tab còn lại dùng `dark #252526`. Chấm trạng thái 6 px đặt dưới icon, cách 4 px.
- Hiển thị nhãn nhỏ dưới icon để phân biệt Tra cứu và Bài học; mỗi tab có role `tab`, selected state và tablist label cho trình đọc màn hình.
- Android Back từ một kỹ năng quay về màn chọn kỹ năng; từ màn Luyện tập, tab phụ hoặc chi tiết kế hoạch quay về Trang chủ. Màn kỹ năng có nút Chọn kỹ năng khác dùng được trên cả iOS/Android. Chuyển khỏi Nói sẽ unmount màn hình để giải phóng microphone, luồng hội thoại và TTS.
- `BottomNavigation` là controlled component: màn hình cha sở hữu `selectedTab`, còn component chỉ phát `onSelectTab`. Danh sách tab và kiểu `AppTab` có một nguồn duy nhất.
- Thẻ kỹ năng trên Home mở thẳng kỹ năng tương ứng và đánh dấu tab Luyện tập. Chạm tab Luyện tập mở bộ chọn bốn kỹ năng; dùng chung `SkillPicker` với Home để giữ nội dung và giao diện nhất quán. Tra từ trên Home mở tab Tra cứu và giữ truy vấn đã nhập; thẻ từ vựng mở tab Bài học. Nói mở lịch sử hội thoại. Cá nhân dùng `AccountScreen`. Nghe, Đọc và Viết hiện dùng màn trạng thái chưa có nội dung; không giả lập bài luyện hoặc kết quả tra cứu.

## Học từ vựng theo JLPT

- Tra cứu và Bài học là hai đích riêng trên thanh điều hướng chính, không lặp bộ chọn hai mục trong màn hình. Chuyển tab giữ bài đang mở, vị trí cuộn và truy vấn. Tab ẩn dừng audio/video và không xử lý nút Back.
- Icon kính lúp 20 px trên tiêu đề Bài học mở **Tra cứu nhanh** dạng Modal trượt từ dưới, cao 85%, nền kem, góc trên bo 32, overlay nhẹ. Có nút đóng, hỗ trợ Back Android và tránh bàn phím/safe area. Cửa sổ dùng cùng tìm kiếm từ/video và phát âm đã có; đóng trả về nguyên trạng bài học, không tải lại bài. Không thêm tiến độ hoặc luyện tập giả.
- Mục Bài học mặc định chọn N2, có N5–N1 và mở trực tiếp danh sách bài của trình độ đang chọn; không có ô tra cứu, bước chọn giáo trình/Unit hoặc tên giáo trình/nguồn trên giao diện. Hiện N2 có 89 bài thật; trình độ khác hiển thị trạng thái chưa có dữ liệu và nút khám phá N2.
- Grid bài học dùng **3 cột** khi màn hình từ 360 px và font scale tối đa 1.15; màn hình 320–359 px hoặc chữ lớn hơn dùng 2 cột, dưới 320 px hoặc font scale trên 1.5 dùng 1 cột. Khoảng cách ngang/dọc 12 px. Thẻ gọn: padding 12, gap 8, bo `radius.small` 16, cao tối thiểu 104 và tự tăng khi chữ xuống dòng. Hàng đầu là **Bài 1** (`typography.button` 14/20, không lặp badge số bài) và mũi tên 14 px; nhóm từ dùng `caption`, cuối thẻ là badge đào ghi số từ thật. Nền trắng, bóng ấm theo token chung; toàn bộ thẻ có thể nhấn để học. Thẻ ở hàng cuối giữ cùng chiều rộng với các thẻ khác. Bài học đánh số liên tục trong từng trình độ, không lặp lại số theo Unit của dữ liệu nguồn.
- Dùng nền AppBackground chung với hai vùng SVG radial gradient hồng/đào, thanh BrandLogo, tiêu đề `title` 18/24, mô tả `body` 12/16. Nội dung rộng tối đa 480, lề 20. Thẻ từ và tra cứu trắng bo `radius.card` 32, padding 20, gap 16, khoảng cách thẻ 20 và bóng `shadowMd`; thẻ bài học dùng kích thước gọn riêng của grid ở trên.
- Bộ chọn trình độ chỉ xuất hiện trong danh sách bài, dùng nút viên thuốc, chọn dùng cam `primary` và chữ trắng, pressed `primaryPressed`, có nhãn và trạng thái radio. Link/nút text màu `primaryText`, `typography.link` 12/16, vùng chạm tối thiểu 48. Ô tìm kiếm ở mục Tra cứu bo 18, cao tối thiểu 56; focus dùng viền `focus`.
- Bài mở danh sách từ với kana, nghĩa, Hán Việt và phần mở rộng ví dụ/từ liên quan. Có icon mắt ngang tiêu đề bài để ẩn nghĩa tự ôn và hiện nghĩa riêng từng từ. Chế độ ẩn nghĩa chỉ áp dụng cho bài học. Loading, lỗi và empty là trạng thái thật.
- Danh sách bài và từ được virtualize, có safe area và xử lý bàn phím. Quay lại từ bài về danh sách bài; từ kết quả tra cứu về ô tra cứu, không chuyển sang bài học. Android Back tại gốc mỗi mục về Trang chủ. Không hiện tiến độ hoặc số từ đã thuộc khi chưa có dữ liệu.
- Mục Tra cứu dùng bố cục từ điển theo mục **Từ điển từ vựng và Hán tự** bên dưới,
  mặc định Từ vựng khi tìm từ Trang chủ. Không hiện bài học, bộ chọn JLPT hoặc nút
  ẩn nghĩa. Video tìm nguyên văn trong phụ đề, câu có từ tìm được tô nền đào, tên
  video, kênh, mốc thời gian và hành động **Xem đoạn này**.
- Tìm kiếm Video hiện ngay đoạn đầu tiên trong một player YouTube trên màn hình kết quả, phía dưới ô tìm kiếm. Rút gọn header kết quả để ưu tiên video; không mở modal. Card player trắng theo token chung có câu phụ đề, vị trí đoạn trên trang, nghe lại, ví dụ trước/tiếp và mở trên YouTube. Các kết quả nằm dưới player; thẻ đang chọn có nhãn **Đang chọn** và viền cam. Chọn thẻ đổi đoạn tại chỗ và cuộn về player; chỉ có một player hoạt động. Player có vùng hiển thị tối thiểu 200×200, giữ điều khiển YouTube; không đặt loading/error che player. Quay lại/chuyển tab/chuyển loại tìm kiếm hoặc gửi tìm kiếm mới giải phóng player. Lỗi mạng/video bị chặn nhúng có thông báo và cách thử lại; kết quả rỗng mô tả đúng giới hạn kho dữ liệu.

## Nói theo tình huống

- Màn vào Nói hiển thị lịch sử thật của tài khoản. Nút “Cuộc trò chuyện mới” mở popup chọn ngữ cảnh ngay tại chỗ; các chủ đề, trình độ, tìm kiếm và chi tiết nằm trong cùng popup. Nền kem, thẻ trắng bo 32 px, chip và CTA màu cam theo token chung.
- Chọn ngữ cảnh/vai rồi bắt đầu phiên. Giao diện buổi luyện dùng Aoi 3D từ demo, giữ tương tác kéo để xoay và pinch để zoom; bỏ chủ đề mẫu, bộ chọn chế độ và panel demo cũ.
- Header đặt dưới safe area camera; có quay lại lịch sử và nút “Hội thoại” xem transcript. Không đặt nút “Cuộc trò chuyện mới” trong phiên.
- Nhiệm vụ, bối cảnh và vai AI chỉ mở khi bấm icon bóng đèn nét tròn màu xám `muted`, opacity 0.6, nằm ở góc trên bên phải của vùng nội dung, ngay dưới thanh tiêu đề hội thoại. Thanh tiêu đề cộng safe area để tránh status bar/camera; hàng icon không cộng safe area lần nữa. Icon 24 px, vùng chạm 48 px, không dùng viền/nền cam. Avatar cố định trong nửa trên vùng nội dung; danh sách tin nhắn phía dưới tự cuộn đến lời mới nhất, không cuộn cả nhân vật.
- Mặc định ở chế độ Nói: mic tròn 80 px căn giữa, trượt lên khi đến lượt người dùng và giữ hiện lúc đang thu; trượt xuống và ẩn hoàn toàn khi AI nói, xử lý hoặc chờ kết nối. Vùng micro thu chiều cao từ 104 px về 0 để dành chỗ cho tin nhắn, ẩn cả hướng dẫn giữ để nói khi chưa đến lượt. Hiệu ứng trượt/thu chiều cao trong 280 ms; reduced motion đổi ngay. Giữ để thu/thả để gửi. Khung Aoi chỉ có một nền trắng `surface` và bo góc ngoài; canvas 3D phủ kín, không có thẻ bên trong hay thu nhỏ canvas khi đổi lượt, không phủ lớp xám khi đến lượt người dùng; chiếm 55% chiều cao vùng nội dung để dành thêm diện tích cho tin nhắn, với hàng điều khiển đặt đè lên phía trên nền Aoi, không chiếm một hàng riêng. Bộ chọn Nói/Nhắn tin đặt ở phía trên bên trái trong khung Aoi, cùng hàng với bóng đèn phía bên phải, không thêm một hàng trong composer; dạng segmented control rộng 88 px chỉ có icon micro/bàn phím 16 px, không hiện chữ. Khung viền trung tính, nền `track`, vùng chọn trắng với viền 1.5 px và icon `primaryText`, nút cao 36 px với hitSlop dọc 6 px, giữ nhãn accessibility cho từng chế độ; chỉ thay giao diện nhập; textbox và nút gửi chỉ hiện trong Nhắn tin. Giữ draft khi chuyển chế độ, không tạo phiên hay kết nối mới.
- Vùng avatar bo 32 px và có bóng ấm `shadowMd`; giữ glow khi AI đang nói. “Hội thoại”, “Chọn kỹ năng khác” dùng `AuthButton` variant `text` theo quy chuẩn chung: chữ `primaryText`, `typography.link` 12/16 Medium, không nền/viền, vùng chạm tối thiểu 48 px; không ghi đè màu hoặc font riêng.
- Chat dùng bong bóng thông thường: AI bên trái nền trắng `surface`, bạn bên phải nền đào `badgeBg`, bo `radius.input` 18, nội dung `typography.input`; không dùng khung viền xanh/nâu hoặc hiệu ứng tô sáng từng chữ. Màn chat dùng lề 20 và rộng tối đa 480 theo token chung.
- Mic/CTA dùng cam `primary`, pressed dùng `primaryPressed`, disabled theo token chung. Khi giữ nói, RMS từ PCM điều khiển vòng sóng và rung/xoay/phóng nhẹ; im lặng hoặc thả tay dừng hiệu ứng. Reduce Motion chỉ fade, không rung/scale.
- Gemini Live trả âm thanh và transcript theo đúng snapshot của phiên. Aoi hoạt ảnh miệng trong lúc phát audio. Thể hiện rõ trạng thái kết nối, thu âm, phản hồi, lưu và lỗi. Lượt chưa lưu có nút “Thử lưu lại”, khóa lượt mới/quay lại trong khi xử lý.
- Android Back và nút quay lại đi từ phiên → lịch sử; popup đóng tại chỗ. Phiên đã kết thúc chỉ xem lại. Chuyển nền dừng thu/phát và kết nối Live.
- Kế hoạch học tập là màn chi tiết mở từ Tiếp tục học/Khám phá lộ trình trên Home, có nút Về trang chủ, không chiếm thêm tab. Chỉnh sửa/hủy thiết lập giữ ngữ cảnh kế hoạch.

## Nhận xét sau hội thoại

- Trong phiên có nút `text` **Kết thúc & xem nhận xét**; khóa khi đang thu/phát/xử lý, có lượt chưa lưu hoặc đang kết thúc. Quay lại lịch sử không tự kết thúc phiên.
- Phiên đã kết thúc bỏ composer và hiện nút `outline` **Xem điểm & nhận xét**. Transcript và nghe lại vẫn sử dụng được.
- Màn nhận xét toàn màn hình có safe area, nền kem và nội dung cuộn rộng tối đa 480, lề 20. Tiêu đề, card trắng bo 16, bóng `shadowSm`, khoảng cách 16–20. Điểm tổng 44/56; ba tiêu chí ngữ pháp/từ vựng/độ tự nhiên có điểm chữ và thanh cam. Chưa đánh giá phát âm.
- Các card câu sửa có nhãn **Cần sửa** hoặc **Cách diễn đạt khác**, câu gốc, câu tốt hơn nền xanh nhạt và giải thích. Không phân biệt chỉ bằng màu. Có điểm mạnh và tối đa ba gợi ý luyện tiếp.
- Loading/lỗi/thiếu dữ liệu là trạng thái thật; thiếu dữ liệu không hiển thị số 0. Có **Thử phân tích lại**, **Xem hội thoại**, **Về luyện nói** theo `AuthButton`. Xem kết quả cũ không gọi AI lại.

## Trang chủ học tập

### Nghe và shadowing

- Mục Nghe mở màn shadowing: form link YouTube ở trên trong khung tint, nhãn YouTube
  và phần nhập nền trắng; bên dưới là “Video của bạn”. Không thêm filter chủ đề, upload,
  danh mục hoặc dữ liệu chưa có. Có hai tab “Tất cả video” và “Video của tôi”: video
  ready dùng chung, trạng thái xử lý/lỗi chỉ hiện cho người đã thêm. Nền kem, card
  trắng bo 16, gap 16–20, token chung.
- Danh sách video dùng FlatList. Mỗi thẻ có thumbnail YouTube 16:9 phủ ngang phía trên,
  tên 14/20 tối đa hai dòng, trạng thái thật và CTA luyện ở phần dưới. Thumbnail sẵn sàng
  có thể nhấn để mở bài; lỗi ảnh có placeholder, vẫn giữ nút luyện/thử lại.
- Hiển thị trạng thái chờ/lấy dữ liệu/tạo phụ đề/chuẩn bị đoạn/ready/lỗi thật. Lỗi
  không biến thành danh sách trống; có làm mới và thử lại khi failed.
- Bài luyện theo bố cục video → câu đang phát căn giữa → thanh công cụ → bảng phụ đề.
  Video bo 16 không có lớp card bao ngoài; quay lại nằm trên hàng riêng phía trên
  video. Không đặt nút replay nổi lên video.
  Cụm icon nhỏ trước/replay/tiếp nằm trên thanh công cụ, replay ở giữa; tuỳ chọn
  không lặp lại các nút này. Lỗi video vẫn có nút thử phát lại.
  Câu hiện tại có gạch chân, hiển thị nguyên câu luyện với timestamp nguồn theo yêu cầu cập nhật; không chia thành các cue ngắn. Cỡ chữ tự
  điều chỉnh từ 22 xuống tối thiểu 16 theo độ dài/bề rộng, giữ font scale hệ thống.
  Khung tối đa hai dòng có thể cuộn nếu nguồn thiếu mốc chia; không cắt bằng ellipsis.
  Các câu luyện đầy đủ trong bảng chữ 14/22, nét thường, icon phát 18 bên trái.
  Nút công cụ 32–36 px có hitSlop, nhãn 12 px; ẩn “Chọn kỹ năng khác” ở shadowing.
  Một thanh công cụ duy nhất có icon Phụ đề bật/tắt danh sách, Bản dịch, theo dõi,
  trước/replay/tiếp và `•••`. Bỏ header Phụ đề và nút đóng lặp lại của bảng.
  Ẩn/hiện chữ dùng icon mắt 18 px ở góc trên phải của khung phụ đề lớn, vùng 32 px + hitSlop; chừa khoảng bên phải để không che chữ. Bản dịch dùng icon Translate 18 px, không có nhãn chữ trên thanh; thanh cuộn ngang khi màn hình hẹp hoặc chữ lớn. Bản dịch tạo theo yêu cầu, hiển thị trạng thái xử lý và dùng lại dữ liệu đã lưu.
  Tốc độ/chế độ nghe/lặp câu nằm trong bảng tuỳ chọn mở bằng `•••`.
- Bài luyện giữ player YouTube phía trên, danh sách phụ đề FlatList cuộn phía dưới.
  Mặc định nghe liên tục: phụ đề bám theo thời gian video, tô sáng câu hiện tại và
  tự cuộn; khoảng không có phụ đề không tô sáng câu cũ. Tua/đổi tốc độ vẫn đồng bộ.
- Cuộn tay tạm ngừng tự cuộn, nút “Về câu hiện tại” bật theo dõi lại. Bấm một câu
  để phát từ câu đó; chuyển câu/đổi tốc độ không tải lại video. Nút trước/replay/tiếp
  dùng icon 48 px, replay phát câu hiện tại. Có mắt ẩn/hiện phụ đề và tốc độ
  1× → 0.75× → 0.5×. Chế độ từng đoạn dừng cuối câu, “Lặp đoạn” lặp câu đã chọn.
  Không hiển thị nút mở ngoài YouTube.
- Phụ đề tự động được ghi rõ; không có điểm phát âm hoặc tiến độ giả.
- Chỉ bấm từ trong phụ đề hiện tại dưới video để mở popup tra từ; danh sách transcript bên phải không tra từng từ; bấm vào cả hàng phụ đề (kể cả icon play) để phát câu tương ứng. Khi chép chính tả, ô nhập giữ thao tác nhập riêng và icon play dùng để phát câu. Icon **dấu cộng khoanh tròn** lưu vào flashcard và icon **ngôi sao** yêu thích nằm ngang hàng ở góc phải, ngay dưới nút đóng X. Chọn bộ tự tạo hiện có ngay trong popup; có tải thêm, thử lại và phản hồi lưu thành công/đã có. Thêm một thẻ giữ nguyên thẻ cũ và phiên học đang mở; không tạo bản trùng khi lưu lại cùng từ. Danh sách bộ thẻ chỉ tải khi người học bấm lưu, không gọi AI.
- Câu hỏi nghe có dropdown N5–N1 nằm ngay trong header thẻ câu hỏi, nền surface, viền border, focus dùng focus, bo input 18 theo token; không có dấu tick hoặc phụ đề cho bộ chọn. Mỗi video lưu riêng 5 câu hỏi cho mỗi trình độ, dùng lại bộ đã có; chỉ tạo khi người học yêu cầu trình độ chưa có. Timeline nằm ngoài popup và chỉ hiển thị bộ đang chọn; đáp án trong lượt học giữ riêng từng trình độ.

Home ưu tiên thao tác theo thứ tự: tra từ → mục tiêu hôm nay → ôn tập hôm nay và thử thách → thẻ Từ vựng của bạn → lưới Luyện kỹ năng → panel giới thiệu NihonGO. Không hiển thị tiến độ, chuỗi ngày hoặc số từ giả khi backend chưa cung cấp dữ liệu.

- Ô tra cứu đặt đầu nội dung, chấp nhận tiếng Nhật, kana, romaji hoặc nghĩa có
  trong từ điển, gồm nghĩa Việt từ Wiktionary và nghĩa Anh dự phòng từ JMdict. Cao 56 px, nền trắng, viền 1 px,
  bo 18 px; nút gửi tròn 48 px chỉ hoạt động khi nội dung sau khi trim không rỗng.
- Thay thẻ **Tiếp tục học** bằng **Ôn tập hôm nay**: ưu tiên phiên flashcard đang dở (số thẻ còn lại và tên bộ), sau đó tối đa 50 từ ở mức Chưa nhớ/Mơ hồ, cuối cùng là Chọn bộ thẻ. CTA cam **Tiếp tục flashcard / Ôn ngay / Chọn bộ thẻ** mở đúng dữ liệu; Momo đọc sách 80 px là trang trí. Không dùng tỷ lệ tự suy diễn hay số thẻ giả.
- **Thử thách hôm nay** đặt cạnh thẻ ôn tập trên desktop, dưới thẻ trên mobile. Thẻ trắng bo 32 continuous, padding 20, gap 16, `shadowMd`; tiêu đề nhóm `heading` 16/20, thông điệp `title` 18/24, nội dung `body` 12/16. Badge đào ghi số câu thật (tối đa 5); hoàn thành dùng `successBg`/`success`, ghi số câu đúng. Một CTA phụ outline **Bắt đầu / Tiếp tục / Xem kết quả thử thách**. Thiếu dữ liệu hướng dẫn học flashcard và khoá bắt đầu; lỗi có tải lại, không hiện số giả.
- Thử thách dùng từ đã đánh giá trong các phiên gần đây, ưu tiên Chưa nhớ/Mơ hồ; mỗi câu có bốn nghĩa khác nhau, tránh đáp án trùng cụm nghĩa. Không tạo câu nếu thiếu đáp án phù hợp. Một lượt/ngày theo Asia/Ho_Chi_Minh, lưu/tiếp tục trên server; Home làm mới khi trở lại/foreground hoặc sang ngày mới.
- Màn trắc nghiệm dùng gradient chung và `ScreenBackHeader` trong thanh trong suốt trên desktop. Nội dung tối đa 760, lề 20, thẻ trắng bo 32; từ `title` 18/24, câu trả lời `label` 14/20. Đáp án có A–D, bo 18, cao tối thiểu 52, viền 1 và focus bàn phím rõ. Sau khi server lưu mới hiện đúng/sai bằng cả màu lẫn chữ; cách đọc/nghĩa hiện dưới đáp án. Người dùng bấm **Câu tiếp theo**, không tự chuyển. Lỗi giữ câu và có tải lại. Tổng kết ghi số câu đúng và nút **Ôn câu sai bằng flashcard** nếu có. Điểm trắc nghiệm lưu riêng, không tự đổi mức nhớ đã chọn trong flashcard; chỉ thời gian ở màn luyện được tính vào mục tiêu hằng ngày.
- Bốn kỹ năng xếp lưới 2×2: Nghe, Nói, Đọc, Viết. Mỗi thẻ dùng Momo tối đa 96 px, tự co theo chiều rộng nội dung trong hành động tương ứng (tai nghe, micro, đọc sách, tập viết), nền trắng `surface`, bo `radius.card` 32, padding 16, gap 12 và bóng `shadowMd`; khoảng cách giữa thẻ 16, cao tối thiểu desktop 144/mobile 216; tiêu đề 18/24, mô tả 12/16 và hành động 14/20. Hai thẻ trong hàng dùng `flex: 1`; bỏ các họa tiết SVG trừu tượng và nền nhiều màu.
- Tư thế Momo hỗ trợ nhận diện kỹ năng; tên, mô tả và accessibility label luôn mang đủ ý nghĩa. Ảnh bên trong nút là trang trí, không đọc lặp lại.
- Thẻ **Từ vựng của bạn** nằm ngang toàn chiều rộng ngay sau cụm ôn tập/thử thách,
  tiếp theo là tiêu đề **Luyện kỹ năng** và lưới 2×2. Không chia hai section từ vựng/kỹ năng
  thành cột lệch chiều cao; không có tiêu đề Khám phá từ vựng hoặc divider kéo dài.
  Thẻ tách khỏi ô tra cứu: ô phía trên phục vụ tra nhanh, thẻ này mở khu vực bài học từ vựng.
- Phần chào Home và Momo 104 px cùng hàng, cao tối thiểu 104 px, tự giãn khi tên dài
  hoặc cỡ chữ lớn. Khoảng cách đến section tra từ 24 px; top bar gom trình độ và mục tiêu
  phút/ngày bên phải. Desktop giữ sidebar 240 px từ 1100 px; nội dung và top bar
  tối đa 1160 px, căn giữa với lề ít nhất 20 px.
- Thẻ kỹ năng giữ tên Việt 18/24, mô tả 12/16, CTA 14/20 cam; bỏ nhãn Nhật 聞く / 話す / 読む / 書く trên thẻ kỹ năng.
  Desktop bố trí Momo và chữ ngang trong từng thẻ, mobile dọc; hai thẻ trong hàng cao bằng nhau.
- Badge thử thách đang làm hiện answered/total thật từ server (ví dụ 3/5 câu);
  chưa bắt đầu hiện số câu khả dụng. Hoàn thành có tick xanh và **Đã hoàn thành**;
  vẫn mở được kết quả khi bộ từ hiện tại không còn đủ để tạo câu mới.
- Panel giới thiệu đặt cuối nội dung, sau khi người dùng đã thấy giá trị học tập. Panel dùng nền `surfaceTint`, viền đào, bóng ấm nhẹ `shadowSm`, Momo 76 px và một CTA
  **Khám phá lộ trình** mở màn kế hoạch. Nhãn **HỌC CÙNG MOMO**, tiêu đề **Một lộ trình vừa sức
  dành cho bạn**, mô tả **Khám phá kế hoạch học dựa trên trình độ, mục tiêu và thời gian mỗi ngày.**
  Không hiện xxx, không ghi MOMO dưới ảnh và không dùng popup khi mở Home.
- Các điểm điều hướng frontend dùng callback riêng (`onOpenSkill`, `onSearchVocabulary`, `onOpenVocabulary`...) để có thể nối màn hình hoặc API sau mà không sửa component trình bày.

### Mascot Momo

Momo là tanuki chibi nguyên bản của NihonGO, dùng cam đào, kem và nâu than theo bảng màu sản phẩm. Momo tạo cảm giác đồng hành nhưng không thay thế nội dung hoặc CTA.

- Asset chính: `frontend/src/assets/mascot/momo-wave.png`, PNG RGBA 768×768 nền trong suốt.
- Home đặt Momo 104 px bên phải lời chào; trên màn hình hẹp phần chữ được co trước, ảnh giữ đúng tỉ lệ với `contain`. Thẻ tiếp tục học dùng Momo đọc sách thay trang trí gáy sổ.
- Panel giới thiệu dùng lại Momo ở 76 px như yếu tố trang trí; screen reader chỉ đọc nội dung panel một lần, không đọc lại ảnh.
- Theo yêu cầu cập nhật của người dùng, các minh họa homepage dùng hành động của mascot, bao gồm cả bốn thẻ kỹ năng. Thay minh họa không thay đổi quy chuẩn màu, font, bo góc, khoảng cách, bóng và CTA đã nêu ở trên. Chỉ ảnh chào ở header được screen reader mô tả; các ảnh nằm trong nút là trang trí.
- Không đổi màu Momo bằng tint, không thêm nền vuông, không crop tai/đuôi/chân và không dùng asset ở kích thước dưới 64 px.

Đăng ký luôn gửi OTP qua email; không khôi phục bộ chọn email/SMS. Nhà cung cấp mạng xã hội chỉ xuất hiện khi backend đã cấu hình. Không thêm nút chức năng chưa tồn tại để lấp bố cục.

## Quy tắc mở rộng và kiểm tra

### Theo dõi mục tiêu hằng ngày

- Trang chủ có thẻ **Mục tiêu hôm nay**, hiển thị thời gian thật `07:32 / 15 phút`
  và thanh tiến độ. Đủ mục tiêu chuyển sang xanh và nhãn **Đã hoàn thành**;
  vẫn ghi nhận thời gian học tiếp theo, thanh giới hạn 100%.
  Thẻ dùng nền `surface`, bo 32 continuous, padding 20, gap 16 và `shadowMd` như các thẻ Home.
  Tiêu đề dùng `heading` 16/20, đồng hồ `title` 18/24 màu `dark`, mục tiêu `label` 14/20
  màu `muted`; không đặt cỡ chữ riêng. Phần trăm nằm trong badge đào `badgeBg`/`badgeText`,
  hoàn thành dùng `successBg`/`success` cùng dấu tick. Thanh tiến độ cao 6, nền `track`,
  cam `primary` khi đang học và xanh khi đủ mục tiêu. Nút thử lại dùng `link`/`primaryText`,
  vùng bấm tối thiểu 48; hàng thông tin được xuống dòng khi màn hẹp hoặc chữ lớn.
- Đồng hồ tự chạy ở Bài học, Tra cứu và khu Nghe/Nói/Viết; không đếm Trang chủ,
  Cá nhân, thiết lập, kế hoạch hoặc màn Đọc chưa có bài học. Điện thoại hiện
  badge gọn phía trên navigation nổi khi học; desktop hiện ở vùng thông tin trên.
- Chỉ đếm lúc ứng dụng đang foreground; web phải là tab/cửa sổ được tập trung.
  Mở nền, mất focus, thiết bị ngủ hoặc timer bị trì hoãn không cộng thời gian đó.
- Ngày học đổi lúc 00:00 **Asia/Ho_Chi_Minh**. Tiến độ lưu theo tài khoản qua API,
  gộp các khoảng chồng nhau giữa tab/thiết bị, gửi lại không tính trùng. Đồng bộ
  khoảng 15 giây/lần và khi rời khu học/chạy nền; giữ khoảng chờ trong bộ nhớ đệm
  của tài khoản để thử lại sau mất mạng tạm thời (tối đa 24 giờ).
- Chưa tải được dữ liệu thì hiện `--:--`, không giả số phút. Lỗi đồng bộ có
  **Thử lại**; đổi mục tiêu không xóa thời gian đã học. Đây là thời gian ở khu học,
  không suy diễn số từ đã thuộc hoặc chất lượng học.

### Thiết lập học tập

- Sau khi xác thực phiên đăng nhập, tải hồ sơ học tập. Chỉ mở thiết lập lần đầu khi API trả `profile: null`; lỗi mạng hiển thị thử lại, không tự coi là người dùng mới.
- Ba bước dùng thanh tiến trình mảnh 4 px, cam cho bước đã đến và `track` cho bước còn lại. Nhãn bước dùng `caption`; tiêu đề dùng `title` 18/24, mô tả dùng `body` 12/16.
- `LearningChoice`: thẻ chọn radio, viền 1 px, bo 18 px, padding 16 px, vùng chạm tối thiểu 48 px. Nhãn dùng `label` 14/20, mô tả 12/16. Khi chọn, dùng nền `surfaceTint`, viền cam và dấu tick để không chỉ phân biệt bằng màu.
- Trình độ gồm Mới bắt đầu, N5, N4, N3, N2, N1, kèm mô tả tự đánh giá. Mục tiêu chính gồm giao tiếp, JLPT, du lịch, công việc, văn hóa/sở thích. Không chọn sẵn cho người dùng mới.
- Thời lượng 5, 10, 15, 30, 60 phút/ngày; thẻ xếp hàng và xuống dòng, không cắt chữ khi tăng cỡ chữ. Danh sách lựa chọn lấy từ API.
- Bước cuối dùng `LearningSummary`, hiển thị đủ ba lựa chọn và nút xác nhận. Quay lại giữ lựa chọn; không lưu cho đến khi xác nhận. Không trình bày trình độ tự chọn như chứng chỉ JLPT.
- Chỉnh sửa dùng cùng màn hình với dữ liệu hiện tại điền sẵn. Hủy giữ dữ liệu cũ. Lỗi lưu giữ bản nháp để thử lại; xung đột phiên bản yêu cầu tải lại thiết lập mới nhất.
- Radio có `accessibilityRole`, trạng thái checked/disabled và mô tả. Khóa thao tác khi đang lưu; nút Back Android quay lại bước trước.

### Checklist chung

1. Dùng token và component dùng chung trước khi thêm màu, radius hoặc spacing mới.
2. Kiểm tra chiều rộng 320–430 và màn hình lớn; email dài, tên dài và cỡ chữ tăng phải xuống dòng tự nhiên.
3. Kiểm tra bàn phím, cuộn đến CTA, OTP autofill, mật khẩu hiện/ẩn, loading và lỗi mạng.
4. Mỗi màn hình có một hành động chính nổi bật; hành động phụ dùng outline hoặc text.
5. Thay đổi giao diện không được sửa API, điều kiện xác thực hoặc cách lưu phiên.
6. Không dựng status bar, giờ, pin hoặc home indicator giả từ hình mẫu; dùng giao diện hệ điều hành.

Các export màu cũ được giữ tương thích cho phần còn lại của ứng dụng. `serifFont` và `gradientPrimary` vẫn tồn tại cho các màn hình cũ; bộ màn hình tài khoản dùng `typography` Readex Pro và CTA màu phẳng theo đặc tả này.

## Cập nhật font native

Sau khi thay đổi TTF hoặc cấu hình nhúng font, cần build lại (`npm run ios` / `npm run android`); Fast Refresh chỉ cập nhật JavaScript, không thêm font vào binary đang cài. Ba file Android là bản sao nguyên vẹn của nguồn tại `src/assets/fonts`; khi cập nhật phải đồng bộ cả hai vị trí.

## Logo và khởi động app

Logo và icon launcher dùng đầu Momo cùng chữ NihonGO đen–cam theo mẫu người dùng. Native launch iOS/Android có nền kem và logo, không còn chữ frontend/React Native. Sau khi JavaScript sẵn sàng, `StartupSplash` cho Momo nhún và nghiêng chào trong khoảng 1,3 giây, rồi fade khi quá trình khôi phục phiên hoàn tất. Reduce Motion bỏ qua hoạt ảnh. Lỗi khôi phục vẫn dẫn đến giao diện thử lại hiện có. Asset và prompt nằm trong `frontend/src/assets/mascot/README.md` và `GENERATION.md`.


### Tra từ trong phụ đề shadowing

- Chỉ phụ đề lớn của câu hiện tại có thể nhấn để tra từ. Mỗi từ là một cụm riêng
  gồm chữ và furigana, có gạch chân nhẹ theo màu primary. Furigana căn theo cụm
  kanji, không phủ lên phần kana; giữ nguyên chữ và khoảng trắng của phụ đề.
- Bấm từ tạm dừng video, không tua hoặc tải lại player; mở popup nhỏ gần từ vừa bấm.
  Hiện chữ, cách đọc, dạng gốc nếu khác, âm Hán Việt viết hoa và các nhóm nghĩa
  từ từ điển chung. Ưu tiên nghĩa Việt; nghĩa Anh còn lại có nhãn. Từ loại dịch sang tiếng Việt.
  Chữ từ dùng `title` 18/24; cách đọc, dạng gốc và nghĩa dùng `body` 12/16;
  nhãn và từ loại dùng `caption` 12/16. Giữ font scale hệ thống và xuống dòng tự nhiên.
- Tự tra dạng gốc (lemma), thiếu thì dùng chữ đã bấm. Chỉ nhận mục khớp chính xác,
  không dùng kết quả gần giống thay cho từ không có. Có trạng thái tải, lỗi/thử lại và rỗng.
  Chỉ gọi API từ điển nội bộ khi nhấn từ, không gọi AI/API ngoài.
- Đóng bằng dấu X, bấm ngoài hoặc Back Android; video giữ nguyên vị trí và vẫn dừng,
  người dùng chủ động bấm phát để tiếp tục. Bảng phụ đề bên dưới chỉ đọc.
  Backend chỉ trả metadata token và cách đọc, không trộn nghĩa giáo trình vào payload.
  Từ đã mở trong popup được ghi vào lịch sử tra cứu chung.
  Không thêm romaji/lưu từ hay màn từ điển đầy đủ trong popup.

### Từ điển từ vựng và Hán tự

- Màn Tra cứu có ba tab **Từ vựng / Hán tự / Video**, mặc định Từ vựng; ô tra ở
  Home mở tìm từ trong từ điển, không giới hạn trình độ giáo trình.
- Ô tìm cao tối thiểu 56, nền trắng, bo 18, viền 1; focus đổi viền ngoài sang
  `focus`, giữ độ dày, không có outline vuông bên trong input web. Nút gửi tròn 48,
  chỉ hoạt động khi nội dung sau trim không rỗng. Nút/tab vẫn có focus bàn phím.
- Sau khi tìm từ, tự mở chi tiết từ phù hợp nhất; ưu tiên khớp chính xác
  theo thứ tự tìm kiếm của backend. Không trải các kết quả thành danh sách thẻ
  từ lớn ở vùng chính. Nội dung chính là một thẻ trắng bo 32 chứa từ, cách đọc,
  Hán Việt, các nghĩa và ví dụ có sẵn, phân chia bằng đường viền nhẹ.
- Web đủ rộng chia hai cột: nội dung chính co giãn, cột phụ 300 px với các khối
  **Kết quả tra cứu / Hán tự trong từ / Từ vựng liên quan**. Kết quả khớp gần và các
  mục JMdict liên quan hiển thị dạng dòng gọn trong khối từ liên quan, ban đầu tối
  đa 6 dòng và có Xem thêm. Nhấn dòng đổi từ chính, giữ ngữ cảnh truy vấn và có
  Quay lại. Trên điện thoại/tra nhanh, các khối phụ xếp dưới chi tiết từ.
- Card dùng padding 20, gap 12–16 và bóng ấm `shadowSm`; font, màu và lề theo token
  chung. Có phân trang, loading, lỗi/thử lại và không có kết quả thật. Web tối đa
  1160, mobile không tràn ngang.
- Từ vựng hiển thị cách viết/đọc, từng nhóm nghĩa, từ loại và giới hạn áp dụng từ
  nguồn. Ưu tiên định nghĩa Việt của Wiktionary khi có; mục chưa có nghĩa Việt dùng
  bản dịch máy OPUS-MT đã lưu nếu có, sau đó JMdict nghĩa Anh có nhãn. Không có nút
  xem nghĩa Anh gốc. Nhãn từ loại hiển thị bằng tiếng Việt, ví dụ **Danh từ ·
  Động từ với する · Ngoại động từ**; nhóm động từ, tính từ và các ngoại lệ cũng
  dùng thuật ngữ Việt, không hiện mô tả kỹ thuật tiếng Anh của JMdict.
  Không lấy nghĩa/ví dụ giáo trình hoặc tự tạo ví dụ; không dịch lúc người dùng tra.
- Loại tra cứu dùng thanh tab gọn theo độ dài nhãn, gạch chân màu focus cho
  tab được chọn. Không kéo mỗi tab thành nút rộng bằng một phần màn hình.
  Tra cứu luôn tự nhận diện Nhật/kana/romaji/Việt, nhận tiếng Việt có dấu hoặc
  không dấu; không có bộ chọn ngôn ngữ trên giao diện.
- Trong khối **Hán tự trong từ**, từng chữ mở rộng/thu gọn độc lập bằng nút có
  mũi tên và trạng thái expanded. Mặc định thu gọn, hiện chữ, On và âm Hán Việt
  in hoa. Khi mở hiện Kunyomi và sơ đồ thứ tự nét ngay trong thẻ; tải lần đầu khi mở,
  giữ kết quả khi đóng/mở lại cùng mục từ. Có loading, thử lại khi lỗi và thông
  báo thật nếu thiếu sơ đồ. Nút **Xem chi tiết Hán tự** mở trang đầy đủ.
- Tab **Hán tự** tự mở chi tiết kết quả đầu tiên sau tìm kiếm. Khi tra một từ có
  nhiều chữ Hán, ưu tiên các chữ theo thứ tự trong từ, không lặp chữ. Cột phụ
  **Kết quả tra cứu kanji** dùng dòng gọn để chuyển chữ và phân trang; mobile
  xếp cột này dưới chi tiết. Chọn chữ giữ ngữ cảnh để Quay lại.
- Chi tiết chữ có chữ lớn và âm Hán Việt in hoa ở bên trái, phần **Phát âm**
  gồm **Kunyomi / Onyomi** đặt ngang hàng bên cạnh. Sơ đồ nét viết nằm bên phải
  và căn giữa theo chiều dọc của khối thông tin; màn hẹp đưa sơ đồ xuống dưới. Hiện số nét, bộ thủ
  và tần suất nếu nguồn có. Không hiện nghĩa tiếng Anh, cách đọc theo tên hay
  mô tả giải thích số thứ tự nét. Sơ đồ vẫn đánh số từng nét, tự viết một lần
  khi mở chữ và chỉ có nút
  **Phát lại** nhỏ ở góc sơ đồ; không có hàng điều khiển hoặc chọn tốc độ.
  Thu gọn/đổi chữ/rời màn dừng animation; ứng dụng xuống nền thì dừng.
  Chưa có sơ đồ thì thông báo thật. Nghĩa và từ ghép chỉ hiện phần nghĩa Việt có sẵn. Nhấn từ ghép mở
  lại chi tiết từ; Quay lại khôi phục ngữ cảnh trước.
- Từ điển dùng JMdict và Wiktionary tiếng Việt; dữ liệu giáo trình chỉ phục vụ Bài học, không trộn vào từ
  chính, từ liên quan hoặc từ ghép Hán tự. Không hiện khối nguồn, tên giáo trình,
  ghi chú hiệu đính hay giấy phép trong các thẻ tra cứu; bỏ mục **Nguồn dữ liệu** khỏi giao diện.
  Metadata nguồn và giấy phép vẫn giữ trong DB và tài liệu dự án. Không dùng nhãn JLPT giáo trình để phân loại mục từ điển.
- Tra nhanh trong bài học dùng cùng module; popup shadowing lấy nghĩa từ cùng API từ điển. Lưu từ yêu thích bằng ngôi sao ở chi tiết từ và thẻ từ trong bài học; hỗ trợ nhận dạng viết tay một ký tự qua nút **Viết tay** trong Tra cứu.


- Sau khi gửi tìm kiếm luôn có nút **Quay lại**: trở về truy vấn trước và khôi phục chữ trong input; lần tìm đầu quay về ô trống. Áp dụng cả truy vấn mở từ Home và kết quả rỗng. Phân trang giữ đường quay lại; Back Android dùng cùng luồng.

### Lịch sử tra cứu

- Ô tìm kiếm Trang chủ và Tra cứu dùng chung lịch sử. Chọn từ/Hán tự từ Trang chủ mở đúng mục đã xem trong Tra cứu.
- Khi chưa tra cứu (truy vấn và ô nhập trống), vùng nội dung dưới tab hiển thị **Lịch sử tra cứu** theo tab, tối đa 6 mục gần nhất, trong một danh sách trắng bo 32 và viền nhẹ: mỗi hàng cao tối thiểu 72, padding 16, gồm từ, cách đọc và nghĩa; có đường phân cách mảnh và mũi tên cam bên phải. Bấm thẻ mở chi tiết. Danh sách nằm trong luồng bố cục, không có icon lịch sử hoặc nút xoá và không dành khoảng trống cho dropdown.
- Gợi ý tìm kiếm dựa trên lịch sử chỉ mở khi nhấp/focus ô tìm (cả Trang chủ và Tra cứu), trong dropdown trắng dưới input, cùng chiều rộng, bo 18 và bóng ấm; phủ lên nội dung, không đẩy bố cục. Danh sách nội dung và dropdown dùng chung một nguồn dữ liệu.
- Danh sách xếp dọc, mỗi dòng có biểu tượng lịch sử, từ và cách đọc/nhãn Hán tự.
  Lọc theo chữ đang nhập (từ, cách đọc hoặc nghĩa); tối đa 30 mục, cuộn trong khung.
- Chọn mục mở chi tiết và đóng dropdown. Gửi truy vấn, Escape, đổi loại tra cứu
  hoặc bấm ra ngoài cũng đóng. Không còn khối Gần đây hay nút xem tất cả riêng.
- Lưu riêng theo tài khoản trong PostgreSQL, dùng chung web/app và popup shadowing.
  Chỉ ghi mục chi tiết đã tải thành công; không lưu từng ký tự, kết quả rỗng hay lỗi.
  Tra lại đưa mục lên đầu, không nhân bản. Đọc dữ liệu từ điển bằng GET không ghi lịch sử.
- **Xoá lịch sử** xoá của tài khoản hiện tại. Có trạng thái rỗng và tải lại khi lỗi.

### Bản dịch phụ đề shadowing

- Nút Bản dịch bật/tắt độc lập với panel Phụ đề, nhỏ và cùng kiểu chip đã có. Khi chưa có dữ liệu, tạo job backend và hiển thị tiến độ thật; có lỗi và Thử lại, video tiếp tục phát.
- Bản Việt dưới câu Nhật trong danh sách dùng body 12/18 màu muted. Bản Việt dưới phụ đề lớn dùng label 14/20, căn giữa, cuộn tối đa 72 px. Bản Việt bám câu luyện, bám nguyên câu Nhật và không tự tạo timestamp.
- Chỉ tải khi bật Bản dịch, dùng cache theo video cho mọi người; tắt ẩn bản Việt và dừng poll. Không remount player khi có bản dịch.

- Nút mắt ẩn toàn bộ vùng phụ đề lớn và bản dịch bên dưới vùng này, không giữ khung hay dòng thông báo thay thế. Danh sách câu vẫn đọc được. Khi ẩn, icon mắt chuyển xuống thanh công cụ để mở lại; khi hiện, icon nằm góc trên phải của khung lớn.

### Flashcard

- Danh mục desktop dùng vùng rộng tối đa 1160 với hai cột: bộ thẻ ở bên trái,
  thống kê và lịch ôn trong sidebar rộng 320 bên phải, khoảng cách 24. Danh sách bộ thẻ
  là grid 2–3 cột theo chiều rộng thực tế, gap 16, thẻ hàng cuối giữ cùng chiều rộng.
  Bộ chọn nguồn/trình độ và phân trang nằm trong cột bộ thẻ. Mobile giữ một cột.
  Sidebar đặt **Đang học** trên **Hôm nay**, có tên bộ, số đã học/tổng, thanh tiến độ
  và nút tiếp tục. Trên desktop, hai khối cùng giữ vị trí khi cuộn danh sách bộ thẻ;
  màn thấp cho phép cuộn bên trong sidebar để vẫn truy cập đủ nội dung.
  Phân trang dùng nút số, trang hiện tại nền cam và mũi tên trước/sau;
  nhiều trang rút gọn bằng dấu ba chấm, mobile chỉ hiện nhóm ba trang lân cận.
  Đổi trang trở về đầu danh sách, đổi nguồn/trình độ trở về trang 1.

- Tổng quan hôm nay dùng thẻ trắng bo 32, padding 20, gap 16, `shadowMd`.
  Hai ô ngang: **Đến hạn** nền kem/chữ focus và **Đã ôn hôm nay** nền successBg/chữ success;
  số lớn Readex Pro SemiBold 32/40. Số đã ôn đếm thẻ duy nhất được tự đánh giá trong ngày Việt Nam,
  không nhân đôi khi ôn cùng thẻ nhiều lần. Không dùng tỷ lệ hoàn thành suy diễn từ hai số này.
  Ô cam ghi **Đến hạn hôm nay**, tính cả thẻ hẹn ôn tiếp vào giờ khác cùng ngày sau khi đã ôn.
  Chỉ mở nút ôn khi đến đúng giờ FSRS; khi đang chờ hiện **Ôn tiếp lúc HH:mm**.
  Tự làm mới khi đến hạn; chỉ loại khỏi số hôm nay khi hạn kế tiếp chuyển sang ngày khác.
  Lịch mặc định chỉ hiện 3 ngày gần nhất, nút **30 ngày** mở toàn bộ lịch.
  Hiện dạng danh sách hai cột **Ngày ôn / Số thẻ**:
  thứ và ngày dd/MM bên trái, số kèm đơn vị “thẻ” bên phải. Mỗi dòng cao tối thiểu 48,
  ngăn bằng divider; hôm nay nền kem/chữ focus, số thẻ đến hạn trong badge đào, số 0 dùng muted.
  Bản 30 ngày cuộn trong khung cao tối đa 240. Bỏ ghi chú giải thích thuật toán,
  thông tin đồng bộ kỹ thuật và khối nhắc điện thoại trên web. Cấu hình nhắc chỉ hiện ở app hỗ trợ.
- Mỗi nút mức nhớ chỉ hiện khoảng cách ôn từ preview FSRS của thẻ hiện tại
  (ví dụ **Chưa nhớ / 1 phút**, **Rất nhớ / 8 ngày**), không hiện ngày cụ thể.
  Giữ bốn nút một hàng,
  hỗ trợ xuống dòng khi chữ lớn và đủ chỗ cho nội dung; không dùng lịch cố định cho mọi thẻ.

- Mở từ nút **Flashcard** trong Bài học, giữ nguyên trang bài học khi quay lại.
  Header dùng `ScreenBackHeader`: ở app hiển thị trong màn, desktop nằm trên thanh trong suốt.
  Chuyển tab ẩn header và không chặn Back của màn khác.
- Thẻ bộ flashcard nền trắng, bo `card` 32, viền `divider`; tên ở trên, hàng dưới có badge nền `surfaceTint` với icon chồng thẻ 15 px màu `primaryText` trước số thẻ và mũi tên tròn bên phải. Bộ trong **Của tôi** không hiện ghi chú “Bộ tự tạo”; sửa bộ bằng icon bút chì 18 px màu `primaryText` ở góc trên phải, vùng bấm tròn 48 px, tooltip “Sửa bộ” trên web, không chồng chữ hoặc kích hoạt học bộ.
- Chọn nguồn bằng tab gọn **Có sẵn / Của tôi / Yêu thích**. Có sẵn có bộ chọn N5–N1,
  danh sách phân trang, đếm thẻ thật. Bộ rỗng không bắt đầu được. Có **Tạo bộ thẻ** và sửa bộ tự tạo.
- Tạo/sửa bộ có hai tab **Từng thẻ / Nhập hàng loạt**, giữ bản nháp khi đổi tab.
  Nhập hàng loạt dùng ô dán cao tối thiểu 200, bo 18, font input, viền focus theo token;
  hai cột radio **Giữa các cột** (Tab, dấu phẩy, ký tự riêng) và **Giữa các thẻ**
  (xuống dòng, chấm phẩy, ký tự riêng). Màn rất hẹp/chữ lớn cho phép xuống hàng.
  Hai trường là từ/nghĩa; ba trường là từ/cách đọc/nghĩa. Có tuỳ chọn bỏ dòng tiêu đề.
  Xem trước đếm thẻ và hiện từ/nghĩa cạnh nhau trong vùng cuộn tối đa 240.
  Chỉ nút **Thêm N thẻ vào bộ** đưa dữ liệu vào bản nháp; không tự lưu. Có lỗi ở bất kỳ dòng nào
  hoặc vượt tổng 100 thẻ thì khoá thêm, không tự bỏ dòng lỗi. Lưu bộ nhắc nhập phần xem trước
  còn chờ. Không có chức năng tải tệp CSV; dữ liệu dán được xử lý ngay trên thiết bị.
- Ngôi sao 20 px, vùng chạm tròn 48 px đặt cạnh từ trong Bài học/Từ điển và popup tra nhanh: nét `primaryText`, chưa lưu để rỗng, đã lưu tô `primary`. Khi nhấn dùng nền `surfaceTint`; đang lưu/vô hiệu hoá giảm opacity 0.5, spinner dùng `primaryText`.
  Khi học flashcard, ngôi sao nằm ở góc trên bên phải của thẻ, dùng được ở cả hai mặt.
  Hỗ trợ bộ có sẵn, bộ tự tạo và các phiên ôn; bấm sao không lật thẻ hoặc tự đánh giá.
  Từ đã lưu xuất hiện trong bộ **Yêu thích**, giữ cùng danh tính thẻ và lịch FSRS.
  Không đưa bản giải thích kỹ thuật vào thẻ.
- Vùng học rộng tối đa 760, lề 20, thẻ trắng bo 32 và bóng ấm; mặt trước hiện từ,
  mặt sau hiện cách đọc/nghĩa. Số thẻ và thanh tiến độ lấy từ phiên đã lưu.
- Dùng thư viện `react-native-flip-card` 3.5.7 để lật 3D dọc: `flipVertical`, trục X, perspective 1000, spring friction 8. Adapter chặn bấm lặp và đánh giá đến `onFlipEnd`; không tự dựng chuỗi animation. Khi hệ điều hành bật giảm chuyển động, đổi mặt ngay. Thẻ tiếp theo luôn bắt đầu ở mặt trước.
- Luôn hiện 4 nút **Chưa nhớ / Mơ hồ / Nhớ / Rất nhớ** trên một hàng ở cả màn hẹp;
  mỗi nút chia đều chiều rộng, cao tối thiểu 48, nhãn caption, bo `radius.pill`, nền trắng,
  chữ/viền cam `primaryText`/`primary`; nhấn dùng `badgeBg`. Mặt trước, lúc đang lật và khi lưu
  dùng nền/viền `disabled`, chữ `disabledText`, không chỉ giảm opacity. Chỉ mở nút khi mặt sau
  lật xong; giữ nguyên vị trí hàng nút giữa hai mặt thẻ để bố cục không nhảy.
  Web hiện số **1 / 2 / 3 / 4** dưới nhãn để gợi ý phím tắt; **Space** lật thẻ.
  Phím tắt chỉ hoạt động trong phiên đang học, bỏ qua ô nhập liệu, phím bổ trợ và giữ phím;
  chỉ đánh giá sau khi lật xong, chặn thao tác khi lưu và không cuộn trang khi nhấn Space.
  Khoá thao tác khi lưu; lỗi giữ thẻ và có tải lại phiên. Không tự phát âm hoặc tự chuyển khi chưa chọn mức.
- Tổng kết hiện số thẻ đã học/tổng, tỷ lệ nhớ và phân bố bốn mức; ghi rõ tỷ lệ dựa trên tự đánh giá.
  Biểu đồ vòng tròn nhỏ 112 px hiển thị phân bố theo số thẻ đã đánh giá, giữa vòng là tỷ lệ nhớ;
  chú giải bên cạnh có nhãn và số lượng: Chưa nhớ `danger`, Mơ hồ `primary`, Nhớ `focus`,
  Rất nhớ `success`. Màn hẹp cho phép chú giải xuống dưới. Chưa đánh giá hiện vòng `track`
  và thông báo rỗng, không vẽ tỷ lệ giả. Dùng SVG chung web/native, không thêm thư viện biểu đồ.
  Có **Học lại bộ này / Chọn bộ khác**. Rời màn có thể tiếp tục phiên dang dở.

### Nút phát âm từ vựng

- Bài học, chi tiết từ điển và hai mặt flashcard có nút loa 48 px. Trên flashcard,
  loa ở góc trái, ngôi sao ở góc phải; bấm loa không lật thẻ. Không tự phát âm.
- Đang tải hiện spinner, đang đọc hiện biểu tượng dừng; bấm lại để dừng. Ưu tiên
  audio có sẵn, chuyển sang giọng máy tiếng Nhật nếu thiếu/lỗi; đọc kana trước.
- Chỉ một từ phát tại một thời điểm. Dừng khi đổi từ/thẻ, rời màn hoặc xuống nền.
  Chỉ hiện thông báo khi phát lỗi hoặc thiếu giọng Nhật; không thêm ghi chú thường trực.

### Nhận dạng viết tay trong Tra cứu

- Nút **Viết tay** dưới ô tìm mở hộp thoại trắng bo 32, rộng tối đa 440, padding 20.
  Khung vẽ vuông tối đa 320 px, nền trắng, nét đen, dùng chuột/bút/cảm ứng; thu theo màn hẹp.
- **Xóa nét / Nhận dạng** trên cùng hàng, cao tối thiểu 48; chỉ cho nhận dạng khi có nét.
  Khóa vẽ và thao tác gửi khi đang nhận dạng. Hiện lỗi thật và cho thử lại.
- Năm gợi ý cùng hàng, chữ lớn kèm xác suất, gợi ý đầu nền kem/viền cam.
  Chọn chữ Hán mở tìm Hán tự, kana mở tìm từ; đóng hộp thoại sau khi chọn.
  Không tự chọn kết quả model, không hiển thị đường dẫn checkpoint hoặc chi tiết kỹ thuật.

### Trang Cá nhân trên web

- Dùng sidebar và top bar chung. Tiêu đề **Cá nhân**, avatar lấy chữ cái đầu tên;
  không tạo ảnh đại diện hoặc thống kê giả. Desktop: thông tin cá nhân và xác thực
  ở cột trái, thiết lập học tập và phiên đăng nhập ở cột phải. Mobile xếp một cột.
- Thẻ trắng bo 32, padding 20, gap 16, bóng ấm theo token. Hiện họ tên, email,
  số điện thoại và trạng thái xác thực thật; giữ luồng gửi/nhập/gửi lại/hủy mã.
- **Đăng xuất** nằm trong thẻ **Phiên đăng nhập**, nút viền/chữ `danger`, cao tối thiểu
  48, rộng theo nội dung, có icon. Không kéo thành nút toàn chiều rộng ở footer.
  Chặn bấm lặp khi xử lý; spinner chỉ hiện khi đăng xuất, lỗi nằm ngay trong thẻ phiên
  đăng nhập và có thể thử lại. Không đưa lỗi đăng xuất vào thẻ xác thực liên hệ.

### Phòng chơi từ vựng

- Trang tạo phòng dùng khung 1160 px: form chính bên trái, ô vào phòng rộng 300 px bên phải. Mobile đưa ô nhập mã lên trước form, nút vào phòng cùng hàng với input.
- Hai mode là thẻ radio có icon, tên mode và dấu chọn; không thêm mô tả phụ. Cấu hình chia nhóm nguồn từ/JLPT và số câu/thời gian. Dùng token màu, bo góc, typography hiện có.
- Mã phòng nổi bật, cho phép chọn để sao chép; trạng thái kết nối có cả chữ và dấu tròn. Phòng chờ hiển thị avatar chữ cái, vai trò, trạng thái sẵn sàng và số người đã sẵn sàng thật. Sidebar hiển thị cấu hình phòng, không thêm khối giải thích luật.
- Trong trận, từ vựng nằm giữa vùng chơi, bảng điểm ở sidebar desktop và bên dưới trên mobile. Đồng hồ và thanh thời gian theo deadline server; chỉ cảnh báo đỏ trong 5 giây cuối lúc trả lời/đọc. Vào phòng hoặc sang câu mới cuộn về đầu vùng chơi.
- Bảng điểm phân biệt người đang chơi, người đã gửi và người giữ mic; người cùng điểm cùng hạng. Tổng kết hiển thị điểm, hạng và số câu thực tế, kèm từ vựng trong trận. Không dùng sóng âm hay tiến độ nhận dạng giả.

### Phân định chức năng từ vựng

| Chức năng | Nội dung và thao tác | Kết quả |
| --- | --- | --- |
| Bài học từ vựng | Giáo trình → bài học → danh sách từ, nghĩa, cách đọc, âm thanh, lưu yêu thích | Học nội dung theo bài |
| Flashcard | Bộ có sẵn/tự tạo/yêu thích; lật thẻ, tự đánh giá mức nhớ | Lịch ôn FSRS, thẻ đến hạn và số thẻ đã ôn |
| Game từ vựng | Phòng nhiều người, mode viết hoặc giành mic; chọn JLPT hoặc bài học | Điểm và thứ hạng trong trận |

- Bài học, Flashcard và Game là ba điểm vào riêng trong nhóm Từ vựng ở Luyện tập. Thẻ dùng padding 16 px, gap 12 px, khung icon 40 px với icon 20 px; giữ khoảng cách giữa thẻ 16 px để đồng bộ nhóm Kỹ năng. Nhóm Kỹ năng giữ Nghe/Nói/Đọc/Viết.
- Desktop có lối vào Flashcard và Game riêng trên sidebar, có trạng thái chọn tương ứng. Mobile giữ năm tab chính, truy cập hai chức năng này qua Luyện tập.
- Trang chủ gọi đúng tên Bài học từ vựng và Game từ vựng. Không dùng nhãn chung khiến người dùng nhầm bài học với bộ thẻ.
- Có thể dùng chung nguồn từ nhưng không nhập chung kết quả: điểm Game không thay thế mức nhớ hay tự cập nhật lịch FSRS. Lịch ôn thuộc Flashcard; không đưa lịch ôn vào phòng Game.
- Nút Flashcard từ Bài học là lối tắt sang chức năng riêng; quay lại giữ bài học đang mở. Flashcard từ Luyện tập quay về Luyện tập.


## Luyện đọc (UC-R1–UC-R5)

- Mở từ kỹ năng Đọc trên Home/Luyện tập. Web dùng `/practice/reading` và `/practice/reading/:passageId`; bộ lọc level/type/q/page giữ trên URL, Back/Forward và F5 phục hồi đúng màn hình.
- Danh sách tối đa 1160 px, desktop hai cột, màn hẹp một cột; thẻ trắng bo 32, padding 20, gap 20, bóng ấm. Trang danh sách là **Thư viện bài đọc**. Tìm kiếm tiêu đề/nội dung đặt đầu trang, mặc định tất cả trình độ. Bộ lọc chỉ hiện Tất cả và N5–N1, không gắn nhãn trình độ cá nhân. Trình độ JLPT và dạng bài nằm trong panel **Bộ lọc** có thể thu gọn; bộ lọc đang áp dụng vẫn hiện bên ngoài và có nút xóa. Thẻ ưu tiên tiêu đề, trích đoạn, số ký tự; JLPT là metadata phụ, chỉ hiện với trình độ N5–N1. Pagination theo số trang; đổi bộ lọc trở về trang 1. Chỉ hiển thị nhóm nội dung khi có dữ liệu thật, không thêm tab nguồn/chủ đề giả cho nội dung tương lai.
- Nội dung đọc tối đa 800 px, chữ Nhật 20/34, xuống dòng theo nguồn. Công tắc Furigana nằm ngoài vùng cuộn, mặc định bật và lưu riêng theo tài khoản trên thiết bị. Khi tắt vẫn tra từ được.
- Dùng chung bộ phân tích từ, furigana và popup từ điển với Shadowing. Bấm từ hiện nghĩa thật từ từ điển, không rời trang; đóng bằng nút ×, bấm ngoài hoặc Escape trên web. Giữ vị trí đọc. Không thêm mô tả hướng dẫn dưới các nút.
- Dữ liệu nguồn CSV được nhập thành từng đoạn, nhiều câu hỏi chung một đoạn không tạo thêm bài đọc. Câu hỏi hợp lệ hiển thị trong phần Đọc hiểu; đáp án giữ ở backend đến khi nộp bài. Câu có dữ liệu đáp án không nhất quán không đưa vào bài tập. Chưa triển khai bản dịch, không có công tắc dịch hoặc gọi dịch vụ AI.


## Dịch câu trong Tra cứu (bản thử)

- Dịch nằm ngay trong tab Từ vựng, dùng chung ô tìm kiếm và URL `/lookup?q=...`; không có tab Dịch riêng. Chỉ xử lý khi gửi tìm kiếm, không gọi model khi đang gõ. Mục từ khớp chính xác vẫn hiển thị từ điển trước.
- Thẻ Kết quả tra cứu: tiêu đề và divider nhẹ, câu Nhật phía trên với furigana, Kanji có màu focus/gạch dưới primary và bấm tra nhanh. Nút nghe nằm bên phải câu. Bản dịch tiếng Việt nằm dưới; nhãn Dịch tự động căn phải ở cuối. Giữ màu/chữ/bo góc/bóng chung; không thêm bộ chọn engine hoặc nút báo lỗi khi chưa có chức năng.
- Từ không giống câu giữ luồng từ điển hiện tại. Truy vấn giống câu, không khớp mục từ sẽ dịch cục bộ; tối đa 500 ký tự. Câu Nhật→Việt; câu Việt→Nhật cũng hiển thị Nhật trên/Việt dưới. Lỗi có thử lại; câu có URL riêng qua query nên Back/F5 phục hồi kết quả theo API/cache.
- URL `/lookup/translate` cũ chuyển về ô tra cứu chung. Không hiển thị tên model/chi tiết inference trong sản phẩm. Chức năng này không bật dịch trong bài đọc.

## Đọc hiểu và chấm điểm (UC-R8–UC-R9)

- Web desktop chia khung tối đa 1160 px thành hai cột cách 20 px: bài đọc bên trái, **Đọc hiểu** bên phải. Hai cột cuộn độc lập trong chiều cao còn lại, Furigana giữ ở thanh trên; nộp bài chỉ cuộn cột câu hỏi đến tổng điểm. Màn hẹp/native giữ bài đọc rồi câu hỏi trong cùng luồng cuộn, tối đa 800 px. Bài không có câu hỏi giữ khung đọc một cột. Dùng thẻ trắng bo 32, padding 20, khoảng cách 20; không thêm mô tả hướng dẫn dưới nút. Bài chưa có câu hỏi hợp lệ không hiển thị phần này.
- Hiện số câu đã trả lời; mỗi câu có lựa chọn A–D (hoặc theo số lựa chọn nguồn), vùng nhấn tối thiểu 52 px, radio có checked/disabled state và focus bàn phím. Người học có thể đổi lựa chọn trước khi nộp, phải trả lời đủ mới bật **Nộp bài**. Trong lúc gửi khóa lựa chọn và nộp.
- Chấm bằng backend từ đáp án nguồn. Sau khi lưu mới hiện **Điểm: …/100**, số câu đúng/tổng câu, trạng thái Đúng/Sai từng câu và đáp án đúng. Dùng cả chữ lẫn màu success/danger, phân biệt rõ lựa chọn của người học. Không tự tạo giải thích khi nguồn không có.
- **Làm lại** bắt đầu lượt mới với lựa chọn trống. F5/mở lại phục hồi kết quả gần nhất của chính tài khoản nếu bài chưa đổi nội dung. Lỗi nộp giữ lựa chọn và có **Nộp lại bài**, không tạo bản ghi trùng khi thử lại cùng lượt. Furigana, tra nhanh và bản dịch chưa triển khai giữ phạm vi hiện có.

## Tips và phân tích bài đọc (UC-R7, UC-R10–UC-R12)

- Desktop giữ hai cột: bài bên trái; bên phải có **Tips đọc hiểu** thu gọn và tab **Câu hỏi / Phân tích**. Mobile xếp dọc. Bài chưa có câu hỏi vẫn có tips và phân tích. Tips tối đa 3 điểm cố định theo bộ skill đã cung cấp, không gọi AI.
- Trong bài có nút **Nguyên bản / Phân tích**. Nguyên bản giữ văn bản, furigana và tra nhanh; Phân tích đánh số câu để tương tác. Bấm số hoặc câu mở phần lõi câu, chi tiết có thể thu gọn. Highlight dùng `badgeBg` và nền câu `surfaceTint`, không thêm màu riêng cho từng loại ngữ pháp.
- **Phân tích bài đọc** gộp ý chính tiếng Việt, mạch bài, từ vựng quan trọng, ngữ pháp quan trọng và cấu trúc câu. Ý chính mở trước; từ vựng/ngữ pháp/các lớp rút gọn mở theo nhu cầu. Bấm mục từ, mẫu ngữ pháp hay trích dẫn sẽ đánh dấu và cuộn tới đúng vị trí ở bài đọc. Không thêm mô tả dưới nút.
- Sau khi nộp bài, từng câu có **Giải thích đáp án**. Hiện vì sao đúng, bằng chứng nguyên văn có thể bấm; cảnh báo nếu đáp án nguồn có nghi vấn. Không đổi điểm bằng kết quả AI. Giải thích phải thuộc bài làm của chính người học và đúng phiên bản hiện tại.
- Gemini chỉ gọi khi người học yêu cầu và chưa có kết quả hợp lệ đã lưu trong DB. Đổi tab, mở tips hoặc bật highlight không tự tạo phân tích. Trạng thái tải/lỗi có thể thử lại, giữ lựa chọn và điểm đã chấm. Không hiển thị tên model, JSON hoặc chi tiết suy luận nội bộ trong giao diện.

## Cấu trúc câu: lõi trước, chi tiết sau

- Trong panel câu đang chọn, không đặt toàn bộ câu dài lên trước lõi đã tải. Bỏ bộ ba tab; mặc định thu gọn, chỉ có nút **Đầy đủ câu / Thu gọn câu**. Giữ chủ thể và vị ngữ chính, bổ ngữ/tần suất cần thiết; các mệnh đề bổ nghĩa/phần phụ hiện chip thu gọn có thể bấm mở.
- Bấm phần thu gọn mở nguyên văn Nhật và giải thích vai trò, đồng thời highlight đúng vị trí ở bài đọc. Bấm chủ thể/vị ngữ cũng xem được giải thích. Thu gọn lại đóng chi tiết của phần đó. Nguyên bản dùng đúng chuỗi nguồn và có thể chọn/copy, không ghép lại bằng nội dung AI.
- Vai trò có nhãn chữ và màu semantic trong `sentenceRoles`: chủ thể xanh lam, vị ngữ xanh lá, bổ ngữ cam, bổ nghĩa tím, thành phần phụ vàng nhạt, phần khác muted. Có chú giải chữ; không chỉ dựa vào màu. Màu này chỉ dùng cho cấu trúc câu; vùng tra từ/bằng chứng dùng highlight chung.
- Bản dịch mặc định là **Nghĩa lõi câu**. Bấm **Đầy đủ câu** hoặc mở hết các phần thu gọn tự chuyển sang **Nghĩa đầy đủ**; thu gọn lại thì trở về nghĩa lõi. Giữ ý phủ định, mức độ và tần suất quan trọng khi rút gọn. Mở/đóng chip hay đổi chế độ không gọi AI.

- Nút **Thêm video YouTube** trong thư viện Nghe dùng cùng kiểu với nút chọn Shadowing/Nghe chép chính tả: pill cao tối thiểu 34 px, icon 15 px, chữ 11/16, viền cam/nền trắng; mở form chuyển nền cam, chữ/icon trắng và nhãn Thu gọn. Có hitSlop 7 px và trạng thái expanded.

- Favicon trình duyệt dùng ảnh vuông `src/assets/mascot/nihongo-app-icon.png` (1024×1024), giữ nguyên hình Momo và chữ NihonGO; Vite xuất asset có hash để cập nhật cache khi thay ảnh.

### Cài lên màn hình chính (PWA)

- Manifest nhận diện NihonGO, phạm vi và trang mở đầu `/`, chế độ `standalone`, nền/theme `background`. Icon dùng lại ảnh Momo NihonGO: 192/1024 px cho manifest và 180 px cho Apple Touch Icon; để hệ điều hành tự bo góc, không khai báo maskable cho ảnh có chữ sát cạnh.
- Trang chủ trên iPhone/iPad có thẻ hướng dẫn nhỏ **NihonGO trên màn hình chính**, nền trắng/viền divider, padding 16, bo small, icon 40 px; chỉ dẫn Chia sẻ → Thêm vào màn hình chính → Thêm. Nút X vùng bấm 48 px và có nhãn trợ năng.
- Thẻ chỉ hiện khi dùng trình duyệt iOS/iPadOS; ẩn khi chạy standalone hoặc đã đóng hướng dẫn trên thiết bị. Nhận diện iPad dùng chế độ desktop qua MacIntel + cảm ứng. Không mở popup hoặc yêu cầu cài đặt mỗi lần đăng nhập.
- Giai đoạn này không đăng ký service worker, không thêm cache/offline hoặc push notification. Thay đổi bản web tiếp tục đi qua CI/CD hiện có.

### Trình độ mặc định cho bộ lọc

- Các màn Từ vựng/Bài học, Đọc, Nói, Flashcard, Game và trình độ câu hỏi Shadowing lấy mặc định từ trình độ trong hồ sơ học tập. App và web dùng chung ngữ cảnh hồ sơ, không gọi lại API preferences cho từng bộ lọc.
- Hồ sơ **Mới bắt đầu** dùng N5 cho các bộ lọc chỉ có N5–N1; danh sách tình huống Nói giữ lựa chọn **Mới bắt đầu** vì API có dữ liệu riêng cho mức này.
- Mặc định chỉ áp dụng khi chưa có lựa chọn. Bộ lọc có sẵn trong URL được ưu tiên; `level=` ở màn Đọc vẫn là lựa chọn Tất cả, không tự đổi về trình độ hồ sơ. Người dùng đổi mức hoặc xoá bộ lọc bình thường; không sửa trình độ trong hồ sơ.
- Trang Viết hiện nhóm đề theo cấp độ và Tra cứu không có bộ lọc JLPT, nên không thêm bộ lọc mới trong thay đổi này.

- Chi tiết bài đọc trên điện thoại dùng một ScrollView ngoài cho cả bài và phần câu hỏi/phân tích. Hai vùng con là View thông thường để không chặn vuốt cảm ứng. Desktop có hai ScrollView độc lập bên trong khung View vừa chiều cao; không lồng ScrollView bị tắt cuộn vì trên web nó chặn thao tác vuốt của vùng cha/con.

### Luyện viết trên web

- Web/PWA dùng workspace tối đa 1160 px, nút quay lại trên thanh đầu trang cùng hàng logo. Khi mới vào Luyện viết, hiển thị thư viện để người dùng chọn đề, bản nháp, bài đã nộp hoặc Viết tự do; không tự chọn đề hay tạo bài viết trống. Sau khi chọn, màn làm bài chỉ giữ đề đang chọn và giấy viết; không có sidebar đề cố định. Nút “Đổi đề” nhỏ trong khung đề mở thư viện; Bản nháp / Đã nộp nằm trong các tab của thư viện, không lặp nút trên khung đề bài.
- Thư viện đề dùng modal giữa màn hình desktop rộng tối đa 880 px, sheet trên điện thoại; ô tìm kiếm, bộ lọc N5–N1 mặc định theo hồ sơ và nhóm Đời sống / Học tập / Công việc / Xã hội. Backend tìm theo tên/yêu cầu, lọc và phân trang 12 đề/lần. Thẻ đề hiển thị tên Nhật, trình độ, trạng thái Chưa làm / Có nháp / Đã nộp; desktop 2 cột, mobile 1 cột. Tìm kiếm debounce 300 ms, đổi bộ lọc về trang 1. Nút/chip cao 34 px, chữ 11/16, padding 7×10, bo viên thuốc, chọn nền primary/chữ trắng. Không thêm giải thích hoặc thống kê thừa trong thư viện. Chọn đề đóng modal, giữ nháp từng đề; có Viết tự do.
- Yêu cầu đề luôn hiện phía trên bài viết, gợi ý có thể mở/thu gọn. Khi soạn bài, tiêu chí chấm hiển thị thành cột 240 px bên trái, căn đỉnh với giấy viết khi có đủ chiều rộng; màn hẹp đặt tiêu chí dưới giấy. Cột tiêu chí có thời gian làm bài đếm tăng, nút Lưu nháp viền cam và Nộp bài nền cam nhỏ 34 px; không lặp Nộp bài hoặc Lưu nháp dưới giấy. Thời gian giữ riêng từng bài trong phiên mở workspace, tạm dừng khi xem thư viện, chấm bài hoặc ứng dụng chuyển nền. Nháp tiếp tục tự lưu; lỗi lưu có thể thử lại bằng Lưu nháp tại cột này. Khung đề nền `surface`, viền `divider`; giấy viết nền `surface`, viền `border`, tách rõ khỏi nền kem của trang. Nút Nộp bài nền cam; nút Lưu nháp viền cam.
- Tự lưu sau 1,5 giây tạm ngừng nhập khi có ít nhất 4 ký tự. Có trạng thái đang lưu/đã lưu/lỗi; giữ nội dung khi lỗi, thử lại bằng Lưu nháp. Đổi chủ đề lưu phần đang viết và giữ bộ đệm từng bài; phản hồi lưu chỉ cập nhật metadata, không ghi đè chữ mới.
- Nộp bài giữ ô viết tại chỗ trong lúc chấm; nhận xét thay nội dung vùng chính, có Chỉnh sửa bài quay lại văn bản đang soạn. Xem nhận xét đã có không gọi lại AI. Bài đã nộp giữ nguyên; sửa rồi nộp tạo phiên bản mới. Chấm lại bằng AI là thao tác chủ động riêng.
- Lịch sử mở trong tab Đã nộp của thư viện; chọn hai phiên bản cùng đề để so sánh trong vùng chính, không qua các màn chọn nối tiếp. Không gọi AI khi tìm đề, xem nháp hoặc xem lịch sử.
- Trên màn hẹp, thư viện mở thành bảng từ dưới lên; bấm chỗ sửa mở bảng giải thích. Desktop đặt giải thích cạnh bài khi còn đủ chiều rộng, xếp dọc khi vùng bài hẹp.
- Nội dung 9 đề viết mặc định (N5–N3) dùng tiếng Nhật cho tiêu đề, yêu cầu và gợi ý. N5 ưu tiên hiragana và câu ngắn; N4 kể trải nghiệm/nêu lý do; N3 đưa ví dụ, trình bày quan điểm/kế hoạch. Cập nhật nội dung theo ID, giữ đề tự tạo và bài đã nộp.
- Bản native giữ luồng hiện tại trong lần thử UX web này; dùng chung dịch vụ, dữ liệu và component nhận xét.

### Nhận xét bài viết theo tiêu chí

- Trước khi viết hiển thị 4 tiêu chí, mỗi tiêu chí 25 điểm: đáp ứng đề, tổ chức/liên kết, ngữ pháp, từ vựng/chữ viết. Kết quả hiển thị nhận xét từng tiêu chí, mở chi tiết các mục nhỏ 0–5 điểm và bài tập tiếp theo.
- Kết quả gom radar chart và nhận xét 4 tiêu chí trong một khung nền `surface`, viền `divider`. Radar có 4 trục cố định, cùng thang 0–25, lưới trung tính, vùng điểm cam `primary` mờ 20%, nhãn và điểm thật ở từng trục, mô tả trợ năng đầy đủ. Dùng SVG có sẵn, không gọi AI hoặc thêm thư viện chart. Màn rộng đặt biểu đồ bên trái, nhận xét bên phải; màn hẹp xếp dọc. Mỗi tiêu chí có tiêu đề, điểm/25, thanh điểm cam trên `track`, nhận xét ngắn và các điểm thành phần mở/thu gọn; không lặp ghi chú cách tính điểm.
- Trong kết quả dùng ba nút viên thuốc nhỏ: Chỉnh sửa, Bản gốc, Đã sửa; có icon nhỏ tương ứng bút chì, mắt, dấu kiểm. Nút đang chọn nền `primary`, chữ `onPrimary`; nút khác nền trắng, viền `border`.
- Chỗ bỏ/thay thế dùng `dangerBg`/`danger` và gạch ngang; đề xuất dùng `successBg`/`success` và gạch chân. Có chú giải bằng chữ. Đây là màu ngữ nghĩa cho sửa lỗi, không đổi màu thương hiệu của nút.
- Phần giải thích dùng tiêu đề “Giải thích”; nút mở trên điện thoại dùng icon hội thoại và nhãn ngắn “Giải thích”. Bấm đoạn đánh dấu hoặc nút số để chọn giải thích, xem bản gốc → đề xuất → lý do. Phân biệt Lỗi cần sửa và Gợi ý diễn đạt. Desktop chia bài viết và panel giải thích 300 px; màn hẹp xếp dọc. Giữ ngắt đoạn và ký tự Unicode của bài gốc.
- Bài đã nộp theo định dạng cũ giữ nguyên điểm/nhận xét, có lời nhắc chủ động chấm lại để có tiêu chí; không tự sinh điểm chi tiết.

### Giấy 原稿用紙 trong ô viết web

- Vùng soạn bài dùng giấy ô vuông, mặc định viết ngang, tối đa 20 ô/dòng. ResizeObserver đo chiều rộng thực tế của vùng viết để giảm số ô khi sidebar hoặc màn hình hẹp; không gây cuộn ngang trang.
- Đầu giấy ghi “Giấy làm bài”. Cạnh số ký tự có một nút icon 16 px, vùng bấm tròn 32 px, không nền/viền; icon `primaryText`, nhấn dùng `badgeBg`, focus dùng `focus`. Icon biểu thị hướng hiện tại; bấm để đổi ngang/dọc, tooltip và nhãn accessibility nêu hướng sẽ chuyển sang. Viết dọc dùng `vertical-rl`: chữ từ trên xuống, cột từ phải sang trái; cuộn ngang bên trong giấy. Đổi hướng giữ nguyên nội dung, không tạo nháp hoặc gọi AI; tạm khoá chuyển hướng trong lúc IME đang ghép chữ.
- Giấy nền trắng `surface`, lưới cam lấy từ `primary` với alpha 20% để không lấn chữ; khung viền `border`, bo `radius.input`, focus dùng `focus`. Chữ trong giấy dùng `dark`, font Mincho Nhật và biến thể full-width để Kana, Kanji, chữ Latin và số có bước ô đều; nhãn/nút vẫn Readex Pro.
- Dùng một textarea liên tục, xuống dòng mềm theo chiều rộng giấy, không tách ký tự thành nhiều input. Chỉ thay cách hiển thị, giữ nguyên văn bản khi lưu/nộp. Lưới bám vị trí cuộn của textarea.
- Khi IME đang chuyển đổi, giữ bản đang nhập trong editor, tạm dừng tự lưu và nộp bài. Chỉ gửi văn bản đã xác nhận vào bộ đệm nháp. Không chặn Enter hoặc phím chỉnh sửa của trình duyệt.
- Giấy là vùng soạn bài trực tiếp, không bọc thêm card trắng hoặc tiêu đề “Nội dung bài viết”. Số ký tự nằm trên đầu giấy; trạng thái lưu và các nút thao tác gom thành hàng gọn bên dưới giấy.
- Chiều ngang khung giấy và hàng thao tác bằng khung đề bài. Bỏ giới hạn chiều rộng riêng của vùng viết; ô giấy co giãn đều theo phần chiều rộng khả dụng, giữ tối đa 20 ô/dòng và căn bước chữ theo kích thước ô.

- Tra cứu video: tiêu đề “Ví dụ trong video” dùng chữ 16/24, căn trái cạnh nút quay lại; truy vấn đặt ngay dưới, số đoạn là badge nhỏ bên phải. Thẻ kết quả gọn với padding 16, gap 8, bo `small`, viền `divider`, không bóng; câu phụ đề 14/23, tên video dạng caption, tên kênh rút gọn một dòng để giữ chỗ cho nút phát.
