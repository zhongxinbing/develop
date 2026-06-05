"""
公共工具模块 - 使用标准 logging 库 + 性能优化
"""
import json
import socket
import hashlib
from functools import lru_cache, wraps
from pathlib import Path
from typing import Dict, Any, List, Optional, Callable
import logging
import sys
import time
from threading import Lock
from contextlib import contextmanager


# ==================================================
# 日志配置
# ==================================================

LOG_FORMAT = '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
DATE_FORMAT = '%Y-%m-%d %H:%M:%S'

_logger = None
_logger_lock = Lock()


def get_logger(name: str = "eda_monitor") -> logging.Logger:
    """获取配置好的 logger 实例（线程安全）"""
    global _logger
    
    if _logger is not None:
        return _logger
    
    with _logger_lock:
        if _logger is not None:
            return _logger
        
        _logger = logging.getLogger(name)
        
        if _logger.handlers:
            return _logger
        
        _logger.setLevel(logging.INFO)
        
        console_handler = logging.StreamHandler(sys.stdout)
        console_handler.setLevel(logging.INFO)
        
        formatter = logging.Formatter(LOG_FORMAT, DATE_FORMAT)
        console_handler.setFormatter(formatter)
        
        _logger.addHandler(console_handler)
        _logger.propagate = False
    
    return _logger


def log(msg: str, level: str = "INFO") -> None:
    """带时间戳的日志输出"""
    logger = get_logger()
    level = level.upper()
    if level == "DEBUG":
        logger.debug(msg)
    elif level == "WARNING" or level == "WARN":
        logger.warning(msg)
    elif level == "ERROR":
        logger.error(msg)
    else:
        logger.info(msg)


def set_log_level(level: str) -> None:
    """设置日志级别"""
    logger = get_logger()
    numeric_level = getattr(logging, level.upper(), logging.INFO)
    logger.setLevel(numeric_level)
    for handler in logger.handlers:
        handler.setLevel(numeric_level)


def add_file_handler(file_path: Path, level: str = "INFO") -> None:
    """添加文件日志处理器"""
    logger = get_logger()
    file_path = Path(file_path)
    file_path.parent.mkdir(parents=True, exist_ok=True)
    file_handler = logging.FileHandler(file_path, encoding='utf-8')
    file_handler.setLevel(getattr(logging, level.upper(), logging.INFO))
    formatter = logging.Formatter(LOG_FORMAT, DATE_FORMAT)
    file_handler.setFormatter(formatter)
    logger.addHandler(file_handler)


# ==================================================
# JSON 文件操作（带缓存）
# ==================================================

_file_cache: Dict[str, tuple] = {}
_file_cache_lock = Lock()
_file_cache_max_size = 50


def _get_file_hash(file_path: Path) -> str:
    """获取文件哈希值"""
    try:
        stat = file_path.stat()
        content = f"{stat.st_size}_{stat.st_mtime}"
        return hashlib.md5(content.encode()).hexdigest()[:16]
    except Exception:
        return ""


def load_json(path: Path) -> Dict[str, Any]:
    """加载JSON文件（带缓存）"""
    file_path = Path(path) if isinstance(path, str) else path
    
    with _file_cache_lock:
        file_hash = _get_file_hash(file_path)
        if file_path in _file_cache:
            cached_hash, cached_data = _file_cache[file_path]
            if cached_hash == file_hash:
                return cached_data.copy() if cached_data else {}
    
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        with _file_cache_lock:
            if len(_file_cache) >= _file_cache_max_size:
                oldest = next(iter(_file_cache.keys()))
                del _file_cache[oldest]
            _file_cache[file_path] = (file_hash, data.copy() if data else {})
        
        return data
    except FileNotFoundError:
        log(f"文件不存在: {path}", "WARNING")
        return {}
    except json.JSONDecodeError as e:
        log(f"JSON解析失败 {path}: {e}", "ERROR")
        return {}
    except Exception as e:
        log(f"读取文件失败 {path}: {e}", "ERROR")
        return {}


def save_json(path: Path, data: Dict[str, Any]) -> bool:
    """保存JSON文件并清除缓存"""
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        with open(path, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=4)
        
        with _file_cache_lock:
            if path in _file_cache:
                del _file_cache[path]
        
        log(f"JSON已保存: {path}")
        return True
    except Exception as e:
        log(f"保存JSON失败: {e}", "ERROR")
        return False


def invalidate_cache(path: Path = None) -> None:
    """清除文件缓存"""
    with _file_cache_lock:
        if path:
            _file_cache.pop(path, None)
        else:
            _file_cache.clear()


# ==================================================
# 网络相关
# ==================================================

@lru_cache(maxsize=1)
def get_local_ip() -> str:
    """获取本机局域网IP地址（带缓存）"""
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.connect(("8.8.8.8", 80))
            return s.getsockname()[0]
    except Exception as e:
        log(f"获取本机IP失败: {e}", "WARNING")
        try:
            return socket.gethostbyname(socket.gethostname())
        except Exception:
            return "127.0.0.1"


# ==================================================
# 类型转换工具
# ==================================================

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


def safe_str(value: Any, default: str = "") -> str:
    """安全转换为字符串"""
    if value is None:
        return default
    try:
        return str(value)
    except Exception:
        return default


# ==================================================
# 路径工具
# ==================================================

def ensure_dir(path: Path) -> None:
    """确保目录存在"""
    try:
        path.mkdir(parents=True, exist_ok=True)
    except Exception as e:
        log(f"创建目录失败 {path}: {e}", "ERROR")


def get_file_size(path: Path) -> int:
    """获取文件大小（字节）"""
    try:
        return path.stat().st_size
    except Exception:
        return -1


def is_file_empty(path: Path) -> bool:
    """检查文件是否为空"""
    return get_file_size(path) <= 0


# ==================================================
# 性能计时器
# ==================================================

@contextmanager
def timer(name: str = "operation") -> None:
    """性能计时器上下文管理器"""
    start = time.time()
    try:
        yield
    finally:
        elapsed = time.time() - start
        log(f"{name} 耗时: {elapsed:.4f} 秒")


class PerformanceTimer:
    """性能计时器类"""
    
    def __init__(self):
        self._start_time: Optional[float] = None
        self._elapsed: float = 0.0
    
    def start(self) -> None:
        self._start_time = time.time()
    
    def stop(self) -> float:
        if self._start_time is None:
            return 0.0
        self._elapsed = time.time() - self._start_time
        self._start_time = None
        return self._elapsed
    
    def reset(self) -> None:
        self._start_time = None
        self._elapsed = 0.0
    
    @property
    def elapsed(self) -> float:
        if self._start_time is not None:
            return time.time() - self._start_time
        return self._elapsed


# ==================================================
# 数据验证工具
# ==================================================

def is_valid_number(value: Any) -> bool:
    """检查是否为有效数字（非 NaN 且非 None）"""
    if value is None:
        return False
    try:
        num = float(value)
        return not (num != num)
    except (ValueError, TypeError):
        return False


def coalesce(*args: Any) -> Any:
    """返回第一个非 None 的值"""
    for arg in args:
        if arg is not None:
            return arg
    return None