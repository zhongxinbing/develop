/**
 * 自定义曲线图模块 - 修复版
 */

// 自定义曲线图全局变量
let customState = {
    projectsData: {},
    currentProjectId: null,
    currentRule: null,
    selectedDates: [],
    availableDates: [],
    currentChartType: 'runtime',
    cachedToolData: {},
    pendingSelectedDates: []
};

// 自定义图表实例
let customCharts = {};

// ==================================================
// 初始化自定义图表
// ==================================================

function initCustomCharts() {
    const runtimeDom = document.getElementById('custom-chart-runtime');
    const memoryDom = document.getElementById('custom-chart-memory');
    
    if (runtimeDom) {
        if (customCharts.runtime) customCharts.runtime.dispose();
        customCharts.runtime = echarts.init(runtimeDom);
    }
    if (memoryDom) {
        if (customCharts.memory) customCharts.memory.dispose();
        customCharts.memory = echarts.init(memoryDom);
    }
}

// ==================================================
// 数据获取
// ==================================================

function getCurrentCustomProjectData() {
    if (!customState.currentProjectId) return null;
    const projectData = customState.projectsData[customState.currentProjectId];
    if (!projectData) return null;
    
    // 如果数据还没有被解析（包含 daily_metrics），先解析
    if (projectData.daily_metrics && !projectData.rule_data) {
        const parsed = window.parseProjectData ? 
            window.parseProjectData(projectData, customState.currentProjectId) : projectData;
        customState.projectsData[customState.currentProjectId] = parsed;
        return parsed;
    }
    
    return projectData;
}

function getCurrentCustomToolData() {
    if (!customState.currentRule) return null;
    
    const cache = customState.cachedToolData[customState.currentRule];
    if (cache && cache.projectId === customState.currentProjectId) {
        return cache.data;
    }
    
    const projectData = getCurrentCustomProjectData();
    if (!projectData?.rule_data?.[customState.currentRule]) return null;
    
    let toolData = projectData.rule_data[customState.currentRule];
    
    // 确保有 thread_metrics 结构
    if (!toolData.thread_metrics) {
        toolData.thread_metrics = {
            '0': {
                runtimes: toolData.runtimes || [],
                memories: toolData.memories || [],
                cores: toolData.cores || []
            }
        };
    }
    
    customState.cachedToolData[customState.currentRule] = {
        projectId: customState.currentProjectId,
        data: toolData
    };
    
    return toolData;
}

function getFilteredCustomToolData(toolData) {
    if (!toolData?.dates) return null;
    
    const filterSet = new Set(customState.selectedDates);
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

// ==================================================
// 阶段选择
// ==================================================

function updateCustomRuleSelect() {
    const projectData = getCurrentCustomProjectData();
    if (!projectData) return;
    
    const rules = projectData.rules || [];
    const searchText = document.getElementById('customRuleSearch')?.value.toLowerCase() || '';
    
    const filteredRules = searchText ? rules.filter(rule => rule.toLowerCase().includes(searchText)) : rules;
    
    const select = document.getElementById('customRuleSelect');
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
            customState.currentRule = currentValue;
        } else if (filteredRules.length > 0 && !customState.currentRule) {
            select.value = filteredRules[0];
            customState.currentRule = filteredRules[0];
        }
    }
    
    if (customState.currentRule) {
        const ruleNameSpan = document.getElementById('customCurrentRuleName');
        if (ruleNameSpan) ruleNameSpan.innerText = customState.currentRule;
        updateCustomDateInfo();
        refreshCustomCharts();
    }
}

// ==================================================
// 日期选择
// ==================================================

function updateCustomDateInfo() {
    const projectData = getCurrentCustomProjectData();
    if (!projectData) return;
    
    customState.availableDates = projectData.available_dates || projectData.dates || [];
    
    if (customState.selectedDates.length === 0) {
        customState.selectedDates = customState.availableDates.slice(-51);
    }
    
    const dateRangeSpan = document.getElementById('customDateRange');
    if (dateRangeSpan) {
        dateRangeSpan.innerText = getDateRangeText(customState.selectedDates);
    }
    const dataPointsSpan = document.getElementById('customDataPoints');
    if (dataPointsSpan) {
        dataPointsSpan.innerText = customState.selectedDates.length;
    }
}

function openCustomDatePickerModal() {
    customState.pendingSelectedDates = [...customState.selectedDates];
    buildCustomDatePicker(true);
    const modal = document.getElementById('customDatePickerModal');
    if (modal) modal.classList.remove('hidden');
}

function closeCustomDatePickerModal() {
    const modal = document.getElementById('customDatePickerModal');
    if (modal) modal.classList.add('hidden');
}

function buildCustomDatePicker(usePending = false) {
    const container = document.getElementById('customDateOptionsContainer');
    if (!container) return;
    
    const currentSelection = usePending ? customState.pendingSelectedDates : customState.selectedDates;
    const filterText = document.getElementById('customDateFilterInput')?.value || '';
    const filteredDates = customState.availableDates.filter(date => 
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
                if (!customState.pendingSelectedDates.includes(date)) {
                    customState.pendingSelectedDates.push(date);
                }
            } else {
                customState.pendingSelectedDates = customState.pendingSelectedDates.filter(d => d !== date);
            }
        });
    });
}

function confirmCustomDateSelection() {
    if (customState.pendingSelectedDates.length === 0) {
        customState.pendingSelectedDates = customState.availableDates.slice(-51);
    }
    customState.selectedDates = [...customState.pendingSelectedDates];
    updateCustomDateInfo();
    refreshCustomCharts();
    closeCustomDatePickerModal();
}

function resetCustomDateSelection(useAll = false) {
    customState.selectedDates = useAll ? [...customState.availableDates] : customState.availableDates.slice(-51);
    updateCustomDateInfo();
    refreshCustomCharts();
}

function selectAllCustomDates() {
    const container = document.getElementById('customDateOptionsContainer');
    if (!container) return;
    
    const checkboxes = container.querySelectorAll('input[type="checkbox"]');
    customState.pendingSelectedDates = [];
    checkboxes.forEach(cb => {
        cb.checked = true;
        customState.pendingSelectedDates.push(cb.value);
    });
}

function deselectAllCustomDates() {
    const container = document.getElementById('customDateOptionsContainer');
    if (!container) return;
    
    const checkboxes = container.querySelectorAll('input[type="checkbox"]');
    customState.pendingSelectedDates = [];
    checkboxes.forEach(cb => {
        cb.checked = false;
    });
}

function inverseSelectCustomDates() {
    const container = document.getElementById('customDateOptionsContainer');
    if (!container) return;
    
    const checkboxes = container.querySelectorAll('input[type="checkbox"]');
    customState.pendingSelectedDates = [];
    checkboxes.forEach(cb => {
        cb.checked = !cb.checked;
        if (cb.checked) {
            customState.pendingSelectedDates.push(cb.value);
        }
    });
}

// ==================================================
// 图表类型切换 - 修复版
// ==================================================

function updateCustomChartTypeButtons() {
    const buttons = document.querySelectorAll('#customChartTypeButtons .chart-type-btn');
    buttons.forEach(btn => {
        const type = btn.dataset.type;
        if (type === customState.currentChartType) {
            btn.classList.add('btn-primary');
            btn.classList.remove('btn-secondary');
        } else {
            btn.classList.add('btn-secondary');
            btn.classList.remove('btn-primary');
        }
    });
    
    const runtimeContainer = document.getElementById('custom-chart-runtime');
    const memoryContainer = document.getElementById('custom-chart-memory');
    if (runtimeContainer && memoryContainer) {
        if (customState.currentChartType === 'runtime') {
            runtimeContainer.classList.remove('hidden');
            memoryContainer.classList.add('hidden');
            // 确保运行时图表正确渲染
            setTimeout(() => {
                if (customCharts.runtime) {
                    customCharts.runtime.resize();
                }
            }, 50);
        } else {
            runtimeContainer.classList.add('hidden');
            memoryContainer.classList.remove('hidden');
            // 确保内存图表正确渲染
            setTimeout(() => {
                if (customCharts.memory) {
                    customCharts.memory.resize();
                }
            }, 50);
        }
    }
    
    const chartCardTitle = document.getElementById('customChartCardTitle');
    if (chartCardTitle) {
        chartCardTitle.innerText = customState.currentChartType === 'runtime' 
            ? '⏱️ Runtime 性能曲线 - 用户数据' 
            : '💾 Memory 使用曲线 - 用户数据';
    }
}

function selectCustomChartType(type) {
    if (customState.currentChartType === type) return;
    
    // 切换前保存当前图表状态
    customState.currentChartType = type;
    
    // 更新按钮样式
    updateCustomChartTypeButtons();
    
    // 重新渲染当前选中的图表
    refreshCustomCharts();
}

// ==================================================
// 图表渲染 - 修复版
// ==================================================

/**
 * 更新统计卡片
 */
function updateCustomStatsCard(containerId, values, unit, label) {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    const valid = values.filter(v => v !== null && v !== undefined && !isNaN(v) && v > 0);
    
    if (valid.length === 0) {
        container.innerHTML = '<div class="stat-item"><div class="stat-value">-</div><div class="stat-label">暂无数据</div></div>';
        return;
    }
    
    const total = valid.reduce((a, b) => a + b, 0);
    const avg = (total / valid.length).toFixed(1);
    const max = Math.max(...valid);
    const min = Math.min(...valid);
    
    container.innerHTML = `
        <div class="stat-item"><div class="stat-value">${total.toFixed(1)}<span style="font-size:0.875rem;">${unit}</span></div><div class="stat-label">总${label}</div></div>
        <div class="stat-item"><div class="stat-value">${avg}<span style="font-size:0.875rem;">${unit}</span></div><div class="stat-label">平均${label}</div></div>
        <div class="stat-item"><div class="stat-value">${max.toFixed(1)}<span style="font-size:0.875rem;">${unit}</span></div><div class="stat-label">最大${label}</div></div>
        <div class="stat-item"><div class="stat-value">${min.toFixed(1)}<span style="font-size:0.875rem;">${unit}</span></div><div class="stat-label">最小${label}</div></div>
    `;
}

function renderCustomChart(chartType, dataKey, color, yAxisName) {
    const toolData = getCurrentCustomToolData();
    if (!toolData) {
        const chart = customCharts[chartType];
        if (chart) {
            chart.clear();
            chart.setOption({
                title: {
                    show: true,
                    text: '请先选择项目和阶段',
                    textStyle: { color: '#94a3b8' },
                    left: 'center',
                    top: 'center'
                }
            }, true);
        }
        return;
    }
    
    const filteredData = getFilteredCustomToolData(toolData);
    if (!filteredData || filteredData.dates.length === 0) {
        const chart = customCharts[chartType];
        if (chart) {
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
    const palette = ['#6366f1', '#f59e0b', '#10b981', '#ef4444', '#06b6d4', '#8b5cf6', '#ec4899', '#84cc16'];
    
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
        
        const threadLabel = threadId === '0' ? '线程0' : `线程 ${threadId}`;
        seriesList.push({
            name: threadLabel,
            type: 'line',
            data: mappedValues,
            smooth: true,
            lineStyle: { width: 2, color: palette[index % palette.length] },
            areaStyle: { opacity: 0.08, color: palette[index % palette.length] },
            connectNulls: true,
            showSymbol: true,
            symbol: 'circle',
            symbolSize: 6
        });
    });
    
    // 更新统计（只更新当前显示的图表类型对应的统计）
    if (chartType === customState.currentChartType) {
        const unit = dataKey === 'runtimes' ? '秒' : 'MB';
        const label = dataKey === 'runtimes' ? 'Runtime' : 'Memory';
        updateCustomStatsCard('customStatsMain', allValues, unit, label);
    }
    
    const avgValue = allValues.length > 0 
        ? (allValues.reduce((a, b) => a + b, 0) / allValues.length).toFixed(1) 
        : 0;
    
    // 图例默认选中状态（默认只显示线程0）
    const legendSelected = {};
    threadIds.forEach(threadId => {
        const seriesName = threadId === '0' ? '线程0' : `线程 ${threadId}`;
        legendSelected[seriesName] = (threadId === '0');
    });
    
    // 工具提示格式化
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
            boundaryGap: false
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
    
    const chart = customCharts[chartType];
    if (chart) {
        chart.setOption(option, { notMerge: true, lazyUpdate: false });
    }
}

function refreshCustomCharts() {
    if (!customState.currentRule) return;
    
    // 始终渲染两个图表，但只显示当前选中的
    renderCustomChart('runtime', 'runtimes', '#6366f1', 'Runtime (秒)');
    renderCustomChart('memory', 'memories', '#10b981', 'Memory (MB)');
    
    // 确保按钮状态和容器显示正确
    updateCustomChartTypeButtons();
    
    // 强制刷新当前显示的图表
    setTimeout(() => {
        if (customState.currentChartType === 'runtime' && customCharts.runtime) {
            customCharts.runtime.resize();
        } else if (customState.currentChartType === 'memory' && customCharts.memory) {
            customCharts.memory.resize();
        }
    }, 50);
}

// ==================================================
// 数据加载
// ==================================================

async function fetchUserData(casePath) {
    showLoading(true);
    const loadingIndicator = document.getElementById('customLoadingIndicator');
    if (loadingIndicator) loadingIndicator.style.display = 'block';
    
    try {
        const response = await fetch('/api/fetch_user_data', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ case_path: casePath })
        });
        
        const result = await response.json();
        
        if (result.success) {
            customState.projectsData = result.data;
            
            const projectIds = Object.keys(customState.projectsData);
            const caseSelect = document.getElementById('customCaseSelect');
            
            if (caseSelect) {
                caseSelect.innerHTML = '<option value="">-- 请选择项目 --</option>' + 
                    projectIds.map(pid => `<option value="${pid}">${customState.projectsData[pid].project_name || pid}</option>`).join('');
                caseSelect.disabled = false;
            }
            
            // 如果有项目，自动选中第一个并刷新
            if (projectIds.length > 0) {
                customState.currentProjectId = projectIds[0];
                if (caseSelect) caseSelect.value = projectIds[0];
                
                // 更新规则列表
                updateCustomRuleSelect();
                // 更新日期信息
                updateCustomDateInfo();
                // 更新图表类型按钮状态
                updateCustomChartTypeButtons();
                
                // 初始化图表实例
                initCustomCharts();
            }
            
            showNotification('用户数据加载成功');
            return result.data;
        } else {
            showNotification('加载失败: ' + (result.error || '未知错误'), true);
            return null;
        }
    } catch (error) {
        console.error('加载用户数据失败:', error);
        showNotification('加载用户数据失败: ' + error.message, true);
        return null;
    } finally {
        showLoading(false);
        if (loadingIndicator) loadingIndicator.style.display = 'none';
    }
}

// ==================================================
// 事件绑定
// ==================================================

function bindCustomChartEvents() {
    // 加载用户数据按钮
    const loadCustomDataBtn = document.getElementById('loadCustomDataBtn');
    if (loadCustomDataBtn) {
        loadCustomDataBtn.addEventListener('click', async () => {
            const casePath = document.getElementById('customCasePath')?.value.trim();
            if (!casePath) {
                showNotification('请输入用户数据路径', true);
                return;
            }
            const data = await fetchUserData(casePath);
            if (data) {
                const caseSelect = document.getElementById('customCaseSelect');
                if (caseSelect && caseSelect.options.length > 0) {
                    customState.currentProjectId = caseSelect.value;
                    updateCustomRuleSelect();
                    updateCustomDateInfo();
                    updateCustomChartTypeButtons();
                }
            }
        });
    }
    
    // 项目选择
    const customCaseSelect = document.getElementById('customCaseSelect');
    if (customCaseSelect) {
        customCaseSelect.addEventListener('change', (e) => {
            customState.currentProjectId = e.target.value;
            customState.currentRule = null;
            customState.cachedToolData = {};
            customState.selectedDates = [];
            
            const ruleSelect = document.getElementById('customRuleSelect');
            const ruleSearch = document.getElementById('customRuleSearch');
            const openDatePicker = document.getElementById('customOpenDatePickerBtn');
            const selectRecent = document.getElementById('customSelectRecentBtn');
            
            if (customState.currentProjectId) {
                if (ruleSelect) ruleSelect.disabled = false;
                if (ruleSearch) ruleSearch.disabled = false;
                if (openDatePicker) openDatePicker.disabled = false;
                if (selectRecent) selectRecent.disabled = false;
                updateCustomRuleSelect();
                updateCustomDateInfo();
                updateCustomChartTypeButtons();
            } else {
                if (ruleSelect) ruleSelect.disabled = true;
                if (ruleSearch) ruleSearch.disabled = true;
                if (openDatePicker) openDatePicker.disabled = true;
                if (selectRecent) selectRecent.disabled = true;
            }
        });
    }
    
    // 规则选择
    const customRuleSelect = document.getElementById('customRuleSelect');
    if (customRuleSelect) {
        customRuleSelect.addEventListener('change', (e) => {
            customState.currentRule = e.target.value;
            if (customState.currentRule) {
                const ruleNameSpan = document.getElementById('customCurrentRuleName');
                if (ruleNameSpan) ruleNameSpan.innerText = customState.currentRule;
                
                // 更新日期信息
                updateCustomDateInfo();
                refreshCustomCharts();
            }
        });
    }
    
    // 规则搜索
    const customRuleSearch = document.getElementById('customRuleSearch');
    if (customRuleSearch) {
        customRuleSearch.addEventListener('input', debounce(updateCustomRuleSelect, 300));
    }
    
    // 图表类型切换
    const customChartTypeBtns = document.querySelectorAll('#customChartTypeButtons .chart-type-btn');
    customChartTypeBtns.forEach(btn => {
        btn.addEventListener('click', () => selectCustomChartType(btn.dataset.type));
    });
    
    // 日期选择
    const customOpenDatePickerBtn = document.getElementById('customOpenDatePickerBtn');
    if (customOpenDatePickerBtn) {
        customOpenDatePickerBtn.addEventListener('click', openCustomDatePickerModal);
    }
    
    const customCloseDateModalBtn = document.getElementById('customCloseDateModalBtn');
    if (customCloseDateModalBtn) {
        customCloseDateModalBtn.addEventListener('click', closeCustomDatePickerModal);
    }
    
    const customConfirmDateBtn = document.getElementById('customConfirmDateBtn');
    if (customConfirmDateBtn) {
        customConfirmDateBtn.addEventListener('click', confirmCustomDateSelection);
    }
    
    const customSelectRecentBtn = document.getElementById('customSelectRecentBtn');
    if (customSelectRecentBtn) {
        customSelectRecentBtn.addEventListener('click', () => resetCustomDateSelection(false));
    }
    
    const customSelectAllDatesBtn = document.getElementById('customSelectAllDatesBtn');
    if (customSelectAllDatesBtn) {
        customSelectAllDatesBtn.addEventListener('click', selectAllCustomDates);
    }
    
    const customDeselectAllDatesBtn = document.getElementById('customDeselectAllDatesBtn');
    if (customDeselectAllDatesBtn) {
        customDeselectAllDatesBtn.addEventListener('click', deselectAllCustomDates);
    }
    
    const customInverseDatesBtn = document.getElementById('customInverseDatesBtn');
    if (customInverseDatesBtn) {
        customInverseDatesBtn.addEventListener('click', inverseSelectCustomDates);
    }
    
    const customDateFilterInput = document.getElementById('customDateFilterInput');
    if (customDateFilterInput) {
        customDateFilterInput.addEventListener('input', debounce(() => buildCustomDatePicker(true), 150));
    }
    
    // 窗口大小调整时重新调整图表
    window.addEventListener('resize', () => {
        if (customCharts.runtime) customCharts.runtime.resize();
        if (customCharts.memory) customCharts.memory.resize();
    });
}

// 导出全局函数
window.customState = customState;
window.customCharts = customCharts;
window.initCustomCharts = initCustomCharts;
window.selectCustomChartType = selectCustomChartType;
window.refreshCustomCharts = refreshCustomCharts;
window.updateCustomChartTypeButtons = updateCustomChartTypeButtons;
window.fetchUserData = fetchUserData;
window.bindCustomChartEvents = bindCustomChartEvents;