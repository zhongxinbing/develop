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
    def parse_all_data(self,data_parsers: Dict, all_data: Dict, single_exists: int, multi_exists: int):
        """"
            解析工具的数据，并放在对应的目录下；方便用户直接获取数据;
            解析的同时进行增量更新，即只解析新增的数据，不解析已存在的数据
            参数:
                data_parsers: 已存在的解析器，用于增量更新
                all_data: 原始数据
                single_exists: 单线程是否需要解析的标志位； 0 未解析，1 已解析
                multi_exists: 多线程是否需要解析的标志位； 0 未解析，1 已解析
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

        if 'single' not in data_parsers:
            single = {}
        else:
            single = data_parsers['single']
        
        if 'multi' not in data_parsers:
            multi = {}
        else:
            multi = data_parsers['multi']
        
        for casename, case_data in all_data.items():
            types = case_data['metrics']
            rules = case_data['rules_data'].keys()

            for rule in rules:
                dates = case_data['rules_data'][rule]['dates']
                date_datas = case_data['rules_data'][rule]['date_data']
                for date, thread_data in date_datas.items():
                    for thread, data in thread_data.items():
                        for i in range(len(types)):
                            if float(data[i]) > 0:
                                if date in dates:
                                    if thread == -1 and single_exists == 1:
                                        if casename not in single:
                                            single[casename] = {}
                                        if types[i] not in single[casename]:
                                            single[casename][types[i]] = {}
                                        if rule not in single[casename][types[i]]:
                                            single[casename][types[i]][rule] = []
                                        single[casename][types[i]][rule].append(date)
                                    elif multi_exists == 1:
                                        if casename not in multi:
                                            multi[casename] = {}
                                        if types[i] not in multi[casename]:
                                            multi[casename][types[i]] = {}
                                        if rule not in multi[casename][types[i]]:
                                            multi[casename][types[i]][rule] = {}
                                        if date not in multi[casename][types[i]][rule]:
                                            multi[casename][types[i]][rule][date] = []
                                        multi[casename][types[i]][rule][date].append(thread)

        # 删除 casename 对应为空的值
        single = {k: v for k, v in single.items() if v not in (None, '')}
        multi = {k: v for k, v in multi.items() if v not in (None, '')}

        return {'single': single, 'multi': multi}



# 全局实例
data_parser = DataParser()