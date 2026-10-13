# NihonGO — Đặc tả giao diện

## Định hướng

Giao diện ấm, nhẹ và thân thiện với ứng dụng học ngôn ngữ. Tham chiếu hình và component mẫu người dùng cung cấp: nền kem pha hồng nhạt, thẻ trắng bo tròn lớn, màu cam đào, biểu tượng nét tròn, nút viên thuốc và bóng đổ ấm rất nhẹ.

Áp dụng cho đăng nhập, đăng ký, xác thực email, khôi phục mật khẩu, thiết lập học tập và tài khoản. Nội dung, dữ liệu và các thao tác lấy từ chức năng thực tế của NihonGO. Không đưa số điểm, chuỗi ngày học, khóa học, thử thách hoặc thanh điều hướng trong hình mẫu vào màn hình tài khoản.

Nguồn cấu hình: `frontend/src/theme/theme.ts`. Các component dùng chung nằm tại `frontend/src/components/AuthForm.tsx` và `AuthIcon.tsx`.

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

Nền `AuthShell` có hai vùng sáng SVG radial gradient: hồng `#F9CCD6` và đào `#FFDDB7`, opacity tối đa 0.5 rồi giảm về 0. Đây là lớp trang trí, không nhận thao tác và không được đọc bởi screen reader. Không dùng ảnh bitmap hoặc blur kích thước lớn.

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

## Component và trạng thái

### AuthShell / AuthCard

`AuthShell` chứa nền, safe area, thanh thương hiệu, tiêu đề, nội dung cuộn và footer. Mặc định bọc form trong một `AuthCard`; màn hình tài khoản dùng nhiều thẻ qua `card={false}`.

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
| Tài khoản | Lời chào → thẻ thiết lập học tập và chỉnh sửa → thẻ thông tin cá nhân và badge → thẻ bảo vệ tài khoản → đăng xuất ở footer |

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
- Dùng nền kem với hai vùng SVG radial gradient hồng/đào như AuthShell, thanh BrandLogo, tiêu đề `title` 18/24, mô tả `body` 12/16. Nội dung rộng tối đa 480, lề 20. Thẻ từ và tra cứu trắng bo `radius.card` 32, padding 20, gap 16, khoảng cách thẻ 20 và bóng `shadowMd`; thẻ bài học dùng kích thước gọn riêng của grid ở trên.
- Bộ chọn trình độ chỉ xuất hiện trong danh sách bài, dùng nút viên thuốc, chọn dùng cam `primary` và chữ trắng, pressed `primaryPressed`, có nhãn và trạng thái radio. Link/nút text màu `primaryText`, `typography.link` 12/16, vùng chạm tối thiểu 48. Ô tìm kiếm ở mục Tra cứu bo 18, cao tối thiểu 56; focus dùng viền `focus`.
- Bài mở danh sách từ với kana, nghĩa, Hán Việt và phần mở rộng ví dụ/từ liên quan. Có icon mắt ngang tiêu đề bài để ẩn nghĩa tự ôn và hiện nghĩa riêng từng từ. Chế độ ẩn nghĩa chỉ áp dụng cho bài học. Loading, lỗi và empty là trạng thái thật.
- Danh sách bài và từ được virtualize, có safe area và xử lý bàn phím. Quay lại từ bài về danh sách bài; từ kết quả tra cứu về ô tra cứu, không chuyển sang bài học. Android Back tại gốc mỗi mục về Trang chủ. Không hiện tiến độ hoặc số từ đã thuộc khi chưa có dữ liệu.
- Mục Tra cứu có ô nhập riêng và hai lựa chọn dạng viên thuốc **Video** và **Từ vựng**; mặc định Video khi tìm từ Trang chủ. Không hiện bài học, bộ chọn JLPT hoặc nút ẩn nghĩa. Khi chưa nhập truy vấn, hiện hướng dẫn và không gọi API tìm kiếm. Tra cứu thường hỗ trợ từ Nhật/kana/nghĩa tiếng Việt trên dữ liệu N2 hiện có, có chú thích phạm vi; trình độ đang chọn trong Bài học không lọc kết quả Tra cứu. Video tìm nguyên văn trong phụ đề. Kết quả dùng thẻ trắng theo token chung, câu có từ tìm được tô nền đào, tên video, kênh, mốc thời gian và hành động **Xem đoạn này**.
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
  Câu hiện tại có gạch chân, dùng cue ngắn riêng với timestamp nguồn. Cỡ chữ tự
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

Home ưu tiên thao tác theo thứ tự: tra từ → tiếp tục mục tiêu hiện tại → chọn kỹ năng → khu vực từ vựng → panel giới thiệu NihonGO. Không hiển thị tiến độ, chuỗi ngày hoặc số từ giả khi backend chưa cung cấp dữ liệu.

- Ô tra cứu đặt đầu nội dung, chấp nhận tiếng Nhật, romaji hoặc tiếng Việt. Cao 56 px, nền trắng, viền 1 px, bo 18 px; nút gửi tròn 48 px chỉ hoạt động khi nội dung sau khi trim không rỗng.
- Thẻ **Tiếp tục học** lấy trình độ, mục tiêu và số phút/ngày từ `LearningProfile`. Không tự suy diễn phần trăm hoàn thành. CTA cam nằm trong thẻ và toàn bộ thẻ đều có thể nhấn.
- Bốn kỹ năng xếp lưới 2×2: Nghe, Nói, Đọc, Viết. Mỗi thẻ dùng Momo tối đa 112 px, tự co theo chiều rộng nội dung trong hành động tương ứng (tai nghe, micro, đọc sách, tập viết), nền trắng `surface`, bo `radius.card` 32, padding 20, gap 16 và bóng `shadowMd`; tiêu đề 18/24, mô tả 12/16 và hành động 14/20. Hai thẻ trong hàng dùng `flex: 1`; bỏ các họa tiết SVG trừu tượng và nền nhiều màu.
- Tư thế Momo hỗ trợ nhận diện kỹ năng; tên, mô tả và accessibility label luôn mang đủ ý nghĩa. Ảnh bên trong nút là trang trí, không đọc lặp lại.
- Thẻ **Từ vựng của bạn** tách khỏi ô tra cứu: ô phía trên phục vụ tra nhanh, thẻ này điều hướng đến khu vực lưu và ôn từ.
- Panel giới thiệu đặt cuối nội dung, sau khi người dùng đã thấy giá trị học tập. Panel dùng nền `surfaceTint`, viền đào và một CTA “Khám phá lộ trình”; không dùng popup khi mở Home.
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
  có khoảng cách, gạch chân cam và furigana trên phần kanji; ghép đuôi biến đổi
  thành từ hoàn chỉnh (ví dụ `立った`, `言って`). Từ được chọn nền cam nhạt.
  Bảng phụ đề bên dưới chỉ hiển thị chữ, giữ nút play riêng của từng câu.
- Bấm chữ tạm dừng video, không tua/replay. Nút play bên trái câu là thao tác luyện
  riêng. Đóng popup giữ video dừng; người dùng chủ động bấm phát để tiếp tục.
- Popup trắng bo 16 cạnh vị trí bấm, luôn nằm trong vùng an toàn; có chữ, cách đọc,
  dạng gốc khi biến đổi, từ loại, nghĩa tiếng Việt và nút đóng 32 px + hitSlop.
  Nội dung dài có thể cuộn. Thiếu nghĩa là trạng thái thật, không hiển thị nút giả.
- Không gọi AI/tra từ online khi bấm. Không thêm romaji, lưu từ hoặc audio trong bản thử.


### Bản dịch phụ đề shadowing

- Nút Bản dịch bật/tắt độc lập với panel Phụ đề, nhỏ và cùng kiểu chip đã có. Khi chưa có dữ liệu, tạo job backend và hiển thị tiến độ thật; có lỗi và Thử lại, video tiếp tục phát.
- Bản Việt dưới câu Nhật trong danh sách dùng body 12/18 màu muted. Bản Việt dưới phụ đề lớn dùng label 14/20, căn giữa, cuộn tối đa 72 px. Bản Việt bám câu luyện, không cắt theo cue Nhật ngắn hoặc tự tạo timestamp.
- Chỉ tải khi bật Bản dịch, dùng cache theo video cho mọi người; tắt ẩn bản Việt và dừng poll. Không remount player khi có bản dịch.

- Nút mắt ẩn toàn bộ vùng phụ đề lớn và bản dịch bên dưới vùng này, không giữ khung hay dòng thông báo thay thế. Danh sách câu vẫn đọc được. Khi ẩn, icon mắt chuyển xuống thanh công cụ để mở lại; khi hiện, icon nằm góc trên phải của khung lớn.
