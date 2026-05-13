"""
EDA流程性能监控系统 - 主应用
"""
from flask import Flask, render_template, request, jsonify, send_from_directory
import socket
import threading
import webbrowser
import time
from datetime import datetime
from pathlib import Path

from config import CONFIG, CASE_CONFIG
from data_manager import get_json_data, get_perf_data
from common import log

app = Flask(__name__)

# 全局变量
_parsed_projects = {}
_project_list = []
_current_tool_config = {}


def get_local_ip():
    """获取本机IP"""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        try:
            hostname = socket.gethostname()
            return socket.gethostbyname(hostname)
        except Exception:
            return "127.0.0.1"


def parse_project_data(project_data: dict, project_id: str) -> dict:
    """解析项目数据"""
    daily_metrics = project_data.get('daily_metrics', project_data)
    
    # 收集所有阶段名称
    all_rules = set()
    for date_data in daily_metrics.values():
        all_rules.update(date_data.keys())
    all_rules = sorted(list(all_rules))
    
    # 排序日期
    sorted_dates = sorted(daily_metrics.keys())
    
    # 为每个阶段构建数据
    rule_data = {}
    for rule in all_rules:
        rule_data[rule] = {
            'dates': [],
            'runtimes': [],
            'memories': []
        }
        for date in sorted_dates:
            if date in daily_metrics and rule in daily_metrics[date]:
                info = daily_metrics[date][rule]
                rule_data[rule]['dates'].append(date)
                rule_data[rule]['runtimes'].append(info.get('runtime', 0))
                rule_data[rule]['memories'].append(info.get('memory', 0))
            else:
                rule_data[rule]['dates'].append(date)
                rule_data[rule]['runtimes'].append(None)
                rule_data[rule]['memories'].append(None)
    
    return {
        'dates': sorted_dates,
        'rules': all_rules,
        'rule_data': rule_data,
        'project_name': project_data.get('project_name', project_id),
        'description': project_data.get('description', '')
    }


def refresh_all_data(tool: str, thread: str):
    """刷新所有数据"""
    global _parsed_projects, _project_list, _current_tool_config
    
    config = CASE_CONFIG.get(tool, {}).get(thread, {})
    if not config:
        log(f"无效的配置: tool={tool}, thread={thread}")
        return None
    
    _current_tool_config = {
        'tool': tool,
        'thread': thread,
        'original_path': config.get('original_path', ''),
        'json_path': config.get('json_path', '')
    }
    
    # 获取数据
    raw_data = get_json_data(tool, config.get('original_path', ''), config.get('json_path', ''))
    
    # 解析数据
    _parsed_projects = {}
    for pid, pdata in raw_data.items():
        _parsed_projects[pid] = parse_project_data(pdata, pid)
    
    _project_list = [
        {'id': pid, 'name': info['project_name'], 'description': info['description']}
        for pid, info in _parsed_projects.items()
    ]
    
    return {
        'projects': _parsed_projects,
        'project_list': _project_list
    }


@app.route('/')
def index():
    """主页"""
    tools = list(CASE_CONFIG.keys())
    tool_config = {}
    for tool in tools:
        threads = {}
        for thread in CASE_CONFIG[tool].keys():
            threads[thread] = "单线程" if thread == "single" else "多线程"
        tool_config[tool] = {"thread": threads}
    
    return render_template('main.html', tool_config=tool_config, tools=tools)


@app.route('/api/init', methods=['POST'])
def api_init():
    """初始化数据"""
    try:
        data = request.get_json()
        tool = data.get('tool', '').lower()
        thread = data.get('thread', '').lower()
        
        if not tool or tool not in CASE_CONFIG:
            return jsonify({'error': '无效的工具选择'}), 400
        
        if thread not in CASE_CONFIG[tool]:
            return jsonify({'error': '无效的线程模式'}), 400
        
        result = refresh_all_data(tool, thread)
        if result is None:
            return jsonify({'error': '数据加载失败'}), 500
        
        perf = get_perf_data(
            CASE_CONFIG[tool][thread].get('mem', ''),
            CASE_CONFIG[tool][thread].get('cpu', '')
        )
        
        projects_json = {}
        for pid, info in result['projects'].items():
            projects_json[pid] = {
                'dates': info['dates'],
                'rules': info['rules'],
                'rule_data': info['rule_data'],
                'project_name': info['project_name'],
                'description': info['description']
            }
        
        return jsonify({
            'success': True,
            'data': projects_json,
            'project_list': result['project_list'],
            'perf': perf,
            'last_update': datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        })
    except Exception as e:
        log(f"初始化失败: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/refresh', methods=['POST'])
def api_refresh():
    """刷新数据API"""
    try:
        config = _current_tool_config
        if not config:
            return jsonify({'success': False, 'error': '请先选择工具'}), 400
        
        result = refresh_all_data(config['tool'], config['thread'])
        
        perf = get_perf_data(
            CASE_CONFIG[config['tool']][config['thread']].get('mem', ''),
            CASE_CONFIG[config['tool']][config['thread']].get('cpu', '')
        )
        
        projects_json = {}
        for pid, info in result['projects'].items():
            projects_json[pid] = {
                'dates': info['dates'],
                'rules': info['rules'],
                'rule_data': info['rule_data'],
                'project_name': info['project_name'],
                'description': info['description']
            }
        
        return jsonify({
            'success': True,
            'data': projects_json,
            'project_list': result['project_list'],
            'perf': perf,
            'last_update': datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        })
    except Exception as e:
        log(f"刷新失败: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/compare', methods=['POST'])
def api_compare():
    """对比数据API"""
    try:
        data = request.get_json()
        project_id = data.get('project_id')
        date1 = data.get('date1')
        date2 = data.get('date2')
        runtime_tolerance = float(data.get('runtime_tolerance', 0))
        memory_tolerance = float(data.get('memory_tolerance', 0))
        
        if not project_id or not date1 or not date2:
            return jsonify({'error': '缺少必要参数'}), 400
        
        if project_id not in _parsed_projects:
            return jsonify({'error': '项目不存在'}), 404
        
        project = _parsed_projects[project_id]
        rules = project['rules']
        
        compare_results = []
        significant_diffs = []
        
        for rule in rules:
            rule_info = project['rule_data'][rule]
            
            # 查找两个日期的索引
            idx1 = -1
            idx2 = -1
            for i, d in enumerate(rule_info['dates']):
                if d == date1:
                    idx1 = i
                if d == date2:
                    idx2 = i
            
            runtime1 = rule_info['runtimes'][idx1] if idx1 >= 0 else None
            runtime2 = rule_info['runtimes'][idx2] if idx2 >= 0 else None
            memory1 = rule_info['memories'][idx1] if idx1 >= 0 else None
            memory2 = rule_info['memories'][idx2] if idx2 >= 0 else None
            
            # 计算差异
            runtime_diff = None
            memory_diff = None
            runtime_diff_pct = None
            memory_diff_pct = None
            is_significant = False
            
            if runtime1 is not None and runtime2 is not None:
                runtime_diff = round(runtime2 - runtime1, 2)
                if runtime1 != 0:
                    runtime_diff_pct = round((runtime_diff / runtime1) * 100, 2)
                if abs(runtime_diff) > runtime_tolerance:
                    is_significant = True
            
            if memory1 is not None and memory2 is not None:
                memory_diff = round(memory2 - memory1, 2)
                if memory1 != 0:
                    memory_diff_pct = round((memory_diff / memory1) * 100, 2)
                if abs(memory_diff) > memory_tolerance:
                    is_significant = True
            
            compare_results.append({
                'rule': rule,
                'runtime1': runtime1,
                'runtime2': runtime2,
                'runtime_diff': runtime_diff,
                'runtime_diff_pct': runtime_diff_pct,
                'memory1': memory1,
                'memory2': memory2,
                'memory_diff': memory_diff,
                'memory_diff_pct': memory_diff_pct
            })
            
            if is_significant:
                significant_diffs.append({
                    'rule': rule,
                    'runtime_diff': runtime_diff,
                    'memory_diff': memory_diff
                })
        
        # 生成CSV内容
        csv_lines = ['Rule,Runtime_Date1,Runtime_Date2,Runtime_Diff,Runtime_Diff_%,Memory_Date1,Memory_Date2,Memory_Diff,Memory_Diff_%']
        for r in compare_results:
            csv_lines.append(f"{r['rule']},{r['runtime1']},{r['runtime2']},{r['runtime_diff']},{r['runtime_diff_pct']},{r['memory1']},{r['memory2']},{r['memory_diff']},{r['memory_diff_pct']}")
        
        csv_content = '\n'.join(csv_lines)
        
        return jsonify({
            'success': True,
            'results': compare_results,
            'significant_diffs': significant_diffs,
            'date1': date1,
            'date2': date2,
            'csv_content': csv_content
        })
    except Exception as e:
        log(f"对比失败: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/projects')
def api_projects():
    """获取项目列表"""
    return jsonify(_project_list)


@app.route('/api/dates/<project_id>')
def api_dates(project_id):
    """获取项目的可用日期"""
    if project_id not in _parsed_projects:
        return jsonify({'error': 'Project not found'}), 404
    
    return jsonify({
        'dates': _parsed_projects[project_id]['dates']
    })


@app.route('/api/server-info')
def api_server_info():
    """获取服务器信息"""
    return jsonify({
        'local_ip': get_local_ip(),
        'port': CONFIG['port']
    })


@app.route('/monitor')
def monitor_page():
    """监控页面"""
    return render_template('monitor.html')


@app.route('/compare')
def compare_page():
    """对比页面"""
    return render_template('compare.html')


@app.route('/static/<path:filename>')
def serve_static(filename):
    """静态文件服务"""
    return send_from_directory('static', filename)


def open_browser():
    """自动打开浏览器"""
    if CONFIG['auto_open_browser']:
        time.sleep(1.5)
        webbrowser.open(f"http://127.0.0.1:{CONFIG['port']}")


if __name__ == '__main__':
    local_ip = get_local_ip()
    log(f"服务器启动: http://{local_ip}:{CONFIG['port']}")
    log(f"本地访问: http://127.0.0.1:{CONFIG['port']}")
    
    if CONFIG['auto_open_browser']:
        threading.Thread(target=open_browser, daemon=True).start()
    
    app.run(
        host=CONFIG['host'],
        port=CONFIG['port'],
        debug=CONFIG['debug'],
        use_reloader=False
    )