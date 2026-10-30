import os
from pathlib import Path

from .service import HandwritingRecognizer


def init_handwriting(app, recognizer=None):
    default_path = Path(__file__).resolve().parent.parent / 'models' / 'handwriting' / 'best.pt'
    app.config.setdefault('HANDWRITING_CHECKPOINT', os.getenv('HANDWRITING_CHECKPOINT') or str(default_path))
    # Eager initialization: one model per application worker, never per request.
    app.extensions['handwriting'] = recognizer if recognizer is not None else HandwritingRecognizer(app.config['HANDWRITING_CHECKPOINT'])
    from .routes import bp
    app.register_blueprint(bp)
    app.logger.info('Handwriting recognition ready (%s)', app.extensions['handwriting'].device)
