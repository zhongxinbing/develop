"""
工具页面路由模块
"""
from flask import Blueprint, render_template, request
from datetime import datetime
from typing import Dict

from api.utils import log
from api.services.tool_config import get_tool_config
from api.services.global_state import global_state
from config import CASE_CONFIG
from data_cache import data_cache, version_manager
from tool.elint.elint import get_elint_data, get_perf
from tool.elint.parse import refresh_parsed_projects

tool_bp = Blueprint('tool', __name__)

# 全局变量（保持与原有行为一致）
_current_projects_data: Dict = {}


@tool_bp.route('/tool/<tool_id>')
def tool_page(tool_id: str):
    """工具主页面"""
    if tool_id not in CASE_CONFIG:
        return "工具不存在", 404
    
    tool_info = CASE_CONFIG[tool_id]
    
    json_path = tool_info.get('json_path', '')
    mem_path = tool_info.get('mem', '')
    cpu_path = tool_info.get('cpu', '')
    single_original_path = tool_info.get('single_original_path', '')
    
    # 获取项目数据（优先使用缓存）
    cache_key = f"{tool_id}_single_projects_data"
    cached = data_cache.get(cache_key)
    
    if cached and (datetime.now().timestamp() - cached.get('timestamp', 0) < 300):
        _current_projects_data = cached['projects_data']
        # 使用缓存的数据恢复全局状态
        if 'parsed_projects' in cached:
            global_state.parsed_projects = cached['parsed_projects']
            global_state.project_list = cached['project_list']
        else:
            parsed_projects, project_list = refresh_parsed_projects(_current_projects_data)
            global_state.parsed_projects = parsed_projects
            global_state.project_list = project_list
        log("使用缓存数据")
    else:
        config = {
            'json_path': json_path,
            'original_path': single_original_path
        }
        projects_data = get_elint_data(config.get('json_path', ''), config.get('original_path', ''))
        _current_projects_data = projects_data.copy()
        parsed_projects, project_list = refresh_parsed_projects(_current_projects_data)
        global_state.parsed_projects = parsed_projects
        global_state.project_list = project_list

        if True:  # CONFIG['cache_enabled']
            data_cache.set(cache_key, {
                'projects_data': _current_projects_data,
                'parsed_projects': parsed_projects,
                'project_list': project_list,
                'timestamp': datetime.now().timestamp()
            })
    
    # 从全局状态获取数据
    parsed_projects = global_state.parsed_projects
    project_list = global_state.project_list
    
    # 准备前端数据
    projects_data_json = {
        pid: {
            'dates': info['dates'],
            'available_dates': info.get('available_dates', info['dates']),
            'rules': info['rules'],
            'rule_data': info['rule_data'],
            'project_name': info['project_name']
        }
        for pid, info in parsed_projects.items()
    }

    perf = get_perf(mem_path, cpu_path)
    multi_original_path = tool_info.get('multi_original_path', '')
    
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
        json_path=json_path,
        mem_path=mem_path,
        cpu_path=cpu_path
    )