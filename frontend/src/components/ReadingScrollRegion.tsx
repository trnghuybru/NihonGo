import type { ComponentRef, Ref } from 'react';
import { ScrollView, View } from 'react-native';
import type { ScrollViewProps } from 'react-native';

type Props = Pick<
  ScrollViewProps,
  | 'children'
  | 'testID'
  | 'accessibilityLabel'
  | 'onLayout'
  | 'style'
  | 'contentContainerStyle'
> & { scrollable: boolean; scrollRef?: Ref<ComponentRef<typeof ScrollView>> };

// A disabled web ScrollView applies touch-action:none and blocks ancestor swipes.
// Non-scrolling regions must be ordinary Views so the active scroller owns touch.
export function ReadingScrollRegion({
  scrollable,
  scrollRef,
  style,
  contentContainerStyle,
  children,
  ...props
}: Props) {
  return scrollable ? (
    <ScrollView
      {...props}
      ref={scrollRef}
      style={style}
      contentContainerStyle={contentContainerStyle}
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  ) : (
    <View {...props} style={[style, contentContainerStyle]}>
      {children}
    </View>
  );
}
