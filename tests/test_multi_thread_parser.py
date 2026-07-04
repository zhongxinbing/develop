"""
Tests for monitor/monitor2.5/utils/multi_thread_parser.py
"""
import pytest

from utils.multi_thread_parser import MultiThreadParser


class TestGetAvailableThreads:
    def test_basic(self):
        daily_metrics = {
            "20250101": {
                "Phase1": {
                    "thread_metrics": {"2": {}, "4": {}}
                }
            }
        }
        result = MultiThreadParser.get_available_threads(daily_metrics, "any")
        assert result == [2, 4]

    def test_across_dates(self):
        daily_metrics = {
            "20250101": {
                "Phase1": {"thread_metrics": {"2": {}}}
            },
            "20250102": {
                "Phase1": {"thread_metrics": {"4": {}, "8": {}}}
            },
        }
        result = MultiThreadParser.get_available_threads(daily_metrics, "any")
        assert result == [2, 4, 8]

    def test_with_rules_filter(self):
        daily_metrics = {
            "20250101": {
                "Phase1": {"thread_metrics": {"2": {}}},
                "Phase2": {"thread_metrics": {"16": {}}},
            }
        }
        result = MultiThreadParser.get_available_threads(
            daily_metrics, "any", rules=["Phase1"]
        )
        assert result == [2]
        assert 16 not in result

    def test_empty_data(self):
        result = MultiThreadParser.get_available_threads({}, "any")
        assert result == []

    def test_invalid_thread_key(self):
        daily_metrics = {
            "20250101": {
                "Phase1": {"thread_metrics": {"abc": {}}}
            }
        }
        result = MultiThreadParser.get_available_threads(daily_metrics, "any")
        assert result == [0]


class TestParseForRuntimeChart:
    def test_basic(self, sample_multi_thread_raw_data):
        dates = ["20250101", "20250102"]
        rules = ["Overall", "Phase1"]
        result = MultiThreadParser.parse_for_runtime_chart(
            sample_multi_thread_raw_data, "project_B", rules, dates
        )
        assert result["dates"] == dates
        assert 2 in result["all_threads"]
        assert 4 in result["all_threads"]
        assert result["overall_data"] is not None

    def test_selected_threads_filter(self, sample_multi_thread_raw_data):
        dates = ["20250101"]
        rules = ["Overall"]
        result = MultiThreadParser.parse_for_runtime_chart(
            sample_multi_thread_raw_data,
            "project_B",
            rules,
            dates,
            selected_threads=[4],
        )
        series_names = list(result["rules"].keys())
        assert any("4" in name for name in series_names)
        # Thread 2 should not be in series since only 4 is selected
        assert not any(name.endswith("(2)") for name in series_names)

    def test_crash_dates(self, sample_multi_thread_raw_data):
        dates = ["20250101", "20250199"]
        result = MultiThreadParser.parse_for_runtime_chart(
            sample_multi_thread_raw_data,
            "project_B",
            ["Overall"],
            dates,
        )
        assert "20250199" in result["crash_dates"]

    def test_missing_casename(self, sample_multi_thread_raw_data):
        result = MultiThreadParser.parse_for_runtime_chart(
            sample_multi_thread_raw_data,
            "nonexistent",
            ["Overall"],
            ["20250101"],
        )
        assert result["all_threads"] == []


class TestParseForMemoryChart:
    def test_basic(self, sample_multi_thread_raw_data):
        dates = ["20250101"]
        rules = ["Overall"]
        result = MultiThreadParser.parse_for_memory_chart(
            sample_multi_thread_raw_data, "project_B", rules, dates
        )
        assert len(result["rules"]) > 0
        for series in result["rules"].values():
            assert series["is_multi"] is True


class TestParseForThreadChart:
    def test_basic(self, sample_multi_thread_raw_data):
        result = MultiThreadParser.parse_for_thread_chart(
            sample_multi_thread_raw_data,
            "project_B",
            "Overall",
            "20250101",
        )
        assert result["threads"] == [2, 4]
        assert result["runtimes"] == [80.0, 50.0]
        assert result["memories"] == [1800, 1900]

    def test_empty_date(self, sample_multi_thread_raw_data):
        result = MultiThreadParser.parse_for_thread_chart(
            sample_multi_thread_raw_data,
            "project_B",
            "Overall",
            "20250199",
        )
        assert result["threads"] == []
        assert result["runtimes"] == []

    def test_empty_rule(self, sample_multi_thread_raw_data):
        result = MultiThreadParser.parse_for_thread_chart(
            sample_multi_thread_raw_data,
            "project_B",
            "NonexistentRule",
            "20250101",
        )
        assert result["threads"] == []


class TestGetStatistics:
    def test_basic(self):
        chart_data = {
            "overall_data": {"values": [100, 200, 300]}
        }
        stats = MultiThreadParser.get_statistics(chart_data)
        assert stats["total"] == 600
        assert stats["avg"] == 200
        assert stats["max"] == 300
        assert stats["min"] == 100

    def test_no_overall(self):
        stats = MultiThreadParser.get_statistics({})
        assert stats["total"] == 0

    def test_with_nones(self):
        chart_data = {
            "overall_data": {"values": [None, 50, None, 150]}
        }
        stats = MultiThreadParser.get_statistics(chart_data)
        assert stats["total"] == 200
        assert stats["avg"] == 100
