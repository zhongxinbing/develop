"""
Flask主应用 - 性能监控平台后端
"""
import json
import uuid
from pathlib import Path
from datetime import datetime
from flask import Flask, render_template, request, jsonify, session

from config import SECRET_KEY
from utils.tool_manager import tool_manager
from utils.data_manager import data_manager
from utils.data_parser import data_parser


app = Flask(__name__)
app.secret_key = SECRET_KEY


def get_user_id() -> str:
    """获取或创建用户ID（用于数据隔离）"""
    if 'user_id' not in session:
        session['user_id'] = str(uuid.uuid4())
    return session['user_id']


@app.route('/')
def index():
    """主页面"""
    return render_template('index.html')


@app.route('/config')
def config_page():
    """配置页面"""
    return render_template('config.html')


@app.route('/tool/<tool_id>')
def tool_page(tool_id):
    """工具页面"""
    return render_template('tool.html', tool_id=tool_id)


# ==================== API 接口 ====================

@app.route('/api/tools', methods=['GET'])
def api_get_tools():
    """获取工具列表"""
    user_id = get_user_id()
    tools = tool_manager.get_tools(user_id)
    return jsonify({'success': True, 'data': tools})


@app.route('/api/tools', methods=['POST'])
def api_add_tool():
    """添加工具"""
    user_id = get_user_id()
    data = request.json
    
    tool_id = data.get('tool_id') or data.get('tool_name')
    if not tool_id:
        return jsonify({'success': False, 'error': '工具名称不能为空'})
    
    # 检查是否已存在
    existing = tool_manager.get_tool(user_id, tool_id)
    if existing:
        return jsonify({'success': False, 'error': '工具名称已存在'})
    
    tool_config = {
        'tool_name': data.get('tool_name'),
        'description': data.get('description', ''),
        'single_thread_path': data.get('single_thread_path', ''),
        'single_thread_func': data.get('single_thread_func', ''),
        'multi_thread_path': data.get('multi_thread_path', ''),
        'multi_thread_func': data.get('multi_thread_func', ''),
        'extra_display_path': data.get('extra_display_path', ''),
        'extra_display_func': data.get('extra_display_func', ''),
        'custom_curve_func': data.get('custom_curve_func', '')
    }
    
    success = tool_manager.add_tool(user_id, tool_id, tool_config)
    if success:
        return jsonify({'success': True, 'data': {'tool_id': tool_id}})
    return jsonify({'success': False, 'error': '添加失败'})


@app.route('/api/tools/<tool_id>', methods=['PUT'])
def api_update_tool(tool_id):
    """更新工具"""
    user_id = get_user_id()
    data = request.json
    
    tool_config = {
        'tool_name': data.get('tool_name', tool_id),
        'description': data.get('description', ''),
        'single_thread_path': data.get('single_thread_path', ''),
        'single_thread_func': data.get('single_thread_func', ''),
        'multi_thread_path': data.get('multi_thread_path', ''),
        'multi_thread_func': data.get('multi_thread_func', ''),
        'extra_display_path': data.get('extra_display_path', ''),
        'extra_display_func': data.get('extra_display_func', ''),
        'custom_curve_func': data.get('custom_curve_func', '')
    }
    
    success = tool_manager.update_tool(user_id, tool_id, tool_config)
    if success:
        return jsonify({'success': True})
    return jsonify({'success': False, 'error': '更新失败'})


@app.route('/api/tools/<tool_id>', methods=['DELETE'])
def api_delete_tool(tool_id):
    """删除工具"""
    user_id = get_user_id()
    success = tool_manager.delete_tool(user_id, tool_id)
    if success:
        return jsonify({'success': True})
    return jsonify({'success': False, 'error': '删除失败'})


@app.route('/api/tools/<tool_id>/data', methods=['POST'])
def api_load_tool_data(tool_id):
    """加载工具数据（使用分层存储）"""
    user_id = get_user_id()

    # 检查缓存 - 获取所有类型的数据
    all_data = tool_manager.get_all_tool_data(user_id, tool_id)
    
    if all_data:
        return jsonify({'success': True, 'data': all_data})
    
    tool_config = tool_manager.get_tool(user_id, tool_id)
    if not tool_config:
        return jsonify({'success': False, 'error': '工具不存在'})
    
    result_data = {}
    # 获取单线程数据
    if tool_config.get('single_thread_path') and tool_config.get('single_thread_func'):
        single_data = data_manager.get_single_thread_data(user_id, tool_config)
        if single_data:
            # 保存单线程数据到独立文件
            tool_manager.save_single_thread_data(user_id, tool_id, single_data)
            # 移除内部字段
            if 'dataFiles' in single_data:
                del single_data['dataFiles']
            if '__multi_processed_logs__' in single_data:
                del single_data['__multi_processed_logs__']
            # result_data.update(result_data)
            result_data['signal'] = single_data
    
    # 获取多线程数据
    if tool_config.get('multi_thread_path') and tool_config.get('multi_thread_func'):
        multi_data = data_manager.get_multi_thread_data(user_id, tool_config)
        if multi_data:
            # 保存多线程数据到独立文件
            tool_manager.save_multi_thread_data(user_id, tool_id, multi_data)
            # 合并数据
            # 移除内部字段
            if 'dataFiles' in multi_data:
                del multi_data['dataFiles']
            if '__multi_processed_logs__' in multi_data:
                del multi_data['__multi_processed_logs__']
            result_data['multi'] = multi_data
    
    return jsonify({'success': True, 'data': json.dumps(result_data)})


@app.route('/api/tools/<tool_id>/refresh', methods=['POST'])
def api_refresh_tool_data(tool_id):
    """刷新工具数据（清除缓存后重新加载）"""
    user_id = get_user_id()
    
    # 清除所有缓存
    tool_manager.clear_cache(user_id, tool_id)
    
    # 重新加载
    return api_load_tool_data(tool_id)


@app.route('/api/tools/<tool_id>/extra', methods=['POST'])
def api_get_extra_data(tool_id):
    """获取额外显示数据并保存到独立文件"""
    user_id = get_user_id()
    data = request.json
    paths = data.get('paths', [])
    
    tool_config = tool_manager.get_tool(user_id, tool_id)
    if not tool_config:
        return jsonify({'success': False, 'error': '工具不存在'})
    
    extra_data = {}
    for path in paths:
        path = path.strip()
        if not path:
            continue
        
        func_path = tool_config.get('extra_display_func')
        if func_path:
            result = data_manager.get_custom_curve_data(user_id, tool_config, path)
            if result:
                extra_data.update(result)
        else:
            try:
                path_obj = Path(path)
                if path_obj.exists():
                    import json
                    with open(path_obj, 'r', encoding='utf-8') as f:
                        result = json.load(f)
                        extra_data.update(result)
            except Exception as e:
                print(f"加载额外数据失败 {path}: {e}")
    
    # 添加用户标记
    marked_data = {}
    for casename, case_data in extra_data.items():
        marked_data[casename] = {
            'casename': casename,
            'daily_metrics': {},
            'is_user_added': True
        }
        
        for date, metrics in case_data.get('daily_metrics', {}).items():
            marked_data[casename]['daily_metrics'][f"{date}_user"] = metrics
    
    # 保存用户添加的数据到独立文件
    if marked_data:
        existing_extra = tool_manager.load_extra_data(user_id, tool_id) or {}
        existing_extra.update(marked_data)
        tool_manager.save_extra_data(user_id, tool_id, existing_extra)
    
    return jsonify({'success': True, 'data': marked_data})


@app.route('/api/chart/data', methods=['POST'])
def api_get_chart_data():
    """获取图表数据（支持Runtime和Memory）"""
    data = request.json

    raw_data = data.get('raw_data', {})
    casename = data.get('casename', '')
    rules = data.get('rules', [])
    dates = data.get('dates', [])
    mode = data.get('mode', 'single')
    chart_type = data.get('chart_type', 'runtime')
    selected_threads = data.get('selected_threads', [0])
    
    # 根据图表类型调用不同的解析方法
    if chart_type == 'memory':
        chart_data = data_parser.parse_for_memory_chart(
            raw_data, casename, rules, dates, mode, selected_threads
        )
    else:
        chart_data = data_parser.parse_for_chart(
            raw_data, casename, rules, dates, mode, selected_threads
        )
    
    return jsonify({'success': True, 'data': chart_data})


@app.route('/api/thread/chart/data', methods=['POST'])
def api_get_thread_chart_data():
    """获取线程曲线图数据（X轴为线程数）"""
    data = request.json
    raw_data = data.get('raw_data', {})
    casename = data.get('casename', '')
    rule = data.get('rule', '')
    date = data.get('date', '')
    
    chart_data = data_parser.parse_for_thread_chart(raw_data, casename, rule, date)
    
    return jsonify({'success': True, 'data': chart_data})


@app.route('/api/threads/options', methods=['POST'])
def api_get_thread_options():
    """获取可用的线程数选项"""
    data = request.json
    raw_data = data.get('raw_data', {})
    casename = data.get('casename', '')
    rule = data.get('rule', None)
    
    options = data_parser.get_thread_options(raw_data, casename, rule)
    
    return jsonify({'success': True, 'data': options})


@app.route('/api/comparison', methods=['POST'])
def api_get_comparison():
    """获取对比数据"""
    data = request.json
    
    raw_data = data.get('raw_data', {})
    casename = data.get('casename', '')
    date1 = data.get('date1', '')
    date2 = data.get('date2', '')
    rules = data.get('rules', [])
    compare_mode = data.get('compare_mode', 'all')
    dimension = data.get('dimension', 'all')
    runtime_threshold = float(data.get('runtime_threshold', 0))
    memory_threshold = float(data.get('memory_threshold', 0))
    error_mode = data.get('error_mode', 'absolute')
    
    comparison = data_parser.parse_for_comparison(
        raw_data, casename, date1, date2, rules,
        compare_mode, dimension, runtime_threshold, memory_threshold, error_mode
    )
    
    return jsonify({'success': True, 'data': comparison})

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)