"""
数据管理器 - 处理数据获取和解析
"""
import concurrent.futures
import importlib.util
import time
from pathlib import Path
from threading import Lock
from typing import Any, Callable, Dict, Optional

from config import BASE_DIR, DATA_DIR
from utils.common import *
from utils.data_parser import data_parser
from utils.log import get_logger, setup_logger
from utils.tool_manager import tool_manager

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
        self._function_cache = {}
        self.data_files = {}
        # 缓存数据，key 为 (user_id, tool_id, type)，value 为 (cached_at, data)
        self._cache_lock = Lock()
        # 缓存数据，key 为 (user_id, tool_id, type)，value 为 (cached_at, data)
        self._data_cache: Dict[tuple, tuple[float, Any]] = {}
        self._cache_ttl_seconds = 30
        # 创建线程池
        self._executor = concurrent.futures.ThreadPoolExecutor(max_workers=2)
        self._parsing_tasks: Dict[str, concurrent.futures.Future] = {}
        setup_logger(log_dir='logs', level='DEBUG')
        self.logger = get_logger(__name__)
        self.logger.info("数据管理器初始化")
        
    # 判断用户数据目录是否存在以及数据是否需要更新，如果不存在则创建
    def create_user_data_dir(self, user_id: str, tool_id: str) -> Path:
        """判断用户目录是否存在，如果不存在则创建。"""
        user_data_dir = DATA_DIR / tool_id / user_id
        if not user_data_dir.exists():
            user_data_dir.mkdir(parents=True, exist_ok=True)
            self.logger.info(f"创建用户数据目录: {user_data_dir}，并copy相应的文件")
        else:
            self.logger.info(f"用户数据目录: {user_data_dir} 已存在")
        return user_data_dir

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
        """加载工具数据，从缓存或文件中获取。"""
        cache_key = (user_id, tool_id, type)
        with self._cache_lock:
            cached_entry = self._data_cache.get(cache_key)
            if cached_entry is not None:
                cached_at, cached_value = cached_entry
                if time.time() - cached_at < self._cache_ttl_seconds:
                    return cached_value
                self._data_cache.pop(cache_key, None)

        data_files_json_path = DATA_DIR / tool_id / "dataFiles.json"

        self.logger.info(f"用户 {user_id} 加载工具 {tool_id} 的 {type} 数据到前端")
        tool_config = tool_manager.get_tool(tool_id) or {}
        if not tool_config:
            self.logger.error(f"工具配置不存在: {tool_id}")
            return {}

        func = self._load_function(tool_config.get(f'{type}_func'), tool_config)
        if not func:
            self.logger.error(f"无法加载工具 {type} 的 {type} 数据处理函数，请检查配置")
            return {}

        data_root = tool_config.get(f'{type}_path')
        if not data_root:
            return {}

        new_data_files_paths = list(func(data_root, 0) or [])

        if not data_files_json_path.exists():
            data = func(new_data_files_paths, 1) or []
            self.data_files[type] = list(new_data_files_paths)
            self.logger.info(f"用户 {user_id} 第一次加载 {type} 数据，返回所有数据")
        else:
            self.data_files = load_tool_data(data_files_json_path) or {}
            old_data_files_paths = list(self.data_files.get(type, []))
            add_data_files_paths = [path for path in new_data_files_paths if path not in old_data_files_paths]
            if add_data_files_paths:
                data = func(add_data_files_paths, 1) or []
                self.logger.info(f"用户 {user_id} 新增 {type} 数据，返回新增数据")
                self.data_files[type] = list(new_data_files_paths)
            else:
                self.logger.info(f"用户 {user_id} 没有新增 {type} 数据")
                data = None

        save_tool_data(data_files_json_path, self.data_files)
        with self._cache_lock:
            if data is not None:
                self._data_cache[cache_key] = (time.time(), data)
            else:
                self._data_cache.pop(cache_key, None)
        return data

    def _submit_background_parse(self, tool_id: str, data_type: str, raw_data, old_raw_data):
        """提交后台解析任务，避免重复提交"""
        key = f"{tool_id}:{data_type}"
        # 如果已有正在进行的任务并未完成，直接返回
        future = self._parsing_tasks.get(key)
        if future and not future.done():
            self.logger.info(f"解析任务已在后台执行: {key}")
            return future.result()

        def _job():
            try:
                self.logger.info(f"后台解析开始: {key}")
                parsed = data_parser.parse_all_data(tool_id, raw_data, data_type)
                target = DATA_DIR / tool_id / f"{data_type}.json"
                parsed = deep_merge(old_raw_data, parsed)
                save_tool_data(target, parsed)
                self.logger.info(f"后台解析完成并保存: {target}")
                return parsed
            except Exception as e:
                self.logger.exception(f"后台解析失败 {key}: {e}")
                return None

        future = self._executor.submit(_job)
        self._parsing_tasks[key] = future

        return future.result()

    @staticmethod
    def resolve_chart_group(chart_type: str) -> str:
        """将 cputime / easepletime / peakmem / incmem 归并到 runtime / memory 基础分组。"""
        key = (chart_type or 'runtime').strip().lower()
        runtime_aliases = {
            'runtime', 'cputime', 'realtime'
        }
        memory_aliases = {
            'memory', 'peakmem', 'incmem', 'realtimeincmem', 
        }
        if key in runtime_aliases:
            return 'runtime'
        if key in memory_aliases:
            return 'memory'
        return key

    # 发送数据到前端,渲染图表
    def send_data_to_frontend_for_chart(self, frond_data: Dict):
        tool_id = frond_data.get('toolID', '')
        casename = frond_data.get('casename', '')
        mode = frond_data.get('mode', 'single')
        chart_type = frond_data.get('chart_type', 'cputime')
        rules = frond_data.get('rules', [])
        dates = frond_data.get('dates', [])
        selected_threads = frond_data.get('selected_threads', [])

        if not rules:
            return {"dates": dates, "rules": {}, "crash_dates": [], "overall_data": {}, "selected_threads": []}
        
        data_path = DATA_DIR / tool_id / "original" / mode / casename / chart_type / f'{rules[0]}.json'
        if not data_path.exists():
            fallback_path = DATA_DIR / tool_id / "original" / mode / casename / chart_type / f'{rules[0]}.json'
            if fallback_path.exists():
                data_path = fallback_path
        case_rule_data = load_tool_data(data_path) or {}
        rules_data = case_rule_data.get("rules", {})
        crash_dates = set()

        chioce_data = {"dates": dates, "rules": {}, "crash_dates": [], "overall_data": case_rule_data.get("overall_data", {})}

        for thread in selected_threads:
            rule_key = rules[0] if thread == -1 else f"{rules[0]}({thread})"
            rule_info = rules_data.get(rule_key, {})
            if not rule_info:
                continue

            rule_dates = rule_info.get("dates", [])
            values = []
            for date in dates:
                if date not in rule_dates:
                    values.append(None)
                    crash_dates.add(date)
                else:
                    index = rule_dates.index(date)
                    values.append(rule_info.get("values", [None])[index])
                    if date in case_rule_data.get("crash_dates", []) and date not in crash_dates:
                        crash_dates.add(date)

            chioce_data["rules"][rule_key] = {
                "dates": dates,
                "values": values,
                "type": rule_info.get("type"),
                "name": rule_info.get("name"),
            }
            if mode == "single":
                chioce_data["rules"][rule_key]["is_single"] = rule_info.get("is_single")
            else:
                chioce_data["rules"][rule_key].update({
                    "thread": rule_info.get("thread"),
                    "color": rule_info.get("color"),
                    "rule_name": rule_info.get("rule_name"),
                    "is_multi": rule_info.get("is_multi"),
                })

        chioce_data["crash_dates"] = list(crash_dates)
        if mode == "multi":
            chioce_data["selected_threads"] = case_rule_data.get("all_threads", [])

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
        if dimension not in {'all', 'runtime', 'memory'}:
            return False

        if compare_mode == "all":
            mode_path = DATA_DIR / tool_id / f"{type}.json"
            mode_data = load_tool_data(mode_path) or {}
            case_data = mode_data.get(casename, {})
            rules = set(case_data.get("runtime", {}).keys()) | set(case_data.get("memory", {}).keys())
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
        rule_data = data.get("rules", {}).get(rule, {})
        dates = rule_data.get("dates", [])
        values = rule_data.get("values", [])

        try:
            index1 = dates.index(date1)
            index2 = dates.index(date2)
        except ValueError:
            return None, None, 0, 0

        date1_data = values[index1] if index1 < len(values) else None
        date2_data = values[index2] if index2 < len(values) else None

        if date1_data is None or date2_data is None:
            return date1_data, date2_data, 0, 0

        diff = date2_data - date1_data
        diff_percent = 0 if date1_data == 0 else round(self.calculation_rate(diff, date1_data) * 100, 2)
        return date1_data, date2_data, diff, diff_percent

    def statistical_compare_result_data(self, runtime_data, memory_data, dimension: str, runtime_threshold: float, memory_threshold: float, error_mode: str):
        """
        runtime_threshold: 运行时间阈值
        memory_threshold: 内存阈值
        error_mode: 错误模式，absolute 或 relative
        """
        result = {}

        for rule in runtime_data:
            diff_key = "diff_percent" if error_mode == 'percentage' else "diff"
            result.setdefault(rule, {})["runtime"] = self.judge_compare_reuslt(runtime_data, rule, diff_key, runtime_threshold)

        for rule in memory_data:
            diff_key = "diff_percent" if error_mode == 'percentage' else "diff"
            result.setdefault(rule, {})["memory"] = self.judge_compare_reuslt(memory_data, rule, diff_key, memory_threshold)

        compare_result = {}
        comparisons = []
        if dimension == 'all':
            for rule, value in result.items():
                runtime_value = value.get("runtime", [None, None, 0, "· 无变化"])
                memory_value = value.get("memory", [None, None, 0, "· 无变化"])
                compare_result[rule] = runtime_value + memory_value
                comparisons.append([rule] + runtime_value + memory_value)
        elif dimension == 'runtime':
            for rule, value in result.items():
                runtime_value = value.get("runtime", [None, None, 0, "· 无变化"])
                compare_result[rule] = runtime_value
                comparisons.append([rule] + runtime_value)
        elif dimension == 'memory':
            for rule, value in result.items():
                memory_value = value.get("memory", [None, None, 0, "· 无变化"])
                compare_result[rule] = memory_value
                comparisons.append([rule] + memory_value)

        statistics = self.statistics_compare_result_data(compare_result, dimension)

        return {"statistics": statistics, "comparisons": comparisons}

    def judge_compare_reuslt(self, data: dict, rule: str, diff_key: str, threshold: float):
        date1_data = data[rule]["date1_data"]
        date2_data = data[rule]["date2_data"]
        diff = data[rule][diff_key]

        if diff > threshold:
            return [date1_data, date2_data, diff, "⬆️增加"]
        if diff == threshold:
            return [date1_data, date2_data, diff, "· 无变化"]
        return [date1_data, date2_data, diff, "⬇️减少"]

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
        self.logger.info(f"加载工具{tool_id}单线程数据")
        single = self.get_all_data(tool_id, user_id, "single")

        if single:
            # 需要更新数据，先返回缓存并在后台解析更新
            message = ' 单线程'
            cached = load_tool_data(DATA_DIR / tool_id / 'single.json') or {}
            # 提交后台解析任务
            try:
                cached = self._submit_background_parse(tool_id, 'single', single, cached)
            except Exception:
                self.logger.exception("提交后台解析任务失败: single")
            single_data = cached
        else:
            message = ''
            single_data = load_tool_data(DATA_DIR / tool_id / 'single.json') or {}

        return single_data, message

    def load_multi_chart(self, tool_id:str, user_id:str):
        self.logger.info(f"加载工具{tool_id}多线程数据")
        multi = self.get_all_data(tool_id, user_id, "multi")
        if multi:
            # 需要更新数据，先返回缓存并在后台解析更新
            message = ' 多线程'
            cached = load_tool_data(DATA_DIR / tool_id / 'multi.json') or {}
            try:
                cached = self._submit_background_parse(tool_id, 'multi', multi, cached)
            except Exception:
                self.logger.exception("提交后台解析任务失败: multi")
            multi_data = cached
        else:
            message = ''
            multi_data = load_tool_data(DATA_DIR / tool_id / 'multi.json') or {}
        return multi_data, message

    def load_extra_chart(self, tool_id:str, user_id:str):
        self.logger.info(f"加载工具{tool_id}其他数据")
        tool_config = tool_manager.get_tool(tool_id) or {}
        extra_display_path = tool_config.get('extra_display_path') or ''

        func = self._load_function(tool_config.get('extra_display_func'),tool_config)

        extra = func(extra_display_path)
        message = ''
        return extra, message
        
    def load_single_or_multi_chart(self, tool_id:str, user_id:str):
        self.create_user_data_dir(user_id,tool_id)
        all_data = {}
        tool_config = tool_manager.get_tool(tool_id) or {}
        if tool_config.get('single_path'):
            all_data['single'], single_message = self.load_single_chart(tool_id, user_id)
        else:
            single_message = f"工具{tool_id}单线程数据不存在，请更新配置!!!"
        
        if tool_config.get('multi_path'):
            all_data['multi'], multi_message = self.load_multi_chart(tool_id, user_id)
        else:
            multi_message = ''
        
        if tool_config.get('extra_display_path'):
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


###################################################################################################################################################################




# # 全局实例
data_manager = DataManager()