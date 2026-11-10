"""Download the pinned Supertonic 3 archive once, before serving requests."""
import os
from pathlib import Path

REVISION = 'aafc6e32416a594460b32413efc49d7fe4ce6d46'


def prepare():
    from huggingface_hub import snapshot_download
    from supertonic import TTS

    folder = Path(os.getenv('SUPERTONIC_MODEL_DIR') or Path.home() / '.cache/supertonic3')
    snapshot_download(
        repo_id='supertone-oss-archive/supertonic-3', revision=REVISION,
        local_dir=str(folder), max_workers=2,
        allow_patterns=['onnx/*', 'voice_styles/*', '*LICENSE*', 'README.md'],
    )
    engine = TTS(model='supertonic-3', model_dir=folder, auto_download=False,
                 intra_op_num_threads=2, inter_op_num_threads=1)
    engine.get_voice_style(voice_name='F1')
    print('Supertonic 3 model and F1 voice ready; generated audio uses R2.')


if __name__ == '__main__':
    prepare()
