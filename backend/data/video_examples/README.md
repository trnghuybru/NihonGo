# Dữ liệu thử nghiệm tìm ví dụ trong video

Video: [Kazunari Taguchi — TEDxHimi](https://www.youtube.com/watch?v=cjtmDEG-B7U),
kênh TEDx Talks, thời lượng 971 giây (16 phút 11 giây).

## File mẫu

- `cjtmDEG-B7U.ja.json`: metadata và 327 đoạn phụ đề tiếng Nhật, có câu gốc,
  câu chuẩn hóa để tìm kiếm, thời gian bắt đầu và kết thúc tính bằng giây.
- `cjtmDEG-B7U.ja.srt`: cùng dữ liệu, xuất sang định dạng SRT.

Đã lấy bản phụ đề tiếng Nhật không phải ASR bằng `youtube-transcript-api`
1.2.4. Không tải video hoặc audio. Các lần lấy trực tiếp bằng URL phụ đề
trả HTTP 200 nhưng nội dung rỗng; thư viện lấy transcript thành công.
Đây là thư viện không chính thức, nên khả năng lấy dữ liệu cần được kiểm tra
cho từng video và môi trường chạy. Việc tải thành công không xác nhận giấy
phép tái sử dụng; metadata nguồn được giữ để kiểm tra trước khi phát hành.

## Tìm kiếm thử

Tìm chuỗi nguyên văn trong `search_text`. Chuẩn hóa truy vấn giống dữ liệu:
Unicode NFKC, bỏ khoảng trắng đầu/cuối và gộp khoảng trắng liên tiếp.
Chưa xử lý dạng gốc, cách đọc hoặc ranh giới từ; tìm `本` có thể khớp `日本`.
Mỗi dòng phụ đề là một đơn vị tìm; cụm bị chia qua hai dòng chưa được ghép.

| Truy vấn | Số đoạn khớp | Bắt đầu kết quả đầu tiên |
| --- | ---: | ---: |
| 社会 | 13 | 60.75 giây |
| 日本 | 11 | 102.73 giây |
| 人生 | 4 | 727.27 giây |
| お金 | 3 | 58.02 giây |

Mốc phụ đề là thời điểm đầu đoạn, không phải thời điểm từng từ được nói.
Đã kiểm tra số lượng, nội dung không rỗng, thời gian hợp lệ, thứ tự thời gian
và thời gian kết thúc nằm trong thời lượng video. Chưa đối chiếu thủ công
toàn bộ 327 đoạn với audio.

File SRT là bản xuất từ transcript nhận được, không phải file SRT gốc của chủ video.

## Nhập PostgreSQL và sử dụng trong app

Từ thư mục `backend`, khi PostgreSQL đang chạy và `backend/.env` đã được cấu hình:

```sh
venv/bin/flask --app app db upgrade
venv/bin/flask --app app video-examples-import
```

Nhập file khác cùng schema bằng `--source /path/to/dataset.json`. Importer kiểm tra
toàn bộ file trước khi ghi; thay thế phụ đề của đúng video trong một transaction.
Chạy lại không tạo đoạn trùng, cập nhật snapshot không giữ các đoạn cũ đã bị bỏ.
Không tự nhập hoặc lấy phụ đề từ YouTube mỗi lần backend khởi động/tìm kiếm.

Trong app, nhập `社会` hoặc `人生` tại Trang chủ hoặc mục **Tra cứu** trong tab
Từ vựng (tách riêng với mục **Bài học**). Lựa chọn
**Video** tìm nguyên văn trên toàn bộ kho phụ đề; **Từ vựng** tra dữ liệu bài học
theo trình độ. Kết quả Video hiện sẵn đoạn đầu tiên trong player YouTube ngay
dưới ô tìm kiếm; chạm **Xem đoạn này** ở kết quả khác để đổi đoạn tại chỗ.
Có nghe lại, chuyển ví dụ và mở trên YouTube. Quay lại/chuyển tab, chuyển loại
tìm kiếm hoặc gửi tìm kiếm mới giải phóng player;
khi app vào nền, WebView được tháo để dừng phát.

API yêu cầu Bearer token:

```text
GET /api/vocabulary/video-examples?q=社会&page_size=20
GET /api/vocabulary/video-examples?q=社会&page_size=20&after=<next_cursor>
```

Trả `query` đã chuẩn hóa, `items`, `has_more`, `next_cursor`. Mỗi item có câu gốc,
câu tìm kiếm, mốc bắt đầu/kết thúc, metadata video và link xem tại mốc thời gian.
Cursor gắn với truy vấn; không dùng cursor của từ này cho từ khác. Không đếm tổng
kết quả mỗi lần tìm và không phân trang bằng OFFSET.

Bảng `example_videos` và `video_caption_segments` nằm trong PostgreSQL. Migration
thêm extension `pg_trgm` tại schema `public` và chỉ mục GIN cho `search_text`.
Tài khoản chạy migration cần quyền tạo extension. Truy vấn 1–2 ký tự có thể ít
được hưởng lợi từ trigram; chưa bổ sung chỉ mục ký tự riêng khi kho còn nhỏ.

Player dùng `react-native-webview` hiện có và YouTube IFrame API, bắt đầu ở
`startSeconds`, theo dõi thời gian phát và gọi `pauseVideo()` ở mốc kết thúc câu.
Không chuyển video sang trạng thái kết thúc toàn bộ; nghe lại phát từ đầu câu.
Tự dừng một lần cho mỗi lần mở/nghe lại câu; sau đó người dùng nhấn Play trên
player để xem tiếp phần còn lại của video mà không bị dừng lại ở mốc cũ.
Buffering hoặc tạm dừng thủ công không làm mất thời lượng nghe của câu.
`baseUrl` HTTPS mang app ID cung cấp Referer theo yêu cầu YouTube;
cập nhật origin nếu đổi applicationId/Bundle ID. Không gửi Bearer token của app
vào WebView. Phát video cần Internet, có thể bị hạn chế nhúng hoặc autoplay;
giao diện có thông báo, thử lại và nút mở trên YouTube.
