"""Deployment validation must agree with open/invite admission settings."""
import contextlib
import io
import tempfile
import unittest
from pathlib import Path

from deploy.beta.validate_env import main


class BetaEnvironmentTests(unittest.TestCase):
    def validate(self, **changes):
        values = {
            'APP_ENV': 'production', 'BETA_MODE': 'true', 'BETA_QUOTA_MODE': 'daily',
            'BETA_DOMAIN': 'example.com', 'PUBLIC_BASE_URL': 'https://example.com',
            'BETA_DB_PASSWORD': 'test-database-password-long-enough',
            'AUTH_SECRET_KEY': 'test-secret-' * 4, 'GEMINI_API_KEY': 'test-key',
            'SMTP_HOST': 'smtp.example.com', 'SMTP_FROM': 'test@example.com',
            'SMTP_USERNAME': 'test', 'SMTP_PASSWORD': 'test', 'SMTP_STARTTLS': 'true',
            'BETA_REGISTRATION_MODE': 'open', 'BETA_ACCOUNT_LIMIT': '200',
            'BETA_INVITE_EMAILS': '',
        }
        values.update(changes)
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / '.env'
            path.write_text('\n'.join(f'{key}={value}' for key, value in values.items()))
            with contextlib.redirect_stderr(io.StringIO()), contextlib.redirect_stdout(io.StringIO()):
                return main(path)

    def test_open_registration_needs_no_invite_list(self):
        self.assertEqual(self.validate(), 0)

    def test_invite_mode_requires_invites(self):
        self.assertEqual(self.validate(BETA_REGISTRATION_MODE='invite'), 1)

    def test_kept_invite_list_accepts_200_but_rejects_duplicates_or_more(self):
        emails = [f'user{i}@example.com' for i in range(200)]
        self.assertEqual(self.validate(BETA_INVITE_EMAILS=','.join(emails)), 0)
        self.assertEqual(self.validate(BETA_INVITE_EMAILS=','.join(emails + emails[:1])), 1)
        self.assertEqual(self.validate(BETA_INVITE_EMAILS=','.join(emails + ['extra@example.com'])), 1)

    def test_invalid_admission_settings_reject_deployment(self):
        self.assertEqual(self.validate(BETA_REGISTRATION_MODE='typo'), 1)
        for limit in ['0', '-1', 'two hundred', '']:
            with self.subTest(limit=limit):
                self.assertEqual(self.validate(BETA_ACCOUNT_LIMIT=limit), 1)
