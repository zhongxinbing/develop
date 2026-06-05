"""
工具页面路由模块（优化版 - 支持多线程数据）
"""
from flask import Blueprint, render_template, request
from datetime import datetime
from typing import Dict
import time
from pathlib import Path
from api.utils import log
from api.services.tool_config import get_tool_config
from api.services.global_state import global_state
from config import CONFIG
from data_cache import data_cache, version_manager
from tool.elint.elint import get_elint_data, get_perf, get_multi_data, get_combined_data
from tool.elint.parse import refresh_parsed_projects

tool_bp = Blueprint('tool', __name__)

# 全局变量（保持与原有行为一致）
_current_projects_data: Dict = {}


def _get_cache_key(tool_id: str, mode: str = 'single') -> str:
    """生成缓存键"""
    return f"{tool_id}_{mode}_projects_data"


@tool_bp.route('/tool/<tool_id>')
def tool_page(tool_id: str):
    """工具主页面（优化版 - 支持多线程数据）"""
    start_time = time.time()
    
    from config import CASE_CONFIG
    if tool_id not in CASE_CONFIG:
        return "工具不存在", 404
    
    tool_info = CASE_CONFIG[tool_id]
    log(f"加载工具页面: {tool_id} - {tool_info.get('name', '未知工具')}")
    # json_path = tool_info.get('json_path', '')

    Path("./data").resolve().joinpath(tool_id).mkdir(parents=True, exist_ok=True)
    global_state.json_path = str(Path("./data").resolve().joinpath(tool_id).joinpath("data.json"))

    log(f"工具数据路径: {global_state.json_path}")

    mem_path = tool_info.get('mem', '')
    cpu_path = tool_info.get('cpu', '')
    single_original_path = tool_info.get('single_original_path', '')
    multi_original_path = tool_info.get('multi_original_path', '')
    
    cache_key = _get_cache_key(tool_id, 'single')
    
    # 获取项目数据（优先使用缓存）
    cached = data_cache.get(cache_key, ttl=CONFIG['cache_ttl'])
    parsed_projects = None
    project_list = None
    used_cache = False
    
    if cached and (datetime.now().timestamp() - cached.get('timestamp', 0) < CONFIG['cache_ttl']):
        log("缓存数据有效，正在使用缓存")
        _current_projects_data = cached.get('projects_data', {})
        parsed_projects = cached.get('parsed_projects', {})
        project_list = cached.get('project_list', [])
        
        if parsed_projects and project_list:
            # 恢复全局状态
            global_state.parsed_projects = parsed_projects
            global_state.project_list = project_list
            used_cache = True
            log("使用缓存数据")
    
    log(f"缓存使用状态: {'使用缓存' if used_cache else '未使用缓存'}")

    if not used_cache:
        log("缓存无效或不存在，正在重新加载数据")
        # 获取合并数据（单线程 + 多线程）
        projects_data = get_combined_data(global_state.json_path, single_original_path, multi_original_path)
        _current_projects_data = projects_data.copy()
        parsed_projects, project_list = refresh_parsed_projects(_current_projects_data)
        
        # 更新全局状态
        global_state.parsed_projects = parsed_projects
        global_state.project_list = project_list
        
        if CONFIG['cache_enabled']:
            data_cache.set(cache_key, {
                'projects_data': _current_projects_data,
                'parsed_projects': parsed_projects,
                'project_list': project_list,
                'timestamp': datetime.now().timestamp()
            }, ttl=CONFIG['cache_ttl'])
    
    # 获取性能数据（带缓存）
    perf_cache_key = f"{tool_id}_perf"
    perf = data_cache.get(perf_cache_key)
    if perf is None:
        perf = get_perf(mem_path, cpu_path)
        data_cache.set(perf_cache_key, perf, ttl=CONFIG['cache_ttl'])
    
    # 准备前端数据
    projects_data_json = {
        pid: {
            'dates': info.get('dates', []),
            'available_dates': info.get('available_dates', info.get('dates', [])),
            'rules': info.get('rules', []),
            'rule_data': info.get('rule_data', {}),
            'project_name': info.get('project_name', pid)
        }
        for pid, info in parsed_projects.items()
    }
    
    elapsed = time.time() - start_time
    log(f"工具页面加载完成: {tool_id}, 耗时: {elapsed:.3f}秒")
    
    return render_template(
        'tool.html',
        tool_id=tool_id,
        tool_name=tool_info.get('name', tool_id),
        tool_icon=tool_info.get('icon', '🔧'),
        has_single=bool(single_original_path),
        has_multi=bool(multi_original_path),
        project_list=project_list,
        projects_data_json=projects_data_json,
        perf=perf,
        single_original_path=single_original_path,
        multi_original_path=multi_original_path,
        json_path=global_state.json_path,
        mem_path=mem_path,
        cpu_path=cpu_path
    )