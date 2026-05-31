"""
==================================================
EDA性能监控系统 - Flask应用主入口
支持: 日期 -> 阶段 -> runtime/memory/cores 三层数据结构
布局: 侧边栏导航 + 主内容区域
==================================================
"""
import webbrowser
import threading
import time
import atexit
import signal
import sys

from api import create_app
from config import CONFIG
from common import get_local_ip, log


app = create_app()

# 全局应用实例引用，用于优雅关闭
_app_instance = None


def open_browser():
    """自动打开浏览器（后台线程调用）"""
    if CONFIG['auto_open_browser']:
        time.sleep(1.5)
        webbrowser.open_new(f"http://127.0.0.1:{CONFIG['port']}")


def signal_handler(signum, frame):
    """信号处理函数，用于优雅关闭"""
    log("收到关闭信号，正在关闭服务器...")
    if _app_instance:
        _app_instance.do_teardown_appcontext()
    sys.exit(0)


def cleanup():
    """清理函数"""
    log("服务器正在关闭...")


# ==================================================
# 应用启动入口
# ==================================================
if __name__ == '__main__':
    # 注册信号处理
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)
    atexit.register(cleanup)
    
    local_ip = get_local_ip()

    log(f"启动服务器: http://{local_ip}:{CONFIG['port']}")
    log(f"本地访问: http://127.0.0.1:{CONFIG['port']}")
    
    if CONFIG['auto_open_browser']:
        threading.Thread(target=open_browser, daemon=True).start()
    
    # 保存应用实例引用
    _app_instance = app
    
    app.run(
        host=CONFIG['host'],
        port=CONFIG['port'],
        debug=CONFIG['debug'],
        use_reloader=False,
        threaded=True  # 启用多线程处理请求
    )