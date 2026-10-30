import { StyleSheet, Text, View } from 'react-native';
import { readingStudyStyles as styles } from './ReadingStudyUI';
import { colors, spacing, typography } from '../theme/theme';

// Fixed teaching points adapted from the supplied reading-skill.md; no network or AI.
export function readingTips(text: string): string[] {
  const tips: string[] = [];
  if (/[（(]\s*[ア-ンA-Z_＿…・ ]*\s*[)）]/u.test(text))
    tips.push(
      'Với ô trống, đọc câu trước và câu sau; xác định loại từ rồi mới loại đáp án.',
    );
  if (/しかし|だが|ところが/u.test(text))
    tips.push(
      'Chú ý vế sau しかし・だが・ところが: đây thường là chỗ ý nghĩa đổi hướng.',
    );
  if (/と思|と感じ|と考|と話/u.test(text))
    tips.push(
      'Tách hai tầng: ai nghĩ hoặc nói, và nội dung người đó nghĩ hoặc nói.',
    );
  if (/ことが多い|ことがある|こともある|心配がある|習慣がある/u.test(text))
    tips.push(
      'Đọc cụm cuối câu trước; phân biệt “thường”, “có khi” và “cũng có khi”.',
    );
  if (/つまり|というのは|とは|「/u.test(text))
    tips.push(
      'Gặp từ mới, đọc tiếp: phần sau つまり・とは thường giải thích ngay từ đó.',
    );
  tips.push(
    'Tìm vị ngữ cuối câu, rồi chọn chủ ngữ khớp nghĩa; は không phải lúc nào cũng là chủ ngữ chính.',
  );
  tips.push(
    'Nắm lõi chủ ngữ – bổ ngữ – vị ngữ trước; luôn giữ phủ định và mức độ khi rút gọn.',
  );
  tips.push(
    'Nắm ý chính cả đoạn trước khi tra từng từ; đối chiếu câu hỏi với câu có bằng chứng.',
  );
  return tips.slice(0, 3);
}
export function ReadingTips({ text }: { text: string }) {
  return (
    <View style={tipStyles.content}>
      <Text style={tipStyles.title}>Tips đọc hiểu</Text>
      {readingTips(text).map((tip, index) => (
        <Text key={tip} style={styles.text}>
          {index + 1}. {tip}
        </Text>
      ))}
    </View>
  );
}
const tipStyles = StyleSheet.create({
  content: {
    padding: spacing.md,
    gap: spacing.sm,
    borderRadius: 20,
    backgroundColor: colors.surface,
  },
  title: { ...typography.label, color: colors.dark },
});
