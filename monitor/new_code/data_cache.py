"""
==================================================
数据缓存模块 - LRU缓存 + 数据版本管理
提供线程安全的LRU缓存和数据变化检测功能
==================================================
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
    """
    线程安全的LRU数据缓存类
    使用OrderedDict实现最近最少使用(LRU)淘汰策略
    """
    
    def __init__(self, max_size: int = 100):
        """
        初始化缓存
        
        参数:
            max_size: int - 最大缓存条目数，默认100
        """
        self._cache: OrderedDict = OrderedDict()  # 有序字典存储缓存数据
        self._max_size = max_size                  # 最大缓存容量
        self._lock = Lock()                        # 线程锁，保证线程安全
        self._version = 1                          # 缓存版本号
    
    def get(self, key: str) -> Optional[Any]:
        """
        获取缓存数据
        命中后将条目移动到末尾（表示最近使用）
        
        参数:
            key: str - 缓存键
        
        返回:
            Any: 缓存的值，不存在则返回None
        """
        with self._lock:
            if key in self._cache:
                self._cache.move_to_end(key)   # 移动到末尾，表示最近使用
                return self._cache[key]
            return None
    
    def set(self, key: str, value: Any) -> None:
        """
        设置缓存数据
        如果缓存已满，淘汰最久未使用的条目
        
        参数:
            key: str - 缓存键
            value: Any - 缓存值
        """
        with self._lock:
            if key in self._cache:
                self._cache.move_to_end(key)   # 更新已有条目
            self._cache[key] = value
            
            # 超出容量时淘汰最久未使用的（第一个条目）
            if len(self._cache) > self._max_size:
                self._cache.popitem(last=False)
    
    def invalidate(self, key: str = None) -> None:
        """
        使缓存失效
        
        参数:
            key: str - 可选，指定键则只清除该条目，否则清空全部
        """
        with self._lock:
            if key:
                self._cache.pop(key, None)     # 清除指定键
            else:
                self._cache.clear()            # 清空全部
                self._version += 1             # 版本号递增
    
    def get_version(self) -> int:
        """获取缓存版本号"""
        return self._version


class DataVersionManager:
    """
    数据版本管理器
    用于检测数据变化，通过计算文件哈希值判断是否需要更新
    """
    
    def __init__(self):
        self._file_hashes: Dict[str, str] = {}  # 存储文件哈希值
        self._lock = Lock()                     # 线程锁
    
    def _compute_file_hash(self, file_path: str) -> str:
        """
        计算单个文件的哈希值
        使用文件大小和修改时间作为快速哈希，避免读取大文件内容
        
        参数:
            file_path: str - 文件路径
        
        返回:
            str: 8位MD5哈希值
        """
        try:
            path = Path(file_path)
            if not path.exists():
                return ""                      # 文件不存在
            
            # 使用文件大小和修改时间作为快速哈希
            stat = path.stat()
            content = f"{stat.st_size}_{stat.st_mtime}"
            return hashlib.md5(content.encode()).hexdigest()[:8]
        except Exception:
            return ""
    
    def _compute_dir_hash(self, dir_path: str, pattern: str = "*.json") -> str:
        """
        计算目录的哈希值
        遍历目录下所有匹配模式的文件，组合计算哈希
        
        参数:
            dir_path: str - 目录路径
            pattern: str - 文件匹配模式，默认 "*.json"
        
        返回:
            str: 8位MD5哈希值
        """
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
        """
        检查数据是否有变化
        比较当前文件哈希值与之前保存的哈希值
        
        参数:
            config: dict - 配置字典，包含文件路径信息
        
        返回:
            bool: True表示有变化，False表示无变化
        """
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
        """
        获取数据签名
        用于前端检测数据是否有更新
        
        参数:
            config: dict - 配置字典
        
        返回:
            str: 16位数据签名
        """
        with self._lock:
            hashes = []
            
            if "json_path" in config:
                hashes.append(self._compute_file_hash(config["json_path"]))
            
            if "original_path" in config:
                hashes.append(self._compute_dir_hash(config["original_path"], "*.txt"))
            
            combined = "|".join(hashes)
            return hashlib.md5(combined.encode()).hexdigest()[:16]


# 全局缓存实例
data_cache = DataCache(max_size=50)       # 数据缓存实例
version_manager = DataVersionManager()    # 版本管理器实例