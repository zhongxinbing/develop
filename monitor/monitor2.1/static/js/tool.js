

// // 全局图表实例
const charts = {};


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
        updateStatsCard('stats-main', allValues, unit, label);
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
// function initStatsTooltips() {
//     if (!statsTooltip) {
//         statsTooltip = document.createElement('div');
//         statsTooltip.id = 'statsTooltip';
//         statsTooltip.style.cssText = `position: fixed; visibility: hidden; opacity: 0; background: var(--bg-card); border: 1px solid var(--primary); border-radius: var(--radius-md); padding: 0; font-size: 0.7rem; z-index: 10000; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3), 0 0 0 1px rgba(99, 102, 241, 0.3); color: var(--text-primary); pointer-events: none; backdrop-filter: blur(8px); transition: opacity 0.15s ease, visibility 0.15s ease; max-width: 350px; min-width: 220px;`;
//         document.body.appendChild(statsTooltip);
//     }
//     const statItems = document.querySelectorAll('#compareRuntimeStats .stat-item, #compareMemoryStats .stat-item');
//     statItems.forEach(item => {
//         item.removeEventListener('mouseenter', handleStatsMouseEnter);
//         item.removeEventListener('mouseleave', handleStatsMouseLeave);
//         item.removeEventListener('mousemove', handleStatsMouseMove);
//         item.addEventListener('mouseenter', handleStatsMouseEnter);
//         item.addEventListener('mouseleave', handleStatsMouseLeave);
//         item.addEventListener('mousemove', handleStatsMouseMove);
//     });
// }

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