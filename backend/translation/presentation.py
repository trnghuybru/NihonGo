"""Japanese reading metadata for inline sentence lookup."""
from shadowing.morphology import analyze


def translation_view(result):
    japanese = result['text'] if result['source'] == 'ja' else result['translation']
    vietnamese = result['translation'] if result['source'] == 'ja' else result['text']
    lines = [{'id': str(i), 'text': text} for i, text in enumerate(japanese.split('\n'))]
    analysis = analyze(lines, [])
    return {**result, 'japanese': japanese, 'vietnamese': vietnamese,
            'paragraphs': [{**line, 'tokens': analysis['segments'][line['id']]} for line in lines],
            'words': {key: {name: word[name] for name in ('surface', 'lemma', 'reading', 'pos')}
                      for key, word in analysis['words'].items()}}
