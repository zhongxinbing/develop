"""
API对比模块 - 数据对比接口
"""
from flask import jsonify, request
from app import app
from utils.data_manager import data_manager
from utils.log import get_logger

logger = get_logger(__name__)



@app.route('/api/compare', methods=['GET'])
def api_compare():
    """对比接口"""
    return jsonify({"message": "对比接口"}), 200


@app.route('/api/comparison', methods=['POST'])
def api_get_comparison():
    """获取对比数据（单线程对比 & 多线程对比）"""
    data = request.json
    
    tool_id = data.get('tool_id', '')
    mode = data.get('mode', 'single')  # single 或 multi
    casename = data.get('casename', '')
    date1 = data.get('date1', '')
    date2 = data.get('date2', '')
    compare_mode = data.get('compare_mode', 'all')
    dimension = data.get('dimension', None)
    runtime_threshold = float(data.get('runtime_threshold', 0))
    memory_threshold = float(data.get('memory_threshold', 0))
    error_mode = data.get('error_mode', 'absolute')
    threads = data.get('threads', [])
    compare_type = data.get('compare_type', 'single')
    
    logger.info(f"收到对比请求: tool_id={tool_id}, mode={mode}, casename={casename}, "
                f"date1={date1}, date2={date2}, dimension={dimension}, "
                f"error_mode={error_mode}, threads={threads}")
    
    result = data_manager.compare_data(
        tool_id=tool_id,
        mode=mode,
        casename=casename,
        date1=date1,
        date2=date2,
        compare_mode=compare_mode,
        dimension=dimension,
        runtime_threshold=runtime_threshold,
        memory_threshold=memory_threshold,
        error_mode=error_mode,
        threads=threads,
        compare_type=compare_type
    )
    
    return jsonify(result)
