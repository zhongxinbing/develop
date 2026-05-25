from common import log
# ==================================================
# 数据解析函数
# ==================================================

def normalize_thread_key(cores):
    """标准化线程键名"""
    try:
        return str(int(cores))
    except Exception:
        return '0'


def parse_project_data(project_data, project_id):
    """
    解析项目数据，支持三层结构：日期 -> 阶段 -> 指标
    
    参数:
        project_data: dict - 原始项目数据
        project_id: str - 项目ID
    
    返回:
        dict: 解析后的数据结构
    """
    # 获取每日指标数据
    if 'daily_metrics' in project_data:
        daily_metrics = project_data['daily_metrics']
    else:
        daily_metrics = project_data

    # 收集所有阶段名称
    all_rules = set()
    for date, tools_dict in daily_metrics.items():
        all_rules.update(tools_dict.keys())
    all_rules = sorted(list(all_rules))

    # 按日期排序
    sorted_dates = sorted(daily_metrics.keys())
    available_dates = sorted(set(project_data.get('available_dates', sorted_dates)))

    # 为每个阶段构建数据
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

            # 确保所有已知线程数据行在每个日期都有占位符
            current_threads = set(rule_data[rule]['thread_metrics'].keys())
            new_threads = set()
            if rule_info and isinstance(rule_info, dict):
                if 'thread_metrics' in rule_info and isinstance(rule_info['thread_metrics'], dict):
                    new_threads = set(str(k) for k in rule_info['thread_metrics'].keys())
                else:
                    new_threads = {normalize_thread_key(rule_info.get('cores', 0))}

            # 初始化缺失的线程数据结构
            for thread_key in current_threads | new_threads:
                if thread_key not in rule_data[rule]['thread_metrics']:
                    rule_data[rule]['thread_metrics'][thread_key] = {
                        'runtimes': [None] * idx,
                        'memories': [None] * idx,
                        'cores': [None] * idx
                    }

            # 扩展现有线程的数据列表
            for thread_key, thread_info in rule_data[rule]['thread_metrics'].items():
                if len(thread_info['runtimes']) <= idx:
                    thread_info['runtimes'].append(None)
                    thread_info['memories'].append(None)
                    thread_info['cores'].append(None)

            if not rule_info:
                continue

            # 解析线程数据
            if 'thread_metrics' in rule_info and isinstance(rule_info['thread_metrics'], dict):
                for thread_key, thread_values in rule_info['thread_metrics'].items():
                    thread_key = str(thread_key)
                    if thread_key not in rule_data[rule]['thread_metrics']:
                        rule_data[rule]['thread_metrics'][thread_key] = {
                            'runtimes': [None] * idx,
                            'memories': [None] * idx,
                            'cores': [None] * idx
                        }
                    rule_data[rule]['thread_metrics'][thread_key]['runtimes'][idx] = thread_values.get('runtime')
                    rule_data[rule]['thread_metrics'][thread_key]['memories'][idx] = thread_values.get('memory')
                    rule_data[rule]['thread_metrics'][thread_key]['cores'][idx] = thread_values.get('cores')
            else:
                thread_key = normalize_thread_key(rule_info.get('cores', 0))
                if thread_key not in rule_data[rule]['thread_metrics']:
                    rule_data[rule]['thread_metrics'][thread_key] = {
                        'runtimes': [None] * idx,
                        'memories': [None] * idx,
                        'cores': [None] * idx
                    }
                rule_data[rule]['thread_metrics'][thread_key]['runtimes'][idx] = rule_info.get('runtime')
                rule_data[rule]['thread_metrics'][thread_key]['memories'][idx] = rule_info.get('memory')
                rule_data[rule]['thread_metrics'][thread_key]['cores'][idx] = int(thread_key)

        # 排序线程数
        thread_counts = sorted(
            [int(k) for k in rule_data[rule]['thread_metrics'].keys()],
            key=lambda x: x
        )
        thread_counts = [str(x) for x in thread_counts]
        rule_data[rule]['thread_counts'] = thread_counts

        # 设置默认线程（0或最小线程数）
        default_thread = '0' if '0' in rule_data[rule]['thread_metrics'] else (thread_counts[0] if thread_counts else None)
        if default_thread:
            rule_data[rule]['runtimes'] = rule_data[rule]['thread_metrics'][default_thread]['runtimes']
            rule_data[rule]['memories'] = rule_data[rule]['thread_metrics'][default_thread]['memories']
            rule_data[rule]['cores'] = rule_data[rule]['thread_metrics'][default_thread]['cores']
        else:
            rule_data[rule]['runtimes'] = [None] * len(sorted_dates)
            rule_data[rule]['memories'] = [None] * len(sorted_dates)
            rule_data[rule]['cores'] = [None] * len(sorted_dates)

    return {
        'dates': sorted_dates,
        'available_dates': available_dates,
        'rules': all_rules,
        'rule_data': rule_data
    }


def get_local_ip():
    """获取本机局域网IP地址"""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        try:
            hostname = socket.gethostname()
            ip = socket.gethostbyname(hostname)
            return ip
        except Exception:
            return "无法获取IP"


def refresh_parsed_projects(current_projects_data):
    """
    刷新解析后的项目数据
    
    参数:
        current_projects_data: dict - 当前项目数据
    """
    global parsed_projects, project_list
    log("整理数据")
    parsed_projects = {}
    print(f"刷新解析数据，原始项目数量: {len(current_projects_data)}")

    for project_id, project_data in current_projects_data.items():
        parsed_projects[project_id] = parse_project_data(project_data, project_id)
        parsed_projects[project_id]['project_name'] = project_data.get('project_name', project_id)
        parsed_projects[project_id]['description'] = project_data.get('description', '')
    
    project_list = [
        {'id': pid, 'name': info['project_name'], 'description': info['description']}
        for pid, info in parsed_projects.items()
    ]
    return (parsed_projects, project_list)

