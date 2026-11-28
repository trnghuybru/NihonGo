import { StyleSheet, View } from 'react-native';
import { HomeSkillCard } from './HomeSkillCard';
import { spacing } from '../theme/theme';

export type LearningSkill = 'listening' | 'speaking' | 'reading' | 'writing';

export function SkillPicker({
  onOpenSkill,
  onOpenPronunciation,
}: {
  onOpenSkill: (skill: LearningSkill) => void;
  onOpenPronunciation?: () => void;
}) {
  return (
    <View testID="skill-picker-grid" style={styles.grid}>
      <View style={styles.skillRow}>
        <HomeSkillCard
          title="Nghe"
          description="Hội thoại và phát âm"
          action="Luyện nghe"
          pose="listening"
          onPress={() => onOpenSkill('listening')}
        />
        <HomeSkillCard
          title="Nói"
          description="Luyện nói theo tình huống"
          action="Xem tình huống"
          pose="speaking"
          onPress={() => onOpenSkill('speaking')}
        />
      </View>
      <View style={styles.skillRow}>
        <HomeSkillCard
          title="Đọc"
          description="Đoạn văn theo cấp độ"
          action="Luyện đọc"
          pose="reading"
          onPress={() => onOpenSkill('reading')}
        />
        <HomeSkillCard
          title="Viết"
          description="Kana, Kanji và viết câu"
          action="Luyện viết"
          pose="writing"
          onPress={() => onOpenSkill('writing')}
        />
      </View>
      {onOpenPronunciation ? (
        <View style={styles.skillRow}>
          {onOpenPronunciation ? (
            <HomeSkillCard
              title="Luyện phát âm"
              description="Nghe mẫu và đọc theo"
              action="Luyện phát âm"
              pose="pronunciation"
              accessibilityLabel="Luyện phát âm"
              onPress={onOpenPronunciation}
            />
          ) : null}
          <View style={styles.emptySlot} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { gap: spacing.lg },
  emptySlot: { flex: 1 },
  skillRow: { flexDirection: 'row', alignItems: 'stretch', gap: spacing.lg },
});
