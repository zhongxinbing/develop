"""
路由模块初始化 - 注册所有蓝图
"""
from flask import Flask

from api.routes.compare import compare_bp
from api.routes.config import config_bp
from api.routes.data import data_bp
from api.routes.main import main_bp
from api.routes.tool import tool_bp
from api.routes.user_data import user_data_bp

__all__ = ['compare_bp', 'config_bp', 'data_bp', 'main_bp', 'tool_bp', 'user_data_bp']


def register_routes(app: Flask) -> None:
    """注册所有路由蓝图"""
    app.register_blueprint(compare_bp)
    # print("✓ compare_bp registered")
    app.register_blueprint(config_bp)
    # print("✓ config_bp registered")
    app.register_blueprint(user_data_bp)
    # print("✓ user_data_bp registered")
    
    # print("=== 注册蓝图 ===")
    app.register_blueprint(main_bp)
    # print("✓ main_bp registered")
    app.register_blueprint(tool_bp)
    # print("✓ tool_bp registered")
    app.register_blueprint(data_bp)
    # print("✓ data_bp registered")

    # 打印所有已注册的路由
    # print("\n=== 已注册的路由 ===")
    # for rule in app.url_map.iter_rules():
        # print(f"  {rule.endpoint}: {rule.methods} -> {rule.rule}")