from flask import Flask
from backend.api.tool_api import tool_bp
from backend.api.chart_api import chart_bp
from backend.api.compare_api import compare_bp
from backend.config import FLASK_HOST, FLASK_PORT

app = Flask(__name__, static_folder="../frontend", static_url_path="/")

# 注册蓝图
app.register_blueprint(tool_bp)
app.register_blueprint(chart_bp)
app.register_blueprint(compare_bp)

# 前端页面路由
@app.route("/")
def index_page():
    return app.send_static_file("index.html")

@app.route("/config")
def config_page():
    return app.send_static_file("config.html")

@app.route("/chart")
def chart_page():
    return app.send_static_file("chart.html")

if __name__ == "__main__":
    import os
    debug = os.environ.get('FLASK_DEBUG', 'false').lower() in ('true', '1')
    app.run(host=FLASK_HOST, port=FLASK_PORT, debug=debug)