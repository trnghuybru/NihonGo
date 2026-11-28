import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { PronunciationPractice } from '../src/components/PronunciationPractice';
import { authenticatedRequest } from '../src/services/authService';
import { AudioReplay } from '../src/services/audioReplay';
let capture: ((chunk: string) => void) | undefined;
jest.mock('../src/services/liveAudio', () => ({
  LiveAudio: jest.fn().mockImplementation(() => ({
    prepare: jest.fn(),
    start: jest.fn(callback => {
      capture = callback;
    }),
    stop: jest.fn(),
    dispose: jest.fn(),
  })),
}));
jest.mock('../src/services/audioReplay', () => ({
  AudioReplay: jest.fn().mockImplementation(() => ({
    stop: jest.fn(),
    play: jest.fn().mockResolvedValue(true),
  })),
}));
jest.mock('../src/services/authService', () => ({
  authenticatedRequest: jest.fn(),
}));
let tree: Renderer.ReactTestRenderer;
beforeEach(() => jest.clearAllMocks());
const button = (label: string) =>
  tree.root.findAll(
    node =>
      node.props.accessibilityLabel === label &&
      typeof node.props.onPress === 'function',
  )[0];
afterEach(async () => {
  await act(async () => tree?.unmount());
});
test('records the chosen sentence and sends a WAV to the authenticated analyzer', async () => {
  jest.mocked(authenticatedRequest).mockResolvedValue({
    status: 'uncertain',
    reading: 'ガッコウ',
    message: 'Thử lại',
    note: 'Thử nghiệm',
    focus_phones: [],
  });
  await act(async () => {
    tree = Renderer.create(
      <PronunciationPractice sentence="学校へ行きます。" />,
    );
  });
  await act(async () => button('Thu âm câu này').props.onPress());
  expect(button('Dừng và xem góp ý')).toBeDefined();
  await act(async () => {
    capture?.('AAAAAA==');
  });
  await act(async () => button('Dừng và xem góp ý').props.onPress());
  expect(authenticatedRequest).toHaveBeenCalledWith(
    '/pronunciation/analyze',
    expect.objectContaining({
      text: '学校へ行きます。',
      audio: expect.stringMatching(/^UklGR/),
    }),
    'POST',
    { timeoutMs: 90000 },
  );
  expect(button('Nghe bản thu của tôi')).toBeDefined();
  const player = jest.mocked(AudioReplay).mock.results[0].value;
  await act(async () => button('Nghe bản thu của tôi').props.onPress());
  expect(player.play).toHaveBeenCalledWith(
    expect.stringMatching(/^data:audio\/wav;base64,UklGR/),
    expect.any(Function),
    true,
  );
  expect(button('Dừng nghe')).toBeDefined();
  await act(async () => button('Dừng nghe').props.onPress());
  expect(player.stop).toHaveBeenCalled();
  expect(button('Nghe bản thu của tôi')).toBeDefined();
  player.play.mockRejectedValueOnce(new Error('decode failed'));
  await act(async () => button('Nghe bản thu của tôi').props.onPress());
  expect(JSON.stringify(tree.toJSON())).toContain(
    'Chưa phát được bản thu. Hãy thử nghe lại.',
  );
});

test.each(['analyzed', 'uncertain'])(
  'shows readable sound feedback and preserves uncertainty: %s',
  async status => {
    jest.mocked(authenticatedRequest).mockResolvedValue({
      status,
      reading: 'カナ',
      message: 'Góp ý',
      note: 'Thử nghiệm',
      focus_phones: [],
      units: [
        { label: 'カ', phones: ['k', 'a'], position: 1, status: 'matched' },
        { label: 'ナ', phones: ['n', 'a'], position: 3, status: 'retry' },
      ],
    });
    await act(async () => {
      tree = Renderer.create(<PronunciationPractice sentence="かな" />);
    });
    await act(async () => button('Thu âm câu này').props.onPress());
    capture?.('AAAAAA==');
    await act(async () => button('Dừng và xem góp ý').props.onPress());
    const first =
      status === 'uncertain'
        ? 'カ, Chưa rõ, vị trí 1'
        : 'カ, Khớp mẫu, vị trí 1';
    const second =
      status === 'uncertain'
        ? 'ナ, Chưa rõ, vị trí 2'
        : 'ナ, Cần luyện lại, vị trí 2';
    expect(button(first)).toBeDefined();
    await act(async () => button(second).props.onPress());
    expect(JSON.stringify(tree.toJSON())).toContain(
      status === 'uncertain' ? 'Chưa đủ rõ để đối chiếu.' : 'Âm chưa khớp mẫu.',
    );
  },
);
