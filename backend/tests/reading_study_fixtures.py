def sentence_payload(source):
    sentence = source['sentences'][0]
    return {'sentence_id': sentence['id'], 'core_translation_vi': 'Nói về việc đi học.', 'translation_vi': 'Tôi đã đến trường.',
            'implicit_subject': '私', 'segments': [{'text': sentence['text'], 'role': 'predicate', 'is_core': True,
                'explanation': 'Hành động chính.'}], 'caution': ''}


def analysis_payload(source):
    sentence = source['sentences'][0]
    location = {'sentence_id': sentence['id'], 'quote': sentence['text'].strip()}
    return {'summary': 'Người viết nói về việc đi học.', 'caution': '',
        'structure': [{'label': 'Sự việc', 'explanation': 'Kể lại hành động.', 'sentence_id': sentence['id']}],
        'vocabulary': [{'word': '学校', 'reading': 'がっこう', 'meaning': 'Trường học', 'location': location}],
        'grammar': [{'pattern': 'へ', 'explanation': 'Chỉ hướng đến.', 'location': location}]}


def explanation_payload(source):
    sentence = source['sentences'][0]
    return {'explanation': 'Câu đầu nói người viết đến trường nên chọn 学校.', 'caution': '',
            'answer_supported': True, 'evidence': [{'sentence_id': sentence['id'], 'quote': sentence['text'].strip()}]}
