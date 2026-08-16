"""
Tests for monitor/monitor2.5/utils/common.py
"""
import pytest
from utils.common import (
    format_date,
    get_thread_color,
    escape_html,
    calculate_percentage_change,
    format_number,
    normalize_thread_key,
    THREAD_COLORS,
    log,
)


class TestFormatDate:
    def test_empty_string(self):
        assert format_date("") == ""

    def test_none_like_empty(self):
        assert format_date("") == ""

    def test_eight_digit_date(self):
        assert format_date("20250101") == "2025-01-01"

    def test_eight_digit_date_another(self):
        assert format_date("20231231") == "2023-12-31"

    def test_user_suffix(self):
        assert format_date("20250101_user") == "20250101 (用户)"

    def test_other_string_passthrough(self):
        assert format_date("some-date") == "some-date"

    def test_short_digit_string(self):
        assert format_date("2025") == "2025"

    def test_long_digit_string(self):
        assert format_date("202501011") == "202501011"


class TestGetThreadColor:
    def test_known_thread_counts(self):
        assert get_thread_color(0) == "#00E5FF"
        assert get_thread_color(2) == "#A855F7"
        assert get_thread_color(4) == "#10B981"
        assert get_thread_color(128) == "#F97316"

    def test_unknown_thread_count_returns_default(self):
        assert get_thread_color(99) == "#A855F7"

    def test_all_defined_colors(self):
        for thread, color in THREAD_COLORS.items():
            assert get_thread_color(thread) == color


class TestEscapeHtml:
    def test_empty_string(self):
        assert escape_html("") == ""

    def test_none_returns_empty(self):
        assert escape_html(None) == ""

    def test_basic_escaping(self):
        assert escape_html("<script>") == "&lt;script&gt;"

    def test_ampersand(self):
        assert escape_html("a & b") == "a &amp; b"

    def test_quotes(self):
        result = escape_html('"hello"')
        assert "&quot;" in result

    def test_no_escaping_needed(self):
        assert escape_html("hello world") == "hello world"


class TestCalculatePercentageChange:
    def test_normal_increase(self):
        assert calculate_percentage_change(100, 150) == 50.0

    def test_normal_decrease(self):
        assert calculate_percentage_change(100, 80) == -20.0

    def test_zero_old_val_zero_new(self):
        assert calculate_percentage_change(0, 0) == 0

    def test_zero_old_val_nonzero_new(self):
        assert calculate_percentage_change(0, 50) == 100

    def test_none_old_val(self):
        assert calculate_percentage_change(None, 50) == 0

    def test_none_new_val(self):
        assert calculate_percentage_change(50, None) == 0

    def test_both_none(self):
        assert calculate_percentage_change(None, None) == 0

    def test_no_change(self):
        assert calculate_percentage_change(100, 100) == 0.0

    def test_double_value(self):
        assert calculate_percentage_change(50, 100) == 100.0


class TestFormatNumber:
    def test_none_value(self):
        assert format_number(None) == "N/A"

    def test_integer(self):
        assert format_number(42) == "42.00"

    def test_float(self):
        assert format_number(3.14159) == "3.14"

    def test_custom_decimals(self):
        assert format_number(3.14159, 4) == "3.1416"

    def test_zero_decimals(self):
        assert format_number(3.14, 0) == "3"

    def test_string_number(self):
        assert format_number("100.5") == "100.50"

    def test_non_numeric_string(self):
        assert format_number("abc") == "abc"

    def test_zero(self):
        assert format_number(0) == "0.00"


class TestNormalizeThreadKey:
    def test_integer_input(self):
        assert normalize_thread_key(4) == "4"

    def test_string_integer(self):
        assert normalize_thread_key("8") == "8"

    def test_float_input(self):
        assert normalize_thread_key(4.0) == "4"

    def test_invalid_string(self):
        assert normalize_thread_key("abc") == "0"

    def test_none_input(self):
        assert normalize_thread_key(None) == "0"

    def test_zero(self):
        assert normalize_thread_key(0) == "0"


class TestLog:
    def test_log_prints_output(self, capsys):
        log("test message")
        captured = capsys.readouterr()
        assert "test message" in captured.out
        assert ":" in captured.out  # timestamp separator
