"""
配置管理模块
管理工具的配置信息
"""
import json
from pathlib import Path
from typing import Dict, Any, Optional, List


class ConfigManager:
    """工具配置管理器"""
    
    def __init__(self, config_file: Path):
        self.config_file = Path(config_file)
        self._config = self._load_config()
    
    def _load_config(self) -> Dict:
        """加载配置文件"""
        if self.config_file.exists():
            try:
                with open(self.config_file, 'r', encoding='utf-8') as f:
                    return json.load(f)
            except:
                return {'tools': {}}
        return {'tools': {}}
    
    def _save_config(self):
        """保存配置文件"""
        with open(self.config_file, 'w', encoding='utf-8') as f:
            json.dump(self._config, f, ensure_ascii=False, indent=2)
    
    def get_all_tools(self) -> List[Dict]:
        """获取所有工具配置"""
        return list(self._config.get('tools', {}).values())
    
    def get_tool(self, tool_name: str) -> Optional[Dict]:
        """获取单个工具配置"""
        return self._config.get('tools', {}).get(tool_name)
    
    def add_tool(self, tool_config: Dict):
        """添加工具配置"""
        tool_name = tool_config.get('tool_name')
        if not tool_name:
            raise ValueError('Tool name is required')
        
        if 'tools' not in self._config:
            self._config['tools'] = {}
        
        self._config['tools'][tool_name] = tool_config
        self._save_config()
    
    def update_tool(self, tool_name: str, tool_config: Dict):
        """更新工具配置"""
        if tool_name not in self._config.get('tools', {}):
            raise KeyError(f'Tool {tool_name} not found')
        
        self._config['tools'][tool_name] = tool_config
        self._save_config()
    
    def delete_tool(self, tool_name: str):
        """删除工具配置"""
        if tool_name in self._config.get('tools', {}):
            del self._config['tools'][tool_name]
            self._save_config()