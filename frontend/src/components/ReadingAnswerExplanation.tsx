import { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { errorMessage } from '../hooks/useSpeakingScenarios';
import {
  ReadingAnchor,
  ReadingExplanation,
  readingService,
} from '../services/readingService';
import { AuthButton, AuthNotice } from './AuthForm';
import {
  ReadingSourceLink,
  readingStudyStyles as styles,
} from './ReadingStudyUI';

export function ReadingAnswerExplanation({
  passageId,
  questionId,
  attemptId,
  onFocus,
}: {
  passageId: string;
  questionId: string;
  attemptId: string;
  onFocus: (anchor: ReadingAnchor) => void;
}) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<ReadingExplanation | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const alive = useRef(true),
    pending = useRef(false);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const show = async () => {
    if (pending.current) return;
    if (data) {
      setOpen(value => !value);
      return;
    }
    pending.current = true;
    setBusy(true);
    setError('');
    try {
      const result = await readingService.explain(
        passageId,
        questionId,
        attemptId,
      );
      if (alive.current) {
        setData(result);
        setOpen(true);
      }
    } catch (cause) {
      if (alive.current) setError(errorMessage(cause));
    } finally {
      pending.current = false;
      if (alive.current) setBusy(false);
    }
  };
  return (
    <View style={styles.body}>
      <AuthButton
        label={
          open
            ? 'Thu gọn giải thích'
            : error
            ? 'Thử lại giải thích'
            : 'Giải thích đáp án'
        }
        variant="text"
        busy={busy}
        onPress={show}
      />
      {error ? <AuthNotice error message={error} /> : null}
      {open && data ? (
        <View style={styles.body}>
          <Text style={styles.text}>{data.explanation}</Text>
          {data.caution ? (
            <Text style={styles.caution}>{data.caution}</Text>
          ) : null}
          <Text style={styles.label}>
            {data.answer_supported
              ? 'Bằng chứng trong bài'
              : 'Đoạn cần đối chiếu'}
          </Text>
          {data.evidence.map((location, index) => (
            <ReadingSourceLink
              key={index}
              location={location}
              onFocus={onFocus}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}
