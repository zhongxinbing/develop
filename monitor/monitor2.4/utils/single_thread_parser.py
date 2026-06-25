"""
单线程数据解析器 - 专门处理单线程数据
"""
from typing import Dict, List, Any, Optional
from tool.elint.elint import save_json
from utils.common import get_thread_color, normalize_thread_key
from debug.debug import *

class SingleThreadParser:
    """单线程数据解析器"""
    
    @staticmethod
    def parse_for_runtime_chart(
        raw_data: Dict,
        casename: str,
        rules: List[str],
        dates: List[str]
    ) -> Dict:
        """
        解析单线程Runtime图表数据
        
        参数:
            raw_data: 原始数据
            casename: 项目名称
            rules: 要显示的规则列表
            dates: 要显示的日期列表
        
        返回:
            图表数据格式
        """
        result = {
            'dates': dates,
            'rules': {},
            'crash_dates': [],
            'overall_data': None
        }
        
        case_data = raw_data.get(casename, {})
        daily_metrics = case_data.get('daily_metrics', {})
        
        # 检查每个日期是否有Overall数据
        for date in dates:
            if date in daily_metrics:
                overall = daily_metrics[date].get('Overall')
                if not overall:
                    result['crash_dates'].append(date)
            else:
                result['crash_dates'].append(date)
        
        for rule in rules:
            values = []
            for date in dates:
                if date in daily_metrics:
                    rule_metrics = daily_metrics[date].get(rule)
                    if rule_metrics and isinstance(rule_metrics, dict):
                        # 单线程数据：直接获取runtime
                        values.append(rule_metrics.get('runtime'))
                    else:
                        values.append(None)
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
    def parse_for_memory_chart(
        raw_data: Dict,
        casename: str,
        rules: List[str],
        dates: List[str]
    ) -> Dict:
        """
        解析单线程Memory图表数据
        
        参数:
            raw_data: 原始数据
            casename: 项目名称
            rules: 要显示的规则列表
            dates: 要显示的日期列表
        
        返回:
            图表数据格式
        """
        result = {
            'dates': dates,
            'rules': {},
            'crash_dates': [],
            'overall_data': None
        }
        
        case_data = raw_data.get(casename, {})
        daily_metrics = case_data.get('daily_metrics', {})
        
        for date in dates:
            if date in daily_metrics:
                overall = daily_metrics[date].get('Overall')
                if not overall:
                    result['crash_dates'].append(date)
            else:
                result['crash_dates'].append(date)
        
        for rule in rules:
            values = []
            for date in dates:
                if date in daily_metrics:
                    rule_metrics = daily_metrics[date].get(rule)
                    if rule_metrics and isinstance(rule_metrics, dict):
                        values.append(rule_metrics.get('memory'))
                    else:
                        values.append(None)
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
        overall_data = chart_data.get('overall_data')
        if not overall_data:
            return {
                'total': 0,
                'avg': 0,
                'max': 0,
                'min': 0,
                'max_rule': None,
                'min_rule': None
            }
        
        values = overall_data.get('values', [])
        valid_values = [(i, v) for i, v in enumerate(values) if v is not None]
        
        if not valid_values:
            return {
                'total': 0,
                'avg': 0,
                'max': 0,
                'min': 0,
                'max_rule': None,
                'min_rule': None
            }
        
        values_list = [v for _, v in valid_values]
        total = sum(values_list)
        avg = total / len(values_list)
        max_val = max(values_list)
        min_val = min(values_list)
        
        # 找到最大最小值对应的rule
        max_idx = values.index(max_val) if max_val in values else -1
        min_idx = values.index(min_val) if min_val in values else -1
        
        rules = list(chart_data.get('rules', {}).keys())
        max_rule = rules[max_idx] if max_idx >= 0 and max_idx < len(rules) else None
        min_rule = rules[min_idx] if min_idx >= 0 and min_idx < len(rules) else None
        
        return {
            'total': total,
            'avg': avg,
            'max': max_val,
            'min': min_val,
            'max_rule': max_rule,
            'min_rule': min_rule
        }