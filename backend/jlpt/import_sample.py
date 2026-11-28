"""Curate one complete session, preserving its original numbering and passages.

Run: python -m jlpt.import_sample /path/to/jlpt-n3-2010-2024.json
The source is content only; no code or instructions from it are executed.
"""
import hashlib
import json
import re
import sys
import unicodedata
from pathlib import Path


def build(source):
    raw = Path(source).read_bytes()
    data = json.loads(raw)
    session = next(s for s in data['sessions'] if s['id'] == '2017-07')
    document = next(f for f in session['files'] if f['kind'] == 'exam')
    pages = {p['page']: p['text'] for p in document['pages']}
    def clean(text):
        text = re.sub(r'2017 年 07 月新日本語能力試験Ｎ3\s*', '', text)
        return text.replace('□', '').strip()

    def section_text(start, end):
        return '\n\n'.join(clean(pages[p]) for p in range(start, end + 1))

    def parse(text, first, last):
        # A question number starts a line; option numbers use "1." without a space.
        marks = list(re.finditer(r'^\s*□?(\d+)\s+\.\s*', text, re.M))
        assert [int(m[1]) for m in marks] == list(range(first, last + 1))
        output = []
        for i, match in enumerate(marks):
            end = marks[i + 1].start() if i + 1 < len(marks) else len(text)
            body = text[match.end():end]
            # Passages and instructions after an item belong to the following group.
            body = re.split(r'\n\s*(?:問題|[（(][１２３４1-4][）)])', body)[0]
            opts = list(re.finditer(r'(?<!\S)([1-4])\.\s*', body))
            assert [int(o[1]) for o in opts] == [1, 2, 3, 4], (match[1], body)
            output.append({'number': int(match[1]), 'prompt': clean(body[:opts[0].start()]),
                           'options': [clean(body[o.end():opts[j + 1].start() if j + 1 < 4 else len(body)])
                                       for j, o in enumerate(opts)]})
        return output

    vocab = parse(section_text(1, 3), 1, 35)
    grammar_reading = parse(section_text(4, 12), 1, 39)
    # Extract each shared passage independently, including continuation across pages.
    text = section_text(6, 12)
    passages = {
        'cloze': text[text.index('以下は、留学生の作文である。'):re.search(r'^\s*19\s+\.', text, re.M).start()],
    }
    for key, start, stop in [
        ('short1', ' 私は数年前から', r'^\s*24\s+\.'),
        ('short2', 'これは池中電気', r'^\s*25\s+\.'),
        ('short3', ' ある温泉地', r'^\s*26\s+\.'),
        ('short4', 'これは「国際経済学」', r'^\s*27\s+\.'),
        ('medium1', '先日、友人と', r'^\s*28\s+\.'),
        ('medium2', '  水や草の葉を', r'^\s*31\s+\.'),
        ('long', '  水川小学校には', r'^\s*34\s+\.'),
    ]:
        passages[key] = clean(text[text.index(start):re.search(stop, text, re.M).start()])
    # The following keys were read from the embedded answer image, not inferred by AI.
    vocab_key = '32234311' + '234214' + '42312142331' + '41314' + '34212'
    gr_key = '1421323413422' + '21334' + '21343' + '2423' + '443322' + '1431' + '31'
    listening_keys = ['232342', '242134', '423', '1221', '322323113']
    assert len(vocab_key) == 35 and len(gr_key) == 39
    sections = [
        {'id': 'vocabulary', 'label': 'Từ vựng', 'original_label': '言語知識（文字・語彙）', 'questions': vocab},
        {'id': 'grammar-reading', 'label': 'Ngữ pháp & Đọc hiểu', 'original_label': '言語知識（文法・読解）', 'questions': grammar_reading},
        {'id': 'listening', 'label': 'Nghe hiểu', 'original_label': '聴解', 'questions': []},
    ]
    targets = ['汚い', '商品', '冷えて', '早退', '下線', '転んだ', '主要', '過去',
               'こまりました', 'きたい', 'ずつう', 'は', 'あずけ', 'けいゆ']
    for q, answer in zip(vocab, vocab_key):
        n = q['number']
        q.update(id=f'v-{n}', group=next(i for i, end in enumerate([8, 14, 25, 30, 35], 1) if n <= end),
                 answer_index=int(answer) - 1, images=[], passage=None)
        if n <= 14:
            q['target'] = targets[n - 1]
        if 26 <= n <= 30:
            q['target'] = ['絶対', '逆', '信じている', 'おしまい', 'まぶしくて'][n - 26]
    for q, answer in zip(grammar_reading, gr_key):
        n = q['number']
        q.update(id=f'gr-{n}', group=next(i for i, end in enumerate([13, 18, 23, 27, 33, 37, 39], 1) if n <= end),
                 answer_index=int(answer) - 1, images=[], passage=None)
        if 19 <= n <= 23:
            q['prompt'] = f'（ {n} ）に入る最もよいものを選んでください。'
            q['passage'] = passages['cloze']
        for key, nums in [('short1', [24]), ('short2', [25]), ('short3', [26]), ('short4', [27]),
                          ('medium1', [28, 29, 30]), ('medium2', [31, 32, 33]), ('long', [34, 35, 36, 37])]:
            if n in nums:
                q['passage'] = passages[key]
    # Listening groups 3 and 5 intentionally have no printed choices in the booklet.
    listening_text = section_text(13, 15)
    for group, key in enumerate(listening_keys, 1):
        for n, answer in enumerate(key, 1):
            options = [str(i) for i in range(1, 4 if group >= 4 else 5)]
            if group <= 2:
                # Explicit range anchors avoid confusing instructions with numbered questions.
                start = listening_text.index('1 ばん') if group == 1 else listening_text.index('1 ばん', listening_text.index('問題２'))
                end = listening_text.index('問題２') if group == 1 else listening_text.index('問題3')
                segment = listening_text[start:end]
                starts = list(re.finditer(r'([1-6１-６])\s*ばん', segment))
                chunk = segment[starts[n - 1].end():starts[n].start() if n < len(starts) else len(segment)]
                chunk = unicodedata.normalize('NFKC', chunk)
                found = list(re.finditer(r'(?<!\S)([1-4])\.\s*', chunk))
                assert len(found) == 4, (group, n)
                options = [clean(chunk[m.end():found[i + 1].start() if i < 3 else len(chunk)]) for i, m in enumerate(found)]
            sections[2]['questions'].append({'id': f'l-{group}-{n}', 'number': n, 'group': group,
                'prompt': f'問題{group} · {n}ばん', 'options': options, 'answer_index': int(answer) - 1,
                'passage': None, 'images': [], 'audio_only_options': group in {3, 4, 5}})
    for image in document['question_images']:
        for ref in image['questions']:
            for q in (grammar_reading if image['section'] == 'reading' else sections[2]['questions']):
                if q['number'] == ref['number'] and (image['section'] == 'reading' or str(q['group']) == str(image['group'])):
                    q['images'].append({k: image[k] for k in ['id', 'image_data_url', 'width_px', 'height_px']})
    instructions = {
        'vocabulary': ['下線のことばの読み方を選んでください。', '下線のことばを漢字で書くとき、最もよいものを選んでください。', '（　）に入る最もよいものを選んでください。', '意味が最も近いものを選んでください。', 'ことばの使い方として最もよいものを選んでください。'],
        'grammar-reading': ['（　）に入る最もよいものを選んでください。', '★ に入る最もよいものを選んでください。', '文章全体の内容を考えて、空欄に入るものを選んでください。', '文章を読んで、質問に答えてください。', '文章を読んで、質問に答えてください。', '文章を読んで、質問に答えてください。', 'お知らせを読んで、質問に答えてください。'],
        'listening': ['質問を聞いてから話を聞き、答えてください。', '質問と選択肢を確認し、話を聞いて答えてください。', '話と質問と選択肢を聞いて答えてください。', '絵を見ながら質問と選択肢を聞いて答えてください。', '文と返事を聞いて答えてください。'],
    }
    for section in sections:
        for q in section['questions']:
            q['instruction'] = instructions[section['id']][q['group'] - 1]
            assert len(q['options']) in {3, 4} and all(q['options']) and q['prompt']
    return {'id': 'n3-2017-07', 'level': 'N3', 'year': 2017, 'month': 7, 'title': 'JLPT N3 · Tháng 7/2017',
            'version': 1, 'audio_url': None, 'audio_filename': 'Nghe N3 7-2017.mp3',
            'source_filename': document['filename'], 'source_sha256': hashlib.sha256(raw).hexdigest(),
            'answer_source': 'Embedded answer image, page 1, Đáp án+Script N3 7-2017.pdf',
            'content_note': 'Đề được chuyển từ bản PDF trong dữ liệu cung cấp; một số ký tự có thể sai so với đề gốc.',
            'sections': sections}


if __name__ == '__main__':
    exam = build(sys.argv[1])
    output = Path(__file__).parent / 'data' / 'n3-2017-07.json'
    output.write_text(json.dumps(exam, ensure_ascii=False, indent=2))
    print(f'Imported {sum(len(s["questions"]) for s in exam["sections"])} questions into {output}')
