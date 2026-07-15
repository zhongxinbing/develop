import unittest

from utils.data_manager import DataManager


class DataManagerTestCase(unittest.TestCase):
    def test_statistical_compare_result_data_handles_runtime_and_memory(self):
        manager = DataManager()

        runtime_data = {
            "rule1": {
                "date1_data": 10,
                "date2_data": 12,
                "diff": 2,
                "diff_percent": 20,
            }
        }
        memory_data = {
            "rule1": {
                "date1_data": 100,
                "date2_data": 90,
                "diff": -10,
                "diff_percent": -10,
            }
        }

        result = manager.statistical_compare_result_data(
            runtime_data,
            memory_data,
            dimension="all",
            runtime_threshold=0,
            memory_threshold=0,
            error_mode="absolute",
        )

        self.assertIn("statistics", result)
        self.assertIn("comparisons", result)
        self.assertTrue(result["comparisons"])

    def test_calculation_error_handles_zero_base_value(self):
        manager = DataManager()
        data = {
            "rules": {
                "rule1": {
                    "dates": ["2024-01-01", "2024-01-02"],
                    "values": [0, 2],
                }
            }
        }

        date1_data, date2_data, diff, diff_percent = manager.calculation_error(
            data, "rule1", "2024-01-01", "2024-01-02"
        )

        self.assertEqual(date1_data, 0)
        self.assertEqual(date2_data, 2)
        self.assertEqual(diff, 2)
        self.assertEqual(diff_percent, 0)


if __name__ == "__main__":
    unittest.main()
