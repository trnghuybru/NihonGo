import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { AppState } from 'react-native';
import { useVocabularyAudio } from '../src/hooks/useVocabularyAudio';
import { AudioReplay } from '../src/services/audioReplay';
import { vocabularyService } from '../src/services/vocabularyService';

jest.mock('../src/services/audioReplay');
jest.mock('../src/services/vocabularyService', () => ({
  vocabularyService: { audioPlayback: jest.fn() },
}));
let audio: ReturnType<typeof useVocabularyAudio>;
let tree: Renderer.ReactTestRenderer;
function Harness({ scope }: { scope: string }) {
  audio = useVocabularyAudio(scope);
  return null;
}
beforeEach(async () => {
  jest.clearAllMocks();
  jest.mocked(AudioReplay.prototype.play).mockResolvedValue(true);
  jest.mocked(AudioReplay.prototype.close).mockResolvedValue(undefined);
  jest
    .mocked(vocabularyService.audioPlayback)
    .mockResolvedValue({ url: 'signed.mp3', expires_in: 300 });
  await act(async () => {
    tree = Renderer.create(<Harness scope="lesson-1" />);
  });
});
afterEach(async () => {
  await act(async () => tree.unmount());
});

test('switching word stops old audio and completion resets only the current word', async () => {
  await act(async () => {
    await audio.toggle('one');
  });
  const firstEnd = jest.mocked(AudioReplay.prototype.play).mock.calls[0][1];
  await act(async () => {
    await audio.toggle('two');
  });
  expect(audio.wordId).toBe('two');
  await act(async () => {
    firstEnd();
  });
  expect(audio.wordId).toBe('two');
  await act(async () => {
    jest.mocked(AudioReplay.prototype.play).mock.calls[1][1]();
  });
  expect(audio.wordId).toBeNull();
});

test('a late signed URL cannot start playback after changing lesson', async () => {
  let resolve!: (value: { url: string; expires_in: number }) => void;
  jest.mocked(vocabularyService.audioPlayback).mockReturnValueOnce(
    new Promise(done => {
      resolve = done;
    }),
  );
  let pending!: Promise<void>;
  await act(async () => {
    pending = audio.toggle('one');
  });
  expect(audio.loading).toBe(true);
  await act(async () => {
    tree.update(<Harness scope="lesson-2" />);
  });
  await act(async () => {
    resolve({ url: 'late.mp3', expires_in: 300 });
    await pending;
  });
  expect(AudioReplay.prototype.play).not.toHaveBeenCalled();
  expect(audio.wordId).toBeNull();
});

test('backgrounding cancels pending playback and unmount closes the player', async () => {
  const listener = jest.spyOn(AppState, 'addEventListener');
  await act(async () => {
    tree.update(<Harness scope="lesson-3" />);
  });
  await act(async () => {
    await audio.toggle('one');
  });
  const change = listener.mock.calls[0][1];
  await act(async () => {
    change('background');
  });
  expect(audio.wordId).toBeNull();
  expect(AudioReplay.prototype.stop).toHaveBeenCalled();
  await act(async () => {
    tree.unmount();
  });
  expect(AudioReplay.prototype.close).toHaveBeenCalled();
  listener.mockRestore();
});
