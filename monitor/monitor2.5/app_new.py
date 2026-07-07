"""
Flask主应用 - 性能监控平台后端
"""
import json
import uuid
from pathlib import Path
from datetime import datetime
from flask import Flask, render_template, request, jsonify, session
from sympy import true

from config import SECRET_KEY
from tool.elint.elint import load_json, save_json
from utils.tool_manager import tool_manager
from utils.data_manager import data_manager
from utils.data_parser import data_parser
from utils.log import *


app = Flask(__name__)
app.secret_key = SECRET_KEY

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
    if data.get('single_thread_path') is None or not Path(data.get('single_thread_path')).exists():
        return jsonify({'success': False, 'error': '单线程路径不能为空或者不存在'})
    else:
        # 验证多线程路径是否存在
        if not Path(data.get('multi_thread_path')).exists():
            return jsonify({'success': False, 'error': '多线程路径不存在'})
    # 验证额外显示路径是否存在
    if data.get('extra_display_path') and not Path(data.get('extra_display_path')).exists():
        return jsonify({'success': False, 'error': 'extra 路径 不存在'})

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
        'single_thread_path': data.get('single_thread_path', ''),
        'single_thread_func': data.get('single_thread_func', ''),
        'multi_thread_path': data.get('multi_thread_path', ''),
        'multi_thread_func': data.get('multi_thread_func', ''),
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
    logger.info(f"用户 {user_id} 请求加载工具 {tool_id} 数据")

    # 判断用户数据目录是否存在
    data_manager.create_user_data_dir(user_id, tool_id)
    # 加载所有数据

    single = data_manager.load_data(tool_id, user_id, "single")
    logger.info(f"加载工具 {tool_id} 单线程数据 - {single}")
    # multi = data_manager.load_data(tool_id, user_id, "multi")
    # extra = data_manager.load_data(tool_id, user_id, "extra_display")
    multi = None
    extra = None

    all_data = {}
    message = ''
    if single:
        all_data['single'] = single
        message += ' 单线程'
        data_parser.parse_all_data(tool_id, single, 'single')
    else:
        all_data['single'] = {}
        
    if multi:
        all_data['multi'] = multi
        message += ' 多线程'
        data_parser.parse_all_data(tool_id, multi, 'multi')
    else:
        all_data['multi'] = {}
        
    if extra:
        all_data['extra'] = extra
        message += ' 其他'
        data_parser.parse_all_data(tool_id, extra, 'extra_display')
    else:
        all_data['extra'] = {}
    
    if message:
        message = "更新:" + message
    else:
        message = "数据不需要更新"
    
    return jsonify({'success': True, 'data': all_data, 'message': message})
    # 解析数据，并放在 对应的目录中





    # flag = data_manager.refresh_data(user_id, tool_id)
    # if flag == 0:
    #     """ 调用加载数据的函数 """
    #     return jsonify({'success': False, 'error': f'数据更新出现错误'})
    # elif flag == 1:
    #     # 数据不需要更新，直接返回数据
    #     return jsonify({'success': False, 'error': f'数据不需要更新，直接返回数据'})
    # elif flag == 2:
    #     # 数据需要更新
    #     return jsonify({'success': False, 'data': f'数据需要更新'})
    # elif flag == 3:
    #     # 需要更新所有的数据
    #     data = {
    #         "single" : {},
    #         "multi": {}
    #     }
    #     return jsonify({'success': True, 'error': data})
    # else:
    #     # 如果目录创建失败，返回错误信息
    #     return jsonify({'success': False, 'error': f'数据更新出现错误'})

    # # 检查缓存 - 获取所有类型的数据   从保存的文件中获取数据
    # tool_manager.upload_data()
    # all_data = tool_manager.get_all_tool_data(user_id, tool_id)

    # if all_data:
    #     # 判断是否更新单线程的数据并返回更新后的数据
    #     all_data, upload = data_manager.data_is_upload(all_data, user_id, tool_id)
    # else:
    #     logger.info(f"获取工具 {tool_id} 中数据为空，用户 {user_id} 全量获取中")
    #     all_data, upload = data_manager._get_init_data(user_id, tool_id)

    # return jsonify({'success': True, 'data': json.dumps(all_data), 'upload': upload})


if __name__ == '__main__':
    setup_logger(log_dir='logs', level='DEBUG')
    logger = get_logger(__name__)
    logger.info("启动性能监控平台后端服务")
    app.run(debug=True, host='0.0.0.0', port=5020)

 