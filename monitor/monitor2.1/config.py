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
    'cache_ttl': 300,           # 缓存生存时间（秒）
    'cache_max_size': 100,      # 最大缓存条目数
    'preload_data': True,       # 预加载数据
    'async_loading': True,      # 异步加载
    'batch_size': 500,          # 分批处理大小
    'request_timeout': 30       # 请求超时时间
}

# 路径配置
BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / 'data'
TOOL_CONFIG_PATH = DATA_DIR / 'config' / 'tool_config.json'
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