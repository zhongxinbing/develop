"""
==================================================
公共工具模块
提供日志输出等通用功能
==================================================
"""

from datetime import datetime


def log(str):
    """
    带时间戳的日志输出函数
    
    参数:
        str: str - 要输出的日志信息
    
    输出格式:
        [YYYY-MM-DD HH:MM:SS]: 日志内容
    """
    print(f"{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}: {str}")