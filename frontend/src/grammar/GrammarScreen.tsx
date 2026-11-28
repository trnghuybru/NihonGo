import type { ReactNode } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { ScreenBackHeader } from '../components/ScreenBackHeader';
import dataUrl from './grammar-data.json?url';
import {
  answerKey,
  exampleQuestions,
  grammarLevels,
  grammarSearchText,
  groupQuestions,
  loadGrammarProgress,
  plainJapanese,
  searchKey,
} from './grammarModel';
import type {
  GrammarCatalog,
  GrammarLevel,
  GrammarQuestion,
} from './grammarModel';
import '../../web/grammar.css';

const pageSize = 18;
const mascot = new URL('../assets/mascot/momo-reading.png', import.meta.url)
  .href;

function Japanese({ text, reading }: { text: string; reading: boolean }) {
  function renderRuby(value: string) {
    let offset = 0;
    const content: ReactNode[] = [];
    for (const match of value.matchAll(/([\p{Script=Han}々]+)\[([^\]]+)\]/gu)) {
      content.push(plainJapanese(value.slice(offset, match.index)));
      content.push(
        reading ? (
          <ruby key={match.index}>
            {match[1]}
            <rt>{match[2]}</rt>
          </ruby>
        ) : (
          match[1]
        ),
      );
      offset = match.index + match[0].length;
    }
    content.push(plainJapanese(value.slice(offset)));
    return content;
  }
  return (
    <span lang="ja">
      {text
        .split(/(\{[^{}]+\})/)
        .map((part, index) =>
          part.startsWith('{') ? (
            <mark key={index}>{renderRuby(part.slice(1, -1))}</mark>
          ) : (
            <span key={index}>{renderRuby(part)}</span>
          ),
        )}
    </span>
  );
}

function GrammarQuiz({
  questions,
  reading,
  onClose,
  onGrade,
}: {
  questions: GrammarQuestion[];
  reading: boolean;
  onClose: () => void;
  onGrade: (id: string, correct: boolean) => void;
}) {
  const [queue, setQueue] = useState(questions);
  const [index, setIndex] = useState(0);
  const [answer, setAnswer] = useState('');
  const [graded, setGraded] = useState<boolean | null>(null);
  const [mistakes, setMistakes] = useState<GrammarQuestion[]>([]);
  const question = queue[index];

  function grade(reveal = false) {
    if (graded !== null || (!answer.trim() && !reveal)) return;
    const expected = [question.answer, plainJapanese(question.answer, true)];
    const correct =
      !reveal && expected.some(value => answerKey(value) === answerKey(answer));
    setGraded(correct);
    if (!correct) setMistakes(previous => [...previous, question]);
    onGrade(question.id, correct);
  }

  return (
    <section
      className="grammar-surface grammar-quiz"
      aria-labelledby="grammar-quiz-title"
    >
      <div className="grammar-between">
        <h2 id="grammar-quiz-title">
          {question ? 'Ôn ngữ pháp' : 'Hoàn thành lượt ôn'}
        </h2>
        <button onClick={onClose}>Về thư viện</button>
      </div>
      {question ? (
        <>
          <progress
            max={queue.length}
            value={index + (graded === null ? 0 : 1)}
            aria-label="Tiến độ lượt ôn"
          />
          <p className="grammar-muted">
            Câu {index + 1} / {queue.length}
          </p>
          <p className="grammar-sentence">
            <Japanese text={question.prompt} reading={reading} />
          </p>
          <form
            onSubmit={event => {
              event.preventDefault();
              grade();
            }}
          >
            {question.options ? (
              <fieldset disabled={graded !== null}>
                <legend>Chọn đáp án</legend>
                {question.options.map((option, optionIndex) => (
                  <label className="grammar-option" key={optionIndex}>
                    <input
                      type="radio"
                      name="grammar-answer"
                      value={option}
                      checked={answer === option}
                      onChange={() => setAnswer(option)}
                    />
                    <Japanese text={option} reading={reading} />
                  </label>
                ))}
              </fieldset>
            ) : (
              <label className="grammar-field">
                Điền mẫu ngữ pháp bằng tiếng Nhật
                <input
                  lang="ja"
                  value={answer}
                  disabled={graded !== null}
                  onChange={event => setAnswer(event.target.value)}
                  autoComplete="off"
                />
              </label>
            )}
            {graded === null ? (
              <div className="grammar-actions">
                <button
                  className="grammar-primary"
                  type="submit"
                  disabled={!answer.trim()}
                >
                  Kiểm tra
                </button>
                <button type="button" onClick={() => grade(true)}>
                  Xem đáp án
                </button>
              </div>
            ) : null}
          </form>
          {graded !== null ? (
            <>
              <div
                className={`grammar-feedback ${graded ? 'is-correct' : ''}`}
                aria-live="polite"
              >
                <strong>
                  {graded ? 'Chính xác!' : 'Đáp án'}{' '}
                  <Japanese text={question.answer} reading={reading} />
                </strong>
                <p>
                  <Japanese text={question.sentence} reading={reading} />
                </p>
                <p>{question.translation}</p>
                {question.explanation ? (
                  <p>{plainJapanese(question.explanation)}</p>
                ) : null}
              </div>
              <button
                className="grammar-primary"
                onClick={() => {
                  setIndex(index + 1);
                  setAnswer('');
                  setGraded(null);
                }}
              >
                {index + 1 === queue.length ? 'Xem kết quả' : 'Câu tiếp theo'}
              </button>
            </>
          ) : null}
        </>
      ) : (
        <>
          <p className="grammar-sentence">
            Đúng {queue.length - mistakes.length}/{queue.length} câu
          </p>
          {mistakes.length ? (
            <button
              className="grammar-primary"
              onClick={() => {
                setQueue(mistakes);
                setMistakes([]);
                setIndex(0);
              }}
            >
              Ôn lại {mistakes.length} câu chưa đúng
            </button>
          ) : null}
        </>
      )}
    </section>
  );
}

export default function GrammarScreen({
  accountId,
  initialLevel,
}: {
  accountId: string;
  initialLevel: string;
}) {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const pageRef = useRef<HTMLElement>(null);
  const storageKey = `nihongo:grammar:v1:${accountId}`;
  const [progress, setProgress] = useState(() =>
    loadGrammarProgress(storageKey),
  );
  const [storageFailed, setStorageFailed] = useState(false);
  const [catalog, setCatalog] = useState<GrammarCatalog | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState(0);
  const [filter, setFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [reading, setReading] = useState(true);
  const [hideTranslations, setHideTranslations] = useState(false);
  const [quiz, setQuiz] = useState<GrammarQuestion[] | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoadError(false);
    fetch(dataUrl, { signal: controller.signal })
      .then(response => {
        if (!response.ok) throw new Error('Grammar catalog unavailable');
        return response.json() as Promise<GrammarCatalog>;
      })
      .then(setCatalog)
      .catch(() => {
        if (!controller.signal.aborted) setLoadError(true);
      });
    return () => controller.abort();
  }, [attempt]);

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(progress));
      setStorageFailed(false);
    } catch {
      setStorageFailed(true);
    }
  }, [progress, storageKey]);

  const requestedLevel = params.get('level') ?? initialLevel;
  const level = grammarLevels.find(value => value === requestedLevel) ?? 'N5';
  const levels = catalog?.levels ?? [];
  const allPatterns = useMemo(
    () =>
      new Map(
        (catalog?.levels ?? []).flatMap(item =>
          item.patterns.map(
            pattern => [pattern.id, { pattern, level: item.level }] as const,
          ),
        ),
      ),
    [catalog],
  );
  const patternId = params.get('mau');
  const selected = allPatterns.get(patternId ?? '');
  useEffect(() => {
    pageRef.current?.scrollTo({ top: 0 });
  }, [level, patternId, quiz]);
  useEffect(() => {
    setGroup(0);
    setPage(1);
  }, [level]);
  const active = levels.find(item => item.level === level);
  const learned = useMemo(() => new Set(progress.learned), [progress.learned]);
  const saved = useMemo(() => new Set(progress.saved), [progress.saved]);
  const terms = searchKey(query).split(/\s+/).filter(Boolean);
  const visible = (active?.patterns ?? []).filter(
    pattern =>
      (!group || pattern.g === group) &&
      (filter !== 'saved' || saved.has(pattern.id)) &&
      (filter !== 'learned' || learned.has(pattern.id)) &&
      (filter !== 'new' || !learned.has(pattern.id)) &&
      terms.every(term => grammarSearchText(pattern).includes(term)),
  );
  const groupDetail = active?.groups.find(item => item.n === group);
  const selectedIndex = selected
    ? levels.find(item => item.level === selected.level)?.patterns ?? []
    : [];
  const position = selectedIndex.findIndex(
    item => item.id === selected?.pattern.id,
  );
  const missedQuestions = useMemo(() => {
    const ids = new Set(progress.missed);
    if (!ids.size) return [];
    return (catalog?.levels ?? [])
      .flatMap(item => [
        ...item.groups.flatMap(entry =>
          groupQuestions(item, entry.n).filter(question => question.options),
        ),
        ...item.patterns.flatMap(exampleQuestions),
      ])
      .filter(question => ids.has(question.id));
  }, [catalog, progress.missed]);

  function toggle(key: 'learned' | 'saved', id: string) {
    setProgress(previous => ({
      ...previous,
      [key]: previous[key].includes(id)
        ? previous[key].filter(value => value !== id)
        : [...previous[key], id],
    }));
  }

  function changeLevel(next: GrammarLevel) {
    setParams({ level: next });
    setGroup(0);
    setPage(1);
  }

  function returnToLibrary() {
    setQuiz(null);
    if (patternId) setParams({ level }, { replace: true });
  }

  function downloadRetry() {
    setAttempt(previous => previous + 1);
  }

  function patternLink(id: string, targetLevel: GrammarLevel) {
    return `?level=${targetLevel}&mau=${encodeURIComponent(id)}`;
  }

  const sample = selected?.pattern;
  const detailQuestions = sample ? exampleQuestions(sample).slice(0, 5) : [];
  const reviewPool = active
    ? group
      ? groupQuestions(active, group)
      : active.groups.flatMap(item => groupQuestions(active, item.n))
    : [];
  const review = group
    ? reviewPool
    : reviewPool
        .filter(
          (_, index) =>
            index % Math.max(1, Math.floor(reviewPool.length / 10)) === 0,
        )
        .slice(0, 10);

  return (
    <main className="grammar-page" ref={pageRef}>
      <header className="grammar-hero">
        <div>
          <ScreenBackHeader
            title="Ngữ pháp JLPT"
            backLabel="Quay lại Bài học"
            onBack={() => navigate('/lessons?level=' + level)}
          />
          <p>Học mẫu câu theo chủ đề, đọc ví dụ và tự kiểm tra cách dùng.</p>
        </div>
        <img src={mascot} alt="" />
      </header>
      {storageFailed ? (
        <p role="status">
          Trình duyệt hiện không lưu được tiến độ trên thiết bị.
        </p>
      ) : null}
      {!catalog ? (
        <section className="grammar-surface" aria-live="polite">
          {loadError ? (
            <>
              <p>Không tải được thư viện ngữ pháp.</p>
              <button onClick={downloadRetry}>Thử lại</button>
            </>
          ) : (
            <p>Đang tải thư viện ngữ pháp…</p>
          )}
        </section>
      ) : quiz ? (
        <GrammarQuiz
          questions={quiz}
          reading={reading}
          onClose={returnToLibrary}
          onGrade={(id, correct) =>
            setProgress(previous => ({
              ...previous,
              missed: correct
                ? previous.missed.filter(value => value !== id)
                : [...new Set([...previous.missed, id])],
            }))
          }
        />
      ) : sample && selected ? (
        <div className="grammar-detail" key={sample.id}>
          <Link className="grammar-back" to={`?level=${level}`}>
            ← Danh sách mẫu {level}
          </Link>
          <section className="grammar-surface grammar-pattern-intro">
            <div className="grammar-between">
              <span className="grammar-badge">{selected.level}</span>
              <button
                aria-pressed={saved.has(sample.id)}
                onClick={() => toggle('saved', sample.id)}
              >
                {saved.has(sample.id) ? 'Đã lưu' : 'Lưu mẫu'}
              </button>
            </div>
            <h2 className="grammar-pattern">
              <Japanese text={sample.pat} reading={reading} />
            </h2>
            <p className="grammar-meaning">{sample.mean}</p>
            {sample.core ? <p>{plainJapanese(sample.core)}</p> : null}
            <div className="grammar-actions">
              <button
                className="grammar-primary"
                aria-pressed={learned.has(sample.id)}
                onClick={() => toggle('learned', sample.id)}
              >
                {learned.has(sample.id) ? '✓ Đã học' : 'Đánh dấu đã học'}
              </button>
              {detailQuestions.length ? (
                <button onClick={() => setQuiz(detailQuestions)}>
                  Luyện mẫu này
                </button>
              ) : null}
            </div>
          </section>
          <div className="grammar-detail-columns">
            <section className="grammar-surface">
              <h3>Cấu trúc và cách dùng</h3>
              {sample.form?.length ? (
                <ul className="grammar-formulas">
                  {sample.form.map((line, index) => (
                    <li key={index}>
                      <Japanese text={line} reading={reading} />
                    </li>
                  ))}
                </ul>
              ) : null}
              {sample.exp?.map((line, index) => (
                <p key={index}>{plainJapanese(line)}</p>
              ))}
              {sample.note?.length ? (
                <aside className="grammar-notes">
                  <h4>Lưu ý</h4>
                  <ul>
                    {sample.note.map((line, index) => (
                      <li key={index}>{plainJapanese(line)}</li>
                    ))}
                  </ul>
                </aside>
              ) : null}
            </section>
            <section className="grammar-surface">
              <h3>Ví dụ trong ngữ cảnh</h3>
              <div className="grammar-actions grammar-toggles">
                <label>
                  <input
                    type="checkbox"
                    checked={reading}
                    onChange={event => setReading(event.target.checked)}
                  />{' '}
                  Furigana
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={hideTranslations}
                    onChange={event =>
                      setHideTranslations(event.target.checked)
                    }
                  />{' '}
                  Ẩn bản dịch
                </label>
              </div>
              {(sample.senses ?? []).map((sense, senseIndex) => (
                <div key={senseIndex}>
                  {sense.label ? <h4>{plainJapanese(sense.label)}</h4> : null}
                  {sense.ex.map((example, index) => (
                    <div className="grammar-example" key={index}>
                      <p className="grammar-sentence">
                        <Japanese text={example.ja} reading={reading} />
                      </p>
                      {hideTranslations ? (
                        <details>
                          <summary>Xem nghĩa tiếng Việt</summary>
                          <p>{example.vi}</p>
                        </details>
                      ) : (
                        <p>{example.vi}</p>
                      )}
                    </div>
                  ))}
                </div>
              ))}
            </section>
          </div>
          {sample.cmp?.length ? (
            <section className="grammar-surface">
              <h3>Phân biệt mẫu dễ nhầm</h3>
              <div className="grammar-comparisons">
                {sample.cmp.map((entry, index) => {
                  const target = entry.id
                    ? allPatterns.get(entry.id)
                    : undefined;
                  const label = <Japanese text={entry.pat} reading={reading} />;
                  const matches =
                    target &&
                    answerKey(target.pattern.pat) === answerKey(entry.pat);
                  return (
                    <article key={index}>
                      <strong>
                        {matches ? (
                          <Link
                            to={patternLink(target.pattern.id, target.level)}
                          >
                            {label}
                          </Link>
                        ) : (
                          label
                        )}
                      </strong>
                      <p>{plainJapanese(entry.desc)}</p>
                    </article>
                  );
                })}
              </div>
            </section>
          ) : null}
          <nav className="grammar-between" aria-label="Điều hướng mẫu ngữ pháp">
            {position > 0 ? (
              <Link
                to={patternLink(selectedIndex[position - 1].id, selected.level)}
              >
                ← Mẫu trước
              </Link>
            ) : (
              <span />
            )}
            {position + 1 < selectedIndex.length ? (
              <Link
                to={patternLink(selectedIndex[position + 1].id, selected.level)}
              >
                Mẫu tiếp theo →
              </Link>
            ) : null}
          </nav>
        </div>
      ) : (
        <>
          <section
            className="grammar-surface grammar-library"
            aria-labelledby="grammar-library-title"
          >
            <div className="grammar-between">
              <h2 id="grammar-library-title">Thư viện mẫu câu</h2>
              <span className="grammar-muted">
                {active?.patterns.filter(item => learned.has(item.id)).length ??
                  0}
                /{active?.patterns.length ?? 0} đã học
              </span>
            </div>
            <nav className="grammar-actions" aria-label="Cấp độ ngữ pháp">
              {grammarLevels.map(value => (
                <button
                  key={value}
                  aria-pressed={value === level}
                  onClick={() => changeLevel(value)}
                >
                  {value}
                </button>
              ))}
            </nav>
            <div className="grammar-filters">
              <label className="grammar-field">
                Tìm mẫu hoặc nghĩa
                <input
                  type="search"
                  value={query}
                  placeholder="Ví dụ: ている, thời điểm"
                  onChange={event => {
                    setQuery(event.target.value);
                    setPage(1);
                  }}
                />
              </label>
              <label className="grammar-field">
                Chủ đề
                <select
                  value={group}
                  onChange={event => {
                    setGroup(Number(event.target.value));
                    setPage(1);
                  }}
                >
                  <option value={0}>Tất cả chủ đề</option>
                  {active?.groups.map(item => (
                    <option value={item.n} key={item.n}>
                      {item.vi}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grammar-field">
                Tiến độ
                <select
                  value={filter}
                  onChange={event => {
                    setFilter(event.target.value);
                    setPage(1);
                  }}
                >
                  <option value="all">Tất cả mẫu</option>
                  <option value="new">Chưa học</option>
                  <option value="learned">Đã học</option>
                  <option value="saved">Đã lưu</option>
                </select>
              </label>
            </div>
            {groupDetail ? (
              <p className="grammar-muted">{plainJapanese(groupDetail.desc)}</p>
            ) : null}
            <div className="grammar-actions">
              <button
                className="grammar-primary"
                disabled={!review.length}
                onClick={() => setQuiz(review)}
              >
                {group ? 'Ôn chủ đề này' : `Ôn nhanh ${level}`}
              </button>
              <button
                disabled={!missedQuestions.length}
                onClick={() => setQuiz(missedQuestions.slice(0, 20))}
              >
                Ôn câu sai ({missedQuestions.length})
              </button>
            </div>
          </section>
          <p role="status" className="grammar-muted">
            {visible.length} mẫu {level}
          </p>
          <div className="grammar-grid">
            {visible.slice(0, page * pageSize).map(pattern => (
              <Link
                className="grammar-surface grammar-card"
                to={patternLink(pattern.id, level)}
                key={pattern.id}
              >
                <span className="grammar-between">
                  <span className="grammar-muted">
                    {active?.groups.find(item => item.n === pattern.g)?.vi}
                  </span>
                  <span aria-hidden="true">
                    {learned.has(pattern.id)
                      ? '✓'
                      : saved.has(pattern.id)
                      ? '★'
                      : '→'}
                  </span>
                </span>
                <strong>
                  <Japanese text={pattern.pat} reading={false} />
                </strong>
                <span>{pattern.mean}</span>
              </Link>
            ))}
          </div>
          {!visible.length ? (
            <p className="grammar-surface">
              Không có mẫu phù hợp với bộ lọc hiện tại.
            </p>
          ) : null}
          {visible.length > page * pageSize ? (
            <button className="grammar-more" onClick={() => setPage(page + 1)}>
              Xem thêm mẫu
            </button>
          ) : null}
        </>
      )}
    </main>
  );
}
