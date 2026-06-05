from data_cache import load_tool_configs, save_tool_configs, ensure_tool_data_file, load_tool_data
from common import create_tool_record


def get_tool_configs():
    return load_tool_configs()


def find_tool_by_id(tool_id):
    configs = load_tool_configs()
    for tool in configs:
        if tool.get("id") == tool_id:
            return tool
    return None


def add_tool_config(form):
    configs = load_tool_configs()
    existing_ids = [tool.get("id") for tool in configs]
    tool_record = create_tool_record(form, existing_ids)
    configs.append(tool_record)
    save_tool_configs(configs)
    ensure_tool_data_file(tool_record["id"])
    return tool_record


def update_tool_config(tool_id, form):
    configs = load_tool_configs()
    for index, tool in enumerate(configs):
        if tool.get("id") == tool_id:
            tool.update(form)
            configs[index] = tool
            save_tool_configs(configs)
            return tool
    return None


def get_tool_data(tool_id):
    return load_tool_data(tool_id)
