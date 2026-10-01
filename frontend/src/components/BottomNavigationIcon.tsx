import Svg, { Circle, Path } from 'react-native-svg';
import { HomeFeatureIcon } from './HomeFeatureIcon';

export type BottomNavigationIconName =
  | 'home'
  | 'practice'
  | 'vocabulary'
  | 'profile';

interface Props {
  name: BottomNavigationIconName;
  color: string;
  size?: number;
}

export function BottomNavigationIcon({ name, color, size = 28 }: Props) {
  if (name === 'practice' || name === 'vocabulary') {
    return (
      <HomeFeatureIcon
        name={name === 'practice' ? 'reading' : 'vocabulary'}
        color={color}
        size={size}
      />
    );
  }
  const stroke = {
    stroke: color,
    strokeWidth: 1.9,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    fill: 'none' as const,
  };

  return (
    <Svg width={size} height={size} viewBox="0 0 28 28" accessible={false}>
      {name === 'home' ? (
        <>
          <Path d="M3.4 12.4 14 3.7l10.6 8.7" {...stroke} />
          <Path
            d="M5.8 11.1v11.2a2 2 0 0 0 2 2h4.1v-6.5h4.2v6.5h4.1a2 2 0 0 0 2-2V11.1"
            {...stroke}
          />
        </>
      ) : null}
      {name === 'profile' ? (
        <>
          <Circle cx="14" cy="8.3" r="4.5" {...stroke} />
          <Path
            d="M5.2 24.1c.7-5 3.6-7.5 8.8-7.5s8.1 2.5 8.8 7.5c-2.5.7-5.5 1.1-8.8 1.1s-6.3-.4-8.8-1.1Z"
            {...stroke}
          />
        </>
      ) : null}
    </Svg>
  );
}
