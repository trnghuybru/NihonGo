import json
import unittest
from pathlib import Path

from scripts.extract_n4_anki import plain_text


class VocabularyAnkiTests(unittest.TestCase):
    def test_html_is_text_and_scripts_are_ignored(self):
        self.assertEqual(plain_text('nghiên cứu<br>thất'), 'nghiên cứu thất')
        self.assertEqual(plain_text('かいまし<br>た。', True), 'かいました。')
        self.assertEqual(plain_text('A&amp;B<script>alert(1)</script>'), 'A&B')

    def test_artifact_covers_all_notes_with_unique_ids_and_small_lessons(self):
        data = json.loads((Path(__file__).resolve().parents[1] / 'data/vocabulary/anki-n4.json').read_text())
        lessons = [lesson for unit in data['units'] for lesson in unit['lessons']]
        words = [word for lesson in lessons for word in lesson['words']]
        self.assertEqual(len(words), 728)
        self.assertEqual(len({word['source']['note_id'] for word in words}), 728)
        self.assertEqual(sorted(word['number'] for word in words), list(range(1, 729)))
        self.assertTrue(all(1 <= len(lesson['words']) <= 25 for lesson in lessons))
        self.assertTrue(all(word['reading'] and word['examples'][0]['meaning_vi'] for word in words))
        self.assertEqual(len([word for word in words if word['word'] == 'のに']), 2)

    def test_n1_artifact_preserves_all_notes_and_embedded_audio_references(self):
        data = json.loads((Path(__file__).resolve().parents[1] / 'data/vocabulary/mimikara-n1.json').read_text())
        words = [word for unit in data['units'] for lesson in unit['lessons'] for word in lesson['words']]
        self.assertEqual([word['number'] for word in words], list(range(1, 1201)))
        self.assertEqual(len({word['source']['note_id'] for word in words}), 1200)
        self.assertEqual([word['source']['note_id'] for word in words], sorted(word['source']['note_id'] for word in words))
        self.assertTrue(all(word['examples'][0]['meaning_vi'] and word['reading'] for word in words))
        audio = [audio for word in words for audio in word['source']['audio']]
        self.assertEqual(len(audio), 820)
        self.assertTrue(all(item['present_in_package'] for item in audio))
        self.assertEqual(len({(word['word'], word['reading']) for word in words}), 1193)
