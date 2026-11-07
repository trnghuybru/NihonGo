import { momoSpriteFrame } from '../src/games/castle/spriteFrame';

test('four combo tiers map to separate complete cells of the generated atlas', () => {
  expect([0, 1, 2, 3].map(tier => momoSpriteFrame(tier, 1254, 1254))).toEqual([
    { x: 0, y: 0, width: 627, height: 627 },
    { x: 627, y: 0, width: 627, height: 627 },
    { x: 0, y: 627, width: 627, height: 627 },
    { x: 627, y: 627, width: 627, height: 627 },
  ]);
  expect(momoSpriteFrame(100, 2, 2)).toEqual(momoSpriteFrame(3, 2, 2));
  expect(momoSpriteFrame(-1, 2, 2)).toEqual(momoSpriteFrame(0, 2, 2));
  expect(momoSpriteFrame(NaN, 2, 2)).toEqual(momoSpriteFrame(0, 2, 2));
});
