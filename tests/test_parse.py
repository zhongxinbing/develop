"""
Tests for monitor/monitor2.5/tool/elint/parse.py
"""
import pytest

# parse.py uses `from common import log` (relative to its own directory),
# but we test it with monitor2.5 on sys.path.  Provide a stub.
import sys
import types

_common_stub = types.ModuleType("common")
_common_stub.log = lambda msg: None  # no-op log
sys.modules.setdefault("common", _common_stub)

from tool.elint.parse import normalize_thread_key, parse_project_data


class TestNormalizeThreadKey:
    def test_integer(self):
        assert normalize_thread_key(4) == "4"

    def test_string_int(self):
        assert normalize_thread_key("8") == "8"

    def test_float(self):
        assert normalize_thread_key(2.0) == "2"

    def test_invalid(self):
        assert normalize_thread_key("abc") == "0"

    def test_none(self):
        assert normalize_thread_key(None) == "0"


class TestParseProjectData:
    def test_basic_single_thread(self):
        project_data = {
            "daily_metrics": {
                "20250101": {
                    "Phase1": {"runtime": 10, "memory": 100, "cores": 0},
                    "Phase2": {"runtime": 20, "memory": 200, "cores": 0},
                },
                "20250102": {
                    "Phase1": {"runtime": 12, "memory": 110, "cores": 0},
                },
            }
        }
        result = parse_project_data(project_data, "proj1")
        assert result["dates"] == ["20250101", "20250102"]
        assert "Phase1" in result["rules"]
        assert "Phase2" in result["rules"]
        assert "Phase1" in result["rule_data"]
        runtimes = result["rule_data"]["Phase1"]["runtimes"]
        assert runtimes[0] == 10
        assert runtimes[1] == 12

    def test_multi_thread_data(self):
        project_data = {
            "daily_metrics": {
                "20250101": {
                    "Phase1": {
                        "thread_metrics": {
                            "2": {"runtime": 10, "memory": 100},
                            "4": {"runtime": 8, "memory": 95},
                        }
                    }
                }
            }
        }
        result = parse_project_data(project_data, "proj2")
        rule_data = result["rule_data"]["Phase1"]
        assert "2" in rule_data["thread_metrics"]
        assert "4" in rule_data["thread_metrics"]
        assert rule_data["thread_metrics"]["2"]["runtimes"][0] == 10
        assert rule_data["thread_metrics"]["4"]["runtimes"][0] == 8

    def test_empty_data(self):
        result = parse_project_data({"daily_metrics": {}}, "empty")
        assert result["dates"] == []
        assert result["rules"] == []
        assert result["rule_data"] == {}

    def test_available_dates_from_data(self):
        project_data = {
            "daily_metrics": {
                "20250102": {"P1": {"runtime": 1, "memory": 1, "cores": 0}},
                "20250101": {"P1": {"runtime": 1, "memory": 1, "cores": 0}},
            },
            "available_dates": ["20250101", "20250102", "20250103"],
        }
        result = parse_project_data(project_data, "proj")
        assert "20250103" in result["available_dates"]

    def test_missing_rule_in_later_date(self):
        project_data = {
            "daily_metrics": {
                "20250101": {
                    "Phase1": {"runtime": 10, "memory": 100, "cores": 0},
                    "Phase2": {"runtime": 20, "memory": 200, "cores": 0},
                },
                "20250102": {
                    "Phase1": {"runtime": 12, "memory": 110, "cores": 0},
                },
            }
        }
        result = parse_project_data(project_data, "proj")
        phase2_runtimes = result["rule_data"]["Phase2"]["runtimes"]
        assert phase2_runtimes[0] == 20
        assert phase2_runtimes[1] is None
