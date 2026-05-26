/**
 * 时序曲线图模块
 */

// 时序曲线图全局变量
let timelineState = {
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

/**
 * 获取当前选中的项目数据
 * @returns {object} 项目数据
 */
function getCurrentTimelineProjectData() {
    return window.projectsData?.[timelineState.currentProjectId];
}

/**
 * 获取当前选中的工具数据（带缓存）
 * @returns {object} 工具数据
 */
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

/**
 * 获取过滤后的工具数据
 * @param {object} toolData - 工具数据
 * @returns {object} 过滤后的数据
 */
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

/**
 * 检查日期是否有MR更新
 * @param {string} date - 日期
 * @returns {boolean}
 */
function hasMrUpdate(date) {
    const comment = timelineState.mrUpdateDates[date];
    return comment && comment !== 'undefined' && comment !== '' && comment !== 'None';
}

/**
 * 获取MR更新评论
 * @param {string} date - 日期
 * @returns {string}
 */
function getMrComment(date) {
    return timelineState.mrUpdateDates[date] || '';
}

// ==================================================
// 阶段选择
// ==================================================

/**
 * 更新阶段选择下拉框
 */
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
        refreshTimelineCharts();
    }
}

// ==================================================
// 日期选择
// ==================================================

/**
 * 更新日期选择信息
 */
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

/**
 * 打开日期选择模态框
 */
function openTimelineDatePickerModal() {
    pendingSelectedDates = [...timelineState.selectedDates];
    buildDatePicker(true);
    const modal = document.getElementById('datePickerModal');
    if (modal) modal.classList.remove('hidden');
}

/**
 * 关闭日期选择模态框
 */
function closeTimelineDatePickerModal() {
    const modal = document.getElementById('datePickerModal');
    if (modal) modal.classList.add('hidden');
}

/**
 * 构建日期选择器
 */
function buildDatePicker(usePending = false) {
    const container = document.getElementById('dateOptionsContainer');
    if (!container) return;
    
    const currentSelection = usePending ? window.pendingSelectedDates : timelineState.selectedDates;
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
                if (!window.pendingSelectedDates.includes(date)) window.pendingSelectedDates.push(date);
            } else {
                window.pendingSelectedDates = window.pendingSelectedDates.filter(d => d !== date);
            }
        });
    });
}

/**
 * 确认日期选择
 */
function confirmTimelineDateSelection() {
    if (window.pendingSelectedDates.length === 0) {
        window.pendingSelectedDates = timelineState.availableDates.slice(-51);
    }
    timelineState.selectedDates = [...window.pendingSelectedDates];
    updateTimelineDateInfo();
    refreshTimelineCharts();
    closeTimelineDatePickerModal();
}

/**
 * 重置日期选择
 */
function resetTimelineDateSelection(useAll = false) {
    timelineState.selectedDates = useAll ? [...timelineState.availableDates] : timelineState.availableDates.slice(-51);
    updateTimelineDateInfo();
    refreshTimelineCharts();
}

/**
 * 全选所有日期
 */
function selectAllTimelineDates() {
    const container = document.getElementById('dateOptionsContainer');
    if (!container) return;
    
    const checkboxes = container.querySelectorAll('input[type="checkbox"]');
    window.pendingSelectedDates = [];
    checkboxes.forEach(cb => {
        cb.checked = true;
        window.pendingSelectedDates.push(cb.value);
    });
}

/**
 * 全不选所有日期
 */
function deselectAllTimelineDates() {
    const container = document.getElementById('dateOptionsContainer');
    if (!container) return;
    
    const checkboxes = container.querySelectorAll('input[type="checkbox"]');
    window.pendingSelectedDates = [];
    checkboxes.forEach(cb => {
        cb.checked = false;
    });
}

/**
 * 反选日期
 */
function inverseSelectTimelineDates() {
    const container = document.getElementById('dateOptionsContainer');
    if (!container) return;
    
    const checkboxes = container.querySelectorAll('input[type="checkbox"]');
    window.pendingSelectedDates = [];
    checkboxes.forEach(cb => {
        cb.checked = !cb.checked;
        if (cb.checked) {
            window.pendingSelectedDates.push(cb.value);
        }
    });
}

// ==================================================
// 图表类型切换
// ==================================================

/**
 * 更新图表类型按钮状态
 */
function updateTimelineChartTypeButtons() {
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
        chartCardTitle.innerText = timelineState.currentChartType === 'runtime' 
            ? '⏱️ Runtime 性能曲线' 
            : '💾 Memory 使用曲线';
    }
    
    const chart = timelineState.currentChartType === 'runtime' 
        ? ChartManager.get('chart-runtime') 
        : ChartManager.get('chart-memory');
    if (chart) chart.resize();
}

/**
 * 切换图表类型
 * @param {string} type - 图表类型 (runtime/memory)
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

/**
 * 渲染时序曲线图
 * @param {string} chartType - 图表类型
 * @param {string} dataKey - 数据键名
 * @param {string} color - 颜色
 * @param {string} yAxisName - Y轴名称
 */
function renderTimelineChart(chartType, dataKey, color, yAxisName) {
    const toolData = getCurrentTimelineToolData();
    if (!toolData) {
        const chart = ChartManager.get(`chart-${chartType}`);
        if (chart) chart.clear();
        return;
    }
    
    const filteredData = getFilteredTimelineData(toolData);
    if (!filteredData || filteredData.dates.length === 0) {
        const chart = ChartManager.get(`chart-${chartType}`);
        if (chart) chart.clear();
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
                itemStyle: hasMr ? {
                    color: '#ef4444',
                    borderColor: '#ffffff',
                    borderWidth: 2
                } : undefined,
                symbol: 'circle',
                symbolSize: hasMr ? 10 : 6
            };
        });
        
        const threadLabel = threadId === '0' ? '线程0' : `其他线程${threadId}`;
        seriesList.push(ChartConfig.getSeriesConfig(threadLabel, seriesData, getPaletteColor(index)));
    });
    
    // 更新统计
    if (chartType === timelineState.currentChartType) {
        const unit = dataKey === 'runtimes' ? '秒' : 'MB';
        const label = dataKey === 'runtimes' ? 'Runtime' : 'Memory';
        updateStatsCard('stats-main', allValues, unit, label);
    }
    
    const avgValue = allValues.length > 0 
        ? (allValues.reduce((a, b) => a + b, 0) / allValues.length).toFixed(1) 
        : 0;
    
    // 图例默认选中状态
    const legendSelected = {};
    threadIds.forEach(threadId => {
        const seriesName = threadId === '0' ? '线程0' : `其他线程${threadId}`;
        legendSelected[seriesName] = (threadId === '0');
    });
    
    // Tooltip格式化
    const tooltipFormatter = (params) => {
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
        ...ChartConfig.getBaseConfig(),
        tooltip: ChartConfig.getTooltipConfig(dataKey === 'runtimes' ? '秒' : 'MB', tooltipFormatter),
        xAxis: ChartConfig.getXAxisConfig(dates),
        yAxis: ChartConfig.getYAxisConfig(yAxisName, dataKey === 'memories' ? 'MB' : ''),
        series: [...seriesList, ChartConfig.getAverageLineConfig(dates, avgValue)],
        legend: ChartConfig.getLegendConfig(seriesList.map(s => s.name), legendSelected)
    };
    
    const chart = ChartManager.get(`chart-${chartType}`);
    if (chart) {
        chart.setOption(option, { notMerge: false, lazyUpdate: true });
    }
}

/**
 * 刷新时序曲线图
 */
function refreshTimelineCharts() {
    if (!timelineState.currentRule) return;
    
    renderTimelineChart('runtime', 'runtimes', '#6366f1', 'Runtime (秒)');
    renderTimelineChart('memory', 'memories', '#10b981', 'Memory (MB)');
    updateTimelineChartTypeButtons();
    
    // 添加图表 resize 确保正确显示
    setTimeout(() => {
        if (charts.runtime) charts.runtime.resize();
        if (charts.memory) charts.memory.resize();
        addLegendControlButtons(ChartManager.get('chart-runtime'));
    }, 100);
}

// ==================================================
// 项目统计
// ==================================================

/**
 * 更新项目统计卡片
 */
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

/**
 * 绑定时序曲线图事件
 */
function bindTimelineEvents() {
    // 项目选择
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
    
    // 规则选择
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
    
    // 规则搜索
    const ruleSearch = document.getElementById('ruleSearch');
    if (ruleSearch) {
        ruleSearch.addEventListener('input', debounce(() => updateTimelineRuleSelect(), 300));
    }
    
    // 图表类型切换
    const chartTypeBtns = document.querySelectorAll('#chartTypeButtons .chart-type-btn');
    chartTypeBtns.forEach(btn => {
        btn.addEventListener('click', () => selectTimelineChartType(btn.dataset.type));
    });
    
    // 日期选择按钮
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
window.pendingSelectedDates = [];