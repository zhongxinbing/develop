"""
Tests for monitor/monitor2.5/tool/elint/find.py
(Also covers monitor/monitor2.5/utils/find_files.py which is identical.)
"""
import os
import tempfile

import pytest

from tool.elint.find import FindCommand, find


@pytest.fixture
def sample_dir_tree(tmp_path):
    """
    Create a directory tree:
    tmp/
      a/
        20250101_proj.txt
        b/
          20250102_proj.txt
          c/
            deep_file.txt
      d/
        other.log
    """
    a = tmp_path / "a"
    b = a / "b"
    c = b / "c"
    d = tmp_path / "d"
    for p in (a, b, c, d):
        p.mkdir(parents=True)

    (a / "20250101_proj.txt").write_text("data1")
    (b / "20250102_proj.txt").write_text("data2")
    (c / "deep_file.txt").write_text("deep")
    (d / "other.log").write_text("log")

    return tmp_path


class TestFindCommand:
    def test_find_all_files(self, sample_dir_tree):
        fc = FindCommand(str(sample_dir_tree))
        results = fc.find(file_type="f")
        basenames = [os.path.basename(r) for r in results]
        assert "20250101_proj.txt" in basenames
        assert "20250102_proj.txt" in basenames
        assert "deep_file.txt" in basenames
        assert "other.log" in basenames

    def test_find_directories_only(self, sample_dir_tree):
        fc = FindCommand(str(sample_dir_tree))
        results = fc.find(file_type="d")
        basenames = [os.path.basename(r) for r in results]
        assert "a" in basenames
        assert "b" in basenames
        assert "d" in basenames

    def test_maxdepth_limits_results(self, sample_dir_tree):
        fc = FindCommand(str(sample_dir_tree))
        results = fc.find(maxdepth=1, file_type="f")
        basenames = [os.path.basename(r) for r in results]
        # depth 0 = tmp_path itself (not a file), depth 1 = a/, d/ (dirs)
        # No files at depth 0 or 1 under tmp_path root
        # Actually depth 0 is the root dir. depth 1 is a, d
        # Files like 20250101_proj.txt are at depth 2 (a/file)
        assert "deep_file.txt" not in basenames

    def test_maxdepth_two(self, sample_dir_tree):
        fc = FindCommand(str(sample_dir_tree))
        results = fc.find(maxdepth=2, file_type="f")
        basenames = [os.path.basename(r) for r in results]
        assert "20250101_proj.txt" in basenames
        assert "other.log" in basenames
        # 20250102_proj.txt is at depth 3, should be excluded
        assert "20250102_proj.txt" not in basenames

    def test_name_pattern_regex(self, sample_dir_tree):
        fc = FindCommand(str(sample_dir_tree))
        results = fc.find(name_pattern=r"^\d{8}_.*\.txt$", file_type="f")
        basenames = [os.path.basename(r) for r in results]
        assert "20250101_proj.txt" in basenames
        assert "20250102_proj.txt" in basenames
        assert "deep_file.txt" not in basenames
        assert "other.log" not in basenames

    def test_name_pattern_and_maxdepth(self, sample_dir_tree):
        fc = FindCommand(str(sample_dir_tree))
        results = fc.find(
            maxdepth=2,
            name_pattern=r"^\d{8}_.*\.txt$",
            file_type="f",
        )
        basenames = [os.path.basename(r) for r in results]
        assert "20250101_proj.txt" in basenames
        assert "20250102_proj.txt" not in basenames

    def test_empty_directory(self, tmp_path):
        fc = FindCommand(str(tmp_path))
        results = fc.find(file_type="f")
        assert results == []

    def test_debug_mode_does_not_crash(self, sample_dir_tree):
        fc = FindCommand(str(sample_dir_tree))
        results = fc.find(maxdepth=2, file_type="f", debug=True)
        assert isinstance(results, list)


class TestFindFunction:
    def test_sorted_results(self, sample_dir_tree):
        results = find(
            str(sample_dir_tree),
            name_pattern=r"^\d{8}_.*\.txt$",
            file_type="f",
        )
        assert results == sorted(results)

    def test_returns_list(self, sample_dir_tree):
        results = find(str(sample_dir_tree))
        assert isinstance(results, list)
