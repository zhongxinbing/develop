"""
模拟Linux find命令
"""
import os
import re
from pathlib import Path
from typing import List, Optional


class FindCommand:
    """模拟Linux find命令"""
    
    def __init__(self, start_path: str = '.'):
        self.start_path = os.path.abspath(start_path)
    
    def find(self, maxdepth: Optional[int] = None, name_pattern: Optional[str] = None,
             file_type: Optional[str] = None, debug: bool = False) -> List[str]:
        """执行查找操作"""
        results = []
        self._walk(self.start_path, 0, maxdepth, name_pattern, file_type, results, debug)
        
        if debug:
            print(f"找到 {len(results)} 个匹配项")
        
        return results
    
    def _walk(self, current_path: str, current_depth: int, maxdepth: Optional[int],
              name_pattern: Optional[str], file_type: Optional[str],
              results: List[str], debug: bool = False) -> None:
        """递归遍历目录"""
        if maxdepth is not None and current_depth > maxdepth:
            return
        
        base_name = os.path.basename(current_path)
        is_dir = os.path.isdir(current_path)
        is_file = os.path.isfile(current_path)
        
        # 检查文件类型
        type_match = True
        if file_type == 'f':
            type_match = is_file
        elif file_type == 'd':
            type_match = is_dir
        
        # 检查文件名模式
        name_match = True
        if name_pattern is not None and (is_file or file_type is None):
            try:
                name_match = re.search(name_pattern, base_name) is not None
            except re.error:
                name_match = name_pattern in base_name
        
        if type_match and name_match:
            results.append(current_path)
        
        # 如果是目录，继续递归
        if is_dir and (maxdepth is None or current_depth < maxdepth):
            try:
                for item in os.listdir(current_path):
                    item_path = os.path.join(current_path, item)
                    if os.path.islink(item_path):
                        continue
                    self._walk(item_path, current_depth + 1, maxdepth,
                              name_pattern, file_type, results, debug)
            except PermissionError:
                pass


def find(start_path: str = '.', maxdepth: Optional[int] = None,
        name_pattern: Optional[str] = None, file_type: Optional[str] = None,
        debug: bool = False) -> List[str]:
    """简洁的find函数接口"""
    finder = FindCommand(start_path)
    return sorted(finder.find(maxdepth, name_pattern, file_type, debug))