declare module 'react-native-flip-card' {
  import type { ComponentType, ReactNode } from 'react';
  import type { StyleProp, ViewStyle } from 'react-native';
  const FlipCard: ComponentType<{
    children: ReactNode[];
    flip: boolean;
    clickable: boolean;
    flipHorizontal: boolean;
    flipVertical: boolean;
    friction?: number;
    perspective?: number;
    useNativeDriver?: boolean;
    style?: StyleProp<ViewStyle>;
    testID?: string;
    onFlipEnd?: (flipped: boolean) => void;
  }>;
  export default FlipCard;
}
