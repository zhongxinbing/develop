"""
Tests for monitor/monitor2.5/utils/single_thread_parser.py
"""
import pytest

# Stub the debug module to avoid import issues
import sys
import types

_debug_stub = types.ModuleType("debug")
_debug_sub = types.ModuleType("debug.debug")
for name in ("red", "green", "blue"):
    setattr(_debug_sub, name, lambda *a, **k: None)
sys.modules.setdefault("debug", _debug_stub)
sys.modules.setdefault("debug.debug", _debug_sub)

from utils.single_thread_parser import SingleThreadParser


class TestParseForRuntimeChart:
    def test_basic_data(self, sample_single_thread_raw_data):
        dates = ["20250101", "20250102"]
        rules = ["Overall", "Phase1"]
        result = SingleThreadParser.parse_for_runtime_chart(
            sample_single_thread_raw_data, "project_A", rules, dates
        )
        assert result["dates"] == dates
        assert "Overall" in result["rules"]
        assert "Phase1" in result["rules"]
        assert result["rules"]["Overall"]["values"] == [100.5, 105.0]
        assert result["rules"]["Phase1"]["values"] == [40.0, 42.0]
        assert result["overall_data"] is not None
        assert result["overall_data"]["name"] == "Overall"
        assert result["rules"]["Overall"]["is_single"] is True

    def test_crash_dates_detected(self, sample_single_thread_raw_data):
        dates = ["20250101", "20250102", "20250103"]
        rules = ["Overall"]
        result = SingleThreadParser.parse_for_runtime_chart(
            sample_single_thread_raw_data, "project_A", rules, dates
        )
        assert "20250103" in result["crash_dates"]
        assert "20250101" not in result["crash_dates"]

    def test_missing_date(self, sample_single_thread_raw_data):
        dates = ["20250101", "20241231"]
        rules = ["Phase1"]
        result = SingleThreadParser.parse_for_runtime_chart(
            sample_single_thread_raw_data, "project_A", rules, dates
        )
        assert result["rules"]["Phase1"]["values"][1] is None

    def test_missing_casename(self, sample_single_thread_raw_data):
        result = SingleThreadParser.parse_for_runtime_chart(
            sample_single_thread_raw_data, "nonexistent", ["Overall"], ["20250101"]
        )
        assert result["rules"]["Overall"]["values"] == [None]

    def test_no_overall_data_when_not_requested(self, sample_single_thread_raw_data):
        result = SingleThreadParser.parse_for_runtime_chart(
            sample_single_thread_raw_data, "project_A", ["Phase1"], ["20250101"]
        )
        assert result["overall_data"] is None


class TestParseForMemoryChart:
    def test_basic_data(self, sample_single_thread_raw_data):
        dates = ["20250101", "20250102"]
        rules = ["Overall", "Phase1"]
        result = SingleThreadParser.parse_for_memory_chart(
            sample_single_thread_raw_data, "project_A", rules, dates
        )
        assert result["rules"]["Overall"]["values"] == [2048, 2100]
        assert result["rules"]["Phase1"]["values"] == [1024, 1050]

    def test_crash_dates(self, sample_single_thread_raw_data):
        dates = ["20250103"]
        result = SingleThreadParser.parse_for_memory_chart(
            sample_single_thread_raw_data, "project_A", ["Overall"], dates
        )
        assert "20250103" in result["crash_dates"]


class TestGetStatistics:
    def test_with_overall_data(self):
        chart_data = {
            "overall_data": {
                "values": [100, 200, 300],
            },
            "rules": {"Overall": {}, "Phase1": {}, "Phase2": {}},
        }
        stats = SingleThreadParser.get_statistics(chart_data)
        assert stats["total"] == 600
        assert stats["avg"] == 200
        assert stats["max"] == 300
        assert stats["min"] == 100

    def test_no_overall_data(self):
        stats = SingleThreadParser.get_statistics({})
        assert stats["total"] == 0
        assert stats["avg"] == 0
        assert stats["max_rule"] is None

    def test_with_none_values(self):
        chart_data = {
            "overall_data": {"values": [10, None, 30]},
            "rules": {"R1": {}, "R2": {}, "R3": {}},
        }
        stats = SingleThreadParser.get_statistics(chart_data)
        assert stats["total"] == 40
        assert stats["avg"] == 20
        assert stats["max"] == 30
        assert stats["min"] == 10

    def test_all_none_values(self):
        chart_data = {
            "overall_data": {"values": [None, None]},
            "rules": {},
        }
        stats = SingleThreadParser.get_statistics(chart_data)
        assert stats["total"] == 0
