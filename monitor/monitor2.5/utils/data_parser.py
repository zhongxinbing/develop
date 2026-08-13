"""
数据解析器 - 统一入口，根据模式调用对应的解析器
"""


from typing import Dict, List, Any, Optional
from unittest import case, result
import json
from utils.common import *
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
                                    date: {
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
        # 线程数的 parser
        if 'thread' not in data_parsers:
            thread_chart = {}
        else:
            thread_chart = data_parsers['thread']
        
        for casename, case_data in all_data.items():
            types = case_data['metrics']
            threads = case_data['threads']
            dates = case_data['dates']
            rules_datas = case_data['rules_data']
            smc_case = single_multi_chart.setdefault(casename, {})
            # 仅在多线程模式下初始化 thread_chart，避免污染 single 模式的输出
            tc_case = thread_chart.setdefault(casename, {}) if multi_exists == 1 else None

            for rule, date_data in rules_datas.items():
                # 预取每个 (thread) 的 date/value 列表引用，避免逐日期重复嵌套导航
                thread_maps = {}
                for thread in threads:
                    entry = {}
                    for type_name in types:
                        thread_map = smc_case.setdefault(type_name, {}).setdefault(rule, {}).setdefault(thread, {})
                        entry[type_name] = (thread_map.setdefault("date", []), thread_map.setdefault("data", []))
                    thread_maps[thread] = entry

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
                                    data = thread_datas[thread]
                                    entry = thread_maps[thread]
                                    for i, type_name in enumerate(types):
                                        date_list, value_list = entry[type_name]

                                        if date_list and date_list[-1] == date:
                                            # 增量合并时该日期已存在且是末尾：覆盖为新值，避免重复数据点
                                            value_list[-1] = data[i]
                                        elif date_list and date < date_list[-1] and date in date_list:
                                            # 已存在但位于历史位置（增量重跑旧日期）：覆盖为新值
                                            # 日期列表保持升序，仅当小于末尾时才有必要做线性查找
                                            value_list[date_list.index(date)] = data[i]
                                        else:
                                            date_list.append(date)
                                            value_list.append(data[i])

                                        if multi_exists == 1:
                                            date_map = tc_case.setdefault(type_name, {}).setdefault(rule, {}).setdefault(date, {})
                                            thread_list = date_map.setdefault("threads", [])
                                            thread_values = date_map.setdefault("data", [])

                                            if thread_list and thread_list[-1] == thread:
                                                # 增量合并时该线程已存在且是末尾：覆盖为新值
                                                thread_values[-1] = data[i]
                                            elif thread_list and thread < thread_list[-1] and thread in thread_list:
                                                # 已存在但位于历史位置（增量重跑）：覆盖为新值
                                                thread_values[thread_list.index(thread)] = data[i]
                                            else:
                                                thread_list.append(thread)
                                                thread_values.append(data[i])

            single_multi_chart.setdefault(casename, {}).setdefault('crash_dates', {})

            case_paser_data_path = DATA_DIR / 'parser'/ f"{casename}.json"
            save_tool_data(case_paser_data_path, single_multi_chart[casename])
        # 删除 casename 对应为空的值
        single_multi_chart = {k: v for k, v in single_multi_chart.items() if v not in (None, '')}

        thread_chart = {k: v for k, v in thread_chart.items() if v not in (None, '')}
        # blue(single_multi_chart)
        return {'single_multi': single_multi_chart, 'thread': thread_chart}


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

# 全局实例  
data_parser = DataParser()