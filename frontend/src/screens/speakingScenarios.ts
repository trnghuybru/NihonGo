export type ScenarioCategory = 'daily' | 'food' | 'travel' | 'work';
export type ScenarioLevel = 'N5' | 'N4' | 'N3';

export interface SpeakingScenario {
  id: string;
  title: string;
  japaneseTitle: string;
  category: ScenarioCategory;
  level: ScenarioLevel;
  minutes: number;
  description: string;
  setting: string;
  yourRole: string;
  partnerRole: string;
  goals: readonly string[];
  opening: string;
  openingTranslation: string;
  suggestedReply: string;
  suggestedReplyTranslation: string;
}

export const categoryLabels: Record<ScenarioCategory, string> = {
  daily: 'Đời sống',
  food: 'Ăn uống',
  travel: 'Du lịch',
  work: 'Công việc',
};

export const scenarioCategories: readonly {
  id: ScenarioCategory;
  description: string;
}[] = [
  { id: 'work', description: 'Giao tiếp trong môi trường làm việc.' },
  { id: 'daily', description: 'Những cuộc gặp gỡ thường ngày.' },
  { id: 'food', description: 'Gọi món và trao đổi tại quán.' },
  { id: 'travel', description: 'Hỏi đường và lưu trú ở Nhật.' },
];

export const scenarios: readonly SpeakingScenario[] = [
  {
    id: 'introduce-yourself',
    title: 'Làm quen bạn mới',
    japaneseTitle: 'はじめまして',
    category: 'daily',
    level: 'N5',
    minutes: 5,
    description: 'Chào hỏi và giới thiệu ngắn gọn về bản thân.',
    setting: 'Bạn gặp một người bạn mới tại lớp học tiếng Nhật.',
    yourRole: 'Học viên mới',
    partnerRole: 'Bạn cùng lớp',
    goals: [
      'Chào hỏi tự nhiên',
      'Nói tên và quê quán',
      'Hỏi tên người đối diện',
    ],
    opening: 'はじめまして！お名前は何ですか？',
    openingTranslation: 'Rất vui được gặp bạn! Bạn tên là gì?',
    suggestedReply: 'はじめまして。私はミンです。',
    suggestedReplyTranslation: 'Rất vui được gặp bạn. Mình là Minh.',
  },
  {
    id: 'convenience-store',
    title: 'Mua đồ ở cửa hàng tiện lợi',
    japaneseTitle: 'コンビニで買い物',
    category: 'daily',
    level: 'N5',
    minutes: 6,
    description: 'Hỏi giá, thanh toán và trả lời nhân viên.',
    setting: 'Bạn chọn một món đồ tại cửa hàng tiện lợi ở Nhật.',
    yourRole: 'Khách hàng',
    partnerRole: 'Nhân viên thu ngân',
    goals: ['Hỏi giá món đồ', 'Xác nhận số lượng', 'Thanh toán lịch sự'],
    opening: 'いらっしゃいませ。こちらはいかがですか？',
    openingTranslation: 'Xin chào quý khách. Bạn thấy món này thế nào?',
    suggestedReply: 'これを一つください。',
    suggestedReplyTranslation: 'Cho tôi một cái này.',
  },
  {
    id: 'order-food',
    title: 'Gọi món tại quán ăn',
    japaneseTitle: 'レストランで注文',
    category: 'food',
    level: 'N5',
    minutes: 7,
    description: 'Xem thực đơn, gọi món và hỏi món được gợi ý.',
    setting: 'Bạn vừa ngồi xuống một quán ăn nhỏ tại Tokyo.',
    yourRole: 'Thực khách',
    partnerRole: 'Nhân viên phục vụ',
    goals: ['Xin thực đơn', 'Gọi món mình thích', 'Hỏi món được gợi ý'],
    opening: 'いらっしゃいませ。ご注文はお決まりですか？',
    openingTranslation: 'Xin chào quý khách. Bạn đã chọn món chưa?',
    suggestedReply: 'おすすめは何ですか？',
    suggestedReplyTranslation: 'Món nào được gợi ý ạ?',
  },
  {
    id: 'order-coffee',
    title: 'Mua cà phê ở quán',
    japaneseTitle: 'カフェで注文',
    category: 'food',
    level: 'N5',
    minutes: 5,
    description: 'Chọn đồ uống, kích cỡ và hình thức mang đi.',
    setting: 'Bạn ghé một quán cà phê và gọi đồ tại quầy.',
    yourRole: 'Khách hàng',
    partnerRole: 'Nhân viên quán',
    goals: ['Gọi một đồ uống', 'Chọn kích cỡ', 'Nói muốn mang đi'],
    opening: 'いらっしゃいませ。ご注文をどうぞ。',
    openingTranslation: 'Xin chào quý khách. Bạn muốn gọi gì ạ?',
    suggestedReply: 'コーヒーを一つ、持ち帰りでお願いします。',
    suggestedReplyTranslation: 'Cho tôi một cà phê mang đi.',
  },
  {
    id: 'ask-directions',
    title: 'Hỏi đường đến nhà ga',
    japaneseTitle: '駅までの道を聞く',
    category: 'travel',
    level: 'N4',
    minutes: 8,
    description: 'Hỏi đường và xác nhận hướng đi bằng tiếng Nhật.',
    setting: 'Bạn cần tìm nhà ga gần nhất trong một khu phố lạ.',
    yourRole: 'Du khách',
    partnerRole: 'Người đi đường',
    goals: ['Mở lời lịch sự', 'Hỏi đường đến ga', 'Xác nhận lại lối đi'],
    opening: 'こんにちは。何かお困りですか？',
    openingTranslation: 'Xin chào. Bạn cần giúp gì không?',
    suggestedReply: 'すみません、駅はどこですか？',
    suggestedReplyTranslation: 'Xin lỗi, nhà ga ở đâu vậy?',
  },
  {
    id: 'hotel-check-in',
    title: 'Nhận phòng khách sạn',
    japaneseTitle: 'ホテルでチェックイン',
    category: 'travel',
    level: 'N4',
    minutes: 8,
    description: 'Nói tên đặt phòng và hỏi thông tin lưu trú.',
    setting: 'Bạn tới quầy lễ tân để nhận phòng đã đặt trước.',
    yourRole: 'Khách lưu trú',
    partnerRole: 'Lễ tân',
    goals: ['Báo tên đặt phòng', 'Xác nhận số đêm', 'Hỏi giờ trả phòng'],
    opening: 'いらっしゃいませ。ご予約のお名前をお願いします。',
    openingTranslation: 'Xin chào quý khách. Cho tôi xin tên đặt phòng.',
    suggestedReply: 'ミンの名前で予約しました。',
    suggestedReplyTranslation: 'Tôi đã đặt phòng dưới tên Minh.',
  },
  {
    id: 'schedule-meeting',
    title: 'Sắp xếp lịch họp',
    japaneseTitle: '会議の予定を決める',
    category: 'work',
    level: 'N4',
    minutes: 7,
    description: 'Trao đổi thời gian họp và xác nhận lịch phù hợp.',
    setting: 'Bạn cần hẹn đồng nghiệp trao đổi công việc tuần này.',
    yourRole: 'Nhân viên',
    partnerRole: 'Đồng nghiệp',
    goals: ['Đề xuất thời gian', 'Hỏi lịch rảnh', 'Xác nhận giờ họp'],
    opening: '今週、いつ会議ができますか？',
    openingTranslation: 'Tuần này khi nào chúng ta có thể họp?',
    suggestedReply: '木曜日の午後はいかがですか？',
    suggestedReplyTranslation: 'Chiều thứ Năm thì sao?',
  },
  {
    id: 'job-interview',
    title: 'Phỏng vấn việc làm',
    japaneseTitle: '仕事の面接',
    category: 'work',
    level: 'N3',
    minutes: 10,
    description: 'Giới thiệu kinh nghiệm và trả lời câu hỏi cơ bản.',
    setting: 'Bạn tham gia một buổi phỏng vấn làm thêm bằng tiếng Nhật.',
    yourRole: 'Ứng viên',
    partnerRole: 'Người phỏng vấn',
    goals: [
      'Giới thiệu bản thân',
      'Nói về kinh nghiệm',
      'Trình bày thời gian có thể làm',
    ],
    opening: '本日はよろしくお願いします。まず自己紹介をお願いします。',
    openingTranslation:
      'Rất mong được trao đổi hôm nay. Trước tiên hãy giới thiệu bản thân.',
    suggestedReply: 'こちらこそよろしくお願いします。私はミンと申します。',
    suggestedReplyTranslation:
      'Tôi cũng rất mong được trao đổi. Tôi tên là Minh.',
  },
];
