import unittest

from scripts.extract_n4_anki import plain_text


class VocabularyAnkiTests(unittest.TestCase):
    def test_html_is_text_and_scripts_are_ignored(self):
        self.assertEqual(plain_text('nghiên cứu<br>thất'), 'nghiên cứu thất')
        self.assertEqual(plain_text('かいまし<br>た。', True), 'かいました。')
        self.assertEqual(plain_text('A&amp;B<script>alert(1)</script>'), 'A&B')
