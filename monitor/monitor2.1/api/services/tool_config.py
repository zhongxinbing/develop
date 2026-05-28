"""
工具配置服务模块
"""
from datetime import datetime
from pathlib import Path
from typing import Dict

from api.utils import log, save_json_file, load_json_file, ensure_dir
from config import TOOL_CONFIG_PATH


def load_tool_config() -> Dict:
    """加载工具配置"""
    if TOOL_CONFIG_PATH.exists():
        return load_json_file(TOOL_CONFIG_PATH)
    return {}


def save_tool_config(config_data: Dict) -> bool:
    """保存工具配置文件"""
    try:
        ensure_dir(TOOL_CONFIG_PATH)
        return save_json_file(TOOL_CONFIG_PATH, config_data)
    except Exception as e:
        log(f"保存工具配置失败: {e}")
        return False


def get_tool_config(tool_id: str = None) -> Dict:
    """获取工具配置"""
    configs = load_tool_config()
    if tool_id:
        return configs.get(tool_id, {})
    return configs


def update_tool_config(tool_id: str, config: Dict) -> bool:
    """
    更新工具配置
    
    参数:
        tool_id: 工具ID
        config: 配置字典
    """
    log(f"保存工具配置: tool_id={tool_id}, config={config}")
    
    # 获取配置值
    name = config.get('name', '').strip()
    description = config.get('description', '').strip()
    icon = config.get('icon', '').strip()
    single_original_path = config.get('single_original_path', '').strip()
    
    # 可以为空的字段
    json_path = config.get('json_path', '').strip() if config.get('json_path') else ''
    mem = config.get('mem', '').strip() if config.get('mem') else ''
    cpu = config.get('cpu', '').strip() if config.get('cpu') else ''
    multi_original_path = config.get('multi_original_path', '').strip() if config.get('multi_original_path') else ''
    
    # 必填字段验证
    errors = []
    if not name:
        errors.append("工具名称不能为空")
    if not icon:
        errors.append("工具图标不能为空")
    if not single_original_path:
        errors.append("Single模式原始数据路径不能为空")
    
    if errors:
        log(f"配置保存失败: {'; '.join(errors)}")
        return False
    
    configs = load_tool_config()
    
    configs[tool_id] = {
        'name': name,
        'description': description,
        'icon': icon,
        'json_path': json_path,
        'mem': mem,
        'cpu': cpu,
        'single_original_path': single_original_path,
        'multi_original_path': multi_original_path,
        'last_updated': datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    }
    
    return save_tool_config(configs)


def delete_tool_config(tool_id: str) -> bool:
    """删除工具配置"""
    configs = load_tool_config()
    if tool_id in configs:
        configs.pop(tool_id, None)
        save_tool_config(configs)
        log(f"配置已删除: tool_id={tool_id}")
        return True
    return False