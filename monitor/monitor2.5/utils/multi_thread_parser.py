"""
多线程数据解析器 - 专门处理多线程数据
"""
from typing import Dict, List, Any, Optional, Set
from utils.common import *
from utils.log import *
from config import DATA_DIR, BASE_DIR



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
        self.logger.info(f"开始解析多线程数据，模式：{mode}，工具ID：{tool_id}")
        casename_rule_dates = {}
        for casename, case_data in data.items():

            case_data_runtime_json_path = DATA_DIR / tool_id / "original" / mode / casename / "runtime" 
            case_data_memory_json_path = DATA_DIR / tool_id / "original" / mode / casename / "memory" 
            if not case_data_runtime_json_path.exists():
                case_data_runtime_json_path.mkdir(parents=True, exist_ok=True)
            if not case_data_memory_json_path.exists():
                case_data_memory_json_path.mkdir(parents=True, exist_ok=True)

            case_pasre_data, threads_result = self.parse_case_data(case_data)
            rule_dates_runtime = {}
            rule_dates_memory = {}
            for rule, rule_data in case_pasre_data.items():
                self.increment_rule_data(rule_data["runtime"], case_data_runtime_json_path / f"{rule}.json")
                self.increment_rule_data(rule_data["memory"], case_data_memory_json_path / f"{rule}.json")

                rule_dates_runtime[rule] = {
                    "dates": rule_data["runtime"].get("dates", []),
                    "all_threads": rule_data["runtime"].get("all_threads", []),
                }
                rule_dates_memory[rule] = {
                    "dates": rule_data["memory"].get("dates", []),
                    "all_threads": rule_data["memory"].get("all_threads", []),
                }

            casename_rule_dates[casename] = {"runtime": rule_dates_runtime, "memory": rule_dates_memory}
            for date, rule_data in threads_result.items():
                for rule, thread_metrics in rule_data.items():
                    threads_json_path = DATA_DIR / tool_id / "original" / "thread" / casename / date / f"{rule}.json"
                    threads_json_path.parent.mkdir(parents=True, exist_ok=True)

                    threads = sorted(thread_metrics["threads"])
                    threads_result_sorted = {
                        "threads": threads,
                        "runtime": [thread_metrics["runtime"][thread_metrics["threads"].index(thread)] for thread in threads],
                        "memory": [thread_metrics["memory"][thread_metrics["threads"].index(thread)] for thread in threads],
                    }
                    save_tool_data(threads_json_path, threads_result_sorted)



        return casename_rule_dates
        # 根据前端需要返回数据结构

    def parse_case_data(self, case_data: Dict):
        daily_metrics = case_data.get('daily_metrics', {})
        dates = sorted(list(daily_metrics.keys()))

        threads_result = {}
        crash_dates = []
        parse_result = {}
        for date in dates:
            threads_result[date] = {}
            metrics_rules = daily_metrics.get(date, {})
            if "Overall" in metrics_rules and date not in crash_dates:
                crash_dates.append(date)

            for rule, thread_metrics in metrics_rules.items():
                if rule not in threads_result[date]:
                    threads_result[date][rule] = {'threads': [], 'runtime': [], 'memory': []}
                if rule not in parse_result:
                    parse_result[rule] = {
                        "runtime": {"dates": [], "rules": {}, "crash_dates": [], "overall_data": None, "all_threads": []},
                        "memory": {"dates": [], "rules": {}, "crash_dates": [], "overall_data": None, "all_threads": []},
                    }

                parse_result[rule]["runtime"]["crash_dates"] = crash_dates
                parse_result[rule]["runtime"], threads_result[date][rule] = self.parse_rule_runtime_and_memory(
                    rule, thread_metrics, date, parse_result[rule]["runtime"], "runtime", threads_result[date][rule]
                )
                parse_result[rule]["memory"]["crash_dates"] = crash_dates
                parse_result[rule]["memory"], threads_result[date][rule] = self.parse_rule_runtime_and_memory(
                    rule, thread_metrics, date, parse_result[rule]["memory"], "memory", threads_result[date][rule]
                )

        return parse_result, threads_result


    def parse_rule_runtime_and_memory(self, rule: str, thread_metrics: Dict, date: str, parse_result: Dict, mode: str, threads_result: Dict):
        """解析规则的运行时间或内存数据。"""
        for thread_key, thread_data in thread_metrics.get('thread_metrics', {}).items():
            if date not in parse_result["dates"]:
                parse_result["dates"].append(date)

            parse_result["rules"] = self.parse_gen_runtime_or_memory(parse_result["rules"], rule, thread_key, date, mode, thread_data)

            thread_num = int(thread_key)
            if thread_num not in parse_result["all_threads"]:
                parse_result["all_threads"].append(thread_num)
            if thread_num not in threads_result['threads']:
                threads_result['threads'].append(thread_num)
                threads_result['runtime'].append(thread_data.get('runtime'))
                threads_result['memory'].append(thread_data.get('memory'))

        return parse_result, threads_result

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
                    
    def increment_rule_data(self, rule_data, rule_data_path):
        if rule_data_path.exists():
            self.logger.info(f"多线程增量更新数据 {rule_data_path} 中 ...")
            old_rule_date = load_tool_data(rule_data_path) or {}
            new_rule_data = {
                "dates": list(old_rule_date.get("dates", [])) + list(rule_data.get("dates", [])),
                "rules": {},
                "crash_dates": list(set(old_rule_date.get("crash_dates", []) + rule_data.get("crash_dates", []))),
                "overall_data": rule_data.get("overall_data"),
                "all_threads": sorted(set(old_rule_date.get("all_threads", []) + rule_data.get("all_threads", []))),
            }

            for rule_thread, rule_thread_data in rule_data.get("rules", {}).items():
                old_thread_data = old_rule_date.get("rules", {}).get(rule_thread, {})
                new_rule_data["rules"][rule_thread] = {
                    "dates": list(old_thread_data.get("dates", [])) + list(rule_thread_data.get("dates", [])),
                    "values": list(old_thread_data.get("values", [])) + list(rule_thread_data.get("values", [])),
                    "type": rule_thread_data.get("type", "line"),
                    "name": rule_thread_data.get("name", rule_thread),
                    "thread": rule_thread_data.get("thread"),
                    "color": rule_thread_data.get("color"),
                    "rule_name": rule_thread_data.get("rule_name", rule_thread),
                    "is_multi": rule_thread_data.get("is_multi", True),
                }

            if old_rule_date.get("rules"):
                for rule_thread, old_thread_data in old_rule_date.get("rules", {}).items():
                    if rule_thread not in new_rule_data["rules"]:
                        new_rule_data["rules"][rule_thread] = old_thread_data
        else:
            self.logger.info(f"多线程增量更新数据 {rule_data_path} 不存在，直接保存 ...")
            new_rule_data = rule_data

        save_tool_data(rule_data_path, new_rule_data)

