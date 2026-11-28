import { useState } from 'react';
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { AuthButton, AuthShell } from './AuthForm';
import { ScreenBackHeader } from './ScreenBackHeader';
import type { ExamSource } from '../services/jlptService';
import { colors, typography } from '../theme/theme';
import { useWebLayout } from '../hooks/useWebLayout';

const names: Record<string, string> = {
  exam: 'Đề thi',
  answers: 'Đáp án',
  answers_and_listening_script: 'Đáp án & script',
  listening_script: 'Script nghe',
};

export function JlptSourceViewer({
  source,
  onExit,
}: {
  source: ExamSource;
  onExit: () => void;
}) {
  const [documentIndex, setDocumentIndex] = useState(0);
  const [pageIndex, setPageIndex] = useState(0);
  const { contentWidth } = useWebLayout();
  const wide = contentWidth >= 900;
  const document = source.documents[documentIndex];
  const page = document.pages[pageIndex];
  const images =
    document.question_images?.filter(
      image => image.source_page === page.page,
    ) ?? [];
  const pages = (
    <View style={styles.navigation}>
      <Text style={styles.label}>
        Trang · {pageIndex + 1}/{document.pages.length}
      </Text>
      <View style={styles.pageGrid}>
        {document.pages.map((p, index) => (
          <Pressable
            key={p.page}
            accessibilityRole="button"
            accessibilityLabel={`Trang ${p.page}`}
            accessibilityState={{ selected: index === pageIndex }}
            onPress={() => setPageIndex(index)}
            style={[styles.pageButton, index === pageIndex && styles.selected]}
          >
            <Text style={styles.caption}>{p.page}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
  return (
    <AuthShell title={source.title} subtitle="" card={false} wide hideHeader>
      <ScreenBackHeader
        title={source.title}
        backLabel="Danh sách đề"
        onBack={onExit}
      />
      <Text style={styles.caption}>
        Tài liệu nguồn · Tự đối chiếu đáp án. Bản chữ OCR có thể sai ký tự; đề
        này chưa có chấm tự động.
      </Text>
      <View style={styles.tabs}>
        {source.documents.map((doc, index) => (
          <AuthButton
            key={doc.filename}
            label={names[doc.kind] ?? doc.filename}
            size="compact"
            variant={index === documentIndex ? 'primary' : 'outline'}
            onPress={() => {
              setDocumentIndex(index);
              setPageIndex(0);
            }}
          />
        ))}
      </View>
      <View style={[styles.layout, !wide && styles.stacked]}>
        <View style={styles.content}>
          <Text style={styles.caption}>
            {document.filename} · Trang {page.page}
          </Text>
          <ScrollView
            key={`${documentIndex}:${pageIndex}`}
            style={styles.reader}
          >
            {page.image_data_url ? (
              <Image
                source={{ uri: page.image_data_url }}
                resizeMode="contain"
                accessibilityLabel={`Trang ${page.page} của ${document.filename}`}
                style={[
                  styles.image,
                  { aspectRatio: (page.width_px ?? 1) / (page.height_px ?? 1) },
                ]}
              />
            ) : (
              <Text selectable style={styles.japanese}>
                {page.text || 'Trang này không có văn bản trích xuất.'}
              </Text>
            )}
            {images.map(img => (
              <Image
                key={img.id}
                source={{ uri: img.image_data_url }}
                resizeMode="contain"
                accessibilityLabel="Hình trong đề gốc"
                style={[
                  styles.image,
                  { aspectRatio: img.width_px / img.height_px },
                ]}
              />
            ))}
          </ScrollView>
          <View style={styles.tabs}>
            <AuthButton
              label="Trang trước"
              onPress={() => setPageIndex(i => i - 1)}
              disabled={pageIndex === 0}
              variant="outline"
              size="compact"
            />
            <AuthButton
              label="Trang tiếp"
              onPress={() => setPageIndex(i => i + 1)}
              disabled={pageIndex === document.pages.length - 1}
              size="compact"
            />
          </View>
        </View>
        {pages}
      </View>
    </AuthShell>
  );
}
const styles = StyleSheet.create({
  layout: { flexDirection: 'row', gap: 20, alignItems: 'flex-start' },
  stacked: { flexDirection: 'column-reverse' },
  content: { flex: 1, minWidth: 0, width: '100%', gap: 12 },
  reader: {
    maxHeight: 720,
    width: '100%',
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.border,
  },
  japanese: { fontSize: 16, lineHeight: 28, color: colors.dark },
  image: { width: '100%' },
  caption: { ...typography.caption, color: colors.body },
  label: { ...typography.label, color: colors.dark },
  tabs: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  navigation: { width: 240, maxWidth: '100%', gap: 12 },
  pageGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  pageButton: {
    width: 36,
    minHeight: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
  },
  selected: { backgroundColor: colors.badgeBg, borderColor: colors.primary },
});
