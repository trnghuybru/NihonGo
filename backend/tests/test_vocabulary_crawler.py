import base64
import hashlib
import json
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import requests

try:
    from scripts.crawl_mimikara_n2 import (
        CrawlPaused, build_dataset, check_source_access, main, parse_index, parse_lesson,
    )
except ModuleNotFoundError as error:
    if error.name != "bs4":
        raise
    raise unittest.SkipTest("Install scripts/requirements-crawl.txt to test the crawler.") from error


# Synthetic fixture: avoid embedding the source textbook in the test suite.
CONTENT = """<audio><source src="/Audio/example.mp3"></audio>
<div class="boxtv">
  <div class="tuvung">1. <b><ruby>学<rp>(</rp><rt>まな</rt><rp>)</rp></ruby>ぶ</b></div>
  <div class="hanviet1">học</div><div class="nghia1">học hỏi</div>
  <div class="vidubox">
    <div class="tuvung"><div class="viduseq">1.</div><ruby>学<rt>まな</rt></ruby>ぶ。</div>
    <div class="nghiavidu">Học hỏi.</div>
    <div class="vidunotfirst">
      <div class="tuvung"><span class="lienquan">類</span><ruby>習<rt>なら</rt></ruby>う</div>
      <div class="nghiavidu">học</div>
    </div>
  </div>
</div>"""
LESSON = {
    "id": "mimikara-n2-u01-l01", "unit_number": 1, "lesson_number": 1,
    "unit_title": "Test", "title": "Unit 01 – Test – Bài 1",
    "source_url": "https://www.vnjpclub.com/mimi-kara-n2-goi/unit-1-bai-1.html",
}


class VocabularyCrawlerTests(unittest.TestCase):
    def test_browser_interruption_keeps_downloaded_pages_without_http_fallback(self):
        def response(text):
            result = requests.Response()
            result.status_code = 200
            result._content = text.encode()
            return result

        index = ''.join(f'<h2><a href="unit-1-bai-{number}.html">Unit 01 – Test – Bài {number}</a></h2>'
                        for number in range(1, 4))
        with tempfile.TemporaryDirectory() as directory:
            cache = Path(directory) / 'cache'
            cache.mkdir()
            def cached(number):
                url = f'https://www.vnjpclub.com/mimikara-n3-tu-vung/unit-1-bai-{number}.html'
                return cache / (hashlib.sha256(url.encode()).hexdigest() + '.html')
            cached(1).write_text(f'<div class="entry-content">{CONTENT}</div>', encoding='utf-8')
            def interrupted_browser(*args, **kwargs):
                manifest = json.loads(Path(args[0][2]).read_text())
                self.assertEqual([item['url'].split('/')[-1] for item in manifest],
                                 ['unit-1-bai-3.html', 'unit-1-bai-2.html'])
                second = CONTENT.replace('1. <b>', '2. <b>')
                cached(2).write_text(f'<div class="entry-content">{second}</div>', encoding='utf-8')
                raise subprocess.CalledProcessError(1, args[0])
            output = Path(directory) / 'mimikara-n3.json'
            with patch('scripts.crawl_mimikara_n2.requests.Session') as session, \
                 patch('scripts.crawl_mimikara_n2.shutil.which', return_value='/usr/bin/node'), \
                 patch('scripts.crawl_mimikara_n2.subprocess.run', side_effect=interrupted_browser), \
                 patch('sys.argv', ['crawler', '--browser', '--reverse', '--browser-executable', '/fake/chrome',
                                    '--cache-dir', str(cache), '--output', str(output)]):
                session.return_value.get.side_effect = [
                    response('User-agent: *\nAllow: /'), response(index),
                ]
                with self.assertRaises(SystemExit):
                    main(default_level='N3')
                self.assertEqual(session.return_value.get.call_count, 2)
            dataset = json.loads(output.with_name('mimikara-n3.partial.json').read_text())
            self.assertFalse(dataset['coverage']['complete'])
            self.assertEqual(dataset['coverage']['crawled_lessons'], 2)
            self.assertEqual(dataset['counts']['words'], 2)
            self.assertEqual(len(dataset['coverage']['failures']), 1)
            self.assertEqual([word['number'] for unit in dataset['units']
                              for lesson in unit['lessons'] for word in lesson['words']], [1, 2])
            self.assertTrue(cached(2).exists())

    def test_verification_page_is_rejected_even_with_success_status(self):
        response = requests.Response()
        response.status_code = 200
        response._content = '<html><title>Đang xác minh</title></html>'.encode()
        with self.assertRaises(CrawlPaused):
            check_source_access(response)

    def test_source_restriction_stops_network_requests_but_preserves_later_cached_lessons(self):
        def response(status, text):
            result = requests.Response()
            result.status_code = status
            result._content = text.encode()
            return result

        index = ''.join(f'<h2><a href="unit-1-bai-{number}.html">Unit 01 – Test – Bài {number}</a></h2>'
                        for number in range(1, 4))
        with tempfile.TemporaryDirectory() as directory:
            cache = Path(directory) / "cache"
            cache.mkdir()
            url = 'https://www.vnjpclub.com/mimikara-n3-tu-vung/unit-1-bai-2.html'
            cached = cache / (hashlib.sha256(url.encode()).hexdigest() + '.html')
            cached.write_text(f'<div class="entry-content">{CONTENT}</div>', encoding="utf-8")
            output = Path(directory) / 'mimikara-n3.json'
            with patch('scripts.crawl_mimikara_n2.requests.Session') as session, patch('sys.argv', [
                'crawler', '--cache-dir', str(cache), '--output', str(output),
            ]), patch('scripts.crawl_mimikara_n2.time.sleep'):
                session.return_value.get.side_effect = [
                    response(200, 'User-agent: *\nAllow: /'),
                    response(200, index),
                    response(503, '<html>Đang xác minh</html>'),
                ]
                with self.assertRaises(SystemExit):
                    main(default_level="N3")
                self.assertEqual(session.return_value.get.call_count, 3)
            self.assertFalse(output.exists())
            dataset = json.loads(output.with_name('mimikara-n3.partial.json').read_text())
            self.assertFalse(dataset['coverage']['complete'])
            self.assertEqual(dataset['coverage']['crawled_lessons'], 1)
            self.assertEqual(len(dataset['coverage']['failures']), 2)
            self.assertEqual(dataset['units'][0]['lessons'][0]['id'], 'mimikara-n3-u01-l02')
            self.assertTrue(cached.exists())

    def test_n3_index_includes_katakana_and_summaries_but_excludes_n2(self):
        html = """
          <h2><a href="unit-1-bai-1.html">Unit 01 – 名詞A – Bài 1</a></h2>
          <h2><a href="katakana-b.html">Unit 11 – カタカナB</a></h2>
          <h2><a href="katakana-a.html">Unit 06 – カタカナA</a></h2>
          <h2><a href="unit-2-a.html">まとめ 連用名詞</a></h2>
          <h2><a href="unit-3-a.html">まとめ イ形容詞＋まる／める</a></h2>
          <h2><a href="unit-11-a.html">まとめ 料理の動詞</a></h2>
          <h2><a href="/mimi-kara-n2-goi/unit-1-bai-1.html">Unit 01 – Test – Bài 1</a></h2>
        """
        lessons = parse_index(html, "N3")
        self.assertEqual([(item["unit_number"], item["lesson_number"]) for item in lessons],
                         [(1, 1), (2, 9), (3, 5), (6, 1), (11, 1), (11, 2)])
        self.assertEqual(lessons[3]["id"], "mimikara-n3-u06-l01")
        self.assertEqual(lessons[3]["unit_title"], "カタカナA")
        self.assertEqual(lessons[1]["unit_title"], "まとめ 連用名詞")
        self.assertEqual(lessons[-1]["id"], "mimikara-n3-u11-l02")
        self.assertTrue(all(item["source_url"].startswith(
            "https://www.vnjpclub.com/mimikara-n3-tu-vung/") for item in lessons))
        lesson = parse_lesson(f'<div class="entry-content">{CONTENT}</div>', lessons[0])
        dataset = build_dataset([lesson], "N3")
        self.assertEqual(dataset["textbook"]["jlpt_level"], "N3")
        self.assertEqual(dataset["units"][0]["id"], "mimikara-n3-u01")
        self.assertEqual(lesson["words"][0]["id"], "mimikara-n3-u01-l01-w0001")

    def test_index_deduplicates_sorts_and_ignores_other_books_and_hosts(self):
        html = """
          <h2><a href="unit-2-bai-1.html">Unit 02 – Test – Bài 1</a></h2>
          <h2><a href="unit-1-bai-1.html">Unit 01 – Test – Bài 1</a></h2>
          <h2><a href="unit-1-bai-1.html">Unit 01 – Test – Bài 1</a></h2>
          <h2><a href="https://other.test/mimi-kara-n2-goi/unit-1-bai-1.html">Other</a></h2>
          <h2><a href="/mimi-kara-n3-goi/unit-1-bai-1.html">Other book</a></h2>
        """
        lessons = parse_index(html)
        self.assertEqual([(item["unit_number"], item["lesson_number"]) for item in lessons],
                         [(1, 1), (2, 1)])

    def test_preserves_okurigana_and_separates_examples_from_relations(self):
        lesson = parse_lesson(f'<div class="entry-content">{CONTENT}</div>', LESSON)
        word = lesson["words"][0]
        self.assertEqual((word["word"], word["reading"]), ("学ぶ", "まなぶ"))
        self.assertEqual(word["examples"][0]["japanese"], "学ぶ。")
        self.assertEqual(word["examples"][0]["reading"], "まなぶ。")
        self.assertEqual(word["related"][0]["type"], "synonym")
        self.assertEqual(word["related"][0]["japanese"], "習う")
        self.assertEqual(lesson["audio_urls"], ["https://www.vnjpclub.com/Audio/example.mp3"])

    def test_parses_public_browser_encoded_html_without_executing_scripts(self):
        encoded = base64.b64encode(CONTENT.encode()).decode()
        for source, replacement in [("CAgI", "*"), ("CAg", "@"), ("W5", "!"),
                                    ("dGhl", "$"), ("YXN", "%"), ("YW", "&amp;")]:
            encoded = encoded.replace(source, replacement)
        html = f'<div class="entry-content"><div data-ykhp="{encoded}"></div></div>'
        self.assertEqual(parse_lesson(html, LESSON)["words"][0]["word"], "学ぶ")

    def test_rejects_empty_or_incomplete_lessons_and_duplicate_word_numbers(self):
        with self.assertRaises(ValueError):
            parse_lesson('<div class="entry-content">Login required</div>', LESSON)
        with self.assertRaises(ValueError):
            parse_lesson(f'<div class="entry-content">{CONTENT.replace("nghiavidu", "missing")}</div>', LESSON)
        lesson = parse_lesson(f'<div class="entry-content">{CONTENT}</div>', LESSON)
        with self.assertRaises(ValueError):
            build_dataset([lesson, lesson])

    def test_missing_source_translation_is_flagged_without_inventing_a_meaning(self):
        content = CONTENT.replace('<div class="nghiavidu">học</div>', '<div class="nghiavidu"></div>')
        lesson = parse_lesson(f'<div class="entry-content">{content}</div>', LESSON)
        dataset = build_dataset([lesson])
        self.assertIsNone(lesson["words"][0]["related"][0]["meaning_vi"])
        self.assertEqual(dataset["quality_warnings"], [{
            "word_id": "mimikara-n2-u01-l01-w0001", "field": "related[0].meaning_vi",
            "reason": "missing_from_source",
        }])


if __name__ == "__main__":
    unittest.main()
