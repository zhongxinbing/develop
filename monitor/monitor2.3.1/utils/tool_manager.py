"""
工具管理器 - 管理工具配置和数据（支持分层存储）
"""
import json
from pathlib import Path
from typing import Dict, Optional
from threading import Lock

from config import CONFIG_FILE, TOOL_DATA_DIR, DEFAULT_CONFIG


class ToolManager:
    """工具管理器，支持多用户隔离和数据分层存储"""
    
    _instance = None
    _lock = Lock()
    
    # 数据类型常量
    DATA_TYPE_SINGLE = 'single'   # 单线程数据
    DATA_TYPE_MULTI = 'multi'     # 多线程数据
    DATA_TYPE_EXTRA = 'extra'     # 用户添加数据
    
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
    
    def _get_tool_data_path(self, user_id: str, tool_id: str, data_type: str) -> Path:
        """
        获取工具数据文件路径（分层存储）
        
        参数:
            user_id: 用户ID
            tool_id: 工具ID
            data_type: 数据类型 ('single', 'multi', 'extra')
        """
        user_dir = TOOL_DATA_DIR / user_id
        user_dir.mkdir(parents=True, exist_ok=True)
        
        # 按数据类型分别存储
        return user_dir / f"{tool_id}_{data_type}.json"
    
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
        
        del tools[tool_id]
        self._save_config()
        
        # 删除所有相关数据文件
        for data_type in [self.DATA_TYPE_SINGLE, self.DATA_TYPE_MULTI, self.DATA_TYPE_EXTRA]:
            data_path = self._get_tool_data_path(user_id, tool_id, data_type)
            if data_path.exists():
                data_path.unlink()
        
        # 清除缓存
        if user_id in self._cache:
            if tool_id in self._cache[user_id]:
                del self._cache[user_id][tool_id]
            if not self._cache[user_id]:
                del self._cache[user_id]
        
        return True
    
    # ==================== 分层数据存储 ====================
    
    def save_single_thread_data(self, user_id: str, tool_id: str, data: Dict):
        """保存单线程数据"""
        self._save_data(user_id, tool_id, self.DATA_TYPE_SINGLE, data)
    
    def load_single_thread_data(self, user_id: str, tool_id: str) -> Optional[Dict]:
        """加载单线程数据"""
        return self._load_data(user_id, tool_id, self.DATA_TYPE_SINGLE)
    
    def save_multi_thread_data(self, user_id: str, tool_id: str, data: Dict):
        """保存多线程数据"""
        self._save_data(user_id, tool_id, self.DATA_TYPE_MULTI, data)
    
    def load_multi_thread_data(self, user_id: str, tool_id: str) -> Optional[Dict]:
        """加载多线程数据"""
        return self._load_data(user_id, tool_id, self.DATA_TYPE_MULTI)
    
    def save_extra_data(self, user_id: str, tool_id: str, data: Dict):
        """保存用户添加的数据"""
        self._save_data(user_id, tool_id, self.DATA_TYPE_EXTRA, data)
    
    def load_extra_data(self, user_id: str, tool_id: str) -> Optional[Dict]:
        """加载用户添加的数据"""
        return self._load_data(user_id, tool_id, self.DATA_TYPE_EXTRA)
    
    def _save_data(self, user_id: str, tool_id: str, data_type: str, data: Dict):
        """内部保存数据方法"""
        data_path = self._get_tool_data_path(user_id, tool_id, data_type)
        
        # 确保目录存在
        data_path.parent.mkdir(parents=True, exist_ok=True)
        
        with open(data_path, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        
        # 更新缓存
        if user_id not in self._cache:
            self._cache[user_id] = {}
        if tool_id not in self._cache[user_id]:
            self._cache[user_id][tool_id] = {}
        self._cache[user_id][tool_id][data_type] = data
    
    def _load_data(self, user_id: str, tool_id: str, data_type: str) -> Optional[Dict]:
        """内部加载数据方法"""
        # 检查缓存
        if user_id in self._cache:
            if tool_id in self._cache[user_id]:
                if data_type in self._cache[user_id][tool_id]:
                    return self._cache[user_id][tool_id][data_type]
        
        # 从文件加载
        data_path = self._get_tool_data_path(user_id, tool_id, data_type)
        if data_path.exists():
            with open(data_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
            
            # 更新缓存
            if user_id not in self._cache:
                self._cache[user_id] = {}
            if tool_id not in self._cache[user_id]:
                self._cache[user_id][tool_id] = {}
            self._cache[user_id][tool_id][data_type] = data
            return data
        
        return None
    
    def get_all_tool_data(self, user_id: str, tool_id: str) -> Dict:
        """获取工具的所有数据（合并单线程、多线程、用户数据）"""
        result = {}
        
        # 加载单线程数据
        single_data = self.load_single_thread_data(user_id, tool_id)
        if single_data:
            for casename, case_data in single_data.items():
                if casename not in result:
                    result[casename] = case_data
        
        # 加载多线程数据
        multi_data = self.load_multi_thread_data(user_id, tool_id)
        if multi_data:
            for casename, case_data in multi_data.items():
                if casename not in result:
                    result[casename] = case_data
                else:
                    # 合并多线程数据到已有case
                    for date, metrics in case_data.get('daily_metrics', {}).items():
                        if date not in result[casename].get('daily_metrics', {}):
                            result[casename]['daily_metrics'][date] = metrics
        
        # 加载用户添加的数据
        extra_data = self.load_extra_data(user_id, tool_id)
        if extra_data:
            for casename, case_data in extra_data.items():
                if casename not in result:
                    result[casename] = case_data
                else:
                    for date, metrics in case_data.get('daily_metrics', {}).items():
                        result[casename]['daily_metrics'][date] = metrics
        
        return result
    
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