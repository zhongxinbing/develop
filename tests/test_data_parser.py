"""
Tests for monitor/monitor2.5/utils/data_parser.py
Focuses on the comparison logic and _get_avg_thread_value helper.
"""
import pytest

# Stub debug module
import sys
import types

_debug_stub = types.ModuleType("debug")
_debug_sub = types.ModuleType("debug.debug")
for name in ("red", "green", "blue"):
    setattr(_debug_sub, name, lambda *a, **k: None)
sys.modules.setdefault("debug", _debug_stub)
sys.modules.setdefault("debug.debug", _debug_sub)

from utils.data_parser import DataParser


class TestGetAvgThreadValue:
    def test_basic_average(self):
        thread_metrics = {
            "2": {"runtime": 10, "memory": 100},
            "4": {"runtime": 20, "memory": 200},
        }
        assert DataParser._get_avg_thread_value(thread_metrics, "runtime") == 15.0
        assert DataParser._get_avg_thread_value(thread_metrics, "memory") == 150.0

    def test_single_thread(self):
        thread_metrics = {"2": {"runtime": 42.0}}
        assert DataParser._get_avg_thread_value(thread_metrics, "runtime") == 42.0

    def test_missing_key(self):
        thread_metrics = {"2": {"memory": 100}}
        assert DataParser._get_avg_thread_value(thread_metrics, "runtime") is None

    def test_empty_metrics(self):
        assert DataParser._get_avg_thread_value({}, "runtime") is None

    def test_non_numeric_value(self):
        thread_metrics = {"2": {"runtime": "invalid"}}
        assert DataParser._get_avg_thread_value(thread_metrics, "runtime") is None


class TestParseForComparison:
    def _make_raw_data(self, date1_vals, date2_vals):
        """Helper: single-thread data with given (runtime, memory) per rule."""
        daily = {}
        for date, vals in [(self._d1, date1_vals), (self._d2, date2_vals)]:
            metrics = {}
            for rule, (rt, mem) in vals.items():
                metrics[rule] = {"runtime": rt, "memory": mem}
            daily[date] = metrics
        return {
            "case1": {
                "daily_metrics": daily,
            }
        }

    _d1 = "20250101"
    _d2 = "20250102"

    def test_basic_comparison(self):
        raw = self._make_raw_data(
            {"Phase1": (100, 2000)},
            {"Phase1": (120, 2200)},
        )
        result = DataParser.parse_for_comparison(
            raw, "case1", self._d1, self._d2, ["Phase1"]
        )
        assert len(result["comparisons"]) == 1
        comp = result["comparisons"][0]
        assert comp["rule"] == "Phase1"
        assert comp["difference"]["runtime"] == 20
        assert comp["difference"]["memory"] == 200
        assert comp["percentage"]["runtime"] == pytest.approx(20.0)
        assert result["summary"]["total_rules"] == 1

    def test_runtime_decrease(self):
        raw = self._make_raw_data(
            {"P1": (100, 1000)},
            {"P1": (80, 900)},
        )
        result = DataParser.parse_for_comparison(
            raw, "case1", self._d1, self._d2, ["P1"]
        )
        assert result["comparisons"][0]["difference"]["runtime"] == -20
        assert len(result["statistics"]["runtime_decreased"]) == 1

    def test_threshold_absolute(self):
        raw = self._make_raw_data(
            {"P1": (100, 1000)},
            {"P1": (110, 1005)},
        )
        result = DataParser.parse_for_comparison(
            raw, "case1", self._d1, self._d2, ["P1"],
            runtime_threshold=5, error_mode="absolute"
        )
        assert result["comparisons"][0]["is_out_of_tolerance"] is True

    def test_threshold_percentage(self):
        raw = self._make_raw_data(
            {"P1": (100, 1000)},
            {"P1": (106, 1000)},
        )
        result = DataParser.parse_for_comparison(
            raw, "case1", self._d1, self._d2, ["P1"],
            runtime_threshold=5, error_mode="percentage"
        )
        assert result["comparisons"][0]["is_out_of_tolerance"] is True

    def test_within_tolerance(self):
        raw = self._make_raw_data(
            {"P1": (100, 1000)},
            {"P1": (102, 1000)},
        )
        result = DataParser.parse_for_comparison(
            raw, "case1", self._d1, self._d2, ["P1"],
            runtime_threshold=5, error_mode="absolute"
        )
        assert result["comparisons"][0]["is_out_of_tolerance"] is False

    def test_multiple_rules(self):
        raw = self._make_raw_data(
            {"P1": (100, 1000), "P2": (200, 2000)},
            {"P1": (110, 1100), "P2": (190, 1900)},
        )
        result = DataParser.parse_for_comparison(
            raw, "case1", self._d1, self._d2, ["P1", "P2"]
        )
        assert result["summary"]["total_rules"] == 2
        assert len(result["comparisons"]) == 2

    def test_missing_date_data(self):
        raw = {
            "case1": {
                "daily_metrics": {
                    "20250101": {"P1": {"runtime": 100, "memory": 1000}},
                }
            }
        }
        result = DataParser.parse_for_comparison(
            raw, "case1", "20250101", "20250199", ["P1"]
        )
        comp = result["comparisons"][0]
        assert comp["date2_value"]["runtime"] is None

    def test_multi_thread_comparison(self):
        raw = {
            "case1": {
                "daily_metrics": {
                    "20250101": {
                        "P1": {
                            "thread_metrics": {
                                "2": {"runtime": 10, "memory": 100},
                                "4": {"runtime": 20, "memory": 200},
                            }
                        }
                    },
                    "20250102": {
                        "P1": {
                            "thread_metrics": {
                                "2": {"runtime": 12, "memory": 110},
                                "4": {"runtime": 22, "memory": 210},
                            }
                        }
                    },
                }
            }
        }
        result = DataParser.parse_for_comparison(
            raw, "case1", "20250101", "20250102", ["P1"]
        )
        comp = result["comparisons"][0]
        # avg thread runtime: d1=(10+20)/2=15, d2=(12+22)/2=17
        assert comp["date1_value"]["runtime"] == pytest.approx(15.0)
        assert comp["date2_value"]["runtime"] == pytest.approx(17.0)

    def test_statistics_sorting(self):
        raw = self._make_raw_data(
            {"P1": (100, 1000), "P2": (200, 2000), "P3": (300, 3000)},
            {"P1": (120, 1100), "P2": (250, 2300), "P3": (290, 2900)},
        )
        result = DataParser.parse_for_comparison(
            raw, "case1", self._d1, self._d2, ["P1", "P2", "P3"]
        )
        increased = result["statistics"]["runtime_increased"]
        # P2 increased by 50, P1 by 20 -> sorted descending
        assert increased[0][0] == "P2"
        assert increased[1][0] == "P1"

    def test_zero_division_protection(self):
        raw = self._make_raw_data(
            {"P1": (0, 0)},
            {"P1": (10, 10)},
        )
        result = DataParser.parse_for_comparison(
            raw, "case1", self._d1, self._d2, ["P1"]
        )
        comp = result["comparisons"][0]
        assert comp["percentage"]["runtime"] == 0
