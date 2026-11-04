import copy
import importlib.util
from pathlib import Path
import unittest

from alembic.migration import MigrationContext
from alembic.operations import Operations
from sqlalchemy import create_engine, text as sql
from writing.rubric import RUBRIC, validate_assessment


def model_assessment():
    return {
        'criteria': [{'id': identifier, 'comment': 'Bài viết đáp ứng yêu cầu của trình độ.',
            'scores': [{'id': sub_id, 'score': 4} for sub_id, _ in subs]}
            for identifier, _, subs in RUBRIC],
        'corrections': [{'original': '学校を行きます', 'replacement': '学校に行きます',
            'explanation': 'Dùng に để chỉ đích đến với 行きます.', 'criterion_id': 'grammar', 'kind': 'error'}],
        'next_step': 'Viết hai câu dùng に và へ để chỉ nơi đến.',
    }


class WritingRubricTests(unittest.TestCase):
    def test_scores_are_computed_and_corrected_text_preserves_untouched_characters(self):
        original = '😊今日は学校を行きます。\n友だちに会います。'
        result = validate_assessment(model_assessment(), original, 'N5')
        self.assertEqual(result['score'], 80)
        self.assertEqual([item['score'] for item in result['assessment']['criteria']], [20] * 4)
        self.assertEqual(result['corrected_text'], '😊今日は学校に行きます。\n友だちに会います。')
        correction = result['assessment']['corrections'][0]
        self.assertEqual(original[correction['start']:correction['end']], correction['original'])
        self.assertEqual(correction['start'], 4)  # Unicode code points, not UTF-16.

    def test_rounding_and_no_corrections(self):
        value = model_assessment()
        value['corrections'] = []
        value['criteria'][0]['scores'][0]['score'] = 5
        result = validate_assessment(value, 'そのままの文。', 'N3')
        self.assertEqual(result['score'], 82)
        self.assertEqual(result['corrected_text'], 'そのままの文。')
        self.assertEqual(result['assessment']['level'], 'N3')

    def test_rejects_missing_duplicate_or_out_of_range_scores(self):
        for problem in ('missing', 'duplicate', 'boolean', 'range'):
            with self.subTest(problem=problem):
                value = model_assessment()
                if problem == 'missing': value['criteria'].pop()
                if problem == 'duplicate': value['criteria'][0]['scores'][1] = copy.deepcopy(value['criteria'][0]['scores'][0])
                if problem == 'boolean': value['criteria'][0]['scores'][0]['score'] = True
                if problem == 'range': value['criteria'][0]['scores'][0]['score'] = 6
                with self.assertRaises(ValueError): validate_assessment(value, '学校を行きます。', 'N5')

    def test_rejects_fabricated_repeated_and_overlapping_quotes(self):
        for original in ('学校に行きます。', '学校を行きます。学校を行きます。'):
            with self.assertRaises(ValueError): validate_assessment(model_assessment(), original, 'N5')
        value = model_assessment()
        value['corrections'].append({**value['corrections'][0], 'original': '学校を', 'replacement': '学校に'})
        with self.assertRaises(ValueError): validate_assessment(value, '学校を行きます。', 'N5')

    def test_sorts_edits_and_supports_insertions_and_deletions(self):
        value = model_assessment()
        correction = value['corrections'][0]
        value['corrections'] = [
            {**correction, 'original': '。。', 'replacement': '。'},
            {**correction, 'original': '学校行きます', 'replacement': '学校に行きます'},
        ]
        result = validate_assessment(value, '学校行きます。。', 'N4')
        self.assertEqual(result['corrected_text'], '学校に行きます。')
        self.assertEqual(result['assessment']['corrections'][0]['start'], 0)

    def test_migration_preserves_legacy_submissions(self):
        file = Path(__file__).resolve().parents[1] / 'migrations/versions/bc4d5e6f7182_writing_assessment.py'
        spec = importlib.util.spec_from_file_location('assessment_migration', file)
        migration = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(migration)
        engine = create_engine('sqlite://')
        with engine.begin() as connection:
            connection.execute(sql('CREATE TABLE writing_submissions (id TEXT PRIMARY KEY, text TEXT NOT NULL)'))
            connection.execute(sql("INSERT INTO writing_submissions VALUES ('old', '元の文。')"))
            with Operations.context(MigrationContext.configure(connection)):
                migration.upgrade()
                row = connection.execute(sql('SELECT text, assessment FROM writing_submissions')).one()
                self.assertEqual(tuple(row), ('元の文。', None))
                migration.downgrade()
                self.assertEqual(connection.execute(sql('SELECT text FROM writing_submissions')).scalar(), '元の文。')
        engine.dispose()
