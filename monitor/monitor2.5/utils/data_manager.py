"""
数据管理器 - 处理数据获取和解析
"""
from importlib.metadata import files
import importlib.util
from json import tool
from os import path
import sys
import shutil
from pathlib import Path
from typing import Dict, Any, Optional, Callable, List
from datetime import datetime
from threading import Lock

from matplotlib.pylab import multi_dot

from config import DATA_DIR, BASE_DIR
from utils.tool_manager import tool_manager
from debug.debug import green,red,blue
from utils.find_files import find
from utils.log import *
import json


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
    
    # 保存工具数据到文件
    def save_tool_data(self, filename:str, data:Dict):
        """
        保存工具数据到文件
        """
        with open(filename, "w") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        self.logger.info(f"保存工具数据到文件: {filename}")

    def load_tool_data(self, filename:str) -> Dict:
        """
        从文件加载工具数据
        """
        with open(filename, "r", encoding="utf-8") as f:
            data = json.load(f)
        self.logger.info(f"从文件加载工具数据: {filename}")
        return data

    # 加载工具数据从文件
    def get_all_data(self, tool_id: str, user_id: str, type):
        """
        加载工具数据从文件
        """
        data_files_json_path = DATA_DIR / tool_id  / f"dataFiles_{type}.json"

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
            self.data_files = self.load_tool_data(data_files_json_path)
            old_data_files_paths = self.data_files[type]
            # 对比新增数据
            add_data_files_paths = set(new_data_files_paths) - set(old_data_files_paths)
            if add_data_files_paths:
                # 如果有新增数据，从新加载
                data = func(add_data_files_paths, 1)
                self.logger.info(f"用户 {user_id} 新增 {type} 数据，返回新增数据")
                self.data_files[type] = new_data_files_paths
            else:
                # 如果没有新增数据，直接返回 None
                self.logger.info(f"用户 {user_id} 没有新增 {type} 数据")
                return None
        print(self.data_files)
        # 保存新增数据到文件
        self.save_tool_data(DATA_DIR / tool_id / f"dataFiles_{type}.json", self.data_files)
        return data


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
            mode_data = self.load_tool_data(mode_path)
            rules = mode_data[casename]["runtime"].keys() | mode_data[casename]["memory"].keys()
        else:
            rules = compare_mode
        # 对比数据
        rule_data_compare_data_runtime = {}
        rule_data_compare_data_memory = {}
        for rule in rules:
            if dimension == 'all' or dimension == 'runtime':
                case_data_runtime = self.load_tool_data(DATA_DIR / tool_id / "original" /casename / type /"runtime" / f"{rule}.json")
                date1_data, date2_data, runtime_diff, runtime_diff_percent = self.calculation_error(case_data_runtime, rule, date1, date2)
                rule_data_compare_data_runtime[rule] = {
                    "date1_data": date1_data,
                    "date2_data": date2_data,
                    "diff": runtime_diff,
                    "diff_percent": runtime_diff_percent,
                }
                
            if dimension == 'memory':
                case_data_memory = self.load_tool_data(DATA_DIR / tool_id / casename / type /"memory" / f"{rule}.json")
                date1_data, date2_data, memory_diff, memory_diff_percent = self.calculation_error(case_data_memory, rule, date1, date2)
                rule_data_compare_data_memory[rule] = {
                    "date1_data": date1_data,
                    "date2_data": date2_data,
                    "diff": memory_diff,
                    "diff_percent": memory_diff_percent,
                }
        return self.statistical_compare_result_data(rule_data_compare_data_runtime, rule_data_compare_data_memory, dimension, runtime_threshold, memory_threshold, error_mode)

    def calculation_error(self, data, rule: str, date1: str, date2: str):

        dates = data["rules"][rule]["dates"]
        index1 = dates.index(date1)
        date1_data = data["rules"][rule]["values"][index1]
        index2 = dates.index(date2)
        date2_data = data["rules"][rule]["values"][index2]

        diff = date2_data - date1_data
        diff_percent = round((diff / date1_data) * 100, 2)
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
        if dimension == 'all':
            for rule, value in result.items():
                compare_result[rule] = value["runtime"] + value["memory"]
        elif dimension == 'runtime':
            for rule, value in result.items():
                compare_result[rule] = value["runtime"]
        elif dimension == 'memory':
            for rule, value in result.items():
                compare_result[rule] = value["memory"]

        statistics = self.statistics_compare_result_data(compare_result, dimension)

        result["statistics"] = statistics
        result["comparison"] = compare_result

        return result

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

    def statistics_compare_result_data(self, compare_result_data: dict, dimension: str):
        statistics = {
            "runtime_increased": [], 
            "runtime_decreased": [], 
            "memory_increased": [], 
            "memory_decreased": [],
            "avg_runtime_change": 0,
            "avg_memory_change": 0,
            "max_runtime_increase": [],
            "max_runtime_decrease": [],
            "max_memory_increase": [],
            "max_memory_decrease": [],
        }
        runtime_increase_tmp = 0
        runtime_decrease_tmp = 0
        memory_increase_tmp = 0
        memory_decrease_tmp = 0
        for rule,value in compare_result_data.items():
            if dimension == "all":
                if value[3] == "⬆️增加":
                    statistics["runtime_increased"][value[3]] = rule
                    if value[3] in statistics["max_runtime_increase"]:
                        statistics["runtime_increased"][value[3]].append(rule)
                    else:
                        statistics["runtime_increased"][value[3]] = rule
                    if runtime_increase_tmp < value[3]:
                        runtime_increase_tmp = value[3]
                    
                elif value[3] == "⬇️减少":
                    statistics["runtime_decreased"][value[3]] = rule
                    if value[3] in statistics["max_runtime_decrease"]:
                        statistics["runtime_decreased"][value[3]].append(rule)
                    else:
                        statistics["runtime_decreased"][value[3]] = rule
                    if runtime_decrease_tmp > value[3]:
                        runtime_decrease_tmp = value[3]
                    
                # 内存对比
                if value[7] == "⬆️增加":
                    statistics["memory_increased"][value[7]] = rule
                    if value[7] in statistics["max_memory_increase"]:
                        statistics["memory_increased"][value[7]].append(rule)
                    else:
                        statistics["memory_increased"][value[7]] = rule
                    if memory_increase_tmp < value[7]:
                        memory_increase_tmp = value[7]
                    
                elif value[7] == "⬇️减少":
                    statistics["memory_decreased"][value[7]] = rule
                    if value[7] in statistics["max_memory_decrease"]:
                        statistics["memory_decreased"][value[7]].append(rule)
                    else:
                        statistics["memory_decreased"][value[7]] = rule
                    if memory_decrease_tmp > value[7]:
                        memory_decrease_tmp = value[7]
            elif dimension == "runtime":
                if value[3] == "⬆️增加":
                    statistics["runtime_increased"][value[3]] = rule
                    if value[3] in statistics["max_runtime_increase"]:
                        statistics["runtime_increased"][value[3]].append(rule)
                    else:
                        statistics["runtime_increased"][value[3]] = rule
                    if runtime_increase_tmp < value[3]:
                        runtime_increase_tmp = value[3]
                    if runtime_decrease_tmp > value[3]:
                        runtime_decrease_tmp = value[3]
                    
                elif value[3] == "⬇️减少":
                    statistics["runtime_decreased"][value[3]] = rule
                    if value[3] in statistics["max_runtime_decrease"]:
                        statistics["runtime_decreased"][value[3]].append(rule)
                    else:
                        statistics["runtime_decreased"][value[3]] = rule
                    if runtime_decrease_tmp > value[3]:
                        runtime_decrease_tmp = value[3]
            elif dimension == "memory":
                if value[3] == "⬆️增加":
                    statistics["memory_increased"][value[3]] = rule
                    if value[3] in statistics["max_memory_increase"]:
                        statistics["memory_increased"][value[3]].append(rule)   
                    else:
                        statistics["memory_increased"][value[3]] = rule
                    if memory_increase_tmp < value[3]:
                        memory_increase_tmp = value[3]
                    if memory_decrease_tmp > value[3]:
                        memory_decrease_tmp = value[3]
                    
        if dimension == "all":
            statistics["runtime_increase"] = dict(sorted(statistics["runtime_increased"].items(), reverse=True))
            statistics["runtime_decrease"] = dict(sorted(statistics["runtime_decreased"].items(), reverse=True))
            statistics["max_runtime_increase"] = runtime_increase_tmp
            statistics["max_runtime_decrease"] = runtime_decrease_tmp
            statistics["avg_runtime_change"] = (runtime_increase_tmp - runtime_decrease_tmp) / (runtime_increase_tmp + runtime_decrease_tmp)
            statistics["memory_increase"] = dict(sorted(statistics["memory_increased"].items(), reverse=True))
            statistics["memory_decrease"] = dict(sorted(statistics["memory_decreased"].items(), reverse=True))
            statistics["max_memory_increase"] = memory_increase_tmp
            statistics["max_memory_decrease"] = memory_decrease_tmp
            statistics["avg_memory_change"] = (memory_increase_tmp - memory_decrease_tmp) / (memory_increase_tmp + memory_decrease_tmp)
        elif dimension == "runtime":
            statistics["runtime_increase"] = dict(sorted(statistics["runtime_increased"].items(), reverse=True))
            statistics["runtime_decrease"] = dict(sorted(statistics["runtime_decreased"].items(), reverse=True))
            statistics["max_runtime_increase"] = runtime_increase_tmp
            statistics["max_runtime_decrease"] = runtime_decrease_tmp
            statistics["avg_runtime_change"] = (runtime_increase_tmp - runtime_decrease_tmp) / (runtime_increase_tmp + runtime_decrease_tmp)
        elif dimension == "memory":
            statistics["memory_increase"] = dict(sorted(statistics["memory_increased"].items(), reverse=True))
            statistics["memory_decrease"] = dict(sorted(statistics["memory_decreased"].items(), reverse=True))
            statistics["max_memory_increase"] = memory_increase_tmp
            statistics["max_memory_decrease"] = memory_decrease_tmp
            statistics["avg_memory_change"] = (memory_increase_tmp - memory_decrease_tmp) / (memory_increase_tmp + memory_decrease_tmp)



    #     func = self._load_function(func_name, tool_config)
    #     if not func:
    #         return {}
        
    #     # 构建用户隔离的 JSON 路径
    #     # 新路径格式: data/{tool_name}/{user_id}/{tool_name}_single.json
    #     user_data_dir = DATA_DIR / tool_name / user_id / "single"
    #     user_data_dir.mkdir(parents=True, exist_ok=True)
        
    #     try:
    #         # 调用用户配置的函数，传入用户隔离的 JSON 路径和原始数据路径
    #         result= func({}, data_path)
    #         # 验证数据结构
    #         if self._validate_single_thread_data(dict(result)):
    #             return result
    #         else:
    #             self.logger.error(f"单线程数据格式无效: {type(result)}, 需要是 dict")
    #             return {}
    #     except Exception as e:
    #         self.logger.error(f"获取单线程数据失败: {e}")
    #         return {}
    
#     def get_multi_thread_data(self, user_id: str, tool_config: Dict) -> Dict:
#         """
#         获取多线程数据
        
#         参数:
#             user_id: 用户ID，用于隔离数据
#             tool_config: 工具配置
#         """
#         func_name = tool_config.get('multi_thread_func')
#         data_path = tool_config.get('multi_thread_path')
#         tool_name = tool_config.get('tool_name')
#         green(f"获取工具 {tool_name} 多线程的数据中")

#         if not func_name or not data_path:
#             return {}

#         func = self._load_function(func_name, tool_config)
#         if not func:
#             return {}
        
#         # 构建用户隔离的 JSON 路径
#         # 新路径格式: data/{tool_name}/{user_id}/{tool_name}_multi.json
#         user_data_dir = DATA_DIR / tool_name / user_id
#         user_data_dir.mkdir(parents=True, exist_ok=True)
#         json_path = user_data_dir / f'{tool_name}_multi.json'

#         try:
#             result = func(str(json_path), data_path)

#             if self._validate_multi_thread_data(dict(result)):
#                 return result
#             else:
#                 return {}
#         except Exception as e:
#             print(f"获取多线程数据失败: {e}")
#             return {}
    
#     def get_custom_curve_data(self, user_id: str, tool_config: Dict, extra_path: str = None) -> Dict:
#         """
#         获取自定义曲线数据
        
#         参数:
#             user_id: 用户ID，用于隔离数据
#             tool_config: 工具配置
#             extra_path: 额外数据路径
#         """
#         func_name = tool_config.get('custom_curve_func')
#         data_path = extra_path or tool_config.get('extra_display_path')
        
#         if not func_name or not data_path:
#             return {}
        
#         func = self._load_function(func_name, tool_config)
#         if not func:
#             return {}
        
#         try:
#             result = func(data_path)
#             if self._validate_multi_thread_data(result):
#                 return result
#             return {}
#         except Exception as e:
#             print(f"获取自定义曲线数据失败: {e}")
#             return {}
    
#     def get_extra_data(self, user_id: str, tool_config: Dict, extra_path: str = None) -> Dict:
#         """
#         获取自定义曲线数据
        
#         参数:
#             user_id: 用户ID，用于隔离数据
#             tool_config: 工具配置
#             extra_path: 额外数据路径
#         """
#         func_name = tool_config.get('extra_display_func')
#         data_path = extra_path or tool_config.get('extra_display_path')
        
#         if not func_name or not data_path:
#             return {}
        
#         func = self._load_function(func_name, tool_config)
#         if not func:
#             return {}
        
#         try:
#             result = func(data_path)
#             if result:
#                 return result
#             return {}
#         except Exception as e:
#             print(f"获取自定义曲线数据失败: {e}")
#             return {}

#     def _validate_single_thread_data(self, data: Dict) -> bool:
#         """验证单线程数据格式"""
#         if not isinstance(data, dict):
#             return False

#         # 跳过内部字段
#         skip_fields = ['dataFiles', '__multi_processed_logs__']
        
#         for key, value in data.items():
#             if key in skip_fields:
#                 continue
                
#             if not isinstance(value, dict):
#                 return False
#             if 'daily_metrics' not in value:
#                 # 可能是直接的数据结构，尝试继续
#                 continue
            
#             for date, metrics in value['daily_metrics'].items():
#                 if not isinstance(metrics, dict):
#                     return False
#                 for rule, rule_data in metrics.items():
#                     if not isinstance(rule_data, dict):
#                         return False
#                     # 检查是否有 runtime 和 memory，或者有 thread_metrics
#                     if 'runtime' not in rule_data and 'memory' not in rule_data:
#                         if 'thread_metrics' not in rule_data:
#                             return False
        
#         return True
    
#     def _validate_multi_thread_data(self, data: Dict) -> bool:
#         """验证多线程数据格式"""
#         if not isinstance(data, dict):
#             return False
#         skip_fields = ['dataFiles', '__multi_processed_logs__']

#         for casename, case_data in data.items():
#             if casename in skip_fields:
#                 continue
#             if not isinstance(case_data, dict):
#                 return False
#             if 'daily_metrics' not in case_data:
#                 return False
            
#             for date, metrics in case_data['daily_metrics'].items():
#                 if not isinstance(metrics, dict):
#                     return False
#                 for rule, rule_data in metrics.items():
#                     if not isinstance(rule_data, dict):
#                         return False
#                     if 'thread_metrics' not in rule_data:
#                         return False
#                     if not isinstance(rule_data['thread_metrics'], dict):
#                         return False
        
#         return True
    
#     def get_user_added_data(self, paths: List[str]) -> Dict:
#         """获取用户添加的数据"""
#         result = {}
        
#         for path in paths:
#             path = path.strip()
#             if not path:
#                 continue
            
#             try:
#                 path_obj = Path(path)
#                 if path_obj.exists():
#                     import json
#                     with open(path_obj, 'r', encoding='utf-8') as f:
#                         data = json.load(f)
#                         result.update(data)
#             except Exception as e:
#                 print(f"加载用户数据失败 {path}: {e}")
        
#         return result

#     def _get_init_data(self, user_id, tool_id):
#         """
#             当数据部不存在时获取初始数据
#         """
#         tool_config = tool_manager.get_tool(tool_id)
#         upload = {'single':1,'multi':1,'extra':1}
#         all_data = {}
#         # 获取单线程的数据
#         single_data = self.get_single_thread_data(user_id, tool_config)
#         if single_data:
#             tool_manager.save_single_thread_data(user_id, tool_id, single_data)
#             if 'dataFiles' in single_data:
#                 del single_data['dataFiles']
#             if '__multi_processed_logs__' in single_data:
#                 del single_data['__multi_processed_logs__']
#             all_data['single'] = single_data
#         else:
#             upload['single'] = 0

#         # 获取多线程的数据
#         multi_data = self.get_multi_thread_data(user_id, tool_config)
#         if multi_data:
#             tool_manager.save_multi_thread_data(user_id, tool_id, multi_data)
#             if 'dataFiles' in multi_data:
#                 del multi_data['dataFiles']
#             if '__multi_processed_logs__' in multi_data:
#                 del multi_data['__multi_processed_logs__']
#             all_data['multi'] = multi_data
#         else:
#             upload['multi'] = 0

#         # 获取额外的其他数据
#         extra_data = self.get_extra_data(user_id, tool_config)
#         if extra_data:
#             tool_manager.save_extra_data(user_id, tool_id, extra_data)
#             all_data['extra'] = extra_data
#         else:
#             upload['extra'] = 0

#         return (all_data, upload)

#     def upload_data(self, data, user_id, tool_id, type):
#         tool_config = tool_manager.get_tool(tool_id)
#         path = tool_config.get(f"{type}_thread_path")
#         green(f"检查 {type} 是否需要更新")

#         if not path:
#             red(f"工具{tool_id}未设置获取多线程数据的路径")
#             return 0

#         if type == "single":
#             # 检查 single 是否需要更新
#             latest_files = find(path, maxdepth=3, name_pattern=r"^\d{8}_[^/]+\.txt$", file_type="f")
#             incremental_files = set(latest_files) - set(data.get("dataFiles"))
#             if incremental_files:
#                 # 提取信息,并且要保存 to do
#                 green("需要更新")
#                 func = self._load_function(tool_config.get(f"{type}_thread_func"), tool_config)
#                 new_data = func(data, incremental_files)
#                 return new_data
#             else:
#                 green("没有数据需要更新")
#                 return 0
#         else:
#             latest_files = find(path)
#             incremental_files = set(latest_files) - set(data["dataFiles"])
#             if incremental_files:
#                 # 提取信息 to do
#                 pass
#             else:
#                 return 0

#     def data_is_upload(self, all_data, user_id, tool_id):
#         green(f"用户 {user_id} 请求查看数据是否需要更新")
#         upload = {'single':1,'multi':1,'extra':1}
        
#         # 查看单线程
#         single_data = self.upload_data(all_data['single'], user_id, tool_id, "single")
#         if single_data:
#             # 整合数据，以及保存新数据
#             tool_manager.save_single_thread_data(user_id, tool_id, single_data)
#             all_data['single'] = single_data
#         else:
#             upload['single'] = 0
        
#         # 查看多线程
#         multi_data = self.upload_data(all_data['multi'], user_id, tool_id, "multi")
#         if multi_data != 0:
#             # 整合数据，以及保存新数据
#             pass
#         else:
#             upload['multi'] = 0
#         return (all_data, upload)

#     # def judg_data_is_unlpad(self, old_files:List, new_files:List):
#     #     add_files = set(new_files) - set(old_files)
#     #     if add_files:
#     #         return new_files
#     #     return 0
        
#     # def get_data(self, user_id, tool_id):
#     #     """
#     #         获取已经存在的数据，并且更新到最新的数据
#     #     """




# # 全局实例
data_manager = DataManager()