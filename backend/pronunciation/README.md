# Phản hồi phát âm thử nghiệm

Checkpoint người dùng cung cấp trong `jp-pronunciation-model.zip` được đặt tại
`backend/models/pronunciation/` và bỏ qua trong Git. Các file cần thiết gồm
`model.safetensors`, `config.json`, `vocab.json`, `preprocessor_config.json`.
Có thể đổi thư mục bằng `PRONUNCIATION_MODEL_DIR`. `ctc.py` lấy từ package trong ZIP,
đã kiểm tra trước khi tích hợp. Không chạy script huấn luyện trong ZIP.

Model nạp lazy một lần mỗi process, chỉ nhận trọng số safetensors local. Một yêu
cầu inference mỗi process, trả 429 khi bận. CPU cần khoảng 1,3 GB trọng số và thêm
bộ nhớ cho inference. Dùng ít worker nếu triển khai máy nhỏ.

POST `/api/pronunciation/analyze` yêu cầu đăng nhập, giới hạn 8 lượt/phút/tài khoản.
JSON gồm `text` tối đa 160 ký tự tiếng Nhật và `audio` là base64 WAV, mono/stereo,
8–48 kHz, 0,5–20 giây. Giới hạn body 1,4 MB. Không lưu audio. Không gọi LLM.

Chuyển âm qua OpenJTalk, resample 16 kHz, chạy XLS-R CTC, đối chiếu với câu mẫu.
Phản hồi `uncertain` khi âm nhận diện lệch nhiều hoặc không thể căn chỉnh.
`focus_phones` là gợi ý nghe lại, không phải lỗi phát âm đã được xác nhận bởi giáo viên.
Báo cáo đi kèm model có PER 0,1588 trên 493 câu kiểm tra JSUT một người nói.
Chưa có kiểm chứng cho giọng người học, chấm trọng âm hoặc điểm 0–100.

Chạy kiểm tra bằng `venv/bin/python -m unittest discover -s tests -p test_pronunciation.py -v`.
Thư viện cần thiết đã ghi trong requirements.txt. Khi chuyển máy, sao chép checkpoint
local riêng trước khi dùng tính năng. Tính năng này không cần migration database.
