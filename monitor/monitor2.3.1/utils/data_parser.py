"""
数据解析器 - 解析和转换数据格式
"""
from typing import Dict, List, Any, Optional
from copy import deepcopy


class DataParser:
    """数据解析器"""
    
    @staticmethod
    def parse_for_chart(
        raw_data: Dict,
        casename: str,
        rules: List[str],
        dates: List[str],
        mode: str = 'single',
        chart_type: str = 'runtime'  # 新增参数：图表类型 ('runtime' 或 'memory')
    ) -> Dict:
        """
        解析数据为图表格式
        
        参数:
            raw_data: 原始数据
            casename: 项目名称
            rules: 要显示的规则列表
            dates: 要显示的日期列表
            mode: 模式 - 'single', 'multi', 'thread'
            chart_type: 图表类型 - 'runtime', 'memory'
        
        返回:
            图表数据格式
        """
        result = {
            'dates': dates,
            'rules': {},
            'crash_dates': list(),
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
        
        # 根据图表类型获取对应的值
        value_key = 'runtime' if chart_type == 'runtime' else 'memory'
        
        # 解析每个规则的数据
        for rule in rules:
            rule_data = {
                'dates': [],
                'values': [],
                'type': 'line',
                'name': rule
            }
            
            for date in dates:
                if date in daily_metrics:
                    rule_metrics = daily_metrics[date].get(rule)
                    if rule_metrics:
                        if mode == 'single':
                            # 单线程模式：直接获取值
                            value = rule_metrics.get(value_key)
                        elif mode == 'multi':
                            # 多线程模式：取各线程的平均值或最大值
                            thread_metrics = rule_metrics.get('thread_metrics', {})
                            if thread_metrics:
                                values = [t.get(value_key, 0) for t in thread_metrics.values() if t.get(value_key) is not None]
                                value = max(values) if values else None
                            else:
                                value = rule_metrics.get(value_key)
                        else:
                            value = rule_metrics.get(value_key)
                    else:
                        value = None
                else:
                    value = None
                
                rule_data['dates'].append(date)
                rule_data['values'].append(value)
            
            result['rules'][rule] = rule_data
            
            if rule == 'Overall':
                result['overall_data'] = rule_data
        
        return result
    
    @staticmethod
    def parse_for_multi_thread_chart(
        raw_data: Dict,
        casename: str,
        rules: List[str],
        dates: List[str],
        selected_threads: List[int] = None,
        chart_type: str = 'runtime'
    ) -> Dict:
        """
        解析多线程数据为图表格式（支持线程选择）
        
        参数:
            raw_data: 原始数据
            casename: 项目名称
            rules: 要显示的规则列表
            dates: 要显示的日期列表
            selected_threads: 选择的线程数列表
            chart_type: 图表类型 ('runtime', 'memory')
        
        返回:
            多线程图表数据格式
        """
        result = {
            'dates': dates,
            'rules': {},
            'crash_dates': list(),
            'all_threads': [],  # 所有可用线程
            'overall_data': None
        }
        
        case_data = raw_data.get(casename, {})
        daily_metrics = case_data.get('daily_metrics', {})
        
        # 收集所有可用的线程数
        all_threads_set = set()
        
        # 根据图表类型获取对应的值
        value_key = 'runtime' if chart_type == 'runtime' else 'memory'
        
        # 检查每个日期是否有Overall数据
        for date in dates:
            if date in daily_metrics:
                overall = daily_metrics[date].get('Overall')
                if not overall:
                    result['crash_dates'].append(date)
            else:
                result['crash_dates'].append(date)
        
        # 解析每个规则的数据
        for rule in rules:
            rule_data = {
                'dates': dates,
                'thread_series': {},  # {thread_num: [values]}
                'type': 'line',
                'name': rule
            }
            
            # 为每个日期收集数据
            for idx, date in enumerate(dates):
                if date in daily_metrics:
                    rule_metrics = daily_metrics[date].get(rule, {})
                    thread_metrics = rule_metrics.get('thread_metrics', {})
                    
                    for thread_key, metrics in thread_metrics.items():
                        thread_num = int(thread_key)
                        all_threads_set.add(thread_num)
                        
                        if thread_num not in rule_data['thread_series']:
                            # 初始化该线程的数组，填充None直到当前索引
                            rule_data['thread_series'][thread_num] = [None] * idx
                        
                        # 确保数组长度足够
                        while len(rule_data['thread_series'][thread_num]) <= idx:
                            rule_data['thread_series'][thread_num].append(None)
                        
                        rule_data['thread_series'][thread_num][idx] = metrics.get(value_key)
            
            # 确保所有线程系列长度一致
            for thread_num in rule_data['thread_series']:
                while len(rule_data['thread_series'][thread_num]) < len(dates):
                    rule_data['thread_series'][thread_num].append(None)
            
            result['rules'][rule] = rule_data
            
            if rule == 'Overall':
                result['overall_data'] = rule_data
        
        # 排序线程数
        result['all_threads'] = sorted(all_threads_set)
        
        # 如果指定了选择的线程数，过滤数据
        if selected_threads:
            for rule in result['rules']:
                rule_data = result['rules'][rule]
                filtered_series = {}
                for thread in selected_threads:
                    if thread in rule_data.get('thread_series', {}):
                        filtered_series[thread] = rule_data['thread_series'][thread]
                rule_data['thread_series'] = filtered_series
        
        return result
    
    @staticmethod
    def parse_for_thread_chart(
        raw_data: Dict,
        casename: str,
        rule: str,
        date: str,
        chart_type: str = 'runtime'
    ) -> Dict:
        """
        解析数据为线程曲线图格式
        
        参数:
            raw_data: 原始数据
            casename: 项目名称
            rule: 规则名称
            date: 日期
            chart_type: 图表类型 ('runtime', 'memory')
        
        返回:
            线程图表数据
        """
        result = {
            'threads': [],
            'values': [],
            'chart_type': chart_type
        }
        
        case_data = raw_data.get(casename, {})
        daily_metrics = case_data.get('daily_metrics', {})
        day_data = daily_metrics.get(date, {})
        rule_data = day_data.get(rule, {})
        thread_metrics = rule_data.get('thread_metrics', {})
        
        value_key = 'runtime' if chart_type == 'runtime' else 'memory'
        
        for thread_key, metrics in sorted(thread_metrics.items(), key=lambda x: int(x[0])):
            result['threads'].append(int(thread_key))
            result['values'].append(metrics.get(value_key, 0))
        
        return result
    
    @staticmethod
    def parse_for_comparison(
        raw_data: Dict,
        casename: str,
        date1: str,
        date2: str,
        rules: List[str],
        compare_mode: str = 'all',
        dimension: str = 'all',
        runtime_threshold: float = 0,
        memory_threshold: float = 0,
        error_mode: str = 'absolute'
    ) -> Dict:
        """
        解析数据用于对比
        
        返回:
            对比结果
        """
        result = {
            'comparisons': [],
            'statistics': {
                'runtime_increased': [],
                'runtime_decreased': [],
                'memory_increased': [],
                'memory_decreased': [],
                'avg_runtime_change': 0,
                'avg_memory_change': 0,
                'max_runtime_increase': 0,
                'max_runtime_decrease': 0,
                'max_memory_increase': 0,
                'max_memory_decrease': 0
            },
            'summary': {}
        }
        
        case_data = raw_data.get(casename, {})
        daily_metrics = case_data.get('daily_metrics', {})
        day1_data = daily_metrics.get(date1, {})
        day2_data = daily_metrics.get(date2, {})
        
        runtime_changes = []
        memory_changes = []
        
        for rule in rules:
            rule1 = day1_data.get(rule, {})
            rule2 = day2_data.get(rule, {})
            
            # 获取runtime和memory值
            runtime1 = rule1.get('runtime') if 'thread_metrics' not in rule1 else DataParser._get_avg_thread_value(rule1.get('thread_metrics', {}), 'runtime')
            runtime2 = rule2.get('runtime') if 'thread_metrics' not in rule2 else DataParser._get_avg_thread_value(rule2.get('thread_metrics', {}), 'runtime')
            
            memory1 = rule1.get('memory') if 'thread_metrics' not in rule1 else DataParser._get_avg_thread_value(rule1.get('thread_metrics', {}), 'memory')
            memory2 = rule2.get('memory') if 'thread_metrics' not in rule2 else DataParser._get_avg_thread_value(rule2.get('thread_metrics', {}), 'memory')
            
            # 计算变化
            runtime_diff = None
            runtime_percent = None
            memory_diff = None
            memory_percent = None
            is_out_of_tolerance = False
            
            if runtime1 is not None and runtime2 is not None:
                runtime_diff = runtime2 - runtime1
                runtime_percent = (runtime_diff / runtime1 * 100) if runtime1 != 0 else 0
                runtime_changes.append(runtime_percent)
                
                if runtime_threshold > 0:
                    if error_mode == 'absolute':
                        is_out_of_tolerance = is_out_of_tolerance or abs(runtime_diff) > runtime_threshold
                    else:
                        is_out_of_tolerance = is_out_of_tolerance or abs(runtime_percent) > runtime_threshold
            
            if memory1 is not None and memory2 is not None:
                memory_diff = memory2 - memory1
                memory_percent = (memory_diff / memory1 * 100) if memory1 != 0 else 0
                memory_changes.append(memory_percent)
                
                if memory_threshold > 0:
                    if error_mode == 'absolute':
                        is_out_of_tolerance = is_out_of_tolerance or abs(memory_diff) > memory_threshold
                    else:
                        is_out_of_tolerance = is_out_of_tolerance or abs(memory_percent) > memory_threshold
            
            # 记录统计信息
            if runtime_diff is not None:
                if runtime_diff > 0:
                    result['statistics']['runtime_increased'].append((rule, runtime_diff, runtime_percent))
                elif runtime_diff < 0:
                    result['statistics']['runtime_decreased'].append((rule, abs(runtime_diff), abs(runtime_percent)))
            
            if memory_diff is not None:
                if memory_diff > 0:
                    result['statistics']['memory_increased'].append((rule, memory_diff, memory_percent))
                elif memory_diff < 0:
                    result['statistics']['memory_decreased'].append((rule, abs(memory_diff), abs(memory_percent)))
            
            result['comparisons'].append({
                'rule': rule,
                'date1_value': {
                    'runtime': runtime1,
                    'memory': memory1
                },
                'date2_value': {
                    'runtime': runtime2,
                    'memory': memory2
                },
                'difference': {
                    'runtime': runtime_diff,
                    'memory': memory_diff
                },
                'percentage': {
                    'runtime': runtime_percent,
                    'memory': memory_percent
                },
                'is_out_of_tolerance': is_out_of_tolerance
            })
        
        # 计算统计值
        if runtime_changes:
            result['statistics']['avg_runtime_change'] = sum(runtime_changes) / len(runtime_changes)
            result['statistics']['max_runtime_increase'] = max((c for c in runtime_changes if c > 0), default=0)
            result['statistics']['max_runtime_decrease'] = min((c for c in runtime_changes if c < 0), default=0)
        
        if memory_changes:
            result['statistics']['avg_memory_change'] = sum(memory_changes) / len(memory_changes)
            result['statistics']['max_memory_increase'] = max((c for c in memory_changes if c > 0), default=0)
            result['statistics']['max_memory_decrease'] = min((c for c in memory_changes if c < 0), default=0)
        
        # 排序
        result['statistics']['runtime_increased'].sort(key=lambda x: x[1], reverse=True)
        result['statistics']['runtime_decreased'].sort(key=lambda x: x[1], reverse=True)
        result['statistics']['memory_increased'].sort(key=lambda x: x[1], reverse=True)
        result['statistics']['memory_decreased'].sort(key=lambda x: x[1], reverse=True)
        
        result['summary'] = {
            'total_rules': len(rules),
            'runtime_changed': len([c for c in result['comparisons'] if c['difference']['runtime'] is not None]),
            'memory_changed': len([c for c in result['comparisons'] if c['difference']['memory'] is not None]),
            'out_of_tolerance': len([c for c in result['comparisons'] if c['is_out_of_tolerance']])
        }
        
        return result
    
    @staticmethod
    def _get_avg_thread_value(thread_metrics: Dict, key: str) -> float:
        """获取多线程的平均值"""
        values = [t.get(key, 0) for t in thread_metrics.values() if t.get(key) is not None]
        return sum(values) / len(values) if values else None
    
    @staticmethod
    def get_thread_options(
        raw_data: Dict,
        casename: str,
        rule: str
    ) -> Dict:
        """获取可用的线程数选项"""
        case_data = raw_data.get(casename, {})
        daily_metrics = case_data.get('daily_metrics', {})
        
        threads_set = set()
        for date, metrics in daily_metrics.items():
            rule_metrics = metrics.get(rule, {})
            if 'thread_metrics' in rule_metrics:
                for thread_key in rule_metrics['thread_metrics'].keys():
                    threads_set.add(int(thread_key))
        
        threads = sorted(threads_set)
        # 默认选择0线程（如果存在），否则选择最小线程数
        default_threads = [0] if 0 in threads else (threads[:1] if threads else [])
        
        return {
            'threads': threads,
            'default_threads': default_threads
        }
    
    @staticmethod
    def get_project_overview(raw_data: Dict, casename: str = None) -> Dict:
        """获取项目概况"""
        if casename and casename in raw_data:
            case_data = {casename: raw_data[casename]}
        else:
            case_data = raw_data
        
        total_cases = len(case_data)
        total_rules = set()
        total_dates = set()
        
        for case_name, case_info in case_data.items():
            daily_metrics = case_info.get('daily_metrics', {})
            total_dates.update(daily_metrics.keys())
            
            for date, metrics in daily_metrics.items():
                total_rules.update(metrics.keys())
        
        return {
            'total_cases': total_cases,
            'total_rules': len(total_rules),
            'total_dates': len(total_dates)
        }


# 全局实例
data_parser = DataParser()