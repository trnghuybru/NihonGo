# Công thành Momo

Vào **Luyện tập → Game**, tạo hoặc nhập mã phòng chung tại /games. Các trò online dùng cùng /games/:code; đấu máy Momo riêng tại /games/bot.

## Chơi

- Đấu máy: dễ / vừa / khó; hoặc tạo/vào phòng online 1v1 trên hai thiết bị, mặc định mở chế độ online.
- Thành 100 HP. Tối đa 3 phút / 60 câu, mỗi câu 8–10 giây. Kết thúc theo HP, bằng nhau hòa.
- Bốn dạng: Kanji → cách đọc, cách đọc → Kanji, từ → nghĩa, nghĩa → từ.
- Mỗi bên một lần trả lời mỗi câu. Sai: mất combo, khóa 1 giây, ghi từ cần ôn. Cả hai đã trả lời hoặc hết giờ: xem đáp án 1 giây rồi chuyển câu.
- Đúng: gọi quân; trả lời sớm tăng HP, sức đánh và tốc độ tối đa 28%. Combo 3/5/10 mở Momo chiến binh/Momo tinh nhuệ/Momo thần tướng.
- Đủ 100 năng lượng: mưa tên gây 24 sát thương toàn bộ quân địch; khiên chặn sát thương thành 5 giây.
- Phím: mỗi người dùng 1–4 để chọn đáp án, Q/E dùng kỹ năng. Esc/chuyển tab chỉ tạm dừng khi đấu máy. Online tiếp tục trên server; mất heartbeat quá 20 giây hoặc rời trận sẽ tính bỏ cuộc. Tải lại trang trước thời hạn để vào lại phòng.

## Dữ liệu và lưu trữ

- data.ts: bộ khởi động N5 (81 từ), N4 (48 từ), N3/N2/N1 (20 từ mỗi cấp). Thêm dòng kanji|hiragana|nghĩa|chủ đề vào cấp tương ứng.
- Chọn chủ đề giới hạn từ được hỏi; đáp án nhiễu ưu tiên cùng chủ đề và lấy bổ sung từ cùng cấp.
- “Bài học của app” lấy kho thật qua GET /api/games/castle/words?level=N5&lesson_id=..., cần đăng nhập. Không gọi Gemini/Vertex. Bộ thiếu bốn đáp án khác nhau báo lỗi.
- Lưu kỷ lục theo cấp, thiết lập, tối đa 300 từ cần ôn, riêng từng tài khoản **trên thiết bị hiện tại**. Web dùng localStorage; native dùng Keychain. Kỷ lục/ôn từ trên thiết bị lưu riêng theo tài khoản, bao gồm đúng đội của mình khi chơi online. Phòng và trạng thái trận online lưu trên server.
- Điểm: đúng × 100 + combo cao nhất × 20 + HP còn lại × 5. Chỉ ghi khi trận kết thúc. Ôn đúng gỡ từ khỏi danh sách cần ôn.
- Online: chủ tạo phòng, chia sẻ link hoặc mã 6 ký tự, cả hai sẵn sàng, chủ bấm bắt đầu. Kho game tự nhận diện mã phòng Công thành hoặc giành mic/viết. Server chấm đáp án và mô phỏng quân/HP, client chỉ render và nội suy chuyển động; không gửi đáp án câu tiếp theo cho client. Game giành mic/viết nhiều người giữ luồng phòng riêng.

Giao diện theo design.md và token theme.ts. Artwork Momo samurai mới trong assets/games/momo-warriors-v1.png được dùng trong Canvas, SVG native, avatar và thẻ Công thành của Kho game. Atlas 2×2 chứa bốn trang phục theo combo; spriteFrame.ts giữ chung tọa độ cắt, MomoGameSprite.tsx dùng cho thumbnail/avatar. Prompt và nguồn tham chiếu ở assets/games/GENERATION.md.

## Cấu trúc

- engine.ts: luật, thời gian mô phỏng, bot, va chạm bước 20 ms, sát thương đồng thời.
- useCastleGame.ts: RAF/âm thanh/tiến trình cho đấu máy; hydrate snapshot và lưu kết quả theo đội của mình khi online. useCastleOnline.ts quản lý phòng, Socket.IO notification + polling dự phòng 750 ms.
- CastleScene.web.tsx + drawing.ts: Canvas RAF riêng, DPR tối đa 2, hạt có giới hạn; CastleScene.tsx là renderer SVG cho native.
- audio.ts: âm tổng hợp tại thiết bị; không tải nhạc ngoài.
- progress.\*: lưu theo nền tảng, phiên bản khóa nihongo.castle.v1.
- CastleGameScreen.tsx: menu, chọn bộ từ, gameplay, kết quả, ôn tập, thiết lập.

Kiểm tra:

    cd frontend
    npx jest --runInBand __tests__/CastleBattle.test.ts __tests__/VocabularyGameScreen.test.tsx
    npx tsc --noEmit
    npm run web:build

Backend: games/castle.py giữ luật online; castle_routes.py giữ API; dùng GameRoom hiện có với state.game=castle, không cần đổi schema/constraint. Dữ liệu seed server tại data/games/castle-starter.json, cùng 189 từ từ frontend data.ts. Khi cập nhật bộ từ, xuất lại JSON seed để hai chế độ đồng nhất.

Hướng mở rộng: ghép đối thủ tự động theo trình độ; boss raid hợp tác; bộ sưu tập ngoại hình quân.

## Phòng chung

Mã phòng mới thuộc party dùng chung Công thành / Giành mic / Đối kháng từ vựng. SharedGameRoomScreen giữ roster, chọn game, thiết lập và sẵn sàng; nút Về phòng chờ không rời party. Host áp dụng trò tiếp theo, code và room id vẫn nguyên. Socket/poll chuyển cả hai client sang engine tương ứng khi session.round tăng. sharedRoomService dùng /games/lobbies; các route riêng của game chỉ phục vụ gameplay và phòng cũ. Đấu máy vẫn độc lập tại /games/bot.
