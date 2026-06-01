"""
全局状态管理服务 - 单例模式
用于管理 parsed_projects 和 project_list 等全局状态
支持增量解析缓存
"""
from typing import Dict, List, Any, Tuple
from threading import Lock
import hashlib
import time


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
        self._data_versions: Dict = {}  # 项目数据版本缓存
        self._last_refresh_time: float = 0
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
    
    def get_data_version(self, project_id: str) -> str:
        """获取项目数据的版本标识"""
        return self._data_versions.get(project_id, "")
    
    def set_data_version(self, project_id: str, version: str) -> None:
        """设置项目数据的版本标识"""
        self._data_versions[project_id] = version
    
    def get_cached_parsed(self) -> Dict:
        """获取缓存的解析数据（用于增量解析）"""
        return self._parsed_projects.copy() if self._parsed_projects else {}
    
    def refresh_projects(self, current_projects_data: Dict, force_full: bool = False) -> Tuple[Dict, List]:
        """
        刷新项目数据（支持增量解析）
        
        参数:
            current_projects_data: 当前原始项目数据
            force_full: 是否强制全量解析
            
        返回:
            Tuple[Dict, List]: (parsed_projects, project_list)
        """
        from tool.elint.parse import refresh_parsed_projects
        
        # 使用增量解析，传入缓存数据
        cached_parsed = None if force_full else self._parsed_projects
        self._parsed_projects, self._project_list = refresh_parsed_projects(
            current_projects_data, cached_parsed
        )
        self._last_refresh_time = time.time()
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
        self._data_versions = {}
        self._last_refresh_time = 0
    
    def get_last_refresh_time(self) -> float:
        """获取最后刷新时间"""
        return self._last_refresh_time
    
    def has_data(self) -> bool:
        """检查是否有数据"""
        return len(self._parsed_projects) > 0


# 全局单例实例
global_state = GlobalState()