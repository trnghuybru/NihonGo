"""SMTP (including SES SMTP) and Twilio SMS. No OTPs in API responses or logs."""
import smtplib
import ssl
from email.message import EmailMessage

import requests
from flask import current_app

from .security import AuthError


def available_channels():
    config = current_app.config
    return (["email"] if config.get("SMTP_HOST") else []) + (
        ["sms"] if all(config.get(key) for key in ("TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_FROM")) else [])


def send_code(channel, destination, code):
    # Injectable transport is allowed only in automated tests.
    if current_app.testing and current_app.config.get("AUTH_TEST_DELIVERY"):
        current_app.config["AUTH_TEST_DELIVERY"](channel, destination, code)
        return
    if channel not in available_channels():
        raise AuthError("Kênh xác thực này chưa được cấu hình. Vui lòng chọn kênh khác.", 503, "delivery_unavailable")
    config = current_app.config
    message = f"Mã xác thực NihonGO: {code}. Có hiệu lực 10 phút. Không chia sẻ mã này."
    try:
        if channel == "email":
            mail = EmailMessage()
            mail["Subject"] = "Mã xác thực NihonGO"
            mail["From"], mail["To"] = config["SMTP_FROM"], destination
            mail.set_content(message)
            tls = ssl.create_default_context()
            client = smtplib.SMTP_SSL if config["SMTP_SSL"] else smtplib.SMTP
            kwargs = {"context": tls} if config["SMTP_SSL"] else {}
            with client(config["SMTP_HOST"], config["SMTP_PORT"], timeout=10, **kwargs) as smtp:
                if config["SMTP_STARTTLS"] and not config["SMTP_SSL"]:
                    smtp.starttls(context=tls)
                if config.get("SMTP_USERNAME"):
                    smtp.login(config["SMTP_USERNAME"], config["SMTP_PASSWORD"])
                smtp.send_message(mail)
        else:
            sid = config["TWILIO_ACCOUNT_SID"]
            response = requests.post(f"https://api.twilio.com/2010-04-01/Accounts/{sid}/Messages.json",
                                     auth=(sid, config["TWILIO_AUTH_TOKEN"]),
                                     data={"From": config["TWILIO_FROM"], "To": destination, "Body": message}, timeout=10)
            response.raise_for_status()
    except (OSError, smtplib.SMTPException, requests.RequestException):
        # Provider exceptions can contain credentials or message bodies. Never log them.
        current_app.logger.warning("OTP delivery failed: channel=%s", channel)
        raise AuthError("Chưa gửi được mã xác thực. Vui lòng thử lại sau.", 503, "delivery_unavailable") from None
