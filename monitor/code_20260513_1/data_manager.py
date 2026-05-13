import json
import re
from pathlib import Path
from datetime import date
from typing import Dict, Any, Optional
import threading
import time

from common import log
from file_finder import find_files
from csv_parser import read_csv_to_dict

# 线程锁，防止并发写入
_file_lock = threading.Lock()


def parse_log_file(file_path: str) -> Dict[str, Dict[str, Dict[str, float]]]:
    """解析单个日志文件 - 高性能版本"""
    daily_metrics = {}
    
    # 提取core数量
    core_match = re.search(r'/thread_([0-9]+)/', file_path)
    cores = int(core_match.group(1)) if core_match else 0
    
    # 预编译正则表达式
    pattern = re.compile(r'dict set\s(\d+)\s+([^\s]+)\s+\{([0-9.]*)\s+[0-9.]+\s+([0-9.]*).*')
    
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith('#'):
                    continue
                
                match = pattern.match(line)
                if match:
                    date_str = match.group(1)
                    stage = match.group(2)
                    runtime = float(match.group(3))
                    memory = float(match.group(4))
                    
                    # 使用字典的 setdefault 方法减少判断
                    daily_metrics.setdefault(date_str, {}).setdefault(stage, {})
                    daily_metrics[date_str][stage]['runtime'] = round(runtime, 2)
                    daily_metrics[date_str][stage]['memory'] = round(memory, 2)
                    daily_metrics[date_str][stage]['cores'] = cores
    
    except Exception as e:
        log(f"解析文件失败 {file_path}: {e}")
    
    return daily_metrics


def load_json_file(path: Path) -> Dict[str, Any]:
    """加载JSON文件"""
    if not path.exists():
        return {}
    
    try:
        with open(path, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception as e:
        log(f"加载JSON失败 {path}: {e}")
        return {}


def save_json_file(path: Path, data: Dict[str, Any]):
    """保存JSON文件（线程安全）"""
    with _file_lock:
        # 创建父目录
        path.parent.mkdir(parents=True, exist_ok=True)
        
        # 先写入临时文件，再重命名
        temp_path = path.with_suffix('.tmp')
        try:
            with open(temp_path, 'w', encoding='utf-8') as f:
                json.dump(data, f, ensure_ascii=False, indent=4)
            temp_path.replace(path)
        except Exception as e:
            log(f"保存JSON失败 {path}: {e}")


def get_data_from_directory(base_path: str, year: int) -> Dict[str, Any]:
    """从目录获取数据"""
    projects_data = {}
    
    # 构建搜索路径
    search_path = f"{base_path}/{year}*"
    txt_files = find_files(
        root_dir=base_path,
        path_patterns=[f"{year}*", "performance*"],
        target_pattern="*.txt",
        max_depth=2
    )
    
    for txt_file in txt_files:
        # 提取case名称
        match = re.search(r'[0-9]+_([^/]+)\.txt', txt_file)
        if not match:
            continue
        
        casename = match.group(1)
        
        if casename not in projects_data:
            projects_data[casename] = {
                'project_name': casename,
                'description': 'qor case监控,非FOM',
                'daily_metrics': {}
            }
        
        projects_data[casename]['daily_metrics'].update(parse_log_file(txt_file))
    
    return projects_data


def merge_json_data(
    new_data: Dict[str, Any],
    old_data: Dict[str, Any],
    date_str: str,
    original_path: str
) -> Dict[str, Any]:
    """合并JSON数据"""
    
    for case_name, case_info in old_data.items():
        if case_name in new_data:
            # 新数据中存在该case
            if date_str in case_info.get('daily_metrics', {}):
                new_data[case_name]['daily_metrics'][date_str] = case_info['daily_metrics'][date_str]
            else:
                # 尝试从原始路径获取
                year = date_str[:4]
                new_date_data = get_data_from_directory(original_path, int(year))
                if case_name in new_date_data:
                    new_data[case_name]['daily_metrics'][date_str] = new_date_data[case_name]['daily_metrics'][date_str]
        else:
            # 新数据中不存在该case
            if date_str in case_info.get('daily_metrics', {}):
                new_data[case_name] = {
                    'project_name': case_name,
                    'description': case_info.get('description', 'qor case监控,非FOM'),
                    'daily_metrics': {
                        date_str: case_info['daily_metrics'][date_str]
                    }
                }
    
    return new_data


def get_json_data(tool: str, original_path: str, data_path: str) -> Dict[str, Any]:
    """获取JSON数据 - 主入口"""
    json_file = Path(data_path)
    
    log(f"获取数据: tool={tool}, path={data_path}")
    
    # 检查JSON文件是否存在
    if not json_file.exists():
        log("JSON文件不存在，重新生成...")
        projects_data = get_data_from_directory(original_path, date.today().year)
        save_json_file(json_file, projects_data)
        return projects_data
    
    # 加载现有数据
    existing_data = load_json_file(json_file)
    
    # 检查是否需要更新
    current_year = date.today().year
    current_date = date.today().strftime("%Y%m%d")
    
    # 检查当前日期是否已存在
    needs_update = True
    for case_data in existing_data.values():
        if current_date in case_data.get('daily_metrics', {}):
            needs_update = False
            break
    
    if needs_update:
        log("检测到新数据，正在更新...")
        new_data = get_data_from_directory(original_path, current_year)
        
        # 合并数据
        for case_name, case_info in new_data.items():
            if case_name in existing_data:
                existing_data[case_name]['daily_metrics'].update(case_info['daily_metrics'])
            else:
                existing_data[case_name] = case_info
        
        save_json_file(json_file, existing_data)
        log("数据更新完成")
    
    return existing_data


def get_perf_data(mem_path: str, cpu_path: str) -> Dict[str, Dict[str, str]]:
    """获取性能数据（MR注释）"""
    mem_data = read_csv_to_dict(Path(mem_path))
    cpu_data = read_csv_to_dict(Path(cpu_path))
    
    return {
        'mem': mem_data,
        'cpu': cpu_data
    }