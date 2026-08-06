"""
Flask主应用 - 性能监控平台后端
"""
from flask import Flask
from config import SECRET_KEY
from utils.log import get_logger, setup_logger

app = Flask(__name__)
app.secret_key = SECRET_KEY

setup_logger(log_dir='logs', level='DEBUG')
logger = get_logger(__name__)

from api.main import *
from api.config import *
from api.tool import *
from api.compare import *

if __name__ == '__main__':
    setup_logger(log_dir='logs', level='DEBUG')
    logger = get_logger(__name__)
    logger.info("启动性能监控平台后端服务")
    app.run(debug=True, host='0.0.0.0', port=5020)

 