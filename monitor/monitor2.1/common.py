"""
公共工具模块
"""
from datetime import datetime
import json
from pathlib import Path
import socket
from functools import lru_cache
from typing import Dict, Any, List, Optional


def log(msg: str) -> None:
    """带时间戳的日志输出"""
    print(f"{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}: {msg}")


def load_json(path: Path) -> Dict[str, Any]:
    """加载JSON文件"""
    with open(path, 'r', encoding='utf-8') as f:
        return json.load(f)


def save_json(path: Path, data: Dict[str, Any]) -> bool:
    """保存JSON文件"""
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        with open(path, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=4)
        log(f"JSON已保存: {path}")
        return True
    except Exception as e:
        log(f"保存JSON失败: {e}")
        return False


@lru_cache(maxsize=1)
def get_local_ip() -> str:
    """获取本机局域网IP地址（带缓存）"""
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.connect(("8.8.8.8", 80))
            return s.getsockname()[0]
    except Exception:
        try:
            return socket.gethostbyname(socket.gethostname())
        except Exception:
            return "127.0.0.1"


def safe_float(value: Any, default: float = 0.0) -> float:
    """安全转换为浮点数"""
    try:
        return float(value) if value is not None else default
    except (ValueError, TypeError):
        return default


def safe_int(value: Any, default: int = 0) -> int:
    """安全转换为整数"""
    try:
        return int(value) if value is not None else default
    except (ValueError, TypeError):
        return default