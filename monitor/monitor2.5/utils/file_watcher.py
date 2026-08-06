"""
文件系统监听器 - 基于 watchdog 实现文件变更自动监听
"""
import os
import time
import threading
import re
from queue import Queue, Empty
from pathlib import Path
from typing import Dict, List, Set, Optional, Callable
from datetime import datetime

from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler, FileCreatedEvent, FileModifiedEvent, FileDeletedEvent

from utils.log import get_logger

logger = get_logger(__name__)


class FileChangeEvent:
    """文件变更事件"""
    def __init__(self, event_type: str, src_path: str, dest_path: str = None):
        self.event_type = event_type  # 'created', 'modified', 'deleted', 'moved'
        self.src_path = src_path
        self.dest_path = dest_path
        self.timestamp = datetime.now().timestamp()

    def __repr__(self):
        return f"FileChangeEvent(type={self.event_type}, path={self.src_path})"


class FileChangeHandler(FileSystemEventHandler):
    """
    文件变更事件处理器
    
    将 watchdog 事件转换为内部事件并放入队列
    """
    
    def __init__(self, event_queue: Queue, watch_patterns: List[str] = None):
        """
        初始化处理器
        
        Args:
            event_queue: 事件队列
            watch_patterns: 监听的文件名正则表达式列表
        """
        self.event_queue = event_queue
        self.watch_patterns = [re.compile(p) for p in (watch_patterns or [])]
        self._ignore_patterns = [re.compile(r'\.tmp$|\.swp$|~$|\.lock$')]
        logger.info("文件变更处理器初始化")

    def _should_ignore(self, path: str) -> bool:
        """判断是否应该忽略该文件"""
        name = os.path.basename(path)
        # 忽略临时文件
        if any(p.search(name) for p in self._ignore_patterns):
            return True
        # 应用包含规则
        if self.watch_patterns:
            return not any(p.search(name) for p in self.watch_patterns)
        return False

    def _put_event(self, event_type: str, src_path: str, dest_path: str = None):
        """将事件放入队列"""
        if self._should_ignore(src_path):
            return
        event = FileChangeEvent(event_type, src_path, dest_path)
        self.event_queue.put(event)
        logger.debug(f"事件入队: {event}")

    def on_created(self, event):
        if not event.is_directory:
            self._put_event('created', event.src_path)

    def on_modified(self, event):
        if not event.is_directory:
            self._put_event('modified', event.src_path)

    def on_deleted(self, event):
        if not event.is_directory:
            self._put_event('deleted', event.src_path)

    def on_moved(self, event):
        if not event.is_directory:
            self._put_event('moved', event.src_path, event.dest_path)


class FileWatcher:
    """
    文件系统监听器
    
    功能:
    - 监听指定目录的文件变更
    - 支持多种文件类型过滤
    - 事件去重和批量处理
    - 自动重连
    """
    
    def __init__(
        self,
        watch_paths: List[str],
        callback: Optional[Callable[[List[FileChangeEvent]], None]] = None,
        watch_patterns: List[str] = None,
        debounce_seconds: float = 2.0,
        batch_size: int = 100
    ):
        """
        初始化文件监听器
        
        Args:
            watch_paths: 要监听的目录路径列表
            callback: 事件处理回调函数
            watch_patterns: 监听的文件名正则表达式列表
            debounce_seconds: 防抖时间（秒）
            batch_size: 批量处理的最大事件数
        """
        self.watch_paths = [str(Path(p).resolve()) for p in watch_paths]
        self.callback = callback
        self.watch_patterns = watch_patterns or []
        self.debounce_seconds = debounce_seconds
        self.batch_size = batch_size
        
        self._observer = None
        self._event_queue = Queue()
        self._running = False
        self._thread = None
        self._lock = threading.Lock()
        self._processed_events = set()  # 用于去重
        
        logger.info(f"文件监听器初始化: watch_paths={watch_paths}")

    def start(self):
        """启动监听"""
        with self._lock:
            if self._running:
                logger.warning("监听器已在运行")
                return

            self._observer = Observer()
            handler = FileChangeHandler(self._event_queue, self.watch_patterns)

            for path in self.watch_paths:
                if not os.path.exists(path):
                    logger.warning(f"监听路径不存在，创建: {path}")
                    os.makedirs(path, exist_ok=True)
                self._observer.schedule(handler, path, recursive=True)
                logger.info(f"添加监听路径: {path}")

            self._running = True
            self._observer.start()
            self._thread = threading.Thread(target=self._process_events, daemon=True)
            self._thread.start()
            
            logger.info(f"文件监听器已启动，监听 {len(self.watch_paths)} 个路径")

    def stop(self):
        """停止监听"""
        with self._lock:
            if not self._running:
                return
            self._running = False
            if self._observer:
                self._observer.stop()
                self._observer.join(timeout=5)
                self._observer = None
            logger.info("文件监听器已停止")

    def _process_events(self):
        """处理事件的主循环"""
        batch = []
        last_event_time = 0

        while self._running:
            try:
                # 获取事件，超时1秒
                event = self._event_queue.get(timeout=1)
                
                # 去重检查
                event_key = f"{event.event_type}:{event.src_path}"
                if event_key in self._processed_events:
                    self._processed_events.remove(event_key)
                    continue
                
                # 防抖：如果距离上次处理时间小于防抖阈值，继续收集
                current_time = time.time()
                if current_time - last_event_time < self.debounce_seconds:
                    batch.append(event)
                    if len(batch) >= self.batch_size:
                        self._flush_batch(batch)
                        batch = []
                        last_event_time = current_time
                    continue

                # 处理累积的事件
                if batch:
                    self._flush_batch(batch)
                    batch = []
                
                # 处理当前事件
                self._flush_batch([event])
                last_event_time = current_time

            except Empty:
                # 超时，如果有累积的事件则处理
                if batch:
                    self._flush_batch(batch)
                    batch = []
                    last_event_time = time.time()
                continue
            except Exception as e:
                logger.exception(f"处理事件时出错: {e}")
                continue

        # 清理剩余事件
        if batch:
            self._flush_batch(batch)

    def _flush_batch(self, events: List[FileChangeEvent]):
        """批量处理事件"""
        if not events:
            return

        # 去重：保留最新的事件
        unique_events = {}
        for e in events:
            key = e.src_path
            # 删除事件优先
            if e.event_type == 'deleted':
                unique_events[key] = e
            elif key not in unique_events or unique_events[key].event_type != 'deleted':
                unique_events[key] = e

        event_list = list(unique_events.values())
        
        if self.callback:
            try:
                self.callback(event_list)
            except Exception as e:
                logger.exception(f"回调函数执行失败: {e}")

        # 记录事件到日志
        logger.info(f"处理了 {len(event_list)} 个文件变更事件")

    def is_running(self) -> bool:
        """检查监听器是否在运行"""
        return self._running and self._observer and self._observer.is_alive()

    def add_watch_path(self, path: str):
        """动态添加监听路径"""
        if not self._observer:
            return
        path = str(Path(path).resolve())
        if path not in self.watch_paths:
            self.watch_paths.append(path)
            handler = FileChangeHandler(self._event_queue, self.watch_patterns)
            self._observer.schedule(handler, path, recursive=True)
            logger.info(f"动态添加监听路径: {path}")


# 全局监听器实例
_watcher_instance = None
_watcher_lock = threading.Lock()


def get_file_watcher(
    watch_paths: List[str],
    callback: Optional[Callable] = None,
    watch_patterns: List[str] = None
) -> FileWatcher:
    """
    获取全局文件监听器单例
    
    Args:
        watch_paths: 监听路径列表
        callback: 事件回调函数
        watch_patterns: 文件名模式
        
    Returns:
        FileWatcher 实例
    """
    global _watcher_instance
    with _watcher_lock:
        if _watcher_instance is None:
            _watcher_instance = FileWatcher(
                watch_paths=watch_paths,
                callback=callback,
                watch_patterns=watch_patterns
            )
        return _watcher_instance


def start_file_watcher(
    watch_paths: List[str],
    callback: Optional[Callable] = None,
    watch_patterns: List[str] = None
):
    """启动全局文件监听器"""
    watcher = get_file_watcher(watch_paths, callback, watch_patterns)
    watcher.start()
    return watcher


def stop_file_watcher():
    """停止全局文件监听器"""
    global _watcher_instance
    with _watcher_lock:
        if _watcher_instance:
            _watcher_instance.stop()
            _watcher_instance = None