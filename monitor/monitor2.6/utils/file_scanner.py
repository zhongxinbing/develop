"""
文件系统扫描器 - 提供可靠的文件扫描和元数据读取能力
"""
import os
import re
from pathlib import Path
from typing import List, Dict, Optional, Set
from datetime import datetime
import hashlib

from utils.log import get_logger

logger = get_logger(__name__)


class FileInfo:
    """文件信息数据类"""
    def __init__(self, path: str, name: str, mtime: float, size: int, is_dir: bool = False):
        self.path = path
        self.name = name
        self.mtime = mtime
        self.size = size
        self.is_dir = is_dir
        self._hash = None

    def to_dict(self) -> Dict:
        return {
            'path': self.path,
            'name': self.name,
            'mtime': self.mtime,
            'size': self.size,
            'is_dir': self.is_dir
        }

    @property
    def hash(self) -> str:
        """计算文件内容的哈希值（用于更精确的变更检测）"""
        if self._hash is None:
            try:
                with open(self.path, 'rb') as f:
                    self._hash = hashlib.md5(f.read()).hexdigest()
            except Exception:
                self._hash = ''
        return self._hash

    def __eq__(self, other) -> bool:
        if not isinstance(other, FileInfo):
            return False
        return self.path == other.path and self.mtime == other.mtime and self.size == other.size

    def __repr__(self):
        return f"FileInfo(path={self.path}, mtime={self.mtime})"


class FileSystemScanner:
    """
    文件系统扫描器
    
    支持:
    - 可配置的扫描深度
    - 正则表达式文件名匹配
    - 排除规则
    - 扫描结果缓存
    - 增量扫描（只返回变更的文件）
    """
    
    def __init__(
        self, 
        root_path: str, 
        max_depth: int = 3,
        include_patterns: Optional[List[str]] = None,
        exclude_patterns: Optional[List[str]] = None,
        include_dirs: bool = False,
        use_cache: bool = True,
        cache_ttl: int = 60  # 缓存有效期（秒）
    ):
        """
        初始化扫描器
        
        Args:
            root_path: 根目录路径
            max_depth: 最大扫描深度
            include_patterns: 包含的文件名正则表达式列表
            exclude_patterns: 排除的文件名正则表达式列表
            include_dirs: 是否包含目录
            use_cache: 是否使用缓存
            cache_ttl: 缓存有效期（秒）
        """
        self.root_path = Path(root_path).resolve()
        self.max_depth = max_depth
        self.include_patterns = [re.compile(p) for p in (include_patterns or [])]
        self.exclude_patterns = [re.compile(p) for p in (exclude_patterns or [])]
        self.include_dirs = include_dirs
        self.use_cache = use_cache
        self.cache_ttl = cache_ttl
        
        self._cache = None
        self._cache_time = 0
        
        logger.info(f"文件扫描器初始化: root={self.root_path}, max_depth={self.max_depth}")

    def scan(self, force_refresh: bool = False) -> List[FileInfo]:
        """
        扫描文件系统
        
        Args:
            force_refresh: 是否强制刷新缓存
            
        Returns:
            文件信息列表
        """

        if self.use_cache and not force_refresh and self._cache is not None:
            if (datetime.now().timestamp() - self._cache_time) < self.cache_ttl:
                logger.debug(f"使用缓存扫描结果: {len(self._cache)} 个文件")
                return self._cache

        logger.info(f"开始扫描目录: {self.root_path}")
        results = []
        self._walk(self.root_path, 0, results)
        
        if self.use_cache:
            self._cache = results
            self._cache_time = datetime.now().timestamp()
        
        logger.info(f"扫描完成: 找到 {len(results)} 个文件")
        return results

    def scan_incremental(self, previous_state: Dict[str, Dict]) -> tuple:
        """
        增量扫描，返回新增和修改的文件
        
        Args:
            previous_state: 之前的状态字典 {path: {'mtime': float, 'size': int}}
            
        Returns:
            (added_or_modified: List[FileInfo], removed: List[str])
        """
        current = self.scan()
        current_map = {f.path: f for f in current}
        previous_paths = set(previous_state.keys())
        current_paths = set(current_map.keys())

        # 新增或修改的文件
        changed = []
        for path in current_paths:
            if path not in previous_state:
                changed.append(current_map[path])
            else:
                old_info = previous_state[path]
                new_info = current_map[path]
                if old_info.get('mtime') != new_info.mtime or old_info.get('size') != new_info.size:
                    changed.append(new_info)

        # 已删除的文件
        removed = list(previous_paths - current_paths)

        logger.info(f"增量扫描: 新增/修改 {len(changed)} 个, 删除 {len(removed)} 个")
        return changed, removed

    def _walk(self, current_path: Path, depth: int, results: List[FileInfo]):
        """递归遍历目录"""

        if self.max_depth is not None and depth > self.max_depth:
            return
        
        try:
            # 应用排除规则
            if any(p.search(current_path.name) for p in self.exclude_patterns):
                return

            if current_path.is_dir():
                if self.include_dirs:
                    results.append(FileInfo(
                        str(current_path),
                        current_path.name,
                        current_path.stat().st_mtime,
                        0,
                        is_dir=True
                    ))
                
                # 递归遍历子目录
                for item in current_path.iterdir():
                    self._walk(item, depth + 1, results)

            elif current_path.is_file():
                # 应用包含规则
                if not self.include_patterns or any(p.search(current_path.name) for p in self.include_patterns):
                    stat = current_path.stat()
                    results.append(FileInfo(
                        str(current_path),
                        current_path.name,
                        stat.st_mtime,
                        stat.st_size
                    ))

        except PermissionError:
            logger.warning(f"权限不足，跳过: {current_path}")
        except Exception as e:
            logger.error(f"扫描出错 {current_path}: {e}")

    def get_file_info(self, file_path: str) -> Optional[FileInfo]:
        """获取单个文件的信息"""
        path = Path(file_path)
        if not path.exists():
            return None
        try:
            stat = path.stat()
            return FileInfo(
                str(path),
                path.name,
                stat.st_mtime,
                stat.st_size,
                path.is_dir()
            )
        except Exception:
            return None

    def get_directory_size(self) -> int:
        """计算目录总大小"""
        total = 0
        for f in self.scan():
            total += f.size
        return total


# 便捷函数
def scan_directory(
    root_path: str,
    max_depth: int = 3,
    pattern: str = None,
    exclude: str = None
) -> List[FileInfo]:
    """
    快速扫描目录的便捷函数
    
    Args:
        root_path: 根目录
        max_depth: 最大深度
        pattern: 文件名正则表达式
        exclude: 排除文件名正则表达式
        
    Returns:
        文件信息列表
    """
    scanner = FileSystemScanner(
        root_path,
        max_depth=max_depth,
        include_patterns=[pattern] if pattern else None,
        exclude_patterns=[exclude] if exclude else None
    )
    return scanner.scan()