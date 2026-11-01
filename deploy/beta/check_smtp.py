"""Check Brevo SMTP login without sending an email or printing credentials."""
import smtplib
import ssl
from pathlib import Path

env_path = Path(__file__).resolve().parents[2] / "backend/.env"
values = {}
for line in env_path.read_text().splitlines():
    if "=" in line and not line.lstrip().startswith("#"):
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip()

host = values.get("SMTP_HOST", "")
port = int(values.get("SMTP_PORT", "0"))
username = values.get("SMTP_USERNAME", "")
password = values.get("SMTP_PASSWORD", "")
if not all((host, port, username, password)):
    raise SystemExit("SMTP settings incomplete")

try:
    with smtplib.SMTP(host, port, timeout=20) as smtp:
        smtp.ehlo()
        smtp.starttls(context=ssl.create_default_context())
        smtp.ehlo()
        smtp.login(username, password)
except smtplib.SMTPAuthenticationError as error:
    raise SystemExit(f"SMTP login failed (code {error.smtp_code})") from None
except (OSError, smtplib.SMTPException) as error:
    raise SystemExit(f"SMTP connection failed ({type(error).__name__})") from None
print("SMTP TLS connection and login succeeded; no email sent.")
