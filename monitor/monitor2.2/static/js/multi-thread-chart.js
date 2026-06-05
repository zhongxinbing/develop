// file: static/js/multi-thread-chart.js
/**
 * 多线程曲线图模块
 * 数据来源：工具配置中的 multi_original_path（包含单线程和多线程数据）
 */

// 多线程曲线图全局变量
const multiThreadState = {
    currentProjectId: null,
    currentRule: null,
    selectedDates: [],
    availableDates: [],
    currentChartType: 'runtime',
    cachedToolData: {},
    mrUpdateDates: {},
    availableThreads: [],
    selectedThreads: []
};

let multiThreadPendingSelectedDates = [];

// ==================================================
// 辅助函数
// ==================================================

function getMultiThreadProjectData() {
    return window.projectsData?.[multiThreadState.currentProjectId];
}

function getMultiThreadToolData() {
    if (!multiThreadState.currentRule) return null;
    
    const cache = multiThreadState.cachedToolData[multiThreadState.currentRule];
    if (cache && cache.projectId === multiThreadState.currentProjectId) {
        return cache.data;
    }
    
    const projectData = getMultiThreadProjectData();
    if (!projectData?.rule_data?.[multiThreadState.currentRule]) return null;
    
    const ruleData = projectData.rule_data[multiThreadState.currentRule];
    
    // 提取可用线程
    if (ruleData && ruleData.thread_metrics) {
        const threadIds = Object.keys(ruleData.thread_metrics);
        multiThreadState.availableThreads = threadIds.sort((a, b) => parseInt(a) - parseInt(b));
        
        if (multiThreadState.selectedThreads.length === 0) {
            multiThreadState.selectedThreads = [...multiThreadState.availableThreads];
        } else {
            multiThreadState.selectedThreads = multiThreadState.selectedThreads.filter(
                t => multiThreadState.availableThreads.includes(t)
            );
            if (multiThreadState.selectedThreads.length === 0 && multiThreadState.availableThreads.length > 0) {
                multiThreadState.selectedThreads = [multiThreadState.availableThreads[0]];
            }
        }
    }
    
    multiThreadState.cachedToolData[multiThreadState.currentRule] = {
        projectId: multiThreadState.currentProjectId,
        data: ruleData
    };
    
    return ruleData;
}

function getFilteredMultiThreadData(toolData) {
    if (!toolData?.dates) return null;
    
    const filterSet = new Set(multiThreadState.selectedDates);
    const filtered = {
        dates: [],
        thread_metrics: {}
    };
    
    toolData.dates.forEach((date, index) => {
        if (filterSet.has(date)) {
            filtered.dates.push(date);
        }
    });
    
    // 为每个线程过滤数据
    for (const [threadId, threadInfo] of Object.entries(toolData.thread_metrics || {})) {
        filtered.thread_metrics[threadId] = {
            runtimes: [],
            memories: [],
            cores: []
        };
        
        toolData.dates.forEach((date, idx) => {
            if (filterSet.has(date)) {
                filtered.thread_metrics[threadId].runtimes.push(threadInfo.runtimes?.[idx] ?? null);
                filtered.thread_metrics[threadId].memories.push(threadInfo.memories?.[idx] ?? null);
                filtered.thread_metrics[threadId].cores.push(threadInfo.cores?.[idx] ?? null);
            }
        });
    }
    
    return filtered;
}

function hasMrUpdate(date) {
    const comment = multiThreadState.mrUpdateDates[date];
    return comment && comment !== 'undefined' && comment !== '' && comment !== 'None';
}

function getMrComment(date) {
    return multiThreadState.mrUpdateDates[date] || '';
}

// ==================================================
// 阶段选择
// ==================================================

function updateMultiThreadRuleSelect() {
    const projectData = getMultiThreadProjectData();
    if (!projectData) return;
    
    const rules = projectData.rules || [];
    const searchText = document.getElementById('multiThreadRuleSearch')?.value.toLowerCase() || '';
    
    const filteredRules = searchText ? rules.filter(rule => rule.toLowerCase().includes(searchText)) : rules;
    
    const select = document.getElementById('multiThreadRuleSelect');
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
            multiThreadState.currentRule = currentValue;
        } else if (filteredRules.length > 0 && !multiThreadState.currentRule) {
            select.value = filteredRules[0];
            multiThreadState.currentRule = filteredRules[0];
        }
    }
    
    if (multiThreadState.currentRule) {
        const ruleNameSpan = document.getElementById('multiThreadCurrentRuleName');
        if (ruleNameSpan) ruleNameSpan.innerText = multiThreadState.currentRule;
        updateMultiThreadDateInfo();
        updateMultiThreadThreadInfo();
        refreshMultiThreadCharts();
    }
}

// ==================================================
// 日期选择
// ==================================================

function updateMultiThreadDateInfo() {
    const projectData = getMultiThreadProjectData();
    if (!projectData) {
        multiThreadState.availableDates = [];
        multiThreadState.selectedDates = [];
        const dateRangeSpan = document.getElementById('multiThreadDateRange');
        if (dateRangeSpan) dateRangeSpan.innerText = '无';
        const dataPointsSpan = document.getElementById('multiThreadDataPoints');
        if (dataPointsSpan) dataPointsSpan.innerText = '0';
        return;
    }
    
    multiThreadState.availableDates = projectData.available_dates || projectData.dates || [];
    
    if (multiThreadState.selectedDates.length === 0 && multiThreadState.availableDates.length > 0) {
        multiThreadState.selectedDates = multiThreadState.availableDates.slice(-51);
    } else {
        const availableSet = new Set(multiThreadState.availableDates);
        multiThreadState.selectedDates = multiThreadState.selectedDates.filter(date => availableSet.has(date));
        if (multiThreadState.selectedDates.length === 0 && multiThreadState.availableDates.length > 0) {
            multiThreadState.selectedDates = multiThreadState.availableDates.slice(-51);
        }
    }
    
    const dateRangeSpan = document.getElementById('multiThreadDateRange');
    if (dateRangeSpan) {
        dateRangeSpan.innerText = getDateRangeText(multiThreadState.selectedDates);
    }
    const dataPointsSpan = document.getElementById('multiThreadDataPoints');
    if (dataPointsSpan) {
        dataPointsSpan.innerText = multiThreadState.selectedDates.length;
    }
}

function openMultiThreadDatePickerModal() {
    if (!multiThreadState.availableDates || multiThreadState.availableDates.length === 0) {
        showNotification('暂无可用日期', true);
        return;
    }
    multiThreadPendingSelectedDates = [...multiThreadState.selectedDates];
    buildMultiThreadDatePicker(true);
    const modal = document.getElementById('multiThreadDatePickerModal');
    if (modal) modal.classList.remove('hidden');
}

function closeMultiThreadDatePickerModal() {
    const modal = document.getElementById('multiThreadDatePickerModal');
    if (modal) modal.classList.add('hidden');
}

function buildMultiThreadDatePicker(usePending = false) {
    const container = document.getElementById('multiThreadDateOptionsContainer');
    if (!container) return;
    
    const currentSelection = usePending ? multiThreadPendingSelectedDates : multiThreadState.selectedDates;
    const filterText = document.getElementById('multiThreadDateFilterInput')?.value || '';
    const filteredDates = multiThreadState.availableDates.filter(date => 
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
                if (!multiThreadPendingSelectedDates.includes(date)) multiThreadPendingSelectedDates.push(date);
            } else {
                multiThreadPendingSelectedDates = multiThreadPendingSelectedDates.filter(d => d !== date);
            }
        });
    });
}

function confirmMultiThreadDateSelection() {
    if (multiThreadPendingSelectedDates.length === 0) {
        multiThreadPendingSelectedDates = multiThreadState.availableDates.slice(-51);
    }
    multiThreadState.selectedDates = [...multiThreadPendingSelectedDates];
    updateMultiThreadDateInfo();
    refreshMultiThreadCharts();
    closeMultiThreadDatePickerModal();
}

function resetMultiThreadDateSelection(useAll = false) {
    multiThreadState.selectedDates = useAll ? [...multiThreadState.availableDates] : multiThreadState.availableDates.slice(-51);
    updateMultiThreadDateInfo();
    refreshMultiThreadCharts();
}

function selectAllMultiThreadDates() {
    const container = document.getElementById('multiThreadDateOptionsContainer');
    if (!container) return;
    
    const checkboxes = container.querySelectorAll('input[type="checkbox"]');
    multiThreadPendingSelectedDates = [];
    checkboxes.forEach(cb => {
        cb.checked = true;
        multiThreadPendingSelectedDates.push(cb.value);
    });
}

function deselectAllMultiThreadDates() {
    const container = document.getElementById('multiThreadDateOptionsContainer');
    if (!container) return;
    
    const checkboxes = container.querySelectorAll('input[type="checkbox"]');
    multiThreadPendingSelectedDates = [];
    checkboxes.forEach(cb => {
        cb.checked = false;
    });
}

function inverseSelectMultiThreadDates() {
    const container = document.getElementById('multiThreadDateOptionsContainer');
    if (!container) return;
    
    const checkboxes = container.querySelectorAll('input[type="checkbox"]');
    multiThreadPendingSelectedDates = [];
    checkboxes.forEach(cb => {
        cb.checked = !cb.checked;
        if (cb.checked) {
            multiThreadPendingSelectedDates.push(cb.value);
        }
    });
}

// ==================================================
// 线程选择
// ==================================================

function updateMultiThreadThreadInfo() {
    getMultiThreadToolData();
    
    const threadInfoSpan = document.getElementById('multiThreadThreadInfo');
    if (threadInfoSpan) {
        if (multiThreadState.availableThreads.length > 1) {
            const selectedInfo = multiThreadState.selectedThreads.length === multiThreadState.availableThreads.length 
                ? '全部' 
                : multiThreadState.selectedThreads.length;
            threadInfoSpan.innerHTML = `🧵 线程: ${selectedInfo}/${multiThreadState.availableThreads.length}`;
        } else {
            threadInfoSpan.innerHTML = '';
        }
    }
}

function openMultiThreadSelectorModal() {
    if (!multiThreadState.availableThreads || multiThreadState.availableThreads.length === 0) {
        showNotification('暂无线程数据', true);
        return;
    }
    
    buildMultiThreadSelectorModal();
    const modal = document.getElementById('multiThreadSelectorModal');
    if (modal) modal.classList.remove('hidden');
}

function closeMultiThreadSelectorModal() {
    const modal = document.getElementById('multiThreadSelectorModal');
    if (modal) modal.classList.add('hidden');
}

function buildMultiThreadSelectorModal() {
    const container = document.getElementById('multiThreadSelectorModalContent');
    if (!container) return;
    
    const filterText = document.getElementById('multiThreadFilterInput')?.value || '';
    const filteredThreads = multiThreadState.availableThreads.filter(thread => 
        thread.toLowerCase().includes(filterText.toLowerCase())
    );
    
    container.innerHTML = filteredThreads.map(threadId => {
        const isChecked = multiThreadState.selectedThreads.includes(threadId);
        const displayName = threadId === '0' ? '线程0' : `线程 ${threadId}`;
        return `
            <label class="thread-option ${isChecked ? 'selected' : ''}" data-thread="${threadId}">
                <input type="checkbox" value="${threadId}" ${isChecked ? 'checked' : ''}>
                <span>${escapeHtml(displayName)}</span>
            </label>
        `;
    }).join('');
    
    container.querySelectorAll('.thread-option input').forEach(cb => {
        cb.addEventListener('change', (e) => {
            const label = e.target.closest('.thread-option');
            if (label) {
                if (e.target.checked) {
                    label.classList.add('selected');
                } else {
                    label.classList.remove('selected');
                }
            }
            e.stopPropagation();
        });
    });
    
    container.querySelectorAll('.thread-option').forEach(label => {
        label.removeEventListener('click', handleMultiThreadOptionClick);
        label.addEventListener('click', handleMultiThreadOptionClick);
    });
}

function handleMultiThreadOptionClick(e) {
    if (e.target.tagName === 'INPUT') return;
    
    const label = e.currentTarget;
    const checkbox = label.querySelector('input');
    if (checkbox) {
        if (checkbox.checked) {
            label.classList.add('selected');
        } else {
            label.classList.remove('selected');
        }
        const changeEvent = new Event('change', { bubbles: true });
        checkbox.dispatchEvent(changeEvent);
    }
}

function updateMultiThreadSelectedThreadsFromModal() {
    const modalContent = document.getElementById('multiThreadSelectorModalContent');
    if (!modalContent) return;
    
    multiThreadState.selectedThreads = [];
    modalContent.querySelectorAll('.thread-option input:checked').forEach(cb => {
        multiThreadState.selectedThreads.push(cb.value);
    });
    
    if (multiThreadState.selectedThreads.length === 0 && multiThreadState.availableThreads.length > 0) {
        multiThreadState.selectedThreads = [...multiThreadState.availableThreads];
        showNotification('未选择任何线程，已自动全选');
    }
}

function selectAllMultiThreadThreads() {
    const modalContent = document.getElementById('multiThreadSelectorModalContent');
    if (!modalContent) return;
    
    const checkboxes = modalContent.querySelectorAll('.thread-option input');
    checkboxes.forEach(cb => {
        cb.checked = true;
        const label = cb.closest('.thread-option');
        if (label) label.classList.add('selected');
    });
    updateMultiThreadSelectedThreadsFromModal();
}

function deselectAllMultiThreadThreads() {
    const modalContent = document.getElementById('multiThreadSelectorModalContent');
    if (!modalContent) return;
    
    const checkboxes = modalContent.querySelectorAll('.thread-option input');
    checkboxes.forEach(cb => {
        cb.checked = false;
        const label = cb.closest('.thread-option');
        if (label) label.classList.remove('selected');
    });
    updateMultiThreadSelectedThreadsFromModal();
}

function inverseSelectMultiThreadThreads() {
    const modalContent = document.getElementById('multiThreadSelectorModalContent');
    if (!modalContent) return;
    
    const checkboxes = modalContent.querySelectorAll('.thread-option input');
    checkboxes.forEach(cb => {
        cb.checked = !cb.checked;
        const label = cb.closest('.thread-option');
        if (label) {
            if (cb.checked) {
                label.classList.add('selected');
            } else {
                label.classList.remove('selected');
            }
        }
    });
    updateMultiThreadSelectedThreadsFromModal();
}

function confirmMultiThreadSelection() {
    updateMultiThreadSelectedThreadsFromModal();
    refreshMultiThreadCharts();
    closeMultiThreadSelectorModal();
}

// ==================================================
// 图表类型切换
// ==================================================

function updateMultiThreadChartTypeButtons() {
    const runtimeBtn = document.getElementById('multiThreadChartRuntimeBtn');
    const memoryBtn = document.getElementById('multiThreadChartMemoryBtn');
    
    if (runtimeBtn) {
        if (multiThreadState.currentChartType === 'runtime') {
            runtimeBtn.classList.add('btn-primary');
            runtimeBtn.classList.remove('btn-secondary');
        } else {
            runtimeBtn.classList.add('btn-secondary');
            runtimeBtn.classList.remove('btn-primary');
        }
    }
    if (memoryBtn) {
        if (multiThreadState.currentChartType === 'memory') {
            memoryBtn.classList.add('btn-primary');
            memoryBtn.classList.remove('btn-secondary');
        } else {
            memoryBtn.classList.add('btn-secondary');
            memoryBtn.classList.remove('btn-primary');
        }
    }
    
    const runtimeContainer = document.getElementById('multi-thread-chart-runtime');
    const memoryContainer = document.getElementById('multi-thread-chart-memory');
    if (runtimeContainer && memoryContainer) {
        if (multiThreadState.currentChartType === 'runtime') {
            runtimeContainer.classList.remove('hidden');
            memoryContainer.classList.add('hidden');
        } else {
            runtimeContainer.classList.add('hidden');
            memoryContainer.classList.remove('hidden');
        }
    }
    
    const chartCardTitle = document.getElementById('multiThreadChartCardTitle');
    if (chartCardTitle) {
        chartCardTitle.innerText = multiThreadState.currentChartType === 'runtime' 
            ? '⏱️ Runtime 性能曲线 - 多线程数据' 
            : '💾 Memory 使用曲线 - 多线程数据';
    }
}

function selectMultiThreadChartType(type) {
    if (multiThreadState.currentChartType === type) return;
    multiThreadState.currentChartType = type;
    updateMultiThreadChartTypeButtons();
    refreshMultiThreadCharts();
}

// ==================================================
// 图表渲染
// ==================================================

function renderMultiThreadChart(chartType, dataKey, yAxisName) {
    const toolData = getMultiThreadToolData();
    
    if (!toolData) {
        const chart = charts[`multi-thread-${chartType}`];
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
    
    const filteredData = getFilteredMultiThreadData(toolData);
    if (!filteredData || filteredData.dates.length === 0) {
        const chart = charts[`multi-thread-${chartType}`];
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
    const threadMetrics = filteredData.thread_metrics;
    
    const selectedThreadsSet = new Set(multiThreadState.selectedThreads);
    let threadIds = Object.keys(threadMetrics)
        .filter(tid => selectedThreadsSet.has(tid))
        .sort((a, b) => parseInt(a) - parseInt(b));
    
    if (threadIds.length === 0) {
        threadIds = Object.keys(threadMetrics).sort((a, b) => parseInt(a) - parseInt(b));
    }
    
    const seriesList = [];
    const allValues = [];
    const palette = ['#6366f1', '#f59e0b', '#10b981', '#ef4444', '#06b6d4', '#8b5cf6', '#ec4899', '#84cc16'];
    
    threadIds.forEach((threadId, index) => {
        const threadInfo = threadMetrics[threadId];
        const values = threadInfo?.[dataKey] || [];
        
        const seriesData = values.map((val, idx) => {
            if (val !== null && val !== undefined && val > 0) allValues.push(val);
            return val;
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
    
    if (chartType === multiThreadState.currentChartType) {
        const unit = dataKey === 'runtimes' ? '秒' : 'MB';
        const label = dataKey === 'runtimes' ? 'Runtime' : 'Memory';
        updateStatsCard('multiThreadStatsMain', allValues, unit, label);
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
    seriesList.forEach((series, idx) => {
        legendSelected[series.name] = (idx === 0);
    });
    legendSelected['平均值'] = true;
    legendSelected['参考线'] = true;
    
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
        return `<strong>📅 ${date}</strong>${rows}`;
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
    
    const chart = charts[`multi-thread-${chartType}`];
    if (chart && !chart.isDisposed()) {
        chart.setOption(option, { notMerge: true, lazyUpdate: false });
    }
}

function refreshMultiThreadCharts() {
    if (!multiThreadState.currentRule) return;
    
    const runtimeContainer = document.getElementById('multi-thread-chart-runtime');
    const memoryContainer = document.getElementById('multi-thread-chart-memory');
    
    if (charts['multi-thread-runtime'] && runtimeContainer && runtimeContainer.offsetWidth > 0) {
        charts['multi-thread-runtime'].resize();
    }
    if (charts['multi-thread-memory'] && memoryContainer && memoryContainer.offsetWidth > 0) {
        charts['multi-thread-memory'].resize();
    }
    
    renderMultiThreadChart('runtime', 'runtimes', 'Runtime (秒)');
    renderMultiThreadChart('memory', 'memories', 'Memory (MB)');
    updateMultiThreadChartTypeButtons();
    
    setTimeout(() => {
        if (charts['multi-thread-runtime'] && !charts['multi-thread-runtime'].isDisposed()) {
            charts['multi-thread-runtime'].resize();
        }
        if (charts['multi-thread-memory'] && !charts['multi-thread-memory'].isDisposed()) {
            charts['multi-thread-memory'].resize();
        }
    }, 100);
}

function updateMultiThreadProjectStats() {
    const projectData = getMultiThreadProjectData();
    if (!projectData) return;
    
    const statsContainer = document.getElementById('multiThreadProjectStats');
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

function bindMultiThreadChartEvents() {
    const caseSelect = document.getElementById('multiThreadCaseSelect');
    if (caseSelect) {
        caseSelect.addEventListener('change', (e) => {
            multiThreadState.currentProjectId = e.target.value;
            multiThreadState.currentRule = null;
            multiThreadState.cachedToolData = {};
            multiThreadState.selectedDates = [];
            multiThreadState.selectedThreads = [];
            multiThreadState.availableThreads = [];
            updateMultiThreadRuleSelect();
            updateMultiThreadProjectStats();
            updateMultiThreadDateInfo();
        });
    }
    
    const ruleSelect = document.getElementById('multiThreadRuleSelect');
    if (ruleSelect) {
        ruleSelect.addEventListener('change', (e) => {
            multiThreadState.currentRule = e.target.value;
            if (multiThreadState.currentRule) {
                const ruleNameSpan = document.getElementById('multiThreadCurrentRuleName');
                if (ruleNameSpan) ruleNameSpan.innerText = multiThreadState.currentRule;
                refreshMultiThreadCharts();
            }
            updateMultiThreadThreadInfo();
        });
    }
    
    const ruleSearch = document.getElementById('multiThreadRuleSearch');
    if (ruleSearch) {
        ruleSearch.addEventListener('input', debounce(() => updateMultiThreadRuleSelect(), 300));
    }
    
    const runtimeBtn = document.getElementById('multiThreadChartRuntimeBtn');
    if (runtimeBtn) runtimeBtn.addEventListener('click', () => selectMultiThreadChartType('runtime'));
    const memoryBtn = document.getElementById('multiThreadChartMemoryBtn');
    if (memoryBtn) memoryBtn.addEventListener('click', () => selectMultiThreadChartType('memory'));
    
    const openDatePickerBtn = document.getElementById('multiThreadOpenDatePickerBtn');
    if (openDatePickerBtn) openDatePickerBtn.addEventListener('click', openMultiThreadDatePickerModal);
    
    const closeDateModalBtn = document.getElementById('multiThreadCloseDateModalBtn');
    if (closeDateModalBtn) closeDateModalBtn.addEventListener('click', closeMultiThreadDatePickerModal);
    
    const confirmDateBtn = document.getElementById('multiThreadConfirmDateBtn');
    if (confirmDateBtn) confirmDateBtn.addEventListener('click', confirmMultiThreadDateSelection);
    
    const selectRecentBtn = document.getElementById('multiThreadSelectRecentBtn');
    if (selectRecentBtn) selectRecentBtn.addEventListener('click', () => resetMultiThreadDateSelection(false));
    
    const selectAllDatesBtn = document.getElementById('multiThreadSelectAllDatesBtn');
    if (selectAllDatesBtn) selectAllDatesBtn.addEventListener('click', selectAllMultiThreadDates);
    
    const deselectAllDatesBtn = document.getElementById('multiThreadDeselectAllDatesBtn');
    if (deselectAllDatesBtn) deselectAllDatesBtn.addEventListener('click', deselectAllMultiThreadDates);
    
    const inverseDatesBtn = document.getElementById('multiThreadInverseDatesBtn');
    if (inverseDatesBtn) inverseDatesBtn.addEventListener('click', inverseSelectMultiThreadDates);
    
    const dateFilterInput = document.getElementById('multiThreadDateFilterInput');
    if (dateFilterInput) {
        dateFilterInput.addEventListener('input', debounce(() => buildMultiThreadDatePicker(true), 150));
    }
    
    const openThreadSelectorBtn = document.getElementById('multiThreadOpenThreadSelectorBtn');
    if (openThreadSelectorBtn) openThreadSelectorBtn.addEventListener('click', openMultiThreadSelectorModal);
    
    const selectAllThreadsBtn = document.getElementById('multiThreadSelectAllThreadsBtn');
    if (selectAllThreadsBtn) selectAllThreadsBtn.addEventListener('click', selectAllMultiThreadThreads);
    
    const deselectAllThreadsBtn = document.getElementById('multiThreadDeselectAllThreadsBtn');
    if (deselectAllThreadsBtn) deselectAllThreadsBtn.addEventListener('click', deselectAllMultiThreadThreads);
    
    const inverseThreadsBtn = document.getElementById('multiThreadInverseThreadsBtn');
    if (inverseThreadsBtn) inverseThreadsBtn.addEventListener('click', inverseSelectMultiThreadThreads);
    
    const closeThreadModalBtn = document.getElementById('multiThreadCloseThreadModalBtn');
    if (closeThreadModalBtn) closeThreadModalBtn.addEventListener('click', closeMultiThreadSelectorModal);
    
    const confirmThreadModalBtn = document.getElementById('multiThreadConfirmThreadModalBtn');
    if (confirmThreadModalBtn) confirmThreadModalBtn.addEventListener('click', confirmMultiThreadSelection);
    
    const threadFilterInput = document.getElementById('multiThreadFilterInput');
    if (threadFilterInput) {
        threadFilterInput.addEventListener('input', debounce(buildMultiThreadSelectorModal, 150));
    }
}

// 导出函数
window.multiThreadState = multiThreadState;
window.updateMultiThreadRuleSelect = updateMultiThreadRuleSelect;
window.refreshMultiThreadCharts = refreshMultiThreadCharts;
window.selectMultiThreadChartType = selectMultiThreadChartType;
window.updateMultiThreadProjectStats = updateMultiThreadProjectStats;