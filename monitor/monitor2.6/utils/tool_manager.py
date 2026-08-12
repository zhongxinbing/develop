"""
工具管理器 - 管理工具配置和数据（支持分层存储）
"""
import json
from pathlib import Path
from typing import Dict, Optional
from threading import Lock

from config import CONFIG_FILE, DATA_DIR, DEFAULT_CONFIG
from utils.log import *

class ToolManager:
    """工具管理器，支持多用户隔离和数据分层存储"""
    
    _instance = None
    _lock = Lock()
    
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
        # 配置 log
        setup_logger(log_dir='logs', level='DEBUG')
        self.logger = get_logger(__name__)
        self._initialized = True
        self._config = self._load_config()
        self._cache = {}  # 数据缓存 {user_id: {tool_id: {data_type: data}}}
        self.logger.info("工具管理器初始化完成")

    # ==================== 配置文件管理 -> 从配置文件中获取所有工具的配置信息 ====================
    def _load_config(self) -> Dict:
        """加载配置文件"""
        if CONFIG_FILE.exists():
            with open(CONFIG_FILE, 'r', encoding='utf-8') as f:
                tool_config = json.load(f)
                if tool_config:
                    self.logger.info(f"加载工具配置文件: {CONFIG_FILE}")
                    return tool_config
        return DEFAULT_CONFIG.copy()
    # ==================== 工具配置管理 -> 获取所有工具的配置信息 ====================
    def get_tools(self) -> Dict:
        """获取用户的所有工具"""
        return self._config.get('tools', {})
    # ==================== 工具配置管理 -> 添加工具及其配置 ====================
    def add_tool(self, tool_config: Dict) -> bool:
        """添加工具"""
        self.logger.debug(f"尝试添加工具: {tool_config.get('tool_name')} 配置: {tool_config}")
        tools = self._config['tools']
        
        from datetime import datetime
        tool_config['created_at'] = datetime.now().isoformat()
        tool_config['updated_at'] = datetime.now().isoformat()
        tool_config = self.judge_tool_exists(tool_config)
        # 将工具配置保存到配置文件中
        tools[tool_config.get('tool_name')] = tool_config
        self._save_config()
        return True
    # ==================== 工具配置管理 -> 将工具配置保存到配置文件中 ====================
    def _save_config(self):
        """保存配置文件"""
        with open(CONFIG_FILE, 'w', encoding='utf-8') as f:
            json.dump(self._config, f, ensure_ascii=False, indent=2)
    # ==================== 工具配置管理 -> 删除工具及其配置 ====================
    def delete_tool(self, tool_id: str) -> bool:
        """删除工具"""
        tools = self.get_tools()
        if tool_id not in tools:
            return False
        
        del tools[tool_id]
        self._save_config()
        
        return True
    # ==================== 工具配置管理 -> 更新工具及其配置 ====================
    def update_tool(self, tool_id: str, tool_config: Dict) -> bool:
        """更新工具"""
        self.logger.debug(f"尝试更新工具: {tool_id} 配置: {tool_config}")
        tools = self.get_tools()
        if tool_id not in tools:
            return False
        
        from datetime import datetime
        tool_config['created_at'] = tools[tool_id].get('created_at')
        tool_config['updated_at'] = datetime.now().isoformat()
        tool_config = self.judge_tool_exists(tool_config)
        tools[tool_id] = tool_config
        self._save_config()
        
        return True
    # =================== 工具配置管理 -> 获取指定工具的配置信息 ====================
    def get_tool(self, tool_id: str) -> Optional[Dict]:
        """获取指定工具"""
        user_tools = self.get_tools().get(tool_id, {})
        return user_tools

    def judge_tool_exists(self, tool_config):

        if tool_config.get('single_path'):
            tool_config['single_exists'] = 1
        if tool_config.get('multi_path'):
            tool_config['multi_exists'] = 1
        if tool_config.get('extra_display_path'):
            tool_config['extra_exists'] = 1
        return tool_config


# 全局实例
tool_manager = ToolManager()