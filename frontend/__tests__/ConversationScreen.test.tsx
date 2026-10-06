import React from 'react';
import { Text, TextInput } from 'react-native';
import Renderer, { act } from 'react-test-renderer';
import { AuthButton } from '../src/components/AuthForm';
import { ApiError } from '../src/services/apiClient';
import { ConversationScreen } from '../src/screens/ConversationScreen';
import {
  StartedSession,
  TurnReply,
  speakingService,
} from '../src/services/speakingService';
import { voiceService, VoiceCallbacks } from '../src/services/voiceService';
import { ttsService } from '../src/services/ttsService';

jest.mock('../src/services/speakingService', () => ({
  speakingService: { messages: jest.fn(), send: jest.fn() },
}));
jest.mock('../src/services/voiceService', () => ({
  voiceService: {
    init: jest.fn(),
    isAvailable: jest.fn(),
    start: jest.fn(),
    stop: jest.fn(),
    cancel: jest.fn(),
    destroy: jest.fn(),
  },
}));
jest.mock('../src/services/ttsService', () => ({
  ttsService: {
    init: jest.fn(),
    setLanguage: jest.fn(),
    isAvailable: jest.fn(),
    stop: jest.fn(),
    feedToken: jest.fn(),
    flush: jest.fn(),
  },
}));
const opening: NonNullable<StartedSession['opening_message']> = {
  id: 'opening',
  sequence_number: 1,
  speaker: 'assistant',
  input_mode: 'generated',
  content: 'こんにちは！',
  status: 'completed',
  occurred_at: '2026-10-01T13:00:00Z',
};
const result: StartedSession = {
  session: {
    id: 'session-1',
    scenario_id: 'scenario-1',
    scenario_role_id: 'role-1',
    status: 'active',
    current_input_mode: 'text',
    audio_storage_enabled: false,
    started_at: '2026-10-01T13:00:00Z',
    accumulated_active_ms: 0,
  },
  scenario: {
    id: 'scenario-1',
    title: 'Làm quen',
    description: 'Giao tiếp',
    language_code: 'ja-JP',
    difficulty_level: 'N5',
    estimated_duration_minutes: 5,
    category: { id: 'category-1', name: 'Đời sống', description: null },
    context: 'Lớp học',
    learning_objectives: 'Chào hỏi',
    role: {
      id: 'role-1',
      name: 'Bạn cùng lớp',
      description: 'Bạn mới',
      opening_message: 'OPENING FROM START RESPONSE',
    },
  },
  opening_message: opening,
};
const reply: TurnReply = {
  user_message: {
    ...opening,
    id: 'user-msg',
    sequence_number: 2,
    speaker: 'user',
    input_mode: 'text',
    content: '私はミンです',
  },
  assistant_message: {
    ...opening,
    id: 'assistant-msg',
    sequence_number: 3,
    content: 'よろしくお願いします！',
  },
};
let callbacks: VoiceCallbacks;
let tree: Renderer.ReactTestRenderer;
const onBack = jest.fn();
beforeEach(() => {
  jest.clearAllMocks();
  Object.values(speakingService).forEach(method =>
    jest.mocked(method).mockReset(),
  );
  jest.mocked(speakingService.messages).mockResolvedValue({
    items: [opening],
    session: {
      id: result.session.id,
      status: 'active',
      current_input_mode: 'text',
    },
    has_more: false,
    next_sequence: 1,
  });
  jest.mocked(speakingService.send).mockResolvedValue(reply);
  jest.mocked(voiceService.init).mockImplementation(value => {
    callbacks = value;
  });
  jest.mocked(voiceService.isAvailable).mockReturnValue(true);
  jest.mocked(voiceService.start).mockImplementation(async () => {
    callbacks.onStart?.();
  });
  jest.mocked(voiceService.stop).mockResolvedValue(undefined);
  jest.mocked(voiceService.cancel).mockResolvedValue(undefined);
  jest.mocked(voiceService.destroy).mockResolvedValue(undefined);
  jest.mocked(ttsService.init).mockResolvedValue(undefined);
  jest.mocked(ttsService.isAvailable).mockReturnValue(true);
});
afterEach(async () => {
  await act(async () => tree?.unmount());
});
async function render(mode: 'text' | 'voice' = 'text') {
  await act(async () => {
    tree = Renderer.create(
      <ConversationScreen
        result={{
          ...result,
          session: { ...result.session, current_input_mode: mode },
        }}
        onBack={onBack}
      />,
    );
  });
}
function button(label: string) {
  return (
    tree.root
      .findAllByType(AuthButton)
      .find(node => node.props.label === label) ||
    tree.root.findAll(
      node =>
        node.props.accessibilityLabel === label &&
        typeof node.props.onPress === 'function',
    )[0]
  );
}
async function press(label: string) {
  await act(async () => {
    await button(label).props.onPress();
  });
}
function text() {
  return JSON.stringify(
    tree.root.findAllByType(Text).map(node => node.props.children),
  );
}
async function input(value: string) {
  await act(async () =>
    tree.root.findByType(TextInput).props.onChangeText(value),
  );
}

test('loads saved transcript and renders a text reply only after database response', async () => {
  await render();
  expect(speakingService.messages).toHaveBeenCalledWith('session-1', 0);
  expect(text()).toContain('こんにちは');
  expect(text()).not.toContain('OPENING FROM START RESPONSE');
  expect(button('Gửi tin nhắn').props.disabled).toBe(true);
  await input('私はミンです');
  await press('Gửi tin nhắn');
  expect(speakingService.send).toHaveBeenCalledWith('session-1', {
    request_id: expect.stringMatching(/^[0-9a-f-]{36}$/),
    content: '私はミンです',
    input_mode: 'text',
  });
  expect(text()).toContain('よろしくお願いします');
  expect(tree.root.findByType(TextInput).props.value).toBe('');
  expect(ttsService.feedToken).not.toHaveBeenCalled();
});

test('recovers a reply already saved by the backend when the POST response is lost', async () => {
  await render();
  jest
    .mocked(speakingService.send)
    .mockRejectedValueOnce(new Error('Network request failed'));
  jest.mocked(speakingService.messages).mockImplementationOnce(async () => {
    const sentTurn = jest.mocked(speakingService.send).mock.calls[0][1];
    return {
      items: [
        opening,
        { ...reply.user_message, id: sentTurn.request_id },
        reply.assistant_message,
      ],
      session: {
        id: result.session.id,
        status: 'active',
        current_input_mode: 'text',
      },
      has_more: false,
      next_sequence: 3,
    };
  });
  await input('私はミンです');
  await press('Gửi tin nhắn');
  expect(text()).toContain('よろしくお願いします');
  expect(text()).not.toContain('Network request failed');
  expect(speakingService.send).toHaveBeenCalledTimes(1);
  expect(tree.root.findByType(TextInput).props.value).toBe('');
  expect(
    tree.root
      .findAllByType(AuthButton)
      .some(node => node.props.label === 'Thử lại'),
  ).toBe(false);
});

test('waits for a late saved reply after the POST times out without resending', async () => {
  jest.useFakeTimers();
  try {
    await render();
    jest
      .mocked(speakingService.send)
      .mockRejectedValueOnce(new Error('Network request failed'));
    let reads = 0;
    jest.mocked(speakingService.messages).mockImplementation(async () => {
      const sentTurn = jest.mocked(speakingService.send).mock.calls[0][1];
      reads += 1;
      return {
        items: [
          opening,
          { ...reply.user_message, id: sentTurn.request_id },
          {
            ...reply.assistant_message,
            status: reads === 1 ? 'pending' : 'completed',
            content: reads === 1 ? '' : reply.assistant_message.content,
          },
        ],
        session: {
          id: result.session.id,
          status: 'active',
          current_input_mode: 'text',
        },
        has_more: false,
        next_sequence: 3,
      };
    });
    await input('私はミンです');
    let sending!: Promise<void>;
    await act(async () => {
      sending = button('Gửi tin nhắn').props.onPress();
    });
    expect(reads).toBe(1);
    await act(async () => {
      jest.advanceTimersByTime(1000);
      await sending;
    });
    expect(reads).toBe(2);
    expect(speakingService.send).toHaveBeenCalledTimes(1);
    expect(text()).toContain('よろしくお願いします');
    expect(text()).not.toContain('Network request failed');
    expect(tree.root.findByType(TextInput).props.value).toBe('');
  } finally {
    await act(async () => tree.unmount());
    jest.useRealTimers();
  }
});

test('checks saved replies even when a retry receives a rate-limit error', async () => {
  await render();
  jest
    .mocked(speakingService.send)
    .mockRejectedValueOnce(
      new ApiError('Too many requests', 429, 'rate_limited', 30),
    );
  jest.mocked(speakingService.messages).mockImplementationOnce(async () => ({
    items: [
      opening,
      {
        ...reply.user_message,
        id: jest.mocked(speakingService.send).mock.calls[0][1].request_id,
      },
      reply.assistant_message,
    ],
    session: {
      id: result.session.id,
      status: 'active',
      current_input_mode: 'text',
    },
    has_more: false,
    next_sequence: 3,
  }));
  await input('私はミンです');
  await press('Gửi tin nhắn');
  expect(text()).toContain('よろしくお願いします');
  expect(text()).not.toContain('Too many requests');
  expect(speakingService.send).toHaveBeenCalledTimes(1);
});

test('waits for provider Retry-After and retries with the same message identifier', async () => {
  jest.useFakeTimers();
  try {
    await render();
    jest
      .mocked(speakingService.send)
      .mockRejectedValueOnce(
        new ApiError(
          'Model AI đang bị giới hạn lượt gọi.',
          429,
          'ai_rate_limited',
          3,
        ),
      );
    await input('私はミンです');
    await press('Gửi tin nhắn');
    const values = jest.mocked(speakingService.send).mock.calls[0][1];
    expect(text()).toContain('Model AI đang bị giới hạn lượt gọi');
    expect(button('Thử lại sau 3 giây').props.disabled).toBe(true);
    await press('Thử lại sau 3 giây');
    expect(speakingService.send).toHaveBeenCalledTimes(1);
    await act(async () => jest.advanceTimersByTime(3000));
    await press('Thử lại');
    expect(speakingService.send).toHaveBeenLastCalledWith(
      result.session.id,
      values,
    );
    expect(text()).toContain('よろしくお願いします');
  } finally {
    await act(async () => tree.unmount());
    jest.useRealTimers();
  }
});

test('transcribes voice, lets the learner review it, and reads the persisted AI reply', async () => {
  await render('voice');
  await press('Bắt đầu thu giọng nói');
  expect(voiceService.start).toHaveBeenCalledWith('ja-JP');
  await act(async () => callbacks.onPartialResults?.('私は'));
  expect(tree.root.findByType(TextInput).props.value).toBe('私は');
  expect(speakingService.send).not.toHaveBeenCalled();
  await act(async () => callbacks.onFinalResults?.('私はミンです'));
  await press('Gửi tin nhắn');
  expect(speakingService.send).toHaveBeenCalledWith(
    'session-1',
    expect.objectContaining({ input_mode: 'voice', content: '私はミンです' }),
  );
  expect(ttsService.feedToken).toHaveBeenCalledWith(
    reply.assistant_message.content,
  );
  expect(ttsService.flush).toHaveBeenCalled();
});

test('retries a failed turn with the same request ID and retains the draft', async () => {
  jest
    .mocked(speakingService.send)
    .mockRejectedValueOnce(new Error('AI không phản hồi'));
  await render();
  await input('私はミンです');
  await press('Gửi tin nhắn');
  expect(text()).toContain('AI không phản hồi');
  expect(text()).not.toContain('よろしくお願いします');
  expect(tree.root.findByType(TextInput).props.value).toBe('私はミンです');
  const original = jest.mocked(speakingService.send).mock.calls[0][1];
  await press('Thử lại');
  expect(jest.mocked(speakingService.send).mock.calls[1][1]).toEqual(original);
  expect(text()).toContain('よろしくお願いします');
});

test('reconstructs a failed turn from database messages when reopening the screen', async () => {
  jest.mocked(speakingService.messages).mockResolvedValueOnce({
    items: [
      opening,
      reply.user_message,
      { ...reply.assistant_message, content: '', status: 'failed' },
    ],
    session: {
      id: 'session-1',
      status: 'active',
      current_input_mode: 'text',
    },
    has_more: false,
    next_sequence: 3,
  });
  await render();
  expect(text()).toContain('xxx');
  await press('Thử lại');
  expect(speakingService.send).toHaveBeenCalledWith('session-1', {
    request_id: reply.user_message.id,
    content: reply.user_message.content,
    input_mode: 'text',
  });
});

test('shows microphone errors and permits switching to text without inventing content', async () => {
  jest.mocked(voiceService.isAvailable).mockReturnValue(false);
  await render('voice');
  await press('Bắt đầu thu giọng nói');
  expect(text()).toContain('Nhận dạng giọng nói chưa khả dụng');
  expect(voiceService.start).not.toHaveBeenCalled();
  const option = tree.root.findAll(
    node =>
      node.props.accessibilityLabel === 'Văn bản' &&
      typeof node.props.onPress === 'function',
  )[0];
  await act(async () => option.props.onPress());
  await input('こんにちは');
  await press('Gửi tin nhắn');
  expect(speakingService.send).toHaveBeenCalledWith(
    'session-1',
    expect.objectContaining({ input_mode: 'text' }),
  );
});

test('does not show local sample transcript when loading fails and can retry', async () => {
  jest
    .mocked(speakingService.messages)
    .mockRejectedValueOnce(new Error('Không tải được transcript'));
  await render();
  expect(text()).toContain('Không tải được transcript');
  expect(text()).not.toContain('こんにちは');
  expect(button('Gửi tin nhắn').props.disabled).toBe(true);
  await press('Tải lại hội thoại');
  expect(text()).toContain('こんにちは');
});

test('stops microphone and audio resources when leaving the conversation', async () => {
  await render('voice');
  await act(async () => tree.unmount());
  expect(voiceService.cancel).toHaveBeenCalled();
  expect(voiceService.destroy).toHaveBeenCalled();
  expect(ttsService.stop).toHaveBeenCalled();
});
