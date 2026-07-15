"""
数据管理器 - 处理数据获取和解析
"""
from importlib.metadata import files
import importlib.util
from json import tool
from os import path
from random import choice

from pathlib import Path
from typing import Dict, Any, Optional, Callable, List
from datetime import datetime
from threading import Lock
import concurrent.futures

from config import DATA_DIR, BASE_DIR
from utils.tool_manager import tool_manager
from utils.find_files import find
from utils.data_parser import data_parser
from utils.log import *
from utils.common import *

class DataManager:
    """数据管理器，负责调用用户配置的函数获取数据"""
    
    _instance = None
    _lock = Lock()
    _function_cache = {}
    
    def __new__(cls):
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = super().__new__(cls)
        return cls._instance
    
    def __init__(self):
        # 缓存用户配置的函数，避免重复加载
        self._function_cache = {}
        self.data_files = {}
        # 线程池用于后台解析，避免在 HTTP 请求中阻塞
        self._executor = concurrent.futures.ThreadPoolExecutor(max_workers=2)
        # 记录正在进行的解析任务，key 使用 "{tool_id}:{type}"
        self._parsing_tasks: Dict[str, concurrent.futures.Future] = {}
        setup_logger(log_dir='logs', level='DEBUG')
        self.logger = get_logger(__name__)
        self.logger.info("数据管理器初始化")
        
    # 判断用户数据目录是否存在以及数据是否需要更新，如果不存在则创建
    def create_user_data_dir(self, user_id: str, tool_id: str) -> Path:
        """
            判断用户目录是否存在，如果不存在则创建:
        """
        user_data_dir = DATA_DIR / tool_id / user_id
        if not user_data_dir.exists():
            user_data_dir.mkdir(parents=True, exist_ok=True)
            self.logger.info(f"创建用户数据目录: {user_data_dir}，并copy相应的文件")
        else:
            self.logger.info(f"用户数据目录: {user_data_dir} 已存在")

    # 加载对应工具对应的类型需要的函数
    def _load_function(self, function_name: str, tool_config) -> Optional[Callable]:
        """动态加载Python函数"""
        tool_name = tool_config.get('tool_name')
        # 在 tool 目录下查找对应工具的函数模块
        
        script_path = BASE_DIR / "tool" / tool_name /f"{tool_name}.py"
        cache_key = f"{script_path}:{function_name}"
        
        if cache_key in self._function_cache:
            return self._function_cache[cache_key]

        try:
            if Path(script_path).exists():
                spec = importlib.util.spec_from_file_location(
                    f"dynamic_module_{tool_name}_{hash(script_path)}", 
                    script_path
                )
                if spec and spec.loader:
                    module = importlib.util.module_from_spec(spec)
                    spec.loader.exec_module(module)
                    func = getattr(module, function_name, None)
                    if func and callable(func):
                        self._function_cache[cache_key] = func
                        return func
            else:
                self.logger.error(f"路径不存在：{script_path}")
                return None
            
            self.logger.error(f"无法加载函数: {function_name}")
            return None
        except Exception as e:
            self.logger.error(f"加载函数失败 {function_name}: {e}")
            return None

    # 加载工具数据从文件
    def get_all_data(self, tool_id: str, user_id: str, type):
        """
        加载工具数据从文件
        """
        data_files_json_path = DATA_DIR / tool_id  / f"dataFiles.json"

        self.logger.info(f"工具 {tool_id} 加载 {type} 数据")
        # 获取工具配置，这里获取的一定是最新的数据
        self._config = tool_manager._config["tools"][tool_id]
        func = self._load_function(self._config.get(f'{type}_thread_func'), self._config)
        new_data_files_paths = func(self._config.get(f'{type}_thread_path'), 0)

        # 如果缓存中没有数据，重新获取所有的数据; 包含 单线程、多线程、额外数据
        if not data_files_json_path.exists():
            # 如果缓存中没有数据，说明是第一次加载数据，直接返回
            data = func(new_data_files_paths, 1)
            self.data_files[type] = new_data_files_paths
            self.logger.info(f"用户 {user_id} 第一次加载 {type} 数据，返回所有数据")
        else:
            # 从文件加载旧数据
            self.data_files = load_tool_data(data_files_json_path)
            if type in self.data_files:
                old_data_files_paths = self.data_files[type]
                # 对比新增数据
                add_data_files_paths = set(new_data_files_paths) - set(old_data_files_paths)
            else:
                add_data_files_paths = new_data_files_paths
            # 对比新增数据
            if add_data_files_paths:
                # 如果有新增数据，从新加载
                data = func(add_data_files_paths, 1)
                self.logger.info(f"用户 {user_id} 新增 {type} 数据，返回新增数据")
                self.data_files[type] = new_data_files_paths
            else:
                # 如果没有新增数据，直接返回 None
                self.logger.info(f"用户 {user_id} 没有新增 {type} 数据")
                return None

        # 保存新增数据到文件
        save_tool_data(data_files_json_path, self.data_files)
        return data

    def _submit_background_parse(self, tool_id: str, data_type: str, raw_data):
        """提交后台解析任务，避免重复提交"""
        key = f"{tool_id}:{data_type}"
        # 如果已有正在进行的任务并未完成，直接返回
        future = self._parsing_tasks.get(key)
        if future and not future.done():
            self.logger.info(f"解析任务已在后台执行: {key}")
            return future

        def _job():
            try:
                self.logger.info(f"后台解析开始: {key}")
                parsed = data_parser.parse_all_data(tool_id, raw_data, data_type)
                target = DATA_DIR / tool_id / f"{data_type}.json"
                save_tool_data(target, parsed)
                self.logger.info(f"后台解析完成并保存: {target}")
                return parsed
            except Exception as e:
                self.logger.exception(f"后台解析失败 {key}: {e}")
                return None

        future = self._executor.submit(_job)
        self._parsing_tasks[key] = future
        return future

    # 发送数据到前端,渲染图表
    def send_data_to_frontend_for_chart(self,frond_data:Dict):
        tool_id = frond_data.get('toolID', '')
        casename = frond_data.get('casename', '')
        mode = frond_data.get('mode', 'single')
        chart_type = frond_data.get('chart_type', 'runtime')
        rules = frond_data.get('rules', [])
        dates = frond_data.get('dates', [])
        selected_threads = frond_data.get('selected_threads', [])
        data_path = DATA_DIR / tool_id / "original" / mode / casename  / chart_type / f'{rules[0]}.json'
        case_rule_data = load_tool_data(data_path)

        # 根据前端发送来的日期，筛选出对应的 values，并返回给前端
        chioce_data = {}
        # 设置第一层的 dates
        chioce_data["dates"] = dates

        for thread in selected_threads:
            if thread == -1:
                rule = rules[0]
            else:
                rule = f"{rules[0]}({thread})"

            # 设置 rules 中的dates
            chioce_data.setdefault("rules", {}).setdefault(rule, {})["dates"] = dates
            values = []
            crash_dates = []
            # 设置获取指定日期的数据
            for date in dates:
                if date not in case_rule_data["rules"][rule]["dates"]:
                    values.append(None)
                    crash_dates.append(date)
                else:
                    index = case_rule_data["rules"][rule]["dates"].index(date)
                    values.append(case_rule_data["rules"][rule]["values"][index])
                    if date in case_rule_data["crash_dates"] and date not in crash_dates:
                        crash_dates.append(date)

            chioce_data.setdefault("rules", {}).setdefault(rule, {})["values"] = values
            # 设置 rules 中的 type
            chioce_data.setdefault("rules", {}).setdefault(rule, {})["type"] = case_rule_data["rules"][rule]["type"]
            chioce_data.setdefault("rules", {}).setdefault(rule, {})["name"] = case_rule_data["rules"][rule]["name"]
            if mode == "single":
                chioce_data.setdefault("rules", {}).setdefault(rule, {})["is_single"] = case_rule_data["rules"][rule]["is_single"]
            else:
                chioce_data.setdefault("rules", {}).setdefault(rule, {})["thread"] = case_rule_data["rules"][rule]["thread"]
                chioce_data.setdefault("rules", {}).setdefault(rule, {})["color"] = case_rule_data["rules"][rule]["color"]
                chioce_data.setdefault("rules", {}).setdefault(rule, {})["rule_name"] = case_rule_data["rules"][rule]["rule_name"]
                chioce_data.setdefault("rules", {}).setdefault(rule, {})["is_multi"] = case_rule_data["rules"][rule]["is_multi"]

        chioce_data["crash_dates"] = crash_dates
        chioce_data["overall_data"] = case_rule_data["overall_data"]
        if mode == "multi":
            chioce_data["selected_threads"] = case_rule_data["all_threads"]
        return chioce_data


##################################################################################################################################################################
    def compare_data(self, 
        tool_id: str, 
        type: str,
        casename: str, 
        date1: str, 
        date2: str, 
        compare_mode: str = 'all',
        dimension: str = 'all',
        runtime_threshold: float = 0,
        memory_threshold: float = 0,
        error_mode: str = 'absolute'):
        """
        runtime_threshold: 运行时间阈值
        memory_threshold: 内存阈值
        error_mode: 错误模式，absolute 或 relative
        """
        if dimension != 'all' and dimension != 'runtime' and dimension != 'memory':
            return False
        # 对比所有 rule
        if compare_mode == "all":
            mode_path = DATA_DIR / tool_id / f"{type}.json"
            mode_data = load_tool_data(mode_path)
            rules = mode_data[casename]["runtime"].keys() | mode_data[casename]["memory"].keys()
        else:
            rules = [compare_mode]
        # 对比数据
        rule_data_compare_data_runtime = {}
        rule_data_compare_data_memory = {}
        for rule in rules:
            if dimension == 'all' or dimension == 'runtime':
                case_data_runtime = load_tool_data(DATA_DIR / tool_id / "original" / type / casename  /"runtime" / f"{rule}.json")
                date1_data, date2_data, runtime_diff, runtime_diff_percent = self.calculation_error(case_data_runtime, rule, date1, date2)
                rule_data_compare_data_runtime[rule] = {
                    "date1_data": date1_data,
                    "date2_data": date2_data,
                    "diff": runtime_diff,
                    "diff_percent": runtime_diff_percent,
                }
                
            if dimension == 'all' or dimension == 'memory':
                case_data_memory = load_tool_data(DATA_DIR / tool_id / "original" / type / casename  /"memory" / f"{rule}.json")
                date1_data, date2_data, memory_diff, memory_diff_percent = self.calculation_error(case_data_memory, rule, date1, date2)
                rule_data_compare_data_memory[rule] = {
                    "date1_data": date1_data,
                    "date2_data": date2_data,
                    "diff": memory_diff,
                    "diff_percent": memory_diff_percent,
                }

        return self.statistical_compare_result_data(rule_data_compare_data_runtime, rule_data_compare_data_memory, dimension, runtime_threshold, memory_threshold, error_mode)

    def calculation_rate(self,op1,op2):
        if op2 == 0:
            return 0
        return round(op1 / op2, 2)

    def calculation_error(self, data, rule: str, date1: str, date2: str):

        dates = data["rules"][rule]["dates"]
        index1 = dates.index(date1)
        date1_data = data["rules"][rule]["values"][index1]
        index2 = dates.index(date2)
        date2_data = data["rules"][rule]["values"][index2]

        diff = date2_data - date1_data
        diff_percent = round((diff / date1_data) * 100, 2)
        diff_percent = round(self.calculation_rate(diff, date1_data) * 100, 2)
        return date1_data, date2_data, diff, diff_percent

    def statistical_compare_result_data(self, runtime_data, memory_data, dimension: str, runtime_threshold: float, memory_threshold: float, error_mode: str):

        """
        runtime_threshold: 运行时间阈值
        memory_threshold: 内存阈值
        error_mode: 错误模式，absolute 或 relative
        """
        result = {}

        # 对比百分比阈值

        for rule in runtime_data:
            if error_mode == 'percentage':
                result[rule]["runtime"] =  self.judge_compare_reuslt(runtime_data, result, rule, "_percent", runtime_threshold)
            else:
                result[rule]["runtime"] = self.judge_compare_reuslt(runtime_data, result, rule, "", runtime_threshold)

        for rule in memory_data:
            if error_mode == 'percentage':
                result[rule]["memory"] = self.judge_compare_reuslt(memory_data, result, rule, "_percent", memory_threshold)
            else:
                result[rule]["memory"] = self.judge_compare_reuslt(memory_data, result, rule, "", memory_threshold)

        compare_result = {}
        comparisons = []
        if dimension == 'all':
            for rule, value in result.items():
                compare_result[rule] = value["runtime"] + value["memory"]
                comparisons.append([rule] + value["runtime"] + value["memory"])
        elif dimension == 'runtime':
            for rule, value in result.items():
                compare_result[rule] = value["runtime"]
                comparisons.append([rule] + value["runtime"])
        elif dimension == 'memory':
            for rule, value in result.items():
                compare_result[rule] = value["memory"]
                comparisons.append([rule] + value["memory"])

        statistics = self.statistics_compare_result_data(compare_result, dimension)

        return {"statistics": statistics, "comparisons": comparisons}

    def judge_compare_reuslt(self, data: dict, compare_result: dict, rule: str, diff: str, threshold: float):
        if rule not in compare_result:
            compare_result[rule] = {}

        date1_data = data[rule]["date1_data"]
        date2_data = data[rule]["date2_data"]
        diff = data[rule][f"diff{diff}"]

        if diff > threshold:
            return [date1_data,date2_data,diff, "⬆️增加"]
        elif diff == threshold:
            return [date1_data,date2_data,diff, "· 无变化"]
        else:
            return [date1_data,date2_data,diff, "⬇️减少"]

    # 统计对比结果
    def statistics_compare_result_data(self, compare_result_data: dict, dimension: str):
        statistics_tmp = {
            "runtime_increased": {}, 
            "runtime_decreased": {}, 
            "memory_increased": {}, 
            "memory_decreased": {},
            "avg_runtime_change": 0,
            "avg_memory_change": 0,
            "max_runtime_increased": [],
            "max_runtime_decreased": [],
            "max_memory_increased": [],
            "max_memory_decreased": [],
        }
        runtime_increased_tmp = {"name": "", "value": 0}
        runtime_decreased_tmp = {"name": "", "value": 0}   
        memory_increased_tmp = {"name": "", "value": 0}    
        memory_decreased_tmp = {"name": "", "value": 0}
        # statistics_tmp = {}
        for rule,value in compare_result_data.items():
            if dimension == "all":
                if value[3] == "⬆️增加":
                    statistics_tmp["runtime_increased"][rule] = value[2]
                    if runtime_increased_tmp["value"] < float(value[2]):
                        runtime_increased_tmp = {"name":rule, "value": float(value[2])}
                elif value[3] == "⬇️减少":
                    statistics_tmp["runtime_decreased"][rule] = value[2]
                    if runtime_decreased_tmp["value"] > float(value[2]):
                        runtime_decreased_tmp = {"name":rule, "value": float(value[2])}
                    
                # 内存对比
                if value[7] == "⬆️增加":
                    statistics_tmp["memory_increased"][rule] = value[6]
                    if memory_increased_tmp["value"] < float(value[6]):
                        memory_increased_tmp = {"name":rule, "value": float(value[6])}
                elif value[7] == "⬇️减少":
                    statistics_tmp["memory_decreased"][rule] = value[6]
                    if memory_decreased_tmp["value"] > float(value[6]):
                        memory_decreased_tmp = {"name":rule, "value": float(value[6])}
                    
            elif dimension == "runtime":
                if value[3] == "⬆️增加":
                    statistics_tmp["runtime_increased"][rule] = value[2]
                    if runtime_increased_tmp["value"] < float(value[2]):
                        runtime_increased_tmp = {"name":rule, "value": float(value[2])}
                elif value[3] == "⬇️减少":
                    statistics_tmp["runtime_decreased"][rule] = value[2]
                    if runtime_decreased_tmp["value"] > float(value[2]):
                        runtime_decreased_tmp = {"name":rule, "value": float(value[2])}
                    
            elif dimension == "memory":
                if value[3] == "⬆️增加":
                    statistics_tmp["memory_increased"][rule] = value[2]
                    if memory_increased_tmp["value"] < float(value[2]):
                        memory_increased_tmp = {"name":rule, "value": float(value[2])}
                elif value[3] == "⬇️减少":
                    statistics_tmp["memory_decreased"][rule] = value[2]
                    if memory_decreased_tmp["value"] > float(value[2]):
                        memory_decreased_tmp = {"name":rule, "value": float(value[2])}
        statistics = {}       
        if dimension == "all":
            statistics["runtime_increased"] = list(sorted(statistics_tmp["runtime_increased"].items(),key=lambda item: item[1], reverse=True))
            statistics["runtime_decreased"] = list(sorted(statistics_tmp["runtime_decreased"].items(),key=lambda item: item[1], reverse=True))
            statistics["max_runtime_increased"] = runtime_increased_tmp
            statistics["max_runtime_decreased"] = runtime_decreased_tmp
            # statistics["avg_runtime_change"] = (runtime_increased_tmp["value"] - runtime_decreased_tmp["value"]) / (runtime_increased_tmp["value"] + runtime_decreased_tmp["value"])
            statistics["avg_runtime_change"] = self.calculation_rate((runtime_increased_tmp["value"] - runtime_decreased_tmp["value"]), (runtime_increased_tmp["value"] + runtime_decreased_tmp["value"]))
            statistics["memory_increased"] = list(sorted(statistics_tmp["memory_increased"].items(),key=lambda item: item[1], reverse=True))
            statistics["memory_decreased"] = list(sorted(statistics_tmp["memory_decreased"].items(),key=lambda item: item[1], reverse=True))
            statistics["max_memory_increased"] = memory_increased_tmp
            statistics["max_memory_decreased"] = memory_decreased_tmp
            # statistics["avg_memory_change"] = (memory_increased_tmp["value"] - memory_decreased_tmp["value"]) / (memory_increased_tmp["value"] + memory_decreased_tmp["value"])
            statistics["avg_memory_change"] = self.calculation_rate((memory_increased_tmp["value"] - memory_decreased_tmp["value"]), (memory_increased_tmp["value"] + memory_decreased_tmp["value"]))
        elif dimension == "runtime":
            statistics["runtime_increased"] = list(sorted(statistics_tmp["runtime_increased"].items(),key=lambda item: item[1], reverse=True))
            statistics["runtime_decreased"] = list(sorted(statistics_tmp["runtime_decreased"].items(),key=lambda item: item[1], reverse=True))
            statistics["max_runtime_increased"] = runtime_increased_tmp
            statistics["max_runtime_decreased"] = runtime_decreased_tmp
            # statistics["avg_runtime_change"] = (runtime_increased_tmp["value"] - runtime_decreased_tmp["value"]) / (runtime_increased_tmp["value"] + runtime_decreased_tmp["value"])
            statistics["avg_runtime_change"] = self.calculation_rate((runtime_increased_tmp["value"] - runtime_decreased_tmp["value"]), (runtime_increased_tmp["value"] + runtime_decreased_tmp["value"]))
        elif dimension == "memory":
            statistics["memory_increased"] = list(sorted(statistics_tmp["memory_increased"].items(),key=lambda item: item[1], reverse=True))
            statistics["memory_decreased"] = list(sorted(statistics_tmp["memory_decreased"].items(),key=lambda item: item[1], reverse=True))
            statistics["max_memory_increased"] = memory_increased_tmp
            statistics["max_memory_decreased"] = memory_decreased_tmp
            # statistics["avg_memory_change"] = (memory_increased_tmp["value"] - memory_decreased_tmp["value"]) / (memory_increased_tmp["value"] + memory_decreased_tmp["value"])
            statistics["avg_memory_change"] = self.calculation_rate((memory_increased_tmp["value"] - memory_decreased_tmp["value"]), (memory_increased_tmp["value"] + memory_decreased_tmp["value"]))

        return statistics

###################################################################################################################################################################

    def load_single_chart(self, tool_id:str, user_id:str):
        print("===============================================================================================================================")
        self.logger.info(f"加载工具{tool_id}单线程数据")
        single = self.get_all_data(tool_id, user_id, "single")
        if single:
            # 需要更新数据，先返回缓存并在后台解析更新
            message = ' 单线程'
            cached = load_tool_data(DATA_DIR / tool_id / 'single.json') or {}
            # 提交后台解析任务
            try:
                self._submit_background_parse(tool_id, 'single', single)
            except Exception:
                self.logger.exception("提交后台解析任务失败: single")
            single_data = cached
        else:
            message = ''
            single_data = load_tool_data(DATA_DIR / tool_id / 'single.json') or {}

        return single_data, message

    def load_multi_chart(self, tool_id:str, user_id:str):
        print("===============================================================================================================================")
        self.logger.info(f"加载工具{tool_id}多线程数据")
        multi = self.get_all_data(tool_id, user_id, "multi")
        if multi:
            # 需要更新数据，先返回缓存并在后台解析更新
            message = ' 多线程'
            cached = load_tool_data(DATA_DIR / tool_id / 'multi.json') or {}
            try:
                self._submit_background_parse(tool_id, 'multi', multi)
            except Exception:
                self.logger.exception("提交后台解析任务失败: multi")
            multi_data = cached
        else:
            message = ''
            multi_data = load_tool_data(DATA_DIR / tool_id / 'multi.json') or {}
        return multi_data, message

    def load_extra_chart(self, tool_id:str, user_id:str):
        print("===============================================================================================================================")
        self.logger.info(f"加载工具{tool_id}其他数据")
        extra = self.get_all_data(tool_id, user_id, "extra_display")
        if extra:
            # 需要更新数据，先返回缓存并在后台解析更新
            message = ' 其他'
            cached = load_tool_data(DATA_DIR / tool_id / 'extra.json') or {}
            try:
                self._submit_background_parse(tool_id, 'extra_display', extra)
            except Exception:
                self.logger.exception("提交后台解析任务失败: extra_display")
            extra_data = cached
        else:
            message = ''
            extra_data= load_tool_data(DATA_DIR / tool_id / 'extra.json') or {}
        return extra_data, message

        
    def load_single_or_multi_chart(self, tool_id:str, user_id:str):
        all_data = {}
        tool_config = tool_manager._load_config()["tools"][tool_id]
        if tool_config['single_thread_path']:
            all_data['single'], single_message = self.load_single_chart(tool_id, user_id)
        else:
            single_message = f"工具{tool_id}单线程数据不存在，请更新配置!!!"
        
        if tool_config['multi_thread_path']:
            all_data['multi'], multi_message = self.load_multi_chart(tool_id, user_id)
        else:
            multi_message = ''
        
        if tool_config['extra_display_path']:
            all_data['extra'], extra_message = self.load_extra_chart(tool_id, user_id)
        else:
            extra_message = ''

        message = f"{single_message}"+ f"{multi_message}"+ f"{extra_message}"
        if message == '':
            message = '数据不需要更新'
        else:
            message = '更新' + message

        return all_data, message


    def load_thread_chart(self, request_data: Dict):
        casename = request_data.get('casename', '')
        rule = request_data.get('rule', '')
        date = request_data.get('date', '')
        tool_id = request_data.get('toolID', '')
        mode = request_data.get('mode', 'all')

        case_rule_data_json_path = DATA_DIR / tool_id / "original" / "thread" / casename / date / f"{rule}.json"
        if not case_rule_data_json_path.exists():
            self.logger.error(f"线程数据文件不存在: {case_rule_data_json_path}")
            return {}
        
        case_rule_data = load_tool_data(case_rule_data_json_path)

        return case_rule_data
        
# # 全局实例
data_manager = DataManager()