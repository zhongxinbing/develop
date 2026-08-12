"""
数据对比器 - 核心对比逻辑
"""
import json
from pathlib import Path
from typing import Dict, List, Any, Optional, Union
from datetime import datetime

from config import DATA_DIR
from utils.common import load_tool_data, save_tool_data, deep_merge
from utils.log import *
from utils.data_manager import data_manager

logger = get_logger(__name__)


class DataComparer:
    """数据对比器 - 负责执行数据对比逻辑"""

    def __init__(self):
        self.logger = logger

    def compare(self,
                tool_id: str,
                casename: str,
                dimensions: List[str] = None,
                rules: List[str] = None,
                threads: List[int] = None,
                date1: str = None,
                date2: str = None,
                error_mode: str = 'absolute',
                runtime_threshold: float = 0,
                memory_threshold: float = 0,
                compare_type: str = 'single',
                is_multi_dimension: bool = False) -> Dict:
        """
        执行数据对比

        Args:
            tool_id: 工具ID
            casename: 用例名称
            dimensions: 对比维度列表
            rules: 规则列表
            threads: 线程列表
            date1: 日期1
            date2: 日期2
            error_mode: 误差模式 ('absolute' 或 'percentage')
            runtime_threshold: Runtime 阈值
            memory_threshold: Memory 阈值
            compare_type: 对比类型 ('single' 单线程版本对比, 'thread' 多线程对比)
            is_multi_dimension: 是否多维度对比

        Returns:
            {'success': bool, 'data': dict, 'error': str}
        """
        # 验证必填参数
        if not casename:
            return {'success': False, 'error': '请选择 Casename'}

        if not date1:
            return {'success': False, 'error': '请选择日期'}

        is_multi_thread = compare_type == 'thread'

        if not is_multi_thread and not date2 and not is_multi_dimension:
            return {'success': False, 'error': '单线程对比需要选择两个日期'}

        # 获取数据
        try:
            # 缓存 key 必须与 data_manager 写入时一致（load_single_or_multi_chart 使用 tool_id）
            cache_key = f"{tool_id}"
            cache_entry = data_manager._data_cache.get(cache_key, None)
            if not cache_entry:
                return {'success': False, 'error': '数据未加载，请先刷新数据'}
            cache_data = cache_entry[1]
            if not cache_data:
                return {'success': False, 'error': '数据未加载，请先刷新数据'}
            
            case_data = cache_data.get('paser_data', {}).get('single_multi', {}).get(casename)
            if not case_data:
                return {'success': False, 'error': f'找不到用例数据: {casename}'}
        except Exception as e:
            self.logger.error(f"获取数据失败: {e}")
            return {'success': False, 'error': f'获取数据失败: {str(e)}'}

        # 确定维度列表
        if not dimensions:
            # 默认使用所有可用维度
            all_dims = ['cputime', 'realtime', 'peakmem', 'incmem', 'realtimeincmem']
            dimensions = [d for d in all_dims if d in case_data and case_data[d]]
        
        if not dimensions:
            return {'success': False, 'error': '没有可用的对比维度'}

        # 确定规则
        all_rules = self._get_all_rules(case_data, dimensions[0])
        rules = self._resolve_rules(rules, all_rules)
        if not rules:
            return {'success': False, 'error': '没有可用的规则'}

        # 确定线程
        all_threads = self._get_all_threads(case_data, dimensions[0], rules)
        thread_list = self._resolve_threads(threads, all_threads)
        if not thread_list:
            return {'success': False, 'error': '没有可用的线程数据'}

        # 执行对比
        if is_multi_dimension:
            # 多维度对比（单线程）
            result = self._perform_multi_dimension_comparison(
                case_data, casename, dimensions, rules, thread_list[0], 
                date1, date2, runtime_threshold, memory_threshold, error_mode
            )
        elif is_multi_thread or len(thread_list) > 1:
            # 多线程对比
            red(f"对比线程: {thread_list}")
            result = self._perform_thread_comparison(
                case_data, casename, dimensions, rules, thread_list, date1,
                runtime_threshold, memory_threshold, error_mode
            )
            green(result)
        else:
            # 单线程版本对比
            result = self._perform_single_thread_comparison(
                case_data, casename, dimensions, rules, thread_list[0], date1, date2,
                runtime_threshold, memory_threshold, error_mode
            )

        return {'success': True, 'data': result}

    # ==================== 辅助方法 ====================

    def _get_all_rules(self, case_data: Dict, dimension: str) -> List[str]:
        """获取维度下的所有规则"""
        dim_data = case_data.get(dimension, {})
        rules = list(dim_data.keys())
        # 将 Overall 放在最前面
        if 'Overall' in rules:
            rules.remove('Overall')
            rules.insert(0, 'Overall')
        return rules

    def _resolve_rules(self, rules: List[str], all_rules: List[str]) -> List[str]:
        """解析规则"""
        if not rules or rules[0] == 'all':
            return all_rules
        return [r for r in rules if r in all_rules]

    def _get_all_threads(self, case_data: Dict, dimension: str, rules: List[str]) -> List[int]:
        """获取所有线程数"""
        threads = set()
        dim_data = case_data.get(dimension, {})
        for rule in rules:
            rule_data = dim_data.get(rule, {})
            for thread in rule_data.keys():
                if thread.isdigit() or thread == '-1':
                    threads.add(int(thread))
        return sorted(list(threads), key=lambda x: -1 if x == -1 else x)

    def _resolve_threads(self, threads: Optional[List[int]], all_threads: List[int]) -> List[int]:
        """解析线程列表"""
        if threads:
            valid = [t for t in threads if t in all_threads]
            if valid:
                return sorted(valid, key=lambda x: -1 if x == -1 else x)
        return all_threads

    def _get_value_for_date(self, case_data: Dict, dimension: str, rule: str, 
                           thread: int, date: str) -> Optional[float]:
        """
        获取指定日期、维度、规则、线程的值
        返回值统一为 float 或 None
        """
        dim_data = case_data.get(dimension, {})
        rule_data = dim_data.get(rule, {})
        thread_data = rule_data.get(str(thread), {})
        
        if not thread_data:
            return None
        
        dates = thread_data.get('date', [])
        values = thread_data.get('data', [])
        
        try:
            idx = dates.index(date)
            if idx < len(values):
                val = values[idx]
                # 确保返回 float 类型
                if val is not None:
                    try:
                        return float(val)
                    except (ValueError, TypeError):
                        return None
                return None
        except ValueError:
            pass
        return None

    def _get_status(self, diff_value: float, is_runtime: bool,
                    runtime_threshold: float, memory_threshold: float) -> str:
        """获取变化状态"""
        threshold = runtime_threshold if is_runtime else memory_threshold
        if diff_value > threshold:
            return '⬆️增加'
        elif diff_value < -threshold:
            return '⬇️减少'
        else:
            return '· 无变化'

    def _calculate_diff(self, val1: Optional[float], val2: Optional[float], 
                       error_mode: str) -> tuple:
        """计算差值，返回 (diff_value, display_string)"""
        if val1 is None or val2 is None:
            return None, 'NA'
        
        try:
            v1 = float(val1)
            v2 = float(val2)
        except (ValueError, TypeError):
            return None, 'NA'
        
        if error_mode == 'percentage':
            if v1 == 0:
                return 0, '0%' if v2 == 0 else '∞'
            diff = (v2 - v1) / v1 * 100
            return diff, f"{diff:.2f}%"
        else:
            diff = v2 - v1
            return diff, f"{diff:.2f}"

    def _format_value(self, value: Optional[float]) -> str:
        """格式化显示值"""
        if value is None:
            return '无数据'
        try:
            return f"{float(value):.2f}"
        except (ValueError, TypeError):
            return '无数据'

    # ==================== 单线程版本对比 ====================

    def _perform_single_thread_comparison(self, case_data: Dict, casename: str,
                                          dimensions: List[str], rules: List[str],
                                          thread: int, date1: str, date2: str,
                                          runtime_threshold: float, memory_threshold: float,
                                          error_mode: str) -> Dict:
        """单线程版本对比 - 两个日期对比"""
        comparison_results = []
        statistics = self._init_statistics()
        total_runtime_change = 0
        total_runtime_count = 0
        total_memory_change = 0
        total_memory_count = 0

        for rule in rules:
            row = [rule]
            has_data = False

            for dim in dimensions:
                val1 = self._get_value_for_date(case_data, dim, rule, thread, date1)
                val2 = self._get_value_for_date(case_data, dim, rule, thread, date2)
                
                is_runtime = dim in ['cputime', 'realtime']
                is_memory = dim in ['peakmem', 'incmem', 'realtimeincmem']
                
                # 格式化显示值
                display_val1 = self._format_value(val1)
                display_val2 = self._format_value(val2)
                
                if val1 is None or val2 is None:
                    row.extend([display_val1, display_val2, 'NA', 'NA'])
                else:
                    diff, diff_display = self._calculate_diff(val1, val2, error_mode)
                    status = self._get_status(diff, is_runtime, runtime_threshold, memory_threshold) if diff is not None else 'NA'
                    
                    row.extend([display_val1, display_val2, diff_display, status])
                    has_data = True
                    
                    if is_runtime and diff is not None:
                        total_runtime_change += abs(diff)
                        total_runtime_count += 1
                        self._update_statistics(statistics, 'runtime', status, rule, diff)
                    elif is_memory and diff is not None:
                        total_memory_change += abs(diff)
                        total_memory_count += 1
                        self._update_statistics(statistics, 'memory', status, rule, diff)

            if has_data:
                comparison_results.append(row)

        # 计算平均值
        if total_runtime_count > 0:
            statistics['avg_runtime_change'] = round(total_runtime_change / total_runtime_count, 2)
        if total_memory_count > 0:
            statistics['avg_memory_change'] = round(total_memory_change / total_memory_count, 2)

        # 排序
        for key in ['runtime_increased', 'runtime_decreased', 'memory_increased', 'memory_decreased']:
            if statistics[key]:
                statistics[key] = sorted(statistics[key].items(), key=lambda x: x[1], reverse=True)

        return {'statistics': statistics, 'comparisons': comparison_results}

    # ==================== 多维度对比 ====================

    def _perform_multi_dimension_comparison(self, case_data: Dict, casename: str,
                                            dimensions: List[str], rules: List[str],
                                            thread: int, date1: str, date2: str,
                                            runtime_threshold: float, memory_threshold: float,
                                            error_mode: str) -> Dict:
        """
        多维度对比 - 同一线程在不同日期下，多个维度的对比
        表格格式: | rule | dim1(date1) | dim1(date2) | dim1结果 | dim2(date1) | dim2(date2) | dim2结果 | ... |
        """
        comparison_results = []
        total_comparisons = 0

        for rule in rules:
            row = [rule]
            has_data = False

            for dim in dimensions:
                val1 = self._get_value_for_date(case_data, dim, rule, thread, date1)
                val2 = self._get_value_for_date(case_data, dim, rule, thread, date2)
                
                is_runtime = dim in ['cputime', 'realtime']
                
                # 格式化显示值
                display_val1 = self._format_value(val1)
                display_val2 = self._format_value(val2)
                
                if val1 is None or val2 is None:
                    row.extend([display_val1, display_val2, 'NA', 'NA'])
                else:
                    diff, diff_display = self._calculate_diff(val1, val2, error_mode)
                    status = self._get_status(diff, is_runtime, runtime_threshold, memory_threshold) if diff is not None else 'NA'
                    
                    row.extend([display_val1, display_val2, diff_display, status])
                    has_data = True
                    total_comparisons += 1

            if has_data:
                comparison_results.append(row)

        return {
            'statistics': {
                'totalComparisons': total_comparisons,
                'dimensionCount': len(dimensions),
                'threadCount': 1
            },
            'comparisons': comparison_results
        }

    # ==================== 多线程对比 ====================

    def _perform_thread_comparison(self, case_data: Dict, casename: str,
                                   dimensions: List[str], rules: List[str],
                                   thread_list: List[int], date: str,
                                   runtime_threshold: float, memory_threshold: float,
                                   error_mode: str) -> Dict:
        """
        多线程对比 - 同一日期下不同线程的对比
        表格格式: | rule | 线程数1 | 线程数1->线程数2 | 线程数2 | 线程数2->线程数3 | ... |
        """
        comparison_results = []
        total_comparisons = 0
        
        # 生成标题行
        title_row = ["rule"]
        for i, thread in enumerate(thread_list):
            title_row.append(f"{thread}线程")
            if i < len(thread_list) - 1:
                title_row.append(f"{thread}->{thread_list[i+1]}")
        comparison_results.append(title_row)
        
        # 生成对比行
        for rule in rules:
            row = [rule]
            has_data = False
            last_value = None
            
            for i, thread in enumerate(thread_list):
                # 使用第一个维度获取值
                dim = dimensions[0]
                value = self._get_value_for_date(case_data, dim, rule, thread, date)
                display_value = self._format_value(value)
                
                row.append(display_value)
                
                # 计算与上一个线程的差值
                if i > 0 and last_value is not None and value is not None:
                    diff, diff_display = self._calculate_diff(last_value, value, error_mode)
                    row.append(diff_display)
                    has_data = True
                    total_comparisons += 1
                elif i > 0:
                    row.append('NA')
                else:
                    # 第一个线程没有前一个对比
                    pass
                
                last_value = value
                has_data = True

            if has_data:
                comparison_results.append(row)

        return {
            'statistics': {
                'totalComparisons': total_comparisons,
                'threadCount': len(thread_list)
            },
            'comparisons': comparison_results
        }

    # ==================== 统计辅助方法 ====================

    def _init_statistics(self) -> Dict:
        """初始化统计数据结构"""
        return {
            'runtime_increased': {},
            'runtime_decreased': {},
            'memory_increased': {},
            'memory_decreased': {},
            'avg_runtime_change': 0,
            'avg_memory_change': 0,
            'max_runtime_increased': {'name': '', 'value': 0},
            'max_runtime_decreased': {'name': '', 'value': 0},
            'max_memory_increased': {'name': '', 'value': 0},
            'max_memory_decreased': {'name': '', 'value': 0},
        }

    def _update_statistics(self, statistics: Dict, type_name: str, status: str,
                           rule: str, diff_value: float):
        """更新统计信息"""
        key = f"{type_name}_increased" if status == '⬆️增加' else f"{type_name}_decreased"
        if status != '· 无变化':
            statistics[key][rule] = abs(diff_value)
            max_key = f"max_{type_name}_increased" if status == '⬆️增加' else f"max_{type_name}_decreased"
            if statistics[max_key]['value'] < abs(diff_value):
                statistics[max_key] = {'name': rule, 'value': abs(diff_value)}

    def compare_data(self,
                    tool_id: str,
                    mode: str,
                    casename: str,
                    date1: str = None,
                    date2: str = None,
                    compare_mode: List[str] = ['all'],
                    dimension: str = None,
                    dimensions: List[str] = None,
                    runtime_threshold: float = 0,
                    memory_threshold: float = 0,
                    error_mode: str = 'absolute',
                    threads: List[int] = None,
                    compare_type: str = 'single',
                    is_multi_dimension: bool = False) -> Dict:
        """
        数据对比 - 使用 DataComparer
        """
        # 兼容旧的 dimension 参数
        if dimensions is None and dimension:
            dimensions = [dimension]
        elif dimensions is None:
            dimensions = []

        return self.compare(
            tool_id=tool_id,
            casename=casename,
            dimensions=dimensions,
            rules=compare_mode,
            threads=threads,
            date1=date1,
            date2=date2,
            error_mode=error_mode,
            runtime_threshold=runtime_threshold,
            memory_threshold=memory_threshold,
            compare_type=compare_type,
            is_multi_dimension=is_multi_dimension
        )


# 全局实例
comparer = DataComparer()