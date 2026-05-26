/**
 * EDA 性能监控系统 - 工具页面主脚本
 * 整合各模块并处理初始化
 */

// ==================================================
// 全局状态
// ==================================================

// // 时序曲线图状态
// let timelineState = {
//     currentProjectId: null,
//     currentRule: null,
//     selectedDates: [],
//     availableDates: [],
//     currentChartType: 'runtime',
//     cachedToolData: {},
//     mrUpdateDates: {}
// };

// // 多线程状态
// let multiState = {
//     currentProjectId: null,
//     currentRule: null,
//     currentDate: null,
//     availableDates: [],
//     currentChartType: 'runtime',
//     selectedThreads: [],
//     availableThreads: [],
//     currentData: [],
//     pendingSelectedDates: []
// };

// // 对比状态
// let compareState = {
//     currentProjectId: null,
//     currentResult: null,
//     currentFilteredData: [],
//     currentFilterText: '',
//     availableDates: []
// };

// // 自定义图表状态
// let customState = {
//     projectsData: {},
//     currentProjectId: null,
//     currentRule: null,
//     selectedDates: [],
//     availableDates: [],
//     currentChartType: 'runtime',
//     cachedToolData: {},
//     pendingSelectedDates: []
// };

// // 全局图表实例
const charts = {};



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

function showLoading(show) {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) {
        overlay.classList.toggle('hidden', !show);
    }
}

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

function formatDateTime(date) {
    if (!date) date = new Date();
    return date.toLocaleString('zh-CN');
}

function getDateRangeText(dates) {
    if (!dates || dates.length === 0) return '无';
    return `${dates[0]} 至 ${dates[dates.length - 1]}`;
}

function getPaletteColor(index) {
    const palette = ['#6366f1', '#f59e0b', '#10b981', '#ef4444', '#06b6d4', '#8b5cf6', '#ec4899', '#84cc16'];
    return palette[index % palette.length];
}

function updateLastUpdateTime() {
    const now = new Date();
    const timeStr = now.toLocaleString('zh-CN');
    const lastUpdateText = document.getElementById('lastUpdateText');
    if (lastUpdateText) {
        lastUpdateText.innerHTML = `最后更新: ${timeStr}`;
    }
    const statusDot = document.getElementById('statusDot');
    if (statusDot) {
        statusDot.classList.add('updating');
        setTimeout(() => statusDot.classList.remove('updating'), 1000);
    }
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
    if (perfData && perfData.mem) {
        Object.keys(perfData.mem).forEach(date => {
            const comment = perfData.mem[date];
            if (comment && comment !== 'undefined' && comment !== '' && comment !== 'None') {
                if (!mrMap[date]) mrMap[date] = '';
                mrMap[date] += (mrMap[date] ? ' | ' : '') + comment;
            }
        });
    }
    return mrMap;
}

// ==================================================
// 时序曲线图模块
// ==================================================

function getCurrentProjectData() {
    return projectsData[timelineState.currentProjectId];
}

function getCurrentToolData() {
    if (!timelineState.currentRule) return null;
    
    if (timelineState.cachedToolData[timelineState.currentRule] && 
        timelineState.cachedToolData[timelineState.currentRule].projectId === timelineState.currentProjectId) {
        return timelineState.cachedToolData[timelineState.currentRule].data;
    }
    
    const projectData = getCurrentProjectData();
    if (!projectData?.rule_data?.[timelineState.currentRule]) return null;
    
    timelineState.cachedToolData[timelineState.currentRule] = {
        projectId: timelineState.currentProjectId,
        data: projectData.rule_data[timelineState.currentRule]
    };
    
    return projectData.rule_data[timelineState.currentRule];
}

function getFilteredToolData(toolData) {
    if (!toolData?.dates) return null;
    
    const filterSet = new Set(timelineState.selectedDates);
    const filtered = { dates: [], runtimes: [], memories: [], cores: [] };
    
    toolData.dates.forEach((date, index) => {
        if (filterSet.has(date)) {
            filtered.dates.push(date);
            filtered.runtimes.push(toolData.runtimes?.[index] ?? null);
            filtered.memories.push(toolData.memories?.[index] ?? null);
            filtered.cores.push(toolData.cores?.[index] ?? null);
        }
    });
    
    return filtered;
}

function hasMrUpdate(date) {
    const comment = timelineState.mrUpdateDates[date];
    return comment && comment !== 'undefined' && comment !== '' && comment !== 'None';
}

function getMrComment(date) {
    return timelineState.mrUpdateDates[date] || '';
}

function updateStats(containerId, data, unit, label) {
    const validData = data.filter(v => v !== null && v !== undefined && v > 0);
    const container = document.getElementById(containerId);
    if (!container) return;
    
    if (validData.length === 0) {
        container.innerHTML = '<div class="stat-item"><div class="stat-value">-</div><div class="stat-label">暂无数据</div></div>';
        return;
    }
    
    const total = validData.reduce((a, b) => a + b, 0);
    const avg = (total / validData.length).toFixed(1);
    const max = Math.max(...validData);
    const min = Math.min(...validData);
    
    container.innerHTML = `
        <div class="stat-item"><div class="stat-value">${total.toFixed(1)}<span style="font-size:0.875rem;">${unit}</span></div><div class="stat-label">总${label}</div></div>
        <div class="stat-item"><div class="stat-value">${avg}<span style="font-size:0.875rem;">${unit}</span></div><div class="stat-label">平均${label}</div></div>
        <div class="stat-item"><div class="stat-value">${max.toFixed(1)}<span style="font-size:0.875rem;">${unit}</span></div><div class="stat-label">最大${label}</div></div>
        <div class="stat-item"><div class="stat-value">${min.toFixed(1)}<span style="font-size:0.875rem;">${unit}</span></div><div class="stat-label">最小${label}</div></div>
    `;
}

function updateRuleSelect() {
    const projectData = getCurrentProjectData();
    if (!projectData) return;
    
    const rules = projectData.rules || [];
    const searchText = document.getElementById('ruleSearch')?.value.toLowerCase() || '';
    const filteredRules = searchText ? rules.filter(rule => rule.toLowerCase().includes(searchText)) : rules;
    
    const select = document.getElementById('ruleSelect');
    const currentValue = select?.value;
    
    if (select) {
        select.innerHTML = '<option value="">-- 请选择阶段 --</option>';
        filteredRules.forEach(rule => {
            const option = document.createElement('option');
            option.value = rule;
            option.textContent = rule;
            select.appendChild(option);
        });
        
        if (currentValue && filteredRules.includes(currentValue)) {
            select.value = currentValue;
            timelineState.currentRule = currentValue;
        } else if (filteredRules.length > 0 && !timelineState.currentRule) {
            select.value = filteredRules[0];
            timelineState.currentRule = filteredRules[0];
        }
    }
    
    if (timelineState.currentRule) {
        const ruleNameSpan = document.getElementById('currentRuleName');
        if (ruleNameSpan) ruleNameSpan.innerText = timelineState.currentRule;
        updateDateSelectionInfo();
        refreshTimelineCharts();
    }
}

function updateDateSelectionInfo() {
    const projectData = getCurrentProjectData();
    if (!projectData) return;
    
    timelineState.availableDates = projectData.available_dates || projectData.dates || [];
    
    if (timelineState.selectedDates.length === 0) {
        timelineState.selectedDates = timelineState.availableDates.slice(-51);
    }
    
    const dateRangeSpan = document.getElementById('dateRange');
    if (dateRangeSpan) dateRangeSpan.innerText = getDateRangeText(timelineState.selectedDates);
    const dataPointsSpan = document.getElementById('dataPoints');
    if (dataPointsSpan) dataPointsSpan.innerText = timelineState.selectedDates.length;
}

function updateProjectStats() {
    const projectData = getCurrentProjectData();
    if (!projectData) return;
    
    const statsContainer = document.getElementById('projectStats');
    if (!statsContainer) return;
    
    statsContainer.innerHTML = `
        <div class="stat-item"><div class="stat-value">${projectData.rules?.length || 0}</div><div class="stat-label">阶段数</div></div>
        <div class="stat-item"><div class="stat-value">${projectData.dates?.length || 0}</div><div class="stat-label">天数</div></div>
        <div class="stat-item"><div class="stat-value">-</div><div class="stat-label">平均Runtime</div></div>
    `;
}

function updateChartTypeButtons() {
    const buttons = document.querySelectorAll('#chartTypeButtons .chart-type-btn');
    buttons.forEach(btn => {
        const type = btn.dataset.type;
        if (type === timelineState.currentChartType) {
            btn.classList.add('btn-primary');
            btn.classList.remove('btn-secondary');
        } else {
            btn.classList.add('btn-secondary');
            btn.classList.remove('btn-primary');
        }
    });

    const runtimeContainer = document.getElementById('chart-runtime');
    const memoryContainer = document.getElementById('chart-memory');
    if (runtimeContainer && memoryContainer) {
        if (timelineState.currentChartType === 'runtime') {
            runtimeContainer.classList.remove('hidden');
            memoryContainer.classList.add('hidden');
        } else {
            runtimeContainer.classList.add('hidden');
            memoryContainer.classList.remove('hidden');
        }
    }

    const chartCardTitle = document.getElementById('chartCardTitle');
    if (chartCardTitle) {
        chartCardTitle.innerText = timelineState.currentChartType === 'runtime' ? '⏱️ Runtime 性能曲线' : '💾 Memory 使用曲线';
    }
    
    if (timelineState.currentChartType === 'runtime') {
        charts.runtime?.resize();
    } else {
        charts.memory?.resize();
    }
}

function selectChartType(type) {
    if (timelineState.currentChartType === type) return;
    timelineState.currentChartType = type;
    updateChartTypeButtons();
    refreshTimelineCharts();
}

function renderTimelineChart(chartType, dataKey, color, yAxisName, yAxisFormatter = null) {
    const toolData = getCurrentToolData();
    if (!toolData) {
        if (charts[chartType]) charts[chartType].clear();
        return;
    }
    
    const filteredData = getFilteredToolData(toolData);
    if (!filteredData || filteredData.dates.length === 0) {
        if (charts[chartType]) charts[chartType].clear();
        return;
    }
    
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
    const palette = ['#6366f1', '#f59e0b', '#10b981', '#ef4444', '#06b6d4', '#8b5cf6', '#ec4899', '#84cc16'];
    
    const seriesList = [];
    const allValues = [];
    
    threadIds.forEach((threadId, index) => {
        const threadInfo = threadMetrics[threadId];
        let values = threadInfo?.[dataKey] || [];
        
        const mappedValues = [];
        const originalDates = toolData.dates || [];
        
        dates.forEach(selectedDate => {
            const dateIndex = originalDates.indexOf(selectedDate);
            if (dateIndex !== -1 && values[dateIndex] !== undefined) {
                const val = values[dateIndex];
                mappedValues.push(val);
                if (val !== null && val !== undefined && val > 0) allValues.push(val);
            } else {
                mappedValues.push(null);
            }
        });
        
        const seriesData = mappedValues.map((value, idx) => {
            const date = dates[idx];
            const hasMr = hasMrUpdate(date);
            return {
                value: value,
                itemStyle: hasMr ? { color: '#ef4444', borderColor: '#ffffff', borderWidth: 2 } : undefined,
                symbol: 'circle',
                symbolSize: hasMr ? 10 : 6
            };
        });
        
        const seriesColor = palette[index % palette.length];
        const threadLabel = threadId === '0' ? '线程0' : `其他线程${threadId}`;
        
        seriesList.push({
            name: threadLabel,
            type: 'line',
            data: seriesData,
            smooth: false,
            lineStyle: { width: 2, color: seriesColor },
            areaStyle: { opacity: 0.08, color: seriesColor },
            connectNulls: false,
            showSymbol: true
        });
    });
    
    if (chartType === timelineState.currentChartType) {
        const unit = dataKey === 'runtimes' ? '秒' : 'MB';
        const label = dataKey === 'runtimes' ? 'Runtime' : 'Memory';
        updateStats('stats-main', allValues, unit, label);
    }
    
    const avgValue = allValues.length > 0 ? (allValues.reduce((a, b) => a + b, 0) / allValues.length).toFixed(1) : 0;
    
    const legendSelected = {};
    threadIds.forEach(threadId => {
        const seriesName = threadId === '0' ? '线程0' : `其他线程${threadId}`;
        legendSelected[seriesName] = (threadId === '0');
    });
    
    const tooltipFormatter = function(params) {
        if (!params?.length) return '';
        const unit = dataKey === 'runtimes' ? '秒' : 'MB';
        const date = params[0].axisValue;
        const rows = params.map(p => `<div>${p.seriesName}: ${p.value !== null ? p.value.toFixed(2) : 'N/A'} ${unit}</div>`).join('');
        const mrComment = getMrComment(date);
        const hasMr = mrComment !== '';
        const mrStyle = hasMr ? 'color: #ef4444; font-weight: bold;' : 'color: #94a3b8;';
        const mrIcon = hasMr ? '🔴' : '⚪';
        return `<strong>📅 ${date}</strong>${rows}<div style="margin-top: 6px; padding-top: 4px; border-top: 1px solid #334155;"><span style="${mrStyle}">${mrIcon} ${hasMr ? mrComment : '无MR更新'}</span></div>`;
    };
    
    const option = {
        backgroundColor: 'transparent',
        tooltip: { trigger: 'axis', backgroundColor: 'rgba(30, 41, 59, 0.95)', borderColor: color, borderWidth: 1, textStyle: { color: '#f1f5f9', fontSize: 12 }, formatter: tooltipFormatter },
        grid: { left: '8%', right: '8%', top: '18%', bottom: '10%', containLabel: true },
        xAxis: { type: 'category', data: dates, axisLabel: { rotate: dates.length > 10 ? 30 : 0, color: '#94a3b8', fontSize: 11 }, axisLine: { lineStyle: { color: '#475569' } }, boundaryGap: false },
        yAxis: { type: 'value', name: yAxisName, nameTextStyle: { color: '#cbd5e1', fontSize: 12 }, axisLabel: { color: '#94a3b8', fontSize: 11, formatter: yAxisFormatter }, splitLine: { lineStyle: { color: 'rgba(71, 85, 105, 0.3)', type: 'dashed' } } },
        series: [...seriesList, { name: '平均值', type: 'line', data: new Array(dates.length).fill(parseFloat(avgValue)), lineStyle: { width: 1.5, color: '#f59e0b', type: 'dashed' }, symbol: 'none', tooltip: { show: false } }],
        legend: { data: seriesList.map(s => s.name), selected: legendSelected, textStyle: { color: '#cbd5e1', fontSize: 11 }, orient: 'horizontal', right: 10, top: 0, itemWidth: 25, itemHeight: 12 },
        toolbox: { feature: { saveAsImage: { title: '保存为图片' }, zoom: { title: { zoom: '区域缩放', back: '还原' } }, restore: { title: '重置' } }, iconStyle: { borderColor: '#94a3b8' }, right: 10, bottom: 10 }
    };
    
    if (charts[chartType]) {
        charts[chartType].setOption(option, { notMerge: false, lazyUpdate: true });
    }
}

function refreshTimelineCharts() {
    if (!timelineState.currentRule) return;
    renderTimelineChart('runtime', 'runtimes', '#6366f1', 'Runtime (秒)');
    renderTimelineChart('memory', 'memories', '#10b981', 'Memory (MB)', (value) => {
        if (value >= 1024) return (value / 1024).toFixed(1) + ' GB';
        return value + ' MB';
    });
    updateChartTypeButtons();
}

function handleLegendSelectionChanged(params) {
    const newSelectedThreads = [];
    Object.entries(params.selected).forEach(([name, isSelected]) => {
        if (isSelected) {
            if (name === '线程0') {
                newSelectedThreads.push('0');
            } else if (name.startsWith('其他线程')) {
                const threadId = name.replace('其他线程', '');
                newSelectedThreads.push(threadId);
            }
        }
    });
}

function selectAllThreads() {
    const chart = charts[timelineState.currentChartType];
    if (chart) {
        const option = chart.getOption();
        const legendData = option.legend[0].data;
        const newSelected = {};
        legendData.forEach(name => { newSelected[name] = true; });
        chart.setOption({ legend: { selected: newSelected } });
        showNotification('已全选所有线程');
    }
}

function inverseSelectThreads() {
    const chart = charts[timelineState.currentChartType];
    if (chart) {
        const option = chart.getOption();
        const legendSelected = option.legend[0].selected || {};
        const newSelected = {};
        Object.entries(legendSelected).forEach(([name, isSelected]) => {
            newSelected[name] = !isSelected;
        });
        chart.setOption({ legend: { selected: newSelected } });
        showNotification('已反选线程');
    }
}

function addControlButtonsToLegend() {
    const legendContainer = document.querySelector('#chart-runtime .echarts-legend, #chart-memory .echarts-legend');
    if (!legendContainer) return;
    if (document.getElementById('legendControlButtons')) return;
    
    const buttonContainer = document.createElement('div');
    buttonContainer.id = 'legendControlButtons';
    buttonContainer.style.cssText = `display: inline-flex; gap: 6px; margin-left: 12px; vertical-align: middle;`;
    
    const selectAllBtn = document.createElement('button');
    selectAllBtn.textContent = '☑ 全选';
    selectAllBtn.style.cssText = `background: rgba(99, 102, 241, 0.2); border: 1px solid #6366f1; color: #a5b4fc; padding: 2px 8px; border-radius: 12px; font-size: 11px; cursor: pointer; transition: all 0.2s; font-family: inherit;`;
    selectAllBtn.onmouseenter = () => { selectAllBtn.style.background = '#6366f1'; selectAllBtn.style.color = 'white'; };
    selectAllBtn.onmouseleave = () => { selectAllBtn.style.background = 'rgba(99, 102, 241, 0.2)'; selectAllBtn.style.color = '#a5b4fc'; };
    selectAllBtn.onclick = (e) => { e.stopPropagation(); selectAllThreads(); };
    
    const inverseBtn = document.createElement('button');
    inverseBtn.textContent = '🔄 反选';
    inverseBtn.style.cssText = `background: rgba(99, 102, 241, 0.2); border: 1px solid #6366f1; color: #a5b4fc; padding: 2px 8px; border-radius: 12px; font-size: 11px; cursor: pointer; transition: all 0.2s; font-family: inherit;`;
    inverseBtn.onmouseenter = () => { inverseBtn.style.background = '#6366f1'; inverseBtn.style.color = 'white'; };
    inverseBtn.onmouseleave = () => { inverseBtn.style.background = 'rgba(99, 102, 241, 0.2)'; inverseBtn.style.color = '#a5b4fc'; };
    inverseBtn.onclick = (e) => { e.stopPropagation(); inverseSelectThreads(); };
    
    buttonContainer.appendChild(selectAllBtn);
    buttonContainer.appendChild(inverseBtn);
    legendContainer.appendChild(buttonContainer);
}

function observeChartRendering() {
    const runtimeChart = document.getElementById('chart-runtime');
    if (runtimeChart) {
        const observer = new MutationObserver(() => { addControlButtonsToLegend(); });
        observer.observe(runtimeChart, { attributes: true, childList: true, subtree: true });
    }
    const memoryChart = document.getElementById('chart-memory');
    if (memoryChart) {
        const observer = new MutationObserver(() => { addControlButtonsToLegend(); });
        observer.observe(memoryChart, { attributes: true, childList: true, subtree: true });
    }
}

// 日期选择相关
// let pendingSelectedDates = [];

function buildDatePicker(usePending = false) {
    const container = document.getElementById('dateOptionsContainer');
    if (!container) return;
    
    const currentSelection = usePending ? pendingSelectedDates : timelineState.selectedDates;
    const filterText = document.getElementById('dateFilterInput')?.value || '';
    const filteredDates = timelineState.availableDates.filter(date => date.toLowerCase().includes(filterText.toLowerCase()));
    
    container.innerHTML = filteredDates.map(date => `
        <label class="date-option">
            <input type="checkbox" value="${date}" ${currentSelection.includes(date) ? 'checked' : ''}>
            <span>${date}</span>
        </label>
    `).join('');
    
    container.querySelectorAll('input[type="checkbox"]').forEach(cb => {
        cb.addEventListener('change', (e) => {
            const date = e.target.value;
            if (e.target.checked) {
                if (!pendingSelectedDates.includes(date)) pendingSelectedDates.push(date);
            } else {
                pendingSelectedDates = pendingSelectedDates.filter(d => d !== date);
            }
        });
    });
}

function selectAllDates() {
    const container = document.getElementById('dateOptionsContainer');
    if (!container) return;
    const checkboxes = container.querySelectorAll('input[type="checkbox"]');
    pendingSelectedDates = [];
    checkboxes.forEach(cb => { cb.checked = true; pendingSelectedDates.push(cb.value); });
}

function deselectAllDates() {
    const container = document.getElementById('dateOptionsContainer');
    if (!container) return;
    const checkboxes = container.querySelectorAll('input[type="checkbox"]');
    pendingSelectedDates = [];
    checkboxes.forEach(cb => { cb.checked = false; });
}

function inverseSelectDates() {
    const container = document.getElementById('dateOptionsContainer');
    if (!container) return;
    const checkboxes = container.querySelectorAll('input[type="checkbox"]');
    pendingSelectedDates = [];
    checkboxes.forEach(cb => {
        cb.checked = !cb.checked;
        if (cb.checked) pendingSelectedDates.push(cb.value);
    });
}

function openDatePickerModal() {
    pendingSelectedDates = [...timelineState.selectedDates];
    buildDatePicker(true);
    const modal = document.getElementById('datePickerModal');
    if (modal) modal.classList.remove('hidden');
}

function closeDatePickerModal() {
    const modal = document.getElementById('datePickerModal');
    if (modal) modal.classList.add('hidden');
}

function confirmDateSelection() {
    if (pendingSelectedDates.length === 0) {
        pendingSelectedDates = timelineState.availableDates.slice(-51);
    }
    timelineState.selectedDates = [...pendingSelectedDates];
    updateDateSelectionInfo();
    refreshTimelineCharts();
    closeDatePickerModal();
}

function resetDateSelection(useAll = false) {
    timelineState.selectedDates = useAll ? [...timelineState.availableDates] : timelineState.availableDates.slice(-51);
    updateDateSelectionInfo();
    refreshTimelineCharts();
}

// ==================================================
// 多线程模块
// ==================================================

function initMultiCharts() {
    const multiRuntimeDom = document.getElementById('chart-multi-runtime');
    const multiMemoryDom = document.getElementById('chart-multi-memory');
    
    if (multiRuntimeDom) {
        if (charts.multiRuntime) charts.multiRuntime.dispose();
        charts.multiRuntime = echarts.init(multiRuntimeDom);
    }
    if (multiMemoryDom) {
        if (charts.multiMemory) charts.multiMemory.dispose();
        charts.multiMemory = echarts.init(multiMemoryDom);
    }
}

function updateMultiChartTypeButtons() {
    const runtimeBtn = document.getElementById('multiChartRuntimeBtn');
    const memoryBtn = document.getElementById('multiChartMemoryBtn');
    
    if (runtimeBtn) {
        if (multiState.currentChartType === 'runtime') {
            runtimeBtn.classList.add('btn-primary');
            runtimeBtn.classList.remove('btn-secondary');
        } else {
            runtimeBtn.classList.add('btn-secondary');
            runtimeBtn.classList.remove('btn-primary');
        }
    }
    if (memoryBtn) {
        if (multiState.currentChartType === 'memory') {
            memoryBtn.classList.add('btn-primary');
            memoryBtn.classList.remove('btn-secondary');
        } else {
            memoryBtn.classList.add('btn-secondary');
            memoryBtn.classList.remove('btn-primary');
        }
    }
    
    const runtimeContainer = document.getElementById('chart-multi-runtime');
    const memoryContainer = document.getElementById('chart-multi-memory');
    if (runtimeContainer && memoryContainer) {
        if (multiState.currentChartType === 'runtime') {
            runtimeContainer.classList.remove('hidden');
            memoryContainer.classList.add('hidden');
        } else {
            runtimeContainer.classList.add('hidden');
            memoryContainer.classList.remove('hidden');
        }
    }
    
    const multiChartCardTitle = document.getElementById('multiChartCardTitle');
    if (multiChartCardTitle) {
        multiChartCardTitle.innerText = multiState.currentChartType === 'runtime' ? '⏱️ Runtime 性能曲线' : '💾 Memory 使用曲线';
    }
}

function selectMultiChartType(type) {
    if (multiState.currentChartType === type) return;
    multiState.currentChartType = type;
    updateMultiChartTypeButtons();
    if (multiState.currentData && multiState.currentData.length > 0) {
        if (Array.isArray(multiState.currentData) && multiState.currentData[0]?.date) {
            renderMultiThreadComparisonChart();
        } else {
            renderMultiThreadChart();
        }
    }
}

function renderMultiThreadChart() {
    if (!multiState.currentData || multiState.currentData.length === 0) return;
    
    const filteredData = multiState.currentData.filter(d => multiState.selectedThreads.includes(d.threads.toString()));
    const isRuntime = multiState.currentChartType === 'runtime';
    const chart = isRuntime ? charts.multiRuntime : charts.multiMemory;
    
    if (!chart) return;
    
    if (filteredData.length === 0) {
        chart.setOption({
            title: { show: true, text: '请选择至少一个线程', textStyle: { color: '#94a3b8' }, left: 'center', top: 'center' },
            series: []
        }, true);
        return;
    }
    
    const threads = filteredData.map(d => d.threads);
    const chartData = isRuntime ? filteredData.map(d => d.runtime) : filteredData.map(d => d.memory);
    const yAxisName = isRuntime ? 'Runtime (秒)' : 'Memory (MB)';
    const color = isRuntime ? '#6366f1' : '#10b981';
    
    const option = {
        backgroundColor: 'transparent',
        tooltip: { trigger: 'axis', formatter: (params) => {
            if (!params?.length) return '';
            const unit = isRuntime ? '秒' : 'MB';
            let value = params[0].value;
            let displayValue = (value !== null && value !== undefined) ? (isRuntime ? value.toFixed(2) : (value >= 1024 ? (value / 1024).toFixed(2) + ' GB' : value.toFixed(2))) : 'N/A';
            return `${params[0].axisValue} 线程: ${displayValue} ${unit}`;
        } },
        xAxis: { type: 'category', name: '线程数', data: threads, axisLabel: { color: '#94a3b8', fontSize: 11 }, axisLine: { lineStyle: { color: '#475569' } }, axisTick: { show: true } },
        yAxis: { type: 'value', name: yAxisName, nameTextStyle: { color: '#cbd5e1', fontSize: 12 }, axisLabel: { color: '#94a3b8', fontSize: 11, formatter: (value) => { if (isRuntime) return value.toFixed(2); if (value >= 1024) return (value / 1024).toFixed(1) + ' GB'; return value.toFixed(0); } }, splitLine: { lineStyle: { color: 'rgba(71, 85, 105, 0.3)', type: 'dashed' } } },
        series: [{ type: 'line', name: isRuntime ? 'Runtime' : 'Memory', data: chartData, smooth: true, lineStyle: { width: 3, color: color }, symbolSize: 8, symbol: 'circle', areaStyle: { opacity: 0.1, color: color }, connectNulls: false, itemStyle: { color: color } }],
        grid: { top: 50, bottom: 30, left: 65, right: 40, containLabel: true },
        toolbox: { feature: { saveAsImage: { title: '保存为图片' }, zoom: { title: { zoom: '区域缩放', back: '还原' } }, restore: { title: '重置' } }, iconStyle: { borderColor: '#94a3b8' }, right: 10, bottom: 10 }
    };
    
    chart.setOption(option, { notMerge: true });
    setTimeout(() => chart.resize(), 50);
}

function renderMultiThreadComparisonChart() {
    if (!multiState.currentData || multiState.currentData.length === 0) return;
    
    const isRuntime = multiState.currentChartType === 'runtime';
    const chart = isRuntime ? charts.multiRuntime : charts.multiMemory;
    if (!chart) return;
    
    const dates = multiState.currentData.map(d => d.date);
    const selectedThreadIds = multiState.selectedThreads;
    const palette = ['#6366f1', '#f59e0b', '#10b981', '#ef4444', '#06b6d4', '#8b5cf6', '#ec4899', '#84cc16'];
    
    const seriesList = selectedThreadIds.map((threadId, idx) => {
        const values = multiState.currentData.map(dayData => {
            const threadData = dayData.threads_data.find(t => t.threads.toString() === threadId);
            return threadData ? (isRuntime ? threadData.runtime : threadData.memory) : null;
        });
        const threadName = threadId === '0' ? '线程0' : `线程 ${threadId}`;
        return { name: threadName, type: 'line', data: values, smooth: true, lineStyle: { width: 2, color: palette[idx % palette.length] }, symbol: 'circle', symbolSize: 6, connectNulls: true };
    });
    
    const yAxisName = isRuntime ? 'Runtime (秒)' : 'Memory (MB)';
    const option = {
        backgroundColor: 'transparent',
        tooltip: { trigger: 'axis', formatter: (params) => {
            if (!params?.length) return '';
            const date = params[0].axisValue;
            const rows = params.map(p => `<div>${p.seriesName}: ${p.value !== null ? p.value.toFixed(2) : 'N/A'} ${isRuntime ? '秒' : 'MB'}</div>`).join('');
            return `<strong>📅 ${date}</strong>${rows}`;
        } },
        xAxis: { type: 'category', name: '日期', data: dates, axisLabel: { rotate: 30, color: '#94a3b8', fontSize: 11 }, axisLine: { lineStyle: { color: '#475569' } } },
        yAxis: { type: 'value', name: yAxisName, nameTextStyle: { color: '#cbd5e1', fontSize: 12 }, axisLabel: { color: '#94a3b8', fontSize: 11, formatter: (value) => { if (isRuntime) return value.toFixed(2); if (value >= 1024) return (value / 1024).toFixed(1) + ' GB'; return value.toFixed(0); } }, splitLine: { lineStyle: { color: 'rgba(71, 85, 105, 0.3)', type: 'dashed' } } },
        series: seriesList,
        legend: { data: seriesList.map(s => s.name), textStyle: { color: '#cbd5e1', fontSize: 11 }, orient: 'horizontal', right: 10, top: 0, itemWidth: 25, itemHeight: 12 },
        toolbox: { feature: { saveAsImage: { title: '保存为图片' }, zoom: { title: { zoom: '区域缩放', back: '还原' } }, restore: { title: '重置' } }, iconStyle: { borderColor: '#94a3b8' }, right: 10, bottom: 10 }
    };
    
    chart.setOption(option, { notMerge: true });
    setTimeout(() => chart.resize(), 50);
}

function updateMultiStats(threadsData) {
    const runtimes = threadsData.map(d => d.runtime).filter(v => v !== null && v !== undefined);
    const memories = threadsData.map(d => d.memory).filter(v => v !== null && v !== undefined);
    
    const avgRuntime = runtimes.length ? (runtimes.reduce((a, b) => a + b, 0) / runtimes.length).toFixed(1) : '-';
    const avgMemory = memories.length ? (memories.reduce((a, b) => a + b, 0) / memories.length).toFixed(1) : '-';
    const maxRuntime = runtimes.length ? Math.max(...runtimes).toFixed(1) : '-';
    const minRuntime = runtimes.length ? Math.min(...runtimes).toFixed(1) : '-';
    const maxMemory = memories.length ? Math.max(...memories).toFixed(1) : '-';
    const minMemory = memories.length ? Math.min(...memories).toFixed(1) : '-';
    
    const multiStats = document.getElementById('multiStats');
    if (multiStats) {
        multiStats.innerHTML = `<div class="stat-item"><div class="stat-value">${threadsData.length}</div><div class="stat-label">线程数</div></div>
            <div class="stat-item"><div class="stat-value">${avgRuntime}秒</div><div class="stat-label">平均Runtime</div></div>
            <div class="stat-item"><div class="stat-value">${avgMemory}MB</div><div class="stat-label">平均Memory</div></div>`;
    }
    
    const detailContainer = document.getElementById('multiStatsDetail');
    if (detailContainer) {
        detailContainer.innerHTML = `<div class="stat-item"><div class="stat-value">${maxRuntime}秒</div><div class="stat-label">最大Runtime</div></div>
            <div class="stat-item"><div class="stat-value">${minRuntime}秒</div><div class="stat-label">最小Runtime</div></div>
            <div class="stat-item"><div class="stat-value">${maxMemory}MB</div><div class="stat-label">最大Memory</div></div>
            <div class="stat-item"><div class="stat-value">${minMemory}MB</div><div class="stat-label">最小Memory</div></div>`;
    }
}

async function loadMultiThreadData(projectId, ruleName, date) {
    showLoading(true);
    try {
        const response = await fetch('/api/multi_thread_data', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ project_id: projectId, rule_name: ruleName, date: date })
        });
        const result = await response.json();
        
        if (result.success && result.threads_data) {
            multiState.availableThreads = result.threads_data.map(d => d.threads.toString()).sort((a, b) => parseInt(a) - parseInt(b));
            if (multiState.selectedThreads.length === 0) {
                multiState.selectedThreads = [...multiState.availableThreads];
            } else {
                multiState.selectedThreads = multiState.selectedThreads.filter(t => multiState.availableThreads.includes(t));
                if (multiState.selectedThreads.length === 0) multiState.selectedThreads = [...multiState.availableThreads];
            }
            
            if (!charts.multiRuntime || !charts.multiMemory) initMultiCharts();
            multiState.currentData = result.threads_data;
            renderMultiThreadChart();
            updateMultiStats(multiState.currentData);
        }
    } catch (error) {
        console.error('加载多线程数据失败:', error);
        showNotification('加载多线程数据失败', true);
    } finally {
        showLoading(false);
    }
}

async function loadMultiDates(projectId, ruleName) {
    if (!ruleName) return;
    try {
        const response = await fetch(`/api/project/${projectId}`);
        const data = await response.json();
        const ruleData = data?.rule_data?.[ruleName];
        if (ruleData?.dates?.length) {
            multiState.availableDates = ruleData.dates;
            multiState.currentDate = multiState.availableDates[multiState.availableDates.length - 1];
            const multiCurrentDateSpan = document.getElementById('multiCurrentDate');
            if (multiCurrentDateSpan) multiCurrentDateSpan.innerText = multiState.currentDate;
            await loadMultiThreadData(projectId, ruleName, multiState.currentDate);
        }
    } catch (error) { console.error('加载日期失败:', error); }
}

// let multiRuleSearchHandler = debounce(() => {
//     const projectData = projectsData?.[multiState.currentProjectId];
//     if (!projectData) return;
//     const rules = projectData.rules || [];
//     const searchText = document.getElementById('multiRuleSearch')?.value.toLowerCase() || '';
//     const filteredRules = searchText ? rules.filter(rule => rule.toLowerCase().includes(searchText)) : rules;
//     const ruleSelect = document.getElementById('multiRuleSelect');
//     const currentValue = ruleSelect?.value;
//     if (ruleSelect) {
//         ruleSelect.innerHTML = '<option value="">-- 请选择阶段 --</option>';
//         filteredRules.forEach(rule => { const option = document.createElement('option'); option.value = rule; option.textContent = rule; ruleSelect.appendChild(option); });
//         if (currentValue && filteredRules.includes(currentValue)) {
//             ruleSelect.value = currentValue;
//             multiState.currentRule = currentValue;
//             loadMultiDates(multiState.currentProjectId, currentValue);
//         } else if (filteredRules.length > 0 && !multiState.currentRule) {
//             ruleSelect.value = filteredRules[0];
//             multiState.currentRule = filteredRules[0];
//             loadMultiDates(multiState.currentProjectId, multiState.currentRule);
//         }
//     }
// }, 300);

async function loadMultiRules(projectId) {
    try {
        const response = await fetch(`/api/project/${projectId}`);
        const data = await response.json();
        const ruleSelect = document.getElementById('multiRuleSelect');
        if (ruleSelect && data?.rules?.length) {
            ruleSelect.innerHTML = '<option value="">-- 请选择阶段 --</option>' + data.rules.map(rule => `<option value="${rule}">${rule}</option>`).join('');
            if (data.rules.length > 0 && !multiState.currentRule) {
                const firstRule = data.rules[0];
                ruleSelect.value = firstRule;
                multiState.currentRule = firstRule;
                await loadMultiDates(projectId, firstRule);
            }
        }
        const searchInput = document.getElementById('multiRuleSearch');
        if (searchInput) {
            searchInput.removeEventListener('input', multiRuleSearchHandler);
            searchInput.addEventListener('input', multiRuleSearchHandler);
        }
    } catch (error) { console.error('加载规则失败:', error); }
}

// 线程选择相关
function buildThreadSelectorModal() {
    const container = document.getElementById('threadSelectorModalContent');
    if (!container) return;
    const filterText = document.getElementById('threadFilterInput')?.value || '';
    const filteredThreads = multiState.availableThreads.filter(thread => thread.toLowerCase().includes(filterText.toLowerCase()));
    container.innerHTML = filteredThreads.map(threadId => {
        const isChecked = multiState.selectedThreads.includes(threadId);
        const displayName = threadId === '0' ? '线程0' : `线程 ${threadId}`;
        return `<label class="thread-checkbox ${isChecked ? 'selected' : ''}" data-thread="${threadId}">
            <input type="checkbox" value="${threadId}" ${isChecked ? 'checked' : ''}><span>${displayName}</span>
        </label>`;
    }).join('');
    
    container.querySelectorAll('.thread-checkbox input').forEach(cb => {
        cb.addEventListener('change', (e) => { const label = e.target.closest('.thread-checkbox'); if (label) label.classList.toggle('selected', e.target.checked); });
    });
    container.querySelectorAll('.thread-checkbox').forEach(label => {
        label.addEventListener('click', (e) => {
            if (e.target.tagName !== 'INPUT') {
                const checkbox = label.querySelector('input');
                if (checkbox) { checkbox.checked = !checkbox.checked; label.classList.toggle('selected', checkbox.checked); }
            }
        });
    });
}

function updateSelectedThreadsFromModal() {
    const modalContent = document.getElementById('threadSelectorModalContent');
    if (!modalContent) return;
    multiState.selectedThreads = [];
    modalContent.querySelectorAll('.thread-checkbox input:checked').forEach(cb => { multiState.selectedThreads.push(cb.value); });
}

function selectAllThreadsInModal() {
    const modalContent = document.getElementById('threadSelectorModalContent');
    if (!modalContent) return;
    const checkboxes = modalContent.querySelectorAll('.thread-checkbox input');
    checkboxes.forEach(cb => { cb.checked = true; const label = cb.closest('.thread-checkbox'); if (label) label.classList.add('selected'); });
    updateSelectedThreadsFromModal();
}

function deselectAllThreadsInModal() {
    const modalContent = document.getElementById('threadSelectorModalContent');
    if (!modalContent) return;
    const checkboxes = modalContent.querySelectorAll('.thread-checkbox input');
    checkboxes.forEach(cb => { cb.checked = false; const label = cb.closest('.thread-checkbox'); if (label) label.classList.remove('selected'); });
    updateSelectedThreadsFromModal();
}

function inverseSelectThreadsInModal() {
    const modalContent = document.getElementById('threadSelectorModalContent');
    if (!modalContent) return;
    const checkboxes = modalContent.querySelectorAll('.thread-checkbox input');
    checkboxes.forEach(cb => { cb.checked = !cb.checked; const label = cb.closest('.thread-checkbox'); if (label) label.classList.toggle('selected', cb.checked); });
    updateSelectedThreadsFromModal();
}

function openThreadSelectorModal() {
    if (!multiState.availableThreads || multiState.availableThreads.length === 0) { showNotification('暂无线程数据', true); return; }
    buildThreadSelectorModal();
    const modal = document.getElementById('threadSelectorModal');
    if (modal) modal.classList.remove('hidden');
}

function closeThreadSelectorModal() { const modal = document.getElementById('threadSelectorModal'); if (modal) modal.classList.add('hidden'); }
function confirmThreadSelection() {
    updateSelectedThreadsFromModal();
    if (multiState.selectedThreads.length === 0) { multiState.selectedThreads = [...multiState.availableThreads]; showNotification('未选择任何线程，已自动全选'); }
    renderMultiThreadChart();
    closeThreadSelectorModal();
}

// 多线程日期选择
function openMultiDatePickerModal() {
    if (!multiState.availableDates || multiState.availableDates.length === 0) { showNotification('暂无可选日期', true); return; }
    multiState.pendingSelectedDates = [multiState.currentDate];
    buildMultiDatePicker(true);
    const modal = document.getElementById('multiDatePickerModal');
    if (modal) modal.classList.remove('hidden');
}

function closeMultiDatePickerModal() { const modal = document.getElementById('multiDatePickerModal'); if (modal) modal.classList.add('hidden'); }

function buildMultiDatePicker(usePending = false) {
    const container = document.getElementById('multiDateOptionsContainer');
    if (!container) return;
    const currentSelection = usePending ? multiState.pendingSelectedDates : [multiState.currentDate];
    const filterText = document.getElementById('multiDateFilterInput')?.value || '';
    const filteredDates = multiState.availableDates.filter(date => date.toLowerCase().includes(filterText.toLowerCase()));
    const isSingleMode = document.querySelector('input[name="multiSelectMode"]:checked')?.value === 'single';
    
    container.innerHTML = filteredDates.map(date => `<label class="date-option"><input type="${isSingleMode ? 'radio' : 'checkbox'}" name="multiDate" value="${date}" ${currentSelection.includes(date) ? 'checked' : ''}><span>${date}</span></label>`).join('');
    
    const selectModeRadios = document.querySelectorAll('input[name="multiSelectMode"]');
    selectModeRadios.forEach(radio => radio.addEventListener('change', () => buildMultiDatePicker(usePending)));
    
    container.querySelectorAll('input[type="checkbox"], input[type="radio"]').forEach(cb => {
        cb.addEventListener('change', (e) => {
            if (isSingleMode) { multiState.pendingSelectedDates = [e.target.value]; }
            else {
                if (e.target.checked) { if (!multiState.pendingSelectedDates.includes(e.target.value)) multiState.pendingSelectedDates.push(e.target.value); }
                else { multiState.pendingSelectedDates = multiState.pendingSelectedDates.filter(d => d !== e.target.value); }
            }
        });
    });
}

async function confirmMultiDateSelection() {
    if (multiState.pendingSelectedDates.length === 0) { showNotification('请选择一个日期', true); return; }
    const isMultiMode = document.querySelector('input[name="multiSelectMode"]:checked')?.value === 'all';
    if (isMultiMode) {
        const dates = multiState.pendingSelectedDates.sort();
        await loadMultiThreadDataForMultipleDates(multiState.currentProjectId, multiState.currentRule, dates);
    } else {
        const newDate = multiState.pendingSelectedDates[0];
        if (newDate !== multiState.currentDate) {
            multiState.currentDate = newDate;
            const multiCurrentDateSpan = document.getElementById('multiCurrentDate');
            if (multiCurrentDateSpan) multiCurrentDateSpan.innerText = multiState.currentDate;
            await loadMultiThreadData(multiState.currentProjectId, multiState.currentRule, multiState.currentDate);
        }
    }
    closeMultiDatePickerModal();
}

async function loadMultiThreadDataForMultipleDates(projectId, ruleName, dates) {
    showLoading(true);
    try {
        const promises = dates.map(date => fetch('/api/multi_thread_data', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ project_id: projectId, rule_name: ruleName, date: date })
        }).then(res => res.json()));
        const results = await Promise.all(promises);
        const validResults = results.filter(r => r.success && r.threads_data);
        if (validResults.length === 0) { showNotification('没有有效的多线程数据', true); return; }
        const allThreads = new Set();
        validResults.forEach(r => { r.threads_data.forEach(d => allThreads.add(d.threads.toString())); });
        multiState.availableThreads = Array.from(allThreads).sort((a, b) => parseInt(a) - parseInt(b));
        if (multiState.selectedThreads.length === 0) multiState.selectedThreads = [...multiState.availableThreads];
        multiState.currentData = validResults;
        renderMultiThreadComparisonChart();
    } catch (error) { console.error('加载多线程数据失败:', error); showNotification('加载多线程数据失败', true); }
    finally { showLoading(false); }
}

async function selectLatestMultiDate() {
    if (multiState.availableDates.length > 0) {
        const latestDate = multiState.availableDates[multiState.availableDates.length - 1];
        if (latestDate !== multiState.currentDate) {
            multiState.currentDate = latestDate;
            const multiCurrentDateSpan = document.getElementById('multiCurrentDate');
            if (multiCurrentDateSpan) multiCurrentDateSpan.innerText = multiState.currentDate;
            await loadMultiThreadData(multiState.currentProjectId, multiState.currentRule, multiState.currentDate);
        }
    }
}

// ==================================================
// 对比模块
// ==================================================

async function loadCompareConfig(projectId) {
    if (!projectId) return {};
    try {
        const response = await fetch(`/api/compare_config?project_id=${encodeURIComponent(projectId)}`);
        const result = await response.json();
        if (result.success && result.config) return result.config;
    } catch (error) { console.error('加载对比配置失败:', error); }
    return {};
}

function applyCompareConfigToForm(config) {
    if (!config || Object.keys(config).length === 0) return false;
    let applied = false;
    if (config.tolerance_runtime !== undefined && !isNaN(config.tolerance_runtime)) {
        const runtimeInput = document.getElementById('toleranceRuntime');
        if (runtimeInput) { runtimeInput.value = config.tolerance_runtime; applied = true; }
    }
    if (config.tolerance_memory !== undefined && !isNaN(config.tolerance_memory)) {
        const memoryInput = document.getElementById('toleranceMemory');
        if (memoryInput) { memoryInput.value = config.tolerance_memory; applied = true; }
    }
    return applied;
}

async function saveCompareConfig(projectId, config) {
    if (!projectId) return false;
    try {
        const response = await fetch('/api/compare_config', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ project_id: projectId, config: { tolerance_runtime: config.tolerance_runtime, tolerance_memory: config.tolerance_memory } })
        });
        const result = await response.json();
        return result.success;
    } catch (error) { console.error('保存对比配置失败:', error); return false; }
}

async function loadCompareDates(projectId) {
    if (!projectId) { updateCompareControlsState(false); return; }
    try {
        const response = await fetch('/api/get_dates', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ project_id: projectId }) });
        const data = await response.json();
        if (data.success && data.dates?.length) {
            const date1Select = document.getElementById('compareDate1');
            const date2Select = document.getElementById('compareDate2');
            const currentDate1 = date1Select?.value;
            const currentDate2 = date2Select?.value;
            compareState.availableDates = data.dates;
            if (date1Select) {
                date1Select.innerHTML = '<option value="">请选择日期</option>';
                data.dates.forEach(date => date1Select.appendChild(new Option(date, date)));
                if (currentDate1 && data.dates.includes(currentDate1)) date1Select.value = currentDate1;
                else if (data.dates.length > 0) date1Select.value = data.dates[0];
            }
            if (date2Select) {
                date2Select.innerHTML = '<option value="">请选择日期</option>';
                data.dates.forEach(date => date2Select.appendChild(new Option(date, date)));
                if (currentDate2 && data.dates.includes(currentDate2)) date2Select.value = currentDate2;
                else if (data.dates.length > 1) date2Select.value = data.dates[1];
                else if (data.dates.length > 0) date2Select.value = data.dates[0];
            }
            updateCompareControlsState(true);
        } else { updateCompareControlsState(false); }
    } catch (error) { console.error('加载日期失败:', error); updateCompareControlsState(false); }
}

async function loadCompareRules(projectId) {
    if (!projectId) { updateCompareControlsState(false); return; }
    try {
        const response = await fetch(`/api/project/${projectId}`);
        const data = await response.json();
        const ruleSelect = document.getElementById('compareRuleSelect');
        const currentValue = ruleSelect?.value;
        if (ruleSelect && data?.rules?.length) {
            ruleSelect.innerHTML = '<option value="all">📊 所有阶段</option>' + data.rules.map(rule => `<option value="${rule}">${rule}</option>`).join('');
            if (currentValue && (currentValue === 'all' || data.rules.includes(currentValue))) ruleSelect.value = currentValue;
            else if (data.rules.length > 0) ruleSelect.value = 'all';
        }
        updateCompareControlsState(true);
    } catch (error) { console.error('加载规则失败:', error); updateCompareControlsState(false); }
}

async function onCompareProjectChange(projectId) {
    if (!projectId) { updateCompareControlsState(false); return; }
    await loadCompareDates(projectId);
    await loadCompareRules(projectId);
    const config = await loadCompareConfig(projectId);
    applyCompareConfigToForm(config);
}

function updateCompareControlsState(hasCase) {
    const controls = ['compareModeSelect', 'compareRuleSelect', 'compareDate1', 'compareDate2', 'toleranceMode', 'compareDimensionSelect', 'toleranceRuntime', 'toleranceMemory', 'executeCompareBtn', 'exportCompareBtn'];
    controls.forEach(controlId => { const element = document.getElementById(controlId); if (element) element.disabled = !hasCase; });
    const modeSelect = document.getElementById('compareModeSelect');
    if (modeSelect) modeSelect.disabled = !hasCase;
    const warningDiv = document.getElementById('compareNoCaseWarning');
    const resultArea = document.getElementById('compareResultArea');
    if (warningDiv) warningDiv.style.display = hasCase ? 'none' : 'flex';
    if (resultArea) resultArea.style.display = 'none';
    compareState.currentResult = null;
    compareState.currentFilteredData = [];
    const compareSummary = document.getElementById('compareSummary');
    if (compareSummary) compareSummary.innerHTML = '';
    const tableBody = document.getElementById('compareTableBody');
    if (tableBody) tableBody.innerHTML = '';
}

function getCurrentCompareConfig() {
    return {
        tolerance_runtime: parseFloat(document.getElementById('toleranceRuntime').value) || 0,
        tolerance_memory: parseFloat(document.getElementById('toleranceMemory').value) || 0,
        tolerance_mode: document.getElementById('toleranceMode').value,
        compare_dimension: document.getElementById('compareDimensionSelect').value,
        date1: document.getElementById('compareDate1').value,
        date2: document.getElementById('compareDate2').value
    };
}

async function executeCompare() {
    const projectId = document.getElementById('compareCaseSelect')?.value;
    if (!projectId) { showNotification('请先选择一个项目', true); return; }
    const compareMode = document.getElementById('compareModeSelect')?.value;
    let ruleName = document.getElementById('compareRuleSelect')?.value;
    const date1 = document.getElementById('compareDate1')?.value;
    const date2 = document.getElementById('compareDate2')?.value;
    if (compareMode === 'all') ruleName = 'all';
    if (!date1 || !date2) { showNotification('请选择两个日期进行对比', true); return; }
    if (date1 === date2) { showNotification('请选择两个不同的日期', true); return; }
    const config = getCurrentCompareConfig();
    showLoading(true);
    try {
        const response = await fetch('/api/compare', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ project_id: projectId, rule_name: ruleName, date1, date2, tolerance_runtime: config.tolerance_runtime, tolerance_memory: config.tolerance_memory, tolerance_mode: config.tolerance_mode, compare_dimension: config.compare_dimension, save_config: true })
        });
        const result = await response.json();
        if (result.success && result.result) {
            compareState.currentResult = result.result;
            displayCompareResult(result.result);
            const compareResultArea = document.getElementById('compareResultArea');
            if (compareResultArea) compareResultArea.style.display = 'block';
            setTimeout(() => initStatsTooltips(), 100);
            await saveCompareConfig(projectId, { tolerance_runtime: config.tolerance_runtime, tolerance_memory: config.tolerance_memory });
            showNotification('对比完成，配置已保存');
        } else { showNotification('对比失败: ' + (result.error || '未知错误'), true); }
    } catch (error) { console.error('对比失败:', error); showNotification('对比失败: ' + error.message, true); }
    finally { showLoading(false); }
}

function buildSortedList(rulesComparison, type, isIncrease) {
    if (!rulesComparison?.length) return [];
    return rulesComparison.filter(r => r.has_data && r[`${type}_change_pct`] !== null && r[`${type}_change_pct`] !== undefined)
        .filter(r => isIncrease ? r[`${type}_change_pct`] > 0 : r[`${type}_change_pct`] < 0)
        .map(r => ({ name: r.rule_name, change_pct: isIncrease ? r[`${type}_change_pct`] : Math.abs(r[`${type}_change_pct`]) }))
        .sort((a, b) => b.change_pct - a.change_pct);
}

function displayCompareResult(result) {
    const isAllRules = result.mode === 'all_rules';
    const compareResultTitle = document.getElementById('compareResultTitle');
    if (compareResultTitle) compareResultTitle.innerHTML = isAllRules ? '📈 全阶段对比结果' : `📈 单阶段对比结果 - ${result.rule_name}`;
    const summary = result.summary;
    const compareDimension = result.compare_dimension || 'both';
    const compareRuntime = compareDimension === 'runtime' || compareDimension === 'both';
    const compareMemory = compareDimension === 'memory' || compareDimension === 'both';
    const runtimeStatsContainer = document.getElementById('compareRuntimeStats');
    const memoryStatsContainer = document.getElementById('compareMemoryStats');
    const runtimeStatsRow = document.getElementById('compareRuntimeStatsRow');
    const memoryStatsRow = document.getElementById('compareMemoryStatsRow');
    
    if (isAllRules) {
        const rulesComparison = result.rules_comparison || [];
        compareState.currentFilteredData = rulesComparison;
        
        if (compareRuntime && runtimeStatsContainer) {
            if (runtimeStatsRow) runtimeStatsRow.style.display = 'block';
            const runtimeSummary = summary.runtime || {};
            runtimeStatsContainer.innerHTML = `<div class="stat-item"><div class="stat-value status-increase">${runtimeSummary.total_increase || 0}</div><div class="stat-label">Runtime增加阶段</div></div>
                <div class="stat-item"><div class="stat-value status-decrease">${runtimeSummary.total_decrease || 0}</div><div class="stat-label">Runtime减少阶段</div></div>
                <div class="stat-item"><div class="stat-value">${runtimeSummary.avg_change_pct || 0}%</div><div class="stat-label">Runtime平均变化率</div></div>
                <div class="stat-item"><div class="stat-value">${runtimeSummary.max_increase_pct ? runtimeSummary.max_increase_pct.toFixed(2) + '%' : '0%'}</div><div class="stat-label">Runtime最大增加</div></div>
                <div class="stat-item"><div class="stat-value">${runtimeSummary.max_decrease_pct ? Math.abs(runtimeSummary.max_decrease_pct).toFixed(2) + '%' : '0%'}</div><div class="stat-label">Runtime最大减少</div></div>`;
            
            const increaseCard = runtimeStatsContainer.children[0];
            const decreaseCard = runtimeStatsContainer.children[1];
            if (increaseCard && runtimeSummary.increase_list?.length) {
                increaseCard.setAttribute('data-tooltip-html', buildStatsTooltipHtml(runtimeSummary.increase_list, 'Runtime', '增加'));
                increaseCard.style.cursor = 'help';
            }
            if (decreaseCard && runtimeSummary.decrease_list?.length) {
                decreaseCard.setAttribute('data-tooltip-html', buildStatsTooltipHtml(runtimeSummary.decrease_list, 'Runtime', '减少'));
                decreaseCard.style.cursor = 'help';
            }
        } else if (runtimeStatsRow) { runtimeStatsRow.style.display = 'none'; }
        
        if (compareMemory && memoryStatsContainer) {
            if (memoryStatsRow) memoryStatsRow.style.display = 'block';
            const memorySummary = summary.memory || {};
            memoryStatsContainer.innerHTML = `<div class="stat-item"><div class="stat-value status-increase">${memorySummary.total_increase || 0}</div><div class="stat-label">Memory增加阶段</div></div>
                <div class="stat-item"><div class="stat-value status-decrease">${memorySummary.total_decrease || 0}</div><div class="stat-label">Memory减少阶段</div></div>
                <div class="stat-item"><div class="stat-value">${memorySummary.avg_change_pct || 0}%</div><div class="stat-label">Memory平均变化率</div></div>
                <div class="stat-item"><div class="stat-value">${memorySummary.max_increase_pct ? memorySummary.max_increase_pct.toFixed(2) + '%' : '0%'}</div><div class="stat-label">Memory最大增加</div></div>
                <div class="stat-item"><div class="stat-value">${memorySummary.max_decrease_pct ? Math.abs(memorySummary.max_decrease_pct).toFixed(2) + '%' : '0%'}</div><div class="stat-label">Memory最大减少</div></div>`;
            
            const increaseCard = memoryStatsContainer.children[0];
            const decreaseCard = memoryStatsContainer.children[1];
            if (increaseCard && memorySummary.increase_list?.length) {
                increaseCard.setAttribute('data-tooltip-html', buildStatsTooltipHtml(memorySummary.increase_list, 'Memory', '增加'));
                increaseCard.style.cursor = 'help';
            }
            if (decreaseCard && memorySummary.decrease_list?.length) {
                decreaseCard.setAttribute('data-tooltip-html', buildStatsTooltipHtml(memorySummary.decrease_list, 'Memory', '减少'));
                decreaseCard.style.cursor = 'help';
            }
        } else if (memoryStatsRow) { memoryStatsRow.style.display = 'none'; }
        
        const compareTableHeader = document.getElementById('compareTableHeader');
        if (compareTableHeader) {
            let headerHtml = '<td><th>阶段名称</th>';
            if (compareRuntime) headerHtml += '<th>Runtime(基准)</th><th>Runtime(对比)</th><th>Runtime差值</th><th>Runtime变化率(%)</th>';
            if (compareMemory) headerHtml += '<th>Memory(基准)</th><th>Memory(对比)</th><th>Memory差值</th><th>Memory变化率(%)</th>';
            headerHtml += '<th>状态</th></tr>';
            compareTableHeader.innerHTML = headerHtml;
        }
        addTableFilter();
        applyTableFilter();
    } else {
        const comparisons = result.comparisons || [];
        if (compareRuntime && runtimeStatsContainer) {
            if (runtimeStatsRow) runtimeStatsRow.style.display = 'block';
            runtimeStatsContainer.innerHTML = `<div class="stat-item"><div class="stat-value status-increase">${summary.runtime_increased || 0}</div><div class="stat-label">Runtime增加</div></div>
                <div class="stat-item"><div class="stat-value status-decrease">${summary.runtime_decreased || 0}</div><div class="stat-label">Runtime减少</div></div>
                <div class="stat-item"><div class="stat-value">${summary.runtime_unchanged || 0}</div><div class="stat-label">Runtime不变</div></div>
                <div class="stat-item"><div class="stat-value">${summary.runtime_max_change || 0}%</div><div class="stat-label">Runtime最大变化</div></div>
                <div class="stat-item"><div class="stat-value">${summary.runtime_avg_change || 0}%</div><div class="stat-label">Runtime平均变化</div></div>`;
            
            const increaseCard = runtimeStatsContainer.children[0];
            const decreaseCard = runtimeStatsContainer.children[1];
            if (increaseCard && summary.runtime_increase_list?.length) {
                increaseCard.setAttribute('data-tooltip-html', buildSingleStatsTooltipHtml(summary.runtime_increase_list, 'Runtime', '增加'));
                increaseCard.style.cursor = 'help';
            }
            if (decreaseCard && summary.runtime_decrease_list?.length) {
                decreaseCard.setAttribute('data-tooltip-html', buildSingleStatsTooltipHtml(summary.runtime_decrease_list, 'Runtime', '减少'));
                decreaseCard.style.cursor = 'help';
            }
        } else if (runtimeStatsRow) { runtimeStatsRow.style.display = 'none'; }
        
        if (compareMemory && memoryStatsContainer) {
            if (memoryStatsRow) memoryStatsRow.style.display = 'block';
            memoryStatsContainer.innerHTML = `<div class="stat-item"><div class="stat-value status-increase">${summary.memory_increased || 0}</div><div class="stat-label">Memory增加</div></div>
                <div class="stat-item"><div class="stat-value status-decrease">${summary.memory_decreased || 0}</div><div class="stat-label">Memory减少</div></div>
                <div class="stat-item"><div class="stat-value">${summary.memory_unchanged || 0}</div><div class="stat-label">Memory不变</div></div>
                <div class="stat-item"><div class="stat-value">${summary.memory_max_change || 0}%</div><div class="stat-label">Memory最大变化</div></div>
                <div class="stat-item"><div class="stat-value">${summary.memory_avg_change || 0}%</div><div class="stat-label">Memory平均变化</div></div>`;
            
            const increaseCard = memoryStatsContainer.children[0];
            const decreaseCard = memoryStatsContainer.children[1];
            if (increaseCard && summary.memory_increase_list?.length) {
                increaseCard.setAttribute('data-tooltip-html', buildSingleStatsTooltipHtml(summary.memory_increase_list, 'Memory', '增加'));
                increaseCard.style.cursor = 'help';
            }
            if (decreaseCard && summary.memory_decrease_list?.length) {
                decreaseCard.setAttribute('data-tooltip-html', buildSingleStatsTooltipHtml(summary.memory_decrease_list, 'Memory', '减少'));
                decreaseCard.style.cursor = 'help';
            }
        } else if (memoryStatsRow) { memoryStatsRow.style.display = 'none'; }
        
        const compareTableHeader = document.getElementById('compareTableHeader');
        if (compareTableHeader) {
            let headerHtml = '<tr><th>序号</th><th>日期</th>';
            if (compareRuntime) headerHtml += '<th>Runtime(基准)</th><th>Runtime(对比)</th><th>Runtime差值</th><th>Runtime变化率(%)</th><th>Runtime状态</th>';
            if (compareMemory) headerHtml += '<th>Memory(基准)</th><th>Memory(对比)</th><th>Memory差值</th><th>Memory变化率(%)</th><th>Memory状态</th>';
            headerHtml += '</tr>';
            compareTableHeader.innerHTML = headerHtml;
        }
        
        const tableBody = document.getElementById('compareTableBody');
        if (tableBody) {
            tableBody.innerHTML = comparisons.map(comp => {
                let rowHtml = `<tr><td>${comp.index + 1}</td><td>${comp.date}</td>`;
                if (compareRuntime) {
                    const runtimeStatusClass = comp.runtime_status === 'increase' ? 'status-increase' : (comp.runtime_status === 'decrease' ? 'status-decrease' : '');
                    rowHtml += `<td>${comp.runtime1 !== null ? comp.runtime1.toFixed(2) : 'N/A'}</td><td>${comp.runtime2 !== null ? comp.runtime2.toFixed(2) : 'N/A'}</td>
                        <td>${comp.runtime_diff !== null ? comp.runtime_diff.toFixed(2) : 'N/A'}</td><td class="${runtimeStatusClass}">${comp.runtime_change_pct !== null ? comp.runtime_change_pct.toFixed(2) + '%' : 'N/A'}</td>
                        <td>${comp.runtime_status || 'N/A'}</td>`;
                }
                if (compareMemory) {
                    const memoryStatusClass = comp.memory_status === 'increase' ? 'status-increase' : (comp.memory_status === 'decrease' ? 'status-decrease' : '');
                    rowHtml += `<td>${comp.memory1 !== null ? comp.memory1.toFixed(2) : 'N/A'}</td><td>${comp.memory2 !== null ? comp.memory2.toFixed(2) : 'N/A'}</td>
                        <td>${comp.memory_diff !== null ? comp.memory_diff.toFixed(2) : 'N/A'}</td><td class="${memoryStatusClass}">${comp.memory_change_pct !== null ? comp.memory_change_pct.toFixed(2) + '%' : 'N/A'}</td>
                        <td>${comp.memory_status || 'N/A'}</td>`;
                }
                rowHtml += '</tr>';
                return rowHtml;
            }).join('');
        }
    }
    setTimeout(() => initStatsTooltips(), 50);
}


function addTableFilter() {
    const compareResultArea = document.getElementById('compareResultArea');
    if (!compareResultArea) return;
    if (document.getElementById('tableFilterInput')) return;
    const tableContainer = compareResultArea.querySelector('.table-container');
    if (!tableContainer) return;
    const filterBar = document.createElement('div');
    filterBar.className = 'table-filter-bar';
    filterBar.style.cssText = `display: flex; align-items: center; gap: 1rem; margin-bottom: 1rem; padding: 0.75rem 1rem; background: rgba(15, 23, 42, 0.6); border-radius: var(--radius-lg); flex-wrap: wrap;`;
    filterBar.innerHTML = `<div><span>🔍</span><input type="text" id="tableFilterInput" placeholder="筛选阶段名称..." style="width: 250px; padding: 0.5rem 0.75rem; background: rgba(0,0,0,0.3); border: 1px solid var(--border); border-radius: var(--radius-md); color: var(--text-primary);"></div>
        <div><span>📊 显示:</span><select id="filterStatusSelect" style="padding: 0.5rem 0.75rem; background: rgba(0,0,0,0.3); border: 1px solid var(--border); border-radius: var(--radius-md); color: var(--text-primary);"><option value="all">全部阶段</option><option value="increase">仅显示增加</option><option value="decrease">仅显示减少</option><option value="no_data">仅显示无数据</option></select></div>
        <div><span>📈 排序:</span><select id="filterSortSelect" style="padding: 0.5rem 0.75rem; background: rgba(0,0,0,0.3); border: 1px solid var(--border); border-radius: var(--radius-md); color: var(--text-primary);"><option value="none">无排序</option><option value="runtime_inc">Runtime 增加最多</option><option value="runtime_dec">Runtime 减少最多</option><option value="memory_inc">Memory 增加最多</option><option value="memory_dec">Memory 减少最多</option></select></div>
        <button id="clearTableFilterBtn" class="btn btn-secondary" style="padding: 0.5rem 1rem;">清除筛选</button>
        <span id="filterResultCount" style="color: var(--text-muted); font-size: 0.75rem;">共 0 条</span>`;
    tableContainer.parentNode.insertBefore(filterBar, tableContainer);
    const filterInput = document.getElementById('tableFilterInput');
    const statusSelect = document.getElementById('filterStatusSelect');
    const sortSelect = document.getElementById('filterSortSelect');
    const clearBtn = document.getElementById('clearTableFilterBtn');
    if (filterInput) filterInput.addEventListener('input', debounce(() => { compareState.currentFilterText = filterInput.value; applyTableFilter(); }, 300));
    if (statusSelect) statusSelect.addEventListener('change', () => applyTableFilter());
    if (sortSelect) sortSelect.addEventListener('change', () => applyTableFilter());
    if (clearBtn) clearBtn.addEventListener('click', () => { if (filterInput) filterInput.value = ''; if (statusSelect) statusSelect.value = 'all'; if (sortSelect) sortSelect.value = 'none'; compareState.currentFilterText = ''; applyTableFilter(); });
}

function applyTableFilter() {
    if (!compareState.currentFilteredData.length) return;
    const filterText = compareState.currentFilterText.toLowerCase();
    const statusFilter = document.getElementById('filterStatusSelect')?.value || 'all';
    const sortBy = document.getElementById('filterSortSelect')?.value || 'none';
    const compareDimension = document.getElementById('compareDimensionSelect')?.value || 'both';
    const compareRuntime = compareDimension === 'runtime' || compareDimension === 'both';
    const compareMemory = compareDimension === 'memory' || compareDimension === 'both';
    let filtered = [...compareState.currentFilteredData];
    if (filterText) filtered = filtered.filter(rule => rule.rule_name && rule.rule_name.toLowerCase().includes(filterText));
    if (statusFilter !== 'all') {
        filtered = filtered.filter(rule => {
            if (statusFilter === 'increase') return rule.runtime_change_pct > 0;
            if (statusFilter === 'decrease') return rule.runtime_change_pct < 0;
            if (statusFilter === 'no_data') return !rule.has_data;
            return true;
        });
    }
    if (sortBy !== 'none') {
        filtered.sort((a, b) => {
            switch (sortBy) {
                case 'runtime_inc': return (b.runtime_change_pct || -Infinity) - (a.runtime_change_pct || -Infinity);
                case 'runtime_dec': return (a.runtime_change_pct || Infinity) - (b.runtime_change_pct || Infinity);
                case 'memory_inc': return (b.memory_change_pct || -Infinity) - (a.memory_change_pct || -Infinity);
                case 'memory_dec': return (a.memory_change_pct || Infinity) - (b.memory_change_pct || Infinity);
                default: return 0;
            }
        });
    }
    renderFilteredTable(filtered, compareRuntime, compareMemory);
    const countSpan = document.getElementById('filterResultCount');
    if (countSpan) countSpan.textContent = `共 ${filtered.length} 条`;
}

function renderFilteredTable(filteredData, compareRuntime, compareMemory) {
    const tbody = document.getElementById('compareTableBody');
    if (!tbody) return;
    tbody.innerHTML = filteredData.map(rule => {
        const statusText = () => {
            if (!rule.has_data) return '无数据';
            if (compareRuntime && compareMemory) {
                if (rule.runtime_status === 'increase' || rule.memory_status === 'increase') return '⬆️ 增加';
                if (rule.runtime_status === 'decrease' || rule.memory_status === 'decrease') return '⬇️ 减少';
                return '➖ 不变';
            } else if (compareRuntime) {
                if (rule.runtime_status === 'increase') return '⬆️ 增加';
                if (rule.runtime_status === 'decrease') return '⬇️ 减少';
                return '➖ 不变';
            } else if (compareMemory) {
                if (rule.memory_status === 'increase') return '⬆️ 增加';
                if (rule.memory_status === 'decrease') return '⬇️ 减少';
                return '➖ 不变';
            }
            return '无数据';
        };
        const runtime1 = rule.runtime1 !== null && rule.runtime1 !== undefined ? rule.runtime1.toFixed(2) : 'N/A';
        const runtime2 = rule.runtime2 !== null && rule.runtime2 !== undefined ? rule.runtime2.toFixed(2) : 'N/A';
        const runtimeDiff = rule.runtime_diff !== null && rule.runtime_diff !== undefined ? rule.runtime_diff.toFixed(2) : 'N/A';
        const runtimeChangePct = rule.runtime_change_pct !== null && rule.runtime_change_pct !== undefined ? rule.runtime_change_pct.toFixed(2) + '%' : 'N/A';
        const memory1 = rule.memory1 !== null && rule.memory1 !== undefined ? rule.memory1.toFixed(2) : 'N/A';
        const memory2 = rule.memory2 !== null && rule.memory2 !== undefined ? rule.memory2.toFixed(2) : 'N/A';
        const memoryDiff = rule.memory_diff !== null && rule.memory_diff !== undefined ? rule.memory_diff.toFixed(2) : 'N/A';
        const memoryChangePct = rule.memory_change_pct !== null && rule.memory_change_pct !== undefined ? rule.memory_change_pct.toFixed(2) + '%' : 'N/A';
        const runtimeClass = () => { if (!rule.has_data) return ''; if (rule.runtime_change_pct > 0) return 'status-increase'; if (rule.runtime_change_pct < 0) return 'status-decrease'; return ''; };
        const memoryClass = () => { if (!rule.has_data) return ''; if (rule.memory_change_pct > 0) return 'status-increase'; if (rule.memory_change_pct < 0) return 'status-decrease'; return ''; };
        let rowHtml = `<tr><td style="text-align:left; font-weight:500;">${escapeHtml(rule.rule_name)}</td>`;
        if (compareRuntime) rowHtml += `<td>${runtime1}</td><td>${runtime2}</td><td>${runtimeDiff}</td><td class="${runtimeClass()}">${runtimeChangePct}</td>`;
        if (compareMemory) rowHtml += `<td>${memory1}</td><td>${memory2}</td><td>${memoryDiff}</td><td class="${memoryClass()}">${memoryChangePct}</td>`;
        rowHtml += `<td>${statusText()}</td></tr>`;
        return rowHtml;
    }).join('');
}

async function exportCompareResult() {
    if (!compareState.currentResult) { showNotification('没有可导出的对比结果', true); return; }
    try {
        const response = await fetch('/api/export_compare', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ result: compareState.currentResult }) });
        const result = await response.json();
        if (result.success) {
            const link = document.createElement('a');
            link.href = result.download_url;
            link.download = result.filename;
            link.click();
            showNotification('导出成功');
        } else { showNotification('导出失败: ' + (result.error || '未知错误'), true); }
    } catch (error) { console.error('导出失败:', error); showNotification('导出失败', true); }
}

// ==================================================
// 自定义曲线图模块
// ==================================================

async function fetchUserData(casePath) {
    // 清空旧数据
    customState.projectsData = {};
    customState.currentProjectId = null;
    customState.currentRule = null;
    customState.selectedDates = [];
    customState.cachedToolData = {};
    customState.pendingSelectedDates = [];
    showLoading(true);
    const loadingIndicator = document.getElementById('customLoadingIndicator');
    if (loadingIndicator) loadingIndicator.style.display = 'block';
    try {
        const response = await fetch('/api/fetch_user_data', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ case_path: casePath }) });
        const result = await response.json();
        if (result.success) {
            customState.projectsData = result.data;
            const projectIds = Object.keys(customState.projectsData);
            const caseSelect = document.getElementById('customCaseSelect');
            if (caseSelect) {
                caseSelect.innerHTML = '<option value="">-- 请选择项目 --</option>' + projectIds.map(pid => `<option value="${pid}">${customState.projectsData[pid].project_name || pid}</option>`).join('');
                caseSelect.disabled = false;
            }
            showNotification('用户数据加载成功');
            return result.data;
        } else { showNotification('加载失败: ' + (result.error || '未知错误'), true); return null; }
    } catch (error) { console.error('加载用户数据失败:', error); showNotification('加载用户数据失败: ' + error.message, true); return null; }
    finally { showLoading(false); if (loadingIndicator) loadingIndicator.style.display = 'none'; }
}

function getCurrentCustomProjectData() {
    if (!customState.currentProjectId) return null;
    return customState.projectsData[customState.currentProjectId];
}

function getCurrentCustomToolData() {
    if (!customState.currentRule) return null;
    if (customState.cachedToolData[customState.currentRule] && customState.cachedToolData[customState.currentRule].projectId === customState.currentProjectId) {
        return customState.cachedToolData[customState.currentRule].data;
    }
    const projectData = getCurrentCustomProjectData();
    if (!projectData?.rule_data?.[customState.currentRule]) return null;
    customState.cachedToolData[customState.currentRule] = { projectId: customState.currentProjectId, data: projectData.rule_data[customState.currentRule] };
    return projectData.rule_data[customState.currentRule];
}

function getFilteredCustomToolData(toolData) {
    if (!toolData?.dates) return null;
    const filterSet = new Set(customState.selectedDates);
    const filtered = { dates: [], runtimes: [], memories: [], cores: [] };
    toolData.dates.forEach((date, index) => {
        if (filterSet.has(date)) {
            filtered.dates.push(date);
            filtered.runtimes.push(toolData.runtimes?.[index] ?? null);
            filtered.memories.push(toolData.memories?.[index] ?? null);
            filtered.cores.push(toolData.cores?.[index] ?? null);
        }
    });
    return filtered;
}

function updateCustomRuleSelect() {
    const projectData = getCurrentCustomProjectData();
    if (!projectData) return;
    const rules = projectData.rules || [];
    const searchText = document.getElementById('customRuleSearch')?.value.toLowerCase() || '';
    const filteredRules = searchText ? rules.filter(rule => rule.toLowerCase().includes(searchText)) : rules;
    const select = document.getElementById('customRuleSelect');
    const currentValue = select?.value;
    if (select) {
        select.innerHTML = '<option value="">-- 请选择阶段 --</option>';
        filteredRules.forEach(rule => { const option = document.createElement('option'); option.value = rule; option.textContent = rule; select.appendChild(option); });
        if (currentValue && filteredRules.includes(currentValue)) { select.value = currentValue; customState.currentRule = currentValue; }
        else if (filteredRules.length > 0 && !customState.currentRule) { select.value = filteredRules[0]; customState.currentRule = filteredRules[0]; }
    }
    if (customState.currentRule) {
        const ruleNameSpan = document.getElementById('customCurrentRuleName');
        if (ruleNameSpan) ruleNameSpan.innerText = customState.currentRule;
        updateCustomDateInfo();
        refreshCustomCharts();
    }
}

function updateCustomDateInfo() {
    const projectData = getCurrentCustomProjectData();
    if (!projectData) return;
    customState.availableDates = projectData.available_dates || projectData.dates || [];
    if (customState.selectedDates.length === 0) customState.selectedDates = customState.availableDates.slice(-51);
    const dateRangeSpan = document.getElementById('customDateRange');
    if (dateRangeSpan) dateRangeSpan.innerText = getDateRangeText(customState.selectedDates);
    const dataPointsSpan = document.getElementById('customDataPoints');
    if (dataPointsSpan) dataPointsSpan.innerText = customState.selectedDates.length;
}

function updateCustomChartTypeButtons() {
    const buttons = document.querySelectorAll('#customChartTypeButtons .chart-type-btn');
    buttons.forEach(btn => {
        const type = btn.dataset.type;
        if (type === customState.currentChartType) { btn.classList.add('btn-primary'); btn.classList.remove('btn-secondary'); }
        else { btn.classList.add('btn-secondary'); btn.classList.remove('btn-primary'); }
    });
    const runtimeContainer = document.getElementById('custom-chart-runtime');
    const memoryContainer = document.getElementById('custom-chart-memory');
    if (runtimeContainer && memoryContainer) {
        if (customState.currentChartType === 'runtime') { runtimeContainer.classList.remove('hidden'); memoryContainer.classList.add('hidden'); }
        else { runtimeContainer.classList.add('hidden'); memoryContainer.classList.remove('hidden'); }
    }
    const chartCardTitle = document.getElementById('customChartCardTitle');
    if (chartCardTitle) chartCardTitle.innerText = customState.currentChartType === 'runtime' ? '⏱️ Runtime 性能曲线 - 用户数据' : '💾 Memory 使用曲线 - 用户数据';
}

// function selectCustomChartType(type) {
//     if (customState.currentChartType === type) return;
//     customState.currentChartType = type;
//     updateCustomChartTypeButtons();
//     refreshCustomCharts();
// }



// function refreshCustomCharts() {
//     if (!customState.currentRule) return;
//     renderCustomChart('runtime', 'runtimes', '#6366f1', 'Runtime (秒)');
//     renderCustomChart('memory', 'memories', '#10b981', 'Memory (MB)', (value) => { if (value >= 1024) return (value / 1024).toFixed(1) + ' GB'; return value + ' MB'; });
//     updateCustomChartTypeButtons();
// }

function buildCustomDatePicker(usePending = false) {
    const container = document.getElementById('customDateOptionsContainer');
    if (!container) return;
    const currentSelection = usePending ? customState.pendingSelectedDates : customState.selectedDates;
    const filterText = document.getElementById('customDateFilterInput')?.value || '';
    const filteredDates = customState.availableDates.filter(date => date.toLowerCase().includes(filterText.toLowerCase()));
    container.innerHTML = filteredDates.map(date => `<label class="date-option"><input type="checkbox" value="${date}" ${currentSelection.includes(date) ? 'checked' : ''}><span>${date}</span></label>`).join('');
    container.querySelectorAll('input[type="checkbox"]').forEach(cb => {
        cb.addEventListener('change', (e) => {
            const date = e.target.value;
            if (e.target.checked) { if (!customState.pendingSelectedDates.includes(date)) customState.pendingSelectedDates.push(date); }
            else { customState.pendingSelectedDates = customState.pendingSelectedDates.filter(d => d !== date); }
        });
    });
}

function openCustomDatePickerModal() {
    customState.pendingSelectedDates = [...customState.selectedDates];
    buildCustomDatePicker(true);
    const modal = document.getElementById('customDatePickerModal');
    if (modal) modal.classList.remove('hidden');
}

function closeCustomDatePickerModal() { const modal = document.getElementById('customDatePickerModal'); if (modal) modal.classList.add('hidden'); }

function confirmCustomDateSelection() {
    if (customState.pendingSelectedDates.length === 0) customState.pendingSelectedDates = customState.availableDates.slice(-51);
    customState.selectedDates = [...customState.pendingSelectedDates];
    updateCustomDateInfo();
    refreshCustomCharts();
    closeCustomDatePickerModal();
}

function resetCustomDateSelection(useAll = false) {
    customState.selectedDates = useAll ? [...customState.availableDates] : customState.availableDates.slice(-51);
    updateCustomDateInfo();
    refreshCustomCharts();
}

function selectAllCustomDates() {
    const container = document.getElementById('customDateOptionsContainer');
    if (!container) return;
    const checkboxes = container.querySelectorAll('input[type="checkbox"]');
    customState.pendingSelectedDates = [];
    checkboxes.forEach(cb => { cb.checked = true; customState.pendingSelectedDates.push(cb.value); });
}

function deselectAllCustomDates() {
    const container = document.getElementById('customDateOptionsContainer');
    if (!container) return;
    const checkboxes = container.querySelectorAll('input[type="checkbox"]');
    customState.pendingSelectedDates = [];
    checkboxes.forEach(cb => { cb.checked = false; });
}

function inverseSelectCustomDates() {
    const container = document.getElementById('customDateOptionsContainer');
    if (!container) return;
    const checkboxes = container.querySelectorAll('input[type="checkbox"]');
    customState.pendingSelectedDates = [];
    checkboxes.forEach(cb => { cb.checked = !cb.checked; if (cb.checked) customState.pendingSelectedDates.push(cb.value); });
}

// ==================================================
// 通用功能
// ==================================================

async function refreshAllData() {
    showLoading(true);
    try {
        const response = await fetch('/api/refresh', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tool: toolId, mode: 'single' })
        });
        const result = await response.json();
        if (result.success) {
            Object.assign(projectsData, result.data);
            timelineState.mrUpdateDates = buildMrUpdateMap(result.perf);
            timelineState.cachedToolData = {};
            if (result.project_list?.length) {
                const caseSelect = document.getElementById('caseSelect');
                const currentVal = caseSelect?.value;
                if (caseSelect) {
                    caseSelect.innerHTML = result.project_list.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
                    if (result.project_list.some(p => p.id === currentVal)) caseSelect.value = currentVal;
                }
                const multiCaseSelect = document.getElementById('multiCaseSelect');
                if (multiCaseSelect) {
                    multiCaseSelect.innerHTML = result.project_list.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
                    if (result.project_list.some(p => p.id === currentVal)) multiCaseSelect.value = currentVal;
                }
                const compareCaseSelect = document.getElementById('compareCaseSelect');
                const oldCompareValue = compareCaseSelect?.value;
                if (compareCaseSelect) {
                    compareCaseSelect.innerHTML = '<option value="">-- 请选择case --</option>' + result.project_list.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
                    if (oldCompareValue && result.project_list.some(p => p.id === oldCompareValue)) compareCaseSelect.value = oldCompareValue;
                    else if (result.project_list.length > 0) compareCaseSelect.value = result.project_list[0].id;
                    if (compareCaseSelect.value) await onCompareProjectChange(compareCaseSelect.value);
                    else updateCompareControlsState(false);
                }
            }
            if (timelineState.currentProjectId) {
                updateRuleSelect();
                updateProjectStats();
                refreshTimelineCharts();
            }
            updateLastUpdateTime();
            showNotification('数据刷新成功');
        } else { throw new Error(result.message || '刷新失败'); }
    } catch (error) { console.error('刷新失败:', error); showNotification('刷新失败: ' + error.message, true); }
    finally { showLoading(false); }
}

function switchView(viewId) {
    const containers = document.querySelectorAll('.view-container');
    containers.forEach(view => view.classList.remove('active'));
    const targetView = document.getElementById(`${viewId}View`);
    if (targetView) targetView.classList.add('active');
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
        item.classList.remove('active');
        if (item.dataset.view === viewId) item.classList.add('active');
    });
    if (viewId === 'multithread') {
        setTimeout(() => {
            if (charts.multiRuntime) charts.multiRuntime.resize();
            if (charts.multiMemory) charts.multiMemory.resize();
            if (multiState.currentData && multiState.currentData.length > 0) {
                if (Array.isArray(multiState.currentData) && multiState.currentData[0]?.date) renderMultiThreadComparisonChart();
                else renderMultiThreadChart();
            }
        }, 100);
    } else if (viewId === 'timeline') {
        setTimeout(() => { if (charts.runtime) charts.runtime.resize(); if (charts.memory) charts.memory.resize(); }, 100);
    } else if (viewId === 'custom') {
        setTimeout(() => { if (customCharts.runtime) customCharts.runtime.resize(); if (customCharts.memory) customCharts.memory.resize(); }, 100);
    }
}

function backToHome() { window.location.href = '/'; }

function initCharts() {
    if (typeof echarts === 'undefined') {
        console.error('ECharts library not loaded');
        return;
    }
    
    const runtimeDom = document.getElementById('chart-runtime');
    const memoryDom = document.getElementById('chart-memory');
    
    if (runtimeDom) {
        if (charts.runtime) charts.runtime.dispose();
        charts.runtime = echarts.init(runtimeDom);
        charts.runtime.on('legendselectchanged', handleLegendSelectionChanged);
    }
    if (memoryDom) {
        if (charts.memory) charts.memory.dispose();
        charts.memory = echarts.init(memoryDom);
        charts.memory.on('legendselectchanged', handleLegendSelectionChanged);
    }
    
    initMultiCharts();
}



let statsTooltip = null;
function initStatsTooltips() {
    if (!statsTooltip) {
        statsTooltip = document.createElement('div');
        statsTooltip.id = 'statsTooltip';
        statsTooltip.style.cssText = `position: fixed; visibility: hidden; opacity: 0; background: var(--bg-card); border: 1px solid var(--primary); border-radius: var(--radius-md); padding: 0; font-size: 0.7rem; z-index: 10000; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3), 0 0 0 1px rgba(99, 102, 241, 0.3); color: var(--text-primary); pointer-events: none; backdrop-filter: blur(8px); transition: opacity 0.15s ease, visibility 0.15s ease; max-width: 350px; min-width: 220px;`;
        document.body.appendChild(statsTooltip);
    }
    const statItems = document.querySelectorAll('#compareRuntimeStats .stat-item, #compareMemoryStats .stat-item');
    statItems.forEach(item => {
        item.removeEventListener('mouseenter', handleStatsMouseEnter);
        item.removeEventListener('mouseleave', handleStatsMouseLeave);
        item.removeEventListener('mousemove', handleStatsMouseMove);
        item.addEventListener('mouseenter', handleStatsMouseEnter);
        item.addEventListener('mouseleave', handleStatsMouseLeave);
        item.addEventListener('mousemove', handleStatsMouseMove);
    });
}

function handleStatsMouseEnter(e) {
    const item = e.currentTarget;
    const tooltipHtml = item.getAttribute('data-tooltip-html');
    if (tooltipHtml && tooltipHtml.trim() !== '') {
        statsTooltip.innerHTML = tooltipHtml;
        statsTooltip.style.visibility = 'visible';
        statsTooltip.style.opacity = '1';
        updateTooltipPosition(e);
    }
}

function handleStatsMouseLeave() { if (statsTooltip) { statsTooltip.style.visibility = 'hidden'; statsTooltip.style.opacity = '0'; } }
function handleStatsMouseMove(e) { if (statsTooltip && statsTooltip.style.visibility === 'visible') updateTooltipPosition(e); }
function updateTooltipPosition(e) {
    if (!statsTooltip) return;
    const x = e.clientX + 15;
    const y = e.clientY - 10;
    const tooltipRect = statsTooltip.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    let left = x;
    let top = y - tooltipRect.height;
    if (left + tooltipRect.width > viewportWidth - 10) left = viewportWidth - tooltipRect.width - 10;
    if (left < 10) left = 10;
    if (top < 10) top = y + 20;
    if (top + tooltipRect.height > viewportHeight - 10) top = viewportHeight - tooltipRect.height - 10;
    statsTooltip.style.left = left + 'px';
    statsTooltip.style.top = top + 'px';
}

function isBrowserRefresh() {
    if (performance && performance.getEntriesByType) {
        const navigationEntries = performance.getEntriesByType('navigation');
        if (navigationEntries.length > 0 && navigationEntries[0].type === 'reload') return true;
    }
    if (performance && performance.navigation && performance.navigation.type === performance.navigation.TYPE_RELOAD) return true;
    const isInitialLoad = sessionStorage.getItem(`page_loaded_${toolId}`);
    if (!isInitialLoad) { sessionStorage.setItem(`page_loaded_${toolId}`, 'true'); return false; }
    return true;
}

async function autoRefreshOnLoad() {
    const isRefresh = isBrowserRefresh();
    if (isRefresh) {
        console.log('检测到浏览器刷新，正在更新数据...');
        showNotification('检测到页面刷新，正在获取最新数据...');
        try {
            const response = await fetch('/api/refresh', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tool: toolId, mode: 'single' })
            });
            const result = await response.json();
            if (result.success) {
                // 清空现有的 projectsData
                Object.keys(projectsData).forEach(key => delete projectsData[key]);
                // 合并新数据
                Object.assign(projectsData, result.data);
                timelineState.mrUpdateDates = buildMrUpdateMap(result.perf);
                timelineState.cachedToolData = {};
                if (result.project_list && result.project_list.length) {
                    // 更新时序图项目选择框
                    const caseSelect = document.getElementById('caseSelect');
                    const currentVal = caseSelect?.value;
                    if (caseSelect) {
                        caseSelect.innerHTML = result.project_list.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
                        if (result.project_list.some(p => p.id === currentVal)) caseSelect.value = currentVal;
                        else if (result.project_list.length > 0 && !caseSelect.value) caseSelect.value = result.project_list[0].id;
                    }
                    // 更新多线程项目选择框
                    const multiCaseSelect = document.getElementById('multiCaseSelect');
                    if (multiCaseSelect) {
                        multiCaseSelect.innerHTML = result.project_list.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
                        if (result.project_list.some(p => p.id === currentVal)) multiCaseSelect.value = currentVal;
                        else if (result.project_list.length > 0 && !multiCaseSelect.value) multiCaseSelect.value = result.project_list[0].id;
                    }
                    // 更新对比项目选择框
                    const compareCaseSelect = document.getElementById('compareCaseSelect');
                    const oldCompareValue = compareCaseSelect?.value;
                    if (compareCaseSelect) {
                        compareCaseSelect.innerHTML = '<option value="">-- 请选择case --</option>' + result.project_list.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
                        if (oldCompareValue && result.project_list.some(p => p.id === oldCompareValue)) compareCaseSelect.value = oldCompareValue;
                        else if (result.project_list.length > 0) compareCaseSelect.value = result.project_list[0].id;
                        if (compareCaseSelect.value) await onCompareProjectChange(compareCaseSelect.value);
                        else updateCompareControlsState(false);
                    }
                }
                // 刷新时序图
                if (timelineState.currentProjectId && projectsData[timelineState.currentProjectId]) {
                    updateRuleSelect();
                    updateProjectStats();
                    updateDateSelectionInfo();
                    refreshTimelineCharts();
                } else if (result.project_list && result.project_list.length > 0 && !timelineState.currentProjectId) {
                    // 如果没有选中的项目，选中第一个
                    timelineState.currentProjectId = result.project_list[0].id;
                    updateRuleSelect();
                    updateProjectStats();
                    updateDateSelectionInfo();
                    refreshTimelineCharts();
                }
                updateLastUpdateTime();
                showNotification('数据已更新到最新版本');
            } else {
                console.warn('刷新失败:', result.message);
                showNotification('数据更新失败，使用缓存数据', true);
            }
        } catch (error) {
            console.error('自动刷新失败:', error);
            showNotification('自动刷新失败，使用缓存数据', true);
        }
    } else {
        console.log('正常页面加载，使用服务端数据');
        timelineState.mrUpdateDates = buildMrUpdateMap(perf);
        const compareSelect = document.getElementById('compareCaseSelect');
        if (compareSelect && compareSelect.options.length > 0) {
            if (compareSelect.value) await onCompareProjectChange(compareSelect.value);
            else updateCompareControlsState(false);
        } else {
            updateCompareControlsState(false);
        }
    }
}
function bindEvents() {
    const caseSelect = document.getElementById('caseSelect');
    if (caseSelect) caseSelect.addEventListener('change', (e) => {
        timelineState.currentProjectId = e.target.value;
        timelineState.currentRule = null;
        timelineState.cachedToolData = {};
        timelineState.selectedDates = [];
        updateRuleSelect();
        updateProjectStats();
        updateDateSelectionInfo();
    });
    const ruleSelect = document.getElementById('ruleSelect');
    if (ruleSelect) ruleSelect.addEventListener('change', (e) => {
        timelineState.currentRule = e.target.value;
        if (timelineState.currentRule) { const ruleNameSpan = document.getElementById('currentRuleName'); if (ruleNameSpan) ruleNameSpan.innerText = timelineState.currentRule; refreshTimelineCharts(); }
    });
    const ruleSearch = document.getElementById('ruleSearch');
    if (ruleSearch) ruleSearch.addEventListener('input', debounce(() => updateRuleSelect(), 300));
    const chartTypeBtns = document.querySelectorAll('#chartTypeButtons .chart-type-btn');
    chartTypeBtns.forEach(btn => btn.addEventListener('click', () => selectChartType(btn.dataset.type)));
    const refreshBtn = document.getElementById('refreshDataBtn');
    if (refreshBtn) refreshBtn.addEventListener('click', refreshAllData);
    const openDatePickerBtn = document.getElementById('openDatePickerBtn');
    if (openDatePickerBtn) openDatePickerBtn.addEventListener('click', openDatePickerModal);
    const closeDateModalBtn = document.getElementById('closeDateModalBtn');
    if (closeDateModalBtn) closeDateModalBtn.addEventListener('click', closeDatePickerModal);
    const confirmDateBtn = document.getElementById('confirmDateBtn');
    if (confirmDateBtn) confirmDateBtn.addEventListener('click', confirmDateSelection);
    const selectRecentBtn = document.getElementById('selectRecentBtn');
    if (selectRecentBtn) selectRecentBtn.addEventListener('click', () => resetDateSelection(false));
    const selectAllDatesBtn = document.getElementById('selectAllDatesBtn');
    if (selectAllDatesBtn) selectAllDatesBtn.addEventListener('click', selectAllDates);
    const deselectAllDatesBtn = document.getElementById('deselectAllDatesBtn');
    if (deselectAllDatesBtn) deselectAllDatesBtn.addEventListener('click', deselectAllDates);
    const inverseDatesBtn = document.getElementById('inverseDatesBtn');
    if (inverseDatesBtn) inverseDatesBtn.addEventListener('click', inverseSelectDates);
    const dateFilterInput = document.getElementById('dateFilterInput');
    if (dateFilterInput) dateFilterInput.addEventListener('input', debounce(() => buildDatePicker(true), 150));
    const multiCaseSelect = document.getElementById('multiCaseSelect');
    if (multiCaseSelect) multiCaseSelect.addEventListener('change', async (e) => {
        multiState.currentProjectId = e.target.value;
        multiState.currentRule = null;
        multiState.selectedThreads = [];
        multiState.availableThreads = [];
        await loadMultiRules(multiState.currentProjectId);
    });
    const multiRuleSelectEl = document.getElementById('multiRuleSelect');
    if (multiRuleSelectEl) multiRuleSelectEl.addEventListener('change', async (e) => {
        multiState.currentRule = e.target.value;
        if (multiState.currentRule) await loadMultiDates(multiState.currentProjectId, multiState.currentRule);
    });
    const multiOpenDatePickerBtn = document.getElementById('multiOpenDatePickerBtn');
    if (multiOpenDatePickerBtn) multiOpenDatePickerBtn.addEventListener('click', openMultiDatePickerModal);
    const multiSelectRecentBtn = document.getElementById('multiSelectRecentBtn');
    if (multiSelectRecentBtn) multiSelectRecentBtn.addEventListener('click', selectLatestMultiDate);
    const multiCloseDateModalBtn = document.getElementById('multiCloseDateModalBtn');
    if (multiCloseDateModalBtn) multiCloseDateModalBtn.addEventListener('click', closeMultiDatePickerModal);
    const multiConfirmDateBtn = document.getElementById('multiConfirmDateBtn');
    if (multiConfirmDateBtn) multiConfirmDateBtn.addEventListener('click', confirmMultiDateSelection);
    const multiDateFilterInput = document.getElementById('multiDateFilterInput');
    if (multiDateFilterInput) multiDateFilterInput.addEventListener('input', debounce(() => buildMultiDatePicker(true), 150));
    const multiChartRuntimeBtn = document.getElementById('multiChartRuntimeBtn');
    if (multiChartRuntimeBtn) multiChartRuntimeBtn.addEventListener('click', () => selectMultiChartType('runtime'));
    const multiChartMemoryBtn = document.getElementById('multiChartMemoryBtn');
    if (multiChartMemoryBtn) multiChartMemoryBtn.addEventListener('click', () => selectMultiChartType('memory'));
    const openThreadSelectorBtn = document.getElementById('openThreadSelectorBtn');
    if (openThreadSelectorBtn) openThreadSelectorBtn.addEventListener('click', openThreadSelectorModal);
    const selectAllThreadsBtn = document.getElementById('selectAllThreadsBtn');
    if (selectAllThreadsBtn) selectAllThreadsBtn.addEventListener('click', selectAllThreadsInModal);
    const deselectAllThreadsBtn = document.getElementById('deselectAllThreadsBtn');
    if (deselectAllThreadsBtn) deselectAllThreadsBtn.addEventListener('click', deselectAllThreadsInModal);
    const inverseThreadsBtn = document.getElementById('inverseThreadsBtn');
    if (inverseThreadsBtn) inverseThreadsBtn.addEventListener('click', inverseSelectThreadsInModal);
    const closeThreadModalBtn = document.getElementById('closeThreadModalBtn');
    if (closeThreadModalBtn) closeThreadModalBtn.addEventListener('click', closeThreadSelectorModal);
    const confirmThreadModalBtn = document.getElementById('confirmThreadModalBtn');
    if (confirmThreadModalBtn) confirmThreadModalBtn.addEventListener('click', confirmThreadSelection);
    const threadFilterInput = document.getElementById('threadFilterInput');
    if (threadFilterInput) threadFilterInput.addEventListener('input', debounce(buildThreadSelectorModal, 150));
    const compareCaseSelect = document.getElementById('compareCaseSelect');
    if (compareCaseSelect) compareCaseSelect.addEventListener('change', async (e) => {
        const projId = e.target.value;
        if (projId) await onCompareProjectChange(projId);
        else updateCompareControlsState(false);
    });
    const compareModeSelect = document.getElementById('compareModeSelect');
    if (compareModeSelect) {
        compareModeSelect.addEventListener('change', (e) => {
            const ruleGroup = document.getElementById('compareRuleGroup');
            if (ruleGroup) ruleGroup.style.display = e.target.value === 'all' ? 'none' : 'block';
        });
        if (compareModeSelect.value === 'all') { const ruleGroup = document.getElementById('compareRuleGroup'); if (ruleGroup) ruleGroup.style.display = 'none'; }
    }
    const executeCompareBtn = document.getElementById('executeCompareBtn');
    if (executeCompareBtn) executeCompareBtn.addEventListener('click', executeCompare);
    const exportCompareBtn = document.getElementById('exportCompareBtn');
    if (exportCompareBtn) exportCompareBtn.addEventListener('click', exportCompareResult);
    const loadCustomDataBtn = document.getElementById('loadCustomDataBtn');
    if (loadCustomDataBtn) loadCustomDataBtn.addEventListener('click', async () => {
        const casePath = document.getElementById('customCasePath').value.trim();
        if (!casePath) { showNotification('请输入用户数据路径', true); return; }
        const data = await fetchUserData(casePath);
        if (data) {
            const caseSelect = document.getElementById('customCaseSelect');
            if (caseSelect && caseSelect.options.length > 0) {
                customState.currentProjectId = caseSelect.value;
                updateCustomRuleSelect();
                updateCustomDateInfo();
                updateCustomChartTypeButtons();
            }
        }
    });
    const customCaseSelect = document.getElementById('customCaseSelect');
    if (customCaseSelect) {
        customCaseSelect.addEventListener('change', (e) => {
            customState.currentProjectId = e.target.value;
            customState.currentRule = null;
            customState.cachedToolData = {};
            customState.selectedDates = [];
            const ruleSelect = document.getElementById('customRuleSelect');
            const ruleSearch = document.getElementById('customRuleSearch');
            const openDatePicker = document.getElementById('customOpenDatePickerBtn');
            const selectRecent = document.getElementById('customSelectRecentBtn');
            if (customState.currentProjectId) {
                if (ruleSelect) ruleSelect.disabled = false;
                if (ruleSearch) ruleSearch.disabled = false;
                if (openDatePicker) openDatePicker.disabled = false;
                if (selectRecent) selectRecent.disabled = false;
                updateCustomRuleSelect();
                updateCustomDateInfo();
                updateCustomChartTypeButtons();
            } else {
                if (ruleSelect) ruleSelect.disabled = true;
                if (ruleSearch) ruleSearch.disabled = true;
                if (openDatePicker) openDatePicker.disabled = true;
                if (selectRecent) selectRecent.disabled = true;
            }
        });
    }
    const customRuleSelect = document.getElementById('customRuleSelect');
    if (customRuleSelect) customRuleSelect.addEventListener('change', (e) => {
        customState.currentRule = e.target.value;
        if (customState.currentRule) { const ruleNameSpan = document.getElementById('customCurrentRuleName'); if (ruleNameSpan) ruleNameSpan.innerText = customState.currentRule; refreshCustomCharts(); }
    });
    const customRuleSearch = document.getElementById('customRuleSearch');
    if (customRuleSearch) customRuleSearch.addEventListener('input', debounce(() => updateCustomRuleSelect(), 300));
    const customChartTypeBtns = document.querySelectorAll('#customChartTypeButtons .chart-type-btn');
    customChartTypeBtns.forEach(btn => btn.addEventListener('click', () => selectCustomChartType(btn.dataset.type)));
    const customOpenDatePickerBtn = document.getElementById('customOpenDatePickerBtn');
    if (customOpenDatePickerBtn) customOpenDatePickerBtn.addEventListener('click', openCustomDatePickerModal);
    const customCloseDateModalBtn = document.getElementById('customCloseDateModalBtn');
    if (customCloseDateModalBtn) customCloseDateModalBtn.addEventListener('click', closeCustomDatePickerModal);
    const customConfirmDateBtn = document.getElementById('customConfirmDateBtn');
    if (customConfirmDateBtn) customConfirmDateBtn.addEventListener('click', confirmCustomDateSelection);
    const customSelectRecentBtn = document.getElementById('customSelectRecentBtn');
    if (customSelectRecentBtn) customSelectRecentBtn.addEventListener('click', () => resetCustomDateSelection(false));
    const customSelectAllDatesBtn = document.getElementById('customSelectAllDatesBtn');
    if (customSelectAllDatesBtn) customSelectAllDatesBtn.addEventListener('click', selectAllCustomDates);
    const customDeselectAllDatesBtn = document.getElementById('customDeselectAllDatesBtn');
    if (customDeselectAllDatesBtn) customDeselectAllDatesBtn.addEventListener('click', deselectAllCustomDates);
    const customInverseDatesBtn = document.getElementById('customInverseDatesBtn');
    if (customInverseDatesBtn) customInverseDatesBtn.addEventListener('click', inverseSelectCustomDates);
    const customDateFilterInput = document.getElementById('customDateFilterInput');
    if (customDateFilterInput) customDateFilterInput.addEventListener('input', debounce(() => buildCustomDatePicker(true), 150));
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => item.addEventListener('click', () => switchView(item.dataset.view)));
    const backToHomeBtn = document.getElementById('backToHomeBtn');
    if (backToHomeBtn) backToHomeBtn.addEventListener('click', backToHome);
}

// 全局图表实例
// let customCharts = {};
// 初始化自定义曲线图图表
function initCustomCharts() {
    const runtimeDom = document.getElementById('custom-chart-runtime');
    const memoryDom = document.getElementById('custom-chart-memory');
    
    if (runtimeDom && !customCharts.runtime) {
        customCharts.runtime = echarts.init(runtimeDom);
    }
    if (memoryDom && !customCharts.memory) {
        customCharts.memory = echarts.init(memoryDom);
    }
}
// 初始化
async function init() {
    initCharts();
    initCustomCharts();
    bindEvents();
    await autoRefreshOnLoad();
    const caseSelect = document.getElementById('caseSelect');
    if (caseSelect && caseSelect.options.length > 0) {
        timelineState.currentProjectId = caseSelect.value;
        updateRuleSelect();
        updateProjectStats();
        updateDateSelectionInfo();
        updateChartTypeButtons();
    }
    const multiCaseSelect = document.getElementById('multiCaseSelect');
    if (multiCaseSelect && multiCaseSelect.options.length > 0) {
        multiState.currentProjectId = multiCaseSelect.value;
        await loadMultiRules(multiState.currentProjectId);
    }
    const compareSelect = document.getElementById('compareCaseSelect');
    if (compareSelect && compareSelect.options.length > 0) {
        if (!compareSelect.value && compareSelect.options.length > 0) compareSelect.value = compareSelect.options[0]?.value || '';
        if (compareSelect.value) await onCompareProjectChange(compareSelect.value);
        else updateCompareControlsState(false);
    } else { updateCompareControlsState(false); }
    const customRuleSelect = document.getElementById('customRuleSelect');
    const customRuleSearch = document.getElementById('customRuleSearch');
    const customOpenDatePicker = document.getElementById('customOpenDatePickerBtn');
    const customSelectRecent = document.getElementById('customSelectRecentBtn');
    if (customRuleSelect) customRuleSelect.disabled = true;
    if (customRuleSearch) customRuleSearch.disabled = true;
    if (customOpenDatePicker) customOpenDatePicker.disabled = true;
    if (customSelectRecent) customSelectRecent.disabled = true;
    if (initialMode === 'multi') switchView('multithread');
    else if (initialMode === 'compare') switchView('compare');
    else if (initialMode === 'custom') switchView('custom');
    setInterval(() => {
        fetch('/api/check_update', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tool: toolId, mode: 'single' })
        }).then(res => res.json()).then(result => { if (result.has_update) showNotification('发现新数据，点击刷新按钮更新'); }).catch(() => {});
    }, 30000);
    updateLastUpdateTime();
    updateMultiChartTypeButtons();
}
// 添加项目数据解析函数（如果后端没有提供）
window.parseProjectData = function(projectData, projectId) {
    // 如果已经有 rule_data，直接返回
    if (projectData.rule_data) return projectData;
    
    const dailyMetrics = projectData.daily_metrics || projectData;
    const allRules = new Set();
    const dates = Object.keys(dailyMetrics).sort();
    const availableDates = projectData.available_dates || dates.slice();
    
    // 收集所有阶段
    Object.values(dailyMetrics).forEach(dayData => {
        Object.keys(dayData).forEach(rule => allRules.add(rule));
    });
    
    const ruleData = {};
    const rulesList = Array.from(allRules).sort();
    
    rulesList.forEach(rule => {
        const ruleInfo = {
            dates: [],
            runtimes: [],
            memories: [],
            cores: [],
            thread_metrics: {}
        };
        
        dates.forEach((date, idx) => {
            ruleInfo.dates.push(date);
            const dayData = dailyMetrics[date] || {};
            const ruleMetrics = dayData[rule] || {};
            
            let runtime = null, memory = null, cores = 0;
            
            if (ruleMetrics.thread_metrics) {
                // 多线程格式
                const thread0 = ruleMetrics.thread_metrics['0'];
                if (thread0) {
                    runtime = thread0.runtime;
                    memory = thread0.memory;
                    cores = thread0.cores;
                }
                // 存储所有线程数据
                ruleInfo.thread_metrics = ruleMetrics.thread_metrics;
            } else {
                // 单线程格式
                runtime = ruleMetrics.runtime;
                memory = ruleMetrics.memory;
                cores = ruleMetrics.cores;
                // 构建线程0数据
                ruleInfo.thread_metrics['0'] = ruleInfo.thread_metrics['0'] || { runtimes: [], memories: [], cores: [] };
            }
            
            ruleInfo.runtimes.push(runtime);
            ruleInfo.memories.push(memory);
            ruleInfo.cores.push(cores);
            
            // 更新线程指标
            Object.keys(ruleInfo.thread_metrics).forEach(tid => {
                const tm = ruleInfo.thread_metrics[tid];
                while (tm.runtimes.length <= idx) tm.runtimes.push(null);
                while (tm.memories.length <= idx) tm.memories.push(null);
                while (tm.cores.length <= idx) tm.cores.push(null);
            });
        });
        
        ruleData[rule] = ruleInfo;
    });
    
    return {
        dates: dates,
        available_dates: availableDates,
        rules: rulesList,
        rule_data: ruleData,
        project_name: projectData.project_name || projectId,
        description: projectData.description || ''
    };
};
// 挂载全局函数
window.selectMultiChartType = selectMultiChartType;
window.openThreadSelectorModal = openThreadSelectorModal;
window.closeThreadSelectorModal = closeThreadSelectorModal;
window.confirmThreadSelection = confirmThreadSelection;
window.selectCustomChartType = selectCustomChartType;

init();