"""
配置文件
"""
import os
import secrets

class Config:
    """应用配置"""
    SECRET_KEY = os.environ.get('SECRET_KEY', secrets.token_hex(32))
    DATA_DIR = os.path.join(os.path.dirname(__file__), 'data')
    TOOLS_DATA_DIR = os.path.join(DATA_DIR, 'tools')
    
    @classmethod
    def init_dirs(cls):
        """初始化目录"""
        os.makedirs(cls.TOOLS_DATA_DIR, exist_ok=True)