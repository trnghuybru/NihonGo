import Svg, { Circle, Path, Rect } from 'react-native-svg';

export type HomeFeatureIconName =
  | 'bell'
  | 'flame'
  | 'crown'
  | 'calendar'
  | 'clock'
  | 'search'
  | 'headphones'
  | 'microphone'
  | 'reading'
  | 'writing'
  | 'vocabulary'
  | 'flashcards'
  | 'gamepad'
  | 'lightbulb'
  | 'sparkles'
  | 'settings'
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
      {name === 'bell' ? (
        <Path
          d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"
          {...stroke}
        />
      ) : null}
      {name === 'crown' ? (
        <Path d="m3 7 4.5 4L12 5l4.5 6L21 7l-2 12H5L3 7Z" {...stroke} />
      ) : null}
      {name === 'flame' ? (
        <Path
          d="M13 3c1 5-3 6-3 9-2-.5-2-2-2-3-2 2-3 4-3 6a7 7 0 0 0 14 0c0-4-3-8-6-12Z"
          fill={color}
        />
      ) : null}
      {name === 'calendar' ? (
        <>
          <Rect x="3" y="5" width="18" height="16" rx="2" {...stroke} />
          <Path d="M7 3v4m10-4v4M3 10h18" {...stroke} />
        </>
      ) : null}
      {name === 'clock' ? (
        <>
          <Circle cx="12" cy="13" r="8" {...stroke} />
          <Path d="M12 9v4l3 2M9 2h6" {...stroke} />
        </>
      ) : null}
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
      {name === 'flashcards' ? (
        <>
          <Path
            d="M7 4V3a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-1"
            {...stroke}
          />
          <Rect x="3" y="6" width="14" height="16" rx="2" {...stroke} />
          <Path d="M7 12h6M7 16h4" {...stroke} />
        </>
      ) : null}
      {name === 'gamepad' ? (
        <>
          <Path
            d="M7 7h10a4 4 0 0 1 3.9 3.2l1.2 6a3 3 0 0 1-5 2.7L14.5 17h-5l-2.6 1.9a3 3 0 0 1-5-2.7l1.2-6A4 4 0 0 1 7 7Z"
            {...stroke}
          />
          <Path d="M6 11v4M4 13h4" {...stroke} />
          <Circle cx="16" cy="11" r="1" fill={color} />
          <Circle cx="18" cy="14" r="1" fill={color} />
        </>
      ) : null}
      {name === 'lightbulb' ? (
        <>
          <Path
            d="M9 17v-1.5c0-1.2-1.2-1.9-2-2.8a6 6 0 1 1 10 0c-.8.9-2 1.6-2 2.8V17M9 17h6M9.5 20h5M11 22h2"
            {...stroke}
          />
          <Path d="M3 5l-1-1M21 5l1-1M2 11H1M22 11h1" {...stroke} />
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
      {name === 'settings' ? (
        <>
          <Path
            d="m9 3-.6 2.1-1.9 1.1L4.4 6 2 10l1.5 1.6v.8L2 14l2.4 4 2.1-.2 1.9 1.1L9 21h6l.6-2.1 1.9-1.1 2.1.2 2.4-4-1.5-1.6v-.8L22 10l-2.4-4-2.1.2-1.9-1.1L15 3H9Z"
            {...stroke}
          />
          <Circle cx="12" cy="12" r="3" {...stroke} />
        </>
      ) : null}
      {name === 'arrow' ? <Path d="M5 12h14m-5-5 5 5-5 5" {...stroke} /> : null}
    </Svg>
  );
}
