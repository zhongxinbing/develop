"""
公共工具模块 - 提供共享函数和工具类
"""
import re
from datetime import datetime
from typing import Dict, List, Any, Optional, Tuple

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


def find_crash_dates(daily_metrics: Dict, dates: List[str]) -> List[str]:
    """找出缺失或没有Overall数据的日期（崩溃日期）"""
    crash_dates = []
    for date in dates:
        if date in daily_metrics:
            if not daily_metrics[date].get('Overall'):
                crash_dates.append(date)
        else:
            crash_dates.append(date)
    return crash_dates


def get_thread_metric_value(thread_metrics: Dict, thread_int: int, key: str) -> Optional[Any]:
    """从thread_metrics中按线程数取指定指标值，兼容字符串/整数键"""
    thread_key = str(thread_int)
    if thread_key in thread_metrics:
        return thread_metrics[thread_key].get(key)
    for tk, tv in thread_metrics.items():
        try:
            if int(tk) == thread_int:
                return tv.get(key)
        except (ValueError, TypeError):
            if tk == thread_key:
                return tv.get(key)
    return None


def to_float_or_none(value: Any) -> Optional[float]:
    """尝试转换为浮点数，失败返回None"""
    if value is None:
        return None
    try:
        return float(value)
    except (ValueError, TypeError):
        return None


def compute_basic_statistics(values: List[Any]) -> Dict[str, Any]:
    """计算总和/平均/最大/最小等基础统计信息，并返回最大最小值的索引"""
    valid_values = [(i, v) for i, v in enumerate(values) if v is not None]
    if not valid_values:
        return {
            'total': 0, 'avg': 0, 'max': 0, 'min': 0,
            'max_idx': -1, 'min_idx': -1
        }

    values_list = [v for _, v in valid_values]
    total = sum(values_list)
    max_val = max(values_list)
    min_val = min(values_list)
    return {
        'total': total,
        'avg': total / len(values_list),
        'max': max_val,
        'min': min_val,
        'max_idx': values.index(max_val) if max_val in values else -1,
        'min_idx': values.index(min_val) if min_val in values else -1
    }