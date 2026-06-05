/**
 * 多线程对比模块 - 统一折线图样式
 */

// 多线程全局变量
let multiState = {
    currentProjectId: null,
    currentRule: null,
    currentDate: null,
    availableDates: [],
    currentChartType: 'runtime',
    selectedThreads: [],
    availableThreads: [],
    currentData: [],
    pendingSelectedDates: []
};

// ==================================================
// 数据获取
// ==================================================

/**
 * 加载多线程数据
 * @param {string} projectId - 项目ID
 * @param {string} ruleName - 阶段名称
 * @param {string} date - 日期
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
            // 更新可用线程列表
            multiState.availableThreads = result.threads_data.map(d => d.threads.toString()).sort((a, b) => parseInt(a) - parseInt(b));
            
            // 默认显示所有线程
            multiState.selectedThreads = [...multiState.availableThreads];
            
            multiState.currentData = result.threads_data;
            renderMultiThreadChart();
            updateMultiStats(multiState.currentData);
        } else {
            // 无数据时清空
            multiState.availableThreads = [];
            multiState.selectedThreads = [];
            multiState.currentData = [];
            const chart = multiState.currentChartType === 'runtime' 
                ? ChartManager.get('chart-multi-runtime') 
                : ChartManager.get('chart-multi-memory');
            if (chart && !chart.isDisposed()) {
                chart.clear();
                chart.setOption({
                    title: {
                        show: true,
                        text: '所选日期无数据',
                        textStyle: { color: '#94a3b8' },
                        left: 'center',
                        top: 'center'
                    }
                }, true);
            }
            const statsContainer = document.getElementById('multiStats');
            if (statsContainer) {
                statsContainer.innerHTML = '<div class="stat-item"><div class="stat-value">-</div><div class="stat-label">暂无数据</div></div>';
            }
            const detailContainer = document.getElementById('multiStatsDetail');
            if (detailContainer) {
                detailContainer.innerHTML = '';
            }
        }
    } catch (error) {
        console.error('加载多线程数据失败:', error);
        showNotification('加载多线程数据失败', true);
        multiState.availableThreads = [];
        multiState.selectedThreads = [];
    } finally {
        showLoading(false);
    }
}

/**
 * 加载多线程可用日期
 * @param {string} projectId - 项目ID
 * @param {string} ruleName - 阶段名称
 */
async function loadMultiDates(projectId, ruleName) {
    if (!ruleName) {
        multiState.availableDates = [];
        multiState.currentDate = null;
        const currentDateSpan = document.getElementById('multiCurrentDate');
        if (currentDateSpan) currentDateSpan.innerText = '请先选择阶段';
        return;
    }
    
    try {
        const response = await fetch(`/api/project/${projectId}`);
        const data = await response.json();
        
        // 获取指定阶段的可用日期
        const ruleData = data?.rule_data?.[ruleName];
        if (ruleData?.dates?.length) {
            multiState.availableDates = ruleData.dates;
            // 默认选择最新日期
            multiState.currentDate = multiState.availableDates[multiState.availableDates.length - 1];
            
            const currentDateSpan = document.getElementById('multiCurrentDate');
            if (currentDateSpan) currentDateSpan.innerText = multiState.currentDate;
            
            // 同时获取线程数据
            await loadMultiThreadData(projectId, ruleName, multiState.currentDate);
        } else {
            multiState.availableDates = [];
            multiState.currentDate = null;
            const currentDateSpan = document.getElementById('multiCurrentDate');
            if (currentDateSpan) currentDateSpan.innerText = '无可用日期';
            showNotification('所选阶段无可用数据', true);
            
            // 清空图表
            const chart = multiState.currentChartType === 'runtime' 
                ? ChartManager.get('chart-multi-runtime') 
                : ChartManager.get('chart-multi-memory');
            if (chart && !chart.isDisposed()) {
                chart.clear();
                chart.setOption({
                    title: {
                        show: true,
                        text: '所选阶段无数据',
                        textStyle: { color: '#94a3b8' },
                        left: 'center',
                        top: 'center'
                    }
                }, true);
            }
        }
    } catch (error) {
        console.error('加载日期失败:', error);
        multiState.availableDates = [];
    }
}

/**
 * 加载多线程规则列表
 * @param {string} projectId - 项目ID
 */
async function loadMultiRules(projectId) {
    try {
        const response = await fetch(`/api/project/${projectId}`);
        const data = await response.json();
        
        const ruleSelect = document.getElementById('multiRuleSelect');
        if (ruleSelect && data?.rules?.length) {
            ruleSelect.innerHTML = '<option value="">-- 请选择阶段 --</option>' + 
                data.rules.map(rule => `<option value="${rule}">${rule}</option>`).join('');
            
            // 重置线程选择（默认显示所有线程）
            multiState.selectedThreads = [];
            multiState.availableThreads = [];
            
            if (data.rules.length > 0 && !multiState.currentRule) {
                const firstRule = data.rules[0];
                ruleSelect.value = firstRule;
                multiState.currentRule = firstRule;
                await loadMultiDates(projectId, firstRule);
            } else if (multiState.currentRule && data.rules.includes(multiState.currentRule)) {
                ruleSelect.value = multiState.currentRule;
                await loadMultiDates(projectId, multiState.currentRule);
            }
        } else if (ruleSelect) {
            ruleSelect.innerHTML = '<option value="">-- 请选择阶段 --</option>';
            multiState.currentRule = null;
            multiState.availableDates = [];
            multiState.selectedThreads = [];
            multiState.availableThreads = [];
        }
        
        // 搜索功能
        const searchInput = document.getElementById('multiRuleSearch');
        if (searchInput) {
            // 移除旧监听器
            const oldHandler = searchInput._multiRuleSearchHandler;
            if (oldHandler) {
                searchInput.removeEventListener('input', oldHandler);
            }
            // 创建新监听器
            const handler = debounce(() => {
                const projectData = window.projectsData?.[multiState.currentProjectId];
                if (!projectData) return;
                
                const rules = projectData.rules || [];
                const searchText = document.getElementById('multiRuleSearch')?.value.toLowerCase() || '';
                const filteredRules = searchText ? rules.filter(rule => rule.toLowerCase().includes(searchText)) : rules;
                
                const ruleSelect = document.getElementById('multiRuleSelect');
                const currentValue = ruleSelect?.value;
                
                if (ruleSelect) {
                    ruleSelect.innerHTML = '<option value="">-- 请选择阶段 --</option>';
                    filteredRules.forEach(rule => {
                        const option = document.createElement('option');
                        option.value = rule;
                        option.textContent = rule;
                        ruleSelect.appendChild(option);
                    });
                    
                    if (currentValue && filteredRules.includes(currentValue)) {
                        ruleSelect.value = currentValue;
                        if (multiState.currentRule !== currentValue) {
                            multiState.currentRule = currentValue;
                            // 重置线程选择
                            multiState.selectedThreads = [];
                            multiState.availableThreads = [];
                            loadMultiDates(multiState.currentProjectId, currentValue);
                        }
                    } else if (filteredRules.length > 0 && !multiState.currentRule) {
                        ruleSelect.value = filteredRules[0];
                        multiState.currentRule = filteredRules[0];
                        // 重置线程选择
                        multiState.selectedThreads = [];
                        multiState.availableThreads = [];
                        loadMultiDates(multiState.currentProjectId, multiState.currentRule);
                    }
                }
            }, 300);
            
            searchInput._multiRuleSearchHandler = handler;
            searchInput.addEventListener('input', handler);
        }
    } catch (error) {
        console.error('加载规则失败:', error);
    }
}

// 规则搜索处理函数
let multiRuleSearchHandler = debounce(() => {
    const projectData = window.projectsData?.[multiState.currentProjectId];
    if (!projectData) return;
    
    const rules = projectData.rules || [];
    const searchText = document.getElementById('multiRuleSearch')?.value.toLowerCase() || '';
    const filteredRules = searchText ? rules.filter(rule => rule.toLowerCase().includes(searchText)) : rules;
    
    const ruleSelect = document.getElementById('multiRuleSelect');
    const currentValue = ruleSelect?.value;
    
    if (ruleSelect) {
        ruleSelect.innerHTML = '<option value="">-- 请选择阶段 --</option>';
        filteredRules.forEach(rule => {
            const option = document.createElement('option');
            option.value = rule;
            option.textContent = rule;
            ruleSelect.appendChild(option);
        });
        
        if (currentValue && filteredRules.includes(currentValue)) {
            ruleSelect.value = currentValue;
            if (multiState.currentRule !== currentValue) {
                multiState.currentRule = currentValue;
                // 重置线程选择
                multiState.selectedThreads = [];
                multiState.availableThreads = [];
                loadMultiDates(multiState.currentProjectId, currentValue);
            }
        } else if (filteredRules.length > 0 && !multiState.currentRule) {
            ruleSelect.value = filteredRules[0];
            multiState.currentRule = filteredRules[0];
            // 重置线程选择
            multiState.selectedThreads = [];
            multiState.availableThreads = [];
            loadMultiDates(multiState.currentProjectId, multiState.currentRule);
        }
    }
}, 300);

// ==================================================
// 图表渲染 - 统一折线图样式
// ==================================================

/**
 * 渲染多线程图表（单日期对比线程性能）
 */
function renderMultiThreadChart() {
    if (!multiState.currentData || multiState.currentData.length === 0) {
        const chart = multiState.currentChartType === 'runtime' 
            ? ChartManager.get('chart-multi-runtime') 
            : ChartManager.get('chart-multi-memory');
        if (chart && !chart.isDisposed()) {
            chart.setOption({
                title: {
                    show: true,
                    text: '请先选择项目和阶段',
                    textStyle: { color: '#94a3b8' },
                    left: 'center',
                    top: 'center'
                },
                series: []
            }, true);
        }
        return;
    }
    
    // 使用选中的线程，如果没选中任何线程则显示所有
    let filteredData = multiState.currentData;
    if (multiState.selectedThreads.length > 0) {
        filteredData = multiState.currentData.filter(d => multiState.selectedThreads.includes(d.threads.toString()));
    }
    
    if (filteredData.length === 0) {
        const chart = multiState.currentChartType === 'runtime' 
            ? ChartManager.get('chart-multi-runtime') 
            : ChartManager.get('chart-multi-memory');
        if (chart && !chart.isDisposed()) {
            chart.setOption({
                title: {
                    show: true,
                    text: '请选择至少一个线程',
                    textStyle: { color: '#94a3b8' },
                    left: 'center',
                    top: 'center'
                },
                series: []
            }, true);
        }
        return;
    }
    
    const threads = filteredData.map(d => d.threads);
    const isRuntime = multiState.currentChartType === 'runtime';
    const chartData = isRuntime ? filteredData.map(d => d.runtime) : filteredData.map(d => d.memory);
    const yAxisName = isRuntime ? 'Runtime (秒)' : 'Memory (MB)';
    const chart = isRuntime ? ChartManager.get('chart-multi-runtime') : ChartManager.get('chart-multi-memory');
    
    if (!chart || chart.isDisposed()) return;
    
    // 在设置新数据前，先确保容器尺寸正确
    const container = document.getElementById(isRuntime ? 'chart-multi-runtime' : 'chart-multi-memory');
    if (container && container.offsetWidth > 0) {
        chart.resize();
    }
    
    // 计算所有值用于参考线
    const allValues = chartData.filter(v => v !== null && v !== undefined && v > 0);
    const avgValue = allValues.length > 0 
        ? (allValues.reduce((a, b) => a + b, 0) / allValues.length).toFixed(1) 
        : 0;
    
    // 计算参考线值
    let referenceValue = avgValue;
    if (!isRuntime && allValues.length > 0) {
        const sorted = [...allValues].sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        referenceValue = sorted[mid];
    }
    
    // 工具提示格式化
    const tooltipFormatter = (params) => {
        if (!params?.length) return '';
        const unit = isRuntime ? '秒' : 'MB';
        let value = params[0].value;
        let displayValue = (value !== null && value !== undefined) ? 
            (isRuntime ? value.toFixed(2) : (value >= 1024 ? (value / 1024).toFixed(2) + ' GB' : value.toFixed(2))) : 'N/A';
        return `${params[0].axisValue} 线程: ${displayValue} ${unit}`;
    };
    
    const option = {
        backgroundColor: 'transparent',
        title: { show: false },
        tooltip: {
            trigger: 'axis',
            backgroundColor: 'rgba(30, 41, 59, 0.95)',
            borderWidth: 1,
            textStyle: { color: '#f1f5f9', fontSize: 12 },
            formatter: tooltipFormatter
        },
        xAxis: {
            type: 'category',
            name: '线程数',
            data: threads,
            axisLabel: { color: '#94a3b8', fontSize: 11 },
            axisLine: { lineStyle: { color: '#475569' } }
        },
        yAxis: {
            type: 'value',
            name: yAxisName,
            nameTextStyle: { color: '#cbd5e1', fontSize: 12 },
            axisLabel: {
                color: '#94a3b8',
                fontSize: 11,
                formatter: (value) => {
                    if (isRuntime) return value.toFixed(2);
                    if (value >= 1024) return (value / 1024).toFixed(1) + ' GB';
                    return value.toFixed(0);
                }
            },
            splitLine: { lineStyle: { color: 'rgba(71, 85, 105, 0.3)', type: 'dashed' } }
        },
        series: [
            {
                type: 'line',
                name: isRuntime ? 'Runtime' : 'Memory',
                data: chartData,
                smooth: false,
                lineStyle: { width: 3, color: isRuntime ? '#6366f1' : '#10b981' },
                symbolSize: 8,
                symbol: 'circle',
                areaStyle: { opacity: 0.1, color: isRuntime ? '#6366f1' : '#10b981' },
                connectNulls: true,
                itemStyle: { color: isRuntime ? '#6366f1' : '#10b981' }
            },
            {
                name: '平均值',
                type: 'line',
                data: new Array(threads.length).fill(parseFloat(avgValue)),
                lineStyle: { width: 1.5, color: '#f59e0b', type: 'dashed' },
                symbol: 'none',
                tooltip: { show: false }
            },
            {
                name: '参考线',
                type: 'line',
                data: new Array(threads.length).fill(parseFloat(referenceValue)),
                lineStyle: { width: 1, color: '#06b6d4', type: 'dotted' },
                symbol: 'none',
                tooltip: { show: true, formatter: () => `📊 参考线: ${referenceValue.toFixed(2)} ${isRuntime ? '秒' : 'MB'}` }
            }
        ],
        legend: {
            data: [isRuntime ? 'Runtime' : 'Memory', '平均值', '参考线'],
            selected: { [isRuntime ? 'Runtime' : 'Memory']: true, '平均值': true, '参考线': true },
            textStyle: { color: '#cbd5e1', fontSize: 11 },
            orient: 'horizontal',
            right: 10,
            top: 0,
            itemWidth: 25,
            itemHeight: 12
        },
        grid: { top: 50, bottom: 30, left: 65, right: 40, containLabel: true },
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
    
    chart.setOption(option, { notMerge: true });
    
    // 渲染后再次确保尺寸正确
    setTimeout(() => {
        if (chart && !chart.isDisposed()) {
            chart.resize();
        }
    }, 50);
}

/**
 * 更新多线程统计卡片
 * @param {Array} threadsData - 线程数据
 */
function updateMultiStats(threadsData) {
    const runtimes = threadsData.map(d => d.runtime).filter(v => v !== null && v !== undefined);
    const memories = threadsData.map(d => d.memory).filter(v => v !== null && v !== undefined);
    
    if (runtimes.length === 0 && memories.length === 0) {
        const statsContainer = document.getElementById('multiStats');
        if (statsContainer) {
            statsContainer.innerHTML = '<div class="stat-item"><div class="stat-value">-</div><div class="stat-label">暂无数据</div></div>';
        }
        const detailContainer = document.getElementById('multiStatsDetail');
        if (detailContainer) {
            detailContainer.innerHTML = '';
        }
        return;
    }
    
    const avgRuntime = runtimes.length ? (runtimes.reduce((a, b) => a + b, 0) / runtimes.length).toFixed(1) : '-';
    const avgMemory = memories.length ? (memories.reduce((a, b) => a + b, 0) / memories.length).toFixed(1) : '-';
    const maxRuntime = runtimes.length ? Math.max(...runtimes).toFixed(1) : '-';
    const minRuntime = runtimes.length ? Math.min(...runtimes).toFixed(1) : '-';
    const maxMemory = memories.length ? Math.max(...memories).toFixed(1) : '-';
    const minMemory = memories.length ? Math.min(...memories).toFixed(1) : '-';
    
    const statsContainer = document.getElementById('multiStats');
    if (statsContainer) {
        statsContainer.innerHTML = `
            <div class="stat-item"><div class="stat-value">${threadsData.length}</div><div class="stat-label">线程数</div></div>
            <div class="stat-item"><div class="stat-value">${avgRuntime}秒</div><div class="stat-label">平均Runtime</div></div>
            <div class="stat-item"><div class="stat-value">${avgMemory}MB</div><div class="stat-label">平均Memory</div></div>
        `;
    }
    
    const detailContainer = document.getElementById('multiStatsDetail');
    if (detailContainer) {
        detailContainer.innerHTML = `
            <div class="stat-item"><div class="stat-value">${maxRuntime}秒</div><div class="stat-label">最大Runtime</div></div>
            <div class="stat-item"><div class="stat-value">${minRuntime}秒</div><div class="stat-label">最小Runtime</div></div>
            <div class="stat-item"><div class="stat-value">${maxMemory}MB</div><div class="stat-label">最大Memory</div></div>
            <div class="stat-item"><div class="stat-value">${minMemory}MB</div><div class="stat-label">最小Memory</div></div>
        `;
    }
}

/**
 * 渲染多日期对比图表（趋势图）- 统一折线图样式
 */
function renderMultiThreadComparisonChart() {
    if (!multiState.currentData || multiState.currentData.length === 0) return;
    
    const isRuntime = multiState.currentChartType === 'runtime';
    const chart = isRuntime ? ChartManager.get('chart-multi-runtime') : ChartManager.get('chart-multi-memory');
    if (!chart || chart.isDisposed()) return;
    
    // 在设置新数据前，先确保容器尺寸正确
    const container = document.getElementById(isRuntime ? 'chart-multi-runtime' : 'chart-multi-memory');
    if (container && container.offsetWidth > 0) {
        chart.resize();
    }
    
    const dates = multiState.currentData.map(d => d.date);
    // 获取所有可用的线程ID
    let allThreadIds = new Set();
    multiState.currentData.forEach(dayData => {
        dayData.threads_data.forEach(t => allThreadIds.add(t.threads.toString()));
    });
    const availableThreadIds = Array.from(allThreadIds).sort((a, b) => parseInt(a) - parseInt(b));
    
    // 更新全局可用线程列表
    multiState.availableThreads = availableThreadIds;
    
    // 使用选中的线程，如果没选中任何线程则显示所有
    let selectedThreadIds = multiState.selectedThreads;
    if (selectedThreadIds.length === 0 && availableThreadIds.length > 0) {
        selectedThreadIds = availableThreadIds;
        multiState.selectedThreads = availableThreadIds;
    }
    
    const yAxisName = isRuntime ? 'Runtime (秒)' : 'Memory (MB)';
    const palette = ['#6366f1', '#f59e0b', '#10b981', '#ef4444', '#06b6d4', '#8b5cf6', '#ec4899', '#84cc16'];
    
    // 收集所有值用于参考线
    let allValues = [];
    const seriesList = selectedThreadIds.map((threadId, idx) => {
        const values = multiState.currentData.map(dayData => {
            const threadData = dayData.threads_data.find(t => t.threads.toString() === threadId);
            const val = threadData ? (isRuntime ? threadData.runtime : threadData.memory) : null;
            if (val !== null && val !== undefined && val > 0) allValues.push(val);
            return val;
        });
        
        const threadName = threadId === '0' ? '线程0' : `线程 ${threadId}`;
        return {
            name: threadName,
            type: 'line',
            data: values,
            smooth: false,
            lineStyle: { width: 2, color: palette[idx % palette.length] },
            symbol: 'circle',
            symbolSize: 6,
            connectNulls: true,
            areaStyle: { opacity: 0.08, color: palette[idx % palette.length] }
        };
    });
    
    // 计算平均值和参考线
    const avgValue = allValues.length > 0 
        ? (allValues.reduce((a, b) => a + b, 0) / allValues.length).toFixed(1) 
        : 0;
    
    let referenceValue = avgValue;
    if (!isRuntime && allValues.length > 0) {
        const sorted = [...allValues].sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        referenceValue = sorted[mid];
    }
    
    // 图例默认选中状态（默认只显示第一个线程，避免图例过多）
    const legendSelected = {};
    seriesList.forEach((series, idx) => {
        legendSelected[series.name] = (idx === 0);
    });
    legendSelected['平均值'] = true;
    legendSelected['参考线'] = true;
    
    const option = {
        backgroundColor: 'transparent',
        tooltip: {
            trigger: 'axis',
            backgroundColor: 'rgba(30, 41, 59, 0.95)',
            borderWidth: 1,
            textStyle: { color: '#f1f5f9', fontSize: 12 },
            formatter: (params) => {
                if (!params?.length) return '';
                const date = params[0].axisValue;
                const rows = params.map(p => 
                    `<div>${p.seriesName}: ${p.value !== null ? p.value.toFixed(2) : 'N/A'} ${isRuntime ? '秒' : 'MB'}</div>`
                ).join('');
                return `<strong>📅 ${date}</strong>${rows}`;
            }
        },
        xAxis: {
            type: 'category',
            name: '日期',
            data: dates,
            axisLabel: { rotate: dates.length > 10 ? 30 : 0, color: '#94a3b8', fontSize: 11 },
            axisLine: { lineStyle: { color: '#475569' } }
        },
        yAxis: {
            type: 'value',
            name: yAxisName,
            nameTextStyle: { color: '#cbd5e1', fontSize: 12 },
            axisLabel: {
                color: '#94a3b8',
                fontSize: 11,
                formatter: (value) => {
                    if (isRuntime) return value.toFixed(2);
                    if (value >= 1024) return (value / 1024).toFixed(1) + ' GB';
                    return value.toFixed(0);
                }
            },
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
            },
            {
                name: '参考线',
                type: 'line',
                data: new Array(dates.length).fill(parseFloat(referenceValue)),
                lineStyle: { width: 1, color: '#06b6d4', type: 'dotted' },
                symbol: 'none',
                tooltip: { show: true, formatter: () => `📊 参考线: ${referenceValue.toFixed(2)} ${isRuntime ? '秒' : 'MB'}` }
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
        grid: { left: '8%', right: '8%', top: '18%', bottom: '10%', containLabel: true },
        toolbox: {
            feature: {
                saveAsImage: { title: '保存为图片' },
                zoom: { title: { zoom: '区域缩放', back: '还原' } },
                restore: { title: '重置' }
            },
            iconStyle: { borderColor: '#94a3b8' }
        }
    };
    
    chart.setOption(option, { notMerge: true });
    
    // 渲染后再次确保尺寸正确
    setTimeout(() => {
        if (chart && !chart.isDisposed()) {
            chart.resize();
        }
    }, 50);
}

/**
 * 选择最新日期
 */
async function selectLatestMultiDate() {
    if (multiState.availableDates.length > 0) {
        const latestDate = multiState.availableDates[multiState.availableDates.length - 1];
        if (latestDate !== multiState.currentDate) {
            multiState.currentDate = latestDate;
            const currentDateSpan = document.getElementById('multiCurrentDate');
            if (currentDateSpan) currentDateSpan.innerText = multiState.currentDate;
            await loadMultiThreadData(multiState.currentProjectId, multiState.currentRule, multiState.currentDate);
        }
    }
}

// ==================================================
// 图表类型切换
// ==================================================

/**
 * 更新多线程图表类型按钮状态
 */
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
    
    // 切换后重新渲染并确保尺寸正确
    if (multiState.currentData && multiState.currentData.length > 0) {
        setTimeout(() => {
            if (Array.isArray(multiState.currentData) && multiState.currentData[0]?.date) {
                renderMultiThreadComparisonChart();
            } else {
                renderMultiThreadChart();
            }
        }, 50);
    }
}

/**
 * 切换多线程图表类型
 * @param {string} type - 图表类型
 */
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

// ==================================================
// 线程选择
// ==================================================

/**
 * 打开线程选择模态框
 */
function openThreadSelectorModal() {
    if (!multiState.availableThreads || multiState.availableThreads.length === 0) {
        showNotification('暂无线程数据', true);
        return;
    }
    
    buildThreadSelectorModal();
    const modal = document.getElementById('threadSelectorModal');
    if (modal) modal.classList.remove('hidden');
}

/**
 * 关闭线程选择模态框
 */
function closeThreadSelectorModal() {
    const modal = document.getElementById('threadSelectorModal');
    if (modal) modal.classList.add('hidden');
}

/**
 * 构建线程选择模态框内容 - 与日期选择器风格一致
 */
function buildThreadSelectorModal() {
    const container = document.getElementById('threadSelectorModalContent');
    if (!container) return;
    
    const filterText = document.getElementById('threadFilterInput')?.value || '';
    const filteredThreads = multiState.availableThreads.filter(thread => 
        thread.toLowerCase().includes(filterText.toLowerCase())
    );
    
    container.innerHTML = filteredThreads.map(threadId => {
        const isChecked = multiState.selectedThreads.includes(threadId);
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
        label.removeEventListener('click', handleThreadOptionClick);
        label.addEventListener('click', handleThreadOptionClick);
    });
}

/**
 * 线程选项点击处理函数
 */
function handleThreadOptionClick(e) {
    if (e.target.tagName === 'INPUT') {
        return;
    }
    
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

/**
 * 从模态框更新选中的线程
 */
function updateSelectedThreadsFromModal() {
    const modalContent = document.getElementById('threadSelectorModalContent');
    if (!modalContent) return;
    
    multiState.selectedThreads = [];
    modalContent.querySelectorAll('.thread-option input:checked').forEach(cb => {
        multiState.selectedThreads.push(cb.value);
    });
    
    if (multiState.selectedThreads.length === 0 && multiState.availableThreads.length > 0) {
        multiState.selectedThreads = [...multiState.availableThreads];
        showNotification('未选择任何线程，已自动全选');
    }
}

/**
 * 线程选择全选
 */
function selectAllThreadsInModal() {
    const modalContent = document.getElementById('threadSelectorModalContent');
    if (!modalContent) return;
    
    const checkboxes = modalContent.querySelectorAll('.thread-option input');
    checkboxes.forEach(cb => {
        cb.checked = true;
        const label = cb.closest('.thread-option');
        if (label) label.classList.add('selected');
    });
    updateSelectedThreadsFromModal();
}

/**
 * 线程选择全不选
 */
function deselectAllThreadsInModal() {
    const modalContent = document.getElementById('threadSelectorModalContent');
    if (!modalContent) return;
    
    const checkboxes = modalContent.querySelectorAll('.thread-option input');
    checkboxes.forEach(cb => {
        cb.checked = false;
        const label = cb.closest('.thread-option');
        if (label) label.classList.remove('selected');
    });
    updateSelectedThreadsFromModal();
}

/**
 * 线程选择反选
 */
function inverseSelectThreadsInModal() {
    const modalContent = document.getElementById('threadSelectorModalContent');
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
    updateSelectedThreadsFromModal();
}

/**
 * 确认线程选择
 */
function confirmThreadSelection() {
    updateSelectedThreadsFromModal();
    if (Array.isArray(multiState.currentData) && multiState.currentData[0]?.date) {
        renderMultiThreadComparisonChart();
    } else {
        renderMultiThreadChart();
    }
    closeThreadSelectorModal();
}

// ==================================================
// 日期选择
// ==================================================

/**
 * 打开多线程日期选择模态框
 */
function openMultiDatePickerModal() {
    if (!multiState.availableDates || multiState.availableDates.length === 0) {
        showNotification('暂无可选日期', true);
        return;
    }
    multiState.pendingSelectedDates = [multiState.currentDate];
    buildMultiDatePicker(true);
    const modal = document.getElementById('multiDatePickerModal');
    if (modal) modal.classList.remove('hidden');
}

/**
 * 关闭多线程日期选择模态框
 */
function closeMultiDatePickerModal() {
    const modal = document.getElementById('multiDatePickerModal');
    if (modal) modal.classList.add('hidden');
}

/**
 * 构建多线程日期选择器
 */
function buildMultiDatePicker(usePending = false) {
    const container = document.getElementById('multiDateOptionsContainer');
    if (!container) return;
    
    const currentSelection = usePending ? multiState.pendingSelectedDates : [multiState.currentDate];
    const filterText = document.getElementById('multiDateFilterInput')?.value || '';
    const filteredDates = multiState.availableDates.filter(date => 
        date.toLowerCase().includes(filterText.toLowerCase())
    );
    
    const isSingleMode = document.querySelector('input[name="multiSelectMode"]:checked')?.value === 'single';
    
    container.innerHTML = filteredDates.map(date => `
        <label class="date-option">
            <input type="${isSingleMode ? 'radio' : 'checkbox'}" name="multiDate" value="${date}" ${currentSelection.includes(date) ? 'checked' : ''}>
            <span>${date}</span>
        </label>
    `).join('');
    
    const selectModeRadios = document.querySelectorAll('input[name="multiSelectMode"]');
    selectModeRadios.forEach(radio => {
        radio.addEventListener('change', () => buildMultiDatePicker(usePending));
    });
    
    container.querySelectorAll('input[type="checkbox"], input[type="radio"]').forEach(cb => {
        cb.addEventListener('change', (e) => {
            if (isSingleMode) {
                multiState.pendingSelectedDates = [e.target.value];
            } else {
                if (e.target.checked) {
                    if (!multiState.pendingSelectedDates.includes(e.target.value)) {
                        multiState.pendingSelectedDates.push(e.target.value);
                    }
                } else {
                    multiState.pendingSelectedDates = multiState.pendingSelectedDates.filter(d => d !== e.target.value);
                }
            }
        });
    });
}

/**
 * 确认多线程日期选择
 */
async function confirmMultiDateSelection() {
    if (multiState.pendingSelectedDates.length === 0) {
        showNotification('请选择一个日期', true);
        return;
    }
    
    const isMultiMode = document.querySelector('input[name="multiSelectMode"]:checked')?.value === 'all';
    
    if (isMultiMode) {
        const dates = multiState.pendingSelectedDates.sort();
        await loadMultiThreadDataForMultipleDates(multiState.currentProjectId, multiState.currentRule, dates);
    } else {
        const newDate = multiState.pendingSelectedDates[0];
        if (newDate !== multiState.currentDate) {
            multiState.currentDate = newDate;
            const currentDateSpan = document.getElementById('multiCurrentDate');
            if (currentDateSpan) currentDateSpan.innerText = multiState.currentDate;
            await loadMultiThreadData(multiState.currentProjectId, multiState.currentRule, multiState.currentDate);
        }
    }
    closeMultiDatePickerModal();
}

/**
 * 加载多个日期的多线程数据用于对比趋势
 * @param {string} projectId - 项目ID
 * @param {string} ruleName - 阶段名称
 * @param {Array} dates - 日期数组
 */
async function loadMultiThreadDataForMultipleDates(projectId, ruleName, dates) {
    showLoading(true);
    
    try {
        const promises = dates.map(date => 
            fetch('/api/multi_thread_data', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ project_id: projectId, rule_name: ruleName, date: date })
            }).then(res => res.json())
        );
        
        const results = await Promise.all(promises);
        const validResults = results.filter(r => r.success && r.threads_data);
        
        if (validResults.length === 0) {
            showNotification('没有有效的多线程数据', true);
            return;
        }
        
        const allThreads = new Set();
        validResults.forEach(r => {
            r.threads_data.forEach(d => allThreads.add(d.threads.toString()));
        });
        multiState.availableThreads = Array.from(allThreads).sort((a, b) => parseInt(a) - parseInt(b));
        
        // 默认显示所有线程
        multiState.selectedThreads = [...multiState.availableThreads];
        
        multiState.currentData = validResults;
        renderMultiThreadComparisonChart();
    } catch (error) {
        console.error('加载多线程数据失败:', error);
        showNotification('加载多线程数据失败', true);
    } finally {
        showLoading(false);
    }
}

// ==================================================
// 事件绑定
// ==================================================

/**
 * 绑定多线程事件
 */
function bindMultiThreadEvents() {
    // 项目选择
    const multiCaseSelect = document.getElementById('multiCaseSelect');
    if (multiCaseSelect) {
        multiCaseSelect.addEventListener('change', async (e) => {
            multiState.currentProjectId = e.target.value;
            multiState.currentRule = null;
            multiState.selectedThreads = [];
            multiState.availableThreads = [];
            multiState.currentData = [];
            multiState.availableDates = [];
            multiState.currentDate = null;
            
            const currentDateSpan = document.getElementById('multiCurrentDate');
            if (currentDateSpan) currentDateSpan.innerText = '请选择阶段';
            
            const chartRuntime = ChartManager.get('chart-multi-runtime');
            const chartMemory = ChartManager.get('chart-multi-memory');
            if (chartRuntime && !chartRuntime.isDisposed()) {
                chartRuntime.clear();
                chartRuntime.setOption({
                    title: {
                        show: true,
                        text: '请选择项目和阶段',
                        textStyle: { color: '#94a3b8' },
                        left: 'center',
                        top: 'center'
                    }
                }, true);
            }
            if (chartMemory && !chartMemory.isDisposed()) {
                chartMemory.clear();
                chartMemory.setOption({
                    title: {
                        show: true,
                        text: '请选择项目和阶段',
                        textStyle: { color: '#94a3b8' },
                        left: 'center',
                        top: 'center'
                    }
                }, true);
            }
            
            await loadMultiRules(multiState.currentProjectId);
        });
    }
    
    // 规则选择
    const multiRuleSelect = document.getElementById('multiRuleSelect');
    if (multiRuleSelect) {
        multiRuleSelect.addEventListener('change', async (e) => {
            const newRule = e.target.value;
            if (newRule && newRule !== multiState.currentRule) {
                multiState.currentRule = newRule;
                multiState.selectedThreads = [];
                multiState.availableThreads = [];
                await loadMultiDates(multiState.currentProjectId, multiState.currentRule);
            }
        });
    }
    
    // 图表类型切换
    const multiChartRuntimeBtn = document.getElementById('multiChartRuntimeBtn');
    if (multiChartRuntimeBtn) {
        multiChartRuntimeBtn.addEventListener('click', () => selectMultiChartType('runtime'));
    }
    const multiChartMemoryBtn = document.getElementById('multiChartMemoryBtn');
    if (multiChartMemoryBtn) {
        multiChartMemoryBtn.addEventListener('click', () => selectMultiChartType('memory'));
    }
    
    // 日期选择
    const multiOpenDatePickerBtn = document.getElementById('multiOpenDatePickerBtn');
    if (multiOpenDatePickerBtn) multiOpenDatePickerBtn.addEventListener('click', openMultiDatePickerModal);
    
    const multiSelectRecentBtn = document.getElementById('multiSelectRecentBtn');
    if (multiSelectRecentBtn) multiSelectRecentBtn.addEventListener('click', selectLatestMultiDate);
    
    const multiCloseDateModalBtn = document.getElementById('multiCloseDateModalBtn');
    if (multiCloseDateModalBtn) multiCloseDateModalBtn.addEventListener('click', closeMultiDatePickerModal);
    
    const multiConfirmDateBtn = document.getElementById('multiConfirmDateBtn');
    if (multiConfirmDateBtn) multiConfirmDateBtn.addEventListener('click', confirmMultiDateSelection);
    
    const multiDateFilterInput = document.getElementById('multiDateFilterInput');
    if (multiDateFilterInput) {
        multiDateFilterInput.addEventListener('input', debounce(() => buildMultiDatePicker(true), 150));
    }
    
    // 线程选择按钮
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
    if (threadFilterInput) {
        threadFilterInput.addEventListener('input', debounce(buildThreadSelectorModal, 150));
    }
}

// 导出函数
window.multiState = multiState;
window.selectMultiChartType = selectMultiChartType;
window.confirmThreadSelection = confirmThreadSelection;
window.openThreadSelectorModal = openThreadSelectorModal;