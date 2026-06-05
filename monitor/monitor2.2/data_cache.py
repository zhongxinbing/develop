"""
数据缓存模块 - LRU缓存 + 数据版本管理 + 异步加载 + 增量解析支持
"""
import hashlib
import threading
import time
from collections import OrderedDict
from threading import Lock, RLock
from typing import Dict, Any, Optional, Callable, List, Tuple
from pathlib import Path
from dataclasses import dataclass, field
from datetime import datetime

from common import log


@dataclass
class CacheEntry:
    """缓存条目"""
    value: Any
    timestamp: float
    version: int = 1
    size: int = 0
    data_signature: str = ""  # 数据签名，用于检测变化
    
    def is_expired(self, ttl: int) -> bool:
        """检查是否过期"""
        return time.time() - self.timestamp > ttl


class DataCache:
    """线程安全的LRU数据缓存（优化版）"""
    
    def __init__(self, max_size: int = 100, default_ttl: int = 300):
        self._cache: OrderedDict = OrderedDict()
        self._max_size = max_size
        self._default_ttl = default_ttl
        self._lock = RLock()
        self._version = 1
        self._stats = {
            'hits': 0,
            'misses': 0,
            'evictions': 0,
            'incremental_updates': 0
        }
    
    def get(self, key: str, ttl: int = None) -> Optional[Any]:
        """获取缓存数据"""
        if ttl is None:
            ttl = self._default_ttl
            
        with self._lock:
            if key in self._cache:
                entry = self._cache[key]
                if not entry.is_expired(ttl):
                    # 移动到末尾（最近使用）
                    self._cache.move_to_end(key)
                    self._stats['hits'] += 1
                    return entry.value
                else:
                    # 过期，删除
                    del self._cache[key]
                    self._stats['misses'] += 1
                    return None
            self._stats['misses'] += 1
            return None
    
    def get_with_signature(self, key: str, ttl: int = None) -> Tuple[Optional[Any], Optional[str]]:
        """
        获取缓存数据和签名
        
        返回:
            Tuple[Optional[Any], Optional[str]]: (缓存值, 数据签名)
        """
        if ttl is None:
            ttl = self._default_ttl
            
        with self._lock:
            if key in self._cache:
                entry = self._cache[key]
                if not entry.is_expired(ttl):
                    self._cache.move_to_end(key)
                    self._stats['hits'] += 1
                    return entry.value, entry.data_signature
                else:
                    del self._cache[key]
                    self._stats['misses'] += 1
                    return None, None
            self._stats['misses'] += 1
            return None, None
    
    def get_or_set(self, key: str, factory: Callable, ttl: int = None) -> Any:
        """获取缓存，如果不存在则通过factory创建"""
        value = self.get(key, ttl)
        if value is None:
            value = factory()
            self.set(key, value, ttl)
        return value
    
    def set(self, key: str, value: Any, ttl: int = None, data_signature: str = "") -> None:
        """设置缓存数据"""
        if ttl is None:
            ttl = self._default_ttl
            
        with self._lock:
            if key in self._cache:
                self._cache.move_to_end(key)
            
            # 估算大小（简单估算）
            size = 0
            if isinstance(value, (dict, list)):
                try:
                    import sys
                    size = sys.getsizeof(value)
                except:
                    size = 1
            
            self._cache[key] = CacheEntry(value, time.time(), self._version, size, data_signature)
            
            # LRU 淘汰
            while len(self._cache) > self._max_size:
                self._cache.popitem(last=False)
                self._stats['evictions'] += 1
    
    def update_if_changed(self, key: str, new_value: Any, new_signature: str, ttl: int = None) -> bool:
        """
        如果签名变化则更新缓存
        
        参数:
            key: 缓存键
            new_value: 新值
            new_signature: 新签名
            ttl: 过期时间
            
        返回:
            bool: 是否更新了缓存
        """
        with self._lock:
            if key in self._cache:
                entry = self._cache[key]
                if entry.data_signature == new_signature:
                    # 签名相同，数据未变
                    return False
            
            # 签名不同或不存在，更新缓存
            self.set(key, new_value, ttl, new_signature)
            self._stats['incremental_updates'] += 1
            return True
    
    def invalidate(self, key: str = None) -> None:
        """使缓存失效"""
        with self._lock:
            if key:
                self._cache.pop(key, None)
            else:
                self._cache.clear()
                self._version += 1
    
    def get_stats(self) -> Dict[str, int]:
        """获取缓存统计信息"""
        with self._lock:
            return {
                'size': len(self._cache),
                'max_size': self._max_size,
                **self._stats
            }
    
    def get_version(self) -> int:
        return self._version


class DataVersionManager:
    """数据版本管理器（优化版）"""
    
    def __init__(self):
        self._file_hashes: Dict[str, str] = {}
        self._dir_hashes: Dict[str, str] = {}
        self._lock = Lock()
        self._watch_tasks: Dict[str, Callable] = {}
        self._last_check_time: Dict[str, float] = {}
        self._check_interval = 5  # 检查间隔（秒）
    
    @staticmethod
    def _compute_file_hash(file_path: str) -> str:
        """计算单个文件的哈希值（使用文件大小和修改时间）"""
        try:
            path = Path(file_path)
            if not path.exists():
                return ""
            stat = path.stat()
            # 使用大小 + 修改时间 + inode 作为哈希基础
            content = f"{stat.st_size}_{stat.st_mtime}_{stat.st_ino}"
            return hashlib.md5(content.encode()).hexdigest()[:12]
        except Exception:
            return ""
    
    @staticmethod
    def _compute_dir_hash(dir_path: str, pattern: str = "*.txt") -> str:
        """计算目录的哈希值"""
        try:
            path = Path(dir_path)
            if not path.exists():
                return ""
            
            hashes = []
            for file in sorted(path.glob(pattern)):
                if file.is_file():
                    hashes.append(DataVersionManager._compute_file_hash(str(file)))
            
            # 同时考虑文件数量
            hashes.append(str(len(hashes)))
            combined = "|".join(hashes)
            return hashlib.md5(combined.encode()).hexdigest()[:12]
        except Exception:
            return ""
    
    def check_changes(self, config: Dict[str, Any]) -> bool:
        """检查数据是否有变化（优化版）"""
        with self._lock:
            current_hashes = {}
            
            # 检查 JSON 文件
            if "json_path" in config and config["json_path"]:
                json_key = "json"
                current_hashes[json_key] = self._compute_file_hash(config["json_path"])
                
                # 检查是否在冷却期内
                last_check = self._last_check_time.get(json_key, 0)
                if time.time() - last_check < self._check_interval:
                    return False
                self._last_check_time[json_key] = time.time()
            
            # 检查原始数据目录
            if "original_path" in config and config["original_path"]:
                orig_key = "original"
                current_hashes[orig_key] = self._compute_dir_hash(config["original_path"], "*.txt")
                
                last_check = self._last_check_time.get(orig_key, 0)
                if time.time() - last_check < self._check_interval:
                    return False
                self._last_check_time[orig_key] = time.time()
            
            # 检查 CSV 文件
            for csv_type in ["mem", "cpu"]:
                if csv_type in config and config[csv_type]:
                    csv_key = f"csv_{csv_type}"
                    current_hashes[csv_key] = self._compute_file_hash(config[csv_type])
            
            # 检查是否有变化
            has_changed = current_hashes != self._file_hashes
            
            if has_changed:
                log("检测到数据变化，更新版本")
                self._file_hashes = current_hashes
            
            return has_changed
    
    def get_data_signature(self, config: Dict[str, Any]) -> str:
        """获取数据签名"""
        with self._lock:
            hashes = []
            
            if "json_path" in config and config["json_path"]:
                hashes.append(self._compute_file_hash(config["json_path"]))
            
            if "original_path" in config and config["original_path"]:
                hashes.append(self._compute_dir_hash(config["original_path"], "*.txt"))
            
            # 添加时间戳使签名唯一
            combined = "|".join(hashes) + f"_{int(time.time() / 60)}"
            return hashlib.md5(combined.encode()).hexdigest()[:16]
    
    def watch_file(self, file_path: str, callback: Callable) -> None:
        """监控文件变化"""
        self._watch_tasks[file_path] = callback
    
    def check_watched(self) -> None:
        """检查监控的文件是否有变化"""
        for file_path, callback in self._watch_tasks.items():
            current_hash = self._compute_file_hash(file_path)
            if current_hash != self._file_hashes.get(file_path):
                self._file_hashes[file_path] = current_hash
                try:
                    callback()
                except Exception as e:
                    log(f"文件监控回调执行失败: {e}", "ERROR")


class AsyncDataLoader:
    """异步数据加载器"""
    
    def __init__(self, max_workers: int = 4):
        self._tasks: Dict[str, threading.Thread] = {}
        self._results: Dict[str, Any] = {}
        self._locks: Dict[str, Lock] = {}
        self._max_workers = max_workers
        self._task_lock = Lock()
    
    def load_async(self, key: str, loader: Callable, callback: Callable = None) -> bool:
        """
        异步加载数据
        
        参数:
            key: 任务唯一标识
            loader: 加载函数
            callback: 完成后的回调函数
        
        返回:
            bool: 是否启动了新任务
        """
        with self._task_lock:
            if key in self._tasks and self._tasks[key].is_alive():
                return False
            
            def task():
                try:
                    result = loader()
                    with self._task_lock:
                        self._results[key] = result
                    if callback:
                        callback(result)
                except Exception as e:
                    log(f"异步加载失败 {key}: {e}", "ERROR")
                finally:
                    with self._task_lock:
                        if key in self._tasks:
                            del self._tasks[key]
                        if key in self._locks:
                            del self._locks[key]
            
            thread = threading.Thread(target=task, daemon=True)
            self._tasks[key] = thread
            self._locks[key] = Lock()
            thread.start()
            return True
    
    def get_result(self, key: str, wait: bool = False, timeout: float = 30) -> Optional[Any]:
        """获取异步加载结果"""
        with self._task_lock:
            if key in self._results:
                return self._results[key]
            
            if wait and key in self._tasks:
                thread = self._tasks[key]
                thread.join(timeout=timeout)
                return self._results.get(key)
            
            return None
    
    def is_loading(self, key: str) -> bool:
        """检查是否正在加载"""
        with self._task_lock:
            return key in self._tasks and self._tasks[key].is_alive()
    
    def cancel(self, key: str) -> bool:
        """取消加载任务"""
        with self._task_lock:
            if key in self._tasks:
                # Python 线程无法强制取消，只能标记
                self._tasks[key].daemon = True
                del self._tasks[key]
                return True
            return False


# 全局实例
data_cache = DataCache(max_size=50, default_ttl=300)
version_manager = DataVersionManager()
async_loader = AsyncDataLoader(max_workers=3)