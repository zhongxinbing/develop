"""
单线程数据解析器 - 专门处理单线程数据
"""
from typing import Dict, List, Any, Optional
from utils.common import (
    get_thread_color, normalize_thread_key,
    find_crash_dates, compute_basic_statistics,
)
from debug.debug import *

class SingleThreadParser:
    """单线程数据解析器"""

    @staticmethod
    def _parse_chart(
        raw_data: Dict,
        casename: str,
        rules: List[str],
        dates: List[str],
        metric_key: str
    ) -> Dict:
        """
        解析单线程图表数据（Runtime/Memory 通用）

        参数:
            raw_data: 原始数据
            casename: 项目名称
            rules: 要显示的规则列表
            dates: 要显示的日期列表
            metric_key: 指标键名（'runtime' 或 'memory'）

        返回:
            图表数据格式
        """
        case_data = raw_data.get(casename, {})
        daily_metrics = case_data.get('daily_metrics', {})

        result = {
            'dates': dates,
            'rules': {},
            'crash_dates': find_crash_dates(daily_metrics, dates),
            'overall_data': None
        }

        for rule in rules:
            values = []
            for date in dates:
                rule_metrics = daily_metrics.get(date, {}).get(rule)
                if rule_metrics and isinstance(rule_metrics, dict):
                    values.append(rule_metrics.get(metric_key))
                else:
                    values.append(None)

            result['rules'][rule] = {
                'dates': dates,
                'values': values,
                'type': 'line',
                'name': rule,
                'is_single': True
            }

            if rule == 'Overall':
                result['overall_data'] = result['rules'][rule]

        return result

    @staticmethod
    def parse_for_runtime_chart(
        raw_data: Dict,
        casename: str,
        rules: List[str],
        dates: List[str]
    ) -> Dict:
        """解析单线程Runtime图表数据"""
        return SingleThreadParser._parse_chart(raw_data, casename, rules, dates, 'runtime')

    @staticmethod
    def parse_for_memory_chart(
        raw_data: Dict,
        casename: str,
        rules: List[str],
        dates: List[str]
    ) -> Dict:
        """解析单线程Memory图表数据"""
        return SingleThreadParser._parse_chart(raw_data, casename, rules, dates, 'memory')

    @staticmethod
    def get_statistics(
        chart_data: Dict,
        is_runtime: bool = True
    ) -> Dict:
        """
        获取单线程统计信息

        参数:
            chart_data: 图表数据
            is_runtime: True获取runtime统计，False获取memory统计

        返回:
            统计信息字典
        """
        empty = {
            'total': 0, 'avg': 0, 'max': 0, 'min': 0,
            'max_rule': None, 'min_rule': None
        }

        overall_data = chart_data.get('overall_data')
        if not overall_data:
            return empty

        values = overall_data.get('values', [])
        if not any(v is not None for v in values):
            return empty

        stats = compute_basic_statistics(values)
        rules = list(chart_data.get('rules', {}).keys())

        def rule_at(idx: int) -> Optional[str]:
            return rules[idx] if 0 <= idx < len(rules) else None

        return {
            'total': stats['total'],
            'avg': stats['avg'],
            'max': stats['max'],
            'min': stats['min'],
            'max_rule': rule_at(stats['max_idx']),
            'min_rule': rule_at(stats['min_idx'])
        }
