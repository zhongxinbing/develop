import csv
from pathlib import Path
from datetime import datetime
from typing import Dict
import re

def parse_csv_date(date_str: str) -> str:
    """解析CSV中的日期格式"""
    try:
        # 尝试多种日期格式
        for fmt in ["%Y-%m-%d", "%Y%m%d", "%Y/%m/%d"]:
            try:
                dt = datetime.strptime(date_str, fmt)
                return dt.strftime("%Y%m%d")
            except ValueError:
                continue
        # 如果都失败，尝试提取数字
        numbers = re.findall(r'\d+', date_str)
        if numbers and len(numbers[0]) == 8:
            return numbers[0]
        return date_str
    except Exception:
        return date_str


def read_csv_to_dict(path: Path) -> Dict[str, str]:
    """读取CSV文件为字典"""
    data = {}
    if not path.exists():
        return data
    
    try:
        with open(path, 'r', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            for row in reader:
                if 'Date' in row:
                    date_key = parse_csv_date(row['Date'])
                    comment = row.get('comment', '')
                    data[date_key] = comment
    except Exception as e:
        print(f"读取CSV失败 {path}: {e}")
    
    return data