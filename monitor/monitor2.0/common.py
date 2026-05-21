"""
==================================================
公共工具模块
提供日志输出等通用功能
==================================================
"""

from datetime import datetime
import json
from pathlib import Path


def log(msg: str) -> None:
    """
    带时间戳的日志输出函数
    
    参数:
        msg: str - 要输出的日志信息
    
    输出格式:
        [YYYY-MM-DD HH:MM:SS]: 日志内容
    """
    print(f"{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}: {msg}")



def load_json(path):
    """
    加载JSON文件
    
    参数:
        path: JSON文件路径
    
    返回:
        dict: 解析后的JSON数据
    """
    with open(path, 'r', encoding='utf-8') as file:
        data = json.load(file)
    return data

current_projects_data = {}  # 原始项目数据
parsed_projects = {}        # 解析后的项目数据
project_list = []           # 项目列表