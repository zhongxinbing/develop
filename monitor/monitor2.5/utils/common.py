"""
公共工具模块 - 提供共享函数和工具类
"""
import json
from datetime import datetime
from typing import Dict, List, Any, Optional, Tuple
from utils.log import *

# 线程颜色映射（公共）
THREAD_COLORS = {
    0: '#00E5FF', 2: '#A855F7', 4: '#10B981',
    6: '#F59E0B', 8: '#EF4444', 16: '#8B5CF6',
    32: '#EC4899', 64: '#14B8A6', 128: '#F97316'
}


def log(msg: str) -> None:
    """带时间戳的日志输出"""
    print(f"{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}: {msg}")

def format_date(date_str: str) -> str:
    """格式化日期显示"""
    if not date_str:
        return ''
    if date_str.endswith('_user'):
        return date_str.replace('_user', ' (用户)')
    if len(date_str) == 8 and date_str.isdigit():
        return f"{date_str[:4]}-{date_str[4:6]}-{date_str[6:8]}"
    return date_str


def get_thread_color(thread: int) -> str:
    """获取线程颜色"""
    return THREAD_COLORS.get(thread, '#A855F7')


def escape_html(text: str) -> str:
    """HTML转义"""
    if not text:
        return ''
    import html
    return html.escape(str(text))


def calculate_percentage_change(old_val: float, new_val: float) -> float:
    """计算百分比变化"""
    if old_val is None or new_val is None:
        return 0
    if old_val == 0:
        return 0 if new_val == 0 else 100
    return (new_val - old_val) / old_val * 100


def format_number(value: Any, decimals: int = 2) -> str:
    """格式化数字显示"""
    if value is None:
        return 'N/A'
    try:
        return f"{float(value):.{decimals}f}"
    except (ValueError, TypeError):
        return str(value)


def normalize_thread_key(thread: Any) -> str:
    """标准化线程键名"""
    try:
        return str(int(thread))
    except (ValueError, TypeError):
        return '0'

def save_tool_data(path: str, data: Dict[str, Any]) -> None:
    """保存工具数据"""
    setup_logger(log_dir='logs', level='DEBUG')
    logger = get_logger(__name__)
    try:
        with open(path, 'w') as f:
            json.dump(data, f, indent=4)
        logger.info(f"成功保存工具数据到 {path}")
    except Exception as e:
        logger.error(f"保存工具数据失败: {e}")
        return False

def load_tool_data(path: str) -> Dict[str, Any]:
    """加载工具数据"""
    setup_logger(log_dir='logs', level='DEBUG')
    logger = get_logger(__name__)
    try:
        with open(path, 'r') as f:
            data = json.load(f)
        logger.info(f"成功加载工具数据从 {path}")
        return data
    except Exception as e:
        logger.error(f"加载工具数据失败: {e}")
        return None