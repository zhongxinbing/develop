
"""
API工具模块 - 工具数据加载和图表数据
"""
from flask import jsonify, request
from app import app
from utils.data_manager import data_manager
from utils.log import get_logger
from utils.common import get_user_id

logger = get_logger(__name__)

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
    # time.sleep(30) 
    # print("============================================================================")
    # print(json.dumps(data, indent=4, ensure_ascii=False))  # 打印请求数据，便于调试
    chioce_data = data_manager.send_data_to_frontend_for_chart(data)
    # logger.error(f"获取图表数据: {chioce_data}")
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
# app.py - 更新对比路由