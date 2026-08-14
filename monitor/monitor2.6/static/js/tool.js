/**
 * 工具页面逻辑 - 主控制器
 * 负责模式切换、数据加载、对比功能（版本对比 & 线程对比）
 */

// ==================== 全局变量与配置 ====================

// 从 URL 路径中提取工具 ID
const pathParts = window.location.pathname.split('/').filter(Boolean);
const toolId = pathParts[0] === 'tool' && pathParts.length >= 2 ? pathParts[1] : pathParts[pathParts.length - 1];
window.toolId = toolId;

// 全局状态变量
let toolConfig = null;
let rawData = {};
let userAddedData = {};
let currentMode = 'single';
let currentChartType = 'cputime';
let singleThreadManager = null;
let multiThreadManager = null;
let threadChartManager = null;
let comparisonManager = null;

// ========== 暴露当前模式到全局，供子模块使用 ==========
window.currentMode = currentMode;

// ========== 新增：全局图表实例 ==========
let mainChart = null;

/**
 * 图表类型到分组的映射表
 */
const CHART_GROUP_MAP = {
    cputime: 'runtime',
    realtime: 'runtime',
    peakmem: 'memory',
    incmem: 'memory',
    realtimeincmem: 'memory'
};

function resolveChartGroup(chartType) {
    const key = String(chartType || 'runtime').toLowerCase();
    return CHART_GROUP_MAP[key] || key || 'runtime';
}

function getDefaultSubChart(group) {
    return group === 'memory' ? 'peakmem' : 'cputime';
}

function getActiveChartFromSidebar(sidebarId) {
    const sidebar = document.getElementById(sidebarId);
    if (!sidebar) return 'cputime';

    const activeSubMenuItem = sidebar.querySelector('.sub-menu-item.active');
    if (activeSubMenuItem) {
        return activeSubMenuItem.dataset.chart || activeSubMenuItem.dataset.threadChart || 'cputime';
    }

    const activeMenuItem = sidebar.querySelector('.menu-item.active');
    const menuChart = activeMenuItem ? (activeMenuItem.dataset.chart || activeMenuItem.dataset.threadChart) : 'runtime';
    if (menuChart === 'runtime' || menuChart === 'memory') {
        return getDefaultSubChart(resolveChartGroup(menuChart));
    }
    return menuChart || 'cputime';
}

function syncSidebarSelection(sidebarId, selectedChartType) {
    const sidebar = document.getElementById(sidebarId);
    if (!sidebar) return;

    const group = resolveChartGroup(selectedChartType);

    sidebar.querySelectorAll('.menu-item').forEach(menuItem => {
        const menuKey = menuItem.dataset.chart || menuItem.dataset.threadChart;
        const isActive = menuKey === group;
        menuItem.classList.toggle('active', isActive);
    });

    sidebar.querySelectorAll('.sub-menu-item').forEach(subItem => {
        const subKey = subItem.dataset.chart || subItem.dataset.threadChart;
        const isActive = subKey === selectedChartType;
        subItem.classList.toggle('active', isActive);
    });

    syncGroupNavigation(sidebarId, group);
}

function syncGroupNavigation(sidebarId, expandedGroup) {
    const sidebar = document.getElementById(sidebarId);
    if (!sidebar) return;

    const menuItems = sidebar.querySelectorAll('.menu-item');
    const subMenus = sidebar.querySelectorAll('.sub-menu');

    menuItems.forEach(menu => {
        const isRuntimeMemory = menu.dataset.chart === 'runtime' || menu.dataset.chart === 'memory';
        const isThreadRuntimeMemory = menu.dataset.threadChart === 'runtime' || menu.dataset.threadChart === 'memory';
        const shouldExpand = (menu.dataset.chart === expandedGroup) || (menu.dataset.threadChart === expandedGroup);
        menu.classList.toggle('active', shouldExpand);
        menu.classList.toggle('collapsed', !shouldExpand && (isRuntimeMemory || isThreadRuntimeMemory));
    });

    subMenus.forEach(subMenu => {
        const parent = subMenu.previousElementSibling;
        const isExpanded = parent && (
            (parent.dataset.chart && parent.dataset.chart === expandedGroup) ||
            (parent.dataset.threadChart && parent.dataset.threadChart === expandedGroup)
        );
        subMenu.classList.toggle('collapsed', !isExpanded);
    });
}

function initializeDefaultSidebarState() {
    syncGroupNavigation('singleSidebar', 'runtime');
    syncGroupNavigation('multiSidebar', 'runtime');
    syncGroupNavigation('threadSidebar', 'runtime');

    document.querySelectorAll('#singleSidebar .sub-menu-item').forEach(item => {
        item.classList.toggle('active', item.dataset.chart === 'cputime');
    });
    document.querySelectorAll('#multiSidebar .sub-menu-item').forEach(item => {
        item.classList.toggle('active', item.dataset.chart === 'cputime');
    });
    document.querySelectorAll('#threadSidebar .sub-menu-item').forEach(item => {
        item.classList.toggle('active', item.dataset.threadChart === 'cputime');
    });
}

// DOM 元素
const toolNameEl = document.getElementById('toolName');
const toolDescEl = document.getElementById('toolDesc');
const backBtn = document.getElementById('backBtn');
const refreshBtn = document.getElementById('refreshBtn');
const modeNavItems = document.querySelectorAll('.mode-nav-item');

// ========== 新增：初始化全局图表实例 ==========
function initMainChart() {
    const container = document.getElementById('mainChart');
    if (!container) {
        console.error('找不到图表容器 #mainChart');
        return null;
    }
    
    // 如果已有实例且未被销毁，直接返回
    if (mainChart && !mainChart.isDisposed()) {
        return mainChart;
    }
    
    // 创建新实例
    if (mainChart) {
        mainChart.dispose();
    }
    mainChart = echarts.init(container);
    console.log('全局图表实例初始化成功');
    return mainChart;
}

/**
 * 页面主入口函数
 */
async function init() {
    console.log('页面初始化开始');

    await loadToolConfig();
    initializeDefaultSidebarState();
    await loadData();
    initEventListeners();
    
    comparisonManager = new ComparisonManager();
    comparisonManager.init(toolId);
    
    console.log('页面初始化完成');
}

async function loadToolConfig() {
    try {
        const response = await axios.get('/api/tools');
        if (response.data.success) {
            const tools = response.data.data;
            toolConfig = tools[toolId];
            if (toolConfig) {
                toolNameEl.textContent = toolConfig.tool_name || toolId;
                toolDescEl.textContent = toolConfig.description || '';
                console.log('工具配置加载成功:', toolConfig.tool_name);
            } else {
                showError('工具不存在');
            }
        } else {
            console.error('加载工具配置失败:', response.data.error);
            showError('加载工具配置失败: ' + (response.data.error || '未知错误'));
        }
    } catch (error) {
        console.error('加载工具配置失败:', error);
        showError('加载工具配置失败');
    }
}

async function loadData() {
    try {
        showLoading(true);
        const response = await axios.post(`/api/tools/${toolId}/data`);
        console.log('原始数据:', response.data.data);
        if (response.data.success) {
            const data = response.data.data || {};
            let singleData = {};
            let multiData = {};
            let extraData = {};
            let userData = {};

            if (typeof data === 'string') {
                try {
                    const parsed = JSON.parse(data);
                    if (data.thread) threadData = data.thread;
                    // if (parsed.single) singleData = parsed.single;
                    if (parsed.multi) multiData = parsed.single_multi || {};
                    if (parsed.extra) extraData = parsed.extra;
                    if (parsed.user) userData = parsed.user;
                } catch (e) {
                    multiData = data;
                }
            } else {
                if (data.thread) threadData = data.thread;
                if (data.single_multi) multiData = data.single_multi || {};
                if (data.extra) extraData = data.extra;
                if (data.user) userData = data.user;
            }

            // window.singleData = singleData;
            window.threadData = threadData;
            window.multiData = multiData;
            window.extraData = extraData;
            window.userData = userData;

            showSuccess(response.data.message);

            // ========== 初始化全局图表实例 ==========
            initMainChart();

            // 初始化各管理器（不再自己创建图表实例）
            // if (window.SingleThreadManager) {
            //     singleThreadManager = new window.SingleThreadManager();
            //     await singleThreadManager.init(singleData, userData, extraData);
            //     singleThreadManager.updateOverview();
            // }

            if (window.MultiThreadManager) {
                multiThreadManager = new window.MultiThreadManager();
                await multiThreadManager.init(multiData, userData, extraData);
                multiThreadManager.updateOverview();
            }

            if (window.ThreadChartManager) {
                threadChartManager = new window.ThreadChartManager();
                await threadChartManager.init(threadData, userData);
            }

            // 默认切换到单线程模式
            // await switchToSingleMode();
            // await switchToMultiMode();
            // await switchToThreadMode();
            await switchToComparisonMode();
        } else {
            console.error('加载数据失败:', response.data.error);
            showError('加载数据失败: ' + (response.data.error || '未知错误'));
        }
    } catch (error) {
        console.error('加载数据失败:', error);
        showError('加载数据失败:' + (error.response?.data?.error || error.message));
    } finally {
        showLoading(false);
    }
}

// ==================== 模式切换辅助函数 ====================

function updateModeNav(mode) {
    modeNavItems.forEach(item => {
        item.classList.toggle('active', item.dataset.mode === mode);
    });
}

function toggleSidebars(mode) {
    const singleSidebar = document.getElementById('singleSidebar');
    const multiSidebar = document.getElementById('multiSidebar');
    const threadSidebar = document.getElementById('threadSidebar');

    singleSidebar.style.display = (mode === 'single') ? 'flex' : 'none';
    multiSidebar.style.display = (mode === 'multi') ? 'flex' : 'none';
    threadSidebar.style.display = (mode === 'thread') ? 'flex' : 'none';
}

function showThreadSelector(show) {
    const container = document.getElementById('multiThreadSelectorContainer');
    if (container) container.style.display = show ? 'block' : 'none';
}

function hideThreadSelector() {
    showThreadSelector(false);
}

function showNormalContent(show) {
    const normal = document.getElementById('normalContent');
    if (normal) normal.style.display = show ? 'block' : 'none';
}

function showComparisonContainer(show) {
    const container = document.getElementById('comparisonContainer');
    if (container) container.style.display = show ? 'block' : 'none';
}

// ==================== 模式切换具体实现 ====================

async function switchToSingleMode() {
    currentMode = 'single';
    window.currentMode = 'single';  // 暴露到全局
    updateModeNav('single');
    toggleSidebars('single');
    hideThreadSelector();
    showNormalContent(true);
    showComparisonContainer(false);

    // ========== 确保图表实例有效 ==========
    const chart = initMainChart();
    if (!chart) return;

    const currentChartType = getActiveChartFromSidebar('singleSidebar');
    if (currentChartType !== 'comparison') {
        if (singleThreadManager) {
            // ========== 传入图表实例 ==========
            await singleThreadManager.renderChart(chart);
        }
    }
    if (singleThreadManager) singleThreadManager.updateOverview();
}

async function switchToMultiMode() {
    currentMode = 'multi';
    window.currentMode = 'multi';  // 暴露到全局
    updateModeNav('multi');
    toggleSidebars('multi');
    showThreadSelector(true);
    showNormalContent(true);
    showComparisonContainer(false);

    // ========== 确保图表实例有效 ==========
    const chart = initMainChart();
    if (!chart) return;

    const currentChartType = getActiveChartFromSidebar('multiSidebar');
    if (currentChartType !== 'comparison') {
        if (multiThreadManager) {
            // ========== 传入图表实例 ==========
            await multiThreadManager.renderChart(chart);
        }
    }
    if (multiThreadManager) multiThreadManager.updateOverview();
}

async function switchToThreadMode() {
    currentMode = 'thread';
    window.currentMode = 'thread';  // 暴露到全局
    updateModeNav('thread');
    toggleSidebars('thread');
    hideThreadSelector();
    showNormalContent(true);
    showComparisonContainer(false);

    // ========== 确保图表实例有效 ==========
    const chart = initMainChart();
    if (!chart) return;

    if (threadChartManager) {
        const activeSub = document.querySelector('#threadSidebar .sub-menu-item.active');
        const chartType = activeSub ? activeSub.dataset.threadChart : 'cputime';
        threadChartManager.setChartType(chartType);
        // ========== 传入图表实例 ==========
        await threadChartManager.renderChart(chart);
    }
}

async function switchToComparisonMode() {
    currentMode = 'comparison';
    window.currentMode = 'comparison';  // 暴露到全局
    updateModeNav('comparison');
    toggleSidebars(null);
    hideThreadSelector();
    showNormalContent(false);
    showComparisonContainer(true);
}

async function renderSingleChart() {
    if (singleThreadManager) {
        const chart = initMainChart();
        if (chart) {
            await singleThreadManager.renderChart(chart);
        }
    }
}

async function renderMultiChart() {
    if (multiThreadManager) {
        const chart = initMainChart();
        if (chart) {
            await multiThreadManager.renderChart(chart);
        }
    }
}

// ==================== 通用工具函数 ====================

function showLoading(show) {
    const overlay = document.getElementById('chartLoadingOverlay');
    if (overlay) {
        overlay.classList.toggle('visible', Boolean(show));
        overlay.setAttribute('aria-busy', show ? 'true' : 'false');
    }
}

function showSuccess(message) {
    showToast(message, 'success');
}

function showError(message) {
    showToast(message, 'error');
}

function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.textContent = message;
    toast.style.cssText = `
        position: fixed;
        bottom: 20px;
        left: 50%;
        transform: translateX(-50%);
        background: ${type === 'success' ? '#10B981' : type === 'error' ? '#EF4444' : '#3B82F6'};
        color: white;
        padding: 10px 20px;
        border-radius: 8px;
        font-size: 14px;
        z-index: 1100;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    `;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatDate(dateStr) {
    if (!dateStr) return '';
    if (dateStr.includes('_user')) {
        return dateStr.replace('_user', ' (用户)');
    }
    if (dateStr.length === 8 && /^\d+$/.test(dateStr)) {
        return `${dateStr.slice(0,4)}-${dateStr.slice(4,6)}-${dateStr.slice(6,8)}`;
    }
    return dateStr;
}

// ==================== 事件监听初始化 ====================

function initEventListeners() {
    backBtn.addEventListener('click', () => {
        window.location.href = '/';
    });

    refreshBtn.addEventListener('click', refreshData);

    modeNavItems.forEach(item => {
        item.addEventListener('click', async () => {
            const mode = item.dataset.mode;
            if (mode === 'single') await switchToSingleMode();
            else if (mode === 'multi') await switchToMultiMode();
            else if (mode === 'thread') await switchToThreadMode();
            else if (mode === 'comparison') await switchToComparisonMode();
        });
    });

    // ---------- 单线程侧边栏菜单切换 ----------
    const singleMenuItems = document.querySelectorAll('#singleSidebar .menu-item');
    singleMenuItems.forEach(item => {
        item.addEventListener('click', () => {
            const chartType = item.dataset.chart;
            const subMenu = item.nextElementSibling;

            if (chartType === 'runtime' || chartType === 'memory') {
                const defaultSubChart = getDefaultSubChart(resolveChartGroup(chartType));
                document.querySelectorAll('#singleSidebar .sub-menu-item').forEach(subItem => {
                    subItem.classList.toggle('active', subItem.dataset.chart === defaultSubChart);
                });
                syncGroupNavigation('singleSidebar', chartType);
                currentChartType = defaultSubChart;
                if (subMenu) {
                    subMenu.classList.remove('collapsed');
                }
            } else {
                document.querySelectorAll('#singleSidebar .sub-menu-item').forEach(subItem => {
                    subItem.classList.remove('active');
                });
                syncGroupNavigation('singleSidebar', chartType);
                currentChartType = chartType;
            }

            if (chartType !== 'comparison') {
                if (singleThreadManager) {
                    singleThreadManager.setChartType(currentChartType);
                    // ========== 使用全局图表实例 ==========
                    const chart = initMainChart();
                    if (chart) {
                        singleThreadManager.renderChart(chart);
                    }
                }
            }
        });
    });

    const singleSubMenuItems = document.querySelectorAll('#singleSidebar .sub-menu-item');
    singleSubMenuItems.forEach(item => {
        item.addEventListener('click', () => {
            const targetChart = item.dataset.chart || 'cputime';
            syncSidebarSelection('singleSidebar', targetChart);
            currentChartType = targetChart;
            if (singleThreadManager) {
                singleThreadManager.setChartType(targetChart);
                const chart = initMainChart();
                if (chart) {
                    singleThreadManager.renderChart(chart);
                }
            }
        });
    });

    // ---------- 多线程侧边栏菜单切换 ----------
    const multiMenuItems = document.querySelectorAll('#multiSidebar .menu-item');
    multiMenuItems.forEach(item => {
        item.addEventListener('click', () => {
            const chartType = item.dataset.chart;
            const subMenu = item.nextElementSibling;

            if (chartType === 'runtime' || chartType === 'memory') {
                const defaultSubChart = getDefaultSubChart(resolveChartGroup(chartType));
                document.querySelectorAll('#multiSidebar .sub-menu-item').forEach(subItem => {
                    subItem.classList.toggle('active', subItem.dataset.chart === defaultSubChart);
                });
                syncGroupNavigation('multiSidebar', chartType);
                currentChartType = defaultSubChart;
                if (subMenu) {
                    subMenu.classList.remove('collapsed');
                }
            } else {
                document.querySelectorAll('#multiSidebar .sub-menu-item').forEach(subItem => {
                    subItem.classList.remove('active');
                });
                syncGroupNavigation('multiSidebar', chartType);
                currentChartType = chartType;
            }

            if (chartType !== 'comparison') {
                if (multiThreadManager) {
                    multiThreadManager.setChartType(currentChartType);
                    const chart = initMainChart();
                    if (chart) {
                        multiThreadManager.renderChart(chart);
                    }
                }
            }
        });
    });

    const multiSubMenuItems = document.querySelectorAll('#multiSidebar .sub-menu-item');
    multiSubMenuItems.forEach(item => {
        item.addEventListener('click', () => {
            const targetChart = item.dataset.chart || 'cputime';
            syncSidebarSelection('multiSidebar', targetChart);
            currentChartType = targetChart;
            if (multiThreadManager) {
                multiThreadManager.setChartType(targetChart);
                const chart = initMainChart();
                if (chart) {
                    multiThreadManager.renderChart(chart);
                }
            }
        });
    });

    // ---------- 线程曲线侧边栏菜单切换 ----------
    const threadMenuItems = document.querySelectorAll('#threadSidebar .menu-item');
    threadMenuItems.forEach(item => {
        item.addEventListener('click', () => {
            const chartType = item.dataset.threadChart || 'runtime';
            const defaultSubChart = chartType === 'runtime' ? 'cputime' : chartType === 'memory' ? 'peakmem' : chartType;
            document.querySelectorAll('#threadSidebar .sub-menu-item').forEach(subItem => {
                subItem.classList.toggle('active', subItem.dataset.threadChart === defaultSubChart);
            });
            syncGroupNavigation('threadSidebar', chartType);
            if (threadChartManager) {
                threadChartManager.setChartType(defaultSubChart);
                const chart = initMainChart();
                if (chart) {
                    threadChartManager.renderChart(chart);
                }
            }
        });
    });

    const threadSubMenuItems = document.querySelectorAll('#threadSidebar .sub-menu-item');
    threadSubMenuItems.forEach(item => {
        item.addEventListener('click', () => {
            const chartType = item.dataset.threadChart || 'cputime';
            syncSidebarSelection('threadSidebar', chartType);
            if (threadChartManager) {
                threadChartManager.setChartType(chartType);
                const chart = initMainChart();
                if (chart) {
                    threadChartManager.renderChart(chart);
                }
            }
        });
    });
}

async function refreshData() {
    try {
        showLoading(true);
        const response = await axios.post(`/api/tools/${toolId}/refresh`);
        if (response.data.success) {
            const data = response.data.data || {};
            let singleData = {};
            let multiData = {};
            let extraData = {};
            let userData = {};

            if (typeof data === 'string') {
                try {
                    const parsed = JSON.parse(data);
                    if (parsed.single) singleData = parsed.single;
                    if (parsed.multi) multiData = parsed.multi;
                    if (parsed.extra) extraData = parsed.extra;
                    if (parsed.user) userData = parsed.user;
                } catch (e) {
                    singleData = data;
                }
            } else {
                if (data.single) singleData = data.single;
                if (data.multi) multiData = data.multi;
                if (data.extra) extraData = data.extra;
                if (data.user) userData = data.user;
            }

            window.singleData = singleData;
            window.multiData = multiData;
            window.extraData = extraData;
            window.userData = userData;

            // ========== 确保图表实例有效 ==========
            const chart = initMainChart();

            if (singleThreadManager) {
                await singleThreadManager.refreshWithData(singleData, userData);
                if (chart && currentMode === 'single') {
                    await singleThreadManager.renderChart(chart);
                }
            }
            if (multiThreadManager) {
                await multiThreadManager.refreshWithData(multiData, userData);
                if (chart && currentMode === 'multi') {
                    await multiThreadManager.renderChart(chart);
                }
            }
            if (threadChartManager) {
                await threadChartManager.refreshWithData(multiData, userData);
                if (chart && currentMode === 'thread') {
                    await threadChartManager.renderChart(chart);
                }
            }
            showSuccess('数据刷新成功');
        }
    } catch (error) {
        console.error('刷新数据失败:', error);
        showError('刷新数据失败');
    } finally {
        showLoading(false);
    }
}

document.addEventListener('DOMContentLoaded', init);