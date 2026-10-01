class ApiError(Exception):
    """A safe, localized error that can be returned to an API client."""

    def __init__(self, message, status=400, code="invalid_request", **details):
        super().__init__(message)
        self.message, self.status, self.code, self.details = message, status, code, details
