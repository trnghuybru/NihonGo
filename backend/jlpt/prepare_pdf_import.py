"""Build a graded image-based exam package from reviewed PDF/page/answer mappings.

Offline preparation only: PyMuPDF is optional tooling, not a server dependency.
Never use OCR to invent a question number, answer, or missing passage.
"""
import argparse
import hashlib
import io
import json
import os
from pathlib import Path


GROUP_ENDS = [5, 10, 13, 20, 25, 30, 42, 47, 51, 56, 64, 66, 69, 71]
LISTENING_COUNTS = [5, 6, 5, 11, 3]


def validate_mapping(exam):
    key = ''.join(exam['language_answer_keys'])
    if len(key) != 71 or set(key) - set('1234'):
        raise ValueError('Expected 71 source-backed language/reading answers.')
    listening = exam['listening_answer_keys']
    if list(map(len, listening)) != LISTENING_COUNTS:
        raise ValueError('Incomplete listening answer key.')
    if any(set(row) - set('123' if i == 3 else '1234') for i, row in enumerate(listening)):
        raise ValueError('Listening answer outside the printed option range.')
    if set(exam['language_pages']) != set(map(str, range(1, 72))):
        raise ValueError('Every language/reading question needs a source page mapping.')
    total = next(f['page_count'] for f in exam['files'] if f['kind'] == 'exam')
    groups = exam['listening_pages']
    if set(groups) != set(map(str, range(1, 6))):
        raise ValueError('Missing listening group.')
    if [len(groups[str(i)]) for i in range(1, 6)] != LISTENING_COUNTS:
        raise ValueError('Missing listening question page mapping.')
    pages = list(exam['language_pages'].values()) + [p for group in groups.values() for p in group]
    if any(type(p) is not int or not 1 <= p <= total for refs in pages for p in refs):
        raise ValueError('Question references a nonexistent PDF page.')
    if any(not refs for refs in exam['language_pages'].values()):
        raise ValueError('A printed question cannot have empty source pages.')
    return key


def prepare(manifest_path, source_dir, bucket):
    import fitz  # pip install pymupdf in the offline preparation environment
    from PIL import Image

    raw = Path(manifest_path).read_bytes()
    manifest = json.loads(raw)
    if manifest['level'] != 'N2':
        raise ValueError('This reviewed mapping is for N2 only.')
    assets, blobs, sessions, normalized = {}, {}, [], []

    def asset(page):
        pix = page.get_pixmap(matrix=fitz.Matrix(2, 2), alpha=False)
        image = Image.frombytes('RGB', (pix.width, pix.height), pix.samples)
        output = io.BytesIO()
        image.save(output, 'WEBP', quality=90, method=6)
        data = output.getvalue()
        digest = hashlib.sha256(data).hexdigest()
        assets[digest] = dict(id=digest, bucket=bucket, storage_key=f'jlpt/images/{digest}.webp',
                              mime_type='image/webp', size_bytes=len(data))
        blobs[digest] = data
        return dict(id=digest, image_id=digest, width_px=pix.width, height_px=pix.height)

    for source in manifest['exams']:
        key = validate_mapping(source)
        root = Path(source_dir) / f"jlpt-n2-{source['id']}"
        files, exam_pages = [], {}
        for document in source['files']:
            path = root / document['local_filename']
            if hashlib.sha256(path.read_bytes()).hexdigest() != document['sha256']:
                raise ValueError(f"Source PDF changed: {source['id']}/{path.name}")
            pdf = fitz.open(path)
            if len(pdf) != document['page_count']:
                raise ValueError('Source PDF page count changed.')
            pages = []
            for i, page in enumerate(pdf, 1):
                media = asset(page)
                text, method = page.get_text(), 'pdf-text'
                vision = root / 'pages' / f'page-{i:03}.json'
                if document['kind'] == 'exam' and vision.exists():
                    text = '\n'.join(row['text'] for row in json.loads(vision.read_text()))
                    method = 'apple-vision-unreviewed'
                pages.append(dict(page=i, text=text, method=method,
                                  image_id=media['image_id'], width_px=media['width_px'],
                                  height_px=media['height_px']))
                if document['kind'] == 'exam':
                    exam_pages[i] = {**media, 'source_page': i}
            files.append({**{k: v for k, v in document.items() if k != 'local_filename'}, 'pages': pages})
            pdf.close()

        session = dict(id=source['id'], year=source['year'], month=source['month'], files=files)
        sessions.append(session)
        language = []
        for number, answer in enumerate(key, 1):
            language.append(dict(id=f'lr-{number}', number=number,
                group=next(i for i, end in enumerate(GROUP_ENDS, 1) if number <= end),
                prompt='', instruction='', passage=None, options=['1', '2', '3', '4'],
                answer_index=int(answer) - 1, content_format='image',
                images=[exam_pages[p] for p in source['language_pages'][str(number)]],
                source_pages=source['language_pages'][str(number)]))
        listening = []
        for group, answers in enumerate(source['listening_answer_keys'], 1):
            for position, answer in enumerate(answers, 1):
                subquestion = position - 1 if group == 5 and position > 1 else None
                number = 2 if subquestion else position
                refs = source['listening_pages'][str(group)][position - 1]
                question = dict(id=f'l-{group}-{number}' + (f'-{subquestion}' if subquestion else ''),
                    number=number, group=group, prompt='', instruction='', passage=None,
                    options=[str(i) for i in range(1, 4 if group == 4 else 5)],
                    answer_index=int(answer) - 1, content_format='image',
                    images=[exam_pages[p] for p in refs], source_pages=refs,
                    audio_only_options=group in {3, 4} or (group == 5 and position == 1))
                if subquestion:
                    question['subquestion'] = subquestion
                listening.append(question)
        exam_id = f"n2-{source['id']}"
        normalized.append(dict(id=exam_id, level='N2', year=source['year'], month=source['month'],
            title=f"JLPT N2 · Tháng {source['month']}/{source['year']}", version=1,
            audio_url=None, source_filename=next(f['filename'] for f in files if f['kind'] == 'exam'),
            source_sha256=next(f['sha256'] for f in files if f['kind'] == 'exam'),
            answer_source=source['answer_review'], timing_source_url=source['timing_source_url'],
            content_note='Ảnh đề gốc · Chọn đáp án để làm bài. Chưa có âm thanh và tra từ trực tiếp trên ảnh.',
            content_format='image', sections=[
                dict(id='language-reading', label='Từ vựng, Ngữ pháp & Đọc hiểu',
                     original_label='言語知識（文字・語彙・文法）・読解', questions=language,
                     duration_seconds=source['duration_seconds'][0]),
                dict(id='listening', label='Nghe hiểu', original_label='聴解', questions=listening,
                     duration_seconds=source['duration_seconds'][1])]))
    return dict(level='N2', source_sha256=hashlib.sha256(raw).hexdigest(),
                source_folder_url=manifest['source_folder_url'], format=manifest['format'],
                sessions=sessions, normalized=normalized, assets=list(assets.values())), blobs


def main():
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).resolve().parents[1] / '.env')
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--manifest', required=True)
    parser.add_argument('--source-dir', required=True)
    parser.add_argument('--output', required=True)
    parser.add_argument('--upload', action='store_true')
    args = parser.parse_args()
    bucket = os.getenv('JLPT_S3_BUCKET') or os.getenv('TTS_S3_BUCKET') or os.environ['S3_BUCKET']
    payload, blobs = prepare(args.manifest, args.source_dir, bucket)
    if args.upload:
        from .prepare_import import upload_images
        from vocabulary.audio import _tts_client
        print('Uploaded R2 images:', upload_images(_tts_client(), payload, blobs), flush=True)
    else:
        cache = Path(args.output).with_suffix('.assets')
        cache.mkdir(parents=True, exist_ok=True)
        for key, data in blobs.items():
            (cache / f'{key}.webp').write_bytes(data)
    Path(args.output).write_text(json.dumps(payload, ensure_ascii=False, separators=(',', ':')))
    print(json.dumps(dict(exams=len(payload['normalized']), images=len(blobs),
                         questions=sum(len(s['questions']) for e in payload['normalized'] for s in e['sections']))))


if __name__ == '__main__':
    main()
