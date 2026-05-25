"""
获取 elint 工具的数据、
数据格式：
    "openc910-main": {
        "project_name": "openc910-main",
        "description": "qor case total.json监控,非FOM",
        "daily_metrics": {
            "20260508": {
                "Analysis": {
                    "thread_metrics": {
                        "0": {
                            "runtime": 0,
                            "memory": 1,
                            "cores": 0
                        },
                        "2": {
                            "runtime": 0.8,
                            "memory": 1.5,
                            "cores": 2
                        },
                        "4": {
                            "runtime": 10.0,
                            "memory": 1.5,
                            "cores": 2
                        }
                    }
                },
            }
        }
    }
"""

import os
import re
import time
import json
import csv

from tool.elint.find import *
from pathlib import Path
from datetime import datetime

def save_json(json_path, data):
    """
    保存数据到JSON文件
    
    参数:
        json_path: JSON文件路径
        data: 要保存的数据
    """
    log("保存新的 json 文件中...")
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
# 配置数据结构
def gen_dict_data(caseData,data,thread):
    rule_data = {}
    for item in data:
        rulename = item[0]
        cputime = float(item[1])
        peakmem = float(item[2])
        incMem = float(item[3])
        rule_data[rulename] = {
            "thread_metrics" : {
                thread: {
                    "runtime": cputime,
                    "memory": peakmem,
                    "cores": thread
                }
            }
        }
    
    return rule_data

# 单线程的解析
def get_date_from_txt_signal(txts,caseData):
    # caseData = {}
    for txt in txts:
        txtname = Path(txt).name
        date, casename = re.findall(r'(\d{8})_(.*)\.txt',txtname)[0]
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
                caseData[casename]["daily_metrics"][date] = gen_dict_data(caseData[casename]["daily_metrics"][date],data,0)
                caseData[casename]["available_dates"].append(date)
        except Exception as e:
            log(f"出现错误: get_date_from_txt: {date} {casename} {e}")
            break
    return caseData
    
###################################################################################################################################################
##    
##    获取多线程的数据
##    
###################################################################################################################################################

# def get_multi_data(logs):






# 获取数据
def get_elint_performance(original_path, jsonDataFile):
    start = time.time()
    dataFiles = find(original_path, maxdepth=3, name_pattern=r"^\d{8}_[^/]+\.txt$", file_type="f")
    caseData = {}
    caseData = get_date_from_txt_signal(dataFiles,caseData)
    caseData["dataFiles"] = sorted(dataFiles)
    save_json(jsonDataFile, caseData)

    end = time.time()
    print(f"运行时间: {end - start:.4f} 秒")
    return caseData
    
# get_elint_performance("/mnt/efs/fs1/jenkins/lint_comparison_results_qor")


# 新数据的继承


def get_elint_data(jsonDataFile, original_path):
    # 获取绝对路径
    jsonDataFile = Path(jsonDataFile).resolve()
    lastCaseData = load_json(jsonDataFile)
    # print(lastCaseData)
    # 如果 json 的路径不存在则从新获取
    if not jsonDataFile.exists() or lastCaseData == {}:
        log("数据不存在，重新获取。。。")
        newCaseData = get_elint_performance(original_path, jsonDataFile)
    else:
        # 如果存在 json 文件,获取上一次的数据
        if "dataFiles" not in lastCaseData:
            lastDataFiles = []
        else:
            lastDataFiles = lastCaseData["dataFiles"]
        # print("lastDataFiles: ",lastDataFiles)
        # 获取当前所有的 txt 文件
        currentDataFiles = sorted(find(original_path, maxdepth=3, name_pattern=r"^\d{8}_[^/]+\.txt$", file_type="f"))
        # 最新 currentDataFiles 中存在的文件路径
        addDataFiles = list(set(currentDataFiles) - set(lastDataFiles))

        # 如果有新增，则更新数据
        if len(addDataFiles) != 0:
            newCaseData = get_date_from_txt_signal(addDataFiles,lastCaseData)
            
            # 合并并去重
            newDataFiles = list(dict.fromkeys(currentDataFiles + lastDataFiles))
            newCaseData["dataFiles"] = newDataFiles.sort()
            save_json(jsonDataFile, newCaseData)
        else:
            log("数据不需要更新")
            # 数据没有新增、并且保持不变
            newCaseData = lastCaseData

    if "dataFiles" in newCaseData:
        del newCaseData["dataFiles"]

    return newCaseData




def git_pull():
    """
    执行git pull拉取最新数据（已注释，暂不使用）
    """
    try:
        result = subprocess.run(
            ['git', 'pull', 'origin', 'develop'],
            cwd='./data/rd_perf',
            capture_output=True,
            text=True,
            check=False
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
    """
    读取CSV文件，返回日期到评论的映射
    
    参数:
        path: CSV文件路径
    
    返回:
        dict: {日期: 评论}
    """
    data = {}
    with open(path, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            time = row['Date']
            time = datetime.strptime(time, "%Y-%m-%d").strftime("%Y%m%d")
            data[time] = row['comment']
    
    return data


def get_perf(mem, cpu):
    """
    获取性能数据（MR更新信息）
    
    参数:
        mem: 内存性能CSV文件路径
        cpu: CPU性能CSV文件路径
    
    返回:
        dict: 性能数据字典
    """
    try:
        mem_data = read_csv(Path(mem)) if mem else {}
        cpu_data = read_csv(Path(cpu)) if cpu else {}
        perf = {
            "mem": mem_data,
            "cpu": cpu_data
        }
        print(perf)
        return perf
    except Exception as e:
        print(f"执行异常: {e}")
        return {
            "mem": {},
            "cpu": {}
        }
    
