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

from api import app, CONFIG


def open_browser():
    """自动打开浏览器（后台线程调用）"""
    if CONFIG['auto_open_browser']:
        time.sleep(1.5)
        webbrowser.open_new(f"http://127.0.0.1:{CONFIG['port']}")


# ==================================================
# 应用启动入口
# ==================================================
if __name__ == '__main__':
    from common import get_local_ip, log
    
    local_ip = get_local_ip()

    log(f"启动服务器: http://{local_ip}:{CONFIG['port']}")
    log(f"本地访问: http://127.0.0.1:{CONFIG['port']}")
    
    if CONFIG['auto_open_browser']:
        threading.Thread(target=open_browser, daemon=True).start()
    
    app.run(
        host=CONFIG['host'],
        port=CONFIG['port'],
        debug=CONFIG['debug'],
        use_reloader=False
    )