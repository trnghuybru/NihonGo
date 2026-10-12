"""Export public VNJPCLUB Mimi kara N2/N3 lessons to an ordered JSON dataset.

Run from the repo root: backend/venv/bin/python backend/scripts/crawl_mimikara_n2.py
HTTP mode does not execute website JavaScript. Optional browser mode renders
public lessons in an isolated Chrome profile. Audio is referenced, never downloaded.
"""

import argparse
import base64
import hashlib
import json
import re
import shutil
import subprocess
import tempfile
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urljoin, urlparse
from urllib.robotparser import RobotFileParser

import requests
from bs4 import BeautifulSoup, NavigableString, Tag

INDEX_URL = "https://www.vnjpclub.com/mimi-kara-n2-goi/"
SOURCES = {
    "N2": INDEX_URL,
    "N3": "https://www.vnjpclub.com/mimikara-n3-tu-vung/",
}
USER_AGENT = "DATN-VocabularyImporter/1.0"
DEFAULT_OUTPUT = Path(__file__).resolve().parents[1] / "data/vocabulary/mimikara-n2.json"
RELATIONSHIPS = {
    "合": "compound", "類": "synonym", "対": "antonym",
    "関": "related", "連": "collocation", "慣": "idiom",
}


def clean(value):
    return re.sub(r"\s+", " ", value).strip()


def parse_index(html, level="N2"):
    index_url = SOURCES[level]
    path_prefix = urlparse(index_url).path
    lesson_path = re.compile(re.escape(path_prefix) + r"unit-(\d+)-bai-(\d+)\.html$")
    katakana = {path_prefix + "katakana-a.html": 6,
                path_prefix + "katakana-b.html": 11} if level == "N3" else {}
    summaries = {
        path_prefix + "unit-2-a.html": (2, 9),
        path_prefix + "unit-3-a.html": (3, 5),
        path_prefix + "unit-11-a.html": (11, 2),
    } if level == "N3" else {}
    textbook_id = f"mimikara-{level.lower()}"
    soup = BeautifulSoup(html, "html.parser")
    lessons = {}
    for link in soup.select("h2 a[href]"):
        url = urljoin(index_url, link["href"])
        parsed = urlparse(url)
        match = lesson_path.fullmatch(parsed.path)
        if parsed.netloc != "www.vnjpclub.com" or parsed.query or parsed.fragment:
            continue
        if match:
            unit, lesson = map(int, match.groups())
        elif parsed.path in katakana:
            unit, lesson = katakana[parsed.path], 1
        elif parsed.path in summaries:
            unit, lesson = summaries[parsed.path]
        else:
            continue
        title = clean(link.get_text())
        parts = re.split(r"\s+[–—-]\s+", title)
        if parsed.path not in summaries and len(parts) != (2 if parsed.path in katakana else 3):
            raise ValueError(f"Unexpected lesson title: {title}")
        lessons[(unit, lesson)] = {
            "id": f"{textbook_id}-u{unit:02d}-l{lesson:02d}",
            "unit_number": unit, "lesson_number": lesson,
            "unit_title": title if parsed.path in summaries else parts[1],
            "title": title, "source_url": url,
        }
    if not lessons:
        raise ValueError("No lesson links found; the index format may have changed.")
    return [lessons[key] for key in sorted(lessons)]


def rendered_content(html):
    soup = BeautifulSoup(html, "html.parser")
    # Reproduce the site's public dec_it()/innerHTML rendering of HTML already
    # delivered to anonymous visitors. No login, paid content or JS execution.
    for container in soup.select("[data-ykhp]"):
        encoded = container["data-ykhp"]
        for source, target in [("@", "CAg"), ("!", "W5"), ("*", "CAgI"),
                               ("$", "dGhl"), ("%", "YXN"), ("&", "YW")]:
            encoded = encoded.replace(source, target)
        decoded = base64.b64decode(encoded, validate=True).decode("utf-8")
        container.clear()
        container.append(BeautifulSoup(decoded, "html.parser"))
    content = soup.select_one(".entry-content")
    if not content:
        raise ValueError("Missing lesson content.")
    return content


def japanese(node):
    """Keep ruby spelling separate from its pronunciation, including okurigana."""
    fragment = BeautifulSoup(str(node), "html.parser")
    for item in fragment.select(".viduseq, .lienquan, rp, script, style"):
        item.decompose()
    segments = []

    def visit(item):
        if isinstance(item, NavigableString):
            value = str(item)
            if segments and not segments[-1]["reading"]:
                segments[-1]["text"] += value
            else:
                segments.append({"text": value, "reading": None})
        elif isinstance(item, Tag):
            if item.name == "ruby":
                reading = "".join(rt.get_text() for rt in item.find_all("rt"))
                spelling = "".join(str(text) for text in item.strings
                                   if text.parent.name not in {"rt", "rp"})
                segments.append({"text": spelling, "reading": reading or None})
            elif item.name not in {"rt", "rp"}:
                for child in item.children:
                    visit(child)

    visit(fragment)
    return {
        "text": clean("".join(segment["text"] for segment in segments)),
        "reading": clean("".join(segment["reading"] or segment["text"]
                                  for segment in segments)),
        "segments": segments,
    }


def parse_lesson(html, lesson):
    content = rendered_content(html)
    words = []
    for box in content.select(".boxtv"):
        heading = box.find("div", class_="tuvung", recursive=False)
        term = heading.find("b") if heading else None
        number = re.match(r"^(\d+)\.", clean(heading.get_text())) if heading else None
        meaning = box.find("div", class_=re.compile(r"^nghia\d*$"), recursive=False)
        hanviet = box.find("div", class_=re.compile(r"^hanviet\d*$"), recursive=False)
        if not term or not number or not meaning or not clean(meaning.get_text()):
            raise ValueError(f"Invalid vocabulary block in {lesson['source_url']}")
        entry_number = int(number.group(1))
        term_data = japanese(term)
        examples, related = [], []
        for line in box.select(".vidubox .tuvung"):
            translation = line.find_next_sibling("div", class_="nghiavidu")
            if not translation:
                raise ValueError(f"Missing translation in entry {entry_number}")
            line_data = japanese(line)
            item = {
                "japanese": line_data["text"], "reading": line_data["reading"],
                "meaning_vi": clean(translation.get_text()) or None,
                "segments": line_data["segments"],
            }
            relation = line.select_one(".lienquan")
            if relation:
                label = clean(relation.get_text())
                item.update({"label": label, "type": RELATIONSHIPS.get(label, "other")})
                related.append(item)
            else:
                examples.append(item)
        words.append({
            "id": f"{lesson['id']}-w{entry_number:04d}", "number": entry_number,
            "word": term_data["text"], "reading": term_data["reading"],
            "segments": term_data["segments"],
            "han_viet": clean(hanviet.get_text()) if hanviet else None,
            "meaning_vi": clean(meaning.get_text()),
            "examples": examples, "related": related,
        })
    if not words:
        raise ValueError(f"No vocabulary found in {lesson['source_url']}")
    audio = [urljoin(lesson["source_url"], source["src"])
             for source in content.select("audio source[src]")]
    return {**lesson, "audio_urls": list(dict.fromkeys(audio)), "words": words}


class CrawlPaused(RuntimeError):
    """The source is verifying visitors or temporarily limiting requests."""


def check_source_access(response):
    response.encoding = "utf-8"
    if response.status_code in {403, 429} or any(marker in response.text for marker in (
        "vnjpbg_chal", "Quá nhiều request", "Đang xác minh",
    )):
        raise CrawlPaused("Source requires verification or limits requests; retry later with the same cache.")


class Fetcher:
    def __init__(self, cache, delay):
        self.cache = cache
        cache.mkdir(parents=True, exist_ok=True)
        self.delay = delay
        self.last_request = 0
        self.session = requests.Session()
        self.session.headers["User-Agent"] = USER_AGENT
        robots_url = urljoin(INDEX_URL, "/robots.txt")
        response = self.session.get(robots_url, timeout=(10, 45))
        self.last_request = time.monotonic()
        check_source_access(response)
        response.raise_for_status()
        self.robots = RobotFileParser()
        self.robots.parse(response.text.splitlines())

    def get(self, url):
        if not self.robots.can_fetch(USER_AGENT, url):
            raise ValueError(f"robots.txt disallows {url}")
        cache_file = self.cache_file(url)
        if cache_file.exists():
            return cache_file.read_text(encoding="utf-8")
        for attempt in range(3):
            time.sleep(max(0, self.delay - (time.monotonic() - self.last_request)))
            self.last_request = time.monotonic()
            try:
                response = self.session.get(url, timeout=(10, 45))
                check_source_access(response)
                response.raise_for_status()
            except requests.RequestException as error:
                status = error.response.status_code if error.response is not None else None
                if attempt == 2 or (status and status not in {429, 500, 502, 503, 504}):
                    raise
                wait = 2 ** (attempt + 1)
                if error.response is not None:
                    retry_after = error.response.headers.get("Retry-After", "")
                    if retry_after.isdigit():
                        wait = max(wait, min(int(retry_after), 120))
                time.sleep(wait)
                continue
            response.encoding = "utf-8"
            cache_file.write_text(response.text, encoding="utf-8")
            return response.text
        raise RuntimeError(f"Failed to fetch {url}")

    def cache_file(self, url):
        return self.cache / (hashlib.sha256(url.encode()).hexdigest() + ".html")


def build_dataset(lessons, level="N2"):
    textbook_id = f"mimikara-{level.lower()}"
    numbers = [word["number"] for lesson in lessons for word in lesson["words"]]
    if len(set(numbers)) != len(numbers):
        raise ValueError("Duplicate vocabulary numbers; refusing to publish the dataset.")
    units = {}
    for lesson in lessons:
        number = lesson["unit_number"]
        unit = units.setdefault(number, {
            "id": f"{textbook_id}-u{number:02d}", "number": number,
            "title": lesson["unit_title"], "lessons": [],
        })
        unit["lessons"].append(lesson)
    words = [word for lesson in lessons for word in lesson["words"]]
    warnings = [
        {"word_id": word["id"], "field": f"{category}[{index}].meaning_vi",
         "reason": "missing_from_source"}
        for word in words for category in ("examples", "related")
        for index, item in enumerate(word[category]) if not item["meaning_vi"]
    ]
    return {
        "schema_version": 1,
        "textbook": {"id": textbook_id, "title": f"Mimi kara oboeru {level} Goi",
                     "jlpt_level": level, "language": "vi", "source_url": SOURCES[level]},
        "crawled_at": datetime.now(timezone.utc).isoformat(),
        "audio_storage": "source_urls_only",
        "quality_warnings": warnings,
        "counts": {"units": len(units), "lessons": len(lessons), "words": len(words),
                   "examples": sum(len(word["examples"]) for word in words),
                   "related": sum(len(word["related"]) for word in words)},
        "units": list(units.values()),
    }


def main(default_level="N2"):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--level", choices=tuple(SOURCES), default=default_level)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--cache-dir", type=Path)
    parser.add_argument("--reverse", action="store_true",
                        help="Fetch from the last lesson; keep output in source order.")
    parser.add_argument("--browser", action="store_true",
                        help="Render missing public lessons with Chrome and Node.js 22+.")
    parser.add_argument("--browser-executable", type=Path)
    parser.add_argument("--delay", type=float, default=5.0 if default_level == "N3" else 1.0,
                        help="Minimum seconds between requests (at least 1).")
    args = parser.parse_args()
    args.output = args.output or DEFAULT_OUTPUT.with_name(f"mimikara-{args.level.lower()}.json")
    args.cache_dir = args.cache_dir or Path(tempfile.gettempdir()) / f"datn-mimikara-{args.level.lower()}-cache"
    try:
        fetcher = Fetcher(args.cache_dir, max(1.0, args.delay))
        index = parse_index(fetcher.get(SOURCES[args.level]), args.level)
    except (requests.RequestException, CrawlPaused, ValueError) as error:
        raise SystemExit(f"Cannot read source index/robots.txt; existing artifacts and cache retained. {error}") from error
    lessons = []
    failures = []
    paused = None
    if args.reverse:
        index = list(reversed(index))
    if args.browser:
        executable = args.browser_executable or next((Path(path) for path in (
            "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
            shutil.which("google-chrome"), shutil.which("chromium"),
            shutil.which("chromium-browser")) if path and Path(path).is_file()), None)
        if executable is None or not shutil.which("node"):
            raise SystemExit("Browser mode requires Chrome/Chromium and Node.js 22 or newer.")
        manifest = [{"url": lesson["source_url"],
                     "cache_file": str(fetcher.cache_file(lesson["source_url"]))}
                    for lesson in index if not fetcher.cache_file(lesson["source_url"]).exists()]
        for item in manifest:
            if not fetcher.robots.can_fetch(USER_AGENT, item["url"]):
                raise SystemExit(f"robots.txt disallows {item['url']}")
        if manifest:
            with tempfile.TemporaryDirectory(prefix="datn-vocabulary-browser-") as directory:
                source = Path(directory) / "manifest.json"
                source.write_text(json.dumps(manifest), encoding="utf-8")
                command = ["node", str(Path(__file__).with_name("fetch_vocabulary_browser.mjs")),
                           str(source), str(executable), str(args.cache_dir / "browser-profile"),
                           str(max(30.0, args.delay))]
                try:
                    subprocess.run(command, check=True)
                except subprocess.CalledProcessError:
                    paused = "Browser verification incomplete or source unavailable; retry later."
        # Never fall back to HTTP requests for pages Chrome could not load.
        paused = paused or "Browser did not cache this page."
    for position, lesson in enumerate(index, 1):
        if paused and not fetcher.cache_file(lesson["source_url"]).exists():
            failures.append({"source_url": lesson["source_url"], "title": lesson["title"],
                             "error": f"Not fetched after source restriction: {paused}"})
            continue
        try:
            result = parse_lesson(fetcher.get(lesson["source_url"]), lesson)
        except (requests.RequestException, ValueError, CrawlPaused) as error:
            if isinstance(error, CrawlPaused):
                paused = str(error)
            failures.append({"source_url": lesson["source_url"], "title": lesson["title"],
                             "error": str(error)})
            print(f"[{position}/{len(index)}] FAILED {lesson['title']}: {error}", flush=True)
            continue
        lessons.append(result)
        print(f"[{position}/{len(index)}] {lesson['title']}: {len(result['words'])} words", flush=True)
    lessons.sort(key=lambda lesson: (lesson["unit_number"], lesson["lesson_number"]))
    dataset = build_dataset(lessons, args.level)
    dataset["coverage"] = {"complete": not failures, "expected_lessons": len(index),
                           "crawled_lessons": len(lessons), "failures": failures}
    if failures:
        args.output = args.output.with_name(args.output.stem + ".partial.json")
    args.output.parent.mkdir(parents=True, exist_ok=True)
    # Only replace the final artifact after every lesson has parsed successfully.
    temporary = args.output.with_suffix(".json.tmp")
    temporary.write_text(json.dumps(dataset, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    temporary.replace(args.output)
    print(f"Saved {args.output}: {dataset['counts']}")
    if failures:
        raise SystemExit(f"Incomplete crawl: {len(failures)} failed lessons; see coverage.failures.")


if __name__ == "__main__":
    main()
