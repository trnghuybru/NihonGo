import { LearningLevelContext } from '../src/hooks/useLearningLevel';
import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { AccessibilityInfo, Text, TextInput } from 'react-native';
import { FlashcardScreen } from '../src/screens/FlashcardScreen';
import {
  ScreenBackHeaderContext,
  ScreenBackHeader,
} from '../src/components/ScreenBackHeader';
import {
  flashcardService,
  FlashcardSession,
} from '../src/services/flashcardService';

jest.mock('../src/services/flashcardService', () => ({
  flashcardService: {
    sessionFavorite: jest.fn().mockResolvedValue({ saved: false }),
    setSessionFavorite: jest.fn(),
    decks: jest.fn(),
    start: jest.fn(),
    session: jest.fn(),
    rate: jest.fn(),
    finish: jest.fn(),
    saveDeck: jest.fn(),
    deck: jest.fn(),
  },
}));
const initial: FlashcardSession = {
  id: 'session',
  kind: 'lesson',
  deck_id: 'lesson',
  title: 'Bài 1',
  cards: [
    { id: 'one', front: '学校', reading: 'がっこう', back: 'trường học' },
    { id: 'two', front: '人生', reading: 'じんせい', back: 'cuộc đời' },
  ],
  ratings: {},
  started_at: 1,
  finished_at: null,
  summary: {
    total: 2,
    studied: 0,
    counts: [0, 0, 0, 0],
    remembered: 0,
    remembered_percent: 0,
  },
};
let tree: Renderer.ReactTestRenderer;
const onExit = jest.fn();
function control(label: string) {
  return tree.root.findAll(
    node =>
      node.props.accessibilityLabel === label &&
      typeof node.props.onPress === 'function',
  )[0];
}
async function press(label: string) {
  await act(async () => control(label).props.onPress());
}
function text() {
  return tree.root
    .findAllByType(Text)
    .map(node =>
      React.Children.toArray(node.props.children)
        .filter(child => typeof child === 'string' || typeof child === 'number')
        .join(''),
    )
    .join('\n');
}
async function render() {
  await act(async () => {
    tree = Renderer.create(<FlashcardScreen onExit={onExit} />);
  });
}
async function type(label: string, value: string) {
  await act(async () =>
    tree.root
      .findAllByType(TextInput)
      .find(node => node.props.accessibilityLabel === label)!
      .props.onChangeText(value),
  );
}
beforeEach(() => {
  jest.clearAllMocks();
  jest
    .spyOn(AccessibilityInfo, 'isReduceMotionEnabled')
    .mockResolvedValue(true);
  jest.mocked(flashcardService.decks).mockResolvedValue({
    items: [
      {
        kind: 'lesson',
        id: 'lesson',
        title: 'Bài 1',
        subtitle: 'N5',
        card_count: 2,
      },
    ],
    pagination: { page: 1, total_pages: 1 },
    active_session: null,
  });
  jest.mocked(flashcardService.start).mockResolvedValue(initial);
});
afterEach(async () => {
  await act(async () => tree?.unmount());
  jest.restoreAllMocks();
});

test('allows grading either face, advances to a fresh front and renders server summary', async () => {
  const next: FlashcardSession = {
    ...initial,
    ratings: { one: 1 },
    summary: { ...initial.summary, studied: 1, counts: [0, 1, 0, 0] },
  };
  const finished: FlashcardSession = {
    ...next,
    ratings: { one: 1, two: 3 },
    finished_at: 5,
    summary: {
      total: 2,
      studied: 2,
      remembered: 1,
      remembered_percent: 50,
      counts: [0, 1, 0, 1],
    },
  };
  jest
    .mocked(flashcardService.rate)
    .mockResolvedValueOnce(next)
    .mockResolvedValueOnce(finished);
  await render();
  await press('Học bộ Bài 1');
  expect(text()).toContain('学校');
  expect(text()).not.toContain('trường học');
  for (const label of ['Chưa nhớ', 'Mơ hồ', 'Nhớ', 'Rất nhớ']) {
    expect(control(label).props.disabled).toBe(false);
    expect(control(label).props.accessibilityState.disabled).toBe(false);
  }
  await press('Mơ hồ');
  expect(flashcardService.rate).toHaveBeenCalledWith('session', 'one', 1);
  expect(text()).toContain('人生');
  expect(text()).not.toContain('cuộc đời');
  expect(control('Nhớ').props.disabled).toBe(false);
  await press('Lật thẻ');
  await press('Rất nhớ');
  expect(text()).toContain('Tổng kết phiên học');
  expect(text()).toContain('50% nhớ');
  expect(text()).toContain('2 / 2 thẻ đã học');
  expect(flashcardService.rate).toHaveBeenCalledTimes(2);
});

test('failed rating keeps the revealed card and does not advance', async () => {
  jest
    .mocked(flashcardService.rate)
    .mockRejectedValueOnce(new Error('Mất kết nối'));
  await render();
  await press('Học bộ Bài 1');
  await press('Lật thẻ');
  await press('Nhớ');
  expect(text()).toContain('Mất kết nối');
  expect(text()).toContain('trường học');
  expect(text()).not.toContain('人生');
});

test('each rating button shows only the current card FSRS interval without a calendar date', async () => {
  const now = Date.now();
  jest.mocked(flashcardService.start).mockResolvedValue({
    ...initial,
    rating_options: [60000, 330000, 600000, 8 * 86400000].map(
      (interval, grade) => ({ grade, due_at: now + interval }),
    ),
  });
  await render();
  await press('Học bộ Bài 1');
  for (const [index, label] of [
    'Chưa nhớ',
    'Mơ hồ',
    'Nhớ',
    'Rất nhớ',
  ].entries()) {
    const button = control(label);
    const values = button.findAllByType(Text).map(node => node.props.children);
    expect(values).toContain(['1 phút', '6 phút', '10 phút', '8 ngày'][index]);
    expect(
      values.some(
        value => typeof value === 'string' && /\d{2}\/\d{2}/.test(value),
      ),
    ).toBe(false);
    expect(button.props.disabled).toBe(false);
  }
  await press('Lật thẻ');
  expect(control('Rất nhớ').props.disabled).toBe(false);
});

test('favorites can be toggled on the current card without flipping or grading', async () => {
  jest
    .mocked(flashcardService.setSessionFavorite)
    .mockResolvedValueOnce({ saved: true })
    .mockResolvedValueOnce({ saved: false });
  await render();
  await press('Học bộ Bài 1');
  expect(flashcardService.sessionFavorite).toHaveBeenCalledWith(
    'session',
    'one',
  );
  await press('Yêu thích 学校');
  expect(flashcardService.setSessionFavorite).toHaveBeenLastCalledWith(
    'session',
    'one',
    true,
  );
  expect(control('Bỏ yêu thích 学校')).toBeDefined();
  expect(control('Lật thẻ')).toBeDefined();
  expect(control('Nhớ').props.disabled).toBe(false);
  expect(flashcardService.rate).not.toHaveBeenCalled();
  await press('Bỏ yêu thích 学校');
  expect(flashcardService.setSessionFavorite).toHaveBeenLastCalledWith(
    'session',
    'one',
    false,
  );
});

test('custom decks validate fields and save the final draft without an extra add click', async () => {
  jest
    .mocked(flashcardService.saveDeck)
    .mockResolvedValue({ id: 'custom', title: 'Ôn tập', cards: [] });
  await render();
  await press('Tạo bộ thẻ');
  await press('Lưu bộ thẻ');
  expect(flashcardService.saveDeck).not.toHaveBeenCalled();
  await type('Tên bộ thẻ', 'Ôn tập');
  await type('Mặt trước của thẻ', '学校');
  await type('Cách đọc của thẻ', 'がっこう');
  await type('Mặt sau của thẻ', 'trường học');
  await press('Lưu bộ thẻ');
  expect(flashcardService.saveDeck).toHaveBeenCalledWith(
    'Ôn tập',
    [{ front: '学校', reading: 'がっこう', back: 'trường học' }],
    undefined,
  );
  expect(flashcardService.decks).toHaveBeenLastCalledWith('custom', 'N5', 1);
});

test('bulk preview must be added before saving and preserves the single-card draft', async () => {
  jest
    .mocked(flashcardService.saveDeck)
    .mockResolvedValue({ id: 'custom', title: 'Ôn tập', cards: [] });
  await render();
  await press('Tạo bộ thẻ');
  await type('Tên bộ thẻ', 'Ôn tập');
  await type('Mặt trước của thẻ', '勉強');
  await type('Mặt sau của thẻ', 'học tập');
  await press('Nhập hàng loạt');
  await type(
    'Dữ liệu nhập hàng loạt',
    '学校\ttrường học\n人生\tじんせい\tcuộc đời',
  );
  await press('Lưu bộ thẻ');
  expect(flashcardService.saveDeck).not.toHaveBeenCalled();
  expect(text()).toContain('Thêm các thẻ đang xem trước vào bộ trước khi lưu.');
  await press('Thêm 2 thẻ vào bộ');
  expect(control('Thêm 0 thẻ vào bộ').props.disabled).toBe(true);
  await press('Lưu bộ thẻ');
  expect(flashcardService.saveDeck).toHaveBeenCalledWith(
    'Ôn tập',
    [
      { front: '学校', reading: '', back: 'trường học' },
      { front: '人生', reading: 'じんせい', back: 'cuộc đời' },
      { front: '勉強', reading: '', back: 'học tập' },
    ],
    undefined,
  );
});

test('bulk import does not add valid rows when another row needs correction', async () => {
  await render();
  await press('Tạo bộ thẻ');
  await press('Nhập hàng loạt');
  await type('Dữ liệu nhập hàng loạt', '学校\ttrường học\n人生');
  expect(control('Thêm 1 thẻ vào bộ').props.disabled).toBe(true);
  await press('Thêm 1 thẻ vào bộ');
  expect(text()).toContain('0 thẻ đã thêm');
  expect(text()).toContain('Dòng 2: cần 2 hoặc 3 cột.');
  await type('Dữ liệu nhập hàng loạt', '学校,trường học;人生,cuộc đời');
  await press('Dấu phẩy');
  await press('Dấu chấm phẩy');
  expect(control('Thêm 2 thẻ vào bộ').props.disabled).toBe(false);
  await press('Thêm 2 thẻ vào bộ');
  expect(text()).toContain('2 thẻ đã thêm');
});

test('resuming a session starts at the first unrated card and supports ending early', async () => {
  const resumed = {
    ...initial,
    ratings: { one: 2 },
    summary: {
      ...initial.summary,
      studied: 1,
      remembered: 1,
      remembered_percent: 100,
      counts: [0, 0, 1, 0],
    },
  };
  jest.mocked(flashcardService.decks).mockResolvedValue({
    items: [],
    pagination: { page: 1, total_pages: 0 },
    active_session: { id: 'session', title: 'Bài 1', studied: 1, total: 2 },
  });
  jest.mocked(flashcardService.session).mockResolvedValue(resumed);
  jest
    .mocked(flashcardService.finish)
    .mockResolvedValue({ ...resumed, finished_at: 5 });
  await render();
  await press('Tiếp tục phiên học');
  expect(text()).toContain('人生');
  expect(control('Nhớ').props.disabled).toBe(false);
  await press('Kết thúc phiên học');
  expect(text()).toContain('1 / 2 thẻ đã học');
  expect(text()).toContain('100% nhớ');
});

test('hiding the flashcard screen removes its desktop header', async () => {
  const setHeader = jest.fn();
  await act(async () => {
    tree = Renderer.create(
      <ScreenBackHeaderContext.Provider value={setHeader}>
        <FlashcardScreen onExit={onExit} />
      </ScreenBackHeaderContext.Provider>,
    );
  });
  expect(tree.root.findAllByType(ScreenBackHeader)).toHaveLength(1);
  await act(async () =>
    tree.update(
      <ScreenBackHeaderContext.Provider value={setHeader}>
        <FlashcardScreen onExit={onExit} active={false} />
      </ScreenBackHeaderContext.Provider>,
    ),
  );
  expect(tree.root.findAllByType(ScreenBackHeader)).toHaveLength(0);
  expect(setHeader).toHaveBeenLastCalledWith(null);
});

test('uses the profile level for available decks and still allows changing it', async () => {
  await act(async () => {
    tree = Renderer.create(
      <LearningLevelContext.Provider value="N2">
        <FlashcardScreen onExit={onExit} />
      </LearningLevelContext.Provider>,
    );
  });
  expect(flashcardService.decks).toHaveBeenLastCalledWith('lesson', 'N2', 1);
  await press('Flashcard N4');
  expect(flashcardService.decks).toHaveBeenLastCalledWith('lesson', 'N4', 1);
});
