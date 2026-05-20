"""
==================================================
多项目多阶段EDA流程监控系统 - 现代化重构版
支持: 日期 -> 阶段 -> runtime/memory/cores 三层数据结构
支持: 数据对比、自动刷新、MR更新高亮
布局: 侧边栏导航 + 主内容区域
==================================================
"""

from flask import Flask, render_template, request, jsonify, send_from_directory
from flask_cors import CORS
import webbrowser
import threading
import time
import socket
import json
import os
from datetime import datetime
from pathlib import Path

from common import log
from elint import *
from data_cache import data_cache, version_manager
from compare import comparator

app = Flask(__name__)
CORS(app)

# ==================================================
# 配置选项
# ==================================================
CONFIG = {
    'host': '0.0.0.0',
    'port': 6060,
    'debug': True,
    'auto_open_browser': False,
    'cache_enabled': True,
    'cache_ttl': 300  # 缓存TTL（秒）
}

# 配置数据映射 - 工具配置，用于主页面卡片动态生成
CASE_CONFIG = load_json(r'C:\Users\xbzhong\Desktop\lint\script\monitor\develop\monitor\new_code\data\config\tool_config.json')

# 数据目录配置
DATA_DIR = Path('./data')
DATA_DIR.mkdir(parents=True, exist_ok=True)

# 对比配置文件路径
COMPARE_CONFIG_FILE = DATA_DIR / 'compare.json'


# app.py 中的配置管理函数（修改后）

def load_compare_config():
    """加载对比配置"""
    if not COMPARE_CONFIG_FILE.exists():
        log(f"配置文件不存在，创建空配置: {COMPARE_CONFIG_FILE}")
        return {}
    try:
        with open(COMPARE_CONFIG_FILE, 'r', encoding='utf-8') as f:
            content = f.read()
            if not content.strip():
                return {}
            return json.loads(content)
    except json.JSONDecodeError as e:
        log(f"配置文件JSON解析失败: {e}，将创建新配置")
        return {}
    except Exception as e:
        log(f"加载对比配置失败: {e}")
        return {}


def save_compare_config(config_data):
    """保存对比配置"""
    try:
        COMPARE_CONFIG_FILE.parent.mkdir(parents=True, exist_ok=True)
        
        with open(COMPARE_CONFIG_FILE, 'w', encoding='utf-8') as f:
            json.dump(config_data, f, ensure_ascii=False, indent=4)
        
        log(f"对比配置已保存到: {COMPARE_CONFIG_FILE}")
        return True
    except Exception as e:
        log(f"保存对比配置失败: {e}")
        return False


def get_compare_config(project_id: str):
    """
    获取指定项目的对比配置
    
    参数:
        project_id: 项目ID
    
    返回:
        dict: 配置信息，包含 tolerance_runtime, tolerance_memory
    """
    configs = load_compare_config()
    log(f"加载配置: project_id={project_id}, 当前配置={configs}")
    
    if not configs:
        return {}
    
    return configs.get(project_id, {})


def update_compare_config(project_id: str, config: dict):
    """
    更新指定项目的对比配置
    
    参数:
        project_id: 项目ID
        config: 配置字典，包含 tolerance_runtime, tolerance_memory
    """
    log(f"保存配置: project_id={project_id}, config={config}")
    
    # 加载现有配置
    configs = load_compare_config()
    
    # 保存配置（只保存 runtime 和 memory 容差）
    configs[project_id] = {
        'tolerance_runtime': config.get('tolerance_runtime', 0),
        'tolerance_memory': config.get('tolerance_memory', 0),
        'last_updated': datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    }
    
    # 保存到文件
    if save_compare_config(configs):
        log(f"配置保存成功: {project_id}")
    else:
        log(f"配置保存失败: {project_id}")


def delete_compare_config(project_id: str):
    """删除项目的对比配置"""
    configs = load_compare_config()
    
    if project_id in configs:
        configs.pop(project_id, None)
        save_compare_config(configs)
        log(f"配置已删除: project_id={project_id}")


# ==================================================
# 数据解析函数
# ==================================================

def normalize_thread_key(cores):
    """标准化线程键名"""
    try:
        return str(int(cores))
    except Exception:
        return '0'


def parse_project_data(project_data, project_id):
    """
    解析项目数据，支持三层结构：日期 -> 阶段 -> 指标
    支持多线程线程数数据：thread_metrics 字段
    
    返回:
        dates: 日期列表
        rules: 所有阶段名称列表（已排序）
        rule_data: {rule_name: {'dates': [], 'thread_metrics': {...}, 'thread_counts': [], 'runtimes': [], 'memories': [], 'cores': []}}
    """
    if 'daily_metrics' in project_data:
        daily_metrics = project_data['daily_metrics']
    else:
        daily_metrics = project_data

    # 收集所有阶段名称
    all_rules = set()
    for date, tools_dict in daily_metrics.items():
        all_rules.update(tools_dict.keys())
    all_rules = sorted(list(all_rules))

    # 按日期排序
    sorted_dates = sorted(daily_metrics.keys())
    available_dates = sorted(set(project_data.get('available_dates', sorted_dates)))

    # 为每个阶段构建数据
    rule_data = {}
    for rule in all_rules:
        rule_data[rule] = {
            'dates': [],
            'thread_metrics': {},
            'thread_counts': [],
            'runtimes': [],
            'memories': [],
            'cores': []
        }

        for idx, date in enumerate(sorted_dates):
            rule_data[rule]['dates'].append(date)
            rule_info = daily_metrics.get(date, {}).get(rule)

            # 确保所有已知线程数据行在每个日期都有占位符
            current_threads = set(rule_data[rule]['thread_metrics'].keys())
            new_threads = set()
            if rule_info and isinstance(rule_info, dict):
                if 'thread_metrics' in rule_info and isinstance(rule_info['thread_metrics'], dict):
                    new_threads = set(str(k) for k in rule_info['thread_metrics'].keys())
                else:
                    new_threads = {normalize_thread_key(rule_info.get('cores', 0))}

            for thread_key in current_threads | new_threads:
                if thread_key not in rule_data[rule]['thread_metrics']:
                    rule_data[rule]['thread_metrics'][thread_key] = {
                        'runtimes': [None] * idx,
                        'memories': [None] * idx,
                        'cores': [None] * idx
                    }

            for thread_key, thread_info in rule_data[rule]['thread_metrics'].items():
                if len(thread_info['runtimes']) <= idx:
                    thread_info['runtimes'].append(None)
                    thread_info['memories'].append(None)
                    thread_info['cores'].append(None)

            if not rule_info:
                continue

            if 'thread_metrics' in rule_info and isinstance(rule_info['thread_metrics'], dict):
                for thread_key, thread_values in rule_info['thread_metrics'].items():
                    thread_key = str(thread_key)
                    if thread_key not in rule_data[rule]['thread_metrics']:
                        rule_data[rule]['thread_metrics'][thread_key] = {
                            'runtimes': [None] * idx,
                            'memories': [None] * idx,
                            'cores': [None] * idx
                        }
                    rule_data[rule]['thread_metrics'][thread_key]['runtimes'][idx] = thread_values.get('runtime')
                    rule_data[rule]['thread_metrics'][thread_key]['memories'][idx] = thread_values.get('memory')
                    rule_data[rule]['thread_metrics'][thread_key]['cores'][idx] = thread_values.get('cores')
            else:
                thread_key = normalize_thread_key(rule_info.get('cores', 0))
                if thread_key not in rule_data[rule]['thread_metrics']:
                    rule_data[rule]['thread_metrics'][thread_key] = {
                        'runtimes': [None] * idx,
                        'memories': [None] * idx,
                        'cores': [None] * idx
                    }
                rule_data[rule]['thread_metrics'][thread_key]['runtimes'][idx] = rule_info.get('runtime')
                rule_data[rule]['thread_metrics'][thread_key]['memories'][idx] = rule_info.get('memory')
                rule_data[rule]['thread_metrics'][thread_key]['cores'][idx] = int(thread_key)

        # 排序线程数
        thread_counts = sorted(
            [int(k) for k in rule_data[rule]['thread_metrics'].keys()],
            key=lambda x: x
        )
        thread_counts = [str(x) for x in thread_counts]
        rule_data[rule]['thread_counts'] = thread_counts

        # 设置默认线程（0或最小线程数）
        default_thread = '0' if '0' in rule_data[rule]['thread_metrics'] else (thread_counts[0] if thread_counts else None)
        if default_thread:
            rule_data[rule]['runtimes'] = rule_data[rule]['thread_metrics'][default_thread]['runtimes']
            rule_data[rule]['memories'] = rule_data[rule]['thread_metrics'][default_thread]['memories']
            rule_data[rule]['cores'] = rule_data[rule]['thread_metrics'][default_thread]['cores']
        else:
            rule_data[rule]['runtimes'] = [None] * len(sorted_dates)
            rule_data[rule]['memories'] = [None] * len(sorted_dates)
            rule_data[rule]['cores'] = [None] * len(sorted_dates)

    return {
        'dates': sorted_dates,
        'available_dates': available_dates,
        'rules': all_rules,
        'rule_data': rule_data
    }


def get_local_ip():
    """获取本机局域网IP地址"""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        try:
            hostname = socket.gethostname()
            ip = socket.gethostbyname(hostname)
            return ip
        except Exception:
            return "无法获取IP"


def refresh_parsed_projects(current_projects_data):
    """刷新解析后的项目数据"""
    global parsed_projects, project_list
    log("整理数据")
    parsed_projects = {}
    for project_id, project_data in current_projects_data.items():
        parsed_projects[project_id] = parse_project_data(project_data, project_id)
        parsed_projects[project_id]['project_name'] = project_data.get('project_name', project_id)
        parsed_projects[project_id]['description'] = project_data.get('description', '')
    
    project_list = [
        {'id': pid, 'name': info['project_name'], 'description': info['description']}
        for pid, info in parsed_projects.items()
    ]


# ==================================================
# 路由
# ==================================================

@app.route('/')
def index():
    """主页：工具选择页面 - 卡片网格布局"""
    # 构建工具列表供前端渲染
    tools_list = []
    for tool_key, tool_info in CASE_CONFIG.items():
        tools_list.append({
            'id': tool_key,
            'name': tool_info.get('name', tool_key),
            'description': tool_info.get('description', ''),
            'icon': tool_info.get('icon', '🔧'),
            'has_single': 'single' in tool_info,
            'has_multi': 'multi' in tool_info
        })
    
    return render_template('main.html', tools=tools_list)


@app.route('/tool/<tool_id>')
def tool_page(tool_id):
    """工具主页面 - 带侧边栏的监控页面"""
    if tool_id not in CASE_CONFIG:
        return "工具不存在", 404
    
    tool_info = CASE_CONFIG[tool_id]
    
    # 获取项目数据（优先使用缓存）
    cache_key = f"{tool_id}_single_projects_data"
    cached = data_cache.get(cache_key)
    
    if cached and (time.time() - cached.get('timestamp', 0) < CONFIG['cache_ttl']):
        current_projects_data = cached['projects_data']
        refresh_parsed_projects(current_projects_data)
        log("使用缓存数据")
    else:
        config = tool_info.get('single', {})
        projects_data = get_json_data(tool_id, config.get('original_path', ''), config.get('json_path', ''))
        current_projects_data = projects_data.copy()
        refresh_parsed_projects(current_projects_data)
        
        if CONFIG['cache_enabled']:
            data_cache.set(cache_key, {
                'projects_data': current_projects_data,
                'timestamp': time.time()
            })
    
    # 准备前端数据
    projects_data_json = {}
    for pid, info in parsed_projects.items():
        projects_data_json[pid] = {
            'dates': info['dates'],
            'available_dates': info.get('available_dates', info['dates']),
            'rules': info['rules'],
            'rule_data': info['rule_data'],
            'project_name': info['project_name'],
            'description': info['description']
        }
    
    # 获取性能数据（MR更新信息）
    config = tool_info.get('single', {})
    perf = get_perf(config.get('mem', ''), config.get('cpu', ''))
    
    return render_template(
        'tool.html',
        tool_id=tool_id,
        tool_name=tool_info.get('name', tool_id),
        tool_icon=tool_info.get('icon', '🔧'),
        has_single=tool_info.get('has_single', True),
        has_multi=tool_info.get('has_multi', True),
        project_list=project_list,
        projects_data_json=projects_data_json,
        perf=perf
    )


@app.route('/api/refresh', methods=['POST'])
def api_refresh():
    """刷新数据API接口 - 优化版"""
    log("刷新数据中...")
    global CASE_CONFIG
    try:
        CASE_CONFIG = load_json(r'C:\Users\xbzhong\Desktop\lint\script\monitor\develop\monitor\new_code\data\config\tool_config.json')

        data = request.get_json()
        tool = data.get('tool', 'elint')
        mode = data.get('mode', 'single')  # single 或 multi
        
        # 获取配置
        config = CASE_CONFIG.get(tool, {}).get(mode, {})
        
        # 检查数据是否有变化（使用版本管理器）
        if version_manager.check_changes(config):
            # 数据有变化，清除缓存并重新获取
            cache_key = f"{tool}_{mode}_projects_data"
            data_cache.invalidate(cache_key)
            
            projects_data = get_json_data(tool, config.get('original_path', ''), config.get('json_path', ''))
            
            # 更新全局变量
            global current_projects_data, parsed_projects, project_list
            current_projects_data = projects_data.copy()
            refresh_parsed_projects(current_projects_data)
            
            # 更新缓存
            if CONFIG['cache_enabled']:
                data_cache.set(cache_key, {
                    'projects_data': current_projects_data,
                    'parsed_projects': parsed_projects,
                    'project_list': project_list,
                    'timestamp': time.time()
                })
        else:
            # 数据无变化，尝试从缓存获取
            cache_key = f"{tool}_{mode}_projects_data"
            cached = data_cache.get(cache_key)
            
            if cached and (time.time() - cached.get('timestamp', 0) < CONFIG['cache_ttl']):
                current_projects_data = cached['projects_data']
                parsed_projects = cached['parsed_projects']
                project_list = cached['project_list']
                log("使用缓存数据")
            else:
                # 缓存过期，重新获取
                projects_data = get_json_data(tool, config.get('original_path', ''), config.get('json_path', ''))
                current_projects_data = projects_data.copy()
                refresh_parsed_projects(current_projects_data)
                
                if CONFIG['cache_enabled']:
                    data_cache.set(cache_key, {
                        'projects_data': current_projects_data,
                        'parsed_projects': parsed_projects,
                        'project_list': project_list,
                        'timestamp': time.time()
                    })
        
        # 获取性能数据
        perf = get_perf(config.get('mem', ''), config.get('cpu', ''))
        
        # 构建返回数据
        projects_data_json = {}
        for pid, info in parsed_projects.items():
            projects_data_json[pid] = {
                'dates': info['dates'],
                'rules': info['rules'],
                'rule_data': info['rule_data'],
                'project_name': info['project_name'],
                'description': info['description']
            }
        
        last_update = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        
        return jsonify({
            'success': True,
            'data': projects_data_json,
            'project_list': project_list,
            'last_update': last_update,
            'message': '数据刷新成功',
            'perf': perf,
            'version': version_manager.get_data_signature(config)
        })
    except Exception as e:
        log(f"刷新失败: {e}")
        return jsonify({'success': False, 'message': str(e)}), 500


@app.route('/api/check_update', methods=['POST'])
def api_check_update():
    """检查数据是否有更新（轻量级）"""
    try:
        data = request.get_json()
        tool = data.get('tool', 'elint')
        mode = data.get('mode', 'single')
        current_version = data.get('version', '')
        
        config = CASE_CONFIG.get(tool, {}).get(mode, {})
        new_version = version_manager.get_data_signature(config)
        
        has_update = (new_version != current_version)
        
        return jsonify({
            'has_update': has_update,
            'version': new_version,
            'message': '有数据更新' if has_update else '数据已是最新'
        })
    except Exception as e:
        return jsonify({'has_update': False, 'error': str(e)}), 500


@app.route('/api/multi_thread_data', methods=['POST'])
def api_multi_thread_data():
    """获取多线程对比数据 - 返回指定阶段所有线程的性能数据"""
    try:
        data = request.get_json()
        project_id = data.get('project_id')
        rule_name = data.get('rule_name')
        date = data.get('date')  # 可选，如果不指定则使用最新日期
        
        if project_id not in parsed_projects:
            return jsonify({'success': False, 'error': '项目不存在'}), 404
        
        project_info = parsed_projects[project_id]
        rule_info = project_info['rule_data'].get(rule_name, {})
        
        if not rule_info:
            return jsonify({'success': False, 'error': '阶段不存在'}), 404
        
        # 确定使用的日期
        dates = rule_info.get('dates', [])
        if not dates:
            return jsonify({'success': False, 'error': '无数据'}), 404
        
        target_date = date if date else dates[-1]
        
        # 查找日期索引
        try:
            date_idx = dates.index(target_date)
        except ValueError:
            return jsonify({'success': False, 'error': f'日期 {target_date} 无数据'}), 404
        
        # 收集所有线程的数据
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
        
        # 按线程数排序
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


# app.py 中的 API 路由（修改后）

@app.route('/api/compare', methods=['POST'])
def api_compare():
    """数据对比API - 支持单阶段和全阶段对比"""
    try:
        data = request.get_json()
        project_id = data.get('project_id')
        rule_name = data.get('rule_name', 'all')
        date1 = data.get('date1')
        date2 = data.get('date2')
        tolerance_runtime = float(data.get('tolerance_runtime', 0))
        tolerance_memory = float(data.get('tolerance_memory', 0))
        tolerance_mode = data.get('tolerance_mode', 'absolute')
        compare_dimension = data.get('compare_dimension', 'both')
        save_config = data.get('save_config', True)  # 是否保存配置
        
        log(f"对比请求: project_id={project_id}, rule_name={rule_name}, date1={date1}, date2={date2}")
        
        # 获取项目数据
        if project_id not in parsed_projects:
            return jsonify({'success': False, 'error': '项目不存在'}), 404
        
        project_info = parsed_projects[project_id]
        
        # 构建两天的完整项目数据
        def build_day_data(date):
            """构建单天的完整项目数据（包含所有阶段）"""
            day_data = {
                'dates': [date],
                'rules': project_info['rules'],
                'rule_data': {}
            }
            
            for rule, rule_info in project_info['rule_data'].items():
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
        
        # 执行对比
        compare_result = comparator.compare_data(
            data1, data2, project_id, rule_name,
            tolerance_runtime, tolerance_memory,
            tolerance_mode=tolerance_mode,
            compare_dimension=compare_dimension
        )
        
        compare_result['tolerance_mode'] = tolerance_mode
        compare_result['compare_dimension'] = compare_dimension

        # 保存配置（只保存项目的 runtime 和 memory 容差）
        if save_config:
            log(f"准备保存配置: project_id={project_id}")
            update_compare_config(project_id, {
                'tolerance_runtime': tolerance_runtime,
                'tolerance_memory': tolerance_memory
            })
            log("配置保存完成")
        
        return jsonify({
            'success': True,
            'result': compare_result
        })
    except Exception as e:
        log(f"对比失败: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/compare_config', methods=['GET', 'POST', 'DELETE'])
def api_compare_config():
    """
    获取、保存或删除对比配置
    
    GET: 获取指定项目的配置
        参数: project_id
    POST: 保存配置
        参数: project_id, config (包含 tolerance_runtime, tolerance_memory)
    DELETE: 删除配置
        参数: project_id
    """
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
    """导出对比结果到CSV"""
    try:
        data = request.get_json()
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
def download_file(filename):
    """下载文件"""
    return send_from_directory(comparator.export_dir, filename, as_attachment=True)


@app.route('/api/get_dates', methods=['POST'])
def api_get_dates():
    """获取项目可用的日期列表"""
    try:
        data = request.get_json()
        project_id = data.get('project_id')
        
        if project_id not in parsed_projects:
            return jsonify({'success': False, 'error': '项目不存在'}), 404
        
        dates = parsed_projects[project_id]['dates']
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
    return jsonify(project_list)


@app.route('/api/project/<project_id>')
def api_project_data(project_id):
    """获取单个项目数据"""
    if project_id not in parsed_projects:
        return jsonify({'error': 'Project not found'}), 404
    
    info = parsed_projects[project_id]
    return jsonify({
        'project_name': info['project_name'],
        'description': info['description'],
        'dates': info['dates'],
        'available_dates': info.get('available_dates', info['dates']),
        'rules': info['rules'],
        'rule_data': info['rule_data']
    })


@app.route('/lint_perf/<path:filename>')
def serve_lint_perf(filename):
    """提供性能数据文件"""
    return send_from_directory('/share/jcheng/lint_perf', filename)


@app.errorhandler(404)
def page_not_found(e):
    """404错误处理"""
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


def open_browser():
    """自动打开浏览器"""
    if CONFIG['auto_open_browser']:
        time.sleep(1.5)
        webbrowser.open_new(f"http://127.0.0.1:{CONFIG['port']}")


# 全局变量
current_projects_data = {}
parsed_projects = {}
project_list = []


if __name__ == '__main__':
    local_ip = get_local_ip()
    log(f"启动服务器: http://{local_ip}:{CONFIG['port']}")
    log(f"本地访问: http://127.0.0.1:{CONFIG['port']}")
    
    if CONFIG['auto_open_browser']:
        threading.Thread(target=open_browser, daemon=True).start()
    
    app.run(host=CONFIG['host'], port=CONFIG['port'], debug=CONFIG['debug'], use_reloader=False)