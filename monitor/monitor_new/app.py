from flask import Flask, render_template, jsonify, request, redirect, url_for
import json
from pathlib import Path

app = Flask(__name__, template_folder='templates', static_folder='static')

BASE = Path(__file__).resolve().parent

def load_tool_config():
    cfg_path = BASE.joinpath('data', 'config', 'tool_config.json')
    if cfg_path.exists():
        return json.loads(cfg_path.read_text(encoding='utf-8'))
    return {}

def load_project_data(tool_id: str):
    data_path = BASE.joinpath('data', tool_id, 'data.json')
    if data_path.exists():
        return json.loads(data_path.read_text(encoding='utf-8'))
    return {}


def load_raw_tool_data(path_value: str) -> dict:
    if not path_value:
        return {}
    raw_path = BASE.joinpath(path_value)
    if raw_path.is_dir():
        candidate = raw_path.joinpath('data.json')
        if candidate.exists():
            return json.loads(candidate.read_text(encoding='utf-8'))
    elif raw_path.is_file():
        return json.loads(raw_path.read_text(encoding='utf-8'))
    return {}


def build_parsed_projects_from_raw(raw_data: dict) -> dict:
    parsed = {}
    if not isinstance(raw_data, dict):
        return parsed
    for project_id, project in raw_data.items():
        if not isinstance(project, dict) or 'daily_metrics' not in project:
            continue
        casename = project.get('casename', project_id)
        daily_metrics = project.get('daily_metrics', {})
        dates = sorted(daily_metrics.keys())
        rules = sorted({rule for metrics in daily_metrics.values() for rule in metrics.keys()})
        rule_data = {}
        for rule in rules:
            rule_dates = []
            thread_ids = sorted({tid for date in dates for tid in daily_metrics.get(date, {}).get(rule, {}).get('thread_metrics', {}).keys()}, key=lambda x: int(x) if x.isdigit() else x)
            thread_metrics = {tid: {'runtimes': [], 'memories': []} for tid in thread_ids}
            for date in dates:
                rule_dates.append(date)
                rule_metrics = daily_metrics.get(date, {}).get(rule, {}).get('thread_metrics', {})
                for tid in thread_ids:
                    values = rule_metrics.get(tid, {})
                    runtime = values.get('runtime')
                    memory = values.get('memory')
                    thread_metrics[tid]['runtimes'].append(runtime if runtime is not None else None)
                    thread_metrics[tid]['memories'].append(memory if memory is not None else None)
            rule_data[rule] = {
                'dates': rule_dates,
                'thread_metrics': thread_metrics
            }
        parsed[project_id] = {
            'project_name': casename,
            'dates': dates,
            'available_dates': dates,
            'rules': rules,
            'rule_data': rule_data
        }
    return parsed


def normalize_parsed(parsed_raw: dict) -> dict:
    """尝试将不同格式的数据规范为 parsed_projects 格式
    期望格式为 { project_id: { 'project_name': ..., 'dates': [], 'rules': [], 'rule_data': {...} } }
    如果文件本身就是按 project_id 顶层存放，直接返回。
    """
    if not parsed_raw:
        return {}
    # 如果包含 parsed_projects 键，返回其值
    if isinstance(parsed_raw, dict) and 'parsed_projects' in parsed_raw:
        return parsed_raw['parsed_projects']
    # 如果顶层看起来像 project mapping（value 为 dict 且包含 rule_data 或 daily_metrics），直接返回
    is_project_map = isinstance(parsed_raw, dict) and all(isinstance(v, dict) for v in parsed_raw.values())
    if is_project_map:
        for v in parsed_raw.values():
            if isinstance(v, dict) and ('rule_data' in v or 'daily_metrics' in v or 'dates' in v):
                return parsed_raw
    return {}


def get_parsed_projects(tool_id: str) -> dict:
    cfg = load_tool_config().get(tool_id, {})
    pd = load_project_data(tool_id)
    parsed = normalize_parsed(pd) if pd else {}
    if parsed:
        return parsed

    raw_data = {}
    if cfg.get('single_original_path'):
        raw_data = load_raw_tool_data(cfg.get('single_original_path'))
    if not raw_data and cfg.get('multi_original_path'):
        raw_data = load_raw_tool_data(cfg.get('multi_original_path'))
    if raw_data:
        return build_parsed_projects_from_raw(raw_data)
    return {}

@app.route('/')
def index():
    cfg = load_tool_config()
    if not cfg:
        return "请先在 data/config/tool_config.json 中配置工具"
    first_tool = next(iter(cfg.keys()), None)
    if first_tool:
        return redirect(url_for('tool_page', tool_id=first_tool))
    return "请先在 data/config/tool_config.json 中配置工具"

@app.route('/tool/<tool_id>')
def tool_page(tool_id):
    cfg = load_tool_config()
    tool = cfg.get(tool_id, {})
    if not tool:
        return "工具不存在", 404

    parsed_projects = get_parsed_projects(tool_id)

    project_list = [{'id': k, 'name': v.get('project_name', k)} for k, v in parsed_projects.items()]
    return render_template(
        'tool.html',
        tool_id=tool_id,
        tool_name=tool.get('name', tool_id),
        project_list=project_list,
        projects_data_json=parsed_projects,
        has_single=bool(tool.get('single_original_path')),
        has_multi=bool(tool.get('multi_original_path'))
    )

@app.route('/api/projects')
def api_projects():
    cfg = load_tool_config()
    # 返回所有工具下的项目列表（合并）
    result = {}
    for tool_id in cfg.keys():
        parsed = get_parsed_projects(tool_id)
        projects = [{'id': k, 'name': v.get('project_name', k)} for k, v in parsed.items()]
        result[tool_id] = projects
    return jsonify(result)

@app.route('/api/project/<tool_id>/<project_id>')
def api_project(tool_id, project_id):
    parsed = get_parsed_projects(tool_id)
    if project_id not in parsed:
        return jsonify({'error': 'project not found'}), 404
    return jsonify(parsed[project_id])


@app.route('/api/get_dates', methods=['POST'])
def api_get_dates():
    data = request.get_json() or {}
    tool = data.get('tool', 'elint')
    project_id = data.get('project_id')
    parsed = get_parsed_projects(tool)
    if project_id not in parsed:
        return jsonify({'success': False, 'error': 'project not found'}), 404
    info = parsed[project_id]
    return jsonify({'success': True, 'dates': info.get('dates', []), 'available_dates': info.get('available_dates', info.get('dates', []))})


@app.route('/api/multi_thread_data', methods=['POST'])
def api_multi_thread_data():
    data = request.get_json() or {}
    tool = data.get('tool', 'elint')
    project_id = data.get('project_id')
    rule_name = data.get('rule_name')
    date = data.get('date')

    parsed = get_parsed_projects(tool)
    if project_id not in parsed:
        return jsonify({'success': False, 'error': 'project not found'}), 404
    info = parsed[project_id]
    rule_data = info.get('rule_data', {}).get(rule_name)
    if not rule_data:
        return jsonify({'success': False, 'error': 'rule not found'}), 404
    dates = rule_data.get('dates', [])
    if not dates:
        return jsonify({'success': False, 'error': 'no dates'}), 404
    target = date or dates[-1]
    try:
        idx = dates.index(target)
    except ValueError:
        return jsonify({'success': False, 'error': 'date not exist'}), 404
    thread_metrics = rule_data.get('thread_metrics', {})
    threads_data = []
    for tk, tv in thread_metrics.items():
        runtime = None
        memory = None
        if 'runtimes' in tv and idx < len(tv['runtimes']):
            runtime = tv['runtimes'][idx]
        if 'memories' in tv and idx < len(tv['memories']):
            memory = tv['memories'][idx]
        if runtime is not None or memory is not None:
            threads_data.append({'threads': int(tk), 'runtime': runtime, 'memory': memory})
    threads_data.sort(key=lambda x: x['threads'])
    return jsonify({'success': True, 'project_id': project_id, 'rule_name': rule_name, 'date': target, 'available_dates': dates, 'threads_data': threads_data})

if __name__ == '__main__':
    app.run(debug=True, port=5001)
