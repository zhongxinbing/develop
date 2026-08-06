"""
API配置模块 - 工具配置管理
"""
from flask import jsonify, request
from pathlib import Path
from app import app
from utils.tool_manager import tool_manager
from utils.log import get_logger
from utils.common import get_user_id

logger = get_logger(__name__)

#  从前端表单中获取新配置的数据并保存
@app.route('/api/tools', methods=['POST'])
def api_add_tool():
    """添加工具"""
    # 获取请求数据
    data = request.json
    logger.debug(f"添加工具请求数据: {data}")
    # 验证路径是否存在
    if data.get('single_path') is None or not Path(data.get('single_path')).exists():
        return jsonify({'success': False, 'error': '单线程路径不能为空或者不存在'})
    else:
        # 验证多线程路径是否存在
        if not Path(data.get('multi_path')).exists():
            return jsonify({'success': False, 'error': '多线程路径不存在'})
    # 验证额外显示路径是否存在
    if data.get('extra_display_path') and not Path(data.get('extra_display_path')).exists():
        return jsonify({'success': False, 'error': 'extra 路径 不存在'})

    tool_config = {
        'tool_name': data.get('tool_name'),
        'description': data.get('description', ''),
        'single_path': data.get('single_path', ''),
        'single_func': data.get('single_func', ''),
        'multi_path': data.get('multi_path', ''),
        'multi_func': data.get('multi_func', ''),
        'extra_display_path': data.get('extra_display_path', ''),
        'extra_display_func': data.get('extra_display_func', ''),
        'custom_curve_func': data.get('custom_curve_func', '')
    }

    success = tool_manager.add_tool(tool_config)
    if success:
        return jsonify({'success': True, 'data': {'tool_name': tool_config.get('tool_name')}})
    return jsonify({'success': False, 'error': '添加失败'})

# 从配置中获取工具管理器, 加载工具配置
@app.route('/api/tools', methods=['GET'])
def api_get_tools():
    """获取工具列表"""
    user_id = get_user_id()
    tools = tool_manager.get_tools()
    return jsonify({'success': True, 'data': tools})

# 删除工具及其配置信息
@app.route('/api/tools/<tool_id>', methods=['DELETE'])
def api_delete_tool(tool_id):
    """删除工具"""

    success = tool_manager.delete_tool(tool_id)
    if success:
        return jsonify({'success': True})
    return jsonify({'success': False, 'error': '删除失败'})

# 更新工具配置
@app.route('/api/tools/<tool_id>', methods=['PUT'])
def api_update_tool(tool_id):
    """更新工具"""

    data = request.json
    
    tool_config = {
        'tool_name': data.get('tool_name', tool_id),
        'description': data.get('description', ''),
        'single_path': data.get('single_path', ''),
        'single_func': data.get('single_func', ''),
        'multi_path': data.get('multi_path', ''),
        'multi_func': data.get('multi_func', ''),
        'extra_display_path': data.get('extra_display_path', ''),
        'extra_display_func': data.get('extra_display_func', ''),
        'custom_curve_func': data.get('custom_curve_func', '')
    }
    
    success = tool_manager.update_tool(tool_id, tool_config)
    if success:
        return jsonify({'success': True})
    return jsonify({'success': False, 'error': '更新失败'})
