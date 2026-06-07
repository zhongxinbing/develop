import uuid
from flask import Blueprint, request, jsonify
from backend.utils.file_ops import *
from backend.utils.validator import validate_tool_config

tool_bp = Blueprint("tool", __name__, url_prefix="/api/tool")

@tool_bp.route("/list", methods=["GET"])
def get_tool_list():
    """获取所有工具列表"""
    return jsonify({"code": 200, "data": get_all_tool_list()})

@tool_bp.route("/check_name", methods=["POST"])
def check_name():
    """校验工具名称是否重复"""
    name = request.json.get("tool_name", "")
    exist = check_tool_name_exist(name)
    return jsonify({"code": 200, "exist": exist})

@tool_bp.route("/save", methods=["POST"])
def save_tool():
    """新增/编辑工具配置"""
    data = request.json
    # 表单校验
    ok, msg = validate_tool_config(data)
    if not ok:
        return jsonify({"code": 400, "msg": msg})

    tool_id = data.get("tool_id")
    # 新增工具：生成唯一ID
    if not tool_id:
        tool_id = f"tool_{str(uuid.uuid4())[:8]}"
    # 保存配置
    save_tool_config(tool_id, data)
    return jsonify({"code": 200, "tool_id": tool_id, "msg": "保存成功"})

@tool_bp.route("/delete/<tool_id>", methods=["DELETE"])
def del_tool(tool_id):
    """删除工具"""
    res = delete_tool(tool_id)
    return jsonify({"code": 200 if res else 400, "msg": "删除成功" if res else "删除失败"})

@tool_bp.route("/info/<tool_id>", methods=["GET"])
def get_tool_info(tool_id):
    """获取单个工具详情"""
    info = get_tool_config(tool_id)
    return jsonify({"code": 200, "data": info})