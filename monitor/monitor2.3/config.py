"""
配置文件
"""
import os

class Config:
    """应用配置"""
    SECRET_KEY = 'eda-monitor-secret-key'
    DATA_DIR = os.path.join(os.path.dirname(__file__), 'data')
    TOOLS_DATA_DIR = os.path.join(DATA_DIR, 'tools')
    
    @classmethod
    def init_dirs(cls):
        """初始化目录"""
        os.makedirs(cls.TOOLS_DATA_DIR, exist_ok=True)