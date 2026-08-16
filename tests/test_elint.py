"""
Tests for monitor/monitor2.5/tool/elint/elint.py
"""
import json
import os
import tempfile
from pathlib import Path

import pytest

from tool.elint.elint import (
    gen_dict_data,
    get_data_json,
    get_date_from_txt_single,
    get_incremental_data,
    read_csv,
    time_to_seconds,
    get_runtime,
    get_user_data,
    get_user_data_batch,
)


class TestGenDictData:
    def test_basic_generation(self):
        data = [
            ("Phase1", "10.5", "2048.0", "100.0"),
            ("Phase2", "20.3", "4096.0", "200.0"),
        ]
        result = gen_dict_data({}, data, 0)
        assert "Phase1" in result
        assert result["Phase1"]["runtime"] == 10.5
        assert result["Phase1"]["memory"] == 2048.0
        assert "Phase2" in result
        assert result["Phase2"]["runtime"] == 20.3

    def test_empty_data(self):
        result = gen_dict_data({}, [], 0)
        assert result == {}

    def test_single_item(self):
        data = [("Overall", "100.0", "8192.0", "50.0")]
        result = gen_dict_data({}, data, 0)
        assert result["Overall"]["runtime"] == 100.0
        assert result["Overall"]["memory"] == 8192.0


class TestGetDataJson:
    def test_single_rule_multi_thread(self):
        data = [("Phase1", "10.0", "15.0", "2048.0", "100.0")]
        rule_data = {}
        result = get_data_json(rule_data, data, 4)
        assert "Phase1" in result
        assert result["Phase1"]["thread_metrics"][4]["runtime"] == 15.0
        assert result["Phase1"]["thread_metrics"][4]["memory"] == 2048.0

    def test_single_thread_zero(self):
        data = [("Phase1", "10.0", "15.0", "2048.0", "100.0")]
        rule_data = {}
        result = get_data_json(rule_data, data, 0)
        assert result["Phase1"]["thread_metrics"][0]["runtime"] == 10.0

    def test_multiple_threads_same_rule(self):
        data = [("Phase1", "10.0", "15.0", "2048.0", "100.0")]
        rule_data = {}
        get_data_json(rule_data, data, 2)
        get_data_json(rule_data, data, 4)
        assert 2 in rule_data["Phase1"]["thread_metrics"]
        assert 4 in rule_data["Phase1"]["thread_metrics"]

    def test_skip_empty_items(self):
        data = [(), ("Phase1", "10.0", "15.0", "2048.0", "100.0")]
        rule_data = {}
        result = get_data_json(rule_data, data, 2)
        assert "Phase1" in result

    def test_skip_sched_local(self):
        data = [("sched(local)]", "10.0", "15.0", "2048.0", "100.0")]
        rule_data = {}
        result = get_data_json(rule_data, data, 2)
        assert "sched(local)]" not in result

    def test_bracket_rule_name_extraction(self):
        data = [("[block1][RealPhase]", "10.0", "15.0", "2048.0", "100.0")]
        rule_data = {}
        result = get_data_json(rule_data, data, 2)
        assert "RealPhase" in result


class TestTimeToSeconds:
    def test_hours_only(self):
        assert time_to_seconds("2 hours") == 7200.0

    def test_minutes_only(self):
        assert time_to_seconds("30 mins") == 1800.0

    def test_seconds_only(self):
        assert time_to_seconds("45 secs") == 45.0

    def test_combined(self):
        result = time_to_seconds("1 hour 30 mins 15 secs")
        assert result == 3600 + 1800 + 15

    def test_zero(self):
        assert time_to_seconds("") == 0.0

    def test_fractional(self):
        result = time_to_seconds("1.5 hours")
        assert result == 5400.0

    def test_singular_forms(self):
        result = time_to_seconds("1 hour 1 min 1 sec")
        assert result == 3600 + 60 + 1


class TestGetRuntime:
    def test_basic_parsing(self):
        content = "Overall | 1 hour 30 mins 0 secs | 2 hours 0 mins 0 secs | 4096.0 |"
        result = get_runtime(content)
        assert len(result) == 1
        name, cpu, elapse, peak, _ = result[0]
        assert name == "Overall"
        assert float(peak) == 4096.0

    def test_no_match(self):
        result = get_runtime("no matching content here")
        assert result == []


class TestGetDateFromTxtSingle:
    def test_basic_parsing(self, tmp_path):
        txt_file = tmp_path / "20250101_projectA.txt"
        txt_file.write_text(
            "dict set 20250101 Phase1 {10.5 2048.0 100.0}\n"
            "dict set 20250101 Phase2 {20.3 4096.0 200.0}\n"
        )
        case_data = {}
        result = get_date_from_txt_single([str(txt_file)], case_data)
        assert "projectA" in result
        assert "20250101" in result["projectA"]["daily_metrics"]
        assert "Phase1" in result["projectA"]["daily_metrics"]["20250101"]
        assert result["projectA"]["daily_metrics"]["20250101"]["Phase1"]["runtime"] == 10.5

    def test_multiple_dates(self, tmp_path):
        f1 = tmp_path / "20250101_proj.txt"
        f2 = tmp_path / "20250102_proj.txt"
        f1.write_text("dict set 20250101 P1 {10.0 100.0 5.0}\n")
        f2.write_text("dict set 20250102 P1 {12.0 110.0 6.0}\n")
        result = get_date_from_txt_single([str(f1), str(f2)], {})
        assert "20250101" in result["proj"]["daily_metrics"]
        assert "20250102" in result["proj"]["daily_metrics"]

    def test_non_matching_filename_skipped(self, tmp_path):
        f = tmp_path / "random_name.txt"
        f.write_text("dict set 20250101 P1 {10.0 100.0 5.0}\n")
        result = get_date_from_txt_single([str(f)], {})
        assert result == {}


class TestGetIncrementalData:
    def test_no_new_files(self):
        existing = {"proj": {"daily_metrics": {}, "available_dates": []}}
        result_data, result_files = get_incremental_data(
            existing, ["f1.txt"], [], Path("/tmp/test.json")
        )
        assert result_data is existing
        assert result_files == ["f1.txt"]

    def test_merges_new_data(self, tmp_path):
        f = tmp_path / "20250103_proj.txt"
        f.write_text("dict set 20250103 P1 {15.0 120.0 7.0}\n")

        existing = {
            "proj": {
                "casename": "proj",
                "daily_metrics": {
                    "20250101": {"P1": {"runtime": 10.0, "memory": 100.0}}
                },
                "available_dates": ["20250101"],
            }
        }
        result_data, result_files = get_incremental_data(
            existing, [], [str(f)], tmp_path / "out.json"
        )
        assert "20250103" in result_data["proj"]["daily_metrics"]
        assert "20250101" in result_data["proj"]["daily_metrics"]


class TestReadCsv:
    def test_basic_csv(self, tmp_path):
        csv_path = tmp_path / "test.csv"
        csv_path.write_text("Date,comment\n2025-01-01,first commit\n2025-01-02,fix bug\n")
        result = read_csv(str(csv_path))
        assert result["20250101"] == "first commit"
        assert result["20250102"] == "fix bug"

    def test_nonexistent_file(self, tmp_path):
        result = read_csv(str(tmp_path / "nonexistent.csv"))
        assert result == {}


class TestGetUserData:
    def test_valid_json(self, tmp_path):
        f = tmp_path / "data.json"
        f.write_text(json.dumps({"proj": {"daily_metrics": {}}}))
        result = get_user_data(str(f))
        assert "proj" in result

    def test_invalid_path(self):
        result = get_user_data("/nonexistent/path.json")
        assert result == {}


class TestGetUserDataBatch:
    def test_empty_paths(self):
        result = get_user_data_batch([])
        assert result == {}

    def test_blank_paths_skipped(self):
        result = get_user_data_batch(["", "  "])
        assert result == {}

    def test_merge_multiple(self, tmp_path):
        f1 = tmp_path / "d1.json"
        f2 = tmp_path / "d2.json"
        f1.write_text(json.dumps({
            "proj": {
                "daily_metrics": {"20250101": {"P1": {"runtime": 10}}},
                "available_dates": ["20250101"],
            }
        }))
        f2.write_text(json.dumps({
            "proj": {
                "daily_metrics": {"20250102": {"P1": {"runtime": 12}}},
                "available_dates": ["20250102"],
            }
        }))
        result = get_user_data_batch([str(f1), str(f2)])
        assert "20250101" in result["proj"]["daily_metrics"]
        assert "20250102" in result["proj"]["daily_metrics"]
        assert "20250101" in result["proj"]["available_dates"]
        assert "20250102" in result["proj"]["available_dates"]
