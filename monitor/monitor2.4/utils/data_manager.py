"""
数据管理器 - 处理数据获取和解析
"""
import importlib.util
from os import path
import sys
from pathlib import Path
from typing import Dict, Any, Optional, Callable, List
from datetime import datetime
from threading import Lock

from matplotlib.pylab import multi_dot

from config import DATA_DIR
from utils.tool_manager import tool_manager
from debug.debug import green,red,blue
from utils.find_files import find



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
    
    def _load_function(self, function_name: str, tool_config) -> Optional[Callable]:
        """动态加载Python函数"""
        tool_name = tool_config.get('tool_name')
        # 在 tool 目录下查找对应工具的函数模块
        module_path = Path(__file__).resolve().parent.parent / 'tool' / tool_name / f'{tool_name}.py'
        cache_key = f"{module_path}:{function_name}"
        
        if cache_key in self._function_cache:
            return self._function_cache[cache_key]

        try:
            if Path(module_path).exists():
                spec = importlib.util.spec_from_file_location(
                    f"dynamic_module_{tool_name}_{hash(module_path)}", 
                    module_path
                )
                if spec and spec.loader:
                    module = importlib.util.module_from_spec(spec)
                    spec.loader.exec_module(module)
                    func = getattr(module, function_name, None)
                    if func and callable(func):
                        self._function_cache[cache_key] = func
                        return func
            else:
                print(f"路径不存在：{module_path}")
                return None
            
            print(f"无法加载函数: {function_name}")
            return None
        except Exception as e:
            print(f"加载函数失败 {function_name}: {e}")
            return None
    
    def get_single_thread_data(self, user_id: str, tool_config: Dict) -> Dict:
        """
        获取单线程数据
        
        参数:
            user_id: 用户ID，用于隔离数据
            tool_config: 工具配置
        """
        func_name = tool_config.get('single_thread_func')
        data_path = tool_config.get('single_thread_path')
        tool_name = tool_config.get('tool_name')

        green(f"获取工具 {tool_name} 单线程的数据中")
        if not func_name or not data_path:
            return {}
        
        func = self._load_function(func_name, tool_config)
        if not func:
            return {}
        
        # 构建用户隔离的 JSON 路径
        # 新路径格式: data/{tool_name}/{user_id}/{tool_name}_single.json
        user_data_dir = DATA_DIR / tool_name / user_id
        user_data_dir.mkdir(parents=True, exist_ok=True)
        json_path = user_data_dir / f'{tool_name}_single.json'
        
        try:
            # 调用用户配置的函数，传入用户隔离的 JSON 路径和原始数据路径
            result = func(str(json_path), data_path)
            # 验证数据结构
            if self._validate_single_thread_data(dict(result)):
                return result
            else:
                print(f"单线程数据格式无效: {type(result)}, 需要是 dict")
                return {}
        except Exception as e:
            print(f"获取单线程数据失败: {e}")
            return {}
    
    def get_multi_thread_data(self, user_id: str, tool_config: Dict) -> Dict:
        """
        获取多线程数据
        
        参数:
            user_id: 用户ID，用于隔离数据
            tool_config: 工具配置
        """
        func_name = tool_config.get('multi_thread_func')
        data_path = tool_config.get('multi_thread_path')
        tool_name = tool_config.get('tool_name')
        green(f"获取工具 {tool_name} 多线程的数据中")

        if not func_name or not data_path:
            return {}

        func = self._load_function(func_name, tool_config)
        if not func:
            return {}
        
        # 构建用户隔离的 JSON 路径
        # 新路径格式: data/{tool_name}/{user_id}/{tool_name}_multi.json
        user_data_dir = DATA_DIR / tool_name / user_id
        user_data_dir.mkdir(parents=True, exist_ok=True)
        json_path = user_data_dir / f'{tool_name}_multi.json'

        try:
            result = func(str(json_path), data_path)

            if self._validate_multi_thread_data(dict(result)):
                return result
            else:
                return {}
        except Exception as e:
            print(f"获取多线程数据失败: {e}")
            return {}
    
    def get_custom_curve_data(self, user_id: str, tool_config: Dict, extra_path: str = None) -> Dict:
        """
        获取自定义曲线数据
        
        参数:
            user_id: 用户ID，用于隔离数据
            tool_config: 工具配置
            extra_path: 额外数据路径
        """
        func_name = tool_config.get('custom_curve_func')
        data_path = extra_path or tool_config.get('extra_display_path')
        
        if not func_name or not data_path:
            return {}
        
        func = self._load_function(func_name, tool_config)
        if not func:
            return {}
        
        try:
            result = func(data_path)
            if self._validate_multi_thread_data(result):
                return result
            return {}
        except Exception as e:
            print(f"获取自定义曲线数据失败: {e}")
            return {}
    
    def get_extra_data(self, user_id: str, tool_config: Dict, extra_path: str = None) -> Dict:
        """
        获取自定义曲线数据
        
        参数:
            user_id: 用户ID，用于隔离数据
            tool_config: 工具配置
            extra_path: 额外数据路径
        """
        func_name = tool_config.get('extra_display_func')
        data_path = extra_path or tool_config.get('extra_display_path')
        
        if not func_name or not data_path:
            return {}
        
        func = self._load_function(func_name, tool_config)
        if not func:
            return {}
        
        try:
            result = func(data_path)
            if result:
                return result
            return {}
        except Exception as e:
            print(f"获取自定义曲线数据失败: {e}")
            return {}

    def _validate_single_thread_data(self, data: Dict) -> bool:
        """验证单线程数据格式"""
        if not isinstance(data, dict):
            return False

        # 跳过内部字段
        skip_fields = ['dataFiles', '__multi_processed_logs__']
        
        for key, value in data.items():
            if key in skip_fields:
                continue
                
            if not isinstance(value, dict):
                return False
            if 'daily_metrics' not in value:
                # 可能是直接的数据结构，尝试继续
                continue
            
            for date, metrics in value['daily_metrics'].items():
                if not isinstance(metrics, dict):
                    return False
                for rule, rule_data in metrics.items():
                    if not isinstance(rule_data, dict):
                        return False
                    # 检查是否有 runtime 和 memory，或者有 thread_metrics
                    if 'runtime' not in rule_data and 'memory' not in rule_data:
                        if 'thread_metrics' not in rule_data:
                            return False
        
        return True
    
    def _validate_multi_thread_data(self, data: Dict) -> bool:
        """验证多线程数据格式"""
        if not isinstance(data, dict):
            return False
        skip_fields = ['dataFiles', '__multi_processed_logs__']

        for casename, case_data in data.items():
            if casename in skip_fields:
                continue
            if not isinstance(case_data, dict):
                return False
            if 'daily_metrics' not in case_data:
                return False
            
            for date, metrics in case_data['daily_metrics'].items():
                if not isinstance(metrics, dict):
                    return False
                for rule, rule_data in metrics.items():
                    if not isinstance(rule_data, dict):
                        return False
                    if 'thread_metrics' not in rule_data:
                        return False
                    if not isinstance(rule_data['thread_metrics'], dict):
                        return False
        
        return True
    
    def get_user_added_data(self, paths: List[str]) -> Dict:
        """获取用户添加的数据"""
        result = {}
        
        for path in paths:
            path = path.strip()
            if not path:
                continue
            
            try:
                path_obj = Path(path)
                if path_obj.exists():
                    import json
                    with open(path_obj, 'r', encoding='utf-8') as f:
                        data = json.load(f)
                        result.update(data)
            except Exception as e:
                print(f"加载用户数据失败 {path}: {e}")
        
        return result

    def _get_init_data(self, user_id, tool_id):
        """
            获取初始数据
        """
        tool_config = tool_manager.get_tool(user_id, tool_id)

        # 获取单线程的数据
        signal_data = self.get_single_thread_data(user_id, tool_config)
        if signal_data:
            tool_manager.save_single_thread_data(user_id, tool_id, signal_data)
            if 'dataFiles' in signal_data:
                del signal_data['dataFiles']
            if '__multi_processed_logs__' in signal_data:
                del signal_data['__multi_processed_logs__']

        multi_data = self.get_multi_thread_data(user_id, tool_config)
        if multi_data:
            tool_manager.save_multi_thread_data(user_id, tool_id, multi_data)
            if 'dataFiles' in multi_data:
                del multi_data['dataFiles']
            if '__multi_processed_logs__' in multi_data:
                del multi_data['__multi_processed_logs__']

        return {"signal": signal_data, "multi": multi_data}

    def upload_data(self, data, user_id, tool_id, type):
        tool_config = tool_manager.get_tool(user_id, tool_id)
        path = tool_config.get(f"{type}_thread_path"),
        if not path:
            red(f"工具{tool_id}未设置获取多线程数据的路径")
            return 0
        if type == "signal":
            # 检查 signal 是否需要更新
            latest_files = find(path, maxdepth=3, name_pattern=r"^\d{8}_[^/]+\.txt$", file_type="f")
            incremental_files = set(latest_files) - set(data[type]["dataFiles"])
            if incremental_files:
                # 提取信息,并且要保存 to do
                pass
            else:
                return 0
        else:
            latest_files = find(path)
            incremental_files = set(latest_files) - set(data[type]["dataFiles"])
            if incremental_files:
                # 提取信息 to do
                pass
            else:
                return 0


    def data_is_upload(self, all_data, user_id, tool_id):
        green(f"用户 {user_id} 请求查看数据是否需要更新")

        # 查看单线程
        signal_data = self.upload_data(all_data['signal'], user_id, tool_id, "signal")
        if signal_data != 0:
            # 整合数据，以及保存新数据
            pass

        # 查看多线程
        multi_data = self.upload_data(all_data['multi'], user_id, tool_id, "multi")
        if multi_data != 0:
            # 整合数据，以及保存新数据
            pass
        return all_data

        

# 全局实例
data_manager = DataManager()