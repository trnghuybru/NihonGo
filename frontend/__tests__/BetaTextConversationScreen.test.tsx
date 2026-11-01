import React from 'react';
import { TextInput } from 'react-native';
import Renderer, { act } from 'react-test-renderer';
import { BetaTextConversationScreen } from '../src/screens/BetaTextConversationScreen';
import { AuthButton } from '../src/components/AuthForm';
import { useConversation } from '../src/hooks/useConversation';
import { speakingService, StartedSession } from '../src/services/speakingService';
import { CharacterView3D } from '../src/components/CharacterView3D';
import { JapaneseSpeech } from '../src/services/japaneseSpeech';

jest.mock('../src/hooks/useConversation', () => ({ useConversation: jest.fn() }));
jest.mock('../src/services/speakingService', () => ({ speakingService: { finish: jest.fn() } }));
jest.mock('../src/components/CharacterView3D', () => ({ CharacterView3D: jest.fn(() => null) }));
jest.mock('../src/services/japaneseSpeech', () => ({ JapaneseSpeech: jest.fn().mockImplementation(() => ({ stop: jest.fn(), speak: jest.fn().mockResolvedValue(undefined) })) }));

const result = {
  session: { id: 'session-1', status: 'active' },
  scenario: {
    title: 'Chào hỏi',
    context: 'Trong lớp học',
    role: { name: 'Aoi' },
  },
} as StartedSession;

const send = jest.fn();
const reload = jest.fn();
const chat = {
  messages: [{ id: 'opening', speaker: 'assistant', content: 'こんにちは', status: 'completed' }],
  loading: false,
  ready: true,
  sending: false,
  error: '',
  active: true,
  retrySeconds: 0,
  unresolved: false,
  reload,
  send,
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(useConversation).mockReturnValue(chat as unknown as ReturnType<typeof useConversation>);
  send.mockResolvedValue({ id: 'reply', content: 'こんにちは' });
  reload.mockResolvedValue(undefined);
  jest.mocked(speakingService.finish).mockResolvedValue({ session: { id: 'session-1', status: 'completed' } });
});

it('sends a beta speaking turn through the REST text flow', async () => {
  let tree!: Renderer.ReactTestRenderer;
  await act(async () => { tree = Renderer.create(<BetaTextConversationScreen result={result} onBack={jest.fn()} />); });
  await act(async () => {
    tree.root.findByType(TextInput).props.onChangeText(' はじめまして ');
  });
  const sendButton = tree.root.findAllByType(AuthButton).find(item => item.props.label === 'Gửi');
  expect(sendButton).toBeDefined();
  await act(async () => { sendButton!.props.onPress(); });
  expect(send).toHaveBeenCalledWith('はじめまして', 'text');
  expect(tree.root.findByType(TextInput).props.value).toBe('');
  expect(tree.root.findByType(CharacterView3D).props.isSpeaking).toBe(true);
  expect(jest.mocked(JapaneseSpeech).mock.results[0].value.speak).toHaveBeenCalledWith(
    expect.any(String), expect.any(Function), expect.any(Function),
  );
  tree.unmount();
});

it('uses the microphone transcript as a voice turn', async () => {
  let recognizer!: {
    onresult: (event: unknown) => void;
    onend: () => void;
    start: jest.Mock;
    stop: jest.Mock;
  };
  const Recognition = jest.fn().mockImplementation(() => {
    recognizer = { onresult: jest.fn(), onend: jest.fn(), start: jest.fn(), stop: jest.fn() };
    return recognizer;
  });
  Object.defineProperty(window, 'webkitSpeechRecognition', { configurable: true, value: Recognition });
  let tree!: Renderer.ReactTestRenderer;
  await act(async () => { tree = Renderer.create(<BetaTextConversationScreen result={result} onBack={jest.fn()} />); });
  const mic = tree.root.findAllByType(AuthButton).find(item => item.props.label === '🎙 Nói tiếng Nhật');
  await act(async () => { mic!.props.onPress(); });
  expect(recognizer.start).toHaveBeenCalled();
  await act(async () => { recognizer.onresult({ results: [[{ transcript: 'おはよう' }]] }); recognizer.onend(); });
  expect(tree.root.findByType(TextInput).props.value).toBe('おはよう');
  const sendButton = tree.root.findAllByType(AuthButton).find(item => item.props.label === 'Gửi');
  await act(async () => { sendButton!.props.onPress(); });
  expect(send).toHaveBeenCalledWith('おはよう', 'voice');
  tree.unmount();
  delete (window as typeof window & { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition;
});
