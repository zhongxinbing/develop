"""
数据解析器 - 统一入口，根据模式调用对应的解析器
"""
from typing import Dict, List, Any, Optional
from unittest import result
import json
# from numpy import single
from utils.single_thread_parser import SingleThreadParser
from utils.multi_thread_parser import MultiThreadParser
from utils.common import log
from utils.log import *
from config import DATA_DIR, BASE_DIR



class DataParser:
    """数据解析器 - 统一入口"""

    def __init__(self):
        setup_logger(log_dir='logs', level='DEBUG')
        self.logger = get_logger(__name__)
        self.logger.info("数据管理器初始化")

    # 解析工具的数据，并放在对应的目录下；方便用户直接获取数据
    def parse_all_data(self, tool_id, all_data, mode):
        """
        解析工具的数据，并放在对应的目录下；方便用户直接获取数据
        
        参数:
            tool_id: 工具ID
            data: 原始数据
            mode: 模式 - 'single' 或 'multi'
        """
        if mode == 'single':
            self.logger.info(f"解析单线程数据 - {tool_id}")
            single_parser = SingleThreadParser()
            return single_parser.parse_single_data(tool_id, mode, all_data)
        elif mode == 'multi':
            self.logger.info(f"解析多线程数据 - {tool_id}")
            multi_parser = MultiThreadParser()
            print(json.dumps(all_data, ensure_ascii=False, indent=4))
            return multi_parser.parse_multi_data(tool_id, mode, all_data)

# 全局实例
data_parser = DataParser()