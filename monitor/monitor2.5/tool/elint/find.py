import os
import re
import sys
from pathlib import Path

class FindCommand:
    """模拟Linux find命令"""
    
    def __init__(self, start_path='.'):
        """
        初始化find命令
        
        Args:
            start_path: 起始搜索路径，默认为当前目录
        """
        self.start_path = os.path.abspath(start_path)
    
    def find(self, maxdepth=None, name_pattern=None, file_type=None, debug=False):
        """
        执行查找操作
        
        Args:
            maxdepth: 最大深度，None表示无限制
            name_pattern: 文件名模式，支持正则表达式
            file_type: 文件类型，'f'表示文件，'d'表示目录，None表示两者都包括
            debug: 是否打印调试信息
        
        Returns:
            list: 匹配的文件/目录路径列表
        """
        results = []
        
        if debug:
            print(f"搜索路径: {self.start_path}")
            print(f"最大深度: {maxdepth}")
            print(f"名称模式: {name_pattern}")
            print(f"文件类型: {file_type}")
            print("=" * 50)
        
        # 递归遍历目录
        self._walk(self.start_path, 0, maxdepth, name_pattern, file_type, results, debug)
        
        if debug:
            print(f"找到 {len(results)} 个匹配项")
        
        return results
    
    def _walk(self, current_path, current_depth, maxdepth, name_pattern, file_type, results, debug=False):
        """递归遍历目录"""
        
        # 检查深度限制
        if maxdepth is not None and current_depth > maxdepth:
            return
        
        # 获取当前路径的基本名称和类型
        base_name = os.path.basename(current_path)
        is_dir = os.path.isdir(current_path)
        is_file = os.path.isfile(current_path)
        
        # 调试：打印当前正在检查的路径
        if debug and current_depth <= (maxdepth if maxdepth else 999):
            indent = "  " * current_depth
            print(f"{indent}检查: {base_name} (深度={current_depth}, is_dir={is_dir}, is_file={is_file})")
        
        # 检查文件类型
        type_match = True
        if file_type == 'f':
            type_match = is_file
        elif file_type == 'd':
            type_match = is_dir
        
        # 检查文件名模式（如果提供了）
        name_match = True
        if name_pattern is not None and (is_file or (file_type is None)):
            try:
                # 使用正则表达式匹配文件名
                name_match = re.search(name_pattern, base_name) is not None
                if debug and not name_match and current_depth <= (maxdepth if maxdepth else 999):
                    print(f"{indent}  名称不匹配: '{base_name}' 不匹配模式 '{name_pattern}'")
            except re.error as e:
                # 如果不是有效的正则表达式，使用普通字符串匹配
                if debug:
                    print(f"{indent}  正则表达式错误: {e}, 使用字符串匹配")
                name_match = name_pattern in base_name
        
        # 如果类型和名称都匹配，添加到结果
        if type_match and name_match:
            if debug:
                print(f"{indent}  ✓ 匹配成功: {current_path}")
            results.append(current_path)
        
        # 如果是目录，继续递归遍历
        if is_dir and (maxdepth is None or current_depth < maxdepth):
            try:
                # 遍历目录内容
                for item in os.listdir(current_path):
                    item_path = os.path.join(current_path, item)
                    # 避免递归符号链接循环
                    if os.path.islink(item_path):
                        continue
                    self._walk(item_path, current_depth + 1, maxdepth, 
                              name_pattern, file_type, results, debug)
            except PermissionError as e:
                # 权限不足时跳过该目录，但记录警告，避免静默丢失数据
                print(f"警告: 权限不足，跳过目录: {current_path} ({e})", file=sys.stderr)
    
    @staticmethod
    def print_results(results):
        """打印查找结果"""
        for path in results:
            print(path)


# 改进的函数式接口
def find(start_path='.', maxdepth=None, name_pattern=None, file_type=None, debug=False):
    """
    简洁的find函数接口
    
    Args:
        start_path: 起始路径
        maxdepth: 最大深度
        name_pattern: 文件名模式（支持正则表达式）
        file_type: 文件类型（'f'或'd'）
        debug: 是否打印调试信息
    
    Returns:
        list: 找到的路径列表
    """
    finder = FindCommand(start_path)
    return sorted(finder.find(maxdepth, name_pattern, file_type, debug))

        
    