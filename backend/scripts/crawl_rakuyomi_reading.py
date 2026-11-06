"""Collect public Rakuyomi reading pages into a resumable, reviewed dataset.

No login, private API, AI calls or database writes. Stop on access/rate limits.
"""
import argparse
import csv
import json
import re
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urljoin, urlparse, parse_qs

import requests
from bs4 import BeautifulSoup

BASE = 'https://rakuyomi.net'
COLUMNS = ['Level', 'Dạng mondai', 'Bài', 'Đoạn', 'Bài đọc', 'Câu hỏi',
           'Lựa chọn 1', 'Lựa chọn 2', 'Lựa chọn 3', 'Lựa chọn 4', 'Đáp án (số)', 'Đáp án (nội dung)', 'Nguồn']
KINDS = {'đoạn ngắn': ('short', '短文'), 'đoạn trung': ('medium', '中文'),
         'đoạn dài': ('long', '長文'), 'tìm kiếm thông tin': ('information', '情報検索'),
         'tổng hợp': ('integrated', '統合理解'), 'theo chủ đề': ('thematic', 'テーマ別')}


def walk(value):
    if isinstance(value, dict):
        yield value
        for child in value.values():
            yield from walk(child)
    elif isinstance(value, list):
        for child in value:
            yield from walk(child)


def flight_objects(html):
    fragments = []
    for match in re.finditer(r'self\.__next_f\.push\((.*?)\)</script>', html, re.S):
        try:
            item = json.loads(match[1])
        except ValueError:
            continue
        if isinstance(item, list) and len(item) > 1 and isinstance(item[1], str):
            fragments.append(item[1])
    # Flight records use LF; U+2028 inside a JSON string is source content.
    for line in ''.join(fragments).split('\n'):
        data = line.partition(':')[2]
        if data.startswith(('[', '{')):
            try:
                yield from walk(json.loads(data))
            except ValueError:
                continue


def clean_content(html):
    soup = BeautifulSoup(html, 'html.parser')
    for node in soup.select('script, style, iframe, object, embed, form, input, button, rt, rp'):
        node.decompose()
    for node in soup.select('ruby'):
        node.unwrap()
    allowed = {'p', 'div', 'span', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'sup', 'sub',
               'table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th', 'caption', 'figure',
               'figcaption', 'ul', 'ol', 'li', 'dl', 'dt', 'dd', 'blockquote', 'hr', 'img'}
    for node in list(soup.find_all(True)):
        if node.name not in allowed:
            node.unwrap()
            continue
        attrs = {key: value for key, value in node.attrs.items() if key in ('colspan', 'rowspan', 'alt')}
        if node.name == 'img':
            url = urljoin(BASE, node.get('src', ''))
            if urlparse(url).scheme in ('http', 'https'):
                attrs['src'] = url
        node.attrs = attrs
    clean_html = str(soup)
    tables = [[[cell.get_text('', strip=True) for cell in row.find_all(['td', 'th'], recursive=False)]
               for row in table.select('tr')] for table in soup.select('table')]
    images = [node['src'] for node in soup.select('img[src]')]
    for table in soup.select('table'):
        rows = [' | '.join(cell.get_text('', strip=True) for cell in row.find_all(['td', 'th'], recursive=False))
                for row in table.select('tr')]
        table.replace_with('\n' + '\n'.join(rows) + '\n')
    for br in soup.select('br'):
        br.replace_with('\n')
    for node in soup.find_all(['p', 'div', 'figure', 'figcaption', 'li', 'blockquote', 'dt', 'dd']):
        node.insert_before('\n')
        node.insert_after('\n')
    text = '\n'.join(line.strip() for line in soup.get_text().replace('\r', '').splitlines() if line.strip())
    return text, clean_html, tables, images


def parse_passage(html, identifier, level):
    soup = BeautifulSoup(html, 'html.parser')
    heading = soup.find('h1')
    descriptor = soup.title.get_text(' ', strip=True) if soup.title else ''
    title = heading.get_text(' ', strip=True) if heading else descriptor
    if f'JLPT {level}' not in descriptor:
        raise ValueError('Wrong level or missing passage heading')
    matches = [value for key, value in KINDS.items() if key in descriptor.lower()]
    if len(matches) != 1:
        raise ValueError('Unknown passage category')
    body = soup.select_one('#passage-reading .passage-content[lang="ja"]')
    if body is None:
        raise ValueError('Public Japanese passage body unavailable')
    text, content_html, tables, images = clean_content(str(body))
    if not text:
        raise ValueError('Empty passage text')
    candidates = [obj['questions'] for obj in flight_objects(html)
                  if obj.get('passageId') == identifier and isinstance(obj.get('questions'), list)]
    if len(candidates) != 1 or not candidates[0]:
        raise ValueError('Public question payload missing or ambiguous')
    questions = []
    for item in candidates[0]:
        options, index, prompt = item.get('options'), item.get('correctOption'), item.get('prompt')
        if (not isinstance(prompt, str) or not prompt.strip() or not isinstance(options, list) or len(options) != 4
                or any(not isinstance(option, str) or not option.strip() for option in options)
                or type(index) is not int or index not in range(4)):
            raise ValueError('Invalid question/options/zero-based answer')
        # Verified against the public quiz UI: options.map((option, index) => index === correctOption).
        prompt_text, prompt_html, _, _ = clean_content(prompt)
        clean_options = [clean_content(option) for option in options]
        option_text = [option[0] for option in clean_options]
        if not prompt_text or not all(option_text):
            raise ValueError('Empty question/options after markup removal')
        questions.append({'source_id': item['id'], 'text': prompt_text, 'text_html': prompt_html,
                          'options': option_text, 'options_html': [option[1] for option in clean_options],
                          'answer': index + 1, 'answer_text': option_text[index]})
    kind, label = matches[0]
    return {'source_id': identifier, 'level': level, 'kind': kind, 'kind_label': label,
            'title': title, 'text': text, 'content_html': content_html, 'tables': tables,
            'images': images, 'source_url': f'{BASE}/vi/passages/{identifier}', 'questions': questions}


def atomic_json(path, value):
    temporary = path.with_suffix(path.suffix + '.tmp')
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    temporary.replace(path)


def export(output, passages, identifiers, failures, level, completed=False):
    passages = sorted(passages.values(), key=lambda item: item['source_id'], reverse=True)
    atomic_json(output / f'{level}.json', passages)
    csv_path = output / f'{level}.csv'
    temporary = csv_path.with_suffix('.csv.tmp')
    with temporary.open('w', encoding='utf-8-sig', newline='') as file:
        writer = csv.DictWriter(file, fieldnames=COLUMNS)
        writer.writeheader()
        for passage in passages:
            for question in passage['questions']:
                row = {'Level': level, 'Dạng mondai': passage['kind_label'], 'Bài': passage['title'],
                       'Đoạn': 1, 'Bài đọc': passage['text'], 'Câu hỏi': question['text'],
                       'Đáp án (số)': question['answer'], 'Đáp án (nội dung)': question['answer_text'],
                       'Nguồn': passage['source_url']}
                row.update({f'Lựa chọn {i + 1}': option for i, option in enumerate(question['options'])})
                writer.writerow(row)
    temporary.replace(csv_path)
    report = {'source': f'{BASE}/vi/passages/{level.lower()}', 'level': level,
              'updated_at': datetime.now(timezone.utc).isoformat(), 'completed': completed,
              'discovered': len(identifiers), 'passages': len(passages),
              'questions': sum(len(p['questions']) for p in passages),
              'with_tables': sum(bool(p['tables']) for p in passages),
              'with_images': sum(bool(p['images']) for p in passages),
              'failures': failures}
    atomic_json(output / 'report.json', report)
    return report


class PublicPages:
    def __init__(self, cache, delay):
        self.cache, self.delay, self.last = cache, delay, 0
        self.session = requests.Session()
        self.session.headers['User-Agent'] = 'NihonGO-Reading-Import/1.0 (public-pages-only)'
        cache.mkdir(parents=True, exist_ok=True)

    def get(self, url, name):
        path = self.cache / name
        if path.exists():
            return path.read_text(encoding='utf-8')
        time.sleep(max(0, self.delay - (time.monotonic() - self.last)))
        self.last = time.monotonic()
        response = self.session.get(url, timeout=(5, 25), allow_redirects=False)
        # Do not rotate identities, use login cookies, or bypass source limits.
        response.raise_for_status()
        if response.status_code != 200 or 'text/html' not in response.headers.get('Content-Type', ''):
            raise RuntimeError('Unexpected response or redirect; stopped')
        path.write_text(response.text, encoding='utf-8')
        return response.text


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--level', choices=['N5', 'N4', 'N3', 'N2', 'N1'], default='N3')
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--cache', type=Path, required=True)
    parser.add_argument('--delay', type=float, default=1.5)
    parser.add_argument('--reparse', action='store_true', help='Rebuild saved records from cached HTML')
    args = parser.parse_args()
    if args.delay < 1:
        parser.error('--delay must be at least 1 second')
    args.output.mkdir(parents=True, exist_ok=True)
    pages = PublicPages(args.cache, args.delay)
    identifiers, failures, passages = set(), [], {}
    existing = args.output / f'{args.level}.json'
    if existing.exists():
        passages = {item['source_id']: item for item in json.loads(existing.read_text())}
    page, last_page = 1, 1
    try:
        while page <= last_page:
            url = f'{BASE}/vi/passages/{args.level.lower()}?page={page}'
            soup = BeautifulSoup(pages.get(url, f'list-{args.level}-{page}.html'), 'html.parser')
            for anchor in soup.select('a[href]'):
                href = anchor['href']
                match = re.fullmatch(r'/vi/passages/(\d+)', href)
                if match:
                    identifiers.add(int(match[1]))
                parsed = urlparse(href)
                if parsed.path == f'/vi/passages/{args.level.lower()}':
                    value = parse_qs(parsed.query).get('page', ['1'])[0]
                    if value.isdigit():
                        last_page = max(last_page, int(value))
            if last_page > 100:
                raise RuntimeError('Unexpected pagination size; stopped')
            print(f'Listing {page}/{last_page}; discovered={len(identifiers)}', flush=True)
            page += 1
        if not identifiers:
            raise RuntimeError('No public passage links; stopped')
        for index, identifier in enumerate(sorted(identifiers, reverse=True), 1):
            if identifier not in passages or args.reparse:
                html = pages.get(f'{BASE}/vi/passages/{identifier}', f'{identifier}.html')
                try:
                    passages[identifier] = parse_passage(html, identifier, args.level)
                except ValueError as error:
                    passages.pop(identifier, None)
                    failures.append({'source_id': identifier, 'reason': str(error)})
            if index % 10 == 0 or index == len(identifiers):
                report = export(args.output, passages, identifiers, failures, args.level)
                print(f'Passages {index}/{len(identifiers)}; valid={report["passages"]}; failures={len(failures)}', flush=True)
    except (requests.RequestException, RuntimeError, KeyboardInterrupt) as error:
        failures.append({'reason': type(error).__name__ + ': ' + str(error)[:180]})
        export(args.output, passages, identifiers, failures, args.level)
        raise SystemExit('Stopped; partial dataset saved. No database changes.') from error
    report = export(args.output, passages, identifiers, failures, args.level, completed=True)
    print(json.dumps(report, ensure_ascii=False), flush=True)


if __name__ == '__main__':
    main()
