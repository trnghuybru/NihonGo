import { StyleSheet, View } from 'react-native';
import { HomeSkillCard } from './HomeSkillCard';
import { spacing } from '../theme/theme';

export type LearningSkill = 'listening' | 'speaking' | 'reading' | 'writing';

export function SkillPicker({
  onOpenSkill,
}: {
  onOpenSkill: (skill: LearningSkill) => void;
}) {
  return (
    <View style={styles.grid}>
      <View style={styles.skillRow}>
        <HomeSkillCard
          title="Nghe"
          japaneseLabel="聞く"
          description="Hội thoại và phát âm"
          action="Luyện nghe"
          pose="listening"
          onPress={() => onOpenSkill('listening')}
        />
        <HomeSkillCard
          title="Nói"
          japaneseLabel="話す"
          description="Luyện nói theo tình huống"
          action="Xem tình huống"
          pose="speaking"
          onPress={() => onOpenSkill('speaking')}
        />
      </View>
      <View style={styles.skillRow}>
        <HomeSkillCard
          title="Đọc"
          japaneseLabel="読む"
          description="Đoạn văn theo cấp độ"
          action="Luyện đọc"
          pose="reading"
          onPress={() => onOpenSkill('reading')}
        />
        <HomeSkillCard
          title="Viết"
          japaneseLabel="書く"
          description="Kana, Kanji và viết câu"
          action="Luyện viết"
          pose="writing"
          onPress={() => onOpenSkill('writing')}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { gap: spacing.xl },
  skillRow: { flexDirection: 'row', alignItems: 'stretch', gap: spacing.xl },
});
