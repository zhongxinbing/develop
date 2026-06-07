"""
数据加载模块
负责加载和管理性能数据
"""
import json
import importlib
from pathlib import Path
from typing import Dict, Any, Optional, List
from datetime import datetime


class DataLoader:
    """数据加载器"""
    
    def __init__(self, data_root: Path):
        self.data_root = Path(data_root)
    
    def _get_tool_cache_path(self, tool_name: str, data_type: str) -> Path:
        """获取工具缓存文件路径"""
        safe_name = self._safe_name(tool_name)
        tool_dir = self.data_root / safe_name
        tool_dir.mkdir(exist_ok=True)
        return tool_dir / f'{data_type}_cache.json'
    
    def _safe_name(self, name: str) -> str:
        """安全文件名"""
        return ''.join(c for c in name if c.isalnum() or c in '._-')[:50]
    
    def load_cached_data(self, tool_name: str, data_type: str) -> Optional[Dict]:
        """加载缓存数据"""
        cache_path = self._get_tool_cache_path(tool_name, data_type)
        if cache_path.exists():
            try:
                with open(cache_path, 'r', encoding='utf-8') as f:
                    return json.load(f)
            except:
                return None
        return None
    
    def save_cached_data(self, tool_name: str, data_type: str, data: Dict):
        """保存缓存数据"""
        cache_path = self._get_tool_cache_path(tool_name, data_type)
        with open(cache_path, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
    
    def save_user_cache(self, tool_name: str, user_data: Dict):
        """保存用户添加的数据到缓存"""
        cache_path = self._get_tool_cache_path(tool_name, 'user')
        
        existing = {}
        if cache_path.exists():
            try:
                with open(cache_path, 'r', encoding='utf-8') as f:
                    existing = json.load(f)
            except:
                pass
        
        for casename, case_data in user_data.items():
            if casename not in existing:
                existing[casename] = {}
            
            daily_metrics = case_data.get('daily_metrics', {})
            for date, metrics in daily_metrics.items():
                existing[casename][date] = metrics
        
        with open(cache_path, 'w', encoding='utf-8') as f:
            json.dump(existing, f, ensure_ascii=False, indent=2)
    
    def load_user_data(self, tool: Dict, paths: List[str]) -> Dict:
        """加载用户添加的数据"""
        result = {}
        
        for path in paths:
            path_obj = Path(path)
            if not path_obj.exists():
                continue
            
            for file_path in path_obj.glob('*.json'):
                try:
                    with open(file_path, 'r', encoding='utf-8') as f:
                        data = json.load(f)
                    
                    processed_data = self._add_user_suffix(data)
                    
                    for casename, case_data in processed_data.items():
                        if casename not in result:
                            result[casename] = {'daily_metrics': {}}
                        
                        daily_metrics = case_data.get('daily_metrics', {})
                        for date, metrics in daily_metrics.items():
                            result[casename]['daily_metrics'][date] = metrics
                except Exception as e:
                    print(f"Error loading {file_path}: {e}")
        
        return result
    
    def _add_user_suffix(self, data: Dict) -> Dict:
        """为数据添加_user后缀"""
        result = {}
        
        for casename, case_data in data.items():
            result[casename] = {'daily_metrics': {}}
            
            daily_metrics = case_data.get('daily_metrics', {})
            for date, metrics in daily_metrics.items():
                user_date = f"{date}_user"
                result[casename]['daily_metrics'][user_date] = metrics
        
        return result
    
    def clear_cache(self, tool_name: str):
        """清除工具缓存"""
        safe_name = self._safe_name(tool_name)
        tool_dir = self.data_root / safe_name
        if tool_dir.exists():
            for cache_file in tool_dir.glob('*_cache.json'):
                cache_file.unlink()
    
    def load_single_thread_data(self, data_path: str, interface_func: str) -> Dict:
        """
        加载单线程数据
        期望的数据格式:
        {
            "casename_key": {
                "casename": "casename_key",
                "daily_metrics": {
                    "2024-01-01": {
                        "rule1": {"runtime": 100.1, "memory": 190.2}
                    }
                }
            }
        }
        """
        path_obj = Path(data_path)
        result = {}
        
        if path_obj.exists():
            for json_file in path_obj.glob('*.json'):
                try:
                    with open(json_file, 'r', encoding='utf-8') as f:
                        data = json.load(f)
                    result.update(data)
                except Exception as e:
                    print(f"Error loading {json_file}: {e}")
        
        return result
    
    def load_multi_thread_data(self, data_path: str, interface_func: str) -> Dict:
        """
        加载多线程数据
        期望的数据格式:
        {
            "casename_key": {
                "casename": "casename_key",
                "daily_metrics": {
                    "2024-01-01": {
                        "rule_key": {
                            "thread_metrics": {
                                "thread_1": {"runtime": 100.1, "memory": 190.2}
                            }
                        }
                    }
                }
            }
        }
        """
        path_obj = Path(data_path)
        result = {}
        
        if path_obj.exists():
            for json_file in path_obj.glob('*.json'):
                try:
                    with open(json_file, 'r', encoding='utf-8') as f:
                        data = json.load(f)
                    result.update(data)
                except Exception as e:
                    print(f"Error loading {json_file}: {e}")
        
        return result
    
    def load_custom_data(self, tool: Dict, interface_func: str) -> Dict:
        """加载自定义曲线数据"""
        return {}