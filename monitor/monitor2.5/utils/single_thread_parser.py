"""
单线程数据解析器 - 专门处理单线程数据
"""
from hmac import new
from typing import Dict, List, Any, Optional
from tool.elint.elint import save_json
from utils.common import *
from config import DATA_DIR, BASE_DIR
from utils.log import *

class SingleThreadParser:
    """单线程数据解析器"""
    
    def __init__(self):
        setup_logger(log_dir='logs', level='DEBUG')
        self.logger = get_logger(__name__)
        self.logger.info("数据管理器初始化")
    # 解析单线程数据
    def parse_single_data(self, tool_id: str, mode: str, all_data):
        """
        解析单线程数据
        
        参数:
            tool_id: 工具ID
            data: 原始数据
        """
        # 记录 case 有哪些 rule 有哪些 date
        casename_rule_dates = {}
        for casename, case_data in all_data.items():
            daily_metrics = case_data.get('daily_metrics', {})
            dates = sorted(list(daily_metrics.keys()))
            crash_dates = self.judge_date_is_overall(dates, daily_metrics)

            rule_dates_cputime = {}
            rule_dates_peakmem = {}
            rule_dates_realtime = {}
            rule_dates_incmen = {}
            rule_dates_realtimeincmen = {}
            for date in dates:
                rule_results = daily_metrics[date]
                for rule, result in rule_results.items():
                    # 记录有那些 日期
                    rule_dates_cputime.setdefault(rule, {})[date] = result.get('cputime', {})
                    rule_dates_peakmem.setdefault(rule, {})[date] = result.get('peakmem', {})
                    rule_dates_realtime.setdefault(rule, {})[date] = result.get('realtime', {})
                    rule_dates_incmen.setdefault(rule, {})[date] = result.get('incmen', {})
                    rule_dates_realtimeincmen.setdefault(rule, {})[date] = result.get('realtimeincmen', {})

            rule_dates_cputime = self.record_paser_rules(tool_id, casename, rule_dates_cputime, crash_dates, 'cputime')
            rule_dates_peakmem = self.record_paser_rules(tool_id, casename, rule_dates_peakmem, crash_dates, 'peakmem')
            rule_dates_realtime = self.record_paser_rules(tool_id, casename, rule_dates_realtime, crash_dates, 'realtime')
            rule_dates_incmen = self.record_paser_rules(tool_id, casename, rule_dates_incmen, crash_dates, 'incmen')
            rule_dates_realtimeincmen = self.record_paser_rules(tool_id, casename, rule_dates_realtimeincmen, crash_dates, 'realtimeincmen')
            casename_rule_dates[casename] = {
                'cputime': rule_dates_cputime,
                'peakmem': rule_dates_peakmem,
                'realtime': rule_dates_realtime,
                'incmen': rule_dates_incmen,
                'realtimeincmen': rule_dates_realtimeincmen
            }

        return casename_rule_dates
    # 记录解析到的规则数据
    def record_paser_rules(self, tool_id: str, casename: str, runtime_or_memory_data: Dict, crash_dates: List[str], type: str):
        """
        记录解析到的规则数据
        
        参数:
            rule_dates_cputime: 运行时数据
            rule_dates_peakmem: 内存数据
        """
        # 记录 rule 有那些日期
        rule_dates = {}
        logger.info(f"开始记录解析到的规则数据，tool_id: {tool_id}, casename: {casename}, type: {type}")
        for rule, data in runtime_or_memory_data.items():
            rule_path = DATA_DIR / tool_id / "original" / 'single' / casename  / type /f'{rule}.json'
            if not rule_path.exists():
                rule_path.parent.mkdir(parents=True, exist_ok=True)
            all_values = []
            all_dates = []
            for date, values in data.items():
                all_values.append(values)
                all_dates.append(date)
            rule_data = {
                'dates': all_dates,
                'rules': {
                    rule:{
                        'dates': all_dates,
                        'values': all_values,
                        'type': 'line',
                        'name': rule,
                        'is_single': True
                    }
                },
                'crash_dates': crash_dates,
                'overall_data': None
            }
            rule_dates[rule] = all_dates
            
            rule_data = self.increment_rule_data(rule_data, rule_path, rule)
            save_tool_data(rule_path, rule_data)
        return rule_dates
    # 增加规则数据
    def increment_rule_data(self, rule_data: Dict, data_path: str, rule: str):
        """
        增加规则数据
        
        参数:
            rule_data: 规则数据
            date: 日期字符串
            values: 新值
        """

        if data_path.exists():
            print("增量更新数据中")
            new_rule_data = {}
            old_rule_data = load_tool_data(data_path)
            if rule not in old_rule_data["rules"]:
                new_rule_data = rule_data
                return new_rule_data

            new_rule_data["dates"] = old_rule_data["dates"] + rule_data["dates"]

            new_rule_data.setdefault("rules", {}).setdefault(rule, {})["dates"] = old_rule_data["rules"][rule]["dates"] + rule_data["rules"][rule]["dates"]
            new_rule_data.setdefault("rules", {}).setdefault(rule, {})["values"] = old_rule_data["rules"][rule]["values"] + rule_data["rules"][rule]["values"]
            new_rule_data.setdefault("rules", {}).setdefault(rule, {})["type"] = rule_data["rules"][rule]["type"]
            new_rule_data.setdefault("rules", {}).setdefault(rule, {})["name"] = rule_data["rules"][rule]["name"]
            new_rule_data.setdefault("rules", {}).setdefault(rule, {})["is_single"] = rule_data["rules"][rule]["is_single"]

            new_rule_data["crash_dates"] = list(set(old_rule_data["crash_dates"]) | set(rule_data["crash_dates"]))
            new_rule_data["overall_data"] = old_rule_data["overall_data"]
            return new_rule_data
        else:
            return rule_data

    # 检查日期日期是否有Overall数据
    def judge_date_is_overall(self, dates: List[str], daily_metrics: Dict) -> List:
        """
        判断日期日期是否有Overall数据
        
        参数:
            date: 日期字符串
            daily_metrics: 每日指标数据
        
        返回:
            如果日期Overall数据存在则返回True，否则返回False
        """
        overall_data = {}
        for date in dates:
            if date in daily_metrics:
                overall = daily_metrics[date].get('Overall')
                if not overall:
                    overall_data[date] = None
            else:
                overall_data[date] = None
        return overall_data
        
