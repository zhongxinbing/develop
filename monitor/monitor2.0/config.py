import os
from common import *

# ==================================================
# 系统配置
# ==================================================
CONFIG = {
    'host': os.environ.get('FLASK_HOST', '127.0.0.1'),
    'port': 6060,                # 服务端口
    'debug': os.environ.get('FLASK_DEBUG', 'false').lower() in ('true', '1'),
    'auto_open_browser': False,  # 是否自动打开浏览器
    'cache_enabled': True,       # 是否启用缓存
    'cache_ttl': 300             # 缓存有效期（秒）
}

# 工具配置文件路径
TOOL_CONFIG_PATH = os.environ.get('TOOL_CONFIG_PATH', str(Path(__file__).resolve().parent / 'data' / 'config' / 'tool_config.json'))
CASE_CONFIG = load_json(TOOL_CONFIG_PATH)  # 工具配置

# 数据目录配置
DATA_DIR = Path('./data')
DATA_DIR.mkdir(parents=True, exist_ok=True)

# 对比配置文件路径
COMPARE_CONFIG_FILE = DATA_DIR / 'compare.json'