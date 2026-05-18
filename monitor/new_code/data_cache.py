"""
数据缓存模块 - LRU缓存 + 数据版本管理
"""
import json
import hashlib
from datetime import datetime
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
        """获取缓存版本号"""
        return self._version


class DataVersionManager:
    """数据版本管理器 - 用于检测数据变化"""
    
    def __init__(self):
        self._file_hashes: Dict[str, str] = {}
        self._lock = Lock()
    
    def _compute_file_hash(self, file_path: str) -> str:
        """计算文件哈希值"""
        try:
            path = Path(file_path)
            if not path.exists():
                return ""
            
            # 使用文件大小和修改时间作为快速哈希
            stat = path.stat()
            content = f"{stat.st_size}_{stat.st_mtime}"
            return hashlib.md5(content.encode()).hexdigest()[:8]
        except Exception:
            return ""
    
    def _compute_dir_hash(self, dir_path: str, pattern: str = "*.json") -> str:
        """计算目录哈希值"""
        try:
            path = Path(dir_path)
            if not path.exists():
                return ""
            
            hashes = []
            for file in path.glob(pattern):
                if file.is_file():
                    hashes.append(self._compute_file_hash(str(file)))
            
            combined = "|".join(sorted(hashes))
            return hashlib.md5(combined.encode()).hexdigest()[:8]
        except Exception:
            return ""
    
    def check_changes(self, config: Dict[str, Any]) -> bool:
        """检查数据是否有变化"""
        with self._lock:
            current_hashes = {}
            
            # 检查JSON文件
            if "json_path" in config:
                json_path = config["json_path"]
                current_hashes["json"] = self._compute_file_hash(json_path)
            
            # 检查原始数据目录
            if "original_path" in config:
                orig_path = config["original_path"]
                current_hashes["original"] = self._compute_dir_hash(orig_path, "*.txt")
            
            # 检查CSV文件
            for csv_type in ["mem", "cpu"]:
                if csv_type in config:
                    csv_path = config[csv_type]
                    current_hashes[csv_type] = self._compute_file_hash(csv_path)
            
            # 比较是否变化
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


# 全局缓存实例
data_cache = DataCache(max_size=50)
version_manager = DataVersionManager()