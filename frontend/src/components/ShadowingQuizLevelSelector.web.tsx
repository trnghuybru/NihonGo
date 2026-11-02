import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent } from 'react';
import type { ShadowingQuizLevel } from '../services/shadowingService';
import { colors, radius, shadowMd, typography } from '../theme/theme';
import '../../web/quiz-level.css';

const levels = ['N5', 'N4', 'N3', 'N2', 'N1'] as const;
const theme = {
  '--quiz-primary': colors.primary,
  '--quiz-on-primary': colors.onPrimary,
  '--quiz-surface': colors.surface,
  '--quiz-tint': colors.surfaceTint,
  '--quiz-border': colors.border,
  '--quiz-focus': colors.focus,
  '--quiz-text': colors.dark,
  '--quiz-disabled': colors.disabled,
  '--quiz-disabled-text': colors.disabledText,
  '--quiz-radius': `${radius.input}px`,
  '--quiz-shadow': shadowMd,
  '--quiz-font': `${typography.input.fontFamily}, sans-serif`,
} as CSSProperties;

export function ShadowingQuizLevelSelector({
  level,
  loading,
  onChange,
}: {
  level: ShadowingQuizLevel;
  loading: boolean;
  onChange: (level: ShadowingQuizLevel) => void;
}) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const options = useRef<(HTMLButtonElement | null)[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [position, setPosition] = useState<CSSProperties>({});
  const close = (restoreFocus = false) => {
    setOpen(false);
    if (restoreFocus) trigger.current?.focus();
  };
  const show = () => {
    setActive(levels.indexOf(level));
    setOpen(true);
  };
  useLayoutEffect(() => {
    if (!open) return;
    const measure = () => {
      const rect = trigger.current?.getBoundingClientRect();
      if (!rect) return;
      const height = 234;
      const below = window.innerHeight - rect.bottom - 8;
      const above = below < height && rect.top > below;
      setPosition({
        left: Math.max(
          12,
          Math.min(rect.left, window.innerWidth - rect.width - 12),
        ),
        top: above ? Math.max(12, rect.top - height - 6) : rect.bottom + 6,
        width: rect.width,
        maxHeight: Math.max(
          80,
          Math.min(height, (above ? rect.top : below) - 12),
        ),
      });
    };
    measure();
    // Top-layer popovers escape scroll clipping while staying inside modal focus scope.
    menu.current?.showPopover();
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [open]);
  useLayoutEffect(() => {
    if (open) options.current[active]?.focus();
  }, [open, active]);
  useEffect(() => {
    if (loading) setOpen(false);
  }, [loading]);
  const onMenuKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      close(true);
    } else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      setActive(index =>
        event.key === 'Home'
          ? 0
          : event.key === 'End'
          ? 4
          : (index + (event.key === 'ArrowDown' ? 1 : 4)) % 5,
      );
    }
  };
  return (
    <span
      className="ng-quiz-level"
      style={theme}
      onBlur={event => {
        if (!event.currentTarget.contains(event.relatedTarget)) close();
      }}
    >
      <button
        ref={trigger}
        type="button"
        className="ng-quiz-level-trigger"
        role="combobox"
        aria-label="Trình độ câu hỏi"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        disabled={loading}
        onClick={() => (open ? close() : show())}
        onKeyDown={event => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            show();
          }
        }}
      >
        <span>{level}</span>
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="m6 9 6 6 6-6"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      {open ? (
        <div
          ref={menu}
          id={id}
          popover="auto"
          role="listbox"
          aria-label="Trình độ câu hỏi"
          className="ng-quiz-level-menu"
          style={position}
          onKeyDown={onMenuKeyDown}
          onToggle={event => {
            if (event.newState === 'closed') close();
          }}
        >
          {levels.map((value, index) => (
            <button
              key={value}
              ref={element => {
                options.current[index] = element;
              }}
              type="button"
              role="option"
              aria-selected={value === level}
              tabIndex={index === active ? 0 : -1}
              className="ng-quiz-level-option"
              onFocus={() => setActive(index)}
              onClick={() => {
                close(true);
                onChange(value);
              }}
            >
              {value}
            </button>
          ))}
        </div>
      ) : null}
    </span>
  );
}
