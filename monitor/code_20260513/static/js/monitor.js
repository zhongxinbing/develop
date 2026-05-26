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

// 简单哈希函数
function simpleHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    return hash.toString();
}

// 获取当前项目数据
function getCurrentProjectData() {
    return projectsData[casename];
}

// 构建MR更新日期映射
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

function setMode(mode) {
    currentMode = mode;
    document.getElementById('modeSingleBtn')?.classList.toggle('active', mode === 'single');
    document.getElementById('modeMultiBtn')?.classList.toggle('active', mode === 'multi');
    document.getElementById('multiConfigPanel')?.classList.toggle('hidden', mode !== 'multi');
    document.querySelector('.date-control-tip').textContent = mode === 'multi'
        ? '多线程模式：x轴为线程数，y轴为 runtime 或 memory。可选多天进行比对。'
        : '默认显示最近 54 条，点击图例可切换不同线程线。';
    refreshAllCharts();
}

function buildThreadFilter() {
    const container = document.getElementById('threadFilterContainer');
    if (!container) return;

    container.innerHTML = '';
    const activeThreadSet = new Set(selectedThreads);

    AVAILABLE_THREAD_OPTIONS.forEach(thread => {
        const label = document.createElement('label');
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.value = thread;
        checkbox.checked = activeThreadSet.has(thread);
        checkbox.addEventListener('change', (event) => {
            if (event.target.checked) {
                if (!selectedThreads.includes(thread)) {
                    selectedThreads.push(thread);
                }
            } else {
                selectedThreads = selectedThreads.filter(item => item !== thread);
            }
            if (!selectedThreads.length) {
                selectedThreads = ['0'];
                buildThreadFilter();
            }
            refreshAllCharts();
        });
        label.appendChild(checkbox);
        label.appendChild(document.createTextNode(` ${thread}`));
        container.appendChild(label);
    });
}

function getSelectedThreadCounts() {
    if (selectedThreads && selectedThreads.length) {
        return selectedThreads;
    }
    return ['0'];
}

let currentMode = 'single';
let selectedDates = [];
let pendingSelectedDates = [];
let availableDates = [];
let selectedThreads = ['0'];
const AVAILABLE_THREAD_OPTIONS = ['0', '2', '4', '6', '8', '16', '24', '32', '64', '128'];
const MAX_DEFAULT_POINTS = 54;

function updateDateSelectionInfo() {
    const current = selectedDates.length ? selectedDates : availableDates.slice(-MAX_DEFAULT_POINTS);
    const summaryEl = document.getElementById('selectedDateSummary');
    if (current.length > 0) {
        document.getElementById('dateRange').innerText = `${current[0]} 至 ${current[current.length - 1]}`;
        document.getElementById('dataPoints').innerText = current.length;
        if (summaryEl) {
            summaryEl.innerText = current.length === availableDates.length ? '全部可用日期' : `${current.length} 条已选`;
        }
    } else {
        const projectData = getCurrentProjectData();
        document.getElementById('dateRange').innerText = projectData.dates.length ? `${projectData.dates[0]} 至 ${projectData.dates[projectData.dates.length - 1]}` : '无';
        document.getElementById('dataPoints').innerText = projectData.dates.length;
        if (summaryEl) {
            summaryEl.innerText = '未选择日期';
        }
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

function buildDateSelect(usePending = false) {
    const container = document.getElementById('dateOptionsContainer');
    if (!container) return;

    const projectData = getCurrentProjectData();
    availableDates = projectData.available_dates && projectData.available_dates.length ? projectData.available_dates : projectData.dates;

    if (!selectedDates.length) {
        selectedDates = availableDates.slice(-MAX_DEFAULT_POINTS);
    }

    const currentSelection = usePending ? (pendingSelectedDates.length ? pendingSelectedDates : selectedDates.slice(-MAX_DEFAULT_POINTS)) : selectedDates;
    const filterText = document.getElementById('dateFilterInput')?.value || '';
    const filteredDates = filterAvailableDates(filterText);

    container.innerHTML = '';
    filteredDates.forEach(date => {
        const row = document.createElement('div');
        row.className = 'date-option-row';

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.id = `checkbox-${date}`;
        checkbox.value = date;
        checkbox.checked = currentSelection.includes(date);

        checkbox.addEventListener('change', (e) => {
            if (e.target.checked) {
                if (!pendingSelectedDates.includes(date)) {
                    pendingSelectedDates.push(date);
                }
            } else {
                pendingSelectedDates = pendingSelectedDates.filter(item => item !== date);
            }
        });

        const label = document.createElement('label');
        label.htmlFor = checkbox.id;
        label.textContent = date;

        row.appendChild(checkbox);
        row.appendChild(label);
        row.addEventListener('click', (e) => {
            if (e.target.tagName.toLowerCase() !== 'input') {
                checkbox.checked = !checkbox.checked;
                checkbox.dispatchEvent(new Event('change'));
            }
        });
        container.appendChild(row);
    });

    updateDateSelectionInfo();
}

function openDatePickerModal() {
    pendingSelectedDates = selectedDates.length ? [...selectedDates] : availableDates.slice(-MAX_DEFAULT_POINTS);
    const filterInput = document.getElementById('dateFilterInput');
    if (filterInput) {
        filterInput.value = '';
    }
    buildDateSelect(true);
    document.getElementById('datePickerModal')?.classList.remove('hidden');
}

function closeDatePickerModal() {
    document.getElementById('datePickerModal')?.classList.add('hidden');
    buildDateSelect();
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
    const filterInput = document.getElementById('dateFilterInput');
    if (filterInput) {
        filterInput.value = '';
    }
    const modalVisible = !document.getElementById('datePickerModal')?.classList.contains('hidden');
    if (modalVisible) {
        buildDateSelect(true);
    }
    updateDateSelectionInfo();
    debouncedRenderCharts();
}

// 更新阶段选择器
function updateRuleSelect() {
    const caseData = getCurrentProjectData();
    const rules = caseData.rules;
    const searchText = document.getElementById('ruleSearch').value.toLowerCase();
    
    let filteredRules = rules;
    if (searchText) {
        filteredRules = rules.filter(rule => rule.toLowerCase().includes(searchText));
    }
    
    cachedTools = filteredRules;
    
    const select = document.getElementById('ruleSelect');
    const currentValue = select.value;
    
    const fragment = document.createDocumentFragment();
    
    const defaultOption = document.createElement('option');
    defaultOption.value = '';
    defaultOption.textContent = '-- 请选择阶段 --';
    fragment.appendChild(defaultOption);
    
    filteredRules.forEach(rule => {
        const option = document.createElement('option');
        option.value = rule;
        option.textContent = rule;
        fragment.appendChild(option);
    });
    
    select.innerHTML = '';
    select.appendChild(fragment);
    
    if (currentValue && filteredRules.includes(currentValue)) {
        select.value = currentValue;
        currentRule = currentValue;
    } else if (filteredRules.length > 0 && !currentRule) {
        select.value = filteredRules[0];
        currentRule = filteredRules[0];
    } else if (filteredRules.length === 0) {
        currentRule = null;
    }
    
    if (currentRule) {
        document.getElementById('currentRuleName').innerText = currentRule;
        buildDateSelect();
        debouncedRenderCharts();
    } else {
        document.getElementById('currentRuleName').innerText = '未选择';
        clearCharts();
    }
}

const debouncedRenderCharts = debounce(() => {
    if (currentRule) {
        refreshAllCharts();
    }
}, 100);

function getCurrentToolDataOptimized() {
    if (!currentRule) return null;
    
    if (cachedToolData[currentRule] && cachedToolData[currentRule].projectId === casename) {
        return cachedToolData[currentRule].data;
    }
    
    const projectData = getCurrentProjectData();
    if (!projectData.rule_data[currentRule]) return null;
    
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
        if (charts[key]) {
            charts[key].clear();
        }
    });
    
    ['stats-time-runtime', 'stats-time-memory', 'stats-thread-runtime', 'stats-thread-memory', 'stats-cores'].forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            element.innerHTML = '<div class="stat-card">请选择阶段</div>';
        }
    });
    
    lastRenderedDataHash = {
        timeRuntime: '',
        timeMemory: '',
        threadRuntime: '',
        threadMemory: '',
        cores: ''
    };
}

function updateStats(containerId, data, unit, label) {
    const validData = data.filter(v => v !== null && v !== undefined && v > 0);
    if (validData.length === 0) {
        document.getElementById(containerId).innerHTML = '<div class="stat-card">暂无数据</div>';
        return;
    }
    const total = validData.reduce((a, b) => a + b, 0);
    const avg = (total / validData.length).toFixed(1);
    const max = Math.max(...validData);
    const min = Math.min(...validData);
    
    document.getElementById(containerId).innerHTML = `
        <div class="stat-card"><div class="stat-label">📊 总${label}</div><div class="stat-value">${total.toFixed(1)}<span class="stat-unit">${unit}</span></div></div>
        <div class="stat-card"><div class="stat-label">⚡ 平均${label}</div><div class="stat-value">${avg}<span class="stat-unit">${unit}</span></div></div>
        <div class="stat-card"><div class="stat-label">📈 最大${label}</div><div class="stat-value">${max}<span class="stat-unit">${unit}</span></div></div>
        <div class="stat-card"><div class="stat-label">📉 最小${label}</div><div class="stat-value">${min}<span class="stat-unit">${unit}</span></div></div>
    `;
}

function renderMultiModeChart(chartObject, dataKey, color, highlightColor, yAxisName, statsContainerId, yAxisFormatter = null) {
    const toolData = getCurrentToolDataOptimized();
    if (!toolData) {
        if (chartObject) chartObject.clear();
        return;
    }

    const threadMetrics = toolData.thread_metrics || {};
    const selectedThreadCounts = getSelectedThreadCounts();
    const threadIds = Object.keys(threadMetrics)
        .filter(id => selectedThreadCounts.includes(id))
        .sort((a, b) => parseInt(a, 10) - parseInt(b, 10));

    if (!threadIds.length) {
        threadIds.push('0');
    }

    const selectedDateList = selectedDates.length ? selectedDates : [toolData.dates[toolData.dates.length - 1]];
    const dateIndices = selectedDateList
        .map(date => ({ date, index: toolData.dates.indexOf(date) }))
        .filter(item => item.index >= 0);

    const seriesList = dateIndices.map((item, idx) => {
        const values = threadIds.map(threadId => {
            const threadInfo = threadMetrics[threadId] || {};
            const metrics = threadInfo[dataKey] || [];
            return metrics[item.index] != null ? metrics[item.index] : null;
        });
        return {
            name: item.date,
            type: 'line',
            data: values,
            smooth: false,
            lineStyle: {
                width: 2,
                color: ['#3b82f6', '#f97316', '#10b981', '#8b5cf6', '#eab308', '#06b6d4'][idx % 6]
            },
            showSymbol: true,
            symbol: 'circle',
            symbolSize: 8,
            connectNulls: false
        };
    });

    const allValues = seriesList.flatMap(series => series.data).filter(v => v !== null && v !== undefined && v > 0);
    updateStats(statsContainerId, allValues, dataKey === 'runtimes' ? '秒' : 'MB', dataKey === 'runtimes' ? 'Runtime' : 'Memory');
    updateDateSelectionInfo();

    const option = {
        backgroundColor: 'transparent',
        tooltip: {
            trigger: 'axis',
            axisPointer: { type: 'shadow' },
            formatter: function(params) {
                if (!params || !params.length) return '';
                const lines = params.map(point => `${point.seriesName}: ${point.value != null ? point.value : '−'} ${dataKey === 'runtimes' ? '秒' : 'MB'}`);
                const axisLabel = params[0]?.axisValue || '';
                return `<strong>线程数: ${axisLabel}</strong><br/>${lines.join('<br/>')}`;
            }
        },
        grid: {
            left: '8%',
            right: '5%',
            top: '15%',
            bottom: '10%',
            containLabel: true
        },
        xAxis: {
            type: 'category',
            data: threadIds.map(id => `线程 ${id}`),
            axisLabel: { color: '#94a3b8' },
            axisLine: { lineStyle: { color: '#475569' } }
        },
        yAxis: {
            type: 'value',
            name: yAxisName,
            nameTextStyle: { color: '#cbd5e1', fontSize: 12 },
            axisLabel: {
                color: '#94a3b8',
                formatter: yAxisFormatter
            },
            axisLine: { lineStyle: { color: '#475569' } },
            splitLine: { lineStyle: { color: 'rgba(71, 85, 105, 0.3)', type: 'dashed' } }
        },
        legend: {
            data: seriesList.map(item => item.name),
            textStyle: { color: '#cbd5e1', fontSize: 11 },
            right: 10,
            top: '8%'
        },
        toolbox: {
            feature: {
                saveAsImage: { title: '保存为图片', backgroundColor: 'rgba(15, 23, 42, 0.8)' }
            }
        },
        series: seriesList
    };

    if (chartObject && !chartObject.isDisposed()) {
        chartObject.setOption(option, { notMerge: false, lazyUpdate: true });
    }
}

// 优化版图表渲染 - 支持多线程曲线与MR更新高亮
function renderEChartOptimized(chartObject, chartKey, dataKey, color, highlightColor, yAxisName, statsContainerId, yAxisFormatter = null) {
    const toolData = getCurrentToolDataOptimized();
    if (!toolData) {
        if (chartObject) {
            chartObject.clear();
        }
        return;
    }

    const filteredData = getFilteredToolData(toolData);
    const dates = filteredData.dates;

    const threadMetrics = toolData.thread_metrics || {};
    if (!threadMetrics['0'] && filteredData.runtimes && filteredData.runtimes.length) {
        threadMetrics['0'] = {
            runtimes: filteredData.runtimes,
            memories: filteredData.memories,
            cores: filteredData.cores
        };
    }

    const threadIds = Object.keys(threadMetrics);
    if (!threadIds.includes('0')) {
        threadIds.unshift('0');
    }
    threadIds.sort((a, b) => parseInt(a, 10) - parseInt(b, 10));

    const selectedThreadCounts = getSelectedThreadCounts();
    const legendSelectedMap = {};
    threadIds.forEach(threadId => {
        legendSelectedMap[`线程 ${threadId}`] = selectedThreadCounts.includes(threadId);
    });

    const seriesList = threadIds.map((threadId, index) => {
        const threadInfo = threadMetrics[threadId] || {
            runtimes: new Array(dates.length).fill(null),
            memories: new Array(dates.length).fill(null),
            cores: new Array(dates.length).fill(null)
        };
        const values = threadInfo[dataKey] || new Array(dates.length).fill(null);
        const colorIndex = index % 8;
        const palette = ['#3b82f6', '#f97316', '#10b981', '#8b5cf6', '#eab308', '#06b6d4', '#fb7185', '#a855f7'];
        const seriesColor = palette[colorIndex];

        return {
            name: `线程 ${threadId}`,
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
                    symbolSize: hasMrUpdate ? 10 : 6
                };
            }),
            smooth: false,
            lineStyle: {
                width: 2,
                color: seriesColor,
                shadowBlur: 8,
                shadowColor: seriesColor
            },
            areaStyle: {
                opacity: 0.08,
                color: seriesColor
            },
            connectNulls: false,
            animation: false,
            showSymbol: false
        };
    });

    const allValues = seriesList
        .filter(series => selectedThreadCounts.includes(series.name.replace('线程 ', '')))
        .flatMap(series => series.data.map(item => item.value))
        .filter(v => v !== null && v !== undefined && v > 0);
    let unit = dataKey === 'runtimes' ? '秒' : (dataKey === 'memories' ? 'MB' : '核心');
    let label = dataKey === 'runtimes' ? 'Runtime' : (dataKey === 'memories' ? 'Memory' : 'CPU核心数');
    updateStats(statsContainerId, allValues, unit, label);
    updateDateSelectionInfo();

    const avgValue = allValues.length > 0 ? (allValues.reduce((a, b) => a + b, 0) / allValues.length).toFixed(1) : 0;

    const option = {
        backgroundColor: 'transparent',
        tooltip: {
            trigger: 'axis',
            axisPointer: { type: 'shadow' },
            backgroundColor: 'rgba(15, 23, 42, 0.96)',
            borderColor: color,
            borderWidth: 1,
            textStyle: { color: '#f1f5f9', fontSize: 12, fontFamily: 'monospace' },
            formatter: function(params) {
                if (!params || params.length === 0) return '';
                const rows = params.map(point => {
                    const value = point.value;
                    const date = point.axisValue;
                    const threadName = point.seriesName;
                    let valueText = '';
                    if (dataKey === 'runtimes') {
                        valueText = `${value} 秒`;
                    } else if (dataKey === 'memories') {
                        valueText = `${value} MB`;
                    } else {
                        valueText = `${value} 核心`;
                    }
                    return `<div style="margin-bottom:4px;"><strong>${threadName}</strong> ${valueText}</div>`;
                }).join('');
                const date = params[0].axisValue;
                const mrComment = mrUpdateDates[date] || '';
                const hasMr = mrComment && mrComment !== 'undefined';
                const mrStyle = hasMr ? 'color: #ef4444; font-weight: bold;' : 'color: #94a3b8;';
                return `
                    <strong>📅 ${date}</strong><br/>
                    ${rows}
                    <span style="${mrStyle}">🔧 MR更新: ${mrComment || '无'}</span><br/>
                    <span style="color: #94a3b8;">📊 阶段: ${currentRule}</span>
                `;
            }
        },
        grid: {
            left: '8%',
            right: '5%',
            top: '15%',
            bottom: '10%',
            containLabel: true,
            backgroundColor: 'rgba(15, 23, 42, 0.3)',
            borderWidth: 0
        },
        xAxis: {
            type: 'category',
            data: dates,
            axisLabel: {
                rotate: dates.length > 10 ? 30 : 0,
                color: '#94a3b8',
                fontSize: 11,
                interval: Math.floor(dates.length / 10)
            },
            axisLine: { lineStyle: { color: '#475569' } },
            axisTick: { show: false }
        },
        yAxis: {
            type: 'value',
            name: yAxisName,
            nameTextStyle: { color: '#cbd5e1', fontSize: 12 },
            axisLabel: {
                color: '#94a3b8',
                fontSize: 11,
                formatter: yAxisFormatter
            },
            axisLine: { lineStyle: { color: '#475569' } },
            splitLine: { lineStyle: { color: 'rgba(71, 85, 105, 0.3)', type: 'dashed' } }
        },
        series: [
            ...seriesList,
            {
                name: '平均值',
                type: 'line',
                data: new Array(dates.length).fill(parseFloat(avgValue)),
                lineStyle: {
                    width: 1.5,
                    color: '#f59e0b',
                    type: 'dashed',
                    shadowBlur: 0
                },
                symbol: 'none',
                smooth: false,
                emphasis: { scale: false },
                tooltip: { show: false }
            }
        ],
        legend: {
            data: seriesList.map(s => s.name),
            selected: legendSelectedMap,
            selectedMode: 'multiple',
            textStyle: { color: '#cbd5e1', fontSize: 11 },
            right: 10,
            top: '8%',
            itemWidth: 25,
            itemHeight: 12,
            formatter: name => name.replace('线程 ', '')
        },
        toolbox: {
            feature: {
                saveAsImage: { title: '保存为图片', backgroundColor: 'rgba(15, 23, 42, 0.8)' },
                zoom: { title: { zoom: '区域缩放', back: '还原' } }
            },
            iconStyle: { borderColor: '#94a3b8' },
            emphasis: { iconStyle: { borderColor: color } }
        }
    };

    const newHash = simpleHash(JSON.stringify({dates, selectedThreads, currentRule, mrUpdateDates, chartKey, dataKey, allValues}));
    if (lastRenderedDataHash[chartKey] === newHash && chartObject && !chartObject.isDisposed()) {
        return;
    }
    lastRenderedDataHash[chartKey] = newHash;

    if (chartObject && !chartObject.isDisposed()) {
        chartObject.setOption(option, {
            notMerge: false,
            lazyUpdate: true
        });
    }
}

function refreshAllCharts() {
    if (!currentRule) {
        clearCharts();
        return;
    }

    requestAnimationFrame(() => {
        if (activeSection === 'section-thread') {
            renderMultiModeChart(charts.threadRuntime, 'runtimes', chartColors.runtime, chartColors.runtimeHighlight, 'Runtime (秒)', 'stats-thread-runtime');
            renderMultiModeChart(charts.threadMemory, 'memories', chartColors.memory, chartColors.memory, 'Memory (MB)', 'stats-thread-memory', function(value) {
                if (value >= 1024) {
                    return (value / 1024).toFixed(1) + ' GB';
                }
                return value + ' MB';
            });
        } else if (activeSection === 'section-time') {
            renderEChartOptimized(charts.timeRuntime, 'timeRuntime', 'runtimes', chartColors.runtime, chartColors.runtimeHighlight, 'Runtime (秒)', 'stats-time-runtime');
            renderEChartOptimized(charts.timeMemory, 'timeMemory', 'memories', chartColors.memory, chartColors.memory, 'Memory (MB)', 'stats-time-memory', function(value) {
                if (value >= 1024) {
                    return (value / 1024).toFixed(1) + ' GB';
                }
                return value + ' MB';
            });
        }
    });
}

function initCharts() {
    const timeRuntimeChartDom = document.getElementById('chart-time-runtime');
    const timeMemoryChartDom = document.getElementById('chart-time-memory');
    const threadRuntimeChartDom = document.getElementById('chart-thread-runtime');
    const threadMemoryChartDom = document.getElementById('chart-thread-memory');
    const coresChartDom = document.getElementById('chart-cores');

    if (timeRuntimeChartDom && !charts.timeRuntime) {
        charts.timeRuntime = echarts.init(timeRuntimeChartDom, null, {
            renderer: 'canvas',
            useDirtyRect: false
        });
    }
    if (timeMemoryChartDom && !charts.timeMemory) {
        charts.timeMemory = echarts.init(timeMemoryChartDom, null, {
            renderer: 'canvas',
            useDirtyRect: false
        });
    }
    if (threadRuntimeChartDom && !charts.threadRuntime) {
        charts.threadRuntime = echarts.init(threadRuntimeChartDom, null, {
            renderer: 'canvas',
            useDirtyRect: false
        });
    }
    if (threadMemoryChartDom && !charts.threadMemory) {
        charts.threadMemory = echarts.init(threadMemoryChartDom, null, {
            renderer: 'canvas',
            useDirtyRect: false
        });
    }
    if (coresChartDom && !charts.cores) {
        charts.cores = echarts.init(coresChartDom, null, {
            renderer: 'canvas',
            useDirtyRect: false
        });
    }

    function attachLegendSync(chart) {
        if (!chart || chart._legendSyncAttached) return;
        chart.on('legendselectchanged', (params) => {
            const selectedThreadNames = Object.entries(params.selected)
                .filter(([name, selected]) => selected && name.startsWith('线程 '))
                .map(([name]) => name.replace('线程 ', ''));
            const normalizedThreads = selectedThreadNames.length ? selectedThreadNames : ['0'];
            const sortedOld = [...selectedThreads].sort();
            const sortedNew = [...normalizedThreads].sort();
            if (sortedOld.join(',') !== sortedNew.join(',')) {
                selectedThreads = normalizedThreads;
                refreshAllCharts();
            }
        });
        chart._legendSyncAttached = true;
    }

    attachLegendSync(charts.timeRuntime);
    attachLegendSync(charts.timeMemory);
    attachLegendSync(charts.threadRuntime);
    attachLegendSync(charts.threadMemory);
    
    const resizeHandler = debounce(() => {
        Object.values(charts).forEach(chart => {
            if (chart && !chart.isDisposed()) {
                chart.resize();
            }
        });
    }, 200);
    window.addEventListener('resize', resizeHandler);

    buildThreadFilter();
    document.querySelectorAll('.mode-btn').forEach(btn => {
        btn.addEventListener('click', () => setMode(btn.dataset.mode));
    });
}

function showNotification(message, isError = false) {
    const notification = document.createElement('div');
    notification.className = 'notification' + (isError ? ' error' : '');
    notification.innerHTML = isError ? '❌ ' + message : '✅ ' + message;
    document.body.appendChild(notification);
    setTimeout(() => {
        notification.style.animation = 'slideIn 0.3s ease reverse';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

// 检查数据更新（轻量级）
async function checkForUpdates() {
    try {
        const response = await fetch('/api/check_update', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                tool: 'elint',
                thread: currentMode,
                version: currentDataVersion
            })
        });
        
        const result = await response.json();
        
        if (result.has_update) {
            const refreshIndicator = document.querySelector('.refresh-indicator');
            refreshIndicator.classList.add('has-update');
            refreshIndicator.title = '发现新数据，点击刷新按钮更新';
            showNotification('发现新数据，点击刷新按钮更新', false);
        } else {
            document.querySelector('.refresh-indicator')?.classList.remove('has-update');
        }
    } catch (error) {
        console.error('检查更新失败:', error);
    }
}

// 完全刷新数据
async function refreshData() {
    const refreshBtn = document.getElementById('refreshBtn');
    const originalText = refreshBtn?.innerHTML;
    if (refreshBtn) {
        refreshBtn.innerHTML = '<span class="spinner"></span> 刷新中...';
        refreshBtn.classList.add('loading');
    }
    
    try {
        const response = await fetch('/api/refresh', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                tool: 'elint',
                thread: currentMode
            })
        });
        const result = await response.json();
        
        if (result.success) {
            Object.assign(projectsData, result.data);
            currentDataVersion = result.version;
            
            // 更新MR更新映射
            mrUpdateDates = buildMrUpdateMap(result.perf);
            
            cachedToolData = {};
            lastRenderedDataHash = {
                runtime: '',
                memory: '',
                cores: ''
            };
            
            document.getElementById('lastUpdateTime').innerHTML = `最后更新: ${result.last_update}`;
            document.querySelector('.refresh-indicator')?.classList.remove('has-update');
            
            if (result.project_list) {
                const caseSelect = document.getElementById('caseSelect');
                const currentProject = caseSelect?.value;
                if (caseSelect) {
                    caseSelect.innerHTML = '';
                    result.project_list.forEach(project => {
                        const option = document.createElement('option');
                        option.value = project.id;
                        option.textContent = project.name;
                        caseSelect.appendChild(option);
                    });
                    if (projectsData[currentProject]) {
                        caseSelect.value = currentProject;
                    } else if (result.project_list.length > 0) {
                        caseSelect.value = result.project_list[0].id;
                        casename = result.project_list[0].id;
                    }
                }
            }
            
            updateRuleSelect();
            updateProjectStats();
            showNotification(`数据刷新成功！`);
        } else {
            throw new Error(result.message || '刷新失败');
        }
    } catch (error) {
        console.error('刷新数据失败:', error);
        showNotification(`刷新失败: ${error.message}`, true);
    } finally {
        if (refreshBtn) {
            refreshBtn.innerHTML = originalText;
            refreshBtn.classList.remove('loading');
        }
    }
}

function updateProjectStats() {
    const projectData = getCurrentProjectData();
    if (!projectData) return;
    
    const rulesCount = projectData.rules.length;
    const datesCount = projectData.dates.length;
    
    let totalRuntime = 0;
    let runtimeCount = 0;
    const sampleSize = Math.min(50, rulesCount);
    const sampledRules = projectData.rules.slice(0, sampleSize);
    
    for (const rule of sampledRules) {
        const runtimes = projectData.rule_data[rule].runtimes.filter(v => v !== null);
        if (runtimes.length > 0) {
            totalRuntime += runtimes.reduce((a, b) => a + b, 0);
            runtimeCount += runtimes.length;
        }
    }
    const avgRuntime = runtimeCount > 0 ? (totalRuntime / runtimeCount).toFixed(0) : 0;
    
    const summaryHtml = `
        <div class="badge-item"><span>📊</span> 阶段数: ${rulesCount}</div>
        <div class="badge-item"><span>📅</span> 天数: ${datesCount}</div>
        <div class="badge-item"><span>⏱️</span> 平均Runtime: ${avgRuntime} min</div>
    `;
    document.getElementById('projectStats').innerHTML = summaryHtml;
    const rightSummary = document.getElementById('rightSummary');
    if (rightSummary) {
        rightSummary.innerHTML = `
            <div class="summary-card"><div class="stat-label">阶段数</div><div class="stat-value">${rulesCount}</div></div>
            <div class="summary-card"><div class="stat-label">天数</div><div class="stat-value">${datesCount}</div></div>
            <div class="summary-card"><div class="stat-label">平均 Runtime</div><div class="stat-value">${avgRuntime} min</div></div>
        `;
    }
    updateDateSelectionInfo();
}

function setupSearchListener() {
    const searchInput = document.getElementById('ruleSearch');
    const debouncedUpdate = debounce(() => {
        updateRuleSelect();
    }, 300);
    
    if (searchInput) {
        searchInput.addEventListener('input', debouncedUpdate);
    }
}

function switchSection(sectionId) {
    activeSection = sectionId;
    document.querySelectorAll('.sidebar-item').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.section === sectionId);
    });
    document.querySelectorAll('.section-panel').forEach(panel => {
        panel.classList.toggle('active', panel.id === sectionId);
    });

    if (sectionId === 'section-thread') {
        setMode('multi');
    } else if (sectionId === 'section-time') {
        setMode('single');
    }

    const compareBtn = document.getElementById('openComparePageBtn');
    if (sectionId === 'section-compare' && compareBtn) {
        compareBtn.focus();
    }

    refreshAllCharts();
}

function switchTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(tab => tab.classList.add('hidden'));
    document.getElementById(`${tabId}-tab`).classList.remove('hidden');
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelector(`.tab-btn[data-tab="${tabId}"]`).classList.add('active');
    
    setTimeout(() => {
        const chart = charts[tabId];
        if (chart && !chart.isDisposed()) {
            chart.resize();
        }
    }, 100);
}

// 页面刷新前检查数据变化
function setupBeforeUnloadHandler() {
    let hasPendingRefresh = false;
    
    window.addEventListener('beforeunload', function(e) {
        if (hasPendingRefresh) return;
        
        // 异步刷新数据（不会阻塞页面关闭）
        fetch('/api/check_update', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                tool: 'elint',
                thread: 'single',
                version: currentDataVersion
            })
        }).then(response => response.json())
          .then(result => {
              if (result.has_update) {
                  // 数据有更新，在页面加载完成后刷新
                  sessionStorage.setItem('needsRefresh', 'true');
              }
          })
          .catch(() => {});
    });
    
    // 页面加载完成后检查是否需要刷新
    if (sessionStorage.getItem('needsRefresh') === 'true') {
        sessionStorage.removeItem('needsRefresh');
        setTimeout(() => {
            refreshData();
        }, 500);
    }
}

// 事件监听
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
});

document.querySelectorAll('.sidebar-item').forEach(btn => {
    btn.addEventListener('click', () => switchSection(btn.dataset.section));
});

const openComparePageBtn = document.getElementById('openComparePageBtn');
if (openComparePageBtn) {
    openComparePageBtn.addEventListener('click', () => window.open('/compare', '_blank'));
}

const caseSelect = document.getElementById('caseSelect');
if (caseSelect) {
    caseSelect.addEventListener('change', (e) => {
        casename = e.target.value;
        currentRule = null;
        cachedToolData = {};
        lastRenderedDataHash = {
            runtime: '',
            memory: '',
            cores: ''
        };
        updateRuleSelect();
        buildDateSelect();
        updateProjectStats();
    });
}

const dateFilterInput = document.getElementById('dateFilterInput');
if (dateFilterInput) {
    dateFilterInput.addEventListener('input', debounce(() => {
        buildDateSelect(true);
    }, 150));
}

const openDatePickerBtn = document.getElementById('openDatePickerBtn');
if (openDatePickerBtn) {
    openDatePickerBtn.addEventListener('click', (e) => {
        e.preventDefault();
        openDatePickerModal();
    });
}

const closeDatePickerBtn = document.getElementById('closeDatePickerBtn');
if (closeDatePickerBtn) {
    closeDatePickerBtn.addEventListener('click', (e) => {
        e.preventDefault();
        closeDatePickerModal();
    });
}

const cancelDateSelectionBtn = document.getElementById('cancelDateSelectionBtn');
if (cancelDateSelectionBtn) {
    cancelDateSelectionBtn.addEventListener('click', (e) => {
        e.preventDefault();
        closeDatePickerModal();
    });
}

const confirmDateSelectionBtn = document.getElementById('confirmDateSelectionBtn');
if (confirmDateSelectionBtn) {
    confirmDateSelectionBtn.addEventListener('click', (e) => {
        e.preventDefault();
        confirmDatePickerSelection();
    });
}

const datePickerOverlay = document.getElementById('datePickerOverlay');
if (datePickerOverlay) {
    datePickerOverlay.addEventListener('click', () => closeDatePickerModal());
}

const modalRecentBtn = document.getElementById('modalRecentBtn');
if (modalRecentBtn) {
    modalRecentBtn.addEventListener('click', (e) => {
        e.preventDefault();
        pendingSelectedDates = availableDates.slice(-MAX_DEFAULT_POINTS);
        buildDateSelect(true);
    });
}

const modalAllDatesBtn = document.getElementById('modalAllDatesBtn');
if (modalAllDatesBtn) {
    modalAllDatesBtn.addEventListener('click', (e) => {
        e.preventDefault();
        pendingSelectedDates = [...availableDates];
        buildDateSelect(true);
    });
}

const selectRecentBtn = document.getElementById('selectRecentBtn');
if (selectRecentBtn) {
    selectRecentBtn.addEventListener('click', (e) => {
        e.preventDefault();
        resetDateSelection(false);
    });
}

const selectAllDatesBtn = document.getElementById('selectAllDatesBtn');
if (selectAllDatesBtn) {
    selectAllDatesBtn.addEventListener('click', (e) => {
        e.preventDefault();
        resetDateSelection(true);
    });
}

const ruleSelect = document.getElementById('ruleSelect');
if (ruleSelect) {
    ruleSelect.addEventListener('change', (e) => {
        currentRule = e.target.value;
        if (currentRule) {
            document.getElementById('currentRuleName').innerText = currentRule;
            debouncedRenderCharts();
        } else {
            document.getElementById('currentRuleName').innerText = '未选择';
            clearCharts();
        }
    });
}

const refreshBtn = document.getElementById('refreshBtn');
if (refreshBtn) {
    refreshBtn.addEventListener('click', () => refreshData());
}

// 初始化
initCharts();
setupSearchListener();

// 初始化MR更新映射
mrUpdateDates = buildMrUpdateMap(perf);

updateRuleSelect();
updateProjectStats();

// 启动定期检查更新（每30秒）
setInterval(checkForUpdates, 30000);

// 设置页面刷新处理
setupBeforeUnloadHandler();

// 延迟首次渲染
setTimeout(() => {
    if (currentRule) {
        refreshAllCharts();
    }
}, 200);