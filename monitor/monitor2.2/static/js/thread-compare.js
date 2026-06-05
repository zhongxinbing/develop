// file: static/js/thread-compare.js
/**
 * 线程曲线图模块（原多线程对比）
 * 功能：选择单个日期，对比该日期下不同线程的性能数据
 * X轴：线程数，Y轴：性能值
 */

// 线程曲线图全局变量
let threadCompareState = {
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
 * 加载线程曲线图数据（单日期多线程对比）
 * @param {string} projectId - 项目ID
 * @param {string} ruleName - 阶段名称
 * @param {string} date - 日期
 */
async function loadThreadCompareData(projectId, ruleName, date) {
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
            threadCompareState.availableThreads = result.threads_data.map(d => d.threads.toString()).sort((a, b) => parseInt(a) - parseInt(b));
            
            // 默认显示所有线程
            threadCompareState.selectedThreads = [...threadCompareState.availableThreads];
            
            threadCompareState.currentData = result.threads_data;
            renderThreadCompareChart();
            updateThreadCompareStats(threadCompareState.currentData);
        } else {
            // 无数据时清空
            threadCompareState.availableThreads = [];
            threadCompareState.selectedThreads = [];
            threadCompareState.currentData = [];
            const chart = threadCompareState.currentChartType === 'runtime' 
                ? ChartManager.get('thread-compare-chart-runtime') 
                : ChartManager.get('thread-compare-chart-memory');
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
            const statsContainer = document.getElementById('threadCompareStats');
            if (statsContainer) {
                statsContainer.innerHTML = '<div class="stat-item"><div class="stat-value">-</div><div class="stat-label">暂无数据</div></div>';
            }
            const detailContainer = document.getElementById('threadCompareStatsDetail');
            if (detailContainer) {
                detailContainer.innerHTML = '';
            }
        }
    } catch (error) {
        console.error('加载线程曲线图数据失败:', error);
        showNotification('加载线程曲线图数据失败', true);
        threadCompareState.availableThreads = [];
        threadCompareState.selectedThreads = [];
    } finally {
        showLoading(false);
    }
}

/**
 * 加载线程曲线图可用日期
 * @param {string} projectId - 项目ID
 * @param {string} ruleName - 阶段名称
 */
async function loadThreadCompareDates(projectId, ruleName) {
    if (!ruleName) {
        threadCompareState.availableDates = [];
        threadCompareState.currentDate = null;
        const currentDateSpan = document.getElementById('threadCompareCurrentDate');
        if (currentDateSpan) currentDateSpan.innerText = '请先选择阶段';
        return;
    }
    
    try {
        const response = await fetch(`/api/project/${projectId}`);
        const data = await response.json();
        
        // 获取指定阶段的可用日期
        const ruleData = data?.rule_data?.[ruleName];
        if (ruleData?.dates?.length) {
            threadCompareState.availableDates = ruleData.dates;
            // 默认选择最新日期
            threadCompareState.currentDate = threadCompareState.availableDates[threadCompareState.availableDates.length - 1];
            
            const currentDateSpan = document.getElementById('threadCompareCurrentDate');
            if (currentDateSpan) currentDateSpan.innerText = threadCompareState.currentDate;
            
            // 同时获取线程数据
            await loadThreadCompareData(projectId, ruleName, threadCompareState.currentDate);
        } else {
            threadCompareState.availableDates = [];
            threadCompareState.currentDate = null;
            const currentDateSpan = document.getElementById('threadCompareCurrentDate');
            if (currentDateSpan) currentDateSpan.innerText = '无可用日期';
            showNotification('所选阶段无可用数据', true);
            
            // 清空图表
            const chart = threadCompareState.currentChartType === 'runtime' 
                ? ChartManager.get('thread-compare-chart-runtime') 
                : ChartManager.get('thread-compare-chart-memory');
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
        threadCompareState.availableDates = [];
    }
}

/**
 * 加载线程曲线图规则列表
 * @param {string} projectId - 项目ID
 */
async function loadThreadCompareRules(projectId) {
    try {
        const response = await fetch(`/api/project/${projectId}`);
        const data = await response.json();
        
        const ruleSelect = document.getElementById('threadCompareRuleSelect');
        if (ruleSelect && data?.rules?.length) {
            ruleSelect.innerHTML = '<option value="">-- 请选择阶段 --</option>' + 
                data.rules.map(rule => `<option value="${rule}">${rule}</option>`).join('');
            
            // 重置线程选择
            threadCompareState.selectedThreads = [];
            threadCompareState.availableThreads = [];
            
            if (data.rules.length > 0 && !threadCompareState.currentRule) {
                const firstRule = data.rules[0];
                ruleSelect.value = firstRule;
                threadCompareState.currentRule = firstRule;
                await loadThreadCompareDates(projectId, firstRule);
            } else if (threadCompareState.currentRule && data.rules.includes(threadCompareState.currentRule)) {
                ruleSelect.value = threadCompareState.currentRule;
                await loadThreadCompareDates(projectId, threadCompareState.currentRule);
            }
        } else if (ruleSelect) {
            ruleSelect.innerHTML = '<option value="">-- 请选择阶段 --</option>';
            threadCompareState.currentRule = null;
            threadCompareState.availableDates = [];
            threadCompareState.selectedThreads = [];
            threadCompareState.availableThreads = [];
        }
        
        // 搜索功能
        const searchInput = document.getElementById('threadCompareRuleSearch');
        if (searchInput) {
            const oldHandler = searchInput._threadCompareRuleSearchHandler;
            if (oldHandler) {
                searchInput.removeEventListener('input', oldHandler);
            }
            const handler = debounce(() => {
                const projectData = window.projectsData?.[threadCompareState.currentProjectId];
                if (!projectData) return;
                
                const rules = projectData.rules || [];
                const searchText = document.getElementById('threadCompareRuleSearch')?.value.toLowerCase() || '';
                const filteredRules = searchText ? rules.filter(rule => rule.toLowerCase().includes(searchText)) : rules;
                
                const ruleSelect = document.getElementById('threadCompareRuleSelect');
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
                        if (threadCompareState.currentRule !== currentValue) {
                            threadCompareState.currentRule = currentValue;
                            threadCompareState.selectedThreads = [];
                            threadCompareState.availableThreads = [];
                            loadThreadCompareDates(threadCompareState.currentProjectId, currentValue);
                        }
                    } else if (filteredRules.length > 0 && !threadCompareState.currentRule) {
                        ruleSelect.value = filteredRules[0];
                        threadCompareState.currentRule = filteredRules[0];
                        threadCompareState.selectedThreads = [];
                        threadCompareState.availableThreads = [];
                        loadThreadCompareDates(threadCompareState.currentProjectId, threadCompareState.currentRule);
                    }
                }
            }, 300);
            
            searchInput._threadCompareRuleSearchHandler = handler;
            searchInput.addEventListener('input', handler);
        }
    } catch (error) {
        console.error('加载规则失败:', error);
    }
}

// ==================================================
// 图表渲染
// ==================================================

/**
 * 渲染线程曲线图（单日期对比线程性能）
 */
function renderThreadCompareChart() {
    if (!threadCompareState.currentData || threadCompareState.currentData.length === 0) {
        const chart = threadCompareState.currentChartType === 'runtime' 
            ? ChartManager.get('thread-compare-chart-runtime') 
            : ChartManager.get('thread-compare-chart-memory');
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
    let filteredData = threadCompareState.currentData;
    if (threadCompareState.selectedThreads.length > 0) {
        filteredData = threadCompareState.currentData.filter(d => threadCompareState.selectedThreads.includes(d.threads.toString()));
    }
    
    if (filteredData.length === 0) {
        const chart = threadCompareState.currentChartType === 'runtime' 
            ? ChartManager.get('thread-compare-chart-runtime') 
            : ChartManager.get('thread-compare-chart-memory');
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
    const isRuntime = threadCompareState.currentChartType === 'runtime';
    const chartData = isRuntime ? filteredData.map(d => d.runtime) : filteredData.map(d => d.memory);
    const yAxisName = isRuntime ? 'Runtime (秒)' : 'Memory (MB)';
    const chart = isRuntime ? ChartManager.get('thread-compare-chart-runtime') : ChartManager.get('thread-compare-chart-memory');
    
    if (!chart || chart.isDisposed()) return;
    
    // 在设置新数据前，先确保容器尺寸正确
    const container = document.getElementById(isRuntime ? 'thread-compare-chart-runtime' : 'thread-compare-chart-memory');
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
 * 更新线程曲线图统计卡片
 * @param {Array} threadsData - 线程数据
 */
function updateThreadCompareStats(threadsData) {
    const runtimes = threadsData.map(d => d.runtime).filter(v => v !== null && v !== undefined);
    const memories = threadsData.map(d => d.memory).filter(v => v !== null && v !== undefined);
    
    if (runtimes.length === 0 && memories.length === 0) {
        const statsContainer = document.getElementById('threadCompareStats');
        if (statsContainer) {
            statsContainer.innerHTML = '<div class="stat-item"><div class="stat-value">-</div><div class="stat-label">暂无数据</div></div>';
        }
        const detailContainer = document.getElementById('threadCompareStatsDetail');
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
    
    const statsContainer = document.getElementById('threadCompareStats');
    if (statsContainer) {
        statsContainer.innerHTML = `
            <div class="stat-item"><div class="stat-value">${threadsData.length}</div><div class="stat-label">线程数</div></div>
            <div class="stat-item"><div class="stat-value">${avgRuntime}秒</div><div class="stat-label">平均Runtime</div></div>
            <div class="stat-item"><div class="stat-value">${avgMemory}MB</div><div class="stat-label">平均Memory</div></div>
        `;
    }
    
    const detailContainer = document.getElementById('threadCompareStatsDetail');
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
 * 选择最新日期
 */
async function selectLatestThreadCompareDate() {
    if (threadCompareState.availableDates.length > 0) {
        const latestDate = threadCompareState.availableDates[threadCompareState.availableDates.length - 1];
        if (latestDate !== threadCompareState.currentDate) {
            threadCompareState.currentDate = latestDate;
            const currentDateSpan = document.getElementById('threadCompareCurrentDate');
            if (currentDateSpan) currentDateSpan.innerText = threadCompareState.currentDate;
            await loadThreadCompareData(threadCompareState.currentProjectId, threadCompareState.currentRule, threadCompareState.currentDate);
        }
    }
}

// ==================================================
// 日期选择模态框
// ==================================================

function openThreadCompareDatePickerModal() {
    if (!threadCompareState.availableDates || threadCompareState.availableDates.length === 0) {
        showNotification('暂无可选日期', true);
        return;
    }
    threadCompareState.pendingSelectedDates = [threadCompareState.currentDate];
    buildThreadCompareDatePicker(true);
    const modal = document.getElementById('threadCompareDatePickerModal');
    if (modal) modal.classList.remove('hidden');
}

function closeThreadCompareDatePickerModal() {
    const modal = document.getElementById('threadCompareDatePickerModal');
    if (modal) modal.classList.add('hidden');
}

function buildThreadCompareDatePicker(usePending = false) {
    const container = document.getElementById('threadCompareDateOptionsContainer');
    if (!container) return;
    
    const currentSelection = usePending ? threadCompareState.pendingSelectedDates : [threadCompareState.currentDate];
    const filterText = document.getElementById('threadCompareDateFilterInput')?.value || '';
    const filteredDates = threadCompareState.availableDates.filter(date => 
        date.toLowerCase().includes(filterText.toLowerCase())
    );
    
    const isSingleMode = document.querySelector('input[name="threadCompareSelectMode"]:checked')?.value === 'single';
    
    container.innerHTML = filteredDates.map(date => `
        <label class="date-option">
            <input type="${isSingleMode ? 'radio' : 'checkbox'}" name="threadCompareDate" value="${date}" ${currentSelection.includes(date) ? 'checked' : ''}>
            <span>${date}</span>
        </label>
    `).join('');
    
    const selectModeRadios = document.querySelectorAll('input[name="threadCompareSelectMode"]');
    selectModeRadios.forEach(radio => {
        radio.addEventListener('change', () => buildThreadCompareDatePicker(usePending));
    });
    
    container.querySelectorAll('input[type="checkbox"], input[type="radio"]').forEach(cb => {
        cb.addEventListener('change', (e) => {
            if (isSingleMode) {
                threadCompareState.pendingSelectedDates = [e.target.value];
            } else {
                if (e.target.checked) {
                    if (!threadCompareState.pendingSelectedDates.includes(e.target.value)) {
                        threadCompareState.pendingSelectedDates.push(e.target.value);
                    }
                } else {
                    threadCompareState.pendingSelectedDates = threadCompareState.pendingSelectedDates.filter(d => d !== e.target.value);
                }
            }
        });
    });
}

async function confirmThreadCompareDateSelection() {
    if (threadCompareState.pendingSelectedDates.length === 0) {
        showNotification('请选择一个日期', true);
        return;
    }
    
    const isMultiMode = document.querySelector('input[name="threadCompareSelectMode"]:checked')?.value === 'all';
    
    if (isMultiMode) {
        // 多日期模式：加载多个日期的数据用于趋势对比
        const dates = threadCompareState.pendingSelectedDates.sort();
        await loadThreadCompareDataForMultipleDates(threadCompareState.currentProjectId, threadCompareState.currentRule, dates);
    } else {
        const newDate = threadCompareState.pendingSelectedDates[0];
        if (newDate !== threadCompareState.currentDate) {
            threadCompareState.currentDate = newDate;
            const currentDateSpan = document.getElementById('threadCompareCurrentDate');
            if (currentDateSpan) currentDateSpan.innerText = threadCompareState.currentDate;
            await loadThreadCompareData(threadCompareState.currentProjectId, threadCompareState.currentRule, threadCompareState.currentDate);
        }
    }
    closeThreadCompareDatePickerModal();
}

/**
 * 加载多个日期的多线程数据用于对比趋势
 * @param {string} projectId - 项目ID
 * @param {string} ruleName - 阶段名称
 * @param {Array} dates - 日期数组
 */
async function loadThreadCompareDataForMultipleDates(projectId, ruleName, dates) {
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
        threadCompareState.availableThreads = Array.from(allThreads).sort((a, b) => parseInt(a) - parseInt(b));
        
        // 默认显示所有线程
        threadCompareState.selectedThreads = [...threadCompareState.availableThreads];
        
        threadCompareState.currentData = validResults;
        renderThreadCompareComparisonChart();
    } catch (error) {
        console.error('加载多线程数据失败:', error);
        showNotification('加载多线程数据失败', true);
    } finally {
        showLoading(false);
    }
}

/**
 * 渲染多日期对比图表（趋势图）
 */
function renderThreadCompareComparisonChart() {
    if (!threadCompareState.currentData || threadCompareState.currentData.length === 0) return;
    
    const isRuntime = threadCompareState.currentChartType === 'runtime';
    const chart = isRuntime ? ChartManager.get('thread-compare-chart-runtime') : ChartManager.get('thread-compare-chart-memory');
    if (!chart || chart.isDisposed()) return;
    
    // 在设置新数据前，先确保容器尺寸正确
    const container = document.getElementById(isRuntime ? 'thread-compare-chart-runtime' : 'thread-compare-chart-memory');
    if (container && container.offsetWidth > 0) {
        chart.resize();
    }
    
    const dates = threadCompareState.currentData.map(d => d.date);
    // 获取所有可用的线程ID
    let allThreadIds = new Set();
    threadCompareState.currentData.forEach(dayData => {
        dayData.threads_data.forEach(t => allThreadIds.add(t.threads.toString()));
    });
    const availableThreadIds = Array.from(allThreadIds).sort((a, b) => parseInt(a) - parseInt(b));
    
    // 更新全局可用线程列表
    threadCompareState.availableThreads = availableThreadIds;
    
    // 使用选中的线程，如果没选中任何线程则显示所有
    let selectedThreadIds = threadCompareState.selectedThreads;
    if (selectedThreadIds.length === 0 && availableThreadIds.length > 0) {
        selectedThreadIds = availableThreadIds;
        threadCompareState.selectedThreads = availableThreadIds;
    }
    
    const yAxisName = isRuntime ? 'Runtime (秒)' : 'Memory (MB)';
    const palette = ['#6366f1', '#f59e0b', '#10b981', '#ef4444', '#06b6d4', '#8b5cf6', '#ec4899', '#84cc16'];
    
    // 收集所有值用于参考线
    let allValues = [];
    const seriesList = selectedThreadIds.map((threadId, idx) => {
        const values = threadCompareState.currentData.map(dayData => {
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

// ==================================================
// 图表类型切换
// ==================================================

function updateThreadCompareChartTypeButtons() {
    const runtimeBtn = document.getElementById('threadCompareChartRuntimeBtn');
    const memoryBtn = document.getElementById('threadCompareChartMemoryBtn');
    
    if (runtimeBtn) {
        if (threadCompareState.currentChartType === 'runtime') {
            runtimeBtn.classList.add('btn-primary');
            runtimeBtn.classList.remove('btn-secondary');
        } else {
            runtimeBtn.classList.add('btn-secondary');
            runtimeBtn.classList.remove('btn-primary');
        }
    }
    if (memoryBtn) {
        if (threadCompareState.currentChartType === 'memory') {
            memoryBtn.classList.add('btn-primary');
            memoryBtn.classList.remove('btn-secondary');
        } else {
            memoryBtn.classList.add('btn-secondary');
            memoryBtn.classList.remove('btn-primary');
        }
    }
    
    const runtimeContainer = document.getElementById('thread-compare-chart-runtime');
    const memoryContainer = document.getElementById('thread-compare-chart-memory');
    if (runtimeContainer && memoryContainer) {
        if (threadCompareState.currentChartType === 'runtime') {
            runtimeContainer.classList.remove('hidden');
            memoryContainer.classList.add('hidden');
        } else {
            runtimeContainer.classList.add('hidden');
            memoryContainer.classList.remove('hidden');
        }
    }
    
    const chartCardTitle = document.getElementById('threadCompareChartCardTitle');
    if (chartCardTitle) {
        chartCardTitle.innerText = threadCompareState.currentChartType === 'runtime' 
            ? '⏱️ Runtime 性能曲线 - 线程对比' 
            : '💾 Memory 使用曲线 - 线程对比';
    }
    
    // 切换后重新渲染并确保尺寸正确
    if (threadCompareState.currentData && threadCompareState.currentData.length > 0) {
        setTimeout(() => {
            if (Array.isArray(threadCompareState.currentData) && threadCompareState.currentData[0]?.date) {
                renderThreadCompareComparisonChart();
            } else {
                renderThreadCompareChart();
            }
        }, 50);
    }
}

function selectThreadCompareChartType(type) {
    if (threadCompareState.currentChartType === type) return;
    threadCompareState.currentChartType = type;
    updateThreadCompareChartTypeButtons();
    if (threadCompareState.currentData && threadCompareState.currentData.length > 0) {
        if (Array.isArray(threadCompareState.currentData) && threadCompareState.currentData[0]?.date) {
            renderThreadCompareComparisonChart();
        } else {
            renderThreadCompareChart();
        }
    }
}

// ==================================================
// 线程选择
// ==================================================

function openThreadCompareSelectorModal() {
    if (!threadCompareState.availableThreads || threadCompareState.availableThreads.length === 0) {
        showNotification('暂无线程数据', true);
        return;
    }
    
    buildThreadCompareSelectorModal();
    const modal = document.getElementById('threadCompareSelectorModal');
    if (modal) modal.classList.remove('hidden');
}

function closeThreadCompareSelectorModal() {
    const modal = document.getElementById('threadCompareSelectorModal');
    if (modal) modal.classList.add('hidden');
}

function buildThreadCompareSelectorModal() {
    const container = document.getElementById('threadCompareSelectorModalContent');
    if (!container) return;
    
    const filterText = document.getElementById('threadCompareFilterInput')?.value || '';
    const filteredThreads = threadCompareState.availableThreads.filter(thread => 
        thread.toLowerCase().includes(filterText.toLowerCase())
    );
    
    container.innerHTML = filteredThreads.map(threadId => {
        const isChecked = threadCompareState.selectedThreads.includes(threadId);
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
        label.removeEventListener('click', handleThreadCompareOptionClick);
        label.addEventListener('click', handleThreadCompareOptionClick);
    });
}

function handleThreadCompareOptionClick(e) {
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

function updateThreadCompareSelectedThreadsFromModal() {
    const modalContent = document.getElementById('threadCompareSelectorModalContent');
    if (!modalContent) return;
    
    threadCompareState.selectedThreads = [];
    modalContent.querySelectorAll('.thread-option input:checked').forEach(cb => {
        threadCompareState.selectedThreads.push(cb.value);
    });
    
    if (threadCompareState.selectedThreads.length === 0 && threadCompareState.availableThreads.length > 0) {
        threadCompareState.selectedThreads = [...threadCompareState.availableThreads];
        showNotification('未选择任何线程，已自动全选');
    }
}

function selectAllThreadCompareThreads() {
    const modalContent = document.getElementById('threadCompareSelectorModalContent');
    if (!modalContent) return;
    
    const checkboxes = modalContent.querySelectorAll('.thread-option input');
    checkboxes.forEach(cb => {
        cb.checked = true;
        const label = cb.closest('.thread-option');
        if (label) label.classList.add('selected');
    });
    updateThreadCompareSelectedThreadsFromModal();
}

function deselectAllThreadCompareThreads() {
    const modalContent = document.getElementById('threadCompareSelectorModalContent');
    if (!modalContent) return;
    
    const checkboxes = modalContent.querySelectorAll('.thread-option input');
    checkboxes.forEach(cb => {
        cb.checked = false;
        const label = cb.closest('.thread-option');
        if (label) label.classList.remove('selected');
    });
    updateThreadCompareSelectedThreadsFromModal();
}

function inverseSelectThreadCompareThreads() {
    const modalContent = document.getElementById('threadCompareSelectorModalContent');
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
    updateThreadCompareSelectedThreadsFromModal();
}

function confirmThreadCompareSelection() {
    updateThreadCompareSelectedThreadsFromModal();
    if (Array.isArray(threadCompareState.currentData) && threadCompareState.currentData[0]?.date) {
        renderThreadCompareComparisonChart();
    } else {
        renderThreadCompareChart();
    }
    closeThreadCompareSelectorModal();
}

// ==================================================
// 事件绑定
// ==================================================

function bindThreadCompareEvents() {
    // 项目选择
    const caseSelect = document.getElementById('threadCompareCaseSelect');
    if (caseSelect) {
        caseSelect.addEventListener('change', async (e) => {
            threadCompareState.currentProjectId = e.target.value;
            threadCompareState.currentRule = null;
            threadCompareState.selectedThreads = [];
            threadCompareState.availableThreads = [];
            threadCompareState.currentData = [];
            threadCompareState.availableDates = [];
            threadCompareState.currentDate = null;
            
            const currentDateSpan = document.getElementById('threadCompareCurrentDate');
            if (currentDateSpan) currentDateSpan.innerText = '请选择阶段';
            
            const chartRuntime = ChartManager.get('thread-compare-chart-runtime');
            const chartMemory = ChartManager.get('thread-compare-chart-memory');
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
            
            await loadThreadCompareRules(threadCompareState.currentProjectId);
        });
    }
    
    // 规则选择
    const ruleSelect = document.getElementById('threadCompareRuleSelect');
    if (ruleSelect) {
        ruleSelect.addEventListener('change', async (e) => {
            const newRule = e.target.value;
            if (newRule && newRule !== threadCompareState.currentRule) {
                threadCompareState.currentRule = newRule;
                threadCompareState.selectedThreads = [];
                threadCompareState.availableThreads = [];
                await loadThreadCompareDates(threadCompareState.currentProjectId, threadCompareState.currentRule);
            }
        });
    }
    
    // 图表类型切换
    const runtimeBtn = document.getElementById('threadCompareChartRuntimeBtn');
    if (runtimeBtn) runtimeBtn.addEventListener('click', () => selectThreadCompareChartType('runtime'));
    const memoryBtn = document.getElementById('threadCompareChartMemoryBtn');
    if (memoryBtn) memoryBtn.addEventListener('click', () => selectThreadCompareChartType('memory'));
    
    // 日期选择
    const openDatePickerBtn = document.getElementById('threadCompareOpenDatePickerBtn');
    if (openDatePickerBtn) openDatePickerBtn.addEventListener('click', openThreadCompareDatePickerModal);
    
    const selectRecentBtn = document.getElementById('threadCompareSelectRecentBtn');
    if (selectRecentBtn) selectRecentBtn.addEventListener('click', selectLatestThreadCompareDate);
    
    const closeDateModalBtn = document.getElementById('threadCompareCloseDateModalBtn');
    if (closeDateModalBtn) closeDateModalBtn.addEventListener('click', closeThreadCompareDatePickerModal);
    
    const confirmDateBtn = document.getElementById('threadCompareConfirmDateBtn');
    if (confirmDateBtn) confirmDateBtn.addEventListener('click', confirmThreadCompareDateSelection);
    
    const dateFilterInput = document.getElementById('threadCompareDateFilterInput');
    if (dateFilterInput) {
        dateFilterInput.addEventListener('input', debounce(() => buildThreadCompareDatePicker(true), 150));
    }
    
    // 线程选择按钮
    const openThreadSelectorBtn = document.getElementById('threadCompareOpenThreadSelectorBtn');
    if (openThreadSelectorBtn) openThreadSelectorBtn.addEventListener('click', openThreadCompareSelectorModal);
    
    const selectAllThreadsBtn = document.getElementById('threadCompareSelectAllThreadsBtn');
    if (selectAllThreadsBtn) selectAllThreadsBtn.addEventListener('click', selectAllThreadCompareThreads);
    
    const deselectAllThreadsBtn = document.getElementById('threadCompareDeselectAllThreadsBtn');
    if (deselectAllThreadsBtn) deselectAllThreadsBtn.addEventListener('click', deselectAllThreadCompareThreads);
    
    const inverseThreadsBtn = document.getElementById('threadCompareInverseThreadsBtn');
    if (inverseThreadsBtn) inverseThreadsBtn.addEventListener('click', inverseSelectThreadCompareThreads);
    
    const closeThreadModalBtn = document.getElementById('threadCompareCloseThreadModalBtn');
    if (closeThreadModalBtn) closeThreadModalBtn.addEventListener('click', closeThreadCompareSelectorModal);
    
    const confirmThreadModalBtn = document.getElementById('threadCompareConfirmThreadModalBtn');
    if (confirmThreadModalBtn) confirmThreadModalBtn.addEventListener('click', confirmThreadCompareSelection);
    
    const threadFilterInput = document.getElementById('threadCompareFilterInput');
    if (threadFilterInput) {
        threadFilterInput.addEventListener('input', debounce(buildThreadCompareSelectorModal, 150));
    }
}

// 导出函数
window.threadCompareState = threadCompareState;
window.selectThreadCompareChartType = selectThreadCompareChartType;
window.confirmThreadCompareSelection = confirmThreadCompareSelection;
window.openThreadCompareSelectorModal = openThreadCompareSelectorModal;