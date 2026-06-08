/**
 * 工具页面逻辑
 * 负责数据加载、图表渲染、筛选过滤、数据对比等功能
 * 支持单线程和多线程模式分离
 */



// API 基础路径
const API_BASE = '/api';

// 从 URL 获取工具 ID
const toolId = window.location.pathname.split('/').pop();

// 全局状态
let toolConfig = null;
let rawData = {};
let userAddedData = {};
let allData = {};

// 当前模式
let currentMode = 'single';      // 'single', 'multi', 'thread'
let currentChartType = 'runtime'; // 'runtime', 'memory', 'comparison'

// 多线程选择
let selectedThreads = [0];
let availableThreads = [0, 2, 4, 6, 8, 16, 32, 64, 128];

// 筛选状态
let selectedCasename = '';
let selectedRules = ['Overall'];
let selectedDates = [];
let allDates = [];
let allRules = [];

// 对比状态
let comparisonResult = null;

// ECharts 实例
let mainChart = null;

// DOM 元素
const toolNameEl = document.getElementById('toolName');
const toolDescEl = document.getElementById('toolDesc');
const backBtn = document.getElementById('backBtn');
const refreshBtn = document.getElementById('refreshBtn');
const modeNavItems = document.querySelectorAll('.mode-nav-item');
const menuItems = document.querySelectorAll('.menu-item');
const sidebarPerformance = document.getElementById('sidebarPerformance');
const filtersPanel = document.getElementById('filtersPanel');
const comparisonPanel = document.getElementById('comparisonPanel');
const casenameSelect = document.getElementById('casenameSelect');
const ruleSelect = document.getElementById('ruleSelect');
const ruleSearch = document.getElementById('ruleSearch');
const datePickerBtn = document.getElementById('datePickerBtn');
const latest50Btn = document.getElementById('latest50Btn');
const addDataBtn = document.getElementById('addDataBtn');

// 线程颜色映射
const THREAD_COLORS = {
    0: '#00E5FF',
    2: '#A855F7',
    4: '#10B981',
    6: '#F59E0B',
    8: '#EF4444',
    16: '#8B5CF6',
    32: '#EC4899',
    64: '#14B8A6',
    128: '#F97316'
};

/**
 * 初始化页面
 */
async function init() {
    await loadToolConfig();
    await loadData();
    initEventListeners();
    initDatePickerModal();
    initAddDataModal();
    initThreadSelector();

    window.addEventListener('resize', () => {
        if (mainChart) {
            mainChart.resize();
        }
    });
}

/**
 * 加载工具配置
 */
async function loadToolConfig() {
    try {
        const response = await axios.get(`${API_BASE}/tools`);
        if (response.data.success) {
            const tools = response.data.data;
            toolConfig = tools[toolId];
            if (toolConfig) {
                toolNameEl.textContent = toolConfig.tool_name || toolId;
                toolDescEl.textContent = toolConfig.description || '';
            } else {
                showError('工具不存在');
            }
        }
    } catch (error) {
        console.error('加载工具配置失败:', error);
        showError('加载工具配置失败');
    }
}

/**
 * 加载数据
 */
async function loadData() {
    try {
        showLoading(true);
        const response = await axios.post(`${API_BASE}/tools/${toolId}/data`);
        if (response.data.success) {
            rawData = response.data.data || {};
            console.log("从后端来的数据:", rawData)
            // allData = { ...rawData, ...userAddedData };
            allData = normalizeData({ ...rawData, ...userAddedData });
            updateCasenameSelect();
            updateOverview();
            
            // 默认选择第一个 case
            const casenames = Object.keys(allData);
            if (casenames.length > 0) {
                selectedCasename = casenames[0];
                casenameSelect.value = selectedCasename;
                if (compCasenameSelect) compCasenameSelect.value = selectedCasename;
                await updateRulesAndDates();
            }
            
            // 默认选择最近50天
            selectLatest50Days();
            
            // 加载线程选项
            if (currentMode === 'multi') {
                await loadAvailableThreads();
            }
            
            // 渲染图表
            await renderChart();
        }
    } catch (error) {
        console.error('加载数据失败:', error);
        showError('加载数据失败');
    } finally {
        showLoading(false);
    }
}

/**
 * 规范化数据 - 处理混合类型数据
 */
function normalizeData(data) {
    const normalized = {};
    for (const [casename, caseData] of Object.entries(data)) {
        // 跳过内部字段
        if (casename === 'dataFiles' || casename === '__multi_processed_logs__') {
            continue;
        }
        
        normalized[casename] = caseData;
        
        // 如果是复合类型，提取实际数据用于显示
        if (caseData._data_type === 'composite') {
            // 优先使用单线程数据
            if (caseData._single_data) {
                normalized[casename] = caseData._single_data;
                normalized[casename]._original_type = 'composite';
            } else if (caseData._multi_data) {
                normalized[casename] = caseData._multi_data;
                normalized[casename]._original_type = 'composite';
            }
        }
    }
    return normalized;
}


/**
 * 刷新数据
 */
async function refreshData() {
    // 清除用户添加的数据
    userAddedData = {};
    allData = { ...rawData };
    
    try {
        showLoading(true);
        const response = await axios.post(`${API_BASE}/tools/${toolId}/refresh`);
        if (response.data.success) {
            rawData = response.data.data || {};
            allData = { ...rawData };
            updateCasenameSelect();
            updateOverview();
            
            const casenames = Object.keys(allData);
            if (casenames.length > 0 && !allData[selectedCasename]) {
                selectedCasename = casenames[0];
                casenameSelect.value = selectedCasename;
                if (compCasenameSelect) compCasenameSelect.value = selectedCasename;
                await updateRulesAndDates();
            }
            
            selectLatest50Days();
            
            if (currentMode === 'multi') {
                await loadAvailableThreads();
            }
            
            await renderChart();
            showSuccess('数据刷新成功');
        }
    } catch (error) {
        console.error('刷新数据失败:', error);
        showError('刷新数据失败');
    } finally {
        showLoading(false);
    }
}

/**
 * 初始化线程选择器
 */
function initThreadSelector() {
    const container = document.getElementById('threadSelectorContainer');
    if (!container) return;
    
    // 初始隐藏，只在多线程模式显示
    container.style.display = 'none';
    
    // 监听线程搜索
    const searchInput = document.getElementById('threadSearchInput');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            filterThreadOptions(e.target.value);
        });
    }
}

/**
 * 过滤线程选项
 */
function filterThreadOptions(searchTerm) {
    const options = document.querySelectorAll('.multi-select-option');
    const term = searchTerm.toLowerCase();
    
    options.forEach(option => {
        const text = option.querySelector('span')?.textContent.toLowerCase() || '';
        if (term === '' || text.includes(term)) {
            option.style.display = '';
        } else {
            option.style.display = 'none';
        }
    });
}

/**
 * 加载可用的线程数
 */
async function loadAvailableThreads() {
    if (!selectedCasename || currentMode !== 'multi') return;
    
    try {
        // 直接从当前选中的 case 数据中提取线程数
        const caseData = allData[selectedCasename];
        if (!caseData || !caseData.daily_metrics) {
            availableThreads = [2, 4];
            selectedThreads = [2];
            renderThreadOptions();
            updateSelectedThreadsDisplay();
            return;
        }
        
        const threadsSet = new Set();
        const dailyMetrics = caseData.daily_metrics;
        
        // 遍历所有日期和规则，收集线程数
        for (const date in dailyMetrics) {
            const metrics = dailyMetrics[date];
            for (const rule in metrics) {
                const ruleData = metrics[rule];
                if (ruleData.thread_metrics) {
                    for (const thread in ruleData.thread_metrics) {
                        const threadNum = parseInt(thread);
                        if (!isNaN(threadNum) && threadNum > 0) {
                            threadsSet.add(threadNum);
                        }
                    }
                }
            }
        }
        
        let threads = Array.from(threadsSet).sort((a, b) => a - b);
        
        if (threads.length === 0) {
            // 使用默认线程
            threads = [2, 4];
        }
        
        availableThreads = threads;
        // 默认选中最小线程
        selectedThreads = [Math.min(...threads)];
        
        renderThreadOptions();
        updateSelectedThreadsDisplay();
    } catch (error) {
        console.error('加载线程选项失败:', error);
        availableThreads = [2, 4];
        selectedThreads = [2];
        renderThreadOptions();
        updateSelectedThreadsDisplay();
    }
}

/**
 * 渲染线程选项
 */
function renderThreadOptions() {
    const container = document.getElementById('threadOptions');
    if (!container) return;
    
    if (!availableThreads || availableThreads.length === 0) {
        availableThreads = [2, 4];
    }
    
    container.innerHTML = availableThreads.map(thread => `
        <label class="multi-select-option" style="display: flex; align-items: center; gap: 8px; padding: 8px 12px; cursor: pointer;">
            <input type="checkbox" value="${thread}" 
                ${selectedThreads.includes(thread) ? 'checked' : ''}
                onchange="toggleThreadSelection(${thread}, this.checked)">
            <span>${thread} 线程</span>
        </label>
    `).join('');
}

/**
 * 切换线程选择
 */
function toggleThreadSelection(thread, isSelected) {
    if (isSelected) {
        if (!selectedThreads.includes(thread)) {
            selectedThreads.push(thread);
        }
    } else {
        selectedThreads = selectedThreads.filter(t => t !== thread);
    }
    selectedThreads.sort((a, b) => a - b);
    updateSelectedThreadsDisplay();
    
    // 重新渲染图表
    renderChart();
}

/**
 * 更新线程显示
 */
function updateSelectedThreadsDisplay() {
    const display = document.getElementById('selectedThreadsDisplay');
    if (display) {
        if (selectedThreads.length === 0) {
            display.textContent = '未选择';
        } else if (selectedThreads.length <= 3) {
            display.textContent = selectedThreads.map(t => `${t}线程`).join(', ');
        } else {
            display.textContent = `${selectedThreads.length}个线程`;
        }
    }
}

/**
 * 全选所有线程
 */
function selectAllThreads() {
    const defaultThreadsList = [0, 2, 4, 6, 8, 16, 32, 64, 128];
    selectedThreads = [...defaultThreadsList];
    renderThreadOptions();
    updateSelectedThreadsDisplay();
    renderChart();
}

/**
 * 清空所有线程
 */
function clearAllThreads() {
    selectedThreads = [];
    renderThreadOptions();
    updateSelectedThreadsDisplay();
    renderChart();
}

/**
 * 切换线程下拉框
 */
function toggleThreadDropdown() {
    const dropdown = document.getElementById('threadDropdown');
    if (dropdown) {
        dropdown.style.display = dropdown.style.display === 'none' ? 'block' : 'none';
    }
}

/**
 * 更新 Casename 选择框
 */
function updateCasenameSelect() {
    const casenames = Object.keys(allData);
    
    const options = casenames.map(name => 
        `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`
    ).join('');
    
    if (casenameSelect) casenameSelect.innerHTML = options;
    if (compCasenameSelect) compCasenameSelect.innerHTML = options;
}

/**
 * 更新 Rules 和 Dates
 */
async function updateRulesAndDates() {
    if (!selectedCasename || !allData[selectedCasename]) return;
    
    const caseData = allData[selectedCasename];
    const dailyMetrics = caseData.daily_metrics || {};
    
    // 收集所有规则
    const rulesSet = new Set();
    const datesSet = new Set();
    
    Object.keys(dailyMetrics).forEach(date => {
        datesSet.add(date);
        const metrics = dailyMetrics[date];
        Object.keys(metrics).forEach(rule => {
            rulesSet.add(rule);
        });
    });
    
    allRules = Array.from(rulesSet).sort();
    allDates = Array.from(datesSet).sort();
    
    // 确保 Overall 在第一位
    if (allRules.includes('Overall')) {
        allRules = ['Overall', ...allRules.filter(r => r !== 'Overall')];
    }
    
    // 更新规则选择框
    updateRuleSelect(allRules);
    
    // 更新对比模式的 rule 下拉框
    if (compareModeSelect) {
        const ruleOptions = allRules.map(rule => 
            `<option value="${escapeHtml(rule)}">${escapeHtml(rule)}</option>`
        ).join('');
        compareModeSelect.innerHTML = '<option value="all">对比全部 rule</option>' + ruleOptions;
    }
    
    // 更新日期选择框
    updateDateSelects();
}

/**
 * 更新规则选择框（支持搜索过滤）
 */
function updateRuleSelect(rules) {
    const searchTerm = ruleSearch ? ruleSearch.value.toLowerCase() : '';
    const filteredRules = searchTerm 
        ? rules.filter(rule => rule.toLowerCase().includes(searchTerm))
        : rules;
    
    const options = filteredRules.map(rule => 
        `<option value="${escapeHtml(rule)}" ${selectedRules.includes(rule) ? 'selected' : ''}>${escapeHtml(rule)}</option>`
    ).join('');
    
    if (ruleSelect) ruleSelect.innerHTML = options;
}

/**
 * 更新日期选择框
 */
function updateDateSelects() {
    const options = allDates.map(date => 
        `<option value="${date}">${formatDate(date)}</option>`
    ).join('');
    
    if (date1Select) date1Select.innerHTML = options;
    if (date2Select) {
        date2Select.innerHTML = options;
        if (allDates.length > 1) {
            date2Select.value = allDates[allDates.length - 1];
        }
    }
}

/**
 * 选择最近50天
 */
function selectLatest50Days() {
    const last50 = allDates.slice(-50);
    selectedDates = [...last50];
    updateDatePickerModal();
}

/**
 * 渲染图表
 */
async function renderChart() {
    if (currentChartType === 'comparison') {
        return;
    }
    
    if (!selectedCasename || selectedRules.length === 0 || selectedDates.length === 0) {
        if (selectedRules.length === 0 && allRules.length > 0) {
            selectedRules = ['Overall'];
        }
        if (selectedDates.length === 0 && allDates.length > 0) {
            selectedDates = allDates.slice(-50);
        }
        if (!selectedCasename && Object.keys(allData).length > 0) {
            selectedCasename = Object.keys(allData)[0];
            if (casenameSelect) casenameSelect.value = selectedCasename;
        }
        
        if (selectedRules.length === 0 || selectedDates.length === 0 || !selectedCasename) {
            return;
        }
    }
    
    // 显示加载状态
    if (mainChart) {
        mainChart.showLoading({
            text: '加载中...',
            color: '#00E5FF',
            textColor: '#94A3B8',
            maskColor: 'rgba(11, 15, 26, 0.6)'
        });
    }
    
    try {
        console.log("当前数据是:", )
        const requestData = {
            raw_data: allData,
            casename: selectedCasename,
            rules: selectedRules,
            dates: selectedDates,
            mode: currentMode,
            chart_type: currentChartType
        };
        
        // 多线程模式：传递线程选择
        if (currentMode === 'multi') {
            // 如果没有选中的线程，默认使用2和4
            if (!selectedThreads || selectedThreads.length === 0) {
                selectedThreads = [2, 4];
            }
            requestData.selected_threads = selectedThreads;
            console.log('多线程请求，线程列表:', selectedThreads);
        }
        
        console.log('发送请求数据:', { 
            mode: requestData.mode, 
            casename: requestData.casename,
            rules_count: requestData.rules.length,
            dates_count: requestData.dates.length,
            selected_threads: requestData.selected_threads
        });
        
        const response = await axios.post(`${API_BASE}/chart/data`, requestData);

        console.log('收到响应:', response.data);
        
        if (response.data.success) {
            let chartData = response.data.data;
            
            if (typeof chartData === 'string') {
                chartData = JSON.parse(chartData);
            }
            
            console.log('解析后的图表数据:', {
                dates: chartData.dates?.length,
                rules_count: Object.keys(chartData.rules || {}).length,
                rules_keys: Object.keys(chartData.rules || {}),
                all_threads: chartData.all_threads,
                selected_threads: chartData.selected_threads
            });
            
            if (mainChart) {
                mainChart.hideLoading();
            }
            
            if (Object.keys(chartData.rules || {}).length === 0) {
                showError('没有可显示的图表数据');
                return;
            }
            
            drawChart(chartData);
            updateStatistics(chartData);
        } else {
            console.error('获取图表数据失败:', response.data.error);
            if (mainChart) {
                mainChart.hideLoading();
            }
            showError('获取图表数据失败: ' + (response.data.error || '未知错误'));
        }
    } catch (error) {
        console.error('获取图表数据失败:', error);
        if (mainChart) {
            mainChart.hideLoading();
        }
        showError('获取图表数据失败: ' + (error.response?.data?.error || error.message));
    }
}

// 替换 drawChart 函数
function drawChart(chartData) {
    const container = document.getElementById('mainChart');
    if (!container) return;
    
    if (mainChart) {
        mainChart.dispose();
    }
    
    mainChart = echarts.init(container);
    
    const { dates, rules, crash_dates, all_threads, selected_threads } = chartData;
    const isRuntime = currentChartType === 'runtime';
    const yAxisName = isRuntime ? 'Runtime (s)' : 'Memory (MB)';
    const xAxisName = currentMode === 'thread' ? '线程数' : '日期';
    
    // 构建系列
    const series = [];
    const crashDatesSet = new Set(crash_dates || []);
    
    // 格式化日期显示
    const formattedDates = dates.map(d => formatDate(d));
    
    // 遍历所有规则
    for (const [seriesName, ruleData] of Object.entries(rules)) {
        const values = ruleData.values || [];
        const thread = ruleData.thread || 0;
        const color = ruleData.color || THREAD_COLORS[thread] || '#A855F7';
        
        // 构建tooltip格式化函数
        const formatter = function(params) {
            if (!params || params.length === 0) return '';
            const dataIndex = params[0].dataIndex;
            const date = dates[dataIndex];
            const value = values[dataIndex];
            
            let html = `<div style="font-weight:600;margin-bottom:8px;">${formatDate(date)}</div>`;
            html += `<div style="display:flex;justify-content:space-between;gap:16px;">
                <span style="color:${color}">●</span>
                <span>${escapeHtml(seriesName)}:</span>
                <span style="font-family:monospace;font-weight:600;">${value !== null && value !== undefined ? value.toFixed(2) : 'N/A'}</span>
            </div>`;
            
            if (crashDatesSet.has(date)) {
                html += `<div style="color:#EF4444;font-size:11px;margin-top:4px;">⚠️ Crash - 缺少 Overall 数据</div>`;
            }
            
            if (date && date.includes('_user')) {
                html += `<div style="color:#10B981;font-size:11px;margin-top:4px;">📎 用户添加</div>`;
            }
            
            return html;
        };
        
        series.push({
            name: seriesName,
            type: 'line',
            data: values,
            smooth: false,
            symbol: 'circle',
            symbolSize: 6,
            connectNulls: false,
            lineStyle: {
                width: 2,
                color: color
            },
            itemStyle: {
                color: color,
                borderColor: '#0F172A',
                borderWidth: 1
            },
            tooltip: {
                formatter: formatter
            }
        });
    }
    
    // 构建图例数据
    const legendData = series.map(s => s.name);
    
    const option = {
        backgroundColor: 'transparent',
        tooltip: { trigger: 'axis' },
        legend: {
            data: legendData,
            textStyle: { color: '#F1F5F9' },
            type: 'scroll',
            right: 10,
            top: 0,
            pageIconColor: '#00E5FF',
            pageTextStyle: { color: '#F1F5F9' },
            pageIconSize: 12,
            pageFormatter: '{current}/{total}'
        },
        grid: {
            left: '3%',
            right: '8%',
            top: '18%',
            bottom: '8%',
            containLabel: true
        },
        xAxis: {
            type: 'category',
            name: xAxisName,
            data: formattedDates,
            axisLabel: {
                rotate: dates.length > 30 ? 45 : 0,
                fontSize: 10,
                color: '#94A3B8',
                interval: dates.length > 50 ? Math.floor(dates.length / 20) : 0
            },
            axisLine: {
                lineStyle: { color: '#334155' }
            }
        },
        yAxis: {
            type: 'value',
            name: yAxisName,
            nameTextStyle: { color: '#94A3B8' },
            axisLabel: { color: '#94A3B8' },
            splitLine: {
                lineStyle: { color: '#1E293B' }
            }
        },
        toolbox: {
            feature: {
                saveAsImage: { title: '保存图片' },
                magicType: { type: ['line', 'bar'], title: { line: '折线图', bar: '柱状图' } }
            },
            iconStyle: { borderColor: '#94A3B8' },
            right: 20,
            top: 5
        },
        series: series
    };
    
    mainChart.setOption(option, true);
}

/**
 * 更新统计信息
 */
function updateStatistics(chartData) {
    const { dates, overall_data } = chartData;
    const isRuntime = currentChartType === 'runtime';
    
    if (!overall_data || !overall_data.values) {
        return;
    }
    
    const values = overall_data.values.filter(v => v !== null && v !== undefined);
    if (values.length === 0) return;
    
    const total = values.reduce((a, b) => a + b, 0);
    const avg = total / values.length;
    const max = Math.max(...values);
    const min = Math.min(...values);
    
    const dateRangeEl = document.getElementById('dateRange');
    const totalValueEl = document.getElementById('totalValue');
    const avgValueEl = document.getElementById('avgValue');
    const maxValueEl = document.getElementById('maxValue');
    const minValueEl = document.getElementById('minValue');
    const totalLabel = document.getElementById('totalLabel');
    const avgLabel = document.getElementById('avgLabel');
    
    if (dateRangeEl) {
        dateRangeEl.textContent = dates.length > 0 ? `${formatDate(dates[0])} ~ ${formatDate(dates[dates.length-1])}` : '-';
    }
    if (totalValueEl) totalValueEl.textContent = total.toFixed(2);
    if (avgValueEl) avgValueEl.textContent = avg.toFixed(2);
    if (maxValueEl) maxValueEl.textContent = max.toFixed(2);
    if (minValueEl) minValueEl.textContent = min.toFixed(2);
    
    if (totalLabel) totalLabel.textContent = isRuntime ? 'Total Runtime' : 'Total Memory';
    if (avgLabel) avgLabel.textContent = isRuntime ? 'Average Runtime' : 'Average Memory';
}

/**
 * 更新项目概况
 */
async function updateOverview() {
    if (!selectedCasename || !allData[selectedCasename]) {
        return;
    }
    
    const caseData = allData[selectedCasename];
    const dailyMetrics = caseData.daily_metrics || {};
    
    // 总 case 数
    const totalCases = Object.keys(allData).length;
    
    // 总阶段数（规则数）
    const allRules = new Set();
    for (const date in dailyMetrics) {
        Object.keys(dailyMetrics[date]).forEach(rule => allRules.add(rule));
    }
    const totalRules = allRules.size;
    
    // 总天数
    const totalDays = Object.keys(dailyMetrics).length;
    
    document.getElementById('totalCases').textContent = totalCases;
    document.getElementById('totalRules').textContent = totalRules;
    document.getElementById('totalDays').textContent = totalDays;
}

/**
 * 执行数据对比
 */
async function performComparison() {
    const date1 = date1Select ? date1Select.value : '';
    const date2 = date2Select ? date2Select.value : '';
    const compareMode = compareModeSelect ? compareModeSelect.value : 'all';
    const dimension = document.getElementById('dimensionSelect')?.value || 'all';
    const runtimeThreshold = parseFloat(document.getElementById('runtimeThreshold')?.value || 0);
    const memoryThreshold = parseFloat(document.getElementById('memoryThreshold')?.value || 0);
    const errorMode = document.getElementById('errorModeSelect')?.value || 'absolute';
    
    let rulesToCompare = [];
    if (compareMode === 'all') {
        rulesToCompare = allRules;
    } else {
        rulesToCompare = [compareMode];
    }
    
    // 搜索过滤
    const searchTerm = compRuleSearch ? compRuleSearch.value.toLowerCase() : '';
    if (searchTerm) {
        rulesToCompare = rulesToCompare.filter(r => r.toLowerCase().includes(searchTerm));
    }
    
    if (!date1 || !date2) {
        showError('请选择两个日期进行对比');
        return;
    }
    
    try {
        const response = await axios.post(`${API_BASE}/comparison`, {
            raw_data: allData,
            casename: selectedCasename,
            date1: date1,
            date2: date2,
            rules: rulesToCompare,
            compare_mode: compareMode,
            dimension: dimension,
            runtime_threshold: runtimeThreshold,
            memory_threshold: memoryThreshold,
            error_mode: errorMode
        });
        
        if (response.data.success) {
            comparisonResult = response.data.data;
            renderComparisonResults(comparisonResult);
            showComparisonView(true);
        }
    } catch (error) {
        console.error('执行对比失败:', error);
        showError('执行对比失败');
    }
}

/**
 * 渲染对比结果
 */
function renderComparisonResults(result) {
    const stats = result.statistics;
    const comparisons = result.comparisons;
    const summary = result.summary;
    
    // 渲染统计卡片
    const statsGrid = document.getElementById('comparisonStatsGrid');
    if (statsGrid) {
        statsGrid.innerHTML = `
            <div class="comparison-stat-card">
                <h4>Runtime 增加 Rule</h4>
                <div class="comparison-stat-value">${stats.runtime_increased.length}</div>
            </div>
            <div class="comparison-stat-card">
                <h4>Runtime 减少 Rule</h4>
                <div class="comparison-stat-value">${stats.runtime_decreased.length}</div>
            </div>
            <div class="comparison-stat-card">
                <h4>Memory 增加 Rule</h4>
                <div class="comparison-stat-value">${stats.memory_increased.length}</div>
            </div>
            <div class="comparison-stat-card">
                <h4>Memory 减少 Rule</h4>
                <div class="comparison-stat-value">${stats.memory_decreased.length}</div>
            </div>
            <div class="comparison-stat-card">
                <h4>平均 Runtime 变化率</h4>
                <div class="comparison-stat-value">${stats.avg_runtime_change.toFixed(2)}%</div>
            </div>
            <div class="comparison-stat-card">
                <h4>平均 Memory 变化率</h4>
                <div class="comparison-stat-value">${stats.avg_memory_change.toFixed(2)}%</div>
            </div>
        `;
    }
    
    // 渲染表格
    const tableBody = document.getElementById('comparisonTableBody');
    if (tableBody) {
        tableBody.innerHTML = comparisons.map(comp => `
            <tr class="${comp.is_out_of_tolerance ? 'out-of-tolerance' : ''}">
                <td>${escapeHtml(comp.rule)}</td>
                <td>R: ${comp.date1_value.runtime?.toFixed(2) || 'N/A'}<br>M: ${comp.date1_value.memory?.toFixed(2) || 'N/A'}</td>
                <td>R: ${comp.date2_value.runtime?.toFixed(2) || 'N/A'}<br>M: ${comp.date2_value.memory?.toFixed(2) || 'N/A'}</td>
                <td>R: ${comp.difference.runtime?.toFixed(2) || 'N/A'}<br>M: ${comp.difference.memory?.toFixed(2) || 'N/A'}</td>
                <td>R: ${comp.percentage.runtime?.toFixed(2) || 'N/A'}%<br>M: ${comp.percentage.memory?.toFixed(2) || 'N/A'}%</td>
                <td>${comp.is_out_of_tolerance ? '<span class="status-badge warning">超差</span>' : '<span class="status-badge">正常</span>'}</td>
            </tr>
        `).join('');
    }
    
    // 更新摘要
    const summaryEl = document.getElementById('comparisonSummary');
    if (summaryEl) {
        summaryEl.innerHTML = `
            <span>总规则数: ${summary.total_rules}</span>
            <span>Runtime 变化: ${summary.runtime_changed}</span>
            <span>Memory 变化: ${summary.memory_changed}</span>
            <span>超差规则: ${summary.out_of_tolerance}</span>
        `;
    }
}

/**
 * 显示/隐藏对比视图
 */
function showComparisonView(show) {
    if (show) {
        if (filtersPanel) filtersPanel.style.display = 'none';
        if (comparisonResults) comparisonResults.style.display = 'block';
        document.querySelector('.chart-container').style.display = 'none';
        document.querySelector('.stats-grid').style.display = 'none';
    } else {
        if (filtersPanel) filtersPanel.style.display = 'block';
        if (comparisonResults) comparisonResults.style.display = 'none';
        document.querySelector('.chart-container').style.display = 'block';
        document.querySelector('.stats-grid').style.display = 'grid';
    }
}

/**
 * 导出对比结果
 */
function exportComparison() {
    if (!comparisonResult) {
        showError('没有可导出的对比结果');
        return;
    }
    
    const comparisons = comparisonResult.comparisons;
    const headers = ['Rule', 'Date1 Runtime', 'Date1 Memory', 'Date2 Runtime', 'Date2 Memory', 
                     'Runtime Diff', 'Memory Diff', 'Runtime %', 'Memory %', 'Status'];
    
    const rows = comparisons.map(comp => [
        comp.rule,
        comp.date1_value.runtime?.toFixed(2) || '',
        comp.date1_value.memory?.toFixed(2) || '',
        comp.date2_value.runtime?.toFixed(2) || '',
        comp.date2_value.memory?.toFixed(2) || '',
        comp.difference.runtime?.toFixed(2) || '',
        comp.difference.memory?.toFixed(2) || '',
        comp.percentage.runtime?.toFixed(2) || '',
        comp.percentage.memory?.toFixed(2) || '',
        comp.is_out_of_tolerance ? '超差' : '正常'
    ]);
    
    const csvContent = [headers, ...rows].map(row => row.join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.href = url;
    link.setAttribute('download', `comparison_${selectedCasename}_${new Date().toISOString().slice(0,19)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

/**
 * 添加用户数据
 */
async function addUserData(paths) {
    try {
        showLoading(true);
        const response = await axios.post(`${API_BASE}/tools/${toolId}/extra`, { paths });
        if (response.data.success) {
            const newData = response.data.data || {};
            userAddedData = { ...userAddedData, ...newData };
            allData = { ...rawData, ...userAddedData };
            
            updateCasenameSelect();
            updateOverview();
            await updateRulesAndDates();
            await renderChart();
            showSuccess('数据添加成功');
        }
    } catch (error) {
        console.error('添加数据失败:', error);
        showError('添加数据失败');
    } finally {
        showLoading(false);
    }
}

/**
 * 初始化日期选择弹窗
 */
function initDatePickerModal() {
    const modal = document.getElementById('datePickerModal');
    const openBtn = document.getElementById('datePickerBtn');
    const closeBtn = document.getElementById('closeDateModalBtn');
    const cancelBtn = document.getElementById('cancelDateBtn');
    const confirmBtn = document.getElementById('confirmDateBtn');
    const selectAllCheckbox = document.getElementById('selectAllDates');
    const dateSearch = document.getElementById('dateSearch');
    
    if (!openBtn) return;
    
    openBtn.addEventListener('click', () => {
        updateDatePickerModal();
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
    });
    
    const closeModal = () => {
        modal.classList.remove('active');
        document.body.style.overflow = '';
    };
    
    if (closeBtn) closeBtn.addEventListener('click', closeModal);
    if (cancelBtn) cancelBtn.addEventListener('click', closeModal);
    if (confirmBtn) confirmBtn.addEventListener('click', () => {
        const checkboxes = document.querySelectorAll('.date-checkbox:checked');
        selectedDates = Array.from(checkboxes).map(cb => cb.value);
        closeModal();
        renderChart();
    });
    
    if (selectAllCheckbox) {
        selectAllCheckbox.addEventListener('change', (e) => {
            const checkboxes = document.querySelectorAll('.date-checkbox');
            checkboxes.forEach(cb => cb.checked = e.target.checked);
        });
    }
    
    if (dateSearch) {
        dateSearch.addEventListener('input', (e) => {
            const searchTerm = e.target.value.toLowerCase();
            const items = document.querySelectorAll('.date-item');
            items.forEach(item => {
                const date = item.querySelector('.date-checkbox')?.value || '';
                if (date.toLowerCase().includes(searchTerm)) {
                    item.style.display = '';
                } else {
                    item.style.display = 'none';
                }
            });
        });
    }
}

/**
 * 更新日期选择弹窗内容
 */
function updateDatePickerModal() {
    const dateList = document.getElementById('dateList');
    if (!dateList) return;
    
    dateList.innerHTML = allDates.map(date => `
        <div class="date-item">
            <input type="checkbox" class="date-checkbox" value="${date}" 
                ${selectedDates.includes(date) ? 'checked' : ''}>
            <span>${formatDate(date)}</span>
        </div>
    `).join('');
    
    const selectAll = document.getElementById('selectAllDates');
    if (selectAll) {
        selectAll.checked = selectedDates.length === allDates.length && allDates.length > 0;
    }
}

/**
 * 初始化添加数据弹窗
 */
function initAddDataModal() {
    const modal = document.getElementById('addDataModal');
    const openBtn = document.getElementById('addDataBtn');
    const closeBtn = document.getElementById('closeAddDataModalBtn');
    const cancelBtn = document.getElementById('cancelAddDataBtn');
    const confirmBtn = document.getElementById('confirmAddDataBtn');
    const dataPathsTextarea = document.getElementById('dataPaths');
    
    if (!openBtn) return;
    
    openBtn.addEventListener('click', () => {
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
        if (dataPathsTextarea) dataPathsTextarea.value = '';
        if (confirmBtn) confirmBtn.disabled = true;
    });
    
    const closeModal = () => {
        modal.classList.remove('active');
        document.body.style.overflow = '';
    };
    
    if (closeBtn) closeBtn.addEventListener('click', closeModal);
    if (cancelBtn) cancelBtn.addEventListener('click', closeModal);
    
    if (dataPathsTextarea) {
        dataPathsTextarea.addEventListener('input', () => {
            if (confirmBtn) {
                confirmBtn.disabled = !dataPathsTextarea.value.trim();
            }
        });
    }
    
    if (confirmBtn) {
        confirmBtn.addEventListener('click', async () => {
            const paths = dataPathsTextarea.value.split('\n').filter(p => p.trim());
            if (paths.length > 0) {
                closeModal();
                await addUserData(paths);
            }
        });
    }
}

/**
 * 初始化事件监听
 */
function initEventListeners() {
    // 返回按钮
    backBtn.addEventListener('click', () => {
        window.location.href = '/';
    });
    
    // 刷新按钮
    refreshBtn.addEventListener('click', refreshData);
    
    // 模式切换
    // 修改模式切换的监听器
    modeNavItems.forEach(item => {
        item.addEventListener('click', async () => {
            modeNavItems.forEach(nav => nav.classList.remove('active'));
            item.classList.add('active');
            currentMode = item.dataset.mode;
            
            // 隐藏所有侧边栏内容
            document.querySelectorAll('.sidebar-content').forEach(content => {
                content.style.display = 'none';
            });
            
            if (currentMode === 'single') {
                document.getElementById('sidebarPerformance').style.display = 'flex';
                const threadSelectorContainer = document.getElementById('threadSelectorContainer');
                if (threadSelectorContainer) {
                    threadSelectorContainer.style.display = 'none';
                }
                if (currentChartType !== 'comparison') {
                    await renderChart();
                }
            } else if (currentMode === 'multi') {
                document.getElementById('sidebarPerformance').style.display = 'flex';
                // 显示线程选择器
                const threadSelectorContainer = document.getElementById('threadSelectorContainer');
                if (threadSelectorContainer) {
                    threadSelectorContainer.style.display = 'block';
                }
                // 加载线程选项
                await loadAvailableThreads();
                if (currentChartType !== 'comparison') {
                    await renderChart();
                }
            } else if (currentMode === 'thread') {
                document.getElementById('sidebarThread').style.display = 'flex';
                const threadSelectorContainer = document.getElementById('threadSelectorContainer');
                if (threadSelectorContainer) {
                    threadSelectorContainer.style.display = 'none';
                }
                await updateThreadSelects();
                loadThreadChartData();
            }
        });
    });
    
    // 侧边栏菜单切换
    menuItems.forEach(item => {
        item.addEventListener('click', () => {
            menuItems.forEach(menu => menu.classList.remove('active'));
            item.classList.add('active');
            
            const chartType = item.dataset.chart;
            currentChartType = chartType;
            
            if (chartType === 'comparison') {
                if (filtersPanel) filtersPanel.style.display = 'none';
                if (comparisonPanel) comparisonPanel.style.display = 'block';
                showComparisonView(false);
            } else {
                if (filtersPanel) filtersPanel.style.display = 'block';
                if (comparisonPanel) comparisonPanel.style.display = 'none';
                showComparisonView(false);
                renderChart();
            }
        });
    });
    
    // 线程曲线图菜单切换
    const threadMenuItems = document.querySelectorAll('[data-thread-chart]');
    threadMenuItems.forEach(item => {
        item.addEventListener('click', () => {
            threadMenuItems.forEach(menu => menu.classList.remove('active'));
            item.classList.add('active');
            const chartType = item.dataset.threadChart;
            currentThreadChartType = chartType;
            loadThreadChartData();
        });
    });
    
    // Casename 选择
    casenameSelect.addEventListener('change', async (e) => {
        selectedCasename = e.target.value;
        if (compCasenameSelect) compCasenameSelect.value = selectedCasename;
        await updateRulesAndDates();
        
        if (currentMode === 'multi') {
            await loadAvailableThreads();
        }
        
        await renderChart();
        await updateOverview();
    });
    
    // 规则搜索
    ruleSearch.addEventListener('input', () => {
        updateRuleSelect(allRules);
    });
    
    // 规则选择
    ruleSelect.addEventListener('change', (e) => {
        selectedRules = Array.from(ruleSelect.selectedOptions).map(opt => opt.value);
        
        if (currentMode === 'multi') {
            loadAvailableThreads().then(() => renderChart());
        } else {
            renderChart();
        }
    });
    
    // 最新50天按钮
    latest50Btn.addEventListener('click', () => {
        selectLatest50Days();
        renderChart();
    });
    
    // 对比相关事件
    if (compCasenameSelect) {
        compCasenameSelect.addEventListener('change', (e) => {
            selectedCasename = e.target.value;
            casenameSelect.value = selectedCasename;
            updateRulesAndDates();
        });
    }
    
    if (compareModeSelect) {
        compareModeSelect.addEventListener('change', () => {
            const isAll = compareModeSelect.value === 'all';
            if (compRuleSearch) compRuleSearch.disabled = isAll;
        });
    }
    
    if (confirmCompareBtn) {
        confirmCompareBtn.addEventListener('click', performComparison);
    }
    
    if (exportCompareBtn) {
        exportCompareBtn.addEventListener('click', exportComparison);
    }
    
    if (comparisonSearch) {
        comparisonSearch.addEventListener('input', (e) => {
            if (!comparisonResult) return;
            const searchTerm = e.target.value.toLowerCase();
            const filteredComparisons = comparisonResult.comparisons.filter(comp => 
                comp.rule.toLowerCase().includes(searchTerm)
            );
            renderComparisonResults({ ...comparisonResult, comparisons: filteredComparisons });
        });
    }
    
    // 点击外部关闭线程下拉框
    document.addEventListener('click', function(e) {
        const container = document.getElementById('threadMultiSelect');
        const dropdown = document.getElementById('threadDropdown');
        if (container && dropdown && !container.contains(e.target)) {
            dropdown.style.display = 'none';
        }
    });
}

/**
 * 线程曲线图相关变量
 */
let currentThreadChartType = 'runtime';
let threadChart = null;
const threadCasenameSelect = document.getElementById('threadCasenameSelect');
const threadRuleSelect = document.getElementById('threadRuleSelect');
const threadDateSelect = document.getElementById('threadDateSelect');
const refreshThreadChartBtn = document.getElementById('refreshThreadChartBtn');
const compCasenameSelect = document.getElementById('compCasenameSelect');
const compareModeSelect = document.getElementById('compareModeSelect');
const compRuleSearch = document.getElementById('compRuleSearch');
const date1Select = document.getElementById('date1Select');
const date2Select = document.getElementById('date2Select');
const confirmCompareBtn = document.getElementById('confirmCompareBtn');
const exportCompareBtn = document.getElementById('exportCompareBtn');
const comparisonResults = document.getElementById('comparisonResults');
const comparisonSearch = document.getElementById('comparisonSearch');

/**
 * 初始化线程曲线图
 */
function initThreadChart() {
    if (!threadChart) {
        const container = document.getElementById('mainChart');
        if (container) {
            if (threadChart) {
                threadChart.dispose();
            }
            threadChart = echarts.init(container);
        }
    }
}

/**
 * 加载线程曲线图数据
 */
async function loadThreadChartData() {
    const casename = threadCasenameSelect?.value;
    const rule = threadRuleSelect?.value;
    const date = threadDateSelect?.value;
    
    if (!casename || !rule || !date) {
        return;
    }
    
    try {
        showLoading(true);
        const response = await axios.post(`${API_BASE}/thread/chart/data`, {
            raw_data: allData,
            casename: casename,
            rule: rule,
            date: date
        });
        
        if (response.data.success) {
            const chartData = response.data.data;
            drawThreadChart(chartData);
        }
    } catch (error) {
        console.error('加载线程曲线图数据失败:', error);
        showError('加载线程曲线图数据失败');
    } finally {
        showLoading(false);
    }
}

/**
 * 绘制线程曲线图
 */
function drawThreadChart(chartData) {
    initThreadChart();
    
    setTimeout(() => {
        if (threadChart) {
            threadChart.resize();
        }
    }, 100);

    const { threads, runtimes, memories } = chartData;
    const isRuntime = currentThreadChartType === 'runtime';
    const yAxisName = isRuntime ? 'Runtime (s)' : 'Memory (MB)';
    const seriesData = isRuntime ? runtimes : memories;
    
    const option = {
        backgroundColor: 'transparent',
        title: {
            text: isRuntime ? '线程数 vs Runtime' : '线程数 vs Memory',
            textStyle: { color: '#F1F5F9' },
            left: 'center'
        },
        tooltip: {
            trigger: 'axis',
            axisPointer: { type: 'shadow' },
            formatter: (params) => {
                if (!params || params.length === 0) return '';
                const data = params[0];
                const threadCount = data.axisValue;
                const value = data.value;
                return `<div style="font-weight:600">线程数: ${threadCount}</div>
                        <div>${isRuntime ? 'Runtime' : 'Memory'}: ${value?.toFixed(2) || 'N/A'}</div>`;
            }
        },
        grid: {
            left: '3%',
            right: '5%',
            top: '15%',
            bottom: '8%',
            containLabel: true
        },
        xAxis: {
            type: 'category',
            name: '线程数',
            data: threads,
            axisLabel: {
                fontSize: 12,
                color: '#94A3B8'
            },
            axisLine: {
                lineStyle: { color: '#334155' }
            }
        },
        yAxis: {
            type: 'value',
            name: yAxisName,
            nameTextStyle: { color: '#94A3B8' },
            axisLabel: { color: '#94A3B8' },
            splitLine: {
                lineStyle: { color: '#1E293B' }
            }
        },
        series: [{
            name: isRuntime ? 'Runtime' : 'Memory',
            type: 'line',
            data: seriesData,
            smooth: false,
            symbol: 'circle',
            symbolSize: 8,
            lineStyle: {
                width: 3,
                color: '#00E5FF'
            },
            itemStyle: {
                color: '#00E5FF',
                borderColor: '#0F172A',
                borderWidth: 2
            },
            areaStyle: {
                opacity: 0.1,
                color: '#00E5FF'
            }
        }],
        toolbox: {
            feature: {
                saveAsImage: { title: '保存图片' }
            },
            iconStyle: { borderColor: '#94A3B8' }
        }
    };
    
    threadChart.setOption(option, true);
}

/**
 * 更新线程曲线图的选项
 */
async function updateThreadSelects() {
    const casenames = Object.keys(allData);
    
    if (threadCasenameSelect) {
        const options = casenames.map(name => 
            `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`
        ).join('');
        threadCasenameSelect.innerHTML = options;
        
        if (casenames.length > 0 && !threadCasenameSelect.value) {
            threadCasenameSelect.value = casenames[0];
        }
    }
    
    if (threadCasenameSelect) {
        threadCasenameSelect.addEventListener('change', () => {
            updateThreadRules();
            updateThreadDates();
        });
    }
    
    if (refreshThreadChartBtn) {
        refreshThreadChartBtn.addEventListener('click', loadThreadChartData);
    }
    
    await updateThreadRules();
    await updateThreadDates();
}

/**
 * 更新线程曲线图的规则列表
 */
async function updateThreadRules() {
    const casename = threadCasenameSelect?.value;
    if (!casename || !allData[casename]) return;
    
    const caseData = allData[casename];
    const dailyMetrics = caseData.daily_metrics || {};
    
    const rulesSet = new Set();
    Object.keys(dailyMetrics).forEach(date => {
        const metrics = dailyMetrics[date];
        Object.keys(metrics).forEach(rule => {
            rulesSet.add(rule);
        });
    });
    
    let allThreadRules = Array.from(rulesSet).sort();
    if (allThreadRules.includes('Overall')) {
        allThreadRules = ['Overall', ...allThreadRules.filter(r => r !== 'Overall')];
    }
    
    const threadRuleSearch = document.getElementById('threadRuleSearch');
    const searchTerm = threadRuleSearch ? threadRuleSearch.value.toLowerCase() : '';
    const filteredRules = searchTerm 
        ? allThreadRules.filter(rule => rule.toLowerCase().includes(searchTerm))
        : allThreadRules;
    
    const options = filteredRules.map(rule => 
        `<option value="${escapeHtml(rule)}">${escapeHtml(rule)}</option>`
    ).join('');
    
    if (threadRuleSelect) {
        threadRuleSelect.innerHTML = options;
        if (options && !threadRuleSelect.value) {
            threadRuleSelect.value = allThreadRules[0] || '';
        }
    }
    
    if (threadRuleSearch) {
        threadRuleSearch.addEventListener('input', () => updateThreadRules());
    }
}

/**
 * 更新线程曲线图的日期列表
 */
async function updateThreadDates() {
    const casename = threadCasenameSelect?.value;
    if (!casename || !allData[casename]) return;
    
    const caseData = allData[casename];
    const dailyMetrics = caseData.daily_metrics || {};
    const dates = Object.keys(dailyMetrics).sort();
    
    const options = dates.map(date => 
        `<option value="${date}">${formatDate(date)}</option>`
    ).join('');
    
    if (threadDateSelect) {
        threadDateSelect.innerHTML = options;
        if (dates.length > 0 && !threadDateSelect.value) {
            threadDateSelect.value = dates[dates.length - 1];
        }
    }
}

/**
 * 格式化日期显示
 */
function formatDate(dateStr) {
    if (!dateStr) return '';
    if (dateStr.includes('_user')) {
        return dateStr.replace('_user', ' (用户)');
    }
    if (dateStr.length === 8) {
        return `${dateStr.slice(0,4)}-${dateStr.slice(4,6)}-${dateStr.slice(6,8)}`;
    }
    return dateStr;
}

/**
 * 显示加载状态
 */
function showLoading(show) {
    const refreshBtn = document.getElementById('refreshBtn');
    if (refreshBtn) {
        if (show) {
            refreshBtn.disabled = true;
            refreshBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i><span>加载中...</span>';
        } else {
            refreshBtn.disabled = false;
            refreshBtn.innerHTML = '<i class="fas fa-sync-alt"></i><span>刷新</span>';
        }
    }
}

/**
 * 显示成功消息
 */
function showSuccess(message) {
    showToast(message, 'success');
}

/**
 * 显示错误消息
 */
function showError(message) {
    showToast(message, 'error');
}

/**
 * 显示 Toast 提示
 */
function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    toast.style.cssText = `
        position: fixed;
        bottom: 20px;
        left: 50%;
        transform: translateX(-50%);
        background: ${type === 'success' ? '#10B981' : type === 'error' ? '#EF4444' : '#3B82F6'};
        color: white;
        padding: 10px 20px;
        border-radius: 8px;
        font-size: 14px;
        z-index: 1100;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    `;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

/**
 * HTML 转义
 */
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', init);