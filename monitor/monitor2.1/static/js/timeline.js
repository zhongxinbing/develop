/**
 * 时序曲线图模块 - 统一折线图样式
 */

// 时序曲线图全局变量
const timelineState = {
    currentProjectId: null,
    currentRule: null,
    selectedDates: [],
    availableDates: [],
    currentChartType: 'runtime',
    cachedToolData: {},
    mrUpdateDates: {}
};
let pendingSelectedDates = [];

// ==================================================
// 数据获取
// ==================================================

function getCurrentTimelineProjectData() {
    return window.projectsData?.[timelineState.currentProjectId];
}

function getCurrentTimelineToolData() {
    if (!timelineState.currentRule) return null;
    
    const cache = timelineState.cachedToolData[timelineState.currentRule];
    if (cache && cache.projectId === timelineState.currentProjectId) {
        return cache.data;
    }
    
    const projectData = getCurrentTimelineProjectData();
    if (!projectData?.rule_data?.[timelineState.currentRule]) return null;
    
    timelineState.cachedToolData[timelineState.currentRule] = {
        projectId: timelineState.currentProjectId,
        data: projectData.rule_data[timelineState.currentRule]
    };
    
    return projectData.rule_data[timelineState.currentRule];
}

function getFilteredTimelineData(toolData) {
    if (!toolData?.dates) return null;
    
    const filterSet = new Set(timelineState.selectedDates);
    const filtered = {
        dates: [],
        runtimes: [],
        memories: [],
        cores: []
    };
    
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

// ==================================================
// 阶段选择
// ==================================================

function updateTimelineRuleSelect() {
    const projectData = getCurrentTimelineProjectData();
    console.log('updateTimelineRuleSelect called:', {
        currentProjectId: timelineState.currentProjectId,
        projectDataExists: !!projectData,
        projectsDataKeys: window.projectsData ? Object.keys(window.projectsData) : []
    });
    if (!projectData) {
        console.warn('未找到当前项目数据，无法更新阶段选择');
        return;
    }
    
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
        updateTimelineDateInfo();
        refreshTimelineCharts();
    }
}

// ==================================================
// 日期选择
// ==================================================

function updateTimelineDateInfo() {
    const projectData = getCurrentTimelineProjectData();
    if (!projectData) return;
    
    timelineState.availableDates = projectData.available_dates || projectData.dates || [];
    
    if (timelineState.selectedDates.length === 0) {
        timelineState.selectedDates = timelineState.availableDates.slice(-51);
    }
    
    const dateRangeSpan = document.getElementById('dateRange');
    if (dateRangeSpan) {
        dateRangeSpan.innerText = getDateRangeText(timelineState.selectedDates);
    }
    const dataPointsSpan = document.getElementById('dataPoints');
    if (dataPointsSpan) {
        dataPointsSpan.innerText = timelineState.selectedDates.length;
    }
}

function openTimelineDatePickerModal() {
    pendingSelectedDates = [...timelineState.selectedDates];
    buildDatePicker(true);
    const modal = document.getElementById('datePickerModal');
    if (modal) modal.classList.remove('hidden');
}

function closeTimelineDatePickerModal() {
    const modal = document.getElementById('datePickerModal');
    if (modal) modal.classList.add('hidden');
}

function buildDatePicker(usePending = false) {
    const container = document.getElementById('dateOptionsContainer');
    if (!container) return;
    
    const currentSelection = usePending ? pendingSelectedDates : timelineState.selectedDates;
    const filterText = document.getElementById('dateFilterInput')?.value || '';
    const filteredDates = timelineState.availableDates.filter(date => 
        date.toLowerCase().includes(filterText.toLowerCase())
    );
    
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

function confirmTimelineDateSelection() {
    if (pendingSelectedDates.length === 0) {
        pendingSelectedDates = timelineState.availableDates.slice(-51);
    }
    timelineState.selectedDates = [...pendingSelectedDates];
    updateTimelineDateInfo();
    refreshTimelineCharts();
    closeTimelineDatePickerModal();
}

function resetTimelineDateSelection(useAll = false) {
    timelineState.selectedDates = useAll ? [...timelineState.availableDates] : timelineState.availableDates.slice(-51);
    updateTimelineDateInfo();
    refreshTimelineCharts();
}

function selectAllTimelineDates() {
    const container = document.getElementById('dateOptionsContainer');
    if (!container) return;
    
    const checkboxes = container.querySelectorAll('input[type="checkbox"]');
    pendingSelectedDates = [];
    checkboxes.forEach(cb => {
        cb.checked = true;
        pendingSelectedDates.push(cb.value);
    });
}

function deselectAllTimelineDates() {
    const container = document.getElementById('dateOptionsContainer');
    if (!container) return;
    
    const checkboxes = container.querySelectorAll('input[type="checkbox"]');
    pendingSelectedDates = [];
    checkboxes.forEach(cb => {
        cb.checked = false;
    });
}

function inverseSelectTimelineDates() {
    const container = document.getElementById('dateOptionsContainer');
    if (!container) return;
    
    const checkboxes = container.querySelectorAll('input[type="checkbox"]');
    pendingSelectedDates = [];
    checkboxes.forEach(cb => {
        cb.checked = !cb.checked;
        if (cb.checked) {
            pendingSelectedDates.push(cb.value);
        }
    });
}

// ==================================================
// 图表类型切换 - 统一使用按钮方式
// ==================================================

/**
 * 更新时序曲线图图表类型按钮状态
 */
function updateTimelineChartTypeButtons() {
    const runtimeBtn = document.getElementById('timelineChartRuntimeBtn');
    const memoryBtn = document.getElementById('timelineChartMemoryBtn');
    
    if (runtimeBtn) {
        if (timelineState.currentChartType === 'runtime') {
            runtimeBtn.classList.add('btn-primary');
            runtimeBtn.classList.remove('btn-secondary');
        } else {
            runtimeBtn.classList.add('btn-secondary');
            runtimeBtn.classList.remove('btn-primary');
        }
    }
    if (memoryBtn) {
        if (timelineState.currentChartType === 'memory') {
            memoryBtn.classList.add('btn-primary');
            memoryBtn.classList.remove('btn-secondary');
        } else {
            memoryBtn.classList.add('btn-secondary');
            memoryBtn.classList.remove('btn-primary');
        }
    }
    
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
    
    const chartCardTitle = document.getElementById('timelineChartCardTitle');
    if (chartCardTitle) {
        chartCardTitle.innerText = timelineState.currentChartType === 'runtime' 
            ? '⏱️ Runtime 性能曲线' 
            : '💾 Memory 使用曲线';
    }
}

/**
 * 切换时序曲线图图表类型
 * @param {string} type - 图表类型 ('runtime' 或 'memory')
 */
function selectTimelineChartType(type) {
    if (timelineState.currentChartType === type) return;
    timelineState.currentChartType = type;
    updateTimelineChartTypeButtons();
    refreshTimelineCharts();
}

// ==================================================
// 图表渲染
// ==================================================

function renderTimelineChart(chartType, dataKey, color, yAxisName) {
    const toolData = getCurrentTimelineToolData();
    if (!toolData) {
        const chart = ChartManager.get(`chart-${chartType}`);
        if (chart) {
            chart.clear();
            chart.setOption({
                title: {
                    show: true,
                    text: '请先选择一个阶段',
                    textStyle: { color: '#94a3b8' },
                    left: 'center',
                    top: 'center'
                }
            }, true);
        }
        return;
    }
    
    const filteredData = getFilteredTimelineData(toolData);
    if (!filteredData || filteredData.dates.length === 0) {
        const chart = ChartManager.get(`chart-${chartType}`);
        if (chart) {
            chart.clear();
            chart.setOption({
                title: {
                    show: true,
                    text: '所选日期范围内无数据',
                    textStyle: { color: '#94a3b8' },
                    left: 'center',
                    top: 'center'
                }
            }, true);
        }
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
    const seriesList = [];
    const allValues = [];
    const palette = ['#6366f1', '#f59e0b', '#10b981', '#ef4444', '#06b6d4', '#8b5cf6', '#ec4899', '#84cc16'];
    
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
        
        const threadLabel = threadId === '0' ? '线程0' : `其他线程${threadId}`;
        const seriesColor = palette[index % palette.length];
        
        seriesList.push({
            name: threadLabel,
            type: 'line',
            data: mappedValues,
            smooth: false,
            lineStyle: { width: 2, color: seriesColor },
            areaStyle: { opacity: 0.08, color: seriesColor },
            connectNulls: false,
            showSymbol: true,
            symbol: 'circle',
            symbolSize: 6,
            itemStyle: {
                color: (params) => {
                    const date = dates[params.dataIndex];
                    if (date && hasMrUpdate(date)) return '#ef4444';
                    return seriesColor;
                },
                borderColor: (params) => {
                    const date = dates[params.dataIndex];
                    if (date && hasMrUpdate(date)) return '#ffffff';
                    return 'transparent';
                },
                borderWidth: (params) => {
                    const date = dates[params.dataIndex];
                    return date && hasMrUpdate(date) ? 2 : 0;
                }
            }
        });
    });
    
    // 更新统计卡片
    if (chartType === timelineState.currentChartType) {
        const unit = dataKey === 'runtimes' ? '秒' : 'MB';
        const label = dataKey === 'runtimes' ? 'Runtime' : 'Memory';
        updateStatsCard('stats-main', allValues, unit, label);
    }
    
    const avgValue = allValues.length > 0 
        ? (allValues.reduce((a, b) => a + b, 0) / allValues.length).toFixed(1) 
        : 0;
    
    let referenceValue = avgValue;
    if (dataKey === 'memories' && allValues.length > 0) {
        const sorted = [...allValues].sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        referenceValue = sorted[mid];
    }
    
    const legendSelected = {};
    threadIds.forEach((threadId, idx) => {
        const seriesName = threadId === '0' ? '线程0' : `其他线程${threadId}`;
        legendSelected[seriesName] = (threadId === '0');
    });
    
    const tooltipFormatter = function(params) {
        if (!params?.length) return '';
        const unit = dataKey === 'runtimes' ? '秒' : 'MB';
        const date = params[0].axisValue;
        const rows = params.map(p => {
            if (p.value === null || p.value === undefined) {
                return `<div>${p.seriesName}: N/A</div>`;
            }
            return `<div>${p.seriesName}: ${p.value.toFixed(2)} ${unit}</div>`;
        }).join('');
        const mrComment = getMrComment(date);
        const hasMr = mrComment !== '';
        const mrStyle = hasMr ? 'color: #ef4444; font-weight: bold;' : 'color: #94a3b8;';
        const mrIcon = hasMr ? '🔴' : '⚪';
        return `<strong>📅 ${date}</strong>${rows}<div style="margin-top: 6px; padding-top: 4px; border-top: 1px solid #334155;"><span style="${mrStyle}">${mrIcon} ${hasMr ? mrComment : '无MR更新'}</span></div>`;
    };
    
    const option = ChartConfig.getCompleteLineChartConfig(
        dates, seriesList, yAxisName, avgValue, referenceValue, legendSelected, tooltipFormatter
    );
    
    const chart = ChartManager.get(`chart-${chartType}`);
    if (chart) {
        chart.setOption(option, { notMerge: true, lazyUpdate: true });
        setTimeout(() => addLegendControlButtons(chart, `chart-${chartType}`), 100);
    }
}

function refreshTimelineCharts() {
    if (!timelineState.currentRule) return;
    
    renderTimelineChart('runtime', 'runtimes', '#6366f1', 'Runtime (秒)');
    renderTimelineChart('memory', 'memories', '#10b981', 'Memory (MB)');
    updateTimelineChartTypeButtons();
    
    setTimeout(() => {
        if (charts.runtime) charts.runtime.resize();
        if (charts.memory) charts.memory.resize();
    }, 100);
}

function updateTimelineProjectStats() {
    const projectData = getCurrentTimelineProjectData();
    if (!projectData) return;
    
    const statsContainer = document.getElementById('projectStats');
    if (!statsContainer) return;
    
    statsContainer.innerHTML = `
        <div class="stat-item"><div class="stat-value">${projectData.rules?.length || 0}</div><div class="stat-label">阶段数</div></div>
        <div class="stat-item"><div class="stat-value">${projectData.dates?.length || 0}</div><div class="stat-label">天数</div></div>
        <div class="stat-item"><div class="stat-value">-</div><div class="stat-label">平均Runtime</div></div>
    `;
}

// ==================================================
// 事件绑定
// ==================================================

function bindTimelineEvents() {
    const caseSelect = document.getElementById('caseSelect');
    if (caseSelect) {
        caseSelect.addEventListener('change', (e) => {
            timelineState.currentProjectId = e.target.value;
            timelineState.currentRule = null;
            timelineState.cachedToolData = {};
            timelineState.selectedDates = [];
            updateTimelineRuleSelect();
            updateTimelineProjectStats();
            updateTimelineDateInfo();
        });
    }
    
    const ruleSelect = document.getElementById('ruleSelect');
    if (ruleSelect) {
        ruleSelect.addEventListener('change', (e) => {
            timelineState.currentRule = e.target.value;
            if (timelineState.currentRule) {
                const ruleNameSpan = document.getElementById('currentRuleName');
                if (ruleNameSpan) ruleNameSpan.innerText = timelineState.currentRule;
                refreshTimelineCharts();
            }
        });
    }
    
    const ruleSearch = document.getElementById('ruleSearch');
    if (ruleSearch) {
        ruleSearch.addEventListener('input', debounce(() => updateTimelineRuleSelect(), 300));
    }
    
    // 图表类型切换按钮
    const timelineChartRuntimeBtn = document.getElementById('timelineChartRuntimeBtn');
    if (timelineChartRuntimeBtn) {
        timelineChartRuntimeBtn.addEventListener('click', () => selectTimelineChartType('runtime'));
    }
    const timelineChartMemoryBtn = document.getElementById('timelineChartMemoryBtn');
    if (timelineChartMemoryBtn) {
        timelineChartMemoryBtn.addEventListener('click', () => selectTimelineChartType('memory'));
    }
    
    const openDatePickerBtn = document.getElementById('openDatePickerBtn');
    if (openDatePickerBtn) openDatePickerBtn.addEventListener('click', openTimelineDatePickerModal);
    
    const closeDateModalBtn = document.getElementById('closeDateModalBtn');
    if (closeDateModalBtn) closeDateModalBtn.addEventListener('click', closeTimelineDatePickerModal);
    
    const confirmDateBtn = document.getElementById('confirmDateBtn');
    if (confirmDateBtn) confirmDateBtn.addEventListener('click', confirmTimelineDateSelection);
    
    const selectRecentBtn = document.getElementById('selectRecentBtn');
    if (selectRecentBtn) selectRecentBtn.addEventListener('click', () => resetTimelineDateSelection(false));
    
    const selectAllDatesBtn = document.getElementById('selectAllDatesBtn');
    if (selectAllDatesBtn) selectAllDatesBtn.addEventListener('click', selectAllTimelineDates);
    
    const deselectAllDatesBtn = document.getElementById('deselectAllDatesBtn');
    if (deselectAllDatesBtn) deselectAllDatesBtn.addEventListener('click', deselectAllTimelineDates);
    
    const inverseDatesBtn = document.getElementById('inverseDatesBtn');
    if (inverseDatesBtn) inverseDatesBtn.addEventListener('click', inverseSelectTimelineDates);
    
    const dateFilterInput = document.getElementById('dateFilterInput');
    if (dateFilterInput) {
        dateFilterInput.addEventListener('input', debounce(() => buildDatePicker(true), 150));
    }
}

// 导出函数
window.timelineState = timelineState;
window.updateTimelineRuleSelect = updateTimelineRuleSelect;
window.refreshTimelineCharts = refreshTimelineCharts;
window.selectTimelineChartType = selectTimelineChartType;
window.updateTimelineProjectStats = updateTimelineProjectStats;
window.updateTimelineDateInfo = updateTimelineDateInfo;
window.pendingSelectedDates = pendingSelectedDates;