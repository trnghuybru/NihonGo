import json
import unittest
from pathlib import Path

from scripts.supplement_mimikara_n3_pdf import cell_text, pdf_word


class VocabularyPdfTests(unittest.TestCase):
    def test_multiline_cells_remain_separate_and_keep_line_order(self):
        words = [
            (1, 5, 6, 9, 'second', 1, 1, 0),
            (1, 1, 6, 4, 'first', 1, 0, 0),
            (11, 1, 18, 4, 'other-column', 2, 0, 0),
        ]
        self.assertEqual(cell_text(words, (0, 0, 10, 10)), 'first\nsecond')
        self.assertIsNone(cell_text(words, None))

    def test_katakana_spelling_is_reading_and_absent_example_stays_absent(self):
        row = {'page': 33, 'cells': ['813', 'オフィス', None, '', 'văn phòng', '', '']}
        word = pdf_word(813, row, 'lesson', {'kind': 'user_supplied_pdf'})
        self.assertEqual(word['reading'], 'オフィス')
        self.assertEqual(word['examples'], [])
        self.assertEqual(word['source']['reading_method'], 'katakana_spelling')
        self.assertEqual(word['source']['page'], 33)

    def test_missing_reading_or_unpaired_translation_is_rejected(self):
        row = {'page': 1, 'cells': ['1', '学ぶ', '', '', 'học', '', '']}
        with self.assertRaises(ValueError):
            pdf_word(1, row, 'lesson', {})
        row['cells'][2] = 'まなぶ'
        row['cells'][5] = '学ぶ。'
        with self.assertRaises(ValueError):
            pdf_word(1, row, 'lesson', {})

    def test_full_n3_preserves_every_existing_word_and_fills_only_the_missing_108(self):
        directory = Path(__file__).resolve().parents[1] / 'data/vocabulary'
        base = json.loads((directory / 'mimikara-n3.partial.json').read_text())
        full = json.loads((directory / 'mimikara-n3.json').read_text())
        original = {word['id']: word for unit in base['units']
                    for lesson in unit['lessons'] for word in lesson['words']}
        words = [word for unit in full['units'] for lesson in unit['lessons'] for word in lesson['words']]
        self.assertEqual(sorted(word['number'] for word in words), list(range(1, 881)))
        added = [word for word in words if word['id'] not in original]
        self.assertEqual(len(added), 108)
        self.assertEqual(sum(bool(word['examples']) for word in added), 106)
        self.assertEqual([word['number'] for word in added if not word['examples']], [813, 838])
        for word in words:
            if word['id'] in original:
                self.assertEqual(word, original[word['id']])
        self.assertEqual(full['coverage']['crawled_lessons'], 58)
        self.assertEqual(full['coverage']['assembled_lessons'], 66)
        self.assertTrue(full['coverage']['complete'])
