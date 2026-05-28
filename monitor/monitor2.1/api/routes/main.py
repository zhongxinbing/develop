"""
主页路由模块
"""
from flask import Blueprint, render_template

from config import CASE_CONFIG

main_bp = Blueprint('main', __name__)


@main_bp.route('/')
def index():
    """主页：工具选择页面"""
    tools_list = []
    for tool_key, tool_info in CASE_CONFIG.items():
        tools_list.append({
            'id': tool_key,
            'name': tool_info.get('name', tool_key),
            'description': tool_info.get('description', ''),
            'icon': tool_info.get('icon', '🔧'),
            'has_single': bool(tool_info.get('single_original_path')),
            'has_multi': bool(tool_info.get('multi_original_path'))
        })
    return render_template('main.html', tools=tools_list)


@main_bp.route('/tools_config')
def tools_config_page():
    """工具配置管理页面"""
    return render_template('tools_config.html')