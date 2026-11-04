import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import type { GenkoEditorProps } from './GenkoEditor.types';
import { colors, radius, typography } from '../theme/theme';
import '../../web/genko-editor.css';

export function GenkoEditor({
  value,
  onChangeText,
  editable,
  onComposingChange,
}: GenkoEditorProps) {
  const container = useRef<HTMLDivElement>(null);
  const gridWindow = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const composing = useRef(false);
  const [compositionValue, setCompositionValue] = useState<string | null>(null);
  const [width, setWidth] = useState(0);
  const [vertical, setVertical] = useState(false);
  useLayoutEffect(() => {
    const element = container.current;
    if (!element) return;
    const measure = () => setWidth(element.getBoundingClientRect().width);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useEffect(
    () => () => {
      if (composing.current) onComposingChange?.(false);
    },
    [onComposingChange],
  );

  const targetCell = width >= 640 ? 32 : 28;
  const padding = width >= 640 ? 16 : 12;
  const available = width ? width - padding * 2 - 2 : targetCell * 10;
  const columns = width
    ? Math.min(20, Math.max(1, Math.floor(available / targetCell)))
    : 10;
  // Match browser subpixel text advances so the last character stays in its cell.
  const cell = Math.floor((available / columns) * 64) / 64;
  const rows = width >= 640 ? 10 : 8;
  const fontSize = width >= 640 ? 20 : 18;
  const letterSpace = cell - fontSize;
  const theme = {
    '--genko-cell': `${cell}px`,
    '--genko-width': `${columns * cell}px`,
    '--genko-height': `${rows * cell}px`,
    '--genko-padding': `${padding}px`,
    '--genko-font-size': `${fontSize}px`,
    '--genko-spacing': `${letterSpace}px`,
    '--genko-line': `${colors.primary}33`,
    '--genko-border': colors.border,
    '--genko-paper': colors.surface,
    '--genko-focus': colors.focus,
    '--genko-text': colors.dark,
    '--genko-muted': colors.muted,
    '--genko-primary': colors.primaryText,
    '--genko-pressed': colors.badgeBg,
    '--genko-radius': `${radius.input}px`,
    '--genko-ui-font': `${typography.body.fontFamily}, sans-serif`,
  } as CSSProperties;
  const syncScroll = () => {
    gridWindow.current?.style.setProperty(
      '--genko-scroll-x',
      `${-(input.current?.scrollLeft ?? 0)}px`,
    );
    gridWindow.current?.style.setProperty(
      '--genko-scroll-y',
      `${-(input.current?.scrollTop ?? 0)}px`,
    );
  };
  useLayoutEffect(() => {
    if (input.current) {
      input.current.scrollTop = 0;
      input.current.scrollLeft = 0;
    }
    syncScroll();
  }, [vertical]);
  useLayoutEffect(syncScroll, [columns, rows, cell, value]);

  const commitComposition = (text: string) => {
    if (!composing.current) return;
    composing.current = false;
    setCompositionValue(null);
    onChangeText(text);
    onComposingChange?.(false);
  };

  return (
    <div
      className="ng-genko"
      ref={container}
      style={theme}
      data-testid="genko-editor"
      data-direction={vertical ? 'vertical' : 'horizontal'}
    >
      <div className="ng-genko__paper">
        <div className="ng-genko__caption">
          <span>Giấy làm bài</span>
          <div className="ng-genko__tools">
            <span aria-live="off">
              {
                Array.from((compositionValue ?? value).replace(/\s/g, ''))
                  .length
              }{' '}
              ký tự
            </span>
            <button
              type="button"
              className="ng-genko__direction"
              aria-label={
                vertical ? 'Chuyển sang viết ngang' : 'Chuyển sang viết dọc'
              }
              title={
                vertical ? 'Chuyển sang viết ngang' : 'Chuyển sang viết dọc'
              }
              disabled={composing.current}
              onClick={() => setVertical(current => !current)}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                {vertical ? (
                  <path d="M17 3v14m-3-3 3 3 3-3M10 3v18M4 3v18" />
                ) : (
                  <path d="M3 7h18M3 13h18M3 19h14m-3-3 3 3-3 3" />
                )}
              </svg>
            </button>
          </div>
        </div>
        <div className="ng-genko__window" ref={gridWindow}>
          <textarea
            ref={input}
            aria-label="Nội dung bài viết"
            className="ng-genko__input"
            lang="ja"
            value={compositionValue ?? value}
            readOnly={!editable}
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            rows={rows}
            wrap="soft"
            placeholder="ここに書いてください。"
            onChange={event => {
              if (composing.current)
                setCompositionValue(event.currentTarget.value);
              else onChangeText(event.currentTarget.value);
            }}
            onCompositionStart={event => {
              composing.current = true;
              setCompositionValue(event.currentTarget.value);
              onComposingChange?.(true);
            }}
            onCompositionEnd={event =>
              commitComposition(event.currentTarget.value)
            }
            onBlur={event => commitComposition(event.currentTarget.value)}
            onScroll={syncScroll}
          />
        </div>
      </div>
    </div>
  );
}
