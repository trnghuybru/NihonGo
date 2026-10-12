"""Crawl the public JTest N5 lessons sequentially, with robots checks and cache."""
import argparse
import hashlib
import json
import re
import tempfile
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urljoin, urlparse
from urllib.robotparser import RobotFileParser

import requests
from bs4 import BeautifulSoup

if __package__:
    from .crawl_mimikara_n2 import japanese, clean
else:
    from crawl_mimikara_n2 import japanese, clean

INDEX = 'https://jtest.net/tu-vung-n5'
USER_AGENT = 'DATN-VocabularyImporter/1.0'
BOOK_ID = 'jtest-n5'


def parse_index(html):
    soup = BeautifulSoup(html, 'html.parser')
    lessons = {}
    for link in soup.select('main a[href]'):
        url = urljoin(INDEX, link['href'])
        parsed = urlparse(url)
        match = re.fullmatch(r'/tu-vung-n5/chapter-(\d+)/section-(\d+)', parsed.path)
        if parsed.netloc != 'jtest.net' or not match:
            continue
        unit, number = map(int, match.groups())
        container = link.find_parent('div', class_='col-sm-6')
        heading = container.select_one('h5 a span') if container else None
        title = link.select_one('.font-weight-bold')
        if not heading or not title:
            raise ValueError('Unexpected N5 index layout.')
        lessons[(unit, number)] = {'id': f'{BOOK_ID}-u{unit:02d}-l{number:02d}',
            'unit_number': unit, 'unit_title': clean(heading.get_text()),
            'lesson_number': number, 'title': clean(title.get_text()), 'source_url': url}
    if set(lessons) != {(unit, number) for unit in range(1, 11) for number in range(1, 6)}:
        raise ValueError('Expected the 50 N5 lessons in 10 chapters.')
    return [lessons[key] for key in sorted(lessons)]


def parse_lesson(html, metadata):
    soup = BeautifulSoup(html, 'html.parser')
    words = []
    for row in soup.select('#vocabularyTable tbody tr'):
        cells = row.find_all('td', recursive=False)
        if len(cells) != 2:
            raise ValueError('Unexpected vocabulary row layout.')
        term = cells[0].select_one('[id^="word"]')
        meaning = cells[0].select_one('[id^="meaning"]')
        furigana = cells[0].select_one('[id^="furigana"]')
        if not term or not meaning:
            raise ValueError('Missing word or translation.')
        word_data = japanese(term)
        reading = clean(furigana.get_text()) if furigana else word_data['reading']
        if not furigana and reading == word_data['text'] and re.search(r'[\u3400-\u9fff]', reading):
            reading = ''
        if not word_data['text'] or not clean(meaning.get_text()):
            raise ValueError('Empty word or meaning.')
        examples = []
        for sentence in cells[1].select('p'):
            # Additional examples start with a decorative bullet span.
            spans = sentence.parent.find_all('span', recursive=False)
            translation = next((span for span in spans if clean(span.get_text()) != '・'), None)
            if translation is None:
                raise ValueError('Missing example translation.')
            parsed = japanese(sentence)
            examples.append({'japanese': parsed['text'], 'reading': parsed['reading'],
                             'segments': parsed['segments'], 'meaning_vi': clean(translation.get_text()) or None})
        if not examples:
            raise ValueError('Missing source examples.')
        audio_button = row.select_one('.playWordSound[value]')
        audio_url = audio_button['value'] if audio_button else None
        if audio_url and not re.fullmatch(r'https://cloud\.jtest\.net/tango/sound/n5/word/\d+\.mp3', audio_url):
            raise ValueError('Unexpected source audio URL.')
        position = len(words) + 1
        words.append({'id': f"{metadata['id']}-w{position:03d}", 'number': position,
            'word': word_data['text'], 'reading': reading, 'han_viet': None,
            'segments': [{'text': word_data['text'], 'reading': reading if reading and reading != word_data['text'] else None}],
            'meaning_vi': clean(meaning.get_text()), 'examples': examples, 'related': [],
            'source': {'kind': 'website', 'url': metadata['source_url'],
                       'row_number': position, 'audio_url': audio_url}})
    if not words:
        raise ValueError('Empty lesson or source verification page.')
    return {**metadata, 'audio_urls': [], 'words': words}


def assemble_dataset(lessons, failures=()):
    units = {}
    words = []
    for lesson in sorted(lessons, key=lambda lesson: (lesson['unit_number'], lesson['lesson_number'])):
        unit = units.setdefault(lesson['unit_number'], {'number': lesson['unit_number'],
            'title': lesson['unit_title'], 'lessons': []})
        for word in lesson['words']:
            word['number'] = len(words) + 1
            words.append(word)
        unit['lessons'].append(lesson)
    return {'schema_version': 1, 'crawled_at': datetime.now(timezone.utc).isoformat(),
        'textbook': {'id': BOOK_ID, 'title': '1000 Từ vựng JLPT N5', 'jlpt_level': 'N5', 'source_url': INDEX},
        'sources': [{'kind': 'website', 'url': INDEX}], 'units': list(units.values()),
        'counts': {'units': len(units), 'lessons': len(lessons), 'words': len(words),
                   'examples': sum(len(word['examples']) for word in words), 'related': 0},
        'coverage': {'complete': len(lessons) == 50 and not failures, 'expected_lessons': 50,
                     'crawled_lessons': len(lessons), 'failures': list(failures)},
        'quality_warnings': [{'word_id': word['id'], 'field': 'reading', 'reason': 'missing_source_furigana'}
                             for word in words if not word['reading']] +
                            [{'word_id': word['id'], 'field': 'examples.meaning_vi',
                              'example_index': index, 'reason': 'empty_source_translation'}
                             for word in words for index, example in enumerate(word['examples'])
                             if example['meaning_vi'] is None], 'source_review': {'proofread': False,
            'note': 'Source title says 1000; counts reflect actual rows. Word numbers follow lesson/row order. No Han Viet invented. Audio URLs retained without download.'}}


class Fetcher:
    def __init__(self, cache, delay):
        self.cache, self.delay = Path(cache), max(2, delay)
        self.cache.mkdir(parents=True, exist_ok=True)
        self.session = requests.Session()
        self.session.headers['User-Agent'] = USER_AGENT
        response = self.session.get('https://jtest.net/robots.txt', timeout=30)
        response.raise_for_status()
        self.robots = RobotFileParser()
        self.robots.parse(response.text.splitlines())
        self.last_request = time.monotonic()

    def get(self, url):
        if urlparse(url).netloc != 'jtest.net' or not self.robots.can_fetch(USER_AGENT, url):
            raise ValueError('Source host or robots.txt disallows this request.')
        path = self.cache / (hashlib.sha256(url.encode()).hexdigest() + '.html')
        if path.exists():
            return path.read_text(encoding='utf-8')
        time.sleep(max(0, self.delay - (time.monotonic() - self.last_request)))
        response = self.session.get(url, timeout=30)
        self.last_request = time.monotonic()
        response.raise_for_status()
        response.encoding = 'utf-8'
        if any(marker in response.text.lower() for marker in ('cf-chl-', 'just a moment...', 'captcha')):
            raise ValueError('Source requires verification; stop and retry later.')
        path.write_text(response.text, encoding='utf-8')
        return response.text


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--cache-dir', type=Path, default=Path(tempfile.gettempdir()) / 'datn-jtest-n5-cache')
    parser.add_argument('--delay', type=float, default=3)
    parser.add_argument('--output', type=Path, default=Path(__file__).resolve().parents[1] / 'data/vocabulary/jtest-n5.json')
    args = parser.parse_args()
    fetcher = Fetcher(args.cache_dir, args.delay)
    index = parse_index(fetcher.get(INDEX))
    lessons, failures = [], []
    for position, lesson in enumerate(index, 1):
        try:
            parsed = parse_lesson(fetcher.get(lesson['source_url']), lesson)
        except (ValueError, requests.RequestException) as error:
            failures.append({'lesson_id': lesson['id'], 'error': str(error)})
            break
        lessons.append(parsed)
        print(f"[{position}/50] {lesson['unit_title']} / {lesson['title']}: {len(parsed['words'])} words", flush=True)
    dataset = assemble_dataset(lessons, failures)
    output = args.output if dataset['coverage']['complete'] else args.output.with_suffix('.partial.json')
    output.parent.mkdir(parents=True, exist_ok=True)
    temporary = output.with_suffix('.json.tmp')
    temporary.write_text(json.dumps(dataset, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    temporary.replace(output)
    print(f"Saved {output}: {dataset['counts']}")
    if failures:
        raise SystemExit('Crawl paused; existing full dataset retained. Resume using the same cache.')


if __name__ == '__main__':
    main()
