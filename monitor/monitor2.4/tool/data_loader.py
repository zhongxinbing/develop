import json
import os
import csv
from typing import List, Dict

# 这是一个示例数据加载模块。实际项目中，用户可以根据自己的数据格式
# 实现下面的接口函数，并返回符合统一结构的数据。
#
# 期望的单线程或多线程数据结构格式：
# {
#   "date": "2026-06-05",
#   "case": "caseA",
#   "rule": "Overall",
#   "runtime": 123.4,
#   "memory": 456.7,
#   "extra": {"platform": "linux", "category": "full"}
# }
#
# 其中 extra 字段可选，用于前端提示框展示工具额外信息。


def load_tool_result_data(path: str) -> List[Dict]:
    if not path or not os.path.exists(path):
        return []
    if path.endswith(".json"):
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    if path.endswith(".csv"):
        with open(path, newline="", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            return [
                {
                    "date": row.get("date", ""),
                    "case": row.get("case", ""),
                    "rule": row.get("rule", ""),
                    "runtime": float(row.get("runtime", 0) or 0),
                    "memory": float(row.get("memory", 0) or 0),
                    "extra": {k: row[k] for k in row if k not in ["date", "case", "rule", "runtime", "memory"]}
                }
                for row in reader
            ]
    return []


def load_multi_thread_data(path: str) -> List[Dict]:
    return load_tool_result_data(path)


def load_custom_curve_data(path: str) -> List[Dict]:
    return load_tool_result_data(path)
