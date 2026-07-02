"""
数据解析器 - 统一入口，根据模式调用对应的解析器
"""
from typing import Dict, List, Any, Optional
from utils.single_thread_parser import SingleThreadParser
from utils.multi_thread_parser import MultiThreadParser
from utils.common import log
from debug.debug import green,red,blue

class DataParser:
    """数据解析器 - 统一入口"""
    
    @staticmethod
    def parse_for_chart(
        raw_data: Dict,
        casename: str,
        rules: List[str],
        dates: List[str],
        mode: str = 'single',
        selected_threads: List[int] = None
    ) -> Dict:
        """
        解析图表数据（Runtime）
        
        参数:
            raw_data: 原始数据
            casename: 项目名称
            rules: 要显示的规则列表
            dates: 要显示的日期列表
            mode: 模式 - 'single' 或 'multi'
            selected_threads: 多线程模式下选择的线程列表
        """
        if mode == 'single':
            return SingleThreadParser.parse_for_runtime_chart(
                raw_data, casename, rules, dates
            )
        else:
            return MultiThreadParser.parse_for_runtime_chart(
                raw_data, casename, rules, dates, selected_threads
            )
    
    @staticmethod
    def parse_for_memory_chart(
        raw_data: Dict,
        casename: str,
        rules: List[str],
        dates: List[str],
        mode: str = 'single',
        selected_threads: List[int] = None
    ) -> Dict:
        """
        解析图表数据（Memory）
        
        参数:
            raw_data: 原始数据
            casename: 项目名称
            rules: 要显示的规则列表
            dates: 要显示的日期列表
            mode: 模式 - 'single' 或 'multi'
            selected_threads: 多线程模式下选择的线程列表
        """
        if mode == 'single':
            return SingleThreadParser.parse_for_memory_chart(
                raw_data, casename, rules, dates
            )
        else:
            return MultiThreadParser.parse_for_memory_chart(
                raw_data, casename, rules, dates, selected_threads
            )
    
    @staticmethod
    def parse_for_thread_chart(
        raw_data: Dict,
        casename: str,
        rule: str,
        date: str
    ) -> Dict:
        """
        解析数据为线程曲线图格式（X轴为线程数）
        """
        return MultiThreadParser.parse_for_thread_chart(raw_data, casename, rule, date)
    
    @staticmethod
    def get_thread_options(
        raw_data: Dict,
        casename: str,
        rule: str = None
    ) -> Dict:
        """
        获取多线程模式下可用的线程数选项
        """
        case_data = raw_data.get(casename, {})
        daily_metrics = case_data.get('daily_metrics', {})
        
        threads = MultiThreadParser.get_available_threads(daily_metrics, casename)
        
        return {
            'threads': threads,
            'default_threads': [min(threads)] if threads else [0]
        }
    
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
        解析数据用于对比（公共方法，支持单线程和多线程）
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
            
            # 获取runtime和memory值（支持单线程和多线程）
            if 'thread_metrics' in rule1:
                runtime1 = DataParser._get_avg_thread_value(rule1.get('thread_metrics', {}), 'runtime')
                memory1 = DataParser._get_avg_thread_value(rule1.get('thread_metrics', {}), 'memory')
            else:
                runtime1 = rule1.get('runtime')
                memory1 = rule1.get('memory')
            
            if 'thread_metrics' in rule2:
                runtime2 = DataParser._get_avg_thread_value(rule2.get('thread_metrics', {}), 'runtime')
                memory2 = DataParser._get_avg_thread_value(rule2.get('thread_metrics', {}), 'memory')
            else:
                runtime2 = rule2.get('runtime')
                memory2 = rule2.get('memory')
            
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
                'date1_value': {'runtime': runtime1, 'memory': memory1},
                'date2_value': {'runtime': runtime2, 'memory': memory2},
                'difference': {'runtime': runtime_diff, 'memory': memory_diff},
                'percentage': {'runtime': runtime_percent, 'memory': memory_percent},
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
    def _get_avg_thread_value(thread_metrics: Dict, key: str) -> Optional[float]:
        """获取多线程的平均值"""
        values = []
        for t, metrics in thread_metrics.items():
            val = metrics.get(key)
            if val is not None:
                try:
                    values.append(float(val))
                except (ValueError, TypeError):
                    pass
        return sum(values) / len(values) if values else None


# 全局实例
data_parser = DataParser()