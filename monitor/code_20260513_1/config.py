"""
系统配置文件
"""
from datetime import datetime, date

# Flask配置
CONFIG = {
    'host': '0.0.0.0',      # 允许外部访问
    'port': 6060,           # 端口号
    'debug': True,
    'auto_open_browser': False
}

# 数据源配置
CASE_CONFIG = {
    'elint': {
        'single': {
            'original_path': '/home/xbzhong/develop/monitor/code/data',
            'json_path': '/home/xbzhong/develop/monitor/code/data/total.json',
            'mem': '/home/xbzhong/develop/monitor/code/data/lint_mem.csv',
            'cpu': '/home/xbzhong/develop/monitor/code/data/lint_cpu.csv'
        },
        'multi': {
            'original_path': '/mnt/efs/fs1/jenkins/lint_comparison_results_qor',
            'json_path': '/mnt/efs/fs1/reg_test_data/CN/lint/pv/other/monitor/json/elint/multi',
            'mem': '/home/xbzhong/develop/monitor/code/data/lint_mem.csv',
            'cpu': '/home/xbzhong/develop/monitor/code/data/lint_cpu.csv'
        }
    }
}

# 默认数据范围
DEFAULT_DATE_RANGE = {
    'start': '20260501',
    'end': datetime.now().strftime('%Y%m%d')
}

# 缓存配置
CACHE_TTL = 300  # 缓存有效期（秒）