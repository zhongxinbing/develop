"""
Shared fixtures and path configuration for tests.
"""
import sys
import os
from pathlib import Path

import pytest

# Add source directories to sys.path so modules can be imported in tests.
MONITOR_25_DIR = Path(__file__).resolve().parent.parent / "monitor" / "monitor2.5"
DOUBAO_DIR = Path(__file__).resolve().parent.parent / "monitor" / "doubao"

for p in (str(MONITOR_25_DIR), str(DOUBAO_DIR)):
    if p not in sys.path:
        sys.path.insert(0, p)


@pytest.fixture
def sample_single_thread_raw_data():
    """Sample raw data for single-thread chart parsing."""
    return {
        "project_A": {
            "daily_metrics": {
                "20250101": {
                    "Overall": {"runtime": 100.5, "memory": 2048},
                    "Phase1": {"runtime": 40.0, "memory": 1024},
                    "Phase2": {"runtime": 60.5, "memory": 1500},
                },
                "20250102": {
                    "Overall": {"runtime": 105.0, "memory": 2100},
                    "Phase1": {"runtime": 42.0, "memory": 1050},
                    "Phase2": {"runtime": 63.0, "memory": 1550},
                },
                "20250103": {
                    "Phase1": {"runtime": 44.0, "memory": 1080},
                },
            }
        }
    }


@pytest.fixture
def sample_multi_thread_raw_data():
    """Sample raw data for multi-thread chart parsing."""
    return {
        "project_B": {
            "daily_metrics": {
                "20250101": {
                    "Overall": {
                        "thread_metrics": {
                            "2": {"runtime": 80.0, "memory": 1800},
                            "4": {"runtime": 50.0, "memory": 1900},
                        }
                    },
                    "Phase1": {
                        "thread_metrics": {
                            "2": {"runtime": 30.0, "memory": 900},
                            "4": {"runtime": 20.0, "memory": 950},
                        }
                    },
                },
                "20250102": {
                    "Overall": {
                        "thread_metrics": {
                            "2": {"runtime": 82.0, "memory": 1850},
                            "4": {"runtime": 52.0, "memory": 1950},
                        }
                    },
                    "Phase1": {
                        "thread_metrics": {
                            "2": {"runtime": 32.0, "memory": 920},
                            "4": {"runtime": 22.0, "memory": 970},
                        }
                    },
                },
            }
        }
    }
