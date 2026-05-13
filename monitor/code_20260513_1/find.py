import os
import fnmatch
from pathlib import Path
from typing import List, Union, Optional, Iterator
from functools import lru_cache
import re


class FastFileFinder:
    """高性能文件查找器，支持通配符和层次控制"""
    
    def __init__(self, root_dir: str):
        """
        初始化查找器
        
        Args:
            root_dir: 根目录路径
        """
        self.root_dir = os.path.abspath(root_dir)
        
    def find_files(
        self,
        path_patterns: List[str],
        target_pattern: str,
        max_depth: Optional[int] = None
    ) -> List[str]:
        """
        查找符合条件的文件
        
        Args:
            path_patterns: 路径模式列表，例如 ['logs', 'data_*', 'temp'] 
                         表示从根目录开始每层的文件夹模式
            target_pattern: 目标文件名的模式，支持通配符
            max_depth: 最大搜索深度，None表示搜索所有子目录
            
        Returns:
            匹配的文件路径列表
        """
        # 确保 max_depth 是整数类型
        if max_depth is not None:
            try:
                max_depth = int(max_depth)
            except (TypeError, ValueError):
                max_depth = None
        
        if not path_patterns:
            # 如果没有指定路径模式，搜索整个目录树
            return self._search_all_depths(self.root_dir, target_pattern, max_depth)
        else:
            # 按指定的层次结构搜索
            return self._search_with_patterns(path_patterns, target_pattern, max_depth)
    
    def _search_with_patterns(
        self,
        path_patterns: List[str],
        target_pattern: str,
        max_depth: Optional[int]
    ) -> List[str]:
        """按照指定的路径模式搜索"""
        results = []
        
        # 预处理路径模式，将通配符转换为正则表达式
        pattern_regexes = [
            self._pattern_to_regex(pattern) for pattern in path_patterns
        ]
        target_regex = self._pattern_to_regex(target_pattern)
        
        # 计算需要搜索的最大深度
        specified_depth = len(path_patterns)
        # 确保 max_depth 是整数或无穷大
        actual_max_depth = max_depth if max_depth is not None else float('inf')
        
        # 计算实际搜索深度：至少搜索到指定层级，但不超过 max_depth
        if isinstance(actual_max_depth, (int, float)):
            search_depth = min(specified_depth + 1, actual_max_depth)
        else:
            search_depth = specified_depth + 1
        
        # 使用栈进行深度优先搜索
        stack = [(self.root_dir, 0, [])]  # (当前路径, 当前深度, 已匹配的路径段)
        
        while stack:
            current_path, depth, matched_segments = stack.pop()
            
            # 如果当前深度超过搜索深度，跳过
            if depth > search_depth:
                continue
                
            try:
                # 获取当前目录内容
                with os.scandir(current_path) as entries:
                    for entry in entries:
                        if depth < specified_depth:
                            # 还在匹配路径阶段
                            if entry.is_dir(follow_symlinks=False):
                                # 检查是否匹配当前层的模式
                                if self._match_pattern(
                                    entry.name, pattern_regexes[depth]
                                ):
                                    new_matched = matched_segments + [entry.name]
                                    stack.append(
                                        (entry.path, depth + 1, new_matched)
                                    )
                        elif depth == specified_depth:
                            # 到达目标文件所在层级
                            if entry.is_file(follow_symlinks=False):
                                if self._match_pattern(entry.name, target_regex):
                                    # 构建完整路径
                                    full_path = os.path.join(
                                        current_path, entry.name
                                    )
                                    results.append(full_path)
                        else:
                            # 如果允许搜索更深层次
                            if depth < actual_max_depth and entry.is_dir(
                                follow_symlinks=False
                            ):
                                stack.append(
                                    (entry.path, depth + 1, matched_segments)
                                )
                                
            except (PermissionError, OSError):
                # 跳过无法访问的目录
                continue
                
        return results
    
    def _search_all_depths(
        self,
        start_path: str,
        target_pattern: str,
        max_depth: Optional[int]
    ) -> List[str]:
        """搜索所有深度的文件"""
        results = []
        target_regex = self._pattern_to_regex(target_pattern)
        
        # 确保 max_depth 是整数
        if max_depth is not None:
            max_depth = int(max_depth)
        
        # 使用栈进行深度优先搜索
        stack = [(start_path, 0)]
        
        while stack:
            current_path, depth = stack.pop()
            
            # 检查深度限制
            if max_depth is not None and depth > max_depth:
                continue
                
            try:
                with os.scandir(current_path) as entries:
                    for entry in entries:
                        if entry.is_file(follow_symlinks=False):
                            if self._match_pattern(entry.name, target_regex):
                                results.append(entry.path)
                        elif entry.is_dir(follow_symlinks=False):
                            if max_depth is None or depth + 1 <= max_depth:
                                stack.append((entry.path, depth + 1))
            except (PermissionError, OSError):
                continue
                
        return results
    
    def find_files_iter(
        self,
        path_patterns: List[str],
        target_pattern: str,
        max_depth: Optional[int] = None
    ) -> Iterator[str]:
        """
        生成器版本，内存效率更高
        
        Args:
            path_patterns: 路径模式列表
            target_pattern: 目标文件名的模式
            max_depth: 最大搜索深度
            
        Yields:
            匹配的文件路径
        """
        # 确保 max_depth 是整数
        if max_depth is not None:
            max_depth = int(max_depth)
            
        if not path_patterns:
            yield from self._search_all_depths_iter(
                self.root_dir, target_pattern, max_depth
            )
        else:
            yield from self._search_with_patterns_iter(
                path_patterns, target_pattern, max_depth
            )
    
    def _search_with_patterns_iter(
        self,
        path_patterns: List[str],
        target_pattern: str,
        max_depth: Optional[int]
    ) -> Iterator[str]:
        """生成器版本：按照指定的路径模式搜索"""
        pattern_regexes = [
            self._pattern_to_regex(pattern) for pattern in path_patterns
        ]
        target_regex = self._pattern_to_regex(target_pattern)
        
        specified_depth = len(path_patterns)
        actual_max_depth = max_depth if max_depth is not None else float('inf')
        
        # 确保类型正确
        if isinstance(actual_max_depth, (int, float)):
            search_depth = min(specified_depth + 1, actual_max_depth)
        else:
            search_depth = specified_depth + 1
        
        stack = [(self.root_dir, 0, [])]
        
        while stack:
            current_path, depth, matched_segments = stack.pop()
            
            if depth > search_depth:
                continue
                
            try:
                with os.scandir(current_path) as entries:
                    for entry in entries:
                        if depth < specified_depth:
                            if entry.is_dir(follow_symlinks=False):
                                if self._match_pattern(
                                    entry.name, pattern_regexes[depth]
                                ):
                                    new_matched = matched_segments + [entry.name]
                                    stack.append(
                                        (entry.path, depth + 1, new_matched)
                                    )
                        elif depth == specified_depth:
                            if entry.is_file(follow_symlinks=False):
                                if self._match_pattern(entry.name, target_regex):
                                    yield os.path.join(current_path, entry.name)
                        else:
                            if depth < actual_max_depth and entry.is_dir(
                                follow_symlinks=False
                            ):
                                stack.append(
                                    (entry.path, depth + 1, matched_segments)
                                )
            except (PermissionError, OSError):
                continue
    
    def _search_all_depths_iter(
        self,
        start_path: str,
        target_pattern: str,
        max_depth: Optional[int]
    ) -> Iterator[str]:
        """生成器版本：搜索所有深度的文件"""
        target_regex = self._pattern_to_regex(target_pattern)
        
        if max_depth is not None:
            max_depth = int(max_depth)
            
        stack = [(start_path, 0)]
        
        while stack:
            current_path, depth = stack.pop()
            
            if max_depth is not None and depth > max_depth:
                continue
                
            try:
                with os.scandir(current_path) as entries:
                    for entry in entries:
                        if entry.is_file(follow_symlinks=False):
                            if self._match_pattern(entry.name, target_regex):
                                yield entry.path
                        elif entry.is_dir(follow_symlinks=False):
                            if max_depth is None or depth + 1 <= max_depth:
                                stack.append((entry.path, depth + 1))
            except (PermissionError, OSError):
                continue
    
    @staticmethod
    @lru_cache(maxsize=1024)
    def _pattern_to_regex(pattern: str) -> re.Pattern:
        """将通配符模式转换为正则表达式（带缓存）"""
        # 转义正则表达式特殊字符，但保留 * 和 ?
        regex_pattern = re.escape(pattern)
        regex_pattern = regex_pattern.replace(r'\*', '.*')
        regex_pattern = regex_pattern.replace(r'\?', '.')
        regex_pattern = f'^{regex_pattern}$'
        return re.compile(regex_pattern, re.IGNORECASE)
    
    @staticmethod
    def _match_pattern(name: str, pattern_regex: re.Pattern) -> bool:
        """检查名称是否匹配正则表达式模式"""
        return bool(pattern_regex.match(name))


# 便捷函数
def find_files(
    root_dir: str,
    path_patterns: List[str],
    target_pattern: str,
    max_depth: Optional[int] = None
) -> List[str]:
    """
    便捷函数：查找符合条件的文件
    
    Args:
        root_dir: 根目录路径
        path_patterns: 路径模式列表，例如 ['logs', '2024*', 'data'] 
        target_pattern: 目标文件名的模式，支持通配符 * 和 ?
        max_depth: 最大搜索深度，None表示搜索所有子目录
        
    Returns:
        匹配的文件路径列表
    
    Examples:
        >>> # 查找 logs/2024-01/*.txt 文件
        >>> files = find_files('/var', ['logs', '2024-01'], '*.txt')
        
        >>> # 查找所有目录下的 .log 文件，深度不超过3
        >>> files = find_files('/var', [], '*.log', max_depth=3)
        
        >>> # 查找 data_*/temp/*.json 文件，不限深度
        >>> files = find_files('/app', ['data_*', 'temp'], '*.json')
    """

    finder = FastFileFinder(root_dir)
    return finder.find_files(path_patterns, target_pattern, max_depth)


def find_files_gen(
    root_dir: str,
    path_patterns: List[str],
    target_pattern: str,
    max_depth: Optional[int] = None
):
    """
    生成器版本，适合大量文件查找
    
    Examples:
        >>> for file in find_files_gen('/var', ['logs'], '*.log'):
        ...     print(file)
    """

    finder = FastFileFinder(root_dir)
    yield from finder.find_files_iter(path_patterns, target_pattern, max_depth)

