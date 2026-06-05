"""
数据解析函数 - 支持增量解析
"""
from typing import Dict, List, Any, Tuple
from copy import deepcopy
from common import log
import hashlib


def normalize_thread_key(cores: Any) -> str:
    """标准化线程键名"""
    try:
        return str(int(cores))
    except (ValueError, TypeError):
        return '0'


def get_data_signature(project_data: Dict) -> str:
    """
    获取项目数据的签名，用于检测变化
    
    参数:
        project_data: 原始项目数据
        
    返回:
        str: 数据签名
    """
    if not project_data:
        return ""
    
    daily_metrics = project_data.get('daily_metrics', {})
    if not daily_metrics:
        return ""
    
    # 使用日期列表作为签名基础
    dates = sorted(daily_metrics.keys())
    if not dates:
        return ""
    
    # 组合日期和每个日期的阶段数
    signature_parts = []
    for date in dates:
        metrics = daily_metrics.get(date, {})
        rule_count = len(metrics.keys())
        signature_parts.append(f"{date}:{rule_count}")
    
    signature = "|".join(signature_parts)
    return hashlib.md5(signature.encode()).hexdigest()[:16]


def parse_project_data_incremental(
    existing_parsed: Dict,
    new_raw_data: Dict,
    project_id: str
) -> Tuple[Dict, bool]:
    """
    增量解析项目数据
    
    参数:
        existing_parsed: 已存在的解析后数据
        new_raw_data: 新的原始数据（包含全部或增量）
        project_id: 项目ID
        
    返回:
        Tuple[Dict, bool]: (更新后的解析数据, 是否有变化)
    """
    if not existing_parsed:
        # 没有缓存，全量解析
        return parse_project_data(new_raw_data, project_id), True
    
    # 获取新旧日期集合
    old_dates = set(existing_parsed.get('dates', []))
    new_dates = set(new_raw_data.get('daily_metrics', {}).keys())
    
    # 计算需要新增的日期
    added_dates = new_dates - old_dates
    if not added_dates:
        # 没有新增日期，检查是否有日期数据变化
        if not _has_data_changes(existing_parsed, new_raw_data):
            return existing_parsed, False
    
    log(f"增量解析项目 {project_id}: 新增 {len(added_dates)} 个日期")
    
    # 深拷贝现有数据作为基础
    updated_parsed = deepcopy(existing_parsed)
    
    # 获取现有的规则集合
    all_rules = set(updated_parsed.get('rules', []))
    
    # 先收集所有新增日期的规则
    daily_metrics = new_raw_data.get('daily_metrics', {})
    for date in added_dates:
        day_data = daily_metrics.get(date, {})
        all_rules.update(day_data.keys())
    
    # 更新规则列表
    updated_parsed['rules'] = sorted(all_rules)
    
    # 更新日期列表
    all_dates = sorted(old_dates | new_dates)
    updated_parsed['dates'] = all_dates
    updated_parsed['available_dates'] = sorted(
        set(updated_parsed.get('available_dates', [])) | new_dates
    )
    
    # 为每个规则添加新日期的数据
    for rule in all_rules:
        if rule not in updated_parsed['rule_data']:
            # 新增规则
            updated_parsed['rule_data'][rule] = _create_empty_rule_data(all_dates)
        
        rule_info = updated_parsed['rule_data'][rule]
        
        # 确保日期列表完整
        if len(rule_info['dates']) < len(all_dates):
            # 补齐缺失的日期
            existing_dates = set(rule_info['dates'])
            missing_dates = set(all_dates) - existing_dates
            for missing_date in sorted(missing_dates):
                idx = all_dates.index(missing_date)
                rule_info['dates'].insert(idx, missing_date)
                # 为所有线程补齐数据
                for thread_key in rule_info['thread_metrics'].keys():
                    thread_info = rule_info['thread_metrics'][thread_key]
                    thread_info['runtimes'].insert(idx, None)
                    thread_info['memories'].insert(idx, None)
                    thread_info['cores'].insert(idx, None)
        
        # 处理新增日期的数据
        for date in added_dates:
            idx = all_dates.index(date)
            day_data = daily_metrics.get(date, {})
            rule_raw = day_data.get(rule)
            
            # 更新规则数据
            _update_rule_info(rule_info, rule_raw, idx)
    
    return updated_parsed, True


def _has_data_changes(existing_parsed: Dict, new_raw_data: Dict) -> bool:
    """
    检查现有数据与新的原始数据是否有变化（数据值变化，非新增）
    
    参数:
        existing_parsed: 已存在的解析数据
        new_raw_data: 新的原始数据
        
    返回:
        bool: 是否有变化
    """
    existing_dates = set(existing_parsed.get('dates', []))
    new_dates = set(new_raw_data.get('daily_metrics', {}).keys())
    
    # 只检查共同日期的数据是否有变化
    common_dates = existing_dates & new_dates
    if not common_dates:
        return False
    
    daily_metrics = new_raw_data.get('daily_metrics', {})
    
    for date in common_dates:
        new_day_data = daily_metrics.get(date, {})
        # 检查共同日期中已有规则的数据是否有变化
        for rule in existing_parsed.get('rules', []):
            if rule not in new_day_data:
                continue
            new_rule_raw = new_day_data[rule]
            existing_rule_info = existing_parsed['rule_data'].get(rule)
            if existing_rule_info:
                idx = existing_rule_info['dates'].index(date) if date in existing_rule_info['dates'] else -1
                if idx >= 0 and _has_rule_data_changed(existing_rule_info, new_rule_raw, idx):
                    return True
    
    return False


def _has_rule_data_changed(rule_info: Dict, new_rule_raw: Dict, idx: int) -> bool:
    """
    检查单个规则的数据是否有变化
    
    参数:
        rule_info: 现有的规则信息
        new_rule_raw: 新的原始规则数据
        idx: 日期索引
        
    返回:
        bool: 是否有变化
    """
    if not new_rule_raw:
        return False
    
    # 处理多线程情况
    if 'thread_metrics' in new_rule_raw:
        for thread_key, thread_values in new_rule_raw['thread_metrics'].items():
            thread_key = str(thread_key)
            if thread_key not in rule_info['thread_metrics']:
                return True
            
            existing_thread = rule_info['thread_metrics'][thread_key]
            new_runtime = thread_values.get('runtime')
            new_memory = thread_values.get('memory')
            
            if idx < len(existing_thread['runtimes']):
                if existing_thread['runtimes'][idx] != new_runtime:
                    return True
                if existing_thread['memories'][idx] != new_memory:
                    return True
    else:
        # 单线程情况
        thread_key = '0'
        if thread_key not in rule_info['thread_metrics']:
            return True
        
        existing_thread = rule_info['thread_metrics'][thread_key]
        new_runtime = new_rule_raw.get('runtime')
        new_memory = new_rule_raw.get('memory')
        
        if idx < len(existing_thread['runtimes']):
            if existing_thread['runtimes'][idx] != new_runtime:
                return True
            if existing_thread['memories'][idx] != new_memory:
                return True
    
    return False


def _create_empty_rule_data(dates: List[str]) -> Dict:
    """
    创建空的规则数据结构
    
    参数:
        dates: 日期列表
        
    返回:
        Dict: 空的规则数据
    """
    n = len(dates)
    return {
        'dates': dates.copy(),
        'thread_metrics': {},
        'thread_counts': [],
        'runtimes': [None] * n,
        'memories': [None] * n,
        'cores': [None] * n
    }


def _update_rule_info(rule_info: Dict, rule_raw: Dict, idx: int) -> None:
    """
    更新规则信息（单日期）
    
    参数:
        rule_info: 规则信息对象
        rule_raw: 原始规则数据
        idx: 日期索引
    """
    if not rule_raw:
        return
    
    # 获取当前线程集合
    current_threads = set(rule_info['thread_metrics'].keys())
    new_threads = set()
    
    if 'thread_metrics' in rule_raw and isinstance(rule_raw['thread_metrics'], dict):
        # 多线程格式：遍历所有线程
        for thread_key in rule_raw['thread_metrics'].keys():
            new_threads.add(str(thread_key))
    else:
        # 单线程格式：只有线程0
        new_threads.add('0')
    
    # 初始化缺失的线程数据结构
    for thread_key in current_threads | new_threads:
        if thread_key not in rule_info['thread_metrics']:
            rule_info['thread_metrics'][thread_key] = {
                'runtimes': [None] * len(rule_info['dates']),
                'memories': [None] * len(rule_info['dates']),
                'cores': [None] * len(rule_info['dates'])
            }
    
    # 更新线程数据
    if 'thread_metrics' in rule_raw and isinstance(rule_raw['thread_metrics'], dict):
        # 多线程格式
        for thread_key, thread_values in rule_raw['thread_metrics'].items():
            thread_key = str(thread_key)
            if thread_key not in rule_info['thread_metrics']:
                continue
            
            thread_info = rule_info['thread_metrics'][thread_key]
            if idx < len(thread_info['runtimes']):
                thread_info['runtimes'][idx] = thread_values.get('runtime')
                thread_info['memories'][idx] = thread_values.get('memory')
                thread_info['cores'][idx] = thread_values.get('cores')
    else:
        # 单线程格式 - 当作线程0处理
        thread_key = '0'
        if thread_key in rule_info['thread_metrics']:
            thread_info = rule_info['thread_metrics'][thread_key]
            if idx < len(thread_info['runtimes']):
                thread_info['runtimes'][idx] = rule_raw.get('runtime')
                thread_info['memories'][idx] = rule_raw.get('memory')
                thread_info['cores'][idx] = int(rule_raw.get('cores', 0))
    
    # 更新 thread_counts
    thread_counts = [int(k) for k in rule_info['thread_metrics'].keys()]
    thread_counts.sort()
    rule_info['thread_counts'] = [str(x) for x in thread_counts]
    
    # 设置默认线程（优先线程0，否则第一个线程）
    default_thread = '0' if '0' in rule_info['thread_metrics'] else (
        rule_info['thread_counts'][0] if rule_info['thread_counts'] else None
    )
    if default_thread:
        rule_info['runtimes'] = rule_info['thread_metrics'][default_thread]['runtimes']
        rule_info['memories'] = rule_info['thread_metrics'][default_thread]['memories']
        rule_info['cores'] = rule_info['thread_metrics'][default_thread]['cores']


def parse_project_data(project_data: Dict, project_id: str) -> Dict:
    """
    全量解析项目数据（保持原有功能）
    
    参数:
        project_data: 原始项目数据
        project_id: 项目ID
        
    返回:
        Dict: 解析后的数据
    """
    daily_metrics = project_data.get('daily_metrics', project_data)
    
    # 收集所有阶段名称
    all_rules = sorted(set().union(*[tools_dict.keys() for tools_dict in daily_metrics.values()]))
    
    # 按日期排序
    sorted_dates = sorted(daily_metrics.keys())
    available_dates = sorted(set(project_data.get('available_dates', sorted_dates)))
    
    rule_data = {}
    for rule in all_rules:
        rule_info = _create_empty_rule_data(sorted_dates)
        
        for idx, date in enumerate(sorted_dates):
            rule_raw = daily_metrics.get(date, {}).get(rule)
            _update_rule_info(rule_info, rule_raw, idx)
        
        rule_data[rule] = rule_info

    return {
        'dates': sorted_dates,
        'available_dates': available_dates,
        'rules': all_rules,
        'rule_data': rule_data,
        'project_name': project_data.get('project_name', project_id),
        'description': project_data.get('description', '')
    }


def refresh_parsed_projects(current_projects_data: Dict, cached_parsed: Dict = None) -> Tuple[Dict, List]:
    """
    刷新解析后的项目数据（支持增量）
    
    参数:
        current_projects_data: 当前原始项目数据
        cached_parsed: 缓存的解析数据（可选）
        
    返回:
        Tuple[Dict, List]: (解析后的项目数据, 项目列表)
    """
    log("整理数据（增量模式）")
    parsed_projects = cached_parsed if cached_parsed is not None else {}
    has_changes = False
    
    for project_id, project_data in current_projects_data.items():
        existing = parsed_projects.get(project_id)
        
        # 增量解析
        parsed, changed = parse_project_data_incremental(existing, project_data, project_id)
        parsed_projects[project_id] = parsed
        
        if changed:
            has_changes = True
        
        # 确保有 project_name 和 description
        if 'project_name' not in parsed_projects[project_id]:
            parsed_projects[project_id]['project_name'] = project_data.get('project_name', project_id)
        if 'description' not in parsed_projects[project_id]:
            parsed_projects[project_id]['description'] = project_data.get('description', '')
    
    # 构建项目列表
    project_list = [
        {'id': pid, 'name': info.get('project_name', pid), 'description': info.get('description', '')}
        for pid, info in parsed_projects.items()
    ]
    
    if has_changes:
        log("检测到数据变化，已更新解析缓存")
    
    return parsed_projects, project_list