import type { ComponentRef, ReactNode } from 'react';
import type { View } from 'react-native';

export type SpeakingWorkspacePortalProps = {
  target: ComponentRef<typeof View> | null;
  name: 'controls' | 'chat';
  children: ReactNode;
};

// Desktop web supplies DOM portals; native rendering keeps the children inline.
export function SpeakingWorkspacePortal({
  children,
}: SpeakingWorkspacePortalProps) {
  return <>{children}</>;
}
