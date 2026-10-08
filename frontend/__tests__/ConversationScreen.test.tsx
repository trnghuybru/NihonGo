import React from 'react';
import {
  AccessibilityInfo,
  AppState,
  Dimensions,
  FlatList,
  Modal,
  StyleSheet,
  Text,
  TextInput,
} from 'react-native';
import Renderer, { act } from 'react-test-renderer';
import { ConversationScreen } from '../src/screens/ConversationScreen';
import { CharacterView3D } from '../src/components/CharacterView3D';
import {
  GeminiLiveService,
  LiveCallbacks,
} from '../src/services/geminiLiveService';
import {
  StartedSession,
  speakingService,
} from '../src/services/speakingService';

jest.mock('../src/components/CharacterView3D', () => ({
  CharacterView3D: () => null,
}));
jest.mock('../src/services/speakingService', () => ({
  speakingService: { messages: jest.fn() },
}));
jest.mock('../src/services/geminiLiveService', () => ({
  GeminiLiveService: jest.fn(),
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

let callbacks: LiveCallbacks;
let tree: Renderer.ReactTestRenderer;
const onBack = jest.fn();
const live = {
  connect: jest.fn(),
  close: jest.fn(),
  interrupt: jest.fn(),
  sendText: jest.fn(),
  startSpeaking: jest.fn(),
  stopSpeaking: jest.fn(),
  retrySave: jest.fn(),
  hasUnsavedTurn: jest.fn(),
};
beforeEach(() => {
  jest.clearAllMocks();
  jest
    .spyOn(AccessibilityInfo, 'isReduceMotionEnabled')
    .mockResolvedValue(false);
  jest
    .spyOn(AppState, 'addEventListener')
    .mockReturnValue({ remove: jest.fn() });
  jest.mocked(speakingService.messages).mockResolvedValue({
    items: [opening],
    session: {
      id: 'session-1',
      status: 'active',
      current_input_mode: 'text',
    },
    has_more: false,
    next_sequence: 1,
  });
  live.connect.mockImplementation(async () => {
    callbacks.onState('ready');
    return true;
  });
  live.close.mockResolvedValue(undefined);
  live.hasUnsavedTurn.mockReturnValue(false);
  live.sendText.mockReturnValue(true);
  jest.mocked(GeminiLiveService).mockImplementation((_id, value) => {
    callbacks = value;
    return live as unknown as GeminiLiveService;
  });
});
afterEach(async () => {
  await act(async () => tree?.unmount());
  jest.restoreAllMocks();
  jest.useRealTimers();
});
async function render() {
  await act(async () => {
    tree = Renderer.create(
      <ConversationScreen result={result} onBack={onBack} />,
    );
  });
}
function control(label: string) {
  return tree.root.findAll(
    node =>
      node.props.accessibilityLabel === label &&
      (typeof node.props.onPress === 'function' ||
        typeof node.props.onPressIn === 'function'),
  )[0];
}
function text() {
  const read = (value: unknown): string => {
    if (typeof value === 'string' || typeof value === 'number')
      return String(value);
    if (Array.isArray(value)) return value.map(read).join('');
    if (React.isValidElement<{ children?: React.ReactNode }>(value))
      return read(value.props.children);
    return '';
  };
  return tree.root
    .findAllByType(Text)
    .map(node => read(node.props.children))
    .join(' ');
}

test('loads the saved session and connects Live with its ID, with context and avatar', async () => {
  await render();
  expect(GeminiLiveService).toHaveBeenCalledWith(
    'session-1',
    expect.any(Object),
  );
  expect(live.connect).toHaveBeenCalledTimes(1);
  expect(text()).not.toContain('Chào hỏi');
  expect(control('Xem nhiệm vụ')).toBeDefined();
  expect(text()).toContain('こんにちは');
  expect(text()).not.toContain('OPENING FROM START RESPONSE');
  expect(text()).not.toContain('Cuộc trò chuyện mới');
  expect(tree.root.findByType(CharacterView3D).props.isSpeaking).toBe(false);
  expect(tree.root.findAllByType(Modal)).toHaveLength(0);
});
test('defaults to a large centered mic and only opens the text composer in message mode', async () => {
  await render();
  expect(tree.root.findAllByType(TextInput)).toHaveLength(0);
  expect(
    StyleSheet.flatten(control('Giữ để nói').props.style({ pressed: false }))
      .width,
  ).toBe(80);
  await act(async () => control('Chế độ nhắn tin').props.onPress());
  expect(
    tree.root.findAll(node => node.props.testID === 'speaking-mic'),
  ).toHaveLength(0);
  await act(async () =>
    tree.root.findByType(TextInput).props.onChangeText('こんにちは'),
  );
  await act(async () => control('Gửi tin nhắn').props.onPress());
  expect(live.sendText).toHaveBeenCalledWith('こんにちは');
  expect(tree.root.findByType(TextInput).props.value).toBe('');
  await act(async () => control('Chế độ nói').props.onPress());
  await act(async () => control('Giữ để nói').props.onPressIn());
  await act(async () => control('Giữ để nói').props.onPressOut());
  expect(live.startSpeaking).toHaveBeenCalled();
  expect(live.stopSpeaking).toHaveBeenCalled();
});
test('shows tasks only after pressing the lightbulb icon', async () => {
  await render();
  expect(text()).not.toContain('Chào hỏi');
  await act(async () => control('Xem nhiệm vụ').props.onPress());
  expect(text()).toContain('Chào hỏi');
  expect(text()).toContain('AI đóng vai');
  expect(tree.root.findAllByType(Modal)).toHaveLength(1);
  const close = tree.root.findAll(
    node =>
      node.props.label === 'Đóng nhiệm vụ' &&
      typeof node.props.onPress === 'function',
  )[0];
  await act(async () => close.props.onPress());
  expect(tree.root.findAllByType(Modal)).toHaveLength(0);
});
test('animates the avatar during actual playback and shows live transcripts', async () => {
  jest.useFakeTimers();
  await render();
  await act(async () => {
    callbacks.onPlaying(true);
    callbacks.onTranscript('はじめまして', 'よろしく！');
  });
  expect(tree.root.findByType(CharacterView3D).props.isSpeaking).toBe(true);
  await act(async () => jest.advanceTimersByTime(500));
  expect(text()).toContain('よろしく');
  await act(async () => callbacks.onPlaying(false));
  expect(tree.root.findByType(CharacterView3D).props.isSpeaking).toBe(false);
  await act(async () => jest.advanceTimersByTime(380));
  jest.useRealTimers();
});
test('blocks leaving until a failed transcript save is retried', async () => {
  await render();
  live.hasUnsavedTurn.mockReturnValue(true);
  await act(async () => {
    callbacks.onState('error');
    callbacks.onError('Chưa lưu');
  });
  expect(control('Lịch sử hội thoại').props.disabled).toBe(true);
  const retry = tree.root.findAll(
    node =>
      node.props.label === 'Thử lưu lại' &&
      typeof node.props.onPress === 'function',
  )[0];
  await act(async () => retry.props.onPress());
  expect(live.retrySave).toHaveBeenCalled();
});
test('reloads persisted history after saving and closes native resources on unmount', async () => {
  await render();
  await act(async () => callbacks.onSaved({} as never));
  expect(speakingService.messages).toHaveBeenCalledTimes(2);
  await act(async () => tree.unmount());
  expect(live.close).toHaveBeenCalled();
});
test('keeps completed sessions read only without opening a Live connection', async () => {
  jest.mocked(speakingService.messages).mockResolvedValueOnce({
    items: [opening],
    session: {
      id: 'session-1',
      status: 'completed',
      current_input_mode: 'text',
    },
    has_more: false,
    next_sequence: 1,
  });
  await render();
  expect(live.connect).not.toHaveBeenCalled();
  expect(
    tree.root.findAll(node => node.props.testID === 'speaking-mic')[0].props
      .disabled,
  ).toBe(true);
  expect(text()).toContain('Phiên này chỉ xem lại');
});
test('does not connect if history fails to load', async () => {
  jest
    .mocked(speakingService.messages)
    .mockRejectedValueOnce(new Error('Không tải được hội thoại'));
  await render();
  expect(live.connect).not.toHaveBeenCalled();
  expect(text()).toContain('Không tải được hội thoại');
});

test('keeps Live during the microphone permission overlay but interrupts on background', async () => {
  const subscription = jest
    .spyOn(AppState, 'addEventListener')
    .mockReturnValue({ remove: jest.fn() });
  try {
    await render();
    const change = subscription.mock.calls.find(
      call => call[0] === 'change',
    )![1];
    await act(async () => change('inactive'));
    expect(live.interrupt).not.toHaveBeenCalled();
    await act(async () => change('background'));
    expect(live.interrupt).toHaveBeenCalled();
    expect(text()).toContain('chuyển nền');
  } finally {
    subscription.mockRestore();
  }
});

test('locks mic until both audio and saving finish, then hands over after 380ms', async () => {
  jest.useFakeTimers();
  try {
    await render();
    await act(async () => {
      callbacks.onState('processing');
      callbacks.onTranscript('私です', 'こんにちは！');
      callbacks.onPlaying(true);
    });
    expect(text()).toContain('AI đang nói...');
    expect(
      tree.root.findAll(node => node.props.testID === 'speaking-mic')[0].props
        .disabled,
    ).toBe(true);
    await act(async () => {
      callbacks.onState('saving');
      callbacks.onTranscript('', '');
      callbacks.onState('ready');
    });
    expect(tree.root.findByType(CharacterView3D).props.isSpeaking).toBe(true);
    await act(async () => callbacks.onPlaying(false));
    expect(text()).toContain('Đến lượt bạn');
    expect(
      tree.root.findAll(node => node.props.testID === 'speaking-mic')[0].props
        .disabled,
    ).toBe(true);
    await act(async () => jest.advanceTimersByTime(380));
    expect(control('Giữ để nói').props.disabled).toBe(false);
    expect(text()).toContain('こんにちは');
  } finally {
    await act(async () => tree.unmount());
    jest.useRealTimers();
  }
});
test('shows incoming user transcript and a state-specific mic label during capture', async () => {
  await render();
  await act(async () => {
    callbacks.onState('listening');
    callbacks.onTranscript('はじめまして', '');
  });
  expect(text()).toContain('はじめまして');
  expect(control('Đang thu âm, thả để gửi').props.disabled).toBe(false);
  await act(async () => callbacks.onState('processing'));
  expect(
    tree.root.findAll(node => node.props.testID === 'speaking-mic')[0].props
      .disabled,
  ).toBe(true);
});
test.each([360, 1440])(
  'uses a scrollable layout and portrait avatar at width %i',
  async width => {
    await act(async () =>
      Dimensions.set({
        window: { width, height: 800, scale: 1, fontScale: 1 },
        screen: { width, height: 800, scale: 1, fontScale: 1 },
      }),
    );
    await render();
    const stage = tree.root.findAll(
      node => node.props.testID === 'speaking-avatar-stage',
    )[0];
    expect(StyleSheet.flatten(stage.props.style).height).toBe(400);
    expect(tree.root.findByType(CharacterView3D).props.portrait).toBe(true);
    {
      const content = tree.root.findAll(
        node => node.props.testID === 'speaking-content',
      )[0];
      await act(async () =>
        content.props.onLayout({ nativeEvent: { layout: { height: 600 } } }),
      );
      expect(StyleSheet.flatten(stage.props.style).height).toBe(300);
    }
  },
);
test('honors native reduced motion and uses fade for the transcript sheet', async () => {
  const reduced = jest
    .spyOn(AccessibilityInfo, 'isReduceMotionEnabled')
    .mockResolvedValue(true);
  try {
    await render();
    const button = tree.root.findAll(
      node =>
        node.props.label === 'Hội thoại' &&
        typeof node.props.onPress === 'function',
    )[0];
    await act(async () => button.props.onPress());
    expect(tree.root.findByType(Modal).props.animationType).toBe('fade');
  } finally {
    reduced.mockRestore();
  }
});

test('keeps a long live transcript scrollable instead of truncating it to three lines', async () => {
  await render();
  const transcript = 'こんにちは。'.repeat(200);
  await act(async () => {
    callbacks.onState('listening');
    callbacks.onTranscript(transcript, '');
  });
  const copy = tree.root
    .findAllByType(Text)
    .find(node => node.props.accessibilityLabel === transcript)!;
  expect(copy.props['aria-live']).toBe('polite');
  expect(copy.props.numberOfLines).toBeUndefined();
  expect(text()).toContain(transcript);
});

test('scrolls only the message list to the bottom when text arrives or the keyboard resizes it', async () => {
  await render();
  const list = tree.root.findByType(FlatList);
  const scroll = jest
    .spyOn(list.instance, 'scrollToEnd')
    .mockImplementation(() => undefined);
  await act(async () => list.props.onContentSizeChange(320, 1200));
  expect(scroll).toHaveBeenCalledWith({ animated: true });
  await act(async () => list.props.onLayout());
  expect(scroll).toHaveBeenCalledTimes(2);
});
test('mode switches keep the draft and do not reconnect or send API requests', async () => {
  await render();
  await act(async () => control('Chế độ nhắn tin').props.onPress());
  await act(async () =>
    tree.root.findByType(TextInput).props.onChangeText('Bản nháp'),
  );
  await act(async () => control('Chế độ nói').props.onPress());
  expect(tree.root.findAllByType(TextInput)).toHaveLength(0);
  await act(async () => control('Chế độ nhắn tin').props.onPress());
  expect(tree.root.findByType(TextInput).props.value).toBe('Bản nháp');
  expect(live.connect).toHaveBeenCalledTimes(1);
  expect(live.sendText).not.toHaveBeenCalled();
});

test('reacts to measured mic level only during capture and clears it after release', async () => {
  await render();
  await act(async () => callbacks.onState('listening'));
  await act(async () => callbacks.onMicLevel?.(0.7));
  const mic = tree.root.findAll(
    node =>
      node.props.presentation && node.props.label === 'Đang thu âm, thả để gửi',
  )[0];
  expect(mic.props.presentation.micLevel).toBe(0.7);
  await act(async () => callbacks.onState('processing'));
  expect(mic.props.presentation.micLevel).toBe(0);
});

test('requests the opening voice on creation but not on reconnect', async () => {
  await render();
  expect(live.connect).toHaveBeenCalledWith(opening.content);
  await act(async () => callbacks.onError('Offline'));
  const retry = tree.root.findAll(
    node =>
      node.props.label === 'Kết nối lại' &&
      typeof node.props.onPress === 'function',
  )[0];
  await act(async () => retry.props.onPress());
  expect(live.connect).toHaveBeenLastCalledWith(undefined);
});

test('opening a previous conversation does not request opening audio', async () => {
  await act(async () => {
    tree = Renderer.create(
      <ConversationScreen
        result={{ ...result, opening_message: null }}
        onBack={onBack}
      />,
    );
  });
  expect(live.connect).toHaveBeenCalledWith(undefined);
});
