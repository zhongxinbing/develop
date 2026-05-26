"""
数据解析函数
"""
from typing import Dict, List, Any, Tuple
from common import log


def normalize_thread_key(cores: Any) -> str:
    """标准化线程键名"""
    try:
        return str(int(cores))
    except (ValueError, TypeError):
        return '0'


def parse_project_data(project_data: Dict, project_id: str) -> Dict:
    """
    解析项目数据，支持三层结构：日期 -> 阶段 -> 指标
    """
    daily_metrics = project_data.get('daily_metrics', project_data)
    
    # 收集所有阶段名称
    all_rules = sorted(set().union(*[tools_dict.keys() for tools_dict in daily_metrics.values()]))
    
    # 按日期排序
    sorted_dates = sorted(daily_metrics.keys())
    available_dates = sorted(set(project_data.get('available_dates', sorted_dates)))
    
    rule_data = {}
    for rule in all_rules:
        rule_data[rule] = {
            'dates': [],
            'thread_metrics': {},
            'thread_counts': [],
            'runtimes': [],
            'memories': [],
            'cores': []
        }
        
        for idx, date in enumerate(sorted_dates):
            rule_data[rule]['dates'].append(date)
            rule_info = daily_metrics.get(date, {}).get(rule)
            
            # 获取当前线程集合
            current_threads = set(rule_data[rule]['thread_metrics'].keys())
            new_threads = set()
            
            if rule_info and isinstance(rule_info, dict):
                if 'thread_metrics' in rule_info and isinstance(rule_info['thread_metrics'], dict):
                    # 多线程格式：遍历所有线程
                    for thread_key in rule_info['thread_metrics'].keys():
                        new_threads.add(str(thread_key))
                else:
                    # 单线程格式：只有线程0
                    new_threads.add('0')
            
            # 初始化缺失的线程数据结构
            for thread_key in current_threads | new_threads:
                if thread_key not in rule_data[rule]['thread_metrics']:
                    rule_data[rule]['thread_metrics'][thread_key] = {
                        'runtimes': [],
                        'memories': [],
                        'cores': []
                    }
                # 确保每个线程的数据列表长度与日期索引对齐
                thread_info = rule_data[rule]['thread_metrics'][thread_key]
                while len(thread_info['runtimes']) <= idx:
                    thread_info['runtimes'].append(None)
                while len(thread_info['memories']) <= idx:
                    thread_info['memories'].append(None)
                while len(thread_info['cores']) <= idx:
                    thread_info['cores'].append(None)
            
            if not rule_info:
                continue
            
            # 解析线程数据
            if 'thread_metrics' in rule_info and isinstance(rule_info['thread_metrics'], dict):
                # 多线程格式
                for thread_key, thread_values in rule_info['thread_metrics'].items():
                    thread_key = str(thread_key)
                    if thread_key not in rule_data[rule]['thread_metrics']:
                        rule_data[rule]['thread_metrics'][thread_key] = {
                            'runtimes': [None] * len(sorted_dates),
                            'memories': [None] * len(sorted_dates),
                            'cores': [None] * len(sorted_dates)
                        }
                    rule_data[rule]['thread_metrics'][thread_key]['runtimes'][idx] = thread_values.get('runtime')
                    rule_data[rule]['thread_metrics'][thread_key]['memories'][idx] = thread_values.get('memory')
                    rule_data[rule]['thread_metrics'][thread_key]['cores'][idx] = thread_values.get('cores')
            else:
                # 单线程格式 - 当作线程0处理
                thread_key = '0'
                if thread_key not in rule_data[rule]['thread_metrics']:
                    rule_data[rule]['thread_metrics'][thread_key] = {
                        'runtimes': [None] * len(sorted_dates),
                        'memories': [None] * len(sorted_dates),
                        'cores': [None] * len(sorted_dates)
                    }
                rule_data[rule]['thread_metrics'][thread_key]['runtimes'][idx] = rule_info.get('runtime')
                rule_data[rule]['thread_metrics'][thread_key]['memories'][idx] = rule_info.get('memory')
                rule_data[rule]['thread_metrics'][thread_key]['cores'][idx] = int(rule_info.get('cores', 0))
        
        # 构建 thread_counts（所有线程ID）
        thread_counts = [int(k) for k in rule_data[rule]['thread_metrics'].keys()]
        thread_counts.sort()
        rule_data[rule]['thread_counts'] = [str(x) for x in thread_counts]
        
        # 设置默认线程（优先线程0，否则第一个线程）
        default_thread = '0' if '0' in rule_data[rule]['thread_metrics'] else (rule_data[rule]['thread_counts'][0] if rule_data[rule]['thread_counts'] else None)
        if default_thread:
            rule_data[rule]['runtimes'] = rule_data[rule]['thread_metrics'][default_thread]['runtimes']
            rule_data[rule]['memories'] = rule_data[rule]['thread_metrics'][default_thread]['memories']
            rule_data[rule]['cores'] = rule_data[rule]['thread_metrics'][default_thread]['cores']
        else:
            n = len(sorted_dates)
            rule_data[rule]['runtimes'] = [None] * n
            rule_data[rule]['memories'] = [None] * n
            rule_data[rule]['cores'] = [None] * n

    return {
        'dates': sorted_dates,
        'available_dates': available_dates,
        'rules': all_rules,
        'rule_data': rule_data
    }
def refresh_parsed_projects(current_projects_data: Dict) -> Tuple[Dict, List]:
    """刷新解析后的项目数据"""
    global parsed_projects, project_list
    
    log("整理数据")
    parsed_projects = {}
    
    for project_id, project_data in current_projects_data.items():
        parsed_projects[project_id] = parse_project_data(project_data, project_id)
        parsed_projects[project_id]['project_name'] = project_data.get('project_name', project_id)
        parsed_projects[project_id]['description'] = project_data.get('description', '')
    
    project_list = [
        {'id': pid, 'name': info['project_name'], 'description': info['description']}
        for pid, info in parsed_projects.items()
    ]
    
    return parsed_projects, project_list


# 全局变量
parsed_projects: Dict = {}
project_list: List = []