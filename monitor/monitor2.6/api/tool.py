
"""
API工具模块 - 工具数据加载和图表数据
"""
from flask import jsonify, request
from app import app
from utils.data_manager import data_manager
from utils.log import get_logger
from utils.common import *
from config import DATA_DIR

logger = get_logger(__name__)

################################################################### 工具页面 ###################################################################
# 加载数据（使用分层存储）
@app.route('/api/tools/<tool_id>/data', methods=['POST'])
def api_load_tool_data(tool_id):
    """加载工具数据（使用分层存储）"""
    # 后端将数据发送给前端，前端根据数据类型进行处理
    user_id = get_user_id()
    all_data, message = data_manager.load_single_or_multi_chart(tool_id, user_id)

    return jsonify({'success': True, 'data': all_data, 'message': message})
    
# 从前端获取图需要显示数据，解析后返回图表数据   ->>>>>  单线线程
@app.route('/api/chart/data', methods=['POST'])
def api_get_chart_data():
    """获取图表数据（支持Runtime和Memory）"""
    data = request.json
    # red(data)
    chioce_data = data_manager.send_data_to_frontend_for_chart(data)

    return jsonify({'success': True, 'data': chioce_data})

# 从前端获取图需要显示数据，解析后返回图表数据   ->>>>>  线程数
@app.route('/api/thread/chart/data', methods=['POST'])
def api_get_thread_chart_data():
    """获取线程曲线图数据（X轴为线程数）"""
    data = request.json

    # chart_data = data_manager.load_thread_chart(data)
    chart_data = data_manager.send_data_to_frontend_for_thread_chart(data)
    print(chart_data)
    if not chart_data:
        return jsonify({'success': False, 'error': '线程数据为空'})

    return jsonify({'success': True, 'data': chart_data})


@app.route('/api/chart/parsers', methods=['POST'])
def api_get_chart_parsers():
    """获取图表解析器数据"""
    data = request.json
    casename = data.get('casename')
    tool_id = data.get('toolId')
    chartType = data.get('chartType')

    # 单线程和多线程数据
    if chartType == 'multi':
        parsers_path = DATA_DIR / tool_id / 'parser' /'single_multi' / f'{casename}.json'
    # 线程数曲线图数据
    if chartType == 'thread':
        parsers_path = DATA_DIR / tool_id / 'parser' /'thread' / f'{casename}.json'

    if not parsers_path.exists():
        return jsonify({'success': False, 'error': '解析器数据不存在'})
    
    parser = load_tool_data(parsers_path)

    return jsonify({'success': True, 'data': parser})

