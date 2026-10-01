import { Platform } from 'react-native';

export const colors = {
  primary: '#FCA04B',
  primaryEnd: '#FFB974',
  primaryPressed: '#F28D35',
  primaryText: '#FCA04B',
  onPrimary: '#FFFFFF',
  dark: '#252526',
  body: '#4D4D4F',
  muted: '#77716C',
  inputText: '#252526',
  placeholder: '#82766C',
  background: '#FFFBF7',
  backgroundRose: '#FFF1F2',
  surface: '#FFFFFF',
  surfaceTint: '#FFF8F1',
  divider: '#F1E7DE',
  border: '#E5D9CF',
  focus: '#B65A13',
  track: '#F8EDE2',
  badgeBg: '#FFF0DE',
  badgeText: '#91430E',
  checkboxBorder: '#C8B8AB',
  success: '#34704A',
  successBg: '#EFF8ED',
  danger: '#B33A37',
  dangerBg: '#FFF0EF',
  disabled: '#F0E8E1',
  disabledText: '#7C7065',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  section: 32,
} as const;
export const radius = { input: 18, small: 16, card: 32, pill: 999 } as const;
export const layout = {
  screenGutter: 20,
  maxContentWidth: 480,
  inputHeight: 56,
  buttonHeight: 52,
  touchTarget: 48,
} as const;
// Android uses the exact asset face. Its weight is embedded in the TTF;
// keep fontWeight normal to avoid synthetic bold. iOS resolves the family weight.
const fontFaces = {
  '400': 'ReadexPro-Regular',
  '500': 'ReadexPro-Medium',
  '600': 'ReadexPro-SemiBold',
} as const;
export function readexFont(weight: keyof typeof fontFaces) {
  return {
    fontFamily: Platform.OS === 'ios' ? 'Readex Pro' : fontFaces[weight],
    fontWeight: Platform.OS === 'ios' ? weight : ('normal' as const),
  };
}
export const typography = {
  title: { ...readexFont('600'), fontSize: 18, lineHeight: 24 },
  heading: { ...readexFont('500'), fontSize: 16, lineHeight: 20 },
  body: { ...readexFont('400'), fontSize: 12, lineHeight: 16 },
  label: { ...readexFont('500'), fontSize: 14, lineHeight: 20 },
  caption: { ...readexFont('500'), fontSize: 12, lineHeight: 16 },
  button: { ...readexFont('600'), fontSize: 14, lineHeight: 20 },
  link: { ...readexFont('500'), fontSize: 12, lineHeight: 16 },
  input: { ...readexFont('400'), fontSize: 14, lineHeight: 20 },
  code: { ...readexFont('600'), fontSize: 18, lineHeight: 24 },
  brand: {
    ...readexFont('600'),
    fontSize: 24,
    lineHeight: 32,
    letterSpacing: -0.6,
  },
} as const;

export const shadowSm = '0px 2px 12px rgba(231, 142, 58, 0.06)';

export const shadowMd = '0px 2px 30px rgba(231, 142, 58, 0.10)';

export const gradientPrimary = `linear-gradient(90deg, ${colors.primary} 0%, ${colors.primaryEnd} 100%)`;

export const serifFont = Platform.select({
  ios: 'Georgia',
  android: 'serif',
  default: 'serif',
});
