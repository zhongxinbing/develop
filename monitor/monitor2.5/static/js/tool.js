/**
 * 工具页面逻辑 - 主控制器
 */

// 从 URL 获取工具 ID，兼容 /tool/<tool_id> /tool/<tool_id>/feature /tool/<tool_id>/performance
const pathParts = window.location.pathname.split('/').filter(Boolean);
const toolId = pathParts[0] === 'tool' && pathParts.length >= 2 ? pathParts[1] : pathParts[pathParts.length - 1];
window.toolId = toolId;

// 全局状态
let toolConfig = null;
let rawData = {};
let userAddedData = {};
let currentMode = 'single';
let currentChartType = 'cputime';
let threadChart = null;
const CHART_GROUP_MAP = {
    cputime: 'runtime',
    realtime: 'runtime',
    peakmem: 'memory',
    incmem: 'memory',
    realtimeincmem: 'memory'
};

// 模块实例
let singleThreadManager = null;
let multiThreadManager = null;
let threadChartManager = null;

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

/**
 * 初始化页面
 */
async function init() {
    console.log('页面初始化开始');
    await loadToolConfig();
    initializeDefaultSidebarState();
    await loadData();
    initEventListeners();
    console.log('页面初始化完成');
}

/**
 * 加载工具配置
 */
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

/**
 * 加载数据 - 完全分离单线程、多线程和线程曲线图数据
 */
async function loadData() {
    try {
        showLoading(true);
        const response = await axios.post(`/api/tools/${toolId}/data`);
        
        if (response.data.success) {
            showSuccess('正在加载数据，请稍等...');
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

            showSuccess(response.data.message);

            // 获取图表容器
            const container = document.getElementById('mainChart');
            
            // 初始化单线程模块
            if (window.SingleThreadManager) {
                singleThreadManager = new window.SingleThreadManager();
                if (container) {
                    singleThreadManager.chart = echarts.init(container);
                }
                await singleThreadManager.init(singleData, userData, extraData);
                singleThreadManager.updateOverview();
            }
            
            // 初始化多线程模块
            if (window.MultiThreadManager) {
                multiThreadManager = new window.MultiThreadManager();
                if (container) {
                    multiThreadManager.chart = echarts.init(container);
                }
                await multiThreadManager.init(multiData, userData, extraData);
                multiThreadManager.updateOverview();
            }
            
            // 初始化线程曲线图模块
            if (window.ThreadChartManager) {
                threadChartManager = new window.ThreadChartManager();
                if (container) {
                    threadChartManager.chart = echarts.init(container);
                }
                await threadChartManager.init(multiData, userData);
            }
            
            // 根据当前模式显示对应的数据
            if (currentMode === 'single') {
                await switchToSingleMode();
            } else if (currentMode === 'multi') {
                await switchToMultiMode();
            } else if (currentMode === 'thread') {
                await switchToThreadMode();
            } else {
                await switchToSingleMode();
            }
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

/**
 * 切换到单线程模式
 */
async function switchToSingleMode() {
    currentMode = 'single';
    
    // 更新导航样式
    modeNavItems.forEach(item => {
        if (item.dataset.mode === 'single') {
            item.classList.add('active');
        } else {
            item.classList.remove('active');
        }
    });
    
    // 切换侧边栏显示
    const singleSidebar = document.getElementById('singleSidebar');
    const multiSidebar = document.getElementById('multiSidebar');
    const threadSidebar = document.getElementById('threadSidebar');
    
    if (singleSidebar) singleSidebar.style.display = 'flex';
    if (multiSidebar) multiSidebar.style.display = 'none';
    if (threadSidebar) threadSidebar.style.display = 'none';
    
    // 隐藏线程选择器
    const threadSelectorContainer = document.getElementById('multiThreadSelectorContainer');
    if (threadSelectorContainer) threadSelectorContainer.style.display = 'none';
    
    // 获取当前活动菜单类型
    const currentChartType = getActiveChartFromSidebar('singleSidebar');
    
    const filtersPanel = document.getElementById('singleFiltersPanel');
    const comparisonPanel = document.getElementById('singleComparisonPanel');
    
    if (currentChartType === 'comparison') {
        if (filtersPanel) filtersPanel.style.display = 'none';
        if (comparisonPanel) comparisonPanel.style.display = 'block';
        
        const statsGrid = document.getElementById('statsGrid');
        const overviewCard = document.querySelector('.overview-card');
        const chartContainer = document.querySelector('.chart-container');
        if (statsGrid) statsGrid.style.display = 'none';
        if (overviewCard) overviewCard.style.display = 'none';
        if (chartContainer) chartContainer.style.display = 'block';
        
        const comparisonResults = document.getElementById('comparisonResults');
        if (comparisonResults) comparisonResults.style.display = 'none';
    } else {
        if (filtersPanel) filtersPanel.style.display = 'block';
        if (comparisonPanel) comparisonPanel.style.display = 'none';
        
        const statsGrid = document.getElementById('statsGrid');
        const overviewCard = document.querySelector('.overview-card');
        const chartContainer = document.querySelector('.chart-container');
        if (statsGrid) statsGrid.style.display = 'grid';
        if (overviewCard) overviewCard.style.display = 'block';
        if (chartContainer) chartContainer.style.display = 'block';
        
        const comparisonResults = document.getElementById('comparisonResults');
        if (comparisonResults) comparisonResults.style.display = 'none';
    }
    
    // 确保图表容器正确初始化
    const container = document.getElementById('mainChart');
    if (container && singleThreadManager) {
        if (!singleThreadManager.chart || singleThreadManager.chart.isDisposed()) {
            singleThreadManager.chart = echarts.init(container);
        }
        if (currentChartType !== 'comparison') {
            await singleThreadManager.renderChart();
        }
        singleThreadManager.updateOverview();
    }
}

/**
 * 切换到多线程模式
 */
async function switchToMultiMode() {
    currentMode = 'multi';
    
    // 更新导航样式
    modeNavItems.forEach(item => {
        if (item.dataset.mode === 'multi') {
            item.classList.add('active');
        } else {
            item.classList.remove('active');
        }
    });
    
    // 切换侧边栏显示
    const singleSidebar = document.getElementById('singleSidebar');
    const multiSidebar = document.getElementById('multiSidebar');
    const threadSidebar = document.getElementById('threadSidebar');
    
    if (singleSidebar) singleSidebar.style.display = 'none';
    if (multiSidebar) multiSidebar.style.display = 'flex';
    if (threadSidebar) threadSidebar.style.display = 'none';
    
    // 显示线程选择器
    const threadSelectorContainer = document.getElementById('multiThreadSelectorContainer');
    if (threadSelectorContainer) threadSelectorContainer.style.display = 'block';
    
    // 获取当前活动菜单类型
    const currentChartType = getActiveChartFromSidebar('multiSidebar');
    
    const filtersPanel = document.getElementById('multiFiltersPanel');
    const comparisonPanel = document.getElementById('multiComparisonPanel');
    
    if (currentChartType === 'comparison') {
        if (filtersPanel) filtersPanel.style.display = 'none';
        if (comparisonPanel) comparisonPanel.style.display = 'block';
        
        const statsGrid = document.getElementById('statsGrid');
        const overviewCard = document.querySelector('.overview-card');
        const chartContainer = document.querySelector('.chart-container');
        if (statsGrid) statsGrid.style.display = 'none';
        if (overviewCard) overviewCard.style.display = 'none';
        if (chartContainer) chartContainer.style.display = 'block';
        
        const comparisonResults = document.getElementById('comparisonResults');
        if (comparisonResults) comparisonResults.style.display = 'none';
    } else {
        if (filtersPanel) filtersPanel.style.display = 'block';
        if (comparisonPanel) comparisonPanel.style.display = 'none';
        
        const statsGrid = document.getElementById('statsGrid');
        const overviewCard = document.querySelector('.overview-card');
        const chartContainer = document.querySelector('.chart-container');
        if (statsGrid) statsGrid.style.display = 'grid';
        if (overviewCard) overviewCard.style.display = 'block';
        if (chartContainer) chartContainer.style.display = 'block';
        
        const comparisonResults = document.getElementById('comparisonResults');
        if (comparisonResults) comparisonResults.style.display = 'none';
    }
    
    // 确保图表容器正确初始化
    const container = document.getElementById('mainChart');
    if (container && multiThreadManager) {
        if (!multiThreadManager.chart || multiThreadManager.chart.isDisposed()) {
            multiThreadManager.chart = echarts.init(container);
        }
        if (currentChartType !== 'comparison') {
            await multiThreadManager.renderChart();
        }
        multiThreadManager.updateOverview();
    }
}

/**
 * 切换到线程曲线图模式
 */
async function switchToThreadMode() {
    currentMode = 'thread';
    
    // 更新导航样式
    modeNavItems.forEach(item => {
        if (item.dataset.mode === 'thread') {
            item.classList.add('active');
        } else {
            item.classList.remove('active');
        }
    });
    
    // 切换侧边栏显示
    const singleSidebar = document.getElementById('singleSidebar');
    const multiSidebar = document.getElementById('multiSidebar');
    const threadSidebar = document.getElementById('threadSidebar');
    
    if (singleSidebar) singleSidebar.style.display = 'none';
    if (multiSidebar) multiSidebar.style.display = 'none';
    if (threadSidebar) threadSidebar.style.display = 'flex';
    
    // 隐藏线程选择器
    const threadSelectorContainer = document.getElementById('multiThreadSelectorContainer');
    if (threadSelectorContainer) threadSelectorContainer.style.display = 'none';
    
    // 隐藏统计和概况
    const statsGrid = document.getElementById('statsGrid');
    const overviewCard = document.querySelector('.overview-card');
    if (statsGrid) statsGrid.style.display = 'none';
    if (overviewCard) overviewCard.style.display = 'none';
    
    // 确保图表容器显示
    const chartContainer = document.querySelector('.chart-container');
    if (chartContainer) chartContainer.style.display = 'block';
    
    // 获取当前活动菜单类型
    const activeSubMenuItem = document.querySelector('#threadSidebar .sub-menu-item.active');
    const activeMenuItem = document.querySelector('#threadSidebar .menu-item.active');
    if (activeSubMenuItem && activeSubMenuItem.dataset.threadChart) {
        const chartType = activeSubMenuItem.dataset.threadChart || 'runtime';
        if (threadChartManager) {
            threadChartManager.setChartType(chartType);
        }
    } else if (activeMenuItem) {
        const chartType = activeMenuItem.dataset.threadChart || 'runtime';
        if (threadChartManager) {
            threadChartManager.setChartType(chartType === 'runtime' ? 'cputime' : chartType === 'memory' ? 'peakmem' : chartType);
        }
    }
    
    // 渲染线程曲线图
    if (threadChartManager) {
        await threadChartManager.renderChart();
    }
}

/**
 * 刷新数据
 */
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
            
            // 刷新所有模块
            if (singleThreadManager) {
                await singleThreadManager.refreshWithData(singleData, userData);
            }
            
            if (multiThreadManager) {
                await multiThreadManager.refreshWithData(multiData, userData);
            }
            
            if (threadChartManager) {
                await threadChartManager.refreshWithData(multiData, userData);
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

/**
 * 初始化事件监听
 */
function initEventListeners() {
    // 获取面板元素
    const singleFiltersPanel = document.getElementById('singleFiltersPanel');
    const singleComparisonPanel = document.getElementById('singleComparisonPanel');
    const multiFiltersPanel = document.getElementById('multiFiltersPanel');
    const multiComparisonPanel = document.getElementById('multiComparisonPanel');
    
    // 返回按钮
    if (backBtn) {
        backBtn.addEventListener('click', () => {
            window.location.href = '/';
        });
    }
    
    // 刷新按钮
    if (refreshBtn) {
        refreshBtn.addEventListener('click', refreshData);
    }
    
    // 模式切换
    modeNavItems.forEach(item => {
        item.addEventListener('click', async () => {
            const mode = item.dataset.mode;
            if (mode === 'single') {
                await switchToSingleMode();
            } else if (mode === 'multi') {
                await switchToMultiMode();
            } else if (mode === 'thread') {
                await switchToThreadMode();
            }
        });
    });
    
    // 单线程侧边栏菜单切换
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

            if (chartType === 'comparison') {
                if (singleFiltersPanel) singleFiltersPanel.style.display = 'none';
                if (singleComparisonPanel) singleComparisonPanel.style.display = 'block';

                const statsGrid = document.getElementById('statsGrid');
                const overviewCard = document.querySelector('.overview-card');
                const chartContainer = document.querySelector('.chart-container');
                if (statsGrid) statsGrid.style.display = 'none';
                if (overviewCard) overviewCard.style.display = 'none';
                if (chartContainer) chartContainer.style.display = 'none';

                const comparisonResults = document.getElementById('comparisonResults');
                if (comparisonResults) comparisonResults.style.display = 'none';
            } else {
                if (singleFiltersPanel) singleFiltersPanel.style.display = 'block';
                if (singleComparisonPanel) singleComparisonPanel.style.display = 'none';

                const statsGrid = document.getElementById('statsGrid');
                const overviewCard = document.querySelector('.overview-card');
                const chartContainer = document.querySelector('.chart-container');
                if (statsGrid) statsGrid.style.display = 'grid';
                if (overviewCard) overviewCard.style.display = 'block';
                if (chartContainer) chartContainer.style.display = 'block';

                const comparisonResults = document.getElementById('comparisonResults');
                if (comparisonResults) comparisonResults.style.display = 'none';

                if (singleThreadManager) {
                    singleThreadManager.setChartType(currentChartType);
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
            }
        });
    });
    
    // 多线程侧边栏菜单切换
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

            if (chartType === 'comparison') {
                if (multiFiltersPanel) multiFiltersPanel.style.display = 'none';
                if (multiComparisonPanel) multiComparisonPanel.style.display = 'block';

                const statsGrid = document.getElementById('statsGrid');
                const overviewCard = document.querySelector('.overview-card');
                const chartContainer = document.querySelector('.chart-container');
                if (statsGrid) statsGrid.style.display = 'none';
                if (overviewCard) overviewCard.style.display = 'none';
                if (chartContainer) chartContainer.style.display = 'none';

                const comparisonResults = document.getElementById('comparisonResults');
                if (comparisonResults) comparisonResults.style.display = 'none';
            } else {
                if (multiFiltersPanel) multiFiltersPanel.style.display = 'block';
                if (multiComparisonPanel) multiComparisonPanel.style.display = 'none';

                const statsGrid = document.getElementById('statsGrid');
                const overviewCard = document.querySelector('.overview-card');
                const chartContainer = document.querySelector('.chart-container');
                if (statsGrid) statsGrid.style.display = 'grid';
                if (overviewCard) overviewCard.style.display = 'block';
                if (chartContainer) chartContainer.style.display = 'block';

                const comparisonResults = document.getElementById('comparisonResults');
                if (comparisonResults) comparisonResults.style.display = 'none';

                if (multiThreadManager) {
                    multiThreadManager.setChartType(currentChartType);
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
            }
        });
    });
    
    // 线程曲线图侧边栏菜单切换
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
            }
        });
    });
}

/**
 * 显示加载状态
 */
function showLoading(show) {
    const refreshBtn = document.getElementById('refreshBtn');
    const chartOverlay = document.getElementById('chartLoadingOverlay');

    // if (refreshBtn) {
    //     if (show) {
    //         refreshBtn.disabled = true;
    //         refreshBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i><span>加载中...</span>';
    //     } else {
    //         refreshBtn.disabled = false;
    //         refreshBtn.innerHTML = '↩<span>刷新</span>';
    //     }
    // }

    if (chartOverlay) {
        chartOverlay.classList.toggle('visible', Boolean(show));
        chartOverlay.setAttribute('aria-busy', show ? 'true' : 'false');
    }
}

/**
 * 显示成功消息
 */
function showSuccess(message) {
    showToast(message, 'success');
}

/**
 * 显示错误消息
 */
function showError(message) {
    showToast(message, 'error');
}

/**
 * 显示Toast提示
 */
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

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', init);