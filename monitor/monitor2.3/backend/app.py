"""
Flask后端主入口
提供API接口和数据管理功能
"""
import os
import sys
import json
import shutil
from datetime import datetime, timedelta
from pathlib import Path
from functools import wraps

from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from werkzeug.utils import secure_filename

# 添加当前目录到路径
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from config_manager import ConfigManager
from data_loader import DataLoader

# 获取项目根目录
BASE_DIR = Path(__file__).parent.parent
FRONTEND_DIR = BASE_DIR / 'templates'

app = Flask(__name__, 
           static_folder=str(FRONTEND_DIR),
           static_url_path='')
CORS(app)

# 数据根目录
DATA_ROOT = BASE_DIR / 'data'
DATA_ROOT.mkdir(exist_ok=True)

# 配置文件路径
CONFIG_FILE = Path(__file__).parent / 'tools_config.json'

# 初始化管理器
config_manager = ConfigManager(CONFIG_FILE)
data_loader = DataLoader(DATA_ROOT)


def get_tool_data_dir(tool_name: str) -> Path:
    """获取工具的数据目录"""
    safe_name = secure_filename(tool_name)
    tool_dir = DATA_ROOT / safe_name
    tool_dir.mkdir(exist_ok=True)
    return tool_dir


# ==================== 配置管理API ====================

@app.route('/api/tools', methods=['GET'])
def get_tools():
    """获取所有工具配置"""
    return jsonify(config_manager.get_all_tools())


@app.route('/api/tools/<tool_name>', methods=['GET'])
def get_tool(tool_name):
    """获取单个工具配置"""
    tool = config_manager.get_tool(tool_name)
    if tool:
        return jsonify(tool)
    return jsonify({'error': 'Tool not found'}), 404


@app.route('/api/tools', methods=['POST'])
def create_tool():
    """创建新工具配置"""
    data = request.json
    tool_name = data.get('tool_name')
    
    if not tool_name:
        return jsonify({'error': 'Tool name is required'}), 400
    
    if config_manager.get_tool(tool_name):
        return jsonify({'error': 'Tool already exists'}), 409
    
    config_manager.add_tool(data)
    
    # 创建工具数据目录
    tool_dir = get_tool_data_dir(tool_name)
    cache_file = tool_dir / 'cache.json'
    if not cache_file.exists():
        cache_file.write_text('{}')
    
    return jsonify({'message': 'Tool created', 'tool': data}), 201


@app.route('/api/tools/<tool_name>', methods=['PUT'])
def update_tool(tool_name):
    """更新工具配置"""
    data = request.json
    
    if not config_manager.get_tool(tool_name):
        return jsonify({'error': 'Tool not found'}), 404
    
    config_manager.update_tool(tool_name, data)
    return jsonify({'message': 'Tool updated', 'tool': data})


@app.route('/api/tools/<tool_name>', methods=['DELETE'])
def delete_tool(tool_name):
    """删除工具配置"""
    if not config_manager.get_tool(tool_name):
        return jsonify({'error': 'Tool not found'}), 404
    
    config_manager.delete_tool(tool_name)
    
    # 可选：删除工具数据目录
    tool_dir = get_tool_data_dir(tool_name)
    if tool_dir.exists():
        shutil.rmtree(tool_dir)
    
    return jsonify({'message': 'Tool deleted'})


# ==================== 数据API ====================

@app.route('/api/data/<tool_name>/single', methods=['POST'])
def get_single_thread_data(tool_name):
    """获取单线程数据"""
    tool = config_manager.get_tool(tool_name)
    if not tool:
        return jsonify({'error': 'Tool not found'}), 404
    
    interface_func = tool.get('single_thread_interface', 'load_single_thread_data')
    data_path = tool.get('single_thread_path')
    
    if not data_path:
        return jsonify({'error': 'Single thread path not configured'}), 400
    
    # 使用缓存
    cache_data = data_loader.load_cached_data(tool_name, 'single')
    if cache_data is not None:
        return jsonify(cache_data)
    
    data = data_loader.load_single_thread_data(data_path, interface_func)
    data_loader.save_cached_data(tool_name, 'single', data)
    
    return jsonify(data)


@app.route('/api/data/<tool_name>/multi', methods=['POST'])
def get_multi_thread_data(tool_name):
    """获取多线程数据"""
    tool = config_manager.get_tool(tool_name)
    if not tool:
        return jsonify({'error': 'Tool not found'}), 404
    
    interface_func = tool.get('multi_thread_interface', 'load_multi_thread_data')
    data_path = tool.get('multi_thread_path')
    
    if not data_path:
        return jsonify({'error': 'Multi thread path not configured'}), 400
    
    cache_data = data_loader.load_cached_data(tool_name, 'multi')
    if cache_data is not None:
        return jsonify(cache_data)
    
    data = data_loader.load_multi_thread_data(data_path, interface_func)
    data_loader.save_cached_data(tool_name, 'multi', data)
    
    return jsonify(data)


@app.route('/api/data/<tool_name>/custom', methods=['POST'])
def get_custom_curve_data(tool_name):
    """获取自定义曲线数据"""
    tool = config_manager.get_tool(tool_name)
    if not tool:
        return jsonify({'error': 'Tool not found'}), 404
    
    interface_func = tool.get('custom_curve_interface', '')
    if not interface_func:
        return jsonify({'error': 'Custom curve interface not configured'}), 400
    
    data = data_loader.load_custom_data(tool, interface_func)
    return jsonify(data)


@app.route('/api/data/<tool_name>/user-data', methods=['POST'])
def add_user_data(tool_name):
    """添加用户自定义数据"""
    request_data = request.json
    paths = request_data.get('paths', [])
    
    tool = config_manager.get_tool(tool_name)
    if not tool:
        return jsonify({'error': 'Tool not found'}), 404
    
    user_data = data_loader.load_user_data(tool, paths)
    data_loader.save_user_cache(tool_name, user_data)
    
    return jsonify(user_data)


@app.route('/api/data/<tool_name>/clear-cache', methods=['POST'])
def clear_cache(tool_name):
    """清除缓存"""
    data_loader.clear_cache(tool_name)
    return jsonify({'message': 'Cache cleared'})


# ==================== 对比API ====================

@app.route('/api/compare/<tool_name>', methods=['POST'])
def compare_data(tool_name):
    """对比两个日期的数据"""
    request_data = request.json
    casename = request_data.get('casename')
    date1 = request_data.get('date1')
    date2 = request_data.get('date2')
    compare_mode = request_data.get('compare_mode', 'all')
    rule_filter = request_data.get('rule_filter')
    error_mode = request_data.get('error_mode', 'absolute')
    compare_dimension = request_data.get('compare_dimension', 'all')
    runtime_tolerance = float(request_data.get('runtime_tolerance', 0))
    memory_tolerance = float(request_data.get('memory_tolerance', 0))
    
    tool = config_manager.get_tool(tool_name)
    if not tool:
        return jsonify({'error': 'Tool not found'}), 404
    
    single_data = data_loader.load_cached_data(tool_name, 'single')
    if not single_data:
        return jsonify({'error': 'No data available'}), 404
    
    if casename not in single_data:
        return jsonify({'error': f'Casename {casename} not found'}), 404
    
    case_data = single_data[casename]
    daily_metrics = case_data.get('daily_metrics', {})
    
    if date1 not in daily_metrics or date2 not in daily_metrics:
        return jsonify({'error': 'Date not found'}), 404
    
    data1 = daily_metrics[date1]
    data2 = daily_metrics[date2]
    
    from compare import DataComparator
    comparator = DataComparator()
    
    result = comparator.compare(
        data1, data2,
        compare_mode=compare_mode,
        rule_filter=rule_filter,
        error_mode=error_mode,
        compare_dimension=compare_dimension,
        runtime_tolerance=runtime_tolerance,
        memory_tolerance=memory_tolerance
    )
    
    return jsonify(result)


# ==================== 静态文件服务 ====================

@app.route('/')
def serve_index():
    """提供主页面"""
    index_path = FRONTEND_DIR / 'index.html'
    if index_path.exists():
        return send_from_directory(str(FRONTEND_DIR), 'index.html')
    return jsonify({'error': 'Frontend not found'}), 404


@app.route('/<path:path>')
def serve_static(path):
    """提供静态文件"""
    file_path = FRONTEND_DIR / path
    if file_path.exists():
        return send_from_directory(str(FRONTEND_DIR), path)
    # 如果文件不存在，返回index.html（用于SPA路由）
    return send_from_directory(str(FRONTEND_DIR), 'index.html')


if __name__ == '__main__':
    print(f"Frontend directory: {FRONTEND_DIR}")
    print(f"Data directory: {DATA_ROOT}")
    print("\nStarting server at http://localhost:5000")
    app.run(host='0.0.0.0', port=5000, debug=True)