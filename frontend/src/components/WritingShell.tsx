import type { ComponentProps } from 'react';
import { AuthShell } from './AuthForm';
import { ScreenBackHeader } from './ScreenBackHeader';
import { useWebLayout } from '../hooks/useWebLayout';

export function WritingShell({
  onBack,
  ...props
}: ComponentProps<typeof AuthShell> & { onBack: () => void }) {
  const { desktop } = useWebLayout();
  return (
    <>
      {desktop ? (
        <ScreenBackHeader
          title="Luyện viết"
          backLabel="Quay lại"
          onBack={onBack}
        />
      ) : null}
      <AuthShell
        {...props}
        wide={desktop}
        headerAccessory={desktop ? undefined : props.headerAccessory}
        footer={desktop ? undefined : props.footer}
      />
    </>
  );
}
