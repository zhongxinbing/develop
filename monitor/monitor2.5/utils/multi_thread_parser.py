"""
多线程数据解析器 - 专门处理多线程数据
"""
from typing import Dict, List, Any, Optional, Set
from utils.common import get_thread_color, normalize_thread_key
from utils.log import *
from config import DATA_DIR, BASE_DIR
from utils.data_manager import data_manager


class MultiThreadParser:
    """多线程数据解析器"""
    
    def __init__(self):
        setup_logger(log_dir='logs', level='DEBUG')
        self.logger = get_logger(__name__)
        self.logger.info("多线程数据解析器初始化")


    def parse_multi_data(self, tool_id: str, mode: str, data: Dict[str, Any]):
        """
        解析多线程数据
        
        参数:
            tool_id: 工具ID
            mode: 解析模式（single/multi）
            data: 所有数据字典，包含single/multi/extra数据      
        """
        print("-----------------------------------------------------------------------------------------------------------------------------------------------------")
        self.logger.info(f"开始解析多线程数据，模式：{mode}，工具ID：{tool_id}")
        casename_rule_dates = {}
        for casename, case_data in data.items():

            case_data_runtime_json_path = DATA_DIR / tool_id / "original" / mode / casename / "runtime" 
            case_data_memory_json_path = DATA_DIR / tool_id / "original" / mode / casename / "memory" 
            if not case_data_runtime_json_path.exists():
                case_data_runtime_json_path.mkdir(parents=True, exist_ok=True)
            if not case_data_memory_json_path.exists():
                case_data_memory_json_path.mkdir(parents=True, exist_ok=True)

            # 解析出 casename 中所有 rule 的 data
            case_pasre_data = self.parse_case_data(case_data)
            # 增量更新数据
            rule_dates_runtime = {}
            rule_dates_memory = {}
            for rule, rule_data in case_pasre_data.items():
                # 增量增加数据并记录
                self.increment_rule_data(rule_data["runtime"], case_data_runtime_json_path / f"{rule}.json")

                rule_dates_runtime.setdefault(rule, {})["dates"] = rule_data["runtime"].get("dates", [])
                rule_dates_runtime.setdefault(rule, {})["all_threads"] = rule_data["runtime"].get("all_threads", [])


                self.increment_rule_data(rule_data["memory"], case_data_memory_json_path / f"{rule}.json")
                rule_dates_memory.setdefault(rule, {})["dates"] = rule_data["memory"].get("dates", [])
                rule_dates_memory.setdefault(rule, {})["all_threads"] = rule_data["memory"].get("all_threads", [])

            casename_rule_dates[casename] = {"runtime": rule_dates_runtime, "memory": rule_dates_memory}

        return casename_rule_dates
        # 根据前端需要返回数据结构

    def parse_case_data(self, case_data: Dict):
        daily_metrics = case_data.get('daily_metrics', {})
        dates = sorted(list(daily_metrics.keys()))

        # 解析多线程数据
        crash_dates = []
        parse_result = {} 
        for date in dates:
            metrics_rules = daily_metrics.get(date, {})
            if "Overall" in metrics_rules and date not in crash_dates:
                crash_dates.append(date)
            # 解析每个规则的运行时间或内存数据
            for rule,thread_metrics in metrics_rules.items():
                if rule not in parse_result:
                    parse_result[rule] = {}
                    parse_result[rule]["runtime"] = {"dates":[],"rules": {},"crash_dates": [],"overall_data": None,"all_threads": []}
                    parse_result[rule]["memory"] = {"dates":[],"rules": {},"crash_dates": [],"overall_data": None,"all_threads": []}
                # 解析运行时间数据
                parse_result[rule]["runtime"]["crash_dates"] = crash_dates
                parse_result[rule]["runtime"] = self.parse_rule_runtime_and_memory(rule, thread_metrics, date, parse_result[rule]["runtime"],"runtime")
                # 解析内存数据
                parse_result[rule]["memory"]["crash_dates"] = crash_dates
                parse_result[rule]["memory"] = self.parse_rule_runtime_and_memory(rule, thread_metrics, date, parse_result[rule]["memory"],"memory")

        return parse_result  


    def parse_rule_runtime_and_memory(self, rule: str, thread_metrics: Dict, date: str, parse_result: Dict, mode: str):

        for thread_key, thread_data in thread_metrics.get('thread_metrics', {}).items():
            if date not in parse_result["crash_dates"]:
                parse_result["dates"].append(date)

            parse_result["rules"] = self.parse_gen_runtime_or_memory(parse_result["rules"], rule, thread_key, date, mode, thread_data)

            if int(thread_key) not in parse_result["all_threads"]:
                parse_result["all_threads"].append(int(thread_key))

        return parse_result

    def parse_gen_runtime_or_memory(self, parse_result: Dict, rule: str, thread: str, date: str, mode: str, data: Dict):
        """
        解析通用的运行时间或内存数据
        
        参数:
            parse_result: 解析结果字典
            rule: 规则名称
            thread: 线程名称
            date: 日期
            mode: 解析模式（runtime/memory）
            data: 线程数据字典 {"runtime": 0.0, "memory": 0.0}
        返回:
            None
        """
        rule_thread = f"{rule}({thread})"

        if rule_thread not in parse_result:
            parse_result[rule_thread] = {'dates': [],'values': [],'type': 'line','name': rule_thread,'thread': thread,'color': get_thread_color(thread),'rule_name': rule,'is_multi': True}

        parse_result[rule_thread]["dates"].append(date)
        parse_result[rule_thread]["values"].append(data.get(mode, 0.0))

        return parse_result
                    
    def increment_rule_data(self,rule_data, rule_data_path):
        new_rule_data = {}
        if rule_data_path.exists():
            self.logger.info(f"多线程增量更新数据 {rule_data_path} 中 ...")
            old_rule_date = data_manager.load_tool_data(rule_data_path)
            new_rule_data["dates"] = old_rule_date["dates"] + rule_data["dates"]
            new_rule_data["rules"] = {}
            for rule_thread, rule_thread_data in rule_data["rules"].items():
                new_rule_data["rules"].setdefault(rule_thread, {})["dates"] = old_rule_date["rules"][rule_thread]["dates"] + rule_thread_data["dates"]
                new_rule_data["rules"].setdefault(rule_thread, {})["values"] = old_rule_date["rules"][rule_thread]["values"] + rule_thread_data["values"]
                new_rule_data["rules"].setdefault(rule_thread, {})["type"] = rule_thread_data["type"]
                new_rule_data["rules"].setdefault(rule_thread, {})["name"] = rule_thread_data["name"]
                new_rule_data["rules"].setdefault(rule_thread, {})["thread"] = rule_thread_data["thread"]
                new_rule_data["rules"].setdefault(rule_thread, {})["color"] = rule_thread_data["color"]
                new_rule_data["rules"].setdefault(rule_thread, {})["rule_name"] = rule_thread_data["rule_name"]
                new_rule_data["rules"].setdefault(rule_thread, {})["is_multi"] = rule_thread_data["is_multi"]
            new_rule_data["crash_dates"] = list(set(old_rule_date["crash_dates"] + rule_data["crash_dates"]))
            new_rule_data["overall_data"] = rule_data["overall_data"]

            new_rule_data["all_threads"] = sorted(set(old_rule_date["all_threads"] + rule_data["all_threads"]))
        else:
            self.logger.info(f"多线程增量更新数据 {rule_data_path} 不存在，直接保存 ...")
            new_rule_data = rule_data
        data_manager.save_tool_data(rule_data_path, new_rule_data)



    @staticmethod
    def get_available_threads(self,
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
        self.logger.error(type(daily_metrics))
        for date, metrics in daily_metrics.items():
            target_rules = rules if rules else metrics.keys()
            for rule in target_rules:
                if rule not in metrics:
                    continue
                rule_metrics = metrics.get(rule, {})
                self.logger.warn(f"规则：{rule}，指标：{rule_metrics}")
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
        print(99999999999999999999999999999999999999999999)
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