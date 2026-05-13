from datetime import datetime
import logging

# 配置日志
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)

def log(message):
    """统一日志输出"""
    logging.info(message)

def get_current_date():
    """获取当前日期字符串"""
    return datetime.now().strftime("%Y%m%d")

def parse_date(date_str):
    """解析日期字符串"""
    if isinstance(date_str, str) and len(date_str) == 8:
        return datetime.strptime(date_str, "%Y%m%d")
    return datetime.now()