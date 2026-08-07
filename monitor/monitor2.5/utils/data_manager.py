
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
        self._cache_ttl_seconds = 30
        
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
        cache_key = f"{tool_id}"
        
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
        cache_key = f"{tool_id}"
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
        """去重"""
        for casename,casedata in data.items():
            rules_data = casedata["rules_data"]
            for rule_name,ruledata in rules_data.items():
                rules_data[rule_name]["thread"] = sorted(list(set(rules_data[rule_name]["thread"])))
                rules_data[rule_name]["dates"] = sorted(list(set(rules_data[rule_name]["dates"])))
            data[casename]["rules_data"] = rules_data
        return data

    def get_all_data(self, tool_id: str, all_data: Dict, data_type: str):
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
            max_depth=6,
            include_patterns=[r"^\d{8}_[^\s]+\.txt", r"elint\.log$"],
            exclude_patterns=[r"\.tmp$", r"\.swp$"]
        )

        # 获取需要处理的文件
        files_to_process, all_files = self._get_files_to_process(tool_id, data_type, data_root, scanner)

        # 如果有文件需要处理
        if files_to_process:
            # 解析增量数据
            try:
                all_data = self.duplicate_removal(func(all_data, files_to_process)) or {}

                return [all_data,files_to_process]
            except Exception as e:
                self.logger.exception(f"解析数据失败: {e}")
                return [all_data,files_to_process]
        
        return [all_data, files_to_process]

    def _save_processed_data(self, tool_id: str, data: Dict, files: List[FileInfo]):
        """保存处理后的数据和版本信息"""
        try:
            # 保存数据
            data_file = DATA_DIR / tool_id / f'{tool_id}.json'
            save_tool_data(data_file, data)

            if "single" in files:
                # 更新版本信息
                self._update_version_info(tool_id, "single", files["single"])
            if "multi" in files:
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
                parsed = data_parser.parse_all_data(tool_id, raw_data, data_type)
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

        if not rules:
            return {"dates": dates, "rules": {}, "crash_dates": [], "overall_data": {}, "selected_threads": []}

        data_path = DATA_DIR / tool_id / "original" / mode / casename / chart_type / f'{rules[0]}.json'
        if not data_path.exists():
            fallback_path = DATA_DIR / tool_id / "original" / mode / casename / chart_type / f'{rules[0]}.json'
            if fallback_path.exists():
                data_path = fallback_path
            else:
                return {"dates": dates, "rules": {}, "crash_dates": [], "overall_data": {}, "selected_threads": []}

        case_rule_data = load_tool_data(data_path) or {}
        rules_data = case_rule_data.get("rules", {})
        crash_dates = set()

        choice_data = {
            "dates": dates,
            "rules": {},
            "crash_dates": [],
            "overall_data": case_rule_data.get("overall_data", {})
        }

        for thread in selected_threads:
            rule_key = rules[0] if thread == -1 else f"{rules[0]}({thread})"
            rule_info = rules_data.get(rule_key, {})
            if not rule_info:
                continue

            rule_dates = rule_info.get("dates", [])
            values = []
            for date in dates:
                if date not in rule_dates:
                    values.append(None)
                    crash_dates.add(date)
                else:
                    index = rule_dates.index(date)
                    values.append(rule_info.get("values", [None])[index])
                    if date in case_rule_data.get("crash_dates", []) and date not in crash_dates:
                        crash_dates.add(date)

            choice_data["rules"][rule_key] = {
                "dates": dates,
                "values": values,
                "type": rule_info.get("type"),
                "name": rule_info.get("name"),
            }
            if mode == "single":
                choice_data["rules"][rule_key]["is_single"] = rule_info.get("is_single")
            else:
                choice_data["rules"][rule_key].update({
                    "thread": rule_info.get("thread"),
                    "color": rule_info.get("color"),
                    "rule_name": rule_info.get("rule_name"),
                    "is_multi": rule_info.get("is_multi"),
                })

        choice_data["crash_dates"] = list(crash_dates)
        if mode == "multi":
            choice_data["selected_threads"] = case_rule_data.get("all_threads", [])

        return choice_data

    # ==================== 数据加载接口 ====================

    def load_single_chart(self, tool_id: str, all_data: Dict):
        """加载单线程数据"""
        self.logger.info(f"加载工具 {tool_id} 单线程数据")
        single_data, filepaths = self.get_all_data(tool_id, all_data, "single")

        return single_data, filepaths

    def load_multi_chart(self, tool_id: str, all_data: Dict):
        """加载多线程数据"""
        self.logger.info(f"加载工具 {tool_id} 多线程数据")
        multi_data, filepaths = self.get_all_data(tool_id, all_data, "multi")
        # message = '多线程数据已更新' if multi_data else '多线程数据加载完成'
        return multi_data, filepaths

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

    def load_single_or_multi_chart(self, tool_id: str, user_id: str):
        """加载单线程和多线程数据"""
        self.create_user_data_dir(user_id, tool_id)
        
        # 初始化文件监听器
        self.init_file_watcher(tool_id)
        ############################################################################
        # 检查缓存是否在 TTL 内，命中则直接返回，实现快速响应
        cache_key = (tool_id)
        self.logger.info(f"开始加载工具 {tool_id} 数据")
            # 检查缓存
        with self._cache_lock:
            cached_entry = self._data_cache.get(cache_key)

            if cached_entry is not None:
                cached_at, cached_value = cached_entry
                if time.time() - cached_at < self._cache_ttl_seconds:
                    self.logger.warning(f"缓存命中，数据已经是最新的")
                    return cached_value, "数据已经是最新的"
                self._data_cache.pop(cache_key, None)
        ############################################################################
        # 获取已有数据    工具以往保存的数据；如果存在则获取，否则返回空字典
        data_file = DATA_DIR / tool_id / f'{tool_id}.json'
        if data_file.exists():
            all_data = load_tool_data(data_file) or {}
        else:
            all_data = {}
        ############################################################################
        # 获取新数据
        filepaths = {'single': {}, 'multi': {}}
        tool_config = tool_manager.get_tool(tool_id) or {}
        # 单线程数据
        if Path(tool_config.get('single_path')):
            # 检查单线程路径是否为空，并且是否存在
            self.logger.info(f"加载工具 {tool_id} 单线程数据")
            all_data, filepaths['single'] = self.load_single_chart(tool_id, all_data)
        else:
            return {}, "单线程路径不存在"

        # 多线程数据
        if tool_config.get('multi_path'):
            # 检查多线程路径是否为空，并且是否存在
            if Path(tool_config.get('multi_path')):
                self.logger.info(f"加载工具 {tool_id} 多线程数据")
                all_data, filepaths['multi'] = self.load_multi_chart(tool_id, all_data)
            else:
                return all_data, "多线程路径不存在"

        if tool_config.get('extra_display_path'):
            if Path(tool_config.get('extra_display_path')):
                self.logger.info(f"加载工具 {tool_id} 额外数据")
                data_parsers['extra'] = self.load_extra_chart(tool_id, user_id)
            else:
                message = ''
        else:
            message = ''
        ############################################################################
        # 解析数据 -> 先判断数据是否被更新，如果更新在解析，否则直接加载缓存
        data_parser_path = DATA_DIR / tool_id / f"{tool_id}_parser.json"
        message = []
        if filepaths['single'] or filepaths['multi']:
            if 'single' in filepaths and filepaths['single']:
                message.append('单线程')
            if 'multi' in filepaths and filepaths['multi']:
                message.append('多线程')
            self.logger.info(f"更新了：{message}")
            # 解析数据
            data_parsers = data_parser.parse_all_data(all_data)
            # 异步保存数据
            self._executor.submit(save_tool_data, data_parser_path, data_parsers)
            # 更新缓存
            with self._cache_lock:
                self._data_cache[cache_key] = (time.time(), all_data)
        else:
            self.logger.info(f"未更新数据，加载工具 {tool_id} 解析数据")
            data_parsers = load_tool_data(data_parser_path)
        
        ############################################################################
        # 异步保存数据 -> 保存总数据、文件路径
        self._executor.submit(
            self._save_processed_data,
            tool_id, all_data, filepaths
        )

        if not message:
            message = "数据" + '、'.join(message) + "已更新"
        else:
            message = "数据已是最新"

        return data_parsers, message

    # ==================== 对比功能 ====================

    def compare_data(self, 
        tool_id: str, 
        mode: str,
        casename: str, 
        date1: str = None, 
        date2: str = None, 
        compare_mode: str = 'all',
        dimension: str = None,
        runtime_threshold: float = 0,
        memory_threshold: float = 0,
        error_mode: str = 'absolute',
        threads: List[int] = None,
        compare_type: str = 'single') -> Dict:
        """数据对比 - 支持单线程和多线程"""
        if not casename or not date1:
            return {'success': False, 'error': '请选择 Casename 和日期'}

        if compare_type == 'single' and not date2:
            return {'success': False, 'error': '版本对比需要两个日期'}

        data_path = DATA_DIR / tool_id / "original" / mode / casename
        if not data_path.exists():
            return {'success': False, 'error': f'找不到 casename: {casename} 的数据'}

        if dimension:
            dimensions = [dimension]
        else:
            dimensions = ['cputime', 'realtime', 'peakmem', 'incmem', 'realtimeincmem']
            dimensions = [d for d in dimensions if (data_path / d).exists()]

        if compare_mode == 'all':
            rules = self._get_all_rules(data_path, dimensions)
        else:
            rules = [compare_mode]

        if mode == 'multi' and threads:
            thread_list = threads
        elif mode == 'multi':
            thread_list = self._get_all_threads(data_path, casename, dimensions, rules)
        else:
            thread_list = [-1]

        result = self._perform_comparison(
            data_path, casename, dimensions, rules, thread_list,
            date1, date2 if compare_type == 'single' else None,
            runtime_threshold, memory_threshold, error_mode,
            mode, compare_type
        )

        return {'success': True, 'data': result}

    def _get_all_rules(self, data_path: Path, dimensions: List[str]) -> List[str]:
        """获取所有规则"""
        rules = set()
        for dim in dimensions:
            dim_path = data_path / dim
            if dim_path.exists():
                for file in dim_path.glob('*.json'):
                    rules.add(file.stem)
        return sorted(list(rules))

    def _get_all_threads(self, data_path: Path, casename: str, dimensions: List[str], rules: List[str]) -> List[int]:
        """获取所有线程数"""
        threads = set()
        for dim in dimensions:
            for rule in rules:
                rule_file = data_path / dim / f"{rule}.json"
                if rule_file.exists():
                    data = load_tool_data(rule_file)
                    if data and 'rules' in data:
                        for rule_key in data['rules']:
                            if '(' in rule_key and ')' in rule_key:
                                try:
                                    thread_str = rule_key.split('(')[1].split(')')[0]
                                    threads.add(int(thread_str))
                                except (ValueError, IndexError):
                                    pass
        return sorted(list(threads))

    def _perform_comparison(self, data_path: Path, casename: str, dimensions: List[str],
                           rules: List[str], thread_list: List[int], date1: str, date2: str,
                           runtime_threshold: float, memory_threshold: float,
                           error_mode: str, mode: str, compare_type: str) -> Dict:
        """执行对比计算"""
        is_thread_compare = (compare_type == 'thread')
        comparison_results = []
        statistics = {
            'runtime_increased': {},
            'runtime_decreased': {},
            'memory_increased': {},
            'memory_decreased': {},
            'avg_runtime_change': 0,
            'avg_memory_change': 0,
            'max_runtime_increased': {'name': '', 'value': 0},
            'max_runtime_decreased': {'name': '', 'value': 0},
            'max_memory_increased': {'name': '', 'value': 0},
            'max_memory_decreased': {'name': '', 'value': 0},
        }
        total_runtime_change = 0
        total_runtime_count = 0
        total_memory_change = 0
        total_memory_count = 0

        for rule in rules:
            row = [rule]
            has_runtime = False
            has_memory = False

            for dim in dimensions:
                rule_file = data_path / dim / f"{rule}.json"
                if not rule_file.exists():
                    continue
                rule_data = load_tool_data(rule_file)
                if not rule_data or 'rules' not in rule_data:
                    continue

                for rule_key, rule_info in rule_data['rules'].items():
                    if mode == 'single':
                        if not rule_info.get('is_single', False):
                            continue
                    else:
                        thread_match = False
                        for t in thread_list:
                            if f"({t})" in rule_key:
                                thread_match = True
                                break
                        if not thread_match:
                            continue

                    dates = rule_info.get('dates', [])
                    values = rule_info.get('values', [])

                    if is_thread_compare:
                        try:
                            idx = dates.index(date1)
                            val = values[idx] if idx < len(values) else None
                        except ValueError:
                            continue
                        if val is None:
                            continue
                        thread_num = rule_info.get('thread', 0)
                        row.append(f"{thread_num}线程")
                        row.append(round(val, 2))
                        if dim in ['cputime', 'realtime']:
                            has_runtime = True
                        elif dim in ['peakmem', 'incmem', 'realtimeincmem']:
                            has_memory = True
                        continue

                    val1 = None
                    val2 = None
                    try:
                        idx1 = dates.index(date1)
                        idx2 = dates.index(date2)
                        if idx1 < len(values):
                            val1 = values[idx1]
                        if idx2 < len(values):
                            val2 = values[idx2]
                    except ValueError:
                        continue
                    if val1 is None or val2 is None:
                        continue

                    diff = val2 - val1
                    diff_percent = 0 if val1 == 0 else round((diff / val1) * 100, 2)
                    is_runtime = dim in ['cputime', 'realtime']
                    is_memory = dim in ['peakmem', 'incmem', 'realtimeincmem']
                    diff_key = "diff_percent" if error_mode == 'percentage' else "diff"
                    diff_value = diff_percent if error_mode == 'percentage' else diff
                    status = self._get_status(diff_value, is_runtime, runtime_threshold, memory_threshold)

                    if is_runtime:
                        has_runtime = True
                        total_runtime_change += abs(diff_value)
                        total_runtime_count += 1
                        self._update_statistics(statistics, 'runtime', status, rule, diff_value)
                    elif is_memory:
                        has_memory = True
                        total_memory_change += abs(diff_value)
                        total_memory_count += 1
                        self._update_statistics(statistics, 'memory', status, rule, diff_value)

                    display_diff = diff_percent if error_mode == 'percentage' else diff
                    row.extend([round(val1, 2), round(val2, 2), round(display_diff, 2), status])

            if is_thread_compare:
                if len(row) > 1:
                    comparison_results.append(row)
            else:
                if has_runtime or has_memory:
                    comparison_results.append(row)

        if not is_thread_compare:
            if total_runtime_count > 0:
                statistics['avg_runtime_change'] = round(total_runtime_change / total_runtime_count, 2)
            if total_memory_count > 0:
                statistics['avg_memory_change'] = round(total_memory_change / total_memory_count, 2)

            statistics['runtime_increased'] = sorted(
                statistics['runtime_increased'].items(),
                key=lambda x: x[1], reverse=True
            )
            statistics['runtime_decreased'] = sorted(
                statistics['runtime_decreased'].items(),
                key=lambda x: x[1], reverse=True
            )
            statistics['memory_increased'] = sorted(
                statistics['memory_increased'].items(),
                key=lambda x: x[1], reverse=True
            )
            statistics['memory_decreased'] = sorted(
                statistics['memory_decreased'].items(),
                key=lambda x: x[1], reverse=True
            )
        else:
            statistics = {}

        return {
            'statistics': statistics,
            'comparisons': comparison_results
        }

    def _get_status(self, diff_value: float, is_runtime: bool, runtime_threshold: float, memory_threshold: float) -> str:
        """获取变化状态"""
        threshold = runtime_threshold if is_runtime else memory_threshold
        if diff_value > threshold:
            return '⬆️增加'
        elif diff_value < -threshold:
            return '⬇️减少'
        else:
            return '· 无变化'

    def _update_statistics(self, statistics: Dict, type_name: str, status: str, rule: str, diff_value: float):
        """更新统计信息"""
        key = f"{type_name}_increased" if status == '⬆️增加' else f"{type_name}_decreased"
        if status != '· 无变化':
            statistics[key][rule] = abs(diff_value)
            max_key = f"max_{type_name}_increased" if status == '⬆️增加' else f"max_{type_name}_decreased"
            if statistics[max_key]['value'] < abs(diff_value):
                statistics[max_key] = {'name': rule, 'value': abs(diff_value)}

    # ==================== 清理 ====================

    def dispose(self):
        """释放资源"""
        self.stop_file_watcher()
        self._executor.shutdown(wait=False)
        self.logger.info("数据管理器已释放")


# 全局实例
data_manager = DataManager()