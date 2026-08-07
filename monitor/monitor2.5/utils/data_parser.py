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
    def parse_all_data(self, all_data: Dict, flag: int):
        """"
            解析工具的数据，并放在对应的目录下；方便用户直接获取数据
            参数:
                all_data: 原始数据
                flag: 标志位 - 0 单线程，1 多线程
            返回数据结构：{
                    'single': { 
                        "casename": {
                            "cputime" : {
                                rule: [dates]
                            }
                        }
                    },
                    'multi': {
                        "casename": {
                            "cputime" : {
                                rule: {
                                    date: [threads]
                                }
                            }
                        }
                    }
                }
        """

        single = {}
        multi = {}
        for casename, case_data in all_data.items():
            if casename not in single:
                single[casename] = {}
            types = case_data['metrics']
            rules = case_data['rules_data'].keys()

            for rule in rules:
                dates = case_data['rules_data'][rule]['date']
                date_datas = case_data['rules_data'][rule]['date_data']
                for date, thread_data in date_datas.items():
                    for thread, data in thread_data.items():
                        for i in range(len(types)):
                            if data[i] > 0:
                                if date in dates:
                                    if thread == -1:
                                        single[casename][types[i]][rule].append(date)
                                    else:
                                        if rule in multi[casename][types[i]]:
                                            multi[casename][types[i]][rule][date].append(thread)
                                        else:
                                            multi[casename][types[i]][rule][date] = [thread]

        return {'single': single, 'multi': multi}



# 全局实例
data_parser = DataParser()