"""
数据解析器 - 统一入口，根据模式调用对应的解析器
"""


from typing import Dict, List, Any, Optional
from unittest import case, result
import json
# from numpy import single_chart
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
                    'single_multi_chart': {
                        "casename": {
                            "cputime" : {
                                rule: {
                                    thread: {
                                        date: [dates]
                                        data: [datas]
                                    }
                                }
                            }
                        },
                        "crash_dates": {
                            thread: [dates]
                        }
                    },
                    "thread": {
                        "casename": {
                            "cputime": {
                                rule: {
                                    "date": {
                                        thread: [threads]
                                        data: [datas]
                                    }
                                }
                            }
                        }
                    }
                }
        """

        if 'single_multi' not in data_parsers:
            single_multi_chart = {}
        else:
            single_multi_chart = data_parsers['single_multi']

        if 'thread' not in data_parsers:
            thread_chart = {}
        else:
            thread_chart = data_parsers['thread']
        
        for casename, case_data in all_data.items():
            types = case_data['metrics']
            threads = case_data['threads']
            dates = case_data['dates']
            rules_datas = case_data['rules_data']

            for rule, date_data in rules_datas.items():
                # 遍历这个 rule 的所有的日期
                for date in dates:
                    if date not in date_data and rule == 'Overall':
                        # 获取该日期或者该日期中的thread是否crash了
                        for thread in threads:
                            # 获取该日期或者该日期中的thread是否crash了
                            single_multi_chart = self.get_crash_dates(single_multi_chart, casename, date, thread)
                    else:
                        if date in date_data:
                            # 可能是 fei overall 的情况
                            thread_datas = date_data[date]
                            # 先看是否crash了
                            for thread in threads:
                                if thread not in thread_datas:
                                    # 获取该日期或者该日期中的thread是否crash了
                                    single_multi_chart = self.get_crash_dates(single_multi_chart, casename, date, thread)
                                else:
                                    # 解析数据
                                    single_multi_chart, thread_chart = self.get_single_multi_thread_chart(casename, single_multi_chart, thread_chart, thread_datas, types, rule, thread, date, multi_exists)

            if 'crash_dates' not in single_multi_chart:
                single_multi_chart[casename]['crash_dates'] = {}
        # 删除 casename 对应为空的值
        single_multi_chart = {k: v for k, v in single_multi_chart.items() if v not in (None, '')}

        thread_chart = {k: v for k, v in thread_chart.items() if v not in (None, '')}
        # blue(single_multi_chart)
        return {'single_multi_chart': single_multi_chart, 'thread': thread_chart}


    def get_crash_dates(self, single_multi_chart: dict, casename: str, date: str, thread: str):
        if casename not in single_multi_chart:
            single_multi_chart[casename] = {}
        if "crash_dates" not in single_multi_chart[casename]:
            single_multi_chart[casename]["crash_dates"] = {}
        if thread not in single_multi_chart[casename]["crash_dates"]:
            single_multi_chart[casename]["crash_dates"][thread] = []
        if date not in single_multi_chart[casename]["crash_dates"][thread]:
            single_multi_chart[casename]["crash_dates"][thread].append(date)

        return single_multi_chart

    def get_single_multi_thread_chart(self, casename: str, single_multi_chart: dict,thread_chart: dict, thread_datas: dict, types: list, rule: str, thread: str, date: str, multi_exists: int):
        data = thread_datas[thread]
        for i in range(len(types)):
            if casename not in single_multi_chart:
                single_multi_chart[casename] = {}
            if types[i] not in single_multi_chart[casename]:
                single_multi_chart[casename][types[i]] = {}
            if rule not in single_multi_chart[casename][types[i]]:
                single_multi_chart[casename][types[i]][rule] = {}
            if thread not in single_multi_chart[casename][types[i]][rule]:
                single_multi_chart[casename][types[i]][rule][thread] = {}
            if "date" not in single_multi_chart[casename][types[i]][rule][thread]:
                single_multi_chart[casename][types[i]][rule][thread]["date"] = []
            if "data" not in single_multi_chart[casename][types[i]][rule][thread]:
                single_multi_chart[casename][types[i]][rule][thread]["data"] = []

            single_multi_chart[casename][types[i]][rule][thread]["date"].append(date)
            single_multi_chart[casename][types[i]][rule][thread]["data"].append(data[i])    

            if multi_exists == 1:
                if casename not in thread_chart:
                    thread_chart[casename] = {}
                if types[i] not in thread_chart[casename]:
                    thread_chart[casename][types[i]] = {}
                if rule not in thread_chart[casename][types[i]]:
                    thread_chart[casename][types[i]][rule] = {}
                if date not in thread_chart[casename][types[i]][rule]:
                    thread_chart[casename][types[i]][rule][date] = {}
                if "thread" not in thread_chart[casename][types[i]][rule][date]:
                    thread_chart[casename][types[i]][rule][date]["thread"] = []
                if "data" not in thread_chart[casename][types[i]][rule][date]:
                    thread_chart[casename][types[i]][rule][date]["data"] = []
                thread_chart[casename][types[i]][rule][date]["thread"].append(thread)
                thread_chart[casename][types[i]][rule][date]["data"].append(data[i])

        return single_multi_chart, thread_chart
# 全局实例  
data_parser = DataParser()