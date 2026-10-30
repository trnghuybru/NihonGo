"""Offline M2M100 sentence translation, loaded once per backend process."""
import threading
import time
from pathlib import Path
from api_errors import ApiError

MODEL_ID = 'facebook/m2m100_418M'
REVISION = '55c2e61'
MAX_CHARACTERS = 500
MAX_INPUT_TOKENS = 512


class SentenceTranslator:
    def __init__(self, model_path, device='auto'):
        self.model_path = Path(model_path)
        self.device_setting = device
        self.model = self.tokenizer = None
        self.lock = threading.Lock()

    def load(self):
        if self.model is not None:
            return
        if not (self.model_path / 'pytorch_model.bin').is_file() and not (self.model_path / 'model.safetensors').is_file():
            raise ApiError('Model dịch chưa được cài trên máy chủ.', 503, 'translation_unavailable')
        import torch
        from transformers import M2M100ForConditionalGeneration, M2M100Tokenizer
        requested = self.device_setting
        if requested == 'auto':
            requested = 'cuda' if torch.cuda.is_available() else 'mps' if torch.backends.mps.is_available() else 'cpu'
        if requested not in ('cpu', 'mps', 'cuda'):
            raise ApiError('Cấu hình thiết bị dịch không hợp lệ.', 503, 'translation_unavailable')
        device = torch.device(requested)
        tokenizer = M2M100Tokenizer.from_pretrained(str(self.model_path), local_files_only=True)
        model = M2M100ForConditionalGeneration.from_pretrained(str(self.model_path), local_files_only=True,
            weights_only=True, dtype=torch.float32, attn_implementation='eager').to(device).eval()
        self.tokenizer, self.device, self.model = tokenizer, device, model

    def translate(self, account_id, text, source, target):
        if not isinstance(text, str) or not text.strip() or len(text) > MAX_CHARACTERS:
            raise ApiError(f'Nhập câu cần dịch, tối đa {MAX_CHARACTERS} ký tự.')
        if (source, target) not in (('ja', 'vi'), ('vi', 'ja')):
            raise ApiError('Chỉ hỗ trợ dịch Nhật → Việt hoặc Việt → Nhật.')
        text = text.strip()
        started = time.perf_counter()
        if not self.lock.acquire(blocking=False):
            raise ApiError('Máy chủ đang dịch câu khác. Vui lòng thử lại sau.', 429, 'translation_busy')
        try:
            import torch
            self.load()
            # src_lang mutates tokenizer state; tokenization and inference share the lock.
            self.tokenizer.src_lang = source
            inputs = self.tokenizer(text, return_tensors='pt', truncation=False)
            if inputs['input_ids'].shape[-1] > MAX_INPUT_TOKENS:
                raise ApiError('Câu quá dài cho model thử nghiệm. Hãy chia thành câu ngắn hơn.', 422, 'translation_too_long')
            inputs = {key: value.to(self.device) for key, value in inputs.items()}
            with torch.inference_mode():
                generated = self.model.generate(**inputs,
                    forced_bos_token_id=self.tokenizer.get_lang_id(target),
                    max_new_tokens=384, num_beams=4, do_sample=False)
            tokens = generated[0].cpu().tolist()
            if self.tokenizer.eos_token_id not in tokens[1:]:
                raise ApiError('Bản dịch vượt giới hạn. Hãy chia thành câu ngắn hơn.', 422, 'translation_too_long')
            translated = self.tokenizer.decode(tokens, skip_special_tokens=True).strip()
            if not translated:
                raise ApiError('Chưa tạo được bản dịch. Hãy thử câu khác.', 502, 'translation_failed')
            result = {'text': text, 'translation': translated, 'source': source, 'target': target,
                      'model': MODEL_ID, 'cached': False, 'elapsed_ms': round((time.perf_counter() - started) * 1000)}
            return result
        finally:
            self.lock.release()
