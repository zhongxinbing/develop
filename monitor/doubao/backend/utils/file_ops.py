import os
import json
from backend.config import DATA_ROOT, TOOL_CONFIG_NAME, ORIGIN_DATA_NAME

def get_all_tool_list():
    """获取所有已配置工具列表"""
    tool_list = []
    for tool_id in os.listdir(DATA_ROOT):
        tool_dir = os.path.join(DATA_ROOT, tool_id)
        config_path = os.path.join(tool_dir, TOOL_CONFIG_NAME)
        if os.path.isdir(tool_dir) and os.path.exists(config_path):
            with open(config_path, "r", encoding="utf-8") as f:
                tool_info = json.load(f)
                tool_info["tool_id"] = tool_id
                tool_list.append(tool_info)
    return tool_list

def check_tool_name_exist(name: str) -> bool:
    """校验工具名称是否已存在"""
    tool_list = get_all_tool_list()
    for tool in tool_list:
        if tool.get("tool_name") == name:
            return True
    return False

def create_tool_dir(tool_id: str):
    """创建工具独立数据目录"""
    tool_dir = os.path.join(DATA_ROOT, tool_id)
    if not os.path.exists(tool_dir):
        os.makedirs(tool_dir)
    return tool_dir

def save_tool_config(tool_id: str, config_data: dict):
    """保存工具配置到 JSON"""
    tool_dir = create_tool_dir(tool_id)
    config_path = os.path.join(tool_dir, TOOL_CONFIG_NAME)
    with open(config_path, "w", encoding="utf-8") as f:
        json.dump(config_data, f, ensure_ascii=False, indent=2)

def get_tool_config(tool_id: str) -> dict:
    """读取工具配置"""
    config_path = os.path.join(DATA_ROOT, tool_id, TOOL_CONFIG_NAME)
    if not os.path.exists(config_path):
        return {}
    with open(config_path, "r", encoding="utf-8") as f:
        return json.load(f)

def delete_tool(tool_id: str) -> bool:
    """删除工具及对应目录"""
    import shutil
    tool_dir = os.path.join(DATA_ROOT, tool_id)
    if os.path.exists(tool_dir):
        shutil.rmtree(tool_dir)
        return True
    return False

def save_origin_data(tool_id: str, data: dict):
    """保存工具原始业务数据"""
    tool_dir = create_tool_dir(tool_id)
    data_path = os.path.join(tool_dir, ORIGIN_DATA_NAME)
    with open(data_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

def get_origin_data(tool_id: str) -> dict:
    """读取工具原始业务数据"""
    data_path = os.path.join(DATA_ROOT, tool_id, ORIGIN_DATA_NAME)
    if not os.path.exists(data_path):
        return {}
    with open(data_path, "r", encoding="utf-8") as f:
        return json.load(f)