"""
Modern ELINT/ECDC 性能监控平台
 - 使用 Flask 提供 REST API
 - 支持多项目多线程模式切换
 - 支持项目数据自动获取、结果缓存与页面刷新
 - 使用标准 JSON 数据与 CSV 数据格式输出
"""

from flask import Flask, render_template, request, jsonify, send_from_directory, redirect
from flask_cors import CORS
import webbrowser
import threading
import socket
import time
import json
from datetime import datetime
from pathlib import Path

from common import log
from elint import get_json_data, get_perf
from data_cache import data_cache, version_manager
from compare import comparator

app = Flask(__name__, template_folder="templates", static_folder="static")
CORS(app)

CONFIG = {
    'host': '0.0.0.0',
    'port': 6060,
    'debug': True,
    'auto_open_browser': False,
    'cache_enabled': True,
    'cache_ttl': 300
}

CASE_CONFIG = {
    'elint': {
        'description': '静态结果分析',
        'thread': {
            'single': {
                'original_path': './data/original',
                'json_path': './data/total.json',
                'mem': './data/lint_mem.csv',
                'cpu': './data/lint_cpu.csv'
            },
            'multi': {
                'original_path': './data/original',
                'json_path': './data/total.json',
                'mem': './data/lint_mem.csv',
                'cpu': './data/lint_cpu.csv'
            }
        }
    },
    'ecdc': {
        'description': '实时性能校验',
        'thread': {
            'single': {
                'original_path': './data/original',
                'json_path': './data/total.json',
                'mem': './data/lint_mem.csv',
                'cpu': './data/lint_cpu.csv'
            }
        }
    }
}

COMPARE_CONFIG_FILE = Path('./static/uploads/compare_config.json')
COMPARE_CONFIG_FILE.parent.mkdir(parents=True, exist_ok=True)

STATE = {
    'current_config': None,
    'current_projects_data': {},
    'parsed_projects': {},
    'project_list': []
}


def load_compare_config():
    if not COMPARE_CONFIG_FILE.exists():
        return {}
    try:
        with open(COMPARE_CONFIG_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception:
        return {}


def save_compare_config(config_data):
    try:
        with open(COMPARE_CONFIG_FILE, 'w', encoding='utf-8') as f:
            json.dump(config_data, f, ensure_ascii=False, indent=4)
    except Exception as e:
        log(f"保存配置失败: {e}")


def get_compare_config(project_id: str):
    configs = load_compare_config()
    return configs.get(project_id, {})


def update_compare_config(project_id: str, config: dict):
    configs = load_compare_config()
    configs[project_id] = config
    save_compare_config(configs)


def normalize_thread_key(cores):
    try:
        return str(int(cores))
    except Exception:
        return '0'


def parse_project_data(project_data, project_id):
    if 'daily_metrics' in project_data:
        daily_metrics = project_data['daily_metrics']
    else:
        daily_metrics = project_data

    all_rules = set()
    for date, tools_dict in daily_metrics.items():
        if isinstance(tools_dict, dict):
            all_rules.update(tools_dict.keys())
    all_rules = sorted(list(all_rules))

    sorted_dates = sorted(daily_metrics.keys())
    available_dates = sorted(set(project_data.get('available_dates', sorted_dates)))

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

        thread_counts = sorted(
            [int(k) for k in rule_data[rule]['thread_metrics'].keys() if k is not None and k != ''],
            key=lambda x: x
        )
        thread_counts = [str(x) for x in thread_counts]
        rule_data[rule]['thread_counts'] = thread_counts

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
            return "127.0.0.1"


def refresh_parsed_projects(current_projects_data):
    STATE['parsed_projects'] = {}
    for project_id, project_data in current_projects_data.items():
        parsed = parse_project_data(project_data, project_id)
        parsed['project_name'] = project_data.get('project_name', project_id)
        parsed['description'] = project_data.get('description', '')
        STATE['parsed_projects'][project_id] = parsed

    STATE['project_list'] = [
        {'id': pid, 'name': info['project_name'], 'description': info['description']}
        for pid, info in STATE['parsed_projects'].items()
    ]


def ensure_data_loaded():
    if not STATE['parsed_projects']:
        load_project_data('elint', 'single')


def load_project_data(tool='elint', thread='single'):
    tool = tool.lower()
    thread = thread.lower()
    if tool not in CASE_CONFIG:
        raise ValueError('无效项目数据')
    if thread not in CASE_CONFIG[tool]['thread']:
        raise ValueError('无效线程模式')

    config = CASE_CONFIG[tool]['thread'][thread]
    cache_key = f"{tool}_{thread}_projects_data"

    if CONFIG['cache_enabled']:
        cached = data_cache.get(cache_key)
        if cached and (time.time() - cached.get('timestamp', 0) < CONFIG['cache_ttl']):
            STATE['current_projects_data'] = cached['projects_data']
            STATE['parsed_projects'] = cached['parsed_projects']
            STATE['project_list'] = cached['project_list']
            STATE['current_config'] = {'tool': tool, 'thread': thread, 'config': config}
            return config

    projects_data = get_json_data(tool, config.get('original_path', ''), config.get('json_path', ''))
    STATE['current_projects_data'] = projects_data.copy()
    refresh_parsed_projects(projects_data)
    STATE['current_config'] = {'tool': tool, 'thread': thread, 'config': config}

    if CONFIG['cache_enabled']:
        data_cache.set(cache_key, {
            'projects_data': STATE['current_projects_data'],
            'parsed_projects': STATE['parsed_projects'],
            'project_list': STATE['project_list'],
            'timestamp': time.time()
        })

    return config


@app.route('/')
def index():
    tools = list(CASE_CONFIG.keys())
    tool_config = {}
    for tool, info in CASE_CONFIG.items():
        threads = {
            key: ('单线程' if key == 'single' else '多线程')
            for key in info['thread'].keys()
        }
        tool_config[tool] = {
            'description': info.get('description', ''),
            'threads': threads
        }
    return render_template('main.html', tools=tools, tool_config=tool_config, page_id='home')


@app.route('/elint')
def elint_page():
    ensure_data_loaded()
    projects_data_json = {
        pid: {
            'dates': info['dates'],
            'available_dates': info.get('available_dates', info['dates']),
            'rules': info['rules'],
            'rule_data': info['rule_data'],
            'project_name': info['project_name'],
            'description': info['description']
        }
        for pid, info in STATE['parsed_projects'].items()
    }
    perf = get_perf(
        STATE['current_config']['config'].get('mem', ''),
        STATE['current_config']['config'].get('cpu', '')
    ) if STATE['current_config'] else {}

    return render_template(
        'elint.html',
        project_list=STATE['project_list'],
        projects_data_json=projects_data_json,
        perf=perf,
        active_tool=STATE['current_config']['tool'] if STATE['current_config'] else 'elint',
        active_thread=STATE['current_config']['thread'] if STATE['current_config'] else 'single',
        page_id='monitor'
    )


@app.route('/compare')
def compare_page():
    ensure_data_loaded()
    return render_template('compare.html', page_id='compare')


@app.route('/api/projects')
def api_projects():
    ensure_data_loaded()
    return jsonify(STATE['project_list'])


@app.route('/api/project/<project_id>')
def api_project_data(project_id):
    ensure_data_loaded()
    if project_id not in STATE['parsed_projects']:
        return jsonify({'error': 'Project not found'}), 404
    info = STATE['parsed_projects'][project_id]
    return jsonify({
        'project_name': info['project_name'],
        'description': info['description'],
        'dates': info['dates'],
        'available_dates': info.get('available_dates', info['dates']),
        'rules': info['rules'],
        'rule_data': info['rule_data']
    })


@app.route('/api/get_dates', methods=['POST'])
def api_get_dates():
    data = request.get_json() or {}
    project_id = data.get('project_id')
    ensure_data_loaded()
    if project_id not in STATE['parsed_projects']:
        return jsonify({'success': False, 'error': '项目不存在'}), 404
    dates = STATE['parsed_projects'][project_id]['dates']
    available_dates = STATE['parsed_projects'][project_id].get('available_dates', dates)
    return jsonify({'success': True, 'dates': dates, 'available_dates': available_dates})


@app.route('/api/config', methods=['POST'])
def api_config():
    data = request.get_json() or {}
    tool = data.get('tool', 'elint').lower()
    thread = data.get('thread', 'single').lower()
    try:
        config = load_project_data(tool, thread)
        version = version_manager.get_data_signature(config)
        return jsonify({
            'success': True,
            'tool': tool,
            'thread': thread,
            'version': version,
            'target_page': '/elint'
        })
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 400


@app.route('/api/refresh', methods=['POST'])
def api_refresh():
    data = request.get_json() or {}
    tool = data.get('tool', STATE['current_config']['tool'] if STATE['current_config'] else 'elint')
    thread = data.get('thread', STATE['current_config']['thread'] if STATE['current_config'] else 'single')
    try:
        config = CASE_CONFIG[tool]['thread'][thread]
        cache_key = f"{tool}_{thread}_projects_data"

        if version_manager.check_changes(config):
            data_cache.invalidate(cache_key)

        cached = data_cache.get(cache_key) if CONFIG['cache_enabled'] else None

        if cached and (time.time() - cached.get('timestamp', 0) < CONFIG['cache_ttl']):
            STATE['current_projects_data'] = cached['projects_data']
            STATE['parsed_projects'] = cached['parsed_projects']
            STATE['project_list'] = cached['project_list']
            STATE['current_config'] = {'tool': tool, 'thread': thread, 'config': config}
        else:
            projects_data = get_json_data(tool, config.get('original_path', ''), config.get('json_path', ''))
            STATE['current_projects_data'] = projects_data.copy()
            refresh_parsed_projects(projects_data)
            STATE['current_config'] = {'tool': tool, 'thread': thread, 'config': config}
            if CONFIG['cache_enabled']:
                data_cache.set(cache_key, {
                    'projects_data': STATE['current_projects_data'],
                    'parsed_projects': STATE['parsed_projects'],
                    'project_list': STATE['project_list'],
                    'timestamp': time.time()
                })

        perf = get_perf(config.get('mem', ''), config.get('cpu', ''))
        projects_data_json = {
            pid: {
                'dates': info['dates'],
                'available_dates': info.get('available_dates', info['dates']),
                'rules': info['rules'],
                'rule_data': info['rule_data'],
                'project_name': info['project_name'],
                'description': info['description']
            }
            for pid, info in STATE['parsed_projects'].items()
        }

        return jsonify({
            'success': True,
            'data': projects_data_json,
            'project_list': STATE['project_list'],
            'last_update': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
            'message': '刷新成功',
            'perf': perf,
            'version': version_manager.get_data_signature(config)
        })
    except Exception as e:
        log(f"刷新失败: {e}")
        return jsonify({'success': False, 'message': str(e)}), 500


@app.route('/api/check_update', methods=['POST'])
def api_check_update():
    data = request.get_json() or {}
    tool = data.get('tool', STATE['current_config']['tool'] if STATE['current_config'] else 'elint')
    thread = data.get('thread', STATE['current_config']['thread'] if STATE['current_config'] else 'single')
    current_version = data.get('version', '')
    try:
        config = CASE_CONFIG[tool]['thread'][thread]
        new_version = version_manager.get_data_signature(config)
        has_update = (new_version != current_version)
        return jsonify({
            'has_update': has_update,
            'version': new_version,
            'message': '检测到更新' if has_update else '没有更新'
        })
    except Exception as e:
        return jsonify({'has_update': False, 'error': str(e)}), 500


@app.route('/api/compare', methods=['POST'])
def api_compare():
    data = request.get_json() or {}
    project_id = data.get('project_id')
    rule_name = data.get('rule_name', 'all')
    date1 = data.get('date1')
    date2 = data.get('date2')
    tolerance_runtime = float(data.get('tolerance_runtime', 0) or 0)
    tolerance_memory = float(data.get('tolerance_memory', 0) or 0)
    tolerance_mode = data.get('tolerance_mode', 'absolute')

    if not project_id or project_id not in STATE['parsed_projects']:
        return jsonify({'success': False, 'error': '项目不存在'}), 404
    if not date1 or not date2:
        return jsonify({'success': False, 'error': '请先选择对比日期'}), 400

    try:
        project_info = STATE['parsed_projects'][project_id]

        def build_day_data(date):
            day_data = {'dates': [date], 'rules': project_info['rules'], 'rule_data': {}}
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
        compare_result = comparator.compare_data(
            data1, data2, project_id, rule_name,
            tolerance_runtime, tolerance_memory,
            tolerance_mode=tolerance_mode
        )
        compare_result['tolerance_mode'] = tolerance_mode

        update_compare_config(project_id, {
            'project_id': project_id,
            'rule_name': rule_name,
            'date1': date1,
            'date2': date2,
            'tolerance_runtime': tolerance_runtime,
            'tolerance_memory': tolerance_memory,
            'tolerance_mode': tolerance_mode,
            'timestamp': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
            'summary': compare_result.get('summary', {})
        })

        return jsonify({'success': True, 'result': compare_result})
    except Exception as e:
        log(f"比较失败: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/compare_config', methods=['GET', 'POST'])
def api_compare_config():
    if request.method == 'GET':
        project_id = request.args.get('project_id', '')
        if not project_id:
            return jsonify({'success': False, 'error': 'project_id 参数校验失败'}), 400
        return jsonify({'success': True, 'config': get_compare_config(project_id)})
    data = request.get_json() or {}
    project_id = data.get('project_id')
    if not project_id:
        return jsonify({'success': False, 'error': 'project_id 参数校验失败'}), 400
    update_compare_config(project_id, data)
    return jsonify({'success': True, 'message': '保存配置成功'})


@app.route('/api/export_compare', methods=['POST'])
def api_export_compare():
    data = request.get_json() or {}
    compare_result = data.get('result')
    filename = data.get('filename')
    if not compare_result:
        return jsonify({'success': False, 'error': '没有对比结果'}), 400
    filepath = comparator.export_to_csv(compare_result, filename)
    return jsonify({
        'success': True,
        'filepath': filepath,
        'filename': Path(filepath).name,
        'download_url': f'/download/{Path(filepath).name}'
    })


@app.route('/download/<filename>')
def download_file(filename):
    return send_from_directory(comparator.export_dir, filename, as_attachment=True)


@app.errorhandler(404)
def page_not_found(e):
    return render_template('404.html', page_id='404'), 404


def open_browser():
    if CONFIG['auto_open_browser']:
        time.sleep(1.5)
        webbrowser.open_new(f"http://127.0.0.1:{CONFIG['port']}")


if __name__ == '__main__':
    local_ip = get_local_ip()
    log(f"本地服务地址: http://{local_ip}:{CONFIG['port']}")
    log(f"页面访问地址: http://127.0.0.1:{CONFIG['port']}")
    if CONFIG['auto_open_browser']:
        threading.Thread(target=open_browser, daemon=True).start()
    app.run(host=CONFIG['host'], port=CONFIG['port'], debug=CONFIG['debug'], use_reloader=False)
