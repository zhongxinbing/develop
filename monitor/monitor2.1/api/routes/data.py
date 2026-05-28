"""
数据API路由模块 - 刷新、项目、日期等
"""
from flask import Blueprint, request, jsonify
from datetime import datetime

from api.utils import log
from api.services.tool_config import load_tool_config
from api.services.global_state import global_state
from config import CONFIG
from data_cache import data_cache, version_manager
from tool.elint.elint import get_elint_data, get_perf
from tool.elint.parse import refresh_parsed_projects

data_bp = Blueprint('data', __name__)


@data_bp.route('/api/refresh', methods=['POST'])
def api_refresh():
    """刷新数据API接口"""
    log("刷新数据中...")
    
    try:
        CASE_CONFIG = load_tool_config()
        
        data = request.get_json() or {}
        tool = data.get('tool', 'elint')
        mode = data.get('mode', 'single')
        
        tool_config = CASE_CONFIG.get(tool, {})
        
        if mode == 'single':
            original_path = tool_config.get('single_original_path', '')
        else:
            original_path = tool_config.get('multi_original_path', '')
        
        json_path = tool_config.get('json_path', '')
        
        config = {
            'json_path': json_path,
            'original_path': original_path
        }
        
        cache_key = f"{tool}_{mode}_projects_data"
        
        # 检查数据是否有变化
        if version_manager.check_changes(config):
            data_cache.invalidate(cache_key)
            
            projects_data = get_elint_data(json_path, original_path)
            current_projects_data = projects_data.copy()
            # 使用全局状态管理器刷新数据
            parsed_projects, project_list = global_state.refresh_projects(current_projects_data)
            
            if CONFIG['cache_enabled']:
                data_cache.set(cache_key, {
                    'projects_data': current_projects_data,
                    'parsed_projects': parsed_projects,
                    'project_list': project_list,
                    'timestamp': datetime.now().timestamp()
                })
        else:
            cached = data_cache.get(cache_key)
            
            if cached and (datetime.now().timestamp() - cached.get('timestamp', 0) < CONFIG['cache_ttl']):
                current_projects_data = cached['projects_data']
                # 从缓存恢复全局状态
                global_state.parsed_projects = cached.get('parsed_projects', {})
                global_state.project_list = cached.get('project_list', [])
                log("使用缓存数据")
            else:
                projects_data = get_elint_data(json_path, original_path)
                current_projects_data = projects_data.copy()
                parsed_projects, project_list = global_state.refresh_projects(current_projects_data)
                
                if CONFIG['cache_enabled']:
                    data_cache.set(cache_key, {
                        'projects_data': current_projects_data,
                        'parsed_projects': parsed_projects,
                        'project_list': project_list,
                        'timestamp': datetime.now().timestamp()
                    })
        
        mem_path = tool_config.get('mem', '')
        cpu_path = tool_config.get('cpu', '')
        perf = get_perf(mem_path, cpu_path)
        
        # 构建返回数据 - 使用全局状态中的 parsed_projects
        parsed_projects = global_state.parsed_projects
        projects_data_json = {
            pid: {
                'dates': info.get('dates', []),
                'available_dates': info.get('available_dates', info.get('dates', [])),
                'rules': info.get('rules', []),
                'rule_data': info.get('rule_data', {}),
                'project_name': info.get('project_name', pid)
            }
            for pid, info in parsed_projects.items()
        }
        
        last_update = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        
        # 构建项目列表
        project_list_data = [
            {'id': pid, 'name': info.get('project_name', pid)}
            for pid, info in parsed_projects.items()
        ]
        
        return jsonify({
            'success': True,
            'data': projects_data_json,
            'project_list': project_list_data,
            'last_update': last_update,
            'message': '数据刷新成功',
            'perf': perf,
            'version': version_manager.get_data_signature(config)
        })
    except Exception as e:
        log(f"刷新失败: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'message': str(e)}), 500


@data_bp.route('/api/check_update', methods=['POST'])
def api_check_update():
    """检查数据是否有更新"""
    try:
        from api.services.tool_config import load_tool_config
        data = request.get_json() or {}
        tool = data.get('tool', 'elint')
        mode = data.get('mode', 'single')
        current_version = data.get('version', '')
        
        CASE_CONFIG = load_tool_config()
        tool_config = CASE_CONFIG.get(tool, {})
        
        if mode == 'single':
            original_path = tool_config.get('single_original_path', '')
        else:
            original_path = tool_config.get('multi_original_path', '')
        
        config = {
            'json_path': tool_config.get('json_path', ''),
            'original_path': original_path
        }
        new_version = version_manager.get_data_signature(config)
        
        has_update = new_version != current_version
        
        return jsonify({
            'has_update': has_update,
            'version': new_version,
            'message': '有数据更新' if has_update else '数据已是最新'
        })
    except Exception as e:
        return jsonify({'has_update': False, 'error': str(e)}), 500


@data_bp.route('/api/get_dates', methods=['POST'])
def api_get_dates():
    """获取项目可用的日期列表"""
    parsed_projects = global_state.parsed_projects
    
    try:
        data = request.get_json() or {}
        project_id = data.get('project_id')
        
        if project_id not in parsed_projects:
            return jsonify({'success': False, 'error': '项目不存在'}), 404
        
        dates = parsed_projects[project_id].get('dates', [])
        available_dates = parsed_projects[project_id].get('available_dates', dates)
        return jsonify({
            'success': True,
            'dates': dates,
            'available_dates': available_dates
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@data_bp.route('/api/projects')
def api_projects():
    """获取项目列表"""
    return jsonify(global_state.project_list)


@data_bp.route('/api/project/<project_id>')
def api_project_data(project_id: str):
    """获取单个项目的详细数据"""
    parsed_projects = global_state.parsed_projects
    
    if project_id not in parsed_projects:
        return jsonify({'error': 'Project not found'}), 404
    
    info = parsed_projects[project_id]
    return jsonify({
        'project_name': info.get('project_name', project_id),
        'dates': info.get('dates', []),
        'available_dates': info.get('available_dates', info.get('dates', [])),
        'rules': info.get('rules', []),
        'rule_data': info.get('rule_data', {})
    })


@data_bp.route('/api/multi_thread_data', methods=['POST'])
def api_multi_thread_data():
    """获取多线程对比数据"""
    parsed_projects = global_state.parsed_projects
    
    try:
        data = request.get_json() or {}
        project_id = data.get('project_id')
        rule_name = data.get('rule_name')
        date = data.get('date')
        
        if project_id not in parsed_projects:
            return jsonify({'success': False, 'error': '项目不存在'}), 404
        
        project_info = parsed_projects[project_id]
        rule_info = project_info.get('rule_data', {}).get(rule_name, {})
        
        if not rule_info:
            return jsonify({'success': False, 'error': '阶段不存在'}), 404
        
        dates = rule_info.get('dates', [])
        if not dates:
            return jsonify({'success': False, 'error': '无数据'}), 404
        
        target_date = date if date else dates[-1]
        
        try:
            date_idx = dates.index(target_date)
        except ValueError:
            return jsonify({'success': False, 'error': f'日期 {target_date} 无数据'}), 404
        
        thread_metrics = rule_info.get('thread_metrics', {})
        threads_data = []
        
        for thread_key, thread_info in thread_metrics.items():
            runtime = thread_info.get('runtimes', [None])[date_idx] if date_idx < len(thread_info.get('runtimes', [])) else None
            memory = thread_info.get('memories', [None])[date_idx] if date_idx < len(thread_info.get('memories', [])) else None
            
            if runtime is not None or memory is not None:
                threads_data.append({
                    'threads': int(thread_key),
                    'runtime': runtime,
                    'memory': memory
                })
        
        threads_data.sort(key=lambda x: x['threads'])
        
        return jsonify({
            'success': True,
            'project_id': project_id,
            'rule_name': rule_name,
            'date': target_date,
            'available_dates': dates,
            'threads_data': threads_data
        })
    except Exception as e:
        log(f"获取多线程数据失败: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)}), 500