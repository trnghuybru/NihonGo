import { Image, StyleSheet, View } from 'react-native';
import { momoSpriteFrame } from './spriteFrame';

export const momoGameAtlas = require('../../assets/games/momo-warriors-v1.png');

export function MomoGameSprite({
  size = 96,
  tier = 0,
  portrait = false,
  decorative = true,
}: {
  size?: number;
  tier?: number;
  portrait?: boolean;
  decorative?: boolean;
}) {
  const frame = momoSpriteFrame(tier, 2, 2);
  // Avatar lấy khuôn mặt/mũ; thumbnail và quân giữ trọn thân, tai, đuôi.
  const tile = portrait ? size / 0.62 : size;
  const left = -(frame.x + (portrait ? 0.19 : 0)) * tile;
  const top = -(frame.y + (portrait ? 0.08 : 0)) * tile;
  return (
    <View
      accessible={!decorative}
      accessibilityRole={decorative ? undefined : 'image'}
      accessibilityLabel={decorative ? undefined : 'Momo samurai'}
      style={[
        s.frame,
        { width: size, height: size, borderRadius: portrait ? size / 2 : 0 },
      ]}
    >
      <Image
        source={momoGameAtlas}
        resizeMode="stretch"
        accessible={false}
        style={[
          s.image,
          { width: tile * 2, maxWidth: tile * 2, height: tile * 2, left, top },
        ]}
      />
    </View>
  );
}
const s = StyleSheet.create({
  frame: { overflow: 'hidden', flexShrink: 0 },
  image: { position: 'absolute' },
});
