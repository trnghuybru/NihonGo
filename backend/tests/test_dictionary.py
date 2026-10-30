"""Dictionary behavior using isolated data; can also run against a PostgreSQL test schema."""
import gzip
import json
import os
import tempfile
import unittest
import uuid
from pathlib import Path

from flask import Flask
from sqlalchemy import create_engine, delete, func, select, text

from auth import init_auth
from auth.models import AuthSession, User, now
from auth.security import digest
from dictionary import init_dictionary
from dictionary.importer import import_jmdict, import_kanjidic, import_kanjivg, import_vocabulary
from dictionary.models import DictionaryEntry, DictionaryKanji, DictionaryTerm
from dictionary.normalize import normalize, romaji_to_kana
from dictionary.vietnamese import import_vietnamese
from extensions import db
from vocabulary import init_vocabulary
from vocabulary.importer import import_dataset

JMDICT = '''<?xml version="1.0"?><JMdict>
<entry><ent_seq>1</ent_seq><k_ele><keb>学校</keb><ke_pri>ichi1</ke_pri></k_ele>
<k_ele><keb>學校</keb></k_ele><r_ele><reb>がっこう</reb><re_restr>学校</re_restr></r_ele>
<sense><pos>noun</pos><gloss>school</gloss></sense><sense><stagk>学校</stagk><gloss>educational institution</gloss></sense></entry>
<entry><ent_seq>2</ent_seq><k_ele><keb>学校生活</keb></k_ele><r_ele><reb>がっこうせいかつ</reb></r_ele>
<sense><pos>noun</pos><gloss>school life</gloss></sense></entry>
<entry><ent_seq>3</ent_seq><k_ele><keb>人生</keb></k_ele><r_ele><reb>じんせい</reb></r_ele>
<sense><gloss>human life</gloss></sense></entry></JMdict>'''
KANJIDIC = '''<kanjidic2><character><literal>学</literal>
<radical><rad_value rad_type="classical">39</rad_value></radical><misc><stroke_count>8</stroke_count><jlpt>4</jlpt></misc>
<reading_meaning><rmgroup><reading r_type="ja_on">ガク</reading><reading r_type="ja_kun">まな.ぶ</reading>
<reading r_type="vietnam">Học</reading><meaning>study</meaning></rmgroup><nanori>たか</nanori></reading_meaning>
</character></kanjidic2>'''
KANJIVG = '''<kanjivg xmlns:kvg="http://kanjivg.tagaini.net"><kanji id="kvg:kanji_05b66">
<g xmlns="http://www.w3.org/2000/svg"><path d="M20,20 C30,30 40,40 50,50"/>
<path d="M10,40 L60,40"/></g></kanji></kanjivg>'''


class DictionaryTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.app = Flask(__name__)
        url = os.getenv('TEST_DATABASE_URL', 'sqlite://')
        cls.admin = None
        cls.app.config.update(TESTING=True, AUTH_CONFIGURED=True, AUTH_SECRET_KEY='dictionary-test-' * 4,
                              SQLALCHEMY_DATABASE_URI=url)
        if url.startswith('postgresql'):
            cls.schema = 'test_dictionary_' + uuid.uuid4().hex
            cls.admin = create_engine(url)
            with cls.admin.begin() as connection:
                connection.execute(text(f'CREATE SCHEMA "{cls.schema}"'))
            cls.app.config['SQLALCHEMY_ENGINE_OPTIONS'] = {'connect_args': {'options': f'-csearch_path={cls.schema}'}}
        init_auth(cls.app)
        init_vocabulary(cls.app)
        init_dictionary(cls.app)
        with cls.app.app_context():
            db.create_all()

    @classmethod
    def tearDownClass(cls):
        with cls.app.app_context():
            db.session.remove()
            db.engine.dispose()
        if cls.admin:
            with cls.admin.begin() as connection:
                connection.execute(text(f'DROP SCHEMA "{cls.schema}" CASCADE'))
            cls.admin.dispose()

    def setUp(self):
        self.context = self.app.app_context()
        self.context.push()
        for table in reversed(db.metadata.sorted_tables):
            db.session.execute(delete(table))
        db.session.add(User(id='dictionary-user', name='Dictionary Test', email='dictionary@example.com', phone='+84912345678'))
        db.session.flush()
        db.session.add(AuthSession(user_id='dictionary-user', access_hash=digest('dictionary-token'),
                                  access_expires_at=now() + 900, expires_at=now() + 3600))
        db.session.commit()
        self.client = self.app.test_client()
        self.directory = tempfile.TemporaryDirectory()
        self.jmdict = self.file('jmdict.xml.gz', JMDICT)
        self.kanjidic = self.file('kanjidic.xml.gz', KANJIDIC)
        self.kanjivg = self.file('kanjivg.xml.gz', KANJIVG)
        import_jmdict(self.jmdict)
        import_kanjidic(self.kanjidic)
        import_kanjivg(self.kanjivg)
        db.session.commit()

    def tearDown(self):
        db.session.remove()
        self.context.pop()
        self.directory.cleanup()

    def file(self, name, content):
        path = Path(self.directory.name) / name
        path.write_bytes(gzip.compress(content.encode()))
        return path

    def get(self, path, **kwargs):
        return self.client.get('/api/dictionary' + path, headers={'Authorization': 'Bearer dictionary-token'}, **kwargs)

    def test_history_is_explicit_deduplicated_and_account_scoped(self):
        headers = {'Authorization': 'Bearer dictionary-token'}
        self.get('/words?q=学校')
        self.get('/words/jmdict:1')
        self.assertEqual(self.get('/history').json['items'], [])
        def record(kind, target):
            response = self.client.post('/api/dictionary/history', headers=headers, json={'kind': kind, 'target': target})
            self.assertEqual(response.status_code, 200, response.json)
            return response.json['items']
        record('word', 'jmdict:1')
        items = record('kanji', '学')
        self.assertEqual(items[0]['reading'], 'HỌC')
        items = record('word', 'jmdict:1')
        self.assertEqual([(item['kind'], item['target']) for item in items], [('word', 'jmdict:1'), ('kanji', '学')])
        db.session.add(User(id='other-user', name='Other', email='other@example.com', phone='+84911111111'))
        db.session.flush()
        db.session.add(AuthSession(user_id='other-user', access_hash=digest('other-token'),
                                  access_expires_at=now() + 900, expires_at=now() + 3600))
        db.session.commit()
        other_headers = {'Authorization': 'Bearer other-token'}
        self.assertEqual(self.client.get('/api/dictionary/history', headers=other_headers).json['items'], [])
        self.client.delete('/api/dictionary/history', headers=other_headers)
        self.assertEqual(len(self.get('/history').json['items']), 2)
        self.assertEqual(self.client.delete('/api/dictionary/history', headers=headers).json['items'], [])
        self.assertEqual(self.get('/history').json['items'], [])

    def test_history_limit_and_validation(self):
        headers = {'Authorization': 'Bearer dictionary-token'}
        for method in ('get', 'post', 'delete'):
            self.assertEqual(getattr(self.client, method)('/api/dictionary/history').status_code, 401)
        for data in ({}, {'kind': 'word', 'target': []}, {'kind': 'video', 'target': 'x'},
                     {'kind': 'word', 'target': 'x', 'user_id': 'another'}):
            self.assertEqual(self.client.post('/api/dictionary/history', headers=headers, json=data).status_code, 400)
        for target in ('missing', 'local:1'):
            self.assertEqual(self.client.post('/api/dictionary/history', headers=headers,
                json={'kind': 'word', 'target': target}).status_code, 404)
        template = db.session.get(DictionaryEntry, 'jmdict:1')
        for index in range(31):
            db.session.add(DictionaryEntry(id=f'jmdict:history{index}', word=f'学校{index}',
                reading='がっこう', content=template.content, common=False))
        db.session.commit()
        for index in range(31):
            response = self.client.post('/api/dictionary/history', headers=headers,
                json={'kind': 'word', 'target': f'jmdict:history{index}'})
            self.assertEqual(response.status_code, 200)
        items = self.get('/history').json['items']
        self.assertEqual(len(items), 30)
        self.assertEqual(items[0]['target'], 'jmdict:history30')
        self.assertEqual(items[-1]['target'], 'jmdict:history1')

    def test_normalization_preserves_dakuten_and_handles_vietnamese_romaji(self):
        self.assertEqual(normalize('ガッコウ'), 'がっこう')
        self.assertNotEqual(normalize('が'), normalize('か'))
        self.assertEqual(normalize('Đời Sống'), 'doi song')
        self.assertEqual(romaji_to_kana('gakkou'), 'がっこう')
        self.assertEqual(romaji_to_kana("kan'i"), 'かんい')
        self.assertEqual(romaji_to_kana('kanji'), 'かんじ')
        self.assertIsNone(romaji_to_kana('trường học'))

    def test_words_match_variants_kana_romaji_meaning_and_rank_exact_first(self):
        for query in ('学校', '學校', 'がっこう', 'ガッコウ', 'gakkou', 'school'):
            response = self.get('/words', query_string={'q': query})
            self.assertEqual(response.status_code, 200, response.json)
            self.assertEqual(response.json['items'][0]['id'], 'jmdict:1')
        page = self.get('/words?q=学校&page_size=1&page=2').json
        self.assertEqual(page['pagination']['total'], 2)
        self.assertEqual(page['items'][0]['word'], '学校生活')
        self.assertEqual(page['items'][0]['match_type'], 'prefix')
        self.assertEqual(self.get('/words?q=学校').json['items'][0]['match_type'], 'exact')
        self.assertEqual(self.get('/words?q=%25').json['items'], [])

    def test_detail_preserves_senses_restrictions_and_links_kanji(self):
        result = self.get('/words/jmdict:1').json
        self.assertEqual(result['kanji'], ['学'])
        self.assertEqual(result['readings'][0]['applies_to'], ['学校'])
        self.assertEqual(len(result['senses']), 2)
        self.assertEqual(result['senses'][1]['applies_to_forms'], ['学校'])
        self.assertEqual(result['senses'][1]['parts_of_speech'], ['noun'])
        self.assertEqual(result['source']['name'], 'JMdict')
        self.assertEqual(result['kanji_details'][0]['literal'], '学')
        self.assertEqual([item['word'] for item in result['related_entries']], ['学校生活'])

    def test_primary_reading_respects_spelling_restrictions(self):
        source = self.file('restricted.xml.gz', '''<JMdict><entry><ent_seq>1</ent_seq>
            <k_ele><keb>学校</keb></k_ele><k_ele><keb>學校</keb></k_ele>
            <r_ele><reb>べつ</reb><re_restr>學校</re_restr></r_ele>
            <r_ele><reb>がっこう</reb><re_restr>学校</re_restr></r_ele>
            <sense><gloss>school</gloss></sense></entry></JMdict>''')
        import_jmdict(source)
        db.session.commit()
        result = self.get('/words/jmdict:1').json
        self.assertEqual((result['word'], result['reading']), ('学校', 'がっこう'))
        self.assertEqual(result['readings'][0]['applies_to'], ['學校'])

    def test_kanji_search_and_compounds_with_local_diagram(self):
        for query in ('学', 'học', 'hoc', 'ガク', 'gaku', 'まなぶ'):
            self.assertEqual(self.get('/kanji', query_string={'q': query}).json['items'][0]['literal'], '学')
        result = self.get('/kanji/学').json
        self.assertEqual(result['han_viet'], ['Học'])
        self.assertEqual(result['radicals'], [39])
        self.assertEqual(len(result['stroke_paths']), 2)
        self.assertEqual({word['word'] for word in result['compounds']}, {'学校', '学校生活'})
        self.assertNotIn('jlpt', result)
        self.assertEqual(result['diagram_source']['license'], 'CC BY-SA 3.0')

    def test_kanji_word_query_preserves_character_order_and_deduplicates(self):
        extra = KANJIDIC.replace('学', '校').replace('Học', 'Hiệu')
        import_kanjidic(self.file('second-kanji.xml.gz', extra))
        db.session.commit()
        for query, expected in [('学校学', ['学', '校']), ('校学', ['校', '学'])]:
            response = self.get('/kanji', query_string={'q': query})
            self.assertEqual(response.status_code, 200)
            self.assertEqual([item['literal'] for item in response.json['items']], expected)
        page = self.get('/kanji', query_string={'q': '校学', 'page_size': 1, 'page': 2}).json
        self.assertEqual(page['pagination']['total'], 2)
        self.assertEqual(page['items'][0]['literal'], '学')

    def test_import_repeatable_refresh_keeps_diagrams_and_source_checksum(self):
        first_terms = db.session.scalar(select(func.count()).select_from(DictionaryTerm))
        import_jmdict(self.jmdict)
        import_kanjidic(self.kanjidic)
        db.session.commit()
        self.assertEqual(db.session.scalar(select(func.count()).select_from(DictionaryEntry)), 3)
        self.assertEqual(db.session.scalar(select(func.count()).select_from(DictionaryTerm)), first_terms)
        self.assertEqual(len(db.session.get(DictionaryKanji, '学').content['stroke_paths']), 2)
        self.assertTrue(all(len(source['sha256']) == 64 for source in self.get('/sources').json['items']))

    def test_lesson_vocabulary_is_excluded_from_all_dictionary_views(self):
        for level in ('N5', 'N2'):
            book_id = 'test-' + level
            import_dataset({'schema_version': 1, 'coverage': {'complete': True},
                'textbook': {'id': book_id, 'title': level + ' Test', 'jlpt_level': level, 'source_url': 'https://example.com'},
                'counts': {'lessons': 1, 'words': 1}, 'units': [{'lessons': [{
                    'id': book_id + '-lesson', 'unit_number': 1, 'unit_title': 'Test', 'title': 'Test',
                    'source_url': '', 'audio_urls': [], 'lesson_number': 1,
                    'words': [{'id': book_id + '-word', 'number': 1, 'word': '学校', 'reading': 'がっこう',
                               'meaning_vi': 'trường học', 'examples': [], 'related': []}]}]}]})
        self.assertEqual(import_vocabulary(), 1)
        self.assertEqual(import_vocabulary(), 1)
        db.session.commit()
        result = self.get('/words?q=truong+hoc').json['items']
        self.assertEqual(result, [])
        exact = self.get('/words?q=学校').json['items']
        self.assertEqual(len(exact), 2)
        self.assertEqual(exact[0]['id'], 'jmdict:1')
        detail = self.get('/words/jmdict:1').json
        self.assertEqual(detail['source_id'], 'jmdict')
        self.assertTrue(all(item['source_id'] == 'jmdict' for item in detail['other_entries'] + detail['related_entries']))
        local = db.session.scalar(select(DictionaryEntry).where(DictionaryEntry.id.like('local:%')))
        self.assertIsNotNone(local)
        self.assertEqual(self.get('/words/' + local.id).status_code, 404)
        self.assertTrue(all(item['source_id'] == 'jmdict' for item in self.get('/kanji/学').json['compounds']))
        self.assertNotIn('local', [source['id'] for source in self.get('/sources').json['items']])
        lesson = self.client.get('/api/vocabulary/lessons/test-N5-lesson',
            headers={'Authorization': 'Bearer dictionary-token'}).json
        self.assertEqual(lesson['words'][0]['meaning_vi'], 'trường học')

    def test_vietnamese_dictionary_search_precedence_and_repeatable_import(self):
        records = [
            {'word': '学校', 'lang_code': 'ja', 'pos': 'noun', 'pos_title': 'Danh từ',
             'senses': [{'glosses': ['Trường học.'], 'examples': [
                 {'text': '学校へ行く。', 'translation': 'Đi đến trường.'}]}]},
            {'word': '学校', 'lang_code': 'ja', 'pos': 'noun', 'pos_title': 'Danh từ',
             'senses': [{'glosses': ['Nhà trường.']}]},
            {'word': '食べる', 'lang_code': 'ja', 'pos': 'verb', 'pos_title': 'Động từ',
             'forms': [{'form': '食べる', 'ruby': [['食', 'た']], 'tags': ['canonical']},
                       {'form': 'たべた', 'tags': ['past']}],
             'senses': [{'glosses': ['Ăn.']}]},
            {'word': 'gakkou', 'lang_code': 'ja', 'pos': 'romanization',
             'senses': [{'glosses': ['Rōmaji của がっこう']}]},
            {'word': '学校', 'lang_code': 'zh', 'pos': 'noun', 'senses': [{'glosses': ['Không dùng.']}]},
            {'word': '空', 'lang_code': 'ja', 'pos': 'noun', 'senses': [{'tags': ['no-gloss']}]},
        ]
        source = self.file('vietnamese.jsonl.gz', '\n'.join(json.dumps(record, ensure_ascii=False) for record in records))
        self.assertEqual(import_vietnamese(source), 2)
        db.session.commit()
        count = db.session.scalar(select(func.count()).select_from(DictionaryTerm))
        self.assertEqual(import_vietnamese(source), 2)
        db.session.commit()
        self.assertEqual(count, db.session.scalar(select(func.count()).select_from(DictionaryTerm)))
        for query in ('学校', 'がっこう', 'gakkou', 'trường học', 'truong hoc', 'NHÀ TRƯỜNG'):
            items = self.get('/words', query_string={'q': query}).json['items']
            self.assertEqual(items[0]['source_id'], 'viwiktionary', query)
            self.assertEqual(items[0]['reading'], 'がっこう')
            self.assertEqual(sum(item['word'] == '学校' for item in items), 1)
        entry = self.get('/words?q=truong+hoc').json['items'][0]
        detail = self.get('/words/' + entry['id']).json
        self.assertEqual(len(detail['senses']), 2)
        self.assertEqual(detail['examples'][0]['meaning_vi'], 'Đi đến trường.')
        self.assertEqual(detail['other_entries'][0]['id'], 'jmdict:1')
        self.assertEqual(self.get('/words?q=学校生活').json['items'][0]['source_id'], 'jmdict')
        self.assertEqual(self.get('/kanji/学').json['compounds'][0]['source_id'], 'viwiktionary')
        food = self.get('/words', query_string={'q': 'ăn'}).json['items'][0]
        self.assertEqual(food['reading'], 'たべる')
        self.assertEqual(self.get('/words?q=たべた').json['items'], [])
        self.assertIn('viwiktionary', [item['id'] for item in self.get('/sources').json['items']])
        vietnamese = self.get('/words?q=truong+hoc&language=vi').json['items']
        self.assertEqual(vietnamese[0]['word'], '学校')
        self.assertEqual(self.get('/words?q=school&language=vi').json['items'], [])
        self.assertEqual(self.get('/words?q=学校&language=vi').json['items'], [])
        self.assertEqual(self.get('/words?q=an&language=vi').json['items'][0]['word'], '食べる')
        self.assertEqual(self.get('/words?q=school&language=xx').status_code, 400)

    def test_vietnamese_import_does_not_guess_ambiguous_reading_and_rolls_back(self):
        second = self.file('ambiguous.xml.gz', '''<JMdict><entry><ent_seq>4</ent_seq>
            <k_ele><keb>学校</keb></k_ele><r_ele><reb>べつ</reb></r_ele>
            <sense><gloss>alternate</gloss></sense></entry></JMdict>''')
        import_jmdict(second)
        db.session.commit()
        source = self.file('vietnamese.jsonl.gz', json.dumps({'word': '学校', 'lang_code': 'ja',
            'pos': 'noun', 'senses': [{'glosses': ['Trường học']}]}))
        import_vietnamese(source)
        db.session.commit()
        self.assertEqual(self.get('/words?q=truong+hoc').json['items'][0]['reading'], '')
        broken = self.file('broken.jsonl.gz', gzip.decompress(source.read_bytes()).decode() + '\nnot json')
        new_word = self.file('new.xml.gz', JMDICT.replace('<ent_seq>1</ent_seq>', '<ent_seq>5</ent_seq>'))
        result = self.app.test_cli_runner().invoke(args=['dictionary-import', '--jmdict', str(new_word), '--vietnamese', str(broken)])
        self.assertNotEqual(result.exit_code, 0)
        self.assertEqual(db.session.scalar(select(func.count()).select_from(DictionaryEntry)), 5)

    def test_jmdict_refresh_preserves_saved_vietnamese_and_english_originals(self):
        row = db.session.get(DictionaryEntry, 'jmdict:1')
        original = json.loads(json.dumps(row.content))
        stored = json.loads(json.dumps(original))
        for sense, meaning in zip(stored['senses'], ('trường học', 'cơ sở giáo dục')):
            sense['glosses'].append({'language': 'vi', 'text': meaning, 'machine': True})
            sense['translation'] = {'status': 'machine', 'engine': 'previous-offline-import'}
        row.content = stored
        db.session.commit()
        import_jmdict(self.jmdict)
        db.session.commit()
        detail = self.get('/words/jmdict:1').json
        self.assertEqual(detail['readings'], original['readings'])
        for before, after in zip(original['senses'], detail['senses']):
            self.assertEqual(before['glosses'], [g for g in after['glosses'] if not g.get('machine')])
            self.assertEqual(before['applies_to_forms'], after['applies_to_forms'])
            self.assertEqual(after['translation']['status'], 'machine')
            self.assertTrue(any(g.get('machine') for g in after['glosses']))
        self.assertEqual(self.get('/words?q=truong+hoc&language=vi').json['items'][0]['id'], row.id)
        changed = self.file('updated.xml.gz', JMDICT.replace('<gloss>school</gloss>', '<gloss>different sense</gloss>'))
        import_jmdict(changed)
        db.session.commit()
        self.assertFalse(any(g.get('machine') for g in row.content['senses'][0]['glosses']))
        self.assertTrue(any(g.get('machine') for g in row.content['senses'][1]['glosses']))
        self.assertEqual(self.get('/words?q=truong+hoc&language=vi').json['items'], [])

    def test_auth_invalid_arguments_missing_entries_and_atomic_cli(self):
        self.assertEqual(self.client.get('/api/dictionary/words?q=学校').status_code, 401)
        for query in ('q=', 'q=学&page=0', 'q=学&page_size=41', 'q=学&page=x', 'q=学&page=1001'):
            for path in ('/words?', '/kanji?'):
                self.assertEqual(self.get(path + query).status_code, 400)
        self.assertEqual(self.get('/words/missing').status_code, 404)
        self.assertEqual(self.get('/kanji/xx').status_code, 404)
        broken = self.file('broken.xml.gz', '<JMdict><entry><ent_seq>4</ent_seq></entry></JMdict>')
        result = self.app.test_cli_runner().invoke(args=['dictionary-import', '--jmdict', str(broken)])
        self.assertNotEqual(result.exit_code, 0)
        self.assertEqual(db.session.scalar(select(func.count()).select_from(DictionaryEntry)), 3)


if __name__ == '__main__':
    unittest.main()
