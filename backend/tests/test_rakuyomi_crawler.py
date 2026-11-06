import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch, Mock

import requests
from scripts.crawl_rakuyomi_reading import clean_content, flight_objects, parse_passage, export, PublicPages
from reading.importer import read_dataset


def sample(index=0, prompt='何ですか。'):
    payload = ['$', 'Quiz', None, {'passageId': 42, 'questions': [
        {'id': 1, 'prompt': prompt, 'options': ['学校', '家', '駅', '店'], 'correctOption': index}]}]
    flight = '1:' + json.dumps(payload, ensure_ascii=False) + '\n'
    # React Flight records can cross script boundaries; never eval the source JS.
    middle = len(flight) // 2
    scripts = ''.join('<script>self.__next_f.push(' + json.dumps([1, part]) + ')</script>'
                      for part in [flight[:middle], flight[middle:]])
    return ('<title>Bài đọc #42 — JLPT N3 · Đọc hiểu đoạn ngắn</title>'
            '<h1>学校の案内</h1>'
            '<article id="passage-reading"><div class="passage-content" lang="ja">'
            '<p><ruby>学校<rt>がっこう</rt></ruby>です。</p></div></article>' + scripts)


class RakuyomiCrawlerTests(unittest.TestCase):
    def test_flight_fragments_and_zero_based_answers_are_converted(self):
        self.assertTrue(any(obj.get('passageId') == 42 for obj in flight_objects(sample())))
        passage = parse_passage(sample(0), 42, 'N3')
        self.assertEqual(passage['questions'][0]['answer'], 1)
        self.assertEqual(passage['questions'][0]['answer_text'], '学校')
        self.assertEqual(passage['text'], '学校です。')
        self.assertEqual(parse_passage(sample(3), 42, 'N3')['questions'][0]['answer'], 4)

    def test_content_keeps_tables_without_duplicate_furigana_or_executable_html(self):
        text, html, tables, _ = clean_content(
            '<p onclick="bad()"><ruby>学校<rt>がっこう</rt></ruby>です。</p>'
            '<script>bad()</script><table><tr><th>時間</th><td>10時</td></tr></table>')
        self.assertEqual(tables, [[['時間', '10時']]])
        self.assertIn('時間 | 10時', text)
        self.assertNotIn('がっこう', text)
        for forbidden in ['onclick', '<script', '<rt']:
            self.assertNotIn(forbidden, html)

    def test_question_markup_is_plain_text_for_import_but_preserved_for_rich_display(self):
        html = sample(prompt='<u>何</u>ですか。')
        question = parse_passage(html, 42, 'N3')['questions'][0]
        self.assertEqual(question['text'], '何ですか。')
        self.assertIn('<u>何</u>', question['text_html'])

    def test_unicode_line_separator_inside_a_question_is_not_a_flight_boundary(self):
        passage = parse_passage(sample(prompt='何\u2028ですか。'), 42, 'N3')
        self.assertEqual(passage['questions'][0]['text'], '何\nですか。')

    def test_missing_answers_or_wrong_level_never_produce_importable_passages(self):
        for index in [-1, 4, True]:
            with self.assertRaises(ValueError):
                parse_passage(sample(index), 42, 'N3')
        with self.assertRaises(ValueError):
            parse_passage(sample(), 42, 'N2')

    def test_export_roundtrips_through_existing_import_validator(self):
        passage = parse_passage(sample(), 42, 'N3')
        with tempfile.TemporaryDirectory() as folder:
            report = export(Path(folder), {42: passage}, {42}, [], 'N3', completed=True)
            imported, mismatches = read_dataset(Path(folder) / 'N3.csv')
        self.assertEqual((report['passages'], report['questions']), (1, 1))
        self.assertEqual(mismatches, [])
        self.assertEqual(imported[0]['questions'][0]['answer'], 1)

    def test_rate_limit_stops_without_retrying_or_rotating_identity(self):
        with tempfile.TemporaryDirectory() as folder:
            client = PublicPages(Path(folder), 1.5)
            response = Mock()
            response.raise_for_status.side_effect = requests.HTTPError('429')
            with patch.object(client.session, 'get', return_value=response) as get:
                with self.assertRaises(requests.HTTPError):
                    client.get('https://rakuyomi.net/vi/passages/42', '42.html')
                get.assert_called_once()


if __name__ == '__main__':
    unittest.main()
