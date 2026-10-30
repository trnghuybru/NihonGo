import { useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import {
  ReadingAnalysis,
  ReadingAnchor,
  ReadingSentence,
  ReadingSentenceAnalysis,
} from '../services/readingService';
import { colors } from '../theme/theme';
import { AuthButton, AuthNotice } from './AuthForm';
import {
  ReadingFold,
  ReadingSentenceDetail,
  ReadingSourceLink,
  readingStudyStyles as styles,
} from './ReadingStudyUI';

function FocusItem({
  title,
  subtitle,
  detail,
  location,
  onFocus,
}: {
  title: string;
  subtitle?: string;
  detail: string;
  location: ReadingAnchor;
  onFocus: (anchor: ReadingAnchor) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <View style={styles.body}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Phân tích ${title}`}
        aria-expanded={open}
        onPress={() => {
          setOpen(value => !value);
          onFocus(location);
        }}
        style={styles.foldHeader}
      >
        <View style={styles.fill}>
          <Text style={styles.japanese}>{title}</Text>
          {subtitle ? <Text style={styles.muted}>{subtitle}</Text> : null}
        </View>
        <Text style={styles.link}>{open ? '−' : '+'}</Text>
      </Pressable>
      {open ? (
        <View style={styles.body}>
          <Text style={styles.text}>{detail}</Text>
          <ReadingSourceLink location={location} onFocus={onFocus} />
        </View>
      ) : null}
    </View>
  );
}
export function ReadingAnalysisPanel({
  analysis,
  busy,
  error,
  onLoad,
  onFocus,
  sentences,
  selectedSentence,
  detail,
  sentenceBusy,
  sentenceError,
  onSelectSentence,
}: {
  analysis: ReadingAnalysis | null;
  busy: boolean;
  error: string;
  onLoad: () => void;
  onFocus: (anchor: ReadingAnchor) => void;
  sentences: ReadingSentence[];
  selectedSentence: string | null;
  detail: ReadingSentenceAnalysis | null;
  sentenceBusy: boolean;
  sentenceError: string;
  onSelectSentence: (sentence: ReadingSentence) => void;
}) {
  return (
    <View style={styles.card} testID="reading-analysis-panel">
      <Text accessibilityRole="header" style={styles.heading}>
        Phân tích bài đọc
      </Text>
      {!analysis ? (
        <AuthButton
          label={error ? 'Thử lại phân tích' : 'Phân tích bài đọc'}
          onPress={onLoad}
          busy={busy}
        />
      ) : null}
      {error ? <AuthNotice error message={error} /> : null}
      {selectedSentence ? (
        <View style={styles.body}>
          <Text style={styles.label}>Câu đang chọn</Text>
          {!detail ? (
            <Text style={styles.japanese} numberOfLines={2}>
              {sentences.find(item => item.id === selectedSentence)?.text}
            </Text>
          ) : null}
          {sentenceBusy ? (
            <ActivityIndicator
              color={colors.primary}
              accessibilityLabel="Đang phân tích câu"
            />
          ) : null}
          {sentenceError ? (
            <>
              <AuthNotice error message={sentenceError} />
              <AuthButton
                label="Thử lại phân tích câu"
                variant="text"
                onPress={() => {
                  const sentence = sentences.find(
                    item => item.id === selectedSentence,
                  );
                  if (sentence) onSelectSentence(sentence);
                }}
              />
            </>
          ) : null}
          {detail ? (
            <ReadingSentenceDetail
              key={detail.sentence_id}
              detail={detail}
              onFocus={onFocus}
            />
          ) : null}
        </View>
      ) : null}
      {analysis ? (
        <>
          <ReadingFold title="Ý chính" initialOpen>
            <Text style={styles.text}>{analysis.summary}</Text>
            {analysis.caution ? (
              <Text style={styles.caution}>{analysis.caution}</Text>
            ) : null}
          </ReadingFold>
          {analysis.structure.length ? (
            <ReadingFold title="Mạch bài đọc">
              {analysis.structure.map((item, index) => (
                <View key={index} style={styles.body}>
                  <Text style={styles.label}>{item.label}</Text>
                  <Text style={styles.text}>{item.explanation}</Text>
                  <ReadingSourceLink
                    location={item.location}
                    onFocus={onFocus}
                  />
                </View>
              ))}
            </ReadingFold>
          ) : null}
          <ReadingFold
            title={`Từ vựng quan trọng (${analysis.vocabulary.length})`}
          >
            {analysis.vocabulary.length ? (
              analysis.vocabulary.map((item, index) => (
                <FocusItem
                  key={index}
                  title={item.word}
                  subtitle={item.reading}
                  detail={item.meaning}
                  location={item.location}
                  onFocus={onFocus}
                />
              ))
            ) : (
              <Text style={styles.muted}>Chưa có từ vựng cần chú ý.</Text>
            )}
          </ReadingFold>
          <ReadingFold
            title={`Ngữ pháp quan trọng (${analysis.grammar.length})`}
          >
            {analysis.grammar.length ? (
              analysis.grammar.map((item, index) => (
                <FocusItem
                  key={index}
                  title={item.pattern}
                  detail={item.explanation}
                  location={item.location}
                  onFocus={onFocus}
                />
              ))
            ) : (
              <Text style={styles.muted}>Chưa có mẫu ngữ pháp cần chú ý.</Text>
            )}
          </ReadingFold>
        </>
      ) : null}
    </View>
  );
}
