"""
logger_utils.py - 生产级日志工具
支持彩色输出、文件归档、自动创建日志目录
"""

import logging
import sys
import os
from logging.handlers import RotatingFileHandler
from datetime import datetime
from pathlib import Path

# ANSI 颜色代码
class Colors:
    """终端颜色定义"""
    RESET = '\033[0m'
    RED = '\033[91m'
    GREEN = '\033[92m'
    YELLOW = '\033[93m'
    BLUE = '\033[94m'
    PURPLE = '\033[95m'
    CYAN = '\033[96m'
    WHITE = '\033[97m'
    BOLD = '\033[1m'
    GRAY = '\033[90m'

class ColoredFormatter(logging.Formatter):
    """自定义颜色格式化器"""
    
    # 不同日志等级对应的颜色
    LEVEL_COLORS = {
        logging.DEBUG: Colors.BLUE,
        logging.INFO: Colors.GREEN,
        logging.WARNING: Colors.YELLOW,
        logging.ERROR: Colors.RED,
        logging.CRITICAL: Colors.RED + Colors.BOLD,
    }
    
    # 不同日志等级的显示名称
    LEVEL_NAMES = {
        logging.DEBUG: 'DEBUG',
        logging.INFO: 'INFO',
        logging.WARNING: 'WARN',
        logging.ERROR: 'ERROR',
        logging.CRITICAL: 'CRITICAL',
    }
    
    def format(self, record):
        # 保存原始信息
        original_msg = record.msg
        original_levelname = record.levelname
        
        # 替换等级名称为自定义名称
        record.levelname = self.LEVEL_NAMES.get(record.levelno, record.levelname)
        
        # 为消息添加颜色
        color = self.LEVEL_COLORS.get(record.levelno, Colors.WHITE)
        record.msg = f"{color}{original_msg}{Colors.RESET}"
        
        # 调用父类格式化
        result = super().format(record)
        
        # 恢复原始值
        record.msg = original_msg
        record.levelname = original_levelname
        
        return result


class PlainFormatter(logging.Formatter):
    """文件日志格式化器（无颜色）"""
    
    LEVEL_NAMES = {
        logging.DEBUG: 'DEBUG',
        logging.INFO: 'INFO',
        logging.WARNING: 'WARN',
        logging.ERROR: 'ERROR',
        logging.CRITICAL: 'CRITICAL',
    }
    
    def format(self, record):
        original_levelname = record.levelname
        record.levelname = self.LEVEL_NAMES.get(record.levelno, record.levelname)
        result = super().format(record)
        record.levelname = original_levelname
        return result


class LoggerManager:
    """日志管理器 - 单例模式"""
    
    _instance = None
    _loggers = {}
    
    def __new__(cls, *args, **kwargs):
        if not cls._instance:
            cls._instance = super().__new__(cls)
        return cls._instance
    
    def __init__(self):
        if hasattr(self, '_initialized'):
            return
        self._initialized = True
        self.log_dir = None
        self.default_level = logging.DEBUG
    
    def setup(self, log_dir: str = 'logs', default_level: str = 'DEBUG'):
        """
        初始化日志系统
        
        Args:
            log_dir: 日志文件存储目录
            default_level: 默认日志等级 (DEBUG/INFO/WARNING/ERROR)
        """
        # 创建日志目录
        self.log_dir = Path(log_dir)
        self.log_dir.mkdir(parents=True, exist_ok=True)
        
        # 设置默认等级
        level_map = {
            'DEBUG': logging.DEBUG,
            'INFO': logging.INFO,
            'WARNING': logging.WARNING,
            'ERROR': logging.ERROR,
            'CRITICAL': logging.CRITICAL,
        }
        self.default_level = level_map.get(default_level.upper(), logging.DEBUG)
        
        # 配置根日志记录器
        root_logger = logging.getLogger()
        root_logger.setLevel(self.default_level)
        
        # 清除已有的处理器，避免重复
        root_logger.handlers.clear()
        
        # 添加控制台处理器（彩色）
        console_handler = self._create_console_handler()
        root_logger.addHandler(console_handler)
        
        # 添加文件处理器（包含所有日志）
        file_handler = self._create_file_handler('app.log')
        root_logger.addHandler(file_handler)
        
        # 添加错误日志文件处理器（只记录 ERROR 及以上）
        error_file_handler = self._create_file_handler('error.log', level=logging.ERROR)
        root_logger.addHandler(error_file_handler)
        
        # 返回自身的日志记录器
        return self.get_logger('root')
    
    def _create_console_handler(self):
        """创建控制台处理器（彩色）"""
        handler = logging.StreamHandler(sys.stdout)
        handler.setLevel(self.default_level)
        
        # 格式化：时间 - 日志等级 - 模块名 - 消息
        formatter = ColoredFormatter(
            '%(asctime)s - %(levelname)s - %(name)s - %(message)s',
            datefmt='%Y-%m-%d %H:%M:%S'
        )
        handler.setFormatter(formatter)
        return handler
    
    def _create_file_handler(self, filename: str, level: int = None):
        """创建文件处理器（支持日志轮转）"""
        filepath = self.log_dir / filename
        
        # 使用 RotatingFileHandler 实现日志轮转
        handler = RotatingFileHandler(
            filepath,
            maxBytes=10 * 1024 * 1024,  # 10MB
            backupCount=5,               # 保留5个备份
            encoding='utf-8'
        )
        
        handler.setLevel(level if level is not None else self.default_level)
        
        # 文件日志格式（无颜色）
        formatter = PlainFormatter(
            '%(asctime)s - %(levelname)s - %(name)s - %(filename)s:%(lineno)d - %(message)s',
            datefmt='%Y-%m-%d %H:%M:%S'
        )
        handler.setFormatter(formatter)
        return handler
    
    def get_logger(self, name: str = None):
        """
        获取日志记录器
        
        Args:
            name: 日志记录器名称，通常使用 __name__
        """
        if name is None:
            name = 'root'
        
        if name not in self._loggers:
            logger = logging.getLogger(name)
            logger.setLevel(self.default_level)
            
            # 防止日志向上传播导致重复（如果已经添加了处理器）
            if not logger.handlers:
                # 如果根日志已有处理器，子 logger 不需要重复添加
                # 但是为了独立控制，可以添加自己的处理器
                pass
            
            self._loggers[name] = logger
        
        return self._loggers[name]
    
    def set_level(self, level: str):
        """动态调整日志等级"""
        level_map = {
            'DEBUG': logging.DEBUG,
            'INFO': logging.INFO,
            'WARNING': logging.WARNING,
            'ERROR': logging.ERROR,
            'CRITICAL': logging.CRITICAL,
        }
        new_level = level_map.get(level.upper(), logging.DEBUG)
        self.default_level = new_level
        logging.getLogger().setLevel(new_level)
        
        for logger in self._loggers.values():
            logger.setLevel(new_level)


# 全局单例实例
logger_manager = LoggerManager()


def get_logger(name: str = None):
    """便捷函数：获取日志记录器"""
    return logger_manager.get_logger(name)


def setup_logger(log_dir: str = 'logs', level: str = 'DEBUG'):
    """便捷函数：初始化日志系统"""
    return logger_manager.setup(log_dir, level)


def set_log_level(level: str):
    """便捷函数：设置日志等级"""
    logger_manager.set_level(level)