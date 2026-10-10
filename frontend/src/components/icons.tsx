import Svg, { Circle, Path, Rect, Text as SvgText } from 'react-native-svg';

type IconProps = {
  size?: number;
  color?: string;
  strokeWidth?: number;
};

export function TrashIcon({
  size = 20,
  color = '#75777D',
  strokeWidth = 1.7,
}: IconProps) {
  const s = stroke(color, strokeWidth);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M3 6h18M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M5 6l1 14a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1l1-14M10 10v7M14 10v7"
        {...s}
      />
    </Svg>
  );
}

function stroke(color: string, strokeWidth: number) {
  return {
    stroke: color,
    strokeWidth,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    fill: 'none' as const,
  };
}

export function MailIcon({
  size = 20,
  color = '#75777D',
  strokeWidth = 1.7,
}: IconProps) {
  const s = stroke(color, strokeWidth);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x="2" y="4" width="20" height="16" rx="2" {...s} />
      <Path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" {...s} />
    </Svg>
  );
}

export function LockIcon({
  size = 20,
  color = '#75777D',
  strokeWidth = 1.7,
}: IconProps) {
  const s = stroke(color, strokeWidth);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x="3" y="11" width="18" height="11" rx="2" {...s} />
      <Path d="M7 11V7a5 5 0 0 1 10 0v4" {...s} />
    </Svg>
  );
}

export function EyeIcon({
  size = 20,
  color = '#75777D',
  strokeWidth = 1.7,
}: IconProps) {
  const s = stroke(color, strokeWidth);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M2.06 12.35a1 1 0 0 1 0-.7 10.75 10.75 0 0 1 19.88 0 1 1 0 0 1 0 .7 10.75 10.75 0 0 1-19.88 0"
        {...s}
      />
      <Circle cx="12" cy="12" r="3" {...s} />
    </Svg>
  );
}

export function EyeOffIcon({
  size = 20,
  color = '#75777D',
  strokeWidth = 1.7,
}: IconProps) {
  const s = stroke(color, strokeWidth);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M10.73 5.08a10.74 10.74 0 0 1 11.2 6.57 1 1 0 0 1 0 .7 10.75 10.75 0 0 1-1.44 2.49"
        {...s}
      />
      <Path d="M14.08 14.16a3 3 0 0 1-4.24-4.25" {...s} />
      <Path
        d="M17.48 17.5a10.75 10.75 0 0 1-15.42-5.15 1 1 0 0 1 0-.7 10.75 10.75 0 0 1 4.45-5.14"
        {...s}
      />
      <Path d="m2 2 20 20" {...s} />
    </Svg>
  );
}

export function ArrowRightIcon({
  size = 20,
  color = '#FFFFFF',
  strokeWidth = 2.2,
}: IconProps) {
  const s = stroke(color, strokeWidth);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M5 12h14" {...s} />
      <Path d="m12 5 7 7-7 7" {...s} />
    </Svg>
  );
}

export function CheckIcon({
  size = 20,
  color = '#FFFFFF',
  strokeWidth = 3,
}: IconProps) {
  const s = stroke(color, strokeWidth);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M20 6 9 17l-5-5" {...s} />
    </Svg>
  );
}

export function FingerprintIcon({
  size = 20,
  color = '#091426',
  strokeWidth = 1.6,
}: IconProps) {
  const s = stroke(color, strokeWidth);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M12 10a2 2 0 0 0-2 2c0 1.02-.1 2.51-.26 4" {...s} />
      <Path d="M14 13.12c0 2.38 0 6.38-1 8.88" {...s} />
      <Path d="M17.29 21.02c.12-.6.43-2.3.5-3.02" {...s} />
      <Path d="M2 12a10 10 0 0 1 18-6" {...s} />
      <Path d="M2 16h.01" {...s} />
      <Path d="M21.8 16c.2-2 .131-5.354 0-6" {...s} />
      <Path d="M5 19.5C5.5 18 6 15 6 12a6 6 0 0 1 .34-2" {...s} />
      <Path d="M8.65 22c.21-.66.45-1.32.57-2" {...s} />
      <Path d="M9 6.8a6 6 0 0 1 9 5.2v2" {...s} />
    </Svg>
  );
}

export function GoogleIcon({ size = 20 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 18 18" fill="none">
      <Path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92a8.78 8.78 0 0 0 2.68-6.62z"
      />
      <Path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.81.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.32A9 9 0 0 0 9 18z"
      />
      <Path
        fill="#FBBC05"
        d="M3.97 10.72a5.41 5.41 0 0 1 0-3.44V4.96H.96a9 9 0 0 0 0 8.08l3.01-2.32z"
      />
      <Path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.59A9 9 0 0 0 .96 4.96l3.01 2.32C4.68 5.16 6.66 3.58 9 3.58z"
      />
    </Svg>
  );
}

export function AppleIcon({
  size = 20,
  color = '#091426',
}: {
  size?: number;
  color?: string;
}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 814 1000" fill="none">
      <Path
        fill={color}
        d="M788.1 340.9c-5.8 4.5-108.2 62.2-108.2 190.5 0 148.4 130.3 200.9 134.2 202.2-.6 3.2-20.7 71.9-68.7 141.9-42.8 61.6-87.5 123.1-155.5 123.1s-85.5-39.5-164-39.5c-76.5 0-103.7 40.8-165.9 40.8s-105.6-57-155.5-127C46.7 790.7 0 663 0 541.8c0-194.4 126.4-297.5 250.8-297.5 66.1 0 121.2 43.4 162.7 43.4 39.5 0 101.1-46 176.3-46 28.5 0 130.9 2.6 198.3 99.2zm-234-181.5c31.1-36.9 53.1-88.1 53.1-139.3 0-7.1-.6-14.3-1.9-20.1-50.6 1.9-110.8 33.7-147.1 75.8-28.5 32.4-55.1 83.6-55.1 135.5 0 7.8 1.3 15.6 1.9 18.1 3.2.6 8.4 1.3 13.6 1.3 45.4 0 102.5-30.4 135.5-71.3z"
      />
    </Svg>
  );
}

export function LineIcon({ size = 20 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        fill="#06C755"
        d="M12 2.2C6.4 2.2 1.8 5.9 1.8 10.5c0 4.2 3.7 7.7 8.8 8.4.3.04.8.14.92.4.1.25.07.62.03.9l-.14.9c-.05.26-.22 1.03.9.56 1.13-.47 6.05-3.55 8.26-6.08 1.5-1.66 2.3-3.34 2.3-5.38C22.9 5.9 17.6 2.2 12 2.2Z"
      />
      <SvgText
        x="12"
        y="13.2"
        textAnchor="middle"
        fontSize="5.5"
        fontWeight="700"
        fill="#FFFFFF"
      >
        LINE
      </SvgText>
    </Svg>
  );
}

export function MicIcon({
  size = 24,
  color = '#FFFFFF',
  strokeWidth = 2,
}: IconProps) {
  const s = stroke(color, strokeWidth);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" {...s} />
      <Path d="M19 10v2a7 7 0 0 1-14 0v-2" {...s} />
      <Path d="M12 19v4" {...s} />
      <Path d="M8 23h8" {...s} />
    </Svg>
  );
}

export function MicOffIcon({
  size = 24,
  color = '#FFFFFF',
  strokeWidth = 2,
}: IconProps) {
  const s = stroke(color, strokeWidth);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="m2 2 20 20" {...s} />
      <Path d="M18.89 13.23A7.12 7.12 0 0 0 19 12v-2" {...s} />
      <Path d="M5 10v2a7 7 0 0 0 12 5" {...s} />
      <Path d="M15 9.34V5a3 3 0 0 0-5.68-1.33" {...s} />
      <Path d="M9 9v3a3 3 0 0 0 5.12 2.12" {...s} />
      <Path d="M12 19v4" {...s} />
      <Path d="M8 23h8" {...s} />
    </Svg>
  );
}

export function VolumeIcon({
  size = 22,
  color = '#BA0035',
  strokeWidth = 2,
}: IconProps) {
  const s = stroke(color, strokeWidth);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M11 5 6 9H2v6h4l5 4V5Z" {...s} />
      <Path d="M15.54 8.46a5 5 0 0 1 0 7.07" {...s} />
      <Path d="M19.07 4.93a10 10 0 0 1 0 14.14" {...s} />
    </Svg>
  );
}

export function VolumeXIcon({
  size = 22,
  color = '#75777D',
  strokeWidth = 2,
}: IconProps) {
  const s = stroke(color, strokeWidth);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M11 5 6 9H2v6h4l5 4V5Z" {...s} />
      <Path d="m22 9-6 6" {...s} />
      <Path d="m16 9 6 6" {...s} />
    </Svg>
  );
}

export function RefreshIcon({
  size = 20,
  color = '#75777D',
  strokeWidth = 2,
}: IconProps) {
  const s = stroke(color, strokeWidth);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" {...s} />
      <Path d="M3 3v5h5" {...s} />
      <Path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" {...s} />
      <Path d="M16 21h5v-5" {...s} />
    </Svg>
  );
}

export function MessageSquareIcon({
  size = 20,
  color = '#75777D',
  strokeWidth = 2,
}: IconProps) {
  const s = stroke(color, strokeWidth);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"
        {...s}
      />
    </Svg>
  );
}

export function KeyboardIcon({
  size = 20,
  color = '#75777D',
  strokeWidth = 1.8,
}: IconProps) {
  const s = stroke(color, strokeWidth);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x="2" y="4" width="20" height="16" rx="2" {...s} />
      <Path
        d="M6 8h.01M10 8h.01M14 8h.01M18 8h.01M8 12h.01M12 12h.01M16 12h.01M7 16h10"
        {...s}
      />
    </Svg>
  );
}

export function XIcon({
  size = 20,
  color = '#75777D',
  strokeWidth = 2,
}: IconProps) {
  const s = stroke(color, strokeWidth);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M18 6 6 18M6 6l12 12" {...s} />
    </Svg>
  );
}

export function ChevronDownIcon({
  size = 20,
  color = '#75777D',
  strokeWidth = 2,
}: IconProps) {
  const s = stroke(color, strokeWidth);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="m6 9 6 6 6-6" {...s} />
    </Svg>
  );
}
