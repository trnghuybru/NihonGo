import { useEffect, useState } from 'react';
import type { RefObject } from 'react';
import Svg, {
  Defs,
  LinearGradient,
  Stop,
  Rect,
  Circle,
  Path,
  G,
  Ellipse,
  Image as SvgImage,
  ClipPath,
} from 'react-native-svg';
import { colors } from '../../theme/theme';
import { momoGameAtlas } from './MomoGameSprite';
import { momoSpriteFrame } from './spriteFrame';
import type { CastleBattle, CastleEvent, Troop } from './engine';
export type CastleSceneProps = {
  battleRef: RefObject<CastleBattle | null>;
  effectsRef: RefObject<CastleEvent[]>;
  height: number;
  reduced?: boolean;
};
export function CastleScene({
  battleRef,
  effectsRef,
  height,
  reduced = false,
}: CastleSceneProps) {
  const [clock, setClock] = useState(0);
  useEffect(() => {
    let frame = 0,
      last = 0;
    const tick = (time: number) => {
      if (time - last > 32) {
        setClock(time);
        last = time;
        effectsRef.current.length = 0;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [effectsRef]);
  const battle = battleRef.current;
  const troops = battle?.troops || [
    { id: -1, side: 0, x: 330, tier: 1 },
    { id: -2, side: 1, x: 870, tier: 1 },
  ];
  return (
    <Svg
      width="100%"
      height={height}
      viewBox="0 0 1200 360"
      preserveAspectRatio="xMidYMid meet"
      accessible
      accessibilityLabel="Momo bảo vệ hai lâu đài"
    >
      <Defs>
        <LinearGradient id="castleSky" x2="0" y2="1">
          <Stop offset="0" stopColor={colors.surfaceTint} />
          <Stop offset={0.65} stopColor={colors.badgeBg} />
          <Stop offset="1" stopColor={colors.background} />
        </LinearGradient>
      </Defs>
      <Rect width="1200" height="360" fill="url(#castleSky)" />
      <Circle cx="600" cy="120" r="58" fill={colors.primaryEnd} />
      <Path d="M290 288 610 88 920 288Z" fill="#e7d3bd" />
      <Path d="m610 88-56 35 41-7 22 12 27-13 28 8Z" fill={colors.surface} />
      <Path
        d="M0 265Q170 190 350 270Q490 225 700 280Q900 200 1200 265V360H0Z"
        fill="#decbba"
      />
      <Rect y="290" width="1200" height="70" fill={colors.track} />
      {[0, 1].map(side => (
        <G
          key={side}
          transform={`translate(${side === 0 ? 100 : 1100},290)`}
          opacity={battle?.players[side].hp === 0 ? 0.4 : 1}
        >
          <Path d="M-60 0-45-35H45L60 0Z" fill="#655967" />
          {[0, 1, 2].map(floor => (
            <G key={floor} transform={`translate(0,${-35 - floor * 36})`}>
              <Rect
                x={-45 + floor * 10}
                y="-32"
                width={90 - floor * 20}
                height="33"
                fill={side === 0 ? colors.badgeBg : colors.surfaceTint}
              />
              <Path
                d={`M${-63 + floor * 10} -27Q-48 -34 ${-43 + floor * 10} -44H${
                  43 - floor * 10
                }Q48 -34 ${63 - floor * 10} -27Q0 -19 ${-63 + floor * 10} -27Z`}
                fill={side === 0 ? colors.primary : colors.focus}
                stroke="#f4ce99"
                strokeWidth="2"
              />
              {[-1, 0, 1].map(n => (
                <Rect
                  key={n}
                  x={n * 15 - 3}
                  y="-23"
                  width="6"
                  height="11"
                  fill="#33405a"
                />
              ))}
            </G>
          ))}
          <Path d="M0-153V-187" stroke="#ffe3ac" strokeWidth="2" />
          <Path
            d="M0-185Q16-191 31-181V-164Q16-175 0-169Z"
            fill={side === 0 ? colors.primary : colors.focus}
          />
          <Rect x="-10" y="-26" width="20" height="26" rx="10" fill="#28334b" />
        </G>
      ))}
      {troops.map(t => {
        const frame = momoSpriteFrame(t.tier, 2, 2);
        const size = 92 + t.tier * 10;
        return (
          <G
            key={t.id}
            transform={`translate(${
              battle ? battle.visualX(t as Troop, clock) : t.x
            },${290 + Math.sin(reduced ? 0 : clock * 0.02 + t.id) * 2})`}
          >
            <Ellipse cy="2" rx="22" ry="5" fill={colors.border} />
            <Ellipse
              cy="1"
              rx="23"
              ry="6"
              stroke={t.side === 0 ? colors.primary : colors.focus}
              fill="none"
              strokeWidth="2"
            />
            <G transform={t.side === 1 ? 'scale(-1,1)' : undefined}>
              <Svg
                x={-size / 2}
                y={-size * 0.96}
                width={size}
                height={size}
                viewBox={[frame.x, frame.y, frame.width, frame.height].join(
                  ' ',
                )}
              >
                <Defs>
                  <ClipPath id={'momo-frame-' + t.id}>
                    <Rect x={frame.x} y={frame.y} width={1} height={1} />
                  </ClipPath>
                </Defs>
                <G clipPath={'url(#momo-frame-' + t.id + ')'}>
                  <SvgImage
                    width={2}
                    height={2}
                    href={momoGameAtlas}
                    preserveAspectRatio="none"
                  />
                </G>
              </Svg>
            </G>
            {t.tier > 0 ? (
              <Circle
                cy="-23"
                r={24 + t.tier * 3}
                stroke={colors.primary}
                strokeOpacity={0.5}
                fill="none"
              />
            ) : null}
          </G>
        );
      })}
    </Svg>
  );
}
