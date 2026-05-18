// ============================================
// EDA流程监控系统 - 现代化前端逻辑
// 功能: 数据可视化、实时刷新、多线程对比、MR高亮
// ============================================

// 防抖函数
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

// 简单哈希
function simpleHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    return hash.toString();
}

// ============================================
// 全局变量
// ============================================
// let projectsData = window.projectsData || {};
// let perf = window.perf || {};
// let casename = window.casename || '';
let currentRule = null;
let currentDataVersion = '';
let charts = { runtime: null, memory: null };
let cachedToolData = {};
let lastRenderedDataHash = { runtime: '', memory: '' };
let mrUpdateDates = {};
let selectedDates = [];
let pendingSelectedDates = [];
let availableDates = [];
let selectedThreads = ['0'];
let autoRefreshInterval = null;

const MAX_DEFAULT_POINTS = 51;
const AVAILABLE_THREAD_OPTIONS = ['0', '2', '4', '6', '8', '16', '24', '32'];

// 图表颜色
const chartColors = {
    runtime: '#6366f1',
    runtimeHighlight: '#ef4444',
    memory: '#10b981'
};

// ============================================
// 辅助函数
// ============================================

function showNotification(message, type = 'success') {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.innerHTML = type === 'error' ? `❌ ${message}` : `✅ ${message}`;
    document.body.appendChild(notification);
    setTimeout(() => {
        notification.style.animation = 'slideInRight 0.3s ease reverse';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

function getCurrentProjectData() {
    return projectsData[casename];
}

function buildMrUpdateMap(perfData) {
    const mrMap = {};
    if (perfData && perfData.cpu) {
        Object.keys(perfData.cpu).forEach(date => {
            const comment = perfData.cpu[date];
            if (comment && comment !== 'undefined' && comment !== '' && comment !== 'None') {
                mrMap[date] = comment;
            }
        });
    }
    return mrMap;
}

function updateDateSelectionInfo() {
    const current = selectedDates.length ? selectedDates : availableDates.slice(-MAX_DEFAULT_POINTS);
    const dateRangeEl = document.getElementById('dateRange');
    const dataPointsEl = document.getElementById('dataPoints');
    const summaryEl = document.getElementById('selectedDateSummary');
    
    if (dateRangeEl && current.length) {
        dateRangeEl.innerText = `${current[0]} 至 ${current[current.length - 1]}`;
    }
    if (dataPointsEl) {
        dataPointsEl.innerText = current.length;
    }
    if (summaryEl) {
        summaryEl.innerText = current.length === availableDates.length ? '全部可用日期' : `${current.length} 条已选`;
    }
}

function getFilteredToolData(toolData) {
    const filterSet = new Set(selectedDates.length ? selectedDates : availableDates.slice(-MAX_DEFAULT_POINTS));
    const filtered = {
        dates: [],
        runtimes: [],
        memories: [],
        cores: []
    };
    
    toolData.dates.forEach((date, index) => {
        if (filterSet.has(date)) {
            filtered.dates.push(date);
            filtered.runtimes.push(toolData.runtimes[index]);
            filtered.memories.push(toolData.memories[index]);
            filtered.cores.push(toolData.cores[index]);
        }
    });
    
    return filtered;
}

function filterAvailableDates(filterText) {
    const lower = String(filterText || '').trim().toLowerCase();
    if (!lower) return [...availableDates];
    return availableDates.filter(date => date.toLowerCase().includes(lower));
}

// ============================================
// 日期选择器
// ============================================

function buildDateSelect(usePending = false) {
    const container = document.getElementById('dateOptionsContainer');
    if (!container) return;
    
    const projectData = getCurrentProjectData();
    availableDates = projectData.available_dates && projectData.available_dates.length 
        ? projectData.available_dates 
        : projectData.dates;
    
    if (!selectedDates.length) {
        selectedDates = availableDates.slice(-MAX_DEFAULT_POINTS);
    }
    
    const currentSelection = usePending 
        ? (pendingSelectedDates.length ? pendingSelectedDates : selectedDates.slice(-MAX_DEFAULT_POINTS))
        : selectedDates;
    const filterText = document.getElementById('dateFilterInput')?.value || '';
    const filteredDates = filterAvailableDates(filterText);
    
    container.innerHTML = filteredDates.map(date => `
        <div class="date-option-row" data-date="${date}">
            <input type="checkbox" id="checkbox-${date}" value="${date}" 
                ${currentSelection.includes(date) ? 'checked' : ''}>
            <label for="checkbox-${date}">${date}</label>
        </div>
    `).join('');
    
    // 绑定事件
    document.querySelectorAll('.date-option-row').forEach(row => {
        const checkbox = row.querySelector('input');
        const date = row.dataset.date;
        
        checkbox.addEventListener('change', (e) => {
            if (e.target.checked) {
                if (!pendingSelectedDates.includes(date)) {
                    pendingSelectedDates.push(date);
                }
            } else {
                pendingSelectedDates = pendingSelectedDates.filter(item => item !== date);
            }
        });
        
        row.addEventListener('click', (e) => {
            if (e.target.tagName.toLowerCase() !== 'input') {
                checkbox.checked = !checkbox.checked;
                checkbox.dispatchEvent(new Event('change'));
            }
        });
    });
    
    updateDateSelectionInfo();
}

function openDatePickerModal() {
    pendingSelectedDates = selectedDates.length ? [...selectedDates] : availableDates.slice(-MAX_DEFAULT_POINTS);
    const filterInput = document.getElementById('dateFilterInput');
    if (filterInput) filterInput.value = '';
    buildDateSelect(true);
    document.getElementById('datePickerModal')?.classList.remove('hidden');
}

function closeDatePickerModal() {
    document.getElementById('datePickerModal')?.classList.add('hidden');
}

function confirmDatePickerSelection() {
    if (!pendingSelectedDates.length) {
        pendingSelectedDates = availableDates.slice(-MAX_DEFAULT_POINTS);
    }
    selectedDates = [...pendingSelectedDates];
    updateDateSelectionInfo();
    debouncedRenderCharts();
    closeDatePickerModal();
}

function resetDateSelection(useAll = false) {
    selectedDates = useAll ? [...availableDates] : availableDates.slice(-MAX_DEFAULT_POINTS);
    pendingSelectedDates = [...selectedDates];
    updateDateSelectionInfo();
    debouncedRenderCharts();
}

// ============================================
// 阶段选择器
// ============================================

function updateRuleSelect() {
    const caseData = getCurrentProjectData();
    if (!caseData) return;
    
    const rules = caseData.rules;
    const searchText = document.getElementById('ruleSearch')?.value.toLowerCase() || '';
    
    let filteredRules = rules;
    if (searchText) {
        filteredRules = rules.filter(rule => rule.toLowerCase().includes(searchText));
    }
    
    const select = document.getElementById('ruleSelect');
    const currentValue = select?.value;
    
    select.innerHTML = '<option value="">-- 请选择阶段 --</option>' + 
        filteredRules.map(rule => `<option value="${rule}">${rule}</option>`).join('');
    
    if (currentValue && filteredRules.includes(currentValue)) {
        select.value = currentValue;
        currentRule = currentValue;
    } else if (filteredRules.length > 0 && !currentRule) {
        select.value = filteredRules[0];
        currentRule = filteredRules[0];
    }
    
    const currentRuleNameEl = document.getElementById('currentRuleName');
    if (currentRuleNameEl) {
        currentRuleNameEl.innerText = currentRule || '未选择';
    }
    
    if (currentRule) {
        buildDateSelect();
        debouncedRenderCharts();
    } else {
        clearCharts();
    }
}

const debouncedRenderCharts = debounce(() => {
    if (currentRule) refreshAllCharts();
}, 100);

function getCurrentToolDataOptimized() {
    if (!currentRule) return null;
    
    if (cachedToolData[currentRule] && cachedToolData[currentRule].projectId === casename) {
        return cachedToolData[currentRule].data;
    }
    
    const projectData = getCurrentProjectData();
    if (!projectData?.rule_data?.[currentRule]) return null;
    
    cachedToolData[currentRule] = {
        projectId: casename,
        data: projectData.rule_data[currentRule]
    };
    
    const cacheKeys = Object.keys(cachedToolData);
    if (cacheKeys.length > 50) {
        delete cachedToolData[cacheKeys[0]];
    }
    
    return projectData.rule_data[currentRule];
}

function clearCharts() {
    Object.keys(charts).forEach(key => {
        if (charts[key]) charts[key].clear();
    });
}

function updateStats(containerId, data, unit, label) {
    const validData = data.filter(v => v !== null && v !== undefined && v > 0);
    const container = document.getElementById(containerId);
    if (!container) return;
    
    if (validData.length === 0) {
        container.innerHTML = '<div class="stat-card">暂无数据</div>';
        return;
    }
    
    const total = validData.reduce((a, b) => a + b, 0);
    const avg = (total / validData.length).toFixed(1);
    const max = Math.max(...validData);
    const min = Math.min(...validData);
    
    container.innerHTML = `
        <div class="stat-card">
            <div class="stat-label">📊 总${label}</div>
            <div class="stat-value">${total.toFixed(1)}<span class="stat-unit">${unit}</span></div>
        </div>
        <div class="stat-card">
            <div class="stat-label">⚡ 平均${label}</div>
            <div class="stat-value">${avg}<span class="stat-unit">${unit}</span></div>
        </div>
        <div class="stat-card">
            <div class="stat-label">📈 最大${label}</div>
            <div class="stat-value">${max}<span class="stat-unit">${unit}</span></div>
        </div>
        <div class="stat-card">
            <div class="stat-label">📉 最小${label}</div>
            <div class="stat-value">${min}<span class="stat-unit">${unit}</span></div>
        </div>
    `;
}

// ============================================
// ECharts 渲染
// ============================================

function renderEChartOptimized(chartType, dataKey, color, highlightColor, yAxisName, yAxisFormatter = null) {
    const toolData = getCurrentToolDataOptimized();
    if (!toolData) {
        if (charts[chartType]) charts[chartType].clear();
        return;
    }
    
    const filteredData = getFilteredToolData(toolData);
    const dates = filteredData.dates;
    
    const threadMetrics = toolData.thread_metrics || {};
    if (!threadMetrics['0'] && filteredData.runtimes?.length) {
        threadMetrics['0'] = {
            runtimes: filteredData.runtimes,
            memories: filteredData.memories,
            cores: filteredData.cores
        };
    }
    
    const threadIds = Object.keys(threadMetrics).sort((a, b) => parseInt(a) - parseInt(b));
    
    const palette = ['#6366f1', '#f97316', '#10b981', '#8b5cf6', '#eab308', '#06b6d4', '#fb7185', '#a855f7'];
    
    const seriesList = threadIds.map((threadId, index) => {
        const threadInfo = threadMetrics[threadId] || {
            runtimes: new Array(dates.length).fill(null),
            memories: new Array(dates.length).fill(null)
        };
        const values = threadInfo[dataKey] || new Array(dates.length).fill(null);
        
        return {
            name: `${threadId} 线程`,
            type: 'line',
            data: values.map((value, idx) => {
                const date = dates[idx];
                const hasMrUpdate = mrUpdateDates[date] && mrUpdateDates[date] !== 'undefined';
                return {
                    value: value,
                    itemStyle: hasMrUpdate ? {
                        color: highlightColor,
                        borderColor: '#fff',
                        borderWidth: 2
                    } : undefined,
                    symbol: 'circle',
                    symbolSize: hasMrUpdate ? 10 : 5
                };
            }),
            smooth: true,
            lineStyle: { width: 2, color: palette[index % palette.length] },
            areaStyle: { opacity: 0.08 },
            connectNulls: false,
            showSymbol: dates.length <= 100,
            emphasis: { focus: 'series' }
        };
    });
    
    const legendSelected = {};
    threadIds.forEach((threadId) => {
        const seriesName = `${threadId} 线程`;
        legendSelected[seriesName] = selectedThreads.includes(threadId);
    });
    if (!Object.values(legendSelected).includes(true) && threadIds.length) {
        const defaultThread = threadIds.includes('0') ? '0' : threadIds[0];
        legendSelected[`${defaultThread} 线程`] = true;
        selectedThreads = [defaultThread];
    }
    
    const allValues = seriesList
        .filter(series => selectedThreads.includes(series.name.replace(' 线程', '')))
        .flatMap(series => series.data.map(item => item.value))
        .filter(v => v !== null && v !== undefined && v > 0);
    
    updateStats(`stats-${chartType}`, allValues, dataKey === 'runtimes' ? '秒' : 'MB', 
        dataKey === 'runtimes' ? 'Runtime' : 'Memory');
    
    const avgValue = allValues.length > 0 ? (allValues.reduce((a, b) => a + b, 0) / allValues.length).toFixed(1) : 0;
    
    const option = {
        backgroundColor: 'transparent',
        tooltip: {
            trigger: 'axis',
            axisPointer: { type: 'shadow' },
            backgroundColor: 'rgba(26, 26, 46, 0.95)',
            borderColor: color,
            borderWidth: 1,
            textStyle: { color: '#f1f5f9', fontSize: 12 },
            formatter: function(params) {
                if (!params?.length) return '';
                const date = params[0].axisValue;
                const mrComment = mrUpdateDates[date] || '';
                const hasMr = mrComment && mrComment !== 'undefined';
                const rows = params.map(p => `<div><strong>${p.seriesName}</strong>: ${p.value ?? 'N/A'}</div>`).join('');
                return `
                    <strong>📅 ${date}</strong><br/>
                    ${rows}
                    ${hasMr ? `<span style="color: #ef4444;">🔧 ${mrComment}</span>` : ''}
                `;
            }
        },
        grid: {
            left: '8%',
            right: '8%',
            top: '12%',
            bottom: '8%',
            containLabel: true
        },
        xAxis: {
            type: 'category',
            data: dates,
            axisLabel: {
                rotate: dates.length > 15 ? 30 : 0,
                interval: Math.floor(dates.length / 10),
                color: '#94a3b8'
            },
            axisLine: { lineStyle: { color: '#475569' } }
        },
        yAxis: {
            type: 'value',
            name: yAxisName,
            nameTextStyle: { color: '#94a3b8' },
            axisLabel: { color: '#94a3b8', formatter: yAxisFormatter },
            splitLine: { lineStyle: { color: 'rgba(71, 85, 105, 0.3)', type: 'dashed' } }
        },
        series: [
            ...seriesList,
            {
                name: '平均值',
                type: 'line',
                data: new Array(dates.length).fill(parseFloat(avgValue)),
                lineStyle: { width: 1.5, color: '#f59e0b', type: 'dashed' },
                symbol: 'none',
                tooltip: { show: false }
            }
        ],
        legend: {
            data: seriesList.map(s => s.name),
            selected: legendSelected,
            textStyle: { color: '#94a3b8' },
            right: 10,
            top: 0,
            itemWidth: 25,
            itemHeight: 12,
            selector: [
                { type: 'all', title: '全选' },
                { type: 'inverse', title: '反选' }
            ]
        },
        toolbox: {
            feature: {
                saveAsImage: { title: '保存图片' },
                zoom: { title: { zoom: '缩放', back: '还原' } },
                restore: { title: '重置' }
            },
            iconStyle: { borderColor: '#94a3b8' }
        },
        dataZoom: dates.length > 30 ? [
            { type: 'inside', start: 0, end: 100 },
            { type: 'slider', start: 0, end: 100, bottom: 10 }
        ] : []
    };
    
    const newHash = simpleHash(JSON.stringify({ dates, selectedThreads, currentRule, chartType, dataKey }));
    if (lastRenderedDataHash[chartType] === newHash && charts[chartType] && !charts[chartType].isDisposed()) {
        return;
    }
    lastRenderedDataHash[chartType] = newHash;
    
    if (charts[chartType] && !charts[chartType].isDisposed()) {
        charts[chartType].setOption(option, { notMerge: false, lazyUpdate: true });
    }
}

function refreshStatsOnly() {
    if (!currentRule) return;
    const toolData = getCurrentToolDataOptimized();
    if (!toolData) return;

    const filteredData = getFilteredToolData(toolData);
    const threadMetrics = toolData.thread_metrics || {};
    const threadIds = Object.keys(threadMetrics).sort((a, b) => parseInt(a) - parseInt(b));

    const runtimeValues = [];
    const memoryValues = [];
    threadIds.forEach(threadId => {
        if (!selectedThreads.includes(threadId)) return;
        const threadInfo = threadMetrics[threadId] || {};
        const values = threadInfo.runtimes || [];
        const memory = threadInfo.memories || [];
        values.forEach((value, idx) => {
            if (filteredData.dates[idx] && value !== null && value !== undefined && value > 0) runtimeValues.push(value);
        });
        memory.forEach((value, idx) => {
            if (filteredData.dates[idx] && value !== null && value !== undefined && value > 0) memoryValues.push(value);
        });
    });

    updateStats('stats-runtime', runtimeValues, '秒', 'Runtime');
    updateStats('stats-memory', memoryValues, 'MB', 'Memory');
}

function handleLegendSelectionChange(event) {
    if (!event || !event.selected) return;

    const selected = Object.entries(event.selected)
        .filter(([name, isSelected]) => isSelected && name.endsWith(' 线程'))
        .map(([name]) => name.replace(' 线程', ''));

    selectedThreads = selected.length ? selected : ['0'];
    updateThreadSummary();
    refreshAllCharts();
}

function refreshAllCharts() {
    if (!currentRule) {
        clearCharts();
        return;
    }
    
    requestAnimationFrame(() => {
        renderEChartOptimized('runtime', 'runtimes', chartColors.runtime, chartColors.runtimeHighlight, 'Runtime (秒)');
        renderEChartOptimized('memory', 'memories', chartColors.memory, chartColors.memory, 'Memory (MB)', 
            v => v >= 1024 ? (v / 1024).toFixed(1) + ' GB' : v + ' MB');
    });
}

// ============================================
// 数据刷新
// ============================================

async function checkForUpdates() {
    try {
        const response = await fetch('/api/check_update', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tool: 'elint', thread: 'single', version: currentDataVersion })
        });
        const result = await response.json();
        
        const refreshIndicator = document.querySelector('.refresh-indicator');
        if (result.has_update) {
            refreshIndicator?.classList.add('has-update');
            refreshIndicator?.setAttribute('title', '发现新数据');
            showNotification('发现新数据，点击刷新按钮更新', 'info');
        } else {
            refreshIndicator?.classList.remove('has-update');
        }
    } catch (error) {
        console.error('检查更新失败:', error);
    }
}

async function refreshData() {
    const refreshBtn = document.getElementById('refreshBtn');
    const originalText = refreshBtn?.innerHTML;
    
    if (refreshBtn) {
        refreshBtn.innerHTML = '<span class="spinner"></span> 刷新中...';
        refreshBtn.disabled = true;
    }
    
    try {
        const response = await fetch('/api/refresh', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tool: 'elint', thread: 'single' })
        });
        const result = await response.json();
        
        if (result.success) {
            projectsData = result.data;
            currentDataVersion = result.version;
            mrUpdateDates = buildMrUpdateMap(result.perf);
            cachedToolData = {};
            lastRenderedDataHash = { runtime: '', memory: '' };
            
            const lastUpdateEl = document.getElementById('lastUpdateTime');
            if (lastUpdateEl) lastUpdateEl.innerHTML = `最后更新: ${result.last_update}`;
            
            document.querySelector('.refresh-indicator')?.classList.remove('has-update');
            
            if (result.project_list?.length) {
                const caseSelect = document.getElementById('caseSelect');
                const currentProject = caseSelect?.value;
                if (caseSelect) {
                    caseSelect.innerHTML = result.project_list.map(p => 
                        `<option value="${p.id}">${p.name}</option>`
                    ).join('');
                    if (projectsData[currentProject]) {
                        caseSelect.value = currentProject;
                    } else if (result.project_list[0]) {
                        caseSelect.value = result.project_list[0].id;
                        casename = result.project_list[0].id;
                    }
                }
            }
            
            updateRuleSelect();
            updateProjectStats();
            showNotification('数据刷新成功！');
        } else {
            throw new Error(result.message || '刷新失败');
        }
    } catch (error) {
        console.error('刷新失败:', error);
        showNotification(`刷新失败: ${error.message}`, 'error');
    } finally {
        if (refreshBtn) {
            refreshBtn.innerHTML = originalText;
            refreshBtn.disabled = false;
        }
    }
}

function updateThreadSummary() {
    const threadSummaryEl = document.getElementById('threadSummary');
    if (!threadSummaryEl) return;
    threadSummaryEl.innerText = selectedThreads.length ? selectedThreads.join(', ') : '0';
}

function updateProjectStats() {
    const projectData = getCurrentProjectData();
    if (!projectData) return;
    
    const statsEl = document.getElementById('projectStats');
    if (!statsEl) return;
    
    statsEl.innerHTML = `
        <div class="badge-item"><span>📊</span> 阶段数: ${projectData.rules.length}</div>
        <div class="badge-item"><span>📅</span> 天数: ${projectData.dates.length}</div>
    `;
    updateDateSelectionInfo();
    updateThreadSummary();
}

// ============================================
// 初始化
// ============================================

function initCharts() {
    const runtimeChartDom = document.getElementById('chart-runtime');
    const memoryChartDom = document.getElementById('chart-memory');
    
    if (runtimeChartDom && !charts.runtime) {
        charts.runtime = echarts.init(runtimeChartDom);
        charts.runtime.on('legendselectchanged', handleLegendSelectionChange);
    }
    if (memoryChartDom && !charts.memory) {
        charts.memory = echarts.init(memoryChartDom);
        charts.memory.on('legendselectchanged', handleLegendSelectionChange);
    }
    
    const resizeHandler = debounce(() => {
        Object.values(charts).forEach(chart => chart?.resize());
    }, 200);
    window.addEventListener('resize', resizeHandler);
}

function setupSearchListener() {
    const searchInput = document.getElementById('ruleSearch');
    if (searchInput) {
        searchInput.addEventListener('input', debounce(() => updateRuleSelect(), 300));
    }
}

function switchTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(tab => tab.classList.add('hidden'));
    document.getElementById(`${tabId}-tab`)?.classList.remove('hidden');
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelector(`.tab-btn[data-tab="${tabId}"]`)?.classList.add('active');
    
    setTimeout(() => {
        const chart = charts[tabId];
        chart?.resize();
    }, 100);
}

// ============================================
// 事件绑定
// ============================================

document.addEventListener('DOMContentLoaded', () => {
    // 初始化图表
    initCharts();
    setupSearchListener();
    
    // MR更新映射
    mrUpdateDates = buildMrUpdateMap(perf);
    
    // 项目选择
    const caseSelect = document.getElementById('caseSelect');
    if (caseSelect) {
        caseSelect.addEventListener('change', (e) => {
            casename = e.target.value;
            currentRule = null;
            cachedToolData = {};
            lastRenderedDataHash = { runtime: '', memory: '' };
            updateRuleSelect();
            updateProjectStats();
        });
    }
    
    // 阶段选择
    const ruleSelect = document.getElementById('ruleSelect');
    if (ruleSelect) {
        ruleSelect.addEventListener('change', (e) => {
            currentRule = e.target.value;
            const currentRuleNameEl = document.getElementById('currentRuleName');
            if (currentRuleNameEl) currentRuleNameEl.innerText = currentRule || '未选择';
            if (currentRule) debouncedRenderCharts();
            else clearCharts();
            updateThreadSummary();
        });
    }
    
    // Tab切换
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });
    
    // 日期选择器
    const openDatePickerBtn = document.getElementById('openDatePickerBtn');
    if (openDatePickerBtn) openDatePickerBtn.addEventListener('click', openDatePickerModal);
    
    const closeDatePickerBtn = document.getElementById('closeDatePickerBtn');
    if (closeDatePickerBtn) closeDatePickerBtn.addEventListener('click', closeDatePickerModal);
    
    const confirmDateSelectionBtn = document.getElementById('confirmDateSelectionBtn');
    if (confirmDateSelectionBtn) confirmDateSelectionBtn.addEventListener('click', confirmDatePickerSelection);
    
    const cancelDateSelectionBtn = document.getElementById('cancelDateSelectionBtn');
    if (cancelDateSelectionBtn) cancelDateSelectionBtn.addEventListener('click', closeDatePickerModal);
    
    const datePickerOverlay = document.getElementById('datePickerOverlay');
    if (datePickerOverlay) datePickerOverlay.addEventListener('click', closeDatePickerModal);
    
    const modalRecentBtn = document.getElementById('modalRecentBtn');
    if (modalRecentBtn) modalRecentBtn.addEventListener('click', () => {
        pendingSelectedDates = availableDates.slice(-MAX_DEFAULT_POINTS);
        buildDateSelect(true);
    });
    
    const modalAllDatesBtn = document.getElementById('modalAllDatesBtn');
    if (modalAllDatesBtn) modalAllDatesBtn.addEventListener('click', () => {
        pendingSelectedDates = [...availableDates];
        buildDateSelect(true);
    });
    
    const dateFilterInput = document.getElementById('dateFilterInput');
    if (dateFilterInput) {
        dateFilterInput.addEventListener('input', debounce(() => buildDateSelect(true), 150));
    }
    
    const selectRecentBtn = document.getElementById('selectRecentBtn');
    if (selectRecentBtn) selectRecentBtn.addEventListener('click', () => resetDateSelection(false));
    
    const selectAllDatesBtn = document.getElementById('selectAllDatesBtn');
    if (selectAllDatesBtn) selectAllDatesBtn.addEventListener('click', () => resetDateSelection(true));
    
    // 刷新按钮
    const refreshBtn = document.getElementById('refreshBtn');
    if (refreshBtn) refreshBtn.addEventListener('click', refreshData);
    
    // 初始加载
    updateRuleSelect();
    updateProjectStats();
    
    // 启动自动检查更新（每30秒）
    setInterval(checkForUpdates, 30000);
    
    // 延迟首次渲染
    setTimeout(() => {
        if (currentRule) refreshAllCharts();
    }, 200);
});