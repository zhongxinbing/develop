/**
 * 时序曲线图模块 - 统一折线图样式（与多线程对比图一致）
 */

// 时序曲线图全局变量
const timelineState = {
    currentProjectId: null,
    currentRule: null,
    selectedDates: [],
    availableDates: [],
    currentChartType: 'runtime',
    cachedToolData: {},
    mrUpdateDates: {},
    availableThreads: [],      // 可用的线程列表
    selectedThreads: []        // 选中的线程
};

let pendingSelectedDates = [];

// ==================================================
// 辅助函数
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
    
    // 获取规则数据并提取可用线程
    const ruleData = projectData.rule_data[timelineState.currentRule];
    if (ruleData && ruleData.thread_metrics) {
        // 更新可用线程列表
        const threadIds = Object.keys(ruleData.thread_metrics);
        timelineState.availableThreads = threadIds.sort((a, b) => parseInt(a) - parseInt(b));
        
        // 同步选中线程（保留已选中的线程）
        if (timelineState.selectedThreads.length === 0) {
            timelineState.selectedThreads = [...timelineState.availableThreads];
        } else {
            timelineState.selectedThreads = timelineState.selectedThreads.filter(
                t => timelineState.availableThreads.includes(t)
            );
            if (timelineState.selectedThreads.length === 0 && timelineState.availableThreads.length > 0) {
                timelineState.selectedThreads = [timelineState.availableThreads[0]];
            }
        }
    }
    
    timelineState.cachedToolData[timelineState.currentRule] = {
        projectId: timelineState.currentProjectId,
        data: ruleData
    };
    
    return ruleData;
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
        updateTimelineDateInfo();
        updateTimelineThreadInfo();  // 更新线程信息
        refreshTimelineCharts();
    }
}

// ==================================================
// 日期选择
// ==================================================

function updateTimelineDateInfo() {
    const projectData = getCurrentTimelineProjectData();
    if (!projectData) {
        timelineState.availableDates = [];
        timelineState.selectedDates = [];
        const dateRangeSpan = document.getElementById('dateRange');
        if (dateRangeSpan) dateRangeSpan.innerText = '无';
        const dataPointsSpan = document.getElementById('dataPoints');
        if (dataPointsSpan) dataPointsSpan.innerText = '0';
        return;
    }
    
    timelineState.availableDates = projectData.available_dates || projectData.dates || [];
    
    // 确保选中的日期在可用日期范围内
    if (timelineState.selectedDates.length === 0 && timelineState.availableDates.length > 0) {
        timelineState.selectedDates = timelineState.availableDates.slice(-51);
    } else {
        const availableSet = new Set(timelineState.availableDates);
        timelineState.selectedDates = timelineState.selectedDates.filter(date => availableSet.has(date));
        if (timelineState.selectedDates.length === 0 && timelineState.availableDates.length > 0) {
            timelineState.selectedDates = timelineState.availableDates.slice(-51);
        }
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

// ==================================================
// 线程信息更新
// ==================================================

function updateTimelineThreadInfo() {
    // 获取当前阶段的数据，这会自动更新 availableThreads
    getCurrentTimelineToolData();
    
    // 可选：更新线程选择UI（如果需要）
    const threadInfoSpan = document.getElementById('timelineThreadInfo');
    if (threadInfoSpan) {
        if (timelineState.availableThreads.length > 1) {
            const selectedInfo = timelineState.selectedThreads.length === timelineState.availableThreads.length 
                ? '全部' 
                : timelineState.selectedThreads.length;
            threadInfoSpan.innerHTML = `🧵 线程: ${selectedInfo}/${timelineState.availableThreads.length}`;
        } else {
            threadInfoSpan.innerHTML = '';
        }
    }
}

function openTimelineDatePickerModal() {
    if (!timelineState.availableDates || timelineState.availableDates.length === 0) {
        showNotification('暂无可用日期', true);
        return;
    }
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
// 图表类型切换
// ==================================================

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

function selectTimelineChartType(type) {
    if (timelineState.currentChartType === type) return;
    timelineState.currentChartType = type;
    updateTimelineChartTypeButtons();
    refreshTimelineCharts();
}

// ==================================================
// 图表渲染 - 与多线程对比图样式完全一致
// ==================================================

function renderTimelineChart(chartType, dataKey, yAxisName) {
    const toolData = getCurrentTimelineToolData();
    
    if (!toolData) {
        const chart = ChartManager.get(`chart-${chartType}`);
        if (chart && !chart.isDisposed()) {
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
        if (chart && !chart.isDisposed()) {
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
    
    // 使用选中的线程
    const selectedThreadsSet = new Set(timelineState.selectedThreads);
    const threadIds = Object.keys(threadMetrics)
        .filter(tid => selectedThreadsSet.has(tid))
        .sort((a, b) => parseInt(a) - parseInt(b));
    
    const seriesList = [];
    const allValues = [];
    const palette = ['#6366f1', '#f59e0b', '#10b981', '#ef4444', '#06b6d4', '#8b5cf6', '#ec4899', '#84cc16'];
    
    threadIds.forEach((threadId, index) => {
        const threadInfo = threadMetrics[threadId];
        let values = threadInfo?.[dataKey] || [];
        
        const originalDates = toolData.dates || [];
        const seriesData = dates.map((selectedDate, idx) => {
            const dateIndex = originalDates.indexOf(selectedDate);
            let value = null;
            if (dateIndex !== -1 && values[dateIndex] !== undefined) {
                value = values[dateIndex];
                if (value !== null && value !== undefined && value > 0) allValues.push(value);
            }
            
            const hasMr = hasMrUpdate(selectedDate);
            
            return {
                value: value,
                itemStyle: hasMr ? {
                    color: '#ef4444',
                    borderColor: '#ffffff',
                    borderWidth: 2
                } : undefined,
                symbol: 'circle',
                symbolSize: hasMr ? 10 : 6
            };
        });
        
        const threadLabel = threadId === '0' ? '线程0' : `线程 ${threadId}`;
        const seriesColor = palette[index % palette.length];
        
        seriesList.push({
            name: threadLabel,
            type: 'line',
            data: seriesData,
            smooth: false,
            lineStyle: { width: 2, color: seriesColor },
            areaStyle: { opacity: 0.08, color: seriesColor },
            connectNulls: true,
            showSymbol: true,
            symbol: 'circle',
            symbolSize: 6
        });
    });
    
    // 如果没有选中的线程，使用默认线程0
    if (seriesList.length === 0 && threadMetrics['0']) {
        const threadInfo = threadMetrics['0'];
        let values = threadInfo?.[dataKey] || [];
        const originalDates = toolData.dates || [];
        const seriesData = dates.map((selectedDate, idx) => {
            const dateIndex = originalDates.indexOf(selectedDate);
            let value = null;
            if (dateIndex !== -1 && values[dateIndex] !== undefined) {
                value = values[dateIndex];
                if (value !== null && value !== undefined && value > 0) allValues.push(value);
            }
            return value;
        });
        
        seriesList.push({
            name: '线程0',
            type: 'line',
            data: seriesData,
            smooth: false,
            lineStyle: { width: 2, color: palette[0] },
            areaStyle: { opacity: 0.08, color: palette[0] },
            connectNulls: true,
            showSymbol: true,
            symbol: 'circle',
            symbolSize: 6
        });
    }
    
    // 更新统计卡片
    if (chartType === timelineState.currentChartType) {
        const unit = dataKey === 'runtimes' ? '秒' : 'MB';
        const label = dataKey === 'runtimes' ? 'Runtime' : 'Memory';
        updateStatsCard('stats-main', allValues, unit, label);
    }
    
    // 计算平均值和参考线
    const avgValue = allValues.length > 0 
        ? (allValues.reduce((a, b) => a + b, 0) / allValues.length).toFixed(1) 
        : 0;
    
    let referenceValue = avgValue;
    if (dataKey === 'memories' && allValues.length > 0) {
        const sorted = [...allValues].sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        referenceValue = sorted[mid];
    }
    
    // 图例默认选中状态（默认只显示线程0或第一个选中的线程）
    const legendSelected = {};
    seriesList.forEach((series, idx) => {
        legendSelected[series.name] = (idx === 0);
    });
    legendSelected['平均值'] = true;
    legendSelected['参考线'] = true;
    
    // Tooltip格式化函数
    const tooltipFormatter = (params) => {
        if (!params?.length) return '';
        const unit = dataKey === 'runtimes' ? '秒' : 'MB';
        const date = params[0].axisValue;
        const rows = params.map(p => {
            if (p.value === null || p.value === undefined) {
                return `<div>${p.seriesName}: N/A</div>`;
            }
            let displayValue = dataKey === 'runtimes' 
                ? p.value.toFixed(2) 
                : (p.value >= 1024 ? (p.value / 1024).toFixed(2) + ' GB' : p.value.toFixed(0));
            return `<div>${p.seriesName}: ${displayValue} ${unit}</div>`;
        }).join('');
        const mrComment = getMrComment(date);
        const hasMr = mrComment !== '';
        const mrStyle = hasMr ? 'color: #ef4444; font-weight: bold;' : 'color: #94a3b8;';
        const mrIcon = hasMr ? '🔴' : '⚪';
        return `<strong>📅 ${date}</strong>${rows}<div style="margin-top: 6px; padding-top: 4px; border-top: 1px solid #334155;"><span style="${mrStyle}">${mrIcon} ${hasMr ? mrComment : '无MR更新'}</span></div>`;
    };
    
    const option = {
        backgroundColor: 'transparent',
        tooltip: {
            trigger: 'axis',
            backgroundColor: 'rgba(30, 41, 59, 0.95)',
            borderWidth: 1,
            textStyle: { color: '#f1f5f9', fontSize: 12 },
            formatter: tooltipFormatter
        },
        grid: {
            left: '8%',
            right: '8%',
            top: '18%',
            bottom: '10%',
            containLabel: true
        },
        xAxis: {
            type: 'category',
            name: '日期',
            data: dates,
            axisLabel: {
                rotate: dates.length > 10 ? 30 : 0,
                color: '#94a3b8',
                fontSize: 11
            },
            axisLine: { lineStyle: { color: '#475569' } },
            boundaryGap: [0, "5%"] // 固定留白边界，避免曲线紧贴边线
        },
        yAxis: {
            type: 'value',
            name: yAxisName,
            nameTextStyle: { color: '#cbd5e1', fontSize: 12 },
            axisLabel: {
                color: '#94a3b8',
                fontSize: 11,
                formatter: (value) => {
                    if (dataKey === 'memories' && value >= 1024) {
                        return (value / 1024).toFixed(1) + ' GB';
                    }
                    if (dataKey === 'runtimes') {
                        return value.toFixed(2);
                    }
                    return value;
                }
            },
            splitLine: {
                lineStyle: { color: 'rgba(71, 85, 105, 0.3)', type: 'dashed' }
            }
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
            },
            {
                name: '参考线',
                type: 'line',
                data: new Array(dates.length).fill(parseFloat(referenceValue)),
                lineStyle: { width: 1, color: '#06b6d4', type: 'dotted' },
                symbol: 'none',
                tooltip: { show: true, formatter: () => `📊 参考线: ${referenceValue.toFixed(2)} ${dataKey === 'runtimes' ? '秒' : 'MB'}` }
            }
        ],
        legend: {
            data: seriesList.map(s => s.name).concat(['平均值', '参考线']),
            selected: legendSelected,
            textStyle: { color: '#cbd5e1', fontSize: 11 },
            orient: 'horizontal',
            right: 10,
            top: 0,
            itemWidth: 25,
            itemHeight: 12
        },
        toolbox: {
            feature: {
                saveAsImage: { title: '保存为图片' },
                zoom: { title: { zoom: '区域缩放', back: '还原' } },
                restore: { title: '重置' }
            },
            iconStyle: { borderColor: '#94a3b8' },
            right: 10,
            bottom: 10
        }
    };
    
    const chart = ChartManager.get(`chart-${chartType}`);
    if (chart && !chart.isDisposed()) {
        chart.setOption(option, { notMerge: true, lazyUpdate: false });
        setTimeout(() => addLegendControlButtons(chart, `chart-${chartType}`), 50);
    }
}

// ==================================================
// 刷新图表
// ==================================================

function refreshTimelineCharts() {
    if (!timelineState.currentRule) return;
    
    // 先确保容器尺寸正确
    const runtimeContainer = document.getElementById('chart-runtime');
    const memoryContainer = document.getElementById('chart-memory');
    
    if (charts.runtime && runtimeContainer && runtimeContainer.offsetWidth > 0) {
        charts.runtime.resize();
    }
    if (charts.memory && memoryContainer && memoryContainer.offsetWidth > 0) {
        charts.memory.resize();
    }
    
    // 渲染图表
    renderTimelineChart('runtime', 'runtimes', 'Runtime (秒)');
    renderTimelineChart('memory', 'memories', 'Memory (MB)');
    updateTimelineChartTypeButtons();
    
    // 确保尺寸正确
    setTimeout(() => {
        if (charts.runtime && !charts.runtime.isDisposed()) {
            charts.runtime.resize();
        }
        if (charts.memory && !charts.memory.isDisposed()) {
            charts.memory.resize();
        }
        if (typeof ChartManager !== 'undefined' && ChartManager.resizeAll) {
            ChartManager.resizeAll();
        }
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
            timelineState.selectedThreads = [];      // 重置线程选择
            timelineState.availableThreads = [];     // 重置可用线程
            updateTimelineRuleSelect();
            updateTimelineProjectStats();
            updateTimelineDateInfo();
            updateTimelineThreadInfo();
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
            updateTimelineThreadInfo();
        });
    }
    
    const ruleSearch = document.getElementById('ruleSearch');
    if (ruleSearch) {
        ruleSearch.addEventListener('input', debounce(() => updateTimelineRuleSelect(), 300));
    }
    
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
window.updateTimelineThreadInfo = updateTimelineThreadInfo;
window.pendingSelectedDates = pendingSelectedDates;