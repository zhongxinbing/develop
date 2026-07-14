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
            case_pasre_data,threads_result = self.parse_case_data(case_data)
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
            # 保存线程数据
            for date,rule_data in threads_result.items():
                
                for rule,thread_metrics in rule_data.items():
                    threads_json_path = DATA_DIR / tool_id / "original" / "thread" / casename / date / f"{rule}.json"
                    threads_result_sorted = {'threads':[],'runtime':[],'memory':[]}
                    if not threads_json_path.parent.exists():
                        threads_json_path.parent.mkdir(parents=True, exist_ok=True)

                    threads = sorted(thread_metrics["threads"])
                    for thread in threads:
                        index = thread_metrics["threads"].index(thread)
                        threads_result_sorted["threads"].append(thread)
                        threads_result_sorted["runtime"].append(thread_metrics["runtime"][index])
                        threads_result_sorted["memory"].append(thread_metrics["memory"][index])

                    save_tool_data(threads_json_path, threads_result_sorted)



        return casename_rule_dates
        # 根据前端需要返回数据结构

    def parse_case_data(self, case_data: Dict):
        daily_metrics = case_data.get('daily_metrics', {})
        dates = sorted(list(daily_metrics.keys()))
        
        # 解析多线程数据
        threads_result = {} # 线程数数据；为线程曲线准备chart数据
        crash_dates = []
        parse_result = {} 
        for date in dates:
            if date not in threads_result:
                threads_result[date] = {}
            metrics_rules = daily_metrics.get(date, {})
            if "Overall" in metrics_rules and date not in crash_dates:
                crash_dates.append(date)
            # 解析每个规则的运行时间或内存数据
            for rule,thread_metrics in metrics_rules.items():
                if rule not in threads_result[date]:
                    threads_result[date][rule] = {'threads':[],'runtime':[],'memory':[]}
                if rule not in parse_result :
                    parse_result[rule] = {}
                    parse_result[rule]["runtime"] = {"dates":[],"rules": {},"crash_dates": [],"overall_data": None,"all_threads": []}
                    parse_result[rule]["memory"] = {"dates":[],"rules": {},"crash_dates": [],"overall_data": None,"all_threads": []}
                # 解析运行时间数据
                parse_result[rule]["runtime"]["crash_dates"] = crash_dates
                parse_result[rule]["runtime"],threads_result[date][rule] = self.parse_rule_runtime_and_memory(rule, thread_metrics, date, parse_result[rule]["runtime"],"runtime",threads_result[date][rule] )
                # 解析内存数据
                parse_result[rule]["memory"]["crash_dates"] = crash_dates
                parse_result[rule]["memory"],threads_result[date][rule] = self.parse_rule_runtime_and_memory(rule, thread_metrics, date, parse_result[rule]["memory"],"memory",threads_result[date][rule])

        return parse_result,threads_result


    def parse_rule_runtime_and_memory(self, rule: str, thread_metrics: Dict, date: str, parse_result: Dict, mode: str, threads_result: Dict):
        """
        解析规则的运行时间或内存数据
        
        参数:
            rule: 规则名称
            thread_metrics: 线程数据字典
            date: 日期
            parse_result: 解析结果字典
            mode: 解析模式（runtime/memory）
            threads_result: 线程数数据字典
        返回:
            None
        """
        for thread_key, thread_data in thread_metrics.get('thread_metrics', {}).items():
            self.logger.error(f"解析线程数据，规则：{rule}，线程：{thread_key}，日期：{parse_result["dates"]}")
            if date not in parse_result["dates"]:
                parse_result["dates"].append(date)

            parse_result["rules"] = self.parse_gen_runtime_or_memory(parse_result["rules"], rule, thread_key, date, mode, thread_data)

            if int(thread_key) not in parse_result["all_threads"]:
                parse_result["all_threads"].append(int(thread_key))
            # 线程数数据
            if int(thread_key) not in threads_result['threads']:
                threads_result['threads'].append(int(thread_key))
                threads_result['runtime'].append(thread_data.get('runtime'))
                threads_result['memory'].append(thread_data.get('memory'))

        return parse_result,threads_result

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
            old_rule_date = load_tool_data(rule_data_path)
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
        save_tool_data(rule_data_path, new_rule_data)

