/**
 * 工具页面逻辑 - 主控制器
 */

// 从 URL 获取工具 ID
const toolId = window.location.pathname.split('/').pop();
window.toolId = toolId;

// 全局状态
let toolConfig = null;
let rawData = {};
let userAddedData = {};
let currentMode = 'single';
let currentChartType = 'runtime';
let threadChart = null;

// 模块实例
let singleThreadManager = null;
let multiThreadManager = null;

// DOM 元素
const toolNameEl = document.getElementById('toolName');
const toolDescEl = document.getElementById('toolDesc');
const backBtn = document.getElementById('backBtn');
const refreshBtn = document.getElementById('refreshBtn');
const modeNavItems = document.querySelectorAll('.mode-nav-item');
const menuItems = document.querySelectorAll('.menu-item');
const sidebarPerformance = document.getElementById('sidebarPerformance');
const sidebarThread = document.getElementById('sidebarThread');
const filtersPanel = document.getElementById('filtersPanel');
const comparisonPanel = document.getElementById('comparisonPanel');

/**
 * 初始化页面
 */
async function init() {
    console.log('页面初始化开始');
    await loadToolConfig();
    await loadData();
    initEventListeners();
    initComparisonPanel();
    initThreadChartPanel();
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
 * 加载数据 - 完全分离单线程和多线程数据
 */
async function loadData() {
    try {
        showLoading(true);
        const response = await axios.post(`/api/tools/${toolId}/data`);
        
        if (response.data.success) {
            showSuccess('正在加载数据，请稍等...');
            const data = response.data.data || {};
            // 分离数据
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
            // console.warn(userData)
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
                // 创建图表实例
                if (container) {
                    singleThreadManager.chart = echarts.init(container);
                }
                await singleThreadManager.init(singleData, userData, extraData);
                // 强制更新 overview
                singleThreadManager.updateOverview();
            }
            
            // 初始化多线程模块
            if (window.MultiThreadManager) {
                multiThreadManager = new window.MultiThreadManager();
                // 创建图表实例
                const container = document.getElementById('mainChart');
                if (container) {
                    multiThreadManager.chart = echarts.init(container);
                }
                await multiThreadManager.init(multiData, userData, extraData);
                // 强制更新 overview
                multiThreadManager.updateOverview();
            }
            
            // 根据当前模式显示对应的数据
            if (currentMode === 'single') {
                await switchToSingleMode();
            } else if (currentMode === 'multi') {
                await switchToMultiMode();
            } else {
                await switchToSingleMode(); // 默认显示单线程
            }
        } else {
            console.error('加载数据失败:', response.data.error);
            showError('加载数据失败:2 ' + (response.data.error || '未知错误'));
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
    const activeMenuItem = document.querySelector('#singleSidebar .menu-item.active');
    const currentChartType = activeMenuItem ? activeMenuItem.dataset.chart : 'runtime';
    
    const filtersPanel = document.getElementById('singleFiltersPanel');
    const comparisonPanel = document.getElementById('singleComparisonPanel');
    // 切换比较面板显示
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
    const activeMenuItem = document.querySelector('#multiSidebar .menu-item.active');
    const currentChartType = activeMenuItem ? activeMenuItem.dataset.chart : 'runtime';
    
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
        // 如果图表实例不存在或已被销毁，重新创建
        if (!multiThreadManager.chart || multiThreadManager.chart.isDisposed()) {
            multiThreadManager.chart = echarts.init(container);
        }
        // 重新渲染图表
        if (currentChartType !== 'comparison') {
            await multiThreadManager.renderChart();
        }
        // 更新概况统计
        multiThreadManager.updateOverview();
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
            
            // 完全分离三种数据类型
            let singleData = {};
            let multiData = {};
            let extraData = {};
            
            if (typeof data === 'string') {
                try {
                    const parsed = JSON.parse(data);
                    if (parsed.single) singleData = parsed.single;
                    if (parsed.multi) multiData = parsed.multi;
                    if (parsed.extra) extraData = parsed.extra;
                } catch (e) {
                    singleData = data;
                }
            } else {
                if (data.single) singleData = data.single;
                if (data.multi) multiData = data.multi;
                if (data.extra) extraData = data.extra;
            }
            
            window.singleData = singleData;
            window.multiData = multiData;
            window.extraData = extraData;
            
            // 刷新单线程模块
            if (singleThreadManager) {
                await singleThreadManager.refreshWithData(singleData, extraData);
            }
            
            // 刷新多线程模块
            if (multiThreadManager) {
                await multiThreadManager.refreshWithData(multiData, extraData);
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
let singleFiltersPanel = null;
let singleComparisonPanel = null;
let multiFiltersPanel = null;
let multiComparisonPanel = null;
/**
 * 初始化事件监听（修复版）
 */
function initEventListeners() {
    // 获取面板元素
    singleFiltersPanel = document.getElementById('singleFiltersPanel');
    singleComparisonPanel = document.getElementById('singleComparisonPanel');
    multiFiltersPanel = document.getElementById('multiFiltersPanel');
    multiComparisonPanel = document.getElementById('multiComparisonPanel');
    
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
            // 更新当前模式的活动菜单
            const singleMenuItemsAll = document.querySelectorAll('#singleSidebar .menu-item');
            singleMenuItemsAll.forEach(menu => menu.classList.remove('active'));
            item.classList.add('active');
            
            const chartType = item.dataset.chart;
            currentChartType = chartType;
            
            if (chartType === 'comparison') {
                // 显示对比面板，隐藏筛选面板
                if (singleFiltersPanel) singleFiltersPanel.style.display = 'none';
                if (singleComparisonPanel) singleComparisonPanel.style.display = 'block';
                
                // 隐藏统计和图表区域
                const statsGrid = document.getElementById('statsGrid');
                const overviewCard = document.querySelector('.overview-card');
                const chartContainer = document.querySelector('.chart-container');
                if (statsGrid) statsGrid.style.display = 'none';
                if (overviewCard) overviewCard.style.display = 'none';
                if (chartContainer) chartContainer.style.display = 'none';
                
                // 隐藏对比结果区域（如果之前有显示）
                const comparisonResults = document.getElementById('comparisonResults');
                if (comparisonResults) comparisonResults.style.display = 'none';
            } else {
                // 显示筛选面板，隐藏对比面板
                if (singleFiltersPanel) singleFiltersPanel.style.display = 'block';
                if (singleComparisonPanel) singleComparisonPanel.style.display = 'none';
                
                // 显示统计和图表区域
                const statsGrid = document.getElementById('statsGrid');
                const overviewCard = document.querySelector('.overview-card');
                const chartContainer = document.querySelector('.chart-container');
                if (statsGrid) statsGrid.style.display = 'grid';
                if (overviewCard) overviewCard.style.display = 'block';
                if (chartContainer) chartContainer.style.display = 'block';
                
                // 隐藏对比结果区域
                const comparisonResults = document.getElementById('comparisonResults');
                if (comparisonResults) comparisonResults.style.display = 'none';
                
                // 重新渲染图表
                if (singleThreadManager) {
                    singleThreadManager.setChartType(chartType);
                }
            }
        });
    });
    
    // 多线程侧边栏菜单切换
    const multiMenuItems = document.querySelectorAll('#multiSidebar .menu-item');
    multiMenuItems.forEach(item => {
        item.addEventListener('click', () => {
            const multiMenuItemsAll = document.querySelectorAll('#multiSidebar .menu-item');
            multiMenuItemsAll.forEach(menu => menu.classList.remove('active'));
            item.classList.add('active');
            
            const chartType = item.dataset.chart;
            currentChartType = chartType;
            
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
                    multiThreadManager.setChartType(chartType);
                }
            }
        });
    });
}

/**
 * 切换到线程曲线图模式
 */
async function switchToThreadMode() {
    currentMode = 'thread';
    
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
    
    // 隐藏线程选择器（线程曲线图有自己的选择器）
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
    
    // 加载线程曲线图数据
    await updateThreadSelects();
    await loadThreadChartData();
    await updateThreadSelects();
}

/**
 * 初始化对比面板
 */
function initComparisonPanel() {
    const confirmCompareBtn = document.getElementById('confirmCompareBtn');
    const exportCompareBtn = document.getElementById('exportCompareBtn');
    const compCasenameSelect = document.getElementById('compCasenameSelect');
    const compareModeSelect = document.getElementById('compareModeSelect');
    const date1Select = document.getElementById('date1Select');
    const date2Select = document.getElementById('date2Select');
    
    if (compCasenameSelect) {
        compCasenameSelect.addEventListener('change', (e) => {
            const currentManager = currentMode === 'single' ? singleThreadManager : multiThreadManager;
            if (currentManager && currentManager.casenameSelect) {
                currentManager.casenameSelect.value = e.target.value;
                currentManager.selectedCasename = e.target.value;
                currentManager.updateRulesAndDates();
            }
        });
    }
    
    if (confirmCompareBtn) {
        confirmCompareBtn.addEventListener('click', performComparison);
    }
    
    if (exportCompareBtn) {
        exportCompareBtn.addEventListener('click', exportComparison);
    }
}

/**
 * 执行数据对比
 */
async function performComparison() {
    const currentManager = currentMode === 'single' ? singleThreadManager : multiThreadManager;
    if (!currentManager) {
        showError('请先加载数据');
        return;
    }
    
    const date1Select = document.getElementById('date1Select');
    const date2Select = document.getElementById('date2Select');
    const compareModeSelect = document.getElementById('compareModeSelect');
    const dimensionSelect = document.getElementById('dimensionSelect');
    const runtimeThreshold = document.getElementById('runtimeThreshold');
    const memoryThreshold = document.getElementById('memoryThreshold');
    const errorModeSelect = document.getElementById('errorModeSelect');
    
    const date1 = date1Select ? date1Select.value : '';
    const date2 = date2Select ? date2Select.value : '';
    const compareMode = compareModeSelect ? compareModeSelect.value : 'all';
    const dimension = dimensionSelect ? dimensionSelect.value : 'all';
    const runtimeThresholdVal = parseFloat(runtimeThreshold?.value || 0);
    const memoryThresholdVal = parseFloat(memoryThreshold?.value || 0);
    const errorMode = errorModeSelect ? errorModeSelect.value : 'absolute';
    
    let rulesToCompare = [];
    if (compareMode === 'all') {
        rulesToCompare = currentManager.allRules;
    } else {
        rulesToCompare = [compareMode];
    }
    
    if (!date1 || !date2) {
        showError('请选择两个日期进行对比');
        return;
    }
    
    try {
        const response = await axios.post('/api/comparison', {
            raw_data: currentManager.allData,
            casename: currentManager.selectedCasename,
            date1: date1,
            date2: date2,
            rules: rulesToCompare,
            compare_mode: compareMode,
            dimension: dimension,
            runtime_threshold: runtimeThresholdVal,
            memory_threshold: memoryThresholdVal,
            error_mode: errorMode
        });
        
        if (response.data.success) {
            renderComparisonResults(response.data.data);
            const comparisonResults = document.getElementById('comparisonResults');
            if (comparisonResults) comparisonResults.style.display = 'block';
            
            const chartContainer = document.querySelector('.chart-container');
            if (chartContainer) chartContainer.style.display = 'none';
            
            const statsGrid = document.getElementById('statsGrid');
            if (statsGrid) statsGrid.style.display = 'none';
            
            const overviewCard = document.querySelector('.overview-card');
            if (overviewCard) overviewCard.style.display = 'none';
        }
    } catch (error) {
        console.error('执行对比失败:', error);
        showError('执行对比失败');
    }
}

/**
 * 渲染对比结果
 */
function renderComparisonResults(result) {
    const stats = result.statistics;
    const comparisons = result.comparisons;
    
    const statsGrid = document.getElementById('comparisonStatsGrid');
    if (statsGrid) {
        statsGrid.innerHTML = `
            <div class="comparison-stat-card">
                <h4>Runtime 增加 Rule</h4>
                <div class="comparison-stat-value">${stats.runtime_increased.length}</div>
            </div>
            <div class="comparison-stat-card">
                <h4>Runtime 减少 Rule</h4>
                <div class="comparison-stat-value">${stats.runtime_decreased.length}</div>
            </div>
            <div class="comparison-stat-card">
                <h4>Memory 增加 Rule</h4>
                <div class="comparison-stat-value">${stats.memory_increased.length}</div>
            </div>
            <div class="comparison-stat-card">
                <h4>Memory 减少 Rule</h4>
                <div class="comparison-stat-value">${stats.memory_decreased.length}</div>
            </div>
            <div class="comparison-stat-card">
                <h4>平均 Runtime 变化率</h4>
                <div class="comparison-stat-value">${stats.avg_runtime_change.toFixed(2)}%</div>
            </div>
            <div class="comparison-stat-card">
                <h4>平均 Memory 变化率</h4>
                <div class="comparison-stat-value">${stats.avg_memory_change.toFixed(2)}%</div>
            </div>
        `;
    }
    
    const tableBody = document.getElementById('comparisonTableBody');
    if (tableBody) {
        tableBody.innerHTML = comparisons.map(comp => `
            <tr class="${comp.is_out_of_tolerance ? 'out-of-tolerance' : ''}">
                <td>${escapeHtml(comp.rule)}</td>
                <td>R: ${comp.date1_value.runtime?.toFixed(2) || 'N/A'}<br>M: ${comp.date1_value.memory?.toFixed(2) || 'N/A'}</td>
                <td>R: ${comp.date2_value.runtime?.toFixed(2) || 'N/A'}<br>M: ${comp.date2_value.memory?.toFixed(2) || 'N/A'}</td>
                <td>R: ${comp.difference.runtime?.toFixed(2) || 'N/A'}<br>M: ${comp.difference.memory?.toFixed(2) || 'N/A'}</td>
                <td>R: ${comp.percentage.runtime?.toFixed(2) || 'N/A'}%<br>M: ${comp.percentage.memory?.toFixed(2) || 'N/A'}%</td>
                <td>${comp.is_out_of_tolerance ? '<span class="status-badge warning">超差</span>' : '<span class="status-badge">正常</span>'}</td>
            </tr>
        `).join('');
    }
}

/**
 * 导出对比结果
 */
function exportComparison() {
    const tableBody = document.getElementById('comparisonTableBody');
    if (!tableBody) return;
    
    const rows = Array.from(tableBody.querySelectorAll('tr'));
    const csvData = rows.map(row => {
        const cells = Array.from(row.querySelectorAll('td'));
        return cells.map(cell => cell.textContent.trim().replace(/\n/g, ';')).join(',');
    });
    
    const headers = ['Rule', '日期1值', '日期2值', '绝对差值', '百分比变化', '状态'];
    const csvContent = [headers, ...csvData].map(row => row.join(',')).join('\n');
    
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.href = url;
    link.setAttribute('download', `comparison_${new Date().toISOString().slice(0,19)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

/**
 * 初始化线程曲线图面板
 */
function initThreadChartPanel() {
    const refreshBtn = document.getElementById('refreshThreadChartBtn');
    const threadCasenameSelect = document.getElementById('threadCasenameSelect');
    const threadRuleSelect = document.getElementById('threadRuleSelect');
    const threadDateSelect = document.getElementById('threadDateSelect');
    const threadRuleSearch = document.getElementById('threadRuleSearch');
    
    if (refreshBtn) {
        refreshBtn.addEventListener('click', loadThreadChartData);
    }
    
    if (threadCasenameSelect) {
        threadCasenameSelect.addEventListener('change', () => {
            updateThreadRules();
            updateThreadDates();
            loadThreadChartData();
        });
    }
    // 为线程曲线图内的 Rule 选择框绑定切换事件
    if (threadRuleSelect) {
        threadRuleSelect.addEventListener('change', loadThreadChartData);
    }
    // 为线程曲线图内的 Date 选择框绑定切换事件
    if (threadDateSelect) {
        threadDateSelect.addEventListener('change', loadThreadChartData);
    }
    // 为线程曲线图内的 Rule 搜索框绑定输入事件
    if (threadRuleSearch) {
        threadRuleSearch.addEventListener('input', updateThreadRules);
    }
    
    // 为线程曲线图内的 Runtime/Memory 菜单绑定切换事件
    const threadMenuItems = document.querySelectorAll('#threadSidebar .menu-item');
    threadMenuItems.forEach(item => {
        item.addEventListener('click', () => {
            // 更新活动状态
            threadMenuItems.forEach(menu => menu.classList.remove('active'));
            item.classList.add('active');
            // 重新加载线程曲线图数据
            loadThreadChartData();
        });
    });
}

/**
 * 更新线程曲线图的 rule 列表
 */
async function updateThreadRules() {
    // 更新线程曲线图中的 Rule 选择框
    console.log("++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++");
    const threadCasenameSelect = document.getElementById('threadCasenameSelect');
    const threadRuleSelect = document.getElementById('threadRuleSelect');
    const threadRuleSearch = document.getElementById('threadRuleSearch');

    const casename = threadCasenameSelect?.value;
    if (!casename) return;
    
    const currentManager = multiThreadManager || singleThreadManager;
    if (!currentManager || !currentManager.allData[casename]) return;
    
    const caseData = currentManager.allData[casename];
    
    const rulesSet = new Set(Object.keys(caseData[currentChartType]));
    
    let allThreadRules = Array.from(rulesSet).sort();
    if (allThreadRules.includes('Overall')) {
        allThreadRules = ['Overall', ...allThreadRules.filter(r => r !== 'Overall')];
    }
    
    const searchTerm = threadRuleSearch ? threadRuleSearch.value.toLowerCase() : '';
    const filteredRules = searchTerm 
        ? allThreadRules.filter(rule => rule.toLowerCase().includes(searchTerm))
        : allThreadRules;
    
    const options = filteredRules.map(rule => 
        `<option value="${escapeHtml(rule)}">${escapeHtml(rule)}</option>`
    ).join('');
    
    // if (threadRuleSelect) {
        threadRuleSelect.innerHTML = options;
        if (options && !threadRuleSelect.value && allThreadRules.length > 0) {
            threadRuleSelect.value = allThreadRules[0];
        }
    // }
}

/**
 * 更新线程曲线图的 date 列表
 */
async function updateThreadDates() {
    const threadCasenameSelect = document.getElementById('threadCasenameSelect');
    const threadRuleSelect = document.getElementById('threadRuleSelect');
    const threadDateSelect = document.getElementById('threadDateSelect');
    
    const casename = threadCasenameSelect?.value;
    if (!casename) return;
    
    const currentManager = multiThreadManager || singleThreadManager;
    if (!currentManager || !currentManager.allData[casename]) return;
    
    const caseData = currentManager.allData[casename];

    const dates = Array.from(new Set(caseData[currentChartType][threadRuleSelect.value]["dates"])).sort((a, b) => b.localeCompare(a));

    const options = dates.map(date => 
        `<option value="${date}">${formatDate(date)}</option>`
    ).join('');
    
    if (threadDateSelect) {
        threadDateSelect.innerHTML = options;
        if (dates.length > 0 && !threadDateSelect.value) {
            threadDateSelect.value = dates[dates.length - 1];
        }
    }
    console.log(threadDateSelect.value);
}

/**
 * 从后端获取 线程曲线图数据
 */
async function loadThreadChartData() {
    const threadCasenameSelect = document.getElementById('threadCasenameSelect');
    const threadRuleSelect = document.getElementById('threadRuleSelect');
    const threadDateSelect = document.getElementById('threadDateSelect');

    const casename = threadCasenameSelect?.value;
    const rule = threadRuleSelect?.value;
    const date = threadDateSelect?.value;
    
    if (!casename || !rule || !date) {
        console.log('线程曲线图: 缺少必要参数', { casename, rule, date });
        return;
    }
    
    try {
        const currentManager = multiThreadManager || singleThreadManager;
        if (!currentManager) return;
        
        const responseData = {
            casename: casename,
            rule: rule,
            date: date,
            toolID: window.toolId,
            mode: currentChartType
        }

        const response = await axios.post('/api/thread/chart/data', responseData);

        if (response.data.success) {
            console.log('线程曲线图数据加载成功:', response.data.data);
            drawThreadChart(response.data.data);
        }
    } catch (error) {
        console.error('加载线程曲线图数据失败:', error);
        showError('加载线程曲线图数据失败');
    }
}

/**
 * 绘制线程曲线图
 */
function drawThreadChart(chartData) {
    const container = document.getElementById('mainChart');
    if (!container) return;
    
    if (threadChart) {
        threadChart.dispose();
    }
    
    threadChart = echarts.init(container);
    
    const { threads, runtime, memory } = chartData;
    

    // 修复：正确获取线程曲线图中激活的菜单项
    const activeThreadMenuItem = document.querySelector('#threadSidebar .menu-item.active');
    const isRuntime = activeThreadMenuItem && activeThreadMenuItem.dataset.threadChart === 'runtime';
    
    const yAxisName = isRuntime ? 'Runtime (s)' : 'Memory (MB)';
    const seriesData = isRuntime ? runtime : memory;
    const seriesName = isRuntime ? 'Runtime' : 'Memory';
    
    // 检查数据是否有效
    if (!seriesData || seriesData.length === 0 || seriesData.every(v => v === null || v === undefined)) {
        threadChart.setOption({
            title: {
                show: true,
                text: '暂无数据',
                left: 'center',
                top: 'center',
                textStyle: { color: '#94A3B8', fontSize: 14 }
            }
        });
        return;
    }
    // 计算平均值
    const validValues = seriesData.filter(v => v !== null && v !== undefined);
    let avgLine = null;
    if (validValues.length > 0) {
        const avgValue = validValues.reduce((a, b) => a + b, 0) / validValues.length;
        avgLine = {
            name: '平均值',
            type: 'line',
            data: Array(seriesData.length).fill(avgValue),
            smooth: false,
            symbol: 'none',
            lineStyle: { 
                width: 2, 
                color: '#F59E0B',
                type: 'dashed'
            },
            itemStyle: { color: '#F59E0B' },
            emphasis: { focus: 'none' },
            z: 1
        };
    }
    const option = {
        backgroundColor: 'transparent',
        title: {
            text: isRuntime ? '线程数 vs Runtime' : '线程数 vs Memory',
            textStyle: { color: '#F1F5F9' },
            left: 'center',
            top: 0
        },
        tooltip: {
            trigger: 'axis',
            axisPointer: { type: 'shadow' },
            formatter: (params) => {
                if (!params || params.length === 0) return '';
                const data = params[0];
                const value = data.value;
                if (value === null || value === undefined) {
                    return `<div style="font-weight:600">线程数: ${data.axisValue}</div>
                            <div>${seriesName}: 无数据</div>`;
                }
                return `<div style="font-weight:600">线程数: ${data.axisValue}</div>
                        <div>${seriesName}: ${value.toFixed(2)}</div>`;
            }
        },
        grid: {
            left: '3%',
            right: '5%',
            top: '15%',
            bottom: '8%',
            containLabel: true
        },
        xAxis: {
            type: 'category',
            name: '线程数',
            data: threads,
            axisLabel: { fontSize: 12, color: '#94A3B8' },
            axisLine: { lineStyle: { color: '#334155' } }
        },
        yAxis: {
            type: 'value',
            name: yAxisName,
            nameTextStyle: { color: '#94A3B8' },
            axisLabel: { color: '#94A3B8' },
            splitLine: { lineStyle: { color: '#1E293B' } }
        },
        series: [{
            name: seriesName,
            type: 'line',
            data: seriesData,
            smooth: false,
            symbol: 'circle',
            symbolSize: 8,
            lineStyle: { width: 3, color: '#00E5FF' },
            itemStyle: { color: '#00E5FF', borderColor: '#0F172A', borderWidth: 2 },
            areaStyle: { opacity: 0.1, color: '#00E5FF' },
            connectNulls: false
        },
        ...(avgLine ? [avgLine] : [])
        ],
        toolbox: {
            feature: {
                saveAsImage: { title: '保存图片' }
            },
            iconStyle: { borderColor: '#94A3B8' }
        }
    };
    
    threadChart.setOption(option, true);
    
    // 监听窗口大小变化
    window.addEventListener('resize', () => {
        if (threadChart && !threadChart.isDisposed()) {
            threadChart.resize();
        }
    });
}

/**
 * 更新线程曲线图的 casename 选择框
 */
async function updateThreadSelects() {
    const threadCasenameSelect = document.getElementById('threadCasenameSelect');
    if (!threadCasenameSelect) return;
    
    const currentManager = multiThreadManager || singleThreadManager;
    if (!currentManager) return;
    // 更新线程曲线图中的 Casename 选择框
    const casenames = Object.keys(currentManager.allData);
    const options = casenames.map(name => 
        `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`
    ).join('');
    
    threadCasenameSelect.innerHTML = options;
    if (casenames.length > 0 && !threadCasenameSelect.value) {
        threadCasenameSelect.value = casenames[0];
    }
    
    await updateThreadRules();
    await updateThreadDates();
    await loadThreadChartData();
}

/**
 * 格式化日期
 */
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

/**
 * HTML转义
 */
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * 显示加载状态
 */
function showLoading(show) {
    const refreshBtn = document.getElementById('refreshBtn');
    if (refreshBtn) {
        if (show) {
            refreshBtn.disabled = true;
            refreshBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i><span>加载中...</span>';
        } else {
            refreshBtn.disabled = false;
            refreshBtn.innerHTML = '↩<span>刷新</span>';
        }
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