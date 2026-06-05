"""
对比配置服务模块
"""
from datetime import datetime
from pathlib import Path
from typing import Dict

from api.utils import log, save_json_file, load_json_file, ensure_dir
from config import COMPARE_CONFIG_FILE


def load_compare_config() -> Dict:
    """加载对比配置文件"""
    if not COMPARE_CONFIG_FILE.exists():
        return {}
    
    try:
        import json
        with open(COMPARE_CONFIG_FILE, 'r', encoding='utf-8') as f:
            content = f.read()
            return json.loads(content) if content.strip() else {}
    except Exception as e:
        log(f"加载对比配置失败: {e}")
        return {}


def save_compare_config(config_data: Dict) -> bool:
    """保存对比配置到文件"""
    try:
        ensure_dir(COMPARE_CONFIG_FILE)
        return save_json_file(COMPARE_CONFIG_FILE, config_data)
    except Exception as e:
        log(f"保存对比配置失败: {e}")
        return False


def get_compare_config(project_id: str) -> Dict:
    """获取指定项目的对比配置"""
    configs = load_compare_config()
    return configs.get(project_id, {})


def update_compare_config(project_id: str, config: Dict) -> None:
    """更新指定项目的对比配置"""
    log(f"保存配置: project_id={project_id}, config={config}")
    
    configs = load_compare_config()
    
    configs[project_id] = {
        'tolerance_runtime': config.get('tolerance_runtime', 0),
        'tolerance_memory': config.get('tolerance_memory', 0),
        'last_updated': datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    }
    
    save_compare_config(configs)


def delete_compare_config(project_id: str) -> None:
    """删除项目的对比配置"""
    configs = load_compare_config()
    if project_id in configs:
        configs.pop(project_id, None)
        save_compare_config(configs)
        log(f"配置已删除: project_id={project_id}")