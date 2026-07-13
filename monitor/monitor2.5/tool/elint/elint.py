"""
获取 elint 工具的数据、支持批量获取用户数据
"""

import os
import re
import time
import json
import csv

from tool.elint.find import *
from pathlib import Path
from datetime import datetime, timedelta
import subprocess
from typing import Dict, List, Any, Optional, Tuple
from debug.debug import *



def save_json(json_path, data):
    """
    保存数据到JSON文件
    
    参数:
        json_path: JSON文件路径
        data: 要保存的数据
    """
    log(f"正在保存数据到 JSON 文件: {json_path}")
    with open(json_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=4)


def log(msg: str) -> None:
    """
    带时间戳的日志输出函数
    
    参数:
        msg: str - 要输出的日志信息
    
    输出格式:
        [YYYY-MM-DD HH:MM:SS]: 日志内容
    """
    print(f"{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}: {msg}")


def load_json(path):
    """
    加载JSON文件
    
    参数:
        path: JSON文件路径
    
    返回:
        dict: 解析后的JSON数据
    """
    with open(path, 'r', encoding='utf-8') as file:
        data = json.load(file)
    return data


###################################################################################################################################################
##    
##    获取单线程的数据
##    
###################################################################################################################################################

def gen_dict_data(caseData, data, thread):
    """生成字典数据"""
    rule_data = {}
    for item in data:
        rulename = item[0]
        cputime = float(item[1])
        peakmem = float(item[2])
        incMem = float(item[3])
        rule_data[rulename] = {
            "runtime": cputime,
            "memory": peakmem
        }
    
    return rule_data


def get_date_from_txt_single(txts, caseData):
    """从txt文件获取日期数据"""
    for txt in txts:
        txtname = Path(txt).name
        match = re.findall(r'(\d{8})_(.*)\.txt', txtname)
        if not match:
            continue
        date, casename = match[0]
        
        # 判断 case 存在字典中, 并创建一个新的
        if casename not in caseData:
            caseData[casename] = {
                "casename": casename,
                "daily_metrics": {
                    date: {}
                },
                "available_dates": [date]
            }
        if date not in caseData[casename]["daily_metrics"]:
            caseData[casename]["daily_metrics"][date] = {}
        try:
            with open(txt, 'r', encoding='utf-8') as f:
                data = re.findall(r"dict set \d{8} ([^\s]+) {([0-9.,]+) ([0-9.,]+) ([0-9.,]+)}", f.read())
                # 一个 case 一天的信息,并获取
                caseData[casename]["daily_metrics"][date] = gen_dict_data(
                    caseData[casename]["daily_metrics"][date], data, 0
                )
                if date not in caseData[casename]["available_dates"]:
                    caseData[casename]["available_dates"].append(date)
        except Exception as e:
            log(f"出现错误: get_date_from_txt: {date} {casename} {e}")
            break
    return caseData


def get_elint_performance(original_path, jsonDataFile) -> Tuple[Dict, List[str]]:
    """
    获取 elint 性能数据
    
    返回:
        Tuple[Dict, List[str]]: (caseData, 数据文件列表)
    """
    start = time.time()
    dataFiles = find(original_path, maxdepth=3, name_pattern=r"^\d{8}_[^/]+\.txt$", file_type="f")
    caseData = {}
    caseData = get_date_from_txt_single(dataFiles, caseData)
    caseData["dataFiles"] = sorted(dataFiles)
    # if jsonDataFile:
    #     save_json(jsonDataFile, caseData)
    # else:
    #     log("未提供 JSON 保存路径，跳过保存 elint 数据")

    end = time.time()
    print(f"运行时间: {end - start:.4f} 秒")
    return caseData, sorted(dataFiles)


def get_incremental_data(
    existing_data: Dict,
    existing_files: List[str],
    new_files: List[str],
    json_path: Path
) -> Tuple[Dict, List[str]]:
    """
    增量获取新增数据
    
    参数:
        existing_data: 已有数据
        existing_files: 已有文件列表
        new_files: 新文件列表
        json_path: JSON文件路径
        
    返回:
        Tuple[Dict, List[str]]: (更新后的数据, 合并后的文件列表)
    """
    if not new_files:
        return existing_data, existing_files
    
    log(f"发现 {len(new_files)} 个新文件，进行增量更新")
    
    # 只解析新增的文件
    new_data = get_date_from_txt_single(new_files, {})
    
    # 合并数据
    for casename, case_info in new_data.items():
        if casename not in existing_data:
            existing_data[casename] = case_info
        else:
            # 合并 daily_metrics
            for date, metrics in case_info.get('daily_metrics', {}).items():
                if date not in existing_data[casename]['daily_metrics']:
                    existing_data[casename]['daily_metrics'][date] = metrics
                else:
                    # 合并同一天不同阶段的metrics
                    for rule, rule_data in metrics.items():
                        if rule not in existing_data[casename]['daily_metrics'][date]:
                            existing_data[casename]['daily_metrics'][date][rule] = rule_data
            
            # 合并 available_dates
            existing_dates = set(existing_data[casename].get('available_dates', []))
            new_dates = set(case_info.get('available_dates', []))
            existing_data[casename]['available_dates'] = sorted(existing_dates | new_dates)
    
    # 合并文件列表
    merged_files = list(dict.fromkeys(existing_files + new_files))
    merged_files.sort()
    
    # 保存更新后的数据
    existing_data["dataFiles"] = merged_files
    # save_json(json_path, existing_data)
    
    return existing_data, merged_files


def get_elint_data(jsonDataFile, original_path) -> Dict:
    """
    获取 elint 数据，支持增量更新

    参数:
        jsonDataFile: JSON数据文件路径（可以是字符串或Path对象）
        original_path: 原始数据文件路径

    返回:
        dict: 项目数据
    """
    print("开始获取工具单线程的数据")
    # 统一转换为 Path 对象
    jsonDataFile = Path(jsonDataFile) if isinstance(jsonDataFile, str) else jsonDataFile
    jsonPath = jsonDataFile.resolve() if jsonDataFile else None

    # 获取当前所有的 txt 文件
    currentDataFiles = sorted(find(original_path, maxdepth=3, name_pattern=r"^\d{8}_[^/]+\.txt$", file_type="f"))

    # 检查文件是否存在
    if jsonPath and jsonPath.exists():
        try:
            lastCaseData = load_json(jsonPath)
            lastDataFiles = lastCaseData.get("dataFiles", [])

            # 计算新增的文件
            addDataFiles = list(set(currentDataFiles) - set(lastDataFiles))

            if addDataFiles:
                # 有新增文件，进行增量更新
                newCaseData, merged_files = get_incremental_data(
                    lastCaseData, lastDataFiles, addDataFiles, jsonPath
                )
            else:
                log("数据不需要更新")
                newCaseData = lastCaseData
        except Exception as e:
            log(f"读取JSON文件失败: {e}，将重新获取")
            newCaseData, _ = get_elint_performance(original_path, jsonPath)
    else:
        if jsonPath:
            log("JSON文件不存在，将创建新文件")
        else:
            log("JSON路径未配置，将直接从原始数据读取，不保存JSON")
        newCaseData, _ = get_elint_performance(original_path, jsonPath)

    # if "dataFiles" in newCaseData:
    #     del newCaseData["dataFiles"]

    return newCaseData


def read_csv(path):
    """
    读取CSV文件，返回日期到评论的映射
    
    参数:
        path: CSV文件路径
    
    返回:
        dict: {日期: 评论}
    """
    data = {}
    try:
        with open(path, 'r', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            for row in reader:
                time_str = row['Date']
                time_str = datetime.strptime(time_str, "%Y-%m-%d").strftime("%Y%m%d")
                data[time_str] = row['comment']
    except Exception as e:
        log(f"读取CSV文件失败 {path}: {e}")
    return data


def get_perf(mrPath):
    """
    获取性能数据（MR更新信息）
    
    参数:
        mem: 内存性能CSV文件路径
        cpu: CPU性能CSV文件路径
    
    返回:
        dict: 性能数据字典
    """
    try:

        mem_data = read_csv(Path(mrPath) / "lint_mem.csv")
        cpu_data = read_csv(Path(mrPath) / "lint_cpu.csv")
        print(f"解析数据 MR 数据中: cpu:{len(cpu_data)} mem: {len(mem_data)}")
        
        perf = {
            "mem": mem_data,
            "cpu": cpu_data
        }

        return perf
    except Exception as e:
        log(f"执行异常: {e}")
        return {
            "mem": {},
            "cpu": {}
        }


def get_user_data(case_path):
    """
    获取用户自定义数据
    
    参数:
        case_path: 用户输入的路径
    
    返回:
        dict: 符合 elint.json 格式的数据
    """
    result = {}
    try:
        result = load_json(case_path)
        log(f"成功加载用户数据: {case_path}")
    except Exception as e:
        log(f"加载用户数据失败 {case_path}: {e}")
        result = {}
    return result


def get_user_data_batch(case_paths: list):
    """
    批量获取用户自定义数据
    
    参数:
        case_paths: 用户输入路径列表
    
    返回:
        dict: 合并后的数据，符合 elint.json 格式
    """
    merged_result = {}
    
    for case_path in case_paths:
        if not case_path or not case_path.strip():
            continue
        
        case_path = case_path.strip()
        data = get_user_data(case_path)
        
        if data:
            # 合并数据，避免覆盖
            for project_id, project_data in data.items():
                if project_id not in merged_result:
                    merged_result[project_id] = project_data
                else:
                    # 合并 daily_metrics
                    existing_metrics = merged_result[project_id].get('daily_metrics', {})
                    new_metrics = project_data.get('daily_metrics', {})
                    
                    for date, metrics in new_metrics.items():
                        if date not in existing_metrics:
                            existing_metrics[date] = metrics
                        else:
                            # 合并同一天的不同阶段
                            for rule, rule_data in metrics.items():
                                if rule not in existing_metrics[date]:
                                    existing_metrics[date][rule] = rule_data
                    
                    merged_result[project_id]['daily_metrics'] = existing_metrics
                    
                    # 合并 available_dates
                    existing_dates = set(merged_result[project_id].get('available_dates', []))
                    new_dates = set(project_data.get('available_dates', []))
                    merged_result[project_id]['available_dates'] = sorted(existing_dates | new_dates)
                    
                    log(f"合并项目 {project_id}: 新增 {len(new_metrics)} 天数据")
    
    log(f"批量加载完成，共加载 {len(merged_result)} 个项目")
    return merged_result




##########################################################################################################################################################################################
## 多线程数据加载
##########################################################################################################################################################################################

def get_data_json(rule_data, data, thread):
    """
    从多线程日志中解析性能数据
    
    参数:
        rule_data: 当前规则数据（会被修改）
        data: 解析出的性能数据列表
        thread: 线程数
    
    返回:
        dict: 更新后的 rule_data
    """
    for item in data:
        if len(item) == 0:
            continue
        rule = item[0]

        if int(thread) > 0:
            runtime = float(item[2].replace(',', ''))
        else:
            runtime = float(item[1].replace(',', ''))
        memory = float(item[3].replace(',', ''))
        if rule == "sched(local)]":
            continue
        
        if re.fullmatch(r'^\[.*', rule):
            rule = re.findall(r'\[.*\]\[(.*)\]', rule)[0]
        if rule not in rule_data:
            rule_data[rule] = {
                "thread_metrics": {
                    thread: {
                        "runtime": runtime,
                        "memory": memory,
                        # "cores": thread
                    }
                }
            }
        else:
            rule_data[rule]["thread_metrics"][thread] = {
                "runtime": runtime,
                "memory": memory,
                # "cores": thread
            }

    return rule_data


def get_perf_data_from_log(caseData, log_path):
    """
    从单个日志文件解析性能数据
    
    参数:
        caseData: 已有的项目数据字典
        log_path: 日志文件路径
    
    返回:
        dict: 更新后的 caseData
    """
    # 提取 casename 和 date
    # 路径格式示例: /path/to/elint.log 或 /path/to/project/elint.log
    path_str = str(log_path)
    
    # 尝试从路径中提取 casename
    parts = Path(path_str).parts
    if len(parts) >= 2:
        casename = parts[-2]  # 取上一级目录名作为 casename
    else:
        casename = "unknown"
    
    # 提取日期 - 多种格式支持
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
            log(f"未从日志路径提取到日期，使用文件修改时间作为日期: {date}")
        except Exception:
            date = datetime.now().strftime("%Y%m%d")
            log(f"未从日志路径提取到日期，使用当前日期作为日期: {date}")

    with open(log_path, "r", errors='ignore') as f:
        content = f.read()
        rulePerf = re.findall(r' ([^\s]+) done: CpuTime\(([0-9.,]+)s\); RealTime\(([0-9.,]+)s\); PeakMem\(([0-9.,]+)M\); IncMem\(([0-9.,]+)M\)', content)
        rulePerf = rulePerf + get_runtime(content)
    
    thread = re.findall(r'Current Threads : (\d+)', content)
    if len(thread) == 0:
        if re.match(r'.*/single/*', log_path):
            thread = 1
        else:
            thread_match = re.findall(r'thread_(\d+)', log_path)[0]
            thread = int(thread_match[0]) if thread_match else 0
    else:
        thread = int(thread[0])

    if casename not in caseData:
        caseData[casename] = {
            "casename": casename,
            "daily_metrics": {
                date: {}
            },
            "available_dates": [date]
        }
    else:
        if date not in caseData[casename]["daily_metrics"]:
            caseData[casename]["daily_metrics"][date] = {}
        if date not in caseData[casename]["available_dates"]:
            caseData[casename]["available_dates"].append(date)
    
    caseData[casename]["daily_metrics"][date] = get_data_json(
        caseData[casename]["daily_metrics"][date], rulePerf, thread
    )

    return caseData


def get_multi_data(jsonDataFile, path) -> Dict:
    """
    获取多线程性能数据
    
    参数:
        path: 多线程原始数据目录路径
        caseData: 已有的项目数据字典（可选，用于增量更新）
    
    返回:
        Tuple[Dict, List[str]]: (更新后的 caseData, 日志文件列表)
    """
    start = time.time()
    print(f"开始获取多线程数据，路径: {path}")
    caseData = {}
    if jsonDataFile and Path(jsonDataFile).exists(): 
        try:
            caseData = load_json(jsonDataFile)
        except Exception as e:
            log(f"读取JSON文件失败: {e}")
            caseData = {}
    
    # 查找所有 elint.log 文件
    logs = find(path, maxdepth=6, name_pattern=r"elint.log", file_type="f")
    
    # 过滤掉 single 目录下的日志（如果有）
    # filtered_logs = [log_path for log_path in logs if not re.search(r'.*/single/.*', str(log_path))]
    filtered_logs = logs
    # 记录已处理的日志列表
    processed_key = "__multi_processed_logs__"
    existing_logs = set(caseData.get(processed_key, []))
    new_logs = [log_path for log_path in filtered_logs if str(log_path) not in existing_logs]
    
    if not new_logs:
        log(f"没有新的多线程日志文件，跳过处理")
        if processed_key in caseData:
            caseData[processed_key] = filtered_logs
        return caseData
    
    log(f"发现 {len(new_logs)} 个新的多线程日志文件")
    
    # 处理新日志
    for log_path in new_logs:
        log(f"处理多线程日志: {log_path}")
        caseData = get_perf_data_from_log(caseData, log_path)
        

    # 更新已处理日志列表
    caseData[processed_key] = filtered_logs
    
    end = time.time()
    log(f"多线程数据获取完成，耗时: {end - start:.4f} 秒")
    
    return caseData


def get_date_from_log(files, caseData):
    for log_path in files:
        caseData = get_perf_data_from_log(caseData, log_path)
    return caseData

def time_to_seconds(time_str):
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



def get_runtime (content):
    overall = re.findall(r'(Overall|read_design|check_lint|save_session)\s+\|\s([^|]+)\s\|\s([^|]+)\s\|\s([^|]+)\s\|', content)
    new = []
    for command in overall:
        name = command[0]
        elapse = time_to_seconds(command[1])
        cpu = time_to_seconds(command[2])
        peak = command[3].strip()
        new = new + [(name, f"{cpu}", f"{elapse}", f"{peak}", "null")]
    return new




# 获取单线程数据, flag: 0 表示只获取文件路径，1 表示解析全量数据
def get_single_data(files, flag):
    """
        single: 单线程的数据
        flag: 0 表示只获取文件路径，1 表示解析全量数据
    """

    if flag == 0:
        print(11111111111111111111111111111111111111)
        return find(files, maxdepth=3, name_pattern=r"^\d{8}_[^/]+\.txt$", file_type="f")
    else:
        all_data = get_date_from_txt_single(files, {})
        return all_data

# 获取多线程数据, flag: 0 表示只获取文件路径，1 表示解析全量数据
def get_multi_date(files, flag):
    if flag == 0:
        return find(files, maxdepth=6, name_pattern=r"elint.log", file_type="f")
    else:
        all_data = get_date_from_log(files, {})
        return all_data


# def signal_adta(files):

#     # 检查是否需更新数据

