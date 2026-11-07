import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';
import type { CastleBattle, CastleEvent } from './engine';
import { CastlePainter } from './drawing';
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
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const node = canvas.current,
      context = node?.getContext('2d');
    if (!node || !context) return;
    const painter = new CastlePainter(context);
    const momo = new Image();
    momo.onload = () => painter.setMomo(momo);
    momo.src = new URL(
      '../../assets/games/momo-warriors-v1.png',
      import.meta.url,
    ).href;
    let width = 0,
      pixelHeight = 0,
      frame = 0;
    const resize = () => {
      const rect = node.getBoundingClientRect(),
        dpr = Math.min(2, window.devicePixelRatio || 1);
      width = rect.width;
      pixelHeight = rect.height;
      node.width = Math.round(width * dpr);
      node.height = Math.round(pixelHeight * dpr);
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(node);
    resize();
    const draw = (time: number) => {
      painter.effects(effectsRef.current.splice(0));
      painter.render(width, pixelHeight, time, battleRef.current, reduced);
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      momo.onload = null;
    };
  }, [battleRef, effectsRef, reduced]);
  return (
    <canvas
      ref={canvas}
      role="img"
      aria-label="Momo bảo vệ hai lâu đài"
      style={{ display: 'block', width: '100%', height }}
    />
  );
}
