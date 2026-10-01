import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { colors } from '../theme/theme';

export type AuthIconName =
  | 'mail'
  | 'lock'
  | 'user'
  | 'phone'
  | 'shield'
  | 'arrow'
  | 'check'
  | 'back';

export function AuthIcon({
  name,
  size = 20,
  color = colors.primaryText,
}: {
  name: AuthIconName;
  size?: number;
  color?: string;
}) {
  const stroke = {
    stroke: color,
    strokeWidth: 1.7,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    fill: 'none',
  };
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessible={false}>
      {name === 'mail' ? (
        <>
          <Rect x="3" y="5" width="18" height="14" rx="4" {...stroke} />
          <Path d="m4 7 8 6 8-6" {...stroke} />
        </>
      ) : null}
      {name === 'lock' ? (
        <>
          <Rect x="5" y="10" width="14" height="11" rx="4" {...stroke} />
          <Path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3" {...stroke} />
        </>
      ) : null}
      {name === 'user' ? (
        <>
          <Circle cx="12" cy="7.5" r="3.5" {...stroke} />
          <Path d="M5 21v-2a7 7 0 0 1 14 0v2" {...stroke} />
        </>
      ) : null}
      {name === 'phone' ? (
        <>
          <Rect x="6" y="2" width="12" height="20" rx="4" {...stroke} />
          <Path d="M10 5h4M11 18h2" {...stroke} />
        </>
      ) : null}
      {name === 'shield' ? (
        <>
          <Path d="M12 2 4 5v6c0 5 3 8 8 11 5-3 8-6 8-11V5l-8-3Z" {...stroke} />
          <Path d="m8.5 11.5 2.5 2.5 4.5-5" {...stroke} />
        </>
      ) : null}
      {name === 'arrow' ? <Path d="M5 12h14m-6-6 6 6-6 6" {...stroke} /> : null}
      {name === 'back' ? <Path d="M19 12H5m6-6-6 6 6 6" {...stroke} /> : null}
      {name === 'check' ? <Path d="m5 12 4 4L19 6" {...stroke} /> : null}
    </Svg>
  );
}
