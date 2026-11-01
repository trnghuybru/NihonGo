"""Select Gemini Developer API or Google Cloud Vertex AI for text inference."""
import os
import re
import threading

from api_errors import ApiError

MODEL_PATH = re.compile(r"/models/([A-Za-z0-9._-]+):generateContent$")
PROJECT_ID = re.compile(r"[a-z][a-z0-9-]{4,28}[a-z0-9]")
_lock = threading.Lock()
_credentials = None


def vertex_enabled():
    return os.getenv("GEMINI_PROVIDER", "developer").strip().lower() == "vertex"


def gemini_configured():
    if vertex_enabled():
        project = os.getenv("VERTEX_PROJECT_ID", "").strip()
        path = os.getenv("GOOGLE_APPLICATION_CREDENTIALS", "").strip()
        return bool(PROJECT_ID.fullmatch(project) and path and os.path.isfile(path))
    return bool(os.getenv("GEMINI_API_KEY", "").strip())


def vertex_token():
    global _credentials
    with _lock:
        try:
            if _credentials is None:
                import google.auth
                _credentials, _ = google.auth.default(
                    scopes=["https://www.googleapis.com/auth/cloud-platform"])
            if not _credentials.valid or not _credentials.token:
                from google.auth.transport.requests import Request
                _credentials.refresh(Request())
            return _credentials.token
        except Exception:
            raise ApiError("Không xác thực được Vertex AI. Vui lòng báo quản trị viên.",
                           503, "vertex_auth_unavailable") from None


def prepare_request(url, kwargs):
    if not vertex_enabled():
        return url, kwargs
    project = os.getenv("VERTEX_PROJECT_ID", "").strip()
    if not PROJECT_ID.fullmatch(project):
        raise ApiError("Chưa cấu hình Google Cloud project cho Vertex AI.",
                       503, "vertex_project_unavailable")
    match = MODEL_PATH.search(url)
    if not match:
        raise ApiError("Model Vertex AI chưa được cấu hình đúng.", 503, "vertex_model_unavailable")
    model = match.group(1)
    endpoint = ("https://aiplatform.googleapis.com/v1/projects/"
                f"{project}/locations/global/publishers/google/models/{model}:generateContent")
    headers = dict(kwargs.get("headers") or {})
    headers.pop("x-goog-api-key", None)
    headers["Authorization"] = f"Bearer {vertex_token()}"
    return endpoint, {**kwargs, "headers": headers}
