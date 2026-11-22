import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router';
import type { CSSProperties, ReactNode } from 'react';
import { BrandLogo } from '../../src/components/BrandLogo';
import { AppBackground } from '../../src/components/AppBackground';
import { colors, radius, shadowMd } from '../../src/theme/theme';
import momoWave from './assets/momo-wave.webp';
import momoListening from './assets/momo-listening.webp';
import momoReading from './assets/momo-reading.webp';
import momoSpeaking from './assets/momo-speaking.webp';
import './landing.css';

const landingTheme = {
  '--ink': colors.dark,
  '--body': colors.body,
  '--muted': colors.muted,
  '--orange': colors.primary,
  '--pressed': colors.primaryPressed,
  '--on-primary': colors.onPrimary,
  '--line': colors.divider,
  '--border': colors.border,
  '--focus': colors.focus,
  '--paper': colors.background,
  '--surface': colors.surface,
  '--tint': colors.surfaceTint,
  '--badge': colors.badgeBg,
  '--badge-text': colors.badgeText,
  '--shadow': shadowMd,
  '--radius-card': `${radius.card}px`,
  '--radius-small': `${radius.small}px`,
  '--radius-input': `${radius.input}px`,
} as CSSProperties;
const shots = '/landing/';
const features = [
  {
    id: 'overview',
    label: 'Không gian học',
    title: 'Một nơi cho hành trình tiếng Nhật.',
    description:
      'Theo dõi việc học, tìm lại bài cũ và chọn điều bạn muốn luyện hôm nay.',
    web: 'web-home.webp',
    app: 'app-practice.webp',
    caption: 'Web · Trang chủ / App · Luyện tập',
  },
  {
    id: 'vocabulary',
    label: 'Từ vựng',
    title: 'Hiểu từng từ. Nhớ từng chút.',
    description:
      'Học theo bài, nghe cách đọc và khám phá nghĩa cùng ví dụ. Những từ mới không còn đứng một mình.',
    web: 'web-vocabulary.webp',
    app: 'app-lessons.webp',
    caption: 'Web · Nội dung bài học / App · Danh sách bài học',
  },
  {
    id: 'listening',
    label: 'Nghe',
    title: 'Luyện nghe qua từng câu phụ đề.',
    description:
      'Mở video bạn yêu thích, nghe từng đoạn và luyện shadowing. Tra từ, xem bản dịch và nghe lại theo nhịp của bạn.',
    web: 'web-shadowing.webp',
    app: null,
    caption: 'Web · Nghe & shadowing',
  },
  {
    id: 'speaking',
    label: 'Nói',
    title: 'Tự tin hơn trong mỗi cuộc trò chuyện.',
    description:
      'Chọn tình huống phù hợp với trình độ, luyện hội thoại và xem lại những cuộc trò chuyện của bạn.',
    web: 'web-speaking-conversation.webp',
    app: null,
    caption: 'Web · Hội thoại cùng Aoi',
  },
  {
    id: 'reading',
    label: 'Đọc',
    title: 'Đọc hiểu từ câu chữ đến ngữ cảnh.',
    description:
      'Khám phá bài đọc theo trình độ, bật furigana, tra từ trong bài và trả lời câu hỏi để kiểm tra mức độ hiểu.',
    web: 'web-reading.webp',
    app: null,
    caption: 'Web · Bài đọc và câu hỏi đọc hiểu',
  },
  {
    id: 'writing',
    label: 'Viết',
    title: 'Viết từng câu, diễn đạt thêm rõ ràng.',
    description:
      'Chọn chủ đề, viết trên giấy làm bài và lưu bản nháp. Nộp bài để nhận nhận xét và xem lại cách diễn đạt.',
    web: 'web-writing-feedback.webp',
    app: null,
    caption: 'Web · Kết quả chấm bài và góp ý cách sửa',
  },
] as const;
const faqs = [
  [
    'NihonGO có miễn phí không?',
    'NihonGO đang mở beta miễn phí đến khi đủ 200 tài khoản. Một số tính năng dùng AI có giới hạn theo ngày để mọi người cùng có cơ hội trải nghiệm.',
  ],
  [
    'Mình mới bắt đầu học, có dùng được không?',
    'Bạn có thể chọn trình độ và mục tiêu khi bắt đầu. Hãy chọn bài phù hợp với mình; nội dung ở từng cấp JLPT sẽ tiếp tục được bổ sung trong giai đoạn beta.',
  ],
  [
    'Có thể học trên cả web và app không?',
    'Bạn có thể bắt đầu ngay trên web, cả máy tính lẫn điện thoại. NihonGO cũng có giao diện app mobile; thông tin tải app sẽ được cập nhật khi có bản phát hành công khai.',
  ],
  [
    'Các tính năng AI có giới hạn như thế nào?',
    'Trong beta, mỗi tài khoản được xử lý hoặc dịch một video mới mỗi ngày và mở hai phiên hội thoại Live, tối đa bốn phút mỗi phiên. Bạn vẫn có thể học lại video đã có.',
  ],
  [
    'Mình có bắt buộc phải bật micro không?',
    'Không. Chỉ cần cho phép micro khi sử dụng tính năng thu âm hoặc hội thoại bằng giọng nói. Bạn vẫn có thể học từ vựng, đọc và viết mà không bật micro.',
  ],
];

function Arrow({ diagonal = false }: { diagonal?: boolean }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d={diagonal ? 'M6 18 18 6M6 6h12v12' : 'M4 12h15m-6-6 6 6-6 6'}
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
function Brand() {
  return (
    <div className="ml-brand" aria-label="NihonGO">
      <BrandLogo />
    </div>
  );
}
function Button({
  children,
  secondary = false,
  href = '/register',
}: {
  children: ReactNode;
  secondary?: boolean;
  href?: string;
}) {
  return (
    <a
      className={`ml-button${secondary ? ' ml-button-secondary' : ''}`}
      href={href}
    >
      {children}
      <Arrow />
    </a>
  );
}
function BrowserFrame({
  file,
  alt,
  eager = false,
}: {
  file: string;
  alt: string;
  eager?: boolean;
}) {
  return (
    <div className="ml-browser">
      <span className="ml-browser-bar" aria-hidden="true">
        <i />
        <i />
        <i />
        <span>momonihongo.app</span>
      </span>
      <img
        src={shots + file}
        alt={alt}
        width="1440"
        height="1000"
        loading={eager ? 'eager' : 'lazy'}
        fetchPriority={eager ? 'high' : 'auto'}
      />
    </div>
  );
}
function PhoneFrame({
  file,
  alt,
  eager = false,
}: {
  file: string;
  alt: string;
  eager?: boolean;
}) {
  return (
    <div className="ml-phone">
      <img
        src={shots + file}
        width="1206"
        height="2622"
        alt={alt}
        loading={eager ? 'eager' : 'lazy'}
      />
    </div>
  );
}
function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <p className="ml-eyebrow">
      <span />
      {children}
    </p>
  );
}

export default function LandingPage({
  hasSession = false,
}: {
  hasSession?: boolean;
}) {
  const { hash } = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [selected, setSelected] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  useEffect(() => {
    document.body.classList.add('momo-landing-page');
    if (!('IntersectionObserver' in window))
      return () => {
        document.body.classList.remove('momo-landing-page');
      };
    root.current?.classList.add('ml-ready');
    const observer = new IntersectionObserver(
      entries => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.08 },
    );
    root.current
      ?.querySelectorAll('.ml-reveal')
      .forEach(element => observer.observe(element));
    return () => {
      document.body.classList.remove('momo-landing-page');
      observer.disconnect();
    };
  }, []);
  useEffect(() => {
    if (!hash) return;
    let id: string;
    try {
      id = decodeURIComponent(hash.slice(1));
    } catch {
      return;
    }
    const frame = requestAnimationFrame(() =>
      document.getElementById(id)?.scrollIntoView({ block: 'start' }),
    );
    return () => cancelAnimationFrame(frame);
  }, [hash]);
  const active = features[selected];
  return (
    <div ref={root} className="ml" style={landingTheme}>
      <div className="ml-background" aria-hidden="true">
        <AppBackground />
      </div>
      <a className="ml-skip" href="#main">
        Đi đến nội dung
      </a>
      <header className="ml-header">
        <div className="ml-header-inner">
          <Brand />
          <nav
            className={menuOpen ? 'ml-nav is-open' : 'ml-nav'}
            aria-label="Điều hướng landing page"
          >
            {[
              ['#experience', 'Trải nghiệm'],
              ['#how-it-works', 'Cách học'],
              ['#devices', 'Web & App'],
              ['#subscription', 'Gói học'],
              ['#faq', 'Hỏi đáp'],
            ].map(([href, label]) => (
              <a key={href} href={href} onClick={() => setMenuOpen(false)}>
                {label}
              </a>
            ))}
          </nav>
          <div className="ml-header-actions">
            <a
              className={`ml-button ml-login${
                hasSession ? ' ml-login-app' : ''
              }`}
              href={hasSession ? '/app' : '/login'}
            >
              {hasSession ? 'Vào ứng dụng' : 'Đăng nhập'}
            </a>
            <button
              type="button"
              className="ml-menu-toggle"
              aria-label={menuOpen ? 'Đóng menu' : 'Mở menu'}
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen(value => !value)}
            >
              {menuOpen ? '✕' : '☰'}
            </button>
          </div>
        </div>
      </header>
      <main id="main">
        <section className="ml-hero ml-container">
          <div className="ml-hero-copy">
            <a href="#beta" className="ml-beta-pill">
              <span /> ĐANG MỞ BETA MIỄN PHÍ <Arrow diagonal />
            </a>
            <h1>
              Một chút tiếng Nhật.
              <br />
              <span>Một thế giới mới.</span>
            </h1>
            <p className="ml-hero-description">
              Từ video bạn thích đến những cuộc trò chuyện đầu tiên. Học, thực
              hành và khám phá tiếng Nhật mỗi ngày cùng Momo.
            </p>
            <div className="ml-hero-buttons">
              <Button>Bắt đầu học miễn phí</Button>
              <a className="ml-watch" href="#experience">
                <span>▶</span> Khám phá Momo
              </a>
            </div>
            <div className="ml-hero-notes">
              <span>✓ Không cần thẻ thanh toán</span>
              <span>✓ Học ngay trên web</span>
            </div>
          </div>
          <div
            className="ml-hero-stage"
            aria-label="Giao diện NihonGO trên web và app"
          >
            <div className="ml-orbit ml-orbit-one" />
            <div className="ml-orbit ml-orbit-two" />
            <span className="ml-kana ml-kana-one" lang="ja" aria-hidden="true">
              あ
            </span>
            <span className="ml-kana ml-kana-two" lang="ja" aria-hidden="true">
              語
            </span>
            <div className="ml-hero-desktop">
              <BrowserFrame
                file="web-home.webp"
                alt="Trang chủ NihonGO trên web với mục tiêu học và các tính năng"
                eager
              />
            </div>
            <div className="ml-hero-mobile">
              <PhoneFrame
                file="app-practice.webp"
                alt="Màn hình luyện tập của app NihonGO trên iPhone"
                eager
              />
            </div>
            <div className="ml-float-note">
              <span>✦</span>
              <div>
                <strong>Mỗi ngày, một khám phá</strong>
                <small>いっしょに、がんばろう。</small>
              </div>
            </div>
            <img
              className="ml-hero-momo"
              src={momoWave}
              alt="Momo đang vẫy tay chào"
              width="190"
              height="190"
            />
          </div>
          <div className="ml-hero-bottom">
            <span>Tiếng Nhật gần gũi hơn, theo cách của bạn.</span>
            <a href="#experience">
              CUỘN ĐỂ KHÁM PHÁ <span>↓</span>
            </a>
          </div>
        </section>
        <div className="ml-ticker" aria-hidden="true">
          <div>
            {[0, 1].map(n => (
              <span key={n}>
                聞く <i>NGHE</i>
                <b>✳</b> 話す <i>NÓI</i>
                <b>✳</b> 読む <i>ĐỌC</i>
                <b>✳</b> 書く <i>VIẾT</i>
                <b>✳</b> 毎日 <i>MỖI NGÀY</i>
                <b>✳</b>
              </span>
            ))}
          </div>
        </div>
        <section id="experience" className="ml-section ml-container">
          <div className="ml-section-heading ml-reveal">
            <div>
              <Eyebrow>KHÔNG CHỈ LÀ MỘT BÀI HỌC</Eyebrow>
              <h2>
                Có cả một thế giới
                <br />
                tiếng Nhật để khám phá.
              </h2>
            </div>
            <p>
              Nghe, nói, đọc, viết và những từ mới.
              <br />
              Tất cả trong một không gian của riêng bạn.
            </p>
          </div>
          <div
            className="ml-product-tabs ml-reveal"
            role="tablist"
            aria-label="Khám phá tính năng"
          >
            {features.map((feature, i) => (
              <button
                key={feature.id}
                ref={element => {
                  tabs.current[i] = element;
                }}
                id={`tab-${feature.id}`}
                role="tab"
                aria-selected={i === selected}
                aria-controls="feature-panel"
                tabIndex={i === selected ? 0 : -1}
                onClick={() => setSelected(i)}
                onKeyDown={event => {
                  const next =
                    event.key === 'ArrowRight'
                      ? (i + 1) % features.length
                      : event.key === 'ArrowLeft'
                      ? (i + features.length - 1) % features.length
                      : event.key === 'Home'
                      ? 0
                      : event.key === 'End'
                      ? features.length - 1
                      : null;
                  if (next !== null) {
                    event.preventDefault();
                    setSelected(next);
                    tabs.current[next]?.focus();
                  }
                }}
              >
                <span>0{i + 1}</span>
                {feature.label}
              </button>
            ))}
          </div>
          <div
            className="ml-feature-panel ml-reveal"
            id="feature-panel"
            role="tabpanel"
            aria-labelledby={`tab-${active.id}`}
          >
            <div className="ml-feature-copy" key={`copy-${active.id}`}>
              <span className="ml-tag">THỰC TẾ TRÊN NIHONGO</span>
              <h3>{active.title}</h3>
              <p>{active.description}</p>
              <Button secondary href="/app">
                Mở ứng dụng
              </Button>
              <small>
                {active.caption}
                <br />
                Ảnh giao diện thật, sử dụng dữ liệu minh họa.
              </small>
            </div>
            <div
              className={`ml-feature-images${
                active.app ? '' : ' ml-feature-images-wide'
              }`}
            >
              <BrowserFrame
                file={active.web}
                alt={active.title + ' — giao diện web'}
              />
              {active.app ? (
                <div className="ml-feature-phone">
                  <PhoneFrame
                    file={active.app}
                    alt={active.title + ' — giao diện app iPhone'}
                  />
                </div>
              ) : null}
            </div>
          </div>
        </section>
        <section id="how-it-works" className="ml-journey-section">
          <div className="ml-container">
            <div className="ml-centered ml-reveal">
              <Eyebrow>MỘT NHỊP HỌC THẬT TỰ NHIÊN</Eyebrow>
              <h2>
                Từ “nghe quen quen”
                <br />
                đến “mình hiểu rồi”.
              </h2>
              <p>
                Không cần làm tất cả trong một ngày.
                <br />
                Chỉ cần bắt đầu với một điều khiến bạn tò mò.
              </p>
            </div>
            <div className="ml-journey">
              {[
                {
                  title: 'Nghe điều bạn thích',
                  description:
                    'Mở video và luyện theo từng đoạn phụ đề. Nghe lại theo tốc độ của bạn.',
                  image: momoListening,
                  alt: 'Momo đeo tai nghe',
                  action: 'Xem phần nghe',
                  feature: 2,
                },
                {
                  title: 'Hiểu thêm một chút',
                  description:
                    'Tra từ ngay trong lúc học. Kết nối cách đọc, nghĩa và ngữ cảnh.',
                  image: momoReading,
                  alt: 'Momo đọc sách',
                  action: 'Xem phần đọc',
                  feature: 4,
                },
                {
                  title: 'Biến thành tiếng Nhật của bạn',
                  description:
                    'Thực hành nói, viết và ôn từ bằng flashcard để tiếp tục hành trình.',
                  image: momoSpeaking,
                  alt: 'Momo cầm micro',
                  action: 'Xem từ vựng',
                  feature: 1,
                },
              ].map((step, i) => (
                <article key={step.title} className="ml-journey-card ml-reveal">
                  <span className="ml-step">
                    0{i + 1}
                    <Arrow diagonal />
                  </span>
                  <div className="ml-journey-image">
                    <img
                      src={step.image}
                      alt={step.alt}
                      width="150"
                      height="150"
                      loading="lazy"
                    />
                  </div>
                  <h3>{step.title}</h3>
                  <p>{step.description}</p>
                  <a
                    href="#experience"
                    className="ml-journey-action"
                    onClick={() => {
                      setSelected(step.feature);
                    }}
                  >
                    {step.action}
                    <Arrow />
                  </a>
                </article>
              ))}
            </div>
          </div>
        </section>
        <section id="devices" className="ml-section ml-container ml-devices">
          <div className="ml-devices-art ml-reveal">
            <div className="ml-device-halo" />
            <div className="ml-devices-web">
              <BrowserFrame
                file="web-vocabulary.webp"
                alt="Nội dung bài học trên web desktop"
              />
            </div>
            <div className="ml-devices-app">
              <PhoneFrame
                file="app-lessons.webp"
                alt="Danh sách bài học trên app iPhone"
              />
            </div>
            <span className="ml-device-caption">
              CÙNG MOMO, Ở ĐÂU CŨNG ĐƯỢC.
            </span>
          </div>
          <div className="ml-devices-copy ml-reveal">
            <Eyebrow>MỘT MOMO. NHIỀU CÁCH HỌC.</Eyebrow>
            <h2>
              Bàn học hay
              <br />
              quán cà phê.
              <br />
              <em>Đều là lớp học.</em>
            </h2>
            <p>
              Không gian rộng rãi trên web. Trải nghiệm gọn gàng trên app. Chọn
              màn hình phù hợp với khoảnh khắc của bạn.
            </p>
            <div className="ml-device-options">
              <span>
                <b>▱</b> Web trên trình duyệt{' '}
                <small>Bắt đầu ngay hôm nay</small>
              </span>
              <span>
                <b>▯</b> App mobile <small>Khám phá giao diện app thật</small>
              </span>
            </div>
            <Button>Học ngay trên web</Button>
          </div>
        </section>
        <section className="ml-momo-section">
          <div className="ml-container ml-momo-inner ml-reveal">
            <div className="ml-momo-portrait">
              <span lang="ja" aria-hidden="true">
                こんにちは!
              </span>
              <img
                src={momoWave}
                width="300"
                height="300"
                alt="Momo, linh vật tanuki của NihonGO"
                loading="lazy"
              />
            </div>
            <div>
              <Eyebrow>RẤT VUI ĐƯỢC GẶP BẠN</Eyebrow>
              <h2>
                Mình là Momo.
                <br />
                Cùng học nhé?
              </h2>
              <p>
                Học một ngôn ngữ mới đôi khi hơi khó. Có ngày bạn nhớ thật
                nhiều, có ngày chỉ học được một từ. Không sao cả. Momo ở đây,
                cùng bạn bắt đầu lại mỗi ngày.
              </p>
              <span className="ml-handwritten">
                いっしょに、少しずつ。<small>Cùng nhau, từng chút một.</small>
              </span>
            </div>
          </div>
        </section>
        <section
          id="subscription"
          className="ml-section ml-container ml-subscription"
          aria-labelledby="subscription-title"
        >
          <div className="ml-centered ml-reveal">
            <Eyebrow>GÓI HỌC NIHONGO</Eyebrow>
            <h2 id="subscription-title">Chọn gói học phù hợp với bạn.</h2>
            <p>
              Bắt đầu miễn phí với Momo Free.
              <br />
              Học thoải mái hơn với gói Tháng hoặc tiết kiệm cùng gói Năm.
            </p>
          </div>
          <div className="ml-plan-grid">
            <article
              className="ml-plan ml-plan-free ml-reveal"
              aria-labelledby="plan-free-title"
            >
              <span className="ml-plan-badge">Đang mở beta</span>
              <h3 id="plan-free-title">Momo Free</h3>
              <p className="ml-plan-description">
                Khám phá NihonGO và bắt đầu thói quen học mỗi ngày.
              </p>
              <p className="ml-plan-price">
                0 ₫<span>trong giai đoạn beta</span>
              </p>
              <p className="ml-plan-billing-note">Không cần thẻ thanh toán</p>
              <ul className="ml-plan-features">
                <li>Học từ vựng và ôn tập với flashcard</li>
                <li>Luyện nghe, nói, đọc và viết</li>
                <li>AI sử dụng theo giới hạn beta mỗi ngày</li>
              </ul>
              <Button>Bắt đầu miễn phí</Button>
              <small>Đăng ký mở đến khi đủ 200 tài khoản.</small>
            </article>
            {[
              {
                id: 'monthly',
                name: 'Tháng',
                price: '89.000 ₫',
                period: '/ tháng',
                description: 'Học theo nhịp của bạn, linh hoạt từng tháng.',
              },
              {
                id: 'yearly',
                name: 'Năm',
                price: '899.000 ₫',
                period: '/ năm',
                description: 'Đồng hành dài lâu, tiết kiệm 169.000đ mỗi năm.',
              },
            ].map(plan => (
              <article
                key={plan.id}
                className={`ml-plan ml-reveal${
                  plan.id === 'yearly' ? ' ml-plan-yearly' : ''
                }`}
                aria-labelledby={`plan-${plan.id}-title`}
              >
                <span
                  className={`ml-plan-badge${
                    plan.id === 'yearly' ? '' : ' ml-plan-coming'
                  }`}
                >
                  {plan.id === 'yearly'
                    ? 'Tiết kiệm 169.000 ₫'
                    : 'Linh hoạt theo tháng'}
                </span>
                <h3 id={`plan-${plan.id}-title`}>{plan.name}</h3>
                <p className="ml-plan-description">{plan.description}</p>
                <p className="ml-plan-price">
                  {plan.price}
                  <span>{plan.period}</span>
                </p>
                <p className="ml-plan-billing-note">
                  {plan.id === 'yearly'
                    ? 'Khoảng 74.917đ/tháng · thanh toán theo năm'
                    : '89.000đ cho mỗi tháng sử dụng'}
                </p>
                <ul className="ml-plan-features">
                  <li>Toàn bộ tính năng học tập của NihonGO</li>
                  <li>Học và sử dụng AI thoải mái</li>
                  <li>Không áp dụng hạn mức AI của gói Free</li>
                </ul>
                <button
                  className="ml-button ml-plan-disabled"
                  type="button"
                  disabled
                >
                  Sắp ra mắt
                </button>
                <small>Chưa mở đăng ký hoặc thanh toán gói trả phí.</small>
              </article>
            ))}
          </div>
        </section>
        <section id="faq" className="ml-section ml-container ml-faq">
          <div className="ml-reveal">
            <Eyebrow>BẠN CÓ THỂ ĐANG TÒ MÒ</Eyebrow>
            <h2>
              Một vài điều
              <br />
              trước khi bắt đầu.
            </h2>
            <p>
              NihonGO đang lớn lên mỗi ngày,
              <br />
              cùng với những góp ý của bạn.
            </p>
          </div>
          <div className="ml-faq-list ml-reveal">
            {faqs.map(([question, answer], i) => (
              <details key={question}>
                <summary>
                  <span>
                    <small>0{i + 1}</small>
                    {question}
                  </span>
                  <b>+</b>
                </summary>
                <p>{answer}</p>
              </details>
            ))}
          </div>
        </section>
        <section id="beta" className="ml-container ml-final-wrap">
          <div className="ml-final ml-reveal">
            <Eyebrow>200 TÀI KHOẢN · MỘT KHỞI ĐẦU MỚI</Eyebrow>
            <h2>
              Tiếng Nhật của bạn,
              <br />
              bắt đầu từ hôm nay.
            </h2>
            <p>
              Tham gia bản beta miễn phí. Học cùng Momo
              <br />
              và góp một chút để NihonGO tốt hơn mỗi ngày.
            </p>
            <Button>Bắt đầu hành trình của bạn</Button>
            <small>
              Đăng ký mở đến khi đủ 200 tài khoản. Có giới hạn AI theo ngày.
            </small>
          </div>
        </section>
      </main>
      <footer className="ml-footer ml-container">
        <div>
          <Brand />
          <p>Một chút tiếng Nhật, mỗi ngày.</p>
        </div>
        <nav aria-label="Liên kết cuối trang">
          <a href="#experience">Trải nghiệm</a>
          <a href="#subscription">Gói học</a>
          <a href="#faq">Câu hỏi thường gặp</a>
          <a href="/login">Đăng nhập</a>
        </nav>
        <span>
          © {new Date().getFullYear()} NihonGO
          <br />
          <small>Được xây dựng bằng sự tò mò và một chút kiên trì.</small>
        </span>
      </footer>
    </div>
  );
}
