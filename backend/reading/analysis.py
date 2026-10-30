from shadowing.morphology import analyze, fingerprint


def passage_analysis(passage):
    lines = [{'id': str(i), 'text': text} for i, text in enumerate(passage.text.split('\n'))]
    current = passage.analysis
    if not current or current.get('fingerprint') != fingerprint(lines, []):
        current = analyze(lines, [])
        passage.analysis = current
    return current
