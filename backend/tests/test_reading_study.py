import copy
import json
import os
import unittest
from unittest.mock import Mock, patch
from flask import Flask
from types import SimpleNamespace
from api_errors import ApiError
from reading.study import generate, normalize, source_for
from reading.study_source import anchor, sentences
from reading_study_fixtures import analysis_payload, explanation_payload, sentence_payload


class StudyValidationTests(unittest.TestCase):
    def setUp(self):
        self.app = Flask(__name__)
        self.app.config['AUTH_SECRET_KEY'] = 'testing-key'
        self.context = self.app.app_context(); self.context.push()
        self.passage = SimpleNamespace(title='学校', level='N5', text='学校へ行きました。\n\n明日も行きます。', questions=[])
        self.source = source_for(self.passage, 'analysis')

    def tearDown(self):
        self.context.pop()

    def test_sentence_offsets_preserve_unicode_quotes_whitespace_and_repeated_words(self):
        source = {'sentences': sentences('😀 学校です。「本当？」\n\n 学校へ。')}
        self.assertEqual(''.join(s['text'] for s in source['sentences']), '😀 学校です。「本当？」 学校へ。')
        location = anchor({'sentence_id': 's3', 'quote': '学校'}, source)
        self.assertEqual((location['paragraph_id'], location['start'], location['end']), ('2', 1, 3))
        location = anchor({'sentence_id': 's1', 'quote': '学校'}, source)
        self.assertEqual(location['start'], 3)  # Emoji is two browser code units.
        with self.assertRaises(ValueError): anchor({'sentence_id': 's3', 'quote': '本当'}, source)

    def test_analysis_is_normalized_and_rejects_hallucinated_or_duplicate_citations(self):
        data = analysis_payload(self.source)
        result = normalize(data, self.source, 'analysis')
        self.assertEqual(result['sentences'], [])
        self.assertEqual(result['vocabulary'][0]['location']['paragraph_id'], '0')
        for mutate in [lambda d: d['grammar'][0]['location'].update(quote='ありません'),
                       lambda d: d['structure'][0].update(sentence_id='s999'),
                       lambda d: d.update(structure=d['structure'] * 7),
                       lambda d: d.update(summary=''), lambda d: d.update(vocabulary='not an array')]:
            invalid = copy.deepcopy(data); mutate(invalid)
            with self.assertRaises((ValueError, StopIteration)): normalize(invalid, self.source, 'analysis')

    def test_explanation_never_uses_ai_answer_index_and_flags_uncertain_source(self):
        source = {**self.source, 'question': {'id': 'q1', 'correct_index': 2}}
        data = explanation_payload(source); data.update(correct_index=0, answer_supported=False)
        result = normalize(data, source, 'explanation:q1')
        self.assertEqual(result['correct_index'], 2)
        self.assertTrue(result['caution'])
        source['requested_sentence_id'] = 's2'
        with self.assertRaises(ValueError): normalize(sentence_payload(source), source, 'sentence:s2')

    @patch.dict(os.environ, {'GEMINI_API_KEY': 'test-key', 'READING_AI_MODEL': 'gemini-3.1-flash-lite'})
    def test_provider_uses_structured_schema_and_retries_invalid_quotes_once(self):
        valid = analysis_payload(self.source)
        invalid = copy.deepcopy(valid); invalid['vocabulary'][0]['location']['quote'] = '架空'
        with patch('reading.study.request_questions', side_effect=[invalid, valid]) as provider:
            data = generate(self.source, 'analysis')
            self.assertEqual(provider.call_count, 2)
            self.assertEqual(data['summary'], valid['summary'])
            payload = provider.call_args.args[2]
            self.assertIn('responseJsonSchema', payload['generationConfig'])
            self.assertNotIn('maxItems', json.dumps(payload['generationConfig']['responseJsonSchema']))
            self.assertNotIn('question', self.source)
        with patch('reading.study.request_questions', return_value=invalid):
            with self.assertRaises(ApiError) as error: generate(self.source, 'analysis')
            self.assertEqual(error.exception.code, 'reading_ai_invalid_response')

    @patch.dict(os.environ, {'GEMINI_API_KEY': ''})
    def test_missing_api_key_is_explicit_and_never_calls_provider(self):
        with patch('reading.study.request_questions') as provider:
            with self.assertRaises(ApiError) as error: generate(self.source, 'analysis')
            self.assertEqual(error.exception.status, 503)
            provider.assert_not_called()


    def test_short_prompts_and_single_source_copy_with_targeted_sentence_context(self):
        from reading.study_prompts import prompt_for, provider_source
        prompt = prompt_for(self.source, 'analysis')
        payload = provider_source(self.source, 'analysis')
        self.assertLess(len(prompt), 2500)
        self.assertNotIn('original_text', payload)
        self.assertNotIn('paragraphs', payload)
        self.assertNotIn('questions', payload)
        self.assertEqual([s['text'] for s in payload['sentences']], [s['text'] for s in self.source['sentences']])

    def test_segments_roundtrip_unicode_and_reject_missing_reordered_or_invented_source(self):
        from reading.sentence_structure import sentence_structure
        sample = sentence_payload(self.source)
        detail = sentence_structure(sample, self.source)
        self.assertEqual(''.join(s['text'] for s in detail['segments']), detail['original'])
        self.assertEqual(detail['core_text'], detail['original'])
        for mutate in [lambda d: d['segments'][0].update(text='架空'),
                       lambda d: d['segments'][0].update(text=d['segments'][0]['text'][:-1]),
                       lambda d: d['segments'][0].update(is_core=False),
                       lambda d: d['segments'][0].update(role='unknown'),
                       lambda d: d.update(segments=['invalid'])]:
            invalid = copy.deepcopy(sample); mutate(invalid)
            with self.assertRaises(ValueError): sentence_structure(invalid, self.source)

    def test_long_modifier_is_separate_from_the_main_subject_predicate(self):
        from reading.sentence_structure import sentence_structure
        original = '難しい顔をして勉強することがよいことだと思っていた私は、いつも不思議だった。'
        source = {'sentences': sentences(original)}
        item = {'sentence_id': 's1', 'implicit_subject': '', 'core_translation_vi': 'Tôi luôn cảm thấy lạ.',
            'translation_vi': 'Tôi, vốn từng nghĩ học với vẻ mặt nghiêm nghị là tốt, luôn cảm thấy lạ.', 'caution': '',
            'segments': [
                {'text': '難しい顔をして勉強することがよいことだと思っていた', 'role': 'modifier', 'is_core': False, 'explanation': 'Mệnh đề bổ nghĩa cho 私.'},
                {'text': '私は、', 'role': 'subject', 'is_core': True, 'explanation': 'Chủ thể của vị ngữ cuối.'},
                {'text': 'いつも', 'role': 'adjunct', 'is_core': True, 'explanation': 'Tần suất cần giữ khi rút gọn.'},
                {'text': '不思議だった。', 'role': 'predicate', 'is_core': True, 'explanation': 'Vị ngữ chính.'}]}
        result = sentence_structure(item, source)
        self.assertEqual(result['core_text'], '私は、いつも不思議だった。')
        self.assertEqual(''.join(s['text'] for s in result['segments']), original)
        self.assertEqual(result['segments'][0]['location']['start'], 0)

        nested = copy.deepcopy(item)
        nested['segments'][0].update(role='subject', is_core=True)
        with self.assertRaises(ValueError): sentence_structure(nested, source)
        missing_frequency = copy.deepcopy(item)
        missing_frequency['segments'][2]['is_core'] = False
        with self.assertRaises(ValueError): sentence_structure(missing_frequency, source)
