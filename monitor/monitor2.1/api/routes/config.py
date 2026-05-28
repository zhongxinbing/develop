"""
工具配置API路由模块
"""
from flask import Blueprint, request, jsonify
from datetime import datetime

from api.utils import log
from api.services.tool_config import (
    load_tool_config, save_tool_config, get_tool_config,
    update_tool_config, delete_tool_config
)
from config import CASE_CONFIG

config_bp = Blueprint('config', __name__)


@config_bp.route('/api/tools', methods=['GET'])
def api_get_tools():
    """获取所有工具配置"""
    try:
        configs = load_tool_config()
        tools_list = [
            {
                'id': tool_id,
                'name': tool_info.get('name', tool_id),
                'description': tool_info.get('description', ''),
                'icon': tool_info.get('icon', '🔧'),
                'has_single': bool(tool_info.get('single_original_path')),
                'has_multi': bool(tool_info.get('multi_original_path')),
                'json_path': tool_info.get('json_path', ''),
                'mem': tool_info.get('mem', ''),
                'cpu': tool_info.get('cpu', ''),
                'single_original_path': tool_info.get('single_original_path', ''),
                'multi_original_path': tool_info.get('multi_original_path', ''),
                'last_updated': tool_info.get('last_updated', '')
            }
            for tool_id, tool_info in configs.items()
        ]
        return jsonify({'success': True, 'tools': tools_list})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@config_bp.route('/api/tool/<tool_id>', methods=['GET', 'PUT', 'DELETE'])
def api_tool_config(tool_id: str):
    """获取、保存或删除工具配置的API"""
    global CASE_CONFIG
    
    try:
        if request.method == 'GET':
            config = get_tool_config(tool_id)
            return jsonify({
                'success': True,
                'tool': {
                    'id': tool_id,
                    'name': config.get('name', tool_id),
                    'description': config.get('description', ''),
                    'icon': config.get('icon', '🔧'),
                    'json_path': config.get('json_path', ''),
                    'mem': config.get('mem', ''),
                    'cpu': config.get('cpu', ''),
                    'single_original_path': config.get('single_original_path', ''),
                    'multi_original_path': config.get('multi_original_path', ''),
                    'last_updated': config.get('last_updated', '')
                }
            })
        
        elif request.method == 'PUT':
            data = request.get_json() or {}
            
            config = {
                'name': data.get('name', tool_id),
                'description': data.get('description', ''),
                'icon': data.get('icon', '🔧'),
                'json_path': data.get('json_path', ''),
                'mem': data.get('mem', ''),
                'cpu': data.get('cpu', ''),
                'single_original_path': data.get('single_original_path', ''),
                'multi_original_path': data.get('multi_original_path', '')
            }
            
            if update_tool_config(tool_id, config):
                # 重新加载全局CASE_CONFIG
                import sys
                import importlib
                if 'config' in sys.modules:
                    importlib.reload(sys.modules['config'])
                from config import CASE_CONFIG as fresh_config
                globals()['CASE_CONFIG'] = fresh_config
                return jsonify({'success': True, 'message': '配置保存成功'})
            return jsonify({'success': False, 'error': '配置保存失败'}), 500
        
        elif request.method == 'DELETE':
            if delete_tool_config(tool_id):
                # 重新加载全局CASE_CONFIG
                import sys
                import importlib
                if 'config' in sys.modules:
                    importlib.reload(sys.modules['config'])
                from config import CASE_CONFIG as fresh_config
                globals()['CASE_CONFIG'] = fresh_config
                return jsonify({'success': True, 'message': '配置删除成功'})
            return jsonify({'success': False, 'error': '配置不存在'}), 404
            
    except Exception as e:
        log(f"API错误: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)}), 500