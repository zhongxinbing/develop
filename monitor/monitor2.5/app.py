
"""
Flask主应用 - 性能监控平台后端
"""
import atexit
from flask import Flask
from config import SECRET_KEY
from utils.log import get_logger, setup_logger
from utils.data_manager import data_manager

app = Flask(__name__)
app.secret_key = SECRET_KEY

setup_logger(log_dir='logs', level='DEBUG')
logger = get_logger(__name__)

# ==================== 导入路由 ====================
from api.main import *
from api.config import *
from api.tool import *
from api.compare import *
# ==================== 文件监听器管理 ====================

def init_watcher():
    """初始化文件监听器"""
    try:
        from utils.tool_manager import tool_manager
        tools = tool_manager.get_tools()
        if not tools:
            logger.info("没有配置任何工具，跳过文件监听器初始化")
            return
        
        for tool_id in tools.keys():
            data_manager.init_file_watcher(tool_id)
        logger.info(f"文件监听器初始化完成，监听 {len(tools)} 个工具")
    except Exception as e:
        logger.exception(f"初始化文件监听器失败: {e}")


def shutdown_watcher():
    """关闭文件监听器"""
    try:
        data_manager.stop_file_watcher()
        logger.info("文件监听器已停止")
    except Exception as e:
        logger.exception(f"停止文件监听器失败: {e}")


# Flask 2.3+ 兼容方式：使用 before_request 实现懒加载初始化
@app.before_request
def ensure_watcher_initialized():
    """确保文件监听器已初始化（仅执行一次）"""
    if not hasattr(app, '_watcher_initialized'):
        app._watcher_initialized = True
        init_watcher()


# 注册应用关闭时的清理函数
atexit.register(shutdown_watcher)
# 降低 watchdog 的日志级别
# logging.getLogger('watchdog').setLevel(logging.WARNING)
# logging.getLogger('watchdog.observers.inotify_buffer').setLevel(logging.WARNING)

# ==================== 启动入口 ====================

if __name__ == '__main__':
    setup_logger(log_dir='logs', level='DEBUG')
    logger = get_logger(__name__)
    logger.info("启动性能监控平台后端服务")
    app.run(debug=True, host='0.0.0.0', port=5030)