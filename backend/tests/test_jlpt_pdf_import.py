import copy
import json
import re
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

from flask import Flask
from extensions import db
from jlpt.models import JlptExamRecord, JlptImage
from jlpt.database import import_payload
from jlpt.prepare_pdf_import import validate_mapping
from jlpt.service import grade, preview, public_exam
from jlpt.review import explain, vocabulary


ROOT = Path(__file__).resolve().parents[1] / 'jlpt'


class PdfExamImportTests(unittest.TestCase):
    def test_reviewed_mapping_is_complete_and_rejects_missing_source_pages(self):
        manifest = json.loads((ROOT / 'pdf_sources/n2-2022-2024.json').read_text())
        self.assertEqual(len(manifest['exams']), 5)
        for exam in manifest['exams']:
            self.assertEqual(len(validate_mapping(exam)), 71)
        bad = copy.deepcopy(manifest['exams'][0])
        bad['language_pages']['71'] = [999]
        with self.assertRaises(ValueError):
            validate_mapping(bad)
        bad = copy.deepcopy(manifest['exams'][0])
        del bad['language_pages']['1']
        with self.assertRaises(ValueError):
            validate_mapping(bad)

    def test_older_n2_mapping_accepts_72_questions_without_dropping_the_last_question(self):
        manifest = json.loads((ROOT / 'pdf_sources/n2-2022-2024.json').read_text())
        older = copy.deepcopy(manifest['exams'][0])
        older['language_answer_keys'][10] += '1'
        older['language_pages']['72'] = older['language_pages']['71']
        self.assertEqual(len(validate_mapping(older)), 72)
        del older['language_pages']['72']
        with self.assertRaises(ValueError):
            validate_mapping(older)

    def test_five_exams_import_idempotently_and_grade_505_original_questions(self):
        payload = json.loads((ROOT / 'import_data/n2-2022-2024.json').read_text())
        manifest = json.loads((ROOT / 'pdf_sources/n2-2022-2024.json').read_text())
        app = Flask(__name__)
        app.config.update(SQLALCHEMY_DATABASE_URI='sqlite://', TESTING=True)
        db.init_app(app)
        with app.app_context():
            db.create_all()
            result = import_payload(payload)
            import_payload(payload)
            self.assertEqual(result['graded_exams'], 5)
            self.assertEqual(db.session.query(JlptExamRecord).count(), 5)
            self.assertEqual(db.session.query(JlptImage).count(), len(payload['assets']))
            assets = {a['id'] for a in payload['assets']}
            for exam, mapping in zip(payload['normalized'], manifest['exams']):
                questions = [q for s in exam['sections'] for q in s['questions']]
                self.assertEqual(len(questions), 101)
                self.assertEqual(len({q['id'] for q in questions}), 101)
                self.assertEqual([len(s['questions']) for s in exam['sections']], [71, 30])
                self.assertTrue(questions[0]['prompt'])
                self.assertEqual(questions[0]['images'], [])
                self.assertNotEqual(questions[0].get('content_format'), 'image')
                self.assertTrue(questions[69]['images'])
                self.assertTrue(questions[70]['images'])
                transcription = json.loads((ROOT / f"text_sources/{exam['id']}.json").read_text())
                for question, star in zip(questions[42:47], transcription['star_positions_visually_checked']):
                    slots = re.findall('＿＿|★', question['prompt'])
                    self.assertEqual(len(slots), 4)
                    self.assertEqual(slots.index('★') + 1, star)
                for question in questions[47:51]:
                    for number in range(48, 52):
                        self.assertIn(f'（{number}）', question['passage'])
                self.assertEqual([q['number'] for q in questions[:71]], list(range(1, 72)))
                self.assertEqual([q['source_pages'] for q in questions[:71]],
                                 [mapping['language_pages'][str(n)] for n in range(1, 72)])
                self.assertEqual([q['answer_index'] for q in questions[:71]],
                                 [int(n) - 1 for n in ''.join(mapping['language_answer_keys'])])
                self.assertEqual([q['subquestion'] for q in questions if 'subquestion' in q], [1, 2])
                for question in questions:
                    self.assertNotRegex('\n'.join([question['prompt'], question['passage'] or '', *question['options']]),
                                        r'(?i)likely a typo|preserving transcription|candidate transcription')
                    for image in question['images']:
                        self.assertIn(image['image_id'], assets)
                    self.assertGreaterEqual(question['answer_index'], 0)
                    self.assertLess(question['answer_index'], len(question['options']))
                answers = {q['id']: q['answer_index'] for q in questions}
                scored = grade(exam, {'version': 1, 'answers': answers})
                self.assertEqual((scored['correct'], scored['total']), (101, 101))
                self.assertEqual(grade(exam, {'version': 1, 'answers': {}})['correct'], 0)
                info = preview(exam)
                self.assertEqual([s['duration_seconds'] for s in info['sections']], [6300, 3000])
                self.assertIsNone(info['audio_url'])
                client = Mock()
                client.generate_presigned_url.return_value = 'https://r2.example.invalid/signed'
                with patch('vocabulary.audio._tts_client', return_value=client):
                    public = public_exam(exam)
                self.assertNotIn('answer_index', json.dumps(public))
                self.assertEqual(public['sections'][0]['questions'][69]['images'][0]['image_data_url'],
                                 'https://r2.example.invalid/signed')
            word_review = vocabulary(payload['normalized'][0]['sections'][0]['questions'][0])
            self.assertEqual(''.join(t['text'] for t in word_review['prompt_tokens']),
                             payload['normalized'][0]['sections'][0]['questions'][0]['prompt'])
            self.assertTrue(word_review['words'])
            db.session.remove()
            db.drop_all()

    def test_image_question_does_not_send_unread_content_to_ai_or_dictionary(self):
        question = {'content_format': 'image', 'options': ['1', '2', '3', '4']}
        with self.assertRaises(Exception) as error:
            vocabulary(question)
        self.assertEqual(error.exception.code, 'jlpt_image_question')
        with patch('shadowing.quiz.request_questions') as ai:
            with self.assertRaises(Exception) as error:
                explain({}, question, 1)
            self.assertEqual(error.exception.code, 'jlpt_image_question')
            ai.assert_not_called()

    def test_additional_five_exams_keep_507_source_questions_and_shared_readings(self):
        payload = json.loads((ROOT / 'import_data/n2-more-2020-2025.json').read_text())
        manifest = json.loads((ROOT / 'pdf_sources/n2-more-2020-2025.json').read_text())
        assets = {a['id'] for a in payload['assets']}
        total = 0
        for exam, source in zip(payload['normalized'], manifest['exams']):
            language, listening = [s['questions'] for s in exam['sections']]
            key = validate_mapping(source)
            self.assertEqual(len(language), len(key))
            self.assertEqual(len(listening), 30)
            self.assertEqual([q['number'] for q in language], list(range(1, len(key) + 1)))
            self.assertEqual([q['answer_index'] for q in language], [int(n) - 1 for n in key])
            self.assertEqual([q['answer_index'] for q in listening],
                             [int(n) - 1 for n in ''.join(source['listening_answer_keys'])])
            transcript = json.loads((ROOT / 'text_sources/n2-more-2020-2025' / f"{exam['id']}.json").read_text())
            for question, star in zip(language[42:47], transcript['star_positions_visually_checked']):
                slots = re.findall('＿＿|★', question['prompt'])
                self.assertEqual(len(slots), 4)
                self.assertEqual(slots.index('★') + 1, star)
            long_reading = [q for q in language if q['group'] == 13]
            self.assertEqual(len(long_reading), 3)
            self.assertEqual(len({q['passage'] for q in long_reading}), 1)
            self.assertGreater(len(long_reading[0]['passage']), 500)
            information = [q for q in language if q['group'] == 14]
            self.assertEqual(len(information), 2)
            self.assertEqual(information[0]['images'][0]['id'], information[1]['images'][0]['id'])
            questions = language + listening
            for question in questions:
                self.assertNotEqual(question.get('content_format'), 'image')
                for image in question['images']:
                    self.assertIn(image['image_id'], assets)
                self.assertNotIn('\\u3000', question['prompt'])
            answers = {q['id']: q['answer_index'] for q in questions}
            self.assertEqual(grade(exam, {'version': 1, 'answers': answers})['correct'], len(questions))
            self.assertIsNone(exam['audio_url'])
            total += len(questions)
        self.assertEqual(total, 507)
        app = Flask(__name__)
        app.config.update(SQLALCHEMY_DATABASE_URI='sqlite://', TESTING=True)
        db.init_app(app)
        with app.app_context():
            db.create_all()
            import_payload(payload)
            import_payload(payload)
            self.assertEqual(db.session.query(JlptExamRecord).count(), 5)
            db.session.remove()
            db.drop_all()
