"""
多线程数据解析器 - 专门处理多线程数据
"""
from typing import Dict, List, Any, Optional, Set, Callable
from utils.common import (
    get_thread_color, normalize_thread_key,
    find_crash_dates, get_thread_metric_value, to_float_or_none,
    compute_basic_statistics,
)


class MultiThreadParser:
    """多线程数据解析器"""

    @staticmethod
    def get_available_threads(
        daily_metrics: Dict,
        casename: str,
        rules: List[str] = None
    ) -> List[int]:
        """
        获取可用的线程数列表

        参数:
            daily_metrics: 每日指标数据
            casename: 项目名称
            rules: 规则列表（可选）

        返回:
            线程数列表（整数）
        """
        threads_set: Set[int] = set()

        for date, metrics in daily_metrics.items():
            target_rules = rules if rules else metrics.keys()
            for rule in target_rules:
                if rule not in metrics:
                    continue
                rule_metrics = metrics.get(rule, {})
                thread_metrics = rule_metrics.get('thread_metrics', {})
                for tk in thread_metrics.keys():
                    try:
                        threads_set.add(int(tk))
                    except (ValueError, TypeError):
                        threads_set.add(0)

        return sorted(threads_set)

    @staticmethod
    def _parse_chart(
        raw_data: Dict,
        casename: str,
        rules: List[str],
        dates: List[str],
        metric_key: str,
        series_namer: Callable[[str, int], str],
        selected_threads: List[int] = None
    ) -> Dict:
        """
        解析多线程图表数据（Runtime/Memory 通用）

        参数:
            raw_data: 原始数据
            casename: 项目名称
            rules: 要显示的规则列表
            dates: 要显示的日期列表
            metric_key: 指标键名（'runtime' 或 'memory'）
            series_namer: 生成系列名的函数 (rule, thread_int) -> str
            selected_threads: 选择的线程列表
        """
        case_data = raw_data.get(casename, {})
        daily_metrics = case_data.get('daily_metrics', {})

        all_threads = MultiThreadParser.get_available_threads(daily_metrics, casename, rules)

        if not selected_threads:
            selected_threads = all_threads if all_threads else [0]

        result = {
            'dates': dates,
            'rules': {},
            'crash_dates': find_crash_dates(daily_metrics, dates),
            'overall_data': None,
            'all_threads': all_threads,
            'selected_threads': selected_threads
        }

        min_thread = min(all_threads) if all_threads else None

        for rule in rules:
            for thread in all_threads:
                if thread not in selected_threads:
                    continue

                thread_int = int(thread) if not isinstance(thread, int) else thread
                color = get_thread_color(thread_int)
                series_name = series_namer(rule, thread_int)

                values = []
                for date in dates:
                    if date in daily_metrics:
                        thread_metrics = daily_metrics[date].get(rule, {}).get('thread_metrics', {})
                        found_val = get_thread_metric_value(thread_metrics, thread_int, metric_key)
                        values.append(to_float_or_none(found_val))
                    else:
                        values.append(None)

                result['rules'][series_name] = {
                    'dates': dates,
                    'values': values,
                    'type': 'line',
                    'name': series_name,
                    'thread': thread_int,
                    'color': color,
                    'rule_name': rule,
                    'is_multi': True
                }

                # 设置默认的overall_data（使用最小线程）
                if rule == 'Overall' and min_thread is not None and thread_int == min_thread:
                    result['overall_data'] = result['rules'][series_name]

        return result

    @staticmethod
    def parse_for_runtime_chart(
        raw_data: Dict,
        casename: str,
        rules: List[str],
        dates: List[str],
        selected_threads: List[int] = None
    ) -> Dict:
        """解析多线程Runtime图表数据"""
        def namer(rule: str, thread_int: int) -> str:
            return f"{rule}({thread_int})"

        return MultiThreadParser._parse_chart(
            raw_data, casename, rules, dates, 'runtime', namer, selected_threads
        )

    @staticmethod
    def parse_for_memory_chart(
        raw_data: Dict,
        casename: str,
        rules: List[str],
        dates: List[str],
        selected_threads: List[int] = None
    ) -> Dict:
        """解析多线程Memory图表数据"""
        def namer(rule: str, thread_int: int) -> str:
            if rule == 'Overall':
                return f"Overall ({thread_int}线程)"
            return f"{rule} ({thread_int}线程)"

        return MultiThreadParser._parse_chart(
            raw_data, casename, rules, dates, 'memory', namer, selected_threads
        )

    @staticmethod
    def get_statistics(
        chart_data: Dict,
        is_runtime: bool = True
    ) -> Dict:
        """
        获取多线程统计信息

        参数:
            chart_data: 图表数据
            is_runtime: True获取runtime统计，False获取memory统计

        返回:
            统计信息字典
        """
        empty = {'total': 0, 'avg': 0, 'max': 0, 'min': 0}

        overall_data = chart_data.get('overall_data')
        if not overall_data:
            return empty

        values = overall_data.get('values', [])
        if not any(v is not None for v in values):
            return empty

        stats = compute_basic_statistics(values)
        return {
            'total': stats['total'],
            'avg': stats['avg'],
            'max': stats['max'],
            'min': stats['min']
        }

    @staticmethod
    def parse_for_thread_chart(
        raw_data: Dict,
        casename: str,
        rule: str,
        date: str
    ) -> Dict:
        """
        解析数据为线程曲线图格式（X轴为线程数）

        参数:
            raw_data: 原始数据
            casename: 项目名称
            rule: 规则名称
            date: 日期

        返回:
            线程图表数据
        """
        result = {
            'threads': [],
            'runtimes': [],
            'memories': []
        }

        case_data = raw_data.get(casename, {})
        daily_metrics = case_data.get('daily_metrics', {})
        thread_metrics = daily_metrics.get(date, {}).get(rule, {}).get('thread_metrics', {})

        # 按线程数排序
        sorted_threads = []
        for tk in thread_metrics.keys():
            try:
                sorted_threads.append(int(tk))
            except (ValueError, TypeError):
                sorted_threads.append(0)
        sorted_threads = sorted(set(sorted_threads))

        for thread_num in sorted_threads:
            runtime = get_thread_metric_value(thread_metrics, thread_num, 'runtime')
            memory = get_thread_metric_value(thread_metrics, thread_num, 'memory')
            result['threads'].append(thread_num)
            result['runtimes'].append(runtime if runtime is not None else 0)
            result['memories'].append(memory if memory is not None else 0)

        return result
