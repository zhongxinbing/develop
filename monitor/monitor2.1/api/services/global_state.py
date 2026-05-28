"""
全局状态管理服务 - 单例模式
用于管理 parsed_projects 和 project_list 等全局状态
"""
from typing import Dict, List, Any, Tuple
from threading import Lock


class GlobalState:
    """全局状态单例类"""
    _instance = None
    _lock = Lock()
    
    def __new__(cls):
        with cls._lock:
            if cls._instance is None:
                cls._instance = super().__new__(cls)
                cls._instance._initialized = False
            return cls._instance
    
    def __init__(self):
        if self._initialized:
            return
        self._parsed_projects: Dict = {}
        self._project_list: List = []
        self._initialized = True
    
    @property
    def parsed_projects(self) -> Dict:
        """获取解析后的项目数据"""
        return self._parsed_projects
    
    @parsed_projects.setter
    def parsed_projects(self, value: Dict):
        """设置解析后的项目数据"""
        self._parsed_projects = value
    
    @property
    def project_list(self) -> List:
        """获取项目列表"""
        return self._project_list
    
    @project_list.setter
    def project_list(self, value: List):
        """设置项目列表"""
        self._project_list = value
    
    def refresh_projects(self, current_projects_data: Dict) -> Tuple[Dict, List]:
        """
        刷新项目数据
        
        参数:
            current_projects_data: 当前项目数据
            
        返回:
            Tuple[Dict, List]: (parsed_projects, project_list)
        """
        from tool.elint.parse import refresh_parsed_projects
        self._parsed_projects, self._project_list = refresh_parsed_projects(current_projects_data)
        return self._parsed_projects, self._project_list
    
    def get_project_by_id(self, project_id: str) -> Dict:
        """根据ID获取项目数据"""
        return self._parsed_projects.get(project_id, {})
    
    def get_project_list(self) -> List:
        """获取项目列表"""
        return self._project_list.copy()
    
    def clear(self):
        """清空所有数据"""
        self._parsed_projects = {}
        self._project_list = []


# 全局单例实例
global_state = GlobalState()