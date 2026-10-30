import os
from pathlib import Path
import click
from flask.cli import with_appcontext
from .service import MODEL_ID, REVISION, SentenceTranslator


@click.command('translation-download')
@with_appcontext
def download_command():
    from flask import current_app
    from huggingface_hub import snapshot_download
    snapshot_download(MODEL_ID, revision=REVISION, local_dir=current_app.config['TRANSLATION_MODEL_PATH'],
        allow_patterns=['config.json', 'generation_config.json', 'pytorch_model.bin', 'sentencepiece.bpe.model',
                        'special_tokens_map.json', 'tokenizer_config.json', 'vocab.json', 'README.md'])
    click.echo('Model M2M100 đã sẵn sàng trong thư mục backend.')


def init_translation(app, translator=None):
    default = Path(__file__).resolve().parent.parent / 'models' / 'translation' / 'm2m100_418M'
    app.config.setdefault('TRANSLATION_MODEL_PATH', os.getenv('TRANSLATION_MODEL_PATH') or str(default))
    app.config.setdefault('TRANSLATION_DEVICE', os.getenv('TRANSLATION_DEVICE', 'auto'))
    app.extensions['sentence_translation'] = translator or SentenceTranslator(app.config['TRANSLATION_MODEL_PATH'], app.config['TRANSLATION_DEVICE'])
    app.cli.add_command(download_command)
