import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import configure_mail
from configure_mail import load_mail_settings, check_auth


class GmailConfigurationTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.path = Path(self.directory.name) / 'mail.json'

    def save(self, **changes):
        data = dict(provider='gmail', username='synthetic@example.invalid', app_password='abcd efgh ijkl mnop')
        data.update(changes)
        self.path.write_text(json.dumps(data), encoding='utf-8')

    def test_missing_configuration_preserves_mailpit(self):
        self.assertEqual(load_mail_settings(self.path), {})

    def test_gmail_requires_auth_verified_tls_and_sender_identity(self):
        self.save()
        settings = load_mail_settings(self.path)
        self.assertEqual(settings['MAIL_HOST'], 'smtp.gmail.com')
        self.assertEqual(settings['MAIL_PORT'], '587')
        self.assertEqual(settings['MAIL_AUTH'], 'true')
        self.assertEqual(settings['MAIL_TLS_REQUIRED'], 'true')
        self.assertEqual(settings['MAIL_USERNAME'], settings['IDENTITY_MAIL_FROM'])
        self.assertEqual(len(settings['MAIL_PASSWORD']), 16)
        self.assertEqual(settings['IDENTITY_NOTIFICATION_EMAIL_ENABLED'], 'false')

    def test_invalid_configuration_fails_closed_without_echoing_contents(self):
        for changes in [dict(provider='other'), dict(username='bad\r\nBcc: test'),
                        dict(app_password='invalid-secret'), dict(app_password=None)]:
            with self.subTest(fields=list(changes)):
                self.save(**changes)
                with self.assertRaisesRegex(ValueError, '^Invalid local Gmail configuration; rerun configure_mail.py$'):
                    load_mail_settings(self.path)
        self.path.write_text('{not json}', encoding='utf-8')
        with self.assertRaises(ValueError):
            load_mail_settings(self.path)

    @patch('configure_mail.smtplib.SMTP')
    def test_connection_authenticates_after_tls_without_sending_email(self, factory):
        self.save()
        settings = load_mail_settings(self.path)
        check_auth(settings)
        smtp = factory.return_value.__enter__.return_value
        smtp.starttls.assert_called_once()
        context = smtp.starttls.call_args.kwargs['context']
        self.assertTrue(context.check_hostname)
        smtp.login.assert_called_once_with(settings['MAIL_USERNAME'], settings['MAIL_PASSWORD'])
        smtp.sendmail.assert_not_called()
        smtp.send_message.assert_not_called()

    def test_apply_preserves_frontend_settings_and_uses_p02_environment_loader(self):
        root = Path(self.directory.name)
        (root / 'frontend').mkdir()
        env = root / 'frontend/.env.local'
        env.write_text('UNCHANGED_FLAG=value\nVITE_LOCAL_MAILBOX_URL=http://localhost:59025\n', encoding='utf-8')
        with patch.object(configure_mail, 'ROOT', root), patch.object(configure_mail, 'SETTINGS', self.path), \
             patch('sys.argv', ['configure_mail.py', '--apply']), patch('builtins.input', return_value='synthetic@example.invalid'), \
             patch('configure_mail.getpass.getpass', return_value='abcdefghijklmnop'), \
             patch('configure_mail.check_auth') as auth, patch('configure_mail.subprocess.run') as run, patch('builtins.print'):
            configure_mail.main()
        auth.assert_called_once()
        self.assertTrue(self.path.is_file())
        self.assertEqual(env.read_text(encoding='utf-8'), 'UNCHANGED_FLAG=value\nVITE_LOCAL_MAILBOX_URL=\n')
        run.assert_called_once_with([configure_mail.sys.executable, 'backend/infra/p02.py', 'apply-mail'], cwd=root, check=True)

    def test_apply_mail_uses_selected_stack_without_regenerating_cloud_configuration(self):
        import p02
        with patch('sys.argv', ['p02.py', 'apply-mail']), \
             patch.object(p02, 'prepare', return_value={}), \
             patch.object(p02, 'load_mail_settings', return_value={'MAIL_HOST': 'smtp.gmail.com'}), \
             patch.object(p02, 'configuration') as configuration, \
             patch.object(p02, 'compose') as compose, patch('builtins.print'):
            p02.main()
        configuration.assert_not_called()
        compose.assert_called_once_with('up', '-d', '--no-deps', 'identity')

    def test_failed_authentication_does_not_save_credentials_or_echo_provider_error(self):
        with patch.object(configure_mail, 'SETTINGS', self.path), patch('sys.argv', ['configure_mail.py']), \
             patch('builtins.input', return_value='synthetic@example.invalid'), \
             patch('configure_mail.getpass.getpass', return_value='abcdefghijklmnop'), \
             patch('configure_mail.check_auth', side_effect=RuntimeError('provider-private-body')), patch('builtins.print'):
            with self.assertRaises(SystemExit) as error:
                configure_mail.main()
        self.assertNotIn('provider-private-body', str(error.exception))
        self.assertFalse(self.path.exists())


if __name__ == '__main__':
    unittest.main()
