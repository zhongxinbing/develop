from flask import Blueprint, request, jsonify
from services.tool_config import find_tool_by_id, get_tool_data

compare_bp = Blueprint("compare", __name__)


def build_index(items):
    index = {}
    for item in items:
        key = (item.get("case"), item.get("rule"), item.get("date"))
        index[key] = item
    return index


@compare_bp.route("/api/tool/<tool_id>/compare", methods=["POST"])
def compare_tool_data(tool_id):
    tool = find_tool_by_id(tool_id)
    if not tool:
        return jsonify({"error": "Tool not found"}), 404

    payload = request.json or {}
    case_name = payload.get("case")
    rule_pattern = payload.get("rule", "")
    date_a = payload.get("date_a")
    date_b = payload.get("date_b")
    mode = payload.get("mode", "absolute")
    dimension = payload.get("dimension", "all")
    runtime_threshold = float(payload.get("runtime_threshold", 0) or 0)
    memory_threshold = float(payload.get("memory_threshold", 0) or 0)

    tool_data = get_tool_data(tool_id)
    all_items = tool_data.get("single_thread", []) + tool_data.get("multi_thread", [])
    filtered = [item for item in all_items if (not case_name or item.get("case") == case_name)
                and (not rule_pattern or rule_pattern.lower() in item.get("rule", "").lower())
                and item.get("date") in [date_a, date_b]]

    index = build_index(filtered)
    rows = []
    summary = {"count": 0, "runtime_increase": 0, "runtime_decrease": 0, "memory_increase": 0, "memory_decrease": 0}

    for key, current in index.items():
        case, rule, date = key
        if date != date_a:
            continue
        left = current
        right = index.get((case, rule, date_b))
        if not right:
            continue
        runtime_delta = right.get("runtime", 0) - left.get("runtime", 0)
        memory_delta = right.get("memory", 0) - left.get("memory", 0)
        runtime_ratio = (runtime_delta / left.get("runtime", 1)) * 100 if left.get("runtime", 0) else 0
        memory_ratio = (memory_delta / left.get("memory", 1)) * 100 if left.get("memory", 0) else 0
        row = {
            "case": case,
            "rule": rule,
            "date_a": date_a,
            "date_b": date_b,
            "runtime_a": left.get("runtime", 0),
            "runtime_b": right.get("runtime", 0),
            "memory_a": left.get("memory", 0),
            "memory_b": right.get("memory", 0),
            "runtime_delta": runtime_delta,
            "memory_delta": memory_delta,
            "runtime_rate": runtime_ratio if mode == "percent" else runtime_delta,
            "memory_rate": memory_ratio if mode == "percent" else memory_delta
        }

        if dimension in ["all", "runtime"]:
            if abs(row["runtime_rate"]) >= runtime_threshold:
                summary["count"] += 1
                if row["runtime_rate"] > 0:
                    summary["runtime_increase"] += 1
                elif row["runtime_rate"] < 0:
                    summary["runtime_decrease"] += 1
        if dimension in ["all", "memory"]:
            if abs(row["memory_rate"]) >= memory_threshold:
                if row["memory_rate"] > 0:
                    summary["memory_increase"] += 1
                elif row["memory_rate"] < 0:
                    summary["memory_decrease"] += 1
        rows.append(row)

    return jsonify({"summary": summary, "rows": rows})
