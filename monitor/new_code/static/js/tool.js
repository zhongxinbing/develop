/**
 * EDA 性能监控系统 - 主脚本
 * 支持时序曲线图、多线程对比、数据对比三大功能
 * 使用 ECharts 进行数据可视化
 */

// ==================================================
// 工具函数
// ==================================================

/**
 * 防抖函数
 */
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

/**
 * 简单哈希函数（用于缓存比较）
 */
function simpleHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    return hash.toString();
}

/**
 * 显示通知消息
 */
function showNotification(message, isError = false) {
    const notification = document.createElement('div');
    notification.className = `notification ${isError ? 'error' : 'success'}`;
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
    `;
    document.body.appendChild(notification);
    setTimeout(() => notification.remove(), 3000);
}

/**
 * 显示/隐藏加载状态
 */
function showLoading(show) {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) {
        overlay.classList.toggle('hidden', !show);
    }
}

/**
 * 更新最后更新时间显示
 */
function updateLastUpdateTime() {
    const now = new Date();
    const timeStr = now.toLocaleString('zh-CN');
    document.getElementById('lastUpdateText').innerHTML = `最后更新: ${timeStr}`;
    
    const statusDot = document.getElementById('statusDot');
    if (statusDot) {
        statusDot.classList.add('updating');
        setTimeout(() => statusDot.classList.remove('updating'), 1000);
    }
}

/**
 * 构建MR更新日期映射
 */
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

// ==================================================
// 时序曲线图模块
// ==================================================

/**
 * 获取当前选中的项目数据
 */
function getCurrentProjectData() {
    return projectsData[currentProjectId];
}

/**
 * 更新阶段选择器
 */
function updateRuleSelect() {
    const projectData = getCurrentProjectData();
    if (!projectData) return;
    
    const rules = projectData.rules || [];
    const searchText = document.getElementById('ruleSearch').value.toLowerCase();
    
    let filteredRules = rules;
    if (searchText) {
        filteredRules = rules.filter(rule => rule.toLowerCase().includes(searchText));
    }
    
    const select = document.getElementById('ruleSelect');
    const currentValue = select.value;
    
    select.innerHTML = '<option value="">-- 请选择阶段 --</option>';
    filteredRules.forEach(rule => {
        const option = document.createElement('option');
        option.value = rule;
        option.textContent = rule;
        select.appendChild(option);
    });
    
    if (currentValue && filteredRules.includes(currentValue)) {
        select.value = currentValue;
        currentRule = currentValue;
    } else if (filteredRules.length > 0 && !currentRule) {
        select.value = filteredRules[0];
        currentRule = filteredRules[0];
    }
    
    if (currentRule) {
        document.getElementById('currentRuleName').innerText = currentRule;
        updateDateSelectionInfo();
        refreshTimelineCharts();
    }
}

/**
 * 更新日期选择信息
 */
function updateDateSelectionInfo() {
    const projectData = getCurrentProjectData();
    if (!projectData) return;
    
    availableDates = projectData.available_dates || projectData.dates || [];
    
    if (selectedDates.length === 0) {
        selectedDates = availableDates.slice(-51);
    }
    
    document.getElementById('dateRange').innerText = 
        selectedDates.length ? `${selectedDates[0]} 至 ${selectedDates[selectedDates.length - 1]}` : '无';
    document.getElementById('dataPoints').innerText = selectedDates.length;
    
    const summaryEl = document.getElementById('selectedDateSummary');
    if (summaryEl) {
        summaryEl.innerText = selectedDates.length === availableDates.length ? '全部可用日期' : `${selectedDates.length} 条已选`;
    }
}

/**
 * 更新曲线类型按钮状态并显示对应图表
 */
function updateChartTypeButtons() {
    document.querySelectorAll('.chart-type-btn').forEach(btn => {
        const type = btn.dataset.type;
        btn.classList.toggle('btn-primary', type === currentChartType);
        btn.classList.toggle('btn-secondary', type !== currentChartType);
    });

    const runtimeContainer = document.getElementById('chart-runtime');
    const memoryContainer = document.getElementById('chart-memory');
    if (runtimeContainer && memoryContainer) {
        runtimeContainer.classList.toggle('hidden', currentChartType !== 'runtime');
        memoryContainer.classList.toggle('hidden', currentChartType !== 'memory');
    }

    const titleEl = document.getElementById('chartCardTitle');
    if (titleEl) {
        titleEl.innerText = currentChartType === 'runtime' ? '⏱️ Runtime 性能曲线' : '💾 Memory 使用曲线';
    }
    
    if (currentChartType === 'runtime') {
        charts.runtime?.resize();
    } else {
        charts.memory?.resize();
    }
}

/**
 * 选择曲线类型并刷新图表
 */
function selectChartType(type) {
    currentChartType = type;
    updateChartTypeButtons();
    refreshTimelineCharts();
}

/**
 * 获取过滤后的工具数据
 */
function getFilteredToolData(toolData) {
    const filterSet = new Set(selectedDates);
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

/**
 * 获取当前工具数据（带缓存）
 */
function getCurrentToolData() {
    if (!currentRule) return null;
    
    if (cachedToolData[currentRule] && cachedToolData[currentRule].projectId === currentProjectId) {
        return cachedToolData[currentRule].data;
    }
    
    const projectData = getCurrentProjectData();
    if (!projectData?.rule_data[currentRule]) return null;
    
    cachedToolData[currentRule] = {
        projectId: currentProjectId,
        data: projectData.rule_data[currentRule]
    };
    
    return projectData.rule_data[currentRule];
}

/**
 * 更新统计信息
 */
function updateStats(containerId, data, unit, label) {
    const validData = data.filter(v => v !== null && v !== undefined && v > 0);
    if (validData.length === 0) {
        document.getElementById(containerId).innerHTML = '<div class="stat-item"><div class="stat-value">-</div><div class="stat-label">暂无数据</div></div>';
        return;
    }
    
    const total = validData.reduce((a, b) => a + b, 0);
    const avg = (total / validData.length).toFixed(1);
    const max = Math.max(...validData);
    const min = Math.min(...validData);
    
    document.getElementById(containerId).innerHTML = `
        <div class="stat-item"><div class="stat-value">${total.toFixed(1)}<span style="font-size:0.875rem;">${unit}</span></div><div class="stat-label">总${label}</div></div>
        <div class="stat-item"><div class="stat-value">${avg}<span style="font-size:0.875rem;">${unit}</span></div><div class="stat-label">平均${label}</div></div>
        <div class="stat-item"><div class="stat-value">${max.toFixed(1)}<span style="font-size:0.875rem;">${unit}</span></div><div class="stat-label">最大${label}</div></div>
        <div class="stat-item"><div class="stat-value">${min.toFixed(1)}<span style="font-size:0.875rem;">${unit}</span></div><div class="stat-label">最小${label}</div></div>
    `;
}

/**
 * 处理图例选择变化事件
 */
function handleLegendSelectionChanged(params) {
    const newSelectedThreads = [];
    Object.entries(params.selected).forEach(([name, isSelected]) => {
        if (isSelected) {
            if (name === 'e线程0') {
                newSelectedThreads.push('0');
            } else if (name.startsWith('其他线程')) {
                const threadId = name.replace('其他线程', '');
                newSelectedThreads.push(threadId);
            }
        }
    });
    selectedThreads = newSelectedThreads;
}

/**
 * 全选所有线程
 */
function selectAllThreads() {
    const chart = charts[currentChartType];
    if (chart) {
        const option = chart.getOption();
        const legendData = option.legend[0].data;
        const newSelected = {};
        legendData.forEach(name => {
            newSelected[name] = true;
        });
        chart.setOption({ legend: { selected: newSelected } });
        // 同步更新 selectedThreads
        selectedThreads = legendData.map(name => {
            if (name === 'e线程0') return '0';
            if (name.startsWith('其他线程')) return name.replace('其他线程', '');
            return null;
        }).filter(t => t);
        showNotification('已全选所有线程');
    }
}

/**
 * 反选所有线程
 */
function inverseSelectThreads() {
    const chart = charts[currentChartType];
    if (chart) {
        const option = chart.getOption();
        const legendSelected = option.legend[0].selected || {};
        const newSelected = {};
        const newThreads = [];
        Object.entries(legendSelected).forEach(([name, isSelected]) => {
            newSelected[name] = !isSelected;
            if (!isSelected) {
                if (name === 'e线程0') newThreads.push('0');
                else if (name.startsWith('其他线程')) newThreads.push(name.replace('其他线程', ''));
            }
        });
        chart.setOption({ legend: { selected: newSelected } });
        selectedThreads = newThreads;
        showNotification('已反选线程');
    }
}

/**
 * 渲染时序曲线图
 */
function renderTimelineChart(chartType, dataKey, color, yAxisName, yAxisFormatter = null) {
    const toolData = getCurrentToolData();
    if (!toolData) {
        if (charts[chartType]) charts[chartType].clear();
        return;
    }
    
    const filteredData = getFilteredToolData(toolData);
    const dates = filteredData.dates;
    
    // 获取多线程数据
    const threadMetrics = toolData.thread_metrics || {};
    if (!threadMetrics['0'] && filteredData.runtimes?.length) {
        threadMetrics['0'] = {
            runtimes: filteredData.runtimes,
            memories: filteredData.memories,
            cores: filteredData.cores
        };
    }
    
    const threadIds = Object.keys(threadMetrics).sort((a, b) => parseInt(a) - parseInt(b));
    
    // 构建系列数据
    const seriesList = threadIds.map((threadId, index) => {
        const threadInfo = threadMetrics[threadId];
        const values = threadInfo?.[dataKey] || new Array(dates.length).fill(null);
        const palette = ['#6366f1', '#f59e0b', '#10b981', '#ef4444', '#06b6d4', '#8b5cf6', '#ec4899', '#84cc16'];
        const seriesColor = palette[index % palette.length];
        const threadLabel = threadId === '0' ? 'e线程0' : `其他线程${threadId}`;
        
        return {
            threadId,
            name: threadLabel,
            type: 'line',
            data: values.map((value, idx) => {
                const date = dates[idx];
                const hasMrUpdate = mrUpdateDates[date] && mrUpdateDates[date] !== 'undefined';
                return {
                    value: value,
                    itemStyle: hasMrUpdate ? {
                        color: '#ef4444',
                        borderColor: '#fff',
                        borderWidth: 2
                    } : undefined,
                    symbol: 'circle',
                    symbolSize: hasMrUpdate ? 10 : 6
                };
            }),
            smooth: false,
            lineStyle: { width: 2, color: seriesColor },
            areaStyle: { opacity: 0.08, color: seriesColor },
            connectNulls: false,
            showSymbol: false
        };
    });
    
    // 计算统计数据
    const allValues = seriesList
        .flatMap(series => series.data.map(item => item.value))
        .filter(v => v !== null && v !== undefined && v > 0);
    
    const unit = dataKey === 'runtimes' ? '秒' : 'MB';
    const label = dataKey === 'runtimes' ? 'Runtime' : 'Memory';
    if (chartType === currentChartType) {
        updateStats('stats-main', allValues, unit, label);
    }
    
    // 计算平均值
    const avgValue = allValues.length > 0 ? (allValues.reduce((a, b) => a + b, 0) / allValues.length).toFixed(1) : 0;
    
    // 构建图例选择的默认状态 - 默认只显示线程0
    const legendSelected = {};
    threadIds.forEach(threadId => {
        const seriesName = threadId === '0' ? 'e线程0' : `其他线程${threadId}`;
        legendSelected[seriesName] = (threadId === '0');
    });
    
    // 更新 selectedThreads 变量
    selectedThreads = threadIds.filter(threadId => legendSelected[threadId === '0' ? 'e线程0' : `其他线程${threadId}`]);
    
    const option = {
        backgroundColor: 'transparent',
        tooltip: {
            trigger: 'axis',
            backgroundColor: 'rgba(30, 41, 59, 0.95)',
            borderColor: color,
            borderWidth: 1,
            textStyle: { color: '#f1f5f9', fontSize: 12 },
            formatter: function(params) {
                if (!params?.length) return '';
                const date = params[0].axisValue;
                const rows = params.map(p => `<div>${p.seriesName}: ${p.value} ${unit}</div>`).join('');
                const mrComment = mrUpdateDates[date] || '';
                const mrStyle = mrComment ? 'color: #ef4444;' : 'color: #94a3b8;';
                return `<strong>📅 ${date}</strong>${rows}<span style="${mrStyle}">🔧 ${mrComment || '无MR更新'}</span>`;
            }
        },
        grid: { left: '8%', right: '8%', top: '18%', bottom: '10%', containLabel: true },
        xAxis: {
            type: 'category',
            data: dates,
            axisLabel: { rotate: dates.length > 10 ? 30 : 0, color: '#94a3b8', fontSize: 11 },
            axisLine: { lineStyle: { color: '#475569' } }
        },
        yAxis: {
            type: 'value',
            name: yAxisName,
            nameTextStyle: { color: '#cbd5e1', fontSize: 12 },
            axisLabel: { color: '#94a3b8', fontSize: 11, formatter: yAxisFormatter },
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
            textStyle: { color: '#cbd5e1', fontSize: 11 },
            orient: 'horizontal',
            right: 10,
            top: 0,
            itemWidth: 25,
            itemHeight: 12,
            selector: false
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
    
    if (charts[chartType]) {
        charts[chartType].setOption(option, { notMerge: false, lazyUpdate: true });
    }
}

/**
 * 刷新所有时序图表
 */
function refreshTimelineCharts() {
    if (!currentRule) return;
    
    renderTimelineChart('runtime', 'runtimes', '#6366f1', 'Runtime (秒)');
    renderTimelineChart('memory', 'memories', '#10b981', 'Memory (MB)', (value) => {
        if (value >= 1024) return (value / 1024).toFixed(1) + ' GB';
        return value + ' MB';
    });
    updateChartTypeButtons();
    
    // 图表重新渲染后，重新添加控制按钮
    setTimeout(() => {
        addControlButtonsToLegend();
    }, 100);
}

/**
 * 更新项目统计
 */
function updateProjectStats() {
    const projectData = getCurrentProjectData();
    if (!projectData) return;
    
    const statsContainer = document.getElementById('projectStats');
    statsContainer.innerHTML = `
        <div class="stat-item"><div class="stat-value">${projectData.rules?.length || 0}</div><div class="stat-label">阶段数</div></div>
        <div class="stat-item"><div class="stat-value">${projectData.dates?.length || 0}</div><div class="stat-label">天数</div></div>
        <div class="stat-item"><div class="stat-value">-</div><div class="stat-label">平均Runtime</div></div>
    `;
}

/**
 * 将控制按钮添加到图例区域
 */
function addControlButtonsToLegend() {
    // 查找 ECharts 图例容器
    const legendContainer = document.querySelector('.chart-container .echarts-legend');
    if (!legendContainer) return;
    
    // 检查是否已存在按钮
    if (document.getElementById('legendControlButtons')) return;
    
    // 创建按钮容器
    const buttonContainer = document.createElement('div');
    buttonContainer.id = 'legendControlButtons';
    buttonContainer.style.cssText = `
        display: inline-flex;
        gap: 6px;
        margin-left: 12px;
        vertical-align: middle;
    `;
    
    // 全选按钮
    const selectAllBtn = document.createElement('button');
    selectAllBtn.textContent = '☑ 全选';
    selectAllBtn.style.cssText = `
        background: rgba(99, 102, 241, 0.2);
        border: 1px solid #6366f1;
        color: #a5b4fc;
        padding: 2px 8px;
        border-radius: 12px;
        font-size: 11px;
        cursor: pointer;
        transition: all 0.2s;
        font-family: inherit;
    `;
    selectAllBtn.onmouseenter = () => {
        selectAllBtn.style.background = '#6366f1';
        selectAllBtn.style.color = 'white';
    };
    selectAllBtn.onmouseleave = () => {
        selectAllBtn.style.background = 'rgba(99, 102, 241, 0.2)';
        selectAllBtn.style.color = '#a5b4fc';
    };
    selectAllBtn.onclick = (e) => {
        e.stopPropagation();
        selectAllThreads();
    };
    
    // 反选按钮
    const inverseBtn = document.createElement('button');
    inverseBtn.textContent = '🔄 反选';
    inverseBtn.style.cssText = `
        background: rgba(99, 102, 241, 0.2);
        border: 1px solid #6366f1;
        color: #a5b4fc;
        padding: 2px 8px;
        border-radius: 12px;
        font-size: 11px;
        cursor: pointer;
        transition: all 0.2s;
        font-family: inherit;
    `;
    inverseBtn.onmouseenter = () => {
        inverseBtn.style.background = '#6366f1';
        inverseBtn.style.color = 'white';
    };
    inverseBtn.onmouseleave = () => {
        inverseBtn.style.background = 'rgba(99, 102, 241, 0.2)';
        inverseBtn.style.color = '#a5b4fc';
    };
    inverseBtn.onclick = (e) => {
        e.stopPropagation();
        inverseSelectThreads();
    };
    
    buttonContainer.appendChild(selectAllBtn);
    buttonContainer.appendChild(inverseBtn);
    
    // 将按钮添加到图例容器
    legendContainer.appendChild(buttonContainer);
}

/**
 * 监听图表渲染完成，添加控制按钮
 */
function observeChartRendering() {
    // 使用 MutationObserver 监听图表容器变化
    const runtimeChart = document.getElementById('chart-runtime');
    if (runtimeChart) {
        const observer = new MutationObserver(() => {
            addControlButtonsToLegend();
        });
        observer.observe(runtimeChart, { attributes: true, childList: true, subtree: true });
    }
    
    const memoryChart = document.getElementById('chart-memory');
    if (memoryChart) {
        const observer = new MutationObserver(() => {
            addControlButtonsToLegend();
        });
        observer.observe(memoryChart, { attributes: true, childList: true, subtree: true });
    }
}

// ==================================================
// 多线程对比模块
// ==================================================

/**
 * 加载多线程阶段的规则列表
 */
async function loadMultiRules(projectId) {
    try {
        const response = await fetch(`/api/project/${projectId}`);
        const data = await response.json();
        
        const ruleSelect = document.getElementById('multiRuleSelect');
        if (data?.rules?.length) {
            ruleSelect.innerHTML = '<option value="">-- 请选择阶段 --</option>' + 
                data.rules.map(rule => `<option value="${rule}">${rule}</option>`).join('');
        }
    } catch (error) {
        console.error('加载规则失败:', error);
    }
}

/**
 * 加载多线程日期列表
 */
async function loadMultiDates(projectId, ruleName) {
    if (!ruleName) return;
    
    try {
        const response = await fetch(`/api/project/${projectId}`);
        const data = await response.json();
        
        const ruleData = data?.rule_data?.[ruleName];
        if (ruleData?.dates?.length) {
            const dateSelect = document.getElementById('multiDateSelect');
            dateSelect.innerHTML = ruleData.dates.map(date => `<option value="${date}">${date}</option>`).join('');
            currentMultiDate = ruleData.dates[ruleData.dates.length - 1];
            dateSelect.value = currentMultiDate;
            loadMultiThreadData(projectId, ruleName, currentMultiDate);
        }
    } catch (error) {
        console.error('加载日期失败:', error);
    }
}

/**
 * 加载多线程数据
 */
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
            renderMultiThreadCharts(result.threads_data);
            updateMultiStats(result.threads_data);
        }
    } catch (error) {
        console.error('加载多线程数据失败:', error);
        showNotification('加载多线程数据失败', true);
    } finally {
        showLoading(false);
    }
}

/**
 * 渲染多线程图表
 */
function renderMultiThreadCharts(threadsData) {
    const threads = threadsData.map(d => d.threads);
    const runtimes = threadsData.map(d => d.runtime);
    const memories = threadsData.map(d => d.memory);
    
    // Runtime 图表
    if (charts.multiRuntime) {
        charts.multiRuntime.setOption({
            tooltip: { trigger: 'axis', formatter: (params) => `${params[0].axisValue} 线程: ${params[0].value} 秒` },
            xAxis: { type: 'category', name: '线程数', data: threads },
            yAxis: { type: 'value', name: 'Runtime (秒)' },
            series: [{ type: 'line', data: runtimes, smooth: true, lineStyle: { width: 3, color: '#6366f1' }, symbolSize: 8 }]
        });
    }
    
    // Memory 图表
    if (charts.multiMemory) {
        charts.multiMemory.setOption({
            tooltip: { trigger: 'axis', formatter: (params) => `${params[0].axisValue} 线程: ${params[0].value} MB` },
            xAxis: { type: 'category', name: '线程数', data: threads },
            yAxis: { type: 'value', name: 'Memory (MB)' },
            series: [{ type: 'line', data: memories, smooth: true, lineStyle: { width: 3, color: '#10b981' }, symbolSize: 8 }]
        });
    }
}

/**
 * 更新多线程统计
 */
function updateMultiStats(threadsData) {
    const runtimes = threadsData.map(d => d.runtime).filter(v => v !== null);
    const memories = threadsData.map(d => d.memory).filter(v => v !== null);
    
    const avgRuntime = runtimes.length ? (runtimes.reduce((a, b) => a + b, 0) / runtimes.length).toFixed(1) : '-';
    const avgMemory = memories.length ? (memories.reduce((a, b) => a + b, 0) / memories.length).toFixed(1) : '-';
    
    document.getElementById('multiStats').innerHTML = `
        <div class="stat-item"><div class="stat-value">${threadsData.length}</div><div class="stat-label">线程数</div></div>
        <div class="stat-item"><div class="stat-value">${avgRuntime}秒</div><div class="stat-label">平均Runtime</div></div>
        <div class="stat-item"><div class="stat-value">${avgMemory}MB</div><div class="stat-label">平均Memory</div></div>
    `;
}

// ==================================================
// 数据对比模块
// ==================================================

let currentCompareResult = null;

/**
 * 加载对比页面的日期列表
 */
async function loadCompareDates(projectId) {
    try {
        const response = await fetch('/api/get_dates', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ project_id: projectId })
        });
        const data = await response.json();
        
        if (data.success && data.dates?.length) {
            const date1Select = document.getElementById('compareDate1');
            const date2Select = document.getElementById('compareDate2');
            
            date1Select.innerHTML = '<option value="">请选择日期</option>';
            date2Select.innerHTML = '<option value="">请选择日期</option>';
            
            data.dates.forEach(date => {
                date1Select.appendChild(new Option(date, date));
                date2Select.appendChild(new Option(date, date));
            });
            
            // 默认选择最近两天
            if (data.dates.length >= 2) {
                date1Select.value = data.dates[data.dates.length - 2];
                date2Select.value = data.dates[data.dates.length - 1];
            }
        }
    } catch (error) {
        console.error('加载日期失败:', error);
    }
}

/**
 * 加载对比页面的规则列表
 */
async function loadCompareRules(projectId) {
    try {
        const response = await fetch(`/api/project/${projectId}`);
        const data = await response.json();
        
        const ruleSelect = document.getElementById('compareRuleSelect');
        if (data?.rules?.length) {
            ruleSelect.innerHTML = '<option value="all">📊 所有阶段</option>' + 
                data.rules.map(rule => `<option value="${rule}">${rule}</option>`).join('');
        }
    } catch (error) {
        console.error('加载规则失败:', error);
    }
}

/**
 * 执行数据对比
 */
async function executeCompare() {
    const projectId = document.getElementById('compareCaseSelect').value;
    const compareMode = document.getElementById('compareModeSelect').value;
    let ruleName = document.getElementById('compareRuleSelect').value;
    const date1 = document.getElementById('compareDate1').value;
    const date2 = document.getElementById('compareDate2').value;
    const toleranceRuntime = parseFloat(document.getElementById('toleranceRuntime').value) || 0;
    const toleranceMemory = parseFloat(document.getElementById('toleranceMemory').value) || 0;
    const toleranceMode = document.getElementById('toleranceMode').value;
    
    if (compareMode === 'all') ruleName = 'all';
    
    if (!projectId || !date1 || !date2) {
        showNotification('请完整填写对比参数', true);
        return;
    }
    
    if (date1 === date2) {
        showNotification('请选择两个不同的日期', true);
        return;
    }
    
    showLoading(true);
    
    try {
        const response = await fetch('/api/compare', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                project_id: projectId,
                rule_name: ruleName,
                date1, date2,
                tolerance_runtime: toleranceRuntime,
                tolerance_memory: toleranceMemory,
                tolerance_mode: toleranceMode
            })
        });
        
        const result = await response.json();
        
        if (result.success && result.result) {
            currentCompareResult = result.result;
            displayCompareResult(result.result);
            document.getElementById('compareResultArea').style.display = 'block';
        } else {
            showNotification('对比失败: ' + (result.error || '未知错误'), true);
        }
    } catch (error) {
        console.error('对比失败:', error);
        showNotification('对比失败: ' + error.message, true);
    } finally {
        showLoading(false);
    }
}

/**
 * 显示对比结果
 */
function displayCompareResult(result) {
    const isAllRules = result.mode === 'all_rules';
    document.getElementById('compareResultTitle').innerHTML = 
        isAllRules ? '📈 全阶段对比结果' : `📈 单阶段对比结果 - ${result.rule_name}`;
    
    const summary = result.summary;
    
    if (isAllRules) {
        document.getElementById('compareSummary').innerHTML = `
            <div class="stat-item"><div class="stat-value">${summary.total_rules || 0}</div><div class="stat-label">总阶段数</div></div>
            <div class="stat-item"><div class="stat-value">${summary.rules_with_data || 0}</div><div class="stat-label">有效数据</div></div>
            <div class="stat-item"><div class="stat-value">${summary.runtime?.total_increase || 0}</div><div class="stat-label">Runtime增加</div></div>
            <div class="stat-item"><div class="stat-value">${summary.runtime?.total_decrease || 0}</div><div class="stat-label">Runtime减少</div></div>
            <div class="stat-item"><div class="stat-value">${summary.memory?.total_increase || 0}</div><div class="stat-label">Memory增加</div></div>
            <div class="stat-item"><div class="stat-value">${summary.memory?.total_decrease || 0}</div><div class="stat-label">Memory减少</div></div>
        `;
        
        const thead = document.getElementById('compareTableHeader');
        thead.innerHTML = `<tr>
                <th>阶段名称</th>
                <th>Runtime(基准)</th>
                <th>Runtime(对比)</th>
                <th>Runtime差值</th>
                <th>Runtime变化率(%)</th>
                <th>Memory(基准)</th>
                <th>Memory(对比)</th>
                <th>Memory差值</th>
                <th>Memory变化率(%)</th>
                <th>状态</th>
            </tr>`;
        
        const tbody = document.getElementById('compareTableBody');
        tbody.innerHTML = (result.rules_comparison || []).map(rule => {
            const statusText = () => {
                if (!rule.has_data) return '无数据';
                if (rule.runtime_status === 'increase') return '⬆️ 增加';
                if (rule.runtime_status === 'decrease') return '⬇️ 减少';
                return '➖ 不变';
            };
            return `<tr>
                <td>${rule.rule_name}</td>
                <td>${rule.runtime1 !== null ? rule.runtime1.toFixed(2) : 'N/A'}</td>
                <td>${rule.runtime2 !== null ? rule.runtime2.toFixed(2) : 'N/A'}</td>
                <td>${rule.runtime_diff !== null ? rule.runtime_diff.toFixed(2) : 'N/A'}</td>
                <td class="${rule.runtime_change_pct > 0 ? 'status-increase' : (rule.runtime_change_pct < 0 ? 'status-decrease' : '')}">${rule.runtime_change_pct !== null ? rule.runtime_change_pct.toFixed(2) + '%' : 'N/A'}</td>
                <td>${rule.memory1 !== null ? rule.memory1.toFixed(2) : 'N/A'}</td>
                <td>${rule.memory2 !== null ? rule.memory2.toFixed(2) : 'N/A'}</td>
                <td>${rule.memory_diff !== null ? rule.memory_diff.toFixed(2) : 'N/A'}</td>
                <td class="${rule.memory_change_pct > 0 ? 'status-increase' : (rule.memory_change_pct < 0 ? 'status-decrease' : '')}">${rule.memory_change_pct !== null ? rule.memory_change_pct.toFixed(2) + '%' : 'N/A'}</td>
                <td>${statusText()}</td>
            </tr>`;
        }).join('');
    } else {
        document.getElementById('compareSummary').innerHTML = `
            <div class="stat-item"><div class="stat-value">${summary.total || 0}</div><div class="stat-label">数据点数</div></div>
            <div class="stat-item"><div class="stat-value">${summary.runtime_increased || 0}</div><div class="stat-label">Runtime增加</div></div>
            <div class="stat-item"><div class="stat-value">${summary.runtime_decreased || 0}</div><div class="stat-label">Runtime减少</div></div>
            <div class="stat-item"><div class="stat-value">${summary.runtime_avg_change || 0}%</div><div class="stat-label">平均变化率</div></div>
        `;
        
        const thead = document.getElementById('compareTableHeader');
        thead.innerHTML = `<tr><th>序号</th><th>日期</th><th>Runtime(基准)</th><th>Runtime(对比)</th><th>变化率(%)</th><th>状态</th></tr>`;
        
        const tbody = document.getElementById('compareTableBody');
        tbody.innerHTML = (result.comparisons || []).map(comp => `
            <tr>
                <td>${comp.index + 1}</td>
                <td>${comp.date || 'N/A'}</td>
                <td>${comp.runtime1.toFixed(2)}</td>
                <td>${comp.runtime2.toFixed(2)}</td>
                <td class="${comp.runtime_change_pct > 0 ? 'status-increase' : (comp.runtime_change_pct < 0 ? 'status-decrease' : '')}">${comp.runtime_change_pct.toFixed(2)}%</td>
                <td>${comp.runtime_status === 'increase' ? '⬆️ 增加' : (comp.runtime_status === 'decrease' ? '⬇️ 减少' : '➖ 不变')}</td>
            </tr>
        `).join('');
    }
}

/**
 * 导出对比结果
 */
async function exportCompareResult() {
    if (!currentCompareResult) {
        showNotification('没有可导出的对比结果', true);
        return;
    }
    
    try {
        const response = await fetch('/api/export_compare', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ result: currentCompareResult })
        });
        
        const result = await response.json();
        
        if (result.success) {
            const link = document.createElement('a');
            link.href = result.download_url;
            link.download = result.filename;
            link.click();
            showNotification('导出成功');
        } else {
            showNotification('导出失败: ' + (result.error || '未知错误'), true);
        }
    } catch (error) {
        console.error('导出失败:', error);
        showNotification('导出失败', true);
    }
}

// ==================================================
// 日期选择模块
// ==================================================

let pendingSelectedDates = [];

/**
 * 构建日期选择器
 */
function buildDatePicker(usePending = false) {
    const container = document.getElementById('dateOptionsContainer');
    if (!container) return;
    
    const currentSelection = usePending ? pendingSelectedDates : selectedDates;
    const filterText = document.getElementById('dateFilterInput')?.value || '';
    const filteredDates = availableDates.filter(date => date.toLowerCase().includes(filterText.toLowerCase()));
    
    container.innerHTML = filteredDates.map(date => `
        <label class="date-option">
            <input type="checkbox" value="${date}" ${currentSelection.includes(date) ? 'checked' : ''}>
            <span>${date}</span>
        </label>
    `).join('');
    
    // 绑定事件
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

/**
 * 打开日期选择模态框
 */
function openDatePickerModal() {
    pendingSelectedDates = [...selectedDates];
    buildDatePicker(true);
    document.getElementById('datePickerModal').classList.remove('hidden');
}

/**
 * 关闭日期选择模态框
 */
function closeDatePickerModal() {
    document.getElementById('datePickerModal').classList.add('hidden');
}

/**
 * 确认日期选择
 */
function confirmDateSelection() {
    if (pendingSelectedDates.length === 0) {
        pendingSelectedDates = availableDates.slice(-51);
    }
    selectedDates = [...pendingSelectedDates];
    updateDateSelectionInfo();
    refreshTimelineCharts();
    closeDatePickerModal();
}

/**
 * 重置日期选择
 */
function resetDateSelection(useAll = false) {
    selectedDates = useAll ? [...availableDates] : availableDates.slice(-51);
    updateDateSelectionInfo();
    refreshTimelineCharts();
}

// ==================================================
// 数据刷新模块
// ==================================================

/**
 * 刷新所有数据
 */
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
            // 更新全局数据
            Object.assign(projectsData, result.data);
            mrUpdateDates = buildMrUpdateMap(result.perf);
            currentDataVersion = result.version;
            cachedToolData = {};
            
            // 更新项目列表
            if (result.project_list?.length) {
                const caseSelect = document.getElementById('caseSelect');
                const currentVal = caseSelect.value;
                caseSelect.innerHTML = result.project_list.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
                if (result.project_list.some(p => p.id === currentVal)) {
                    caseSelect.value = currentVal;
                }
            }
            
            // 刷新界面
            if (currentProjectId) {
                updateRuleSelect();
                updateProjectStats();
                refreshTimelineCharts();
            }
            
            updateLastUpdateTime();
            showNotification('数据刷新成功');
        } else {
            throw new Error(result.message || '刷新失败');
        }
    } catch (error) {
        console.error('刷新失败:', error);
        showNotification('刷新失败: ' + error.message, true);
    } finally {
        showLoading(false);
    }
}

// ==================================================
// 视图切换
// ==================================================

/**
 * 切换视图
 */
function switchView(viewId) {
    // 隐藏所有视图
    document.querySelectorAll('.view-container').forEach(view => {
        view.classList.remove('active');
    });
    document.getElementById(`${viewId}View`).classList.add('active');
    
    // 更新侧边栏激活状态
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
        if (item.dataset.view === viewId) {
            item.classList.add('active');
        }
    });
    
    // 视图特定初始化
    if (viewId === 'multithread') {
        setTimeout(() => {
            if (charts.multiRuntime) charts.multiRuntime.resize();
            if (charts.multiMemory) charts.multiMemory.resize();
        }, 100);
    } else if (viewId === 'timeline') {
        setTimeout(() => {
            if (charts.runtime) charts.runtime.resize();
            if (charts.memory) charts.memory.resize();
        }, 100);
    }
}

// ==================================================
// 初始化 ECharts
// ==================================================

/**
 * 初始化所有图表
 */
function initCharts() {
    // 时序图表
    const runtimeDom = document.getElementById('chart-runtime');
    const memoryDom = document.getElementById('chart-memory');
    
    if (runtimeDom) {
        charts.runtime = echarts.init(runtimeDom);
        charts.runtime.on('legendselectchanged', handleLegendSelectionChanged);
    }
    if (memoryDom) {
        charts.memory = echarts.init(memoryDom);
        charts.memory.on('legendselectchanged', handleLegendSelectionChanged);
    }
    
    // 多线程图表
    const multiRuntimeDom = document.getElementById('chart-multi-runtime');
    const multiMemoryDom = document.getElementById('chart-multi-memory');
    
    if (multiRuntimeDom) charts.multiRuntime = echarts.init(multiRuntimeDom);
    if (multiMemoryDom) charts.multiMemory = echarts.init(multiMemoryDom);
    
    // 窗口大小自适应
    window.addEventListener('resize', () => {
        Object.values(charts).forEach(chart => chart?.resize());
    });
    
    // 监听图表渲染，添加控制按钮
    observeChartRendering();
    setTimeout(() => {
        addControlButtonsToLegend();
    }, 500);
}

// ==================================================
// 事件绑定
// ==================================================

/**
 * 绑定所有事件监听器
 */
function bindEvents() {
    // 项目选择变化
    document.getElementById('caseSelect').addEventListener('change', (e) => {
        currentProjectId = e.target.value;
        currentRule = null;
        cachedToolData = {};
        selectedDates = [];
        updateRuleSelect();
        updateProjectStats();
        updateDateSelectionInfo();
    });
    
    // 阶段选择变化
    document.getElementById('ruleSelect').addEventListener('change', (e) => {
        currentRule = e.target.value;
        if (currentRule) {
            document.getElementById('currentRuleName').innerText = currentRule;
            refreshTimelineCharts();
        }
    });
    
    // 阶段搜索
    document.getElementById('ruleSearch').addEventListener('input', debounce(() => {
        updateRuleSelect();
    }, 300));
    
    // 曲线类型按钮
    document.querySelectorAll('.chart-type-btn').forEach(btn => {
        btn.addEventListener('click', () => selectChartType(btn.dataset.type));
    });
    
    // 刷新按钮
    document.getElementById('refreshDataBtn').addEventListener('click', refreshAllData);
    
    // 日期选择
    document.getElementById('openDatePickerBtn')?.addEventListener('click', openDatePickerModal);
    document.getElementById('closeDateModalBtn')?.addEventListener('click', closeDatePickerModal);
    document.getElementById('confirmDateBtn')?.addEventListener('click', confirmDateSelection);
    document.getElementById('selectRecentBtn')?.addEventListener('click', () => resetDateSelection(false));
    document.getElementById('selectAllDatesBtn')?.addEventListener('click', () => resetDateSelection(true));
    
    // 日期筛选输入
    document.getElementById('dateFilterInput')?.addEventListener('input', debounce(() => {
        buildDatePicker(true);
    }, 150));
    
    // 多线程相关事件
    document.getElementById('multiCaseSelect')?.addEventListener('change', (e) => {
        currentProjectId = e.target.value;
        loadMultiRules(currentProjectId);
    });
    
    document.getElementById('multiRuleSelect')?.addEventListener('change', (e) => {
        currentMultiRule = e.target.value;
        if (currentMultiRule) {
            loadMultiDates(currentProjectId, currentMultiRule);
        }
    });
    
    document.getElementById('multiDateSelect')?.addEventListener('change', (e) => {
        currentMultiDate = e.target.value;
        if (currentMultiRule && currentMultiDate) {
            loadMultiThreadData(currentProjectId, currentMultiRule, currentMultiDate);
        }
    });
    
    document.getElementById('multiRefreshBtn')?.addEventListener('click', () => {
        if (currentMultiRule && currentMultiDate) {
            loadMultiThreadData(currentProjectId, currentMultiRule, currentMultiDate);
        }
    });
    
    // 对比相关事件
    document.getElementById('compareCaseSelect')?.addEventListener('change', (e) => {
        const projectId = e.target.value;
        if (projectId) {
            loadCompareDates(projectId);
            loadCompareRules(projectId);
        }
    });
    
    document.getElementById('compareModeSelect')?.addEventListener('change', (e) => {
        const ruleGroup = document.getElementById('compareRuleGroup');
        if (e.target.value === 'all') {
            ruleGroup.style.display = 'none';
        } else {
            ruleGroup.style.display = 'block';
        }
    });
    
    document.getElementById('executeCompareBtn')?.addEventListener('click', executeCompare);
    document.getElementById('exportCompareBtn')?.addEventListener('click', exportCompareResult);
    
    // 侧边栏导航
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', () => switchView(item.dataset.view));
    });
}

// ==================================================
// 初始化应用
// ==================================================

/**
 * 应用初始化
 */
async function init() {
    // 初始化图表
    initCharts();
    
    // 绑定事件
    bindEvents();
    
    // 初始化MR映射
    mrUpdateDates = buildMrUpdateMap(perf);
    
    // 设置初始项目
    const caseSelect = document.getElementById('caseSelect');
    if (caseSelect.options.length > 0) {
        currentProjectId = caseSelect.value;
        updateRuleSelect();
        updateProjectStats();
        updateDateSelectionInfo();
        updateChartTypeButtons();
    }
    
    // 根据URL参数切换视图
    if (initialMode === 'multi') {
        switchView('multithread');
        // 初始化多线程数据
        if (caseSelect.options.length > 0) {
            await loadMultiRules(currentProjectId);
        }
    } else if (initialMode === 'compare') {
        switchView('compare');
        // 初始为 compare 视图时，从 compareCaseSelect 读取项目（优先），再加载日期和规则
        const compareSelect = document.getElementById('compareCaseSelect');
        const projId = compareSelect?.value || currentProjectId;
        if (projId) {
            currentProjectId = projId;
            await loadCompareDates(currentProjectId);
            await loadCompareRules(currentProjectId);
        }
    }
    
    // 启动自动刷新检查（每30秒）
    setInterval(() => {
        // 静默检查更新
        fetch('/api/check_update', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tool: toolId, mode: 'single', version: currentDataVersion })
        }).then(res => res.json())
          .then(result => {
              if (result.has_update) {
                  showNotification('发现新数据，点击刷新按钮更新');
              }
          }).catch(() => {});
    }, 30000);
    
    updateLastUpdateTime();
}

// 启动应用
init();