from common import *
from pathlib import Path

# ==================================================
# 系统配置
# ==================================================
CONFIG = {
    'host': '0.0.0.0',          # 监听所有网络接口
    'port': 6060,                # 服务端口
    'debug': True,               # 调试模式
    'auto_open_browser': False,  # 是否自动打开浏览器
    'cache_enabled': True,       # 是否启用缓存
    'cache_ttl': 300             # 缓存有效期（秒）
}

# 工具配置文件路径（使用Path对象）
TOOL_CONFIG_PATH = Path('./data/config/tool_config.json')
DATA_DIR = Path('./data')
DATA_DIR.mkdir(parents=True, exist_ok=True)

# 加载工具配置（如果文件不存在则返回空配置）
def load_tool_config():
    if TOOL_CONFIG_PATH.exists():
        return load_json(TOOL_CONFIG_PATH)
    else:
        # 确保目录存在
        TOOL_CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)
        # 返回空配置，用户需要自己添加工具
        return {}

CASE_CONFIG = load_tool_config()  # 工具配置

# 对比配置文件路径
COMPARE_CONFIG_FILE = DATA_DIR / 'compare.json'