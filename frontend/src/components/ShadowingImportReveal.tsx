import type { ReactNode } from 'react';

export function ShadowingImportReveal({
  open,
  children,
}: {
  open: boolean;
  children: ReactNode;
}) {
  return open ? <>{children}</> : null;
}
