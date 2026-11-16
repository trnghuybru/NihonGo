import { createPortal } from 'react-dom';
import type { SpeakingWorkspacePortalProps } from './SpeakingWorkspacePortal';

export function SpeakingWorkspacePortal({
  target,
  children,
}: SpeakingWorkspacePortalProps) {
  return target ? createPortal(children, target as unknown as Element) : null;
}
