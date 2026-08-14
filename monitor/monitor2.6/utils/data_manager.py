
"""
数据管理器 - 处理数据获取和解析（支持文件监听和增量更新）
"""
import concurrent.futures
import importlib.util
import time
import threading
from pathlib import Path
from typing import Any, Callable, Dict, Optional, List, Set
from datetime import datetime

from config import BASE_DIR, DATA_DIR
from utils.common import *
from utils.data_parser import data_parser
from utils.file_scanner import FileSystemScanner, FileInfo
from utils.file_watcher import FileChangeEvent, FileWatcher, get_file_watcher
from utils.log import get_logger, setup_logger
from utils.tool_manager import tool_manager

logger = get_logger(__name__)


class DataManager:
    """
    数据管理器 - 负责调用用户配置的函数获取数据
    
    支持:
    - 基于文件 mtime 的增量更新
    - 文件系统自动监听
    - 异步后台解析
    - 多级缓存
    """
    
    _instance = None
    _lock = threading.Lock()
    _function_cache = {}
    
    def __new__(cls):
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = super().__new__(cls)
        return cls._instance
    
    def __init__(self):
        if hasattr(self, '_initialized'):
            return
        self._initialized = True
        self._function_cache = {}
        self.data_files = {}
        
        # 数据缓存
        self._cache_lock = threading.Lock()
        self._data_cache: Dict[tuple, tuple[float, Any]] = {}
        self._cache_ttl_seconds = 60 *5
        
        # 解析任务线程池
        self._executor = concurrent.futures.ThreadPoolExecutor(max_workers=2)
        self._parsing_tasks: Dict[str, concurrent.futures.Future] = {}
        
        # 版本信息缓存
        self._version_cache: Dict[str, Dict] = {}
        
        # 文件监听器
        self._watcher: Optional[FileWatcher] = None
        self._watcher_paths: Set[str] = set()
        
        setup_logger(log_dir='logs', level='DEBUG')
        self.logger = get_logger(__name__)
        self.logger.info("数据管理器初始化完成")

    # ==================== 文件版本管理 ====================
    
    def _get_version_file_path(self, tool_id: str, data_type: str) -> Path:
        """获取版本文件路径"""
        return DATA_DIR / tool_id / f'{data_type}_version.json'

    def _load_version_info(self, tool_id: str, data_type: str) -> Dict:
        """加载版本信息"""
        version_file = self._get_version_file_path(tool_id, data_type)
        cache_key = f"{tool_id}:{data_type}"
        
        if cache_key in self._version_cache:
            return self._version_cache[cache_key]
        
        version_info = load_tool_data(version_file) or {
            'version': 1,
            'last_scan_time': 0,
            'processed_files': {},
            'processed_dirs': {}
        }

        self._version_cache[cache_key] = version_info
        return version_info

    def _save_version_info(self, tool_id: str, data_type: str, version_info: Dict):
        """保存版本信息"""
        version_file = self._get_version_file_path(tool_id, data_type)
        cache_key = f"{tool_id}:{data_type}"
        self._version_cache[cache_key] = version_info
        save_tool_data(version_file, version_info)

    def _update_version_info(self, tool_id: str, data_type: str, files: List[FileInfo]):
        """更新版本信息"""
        version_info = self._load_version_info(tool_id, data_type)
        
        for f in files:
            version_info['processed_files'][f.path] = {
                'mtime': f.mtime,
                'size': f.size,
                'processed_at': time.time()
            }
        
        version_info['last_scan_time'] = time.time()
        self._save_version_info(tool_id, data_type, version_info)

    # ==================== 数据加载 ====================

    def create_user_data_dir(self, user_id: str, tool_id: str) -> Path:
        """创建用户数据目录"""
        user_data_dir = DATA_DIR / tool_id / user_id
        if not user_data_dir.exists():
            user_data_dir.mkdir(parents=True, exist_ok=True)
            self.logger.info(f"创建用户数据目录: {user_data_dir}")
        return user_data_dir

    def _load_function(self, function_name: str, tool_config) -> Optional[Callable]:
        """动态加载Python函数"""
        tool_name = tool_config.get('tool_name')
        if not tool_name:
            return None

        script_path = BASE_DIR / "tool" / tool_name / f"{tool_name}.py"
        cache_key = f"{script_path}:{function_name}"
        
        if cache_key in self._function_cache:
            return self._function_cache[cache_key]

        try:
            if not Path(script_path).exists():
                self.logger.error(f"脚本不存在: {script_path}")
                return None

            spec = importlib.util.spec_from_file_location(
                f"dynamic_module_{tool_name}_{hash(script_path)}", 
                script_path
            )
            if spec and spec.loader:
                module = importlib.util.module_from_spec(spec)
                spec.loader.exec_module(module)
                func = getattr(module, function_name, None)
                if func and callable(func):
                    self._function_cache[cache_key] = func
                    return func
                    
            self.logger.error(f"无法加载函数: {function_name}")
            return None
        except Exception as e:
            self.logger.error(f"加载函数失败 {function_name}: {e}")
            return None

    def _get_files_to_process(
        self, 
        tool_id: str, 
        data_type: str, 
        data_root: str,
        scanner: FileSystemScanner
    ) -> tuple:
        """
        获取需要处理的文件列表
        
        Returns:
            (files_to_process: List[FileInfo], all_files: List[FileInfo])
        """
        version_info = self._load_version_info(tool_id, data_type)
        processed_files = version_info.get('processed_files', {})
        
        # 扫描当前文件系统
        all_files = scanner.scan()

        # 计算增量
        files_to_process = []
        for f in all_files:
            old_info = processed_files.get(f.path)
            if not old_info:
                files_to_process.append(f)
            elif old_info.get('mtime') != f.mtime or old_info.get('size') != f.size:
                files_to_process.append(f)

        return files_to_process, all_files

    def duplicate_removal(self, data: Dict) -> Dict:
        """去重（O(n) 实现）"""
        for casename, casedata in data.items():
            casedata["threads"] = sorted(set(casedata.get("threads", [])))
            casedata["dates"] = sorted(set(casedata.get("dates", [])))
            seen = set()
            metrics = []
            for item in casedata.get("metrics", []):
                try:
                    if item not in seen:
                        seen.add(item)
                        metrics.append(item)
                except TypeError:
                    metrics.append(item)
            casedata["metrics"] = metrics
        return data

    def get_all_data(self, tool_id: str, incremental_data: Dict, data_type: str):
        """
        加载工具数据，支持增量更新
        
        Args:
            tool_id: 工具ID
            user_id: 用户ID
            data_type: 数据类型 ('single' 或 'multi')
            
        Returns:
            解析后的数据
        """
        tool_config = tool_manager.get_tool(tool_id) or {}
 
        if not tool_config:
            self.logger.error(f"工具配置不存在: {tool_id}")
            return {}

        data_root = tool_config.get(f'{data_type}_path')
        if not data_root:
            return {}

        # 获取数据获取函数
        func = self._load_function(tool_config.get(f'{data_type}_func'), tool_config)
        if not func:
            self.logger.error(f"无法加载 {data_type} 数据处理函数")
            return {}
        
        # 创建文件扫描器
        scanner = FileSystemScanner(
            data_root,
            max_depth=tool_config.get(f'{data_type}_max_depth'),
            include_patterns=[rf"{tool_config.get(f'{data_type}_file_pattern')}"],
            exclude_patterns=[r"\.tmp$", r"\.swp$"]
        )

        # 获取需要处理的文件
        files_to_process, all_files = self._get_files_to_process(tool_id, data_type, data_root, scanner)
        
        # 如果有文件需要处理

        if files_to_process:
            # 解析增量数据
            try:

                incremental_data = func(incremental_data,files_to_process) or {}
            
                return incremental_data, all_files
            except Exception as e:
                self.logger.exception(f"{data_type} 解析数据失败: {e}")
                return incremental_data, all_files
        
        return incremental_data, all_files

    def _save_processed_data(self, tool_id: str, data: Dict, files: List[FileInfo], single_exists: int, multi_exists: int):
        """保存处理后的数据和版本信息"""
        try:
            # 保存数据
            data_file = DATA_DIR / tool_id / f'{tool_id}.json'
            save_tool_data(data_file, data)

            if "single" in files and single_exists == 1:
                # 更新版本信息
                self._update_version_info(tool_id, "single", files["single"])
            if "multi" in files and multi_exists == 1:
                # 更新版本信息
                self._update_version_info(tool_id, "multi", files["multi"])
            
            self.logger.info(f"数据保存完成: {data_file}")
        except Exception as e:
            self.logger.exception(f"保存数据失败: {e}")

    # ==================== 文件监听集成 ====================

    def _on_file_change(self, events: List[FileChangeEvent]):
        """
        文件变更事件回调
        
        当文件系统发生变化时，触发数据更新
        """
        if not events:
            return

        # 收集变更的文件路径
        changed_paths = set()
        for event in events:
            if event.event_type == 'deleted':
                changed_paths.add(event.src_path)
            else:
                changed_paths.add(event.src_path)
                if event.dest_path:
                    changed_paths.add(event.dest_path)

        self.logger.info(f"文件变更触发更新: {len(changed_paths)} 个文件")

        # 触发数据更新（异步）
        self._executor.submit(self._handle_file_changes, list(changed_paths))

    def _handle_file_changes(self, changed_paths: List[str]):
        """
        处理文件变更
        
        根据变更的文件路径，找到对应的工具和数据，重新加载
        """
        # 这里可以优化：根据路径映射到具体的工具和数据
        # 简化实现：清除所有缓存
        with self._cache_lock:
            self._data_cache.clear()
        
        self.logger.info("缓存已清除，等待下次请求时重新加载")

    def init_file_watcher(self, tool_id: str):
        """
        为指定工具初始化文件监听器
        
        Args:
            tool_id: 工具ID
        """
        tool_config = tool_manager.get_tool(tool_id) or {}
        if not tool_config:
            return

        # 收集需要监听的路径
        watch_paths = []
        for data_type in ['single', 'multi']:
            path = tool_config.get(f'{data_type}_path')
            if path:
                watch_paths.append(path)

        if not watch_paths:
            self.logger.info(f"工具 {tool_id} 没有配置数据路径，跳过监听")
            return

        # 更新监听路径集合
        for path in watch_paths:
            self._watcher_paths.add(path)

        # 启动监听器
        try:
            watcher = get_file_watcher(
                watch_paths=list(self._watcher_paths),
                callback=self._on_file_change,
                watch_patterns=[r"^\d{8}_[^/]+\.txt$", r"elint\.log$"]
            )
            
            if not watcher.is_running():
                watcher.start()
                self.logger.info(f"文件监听器已启动，监听路径: {list(self._watcher_paths)}")
        except Exception as e:
            self.logger.exception(f"启动文件监听器失败: {e}")

    def stop_file_watcher(self):
        """停止文件监听器"""
        from utils.file_watcher import stop_file_watcher
        stop_file_watcher()
        self.logger.info("文件监听器已停止")

    # ==================== 原有接口兼容 ====================

    def _submit_background_parse(self, tool_id: str, data_type: str, raw_data, old_raw_data):
        """提交后台解析任务"""
        key = f"{tool_id}:{data_type}"
        future = self._parsing_tasks.get(key)
        if future and not future.done():
            self.logger.info(f"解析任务已在后台执行: {key}")
            return future.result()

        def _job():
            try:
                self.logger.info(f"后台解析开始: {key}")
                parsed = data_parser.parse_all_data({}, raw_data, 1, 1)
                target = DATA_DIR / tool_id / f"{data_type}.json"
                parsed = deep_merge(old_raw_data, parsed)
                save_tool_data(target, parsed)
                self.logger.info(f"后台解析完成并保存: {target}")
                return parsed
            except Exception as e:
                self.logger.exception(f"后台解析失败 {key}: {e}")
                return None

        future = self._executor.submit(_job)
        self._parsing_tasks[key] = future
        return future.result()

    @staticmethod
    def resolve_chart_group(chart_type: str) -> str:
        """解析图表分组"""
        key = (chart_type or 'runtime').strip().lower()
        runtime_aliases = {'runtime', 'cputime', 'realtime'}
        memory_aliases = {'memory', 'peakmem', 'incmem', 'realtimeincmem'}
        if key in runtime_aliases:
            return 'runtime'
        if key in memory_aliases:
            return 'memory'
        return key

    def send_data_to_frontend_for_chart(self, front_data: Dict):
        """发送数据到前端渲染图表"""
        tool_id = front_data.get('toolID', '')
        casename = front_data.get('casename', '')
        mode = front_data.get('mode', 'single')
        chart_type = front_data.get('chart_type', 'cputime')
        rules = front_data.get('rules', [])
        dates = front_data.get('dates', [])
        selected_threads = front_data.get('selected_threads', [])
        
        self.logger.info(f"前端请求数据 -> 工具：{tool_id}，用例：{casename}，模式：{mode}，图表类型：{chart_type}，规则：{rules}，日期：{dates}，线程：{selected_threads}")
        
        cache_data = {}
        cache_data_path = DATA_DIR / tool_id / 'parser' / 'single_multi' / f'{casename}.json'
        cache_data[casename] = load_tool_data(cache_data_path)
        
        if not dates or casename not in cache_data:
            return {"dates": dates, "rules": {}, "crash_dates": []}

        colors = {
            '-1': '#00E5FF', '0': '#00E5FF', '2': '#A855F7', '4': '#10B981',
            '6': '#F59E0B', '8': '#EF4444', '16': '#EC4899', '32': '#14B8A6',
            '64': '#6366F1', '128': '#F97316',
        }

        rule = rules[0]
        if rule not in cache_data[casename].get(chart_type, {}):
            return {"dates": [], "rules": {}, "crash_dates": []}

        rule_data = {"rules": {}, "crash_dates": [], "dates": []}
        rule_data["rules"][rule] = {}

        # 获取 crash_dates
        crash_dates_set = set()
        crash_dict = cache_data[casename].get('crash_dates', {})
        if isinstance(crash_dict, dict):
            for thread_dates in crash_dict.values():
                if isinstance(thread_dates, list):
                    crash_dates_set.update(thread_dates)

        # 获取所有线程的数据，并收集实际存在的日期
        thread_date_values = {}
        all_valid_dates = set()
        
        for thread in selected_threads:
            thread = str(thread)
            thread_rules = cache_data[casename][chart_type][rule]
            if thread not in thread_rules:
                continue

            thread_entry = thread_rules[thread]
            date_list = thread_entry.get("date", [])
            data_list = thread_entry.get("data", [])
            
            # 构建该线程的日期到值的映射
            date_value_map = {}
            for i, d in enumerate(date_list):
                if i < len(data_list):
                    date_value_map[d] = data_list[i]
                    all_valid_dates.add(d)
            thread_date_values[thread] = date_value_map

        # 确定最终的日期列表：所有线程有数据的日期的并集，并按用户选择的日期过滤
        if dates:
            final_dates = [d for d in dates if d in all_valid_dates]
        else:
            final_dates = sorted(all_valid_dates)

        if not final_dates:
            return {"dates": [], "rules": {}, "crash_dates": []}

        # 为每个线程生成数据序列（缺失值用 None 填充）
        for thread, date_value_map in thread_date_values.items():
            color = colors.get(thread, '#A855F7')
            values = []
            
            for date in final_dates:
                if date in date_value_map:
                    values.append(date_value_map[date])
                else:
                    values.append(None)  # 用 None 表示缺失数据

            rule_data["rules"][rule][thread] = {
                "color": color,
                "values": values,
                "type": "line"
            }

        # 设置 crash_dates（只保留在最终日期列表中的）
        rule_data["crash_dates"] = [d for d in final_dates if d in crash_dates_set]
        rule_data["dates"] = final_dates

        return rule_data
    
    def send_data_to_frontend_for_thread_chart(self, front_data: Dict):
        """发送数据到前端渲染线程图表"""
        casename = front_data.get('casename', '')
        rule = front_data.get('rule', '')
        date = front_data.get('date', '')
        tool_id = front_data.get('toolID', '')
        chart_type = front_data.get('chart_type', 'cputime')
        mode = front_data.get('mode', 'thread')
        # 从文件中读取数据
        cache_data = {}
        cache_data_path = DATA_DIR / tool_id / 'parser' / 'thread' / f'{casename}.json'
        cache_data[casename] = load_tool_data(cache_data_path)

        if casename not in cache_data:
            return {}
        if chart_type not in cache_data[casename]:
            return {}
        if rule not in cache_data[casename][chart_type]:
            return {}
        if date not in cache_data[casename][chart_type][rule]:
            return {}
        return cache_data[casename][chart_type][rule][date]

    # ==================== 数据加载接口 ====================

    def load_single_chart(self, tool_id: str, all_data: Dict):
        """加载单线程数据"""
        self.logger.info(f"加载工具 {tool_id} 单线程数据")
        incremental_data, all_files = self.get_all_data(tool_id, all_data, "single")

        return incremental_data, all_files

    def load_multi_chart(self, tool_id: str, all_data: Dict):
        """加载多线程数据"""
        self.logger.info(f"加载工具 {tool_id} 多线程数据")
        incremental_data, all_files = self.get_all_data(tool_id, all_data, "multi")
        
        return incremental_data, all_files

    def load_extra_chart(self, tool_id: str, user_id: str):
        """加载额外数据"""
        self.logger.info(f"加载工具 {tool_id} 额外数据")
        tool_config = tool_manager.get_tool(tool_id) or {}
        extra_display_path = tool_config.get('extra_display_path') or ''
        func = self._load_function(tool_config.get('extra_display_func'), tool_config)
        extra = func(extra_display_path) if func else {}
        return extra

    def load_thread_chart(self, request_data: Dict):
        casename = request_data.get('casename', '')
        rule = request_data.get('rule', '')
        date = request_data.get('date', '')
        tool_id = request_data.get('toolID', '')
        mode = request_data.get('mode', 'all')

        case_rule_data_json_path = DATA_DIR / tool_id / "original" / "thread" / casename / date / f"{rule}.json"
        if not case_rule_data_json_path.exists():
            self.logger.error(f"线程数据文件不存在: {case_rule_data_json_path}")
            return {}
        
        case_rule_data = load_tool_data(case_rule_data_json_path)

        return case_rule_data

    def get_single_data(self, data_parsers: Dict):
        """获取单线程数据"""
        single = {}
        for casename,case_data in data_parsers['single_multi_chart'].items():
            for type_chart,chart_data in case_data.items():
                if type_chart == "crash_dates":
                    if 'crash_dates' not in single.setdefault(casename, {}):
                        single.setdefault(casename, {})['crash_dates'] = []
                    if -1 in chart_data:
                        if 'crash_dates' not in single.setdefault(casename, {}):
                            single.setdefault(casename, {})['crash_dates'] = []
                        single[casename]['crash_dates'] = list(chart_data[-1])
                    continue
                for rule, rule_data in chart_data.items():
                    for thread, thread_data in rule_data.items():
                        if int(thread) == -1:
                            single.setdefault(casename, {}).setdefault(type_chart, {}).setdefault(rule, {})["date"] = list(thread_data['date'])
                            single.setdefault(casename, {}).setdefault(type_chart, {}).setdefault(rule, {})["data"] = list(thread_data['data'])
        return single

    def load_single_or_multi_chart(self, tool_id: str, user_id: str):
        """加载单线程和多线程数据"""
        self.create_user_data_dir(user_id, tool_id)
        
        # 初始化文件监听器
        self.init_file_watcher(tool_id)
        ############################################################################
        # 检查缓存是否在 TTL 内，命中则直接返回，实现快速响应
        cache_key = (f"{tool_id}")
        self.logger.info(f"开始加载工具 {tool_id} 数据")
        paraser = DATA_DIR / tool_id / f'paserer.json'
        # 检查缓存
        with self._cache_lock:
            cached_entry = self._data_cache.get(cache_key, None)

            if cached_entry is not None:
                cached_at, cached_value = cached_entry
                if time.time() - cached_at < self._cache_ttl_seconds:
                    self.logger.warning(f"缓存命中，数据已经是最新的")
                    return cached_value['paser_data'], "数据已经是最新的"
                # _cache_ttl_seconds 过期，删除缓存
                self._data_cache.pop(cache_key, None)
        ############################################################################
        # 获取已有数据    工具以往保存的数据；如果存在则获取，否则返回空字典
        data_file = DATA_DIR / tool_id / f'{tool_id}.json'
        cache_entry = self._data_cache.get(cache_key)
        if cache_entry is not None and len(cache_entry) >= 2:
            try:
                yellow(f"获取{cache_key} 之前的缓存的数据: {list(cache_entry[1].keys())}")
                all_data = cache_entry[1].get('all_data', {})
                data_parsers = cache_entry[1].get('paser_data', {})
            except (KeyError, TypeError, IndexError):
                all_data = {}
                data_parsers = {}
        elif data_file.exists():
            all_data = load_tool_data(data_file) or {}
            data_parsers = load_tool_data(paraser) or {}
        else:
            all_data = {}
            data_parsers = {}

        ############################################################################
        # 所有的数据
        all_files = {'single': {}, 'multi': {}}
        tool_config = tool_manager.get_tool(tool_id) or {}
        # 新的增量的数据
        incremental_data = {}
        # 单线程数据
        single_incremental_flag = 0
        if tool_config.get('single_exists') == 1:
            # 检查单线程路径是否为空，并且是否存在
            self.logger.info(f"加载工具 {tool_id} 单线程数据")
            single_incremental_data, all_files['single'] = self.load_single_chart(tool_id, incremental_data)
            if single_incremental_data : single_incremental_flag = 1
        else:
            return {}, "单线程路径不存在"

        # 多线程数据
        multi_incremental_flag = 0
        if tool_config.get('multi_exists') == 1:
            # 检查多线程路径是否为空，并且是否存在
            if Path(tool_config.get('multi_path')):
                self.logger.info(f"加载工具 {tool_id} 多线程数据")
                multi_incremental_data, all_files['multi'] = self.load_multi_chart(tool_id, single_incremental_data)
                if multi_incremental_data : multi_incremental_flag = 1
            else:
                return {}, "多线程路径不存在"

        if tool_config.get('extra_exists') == 1:
            if Path(tool_config.get('extra_display_path')):
                self.logger.info(f"加载工具 {tool_id} 额外数据")
                data_parsers['extra'] = self.load_extra_chart(tool_id, user_id)
            else:
                message = ''
        else:
            message = ''
        # 合并总的数据
        all_data  = self.duplicate_removal(deep_merge(all_data, multi_incremental_data))
        ############################################################################
        # 解析数据 -> 先判断数据是否被更新，如果更新在解析，否则直接加载缓存

        message = []
        if single_incremental_flag or multi_incremental_flag:
            self.logger.info(f"开始解析工具 {tool_id} 数据")
            # 只解析新的增量数据
            data_parsers = data_parser.parse_all_data(data_parsers, multi_incremental_data, tool_id, tool_config.get('multi_exists'))
            
            save_tool_data(paraser, data_parsers, 4)
            ############################################################################
            # 异步保存数据 -> 保存总数据、文件路径
            self._executor.submit(
                self._save_processed_data,
                tool_id, all_data, all_files, tool_config.get('single_exists'), tool_config.get('multi_exists')
            )

        all_data_and_paser_data = {"all_data": all_data, "paser_data": data_parsers}
        # 更新缓存
        with self._cache_lock:
            self._data_cache[cache_key] = (time.time(), all_data_and_paser_data)

        if single_incremental_flag or multi_incremental_flag:
            if single_incremental_flag:
                message.append('单线程')
            if multi_incremental_flag:
                message.append('多线程')
            message = "数据" + '[' + '、'.join(message) + ']'  + "已更新"
        else:
            message = '未更新数据'
        # 返回给前端的数据、显示 casename 选择框、日期选择框、rule选择框、线程选择框
        
        return data_parsers, message

    # ==================== 清理 ====================

    def dispose(self):
        """释放资源"""
        self.stop_file_watcher()
        self._executor.shutdown(wait=False)
        self.logger.info("数据管理器已释放")


# 全局实例
data_manager = DataManager()