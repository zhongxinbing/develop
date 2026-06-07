from flask import Blueprint, request, jsonify
from backend.utils.file_ops import get_origin_data

chart_bp = Blueprint("chart", __name__, url_prefix="/api/chart")

# 全局内存缓存：存储用户临时导入数据（刷新自动清空）
USER_TEMP_DATA = {}

@chart_bp.route("/data/<tool_id>", methods=["GET"])
def get_chart_data(tool_id):
    """获取图表原始数据"""
    origin = get_origin_data(tool_id)
    # 拼接临时用户数据
    user_data = USER_TEMP_DATA.get(tool_id, {})
    return jsonify({
        "code": 200,
        "origin_data": origin,
        "user_data": user_data
    })

@chart_bp.route("/add_user_data/<tool_id>", methods=["POST"])
def add_user_data(tool_id):
    """添加用户临时数据（内存缓存）"""
    paths = request.json.get("paths", [])
    # 模拟解析路径数据（业务自行替换解析逻辑）
    mock_user_data = {}
    for idx, p in enumerate(paths):
        mock_user_data[f"2026-06-0{idx+1}_user"] = {"runtime": 100, "memory": 2048}
    USER_TEMP_DATA[tool_id] = mock_user_data
    return jsonify({"code": 200, "msg": "用户数据导入成功"})