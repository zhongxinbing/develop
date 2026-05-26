"""
数据缓存模块 - LRU缓存 + 数据版本管理
"""
import hashlib
from collections import OrderedDict
from threading import Lock
from typing import Dict, Any, Optional
from pathlib import Path

from common import log


class DataCache:
    """线程安全的LRU数据缓存"""
    
    def __init__(self, max_size: int = 100):
        self._cache: OrderedDict = OrderedDict()
        self._max_size = max_size
        self._lock = Lock()
        self._version = 1
    
    def get(self, key: str) -> Optional[Any]:
        """获取缓存数据"""
        with self._lock:
            if key in self._cache:
                self._cache.move_to_end(key)
                return self._cache[key]
            return None
    
    def set(self, key: str, value: Any) -> None:
        """设置缓存数据"""
        with self._lock:
            if key in self._cache:
                self._cache.move_to_end(key)
            self._cache[key] = value
            
            if len(self._cache) > self._max_size:
                self._cache.popitem(last=False)
    
    def invalidate(self, key: str = None) -> None:
        """使缓存失效"""
        with self._lock:
            if key:
                self._cache.pop(key, None)
            else:
                self._cache.clear()
                self._version += 1
    
    def get_version(self) -> int:
        return self._version


class DataVersionManager:
    """数据版本管理器"""
    
    def __init__(self):
        self._file_hashes: Dict[str, str] = {}
        self._lock = Lock()
    
    @staticmethod
    def _compute_file_hash(file_path: str) -> str:
        """计算单个文件的哈希值"""
        try:
            path = Path(file_path)
            if not path.exists():
                return ""
            stat = path.stat()
            content = f"{stat.st_size}_{stat.st_mtime}"
            return hashlib.md5(content.encode()).hexdigest()[:8]
        except Exception:
            return ""
    
    @staticmethod
    def _compute_dir_hash(dir_path: str, pattern: str = "*.json") -> str:
        """计算目录的哈希值"""
        try:
            path = Path(dir_path)
            if not path.exists():
                return ""
            
            hashes = []
            for file in sorted(path.glob(pattern)):
                if file.is_file():
                    hashes.append(DataVersionManager._compute_file_hash(str(file)))
            
            combined = "|".join(hashes)
            return hashlib.md5(combined.encode()).hexdigest()[:8]
        except Exception:
            return ""
    
    def check_changes(self, config: Dict[str, Any]) -> bool:
        """检查数据是否有变化"""
        with self._lock:
            current_hashes = {}
            
            if "json_path" in config:
                current_hashes["json"] = self._compute_file_hash(config["json_path"])
            
            if "original_path" in config:
                current_hashes["original"] = self._compute_dir_hash(config["original_path"], "*.txt")
            
            for csv_type in ["mem", "cpu"]:
                if csv_type in config:
                    current_hashes[csv_type] = self._compute_file_hash(config[csv_type])
            
            has_changed = current_hashes != self._file_hashes
            
            if has_changed:
                log("检测到数据变化，更新版本")
                self._file_hashes = current_hashes
            
            return has_changed
    
    def get_data_signature(self, config: Dict[str, Any]) -> str:
        """获取数据签名"""
        with self._lock:
            hashes = []
            
            if "json_path" in config:
                hashes.append(self._compute_file_hash(config["json_path"]))
            
            if "original_path" in config:
                hashes.append(self._compute_dir_hash(config["original_path"], "*.txt"))
            
            combined = "|".join(hashes)
            return hashlib.md5(combined.encode()).hexdigest()[:16]


# 全局实例
data_cache = DataCache(max_size=50)
version_manager = DataVersionManager()