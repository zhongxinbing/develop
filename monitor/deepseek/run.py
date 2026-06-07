from flask import Flask, send_from_directory
from flask_cors import CORS
import os
import logging
from logging.handlers import RotatingFileHandler

app = Flask(__name__, static_folder='frontend')
CORS(app)

# 配置
app.config['DATA_DIR'] = 'data'
app.config['CACHE_DIR'] = 'cache'
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024
app.config['SECRET_KEY'] = 'your-secret-key-here'

# 设置日志
if not os.path.exists('logs'):
    os.mkdir('logs')
file_handler = RotatingFileHandler('logs/app.log', maxBytes=10240, backupCount=10)
file_handler.setFormatter(logging.Formatter(
    '%(asctime)s %(levelname)s: %(message)s [in %(pathname)s:%(lineno)d]'
))
file_handler.setLevel(logging.INFO)
app.logger.addHandler(file_handler)
app.logger.setLevel(logging.INFO)
app.logger.info('Performance Monitor startup')

# 注册蓝图
from backend.api.tool_api import tool_bp
from backend.api.data_api import data_bp
from backend.api.compare_api import compare_bp

app.register_blueprint(tool_bp, url_prefix='/api/tools')
app.register_blueprint(data_bp, url_prefix='/api/data')
app.register_blueprint(compare_bp, url_prefix='/api/compare')

@app.route('/')
def index():
    return send_from_directory('frontend', 'index.html')

@app.route('/<path:filename>')
def serve_static(filename):
    return send_from_directory('frontend', filename)