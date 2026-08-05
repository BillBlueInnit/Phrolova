"""Unit tests for captcha module."""
import time
from unittest.mock import patch
from phrolova_server import captcha


class TestGenCaptchaText:
    def test_length_is_5(self):
        for _ in range(20):
            text = captcha._gen_captcha_text()
            assert len(text) == 5

    def test_contains_digits_and_uppercase_letters(self):
        for _ in range(20):
            text = captcha._gen_captcha_text()
            assert text == text.upper()
            assert text.isalnum()

    def test_does_not_contain_ambiguous_letters(self):
        for _ in range(20):
            text = captcha._gen_captcha_text()
            # The generator excludes O and I but includes 0 and 1
            assert "O" not in text
            assert "I" not in text


class TestVerifyCaptcha:
    def test_empty_input_returns_false(self):
        assert captcha.verify_captcha("", "") is False
        assert captcha.verify_captcha("abc", "") is False
        assert captcha.verify_captcha("", "ABC") is False

    def test_nonexistent_id_returns_false(self):
        assert captcha.verify_captcha("nonexistent", "ABC12") is False

    def test_case_insensitive_match(self):
        captcha.CAPTCHAS["test-id"] = {"text": "A1B2C", "expire": time.time() + 60}
        assert captcha.verify_captcha("test-id", "a1b2c") is True
        # One-time use: consumed after verification
        assert captcha.verify_captcha("test-id", "a1b2c") is False

    def test_expired_captcha_returns_false(self):
        captcha.CAPTCHAS["expired-id"] = {"text": "X9Y8Z", "expire": time.time() - 10}
        assert captcha.verify_captcha("expired-id", "x9y8z") is False

    def test_wrong_text_returns_false(self):
        captcha.CAPTCHAS["wrong-id"] = {"text": "A1B2C", "expire": time.time() + 60}
        assert captcha.verify_captcha("wrong-id", "Z9Z9Z") is False


class TestCleanCaptchas:
    def test_removes_expired_entries(self):
        captcha.CAPTCHAS.clear()
        captcha.CAPTCHAS["fresh"] = {"text": "A", "expire": time.time() + 60}
        captcha.CAPTCHAS["stale"] = {"text": "B", "expire": time.time() - 60}
        captcha._clean_captchas()
        assert "fresh" in captcha.CAPTCHAS
        assert "stale" not in captcha.CAPTCHAS
        captcha.CAPTCHAS.clear()
