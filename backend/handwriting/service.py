"""Single-character recognition. Model weights stay on the server."""
import base64
import binascii
import io
import threading
import time

import numpy as np
from PIL import Image, ImageOps, UnidentifiedImageError
import torch
from torch import nn
from torchvision.models import mobilenet_v3_small
from torchvision.transforms import functional as TF

MAX_IMAGE_BYTES = 512 * 1024
MAX_IMAGE_SIDE = 1024
REQUEST_LIMIT = 1024 * 1024
IMAGE_SIZE = 128


class RecognitionInputError(ValueError):
    def __init__(self, message, code='invalid_image', status=400):
        super().__init__(message)
        self.code, self.status = code, status


def decode_png(value):
    prefix = 'data:image/png;base64,'
    if not isinstance(value, str) or not value.startswith(prefix):
        raise RecognitionInputError('Ảnh phải là PNG dạng data:image/png;base64,...')
    encoded = value[len(prefix):]
    if not encoded:
        raise RecognitionInputError('Dữ liệu base64 không hợp lệ.')
    if len(encoded) > 4 * ((MAX_IMAGE_BYTES + 2) // 3):
        raise RecognitionInputError('Ảnh PNG phải nhỏ hơn 512 KB.', 'image_too_large', 413)
    try:
        raw = base64.b64decode(encoded, validate=True)
    except (ValueError, binascii.Error):
        raise RecognitionInputError('Dữ liệu base64 không hợp lệ.') from None
    if len(raw) > MAX_IMAGE_BYTES:
        raise RecognitionInputError('Ảnh PNG phải nhỏ hơn 512 KB.', 'image_too_large', 413)
    try:
        with Image.open(io.BytesIO(raw)) as image:
            if image.format != 'PNG':
                raise RecognitionInputError('Dữ liệu phải là ảnh PNG.')
            if not (1 <= image.width <= MAX_IMAGE_SIDE and 1 <= image.height <= MAX_IMAGE_SIDE):
                raise RecognitionInputError('Mỗi cạnh ảnh tối đa 1024 pixel.', 'image_too_large', 413)
            if getattr(image, 'n_frames', 1) != 1:
                raise RecognitionInputError('Chỉ hỗ trợ ảnh PNG tĩnh.')
            image.verify()
        with Image.open(io.BytesIO(raw)) as image:
            image.load()
            return image.copy()
    except (UnidentifiedImageError, OSError, SyntaxError, ValueError, Image.DecompressionBombError) as error:
        if isinstance(error, RecognitionInputError):
            raise
        raise RecognitionInputError('Ảnh PNG không hợp lệ hoặc bị hỏng.') from None


def prepare_canvas(image):
    # Preserve transparent ink by compositing before converting to grayscale.
    if 'A' in image.getbands() or 'transparency' in image.info:
        rgba = image.convert('RGBA')
        background = Image.new('RGBA', rgba.size, 'white')
        image = Image.alpha_composite(background, rgba)
    gray = image.convert('L')
    pixels = np.asarray(gray)
    edges = np.concatenate((pixels[0, :], pixels[-1, :], pixels[:, 0], pixels[:, -1]))
    if float(edges.mean()) < 127.5:
        gray = ImageOps.invert(gray)
        pixels = np.asarray(gray)
    ys, xs = np.where(pixels < 200)
    if not len(xs):
        raise RecognitionInputError('Ảnh trống. Hãy viết một ký tự rồi thử lại.', 'blank_image', 422)
    crop = gray.crop((int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1))
    inner_size = round(IMAGE_SIZE * 0.8)
    ratio = inner_size / max(crop.size)
    resized = crop.resize((max(1, round(crop.width * ratio)), max(1, round(crop.height * ratio))), Image.Resampling.BILINEAR)
    canvas = Image.new('L', (IMAGE_SIZE, IMAGE_SIZE), 255)
    canvas.paste(resized, ((IMAGE_SIZE - resized.width) // 2, (IMAGE_SIZE - resized.height) // 2))
    return canvas.convert('RGB')


def preprocess(image):
    return TF.normalize(TF.to_tensor(prepare_canvas(image)),
                        mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225])


def preferred_device():
    if torch.cuda.is_available():
        return torch.device('cuda')
    if torch.backends.mps.is_available():
        return torch.device('mps')
    return torch.device('cpu')


class HandwritingRecognizer:
    def __init__(self, checkpoint_path):
        checkpoint = torch.load(checkpoint_path, map_location='cpu', weights_only=True)
        if checkpoint.get('architecture') not in ('mobilenet_v3_small', 'torchvision.models.mobilenet_v3_small'):
            raise ValueError('Unsupported handwriting checkpoint architecture')
        labels = checkpoint.get('labels')
        if (not isinstance(labels, list) or len(labels) != 3036 or
                any(not isinstance(label, dict) or not isinstance(label.get('character'), str)
                    or len(label['character']) != 1 for label in labels)):
            raise ValueError('Handwriting checkpoint must contain 3036 ordered character labels')
        if checkpoint.get('image_size') not in (128, (128, 128), [128, 128]):
            raise ValueError('Handwriting checkpoint image_size must be 128')
        model = mobilenet_v3_small(weights=None)
        model.classifier[-1] = nn.Linear(model.classifier[-1].in_features, len(labels))
        model.load_state_dict(checkpoint['model_state_dict'], strict=True)
        self.device = preferred_device()
        self.model = model.to(self.device).eval()
        self.labels = tuple(label['character'] for label in labels)
        self.lock = threading.Lock()

    def recognize(self, image):
        started = time.perf_counter()
        tensor = preprocess(decode_png(image)).unsqueeze(0)
        with self.lock, torch.inference_mode():
            logits = self.model(tensor.to(self.device))
            scores, indices = torch.softmax(logits, dim=1).topk(5, dim=1)
            scores, indices = scores[0].cpu().tolist(), indices[0].cpu().tolist()
        if not all(np.isfinite(score) for score in scores):
            raise RuntimeError('Non-finite recognition probabilities')
        return {'predictions': [{'character': self.labels[index], 'score': score}
                                for index, score in zip(indices, scores)],
                'elapsed_ms': round((time.perf_counter() - started) * 1000, 2)}
