# """
# 数据管理器 - 处理数据获取和解析
# """
# import concurrent.futures
# import importlib.util
# import time
# from pathlib import Path
# from threading import Lock
# from typing import Any, Callable, Dict, Optional

# from config import BASE_DIR, DATA_DIR
# from utils.common import *
# from utils.data_parser import data_parser
# from utils.log import get_logger, setup_logger
# from utils.tool_manager import tool_manager

# class DataManager:
#     """数据管理器，负责调用用户配置的函数获取数据"""
    
#     _instance = None
#     _lock = Lock()
#     _function_cache = {}
    
#     def __new__(cls):
#         if cls._instance is None:
#             with cls._lock:
#                 if cls._instance is None:
#                     cls._instance = super().__new__(cls)
#         return cls._instance
    
#     def __init__(self):
#         self._function_cache = {}
#         self.data_files = {}
#         # 缓存数据，key 为 (user_id, tool_id, type)，value 为 (cached_at, data)
#         self._cache_lock = Lock()
#         # 缓存数据，key 为 (user_id, tool_id, type)，value 为 (cached_at, data)
#         self._data_cache: Dict[tuple, tuple[float, Any]] = {}
#         self._cache_ttl_seconds = 30
#         # 创建线程池
#         self._executor = concurrent.futures.ThreadPoolExecutor(max_workers=2)
#         self._parsing_tasks: Dict[str, concurrent.futures.Future] = {}
#         setup_logger(log_dir='logs', level='DEBUG')
#         self.logger = get_logger(__name__)
#         self.logger.info("数据管理器初始化")
        
#     # 判断用户数据目录是否存在以及数据是否需要更新，如果不存在则创建
#     def create_user_data_dir(self, user_id: str, tool_id: str) -> Path:
#         """判断用户目录是否存在，如果不存在则创建。"""
#         user_data_dir = DATA_DIR / tool_id / user_id
#         if not user_data_dir.exists():
#             user_data_dir.mkdir(parents=True, exist_ok=True)
#             self.logger.info(f"创建用户数据目录: {user_data_dir}，并copy相应的文件")
#         else:
#             self.logger.info(f"用户数据目录: {user_data_dir} 已存在")
#         return user_data_dir

#     # 加载对应工具对应的类型需要的函数
#     def _load_function(self, function_name: str, tool_config) -> Optional[Callable]:
#         """动态加载Python函数"""
#         tool_name = tool_config.get('tool_name')
#         # 在 tool 目录下查找对应工具的函数模块
        
#         script_path = BASE_DIR / "tool" / tool_name /f"{tool_name}.py"
#         cache_key = f"{script_path}:{function_name}"
        
#         if cache_key in self._function_cache:
#             return self._function_cache[cache_key]

#         try:
#             if Path(script_path).exists():
#                 spec = importlib.util.spec_from_file_location(
#                     f"dynamic_module_{tool_name}_{hash(script_path)}", 
#                     script_path
#                 )
#                 if spec and spec.loader:
#                     module = importlib.util.module_from_spec(spec)
#                     spec.loader.exec_module(module)
#                     func = getattr(module, function_name, None)
#                     if func and callable(func):
#                         self._function_cache[cache_key] = func
#                         return func
#             else:
#                 self.logger.error(f"路径不存在：{script_path}")
#                 return None
            
#             self.logger.error(f"无法加载函数: {function_name}")
#             return None
#         except Exception as e:
#             self.logger.error(f"加载函数失败 {function_name}: {e}")
#             return None

#     # 加载工具数据从文件
#     def get_all_data(self, tool_id: str, user_id: str, type):
#         """加载工具数据，从缓存或文件中获取。"""
#         cache_key = (user_id, tool_id, type)
#         with self._cache_lock:
#             cached_entry = self._data_cache.get(cache_key)
#             if cached_entry is not None:
#                 cached_at, cached_value = cached_entry
#                 if time.time() - cached_at < self._cache_ttl_seconds:
#                     return cached_value
#                 self._data_cache.pop(cache_key, None)

#         data_files_json_path = DATA_DIR / tool_id / "dataFiles.json"

#         self.logger.info(f"用户 {user_id} 加载工具 {tool_id} 的 {type} 数据到前端")
#         tool_config = tool_manager.get_tool(tool_id) or {}
#         if not tool_config:
#             self.logger.error(f"工具配置不存在: {tool_id}")
#             return {}

#         func = self._load_function(tool_config.get(f'{type}_func'), tool_config)
#         if not func:
#             self.logger.error(f"无法加载工具 {type} 的 {type} 数据处理函数，请检查配置")
#             return {}

#         data_root = tool_config.get(f'{type}_path')
#         if not data_root:
#             return {}

#         new_data_files_paths = list(func(data_root, 0) or [])

#         if not data_files_json_path.exists():
#             data = func(new_data_files_paths, 1) or []
#             self.data_files[type] = list(new_data_files_paths)
#             self.logger.info(f"用户 {user_id} 第一次加载 {type} 数据，返回所有数据")
#         else:
#             self.data_files = load_tool_data(data_files_json_path) or {}
#             old_data_files_paths = list(self.data_files.get(type, []))
#             add_data_files_paths = [path for path in new_data_files_paths if path not in old_data_files_paths]
#             if add_data_files_paths:
#                 data = func(add_data_files_paths, 1) or []
#                 self.logger.info(f"用户 {user_id} 新增 {type} 数据，返回新增数据")
#                 self.data_files[type] = list(new_data_files_paths)
#             else:
#                 self.logger.info(f"用户 {user_id} 没有新增 {type} 数据")
#                 data = None

#         save_tool_data(data_files_json_path, self.data_files)
#         with self._cache_lock:
#             if data is not None:
#                 self._data_cache[cache_key] = (time.time(), data)
#             else:
#                 self._data_cache.pop(cache_key, None)
#         return data

#     def _submit_background_parse(self, tool_id: str, data_type: str, raw_data, old_raw_data):
#         """提交后台解析任务，避免重复提交"""
#         key = f"{tool_id}:{data_type}"
#         # 如果已有正在进行的任务并未完成，直接返回
#         future = self._parsing_tasks.get(key)
#         if future and not future.done():
#             self.logger.info(f"解析任务已在后台执行: {key}")
#             return future.result()

#         def _job():
#             try:
#                 self.logger.info(f"后台解析开始: {key}")
#                 parsed = data_parser.parse_all_data(tool_id, raw_data, data_type)
#                 target = DATA_DIR / tool_id / f"{data_type}.json"
#                 parsed = deep_merge(old_raw_data, parsed)
#                 save_tool_data(target, parsed)
#                 self.logger.info(f"后台解析完成并保存: {target}")
#                 return parsed
#             except Exception as e:
#                 self.logger.exception(f"后台解析失败 {key}: {e}")
#                 return None

#         future = self._executor.submit(_job)
#         self._parsing_tasks[key] = future

#         return future.result()

#     @staticmethod
#     def resolve_chart_group(chart_type: str) -> str:
#         """将 cputime / easepletime / peakmem / incmem 归并到 runtime / memory 基础分组。"""
#         key = (chart_type or 'runtime').strip().lower()
#         runtime_aliases = {
#             'runtime', 'cputime', 'realtime'
#         }
#         memory_aliases = {
#             'memory', 'peakmem', 'incmem', 'realtimeincmem', 
#         }
#         if key in runtime_aliases:
#             return 'runtime'
#         if key in memory_aliases:
#             return 'memory'
#         return key

#     # 发送数据到前端,渲染图表
#     def send_data_to_frontend_for_chart(self, frond_data: Dict):
#         tool_id = frond_data.get('toolID', '')
#         casename = frond_data.get('casename', '')
#         mode = frond_data.get('mode', 'single')
#         chart_type = frond_data.get('chart_type', 'cputime')
#         rules = frond_data.get('rules', [])
#         dates = frond_data.get('dates', [])
#         selected_threads = frond_data.get('selected_threads', [])

#         if not rules:
#             return {"dates": dates, "rules": {}, "crash_dates": [], "overall_data": {}, "selected_threads": []}
        
#         data_path = DATA_DIR / tool_id / "original" / mode / casename / chart_type / f'{rules[0]}.json'
#         if not data_path.exists():
#             fallback_path = DATA_DIR / tool_id / "original" / mode / casename / chart_type / f'{rules[0]}.json'
#             if fallback_path.exists():
#                 data_path = fallback_path
#         case_rule_data = load_tool_data(data_path) or {}
#         rules_data = case_rule_data.get("rules", {})
#         crash_dates = set()

#         chioce_data = {"dates": dates, "rules": {}, "crash_dates": [], "overall_data": case_rule_data.get("overall_data", {})}

#         for thread in selected_threads:
#             rule_key = rules[0] if thread == -1 else f"{rules[0]}({thread})"
#             rule_info = rules_data.get(rule_key, {})
#             if not rule_info:
#                 continue

#             rule_dates = rule_info.get("dates", [])
#             values = []
#             for date in dates:
#                 if date not in rule_dates:
#                     values.append(None)
#                     crash_dates.add(date)
#                 else:
#                     index = rule_dates.index(date)
#                     values.append(rule_info.get("values", [None])[index])
#                     if date in case_rule_data.get("crash_dates", []) and date not in crash_dates:
#                         crash_dates.add(date)

#             chioce_data["rules"][rule_key] = {
#                 "dates": dates,
#                 "values": values,
#                 "type": rule_info.get("type"),
#                 "name": rule_info.get("name"),
#             }
#             if mode == "single":
#                 chioce_data["rules"][rule_key]["is_single"] = rule_info.get("is_single")
#             else:
#                 chioce_data["rules"][rule_key].update({
#                     "thread": rule_info.get("thread"),
#                     "color": rule_info.get("color"),
#                     "rule_name": rule_info.get("rule_name"),
#                     "is_multi": rule_info.get("is_multi"),
#                 })

#         chioce_data["crash_dates"] = list(crash_dates)
#         if mode == "multi":
#             chioce_data["selected_threads"] = case_rule_data.get("all_threads", [])

#         return chioce_data


# ##################################################################################################################################################################
#     def compare_data(self, 
#         tool_id: str, 
#         type: str,
#         casename: str, 
#         date1: str, 
#         date2: str, 
#         compare_mode: str = 'all',
#         dimension: str = 'all',
#         runtime_threshold: float = 0,
#         memory_threshold: float = 0,
#         error_mode: str = 'absolute'):
#         """
#         runtime_threshold: 运行时间阈值
#         memory_threshold: 内存阈值
#         error_mode: 错误模式，absolute 或 relative
#         """
#         if dimension not in {'all', 'runtime', 'memory'}:
#             return False

#         if compare_mode == "all":
#             mode_path = DATA_DIR / tool_id / f"{type}.json"
#             mode_data = load_tool_data(mode_path) or {}
#             case_data = mode_data.get(casename, {})
#             rules = set(case_data.get("runtime", {}).keys()) | set(case_data.get("memory", {}).keys())
#         else:
#             rules = [compare_mode]
#         # 对比数据
#         rule_data_compare_data_runtime = {}
#         rule_data_compare_data_memory = {}
#         for rule in rules:
#             if dimension == 'all' or dimension == 'runtime':
#                 case_data_runtime = load_tool_data(DATA_DIR / tool_id / "original" / type / casename  /"runtime" / f"{rule}.json")
#                 date1_data, date2_data, runtime_diff, runtime_diff_percent = self.calculation_error(case_data_runtime, rule, date1, date2)
#                 rule_data_compare_data_runtime[rule] = {
#                     "date1_data": date1_data,
#                     "date2_data": date2_data,
#                     "diff": runtime_diff,
#                     "diff_percent": runtime_diff_percent,
#                 }
                
#             if dimension == 'all' or dimension == 'memory':
#                 case_data_memory = load_tool_data(DATA_DIR / tool_id / "original" / type / casename  /"memory" / f"{rule}.json")
#                 date1_data, date2_data, memory_diff, memory_diff_percent = self.calculation_error(case_data_memory, rule, date1, date2)
#                 rule_data_compare_data_memory[rule] = {
#                     "date1_data": date1_data,
#                     "date2_data": date2_data,
#                     "diff": memory_diff,
#                     "diff_percent": memory_diff_percent,
#                 }

#         return self.statistical_compare_result_data(rule_data_compare_data_runtime, rule_data_compare_data_memory, dimension, runtime_threshold, memory_threshold, error_mode)

#     def calculation_rate(self,op1,op2):
#         if op2 == 0:
#             return 0
#         return round(op1 / op2, 2)

#     def calculation_error(self, data, rule: str, date1: str, date2: str):
#         rule_data = data.get("rules", {}).get(rule, {})
#         dates = rule_data.get("dates", [])
#         values = rule_data.get("values", [])

#         try:
#             index1 = dates.index(date1)
#             index2 = dates.index(date2)
#         except ValueError:
#             return None, None, 0, 0

#         date1_data = values[index1] if index1 < len(values) else None
#         date2_data = values[index2] if index2 < len(values) else None

#         if date1_data is None or date2_data is None:
#             return date1_data, date2_data, 0, 0

#         diff = date2_data - date1_data
#         diff_percent = 0 if date1_data == 0 else round(self.calculation_rate(diff, date1_data) * 100, 2)
#         return date1_data, date2_data, diff, diff_percent

#     def statistical_compare_result_data(self, runtime_data, memory_data, dimension: str, runtime_threshold: float, memory_threshold: float, error_mode: str):
#         """
#         runtime_threshold: 运行时间阈值
#         memory_threshold: 内存阈值
#         error_mode: 错误模式，absolute 或 relative
#         """
#         result = {}

#         for rule in runtime_data:
#             diff_key = "diff_percent" if error_mode == 'percentage' else "diff"
#             result.setdefault(rule, {})["runtime"] = self.judge_compare_reuslt(runtime_data, rule, diff_key, runtime_threshold)

#         for rule in memory_data:
#             diff_key = "diff_percent" if error_mode == 'percentage' else "diff"
#             result.setdefault(rule, {})["memory"] = self.judge_compare_reuslt(memory_data, rule, diff_key, memory_threshold)

#         compare_result = {}
#         comparisons = []
#         if dimension == 'all':
#             for rule, value in result.items():
#                 runtime_value = value.get("runtime", [None, None, 0, "· 无变化"])
#                 memory_value = value.get("memory", [None, None, 0, "· 无变化"])
#                 compare_result[rule] = runtime_value + memory_value
#                 comparisons.append([rule] + runtime_value + memory_value)
#         elif dimension == 'runtime':
#             for rule, value in result.items():
#                 runtime_value = value.get("runtime", [None, None, 0, "· 无变化"])
#                 compare_result[rule] = runtime_value
#                 comparisons.append([rule] + runtime_value)
#         elif dimension == 'memory':
#             for rule, value in result.items():
#                 memory_value = value.get("memory", [None, None, 0, "· 无变化"])
#                 compare_result[rule] = memory_value
#                 comparisons.append([rule] + memory_value)

#         statistics = self.statistics_compare_result_data(compare_result, dimension)

#         return {"statistics": statistics, "comparisons": comparisons}

#     def judge_compare_reuslt(self, data: dict, rule: str, diff_key: str, threshold: float):
#         date1_data = data[rule]["date1_data"]
#         date2_data = data[rule]["date2_data"]
#         diff = data[rule][diff_key]

#         if diff > threshold:
#             return [date1_data, date2_data, diff, "⬆️增加"]
#         if diff == threshold:
#             return [date1_data, date2_data, diff, "· 无变化"]
#         return [date1_data, date2_data, diff, "⬇️减少"]

#     # 统计对比结果
#     def statistics_compare_result_data(self, compare_result_data: dict, dimension: str):
#         statistics_tmp = {
#             "runtime_increased": {}, 
#             "runtime_decreased": {}, 
#             "memory_increased": {}, 
#             "memory_decreased": {},
#             "avg_runtime_change": 0,
#             "avg_memory_change": 0,
#             "max_runtime_increased": [],
#             "max_runtime_decreased": [],
#             "max_memory_increased": [],
#             "max_memory_decreased": [],
#         }
#         runtime_increased_tmp = {"name": "", "value": 0}
#         runtime_decreased_tmp = {"name": "", "value": 0}   
#         memory_increased_tmp = {"name": "", "value": 0}    
#         memory_decreased_tmp = {"name": "", "value": 0}
#         # statistics_tmp = {}
#         for rule,value in compare_result_data.items():
#             if dimension == "all":
#                 if value[3] == "⬆️增加":
#                     statistics_tmp["runtime_increased"][rule] = value[2]
#                     if runtime_increased_tmp["value"] < float(value[2]):
#                         runtime_increased_tmp = {"name":rule, "value": float(value[2])}
#                 elif value[3] == "⬇️减少":
#                     statistics_tmp["runtime_decreased"][rule] = value[2]
#                     if runtime_decreased_tmp["value"] > float(value[2]):
#                         runtime_decreased_tmp = {"name":rule, "value": float(value[2])}
                    
#                 # 内存对比
#                 if value[7] == "⬆️增加":
#                     statistics_tmp["memory_increased"][rule] = value[6]
#                     if memory_increased_tmp["value"] < float(value[6]):
#                         memory_increased_tmp = {"name":rule, "value": float(value[6])}
#                 elif value[7] == "⬇️减少":
#                     statistics_tmp["memory_decreased"][rule] = value[6]
#                     if memory_decreased_tmp["value"] > float(value[6]):
#                         memory_decreased_tmp = {"name":rule, "value": float(value[6])}
                    
#             elif dimension == "runtime":
#                 if value[3] == "⬆️增加":
#                     statistics_tmp["runtime_increased"][rule] = value[2]
#                     if runtime_increased_tmp["value"] < float(value[2]):
#                         runtime_increased_tmp = {"name":rule, "value": float(value[2])}
#                 elif value[3] == "⬇️减少":
#                     statistics_tmp["runtime_decreased"][rule] = value[2]
#                     if runtime_decreased_tmp["value"] > float(value[2]):
#                         runtime_decreased_tmp = {"name":rule, "value": float(value[2])}
                    
#             elif dimension == "memory":
#                 if value[3] == "⬆️增加":
#                     statistics_tmp["memory_increased"][rule] = value[2]
#                     if memory_increased_tmp["value"] < float(value[2]):
#                         memory_increased_tmp = {"name":rule, "value": float(value[2])}
#                 elif value[3] == "⬇️减少":
#                     statistics_tmp["memory_decreased"][rule] = value[2]
#                     if memory_decreased_tmp["value"] > float(value[2]):
#                         memory_decreased_tmp = {"name":rule, "value": float(value[2])}
#         statistics = {}       
#         if dimension == "all":
#             statistics["runtime_increased"] = list(sorted(statistics_tmp["runtime_increased"].items(),key=lambda item: item[1], reverse=True))
#             statistics["runtime_decreased"] = list(sorted(statistics_tmp["runtime_decreased"].items(),key=lambda item: item[1], reverse=True))
#             statistics["max_runtime_increased"] = runtime_increased_tmp
#             statistics["max_runtime_decreased"] = runtime_decreased_tmp
#             # statistics["avg_runtime_change"] = (runtime_increased_tmp["value"] - runtime_decreased_tmp["value"]) / (runtime_increased_tmp["value"] + runtime_decreased_tmp["value"])
#             statistics["avg_runtime_change"] = self.calculation_rate((runtime_increased_tmp["value"] - runtime_decreased_tmp["value"]), (runtime_increased_tmp["value"] + runtime_decreased_tmp["value"]))
#             statistics["memory_increased"] = list(sorted(statistics_tmp["memory_increased"].items(),key=lambda item: item[1], reverse=True))
#             statistics["memory_decreased"] = list(sorted(statistics_tmp["memory_decreased"].items(),key=lambda item: item[1], reverse=True))
#             statistics["max_memory_increased"] = memory_increased_tmp
#             statistics["max_memory_decreased"] = memory_decreased_tmp
#             # statistics["avg_memory_change"] = (memory_increased_tmp["value"] - memory_decreased_tmp["value"]) / (memory_increased_tmp["value"] + memory_decreased_tmp["value"])
#             statistics["avg_memory_change"] = self.calculation_rate((memory_increased_tmp["value"] - memory_decreased_tmp["value"]), (memory_increased_tmp["value"] + memory_decreased_tmp["value"]))
#         elif dimension == "runtime":
#             statistics["runtime_increased"] = list(sorted(statistics_tmp["runtime_increased"].items(),key=lambda item: item[1], reverse=True))
#             statistics["runtime_decreased"] = list(sorted(statistics_tmp["runtime_decreased"].items(),key=lambda item: item[1], reverse=True))
#             statistics["max_runtime_increased"] = runtime_increased_tmp
#             statistics["max_runtime_decreased"] = runtime_decreased_tmp
#             # statistics["avg_runtime_change"] = (runtime_increased_tmp["value"] - runtime_decreased_tmp["value"]) / (runtime_increased_tmp["value"] + runtime_decreased_tmp["value"])
#             statistics["avg_runtime_change"] = self.calculation_rate((runtime_increased_tmp["value"] - runtime_decreased_tmp["value"]), (runtime_increased_tmp["value"] + runtime_decreased_tmp["value"]))
#         elif dimension == "memory":
#             statistics["memory_increased"] = list(sorted(statistics_tmp["memory_increased"].items(),key=lambda item: item[1], reverse=True))
#             statistics["memory_decreased"] = list(sorted(statistics_tmp["memory_decreased"].items(),key=lambda item: item[1], reverse=True))
#             statistics["max_memory_increased"] = memory_increased_tmp
#             statistics["max_memory_decreased"] = memory_decreased_tmp
#             # statistics["avg_memory_change"] = (memory_increased_tmp["value"] - memory_decreased_tmp["value"]) / (memory_increased_tmp["value"] + memory_decreased_tmp["value"])
#             statistics["avg_memory_change"] = self.calculation_rate((memory_increased_tmp["value"] - memory_decreased_tmp["value"]), (memory_increased_tmp["value"] + memory_decreased_tmp["value"]))

#         return statistics

# ###################################################################################################################################################################

#     def load_single_chart(self, tool_id:str, user_id:str):
#         self.logger.info(f"加载工具{tool_id}单线程数据")
#         single = self.get_all_data(tool_id, user_id, "single")

#         if single:
#             # 需要更新数据，先返回缓存并在后台解析更新
#             message = ' 单线程'
#             cached = load_tool_data(DATA_DIR / tool_id / 'single.json') or {}
#             # 提交后台解析任务
#             try:
#                 cached = self._submit_background_parse(tool_id, 'single', single, cached)
#             except Exception:
#                 self.logger.exception("提交后台解析任务失败: single")
#             single_data = cached
#         else:
#             message = ''
#             single_data = load_tool_data(DATA_DIR / tool_id / 'single.json') or {}

#         return single_data, message

#     def load_multi_chart(self, tool_id:str, user_id:str):
#         self.logger.info(f"加载工具{tool_id}多线程数据")
#         multi = self.get_all_data(tool_id, user_id, "multi")
#         if multi:
#             # 需要更新数据，先返回缓存并在后台解析更新
#             message = ' 多线程'
#             cached = load_tool_data(DATA_DIR / tool_id / 'multi.json') or {}
#             try:
#                 cached = self._submit_background_parse(tool_id, 'multi', multi, cached)
#             except Exception:
#                 self.logger.exception("提交后台解析任务失败: multi")
#             multi_data = cached
#         else:
#             message = ''
#             multi_data = load_tool_data(DATA_DIR / tool_id / 'multi.json') or {}
#         return multi_data, message

#     def load_extra_chart(self, tool_id:str, user_id:str):
#         self.logger.info(f"加载工具{tool_id}其他数据")
#         tool_config = tool_manager.get_tool(tool_id) or {}
#         extra_display_path = tool_config.get('extra_display_path') or ''

#         func = self._load_function(tool_config.get('extra_display_func'),tool_config)

#         extra = func(extra_display_path)
#         message = ''
#         return extra, message
        
#     def load_single_or_multi_chart(self, tool_id:str, user_id:str):
#         self.create_user_data_dir(user_id,tool_id)
#         all_data = {}
#         tool_config = tool_manager.get_tool(tool_id) or {}
#         if tool_config.get('single_path'):
#             all_data['single'], single_message = self.load_single_chart(tool_id, user_id)
#         else:
#             single_message = f"工具{tool_id}单线程数据不存在，请更新配置!!!"
        
#         if tool_config.get('multi_path'):
#             all_data['multi'], multi_message = self.load_multi_chart(tool_id, user_id)
#         else:
#             multi_message = ''
        
#         if tool_config.get('extra_display_path'):
#             all_data['extra'], extra_message = self.load_extra_chart(tool_id, user_id)
#         else:
#             extra_message = ''

#         message = f"{single_message}"+ f"{multi_message}"+ f"{extra_message}"
#         if message == '':
#             message = '数据不需要更新'
#         else:
#             message = '更新' + message

#         return all_data, message


#     def load_thread_chart(self, request_data: Dict):
#         casename = request_data.get('casename', '')
#         rule = request_data.get('rule', '')
#         date = request_data.get('date', '')
#         tool_id = request_data.get('toolID', '')
#         mode = request_data.get('mode', 'all')

#         case_rule_data_json_path = DATA_DIR / tool_id / "original" / "thread" / casename / date / f"{rule}.json"
#         if not case_rule_data_json_path.exists():
#             self.logger.error(f"线程数据文件不存在: {case_rule_data_json_path}")
#             return {}
        
#         case_rule_data = load_tool_data(case_rule_data_json_path)

#         return case_rule_data


# ###################################################################################################################################################################
# # utils/data_manager.py - 添加以下方法

#     def compare_data(self, 
#         tool_id: str, 
#         mode: str,
#         casename: str, 
#         date1: str = None, 
#         date2: str = None, 
#         compare_mode: str = 'all',
#         dimension: str = None,
#         runtime_threshold: float = 0,
#         memory_threshold: float = 0,
#         error_mode: str = 'absolute',
#         threads: List[int] = None,
#         compare_type: str = 'single') -> Dict:
#         """
#         数据对比 - 支持单线程和多线程
#         """
#         # 验证必填参数
#         if not casename:
#             return {'success': False, 'error': '请选择 Casename'}
        
#         if not date1:
#             return {'success': False, 'error': '请选择日期1'}
        
#         # 如果是版本对比（单线程或单线程数），需要 date2
#         if compare_type == 'single' and not date2:
#             return {'success': False, 'error': '版本对比需要两个日期'}
        
#         # 获取数据路径
#         data_path = DATA_DIR / tool_id / "original" / mode / casename
#         if not data_path.exists():
#             return {'success': False, 'error': f'找不到 casename: {casename} 的数据'}
        
#         # 确定对比的维度列表
#         if dimension:
#             dimensions = [dimension]
#         else:
#             dimensions = ['cputime', 'realtime', 'peakmem', 'incmem', 'realtimeincmem']
#             dimensions = [d for d in dimensions if (data_path / d).exists()]
        
#         # 确定对比的规则列表
#         if compare_mode == 'all':
#             rules = self._get_all_rules(data_path, dimensions)
#         else:
#             rules = [compare_mode]
        
#         # 获取线程列表
#         if mode == 'multi' and threads:
#             thread_list = threads
#         elif mode == 'multi':
#             thread_list = self._get_all_threads(data_path, casename, dimensions, rules)
#         else:
#             thread_list = [-1]  # 单线程
        
#         # 执行对比
#         result = self._perform_comparison(
#             data_path, casename, dimensions, rules, thread_list,
#             date1, date2 if compare_type == 'single' else None,
#             runtime_threshold, memory_threshold, error_mode,
#             mode, compare_type
#         )
        
#         return {'success': True, 'data': result}


#     def _get_all_rules(self, data_path: Path, dimensions: List[str]) -> List[str]:
#         """获取所有规则"""
#         rules = set()
#         for dim in dimensions:
#             dim_path = data_path / dim
#             if dim_path.exists():
#                 for file in dim_path.glob('*.json'):
#                     rules.add(file.stem)
#         return sorted(list(rules))

#     def _get_all_threads(self, data_path: Path, casename: str, dimensions: List[str], rules: List[str]) -> List[int]:
#         """获取所有线程数"""
#         threads = set()
#         for dim in dimensions:
#             for rule in rules:
#                 rule_file = data_path / dim / f"{rule}.json"
#                 if rule_file.exists():
#                     data = load_tool_data(rule_file)
#                     if data and 'rules' in data:
#                         for rule_key in data['rules']:
#                             if '(' in rule_key and ')' in rule_key:
#                                 try:
#                                     thread_str = rule_key.split('(')[1].split(')')[0]
#                                     threads.add(int(thread_str))
#                                 except (ValueError, IndexError):
#                                     pass
#         return sorted(list(threads))

#     def _perform_comparison(self, data_path: Path, casename: str, dimensions: List[str],
#                            rules: List[str], thread_list: List[int], date1: str, date2: str,
#                            runtime_threshold: float, memory_threshold: float,
#                            error_mode: str, mode: str, compare_type: str) -> Dict:
#         """执行对比计算"""
#         is_thread_compare = (compare_type == 'thread')
#         comparison_results = []
#         statistics = {
#             'runtime_increased': {},
#             'runtime_decreased': {},
#             'memory_increased': {},
#             'memory_decreased': {},
#             'avg_runtime_change': 0,
#             'avg_memory_change': 0,
#             'max_runtime_increased': {'name': '', 'value': 0},
#             'max_runtime_decreased': {'name': '', 'value': 0},
#             'max_memory_increased': {'name': '', 'value': 0},
#             'max_memory_decreased': {'name': '', 'value': 0},
#         }
#         total_runtime_change = 0
#         total_runtime_count = 0
#         total_memory_change = 0
#         total_memory_count = 0

#         for rule in rules:
#             row = [rule]
#             has_runtime = False
#             has_memory = False

#             for dim in dimensions:
#                 rule_file = data_path / dim / f"{rule}.json"
#                 if not rule_file.exists():
#                     continue
#                 rule_data = load_tool_data(rule_file)
#                 if not rule_data or 'rules' not in rule_data:
#                     continue

#                 for rule_key, rule_info in rule_data['rules'].items():
#                     # 线程过滤
#                     if mode == 'single':
#                         if not rule_info.get('is_single', False):
#                             continue
#                     else:
#                         thread_match = False
#                         for t in thread_list:
#                             if f"({t})" in rule_key:
#                                 thread_match = True
#                                 break
#                         if not thread_match:
#                             continue

#                     dates = rule_info.get('dates', [])
#                     values = rule_info.get('values', [])

#                     if is_thread_compare:
#                         # 多线程对比：只取 date1 的数据
#                         try:
#                             idx = dates.index(date1)
#                             val = values[idx] if idx < len(values) else None
#                         except ValueError:
#                             continue
#                         if val is None:
#                             continue
#                         thread_num = rule_info.get('thread', 0)
#                         row.append(f"{thread_num}线程")
#                         row.append(round(val, 2))
#                         # 标记是否有 runtime/memory 数据（仅用于后续可能扩展）
#                         if dim in ['cputime', 'realtime']:
#                             has_runtime = True
#                         elif dim in ['peakmem', 'incmem', 'realtimeincmem']:
#                             has_memory = True
#                         continue

#                     # 版本对比：使用两个日期
#                     val1 = None
#                     val2 = None
#                     try:
#                         idx1 = dates.index(date1)
#                         idx2 = dates.index(date2)
#                         if idx1 < len(values):
#                             val1 = values[idx1]
#                         if idx2 < len(values):
#                             val2 = values[idx2]
#                     except ValueError:
#                         continue
#                     if val1 is None or val2 is None:
#                         continue

#                     diff = val2 - val1
#                     diff_percent = 0 if val1 == 0 else round((diff / val1) * 100, 2)
#                     is_runtime = dim in ['cputime', 'realtime']
#                     is_memory = dim in ['peakmem', 'incmem', 'realtimeincmem']
#                     diff_key = "diff_percent" if error_mode == 'percentage' else "diff"
#                     diff_value = diff_percent if error_mode == 'percentage' else diff
#                     status = self._get_status(diff_value, is_runtime, runtime_threshold, memory_threshold)

#                     if is_runtime:
#                         has_runtime = True
#                         total_runtime_change += abs(diff_value)
#                         total_runtime_count += 1
#                         self._update_statistics(statistics, 'runtime', status, rule, diff_value)
#                     elif is_memory:
#                         has_memory = True
#                         total_memory_change += abs(diff_value)
#                         total_memory_count += 1
#                         self._update_statistics(statistics, 'memory', status, rule, diff_value)

#                     display_diff = diff_percent if error_mode == 'percentage' else diff
#                     row.extend([round(val1, 2), round(val2, 2), round(display_diff, 2), status])

#             # 添加行
#             if is_thread_compare:
#                 if len(row) > 1:  # 至少有一个线程数据
#                     comparison_results.append(row)
#             else:
#                 if has_runtime or has_memory:
#                     comparison_results.append(row)

#         # 统计信息（仅版本对比）
#         if not is_thread_compare:
#             if total_runtime_count > 0:
#                 statistics['avg_runtime_change'] = round(total_runtime_change / total_runtime_count, 2)
#             if total_memory_count > 0:
#                 statistics['avg_memory_change'] = round(total_memory_change / total_memory_count, 2)

#             statistics['runtime_increased'] = sorted(
#                 statistics['runtime_increased'].items(),
#                 key=lambda x: x[1], reverse=True
#             )
#             statistics['runtime_decreased'] = sorted(
#                 statistics['runtime_decreased'].items(),
#                 key=lambda x: x[1], reverse=True
#             )
#             statistics['memory_increased'] = sorted(
#                 statistics['memory_increased'].items(),
#                 key=lambda x: x[1], reverse=True
#             )
#             statistics['memory_decreased'] = sorted(
#                 statistics['memory_decreased'].items(),
#                 key=lambda x: x[1], reverse=True
#             )
#         else:
#             # 多线程对比的统计信息（可选），这里置空
#             statistics = {}

#         return {
#             'statistics': statistics,
#             'comparisons': comparison_results
#         }


#     def _get_status(self, diff_value: float, is_runtime: bool, runtime_threshold: float, memory_threshold: float) -> str:
#         """获取变化状态"""
#         threshold = runtime_threshold if is_runtime else memory_threshold
#         if diff_value > threshold:
#             return '⬆️增加'
#         elif diff_value < -threshold:
#             return '⬇️减少'
#         else:
#             return '· 无变化'

#     def _update_statistics(self, statistics: Dict, type_name: str, status: str, rule: str, diff_value: float):
#         """更新统计信息"""
#         key = f"{type_name}_increased" if status == '⬆️增加' else f"{type_name}_decreased"
#         if status != '· 无变化':
#             statistics[key][rule] = abs(diff_value)
#             max_key = f"max_{type_name}_increased" if status == '⬆️增加' else f"max_{type_name}_decreased"
#             if statistics[max_key]['value'] < abs(diff_value):
#                 statistics[max_key] = {'name': rule, 'value': abs(diff_value)}



# # # 全局实例
# data_manager = DataManager()


"""
数据管理器 - 处理数据获取和解析（支持文件监听和增量更新）
"""
import concurrent.futures
import importlib.util
import time
import threading
from pathlib import Path
from typing import Any, Callable, Dict, Optional, List, Set
from datetime import datetime

from config import BASE_DIR, DATA_DIR
from utils.common import *
from utils.data_parser import data_parser
from utils.file_scanner import FileSystemScanner, FileInfo
from utils.file_watcher import FileChangeEvent, FileWatcher, get_file_watcher
from utils.log import get_logger, setup_logger
from utils.tool_manager import tool_manager

logger = get_logger(__name__)


class DataManager:
    """
    数据管理器 - 负责调用用户配置的函数获取数据
    
    支持:
    - 基于文件 mtime 的增量更新
    - 文件系统自动监听
    - 异步后台解析
    - 多级缓存
    """
    
    _instance = None
    _lock = threading.Lock()
    _function_cache = {}
    
    def __new__(cls):
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = super().__new__(cls)
        return cls._instance
    
    def __init__(self):
        if hasattr(self, '_initialized'):
            return
        self._initialized = True
        self._function_cache = {}
        self.data_files = {}
        
        # 数据缓存
        self._cache_lock = threading.Lock()
        self._data_cache: Dict[tuple, tuple[float, Any]] = {}
        self._cache_ttl_seconds = 30
        
        # 解析任务线程池
        self._executor = concurrent.futures.ThreadPoolExecutor(max_workers=2)
        self._parsing_tasks: Dict[str, concurrent.futures.Future] = {}
        
        # 版本信息缓存
        self._version_cache: Dict[str, Dict] = {}
        
        # 文件监听器
        self._watcher: Optional[FileWatcher] = None
        self._watcher_paths: Set[str] = set()
        
        setup_logger(log_dir='logs', level='DEBUG')
        self.logger = get_logger(__name__)
        self.logger.info("数据管理器初始化完成")

    # ==================== 文件版本管理 ====================
    
    def _get_version_file_path(self, tool_id: str, data_type: str) -> Path:
        """获取版本文件路径"""
        return DATA_DIR / tool_id / f'{data_type}_version.json'

    def _load_version_info(self, tool_id: str, data_type: str) -> Dict:
        """加载版本信息"""
        version_file = self._get_version_file_path(tool_id, data_type)
        cache_key = f"{tool_id}:{data_type}"
        
        if cache_key in self._version_cache:
            return self._version_cache[cache_key]
        
        version_info = load_tool_data(version_file) or {
            'version': 1,
            'last_scan_time': 0,
            'processed_files': {},
            'processed_dirs': {}
        }
        self._version_cache[cache_key] = version_info
        return version_info

    def _save_version_info(self, tool_id: str, data_type: str, version_info: Dict):
        """保存版本信息"""
        version_file = self._get_version_file_path(tool_id, data_type)
        cache_key = f"{tool_id}:{data_type}"
        self._version_cache[cache_key] = version_info
        save_tool_data(version_file, version_info)

    def _update_version_info(self, tool_id: str, data_type: str, files: List[FileInfo]):
        """更新版本信息"""
        version_info = self._load_version_info(tool_id, data_type)
        
        for f in files:
            version_info['processed_files'][f.path] = {
                'mtime': f.mtime,
                'size': f.size,
                'processed_at': time.time()
            }
        
        version_info['last_scan_time'] = time.time()
        self._save_version_info(tool_id, data_type, version_info)

    # ==================== 数据加载 ====================

    def create_user_data_dir(self, user_id: str, tool_id: str) -> Path:
        """创建用户数据目录"""
        user_data_dir = DATA_DIR / tool_id / user_id
        if not user_data_dir.exists():
            user_data_dir.mkdir(parents=True, exist_ok=True)
            self.logger.info(f"创建用户数据目录: {user_data_dir}")
        return user_data_dir

    def _load_function(self, function_name: str, tool_config) -> Optional[Callable]:
        """动态加载Python函数"""
        tool_name = tool_config.get('tool_name')
        if not tool_name:
            return None

        script_path = BASE_DIR / "tool" / tool_name / f"{tool_name}.py"
        cache_key = f"{script_path}:{function_name}"
        
        if cache_key in self._function_cache:
            return self._function_cache[cache_key]

        try:
            if not Path(script_path).exists():
                self.logger.error(f"脚本不存在: {script_path}")
                return None

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
                    
            self.logger.error(f"无法加载函数: {function_name}")
            return None
        except Exception as e:
            self.logger.error(f"加载函数失败 {function_name}: {e}")
            return None

    def _get_files_to_process(
        self, 
        tool_id: str, 
        data_type: str, 
        data_root: str,
        scanner: FileSystemScanner
    ) -> tuple:
        """
        获取需要处理的文件列表
        
        Returns:
            (files_to_process: List[FileInfo], all_files: List[FileInfo])
        """
        version_info = self._load_version_info(tool_id, data_type)
        processed_files = version_info.get('processed_files', {})
        
        # 扫描当前文件系统
        all_files = scanner.scan()

        # 计算增量
        files_to_process = []
        for f in all_files:
            old_info = processed_files.get(f.path)
            if not old_info:
                files_to_process.append(f)
            elif old_info.get('mtime') != f.mtime or old_info.get('size') != f.size:
                files_to_process.append(f)
        self.logger.info(f"========================================== 发现 {len(files_to_process)} 个文件需要处理")
        return files_to_process, all_files

    def get_all_data(self, tool_id: str, user_id: str, data_type: str):
        """
        加载工具数据，支持增量更新
        
        Args:
            tool_id: 工具ID
            user_id: 用户ID
            data_type: 数据类型 ('single' 或 'multi')
            
        Returns:
            解析后的数据
        """
        cache_key = (user_id, tool_id, data_type)
        self.logger.info(f"开始加载 {data_type} 数据: {cache_key}")
        # 检查缓存
        with self._cache_lock:
            cached_entry = self._data_cache.get(cache_key)

            if cached_entry is not None:
                cached_at, cached_value = cached_entry
                if time.time() - cached_at < self._cache_ttl_seconds:
                    return cached_value
                self._data_cache.pop(cache_key, None)

        tool_config = tool_manager.get_tool(tool_id) or {}
        if not tool_config:
            self.logger.error(f"工具配置不存在: {tool_id}")
            return {}

        data_root = tool_config.get(f'{data_type}_path')
        if not data_root:
            return {}

        # 获取数据获取函数
        func = self._load_function(tool_config.get(f'{data_type}_func'), tool_config)
        if not func:
            self.logger.error(f"无法加载 {data_type} 数据处理函数")
            return {}

        # 创建文件扫描器
        scanner = FileSystemScanner(
            data_root,
            max_depth=6,
            include_patterns=[r"^\d{8}_[^\s]+\.txt", r"elint\.log$"],
            exclude_patterns=[r"\.tmp$", r"\.swp$"]
        )

        # 获取需要处理的文件
        files_to_process, all_files = self._get_files_to_process(tool_id, data_type, data_root, scanner)

        # 如果有文件需要处理
        if files_to_process:
            self.logger.info(f"发现 {len(files_to_process)} 个文件需要处理")
            
            # 获取已有数据
            data_file = DATA_DIR / tool_id / f'{data_type}.json'
            existing_data = load_tool_data(data_file) or {}
            
            # 解析增量数据
            try:
                incremental_data = func(files_to_process, 1) or {}
                # 合并数据
                merged_data = deep_merge(existing_data, incremental_data)
                
                # 异步保存
                self._executor.submit(
                    self._save_processed_data,
                    tool_id, data_type, merged_data, all_files
                )
                
                # 更新缓存
                with self._cache_lock:
                    self._data_cache[cache_key] = (time.time(), merged_data)
                
                return merged_data
            except Exception as e:
                self.logger.exception(f"解析数据失败: {e}")
                return existing_data
        
        # 没有变更，返回缓存数据
        self.logger.info("无文件变更，返回缓存数据")
        data = load_tool_data(DATA_DIR / tool_id / f'{data_type}.json') or {}
        
        with self._cache_lock:
            self._data_cache[cache_key] = (time.time(), data)
        
        return data

    def _save_processed_data(self, tool_id: str, data_type: str, data: Dict, files: List[FileInfo]):
        """保存处理后的数据和版本信息"""
        try:
            # 保存数据
            data_file = DATA_DIR / tool_id / f'{data_type}.json'
            save_tool_data(data_file, data)
            
            # 更新版本信息
            self._update_version_info(tool_id, data_type, files)
            
            self.logger.info(f"数据保存完成: {data_file}")
        except Exception as e:
            self.logger.exception(f"保存数据失败: {e}")

    # ==================== 文件监听集成 ====================

    def _on_file_change(self, events: List[FileChangeEvent]):
        """
        文件变更事件回调
        
        当文件系统发生变化时，触发数据更新
        """
        if not events:
            return

        # 收集变更的文件路径
        changed_paths = set()
        for event in events:
            if event.event_type == 'deleted':
                changed_paths.add(event.src_path)
            else:
                changed_paths.add(event.src_path)
                if event.dest_path:
                    changed_paths.add(event.dest_path)

        self.logger.info(f"文件变更触发更新: {len(changed_paths)} 个文件")

        # 触发数据更新（异步）
        self._executor.submit(self._handle_file_changes, list(changed_paths))

    def _handle_file_changes(self, changed_paths: List[str]):
        """
        处理文件变更
        
        根据变更的文件路径，找到对应的工具和数据，重新加载
        """
        # 这里可以优化：根据路径映射到具体的工具和数据
        # 简化实现：清除所有缓存
        with self._cache_lock:
            self._data_cache.clear()
        
        self.logger.info("缓存已清除，等待下次请求时重新加载")

    def init_file_watcher(self, tool_id: str):
        """
        为指定工具初始化文件监听器
        
        Args:
            tool_id: 工具ID
        """
        tool_config = tool_manager.get_tool(tool_id) or {}
        if not tool_config:
            return

        # 收集需要监听的路径
        watch_paths = []
        for data_type in ['single', 'multi']:
            path = tool_config.get(f'{data_type}_path')
            if path:
                watch_paths.append(path)

        if not watch_paths:
            self.logger.info(f"工具 {tool_id} 没有配置数据路径，跳过监听")
            return

        # 更新监听路径集合
        for path in watch_paths:
            self._watcher_paths.add(path)

        # 启动监听器
        try:
            watcher = get_file_watcher(
                watch_paths=list(self._watcher_paths),
                callback=self._on_file_change,
                watch_patterns=[r"^\d{8}_[^/]+\.txt$", r"elint\.log$"]
            )
            
            if not watcher.is_running():
                watcher.start()
                self.logger.info(f"文件监听器已启动，监听路径: {list(self._watcher_paths)}")
        except Exception as e:
            self.logger.exception(f"启动文件监听器失败: {e}")

    def stop_file_watcher(self):
        """停止文件监听器"""
        from utils.file_watcher import stop_file_watcher
        stop_file_watcher()
        self.logger.info("文件监听器已停止")

    # ==================== 原有接口兼容 ====================

    def _submit_background_parse(self, tool_id: str, data_type: str, raw_data, old_raw_data):
        """提交后台解析任务"""
        key = f"{tool_id}:{data_type}"
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
        """解析图表分组"""
        key = (chart_type or 'runtime').strip().lower()
        runtime_aliases = {'runtime', 'cputime', 'realtime'}
        memory_aliases = {'memory', 'peakmem', 'incmem', 'realtimeincmem'}
        if key in runtime_aliases:
            return 'runtime'
        if key in memory_aliases:
            return 'memory'
        return key

    def send_data_to_frontend_for_chart(self, front_data: Dict):
        """发送数据到前端渲染图表"""
        tool_id = front_data.get('toolID', '')
        casename = front_data.get('casename', '')
        mode = front_data.get('mode', 'single')
        chart_type = front_data.get('chart_type', 'cputime')
        rules = front_data.get('rules', [])
        dates = front_data.get('dates', [])
        selected_threads = front_data.get('selected_threads', [])

        if not rules:
            return {"dates": dates, "rules": {}, "crash_dates": [], "overall_data": {}, "selected_threads": []}

        data_path = DATA_DIR / tool_id / "original" / mode / casename / chart_type / f'{rules[0]}.json'
        if not data_path.exists():
            fallback_path = DATA_DIR / tool_id / "original" / mode / casename / chart_type / f'{rules[0]}.json'
            if fallback_path.exists():
                data_path = fallback_path
            else:
                return {"dates": dates, "rules": {}, "crash_dates": [], "overall_data": {}, "selected_threads": []}

        case_rule_data = load_tool_data(data_path) or {}
        rules_data = case_rule_data.get("rules", {})
        crash_dates = set()

        choice_data = {
            "dates": dates,
            "rules": {},
            "crash_dates": [],
            "overall_data": case_rule_data.get("overall_data", {})
        }

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

            choice_data["rules"][rule_key] = {
                "dates": dates,
                "values": values,
                "type": rule_info.get("type"),
                "name": rule_info.get("name"),
            }
            if mode == "single":
                choice_data["rules"][rule_key]["is_single"] = rule_info.get("is_single")
            else:
                choice_data["rules"][rule_key].update({
                    "thread": rule_info.get("thread"),
                    "color": rule_info.get("color"),
                    "rule_name": rule_info.get("rule_name"),
                    "is_multi": rule_info.get("is_multi"),
                })

        choice_data["crash_dates"] = list(crash_dates)
        if mode == "multi":
            choice_data["selected_threads"] = case_rule_data.get("all_threads", [])

        return choice_data

    # ==================== 数据加载接口 ====================

    def load_single_chart(self, tool_id: str, user_id: str):
        """加载单线程数据"""
        self.logger.info(f"加载工具 {tool_id} 单线程数据")
        single_data = self.get_all_data(tool_id, user_id, "single")
        message = '单线程数据已更新' if single_data else '单线程数据加载完成'
        return single_data, message

    def load_multi_chart(self, tool_id: str, user_id: str):
        """加载多线程数据"""
        self.logger.info(f"加载工具 {tool_id} 多线程数据")
        multi_data = self.get_all_data(tool_id, user_id, "multi")
        message = '多线程数据已更新' if multi_data else '多线程数据加载完成'
        return multi_data, message

    def load_extra_chart(self, tool_id: str, user_id: str):
        """加载额外数据"""
        self.logger.info(f"加载工具 {tool_id} 额外数据")
        tool_config = tool_manager.get_tool(tool_id) or {}
        extra_display_path = tool_config.get('extra_display_path') or ''
        func = self._load_function(tool_config.get('extra_display_func'), tool_config)
        extra = func(extra_display_path) if func else {}
        return extra, ''

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

    def load_single_or_multi_chart(self, tool_id: str, user_id: str):
        """加载单线程和多线程数据"""
        self.create_user_data_dir(user_id, tool_id)
        
        # 初始化文件监听器
        self.init_file_watcher(tool_id)
        
        all_data = {}
        tool_config = tool_manager.get_tool(tool_id) or {}
        
        if tool_config.get('single_path'):
            all_data['single'], single_message = self.load_single_chart(tool_id, user_id)
        else:
            single_message = f"工具 {tool_id} 单线程数据不存在"
        
        if tool_config.get('multi_path'):
            all_data['multi'], multi_message = self.load_multi_chart(tool_id, user_id)
        else:
            multi_message = ''
        
        if tool_config.get('extra_display_path'):
            all_data['extra'], extra_message = self.load_extra_chart(tool_id, user_id)
        else:
            extra_message = ''

        message = f"{single_message}{multi_message}{extra_message}"
        if not message:
            message = '数据已是最新'

        return all_data, message

    # ==================== 对比功能 ====================

    def compare_data(self, 
        tool_id: str, 
        mode: str,
        casename: str, 
        date1: str = None, 
        date2: str = None, 
        compare_mode: str = 'all',
        dimension: str = None,
        runtime_threshold: float = 0,
        memory_threshold: float = 0,
        error_mode: str = 'absolute',
        threads: List[int] = None,
        compare_type: str = 'single') -> Dict:
        """数据对比 - 支持单线程和多线程"""
        if not casename or not date1:
            return {'success': False, 'error': '请选择 Casename 和日期'}

        if compare_type == 'single' and not date2:
            return {'success': False, 'error': '版本对比需要两个日期'}

        data_path = DATA_DIR / tool_id / "original" / mode / casename
        if not data_path.exists():
            return {'success': False, 'error': f'找不到 casename: {casename} 的数据'}

        if dimension:
            dimensions = [dimension]
        else:
            dimensions = ['cputime', 'realtime', 'peakmem', 'incmem', 'realtimeincmem']
            dimensions = [d for d in dimensions if (data_path / d).exists()]

        if compare_mode == 'all':
            rules = self._get_all_rules(data_path, dimensions)
        else:
            rules = [compare_mode]

        if mode == 'multi' and threads:
            thread_list = threads
        elif mode == 'multi':
            thread_list = self._get_all_threads(data_path, casename, dimensions, rules)
        else:
            thread_list = [-1]

        result = self._perform_comparison(
            data_path, casename, dimensions, rules, thread_list,
            date1, date2 if compare_type == 'single' else None,
            runtime_threshold, memory_threshold, error_mode,
            mode, compare_type
        )

        return {'success': True, 'data': result}

    def _get_all_rules(self, data_path: Path, dimensions: List[str]) -> List[str]:
        """获取所有规则"""
        rules = set()
        for dim in dimensions:
            dim_path = data_path / dim
            if dim_path.exists():
                for file in dim_path.glob('*.json'):
                    rules.add(file.stem)
        return sorted(list(rules))

    def _get_all_threads(self, data_path: Path, casename: str, dimensions: List[str], rules: List[str]) -> List[int]:
        """获取所有线程数"""
        threads = set()
        for dim in dimensions:
            for rule in rules:
                rule_file = data_path / dim / f"{rule}.json"
                if rule_file.exists():
                    data = load_tool_data(rule_file)
                    if data and 'rules' in data:
                        for rule_key in data['rules']:
                            if '(' in rule_key and ')' in rule_key:
                                try:
                                    thread_str = rule_key.split('(')[1].split(')')[0]
                                    threads.add(int(thread_str))
                                except (ValueError, IndexError):
                                    pass
        return sorted(list(threads))

    def _perform_comparison(self, data_path: Path, casename: str, dimensions: List[str],
                           rules: List[str], thread_list: List[int], date1: str, date2: str,
                           runtime_threshold: float, memory_threshold: float,
                           error_mode: str, mode: str, compare_type: str) -> Dict:
        """执行对比计算"""
        is_thread_compare = (compare_type == 'thread')
        comparison_results = []
        statistics = {
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
                    if mode == 'single':
                        if not rule_info.get('is_single', False):
                            continue
                    else:
                        thread_match = False
                        for t in thread_list:
                            if f"({t})" in rule_key:
                                thread_match = True
                                break
                        if not thread_match:
                            continue

                    dates = rule_info.get('dates', [])
                    values = rule_info.get('values', [])

                    if is_thread_compare:
                        try:
                            idx = dates.index(date1)
                            val = values[idx] if idx < len(values) else None
                        except ValueError:
                            continue
                        if val is None:
                            continue
                        thread_num = rule_info.get('thread', 0)
                        row.append(f"{thread_num}线程")
                        row.append(round(val, 2))
                        if dim in ['cputime', 'realtime']:
                            has_runtime = True
                        elif dim in ['peakmem', 'incmem', 'realtimeincmem']:
                            has_memory = True
                        continue

                    val1 = None
                    val2 = None
                    try:
                        idx1 = dates.index(date1)
                        idx2 = dates.index(date2)
                        if idx1 < len(values):
                            val1 = values[idx1]
                        if idx2 < len(values):
                            val2 = values[idx2]
                    except ValueError:
                        continue
                    if val1 is None or val2 is None:
                        continue

                    diff = val2 - val1
                    diff_percent = 0 if val1 == 0 else round((diff / val1) * 100, 2)
                    is_runtime = dim in ['cputime', 'realtime']
                    is_memory = dim in ['peakmem', 'incmem', 'realtimeincmem']
                    diff_key = "diff_percent" if error_mode == 'percentage' else "diff"
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

            if is_thread_compare:
                if len(row) > 1:
                    comparison_results.append(row)
            else:
                if has_runtime or has_memory:
                    comparison_results.append(row)

        if not is_thread_compare:
            if total_runtime_count > 0:
                statistics['avg_runtime_change'] = round(total_runtime_change / total_runtime_count, 2)
            if total_memory_count > 0:
                statistics['avg_memory_change'] = round(total_memory_change / total_memory_count, 2)

            statistics['runtime_increased'] = sorted(
                statistics['runtime_increased'].items(),
                key=lambda x: x[1], reverse=True
            )
            statistics['runtime_decreased'] = sorted(
                statistics['runtime_decreased'].items(),
                key=lambda x: x[1], reverse=True
            )
            statistics['memory_increased'] = sorted(
                statistics['memory_increased'].items(),
                key=lambda x: x[1], reverse=True
            )
            statistics['memory_decreased'] = sorted(
                statistics['memory_decreased'].items(),
                key=lambda x: x[1], reverse=True
            )
        else:
            statistics = {}

        return {
            'statistics': statistics,
            'comparisons': comparison_results
        }

    def _get_status(self, diff_value: float, is_runtime: bool, runtime_threshold: float, memory_threshold: float) -> str:
        """获取变化状态"""
        threshold = runtime_threshold if is_runtime else memory_threshold
        if diff_value > threshold:
            return '⬆️增加'
        elif diff_value < -threshold:
            return '⬇️减少'
        else:
            return '· 无变化'

    def _update_statistics(self, statistics: Dict, type_name: str, status: str, rule: str, diff_value: float):
        """更新统计信息"""
        key = f"{type_name}_increased" if status == '⬆️增加' else f"{type_name}_decreased"
        if status != '· 无变化':
            statistics[key][rule] = abs(diff_value)
            max_key = f"max_{type_name}_increased" if status == '⬆️增加' else f"max_{type_name}_decreased"
            if statistics[max_key]['value'] < abs(diff_value):
                statistics[max_key] = {'name': rule, 'value': abs(diff_value)}

    # ==================== 清理 ====================

    def dispose(self):
        """释放资源"""
        self.stop_file_watcher()
        self._executor.shutdown(wait=False)
        self.logger.info("数据管理器已释放")


# 全局实例
data_manager = DataManager()