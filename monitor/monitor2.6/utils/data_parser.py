"""
数据解析器 - 统一入口，根据模式调用对应的解析器
"""


from typing import Dict, List, Any, Optional
import json
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

        single_multi_chart = data_parsers.get('single_multi', {})
        thread_chart = data_parsers.get('thread', {})

        for casename, case_data in all_data.items():
            types = case_data['metrics']
            threads = case_data['threads']
            dates = case_data['dates']
            rules_datas = case_data['rules_data']

            if casename not in single_multi_chart:
                single_multi_chart[casename] = {}

            for rule, date_data in rules_datas.items():
                for date in dates:
                    if date not in date_data and rule == 'Overall':
                        for thread in threads:
                            single_multi_chart = self._mark_crash(single_multi_chart, casename, date, thread)
                    elif date in date_data:
                        thread_datas = date_data[date]
                        for thread in threads:
                            if thread not in thread_datas:
                                single_multi_chart = self._mark_crash(single_multi_chart, casename, date, thread)
                            else:
                                single_multi_chart, thread_chart = self._parse_thread_metrics(
                                    casename, single_multi_chart, thread_chart,
                                    thread_datas, types, rule, thread, date, multi_exists
                                )

            if 'crash_dates' not in single_multi_chart[casename]:
                single_multi_chart[casename]['crash_dates'] = {}

        single_multi_chart = {k: v for k, v in single_multi_chart.items() if v not in (None, '')}
        thread_chart = {k: v for k, v in thread_chart.items() if v not in (None, '')}
        return {'single_multi': single_multi_chart, 'thread': thread_chart}

    def _mark_crash(self, single_multi_chart: dict, casename: str, date: str, thread: str):
        if casename not in single_multi_chart:
            single_multi_chart[casename] = {}
        crash_dates = single_multi_chart[casename].setdefault("crash_dates", {})
        thread_dates = crash_dates.setdefault(thread, [])
        if date not in thread_dates:
            thread_dates.append(date)
        return single_multi_chart

    def _parse_thread_metrics(self, casename: str, single_multi_chart: dict,
                               thread_chart: dict, thread_datas: dict,
                               types: list, rule: str, thread: str,
                               date: str, multi_exists: int):
        data = thread_datas[thread]
        casename_entry = single_multi_chart.setdefault(casename, {})

        thread_chart_updated = False
        if multi_exists == 1:
            thread_casename_entry = thread_chart.setdefault(casename, {})
            thread_chart_updated = True

        for i, metric in enumerate(types):
            metric_entry = casename_entry.setdefault(metric, {})
            rule_entry = metric_entry.setdefault(rule, {})
            thread_entry = rule_entry.setdefault(thread, {})

            date_list = thread_entry.setdefault("date", [])
            data_list = thread_entry.setdefault("data", [])
            date_list.append(date)
            data_list.append(data[i])

            if thread_chart_updated:
                tc_metric = thread_casename_entry.setdefault(metric, {})
                tc_rule = tc_metric.setdefault(rule, {})
                tc_date = tc_rule.setdefault(date, {})
                tc_threads = tc_date.setdefault("threads", [])
                tc_data = tc_date.setdefault("data", [])
                if thread not in tc_threads:
                    tc_threads.append(thread)
                    tc_data.append(data[i])

        return single_multi_chart, thread_chart
# 全局实例  
data_parser = DataParser()