"""
API主模块 - 页面路由
"""
from flask import render_template
from app import app
from utils.log import get_logger

logger = get_logger(__name__)

@app.route('/')
def index():
    """主页面"""
    return render_template('index.html')

@app.route('/config')
def config_page():
    """配置页面"""
    return render_template('config.html')

@app.route('/tool/<tool_id>/feature')
def tool_feature(tool_id):
    """功能页"""
    return render_template('tool_feature.html', tool_id=tool_id)

@app.route('/tool/<tool_id>/performance')
def tool_page(tool_id):
    """性能页（原工具页面）"""
    return render_template('tool.html', tool_id=tool_id)

@app.route('/tool/<tool_id>')
def tool_overview(tool_id):
    """工具入口页：选择功能或性能"""
    return render_template('tool_overview.html', tool_id=tool_id)