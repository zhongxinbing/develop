import os
import re
import json
import csv
import subprocess
from datetime import datetime
from pathlib import Path
from datetime import date
from find import *
from common import *

#  通过 正则表达式获取数据并保存

def normalize_thread_key(cores):
    try:
        return str(int(cores))
    except Exception:
        return '0'


def get_data_info(datafile):
    daily_metrie = {}
    normalized_path = datafile.replace('\\', '/')
    cores = re.findall(r'thread_([0-9]+)', normalized_path)
    if len(cores) == 0:
        cores = 0
    else:
        cores = cores[0]
    thread_key = normalize_thread_key(cores)

    with open(datafile, "r", encoding="utf-8") as f:
        for line in f:
            if "#" in line or line == "\n" or line == "":
                continue
            datas = re.findall(r'dict set\s(\d+)\s+([^\s]+)\s+\{([0-9.]*)\s+[0-9.]+\s+([0-9.]*).*', line.strip())
            if not datas:
                continue

            data = datas[0][0]
            stage = datas[0][1]
            runtime = float("{:.2f}".format(float(datas[0][2])))
            memory = float("{:.2f}".format(float(datas[0][3])))

            if data not in daily_metrie:
                daily_metrie[data] = {}
            if stage not in daily_metrie[data]:
                daily_metrie[data][stage] = {'thread_metrics': {}}
            if 'thread_metrics' not in daily_metrie[data][stage]:
                daily_metrie[data][stage] = {'thread_metrics': {}}

            daily_metrie[data][stage]['thread_metrics'][thread_key] = {
                'runtime': runtime,
                'memory': memory,
                'cores': int(thread_key)
            }

    return daily_metrie

def save_json(json_path,data):
    log("保存新的 json 文件中...")
    with open(json_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=4) 

# 获取目录下的数据
def merge_stage_info(existing_stage, new_stage):
    if existing_stage is None:
        return new_stage

    if 'thread_metrics' not in existing_stage:
        existing_thread = normalize_thread_key(existing_stage.get('cores', 0))
        existing_stage = {
            'thread_metrics': {
                existing_thread: {
                    'runtime': existing_stage.get('runtime'),
                    'memory': existing_stage.get('memory'),
                    'cores': int(existing_thread)
                }
            }
        }

    if 'thread_metrics' in new_stage:
        for thread_key, thread_info in new_stage['thread_metrics'].items():
            existing_stage['thread_metrics'][thread_key] = thread_info
    else:
        thread_key = normalize_thread_key(new_stage.get('cores', 0))
        existing_stage['thread_metrics'][thread_key] = {
            'runtime': new_stage.get('runtime'),
            'memory': new_stage.get('memory'),
            'cores': int(thread_key)
        }

    return existing_stage


def get_data_from(path, depth, pattern, name):
    log(f"正在获取数据...")
    projects_data = {}
    # 获取数据并生存json数据
    for txt in find_files(root_dir=path, max_depth=depth, target_pattern=pattern, path_patterns=name):
        normalized_txt = txt.replace('\\', '/')
        casename = re.findall(r'/[0-9]+_(.*)\.txt', normalized_txt)
        casename = casename[0] if casename else Path(txt).stem
        if casename not in projects_data:
            projects_data[casename] = {
                'project_name': casename,
                'description': 'qor case 单线程监控,非FOM',
                'daily_metrics': {}
            }

        new_data = get_data_info(txt)
        for date, stage_info in new_data.items():
            if date not in projects_data[casename]['daily_metrics']:
                projects_data[casename]['daily_metrics'][date] = {}
            for stage, stage_data in stage_info.items():
                existing_stage = projects_data[casename]['daily_metrics'][date].get(stage)
                projects_data[casename]['daily_metrics'][date][stage] = merge_stage_info(existing_stage, stage_data)

    return projects_data


def get_target_items(root_dir: str, item_type: str, level: int = 1):
    """
    获取指定目录下【指定层级】的文件或文件夹（仅支持第一层，最常用）
    
    参数：
        root_dir: 给定的目录路径
        item_type: 类型 -> folder(文件夹) / file(文件)
        level: 目录层次，默认1（仅支持1，第一层）
    返回：
        列表：包含所有匹配的完整路径
    """
    # 只处理第一层（你的核心需求）
    if level != 1:
        return []
    
    target_path = Path(root_dir)
    # 检查目录是否存在
    if not target_path.exists() or not target_path.is_dir():
        return []
    
    result = []
    for item in target_path.iterdir():
        # 获取文件夹
        if item_type == "folder" and item.is_dir():
            result.append(str(item.absolute()))
        # 获取文件
        elif item_type == "file" and item.is_file():
            result.append(str(item.absolute()))
    
    return result


def load_json(path):
    with open(path, 'r', encoding='utf-8') as file:
        data = json.load(file)
    return data

def add_json(new_json,old_json,date,thread,original_path):

    for case in old_json:
        # 在新的 json 存在
        if case in new_json:
            # total json 中 有这个日期
            if date in old_json[case]["daily_metrics"]:
                daily_metrics = old_json[case]["daily_metrics"][date]
                new_json[case]["daily_metrics"][date]=daily_metrics
            else:
                # total json 中 没有这个日期
                log(f"case: {case} 在日期：{date} 可能需要重新获取")
                new_date_data = get_data_from(original_path,1,"*.txt",["performance*"])
                if new_date_data == {} or case not in new_date_data:
                    log(f"case: {case} 在日期：{date} 不存在数据")
                else:
                    log(f"case: {case} 在日期：{date} 更新成功")
                    new_json[case]["daily_metrics"][date] = new_date_data[case]["daily_metrics"][date]
        else:
            # 将对应日期的数据放在新的 json 中
            print(f"old_json[case]['daily_metrics']: {old_json[case]['daily_metrics']}")
            if date in old_json[case]["daily_metrics"]:
                new_json[case]={
                    "project_name": case,
                    "description": f"qor case {thread}监控,非FOM",
                    "daily_metrics": {
                        date: old_json[case]["daily_metrics"][date]
                    }
                }
            else:
                log(f"在旧的数据文件中不存在,case: {case} 日期: {date}")
    return new_json



# original_path 原始路径
# data_path 保存 json 文件的路径
def get_json_data(tool,original_path,data_path):
    try:
        thread =  Path(data_path).name
        log(f"获取html需要的数据中\n\ttool:{tool}\n\tthread:{thread}")
        # 获取json文件及其数据
        total_json_file=Path(data_path)

        new_total_json={}
        # 如果不存在 json 文件;则直接重新获取数据并保存
        if not total_json_file.exists():
            new_total_json = get_data_from(original_path,2,"*.txt",[f"{date.today().year}"+"*","performance*"])
            save_json(total_json_file,new_total_json)
            return new_total_json
        
        # 存在total.josn文件
        total_json=load_json(total_json_file)

        # 获取数据原始路径
        original_files = get_target_items(original_path,"folder")

        available_dates = []
        for f in original_files:
            try:
                date_str = Path(f).name
                available_dates.append(datetime.strptime(date_str, "%Y-%m-%d-%H").strftime("%Y%m%d"))
            except Exception:
                continue
        available_dates = sorted(set(available_dates))

        if len(original_files) == 0:
            for case_data in total_json.values():
                case_data['available_dates'] = sorted(set(total_json.get(next(iter(total_json)), {}).get('daily_metrics', {}).keys())) if total_json else []
            save_json(total_json_file,total_json)
            return total_json

        for f in original_files:
            print(f"正在处理文件: {f} ...")
            # 获取文件夹的名字
            try:
                date_str = Path(f).name
                date_str = datetime.strptime(date_str, "%Y-%m-%d-%H").strftime("%Y%m%d")
            except Exception:
                continue
            # 将对应日期的数据添加到新的json中
            new_total_json = add_json(new_total_json,total_json,date_str,thread,f)

        # 判断是否有遗漏的 case
        new_total_json = get_txt_name(original_path, new_total_json)

        # 为所有case补充 available_dates 信息
        for case_data in new_total_json.values():
            case_data['available_dates'] = available_dates if available_dates else sorted(set(case_data.get('daily_metrics', {}).keys()))
        
        # 判断两个json是否相同
        if new_total_json == total_json:
            log("没有数据需要更新")
            return new_total_json
        else:
            log("数据更新并重新保存")
            save_json(total_json_file,new_total_json)
            return new_total_json
    except Exception as e:
        log(f"获取数据发生异常: {e}")
        return {}

def get_txt_name(path,new_json):
    all_txt = find_files(root_dir=path,max_depth=2,target_pattern="*.txt", path_patterns=[f"{date.today().year}"+"*","performance*"])
    if all_txt == "{}":
        return new_json

    cases = {}
    for txt in all_txt:
        casename = re.findall(r'[0-9]+_([^\s]+).txt', txt)[0]
        cases[casename]=txt

    casenames = cases.keys()
    new = new_json.keys()
    diff1 = set(casenames) - set(new)

    log(f"case: {diff1} 需要重新获取数据 ...")
    for case in diff1:
        log(f"更新case:{case} ...")
        new_json_case = get_data_from(path,2,f"*_{case}.txt",[f"{date.today().year}"+"*","performance*"])
        new_json[case] = new_json_case[case]

    return new_json
  
####################################################################
def git_pull():
    """执行 git pull origin develop"""
    try:
        result = subprocess.run(
            ['git', 'pull', 'origin', 'develop'],
            cwd='/home/xbzhong/Desktop/python/monitor/rd_perf',  # 指定仓库目录
            capture_output=True,
            text=True,
            check=False  # 不自动抛出异常，便于处理错误
        )
        
        if result.returncode == 0:
            print("✅ 拉取成功")
            print(result.stdout)
        else:
            print("❌ 拉取失败")
            print(result.stderr)
            
        return result
        
    except Exception as e:
        print(f"执行异常: {e}")
        return None

def read_csv(path):
    data = {}
    with open(path, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            time = row['Date']
            time = datetime.strptime(time, "%Y-%m-%d").strftime("%Y%m%d")
            data[time] = row['comment']
    
    return data


def get_perf(mem,cpu):
    # git_pull()
    try:
        mem = read_csv(Path(mem))
        cpu = read_csv(Path(cpu))
        perf = {
            "mem":mem,
            "cpu":cpu
        }
        print(perf)
        return perf
    except Exception as e:
        print(f"执行异常: {e}")
        return {
            "mem": {},
            "cpu": {}
        }
