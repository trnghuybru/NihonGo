import {
  LearningOptions,
  LearningProfile,
} from '../src/services/learningService';

export const options: LearningOptions = {
  levels: [
    {
      id: 'beginner',
      label: 'Mới bắt đầu',
      description: 'Chưa học tiếng Nhật.',
    },
    { id: 'N5', label: 'N5 · Sơ cấp', description: 'Hiểu câu đơn giản.' },
    { id: 'N4', label: 'N4 · Cơ bản', description: 'Hiểu chủ đề quen thuộc.' },
  ],
  goals: [
    {
      id: 'communication',
      label: 'Giao tiếp hằng ngày',
      description: 'Giao tiếp.',
    },
    { id: 'jlpt', label: 'Ôn thi JLPT', description: 'Chuẩn bị thi.' },
  ],
  daily_minutes: [5, 10, 15, 30, 60],
};
export const profile: LearningProfile = {
  level: 'N5',
  goal: 'communication',
  daily_minutes: 15,
  level_source: 'manual',
  level_confirmed_at: 1,
  created_at: 1,
  updated_at: 1,
  version: 1,
};
