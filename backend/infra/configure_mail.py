"""Configure Gmail SMTP locally without printing or committing credentials.

Run interactively: python backend/infra/configure_mail.py
Check authentication only: python backend/infra/configure_mail.py --check
Apply afterwards: python backend/infra/p02.py apply-mail
"""
import argparse
import getpass
import json
import os
from pathlib import Path
import re
import smtplib
import ssl
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[2]
SETTINGS = ROOT / 'backend/infra/.local/p02/mail.json'


def load_mail_settings(path=SETTINGS):
    path = Path(path)
    if not path.exists():
        return {}
    try:
        data = json.loads(path.read_text(encoding='utf-8'))
        username = data['username'].strip()
        password = data['app_password'].replace(' ', '')
        if data.get('provider') != 'gmail' or not re.fullmatch(r'[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+', username):
            raise ValueError()
        if not re.fullmatch(r'[A-Za-z0-9]{16}', password):
            raise ValueError()
    except (ValueError, KeyError, TypeError, AttributeError):
        raise ValueError('Invalid local Gmail configuration; rerun configure_mail.py') from None
    return dict(MAIL_HOST='smtp.gmail.com', MAIL_PORT='587', MAIL_USERNAME=username,
                MAIL_PASSWORD=password, MAIL_AUTH='true', MAIL_TLS_REQUIRED='true',
                MAIL_TIMEOUT_MS='10000', IDENTITY_MAIL_FROM=username,
                IDENTITY_NOTIFICATION_EMAIL_ENABLED='false')


def check_auth(settings):
    """Authenticate using verified STARTTLS. Does not send a message."""
    with smtplib.SMTP(settings['MAIL_HOST'], int(settings['MAIL_PORT']), timeout=15) as smtp:
        smtp.ehlo()
        smtp.starttls(context=ssl.create_default_context())
        smtp.ehlo()
        smtp.login(settings['MAIL_USERNAME'], settings['MAIL_PASSWORD'])


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument('--check', action='store_true')
    mode.add_argument('--apply', action='store_true', help='Recreate the local Identity container after saving verified Gmail settings')
    args = parser.parse_args()
    if args.check:
        settings = load_mail_settings()
        if not settings:
            parser.error('Gmail SMTP is not configured. Run this command without --check first.')
    else:
        print('Use a Google App Password: https://myaccount.google.com/apppasswords')
        print('Credentials stay in ignored local files. Do not paste them into chat.')
        username = input('Sender Gmail / Google Workspace address: ').strip()
        password = getpass.getpass('Google App Password (hidden): ').replace(' ', '')
        data = dict(provider='gmail', username=username, app_password=password)
        # Validate in memory before contacting SMTP or writing a file.
        if not re.fullmatch(r'[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+', username) or not re.fullmatch(r'[A-Za-z0-9]{16}', password):
            parser.error('Enter a valid sender address and a 16-character Google App Password.')
        settings = dict(MAIL_HOST='smtp.gmail.com', MAIL_PORT='587', MAIL_USERNAME=username, MAIL_PASSWORD=password)
    try:
        check_auth(settings)
    except Exception:
        # SMTP exception bodies may contain addresses or credentials.
        raise SystemExit('Gmail SMTP authentication failed. Check network, 2-Step Verification and App Password; no credentials were printed or changed.') from None
    if args.check:
        print('Gmail STARTTLS/authentication PASS; no email was sent.')
        return
    SETTINGS.parent.mkdir(parents=True, exist_ok=True)
    with SETTINGS.open('w', encoding='utf-8') as stream:
        if os.name != 'nt':
            os.fchmod(stream.fileno(), 0o600)
        json.dump(data, stream, indent=2)
        stream.write('\n')
    # Vite watches .env.local. Preserve other settings and hide the Mailpit hint for real SMTP.
    env_file = ROOT / 'frontend/.env.local'
    content = env_file.read_text(encoding='utf-8') if env_file.exists() else ''
    content = re.sub(r'^VITE_LOCAL_MAILBOX_URL=.*(?:\n|$)', '', content, flags=re.M)
    env_file.write_text(content.rstrip() + '\nVITE_LOCAL_MAILBOX_URL=\n', encoding='utf-8')
    print('Gmail authentication PASS. Local configuration saved; no email was sent.')
    if args.apply:
        try:
            subprocess.run([sys.executable, 'backend/infra/p02.py', 'apply-mail'], cwd=ROOT, check=True)
        except subprocess.CalledProcessError:
            raise SystemExit('Configuration saved, but the local Identity restart failed. Run the apply commands shown in the setup guide.') from None
        print('Gmail SMTP applied. Refresh SmartTravel and request a new verification code.')
        return
    print('Apply: python backend/infra/p02.py apply-mail')
    print('Refresh SmartTravel, choose Verify email, then Resend verification code.')


if __name__ == '__main__':
    main()
