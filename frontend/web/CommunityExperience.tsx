import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { HomeFeatureIcon } from '../src/components/HomeFeatureIcon';
import coffeeQr from '../src/assets/support/coffee-qr.png';
import momoWave from '../src/assets/mascot/momo-wave.png';
import {
  featureGuides,
  allGuides,
  listeningLessonGuide,
  guideForPath,
  readGuideProgress,
  saveGuideProgress,
} from './onboarding';
import type {
  FeatureGuide,
  Guide,
  GuideId,
  GuideProgress,
  GuideStep,
} from './onboarding';
import './community.css';

type Overlay =
  | { kind: 'welcome'; step: number }
  | { kind: 'tour'; id: Guide['id']; step: number }
  | { kind: 'help' | 'coffee' }
  | null;
type Rect = { top: number; left: number; width: number; height: number };

function loadProgress(accountId: string): GuideProgress {
  try {
    return readGuideProgress(window.localStorage, accountId);
  } catch {
    return {};
  }
}

function CoffeeIcon() {
  return (
    <svg
      width="21"
      height="21"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 8h13v7a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V8Z" />
      <path d="M17 9h1a3 3 0 0 1 0 6h-1M7 3v2m4-2v2m4-2v2M3 22h16" />
    </svg>
  );
}

// This component is mounted only in the authenticated web workspace.
// Native dialog supplies focus trapping, Escape handling and an inert background.
export function CommunityExperience({
  accountId,
  name,
  pathname,
  navigate,
  bottomInset = 0,
}: {
  accountId: string;
  name: string;
  pathname: string;
  navigate: (path: string) => void;
  bottomInset?: number;
}) {
  const [progress, setProgress] = useState(() => loadProgress(accountId));
  const [overlay, setOverlay] = useState<Overlay>(() =>
    progress.welcome ? null : { kind: 'welcome', step: 0 },
  );
  const [copied, setCopied] = useState('');
  const dialog = useRef<HTMLDialogElement>(null);
  const panel = useRef<HTMLElement>(null);
  const [rect, setRect] = useState<Rect | null>(null);
  const measuredStep = useRef<GuideStep | undefined>(undefined);
  const [position, setPosition] = useState<CSSProperties>({});
  const guide =
    overlay?.kind === 'tour'
      ? allGuides.find(item => item.id === overlay.id)
      : undefined;
  const step: GuideStep | undefined =
    overlay?.kind === 'tour' ? guide?.steps[overlay.step] : undefined;
  const opened = overlay !== null;

  // Remember exposure, even when navigation, refresh or logout interrupts a tour.
  // Explicit replay through Help remains available regardless of this flag.
  const seenId: GuideId | undefined =
    overlay?.kind === 'welcome'
      ? 'welcome'
      : overlay?.kind === 'tour'
      ? overlay.id
      : undefined;
  useEffect(() => {
    if (!seenId || progress[seenId]) return;
    const next = { ...progress, [seenId]: true as const };
    try {
      saveGuideProgress(window.localStorage, accountId, next);
    } catch {
      /* Keep session state if storage is blocked. */
    }
    setProgress(next);
  }, [accountId, seenId, progress]);

  function close() {
    setOverlay(null);
    setCopied('');
  }
  function replay(item: FeatureGuide) {
    navigate(item.path);
    setOverlay({ kind: 'tour', id: item.id, step: 0 });
  }

  useEffect(() => {
    if (overlay?.kind === 'tour' && guideForPath(pathname)?.id !== overlay.id) {
      setOverlay(null);
      return;
    }
    const nextGuide = guideForPath(pathname);
    if (!overlay && progress.welcome && nextGuide && !progress[nextGuide.id]) {
      const readySelector =
        'readySelector' in nextGuide ? nextGuide.readySelector : undefined;
      const start = () => {
        if (!readySelector || document.querySelector(readySelector)) {
          setOverlay(
            previous => previous ?? { kind: 'tour', id: nextGuide.id, step: 0 },
          );
          return true;
        }
        return false;
      };
      if (start()) return;
      // Deep links load asynchronously. Do not cover loading/error states.
      const observer = new MutationObserver(() => {
        if (start()) observer.disconnect();
      });
      const workspace = document.querySelector(
        '[data-testid="tour-workspace"]',
      );
      if (workspace)
        observer.observe(workspace, { childList: true, subtree: true });
      return () => observer.disconnect();
    }
  }, [pathname, overlay, guide, progress]);

  useEffect(() => {
    const node = dialog.current;
    if (!opened || !node) return;
    const previous = document.activeElement;
    node.showModal();
    return () => {
      node.close();
      if (previous instanceof HTMLElement && previous.isConnected)
        previous.focus({ preventScroll: true });
    };
  }, [opened]);

  useEffect(() => {
    if (panel.current) panel.current.scrollTop = 0;
    panel.current?.focus({ preventScroll: true });
  }, [overlay]);

  useEffect(() => {
    setRect(null);
    setPosition({});
    if (!step?.selectors) return;
    let frame = 0;
    let revealed: Element | null = null;
    function measure() {
      const target = step?.selectors
        ?.map(selector => document.querySelector(selector))
        .find(
          node =>
            node &&
            node.getBoundingClientRect().width > 0 &&
            node.getBoundingClientRect().height > 0,
        );
      if (!target) {
        setRect(null);
        setPosition({});
        return;
      }
      if (revealed !== target) {
        revealed = target;
        target.scrollIntoView({
          block: 'center',
          inline: 'nearest',
          behavior: 'auto',
        });
      }
      const bounds = target.getBoundingClientRect();
      const top = Math.max(8, bounds.top - 6),
        left = Math.max(8, bounds.left - 6);
      const right = Math.min(window.innerWidth - 8, bounds.right + 6);
      const bottom = Math.min(window.innerHeight - 8, bounds.bottom + 6);
      if (right <= left || bottom <= top) {
        setRect(null);
        setPosition({});
        return;
      }
      const next = { top, left, width: right - left, height: bottom - top };
      measuredStep.current = step;
      setRect(previous =>
        previous &&
        Object.keys(next).every(
          key => previous[key as keyof Rect] === next[key as keyof Rect],
        )
          ? previous
          : next,
      );
      const panelWidth = panel.current?.offsetWidth || 400;
      const panelHeight = panel.current?.offsetHeight || 320;
      const margin = 16;
      let panelTop = bottom + margin;
      if (panelTop + panelHeight > window.innerHeight - margin)
        panelTop = top - panelHeight - margin;
      if (panelTop < margin)
        panelTop = window.innerHeight - panelHeight - margin;
      const panelLeft = Math.max(
        margin,
        Math.min(left, window.innerWidth - panelWidth - margin),
      );
      setPosition({
        top: Math.max(margin, panelTop),
        left: panelLeft,
        transform: 'none',
      });
    }
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    const observer = new MutationObserver(schedule);
    const workspace = document.querySelector('[data-testid="tour-workspace"]');
    if (workspace)
      observer.observe(workspace, { childList: true, subtree: true });
    const resize = new ResizeObserver(schedule);
    if (panel.current) resize.observe(panel.current);
    window.addEventListener('resize', schedule);
    window.addEventListener('scroll', schedule, true);
    schedule();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      resize.disconnect();
      window.removeEventListener('resize', schedule);
      window.removeEventListener('scroll', schedule, true);
    };
  }, [step]);

  const isWelcome = overlay?.kind === 'welcome';
  const isTour = overlay?.kind === 'tour';
  const spotlight = isTour && measuredStep.current === step ? rect : null;
  let content: ReactNode = null;
  if (isWelcome) {
    content = (
      <>
        <div className="ng-welcome-art">
          <span className="ng-welcome-kana" aria-hidden="true">
            こんにちは
          </span>
          <img
            src={momoWave}
            width="146"
            height="146"
            alt="Momo vẫy tay chào bạn"
          />
          <span className="ng-pill">NIHONGO · FREE BETA</span>
        </div>
        {overlay.step === 0 ? (
          <>
            <p className="ng-eyebrow">Rất vui vì bạn có mặt ở đây</p>
            <h2 id="ng-dialog-title">
              Chào {name.trim() || 'bạn'},<br />
              cùng học tiếng Nhật nhé!
            </h2>
            <p id="ng-dialog-description">
              Mình là Momo. Cảm ơn bạn đã đồng hành cùng NihonGO trong những
              ngày đầu. Đây là <strong>bản dùng thử miễn phí</strong>, nên đôi
              lúc vẫn có lỗi hoặc trải nghiệm chưa hoàn thiện.
            </p>
            <div className="ng-note">
              Nhờ bạn dùng thử có trách nhiệm: không spam yêu cầu hay lách giới
              hạn. Mỗi góp ý đều giúp NihonGO tốt hơn một chút. 🌱
            </div>
          </>
        ) : overlay.step === 1 ? (
          <>
            <p className="ng-eyebrow">Một nơi, nhiều cách học</p>
            <h2 id="ng-dialog-title">Bạn muốn luyện gì hôm nay?</h2>
            <p id="ng-dialog-description">
              Nghe, nói, đọc, viết, tra từ và ôn tập. Mỗi khu vực đều có hướng
              dẫn ngắn khi bạn mở lần đầu.
            </p>
            <div className="ng-feature-preview">
              {featureGuides.map(item => (
                <div key={item.id}>
                  <span aria-hidden="true">
                    <HomeFeatureIcon
                      name={item.icon}
                      size={24}
                      color="currentColor"
                    />
                  </span>
                  <strong>{item.label}</strong>
                </div>
              ))}
            </div>
          </>
        ) : (
          <>
            <p className="ng-eyebrow">Một lời nhắn trước khi bắt đầu</p>
            <h2 id="ng-dialog-title">Cùng giữ một góc học thật vui</h2>
            <div id="ng-dialog-description">
              <p>
                Bản beta được mở miễn phí để mọi người học thử. Nhờ bạn sử dụng
                vừa đủ,{' '}
                <strong>
                  không spam yêu cầu, dùng bot hay tạo nhiều tài khoản để vượt
                  giới hạn
                </strong>
                .
              </p>
              <ul className="ng-rules">
                <li>
                  Chờ phản hồi trước khi gửi lại; tránh bấm liên tục khi hệ
                  thống đang xử lý.
                </li>
                <li>
                  Mỗi ngày: <strong>1 video mới</strong> và{' '}
                  <strong>2 phiên Nói Live, tối đa 4 phút/phiên</strong>.
                </li>
                <li>
                  AI có thể trả lời sai. Hãy kiểm tra lại những nội dung quan
                  trọng.
                </li>
              </ul>
            </div>
            <p className="ng-fine-print">
              Nếu thấy hữu ích, bạn có thể mời mình một ly cà phê qua nút ☕ ở
              góc màn hình. Ủng hộ hoàn toàn tự nguyện và không ảnh hưởng quyền
              dùng beta.
            </p>
          </>
        )}
        <div className="ng-tour-footer">
          <button className="ng-text-button" onClick={close}>
            Để sau
          </button>
          <div
            className="ng-dots"
            aria-label={`Bước ${overlay.step + 1} trên 3`}
          >
            {[0, 1, 2].map(index => (
              <span
                key={index}
                className={overlay.step === index ? 'is-active' : ''}
              />
            ))}
          </div>
          <button
            className="ng-primary"
            onClick={() =>
              overlay.step < 2
                ? setOverlay({ kind: 'welcome', step: overlay.step + 1 })
                : close()
            }
          >
            {overlay.step < 2 ? 'Tiếp theo →' : 'Bắt đầu học →'}
          </button>
        </div>
      </>
    );
  } else if (isTour && guide && step) {
    content = (
      <>
        <p className="ng-eyebrow">
          {guide.label} · Bước {overlay.step + 1}/{guide.steps.length}
        </p>
        <h2 id="ng-dialog-title">{step.title}</h2>
        <p id="ng-dialog-description">{step.description}</p>
        <div className="ng-tour-footer">
          <button className="ng-text-button" onClick={close}>
            Bỏ qua
          </button>
          <div className="ng-tour-actions">
            {overlay.step > 0 ? (
              <button
                className="ng-text-button"
                onClick={() =>
                  setOverlay({ ...overlay, step: overlay.step - 1 })
                }
              >
                Quay lại
              </button>
            ) : null}
            <button
              className="ng-primary"
              onClick={() =>
                overlay.step + 1 < guide.steps.length
                  ? setOverlay({ ...overlay, step: overlay.step + 1 })
                  : close()
              }
            >
              {overlay.step + 1 < guide.steps.length
                ? 'Tiếp theo →'
                : 'Mình hiểu rồi'}
            </button>
          </div>
        </div>
        <p className="ng-footer-hint">
          Mở nút ? để xem lại hướng dẫn bất cứ lúc nào.
        </p>
      </>
    );
  } else if (overlay?.kind === 'help') {
    content = (
      <>
        <p className="ng-eyebrow">Momo ở đây để giúp bạn</p>
        <h2 id="ng-dialog-title">Bạn cần hướng dẫn gì?</h2>
        <p>Chọn một mục để đến đúng màn hình và xem từng bước.</p>
        {guideForPath(pathname)?.id === 'listening-lesson' &&
        document.querySelector(listeningLessonGuide.readySelector) ? (
          <button
            className="ng-primary ng-current-lesson-guide"
            onClick={() =>
              setOverlay({ kind: 'tour', id: 'listening-lesson', step: 0 })
            }
          >
            Hướng dẫn bài nghe này
          </button>
        ) : null}
        <div className="ng-help-grid">
          {featureGuides.map(item => (
            <button key={item.id} onClick={() => replay(item)}>
              <span className="ng-feature-symbol" aria-hidden="true">
                <HomeFeatureIcon
                  name={item.icon}
                  size={22}
                  color="currentColor"
                />
              </span>
              <span>
                <strong>{item.label}</strong>
                <small>{item.summary}</small>
              </span>
              <span aria-hidden="true">↗</span>
            </button>
          ))}
        </div>
        <button
          className="ng-text-button ng-replay-welcome"
          onClick={() => setOverlay({ kind: 'welcome', step: 0 })}
        >
          Xem lại lời chào & lưu ý dùng thử
        </button>
      </>
    );
  } else if (overlay?.kind === 'coffee') {
    content = (
      <>
        <div className="ng-coffee-emblem">
          <CoffeeIcon />
        </div>
        <p className="ng-eyebrow">Buy me a coffee</p>
        <h2 id="ng-dialog-title">Mời mình một ly cà phê</h2>
        <p>
          Nếu NihonGO giúp việc học của bạn vui hơn, bạn có thể mời mình một ly
          cà phê để tiếp sức phát triển ứng dụng.
        </p>
        <div className="ng-qr-frame">
          <img
            src={coffeeQr}
            width="653"
            height="1124"
            alt="QR chuyển khoản Vietcombank, TRUONG GIA HUY, số tài khoản 1028329483"
          />
        </div>
        <div className="ng-bank-details">
          <span>Vietcombank · TRUONG GIA HUY</span>
          <button
            className="ng-account-number"
            aria-label="Sao chép số tài khoản 1028329483"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText('1028329483');
                setCopied('Đã sao chép số tài khoản.');
              } catch {
                setCopied('Bạn có thể chọn và sao chép số: 1028329483');
              }
            }}
          >
            1028329483 <span aria-hidden="true">⧉</span>
          </button>
        </div>
        <div className="ng-qr-actions">
          <a href={coffeeQr} download="NihonGO-coffee-QR.png">
            Tải mã QR
          </a>
          <a href={coffeeQr} target="_blank" rel="noreferrer">
            Mở ảnh lớn ↗
          </a>
        </div>
        <p className="ng-copy-status" role="status">
          {copied}
        </p>
        <div className="ng-note">
          Hoàn toàn tự nguyện, không phải phí sử dụng hay cách mua thêm lượt AI.
          Cảm ơn bạn đã đồng hành! ♡
        </div>
      </>
    );
  }

  return (
    <>
      <aside
        className="ng-community-dock"
        aria-label="Hướng dẫn và ủng hộ NihonGO"
        style={{ '--ng-bottom-inset': `${bottomInset}px` } as CSSProperties}
      >
        <button
          className="ng-help-trigger"
          aria-label="Hướng dẫn sử dụng NihonGO"
          aria-haspopup="dialog"
          onClick={() => setOverlay({ kind: 'help' })}
        >
          ?
        </button>
        <button
          className="ng-coffee-trigger"
          aria-label="Mời mình một ly cà phê"
          aria-haspopup="dialog"
          onClick={() => setOverlay({ kind: 'coffee' })}
        >
          <CoffeeIcon />
          <span>Mời mình ly cà phê</span>
        </button>
      </aside>
      {opened
        ? createPortal(
            <dialog
              ref={dialog}
              className={`ng-community-dialog ${isTour ? 'is-tour' : ''}`}
              aria-labelledby="ng-dialog-title"
              aria-describedby={
                isTour || isWelcome ? 'ng-dialog-description' : undefined
              }
              onKeyDown={event => {
                if (
                  event.key !== 'Tab' ||
                  event.altKey ||
                  event.ctrlKey ||
                  event.metaKey
                )
                  return;
                const controls = Array.from(
                  event.currentTarget.querySelectorAll<HTMLElement>(
                    'button:not([disabled]), a[href]',
                  ),
                ).filter(node => node.getClientRects().length > 0);
                if (!controls.length) return;
                const index = controls.indexOf(
                  document.activeElement as HTMLElement,
                );
                const next = event.shiftKey
                  ? index <= 0
                    ? controls.length - 1
                    : index - 1
                  : (index + 1) % controls.length;
                event.preventDefault();
                controls[next].focus();
              }}
              onCancel={event => {
                event.preventDefault();
                close();
              }}
            >
              {spotlight ? (
                <div
                  className="ng-spotlight"
                  data-guide-target={step?.title}
                  style={spotlight}
                  aria-hidden="true"
                />
              ) : (
                <div className="ng-dialog-shade" aria-hidden="true" />
              )}
              <section
                ref={panel}
                tabIndex={-1}
                className={`ng-community-panel ${
                  isWelcome ? 'is-welcome' : ''
                } ${isTour ? 'is-tour-panel' : ''} ${
                  overlay?.kind === 'coffee' ? 'is-coffee' : ''
                }`}
                style={spotlight ? position : undefined}
              >
                <button
                  className="ng-dialog-close"
                  aria-label={isTour || isWelcome ? 'Bỏ qua hướng dẫn' : 'Đóng'}
                  onClick={close}
                >
                  ×
                </button>
                {content}
              </section>
            </dialog>,
            document.body,
          )
        : null}
    </>
  );
}
