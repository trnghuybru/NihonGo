"""Import the complete N3 December 2016 session from the supplied archive JSON."""
import hashlib
import json
import re
import sys
from pathlib import Path


def build(source):
    raw = Path(source).read_bytes()
    session = next(s for s in json.loads(raw)['sessions'] if s['id'] == '2016-12')
    document = next(f for f in session['files'] if f['kind'] == 'exam')

    def clean(text):
        text = re.sub(r'小程序：日语轻松考\s*', '', text)
        text = re.sub(r'2016 年12 月新日本語能力試験Ｎ3\s*', '', text)
        return re.sub(r'\n{3,}', '\n\n', text).strip()

    pages = {p['page']: clean(p['text']) for p in document['pages']}
    vocab_text, grammar_start = pages[5].split('言語知識（文法、読解）', 1)
    vocab_text = '\n\n'.join([pages[2], pages[3], pages[4], vocab_text])
    gr_text = '\n\n'.join([grammar_start] + [pages[p] for p in range(6, 14)])

    def question_start(text, number, position):
        match = re.search(r'^\s*' + str(number) + r'(?:[.．][ \t]*|[ \t]+|(?=\n))', text[position:], re.M)
        if not match:
            raise ValueError(f'Missing question {number}')
        return position + match.start(), position + match.end()

    def parse(text, total):
        questions, position = [], 0
        for n in range(1, total + 1):
            _, start = question_start(text, n, position)
            opts, cursor = [], start
            for option in range(1, 5):
                match = re.search(r'(?<!\S)' + str(option) + r'(?:[.．、][ \t]*|[ \t]+)', text[cursor:])
                assert match, (n, option)
                opts.append((cursor + match.start(), cursor + match.end()))
                cursor += match.end()
            end = question_start(text, n + 1, cursor)[0] if n < total else len(text)
            options = [clean(text[m[1]:opts[i + 1][0] if i < 3 else end]) for i, m in enumerate(opts)]
            options[-1] = re.split(r'\n\s*(?:問題|[（(][１２３４1-4][）)])', options[-1])[0].strip()
            questions.append({'number': n, 'prompt': clean(text[start:opts[0][0]]), 'options': options})
            position = end
        return questions

    vocab, gr = parse(vocab_text, 35), parse(gr_text, 39)
    passages = {}
    for key, start, number in [
        ('cloze', '下の文章は、留学生が書いた作文です。', 19),
        ('short1', 'これは大学から学生に届いたメールである。', 24),
        ('short2', '「携帯電話は持っていないんです。」', 25),
        ('short3', ' 日本には飲み物の自動販売機が', 26),
        ('short4', '12 月2 日の朝、', 27),
        ('medium1', ' 私は本が好きで、', 28),
        ('medium2', ' 突然の雨で、', 31),
        ('long', ' 先日、テレビであるタクシー会社', 34),
    ]:
        begin = gr_text.index(start)
        end = question_start(gr_text, number, begin + len(start))[0]
        passages[key] = clean(gr_text[begin:end])
    # Verified against the embedded answer-key image, page 1 (not OCR guesses).
    vocab_key = '42132431' + '433214' + '24131324412' + '41312' + '32213'
    gr_key = '2431423231241' + '24213' + '34132' + '3241' + '234341' + '4413' + '22'
    listening_keys = ['231212', '241134', '342', '1233', '132113212']
    assert len(vocab_key) == 35 and len(gr_key) == 39
    # Shared UI instructions only; question contents come exclusively from this session.
    template = json.loads((Path(__file__).parent / 'data/n3-2017-07.json').read_text())
    instructions = {s['id']: {q['group']: q['instruction'] for q in s['questions']} for s in template['sections']}
    sections = [
        {'id': 'vocabulary', 'label': 'Từ vựng', 'original_label': '言語知識（文字・語彙）', 'questions': vocab},
        {'id': 'grammar-reading', 'label': 'Ngữ pháp & Đọc hiểu', 'original_label': '言語知識（文法・読解）', 'questions': gr},
        {'id': 'listening', 'label': 'Nghe hiểu', 'original_label': '聴解', 'questions': []},
    ]
    targets = ['観客', '払って', '到着', '加えました', '訓練', '豆', '共通', '税金',
               'なみ', 'はやく', 'まんぞく', 'くんで', 'ゆしゅつ', 'ねむっています']
    for q, answer in zip(vocab, vocab_key):
        n = q['number']
        q.update(id=f'v-{n}', group=next(i for i, end in enumerate([8, 14, 25, 30, 35], 1) if n <= end),
                 answer_index=int(answer) - 1, images=[], passage=None)
        if n <= 14:
            q['target'] = targets[n - 1]
        if 26 <= n <= 30:
            q['target'] = ['かがやいています', 'がっかりした', '当然', 'あまりました', '横断禁止'][n - 26]
    for q, answer in zip(gr, gr_key):
        n = q['number']
        q.update(id=f'gr-{n}', group=next(i for i, end in enumerate([13, 18, 23, 27, 33, 37, 39], 1) if n <= end),
                 answer_index=int(answer) - 1, images=[], passage=None)
        for key, numbers in [('cloze', range(19, 24)), ('short1', [24]), ('short2', [25]), ('short3', [26]),
                             ('short4', [27]), ('medium1', [28, 29, 30]), ('medium2', [31, 32, 33]), ('long', [34, 35, 36, 37])]:
            if n in numbers:
                q['passage'] = passages[key]
        if 19 <= n <= 23:
            q['prompt'] = str(n)
    listening_text = '\n\n'.join(pages[p] for p in range(15, 19))
    for group, key in enumerate(listening_keys, 1):
        if group <= 2:
            start = listening_text.index('1 ばん') if group == 1 else listening_text.index('1 ばん', listening_text.index('問題2'))
            end = listening_text.index('問題2') if group == 1 else listening_text.index('問題3')
            body = listening_text[start:end]
            starts = list(re.finditer(r'([1-6])\s*ばん', body))
            assert len(starts) == len(key)
        for n, answer in enumerate(key, 1):
            options = [str(i) for i in range(1, 4 if group >= 4 else 5)]
            if group <= 2:
                chunk = body[starts[n - 1].end():starts[n].start() if n < len(starts) else len(body)]
                opts = list(re.finditer(r'(?<!\S)([1-4])\.\s*', chunk))
                assert [m[1] for m in opts] == ['1', '2', '3', '4'], (group, n)
                options = [clean(chunk[m.end():opts[i + 1].start() if i < 3 else len(chunk)]) for i, m in enumerate(opts)]
            sections[2]['questions'].append({'id': f'l-{group}-{n}', 'number': n, 'group': group,
                'prompt': f'{n}ばん', 'options': options, 'answer_index': int(answer) - 1,
                'passage': None, 'images': [], 'audio_only_options': group >= 3})
    for image in document['question_images']:
        for ref in image['questions']:
            for q in (gr if image['section'] == 'reading' else sections[2]['questions']):
                if q['number'] == ref['number'] and (image['section'] == 'reading' or str(q['group']) == str(image['group'])):
                    q['images'].append({k: image[k] for k in ['id', 'image_data_url', 'width_px', 'height_px']})
    for section in sections:
        for q in section['questions']:
            q['instruction'] = instructions[section['id']][q['group']]
            assert q['prompt'] and all(q['options']) and 0 <= q['answer_index'] < len(q['options'])
    return {'id': 'n3-2016-12', 'level': 'N3', 'year': 2016, 'month': 12, 'title': 'JLPT N3 · Tháng 12/2016',
            'version': 1, 'audio_url': None, 'audio_filename': 'Nghe N3 12-2016.mp3',
            'source_filename': document['filename'], 'source_sha256': hashlib.sha256(raw).hexdigest(),
            'answer_source': 'Embedded answer image, page 1, Đáp án+Script N3 12-2016.pdf',
            'content_note': template['content_note'], 'sections': sections}


if __name__ == '__main__':
    exam = build(sys.argv[1])
    output = Path(__file__).parent / 'data/n3-2016-12.json'
    output.write_text(json.dumps(exam, ensure_ascii=False, indent=2))
    print(f'Imported {sum(len(s["questions"]) for s in exam["sections"])} questions into {output}')
