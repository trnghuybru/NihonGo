import type { ReactNode } from 'react';
import './ShadowingImportReveal.css';

export function ShadowingImportReveal({
  open,
  children,
}: {
  open: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={`shadowing-import-reveal${open ? ' shadowing-import-reveal--open' : ''}`}
      aria-hidden={!open}
      data-testid="shadowing-import-reveal"
    >
      <div className="shadowing-import-reveal__content">{children}</div>
    </div>
  );
}
