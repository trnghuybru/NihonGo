"""Merge reviewed PDF transcriptions without changing question IDs or answer indices."""
import argparse
import copy
import hashlib
import io
import json
from pathlib import Path


def prepare(payload, text_dir, asset_dir):
    from PIL import Image
    payload = copy.deepcopy(payload)
    text_dir, asset_dir = Path(text_dir), Path(asset_dir)
    layout_raw = (text_dir / 'layout.json').read_bytes()
    layout = json.loads(layout_raw)
    assets = {a['id']: a for a in payload['assets']}
    new_blobs, text_hashes = {}, {}

    for exam, session in zip(payload['normalized'], payload['sessions']):
        source = text_dir / f"n2-{session['id']}.json"
        raw = source.read_bytes()
        text_hashes[source.name] = hashlib.sha256(raw).hexdigest()
        transcription = json.loads(raw)
        if transcription['id'] != exam['id']:
            raise ValueError('Transcription belongs to another exam.')
        text_questions = transcription['questions']
        by_id = {q['id']: q for q in text_questions}
        printed = {q['id'] for s in exam['sections'] for q in s['questions']
                   if not q.get('audio_only_options')}
        if set(by_id) != printed or len(by_id) != len(text_questions):
            raise ValueError('Transcription must include every printed question exactly once.')
        pages = {p['page']: p for f in session['files'] if f['kind'] == 'exam' for p in f['pages']}
        figures = layout['exams'][session['id']]

        def media(page_number, box=None):
            page = pages[page_number]
            if box is None:
                return dict(id=page['image_id'], image_id=page['image_id'],
                            width_px=page['width_px'], height_px=page['height_px'], source_page=page_number)
            if len(box) != 4 or not (0 <= box[0] < box[2] <= 1000 and 0 <= box[1] < box[3] <= 1000):
                raise ValueError('Invalid reviewed image crop.')
            data = (asset_dir / f"{page['image_id']}.webp").read_bytes()
            if hashlib.sha256(data).hexdigest() != page['image_id']:
                raise ValueError('Source image checksum mismatch.')
            with Image.open(io.BytesIO(data)) as image:
                cropped = image.crop((round(box[0] * image.width / 1000), round(box[1] * image.height / 1000),
                                      round(box[2] * image.width / 1000), round(box[3] * image.height / 1000)))
                output = io.BytesIO()
                cropped.save(output, 'WEBP', quality=95, method=6)
                data = output.getvalue()
                width, height = cropped.size
            digest = hashlib.sha256(data).hexdigest()
            assets[digest] = dict(id=digest, bucket=assets[page['image_id']]['bucket'],
                storage_key=f'jlpt/images/{digest}.webp', mime_type='image/webp', size_bytes=len(data))
            new_blobs[digest] = data
            return dict(id=digest, image_id=digest, width_px=width, height_px=height,
                        source_page=page_number, source_box=box)

        seen = set()
        for section in exam['sections']:
            for question in section['questions']:
                original_identity = (question['id'], question['number'], question['group'],
                                     question.get('subquestion'), question['answer_index'])
                row = by_id.get(question['id'])
                question.pop('content_format', None)
                question['images'] = []
                if row:
                    seen.add(row['id'])
                    if len(row['options']) != len(question['options']) or any(not o.strip() for o in row['options']):
                        raise ValueError('Transcription changed option counts.')
                    if not row['prompt'].strip() or not row['instruction'].strip():
                        raise ValueError('Missing question text.')
                    question.update({k: row[k] for k in ['prompt', 'instruction', 'options', 'passage']})
                    if row.get('target'):
                        if row['target'] not in row['prompt']:
                            raise ValueError('Underline target is not in the question.')
                        question['target'] = row['target']
                    else:
                        question.pop('target', None)
                else:
                    if not question.get('audio_only_options'):
                        raise ValueError('A printed question was not transcribed.')
                    question.update(prompt=f"{question['number']}ばん", instruction='音声を聞いて、答えを一つ選びなさい。', passage=None)
                if section['id'] == 'language-reading':
                    if question['group'] == 9:
                        question['prompt'] = str(question['number'])
                    if 10 <= question['group'] <= 13 and (not question['passage'] or len(question['passage']) < 80):
                        raise ValueError('Reading question is missing its shared passage.')
                    if question['group'] == 14:
                        question['passage'] = None
                        question['images'].append(media(figures['information_page'], figures.get('information_box')))
                for region in figures['question_regions'].get(question['id'], []):
                    question['images'].append(media(region['page'], region['box']))
                if original_identity != (question['id'], question['number'], question['group'],
                                         question.get('subquestion'), question['answer_index']):
                    raise ValueError('Transcription changed original numbering or the source answer key.')
        if seen != set(by_id):
            raise ValueError('Unexpected transcribed question ID.')
        exam.pop('content_format', None)
        exam['representation_revision'] = 2
        exam['content_note'] = 'Nội dung chữ từ PDF gốc · Giữ hình và bảng cần thiết. Chưa có âm thanh.'
    payload['assets'] = list(assets.values())
    payload['format'] = 'text-with-original-figures'
    payload['text_provenance'] = dict(model='Google Gemini (authorized by user)',
        review='PDF transcription, independent review and manual source checks; original answer indices unchanged',
        source_mapping_sha256=layout['source_mapping_sha256'], files=text_hashes,
        layout_sha256=hashlib.sha256(layout_raw).hexdigest())
    payload['source_sha256'] = hashlib.sha256(json.dumps(payload['text_provenance'], sort_keys=True).encode()).hexdigest()
    return payload, new_blobs


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', required=True)
    parser.add_argument('--text-dir', required=True)
    parser.add_argument('--asset-dir', required=True)
    parser.add_argument('--output', required=True)
    args = parser.parse_args()
    payload, blobs = prepare(json.loads(Path(args.source).read_text()), args.text_dir, args.asset_dir)
    for key, data in blobs.items():
        (Path(args.asset_dir) / f'{key}.webp').write_bytes(data)
    Path(args.output).write_text(json.dumps(payload, ensure_ascii=False, separators=(',', ':')) + '\n')
    print(json.dumps(dict(exams=len(payload['normalized']), images=len(payload['assets']), crops=len(blobs))))


if __name__ == '__main__':
    main()
