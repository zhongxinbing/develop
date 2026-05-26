"""
系统配置模块
"""
from pathlib import Path
from common import load_json

# ==================================================
# 系统配置
# ==================================================
CONFIG = {
    'host': '0.0.0.0',
    'port': 6060,
    'debug': True,
    'auto_open_browser': False,
    'cache_enabled': True,
    'cache_ttl': 300
}

# 路径配置
TOOL_CONFIG_PATH = Path('./data/config/tool_config.json')
DATA_DIR = Path('./data')
COMPARE_CONFIG_FILE = DATA_DIR / 'compare.json'

# 确保目录存在
DATA_DIR.mkdir(parents=True, exist_ok=True)
TOOL_CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)


def load_tool_config():
    """加载工具配置"""
    if TOOL_CONFIG_PATH.exists():
        return load_json(TOOL_CONFIG_PATH)
    return {}


CASE_CONFIG = load_tool_config()