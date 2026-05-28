"""
对比API路由模块
"""
from flask import Blueprint, request, jsonify, send_from_directory
from pathlib import Path

from api.utils import log
from api.services.compare_config import (
    load_compare_config, save_compare_config, get_compare_config,
    update_compare_config, delete_compare_config
)
from api.services.global_state import global_state
from comparator import comparator

compare_bp = Blueprint('compare', __name__)


@compare_bp.route('/api/compare', methods=['POST'])
def api_compare():
    """数据对比API"""
    try:
        data = request.get_json() or {}
        project_id = data.get('project_id')
        rule_name = data.get('rule_name', 'all')
        date1 = data.get('date1')
        date2 = data.get('date2')
        tolerance_runtime = float(data.get('tolerance_runtime', 0))
        tolerance_memory = float(data.get('tolerance_memory', 0))
        tolerance_mode = data.get('tolerance_mode', 'absolute')
        compare_dimension = data.get('compare_dimension', 'both')
        save_config = data.get('save_config', True)
        
        log(f"对比请求: project_id={project_id}, rule_name={rule_name}, date1={date1}, date2={date2}")

        # 从全局状态获取 parsed_projects
        parsed_projects = global_state.parsed_projects
        
        if project_id not in parsed_projects:
            log(f"ERROR: 项目 {project_id} 不存在于 parsed_projects 中")
            return jsonify({'success': False, 'error': '项目不存在'}), 404
        
        project_info = parsed_projects[project_id]
        
        def build_day_data(date: str):
            """构建单天的完整项目数据"""
            day_data = {
                'dates': [date],
                'rules': project_info.get('rules', []),
                'rule_data': {}
            }
            
            for rule, rule_info in project_info.get('rule_data', {}).items():
                try:
                    idx = rule_info['dates'].index(date)
                    day_data['rule_data'][rule] = {
                        'dates': [date],
                        'runtimes': [rule_info['runtimes'][idx]],
                        'memories': [rule_info['memories'][idx]],
                        'cores': [rule_info['cores'][idx]]
                    }
                except ValueError:
                    day_data['rule_data'][rule] = {
                        'dates': [date],
                        'runtimes': [None],
                        'memories': [None],
                        'cores': [None]
                    }
            
            return day_data
        
        data1 = build_day_data(date1)
        data2 = build_day_data(date2)
        
        compare_result = comparator.compare_data(
            data1, data2, project_id, rule_name,
            tolerance_runtime, tolerance_memory,
            tolerance_mode=tolerance_mode,
            compare_dimension=compare_dimension
        )
        
        compare_result['tolerance_mode'] = tolerance_mode
        compare_result['compare_dimension'] = compare_dimension

        if save_config:
            update_compare_config(project_id, {
                'tolerance_runtime': tolerance_runtime,
                'tolerance_memory': tolerance_memory
            })
        
        return jsonify({'success': True, 'result': compare_result})
    except Exception as e:
        log(f"对比失败: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)}), 500


@compare_bp.route('/api/compare_config', methods=['GET', 'POST', 'DELETE'])
def api_compare_config():
    """获取、保存或删除对比配置的API"""
    try:
        if request.method == 'GET':
            project_id = request.args.get('project_id', '')
            if not project_id:
                return jsonify({'success': False, 'error': 'project_id 参数缺失'}), 400
            
            config = get_compare_config(project_id)
            return jsonify({'success': True, 'config': config})
        
        elif request.method == 'POST':
            data = request.get_json() or {}
            project_id = data.get('project_id')
            
            if not project_id:
                return jsonify({'success': False, 'error': 'project_id 参数缺失'}), 400
            
            update_compare_config(project_id, data.get('config', {}))
            return jsonify({'success': True, 'message': '配置保存成功'})
        
        elif request.method == 'DELETE':
            data = request.get_json() or {}
            project_id = data.get('project_id')
            
            if not project_id:
                return jsonify({'success': False, 'error': 'project_id 参数缺失'}), 400
            
            delete_compare_config(project_id)
            return jsonify({'success': True, 'message': '配置删除成功'})
            
    except Exception as e:
        log(f"API错误: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)}), 500


@compare_bp.route('/api/compare_all_configs', methods=['GET'])
def api_compare_all_configs():
    """获取所有对比配置"""
    try:
        configs = load_compare_config()
        return jsonify({'success': True, 'configs': configs})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@compare_bp.route('/api/export_compare', methods=['POST'])
def api_export_compare():
    """导出对比结果到CSV文件"""
    try:
        data = request.get_json() or {}
        compare_result = data.get('result')
        
        if not compare_result:
            return jsonify({'success': False, 'error': '无对比数据'}), 400
        
        filename = data.get('filename')
        filepath = comparator.export_to_csv(compare_result, filename)
        
        return jsonify({
            'success': True,
            'filepath': filepath,
            'filename': Path(filepath).name,
            'download_url': f'/download/{Path(filepath).name}'
        })
    except Exception as e:
        log(f"导出失败: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@compare_bp.route('/download/<filename>')
def download_file(filename: str):
    """下载文件"""
    from compare import comparator
    return send_from_directory(comparator.export_dir, filename, as_attachment=True)