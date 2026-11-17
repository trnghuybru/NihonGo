import type { ComponentProps } from 'react';
import { StyleSheet, View } from 'react-native';
import { AuthShell } from './AuthForm';
import { ScreenBackHeader } from './ScreenBackHeader';
import { useWebLayout } from '../hooks/useWebLayout';
import { layout, spacing } from '../theme/theme';

export function WritingShell({
  onBack,
  ...props
}: ComponentProps<typeof AuthShell> & { onBack: () => void }) {
  const { desktop } = useWebLayout();
  return (
    <>
      {desktop ? (
        <View style={styles.desktopBackBar}>
          <ScreenBackHeader
            title="Luyện viết"
            backLabel="Quay lại"
            onBack={onBack}
          />
        </View>
      ) : null}
      <AuthShell
        {...props}
        wide={desktop}
        headerAccessory={desktop ? undefined : props.headerAccessory}
        navigationHeader={
          desktop ? undefined : (
            <ScreenBackHeader
              title="Luyện viết"
              backLabel="Quay lại"
              onBack={onBack}
            />
          )
        }
        footer={desktop ? undefined : props.footer}
      />
    </>
  );
}

const styles = StyleSheet.create({
  desktopBackBar: {
    width: '100%',
    maxWidth: layout.maxContentWidth,
    alignSelf: 'center',
    paddingHorizontal: spacing.section,
    paddingVertical: spacing.sm,
  },
});
