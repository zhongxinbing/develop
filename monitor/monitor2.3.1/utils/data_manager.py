"""
数据管理器 - 处理数据获取和解析
"""
import importlib.util
import sys
from pathlib import Path
from typing import Dict, Any, Optional, Callable, List
from datetime import datetime
from threading import Lock

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
    
    def _load_function(self, function_name: str, tool_config) -> Optional[Callable]:
        """动态加载Python函数"""
        module_path = Path(__file__).resolve().parent.resolve().parent.resolve() / 'tool' / f'{tool_config.get("tool_name")}' / 'elint.py'
        if module_path in self._function_cache:
            return self._function_cache[module_path]
        
        try:
            if Path(module_path).exists():
            # 支持格式: module.function 或 path/to/module.py:function
                module_path = module_path
                func_name = function_name

                spec = importlib.util.spec_from_file_location(
                    f"dynamic_module_{hash(module_path)}", 
                    module_path
                )
                if spec and spec.loader:
                    module = importlib.util.module_from_spec(spec)
                    spec.loader.exec_module(module)
                    func = getattr(module, func_name, None)
                    if func and callable(func):

                        self._function_cache[module_path] = func
                        return func
            else:
                print(f"路径不存在：{module_path}")
                return None
            
            print(f"无法加载函数: {func}")
            return None
        except Exception as e:
            print(f"加载函数失败 {func}: {e}")
            return None
    
    def get_single_thread_data(self, tool_config: Dict) -> Dict:
        """获取单线程数据"""
        func_path = tool_config.get('single_thread_func')
        data_path = tool_config.get('single_thread_path')

        if not func_path or not data_path:
            return {}
        
        func = self._load_function(func_path, tool_config)
        if not func:
            return {}

        json_path = Path(__file__).resolve().parent.resolve().parent.resolve() / 'data' / f'{tool_config.get("tool_name")}' / f'{tool_config.get("tool_name")}.json'
        
        try:
            result = func(json_path, data_path)
            # 验证数据结构
            if self._validate_single_thread_data(dict(result)):
                return result
            else:
                print(f"单线程数据格式无效: {type(result)}, 需要是 dict")

                return {}
        except Exception as e:
            print(f"获取单线程数据失败: {e}")
            return {}
    
    def get_multi_thread_data(self, tool_config: Dict) -> Dict:
        """获取多线程数据"""
        func_path = tool_config.get('multi_thread_func')
        data_path = tool_config.get('multi_thread_path')
        
        if not func_path or not data_path:
            return {}
        
        func = self._load_function(func_path, tool_config)
        if not func:
            return {}
        json_path = Path(__file__).resolve().parent.resolve().parent.resolve() / 'data' / f'{tool_config.get("tool_name")}' / f'{tool_config.get("tool_name")}.json'
        try:
            result = func(json_path, data_path)
            if self._validate_multi_thread_data(dict(result)):
                return func
            else:
                print(f"单线程数据格式无效: {type(result)}, 需要是 dict")
                return {}
        except Exception as e:
            print(f"获取多线程数据失败: {e}")
            return {}
    
    def get_custom_curve_data(self, tool_config: Dict, extra_path: str = None) -> Dict:
        """获取自定义曲线数据"""
        func_path = tool_config.get('custom_curve_func')
        data_path = extra_path or tool_config.get('extra_display_path')
        
        if not func_path or not data_path:
            return {}
        
        func = self._load_function(func_path, tool_config)
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
    
    def _validate_single_thread_data(self, data: Dict) -> bool:
        """验证单线程数据格式"""
        if not isinstance(data, dict):
            return False

        for casename, case_data in data.items():
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
                    if 'runtime' not in rule_data or 'memory' not in rule_data:
                        return False
        
        return True
    
    def _validate_multi_thread_data(self, data: Dict) -> bool:
        """验证多线程数据格式"""
        if not isinstance(data, dict):
            return False
        
        for casename, case_data in data.items():
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
            
            # 这里假设用户添加的数据也是通过类似的函数获取
            # 实际使用时需要根据具体需求调整
            try:
                # 尝试从路径加载JSON文件
                path_obj = Path(path)
                if path_obj.exists():
                    import json
                    with open(path_obj, 'r', encoding='utf-8') as f:
                        data = json.load(f)
                        result.update(data)
            except Exception as e:
                print(f"加载用户数据失败 {path}: {e}")
        
        return result


# 全局实例
data_manager = DataManager()