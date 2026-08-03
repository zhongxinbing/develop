"""
Flask主应用 - 性能监控平台后端
"""
import uuid
from pathlib import Path

from flask import Flask, jsonify, render_template, request, session

from config import SECRET_KEY
from utils.data_manager import data_manager
from utils.log import get_logger, setup_logger
from utils.tool_manager import tool_manager


app = Flask(__name__)
app.secret_key = SECRET_KEY
setup_logger(log_dir='logs', level='DEBUG')
logger = get_logger(__name__)


def get_user_id() -> str:
    """获取或创建用户ID（用于数据隔离）"""
    if 'user_id' not in session:
        session['user_id'] = str(uuid.uuid4())
        logger.info(f"新用户加入 {session['user_id']}")
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
################################################################### 配置信息 ###################################################################
# 从前端表单中获取新配置的数据并保存
@app.route('/api/tools', methods=['POST'])
def api_add_tool():
    """添加工具"""
    # 获取请求数据
    data = request.json
    logger.debug(f"添加工具请求数据: {data}")
    # 验证路径是否存在
    if data.get('single_path') is None or not Path(data.get('single_path')).exists():
        return jsonify({'success': False, 'error': '单线程路径不能为空或者不存在'})
    else:
        # 验证多线程路径是否存在
        if not Path(data.get('multi_path')).exists():
            return jsonify({'success': False, 'error': '多线程路径不存在'})
    # 验证额外显示路径是否存在
    if data.get('extra_display_path') and not Path(data.get('extra_display_path')).exists():
        return jsonify({'success': False, 'error': 'extra 路径 不存在'})

    tool_config = {
        'tool_name': data.get('tool_name'),
        'description': data.get('description', ''),
        'single_path': data.get('single_path', ''),
        'single_func': data.get('single_func', ''),
        'multi_path': data.get('multi_path', ''),
        'multi_func': data.get('multi_func', ''),
        'extra_display_path': data.get('extra_display_path', ''),
        'extra_display_func': data.get('extra_display_func', ''),
        'custom_curve_func': data.get('custom_curve_func', '')
    }

    success = tool_manager.add_tool(tool_config)
    if success:
        return jsonify({'success': True, 'data': {'tool_name': tool_config.get('tool_name')}})
    return jsonify({'success': False, 'error': '添加失败'})

# 从配置中获取工具管理器, 加载工具配置
@app.route('/api/tools', methods=['GET'])
def api_get_tools():
    """获取工具列表"""
    user_id = get_user_id()
    tools = tool_manager.get_tools()
    return jsonify({'success': True, 'data': tools})

# 删除工具及其配置信息
@app.route('/api/tools/<tool_id>', methods=['DELETE'])
def api_delete_tool(tool_id):
    """删除工具"""

    success = tool_manager.delete_tool(tool_id)
    if success:
        return jsonify({'success': True})
    return jsonify({'success': False, 'error': '删除失败'})

# 更新工具配置
@app.route('/api/tools/<tool_id>', methods=['PUT'])
def api_update_tool(tool_id):
    """更新工具"""

    data = request.json
    
    tool_config = {
        'tool_name': data.get('tool_name', tool_id),
        'description': data.get('description', ''),
        'single_path': data.get('single_path', ''),
        'single_func': data.get('single_func', ''),
        'multi_path': data.get('multi_path', ''),
        'multi_func': data.get('multi_func', ''),
        'extra_display_path': data.get('extra_display_path', ''),
        'extra_display_func': data.get('extra_display_func', ''),
        'custom_curve_func': data.get('custom_curve_func', '')
    }
    
    success = tool_manager.update_tool(tool_id, tool_config)
    if success:
        return jsonify({'success': True})
    return jsonify({'success': False, 'error': '更新失败'})

################################################################### 工具页面 ###################################################################
# 加载数据（使用分层存储）
@app.route('/api/tools/<tool_id>/data', methods=['POST'])
def api_load_tool_data(tool_id):
    """加载工具数据（使用分层存储）"""
    user_id = get_user_id()
    all_data, message = data_manager.load_single_or_multi_chart(tool_id, user_id)
    return jsonify({'success': True, 'data': all_data, 'message': message})
    
# 从前端获取图需要显示数据，解析后返回图表数据   ->>>>>  单线线程 多线程
@app.route('/api/chart/data', methods=['POST'])
def api_get_chart_data():
    """获取图表数据（支持Runtime和Memory）"""
    data = request.json
    logger.error(f"收到用户 {get_user_id()} 请求图表数据: {data}")
    chioce_data = data_manager.send_data_to_frontend_for_chart(data)

    return jsonify({'success': True, 'data': chioce_data})
# 从前端获取图需要显示数据，解析后返回图表数据   ->>>>>  线程数
@app.route('/api/thread/chart/data', methods=['POST'])
def api_get_thread_chart_data():
    """获取线程曲线图数据（X轴为线程数）"""
    data = request.json
    chart_data = data_manager.load_thread_chart(data)

    if not chart_data:
        return jsonify({'success': False, 'error': '线程数据为空'})

    return jsonify({'success': True, 'data': chart_data})

# 数据对比
@app.route('/api/comparison', methods=['POST'])
def api_get_comparison():
    """获取对比数据"""
    data = request.json
    
    tool_id = data.get('tool_id', '')
    mode = data.get('mode', 'single')
    casename = data.get('casename', '')
    date1 = data.get('date1', '')
    date2 = data.get('date2', '')
    compare_mode = data.get('compare_mode', 'all')
    dimension = data.get('dimension', 'all')
    runtime_threshold = float(data.get('runtime_threshold', 0))
    memory_threshold = float(data.get('memory_threshold', 0))
    error_mode = data.get('error_mode', 'absolute')
    
    logger.info(f"收到用户 {get_user_id()} 请求对比数据: {tool_id} {mode} {casename} {date1} {date2} {compare_mode} {dimension} {runtime_threshold} {memory_threshold} {error_mode}")

    compare_result = data_manager.compare_data(tool_id, mode, casename, date1, date2, compare_mode, dimension, runtime_threshold, memory_threshold, error_mode)
    
    return jsonify({'success': True, 'data': compare_result})


if __name__ == '__main__':
    setup_logger(log_dir='logs', level='DEBUG')
    logger = get_logger(__name__)
    logger.info("启动性能监控平台后端服务")
    app.run(debug=True, host='0.0.0.0', port=5020)

 