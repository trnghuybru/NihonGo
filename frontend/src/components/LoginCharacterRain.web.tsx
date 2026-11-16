import type { CSSProperties } from 'react';
import './LoginCharacterRain.css';

const SENTENCE = Array.from('日本語を学ぶ毎日は新しい発見でいっぱいです。');
const COLUMN_COUNT = 56;
const MOBILE_COLUMN_COUNT = 30;

export function LoginCharacterRain() {
  return (
    <div
      className="login-character-rain"
      aria-hidden="true"
      data-testid="login-character-rain"
    >
      {Array.from({ length: COLUMN_COUNT + MOBILE_COLUMN_COUNT }, (_, item) => {
        const mobile = item >= COLUMN_COUNT;
        const column = mobile ? item - COLUMN_COUNT : item;
        const count = mobile ? MOBILE_COLUMN_COUNT : COLUMN_COUNT;
        const duration = 15 + ((column * 7) % 11);
        const delay = -((column * 13) % 25);
        return (
          <div
            className={`login-character-rain__column login-character-rain__column--${mobile ? 'mobile' : 'desktop'}`}
            key={item}
            style={
              {
                left: `${((column + 0.5) / count) * 100}%`,
                animationDuration: `${duration}s`,
                animationDelay: `${delay}s`,
              } as CSSProperties
            }
          >
            {SENTENCE.map((character, index) => (
              <span
                className={`login-character-rain__character login-character-rain__character--${index > SENTENCE.length * 0.7 ? 'head' : index > SENTENCE.length * 0.4 ? 'middle' : 'tail'}`}
                key={index}
                style={{
                  opacity: 0.12 + 0.68 * Math.pow(index / (SENTENCE.length - 1), 2),
                }}
              >
                {character}
              </span>
            ))}
          </div>
        );
      })}
    </div>
  );
}
