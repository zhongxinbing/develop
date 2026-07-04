"""
Tests for monitor/doubao/backend/utils/validator.py
"""
import pytest

from backend.utils.validator import validate_tool_config


class TestValidateToolConfig:
    def test_valid_config(self):
        data = {
            "tool_name": "elint",
            "signal_thread_path": "/path/to/data",
            "signal_thread_api": True,
        }
        ok, msg = validate_tool_config(data)
        assert ok is True
        assert msg == "校验通过"

    def test_missing_tool_name(self):
        data = {"signal_thread_path": "/path"}
        ok, msg = validate_tool_config(data)
        assert ok is False
        assert "tool_name" in msg

    def test_missing_signal_thread_path(self):
        data = {"tool_name": "elint"}
        ok, msg = validate_tool_config(data)
        assert ok is False
        assert "signal_thread_path" in msg

    def test_empty_tool_name(self):
        data = {"tool_name": "", "signal_thread_path": "/path"}
        ok, msg = validate_tool_config(data)
        assert ok is False

    def test_signal_path_without_api(self):
        data = {
            "tool_name": "elint",
            "signal_thread_path": "/path",
            "signal_thread_api": False,
        }
        ok, msg = validate_tool_config(data)
        assert ok is False
        assert "单线程" in msg

    def test_multi_path_without_api(self):
        data = {
            "tool_name": "elint",
            "signal_thread_path": "/path",
            "signal_thread_api": True,
            "multi_thread_path": "/multi/path",
            "multi_thread_api": False,
        }
        ok, msg = validate_tool_config(data)
        assert ok is False
        assert "多线程" in msg

    def test_multi_path_with_api(self):
        data = {
            "tool_name": "elint",
            "signal_thread_path": "/path",
            "signal_thread_api": True,
            "multi_thread_path": "/multi/path",
            "multi_thread_api": True,
        }
        ok, msg = validate_tool_config(data)
        assert ok is True

    def test_no_multi_path_no_multi_api(self):
        data = {
            "tool_name": "elint",
            "signal_thread_path": "/path",
            "signal_thread_api": True,
        }
        ok, msg = validate_tool_config(data)
        assert ok is True

    def test_empty_multi_path_ignored(self):
        data = {
            "tool_name": "elint",
            "signal_thread_path": "/path",
            "signal_thread_api": True,
            "multi_thread_path": "",
            "multi_thread_api": False,
        }
        ok, msg = validate_tool_config(data)
        assert ok is True
