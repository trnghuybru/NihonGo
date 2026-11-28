import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  Platform,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { MicIcon, VolumeIcon, ChevronRightIcon } from './icons';
import { fromByteArray } from 'base64-js';
import { AuthButton, AuthNotice } from './AuthForm';
import { LiveAudio } from '../services/liveAudio';
import { PcmRecording } from '../services/audioRecording';
import { AudioReplay } from '../services/audioReplay';
import { authenticatedRequest } from '../services/authService';
import { vocabularyService } from '../services/vocabularyService';
import { colors, spacing, typography, japaneseStudyFont } from '../theme/theme';

type Result = {
  status: string;
  reading: string;
  message: string;
  note: string;
  focus_phones: { phone: string; position: number }[];
  units?: {
    label: string;
    phones: string[];
    position: number;
    status: 'matched' | 'retry' | 'unclear';
  }[];
};
export function PronunciationPractice({
  sentence,
  onListen,
  onRecordingChange,
}: {
  sentence?: string;
  onListen?: () => void;
  onRecordingChange?: (recording: boolean) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [autoRecord, setAutoRecord] = useState(false);
  const [listening, setListening] = useState(false);
  const [sampleIndex, setSampleIndex] = useState(0);
  const samples = [
    'おはようございます。',
    'もう一度お願いします。',
    '日本語を勉強しています。',
  ];
  const meanings = [
    'Chào buổi sáng.',
    'Xin hãy nói lại một lần nữa.',
    'Tôi đang học tiếng Nhật.',
  ];
  const [text, setText] = useState(sentence ?? 'おはようございます。');
  const [state, setState] = useState<
    'ready' | 'starting' | 'recording' | 'processing'
  >('ready');
  const [error, setError] = useState('');
  const [result, setResult] = useState<Result | null>(null);
  const [recording, setRecording] = useState<string | null>(null);
  const [replaying, setReplaying] = useState<'loading' | 'playing' | null>(
    null,
  );
  const [selectedUnit, setSelectedUnit] = useState<number | null>(null);
  const playbackEpoch = useRef(0);
  const microphone = useRef<LiveAudio | null>(null);
  const replay = useRef(new AudioReplay());
  const pcm = useRef<PcmRecording | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const alive = useRef(true);
  const active = useRef(false);
  const pending = useRef(false);
  const epoch = useRef(0);
  useEffect(() => {
    onRecordingChange?.(state !== 'ready');
  }, [state, onRecordingChange]);
  useEffect(() => () => onRecordingChange?.(false), [onRecordingChange]);
  const stop = async () => {
    if (!active.current) return;
    active.current = false;
    clearTimeout(timer.current);
    setState('processing');
    const generation = epoch.current;
    try {
      await microphone.current?.stop();
      const wav = pcm.current?.finish();
      if (!wav) throw new Error('Chưa thu được giọng nói. Hãy thử lại.');
      const audio = fromByteArray(wav.bytes);
      if (!alive.current || generation !== epoch.current) return;
      setRecording(audio);
      const response = await authenticatedRequest<Result>(
        '/pronunciation/analyze',
        { text: text.trim(), audio },
        'POST',
        { timeoutMs: 90000 },
      );
      if (alive.current && generation === epoch.current) setResult(response);
    } catch (failure) {
      if (alive.current && generation === epoch.current)
        setError(
          failure instanceof Error
            ? failure.message
            : 'Chưa phân tích được bản ghi.',
        );
    } finally {
      if (alive.current && generation === epoch.current) setState('ready');
    }
  };
  const start = async () => {
    if (pending.current || active.current || state !== 'ready') return;
    pending.current = true;
    setState('starting');
    setError('');
    setResult(null);
    setSelectedUnit(null);
    setRecording(null);
    const generation = ++epoch.current;
    replay.current.stop();
    playbackEpoch.current++;
    setReplaying(null);
    try {
      await microphone.current?.dispose();
      const mic = new LiveAudio(
        () => {},
        message => {
          if (alive.current) setError(message);
        },
      );
      microphone.current = mic;
      pcm.current = new PcmRecording(16000);
      await mic.prepare();
      if (!alive.current || generation !== epoch.current) {
        await mic.dispose();
        return;
      }
      active.current = true;
      await mic.start(chunk => {
        if (active.current) pcm.current?.append(chunk);
      });
      if (!alive.current || generation !== epoch.current) {
        await mic.dispose();
        return;
      }
      setState('recording');
      timer.current = setTimeout(() => void stop(), 19000);
    } catch (failure) {
      active.current = false;
      if (alive.current) {
        setState('ready');
        setError(
          failure instanceof Error ? failure.message : 'Không mở được micro.',
        );
      }
    } finally {
      pending.current = false;
    }
  };
  useEffect(() => {
    alive.current = true;
    const cancel = () => {
      epoch.current++;
      active.current = false;
      clearTimeout(timer.current);
      void microphone.current?.dispose();
      replay.current.stop();
      playbackEpoch.current++;
      if (alive.current) setReplaying(null);
      if (alive.current) setListening(false);
      if (alive.current) setState('ready');
    };
    const listener = AppState.addEventListener('change', value => {
      if (value !== 'active') cancel();
    });
    return () => {
      alive.current = false;
      cancel();
      listener.remove();
    };
  }, []);
  useEffect(() => {
    if (sentence) {
      setText(sentence);
      setResult(null);
      setRecording(null);
    }
  }, [sentence]);
  const listen = async () => {
    if (listening || state !== 'ready') return;
    if (onListen) {
      onListen();
      return;
    }
    setError('');
    setListening(true);
    const generation = epoch.current;
    try {
      const response = await vocabularyService.audioSynthesize(text.trim());
      if (!alive.current || generation !== epoch.current) return;
      if (
        alive.current &&
        !(await replay.current.play(response.url, () => {
          setListening(false);
          if (autoRecord && alive.current) start();
        }))
      ) {
        setListening(false);
        setError('Chưa phát được mẫu. Hãy thử lại.');
      }
    } catch (failure) {
      setListening(false);
      if (alive.current)
        setError(
          failure instanceof Error ? failure.message : 'Chưa nghe được mẫu.',
        );
    }
  };
  const replayRecording = async () => {
    if (replaying) {
      playbackEpoch.current++;
      replay.current.stop();
      setReplaying(null);
      return;
    }
    if (
      !recording ||
      listening ||
      state === 'recording' ||
      state === 'starting'
    )
      return;
    const generation = ++playbackEpoch.current;
    setReplaying('loading');
    setError('');
    let ended = false;
    try {
      const played = await replay.current.play(
        'data:audio/wav;base64,' + recording,
        () => {
          ended = true;
          if (alive.current && generation === playbackEpoch.current)
            setReplaying(null);
        },
        true,
      );
      if (!alive.current || generation !== playbackEpoch.current) return;
      setReplaying(played && !ended ? 'playing' : null);
      if (!played) setError('Chưa phát được bản thu. Hãy thử nghe lại.');
    } catch {
      if (alive.current && generation === playbackEpoch.current) {
        setReplaying(null);
        setError('Chưa phát được bản thu. Hãy thử nghe lại.');
      }
    }
  };
  const locked = state !== 'ready' || listening || replaying !== null;
  const unit =
    selectedUnit === null ? undefined : result?.units?.[selectedUnit];
  const next = () => {
    const index = (sampleIndex + 1) % samples.length;
    replay.current.stop();
    setSampleIndex(index);
    setText(samples[index]);
    setResult(null);
    setSelectedUnit(null);
    setRecording(null);
    setEditing(false);
  };
  return (
    <View style={styles.panel}>
      {!sentence ? (
        <View style={styles.progressRow}>
          <Text style={styles.caption}>
            Câu {sampleIndex + 1}/{samples.length}
          </Text>
          <AuthButton
            label={editing ? 'Xong' : 'Đổi câu luyện'}
            variant="text"
            size="compact"
            disabled={locked}
            onPress={() => setEditing(value => !value)}
          />
        </View>
      ) : null}
      <View style={styles.sentenceCard}>
        <Text style={styles.kicker}>Nghe mẫu · Đọc theo</Text>
        {editing && !sentence ? (
          <TextInput
            accessibilityLabel="Câu luyện phát âm"
            value={text}
            onChangeText={value => {
              setText(value);
              setResult(null);
              setRecording(null);
            }}
            editable={!locked}
            maxLength={160}
            multiline
            style={styles.input}
          />
        ) : (
          <Text selectable style={styles.sentence}>
            {text}
          </Text>
        )}
        {!sentence && text === samples[sampleIndex] ? (
          <Text style={styles.translation}>{meanings[sampleIndex]}</Text>
        ) : null}
      </View>
      <View style={styles.autoCard}>
        <View style={styles.autoCopy}>
          <Text style={styles.heading}>Tự thu âm sau khi nghe</Text>
          <Text style={styles.caption}>
            Phát mẫu xong, mở micro để bạn đọc theo.
          </Text>
        </View>
        <Switch
          accessibilityLabel="Tự thu âm sau khi nghe"
          value={autoRecord}
          disabled={locked}
          onValueChange={setAutoRecord}
          trackColor={{ false: colors.border, true: colors.primary }}
          thumbColor={colors.surface}
        />
      </View>
      <View style={styles.controls}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Nghe mẫu"
          disabled={locked || !text.trim()}
          onPress={listen}
          style={({ pressed }) => [
            styles.roundButton,
            pressed && styles.pressed,
            locked && styles.disabled,
          ]}
        >
          <VolumeIcon size={26} color={colors.focus} />
          <Text style={styles.controlLabel}>
            {listening ? 'Đang nghe' : 'Nghe'}
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            state === 'recording' ? 'Dừng và xem góp ý' : 'Thu âm câu này'
          }
          accessibilityState={{
            busy: state === 'starting' || state === 'processing',
          }}
          disabled={
            state === 'starting' ||
            state === 'processing' ||
            listening ||
            replaying !== null ||
            !text.trim()
          }
          onPress={() => (state === 'recording' ? stop() : start())}
          style={({ pressed }) => [
            styles.micButton,
            state === 'recording' && styles.recordingButton,
            pressed && styles.pressed,
          ]}
        >
          {state === 'starting' || state === 'processing' ? (
            <ActivityIndicator color={colors.onPrimary} size="large" />
          ) : state === 'recording' ? (
            <View style={styles.stopSquare} />
          ) : (
            <MicIcon size={38} color={colors.onPrimary} />
          )}
        </Pressable>
        {!sentence ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Câu tiếp theo"
            disabled={locked}
            onPress={next}
            style={({ pressed }) => [
              styles.roundButton,
              pressed && styles.pressed,
              locked && styles.disabled,
            ]}
          >
            <ChevronRightIcon size={28} color={colors.focus} />
            <Text style={styles.controlLabel}>Câu tiếp</Text>
          </Pressable>
        ) : null}
      </View>
      <Text accessibilityLiveRegion="polite" style={styles.status}>
        {state === 'recording'
          ? 'Đang thu âm… Chạm để dừng'
          : state === 'processing'
          ? 'Đang nghe lại lần đọc của bạn…'
          : state === 'starting'
          ? 'Đang mở micro…'
          : listening
          ? 'Hãy lắng nghe câu mẫu'
          : 'Chạm micro để đọc theo · Tối đa 20 giây'}
      </Text>
      <AuthNotice message={error} error />
      {recording ? (
        <View style={styles.result}>
          <View style={styles.replayRow}>
            <View style={styles.autoCopy}>
              <Text style={styles.heading}>Lần đọc của bạn</Text>
              <Text accessibilityLiveRegion="polite" style={styles.caption}>
                {replaying === 'loading'
                  ? 'Đang mở bản thu…'
                  : replaying === 'playing'
                  ? 'Đang phát giọng của bạn…'
                  : 'Nghe lại và so sánh với mẫu.'}
              </Text>
            </View>
            <AuthButton
              label={replaying ? 'Dừng nghe' : 'Nghe bản thu của tôi'}
              variant="outline"
              size="compact"
              disabled={
                listening || state === 'recording' || state === 'starting'
              }
              onPress={replayRecording}
            />
          </View>
          {result ? (
            <>
              <Text accessibilityRole="header" style={styles.heading}>
                {result.status === 'uncertain'
                  ? 'Thử đọc lại câu này'
                  : 'Góp ý cho lần đọc này'}
              </Text>
              <Text selectable style={styles.translation}>
                {result.reading}
              </Text>
              {result.units?.length ? (
                <>
                  <View style={styles.legend}>
                    <Text style={[styles.caption, styles.matchedText]}>
                      ✓ Khớp mẫu
                    </Text>
                    <Text style={[styles.caption, styles.retryText]}>
                      ↻ Cần luyện lại
                    </Text>
                    <Text style={styles.caption}>· Chưa rõ</Text>
                  </View>
                  <View style={styles.units}>
                    {result.units.map((item, index) => {
                      const status =
                        result.status === 'uncertain' ? 'unclear' : item.status;
                      const label =
                        status === 'matched'
                          ? 'Khớp mẫu'
                          : status === 'retry'
                          ? 'Cần luyện lại'
                          : 'Chưa rõ';
                      return (
                        <Pressable
                          key={item.position}
                          accessibilityRole="button"
                          accessibilityLabel={`${
                            item.label
                          }, ${label}, vị trí ${index + 1}`}
                          accessibilityState={{
                            selected: selectedUnit === index,
                          }}
                          onPress={() => setSelectedUnit(index)}
                          style={[
                            styles.unit,
                            status === 'matched' && styles.matchedUnit,
                            status === 'retry' && styles.retryUnit,
                            selectedUnit === index && styles.selectedUnit,
                          ]}
                        >
                          <Text
                            style={[
                              styles.unitText,
                              status === 'matched' && styles.matchedText,
                              status === 'retry' && styles.retryText,
                            ]}
                          >
                            {item.label}
                          </Text>
                          <Text
                            style={[
                              styles.caption,
                              status === 'matched' && styles.matchedText,
                              status === 'retry' && styles.retryText,
                            ]}
                          >
                            {status === 'matched'
                              ? '✓'
                              : status === 'retry'
                              ? '↻'
                              : '·'}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                  <Text accessibilityLiveRegion="polite" style={styles.body}>
                    {unit
                      ? `${unit.label} · /${unit.phones.join(' ')}/ — ${
                          result.status === 'uncertain' ||
                          unit.status === 'unclear'
                            ? 'Chưa đủ rõ để đối chiếu. Thử đọc lại gần micro hơn.'
                            : unit.status === 'retry'
                            ? 'Âm chưa khớp mẫu. Nghe mẫu rồi thu lại câu này.'
                            : 'Âm khớp với mẫu trong lần thu này.'
                        }`
                      : 'Chạm vào một âm để xem góp ý.'}
                  </Text>
                </>
              ) : null}
              <Text style={styles.body}>{result.message}</Text>
              <Text style={styles.caption}>{result.note}</Text>
            </>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
const friendly =
  Platform.OS === 'web'
    ? { fontFamily: 'Nunito', fontWeight: '700' as const }
    : typography.heading;
const styles = StyleSheet.create({
  panel: {
    gap: spacing.xl,
    width: '100%',
    maxWidth: 1040,
    alignSelf: 'center',
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sentenceCard: {
    paddingVertical: 40,
    paddingHorizontal: 24,
    minHeight: 230,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 24,
    backgroundColor: colors.surface,
    borderRadius: 32,
  },
  kicker: {
    ...friendly,
    fontSize: 13,
    color: colors.focus,
    backgroundColor: colors.badgeBg,
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: 20,
    overflow: 'hidden',
  },
  heading: { ...friendly, fontSize: 17, color: colors.dark },
  sentence: {
    ...japaneseStudyFont,
    fontSize: 32,
    lineHeight: 50,
    color: colors.dark,
    textAlign: 'center',
    flexShrink: 1,
  },
  translation: {
    ...friendly,
    fontSize: 17,
    color: colors.muted,
    textAlign: 'center',
  },
  caption: { ...typography.caption, color: colors.muted },
  body: { ...typography.body, color: colors.body, lineHeight: 22 },
  autoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 20,
    gap: 16,
    borderRadius: 26,
    backgroundColor: colors.surface,
  },
  autoCopy: { flex: 1, gap: 6 },
  controls: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
    paddingTop: 20,
  },
  roundButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
  },
  controlLabel: { ...friendly, fontSize: 13, color: colors.focus },
  micButton: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: colors.primary,
    borderWidth: 7,
    borderColor: colors.badgeBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recordingButton: {
    backgroundColor: colors.danger,
    borderColor: colors.dangerBg,
  },
  stopSquare: {
    width: 26,
    height: 26,
    borderRadius: 5,
    backgroundColor: colors.surface,
  },
  pressed: { opacity: 0.8, transform: [{ scale: 0.96 }] },
  disabled: { opacity: 0.5 },
  status: {
    ...friendly,
    fontSize: 14,
    color: colors.muted,
    textAlign: 'center',
  },
  input: {
    ...typography.input,
    fontSize: 24,
    lineHeight: 36,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 18,
    color: colors.dark,
    width: '100%',
    minHeight: 90,
    textAlign: 'center',
  },
  result: {
    gap: 14,
    padding: 24,
    backgroundColor: colors.surface,
    borderRadius: 26,
  },
  replayRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 12,
  },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  units: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  unit: {
    minWidth: 48,
    minHeight: 64,
    padding: 10,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: 'transparent',
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unitText: {
    ...japaneseStudyFont,
    fontSize: 24,
    color: colors.muted,
  },
  matchedUnit: { backgroundColor: colors.successBg },
  retryUnit: { backgroundColor: colors.dangerBg },
  matchedText: { color: colors.success },
  retryText: { color: colors.danger },
  selectedUnit: { borderColor: colors.dark },
});
