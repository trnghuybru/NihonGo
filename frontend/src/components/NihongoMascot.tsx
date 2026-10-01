import { Image, ImageSourcePropType, StyleSheet } from 'react-native';

const poses = {
  wave: require('../assets/mascot/momo-wave.png') as ImageSourcePropType,
  listening:
    require('../assets/mascot/momo-listening.png') as ImageSourcePropType,
  speaking:
    require('../assets/mascot/momo-speaking.png') as ImageSourcePropType,
  reading: require('../assets/mascot/momo-reading.png') as ImageSourcePropType,
  writing: require('../assets/mascot/momo-writing.png') as ImageSourcePropType,
};

export type MascotPose = keyof typeof poses;

const descriptions: Record<MascotPose, string> = {
  wave: 'đang vẫy tay',
  listening: 'đang đeo tai nghe',
  speaking: 'đang cầm micro luyện nói',
  reading: 'đang đọc sách',
  writing: 'đang ngồi tập viết',
};

interface Props {
  size?: number;
  decorative?: boolean;
  pose?: MascotPose;
}

export function NihongoMascot({
  size = 96,
  decorative = false,
  pose = 'wave',
}: Props) {
  return (
    <Image
      source={poses[pose]}
      resizeMode="contain"
      accessible={!decorative}
      accessibilityLabel={
        decorative
          ? undefined
          : `Momo, linh vật tanuki của NihonGO ${descriptions[pose]}`
      }
      style={[styles.image, { width: size, height: size }]}
    />
  );
}

const styles = StyleSheet.create({
  image: { flexShrink: 0, maxWidth: '100%' },
});
