/**
 * 公共工具函数模块
 */

// ==================================================
// DOM 操作
// ==================================================

/**
 * HTML转义
 * @param {string} text - 需要转义的文本
 * @returns {string} 转义后的文本
 */
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * 显示通知消息
 * @param {string} message - 消息内容
 * @param {boolean} isError - 是否为错误消息
 */
function showNotification(message, isError = false) {
    const notification = document.createElement('div');
    notification.textContent = isError ? `❌ ${message}` : `✅ ${message}`;
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 12px 20px;
        background: ${isError ? '#ef4444' : '#10b981'};
        color: white;
        border-radius: 8px;
        z-index: 10000;
        animation: slideIn 0.3s ease;
        font-size: 14px;
        font-weight: 500;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    `;
    document.body.appendChild(notification);
    setTimeout(() => notification.remove(), 3000);
}

/**
 * 显示/隐藏加载状态
 * @param {boolean} show - 是否显示加载遮罩
 */
function showLoading(show) {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) {
        overlay.classList.toggle('hidden', !show);
    }
}

/**
 * 防抖函数
 * @param {Function} func - 需要防抖的函数
 * @param {number} wait - 等待时间（毫秒）
 * @returns {Function} 防抖后的函数
 */
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

/**
 * 节流函数
 * @param {Function} func - 需要节流的函数
 * @param {number} limit - 时间限制（毫秒）
 * @returns {Function} 节流后的函数
 */
function throttle(func, limit) {
    let inThrottle;
    return function(...args) {
        if (!inThrottle) {
            func.apply(this, args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    };
}

// ==================================================
// 日期处理
// ==================================================

/**
 * 格式化日期
 * @param {Date} date - 日期对象
 * @returns {string} 格式化的日期字符串
 */
function formatDateTime(date) {
    if (!date) date = new Date();
    return date.toLocaleString('zh-CN');
}

/**
 * 获取日期范围字符串
 * @param {string[]} dates - 日期数组
 * @returns {string} 日期范围字符串
 */
function getDateRangeText(dates) {
    if (!dates || dates.length === 0) return '无';
    return `${dates[0]} 至 ${dates[dates.length - 1]}`;
}

// ==================================================
// 数据处理
// ==================================================

/**
 * 安全获取数值
 * @param {*} value - 输入值
 * @param {number} defaultValue - 默认值
 * @returns {number} 数值
 */
function safeNumber(value, defaultValue = 0) {
    const num = parseFloat(value);
    return isNaN(num) ? defaultValue : num;
}

/**
 * 过滤有效数据
 * @param {Array} values - 数值数组
 * @returns {Array} 过滤后的数组
 */
function filterValidNumbers(values) {
    return values.filter(v => v !== null && v !== undefined && !isNaN(v) && v > 0);
}

/**
 * 计算平均值
 * @param {Array} values - 数值数组
 * @returns {number} 平均值
 */
function calculateAverage(values) {
    const valid = filterValidNumbers(values);
    if (valid.length === 0) return 0;
    return valid.reduce((a, b) => a + b, 0) / valid.length;
}

/**
 * 计算总和
 * @param {Array} values - 数值数组
 * @returns {number} 总和
 */
function calculateSum(values) {
    const valid = filterValidNumbers(values);
    if (valid.length === 0) return 0;
    return valid.reduce((a, b) => a + b, 0);
}

/**
 * 计算最大值
 * @param {Array} values - 数值数组
 * @returns {number} 最大值
 */
function calculateMax(values) {
    const valid = filterValidNumbers(values);
    if (valid.length === 0) return 0;
    return Math.max(...valid);
}

/**
 * 计算最小值
 * @param {Array} values - 数值数组
 * @returns {number} 最小值
 */
function calculateMin(values) {
    const valid = filterValidNumbers(values);
    if (valid.length === 0) return 0;
    return Math.min(...valid);
}

// ==================================================
// 内存格式化
// ==================================================

/**
 * 格式化内存大小
 * @param {number} mb - MB值
 * @returns {string} 格式化后的字符串
 */
function formatMemory(mb) {
    if (mb === null || mb === undefined) return 'N/A';
    if (mb >= 1024) return (mb / 1024).toFixed(2) + ' GB';
    return mb.toFixed(0) + ' MB';
}

/**
 * 格式化Runtime时间
 * @param {number} seconds - 秒数
 * @returns {string} 格式化后的字符串
 */
function formatRuntime(seconds) {
    if (seconds === null || seconds === undefined) return 'N/A';
    return seconds.toFixed(2) + ' s';
}

// ==================================================
// 颜色处理
// ==================================================

/**
 * 获取调色板颜色
 * @param {number} index - 索引
 * @returns {string} 颜色值
 */
function getPaletteColor(index) {
    const palette = ['#6366f1', '#f59e0b', '#10b981', '#ef4444', '#06b6d4', '#8b5cf6', '#ec4899', '#84cc16'];
    return palette[index % palette.length];
}

// ==================================================
// URL 处理
// ==================================================

/**
 * 获取URL参数
 * @param {string} name - 参数名
 * @returns {string|null} 参数值
 */
function getUrlParam(name) {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get(name);
}

// 添加动画样式
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
    }
    @keyframes tooltipFadeIn {
        from { opacity: 0; transform: translateY(-5px); }
        to { opacity: 1; transform: translateY(0); }
    }
    .hidden { display: none !important; }
`;
document.head.appendChild(style);