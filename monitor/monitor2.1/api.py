"""
Flask API路由模块 - 添加批量获取用户数据接口
"""
from flask import Flask, render_template, request, jsonify, send_from_directory
from flask_cors import CORS
from datetime import datetime
from pathlib import Path
from typing import Dict, Any, List, Optional
import json

from common import log, load_json, save_json, get_local_ip
from tool.elint.elint import get_elint_data, get_perf, get_user_data_batch
from tool.elint.parse import parse_project_data, refresh_parsed_projects, parsed_projects, project_list
from data_cache import data_cache, version_manager
from compare import comparator
from config import *

# ==================================================
# Flask应用初始化
# ==================================================
app = Flask(__name__)
CORS(app)

# 全局变量
# parsed_projects: Dict = {}
# project_list: List = []
# current_projects_data: Dict = {}


# ==================================================
# 工具配置管理函数
# ==================================================

def save_tool_config(config_data: Dict) -> bool:
    """保存工具配置文件"""
    try:
        TOOL_CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)
        return save_json(TOOL_CONFIG_PATH, config_data)
    except Exception as e:
        log(f"保存工具配置失败: {e}")
        return False


def update_tool_config(tool_id: str, config: Dict) -> bool:
    """
    更新工具配置
    
    参数:
        tool_id: 工具ID
        config: 配置字典
    """
    log(f"保存工具配置: tool_id={tool_id}, config={config}")
    
    # 获取配置值
    name = config.get('name', '').strip()
    description = config.get('description', '').strip()
    icon = config.get('icon', '').strip()
    single_original_path = config.get('single_original_path', '').strip()
    
    # 可以为空的字段
    json_path = config.get('json_path', '').strip() if config.get('json_path') else ''
    mem = config.get('mem', '').strip() if config.get('mem') else ''
    cpu = config.get('cpu', '').strip() if config.get('cpu') else ''
    multi_original_path = config.get('multi_original_path', '').strip() if config.get('multi_original_path') else ''
    
    # 必填字段验证
    errors = []
    if not name:
        errors.append("工具名称不能为空")
    if not icon:
        errors.append("工具图标不能为空")
    if not single_original_path:
        errors.append("Single模式原始数据路径不能为空")
    
    if errors:
        log(f"配置保存失败: {'; '.join(errors)}")
        return False
    
    configs = load_tool_config()
    
    configs[tool_id] = {
        'name': name,
        'description': description,
        'icon': icon,
        'json_path': json_path,
        'mem': mem,
        'cpu': cpu,
        'single_original_path': single_original_path,
        'multi_original_path': multi_original_path,
        'last_updated': datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    }
    
    return save_tool_config(configs)


def get_tool_config(tool_id: str = None) -> Dict:
    """获取工具配置"""
    configs = load_tool_config()
    if tool_id:
        return configs.get(tool_id, {})
    return configs


def delete_tool_config(tool_id: str) -> bool:
    """删除工具配置"""
    configs = load_tool_config()
    if tool_id in configs:
        configs.pop(tool_id, None)
        save_tool_config(configs)
        log(f"配置已删除: tool_id={tool_id}")
        return True
    return False


# ==================================================
# 路由定义
# ==================================================

@app.route('/')
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


@app.route('/tool/<tool_id>')
def tool_page(tool_id: str):
    """工具主页面"""
    global parsed_projects, project_list, current_projects_data
    
    if tool_id not in CASE_CONFIG:
        return "工具不存在", 404
    
    tool_info = CASE_CONFIG[tool_id]
    
    json_path = tool_info.get('json_path', '')
    mem_path = tool_info.get('mem', '')
    cpu_path = tool_info.get('cpu', '')
    single_original_path = tool_info.get('single_original_path', '')
    
    # 获取项目数据（优先使用缓存）
    cache_key = f"{tool_id}_single_projects_data"
    cached = data_cache.get(cache_key)
    
    if cached and (datetime.now().timestamp() - cached.get('timestamp', 0) < CONFIG['cache_ttl']):
        current_projects_data = cached['projects_data']
        # 使用缓存的 parsed_projects 和 project_list
        if 'parsed_projects' in cached:
            parsed_projects = cached['parsed_projects']
            project_list = cached['project_list']
        else:
            parsed_projects, project_list = refresh_parsed_projects(current_projects_data)
        log("使用缓存数据")
    else:
        config = {
            'json_path': json_path,
            'original_path': single_original_path
        }
        projects_data = get_elint_data(config.get('json_path', ''), config.get('original_path', ''))
        current_projects_data = projects_data.copy()
        parsed_projects, project_list = refresh_parsed_projects(current_projects_data)

        if CONFIG['cache_enabled']:
            data_cache.set(cache_key, {
                'projects_data': current_projects_data,
                'parsed_projects': parsed_projects,
                'project_list': project_list,
                'timestamp': datetime.now().timestamp()
            })
    
    # 准备前端数据
    projects_data_json = {
        pid: {
            'dates': info['dates'],
            'available_dates': info.get('available_dates', info['dates']),
            'rules': info['rules'],
            'rule_data': info['rule_data'],
            'project_name': info['project_name']
        }
        for pid, info in parsed_projects.items()
    }

    perf = get_perf(mem_path, cpu_path)
    multi_original_path = tool_info.get('multi_original_path', '')
    
    return render_template(
        'tool.html',
        tool_id=tool_id,
        tool_name=tool_info.get('name', tool_id),
        tool_icon=tool_info.get('icon', '🔧'),
        has_single=bool(single_original_path),
        has_multi=bool(multi_original_path),
        project_list=project_list,
        projects_data_json=projects_data_json,
        perf=perf,
        single_original_path=single_original_path,
        multi_original_path=multi_original_path,
        json_path=json_path,
        mem_path=mem_path,
        cpu_path=cpu_path
    )


@app.route('/api/refresh', methods=['POST'])
def api_refresh():
    """刷新数据API接口"""
    global parsed_projects, project_list, CASE_CONFIG
    
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
            parsed_projects, project_list = refresh_parsed_projects(current_projects_data)
            
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
                parsed_projects = cached.get('parsed_projects', {})
                project_list = cached.get('project_list', [])
                log("使用缓存数据")
            else:
                projects_data = get_elint_data(json_path, original_path)
                current_projects_data = projects_data.copy()
                parsed_projects, project_list = refresh_parsed_projects(current_projects_data)
                
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
        
        # 构建返回数据 - 使用 parsed_projects
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


@app.route('/api/check_update', methods=['POST'])
def api_check_update():
    """检查数据是否有更新"""
    try:
        data = request.get_json() or {}
        tool = data.get('tool', 'elint')
        mode = data.get('mode', 'single')
        current_version = data.get('version', '')
        
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


@app.route('/api/get_dates', methods=['POST'])
def api_get_dates():
    """获取项目可用的日期列表"""
    global parsed_projects
    
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


@app.route('/api/projects')
def api_projects():
    """获取项目列表"""
    global project_list
    return jsonify(project_list)


@app.route('/api/project/<project_id>')
def api_project_data(project_id: str):
    """获取单个项目的详细数据"""
    global parsed_projects
    
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


@app.errorhandler(404)
def page_not_found(e):
    """404错误处理页面"""
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


# ==================================================
# 工具配置页面路由
# ==================================================

@app.route('/tools_config')
def tools_config_page():
    """工具配置管理页面"""
    return render_template('tools_config.html')


# ==================================================
# 工具配置API
# ==================================================

@app.route('/api/tools', methods=['GET'])
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


@app.route('/api/tool/<tool_id>', methods=['GET', 'PUT', 'DELETE'])
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
                CASE_CONFIG = load_tool_config()
                return jsonify({'success': True, 'message': '配置保存成功'})
            return jsonify({'success': False, 'error': '配置保存失败'}), 500
        
        elif request.method == 'DELETE':
            if delete_tool_config(tool_id):
                CASE_CONFIG = load_tool_config()
                return jsonify({'success': True, 'message': '配置删除成功'})
            return jsonify({'success': False, 'error': '配置不存在'}), 404
            
    except Exception as e:
        log(f"API错误: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)}), 500


# ==================================================
# 对比配置管理函数
# ==================================================

def load_compare_config() -> Dict:
    """加载对比配置文件"""
    if not COMPARE_CONFIG_FILE.exists():
        return {}
    
    try:
        with open(COMPARE_CONFIG_FILE, 'r', encoding='utf-8') as f:
            content = f.read()
            return json.loads(content) if content.strip() else {}
    except (json.JSONDecodeError, Exception) as e:
        log(f"加载对比配置失败: {e}")
        return {}


def save_compare_config(config_data: Dict) -> bool:
    """保存对比配置到文件"""
    try:
        COMPARE_CONFIG_FILE.parent.mkdir(parents=True, exist_ok=True)
        return save_json(COMPARE_CONFIG_FILE, config_data)
    except Exception as e:
        log(f"保存对比配置失败: {e}")
        return False


def get_compare_config(project_id: str) -> Dict:
    """获取指定项目的对比配置"""
    configs = load_compare_config()
    return configs.get(project_id, {})


def update_compare_config(project_id: str, config: Dict) -> None:
    """更新指定项目的对比配置"""
    log(f"保存配置: project_id={project_id}, config={config}")
    
    configs = load_compare_config()
    
    configs[project_id] = {
        'tolerance_runtime': config.get('tolerance_runtime', 0),
        'tolerance_memory': config.get('tolerance_memory', 0),
        'last_updated': datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    }
    
    save_compare_config(configs)


def delete_compare_config(project_id: str) -> None:
    """删除项目的对比配置"""
    configs = load_compare_config()
    if project_id in configs:
        configs.pop(project_id, None)
        save_compare_config(configs)
        log(f"配置已删除: project_id={project_id}")


# ==================================================
# 多线程数据API
# ==================================================

@app.route('/api/multi_thread_data', methods=['POST'])
def api_multi_thread_data():
    """获取多线程对比数据"""
    global parsed_projects
    
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


# ==================================================
# 批量获取用户自定义数据API
# ==================================================

@app.route('/api/fetch_user_data_batch', methods=['POST'])
def api_fetch_user_data_batch():
    """批量获取用户自定义数据API"""
    try:
        data = request.get_json() or {}
        case_paths = data.get('case_paths', [])
        
        if not case_paths:
            return jsonify({'success': False, 'error': '请提供至少一个用户数据路径'}), 400
        
        from tool.elint.elint import get_user_data_batch
        
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


@app.route('/api/fetch_default_user_data', methods=['POST'])
def api_fetch_default_user_data():
    """获取默认用户数据API"""
    try:
        data = request.get_json() or {}
        tool = data.get('tool', 'elint')
        
        tool_config = CASE_CONFIG.get(tool, {})
        json_path = tool_config.get('json_path', '')
        
        if not json_path:
            return jsonify({'success': False, 'error': '未配置默认数据路径'}), 400
        
        from tool.elint.elint import get_elint_data
        
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


# ==================================================
# 对比API
# ==================================================

@app.route('/api/compare', methods=['POST'])
def api_compare():
    """数据对比API"""
    global parsed_projects
    
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
        
        if project_id not in parsed_projects:
            return jsonify({'success': False, 'error': '项目不存在'}), 404
        
        project_info = parsed_projects[project_id]
        
        def build_day_data(date: str) -> Dict:
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


@app.route('/api/compare_config', methods=['GET', 'POST', 'DELETE'])
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


@app.route('/api/compare_all_configs', methods=['GET'])
def api_compare_all_configs():
    """获取所有对比配置"""
    try:
        configs = load_compare_config()
        return jsonify({'success': True, 'configs': configs})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/export_compare', methods=['POST'])
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


@app.route('/download/<filename>')
def download_file(filename: str):
    """下载文件"""
    return send_from_directory(comparator.export_dir, filename, as_attachment=True)