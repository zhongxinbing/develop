"""
==================================================
多项目多阶段EDA流程监控系统 - 使用ECharts绘图
支持: 日期 -> 阶段 -> runtime/memory/cores 三层数据结构
阶段选择使用下拉菜单，支持大量阶段（200+）
数据刷新: 点击按钮从API获取最新数据
外部访问: 支持局域网和公网访问
绘图方式: ECharts (功能强大的交互式图表库)
优化版本：支持大量阶段，性能优化
==================================================
"""

from flask import Flask, render_template, request, jsonify, send_from_directory
import webbrowser
import threading
import time
import random
import socket
from datetime import datetime, timedelta
from common import *

import json
from elint import *
app = Flask(__name__)

# ==================================================
# 配置选项 - 修改这里控制访问权限
# ==================================================
CONFIG = {
    'host': '0.0.0.0',    # 保持 0.0.0.0 允许外部访问
    'port': 6060,          # 端口号
    'debug': True,
    'auto_open_browser': False
}
# 配置数据映射
CASE_CONFIG = {
    'elint': {
        'single': {
            'original_path': 'C:\\Users\\xbzhong\\Desktop\\lint\\script\\monitor\\develop\\python\\monitor\\data',
            'json_path': 'C:\\Users\\xbzhong\\Desktop\\lint\\script\\monitor\\develop\\python\\monitor\\data\\total.json'
        },
        'multi': {
            'original_path': '/mnt/efs/fs1/jenkins/lint_comparison_results_qor',
            'json_path': '/mnt/efs/fs1/reg_test_data/CN/lint/pv/other/monitor/json/elint/multi'
        }
    }
}


# ==================================================
# 多项目数据结构 - 生成大量测试数据（每个日期200+阶段）
# ==================================================

def parse_project_data(project_data,project_id):
    """
    解析项目数据，支持三层结构：日期 -> 阶段 -> 指标
    
    返回:
        dates: 日期列表
        rules: 所有阶段名称列表（已排序）
        rule_data: {tool_name: {'dates': [], 'runtimes': [], 'memories': [], 'cores': []}}
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

    # 为每个阶段构建数据
    rule_data = {}
    for rule in all_rules:
        rule_data[rule] = {
            'dates': [],
            'runtimes': [],
            'memories': [],
            'cores': []
        }
        for date in sorted_dates:
            if date in daily_metrics and rule in daily_metrics[date]:
                rule_info = daily_metrics[date][rule]
                rule_data[rule]['dates'].append(date)
                rule_data[rule]['runtimes'].append(rule_info.get('runtime', 0))
                rule_data[rule]['memories'].append(rule_info.get('memory', 0))
                rule_data[rule]['cores'].append(rule_info.get('cores', 1))
            else:
                rule_data[rule]['dates'].append(date)
                rule_data[rule]['runtimes'].append(None)
                rule_data[rule]['memories'].append(None)
                rule_data[rule]['cores'].append(None)
    
    return {
        'dates': sorted_dates,
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
    print("整理数据")
    parsed_projects = {}
    for project_id, project_data in current_projects_data.items():

        parsed_projects[project_id] = parse_project_data(project_data,project_id)
        parsed_projects[project_id]['project_name'] = project_data.get('project_name', project_id)
        parsed_projects[project_id]['description'] = project_data.get('description', '')
    
    project_list = [
        {'id': pid, 'name': info['project_name'], 'description': info['description']}
        for pid, info in parsed_projects.items()
    ]

@app.route('/')
def index():
    """主页：渲染曲线图页面"""
    tools = list(CASE_CONFIG.keys())
    tool_config = {}
    for tool in tools:
        threads = {}
        for thread in list(CASE_CONFIG[tool].keys()):
            if thread in "single":
                threads["single"] = "单线程"
            if thread in "multi":
                threads["multi"] = "多线程"
        tool_config[tool] = {
            "thread": threads
        }
    print(tool_config)
    return render_template('main.html',tool_config=tool_config,tools=tools)

@app.route('/elint_single')
def elint_single():
    """ELINT + 单线程"""
    """主页：渲染曲线图页面"""
    projects_data_json = {}
    for pid, info in parsed_projects.items():
        projects_data_json[pid] = {
            'dates': info['dates'],
            'rules': info['rules'],
            'rule_data': info['rule_data'],
            'project_name': info['project_name'],
            'description': info['description']
        }
    save_json("./project_list.json",project_list)
    save_json("./projects_data_json.json",projects_data_json)

    return render_template(
        'elint_single.html',
        project_list=project_list,
        projects_data_json=projects_data_json
    )

@app.route('/api/refresh', methods=['POST'])
def api_refresh():
    """刷新数据API接口"""
    global current_projects_data, parsed_projects, project_list, tool_config
    log("刷新数据中...")
    try:
        projects_data = get_json_data(tool_config.get("tool"),tool_config.get('original_path', 'N/A'),tool_config.get('json_path', 'N/A'))

        # 全局变量存储当前数据
        current_projects_data = projects_data.copy()
        parsed_projects = {}
        project_list = []
        refresh_parsed_projects(current_projects_data)
        
        # project_list, parsed_projects = get_data_main(tool_config.get('original_path', 'N/A'),tool_config.get('json_path', 'N/A'))


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
            'message': '数据刷新成功'
        })
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500

@app.route('/api/server-info')
def api_server_info():
    """获取服务器信息"""
    local_ip = get_local_ip()
    return jsonify({
        'local_ip': local_ip,
        'port': CONFIG['port'],
        'host': CONFIG['host']
    })

@app.route('/api/projects')
def api_projects():
    return jsonify(project_list)

@app.route('/api/project/<project_id>')
def api_project_data(project_id):
    if project_id not in parsed_projects:
        return jsonify({'error': 'Project not found'}), 404
    
    info = parsed_projects[project_id]
    return jsonify({
        'project_name': info['project_name'],
        'description': info['description'],
        'dates': info['dates'],
        'rules': info['rules'],
        'rule_data': info['rule_data']
    })

@app.route('/api/get_config', methods=['POST'])
def get_config():
    """获取配置数据API"""
    global current_projects_data, parsed_projects, project_list,tool_config
    try:
        data = request.get_json()
        tool = data.get('tool', '').lower()
        thread = data.get('thread', '').lower()
        
        # 验证参数
        if not tool or tool not in CASE_CONFIG.keys():
            return jsonify({'error': '无效的工具选择'}), 400
        
        if thread not in CASE_CONFIG[tool]:
            return jsonify({'error': '无效的线程模式'}), 400

        # 获取配置数据
        config = CASE_CONFIG.get(tool, {}).get(thread, {})
        
        # 获取当前工具的配置
        tool_config={
            "tool": tool,
            "thread": thread,
            "original_path": config.get('original_path', 'N/A'),
            "json_path": config.get('json_path', 'N/A')
        }
        log(tool_config)
        projects_data = get_json_data(tool,config.get('original_path', 'N/A'),config.get('json_path', 'N/A'))

        # 全局变量存储当前数据
        current_projects_data = projects_data.copy()
        parsed_projects = {}
        project_list = []
        refresh_parsed_projects(current_projects_data)

        # 打印日志
        print("=" * 50)
        print(f"[Python后端] 接收到请求:")
        print(f"  - 工具: {tool}")
        print(f"  - 线程模式: {thread}")
        print(f"  - 配置值: {config.get('original_path', 'N/A')}")
        print(f"  - 说明: {config.get('json_path', 'N/A')}")
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
        print(f"错误: {e}"[0:100])

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
    return send_from_directory('/share/jcheng/lint_perf', filename)

def open_browser():
    if CONFIG['auto_open_browser']:
        time.sleep(1.5)
        webbrowser.open_new(f"http://127.0.0.1:{CONFIG['port']}")

if __name__ == '__main__':
    
    local_ip = get_local_ip()
    if CONFIG['auto_open_browser']:
        threading.Thread(target=open_browser, daemon=True).start()
    
    app.run(host=CONFIG['host'], port=CONFIG['port'], debug=CONFIG['debug'], use_reloader=False)