"""
工具管理器 - 管理工具配置和数据（支持分层存储）
"""
import json
from pathlib import Path
from typing import Dict, Optional
from threading import Lock

from config import CONFIG_FILE, DATA_DIR, DEFAULT_CONFIG
from debug.debug import green,red,blue

class ToolManager:
    """工具管理器，支持多用户隔离和数据分层存储"""
    
    _instance = None
    _lock = Lock()
    
    # 数据类型常量
    DATA_TYPE_SINGLE = 'single'   # 单线程数据
    DATA_TYPE_MULTI = 'multi'     # 多线程数据
    DATA_TYPE_EXTRA = 'extra'     # 用户添加数据
    
    # 数据文件命名常量
    SINGLE_FILE_SUFFIX = '_signal.json'   # 单线程数据文件后缀
    MULTI_FILE_SUFFIX = '_multi.json'     # 多线程数据文件后缀
    EXTRA_FILE_SUFFIX = '_extra.json'     # 用户添加数据文件后缀
    
    def __new__(cls):
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = super().__new__(cls)
                    cls._instance._initialized = False
        return cls._instance
    
    def __init__(self):
        if self._initialized:
            return
        self._initialized = True
        self._config = self._load_config()
        self._cache = {}  # 数据缓存 {user_id: {tool_id: {data_type: data}}}
    
    def _load_config(self) -> Dict:
        """加载配置文件"""
        if CONFIG_FILE.exists():
            with open(CONFIG_FILE, 'r', encoding='utf-8') as f:
                return json.load(f)
        return DEFAULT_CONFIG.copy()
    
    def _save_config(self):
        """保存配置文件"""
        with open(CONFIG_FILE, 'w', encoding='utf-8') as f:
            json.dump(self._config, f, ensure_ascii=False, indent=2)
    
    def _get_tool_data_path(self, tool_name: str, data_type: str) -> Path:
        """
        获取工具数据文件路径（统一存放在 data/tool_name/ 目录下）
        
        参数:
            tool_name: 工具名称
            data_type: 数据类型 ('single', 'multi', 'extra')
        
        返回:
            Path: 数据文件路径
            - 单线程: data/tool_name/tool_name_signal.json
            - 多线程: data/tool_name/tool_name_multi.json
            - 用户添加: data/tool_name/tool_name_extra.json
        """
        # 工具专属目录: data/{tool_name}/
        tool_dir = DATA_DIR / tool_name
        tool_dir.mkdir(parents=True, exist_ok=True)
        
        # 根据数据类型返回对应的文件路径
        if data_type == self.DATA_TYPE_SINGLE:
            file_name = f"{tool_name}{self.SINGLE_FILE_SUFFIX}"
        elif data_type == self.DATA_TYPE_MULTI:
            file_name = f"{tool_name}{self.MULTI_FILE_SUFFIX}"
        else:  # extra
            file_name = f"{tool_name}{self.EXTRA_FILE_SUFFIX}"
        
        return tool_dir / file_name
    
    def _get_user_data_path(self, user_id: str, tool_name: str, data_type: str) -> Path:
        """
        获取用户隔离的数据文件路径（保留用户隔离功能）
        
        参数:
            user_id: 用户ID
            tool_name: 工具名称
            data_type: 数据类型
        
        返回:
            Path: 用户隔离的数据文件路径: data/tool_name/{user_id}/tool_name_{data_type}.json
        """
        # 工具专属目录下的用户子目录: data/{tool_name}/{user_id}/
        user_dir = DATA_DIR / tool_name / user_id
        user_dir.mkdir(parents=True, exist_ok=True)
        
        # 根据数据类型返回对应的文件路径
        if data_type == self.DATA_TYPE_SINGLE:
            file_name = f"{tool_name}_single.json"
        elif data_type == self.DATA_TYPE_MULTI:
            file_name = f"{tool_name}_multi.json"
        else:  # extra
            file_name = f"{tool_name}_extra.json"
        
        return user_dir / file_name
    
    # ==================== 工具配置管理 ====================
    
    def get_tools(self, user_id: str) -> Dict:
        """获取用户的所有工具"""
        user_tools = self._config.get('users', {}).get(user_id, {})
        return user_tools.get('tools', {})
    
    def get_tool(self, user_id: str, tool_id: str) -> Optional[Dict]:
        """获取指定工具"""
        user_tools = self.get_tools(user_id)
        return user_tools.get(tool_id)
    
    def add_tool(self, user_id: str, tool_id: str, tool_config: Dict) -> bool:
        """添加工具"""
        if 'users' not in self._config:
            self._config['users'] = {}
        if user_id not in self._config['users']:
            self._config['users'][user_id] = {'tools': {}}
        
        tools = self._config['users'][user_id]['tools']
        if tool_id in tools:
            return False
        
        from datetime import datetime
        tool_config['created_at'] = datetime.now().isoformat()
        tool_config['updated_at'] = datetime.now().isoformat()
        tools[tool_id] = tool_config
        self._save_config()
        return True
    
    def update_tool(self, user_id: str, tool_id: str, tool_config: Dict) -> bool:
        """更新工具"""
        tools = self.get_tools(user_id)
        if tool_id not in tools:
            return False
        
        from datetime import datetime
        tool_config['created_at'] = tools[tool_id].get('created_at')
        tool_config['updated_at'] = datetime.now().isoformat()
        tools[tool_id] = tool_config
        self._save_config()
        
        # 清除缓存
        if user_id in self._cache and tool_id in self._cache[user_id]:
            del self._cache[user_id][tool_id]
        
        return True
    
    def delete_tool(self, user_id: str, tool_id: str) -> bool:
        """删除工具"""
        tools = self.get_tools(user_id)
        if tool_id not in tools:
            return False
        
        tool_config = tools[tool_id]
        tool_name = tool_config.get('tool_name', tool_id)
        
        del tools[tool_id]
        self._save_config()
        
        # 删除所有相关数据文件（包括用户隔离的文件）
        # 1. 删除工具公共数据文件
        for data_type in [self.DATA_TYPE_SINGLE, self.DATA_TYPE_MULTI, self.DATA_TYPE_EXTRA]:
            data_path = self._get_tool_data_path(tool_name, data_type)
            if data_path.exists():
                data_path.unlink()
        
        # 2. 删除用户隔离的数据文件
        user_data_path = self._get_user_data_path(user_id, tool_name, self.DATA_TYPE_SINGLE)
        if user_data_path.exists():
            user_data_path.unlink()
        user_data_path = self._get_user_data_path(user_id, tool_name, self.DATA_TYPE_MULTI)
        if user_data_path.exists():
            user_data_path.unlink()
        user_data_path = self._get_user_data_path(user_id, tool_name, self.DATA_TYPE_EXTRA)
        if user_data_path.exists():
            user_data_path.unlink()
        
        # 3. 如果用户目录为空，删除用户目录
        user_dir = DATA_DIR / tool_name / user_id
        if user_dir.exists() and not any(user_dir.iterdir()):
            user_dir.rmdir()
        
        # 4. 如果工具目录为空，删除工具目录
        tool_dir = DATA_DIR / tool_name
        if tool_dir.exists() and not any(tool_dir.iterdir()):
            tool_dir.rmdir()
        
        # 清除缓存
        if user_id in self._cache:
            if tool_id in self._cache[user_id]:
                del self._cache[user_id][tool_id]
            if not self._cache[user_id]:
                del self._cache[user_id]
        
        return True
    
    # ==================== 分层数据存储 ====================
    
    def save_single_thread_data(self, user_id: str, tool_id: str, data: Dict):
        """保存单线程数据（使用用户隔离存储）"""
        # 获取工具配置以获取工具名称
        tool_config = self.get_tool(user_id, tool_id)
        if not tool_config:
            return
        
        tool_name = tool_config.get('tool_name', tool_id)
        
        # 保存到用户隔离的目录
        data_path = self._get_user_data_path(user_id, tool_name, self.DATA_TYPE_SINGLE)
        
        # 确保目录存在
        data_path.parent.mkdir(parents=True, exist_ok=True)
        
        with open(data_path, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        
        # 同时保存到公共目录（作为缓存/备份）
        common_path = self._get_tool_data_path(tool_name, self.DATA_TYPE_SINGLE)
        with open(common_path, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        
        # 更新缓存
        if user_id not in self._cache:
            self._cache[user_id] = {}
        if tool_id not in self._cache[user_id]:
            self._cache[user_id][tool_id] = {}
        self._cache[user_id][tool_id][self.DATA_TYPE_SINGLE] = data
    
    def load_single_thread_data(self, user_id: str, tool_id: str) -> Optional[Dict]:
        """加载单线程数据（优先从用户隔离目录加载）"""
        # 获取工具配置以获取工具名称
        tool_config = self.get_tool(user_id, tool_id)
        if not tool_config:
            return None
        
        tool_name = tool_config.get('tool_name', tool_id)
        # 检查缓存
        if user_id in self._cache:
            if tool_id in self._cache[user_id]:
                if self.DATA_TYPE_SINGLE in self._cache[user_id][tool_id]:
                    return self._cache[user_id][tool_id][self.DATA_TYPE_SINGLE]
        
        # 优先从用户隔离目录加载
        user_data_path = self._get_user_data_path(user_id, tool_name, self.DATA_TYPE_SINGLE)

        if user_data_path.exists():
            print(f"尝试加载单线程数据文件: {user_data_path}")
            with open(user_data_path, 'r', encoding='utf-8') as f:
                print(f"找到用户单线程数据文件: {user_data_path}")
                data = json.load(f)
            
            # 清理数据中的类型问题
            data = self._clean_data_types(data)
            
            # 更新缓存
            if user_id not in self._cache:
                self._cache[user_id] = {}
            if tool_id not in self._cache[user_id]:
                self._cache[user_id][tool_id] = {}
            self._cache[user_id][tool_id][self.DATA_TYPE_SINGLE] = data
            return data
        
        # 回退到公共目录
        common_path = self._get_tool_data_path(tool_name, self.DATA_TYPE_SINGLE)
        print(f"尝试加载公共单线程数据文件: {common_path}")
        if common_path.exists():
            print(f"找到公共单线程数据文件: {common_path}")
            with open(common_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
            
            data = self._clean_data_types(data)
            
            if user_id not in self._cache:
                self._cache[user_id] = {}
            if tool_id not in self._cache[user_id]:
                self._cache[user_id][tool_id] = {}
            self._cache[user_id][tool_id][self.DATA_TYPE_SINGLE] = data
            return data
        
        return None
    
    def save_multi_thread_data(self, user_id: str, tool_id: str, data: Dict):
        """保存多线程数据（使用用户隔离存储）"""
        tool_config = self.get_tool(user_id, tool_id)
        if not tool_config:
            return
        
        tool_name = tool_config.get('tool_name', tool_id)
        
        data_path = self._get_user_data_path(user_id, tool_name, self.DATA_TYPE_MULTI)
        data_path.parent.mkdir(parents=True, exist_ok=True)
        
        with open(data_path, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        
        # 同时保存到公共目录
        common_path = self._get_tool_data_path(tool_name, self.DATA_TYPE_MULTI)
        with open(common_path, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        
        if user_id not in self._cache:
            self._cache[user_id] = {}
        if tool_id not in self._cache[user_id]:
            self._cache[user_id][tool_id] = {}
        self._cache[user_id][tool_id][self.DATA_TYPE_MULTI] = data
    
    def load_multi_thread_data(self, user_id: str, tool_id: str) -> Optional[Dict]:
        """加载多线程数据（优先从用户隔离目录加载）"""
        tool_config = self.get_tool(user_id, tool_id)
        if not tool_config:
            return None
        
        tool_name = tool_config.get('tool_name', tool_id)
        
        # 检查缓存
        if user_id in self._cache:
            if tool_id in self._cache[user_id]:
                if self.DATA_TYPE_MULTI in self._cache[user_id][tool_id]:
                    cached_data = self._cache[user_id][tool_id][self.DATA_TYPE_MULTI]
                    return cached_data
        
        # 优先从用户隔离目录加载
        user_data_path = self._get_user_data_path(user_id, tool_name, self.DATA_TYPE_MULTI)
        print(f"尝试加载多线程数据文件: {user_data_path}")
        
        if user_data_path.exists():
            print(f"找到用户多线程数据文件: {user_data_path}")
            with open(user_data_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
            
            print(f"用户多线程数据 keys: {list(data.keys())}")
            data = self._clean_data_types(data)
            
            # 更新缓存
            if user_id not in self._cache:
                self._cache[user_id] = {}
            if tool_id not in self._cache[user_id]:
                self._cache[user_id][tool_id] = {}
            self._cache[user_id][tool_id][self.DATA_TYPE_MULTI] = data
            return data
        
        # 回退到公共目录
        common_path = self._get_tool_data_path(tool_name, self.DATA_TYPE_MULTI)
        print(f"尝试加载公共多线程数据文件: {common_path}")
        
        if common_path.exists():
            print(f"找到公共多线程数据文件: {common_path}")
            with open(common_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
            
            print(f"公共多线程数据 keys: {list(data.keys())}")
            data = self._clean_data_types(data)
            
            # 更新缓存
            if user_id not in self._cache:
                self._cache[user_id] = {}
            if tool_id not in self._cache[user_id]:
                self._cache[user_id][tool_id] = {}
            self._cache[user_id][tool_id][self.DATA_TYPE_MULTI] = data
            return data
        
        print("未找到多线程数据文件")
        return None


    
    def save_extra_data(self, user_id: str, tool_id: str, data: Dict):
        """保存用户添加的数据（使用用户隔离存储）"""
        tool_config = self.get_tool(user_id, tool_id)
        if not tool_config:
            return
        
        tool_name = tool_config.get('tool_name', tool_id)
        
        data_path = self._get_user_data_path(user_id, tool_name, self.DATA_TYPE_EXTRA)
        data_path.parent.mkdir(parents=True, exist_ok=True)
        
        with open(data_path, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        
        # 同时保存到公共目录
        common_path = self._get_tool_data_path(tool_name, self.DATA_TYPE_EXTRA)
        with open(common_path, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        
        if user_id not in self._cache:
            self._cache[user_id] = {}
        if tool_id not in self._cache[user_id]:
            self._cache[user_id][tool_id] = {}
        self._cache[user_id][tool_id][self.DATA_TYPE_EXTRA] = data
    
    def load_extra_data(self, user_id: str, tool_id: str) -> Optional[Dict]:
        """加载用户添加的数据（优先从用户隔离目录加载）"""
        tool_config = self.get_tool(user_id, tool_id)
        if not tool_config:
            return None
        
        tool_name = tool_config.get('tool_name', tool_id)
        
        if user_id in self._cache:
            if tool_id in self._cache[user_id]:
                if self.DATA_TYPE_EXTRA in self._cache[user_id][tool_id]:
                    return self._cache[user_id][tool_id][self.DATA_TYPE_EXTRA]
        
        # 优先从用户隔离目录加载
        user_data_path = self._get_user_data_path(user_id, tool_name, self.DATA_TYPE_EXTRA)
        if user_data_path.exists():
            with open(user_data_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
            
            data = self._clean_data_types(data)
            
            if user_id not in self._cache:
                self._cache[user_id] = {}
            if tool_id not in self._cache[user_id]:
                self._cache[user_id][tool_id] = {}
            self._cache[user_id][tool_id][self.DATA_TYPE_EXTRA] = data
            return data
        
        # 回退到公共目录
        common_path = self._get_tool_data_path(tool_name, self.DATA_TYPE_EXTRA)
        if common_path.exists():
            with open(common_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
            
            data = self._clean_data_types(data)
            
            if user_id not in self._cache:
                self._cache[user_id] = {}
            if tool_id not in self._cache[user_id]:
                self._cache[user_id][tool_id] = {}
            self._cache[user_id][tool_id][self.DATA_TYPE_EXTRA] = data
            return data
        
        return None
    
    def _clean_data_types(self, data):
        """清理数据类型，确保所有数值都是数字类型，且不丢失非零值"""
        if isinstance(data, dict):
            cleaned = {}
            for k, v in data.items():
                if k in ['thread_metrics', 'daily_metrics']:
                    cleaned[k] = self._clean_data_types(v)
                else:
                    cleaned[k] = self._clean_data_types(v)
            return cleaned
        elif isinstance(data, list):
            return [self._clean_data_types(item) for item in data]
        elif isinstance(data, (int, float)):
            # 保持原始数字，不进行任何转换
            return data
        elif isinstance(data, str):
            # 尝试将字符串转换为数字（如果可能）
            try:
                # 检查是否是有效数字（包括整数和浮点数）
                if data.strip():
                    # 先尝试转换为整数
                    if '.' not in data and 'e' not in data.lower():
                        return int(data)
                    else:
                        return float(data)
            except (ValueError, TypeError):
                pass
            return data
        else:
            return data

    def get_all_tool_data(self, user_id: str, tool_id: str) -> Dict:
        """获取工具的所有数据（合并单线程、多线程、用户数据）"""
        result = {}
        
        # 获取工具配置
        tool_config = self.get_tool(user_id, tool_id)
        if not tool_config:
            return result
        
        tool_name = tool_config.get('tool_name', tool_id)
        
        # 1. 加载单线程数据
        single_data = self.load_single_thread_data(user_id, tool_id)
        
        if single_data:
            result['signal'] = single_data
        
        # 2. 加载多线程数据（关键修复）
        multi_data = self.load_multi_thread_data(user_id, tool_id)
        if multi_data:
            if "__multi_processed_logs__" in multi_data:
                del multi_data['__multi_processed_logs__']
            result['multi'] = multi_data
            
        # 3. 加载用户添加的数据    >> 这个也许不应该写在这里   todo
        extra_data = self.load_extra_data(user_id, tool_id)
        if extra_data:
            result['extra'] = extra_data
        return result
    
    def _copy_with_type(self, case_data: Dict, data_type: str) -> Dict:
        """复制数据并添加类型标记"""
        copied = {}
        for k, v in case_data.items():
            if k == '_data_type':
                continue
            if isinstance(v, dict):
                copied[k] = self._copy_with_type(v, data_type) if k != 'daily_metrics' else v.copy()
            elif isinstance(v, list):
                copied[k] = v.copy()
            else:
                copied[k] = v
        copied['_data_type'] = data_type
        return copied

    def _merge_case_data(self, existing: Dict, new_data: Dict, new_type: str) -> Dict:
        """合并 case 数据，保持类型信息"""
        existing_type = existing.get('_data_type', 'unknown')
        
        # 如果类型相同，直接合并
        if existing_type == new_type:
            # 合并 daily_metrics
            if 'daily_metrics' in new_data:
                if 'daily_metrics' not in existing:
                    existing['daily_metrics'] = {}
                for date, metrics in new_data['daily_metrics'].items():
                    if date not in existing['daily_metrics']:
                        existing['daily_metrics'][date] = metrics
                    else:
                        # 合并同一天的 metrics
                        for rule, rule_data in metrics.items():
                            if rule not in existing['daily_metrics'][date]:
                                existing['daily_metrics'][date][rule] = rule_data
            
            # 合并 available_dates
            if 'available_dates' in new_data:
                existing_dates = set(existing.get('available_dates', []))
                new_dates = set(new_data.get('available_dates', []))
                existing['available_dates'] = sorted(existing_dates | new_dates)
            
            return existing
        
        # 类型不同，创建新的复合类型
        # 将现有数据包装为 { 'single': ..., 'multi': ... } 结构
        wrapped = {
            '_data_type': 'composite',
            '_single_data': None,
            '_multi_data': None,
            '_extra_data': None
        }
        
        # 复制现有数据
        if existing_type == 'single':
            wrapped['_single_data'] = self._strip_type(existing)
        elif existing_type == 'multi':
            wrapped['_multi_data'] = self._strip_type(existing)
        else:
            wrapped['_extra_data'] = self._strip_type(existing)
        
        # 添加新数据
        if new_type == 'single':
            wrapped['_single_data'] = self._strip_type(new_data)
        elif new_type == 'multi':
            wrapped['_multi_data'] = self._strip_type(new_data)
        else:
            wrapped['_extra_data'] = self._strip_type(new_data)
        
        return wrapped

    def _strip_type(self, data: Dict) -> Dict:
        """移除类型标记，返回纯净数据"""
        stripped = {}
        for k, v in data.items():
            if k == '_data_type':
                continue
            if k == '_single_data' or k == '_multi_data' or k == '_extra_data':
                continue
            if isinstance(v, dict):
                stripped[k] = self._strip_type(v)
            elif isinstance(v, list):
                stripped[k] = v.copy()
            else:
                stripped[k] = v
        return stripped
    def clear_cache(self, user_id: str = None, tool_id: str = None, data_type: str = None):
        """清除缓存"""
        if user_id is None:
            self._cache.clear()
        elif tool_id is None:
            if user_id in self._cache:
                del self._cache[user_id]
        elif data_type is None:
            if user_id in self._cache and tool_id in self._cache[user_id]:
                del self._cache[user_id][tool_id]
        else:
            if user_id in self._cache and tool_id in self._cache[user_id]:
                if data_type in self._cache[user_id][tool_id]:
                    del self._cache[user_id][tool_id][data_type]


# 全局实例
tool_manager = ToolManager()