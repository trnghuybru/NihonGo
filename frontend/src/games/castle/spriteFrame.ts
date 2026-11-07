// Atlas 2×2: tân binh, chiến binh, tinh nhuệ, thần tướng.
// Canvas, SVG native và thumbnail dùng cùng tọa độ để không lệch cấp.
export function momoSpriteFrame(tier: number, width: number, height: number) {
  const index = Number.isFinite(tier)
    ? Math.max(0, Math.min(3, Math.floor(tier)))
    : 0;
  return {
    x: ((index % 2) * width) / 2,
    y: (Math.floor(index / 2) * height) / 2,
    width: width / 2,
    height: height / 2,
  };
}
