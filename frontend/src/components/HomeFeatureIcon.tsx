import Svg, { Circle, Path, Rect } from 'react-native-svg';

export type HomeFeatureIconName =
  | 'search'
  | 'headphones'
  | 'microphone'
  | 'reading'
  | 'writing'
  | 'vocabulary'
  | 'sparkles'
  | 'arrow';

interface Props {
  name: HomeFeatureIconName;
  color: string;
  size?: number;
}

export function HomeFeatureIcon({ name, color, size = 24 }: Props) {
  const stroke = {
    stroke: color,
    strokeWidth: 1.9,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    fill: 'none' as const,
  };

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessible={false}>
      {name === 'search' ? (
        <>
          <Circle cx="10.8" cy="10.8" r="6.8" {...stroke} />
          <Path d="m16 16 4.5 4.5" {...stroke} />
        </>
      ) : null}
      {name === 'headphones' ? (
        <>
          <Path d="M4 13v-2a8 8 0 0 1 16 0v2" {...stroke} />
          <Path
            d="M4 13h2.2A1.8 1.8 0 0 1 8 14.8v3.4A1.8 1.8 0 0 1 6.2 20H5a1 1 0 0 1-1-1v-6ZM20 13h-2.2a1.8 1.8 0 0 0-1.8 1.8v3.4a1.8 1.8 0 0 0 1.8 1.8H19a1 1 0 0 0 1-1v-6Z"
            {...stroke}
          />
        </>
      ) : null}
      {name === 'microphone' ? (
        <>
          <Rect x="9" y="3" width="6" height="11" rx="3" {...stroke} />
          <Path
            d="M5.5 11.5v.8a6.5 6.5 0 0 0 13 0v-.8M12 18.8V22M8.5 22h7"
            {...stroke}
          />
        </>
      ) : null}
      {name === 'reading' ? (
        <>
          <Path
            d="M3 5.2A10.8 10.8 0 0 1 12 7.4V21a10.8 10.8 0 0 0-9-2.2V5.2Z"
            {...stroke}
          />
          <Path
            d="M21 5.2A10.8 10.8 0 0 0 12 7.4V21a10.8 10.8 0 0 1 9-2.2V5.2Z"
            {...stroke}
          />
        </>
      ) : null}
      {name === 'writing' ? (
        <>
          <Path
            d="m4 20 4.2-1 10.9-10.9a2.1 2.1 0 0 0-3-3L5.2 16 4 20Z"
            {...stroke}
          />
          <Path d="m14.7 6.5 2.8 2.8M4 22h16" {...stroke} />
        </>
      ) : null}
      {name === 'vocabulary' ? (
        <>
          <Rect x="3" y="4" width="18" height="16" rx="4" {...stroke} />
          <Path d="M7 9h4M7 13h6M16 9h1M16 13h1M7 17h10" {...stroke} />
        </>
      ) : null}
      {name === 'sparkles' ? (
        <>
          <Path
            d="M12 3c.8 4.3 2.7 6.2 7 7-4.3.8-6.2 2.7-7 7-.8-4.3-2.7-6.2-7-7 4.3-.8 6.2-2.7 7-7Z"
            {...stroke}
          />
          <Path
            d="M19 16c.3 1.7 1.1 2.5 2.8 2.8-1.7.3-2.5 1.1-2.8 2.8-.3-1.7-1.1-2.5-2.8-2.8 1.7-.3 2.5-1.1 2.8-2.8Z"
            {...stroke}
          />
        </>
      ) : null}
      {name === 'arrow' ? <Path d="M5 12h14m-5-5 5 5-5 5" {...stroke} /> : null}
    </Svg>
  );
}
