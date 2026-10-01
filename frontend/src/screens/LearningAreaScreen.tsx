import { StyleSheet, Text, View } from 'react-native';
import { AuthShell } from '../components/AuthForm';
import { MascotPose, NihongoMascot } from '../components/NihongoMascot';
import { colors, spacing, typography } from '../theme/theme';

export type LearningArea = 'listening' | 'reading' | 'writing' | 'vocabulary';

const areas: Record<
  LearningArea,
  { title: string; description: string; pose: MascotPose }
> = {
  listening: {
    title: 'Nghe',
    description: 'Luyện nghe hội thoại và làm quen với phát âm tiếng Nhật.',
    pose: 'listening',
  },
  reading: {
    title: 'Đọc',
    description: 'Luyện đọc những đoạn văn phù hợp với trình độ của bạn.',
    pose: 'reading',
  },
  writing: {
    title: 'Viết',
    description: 'Tập viết Kana, Kanji và những câu tiếng Nhật đầu tiên.',
    pose: 'writing',
  },
  vocabulary: {
    title: 'Từ vựng',
    description: 'Góc tra cứu, lưu và ôn lại từ vựng của bạn.',
    pose: 'reading',
  },
};

export function LearningAreaScreen({
  area,
  query = '',
}: {
  area: LearningArea;
  query?: string;
}) {
  const content = areas[area];
  return (
    <AuthShell title={content.title} subtitle={content.description}>
      <View style={styles.illustration}>
        <NihongoMascot pose={content.pose} size={144} decorative />
      </View>
      <Text accessibilityRole="header" style={styles.title}>
        {area === 'vocabulary'
          ? 'Từ điển đang được chuẩn bị'
          : 'Bài luyện đang được chuẩn bị'}
      </Text>
      {area === 'vocabulary' && query ? (
        <Text selectable style={styles.query}>
          Từ bạn muốn tra: {query}
        </Text>
      ) : null}
      <Text style={styles.description}>
        {area === 'vocabulary'
          ? 'Chưa có dữ liệu từ điển để tra cứu. Nội dung sẽ xuất hiện tại đây khi sẵn sàng.'
          : 'Hiện chưa có bài luyện trong mục này. Bạn có thể chọn Nói trong Luyện tập để trò chuyện cùng Aoi.'}
      </Text>
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  illustration: { alignItems: 'center', paddingVertical: spacing.lg },
  title: { ...typography.title, color: colors.dark },
  query: { ...typography.label, color: colors.dark },
  description: { ...typography.body, color: colors.body },
});
