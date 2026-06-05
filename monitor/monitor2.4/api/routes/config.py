from flask import Blueprint, request, jsonify, render_template
from services.tool_config import get_tool_configs, add_tool_config, find_tool_by_id

config_bp = Blueprint("config", __name__)


@config_bp.route("/config")
def config_page():
    return render_template("config.html")


@config_bp.route("/api/tools", methods=["GET", "POST"])
def tools_api():
    if request.method == "GET":
        return jsonify(get_tool_configs())

    form = request.json or request.form
    if not form:
        return jsonify({"error": "Missing tool data"}), 400

    name = form.get("name", "").strip()
    if not name:
        return jsonify({"error": "Tool name is required"}), 400

    tool = add_tool_config(form)
    return jsonify(tool), 201


@config_bp.route("/api/tools/<tool_id>")
def tool_info(tool_id):
    tool = find_tool_by_id(tool_id)
    if not tool:
        return jsonify({"error": "Tool not found"}), 404
    return jsonify(tool)
