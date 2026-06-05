from flask import Blueprint, render_template

main_bp = Blueprint("main", __name__)


@main_bp.route("/")
def index():
    return render_template("main.html")


@main_bp.route("/tool/<tool_id>")
def tool_page(tool_id):
    return render_template("tool.html", tool_id=tool_id)
