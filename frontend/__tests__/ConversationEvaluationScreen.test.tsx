import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { FlatList, Text } from 'react-native';
import { ConversationEvaluationScreen } from '../src/screens/ConversationEvaluationScreen';
import { AudioReplay } from '../src/services/audioReplay';
import {
  SessionEvaluation,
  speakingService,
} from '../src/services/speakingService';

jest.mock('../src/services/speakingService', () => ({
  speakingService: {
    evaluation: jest.fn(),
    evaluate: jest.fn(),
    messages: jest.fn(),
    audioPlayback: jest.fn(),
  },
}));
jest.mock('../src/services/audioReplay', () => ({ AudioReplay: jest.fn() }));
const player = { play: jest.fn(), stop: jest.fn(), close: jest.fn() };
const scored: SessionEvaluation = {
  status: 'completed',
  overall_score: 75.5,
  result: {
    assessment_status: 'scored',
    summary: 'Bạn diễn đạt được ý chính.',
    criteria: {
      grammar: {
        score: 80,
        feedback: 'Ngữ pháp tương đối tốt.',
        suggestion: 'Luyện quá khứ.',
      },
      vocabulary: {
        score: 75,
        feedback: 'Từ phù hợp.',
        suggestion: 'Thêm từ nối.',
      },
      naturalness: {
        score: 70,
        feedback: 'Cần tự nhiên hơn.',
        suggestion: 'Luyện cách nói lịch sự.',
      },
    },
    strengths: ['Nói rõ ý.'],
    next_steps: ['Luyện dạng quá khứ.'],
    items: [
      {
        kind: 'error',
        criterion: 'grammar',
        message_id: 'user-1',
        original: '行きたいでした',
        improved: '行きたかったです',
        explanation: 'Dùng quá khứ của たい.',
      },
    ],
  },
};
let tree: Renderer.ReactTestRenderer;
const transcript = jest.fn();
const back = jest.fn();
beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(speakingService.evaluation).mockResolvedValue(scored);
  jest.mocked(speakingService.evaluate).mockResolvedValue(scored);
  jest
    .mocked(AudioReplay)
    .mockImplementation(() => player as unknown as AudioReplay);
  player.close.mockResolvedValue(undefined);
  player.play.mockResolvedValue(true);
  jest
    .mocked(speakingService.audioPlayback)
    .mockResolvedValue({ url: 'http://audio/replay' });
  jest.mocked(speakingService.messages).mockResolvedValue({
    session: {
      id: 'session-1',
      status: 'completed',
      current_input_mode: 'voice',
    },
    has_more: false,
    next_sequence: 3,
    items: [
      {
        id: 'aoi-1',
        sequence_number: 1,
        speaker: 'assistant',
        input_mode: 'generated',
        content: 'どこに行きたいですか？',
        status: 'completed',
        occurred_at: '',
        audio: {
          id: 'aoi-audio',
          mime_type: 'audio/wav',
          size_bytes: 48044,
          duration_ms: 1000,
        },
      },
      {
        id: 'user-1',
        sequence_number: 2,
        speaker: 'user',
        input_mode: 'voice',
        content: '日本に行きたいでした。',
        status: 'completed',
        occurred_at: '',
        audio: {
          id: 'user-audio',
          mime_type: 'audio/wav',
          size_bytes: 96044,
          duration_ms: 1000,
        },
      },
      {
        id: 'user-2',
        sequence_number: 3,
        speaker: 'user',
        input_mode: 'text',
        content: 'ありがとうございます。',
        status: 'completed',
        occurred_at: '',
      },
    ],
  });
});
afterEach(async () => {
  await act(async () => tree?.unmount());
  jest.useRealTimers();
});
async function render() {
  await act(async () => {
    tree = Renderer.create(
      <ConversationEvaluationScreen
        sessionId="session-1"
        title="Phỏng vấn"
        onTranscript={transcript}
        onBack={back}
      />,
    );
  });
}
function text() {
  return tree.root
    .findAllByType(Text)
    .map(node => node.props.children)
    .flat(Infinity)
    .join(' ');
}
function button(label: string) {
  return tree.root.findAll(
    node =>
      node.props.accessibilityLabel === label &&
      typeof node.props.onPress === 'function',
  )[0];
}

test('renders cached scores and corrections without requesting another evaluation', async () => {
  await render();
  expect(text()).toContain('75.5');
  expect(text()).toContain('日本に行きたいでした。');
  expect(text()).not.toContain('行きたかったです');
  await act(async () =>
    button('Chỗ cần chỉnh sửa: 行きたいでした').props.onPress(),
  );
  expect(text()).toContain('行きたいでした');
  expect(text()).toContain('行きたかったです');
  expect(text()).toContain('Chưa đánh giá phát âm');
  expect(speakingService.evaluate).not.toHaveBeenCalled();
  await act(async () => button('Xem hội thoại').props.onPress());
  expect(transcript).toHaveBeenCalled();
});

test('only attaches feedback to the matching user message and expands one message at a time', async () => {
  jest.mocked(speakingService.evaluation).mockResolvedValueOnce({
    ...scored,
    result: {
      ...scored.result!,
      items: [
        ...scored.result!.items,
        {
          ...scored.result!.items[0],
          message_id: 'user-2',
          kind: 'alternative',
          original: 'ありがとうございます',
          improved: 'どうもありがとうございます',
          explanation: 'Thêm sắc thái cảm ơn.',
        },
        { ...scored.result!.items[0], message_id: 'aoi-1' },
        { ...scored.result!.items[0], message_id: 'missing' },
      ],
    },
  });
  await render();
  expect(tree.root.findAllByProps({ testID: 'feedback-aoi-1' })).toHaveLength(
    0,
  );
  expect(tree.root.findAllByProps({ testID: 'feedback-missing' })).toHaveLength(
    0,
  );
  await act(async () =>
    button('Chỗ cần chỉnh sửa: 行きたいでした').props.onPress(),
  );
  expect(text()).toContain('Vì sao?');
  expect(text()).toContain('行きたかったです');
  await act(async () =>
    button('Gợi ý cách nói tự nhiên hơn: ありがとうございます').props.onPress(),
  );
  expect(text()).not.toContain('行きたかったです');
  expect(text()).toContain('どうもありがとうございます');
  await act(async () =>
    button('Gợi ý cách nói tự nhiên hơn: ありがとうございます').props.onPress(),
  );
  expect(text()).not.toContain('どうもありがとうございます');
});

test('opens feedback from a related sentence link and keeps audio replay available', async () => {
  await render();
  await act(async () => button('Xem câu liên quan Ngữ pháp 1').props.onPress());
  expect(text()).toContain('行きたかったです');
  await act(async () => button('Nghe lại giọng của bạn').props.onPress());
  expect(speakingService.audioPlayback).toHaveBeenCalledWith(
    'session-1',
    'user-audio',
  );
  expect(player.play).toHaveBeenCalledWith(
    'http://audio/replay',
    expect.any(Function),
    true,
  );
  await act(async () => button('Về luyện nói').props.onPress());
  expect(player.stop).toHaveBeenCalled();
  expect(back).toHaveBeenCalled();
});

test('keeps unannotated sentences neutral and shows score details on demand', async () => {
  await render();
  expect(tree.root.findAllByProps({ testID: 'feedback-user-2' })).toHaveLength(
    0,
  );
  expect(text()).not.toContain('Ngữ pháp tương đối tốt.');
  await act(async () => button('Xem chi tiết điểm').props.onPress());
  expect(text()).toContain('Ngữ pháp tương đối tốt.');
  expect(text()).toContain('Nói rõ ý.');
});

test('does not jump to the end when score details or inline feedback change height', async () => {
  await render();
  const list = tree.root.findByType(FlatList);
  const scrollToEnd = jest.spyOn(list.instance, 'scrollToEnd');
  await act(async () => {
    button('Chỗ cần chỉnh sửa: 行きたいでした').props.onPress();
    list.props.onContentSizeChange(320, 1800);
    list.props.onLayout();
  });
  expect(scrollToEnd).not.toHaveBeenCalled();
  scrollToEnd.mockRestore();
});
test('creates the first evaluation once when no result exists', async () => {
  jest
    .mocked(speakingService.evaluation)
    .mockResolvedValueOnce({ status: 'not_started', result: null });
  await render();
  expect(speakingService.evaluate).toHaveBeenCalledTimes(1);
  expect(text()).toContain('Điểm tổng quan');
});
test('shows insufficient data without a zero score', async () => {
  const result = {
    ...scored.result!,
    assessment_status: 'insufficient_data' as const,
    items: [],
    strengths: [],
  };
  jest.mocked(speakingService.evaluation).mockResolvedValueOnce({
    status: 'insufficient_data',
    overall_score: null,
    result,
  });
  await render();
  expect(text()).toContain('Chưa đủ dữ liệu để chấm điểm');
  expect(text()).not.toContain('/ 100');
});
test('shows errors and retries explicitly', async () => {
  jest.mocked(speakingService.evaluation).mockResolvedValueOnce({
    status: 'failed',
    result: null,
    error: 'AI phản hồi quá lâu.',
  });
  await render();
  expect(text()).toContain('AI phản hồi quá lâu.');
  expect(speakingService.evaluate).not.toHaveBeenCalled();
  await act(async () => button('Thử phân tích lại').props.onPress());
  expect(speakingService.evaluate).toHaveBeenCalledTimes(1);
  expect(text()).toContain('75.5');
});
test('polls an existing attempt and stops polling when the screen closes', async () => {
  jest.useFakeTimers();
  jest
    .mocked(speakingService.evaluation)
    .mockResolvedValueOnce({ status: 'processing', result: null });
  await render();
  expect(text()).toContain('Đang phân tích hội thoại');
  expect(speakingService.evaluate).not.toHaveBeenCalled();
  await act(async () => jest.advanceTimersByTime(2000));
  expect(speakingService.evaluation).toHaveBeenCalledTimes(2);
  expect(text()).toContain('75.5');
  await act(async () => tree.unmount());
  await act(async () => jest.advanceTimersByTime(10000));
  expect(speakingService.evaluation).toHaveBeenCalledTimes(2);
});
