import os

# 项目根目录
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
# 数据根目录
DATA_ROOT = os.path.join(BASE_DIR, "data")
# 工具配置文件名
TOOL_CONFIG_NAME = "config.json"
# 原始数据文件名
ORIGIN_DATA_NAME = "origin_data.json"

# 初始化数据根目录
if not os.path.exists(DATA_ROOT):
    os.makedirs(DATA_ROOT)

# 跨域、服务配置
FLASK_HOST = "0.0.0.0"
FLASK_PORT = 5000