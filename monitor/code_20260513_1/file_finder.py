import os
import re
from pathlib import Path
from typing import List, Optional, Iterator
from functools import lru_cache

class FastFileFinder:
    """高性能文件查找器 - 优化版"""
    
    def __init__(self, root_dir: str):
        self.root_dir = os.path.abspath(root_dir)
    
    def find_files(
        self,
        path_patterns: List[str],
        target_pattern: str,
        max_depth: Optional[int] = None
    ) -> List[str]:
        """查找符合条件的文件"""
        results = []
        
        if max_depth is not None:
            max_depth = int(max_depth)
        
        if not path_patterns:
            self._search_all_depths(self.root_dir, target_pattern, max_depth, results)
        else:
            self._search_with_patterns(path_patterns, target_pattern, max_depth, results)
        
        return results
    
    def _search_with_patterns(
        self,
        path_patterns: List[str],
        target_pattern: str,
        max_depth: Optional[int],
        results: List[str]
    ):
        """按路径模式搜索"""
        pattern_regexes = [self._pattern_to_regex(p) for p in path_patterns]
        target_regex = self._pattern_to_regex(target_pattern)
        
        specified_depth = len(path_patterns)
        actual_max_depth = max_depth if max_depth is not None else float('inf')
        search_depth = min(specified_depth + 1, actual_max_depth)
        
        stack = [(self.root_dir, 0)]
        
        while stack:
            current_path, depth = stack.pop()
            
            if depth > search_depth:
                continue
            
            try:
                with os.scandir(current_path) as entries:
                    for entry in entries:
                        if depth < specified_depth:
                            if entry.is_dir() and self._match_pattern(entry.name, pattern_regexes[depth]):
                                stack.append((entry.path, depth + 1))
                        elif depth == specified_depth:
                            if entry.is_file() and self._match_pattern(entry.name, target_regex):
                                results.append(entry.path)
                        else:
                            if depth < actual_max_depth and entry.is_dir():
                                stack.append((entry.path, depth + 1))
            except (PermissionError, OSError):
                continue
    
    def _search_all_depths(
        self,
        start_path: str,
        target_pattern: str,
        max_depth: Optional[int],
        results: List[str]
    ):
        """搜索所有深度"""
        target_regex = self._pattern_to_regex(target_pattern)
        stack = [(start_path, 0)]
        
        while stack:
            current_path, depth = stack.pop()
            
            if max_depth is not None and depth > max_depth:
                continue
            
            try:
                with os.scandir(current_path) as entries:
                    for entry in entries:
                        if entry.is_file() and self._match_pattern(entry.name, target_regex):
                            results.append(entry.path)
                        elif entry.is_dir():
                            if max_depth is None or depth + 1 <= max_depth:
                                stack.append((entry.path, depth + 1))
            except (PermissionError, OSError):
                continue
    
    @staticmethod
    @lru_cache(maxsize=1024)
    def _pattern_to_regex(pattern: str):
        """通配符转正则表达式"""
        regex_pattern = re.escape(pattern)
        regex_pattern = regex_pattern.replace(r'\*', '.*')
        regex_pattern = regex_pattern.replace(r'\?', '.')
        regex_pattern = f'^{regex_pattern}$'
        return re.compile(regex_pattern, re.IGNORECASE)
    
    @staticmethod
    def _match_pattern(name: str, pattern_regex) -> bool:
        return bool(pattern_regex.match(name))


def find_files(root_dir: str, path_patterns: List[str], target_pattern: str, max_depth: Optional[int] = None) -> List[str]:
    """便捷函数"""
    finder = FastFileFinder(root_dir)
    return finder.find_files(path_patterns, target_pattern, max_depth)