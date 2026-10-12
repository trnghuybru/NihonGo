import unittest

from scripts.crawl_jtest_n5 import parse_index, parse_lesson, assemble_dataset


class JTestVocabularyTests(unittest.TestCase):
    def index_html(self):
        return '<main>' + ''.join(
            f'<div class="col-sm-6"><h5><a><span>Chủ đề {unit}</span></a></h5>' + ''.join(
                f'<a href="/tu-vung-n5/chapter-{unit}/section-{lesson}"><span class="font-weight-bold">Bài {lesson}</span></a>'
                for lesson in range(1, 6)) + '</div>' for unit in range(1, 11)) + '</main>'

    def lesson_html(self):
        return '''<table id="vocabularyTable"><tbody><tr><th>1
          <button class="playWordSound" value="https://cloud.jtest.net/tango/sound/n5/word/0103.mp3"></button></th>
          <td><h5><small id="word1">先生</small></h5><small id="furigana1">せんせい</small>
          <span id="meaning1">Giáo viên</span></td><td><div><p><ruby><rb>先生</rb><rp>(</rp><rt>せんせい</rt><rp>)</rp></ruby>です。</p>
          <span>Là giáo viên.</span></div><details><summary>Ví dụ thêm</summary><div><div>
          <span class="text-muted">・</span><p>こんにちは。</p><br><span>Xin chào.</span>
          </div></div></details></td></tr></tbody></table>'''

    def test_index_keeps_topics_and_ignores_other_hosts_and_duplicate_navigation(self):
        html = self.index_html().replace('</main>', '<a href="https://evil.test/tu-vung-n5/chapter-1/section-1">Other</a></main>')
        index = parse_index(html)
        self.assertEqual(len(index), 50)
        self.assertEqual((index[0]['unit_title'], index[-1]['lesson_number']), ('Chủ đề 1', 5))
        with self.assertRaises(ValueError):
            parse_index('<main></main>')

    def test_words_and_examples_keep_furigana_without_reading_bullets_as_translation(self):
        lesson = parse_lesson(self.lesson_html(), parse_index(self.index_html())[5])
        word = lesson['words'][0]
        self.assertEqual((word['word'], word['reading'], word['meaning_vi']), ('先生', 'せんせい', 'Giáo viên'))
        self.assertEqual(word['examples'][0]['japanese'], '先生です。')
        self.assertEqual(word['examples'][0]['reading'], 'せんせいです。')
        self.assertEqual(word['examples'][1]['meaning_vi'], 'Xin chào.')
        self.assertIsNone(word['han_viet'])
        self.assertEqual(word['source']['audio_url'].split('/')[-1], '0103.mp3')

    def test_invalid_or_untranslated_lesson_is_not_importable(self):
        metadata = parse_index(self.index_html())[0]
        for html in ('<html>verification</html>', self.lesson_html().replace('<span>Xin chào.</span>', '')):
            with self.assertRaises(ValueError):
                parse_lesson(html, metadata)
        data = assemble_dataset([parse_lesson(self.lesson_html(), metadata)], [{'error': 'blocked'}])
        self.assertFalse(data['coverage']['complete'])

    def test_assembly_uses_actual_count_and_stable_source_ids(self):
        index = parse_index(self.index_html())
        lessons = [parse_lesson(self.lesson_html(), metadata) for metadata in reversed(index)]
        data = assemble_dataset(lessons)
        words = [word for unit in data['units'] for lesson in unit['lessons'] for word in lesson['words']]
        self.assertTrue(data['coverage']['complete'])
        self.assertEqual(data['counts']['words'], 50)
        self.assertEqual([word['number'] for word in words], list(range(1, 51)))
        self.assertEqual(len({word['id'] for word in words}), 50)

    def test_empty_source_translation_is_kept_null_and_flagged(self):
        lesson = parse_lesson(self.lesson_html().replace('Xin chào.', ''), parse_index(self.index_html())[0])
        self.assertIsNone(lesson['words'][0]['examples'][1]['meaning_vi'])
        self.assertEqual(assemble_dataset([lesson])['quality_warnings'][0]['reason'], 'empty_source_translation')

    def test_kanji_without_source_reading_is_not_presented_as_kana(self):
        lesson = parse_lesson(self.lesson_html().replace('<small id="furigana1">せんせい</small>', ''), parse_index(self.index_html())[0])
        self.assertEqual(lesson['words'][0]['reading'], '')
        self.assertEqual(assemble_dataset([lesson])['quality_warnings'][0]['reason'], 'missing_source_furigana')
