from flask import Blueprint, request, jsonify
from services.tool_config import find_tool_by_id, get_tool_data

tool_bp = Blueprint("tool", __name__)


def filter_list(data_list, case_name=None, rule_name=None, dates=None):
    if case_name:
        data_list = [item for item in data_list if item.get("case") == case_name]
    if rule_name:
        data_list = [item for item in data_list if item.get("rule") == rule_name]
    if dates:
        data_list = [item for item in data_list if item.get("date") in dates]
    return data_list


@tool_bp.route("/api/tool/<tool_id>")
def tool_detail(tool_id):
    tool = find_tool_by_id(tool_id)
    if not tool:
        return jsonify({"error": "Tool not found"}), 404
    tool_data = get_tool_data(tool_id)
    return jsonify({"tool": tool, "data": tool_data})


@tool_bp.route("/api/tool/<tool_id>/chart-data")
def tool_chart_data(tool_id):
    tool = find_tool_by_id(tool_id)
    if not tool:
        return jsonify({"error": "Tool not found"}), 404

    mode = request.args.get("mode", "single")
    case_name = request.args.get("case")
    rule_name = request.args.get("rule")
    dates = request.args.getlist("date")

    tool_data = get_tool_data(tool_id)
    source = tool_data.get("single_thread") if mode == "single" else tool_data.get("multi_thread")
    items = filter_list(source, case_name, rule_name, dates if dates else None)

    return jsonify({"items": items})


@tool_bp.route("/api/tool/<tool_id>/catalog")
def tool_catalog(tool_id):
    tool = find_tool_by_id(tool_id)
    if not tool:
        return jsonify({"error": "Tool not found"}), 404

    tool_data = get_tool_data(tool_id)
    data_source = tool_data.get("single_thread", []) + tool_data.get("multi_thread", [])
    cases = sorted({item.get("case") for item in data_source if item.get("case")})
    rules = sorted({item.get("rule") for item in data_source if item.get("rule")})
    dates = sorted({item.get("date") for item in data_source if item.get("date")})
    return jsonify({"cases": cases, "rules": rules, "dates": dates})
