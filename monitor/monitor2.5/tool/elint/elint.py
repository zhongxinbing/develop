"""
获取 elint 工具的数据 - 支持增量解析
"""
import os
import re
import time
import json
import csv
from pathlib import Path
from datetime import datetime, timedelta
from typing import Dict, List, Any, Optional, Tuple, Union

from utils.find_files import *
from utils.log import *
from utils.common import *

logger = get_logger(__name__)


def log(msg: str) -> None:
    """带时间戳的日志输出"""
    print(f"{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}: {msg}")


def load_json(path) -> Dict:
    """加载JSON文件"""
    try:
        with open(path, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception as e:
        logger.error(f"加载JSON失败 {path}: {e}")
        return {}


def save_json(json_path, data):
    """保存数据到JSON文件"""
    try:
        with open(json_path, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=4)
    except Exception as e:
        logger.error(f"保存JSON失败 {json_path}: {e}")


# ==================== 单线程数据解析 ====================

def gen_dict_data(caseData, data, thread, type):
    """生成字典数据"""
    rules = ["Overall", "read_design", "check_lint", "save_session"]
    rule_data = {}
    for item in data:
        rulename = item[0]
        cputime = float(item[1])
        if type == 1:
            peakmem = float(item[2])
        elif type == 2:
            realtime = float(item[2])
            peakmem = float(item[3])
            incmem = float(item[4]) if item[4] != "NA" else -1
            realtimeincmem = float(item[5]) if item[5] != "NA" else -1

        if rulename in rules:
            rule_data[rulename] = {
                "cputime": cputime,
                "peakmem": peakmem,
                "realtime": -1 if type == 1 else realtime,
                "incmem": -1 if type == 1 else incmem,
                "realtimeincmem": -1 if type == 1 else realtimeincmem
            }
        else:
            rule_data[rulename] = {
                "cputime": cputime,
                "peakmem": peakmem,
                "realtime": -1 if type == 1 else realtime,
                "incmem": -1 if type == 1 else incmem,
                "realtimeincmem": -1 if type == 1 else realtimeincmem
            }
    return rule_data


def get_data_from_txt_single(file_paths: List[str], existing_data: Dict = None) -> Dict:
    """
    从txt文件获取日期数据（增量解析）
    
    Args:
        file_paths: 要解析的文件路径列表
        existing_data: 已有的数据（用于增量合并）
    
    Returns:
        解析后的数据
    """
    case_data = existing_data or {}
    
    for txt in file_paths:
        txtname = Path(txt).name
        match = re.findall(r'(\d{8})_(.*)\.txt', txtname)
        if not match:
            continue
        date, casename = match[0]

        if casename not in case_data:
            case_data[casename] = {
                "casename": casename,
                "daily_metrics": {},
                "available_dates": []
            }
        if date not in case_data[casename]["daily_metrics"]:
            case_data[casename]["daily_metrics"][date] = {}

        try:
            with open(txt, 'r', encoding='utf-8') as f:
                content = f.read()
                data = re.findall(r"dict set \d{8} ([^\s]+) {([0-9.,]+) ([0-9.,]+) ([0-9.,]+)}", content)
                typeStr = 1
                if not data:
                    data = re.findall(
                        r"dict set \d{8} ([^\s]+) {([-0-9.,]+) ([-0-9.,]+) ([-0-9.,]+) ([-0-9.,NA]+) ([-0-9.,NA]+)}",
                        content
                    )
                    typeStr = 2
                case_data[casename]["daily_metrics"][date] = gen_dict_data(
                    case_data[casename]["daily_metrics"][date], data, 0, typeStr
                )
                if date not in case_data[casename]["available_dates"]:
                    case_data[casename]["available_dates"].append(date)
        except Exception as e:
            logger.error(f"解析文件失败 {txt}: {e}")

    return case_data


def get_elint_performance(original_path: Union[str, List[str]], flag: int = 0) -> Union[List[str], Dict]:
    """
    获取 elint 性能数据
    
    Args:
        original_path: 文件路径或目录路径
        flag: 0-返回文件列表, 1-解析数据
    
    Returns:
        文件列表或解析后的数据
    """
    if flag == 0:
        # 返回文件列表
        if isinstance(original_path, str):
            return find(original_path, maxdepth=3, name_pattern=r"^\d{8}_[^/]+\.txt$", file_type="f")
        return []
    else:
        # 解析数据
        if isinstance(original_path, list):
            return get_data_from_txt_single(original_path)
        return {}


def get_incremental_data(existing_data: Dict, new_files: List[str]) -> Tuple[Dict, List[str]]:
    """
    增量获取新增数据
    
    Args:
        existing_data: 已有数据
        new_files: 新文件列表
    
    Returns:
        (更新后的数据, 合并后的文件列表)
    """
    if not new_files:
        return existing_data, []
    
    logger.info(f"发现 {len(new_files)} 个新文件，进行增量更新")
    new_data = get_data_from_txt_single(new_files)
    merged_data = deep_merge(existing_data, new_data)
    
    return merged_data, new_files


def get_elint_data(jsonDataFile, original_path) -> Dict:
    """
    获取 elint 数据，支持增量更新
    
    Args:
        jsonDataFile: JSON数据文件路径
        original_path: 原始数据文件路径
    
    Returns:
        dict: 项目数据
    """
    logger.info("开始获取工具单线程的数据")
    json_path = Path(jsonDataFile) if jsonDataFile else None

    current_data_files = sorted(find(original_path, maxdepth=3, name_pattern=r"^\d{8}_[^/]+\.txt$", file_type="f"))

    if json_path and json_path.exists():
        try:
            last_case_data = load_json(json_path)
            last_data_files = last_case_data.get("dataFiles", [])
            add_data_files = list(set(current_data_files) - set(last_data_files))
            
            if add_data_files:
                logger.info(f"发现 {len(add_data_files)} 个新文件")
                new_case_data, merged_files = get_incremental_data(last_case_data, add_data_files)
                new_case_data["dataFiles"] = merged_files
                save_json(json_path, new_case_data)
                return new_case_data
            else:
                logger.info("数据不需要更新")
                return last_case_data
        except Exception as e:
            logger.error(f"读取JSON文件失败: {e}，将重新获取")
            new_case_data, _ = get_elint_performance(original_path, 1)
            if json_path:
                save_json(json_path, new_case_data)
            return new_case_data
    else:
        logger.info("JSON文件不存在，将创建新文件")
        new_case_data, _ = get_elint_performance(original_path, 1)
        if json_path:
            save_json(json_path, new_case_data)
        return new_case_data


# ==================== MR更新数据 ====================

def read_csv(path):
    """读取CSV文件，返回日期到评论的映射"""
    data = {}
    try:
        with open(path, 'r', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            for row in reader:
                time_str = row['Date']
                time_str = datetime.strptime(time_str, "%Y-%m-%d").strftime("%Y%m%d")
                data[time_str] = row['comment']
    except Exception as e:
        logger.error(f"读取CSV文件失败 {path}: {e}")
    return data


def get_perf(mrPath):
    """获取性能数据（MR更新信息）"""
    try:
        mem_data = read_csv(Path(mrPath) / "lint_mem.csv")
        cpu_data = read_csv(Path(mrPath) / "lint_cpu.csv")
        logger.info(f"解析 MR 数据: cpu:{len(cpu_data)} mem:{len(mem_data)}")
        return {"mem": mem_data, "cpu": cpu_data}
    except Exception as e:
        logger.error(f"获取MR数据失败: {e}")
        return {"mem": {}, "cpu": {}}


# ==================== 多线程数据解析 ====================

def get_data_json(rule_data, data, thread):
    """从多线程日志中解析性能数据"""
    for item in data:
        if len(item) == 0:
            continue
        rule = item[0]
        rules = ["Overall", "read_design", "check_lint", "save_session"]

        cputime = float(item[1].replace(',', ''))
        realtime = float(item[2].replace(',', ''))
        peakmem = float(item[3].replace(',', ''))
        incmem = -1 if rule in rules else float(item[4].replace(',', ''))
        realtimeincmem = -1 if rule in rules else float(item[5].replace(',', ''))

        if re.fullmatch(r'^\[.*', rule):
            rule = re.findall(r'\[.*\]\[(.*)\]', rule)[0]
        if rule not in rule_data:
            rule_data[rule] = {"thread_metrics": {}}
        rule_data[rule]["thread_metrics"][thread] = {
            "cputime": cputime,
            "peakmem": peakmem,
            "incmem": incmem,
            "realtime": realtime,
            "realtimeincmem": realtimeincmem
        }
    return rule_data


def time_to_seconds(time_str: str) -> float:
    """将时间字符串转换为秒数"""
    hours = mins = secs = 0
    hour_match = re.search(r'(\d+(?:\.\d+)?)\s*hours?', time_str, re.IGNORECASE)
    if hour_match:
        hours = float(hour_match.group(1))
    min_match = re.search(r'(\d+(?:\.\d+)?)\s*mins?', time_str, re.IGNORECASE)
    if min_match:
        mins = float(min_match.group(1))
    sec_match = re.search(r'(\d+(?:\.\d+)?)\s*secs?', time_str, re.IGNORECASE)
    if sec_match:
        secs = float(sec_match.group(1))
    return timedelta(hours=hours, minutes=mins, seconds=secs).total_seconds()


def get_runtime(content: str) -> List[tuple]:
    """从日志内容中提取运行时数据"""
    overall = re.findall(
        r'(Overall|read_design|check_lint|save_session)\s+\|\s([^|]+)\s\|\s([^|]+)\s\|\s([^|]+)\s\|',
        content
    )
    new = []
    for command in overall:
        name = command[0]
        elapse = time_to_seconds(command[1])
        cpu = time_to_seconds(command[2])
        peak = command[3].strip()
        new.append((name, f"{cpu}", f"{elapse}", f"{peak}", "null"))
    return new


def get_data_from_log(file_paths: List[str], existing_data: Dict = None) -> Dict:
    """从日志文件解析多线程数据（增量解析）"""
    case_data = existing_data or {}
    
    for log_path in file_paths:
        path_str = str(log_path)
        parts = Path(path_str).parts
        casename = parts[-2] if len(parts) >= 2 else "unknown"

        date_match = re.search(r'(\d{8})|(\d{4}-\d{2}-\d{2})', path_str)
        if date_match:
            date_str = date_match.group(1) or date_match.group(2)
            if '-' in date_str:
                date = datetime.strptime(date_str, "%Y-%m-%d").strftime("%Y%m%d")
            else:
                date = date_str
        else:
            try:
                mtime = Path(log_path).stat().st_mtime
                date = datetime.fromtimestamp(mtime).strftime("%Y%m%d")
            except Exception:
                date = datetime.now().strftime("%Y%m%d")

        try:
            with open(log_path, "r", errors='ignore') as f:
                content = f.read()
                rulePerf = re.findall(
                    r' ([^\s\]]+) done: CpuTime\(([0-9.,]+)s\); RealTime\(([0-9.,]+)s\); PeakMem\(([0-9.,]+)M\); IncMem\(([0-9.,]+)M\); RealTimeIncMem\(([-0-9.,]+)M\)',
                    content
                )
                rulePerf = rulePerf + get_runtime(content)
        except Exception as e:
            logger.error(f"读取日志文件失败 {log_path}: {e}")
            continue

        thread_match = re.findall(r'Current Threads : (\d+)', content)
        if thread_match:
            thread = int(thread_match[0])
        else:
            if re.match(r'.*/single/*', path_str) or re.match(r'.*/signal/*', path_str):
                thread = 1
            else:
                thread_match2 = re.findall(r'thread_(\d+)', path_str)
                thread = int(thread_match2[0]) if thread_match2 else 0

        if casename not in case_data:
            case_data[casename] = {
                "casename": casename,
                "daily_metrics": {},
                "available_dates": []
            }
        if date not in case_data[casename]["daily_metrics"]:
            case_data[casename]["daily_metrics"][date] = {}
        if date not in case_data[casename]["available_dates"]:
            case_data[casename]["available_dates"].append(date)

        case_data[casename]["daily_metrics"][date] = get_data_json(
            case_data[casename]["daily_metrics"][date], rulePerf, thread
        )

    return case_data


def get_multi_data(original_path: Union[str, List[str]], flag: int = 0) -> Union[List[str], Dict]:
    """获取多线程数据"""


    original_path = [info.path for info in original_path if info.path.endswith('.txt')]
    if flag == 0:
        if isinstance(original_path, str):
            return find(original_path, maxdepth=6, name_pattern=r"elint\.log", file_type="f")
        return []
    else:
        if isinstance(original_path, list):
            return get_data_from_log(original_path)
        return {}


# ==================== 用户数据 ====================

def get_user_data(case_path: str) -> Dict:
    """获取用户自定义数据"""
    try:
        return load_json(case_path)
    except Exception as e:
        logger.error(f"加载用户数据失败 {case_path}: {e}")
        return {}


def get_user_data_batch(case_paths: list) -> Dict:
    """批量获取用户自定义数据"""
    merged_result = {}
    for case_path in case_paths:
        if not case_path or not case_path.strip():
            continue
        data = get_user_data(case_path.strip())
        if data:
            for project_id, project_data in data.items():
                if project_id not in merged_result:
                    merged_result[project_id] = project_data
                else:
                    existing_metrics = merged_result[project_id].get('daily_metrics', {})
                    new_metrics = project_data.get('daily_metrics', {})
                    for date, metrics in new_metrics.items():
                        if date not in existing_metrics:
                            existing_metrics[date] = metrics
                        else:
                            for rule, rule_data in metrics.items():
                                if rule not in existing_metrics[date]:
                                    existing_metrics[date][rule] = rule_data
                    merged_result[project_id]['daily_metrics'] = existing_metrics
                    existing_dates = set(merged_result[project_id].get('available_dates', []))
                    new_dates = set(project_data.get('available_dates', []))
                    merged_result[project_id]['available_dates'] = sorted(existing_dates | new_dates)
    logger.info(f"批量加载完成，共加载 {len(merged_result)} 个项目")
    return merged_result


def deep_merge(dict1: Dict, dict2: Dict) -> Dict:
    """递归合并两个字典"""
    result = dict1.copy()
    for key, value in dict2.items():
        if key in result:
            if isinstance(result[key], dict) and isinstance(value, dict):
                result[key] = deep_merge(result[key], value)
            elif isinstance(result[key], list) and isinstance(value, list):
                result[key] = list(dict.fromkeys(result[key] + value))
            else:
                result[key] = value
        else:
            result[key] = value
    return result


def get_single_data(files, flag):
    """
        single: 单线程的数据
        flag: 0 表示只获取文件路径，1 表示解析全量数据
    """
    files = [info.path for info in files if info.path.endswith('.txt')]
    if flag == 0:
        return find(files, maxdepth=3, name_pattern=r"^\d{8}_[^/]+\.txt$", file_type="f")
    else:
        all_data = get_data_from_txt_single(files, {})
        logger.info(f"从单线程文件解析到的数据: {all_data}")
        save_json("data.json", all_data)
        print("411111111111111",all_data)
        return all_data



#########################################################################################################################################################

def gen_data(dataData: Dict, rule_datas: List[str], date: str, thread: int, flag: int) -> Dict:
    """生成elint数据"""
    
    for rule_data in rule_datas:
        if len(rule_data) == 4:
            rule_name, cputime, peakmem, realtime = rule_data
            incmem = "NA"
            realtimeincmem = "NA"
        elif len(rule_data) == 5:
            rule_name, cputime, realtime, peakmem, incmem = rule_data
            realtimeincmem = "NA"
        elif len(rule_data) == 6:
            rule_name, cputime, realtime, peakmem, incmem, realtimeincmem = rule_data

        # rule
        if rule_name not in dataData:
            dataData[rule_name] = {
                "thread": [],
                "dates": [],
                "date_data": {}
            }

        # 线程数
        dataData[rule_name]["thread"].append(thread)
        # 日期
        dataData[rule_name]["dates"].append(date)

        # 日期是否存在
        if date not in dataData[rule_name]["date_data"]:
            dataData[rule_name]["date_data"][date] = {thread: [cputime, realtime, peakmem, incmem, realtimeincmem]}
        else:
            dataData[rule_name]["date_data"][date].update({thread: [cputime, realtime, peakmem, incmem, realtimeincmem]})

    return dataData

# 从 txt 中获取数据
def get_elint_data_from_txt(file_path: str, elint_data: Dict, thread: int) -> None:
    """从 txt 中获取数据"""
    # 先获取 case 名字和日期
    txtname = Path(file_path).name
    match = re.findall(r'(\d{8})_(.*)\.txt', txtname)
    if not match:
        return
    date, casename = match[0]

    if casename not in elint_data:
        elint_data[casename] = {
            "casename": casename,
            "metrics": ["cputime", "realtime", "peakmem", "incmem", "realtimeincmem"],
            "rules_data": {}
        }

    # 获取所有数据
    # try:
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
            # 之前的格式
            rule_datas = re.findall(r"dict set \d{8} ([^\s]+) {([0-9.,]+) ([0-9.,]+) ([0-9.,]+)}", content)
            flag = 1
            if not rule_datas:
                rule_datas = re.findall(
                    # 现在的格式
                    r"dict set \d{8} ([^\s]+) {([-0-9.,]+) ([-0-9.,]+) ([-0-9.,]+) ([-0-9.,NA]+) ([-0-9.,NA]+)}",
                    content
                )
                flag = 2
            elint_data[casename]["rules_data"] = gen_data(elint_data[casename]["rules_data"], rule_datas, date, thread, flag)
            
    # except Exception as e:
    #     logger.error(f"解析文件失败 {file_path}: {e}")
    
def get_elint_data_from_log(file_path: str, elint_data: Dict, thread: int) -> None:
    # 获取 casename
    parts = Path(file_path).parts
    casename = parts[-2] if len(parts) >= 2 else "unknown"
    if casename not in elint_data:
        elint_data[casename] = {
                "casename": casename,
                "metrics": ["cputime", "realtime", "peakmem", "incmem", "realtimeincmem"],
                "rules_data": {}
            }

    # 获取日期
    date_match = re.search(r'(\d{8})|(\d{4}-\d{2}-\d{2})', file_path)
    if date_match:
        # 从文件名中获取日期
        date_str = date_match.group(1) or date_match.group(2)
        if '-' in date_str:
            date = datetime.strptime(date_str, "%Y-%m-%d").strftime("%Y%m%d")
        else:
            date = date_str
    else:
        # 从文件修改时间获取日期
        try:
            mtime = Path(file_path).stat().st_mtime
            date = datetime.fromtimestamp(mtime).strftime("%Y%m%d")
        except Exception:
            date = datetime.now().strftime("%Y%m%d")

    try:
        with open(file_path, "r", errors='ignore') as f:
            content = f.read()
            rule_datas = re.findall(
                r' ([^\s\]]+) done: CpuTime\(([0-9.,]+)s\); RealTime\(([0-9.,]+)s\); PeakMem\(([0-9.,]+)M\); IncMem\(([0-9.,]+)M\); RealTimeIncMem\(([-0-9.,]+)M\)',
                content
            )
            if not rule_datas:
                rule_datas = re.findall(
                                r' ([^\s\]]+) done: CpuTime\(([0-9.,]+)s\); RealTime\(([0-9.,]+)s\); PeakMem\(([0-9.,]+)M\); IncMem\(([0-9.,]+)M\)',
                                content
                            )
            elint_data[casename]["rules_data"] = gen_data(elint_data[casename]["rules_data"], rule_datas, date, thread, 1)

    except Exception as e:
        logger.error(f"读取日志文件失败 {file_path}: {e}")
        return

# 获取elint工具的数据
def get_elint_data(filepaths: str) -> Dict:
    """获取elint数据"""
    filepaths = [info.path for info in filepaths if info.path.endswith('.txt') or info.path.endswith('.log')]
    elint_data = {}
    for file_path in filepaths:
        logger.info(f"从文件获取性能数据: {file_path}")
        # 获取是几线程的
        threadStr = re.findall(r'.*thread_(\d+)', file_path)
        if threadStr:
            thread = int(threadStr[0].strip())
        else:
            # 单线程的线程数应该为 -1（跑工具的时候不设置 -thread）
            thread = -1
        filename = Path(file_path).name
        if re.match(r'elint\.log', filename):
            # 从 log 中读取数据
            get_elint_data_from_log(file_path, elint_data, thread)
        elif re.match(r'\d{8}_[^\s]+\.txt', filename):
            # 从 txt 中获取
            get_elint_data_from_txt(file_path, elint_data, thread)

    return elint_data