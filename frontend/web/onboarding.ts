export type GuideStep = {
  title: string;
  description: string;
  selectors?: readonly string[];
};

export const featureGuides = [
  {
    id: 'listening',
    label: 'Nghe',
    symbol: '聴',
    path: '/practice/listening',
    summary: 'YouTube, phụ đề & shadowing',
    steps: [
      {
        title: 'Chọn một video để luyện nghe',
        description:
          'Mở video trong thư viện, nghe từng đoạn và đọc theo phụ đề. Bạn có thể nghe lại, giảm tốc độ và lặp đoạn để luyện shadowing.',
        selectors: ['[data-testid="tour-listening-library"]'],
      },
      {
        title: 'Thêm video bạn yêu thích',
        description:
          'Chọn “Thêm video YouTube”, dán đường link và chờ xử lý. Trong bản beta, mỗi người được xử lý hoặc dịch 1 video mới mỗi ngày; bạn vẫn có thể học lại video đã có.',
        selectors: [
          '[aria-label="+ Thêm video YouTube"]',
          '[aria-label="Link YouTube"]',
        ],
      },
      {
        title: 'Nghe, hiểu rồi kiểm tra lại',
        description:
          'Trong bài nghe, thử các mục Phụ đề, Bản dịch và Câu hỏi AI. Bấm vào từ trong phụ đề để tra nghĩa ngay khi học.',
      },
    ],
  },
  {
    id: 'speaking',
    label: 'Nói',
    symbol: '話',
    path: '/practice/speaking',
    summary: 'Trò chuyện Live cùng Aoi 3D',
    steps: [
      {
        title: 'Bắt đầu một cuộc trò chuyện',
        description:
          'Chọn “Cuộc trò chuyện mới”, tìm tình huống phù hợp với trình độ rồi chọn vai cho AI. Bạn có thể bật lưu âm thanh để nghe lại sau.',
        selectors: ['[aria-label="Cuộc trò chuyện mới"]'],
      },
      {
        title: 'Nói trực tiếp với Aoi',
        description:
          'Bắt đầu Live và cho phép trình duyệt dùng micro. Giữ nút micro để nói tiếng Nhật, thả ra để Aoi trả lời bằng giọng. Mỗi ngày có 2 phiên Live, tối đa 4 phút mỗi phiên.',
      },
      {
        title: 'Xem lại để tiến bộ',
        description:
          'Sau buổi nói, quay lại lịch sử để xem hội thoại và nghe lại âm thanh nếu bạn đã bật lưu. Hãy kết thúc phiên khi không sử dụng.',
      },
    ],
  },
  {
    id: 'reading',
    label: 'Đọc',
    symbol: '読',
    path: '/practice/reading',
    summary: 'Bài đọc, furigana & tra từ',
    steps: [
      {
        title: 'Tìm bài phù hợp với bạn',
        description:
          'Tìm theo tiêu đề hoặc mở Bộ lọc để chọn trình độ JLPT và dạng bài. Chọn một bài trong thư viện để bắt đầu.',
        selectors: [
          '[aria-label="Tìm bài đọc"]',
          '[aria-label="Bộ lọc bài đọc"]',
        ],
      },
      {
        title: 'Đọc hiểu theo nhịp của bạn',
        description:
          'Trong bài đọc, bật hoặc tắt furigana và bấm vào từ chưa biết để tra nghĩa. Đọc xong, thử các câu hỏi của bài để kiểm tra mức độ hiểu.',
      },
    ],
  },
  {
    id: 'writing',
    label: 'Viết',
    symbol: '書',
    path: '/practice/writing',
    summary: 'Viết bài & nhận góp ý AI',
    steps: [
      {
        title: 'Chọn đề và bắt đầu viết',
        description:
          'Bấm “Bắt đầu viết” để chọn đề theo trình độ, hoặc viết theo ý của bạn. Bạn có thể lưu bản nháp và quay lại viết tiếp.',
        selectors: ['[data-testid="tour-writing-start"]'],
      },
      {
        title: 'Nộp bài và đọc góp ý',
        description:
          'Khi sẵn sàng, bấm “Nộp bài” để nhận phân tích từ AI. Xem bài đã nộp, sửa lại và so sánh các phiên bản để theo dõi sự tiến bộ.',
        selectors: ['[aria-label="Bài đã nộp"]'],
      },
    ],
  },
  {
    id: 'lookup',
    label: 'Tra cứu',
    symbol: '辞',
    path: '/lookup',
    summary: 'Từ vựng, Kanji & viết tay',
    steps: [
      {
        title: 'Tra từ theo cách của bạn',
        description:
          'Nhập từ muốn tìm và chọn loại tra cứu phù hợp: từ vựng, Hán tự hoặc ví dụ video. Bạn cũng có thể mở Viết tay để tìm Kanji bằng nét vẽ.',
        selectors: ['[data-testid="dictionary-toolbar"]'],
      },
      {
        title: 'Hiểu từ trong ngữ cảnh',
        description:
          'Mở một kết quả để xem nghĩa, cách đọc, ví dụ và thông tin Kanji. Với từ muốn ôn lại, dùng chức năng lưu vào flashcard trong phần chi tiết.',
      },
    ],
  },
  {
    id: 'lessons',
    label: 'Bài học',
    symbol: '学',
    path: '/lessons',
    summary: 'Từ vựng theo giáo trình',
    steps: [
      {
        title: 'Học từ theo từng bài',
        description:
          'Chọn trình độ và giáo trình, rồi mở một bài học để xem danh sách từ. Nghe cách đọc, xem nghĩa và ví dụ trước khi chuyển sang bài tiếp theo.',
        selectors: ['[aria-label="Trình độ JLPT"]'],
      },
      {
        title: 'Kết hợp học và ôn tập',
        description:
          'Lưu những từ cần nhớ vào flashcard. Những lần sau, quay lại Flashcard để ôn thay vì chỉ đọc lại danh sách từ.',
      },
    ],
  },
  {
    id: 'flashcards',
    label: 'Flashcard',
    symbol: '覚',
    path: '/flashcards',
    summary: 'Ôn từ theo mức độ ghi nhớ',
    steps: [
      {
        title: 'Chọn hoặc tạo một bộ thẻ',
        description:
          'Chọn bộ thẻ có sẵn theo trình độ hoặc bấm “Tạo bộ thẻ” để xây dựng bộ từ của riêng bạn.',
        selectors: [
          '[aria-label="Tạo bộ thẻ"]',
          '[data-testid="flashcard-deck-grid"]',
        ],
      },
      {
        title: 'Lật thẻ và đánh giá mức nhớ',
        description:
          'Thử nhớ nghĩa trước khi lật thẻ. Sau đó chọn mức độ ghi nhớ thật của bạn để hệ thống sắp lịch ôn phù hợp. Bạn có thể tiếp tục phiên đang học khi quay lại.',
      },
    ],
  },
  {
    id: 'games',
    label: 'Game từ vựng',
    symbol: '遊',
    path: '/games',
    summary: 'Cùng bạn bè học và thi đấu',
    steps: [
      {
        title: 'Vào phòng cùng bạn bè',
        description:
          'Nhập mã phòng được chia sẻ, hoặc tạo phòng mới rồi gửi mã cho bạn học. Hãy dùng hai tài khoản khác nhau khi chơi cùng nhau.',
        selectors: ['[aria-label="Mã phòng"]', '[aria-label="Vào phòng"]'],
      },
      {
        title: 'Chọn cách chơi',
        description:
          'Khi tạo phòng, chọn chế độ, nguồn từ vựng và thời gian. Với chế độ Đọc, cho phép micro, chờ tới lượt và đọc rõ để hệ thống chấm điểm.',
        selectors: ['[aria-label="Mode chơi"]'],
      },
    ],
  },
] as const;

export type FeatureGuide = (typeof featureGuides)[number];
export const listeningLessonGuide = {
  id: 'listening-lesson',
  label: 'Trong bài nghe',
  readySelector: '[data-testid="tour-listening-lesson"]',
  steps: [
    {
      title: 'Bắt đầu từ video',
      description:
        'Bấm nút phát trên video để bắt đầu nghe. Phụ đề bên dưới sẽ đi theo lời thoại; bạn có thể tạm dừng bất cứ lúc nào để luyện lại.',
      selectors: ['[data-testid="tour-listening-player"]'],
    },
    {
      title: 'Bấm vào từ ngay trong câu',
      description:
        'Đây là câu đang được phát. Bấm một từ trong phụ đề để xem nghĩa; đóng phần tra cứu để tiếp tục. Nút hình con mắt giúp ẩn phụ đề khi bạn muốn tự thử sức.',
      selectors: [
        '[data-testid="shadowing-current-caption"]',
        '[aria-label="Hiện phụ đề"]',
      ],
    },
    {
      title: 'Nghe lại và đọc theo',
      description:
        'Dùng Nghe lại để phát lại câu hiện tại, hoặc hai mũi tên để chuyển câu. Mở nút ••• để chỉnh tốc độ và bật Lặp đoạn; nghe rồi đọc theo giọng trong video.',
      selectors: ['[data-testid="tour-listening-playback"]'],
    },
    {
      title: 'Theo dõi toàn bộ phụ đề',
      description:
        'Nút Phụ đề mở hoặc đóng danh sách câu. Chọn nút phát cạnh một câu để nhảy đến đoạn đó. Bật nút mũi tên xuống để danh sách tự cuộn theo video.',
      selectors: ['[aria-label="Phụ đề"]', '[aria-label="Theo dõi phụ đề"]'],
    },
    {
      title: 'Mở bản dịch khi cần',
      description:
        'Bấm Bản dịch để hiện nghĩa tiếng Việt của các câu. Bạn nên nghe và đoán trước, rồi mới mở bản dịch để đối chiếu. Hãy chờ xử lý thay vì bấm gửi lại liên tục.',
      selectors: ['[aria-label="Bản dịch"]'],
    },
    {
      title: 'Kiểm tra bằng câu hỏi AI',
      description:
        'Bấm Câu hỏi AI để thiết lập bài kiểm tra. Khi luyện, câu hỏi có thể xuất hiện ở các mốc trong video; chọn đáp án rồi tiếp tục nghe. Bạn luôn có thể mở ? → Hướng dẫn bài nghe này để xem lại.',
      selectors: ['[aria-label="Câu hỏi AI"]'],
    },
  ],
} as const;
export const allGuides = [...featureGuides, listeningLessonGuide];
export type Guide = (typeof allGuides)[number];
export type GuideId = 'welcome' | Guide['id'];
export type GuideProgress = Partial<Record<GuideId, true>>;
const knownIds = new Set<string>([
  'welcome',
  ...allGuides.map(guide => guide.id),
]);

// Per-account and versioned: shared browsers must not share onboarding progress.
export function guideStorageKey(accountId: string) {
  return `nihongo:onboarding:v1:${accountId}`;
}

export function readGuideProgress(
  storage: Pick<Storage, 'getItem'>,
  accountId: string,
): GuideProgress {
  try {
    const value: unknown = JSON.parse(
      storage.getItem(guideStorageKey(accountId)) || '{}',
    );
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    return Object.fromEntries(
      Object.entries(value).filter(
        ([key, done]) => knownIds.has(key) && done === true,
      ),
    );
  } catch {
    return {};
  }
}

export function saveGuideProgress(
  storage: Pick<Storage, 'setItem'>,
  accountId: string,
  progress: GuideProgress,
) {
  try {
    storage.setItem(guideStorageKey(accountId), JSON.stringify(progress));
    return true;
  } catch {
    // Private browsing or full storage must never block studying.
    return false;
  }
}

// The listening lesson has its own first-entry tour, separate from the library.
// Other ongoing activities (especially Live and games) have no automatic tour.
export function guideForPath(pathname: string): Guide | undefined {
  if (/^\/practice\/listening\/[^/]+$/.test(pathname))
    return listeningLessonGuide;
  return featureGuides.find(guide => guide.path === pathname);
}
