"""
配置文件 - 性能监控平台配置
"""
import os
import secrets
from pathlib import Path

# 基础目录
BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / 'data'
TOOL_DATA_DIR = DATA_DIR / 'tool_data'  # 保留用于兼容
CONFIG_FILE = DATA_DIR / 'tools.json'

# 创建必要的目录
for dir_path in [DATA_DIR, TOOL_DATA_DIR]:
    dir_path.mkdir(parents=True, exist_ok=True)

# 默认配置
DEFAULT_CONFIG = {
    'tools': {}
}

# 会话配置
SECRET_KEY = os.environ.get('SECRET_KEY', secrets.token_hex(32))

# 文件上传配置
MAX_CONTENT_LENGTH = 16 * 1024 * 1024  # 16MB