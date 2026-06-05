// file: static/js/single-thread.js
/**
 * 单线程曲线图模块
 * 数据来源：工具配置中的 single_original_path（只有单线程数据）
 */

// 单线程曲线图全局变量
const singleThreadState = {
    currentProjectId: null,
    currentRule: null,
    selectedDates: [],
    availableDates: [],
    currentChartType: 'runtime',
    cachedToolData: {},
    mrUpdateDates: {}
};

let singlePendingSelectedDates = [];

// ==================================================
// 辅助函数
// ==================================================

function getSingleThreadProjectData() {
    return window.projectsData?.[singleThreadState.currentProjectId];
}

function getSingleThreadToolData() {
    if (!singleThreadState.currentRule) return null;
    
    const cache = singleThreadState.cachedToolData[singleThreadState.currentRule];
    if (cache && cache.projectId === singleThreadState.currentProjectId) {
        return cache.data;
    }
    
    const projectData = getSingleThreadProjectData();
    if (!projectData?.rule_data?.[singleThreadState.currentRule]) return null;
    
    // 获取规则数据（单线程数据，只有线程0）
    const ruleData = projectData.rule_data[singleThreadState.currentRule];
    
    singleThreadState.cachedToolData[singleThreadState.currentRule] = {
        projectId: singleThreadState.currentProjectId,
        data: ruleData
    };
    
    return ruleData;
}

function getFilteredSingleThreadData(toolData) {
    if (!toolData?.dates) return null;
    
    const filterSet = new Set(singleThreadState.selectedDates);
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
    const comment = singleThreadState.mrUpdateDates[date];
    return comment && comment !== 'undefined' && comment !== '' && comment !== 'None';
}

function getMrComment(date) {
    return singleThreadState.mrUpdateDates[date] || '';
}

// ==================================================
// 阶段选择
// ==================================================

function updateSingleThreadRuleSelect() {
    const projectData = getSingleThreadProjectData();
    if (!projectData) return;
    
    const rules = projectData.rules || [];
    const searchText = document.getElementById('singleRuleSearch')?.value.toLowerCase() || '';
    
    const filteredRules = searchText ? rules.filter(rule => rule.toLowerCase().includes(searchText)) : rules;
    
    const select = document.getElementById('singleRuleSelect');
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
            singleThreadState.currentRule = currentValue;
        } else if (filteredRules.length > 0 && !singleThreadState.currentRule) {
            select.value = filteredRules[0];
            singleThreadState.currentRule = filteredRules[0];
        }
    }
    
    if (singleThreadState.currentRule) {
        const ruleNameSpan = document.getElementById('singleCurrentRuleName');
        if (ruleNameSpan) ruleNameSpan.innerText = singleThreadState.currentRule;
        updateSingleThreadDateInfo();
        refreshSingleThreadCharts();
    }
}

// ==================================================
// 日期选择
// ==================================================

function updateSingleThreadDateInfo() {
    const projectData = getSingleThreadProjectData();
    if (!projectData) {
        singleThreadState.availableDates = [];
        singleThreadState.selectedDates = [];
        const dateRangeSpan = document.getElementById('singleDateRange');
        if (dateRangeSpan) dateRangeSpan.innerText = '无';
        const dataPointsSpan = document.getElementById('singleDataPoints');
        if (dataPointsSpan) dataPointsSpan.innerText = '0';
        return;
    }
    
    singleThreadState.availableDates = projectData.available_dates || projectData.dates || [];
    
    if (singleThreadState.selectedDates.length === 0 && singleThreadState.availableDates.length > 0) {
        singleThreadState.selectedDates = singleThreadState.availableDates.slice(-51);
    } else {
        const availableSet = new Set(singleThreadState.availableDates);
        singleThreadState.selectedDates = singleThreadState.selectedDates.filter(date => availableSet.has(date));
        if (singleThreadState.selectedDates.length === 0 && singleThreadState.availableDates.length > 0) {
            singleThreadState.selectedDates = singleThreadState.availableDates.slice(-51);
        }
    }
    
    const dateRangeSpan = document.getElementById('singleDateRange');
    if (dateRangeSpan) {
        dateRangeSpan.innerText = getDateRangeText(singleThreadState.selectedDates);
    }
    const dataPointsSpan = document.getElementById('singleDataPoints');
    if (dataPointsSpan) {
        dataPointsSpan.innerText = singleThreadState.selectedDates.length;
    }
}

function openSingleDatePickerModal() {
    if (!singleThreadState.availableDates || singleThreadState.availableDates.length === 0) {
        showNotification('暂无可用日期', true);
        return;
    }
    singlePendingSelectedDates = [...singleThreadState.selectedDates];
    buildSingleDatePicker(true);
    const modal = document.getElementById('singleDatePickerModal');
    if (modal) modal.classList.remove('hidden');
}

function closeSingleDatePickerModal() {
    const modal = document.getElementById('singleDatePickerModal');
    if (modal) modal.classList.add('hidden');
}

function buildSingleDatePicker(usePending = false) {
    const container = document.getElementById('singleDateOptionsContainer');
    if (!container) return;
    
    const currentSelection = usePending ? singlePendingSelectedDates : singleThreadState.selectedDates;
    const filterText = document.getElementById('singleDateFilterInput')?.value || '';
    const filteredDates = singleThreadState.availableDates.filter(date => 
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
                if (!singlePendingSelectedDates.includes(date)) singlePendingSelectedDates.push(date);
            } else {
                singlePendingSelectedDates = singlePendingSelectedDates.filter(d => d !== date);
            }
        });
    });
}

function confirmSingleDateSelection() {
    if (singlePendingSelectedDates.length === 0) {
        singlePendingSelectedDates = singleThreadState.availableDates.slice(-51);
    }
    singleThreadState.selectedDates = [...singlePendingSelectedDates];
    updateSingleThreadDateInfo();
    refreshSingleThreadCharts();
    closeSingleDatePickerModal();
}

function resetSingleDateSelection(useAll = false) {
    singleThreadState.selectedDates = useAll ? [...singleThreadState.availableDates] : singleThreadState.availableDates.slice(-51);
    updateSingleThreadDateInfo();
    refreshSingleThreadCharts();
}

function selectAllSingleDates() {
    const container = document.getElementById('singleDateOptionsContainer');
    if (!container) return;
    
    const checkboxes = container.querySelectorAll('input[type="checkbox"]');
    singlePendingSelectedDates = [];
    checkboxes.forEach(cb => {
        cb.checked = true;
        singlePendingSelectedDates.push(cb.value);
    });
}

function deselectAllSingleDates() {
    const container = document.getElementById('singleDateOptionsContainer');
    if (!container) return;
    
    const checkboxes = container.querySelectorAll('input[type="checkbox"]');
    singlePendingSelectedDates = [];
    checkboxes.forEach(cb => {
        cb.checked = false;
    });
}

function inverseSelectSingleDates() {
    const container = document.getElementById('singleDateOptionsContainer');
    if (!container) return;
    
    const checkboxes = container.querySelectorAll('input[type="checkbox"]');
    singlePendingSelectedDates = [];
    checkboxes.forEach(cb => {
        cb.checked = !cb.checked;
        if (cb.checked) {
            singlePendingSelectedDates.push(cb.value);
        }
    });
}

// ==================================================
// 图表类型切换
// ==================================================

function updateSingleChartTypeButtons() {
    const runtimeBtn = document.getElementById('singleChartRuntimeBtn');
    const memoryBtn = document.getElementById('singleChartMemoryBtn');
    
    if (runtimeBtn) {
        if (singleThreadState.currentChartType === 'runtime') {
            runtimeBtn.classList.add('btn-primary');
            runtimeBtn.classList.remove('btn-secondary');
        } else {
            runtimeBtn.classList.add('btn-secondary');
            runtimeBtn.classList.remove('btn-primary');
        }
    }
    if (memoryBtn) {
        if (singleThreadState.currentChartType === 'memory') {
            memoryBtn.classList.add('btn-primary');
            memoryBtn.classList.remove('btn-secondary');
        } else {
            memoryBtn.classList.add('btn-secondary');
            memoryBtn.classList.remove('btn-primary');
        }
    }
    
    const runtimeContainer = document.getElementById('single-chart-runtime');
    const memoryContainer = document.getElementById('single-chart-memory');
    if (runtimeContainer && memoryContainer) {
        if (singleThreadState.currentChartType === 'runtime') {
            runtimeContainer.classList.remove('hidden');
            memoryContainer.classList.add('hidden');
        } else {
            runtimeContainer.classList.add('hidden');
            memoryContainer.classList.remove('hidden');
        }
    }
    
    const chartCardTitle = document.getElementById('singleChartCardTitle');
    if (chartCardTitle) {
        chartCardTitle.innerText = singleThreadState.currentChartType === 'runtime' 
            ? '⏱️ Runtime 性能曲线 - 单线程数据' 
            : '💾 Memory 使用曲线 - 单线程数据';
    }
}

function selectSingleChartType(type) {
    if (singleThreadState.currentChartType === type) return;
    singleThreadState.currentChartType = type;
    updateSingleChartTypeButtons();
    refreshSingleThreadCharts();
}

// ==================================================
// 图表渲染
// ==================================================

function renderSingleThreadChart(chartType, dataKey, yAxisName) {
    const toolData = getSingleThreadToolData();
    
    if (!toolData) {
        const chart = charts[`single-${chartType}`];
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
    
    const filteredData = getFilteredSingleThreadData(toolData);
    if (!filteredData || filteredData.dates.length === 0) {
        const chart = charts[`single-${chartType}`];
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
    const values = filteredData[dataKey];
    const allValues = values.filter(v => v !== null && v !== undefined && v > 0);
    
    const seriesData = dates.map((date, idx) => {
        let value = values[idx];
        const hasMr = hasMrUpdate(date);
        
        if (value !== null && value !== undefined && value > 0 && allValues.indexOf(value) === -1) {
            allValues.push(value);
        }
        
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
    
    // 更新统计卡片
    if (chartType === singleThreadState.currentChartType) {
        const unit = dataKey === 'runtimes' ? '秒' : 'MB';
        const label = dataKey === 'runtimes' ? 'Runtime' : 'Memory';
        updateStatsCard('singleStatsMain', allValues, unit, label);
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
    
    const tooltipFormatter = (params) => {
        if (!params?.length) return '';
        const unit = dataKey === 'runtimes' ? '秒' : 'MB';
        const date = params[0].axisValue;
        let value = params[0].value;
        let displayValue = (value !== null && value !== undefined) ? 
            (dataKey === 'runtimes' ? value.toFixed(2) : 
             (value >= 1024 ? (value / 1024).toFixed(2) + ' GB' : value.toFixed(2))) : 'N/A';
        
        const mrComment = getMrComment(date);
        const hasMr = mrComment !== '';
        const mrStyle = hasMr ? 'color: #ef4444; font-weight: bold;' : 'color: #94a3b8;';
        const mrIcon = hasMr ? '🔴' : '⚪';
        return `<div><strong>📅 ${date}</strong></div>
                <div>${displayValue} ${unit}</div>
                <div style="margin-top: 6px; padding-top: 4px; border-top: 1px solid #334155;">
                    <span style="${mrStyle}">${mrIcon} ${hasMr ? mrComment : '无MR更新'}</span>
                </div>`;
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
            boundaryGap: [0, "5%"]
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
            {
                name: dataKey === 'runtimes' ? 'Runtime' : 'Memory',
                type: 'line',
                data: seriesData,
                smooth: false,
                lineStyle: { width: 2, color: '#6366f1' },
                areaStyle: { opacity: 0.08, color: '#6366f1' },
                connectNulls: true,
                showSymbol: true,
                symbol: 'circle',
                symbolSize: 6
            },
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
            data: [dataKey === 'runtimes' ? 'Runtime' : 'Memory', '平均值', '参考线'],
            selected: { [dataKey === 'runtimes' ? 'Runtime' : 'Memory']: true, '平均值': true, '参考线': true },
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
    
    const chart = charts[`single-${chartType}`];
    if (chart && !chart.isDisposed()) {
        chart.setOption(option, { notMerge: true, lazyUpdate: false });
    }
}

function refreshSingleThreadCharts() {
    if (!singleThreadState.currentRule) return;
    
    // 确保容器尺寸正确
    const runtimeContainer = document.getElementById('single-chart-runtime');
    const memoryContainer = document.getElementById('single-chart-memory');
    
    if (charts['single-runtime'] && runtimeContainer && runtimeContainer.offsetWidth > 0) {
        charts['single-runtime'].resize();
    }
    if (charts['single-memory'] && memoryContainer && memoryContainer.offsetWidth > 0) {
        charts['single-memory'].resize();
    }
    
    renderSingleThreadChart('runtime', 'runtimes', 'Runtime (秒)');
    renderSingleThreadChart('memory', 'memories', 'Memory (MB)');
    updateSingleChartTypeButtons();
    
    setTimeout(() => {
        if (charts['single-runtime'] && !charts['single-runtime'].isDisposed()) {
            charts['single-runtime'].resize();
        }
        if (charts['single-memory'] && !charts['single-memory'].isDisposed()) {
            charts['single-memory'].resize();
        }
    }, 100);
}

function updateSingleProjectStats() {
    const projectData = getSingleThreadProjectData();
    if (!projectData) return;
    
    const statsContainer = document.getElementById('singleProjectStats');
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

function bindSingleThreadEvents() {
    const caseSelect = document.getElementById('singleCaseSelect');
    if (caseSelect) {
        caseSelect.addEventListener('change', (e) => {
            singleThreadState.currentProjectId = e.target.value;
            singleThreadState.currentRule = null;
            singleThreadState.cachedToolData = {};
            singleThreadState.selectedDates = [];
            updateSingleThreadRuleSelect();
            updateSingleProjectStats();
            updateSingleThreadDateInfo();
        });
    }
    
    const ruleSelect = document.getElementById('singleRuleSelect');
    if (ruleSelect) {
        ruleSelect.addEventListener('change', (e) => {
            singleThreadState.currentRule = e.target.value;
            if (singleThreadState.currentRule) {
                const ruleNameSpan = document.getElementById('singleCurrentRuleName');
                if (ruleNameSpan) ruleNameSpan.innerText = singleThreadState.currentRule;
                refreshSingleThreadCharts();
            }
        });
    }
    
    const ruleSearch = document.getElementById('singleRuleSearch');
    if (ruleSearch) {
        ruleSearch.addEventListener('input', debounce(() => updateSingleThreadRuleSelect(), 300));
    }
    
    const runtimeBtn = document.getElementById('singleChartRuntimeBtn');
    if (runtimeBtn) runtimeBtn.addEventListener('click', () => selectSingleChartType('runtime'));
    const memoryBtn = document.getElementById('singleChartMemoryBtn');
    if (memoryBtn) memoryBtn.addEventListener('click', () => selectSingleChartType('memory'));
    
    const openDatePickerBtn = document.getElementById('singleOpenDatePickerBtn');
    if (openDatePickerBtn) openDatePickerBtn.addEventListener('click', openSingleDatePickerModal);
    
    const closeDateModalBtn = document.getElementById('singleCloseDateModalBtn');
    if (closeDateModalBtn) closeDateModalBtn.addEventListener('click', closeSingleDatePickerModal);
    
    const confirmDateBtn = document.getElementById('singleConfirmDateBtn');
    if (confirmDateBtn) confirmDateBtn.addEventListener('click', confirmSingleDateSelection);
    
    const selectRecentBtn = document.getElementById('singleSelectRecentBtn');
    if (selectRecentBtn) selectRecentBtn.addEventListener('click', () => resetSingleDateSelection(false));
    
    const selectAllDatesBtn = document.getElementById('singleSelectAllDatesBtn');
    if (selectAllDatesBtn) selectAllDatesBtn.addEventListener('click', selectAllSingleDates);
    
    const deselectAllDatesBtn = document.getElementById('singleDeselectAllDatesBtn');
    if (deselectAllDatesBtn) deselectAllDatesBtn.addEventListener('click', deselectAllSingleDates);
    
    const inverseDatesBtn = document.getElementById('singleInverseDatesBtn');
    if (inverseDatesBtn) inverseDatesBtn.addEventListener('click', inverseSelectSingleDates);
    
    const dateFilterInput = document.getElementById('singleDateFilterInput');
    if (dateFilterInput) {
        dateFilterInput.addEventListener('input', debounce(() => buildSingleDatePicker(true), 150));
    }
}

// 导出函数
window.singleThreadState = singleThreadState;
window.updateSingleThreadRuleSelect = updateSingleThreadRuleSelect;
window.refreshSingleThreadCharts = refreshSingleThreadCharts;
window.selectSingleChartType = selectSingleChartType;
window.updateSingleProjectStats = updateSingleProjectStats;
window.updateSingleThreadDateInfo = updateSingleThreadDateInfo;