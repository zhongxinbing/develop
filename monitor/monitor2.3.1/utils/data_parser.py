"""
数据解析器 - 解析和转换数据格式
支持单线程和多线程数据分离解析
"""
from typing import Dict, List, Any, Optional


class DataParser:
    """数据解析器"""
    
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
        解析Runtime图表数据
        
        参数:
            raw_data: 原始数据
            casename: 项目名称
            rules: 要显示的规则列表
            dates: 要显示的日期列表
            mode: 模式 - 'single', 'multi', 'thread'
            selected_threads: 多线程模式下选择的线程列表（自动选择最小线程）
        
        返回:
            图表数据格式
        """
        result = {
            'dates': dates,
            'rules': {},
            'crash_dates': [],
            'overall_data': None,
            'all_threads': [],
            'selected_threads': selected_threads or [0]
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
        
        if mode == 'single':
            return DataParser._parse_single_thread_runtime(
                result, daily_metrics, rules, dates
            )
        else:
            return DataParser._parse_multi_thread_runtime(
                result, daily_metrics, rules, dates, selected_threads or [0]
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
        解析Memory图表数据
        
        参数:
            raw_data: 原始数据
            casename: 项目名称
            rules: 要显示的规则列表
            dates: 要显示的日期列表
            mode: 模式 - 'single', 'multi', 'thread'
            selected_threads: 多线程模式下选择的线程列表（自动选择最小线程）
        
        返回:
            图表数据格式
        """
        result = {
            'dates': dates,
            'rules': {},
            'crash_dates': [],
            'overall_data': None,
            'all_threads': [],
            'selected_threads': selected_threads or [0]
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
        
        if mode == 'single':
            return DataParser._parse_single_thread_memory(
                result, daily_metrics, rules, dates
            )
        else:
            return DataParser._parse_multi_thread_memory(
                result, daily_metrics, rules, dates, selected_threads or [0]
            )
    
    @staticmethod
    def _parse_single_thread_runtime(
        result: Dict,
        daily_metrics: Dict,
        rules: List[str],
        dates: List[str]
    ) -> Dict:
        """解析单线程Runtime数据"""
        for rule in rules:
            values = []
            for date in dates:
                if date in daily_metrics:
                    rule_metrics = daily_metrics[date].get(rule)
                    if rule_metrics and isinstance(rule_metrics, dict) and 'thread_metrics' not in rule_metrics:
                        values.append(rule_metrics.get('runtime'))
                    else:
                        values.append(None)
                else:
                    values.append(None)
            
            result['rules'][rule] = {
                'dates': dates,
                'values': values,
                'type': 'line',
                'name': rule
            }
            
            if rule == 'Overall':
                result['overall_data'] = result['rules'][rule]
        
        return result
    
    @staticmethod
    def _parse_single_thread_memory(
        result: Dict,
        daily_metrics: Dict,
        rules: List[str],
        dates: List[str]
    ) -> Dict:
        """解析单线程Memory数据"""
        for rule in rules:
            values = []
            for date in dates:
                if date in daily_metrics:
                    rule_metrics = daily_metrics[date].get(rule)
                    if rule_metrics and isinstance(rule_metrics, dict) and 'thread_metrics' not in rule_metrics:
                        values.append(rule_metrics.get('memory'))
                    else:
                        values.append(None)
                else:
                    values.append(None)
            
            result['rules'][rule] = {
                'dates': dates,
                'values': values,
                'type': 'line',
                'name': rule
            }
            
            if rule == 'Overall':
                result['overall_data'] = result['rules'][rule]
        
        return result
    
    @staticmethod
    def _parse_multi_thread_runtime(
        result: Dict,
        daily_metrics: Dict,
        rules: List[str],
        dates: List[str],
        selected_threads: List[int]
    ) -> Dict:
        """解析多线程Runtime数据"""
        # 收集所有可用线程，统一转换为整数
        all_threads = set()
        for date in dates:
            if date in daily_metrics:
                for rule in rules:
                    rule_metrics = daily_metrics[date].get(rule, {})
                    thread_metrics = rule_metrics.get('thread_metrics', {})
                    for tk in thread_metrics.keys():
                        try:
                            # 统一转换为整数
                            thread_num = int(tk) if str(tk).isdigit() else 0
                            all_threads.add(thread_num)
                        except (ValueError, TypeError):
                            all_threads.add(0)
        
        result['all_threads'] = sorted(all_threads)
        
        # 线程颜色映射
        thread_colors = {
            0: '#00E5FF', 2: '#A855F7', 4: '#10B981',
            6: '#F59E0B', 8: '#EF4444', 16: '#8B5CF6',
            32: '#EC4899', 64: '#14B8A6', 128: '#F97316'
        }
        
        available_threads = result['all_threads']
        
        if not selected_threads or len(selected_threads) == 0:
            selected_threads = available_threads if available_threads else [0]
        
        result['selected_threads'] = selected_threads
        
        for rule in rules:
            for thread in available_threads:
                # 确保线程是整数
                thread_int = int(thread) if not isinstance(thread, int) else thread
                thread_key = str(thread_int)
                color = thread_colors.get(thread_int, '#A855F7')
                
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
                            found_val = thread_metrics[thread_key].get('runtime')
                        else:
                            for tk, tv in thread_metrics.items():
                                try:
                                    if int(tk) == thread_int:
                                        found_val = tv.get('runtime')
                                        break
                                except (ValueError, TypeError):
                                    if tk == thread_key:
                                        found_val = tv.get('runtime')
                                        break
                        
                        # 确保值是数字或None
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
                    'thread': thread_int,  # 使用整数
                    'color': color,
                    'rule_name': rule
                }
                
                if rule == 'Overall' and thread_int == (min(available_threads) if available_threads else 0):
                    result['overall_data'] = result['rules'][series_name]
        
        return result
    
    @staticmethod
    def _parse_multi_thread_memory(
        result: Dict,
        daily_metrics: Dict,
        rules: List[str],
        dates: List[str],
        selected_threads: List[int]
    ) -> Dict:
        """解析多线程Memory数据"""
        all_threads = set()
        for date in dates:
            if date in daily_metrics:
                for rule in rules:
                    rule_metrics = daily_metrics[date].get(rule, {})
                    thread_metrics = rule_metrics.get('thread_metrics', {})
                    for tk in thread_metrics.keys():
                        try:
                            thread_num = int(tk) if str(tk).isdigit() else 0
                            all_threads.add(thread_num)
                        except (ValueError, TypeError):
                            all_threads.add(0)
        
        result['all_threads'] = sorted(all_threads)
        
        thread_colors = {
            0: '#00E5FF', 2: '#A855F7', 4: '#10B981',
            6: '#F59E0B', 8: '#EF4444', 16: '#8B5CF6',
            32: '#EC4899', 64: '#14B8A6', 128: '#F97316'
        }
        
        available_threads = result['all_threads']
        
        if not selected_threads or len(selected_threads) == 0:
            selected_threads = available_threads if available_threads else [0]
        
        result['selected_threads'] = selected_threads
        
        for rule in rules:
            for thread in available_threads:
                thread_int = int(thread) if not isinstance(thread, int) else thread
                thread_key = str(thread_int)
                color = thread_colors.get(thread_int, '#A855F7')
                
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
                    'rule_name': rule
                }
                
                if rule == 'Overall' and thread_int == (min(available_threads) if available_threads else 0):
                    result['overall_data'] = result['rules'][series_name]
        
        return result


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
            # 查找匹配的线程数据
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
        values = []
        for t, metrics in thread_metrics.items():
            val = metrics.get(key)
            if val is not None:
                try:
                    values.append(float(val))
                except (ValueError, TypeError):
                    pass
        return sum(values) / len(values) if values else None
    
    @staticmethod
    def get_thread_options(
        raw_data: Dict,
        casename: str,
        rule: str = None
    ) -> Dict:
        """
        获取多线程模式下可用的线程数选项
        
        返回:
            {
                'threads': [0, 2, 4, ...],
                'default_threads': [0]  # 最小线程
            }
        """
        case_data = raw_data.get(casename, {})
        print(case_data)
        daily_metrics = case_data.get('daily_metrics', {})
        
        threads_set = set()
        
        for date, metrics in daily_metrics.items():
            if rule:
                rule_metrics = metrics.get(rule, {})
                if 'thread_metrics' in rule_metrics:
                    for tk in rule_metrics['thread_metrics'].keys():
                        try:
                            threads_set.add(int(tk))
                        except (ValueError, TypeError):
                            threads_set.add(0)
            else:
                for rule_name, rule_metrics in metrics.items():
                    if isinstance(rule_metrics, dict) and 'thread_metrics' in rule_metrics:
                        for tk in rule_metrics['thread_metrics'].keys():
                            try:
                                threads_set.add(int(tk))
                            except (ValueError, TypeError):
                                threads_set.add(0)
        
        threads = sorted(threads_set)
        # 默认选择最小线程数
        default_threads = [min(threads)] if threads else [0]
        
        return {
            'threads': threads,
            'default_threads': default_threads
        }

# 全局实例
data_parser = DataParser()