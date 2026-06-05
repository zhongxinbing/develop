from flask import Blueprint, jsonify

# 数据接口路由占位符，确保应用启动时不会出现缺少模块的问题。
# 你可以根据业务需求在此处扩展更多原始数据访问接口。

data_bp = Blueprint("data", __name__)


@data_bp.route("/api/data/status")
def data_status():
    return jsonify({"status": "data service available"})
