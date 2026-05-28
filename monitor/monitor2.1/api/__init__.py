"""
Flask API模块初始化
"""
from flask import Flask
from flask_cors import CORS
from pathlib import Path

from api.utils import log
from config import CONFIG


def create_app() -> Flask:
    """创建Flask应用实例"""
    app = Flask(__name__, template_folder='../templates', static_folder='../static')
    CORS(app)
    
    # 添加请求日志中间件
    # @app.before_request
    # def log_request_info():
    #     from flask import request
    #     # print(f"=== 收到请求 ===")
    #     # print(f"Method: {request.method}")
    #     # print(f"URL: {request.url}")
    #     # print(f"Path: {request.path}")
    #     # print(f"Headers: {dict(request.headers)}")
    #     # print(f"Endpoint: {request.endpoint}")
    #     # print(f"Blueprint: {request.blueprint}")
    #     # print(f"================")
    
    # 注册错误处理
    register_error_handlers(app)
    
    # 注册路由
    register_blueprints(app)
    
    return app


def register_error_handlers(app: Flask) -> None:
    """注册错误处理函数"""
    
    @app.errorhandler(404)
    def page_not_found(e):
        return '''
        <!DOCTYPE html>
        <html>
        <head><meta charset="UTF-8"><title>404 - 页面不存在</title></head>
        <body style="text-align:center;padding:50px;font-family:system-ui;">
            <h1>❌ 404 - 页面不存在</h1>
            <p>您访问的页面不存在</p>
            <button onclick="window.location.href='/'">返回首页</button>
        </body>
        </html>
        ''', 404


def register_blueprints(app: Flask) -> None:
    """注册所有路由蓝图"""
    from api.routes import register_routes
    register_routes(app)