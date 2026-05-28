"""
用户自定义数据API路由模块
"""
from flask import Blueprint, request, jsonify

from api.utils import log
from api.services.tool_config import load_tool_config
from tool.elint.parse import parse_project_data
from tool.elint.elint import get_user_data_batch, get_elint_data

user_data_bp = Blueprint('user_data', __name__)


@user_data_bp.route('/api/fetch_user_data_batch', methods=['POST'])
def api_fetch_user_data_batch():
    """批量获取用户自定义数据API"""
    try:
        data = request.get_json() or {}
        case_paths = data.get('case_paths', [])
        
        if not case_paths:
            return jsonify({'success': False, 'error': '请提供至少一个用户数据路径'}), 400
        
        # 调用批量获取函数
        result = get_user_data_batch(case_paths)
        
        if result:
            # 解析数据
            parsed_result = {}
            for project_id, project_data in result.items():
                parsed_result[project_id] = parse_project_data(project_data, project_id)
                parsed_result[project_id]['project_name'] = project_data.get('project_name', project_id)
                parsed_result[project_id]['description'] = project_data.get('description', '')
            
            return jsonify({
                'success': True,
                'data': parsed_result,
                'message': f'成功加载 {len(case_paths)} 个case数据'
            })
        else:
            return jsonify({'success': False, 'error': '获取数据失败，请检查路径'}), 500
            
    except ImportError:
        return jsonify({
            'success': False,
            'error': 'get_user_data_batch 函数尚未实现，请先在 elint.py 中实现该函数'
        }), 501
    except Exception as e:
        log(f"获取用户数据失败: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)}), 500


@user_data_bp.route('/api/fetch_default_user_data', methods=['POST'])
def api_fetch_default_user_data():
    """获取默认用户数据API"""
    try:
        data = request.get_json() or {}
        tool = data.get('tool', 'elint')
        
        CASE_CONFIG = load_tool_config()
        tool_config = CASE_CONFIG.get(tool, {})
        json_path = tool_config.get('json_path', '')
        
        if not json_path:
            return jsonify({'success': False, 'error': '未配置默认数据路径'}), 400
        
        # 获取默认数据
        projects_data = get_elint_data(json_path, '')
        
        parsed_result = {}
        for project_id, project_data in projects_data.items():
            if project_id != 'dataFiles':  # 跳过临时字段
                parsed_result[project_id] = parse_project_data(project_data, project_id)
                parsed_result[project_id]['project_name'] = project_data.get('project_name', project_id)
                parsed_result[project_id]['description'] = project_data.get('description', '')
        
        return jsonify({
            'success': True,
            'data': parsed_result,
            'message': '成功加载默认数据'
        })
    except Exception as e:
        log(f"获取默认数据失败: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)}), 500