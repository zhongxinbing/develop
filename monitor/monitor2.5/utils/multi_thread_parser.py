"""
多线程数据解析器 - 专门处理多线程数据
"""
from typing import Dict, List, Any, Optional, Set
from utils.common import get_thread_color, normalize_thread_key


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
    def parse_for_runtime_chart(
        raw_data: Dict,
        casename: str,
        rules: List[str],
        dates: List[str],
        selected_threads: List[int] = None
    ) -> Dict:
        """
        解析多线程Runtime图表数据
        
        参数:
            raw_data: 原始数据
            casename: 项目名称
            rules: 要显示的规则列表
            dates: 要显示的日期列表
            selected_threads: 选择的线程列表
        
        返回:
            图表数据格式
        """
        result = {
            'dates': dates,
            'rules': {},
            'crash_dates': [],
            'overall_data': None,
            'all_threads': [],
            'selected_threads': selected_threads or []
        }
        
        case_data = raw_data.get(casename, {})
        daily_metrics = case_data.get('daily_metrics', {})
        
        # 获取所有可用线程
        all_threads = MultiThreadParser.get_available_threads(daily_metrics, casename, rules)
        result['all_threads'] = all_threads
        
        # 确定要显示的线程
        if not selected_threads:
            selected_threads = all_threads if all_threads else [0]
        result['selected_threads'] = selected_threads
        
        # 检查每个日期是否有Overall数据
        for date in dates:
            if date in daily_metrics:
                overall = daily_metrics[date].get('Overall')
                if not overall:
                    result['crash_dates'].append(date)
            else:
                result['crash_dates'].append(date)
        
        # 为每个规则和线程组合生成曲线
        for rule in rules:
            for thread in all_threads:
                if thread not in selected_threads:
                    continue
                    
                thread_int = int(thread) if not isinstance(thread, int) else thread
                thread_key = str(thread_int)
                color = get_thread_color(thread_int)
                
                series_name = f"{rule}({thread_int})"
                # if rule == 'Overall':
                #     # series_name = f"Overall ({thread_int}线程)"
                #     series_name = f"线程：{thread_int}"
                # else:
                #     series_name = f"{rule} ({thread_int}线程)"
                
                values = []
                for date in dates:
                    if date in daily_metrics:
                        rule_metrics = daily_metrics[date].get(rule, {})
                        thread_metrics = rule_metrics.get('thread_metrics', {})
                        
                        found_val = None
                        # 精确匹配线程键
                        if thread_key in thread_metrics:
                            found_val = thread_metrics[thread_key].get('runtime')
                        else:
                            # 尝试整数匹配
                            for tk, tv in thread_metrics.items():
                                try:
                                    if int(tk) == thread_int:
                                        found_val = tv.get('runtime')
                                        break
                                except (ValueError, TypeError):
                                    if tk == thread_key:
                                        found_val = tv.get('runtime')
                                        break
                        
                        if found_val is not None:
                            try:
                                found_val = float(found_val)
                            except (ValueError, TypeError):
                                found_val = None
                        values.append(found_val)
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
                if rule == 'Overall' and all_threads:
                    min_thread = min(all_threads)
                    if thread_int == min_thread:
                        result['overall_data'] = result['rules'][series_name]
        
        return result
    
    @staticmethod
    def parse_for_memory_chart(
        raw_data: Dict,
        casename: str,
        rules: List[str],
        dates: List[str],
        selected_threads: List[int] = None
    ) -> Dict:
        """
        解析多线程Memory图表数据
        
        参数:
            raw_data: 原始数据
            casename: 项目名称
            rules: 要显示的规则列表
            dates: 要显示的日期列表
            selected_threads: 选择的线程列表
        
        返回:
            图表数据格式
        """
        result = {
            'dates': dates,
            'rules': {},
            'crash_dates': [],
            'overall_data': None,
            'all_threads': [],
            'selected_threads': selected_threads or []
        }
        
        case_data = raw_data.get(casename, {})
        daily_metrics = case_data.get('daily_metrics', {})
        
        # 获取所有可用线程
        all_threads = MultiThreadParser.get_available_threads(daily_metrics, casename, rules)
        result['all_threads'] = all_threads
        
        if not selected_threads:
            selected_threads = all_threads if all_threads else [0]
        result['selected_threads'] = selected_threads
        
        for date in dates:
            if date in daily_metrics:
                overall = daily_metrics[date].get('Overall')
                if not overall:
                    result['crash_dates'].append(date)
            else:
                result['crash_dates'].append(date)
        
        for rule in rules:
            for thread in all_threads:
                if thread not in selected_threads:
                    continue
                    
                thread_int = int(thread) if not isinstance(thread, int) else thread
                thread_key = str(thread_int)
                color = get_thread_color(thread_int)
                
                if rule == 'Overall':
                    series_name = f"Overall ({thread_int}线程)"
                else:
                    series_name = f"{rule} ({thread_int}线程)"
                
                values = []
                for date in dates:
                    if date in daily_metrics:
                        rule_metrics = daily_metrics[date].get(rule, {})
                        thread_metrics = rule_metrics.get('thread_metrics', {})
                        
                        found_val = None
                        if thread_key in thread_metrics:
                            found_val = thread_metrics[thread_key].get('memory')
                        else:
                            for tk, tv in thread_metrics.items():
                                try:
                                    if int(tk) == thread_int:
                                        found_val = tv.get('memory')
                                        break
                                except (ValueError, TypeError):
                                    if tk == thread_key:
                                        found_val = tv.get('memory')
                                        break
                        
                        if found_val is not None:
                            try:
                                found_val = float(found_val)
                            except (ValueError, TypeError):
                                found_val = None
                        values.append(found_val)
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
                
                if rule == 'Overall' and all_threads:
                    min_thread = min(all_threads)
                    if thread_int == min_thread:
                        result['overall_data'] = result['rules'][series_name]
        
        return result
    
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
        
        return {
            'total': total,
            'avg': avg,
            'max': max_val,
            'min': min_val
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
        day_data = daily_metrics.get(date, {})
        rule_data = day_data.get(rule, {})
        thread_metrics = rule_data.get('thread_metrics', {})
        
        # 按线程数排序
        sorted_threads = []
        for tk in thread_metrics.keys():
            try:
                sorted_threads.append(int(tk))
            except (ValueError, TypeError):
                sorted_threads.append(0)
        sorted_threads = sorted(set(sorted_threads))
        
        for thread_num in sorted_threads:
            found_metrics = None
            for tk, metrics in thread_metrics.items():
                try:
                    if int(tk) == thread_num:
                        found_metrics = metrics
                        break
                except (ValueError, TypeError):
                    if tk == str(thread_num):
                        found_metrics = metrics
                        break
            
            if found_metrics:
                result['threads'].append(thread_num)
                result['runtimes'].append(found_metrics.get('runtime', 0))
                result['memories'].append(found_metrics.get('memory', 0))
        
        return result