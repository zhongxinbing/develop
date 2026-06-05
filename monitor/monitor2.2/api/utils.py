"""
API公共工具函数
"""
from datetime import datetime
from pathlib import Path
from typing import Dict, Any

from common import log as common_log


def log(msg: str) -> None:
    """带时间戳的日志输出（封装common.log）"""
    common_log(msg)


def load_json_file(path: Path) -> Dict[str, Any]:
    """加载JSON文件"""
    from common import load_json
    return load_json(path)


def save_json_file(path: Path, data: Dict[str, Any]) -> bool:
    """保存JSON文件"""
    from common import save_json
    return save_json(path, data)


def ensure_dir(path: Path) -> None:
    """确保目录存在"""
    path.parent.mkdir(parents=True, exist_ok=True)