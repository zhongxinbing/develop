from flask import Blueprint, request, jsonify

compare_bp = Blueprint("compare", __name__, url_prefix="/api/compare")

@compare_bp.route("/calc", methods=["POST"])
def calc_compare():
    """计算数据对比结果"""
    req_data = request.json
    # 此处为模板，根据业务实现误差计算、统计、表格数据
    result = {
        "stat": {},
        "table": []
    }
    return jsonify({"code": 200, "data": result})