import json
import tempfile
import unittest
from pathlib import Path

from utils.multi_thread_parser import MultiThreadParser


class MultiThreadParserTestCase(unittest.TestCase):
    def test_increment_rule_data_merges_new_rule_threads(self):
        parser = MultiThreadParser()
        with tempfile.TemporaryDirectory() as tmpdir:
            data_path = Path(tmpdir) / "rule.json"
            old_data = {
                "dates": ["20240101"],
                "rules": {
                    "ruleA": {
                        "dates": ["20240101"],
                        "values": [1.0],
                        "type": "line",
                        "name": "ruleA",
                        "thread": 4,
                        "color": "#fff",
                        "rule_name": "ruleA",
                        "is_multi": True,
                    }
                },
                "crash_dates": [],
                "overall_data": None,
                "all_threads": [4],
            }
            data_path.write_text(json.dumps(old_data), encoding="utf-8")

            new_data = {
                "dates": ["20240102"],
                "rules": {
                    "ruleB": {
                        "dates": ["20240102"],
                        "values": [2.0],
                        "type": "line",
                        "name": "ruleB",
                        "thread": 8,
                        "color": "#000",
                        "rule_name": "ruleB",
                        "is_multi": True,
                    }
                },
                "crash_dates": [],
                "overall_data": None,
                "all_threads": [8],
            }

            parser.increment_rule_data(new_data, data_path)
            saved = json.loads(data_path.read_text(encoding="utf-8"))

            self.assertIn("ruleA", saved["rules"])
            self.assertIn("ruleB", saved["rules"])
            self.assertEqual(saved["rules"]["ruleB"]["dates"], ["20240102"])
            self.assertEqual(saved["all_threads"], [4, 8])


if __name__ == "__main__":
    unittest.main()
