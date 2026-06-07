/**
 * 工具页面逻辑
 * 负责数据加载、图表渲染、筛选过滤、数据对比等功能
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

// 对比相关 DOM
const compCasenameSelect = document.getElementById('compCasenameSelect');
const compareModeSelect = document.getElementById('compareModeSelect');
const compRuleSearch = document.getElementById('compRuleSearch');
const date1Select = document.getElementById('date1Select');
const date2Select = document.getElementById('date2Select');
const confirmCompareBtn = document.getElementById('confirmCompareBtn');
const exportCompareBtn = document.getElementById('exportCompareBtn');
const comparisonResults = document.getElementById('comparisonResults');
const comparisonSearch = document.getElementById('comparisonSearch');

// 统计标签
const totalLabel = document.getElementById('totalLabel');
const avgLabel = document.getElementById('avgLabel');

/**
 * 初始化页面
 */
async function init() {
    await loadToolConfig();
    await loadData();
    initEventListeners();
    initDatePickerModal();
    initAddDataModal();

    window.addEventListener('resize', () => {
        if (mainChart) {
            mainChart.resize();
        }
        if (threadChart) {
            threadChart.resize();
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
            allData = { ...rawData, ...userAddedData };
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
        console.log('缺少必要参数:', { selectedCasename, selectedRules, selectedDates });
        // 如果没有选择规则，尝试选择默认规则
        if (selectedRules.length === 0 && allRules.length > 0) {
            selectedRules = ['Overall'];
            if (ruleSelect) {
                Array.from(ruleSelect.options).forEach(opt => {
                    if (opt.value === 'Overall') opt.selected = true;
                });
            }
        }
        if (selectedDates.length === 0 && allDates.length > 0) {
            selectedDates = allDates.slice(-50);
        }
        if (!selectedCasename && Object.keys(allData).length > 0) {
            selectedCasename = Object.keys(allData)[0];
            if (casenameSelect) casenameSelect.value = selectedCasename;
        }
        
        // 再次检查
        if (selectedRules.length === 0 || selectedDates.length === 0 || !selectedCasename) {
            console.error('仍然缺少必要参数');
            return;
        }
    }
    
    // 显示加载状态
    const chartContainer = document.getElementById('mainChart');
    if (chartContainer && mainChart) {
        mainChart.showLoading({
            text: '加载中...',
            color: '#00E5FF',
            textColor: '#94A3B8',
            maskColor: 'rgba(11, 15, 26, 0.6)'
        });
    }
    
    try {
        const requestData = {
            raw_data: allData,
            casename: selectedCasename,
            rules: selectedRules,
            dates: selectedDates,
            mode: currentMode
        };
        
        console.log('[DEBUG] Request data:', requestData);
        
        const response = await axios.post(`${API_BASE}/chart/data`, requestData);
        
        if (response.data.success) {
            const chartData = response.data.data;
            console.log('[DEBUG] Chart data received:', chartData);
            
            if (!chartData.crash_dates) {
                chartData.crash_dates = [];
            }
            
            // 隐藏 loading
            if (mainChart) {
                mainChart.hideLoading();
            }
            
            // 使用 setTimeout 确保 DOM 已更新
            setTimeout(() => {
                drawChart(chartData);
            }, 50);
            
            updateStatistics(chartData);
        } else {
            console.error('获取图表数据失败:', response.data.error);
            if (mainChart) {
                mainChart.hideLoading();
                mainChart.setOption({
                    title: {
                        show: true,
                        text: '数据加载失败: ' + (response.data.error || '未知错误'),
                        left: 'center',
                        top: 'center',
                        textStyle: { color: '#EF4444', fontSize: 14 }
                    }
                });
            }
            showError('获取图表数据失败: ' + (response.data.error || '未知错误'));
        }
    } catch (error) {
        console.error('获取图表数据失败:', error);
        if (mainChart) {
            mainChart.hideLoading();
            mainChart.setOption({
                title: {
                    show: true,
                    text: '网络错误，请刷新重试',
                    left: 'center',
                    top: 'center',
                    textStyle: { color: '#EF4444', fontSize: 14 }
                }
            });
        }
        showError('获取图表数据失败: ' + (error.message || '网络错误'));
    } finally {
        // 确保隐藏 loading
        if (mainChart) {
            setTimeout(() => {
                try {
                    mainChart.hideLoading();
                } catch(e) {}
            }, 100);
        }
    }
}

/**
 * 绘制图表
 */
/**
 * 绘制图表
 */
function drawChart(chartData) {
    console.log('[DEBUG] drawChart called with:', chartData);
    
    const container = document.getElementById('mainChart');
    if (!container) {
        console.error('[ERROR] mainChart container not found');
        return;
    }
    
    // 确保容器可见且有尺寸
    const rect = container.getBoundingClientRect();
    console.log('[DEBUG] container size:', rect.width, 'x', rect.height);
    
    // 如果容器尺寸为0，延迟重试
    if (rect.width === 0 || rect.height === 0) {
        console.warn('[WARN] Container has zero size, retrying...');
        setTimeout(() => drawChart(chartData), 100);
        return;
    }
    
    // 检查数据
    if (!chartData || !chartData.dates || chartData.dates.length === 0) {
        console.error('[ERROR] No dates data');
        showError('没有日期数据');
        return;
    }
    
    if (!chartData.rules || Object.keys(chartData.rules).length === 0) {
        console.error('[ERROR] No rules data');
        showError('没有规则数据');
        return;
    }
    
    // 销毁旧实例
    if (mainChart) {
        mainChart.dispose();
        mainChart = null;
    }
    
    // 创建新实例
    mainChart = echarts.init(container);
    
    const { dates, rules, crash_dates } = chartData;
    const isRuntime = currentChartType === 'runtime';
    const yAxisName = isRuntime ? 'Runtime (s)' : 'Memory (MB)';
    const xAxisName = currentMode === 'thread' ? '线程数' : '日期';
    
    // 转换 crash_dates 为 Set
    const crashDatesSet = new Set(crash_dates || []);
    
    // 构建 series
    const series = [];
    
    // 确保 selectedRules 存在
    const rulesToShow = selectedRules.length > 0 ? selectedRules : Object.keys(rules);
    
    for (const rule of rulesToShow) {
        const ruleData = rules[rule];
        if (!ruleData) {
            console.warn(`[WARN] Rule "${rule}" not found in chartData.rules`);
            continue;
        }
        
        // 确保 values 是数组
        const values = ruleData.values || [];
        console.log(`[DEBUG] Rule ${rule} values:`, values);
        
        // 构建系列数据 - 关键修复：直接传递数值数组
        const seriesData = [];
        for (let i = 0; i < dates.length; i++) {
            const date = dates[i];
            const value = (i < values.length) ? values[i] : null;
            const isCrash = crashDatesSet.has(date);
            
            seriesData.push({
                value: value,
                date: date,
                rule: rule,
                isCrash: isCrash,
                isUserAdded: date && date.includes('_user')
            });
        }
        
        // 过滤掉全部为 null 的系列
        const hasValidData = seriesData.some(item => item.value !== null && item.value !== undefined);
        if (!hasValidData) {
            console.warn(`[WARN] Rule "${rule}" has no valid data, skipping`);
            continue;
        }
        
        // 提取纯数值数组用于 ECharts
        const numericValues = seriesData.map(item => item.value);
        
        series.push({
            name: rule,
            type: 'line',
            data: numericValues,  // 关键修复：直接传递数值数组
            smooth: false,
            symbol: 'circle',
            symbolSize: 6,
            connectNulls: false,  // 不连接空值
            lineStyle: {
                width: 2,
                color: rule === 'Overall' ? '#00E5FF' : '#A855F7'
            },
            itemStyle: {
                color: function(params) {
                    const dataPoint = seriesData[params.dataIndex];
                    if (dataPoint && dataPoint.isCrash) return '#EF4444';
                    if (dataPoint && dataPoint.isUserAdded) return '#10B981';
                    return rule === 'Overall' ? '#00E5FF' : '#A855F7';
                },
                borderColor: '#0F172A',
                borderWidth: 1
            },
            // 自定义 tooltip
            tooltip: {
                formatter: function(params) {
                    const dataPoint = seriesData[params.dataIndex];
                    if (!dataPoint) return '';
                    
                    const date = dataPoint.date;
                    const value = dataPoint.value;
                    const isCrash = dataPoint.isCrash;
                    const isUserAdded = dataPoint.isUserAdded;
                    
                    let html = `<div style="font-weight:600;margin-bottom:8px;">${formatDate(date)}</div>`;
                    html += `<div style="display:flex;justify-content:space-between;gap:16px;">
                        <span style="color:${params.color}">●</span>
                        <span>${escapeHtml(rule)}:</span>
                        <span style="font-family:monospace;font-weight:600;">${value !== null ? value.toFixed(2) : 'N/A'}</span>
                    </div>`;
                    
                    if (isCrash) {
                        html += `<div style="color:#EF4444;font-size:11px;margin-top:4px;">⚠️ Crash - 缺少 Overall 数据</div>`;
                    }
                    if (isUserAdded) {
                        html += `<div style="color:#10B981;font-size:11px;margin-top:4px;">📎 用户添加</div>`;
                    }
                    
                    return html;
                }
            }
        });
    }
    
    console.log('[DEBUG] Final series count:', series.length);
    console.log('[DEBUG] Dates:', dates);
    console.log('[DEBUG] Series data sample:', series[0]?.data);
    
    if (series.length === 0) {
        console.error('[ERROR] No valid series to display');
        // 显示提示信息
        mainChart.setOption({
            title: {
                show: true,
                text: '暂无数据',
                left: 'center',
                top: 'center',
                textStyle: { color: '#94A3B8', fontSize: 14 }
            }
        });
        return;
    }
    
    // 格式化日期显示
    const formattedDates = dates.map(d => formatDate(d));
    
    const option = {
        backgroundColor: 'transparent',
        grid: {
            left: '3%',
            right: '5%',
            top: '10%',
            bottom: '8%',
            containLabel: true
        },
        tooltip: {
            trigger: 'axis',
            axisPointer: { type: 'shadow' }
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
            nameTextStyle: {
                color: '#94A3B8'
            },
            axisLabel: {
                color: '#94A3B8'
            },
            splitLine: {
                lineStyle: { color: '#1E293B' }
            }
        },
        legend: {
            data: series.map(s => s.name),
            textStyle: { color: '#F1F5F9' },
            pageIconColor: '#00E5FF',
            pageTextStyle: { color: '#F1F5F9' },
            type: 'scroll',
            right: 10,
            top: 0
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
    
    console.log('[DEBUG] Setting chart option...');
    mainChart.setOption(option, true);
    
    // 添加窗口 resize 监听
    const resizeHandler = function() {
        if (mainChart && !mainChart.isDisposed()) {
            mainChart.resize();
        }
    };
    window.removeEventListener('resize', resizeHandler);
    window.addEventListener('resize', resizeHandler);
    
    console.log('[DEBUG] Chart rendered successfully');
}
/**
 * 更新统计信息
 */
function updateStatistics(chartData) {
    const { dates, rules, overall_data } = chartData;
    const isRuntime = currentChartType === 'runtime';
    
    if (!overall_data || !overall_data.values) {
        console.log('没有 overall_data 数据');
        return;
    }
    
    const values = overall_data.values.filter(v => v !== null && v !== undefined);
    if (values.length === 0) {
        console.log('没有有效的数值');
        return;
    }
    
    const total = values.reduce((a, b) => a + b, 0);
    const avg = total / values.length;
    const max = Math.max(...values);
    const min = Math.min(...values);
    
    // 找出最大/最小值对应的规则
    let maxRule = '';
    let minRule = '';
    
    if (rules) {
        for (const rule of selectedRules) {
            const ruleData = rules[rule];
            if (!ruleData || !ruleData.values) continue;
            
            for (let i = 0; i < ruleData.values.length; i++) {
                const val = ruleData.values[i];
                if (val !== null && val !== undefined) {
                    if (val === max && maxRule === '') {
                        maxRule = rule;
                    }
                    if (val === min && minRule === '') {
                        minRule = rule;
                    }
                }
            }
        }
    }
    
    const dateRangeEl = document.getElementById('dateRange');
    const totalValueEl = document.getElementById('totalValue');
    const avgValueEl = document.getElementById('avgValue');
    const maxValueEl = document.getElementById('maxValue');
    const minValueEl = document.getElementById('minValue');
    
    if (dateRangeEl) {
        dateRangeEl.textContent = dates.length > 0 ? `${formatDate(dates[0])} ~ ${formatDate(dates[dates.length-1])}` : '-';
    }
    if (totalValueEl) totalValueEl.textContent = total.toFixed(2);
    if (avgValueEl) avgValueEl.textContent = avg.toFixed(2);
    if (maxValueEl) maxValueEl.textContent = max.toFixed(2);
    if (minValueEl) minValueEl.textContent = min.toFixed(2);
    
    if (totalLabel) totalLabel.textContent = isRuntime ? 'Total Runtime' : 'Total Memory';
    if (avgLabel) avgLabel.textContent = isRuntime ? 'Average Runtime' : 'Average Memory';
    
    // 更新 tooltip
    const maxTooltipContent = document.getElementById('maxTooltipContent');
    const minTooltipContent = document.getElementById('minTooltipContent');
    if (maxTooltipContent) maxTooltipContent.textContent = maxRule ? `最大: ${maxRule}` : '';
    if (minTooltipContent) minTooltipContent.textContent = minRule ? `最小: ${minRule}` : '';
}

/**
 * 更新项目概况
 */
async function updateOverview() {
    try {
        const response = await axios.post(`${API_BASE}/overview`, {
            raw_data: allData,
            casename: selectedCasename
        });
        
        if (response.data.success) {
            const overview = response.data.data;
            document.getElementById('totalCases').textContent = overview.total_cases;
            document.getElementById('totalRules').textContent = overview.total_rules;
            document.getElementById('totalDays').textContent = overview.total_dates;
        }
    } catch (error) {
        console.error('获取项目概况失败:', error);
    }
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
                <div class="tooltip-content" style="position:absolute;background:#1E293B;padding:8px;border-radius:8px;max-width:200px;">
                    ${stats.runtime_increased.slice(0,10).map(item => `<div>${item[0]}: +${item[1].toFixed(2)}s</div>`).join('')}
                </div>
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
            
            // 刷新界面
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
    const dateList = document.getElementById('dateList');
    
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
        // 获取选中的日期
        const checkboxes = document.querySelectorAll('.date-checkbox:checked');
        selectedDates = Array.from(checkboxes).map(cb => cb.value);
        closeModal();
        renderChart();
    });
    
    // 全选功能
    if (selectAllCheckbox) {
        selectAllCheckbox.addEventListener('change', (e) => {
            const checkboxes = document.querySelectorAll('.date-checkbox');
            checkboxes.forEach(cb => cb.checked = e.target.checked);
        });
    }
    
    // 搜索过滤
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
    
    // 更新全选状态
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
    // 修改模式切换事件监听
modeNavItems.forEach(item => {
    item.addEventListener('click', () => {
        modeNavItems.forEach(nav => nav.classList.remove('active'));
        item.classList.add('active');
        currentMode = item.dataset.mode;
        
        // 隐藏所有侧边栏内容
        document.querySelectorAll('.sidebar-content').forEach(content => {
            content.style.display = 'none';
        });
        
        if (currentMode === 'single') {
            document.getElementById('sidebarPerformance').style.display = 'flex';
            // 恢复单线程图表
            if (currentChartType !== 'comparison') {
                renderChart();
            }
        } else if (currentMode === 'multi') {
            document.getElementById('sidebarPerformance').style.display = 'flex';
            // 多线程模式
            if (currentChartType !== 'comparison') {
                renderChart();
            }
        } else if (currentMode === 'thread') {
            document.getElementById('sidebarThread').style.display = 'flex';
            // 初始化线程曲线图
            updateThreadSelects().then(() => {
                loadThreadChartData();
            });
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
                // 显示对比面板
                if (filtersPanel) filtersPanel.style.display = 'none';
                if (comparisonPanel) comparisonPanel.style.display = 'block';
                showComparisonView(false);
            } else {
                // 显示性能面板
                if (filtersPanel) filtersPanel.style.display = 'block';
                if (comparisonPanel) comparisonPanel.style.display = 'none';
                showComparisonView(false);
                renderChart();
            }
        });
    });
    
    // Casename 选择
    casenameSelect.addEventListener('change', async (e) => {
        selectedCasename = e.target.value;
        if (compCasenameSelect) compCasenameSelect.value = selectedCasename;
        await updateRulesAndDates();
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
        renderChart();
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

/**
 * 线程曲线图相关变量
 */
let currentThreadChartType = 'runtime';  // 'runtime', 'memory'
let threadChart = null;

/**
 * 初始化线程曲线图
 */
function initThreadChart() {
    if (!threadChart) {
        const container = document.getElementById('mainChart');
        if (container) {
            threadChart = echarts.init(container);
        }
    }
}

/**
 * 加载线程曲线图数据
 */
async function loadThreadChartData() {
    const casename = document.getElementById('threadCasenameSelect')?.value;
    const ruleSelect = document.getElementById('threadRuleSelect');
    const rule = ruleSelect?.value;
    const date = document.getElementById('threadDateSelect')?.value;
    
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
    window.addEventListener('resize', () => threadChart && threadChart.resize());
}

/**
 * 更新线程曲线图的选项（Casename/Rule/Date）
 */
async function updateThreadSelects() {
    const casenames = Object.keys(allData);
    const threadCasenameSelect = document.getElementById('threadCasenameSelect');
    const threadRuleSelect = document.getElementById('threadRuleSelect');
    const threadDateSelect = document.getElementById('threadDateSelect');
    
    if (threadCasenameSelect) {
        const options = casenames.map(name => 
            `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`
        ).join('');
        threadCasenameSelect.innerHTML = options;
        
        if (casenames.length > 0 && !threadCasenameSelect.value) {
            threadCasenameSelect.value = casenames[0];
        }
    }
    
    // 监听 Casename 变化
    if (threadCasenameSelect) {
        threadCasenameSelect.addEventListener('change', () => {
            updateThreadRules();
            updateThreadDates();
        });
    }
    
    await updateThreadRules();
    await updateThreadDates();
}

/**
 * 更新线程曲线图的规则列表
 */
async function updateThreadRules() {
    const casename = document.getElementById('threadCasenameSelect')?.value;
    const threadRuleSelect = document.getElementById('threadRuleSelect');
    const threadRuleSearch = document.getElementById('threadRuleSearch');
    
    if (!casename || !allData[casename]) return;
    
    const caseData = allData[casename];
    const dailyMetrics = caseData.daily_metrics || {};
    
    // 收集所有规则
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
    
    // 搜索过滤
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
    
    // 搜索事件
    if (threadRuleSearch) {
        threadRuleSearch.addEventListener('input', () => updateThreadRules());
    }
}

/**
 * 更新线程曲线图的日期列表
 */
async function updateThreadDates() {
    const casename = document.getElementById('threadCasenameSelect')?.value;
    const threadDateSelect = document.getElementById('threadDateSelect');
    
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
 * 切换线程曲线图类型
 */
function switchThreadChartType(type) {
    currentThreadChartType = type;
    
    // 更新菜单激活状态
    document.querySelectorAll('[data-thread-chart]').forEach(btn => {
        if (btn.dataset.threadChart === type) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
    
    loadThreadChartData();
}

// 全局状态新增
let selectedThreads = [0];  // 默认显示0线程
let availableThreads = [];

// 初始化线程选择器
function initThreadSelector() {
    const threadSelectContainer = document.getElementById('threadSelectContainer');
    if (!threadSelectContainer) return;
    
    // 创建多选下拉框
    threadSelectContainer.innerHTML = `
        <div class="filter-group">
            <label><i class="fas fa-diagram-project"></i> 线程数选择</label>
            <div class="multi-select" id="threadMultiSelect">
                <div class="multi-select-trigger" onclick="toggleThreadDropdown()">
                    <span id="selectedThreadsDisplay">0线程</span>
                    <i class="fas fa-chevron-down"></i>
                </div>
                <div class="multi-select-dropdown" id="threadDropdown" style="display: none;">
                    <div class="multi-select-search">
                        <input type="text" placeholder="搜索线程数..." id="threadSearchInput">
                    </div>
                    <div class="multi-select-actions">
                        <button class="btn-select-all" onclick="selectAllThreads()">全选</button>
                        <button class="btn-clear-all" onclick="clearAllThreads()">清空</button>
                    </div>
                    <div class="multi-select-options" id="threadOptions"></div>
                </div>
            </div>
        </div>
    `;
    
    loadThreadOptions();
}

// 加载线程选项
async function loadThreadOptions() {
    if (!selectedCasename || selectedRules.length === 0) return;
    
    const response = await axios.post(`${API_BASE}/chart/threads`, {
        raw_data: allData,
        casename: selectedCasename,
        rule: selectedRules[0]  // 使用第一个选中的规则获取线程信息
    });
    
    if (response.data.success) {
        availableThreads = response.data.data.threads;
        selectedThreads = response.data.data.default_threads;
        renderThreadOptions();
        updateSelectedThreadsDisplay();
    }
}

// 渲染线程选项
function renderThreadOptions() {
    const container = document.getElementById('threadOptions');
    if (!container) return;
    
    container.innerHTML = availableThreads.map(thread => `
        <label class="multi-select-option">
            <input type="checkbox" value="${thread}" 
                ${selectedThreads.includes(thread) ? 'checked' : ''}
                onchange="toggleThreadSelection(${thread}, this.checked)">
            <span>${thread} 线程</span>
        </label>
    `).join('');
}

// 切换线程选择
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
    renderChartWithThreads();
}

// 更新显示
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

// 全选/清空
function selectAllThreads() {
    selectedThreads = [...availableThreads];
    renderThreadOptions();
    updateSelectedThreadsDisplay();
    renderChartWithThreads();
}

function clearAllThreads() {
    selectedThreads = [];
    renderThreadOptions();
    updateSelectedThreadsDisplay();
    renderChartWithThreads();
}

// 带线程参数渲染图表
async function renderChartWithThreads() {
    const requestData = {
        raw_data: allData,
        casename: selectedCasename,
        rules: selectedRules,
        dates: selectedDates,
        mode: currentMode,
        selected_threads: selectedThreads  // 传递线程选择
    };
    
    const response = await axios.post(`${API_BASE}/chart/data`, requestData);
    if (response.data.success) {
        drawMultiThreadChart(response.data.data);
    }
}

// 绘制多线程图表
function drawMultiThreadChart(chartData) {
    if (mainChart) {
        mainChart.dispose();
    }
    mainChart = echarts.init(document.getElementById('mainChart'));
    
    const { dates, rules, thread_counts } = chartData;
    const isRuntime = currentChartType === 'runtime';
    
    // 为每个规则创建多个系列（每个线程一个）
    const series = [];
    
    for (const rule of selectedRules) {
        const ruleData = rules[rule];
        if (!ruleData || !ruleData.thread_series) continue;
        
        for (const [threadNum, values] of Object.entries(ruleData.thread_series)) {
            // 确保values长度与dates一致
            while (values.length < dates.length) {
                values.push(null);
            }
            
            series.push({
                name: `${rule} (${threadNum}线程)`,
                type: 'line',
                data: values,
                smooth: false,
                symbol: 'circle',
                symbolSize: 6,
                lineStyle: {
                    width: 2,
                    color: getThreadColor(parseInt(threadNum))
                }
            });
        }
    }
    
    const option = {
        backgroundColor: 'transparent',
        tooltip: { trigger: 'axis' },
        legend: {
            data: series.map(s => s.name),
            textStyle: { color: '#F1F5F9' },
            type: 'scroll',
            right: 10,
            top: 0
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
            name: '日期',
            data: dates.map(d => formatDate(d)),
            axisLabel: { rotate: dates.length > 30 ? 45 : 0 }
        },
        yAxis: {
            type: 'value',
            name: isRuntime ? 'Runtime (s)' : 'Memory (MB)'
        },
        series: series
    };
    
    mainChart.setOption(option);
}

// 线程颜色映射
function getThreadColor(threadNum) {
    const colors = {
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
    return colors[threadNum] || '#6B7280';
}
// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', init);