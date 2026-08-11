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
                dimension: str = None,
                rules: List[str] = None,
                threads: List[int] = None,
                date1: str = None,
                date2: str = None,
                error_mode: str = 'absolute',
                runtime_threshold: float = 0,
                memory_threshold: float = 0,
                compare_type: str = 'single') -> Dict:
        """
        执行数据对比

        Args:
            tool_id: 工具ID
            casename: 用例名称
            dimension: 对比维度 (cputime/realtime/peakmem/incmem/realtimeincmem)
            rule: 规则名称，'all' 表示所有规则
            threads: 线程列表
            date1: 日期1
            date2: 日期2
            error_mode: 误差模式 ('absolute' 或 'percentage')
            runtime_threshold: Runtime 阈值
            memory_threshold: Memory 阈值
            compare_type: 对比类型 ('single' 单线程版本对比, 'thread' 多线程对比)

        Returns:
            {'success': bool, 'data': dict, 'error': str}
        """
        # 验证必填参数
        if not casename:
            return {'success': False, 'error': '请选择 Casename'}

        if not date1:
            return {'success': False, 'error': '请选择日期'}

        is_multi_thread = compare_type == 'thread'

        if not is_multi_thread and not date2:
            return {'success': False, 'error': '单线程对比需要选择两个日期'}

        # 获取数据路径
        case_data = data_manager._data_cache[f"{tool_id}_parser"][1]['single_multi'][casename]

        if not case_data:
            return {'success': False, 'error': f'找不到用例数据: {casename}'}

        # 确定对比维度
        dimensions = self._resolve_dimensions(dimension, case_data)
        if not dimensions:
            return {'success': False, 'error': '没有可用的对比维度'}

        # 确定规则
        all_rules = self._get_all_rules(case_data, dimensions)
        rules = self._resolve_rules(rules, all_rules)
        if not rules:
            return {'success': False, 'error': '没有可用的规则'}

        # 确定线程
        all_threads = self._get_all_threads(case_data, dimensions, rules)
        thread_list = self._resolve_threads(threads, all_threads)
        if not thread_list:
            return {'success': False, 'error': '没有可用的线程数据'}

        # 执行对比
        if is_multi_thread or len(thread_list) > 1:
            result = self._perform_thread_comparison(
                case_data, casename, dimensions, rules, thread_list, date1,
                runtime_threshold, memory_threshold, error_mode
            )
        else:
            result = self._perform_single_thread_comparison(
                case_data, casename, dimensions, rules, thread_list[0], date1, date2,
                runtime_threshold, memory_threshold, error_mode
            )

        return {'success': True, 'data': result}

    # ==================== 辅助方法 ====================

    def _resolve_dimensions(self, dimension: Optional[str], case_data: Dict[str, Any]) -> List[str]:
        """解析对比维度"""

        if dimension in case_data:
            return [dimension]
        return {}

    def _get_all_rules(self, case_data: Path, dimensions: List[str]) -> List[str]:
        """获取 dimensions 下的所有规则"""

        rules = case_data[dimensions[0]].keys()
        return sorted(list(rules))

    def _resolve_rules(self, rules: List[str], all_rules: Dict[str, Any]) -> List[str]:
        """解析规则"""

        if rules[0] == 'all':
            return [r for r in all_rules]
        rule_names = []
        for rule in rules:
            if rule in all_rules:
                rule_names.append(rule)

        return rule_names

    def _get_all_threads(self, case_data: Path, dimensions: List[str], rules: List[str]) -> List[int]:
        """获取所有线程数"""
        threads = set()
        for rule in rules:
            threads.update(case_data[dimensions[0]][rule].keys())
        return sorted(list(threads), key=lambda x: -1 if x == -1 else x)

    def _resolve_threads(self, threads: Optional[List[int]], all_threads: List[int]) -> List[int]:
        """解析线程列表"""
        if threads:
            valid = [t for t in threads if t in all_threads]
            if valid:
                return sorted(valid)
        return sorted(all_threads)

    # ==================== 单线程对比 ====================

    def _perform_single_thread_comparison(self, data_path: Path, casename: str,
                                          dimensions: List[str], rules: List[str],
                                          thread: int, date1: str, date2: str,
                                          runtime_threshold: float, memory_threshold: float,
                                          error_mode: str) -> Dict:
        """单线程版本对比"""
        comparison_results = []
        statistics = self._init_statistics()
        total_runtime_change = 0
        total_runtime_count = 0
        total_memory_change = 0
        total_memory_count = 0

        for rule in rules:
            row = [rule]
            has_runtime = False
            has_memory = False

            for dim in dimensions:
                rule_file = data_path / dim / f"{rule}.json"
                if not rule_file.exists():
                    continue

                rule_data = load_tool_data(rule_file)
                if not rule_data or 'rules' not in rule_data:
                    continue

                for rule_key, rule_info in rule_data['rules'].items():
                    # 检查线程匹配
                    if not self._match_thread(rule_key, thread):
                        continue

                    dates = rule_info.get('dates', [])
                    values = rule_info.get('values', [])

                    try:
                        idx1 = dates.index(date1)
                        idx2 = dates.index(date2)
                        val1 = values[idx1] if idx1 < len(values) else None
                        val2 = values[idx2] if idx2 < len(values) else None
                    except ValueError:
                        continue

                    if val1 is None or val2 is None:
                        continue

                    diff = val2 - val1
                    diff_percent = 0 if val1 == 0 else round((diff / val1) * 100, 2)

                    is_runtime = dim in ['cputime', 'realtime']
                    is_memory = dim in ['peakmem', 'incmem', 'realtimeincmem']

                    diff_value = diff_percent if error_mode == 'percentage' else diff
                    status = self._get_status(diff_value, is_runtime, runtime_threshold, memory_threshold)

                    if is_runtime:
                        has_runtime = True
                        total_runtime_change += abs(diff_value)
                        total_runtime_count += 1
                        self._update_statistics(statistics, 'runtime', status, rule, diff_value)
                    elif is_memory:
                        has_memory = True
                        total_memory_change += abs(diff_value)
                        total_memory_count += 1
                        self._update_statistics(statistics, 'memory', status, rule, diff_value)

                    display_diff = diff_percent if error_mode == 'percentage' else diff
                    row.extend([round(val1, 2), round(val2, 2), round(display_diff, 2), status])

            if has_runtime or has_memory:
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

    # ==================== 多线程对比 ====================

    def _perform_thread_comparison(self, case_data: Dict, casename: str,
                                   dimensions: List[str], rules: List[str],
                                   thread_list: List[int], date: str,
                                   runtime_threshold: float, memory_threshold: float,
                                   error_mode: str) -> Dict:
        """
        多线程对比 - 同一日期下不同线程的对比
        数据显示
        rule | -1 | 2 | (-1)-2变化情况| 4 | “2-4”的变化情况 | 6 | 4-6变化情况 | 8 | 8-8变化情况 | 10 | 10-10变化情况
        """
        comparison_results = []
        total_comparisons = 0
        title_row = ["rule" ]
        # 生成标题行
        for thread in thread_list:
            title_row.append(f"线程{thread}")
        thread_num = len(title_row) - 1
        add_num = thread_num - 1
        title_len = thread_num + add_num + 1
        index = 3
        while len(title_row) < title_len:
            if index == 3:
                title_row.insert(index, f"{title_row[index-2]}->{title_row[index-1]}")
            else:
                title_row.insert(index, f"{title_row[index-3]}->{title_row[index-1]}")
            index += 2
        comparison_results.append(title_row)
        # 生成对比行
        for rule in rules:
            rule_data = case_data[dimensions[0]][rule]
            rule_comparison_results = [rule]
            last_thread_data = None
            for thread in thread_list:
                # 获取到这个线程的数据
                thread_data = rule_data.get(thread, {})

                if date not in thread_data:
                    data = "NA"
                else:
                    date_index = thread_data.get(date, []).index(date)
                    # 这个 rule 的这个 线程 这个date 的数据
                    data = thread_data.get(data)[date_index]
                rule_comparison_results.append(data)
                if last_thread_data is not None:
                    if data == "NA" or last_thread_data == "NA":
                        diff = "NA"
                    else:
                        # 计算差值
                        if error_mode == 'percentage':
                            # 百分比
                            diff = round((data - last_thread_data) / last_thread_data * 100, 2)
                        else:
                            # 绝对值
                            diff = data - last_thread_data
                    rule_comparison_results.append(diff)
                else:
                    # 第一个线程，直接添加数据
                    rule_comparison_results.append(data)
                last_thread_data = data
            comparison_results.append(rule_comparison_results)

        red(comparison_results)



        # for rule in rules:
        #     row = [rule]
        #     has_data = False
        #     thread_values = {}

        #     for dim in dimensions:
        #         rule_file = data_path / dim / f"{rule}.json"
        #         if not rule_file.exists():
        #             continue

        #         rule_data = load_tool_data(rule_file)

        #         if not rule_data or 'rules' not in rule_data:
        #             continue

        #         for rule_key, rule_info in rule_data['rules'].items():
        #             thread_num = self._extract_thread_from_key(rule_key)
        #             if thread_num is None or thread_num not in thread_list:
        #                 continue

        #             dates = rule_info.get('dates', [])
        #             values = rule_info.get('values', [])

        #             try:
        #                 idx = dates.index(date)
        #                 val = values[idx] if idx < len(values) else None
        #             except ValueError:
        #                 continue

        #             if val is not None:
        #                 thread_values[thread_num] = val

        #     if not thread_values:
        #         continue

        #     # 计算平均值作为基准
        #     avg_val = sum(thread_values.values()) / len(thread_values)

        #     # 对每个线程计算与平均值的差异
        #     sorted_threads = sorted(thread_list, key=lambda x: -1 if x == -1 else x)
        #     for t in sorted_threads:
        #         val = thread_values.get(t)
        #         if val is None:
        #             continue

        #         diff = val - avg_val
        #         diff_percent = 0 if avg_val == 0 else round((diff / avg_val) * 100, 2)
        #         diff_value = diff_percent if error_mode == 'percentage' else diff

        #         # 使用 Runtime 阈值判断状态（多线程对比使用 Runtime 阈值）
        #         status = self._get_status(diff_value, True, runtime_threshold, memory_threshold)

        #         display_diff = diff_percent if error_mode == 'percentage' else diff
        #         row.append(f"{t}线程")
        #         row.append(round(val, 2))
        #         row.append(round(display_diff, 2))
        #         row.append(status)
        #         has_data = True
        #         total_comparisons += 1

        #     if has_data:
        #         comparison_results.append(row)

        return {
            'statistics': {
                'totalComparisons': total_comparisons
            },
            'comparisons': comparison_results
        }

    # ==================== 辅助方法 ====================

    def _match_thread(self, rule_key: str, thread: int) -> bool:
        """检查规则名称是否匹配指定线程"""
        thread_str = str(thread)
        if thread == -1:
            return '(' not in rule_key or f'({thread_str})' in rule_key
        return f'({thread_str})' in rule_key

    def _extract_thread_from_key(self, rule_key: str) -> Optional[int]:
        """从规则名称中提取线程数"""
        if '(' in rule_key and ')' in rule_key:
            try:
                thread_str = rule_key.split('(')[1].split(')')[0]
                if thread_str.isdigit() or thread_str == '-1':
                    return int(thread_str)
            except (ValueError, IndexError):
                pass
        return None

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

    def _update_statistics(self, statistics: Dict, type_name: str, status: str,
                           rule: str, diff_value: float):
        """更新统计信息"""
        key = f"{type_name}_increased" if status == '⬆️增加' else f"{type_name}_decreased"
        if status != '· 无变化':
            statistics[key][rule] = abs(diff_value)
            max_key = f"max_{type_name}_increased" if status == '⬆️增加' else f"max_{type_name}_decreased"
            if statistics[max_key]['value'] < abs(diff_value):
                statistics[max_key] = {'name': rule, 'value': abs(diff_value)}

    # 然后在 DataManager 类中添加或替换 compare_data 方法
    def compare_data(self,
                    tool_id: str,
                    mode: str,
                    casename: str,
                    date1: str = None,
                    date2: str = None,
                    compare_mode: List[str] = ['all'],
                    dimension: str = None,
                    runtime_threshold: float = 0,
                    memory_threshold: float = 0,
                    error_mode: str = 'absolute',
                    threads: List[int] = None,
                    compare_type: str = 'single') -> Dict:
        """
        数据对比 - 使用 DataComparer
        """

        return self.compare(
            tool_id=tool_id,
            casename=casename,
            dimension=dimension,
            rules=compare_mode,
            threads=threads,
            date1=date1,
            date2=date2,
            error_mode=error_mode,
            runtime_threshold=runtime_threshold,
            memory_threshold=memory_threshold,
            compare_type=compare_type
        )
# 全局实例
comparer = DataComparer()