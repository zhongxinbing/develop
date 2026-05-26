"""
==================================================
多项目多阶段EDA流程监控系统 - 优化版
支持: 日期 -> 阶段 -> runtime/memory/cores 三层数据结构
支持: 数据对比、自动刷新、MR更新高亮
==================================================
"""

from flask import Flask, render_template, request, jsonify, send_from_directory
from flask_cors import CORS
import webbrowser
import threading
import time
import socket
import json
from datetime import datetime
from pathlib import Path

from common import log
from elint import get_json_data, get_perf
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

# 配置数据映射
CASE_CONFIG = {
    'elint': {
        'single': {
            'original_path': '/home/xbzhong/develop/monitor/code_20260513/data/original',
            'json_path': './data/total.json',
            'mem': './data/lint_mem.csv',
            'cpu': './lint_cpu.csv'
        },
        'multi': {
            'original_path': '/mnt/efs/fs1/jenkins/lint_comparison_results_qor',
            'json_path': '/mnt/efs/fs1/reg_test_data/CN/lint/pv/other/monitor/json/elint/multi',
            'mem': './data/lint_mem.csv',
            'cpu': './data/lint_cpu.csv'
        }
    }
}

COMPARE_CONFIG_FILE = Path('./static/uploads/compare_config.json')
COMPARE_CONFIG_FILE.parent.mkdir(parents=True, exist_ok=True)


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
        log(f"保存对比配置失败: {e}")


def get_compare_config(project_id: str):
    configs = load_compare_config()
    return configs.get(project_id, {})


def update_compare_config(project_id: str, config: dict):
    configs = load_compare_config()
    configs[project_id] = config
    save_compare_config(configs)


# ==================================================
# 数据解析函数
# ==================================================

def normalize_thread_key(cores):
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

        thread_counts = sorted(
            [int(k) for k in rule_data[rule]['thread_metrics'].keys()],
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
    """主页：工具选择页面"""
    tools = list(CASE_CONFIG.keys())
    tool_config = {}
    for tool in tools:
        threads = {}
        for thread in list(CASE_CONFIG[tool].keys()):
            thread_name = "单线程" if thread == "single" else "多线程"
            threads[thread] = thread_name
        tool_config[tool] = {"thread": threads}
    
    return render_template('main.html', tool_config=tool_config, tools=tools)


@app.route('/elint_single')
def elint_single():
    """ELINT + 单线程监控页面"""
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
    
    perf = get_perf(CASE_CONFIG['elint']['single']['mem'], CASE_CONFIG['elint']['single']['cpu'])
    print("project_list:", project_list)
    return render_template(
        'elint_single.html',
        project_list=project_list,
        projects_data_json=projects_data_json,
        perf=perf
    )


@app.route('/elint_multi')
def elint_multi():
    """ELINT + 多线程监控页面"""
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

    perf = get_perf(CASE_CONFIG['elint']['multi']['mem'], CASE_CONFIG['elint']['multi']['cpu'])
    print(project_list)
    return render_template(
        'elint_single.html',
        project_list=project_list,
        projects_data_json=projects_data_json,
        perf=perf
    )


@app.route('/compare')
def compare_page():
    """对比页面"""
    return render_template('compare.html')


@app.route('/api/refresh', methods=['POST'])
def api_refresh():
    """刷新数据API接口 - 优化版"""
    log("刷新数据中...")
    try:
        data = request.get_json()
        tool = data.get('tool', 'elint')
        thread = data.get('thread', 'single')
        
        # 获取配置
        config = CASE_CONFIG.get(tool, {}).get(thread, {})
        
        # 检查数据是否有变化（使用版本管理器）
        if version_manager.check_changes(config):
            # 数据有变化，清除缓存并重新获取
            cache_key = f"{tool}_{thread}_projects_data"
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
            cache_key = f"{tool}_{thread}_projects_data"
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
        thread = data.get('thread', 'single')
        current_version = data.get('version', '')
        
        config = CASE_CONFIG.get(tool, {}).get(thread, {})
        new_version = version_manager.get_data_signature(config)
        
        has_update = (new_version != current_version)
        
        return jsonify({
            'has_update': has_update,
            'version': new_version,
            'message': '有数据更新' if has_update else '数据已是最新'
        })
    except Exception as e:
        return jsonify({'has_update': False, 'error': str(e)}), 500

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
        
        log(f"对比请求: project_id={project_id}, rule_name={rule_name}, date1={date1}, date2={date2}, mode={tolerance_mode}")
        
        # 获取项目数据
        if project_id not in parsed_projects:
            return jsonify({'success': False, 'error': '项目不存在'}), 404
        
        project_info = parsed_projects[project_id]
        log(f"项目信息: dates={project_info['dates'][:5]}..., rules_count={len(project_info['rules'])}")
        
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
                    log(f"  阶段 {rule} 在日期 {date} 有数据: runtime={rule_info['runtimes'][idx]}")
                except ValueError:
                    # 该日期没有这个阶段的数据
                    day_data['rule_data'][rule] = {
                        'dates': [date],
                        'runtimes': [None],
                        'memories': [None],
                        'cores': [None]
                    }
                    log(f"  阶段 {rule} 在日期 {date} 无数据")
            
            return day_data
        
        data1 = build_day_data(date1)
        data2 = build_day_data(date2)
        
        log(f"数据构建完成: data1 有 {len(data1['rule_data'])} 个阶段, data2 有 {len(data2['rule_data'])} 个阶段")
        
        # 执行对比
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
        
        log(f"对比完成: mode={compare_result.get('mode')}, rules_comparison数量={len(compare_result.get('rules_comparison', []))}")
        
        return jsonify({
            'success': True,
            'result': compare_result
        })
    except Exception as e:
        log(f"对比失败: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)}), 500
    
@app.route('/api/compare_config', methods=['GET', 'POST'])
def api_compare_config():
    """获取或保存上一次的对比配置"""
    try:
        if request.method == 'GET':
            project_id = request.args.get('project_id', '')
            if not project_id:
                return jsonify({'success': False, 'error': 'project_id 参数缺失'}), 400
            config = get_compare_config(project_id)
            return jsonify({'success': True, 'config': config})
        else:
            data = request.get_json() or {}
            project_id = data.get('project_id')
            if not project_id:
                return jsonify({'success': False, 'error': 'project_id 参数缺失'}), 400
            update_compare_config(project_id, data)
            return jsonify({'success': True, 'message': '配置保存成功'})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/thread_compare_structure', methods=['POST'])
def api_thread_compare_structure():
    """返回多线程对比的 JSON 结构示例"""
    try:
        data = request.get_json() or {}
        project_id = data.get('project_id')
        rule_name = data.get('rule_name')
        date1 = data.get('date1')
        date2 = data.get('date2')

        if not project_id or project_id not in parsed_projects:
            return jsonify({'success': False, 'error': '项目不存在或未加载'}), 404

        project_info = parsed_projects[project_id]
        if not rule_name:
            rule_name = project_info['rules'][0] if project_info['rules'] else None

        rule_data = project_info['rule_data'].get(rule_name, {})
        if not rule_data:
            return jsonify({'success': False, 'error': '指定阶段不存在'}), 400

        dates = [d for d in [date1, date2] if d]
        if not dates:
            dates = project_info.get('available_dates', project_info['dates'])[-2:]

        thread_map = {}
        for idx, date in enumerate(rule_data.get('dates', [])):
            cores = rule_data.get('cores', [])[idx]
            if cores is None:
                continue
            key = f"thread_{cores}"
            thread_map.setdefault(key, {'thread': key, 'runtime': {}, 'memory': {}})
            thread_map[key]['runtime'][date] = rule_data.get('runtimes', [])[idx]
            thread_map[key]['memory'][date] = rule_data.get('memories', [])[idx]

        series = []
        for thread_name, values in thread_map.items():
            series.append({
                'thread': thread_name,
                'runtime': [values['runtime'].get(d) for d in dates],
                'memory': [values['memory'].get(d) for d in dates]
            })

        return jsonify({
            'success': True,
            'project_id': project_id,
            'rule_name': rule_name,
            'dates': dates,
            'threads': list(thread_map.keys()),
            'series': series,
            'description': '多线程对比数据结构示例，适用于各线程之间的曲线对比'
        })
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
        
        # 返回文件下载链接
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


@app.route('/api/get_config', methods=['POST'])
def get_config():
    """获取配置数据API"""
    global current_projects_data, parsed_projects, project_list, tool_config
    try:
        data = request.get_json()
        tool = data.get('tool', '').lower()
        thread = data.get('thread', '').lower()
        
        if not tool or tool not in CASE_CONFIG.keys():
            return jsonify({'error': '无效的工具选择'}), 400
        
        if thread not in CASE_CONFIG[tool]:
            return jsonify({'error': '无效的线程模式'}), 400

        config = CASE_CONFIG.get(tool, {}).get(thread, {})
        tool_config = {
            "tool": tool,
            "thread": thread,
            "original_path": config.get('original_path', 'N/A'),
            "json_path": config.get('json_path', 'N/A')
        }
        
        log(tool_config)
        projects_data = get_json_data(tool, config.get('original_path', 'N/A'), config.get('json_path', 'N/A'))

        current_projects_data = projects_data.copy()
        refresh_parsed_projects(current_projects_data)

        print("=" * 50)
        print(f"[Python后端] 接收到请求:")
        print(f"  - 工具: {tool}")
        print(f"  - 线程模式: {thread}")
        print(f"  - 配置值: {config.get('original_path', 'N/A')}")
        print("=" * 50)
        
        return jsonify({
            'status': 'success',
            'tool': tool,
            'thread': thread,
            'original_path': config.get('original_path', ''),
            'json_path': config.get('json_path', ''),
            'target_page': f"/{tool}_{thread}"
        })
    except Exception as e:
        print(f"错误: {e}")


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


@app.route('/lint_perf/<path:filename>')
def serve_lint_perf(filename):
    """提供性能数据文件"""
    return send_from_directory('/share/jcheng/lint_perf', filename)


def open_browser():
    """自动打开浏览器"""
    if CONFIG['auto_open_browser']:
        time.sleep(1.5)
        webbrowser.open_new(f"http://127.0.0.1:{CONFIG['port']}")


# 全局变量
current_projects_data = {}
parsed_projects = {}
project_list = []
tool_config = {}


if __name__ == '__main__':
    local_ip = get_local_ip()
    log(f"启动服务器: http://{local_ip}:{CONFIG['port']}")
    log(f"本地访问: http://127.0.0.1:{CONFIG['port']}")
    
    if CONFIG['auto_open_browser']:
        threading.Thread(target=open_browser, daemon=True).start()
    
    app.run(host=CONFIG['host'], port=CONFIG['port'], debug=CONFIG['debug'], use_reloader=False)