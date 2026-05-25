/**
 * EDA 性能监控系统 - 工具页面主脚本
 * 支持时序曲线图、多线程对比、数据对比、自定义曲线图四大功能
 * 使用 ECharts 进行数据可视化
 */

// ==================================================
// 工具函数模块
// ==================================================

/**
 * 防抖函数 - 限制函数调用频率
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
 * 显示通知消息
 */
function showNotification(message, isError = false) {
    const notification = document.createElement('div');
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
        font-size: 14px;
        font-weight: 500;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
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
        if (show) {
            overlay.classList.remove('hidden');
        } else {
            overlay.classList.add('hidden');
        }
    }
}

/**
 * 更新最后更新时间显示
 */
function updateLastUpdateTime() {
    const now = new Date();
    const timeStr = now.toLocaleString('zh-CN');
    const lastUpdateText = document.getElementById('lastUpdateText');
    if (lastUpdateText) {
        lastUpdateText.innerHTML = `最后更新: ${timeStr}`;
    }
    const statusDot = document.getElementById('statusDot');
    if (statusDot) {
        statusDot.classList.add('updating');
        setTimeout(() => statusDot.classList.remove('updating'), 1000);
    }
}

/**
 * 构建MR更新映射表
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
    if (perfData && perfData.mem) {
        Object.keys(perfData.mem).forEach(date => {
            const comment = perfData.mem[date];
            if (comment && comment !== 'undefined' && comment !== '' && comment !== 'None') {
                if (!mrMap[date]) mrMap[date] = '';
                mrMap[date] += (mrMap[date] ? ' | ' : '') + comment;
            }
        });
    }
    return mrMap;
}

/**
 * HTML转义
 */
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// 添加工具提示动画样式
const tooltipStyle = document.createElement('style');
tooltipStyle.textContent = `
    @keyframes slideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
    }
    @keyframes tooltipFadeIn {
        from { opacity: 0; transform: translateY(-5px); }
        to { opacity: 1; transform: translateY(0); }
    }
`;
document.head.appendChild(tooltipStyle);


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
 * 更新阶段选择下拉框
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
        const currentRuleNameSpan = document.getElementById('currentRuleName');
        if (currentRuleNameSpan) {
            currentRuleNameSpan.innerText = currentRule;
        }
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
    
    const dateRangeSpan = document.getElementById('dateRange');
    if (dateRangeSpan) {
        dateRangeSpan.innerText = selectedDates.length ? `${selectedDates[0]} 至 ${selectedDates[selectedDates.length - 1]}` : '无';
    }
    const dataPointsSpan = document.getElementById('dataPoints');
    if (dataPointsSpan) {
        dataPointsSpan.innerText = selectedDates.length;
    }
}

/**
 * 更新图表类型按钮状态
 */
function updateChartTypeButtons() {
    const buttons = document.querySelectorAll('#chartTypeButtons .chart-type-btn');
    buttons.forEach(btn => {
        const type = btn.dataset.type;
        if (type === currentChartType) {
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
        if (currentChartType === 'runtime') {
            runtimeContainer.classList.remove('hidden');
            memoryContainer.classList.add('hidden');
        } else {
            runtimeContainer.classList.add('hidden');
            memoryContainer.classList.remove('hidden');
        }
    }

    const chartCardTitle = document.getElementById('chartCardTitle');
    if (chartCardTitle) {
        chartCardTitle.innerText = currentChartType === 'runtime' ? '⏱️ Runtime 性能曲线' : '💾 Memory 使用曲线';
    }
    
    if (currentChartType === 'runtime') {
        charts.runtime?.resize();
    } else {
        charts.memory?.resize();
    }
}

/**
 * 切换图表类型
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
    if (!toolData || !toolData.dates) return null;
    
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
            filtered.runtimes.push(toolData.runtimes?.[index] ?? null);
            filtered.memories.push(toolData.memories?.[index] ?? null);
            filtered.cores.push(toolData.cores?.[index] ?? null);
        }
    });
    
    return filtered;
}

/**
 * 获取当前选中的工具数据（带缓存）
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
 * 检查日期是否有MR更新
 */
function hasMrUpdate(date) {
    const comment = mrUpdateDates[date];
    return comment && comment !== 'undefined' && comment !== '' && comment !== 'None';
}

/**
 * 获取MR更新评论
 */
function getMrComment(date) {
    return mrUpdateDates[date] || '';
}

/**
 * 更新统计卡片
 */
function updateStats(containerId, data, unit, label) {
    const validData = data.filter(v => v !== null && v !== undefined && v > 0);
    const container = document.getElementById(containerId);
    if (!container) return;
    
    if (validData.length === 0) {
        container.innerHTML = '<div class="stat-item"><div class="stat-value">-</div><div class="stat-label">暂无数据</div></div>';
        return;
    }
    
    const total = validData.reduce((a, b) => a + b, 0);
    const avg = (total / validData.length).toFixed(1);
    const max = Math.max(...validData);
    const min = Math.min(...validData);
    
    container.innerHTML = `
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
            if (name === '线程0') {
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
        showNotification('已全选所有线程');
    }
}

/**
 * 反选线程
 */
function inverseSelectThreads() {
    const chart = charts[currentChartType];
    if (chart) {
        const option = chart.getOption();
        const legendSelected = option.legend[0].selected || {};
        const newSelected = {};
        Object.entries(legendSelected).forEach(([name, isSelected]) => {
            newSelected[name] = !isSelected;
        });
        chart.setOption({ legend: { selected: newSelected } });
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
    if (!filteredData || filteredData.dates.length === 0) {
        if (charts[chartType]) charts[chartType].clear();
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
    const palette = ['#6366f1', '#f59e0b', '#10b981', '#ef4444', '#06b6d4', '#8b5cf6', '#ec4899', '#84cc16'];
    
    const seriesList = threadIds.map((threadId, index) => {
        const threadInfo = threadMetrics[threadId];
        let values = threadInfo?.[dataKey] || [];
        
        const mappedValues = [];
        const originalDates = toolData.dates || [];
        
        dates.forEach(selectedDate => {
            const dateIndex = originalDates.indexOf(selectedDate);
            if (dateIndex !== -1 && values[dateIndex] !== undefined) {
                mappedValues.push(values[dateIndex]);
            } else {
                mappedValues.push(null);
            }
        });
        
        const seriesColor = palette[index % palette.length];
        const threadLabel = threadId === '0' ? '线程0' : `其他线程${threadId}`;
        
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
        
        return {
            threadId,
            name: threadLabel,
            type: 'line',
            data: seriesData,
            smooth: false,
            lineStyle: { width: 2, color: seriesColor },
            areaStyle: { opacity: 0.08, color: seriesColor },
            connectNulls: false,
            showSymbol: true,
            step: false
        };
    });
    
    // 更新统计
    const allValues = seriesList
        .flatMap(series => series.data.map(item => item.value))
        .filter(v => v !== null && v !== undefined && v > 0);
    
    const unit = dataKey === 'runtimes' ? '秒' : 'MB';
    const label = dataKey === 'runtimes' ? 'Runtime' : 'Memory';
    if (chartType === currentChartType) {
        updateStats('stats-main', allValues, unit, label);
    }
    
    const avgValue = allValues.length > 0 ? (allValues.reduce((a, b) => a + b, 0) / allValues.length).toFixed(1) : 0;
    
    // 图例默认选中状态（默认只选线程0）
    const legendSelected = {};
    threadIds.forEach(threadId => {
        const seriesName = threadId === '0' ? '线程0' : `其他线程${threadId}`;
        legendSelected[seriesName] = (threadId === '0');
    });
    
    const tooltipFormatter = function(params) {
        if (!params?.length) return '';
        const date = params[0].axisValue;
        const rows = params.map(p => `<div>${p.seriesName}: ${p.value} ${unit}</div>`).join('');
        const mrComment = getMrComment(date);
        const hasMr = mrComment !== '';
        const mrStyle = hasMr ? 'color: #ef4444; font-weight: bold;' : 'color: #94a3b8;';
        const mrIcon = hasMr ? '🔴' : '⚪';
        return `<strong>📅 ${date}</strong>${rows}<div style="margin-top: 6px; padding-top: 4px; border-top: 1px solid #334155;"><span style="${mrStyle}">${mrIcon} ${hasMr ? mrComment : '无MR更新'}</span></div>`;
    };
    
    const option = {
        backgroundColor: 'transparent',
        tooltip: {
            trigger: 'axis',
            backgroundColor: 'rgba(30, 41, 59, 0.95)',
            borderColor: color,
            borderWidth: 1,
            textStyle: { color: '#f1f5f9', fontSize: 12 },
            formatter: tooltipFormatter
        },
        grid: { left: '8%', right: '8%', top: '18%', bottom: '10%', containLabel: true },
        xAxis: {
            type: 'category',
            data: dates,
            axisLabel: { rotate: dates.length > 10 ? 30 : 0, color: '#94a3b8', fontSize: 11 },
            axisLine: { lineStyle: { color: '#475569' } },
            boundaryGap: false
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
    
    if (charts[chartType]) {
        charts[chartType].setOption(option, { notMerge: false, lazyUpdate: true });
    }
}

/**
 * 刷新时序曲线图
 */
function refreshTimelineCharts() {
    if (!currentRule) return;
    
    renderTimelineChart('runtime', 'runtimes', '#6366f1', 'Runtime (秒)');
    renderTimelineChart('memory', 'memories', '#10b981', 'Memory (MB)', (value) => {
        if (value >= 1024) return (value / 1024).toFixed(1) + ' GB';
        return value + ' MB';
    });
    updateChartTypeButtons();
    
    setTimeout(() => {
        addControlButtonsToLegend();
    }, 100);
}

/**
 * 更新项目统计卡片
 */
function updateProjectStats() {
    const projectData = getCurrentProjectData();
    if (!projectData) return;
    
    const statsContainer = document.getElementById('projectStats');
    if (!statsContainer) return;
    
    statsContainer.innerHTML = `
        <div class="stat-item"><div class="stat-value">${projectData.rules?.length || 0}</div><div class="stat-label">阶段数</div></div>
        <div class="stat-item"><div class="stat-value">${projectData.dates?.length || 0}</div><div class="stat-label">天数</div></div>
        <div class="stat-item"><div class="stat-value">-</div><div class="stat-label">平均Runtime</div></div>
    `;
}

/**
 * 在图例中添加控制按钮（全选/反选）
 */
function addControlButtonsToLegend() {
    const legendContainer = document.querySelector('#chart-runtime .echarts-legend, #chart-memory .echarts-legend');
    if (!legendContainer) return;
    
    if (document.getElementById('legendControlButtons')) return;
    
    const buttonContainer = document.createElement('div');
    buttonContainer.id = 'legendControlButtons';
    buttonContainer.style.cssText = `
        display: inline-flex;
        gap: 6px;
        margin-left: 12px;
        vertical-align: middle;
    `;
    
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
    legendContainer.appendChild(buttonContainer);
}

/**
 * 监听图表渲染完成事件
 */
function observeChartRendering() {
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
 * 初始化多线程图表
 */
function initMultiCharts() {
    const multiRuntimeDom = document.getElementById('chart-multi-runtime');
    const multiMemoryDom = document.getElementById('chart-multi-memory');
    
    if (multiRuntimeDom) {
        if (charts.multiRuntime) {
            charts.multiRuntime.dispose();
        }
        charts.multiRuntime = echarts.init(multiRuntimeDom);
    }
    
    if (multiMemoryDom) {
        if (charts.multiMemory) {
            charts.multiMemory.dispose();
        }
        charts.multiMemory = echarts.init(multiMemoryDom);
    }
}

/**
 * 打开多线程日期选择模态框
 */
function openMultiDatePickerModal() {
    if (!multiAvailableDates || multiAvailableDates.length === 0) {
        showNotification('暂无可选日期', true);
        return;
    }
    pendingMultiSelectedDates = [currentMultiDate];
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
    
    const currentSelection = usePending ? pendingMultiSelectedDates : [currentMultiDate];
    const filterInput = document.getElementById('multiDateFilterInput');
    const filterText = filterInput?.value || '';
    const filteredDates = multiAvailableDates.filter(date => date.toLowerCase().includes(filterText.toLowerCase()));
    
    const isSingleMode = document.querySelector('input[name="multiSelectMode"]:checked')?.value === 'single';
    
    container.innerHTML = filteredDates.map(date => `
        <label class="date-option">
            <input type="${isSingleMode ? 'radio' : 'checkbox'}" name="multiDate" value="${date}" ${currentSelection.includes(date) ? 'checked' : ''}>
            <span>${date}</span>
        </label>
    `).join('');
    
    const selectModeRadios = document.querySelectorAll('input[name="multiSelectMode"]');
    selectModeRadios.forEach(radio => {
        radio.addEventListener('change', () => {
            buildMultiDatePicker(usePending);
        });
    });
    
    container.querySelectorAll('input[type="checkbox"], input[type="radio"]').forEach(cb => {
        cb.addEventListener('change', (e) => {
            if (isSingleMode) {
                pendingMultiSelectedDates = [e.target.value];
            } else {
                if (e.target.checked) {
                    if (!pendingMultiSelectedDates.includes(e.target.value)) {
                        pendingMultiSelectedDates.push(e.target.value);
                    }
                } else {
                    pendingMultiSelectedDates = pendingMultiSelectedDates.filter(d => d !== e.target.value);
                }
            }
        });
    });
}

/**
 * 确认多线程日期选择
 */
async function confirmMultiDateSelection() {
    if (pendingMultiSelectedDates.length === 0) {
        showNotification('请选择一个日期', true);
        return;
    }
    
    const isMultiMode = document.querySelector('input[name="multiSelectMode"]:checked')?.value === 'all';
    
    if (isMultiMode) {
        multiAvailableDates = pendingMultiSelectedDates.sort();
        await loadMultiThreadDataForMultipleDates(currentProjectId, currentMultiRule, multiAvailableDates);
    } else {
        const newDate = pendingMultiSelectedDates[0];
        if (newDate !== currentMultiDate) {
            currentMultiDate = newDate;
            const multiCurrentDateSpan = document.getElementById('multiCurrentDate');
            if (multiCurrentDateSpan) {
                multiCurrentDateSpan.innerText = currentMultiDate;
            }
            await loadMultiThreadData(currentProjectId, currentMultiRule, currentMultiDate);
        }
    }
    closeMultiDatePickerModal();
}

/**
 * 加载多个日期的多线程数据用于对比趋势
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
        availableThreads = Array.from(allThreads).sort((a, b) => parseInt(a) - parseInt(b));
        
        if (selectedMultiThreads.length === 0) {
            selectedMultiThreads = [...availableThreads];
        }
        
        currentMultiThreadData = validResults;
        renderMultiThreadComparisonChart();
        
    } catch (error) {
        console.error('加载多线程数据失败:', error);
        showNotification('加载多线程数据失败', true);
    } finally {
        showLoading(false);
    }
}

/**
 * 渲染多日期对比图表
 */
function renderMultiThreadComparisonChart() {
    if (!currentMultiThreadData || currentMultiThreadData.length === 0) return;
    
    const isRuntime = currentMultiChartType === 'runtime';
    const chart = isRuntime ? charts.multiRuntime : charts.multiMemory;
    if (!chart) return;
    
    const dates = currentMultiThreadData.map(d => d.date);
    const selectedThreadIds = selectedMultiThreads;
    
    const palette = ['#6366f1', '#f59e0b', '#10b981', '#ef4444', '#06b6d4', '#8b5cf6', '#ec4899', '#84cc16'];
    
    const seriesList = selectedThreadIds.map((threadId, idx) => {
        const values = currentMultiThreadData.map(dayData => {
            const threadData = dayData.threads_data.find(t => t.threads.toString() === threadId);
            return threadData ? (isRuntime ? threadData.runtime : threadData.memory) : null;
        });
        
        return {
            name: threadId === '0' ? '线程0' : `线程 ${threadId}`,
            type: 'line',
            data: values,
            smooth: true,
            lineStyle: { width: 2, color: palette[idx % palette.length] },
            symbol: 'circle',
            symbolSize: 6,
            connectNulls: true
        };
    });
    
    const yAxisName = isRuntime ? 'Runtime (秒)' : 'Memory (MB)';
    
    const option = {
        backgroundColor: 'transparent',
        tooltip: {
            trigger: 'axis',
            formatter: function(params) {
                if (!params?.length) return '';
                const date = params[0].axisValue;
                const rows = params.map(p => `<div>${p.seriesName}: ${p.value !== null ? p.value.toFixed(2) : 'N/A'} ${isRuntime ? '秒' : 'MB'}</div>`).join('');
                return `<strong>📅 ${date}</strong>${rows}`;
            }
        },
        xAxis: {
            type: 'category',
            name: '日期',
            data: dates,
            axisLabel: { rotate: 30, color: '#94a3b8', fontSize: 11 },
            axisLine: { lineStyle: { color: '#475569' } }
        },
        yAxis: {
            type: 'value',
            name: yAxisName,
            nameTextStyle: { color: '#cbd5e1', fontSize: 12 },
            axisLabel: { color: '#94a3b8', fontSize: 11 },
            splitLine: { lineStyle: { color: 'rgba(71, 85, 105, 0.3)', type: 'dashed' } }
        },
        series: seriesList,
        legend: {
            data: seriesList.map(s => s.name),
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
            iconStyle: { borderColor: '#94a3b8' }
        }
    };
    
    chart.setOption(option, { notMerge: true });
    setTimeout(() => chart.resize(), 50);
}

/**
 * 选择最新日期
 */
async function selectLatestMultiDate() {
    if (multiAvailableDates.length > 0) {
        const latestDate = multiAvailableDates[multiAvailableDates.length - 1];
        if (latestDate !== currentMultiDate) {
            currentMultiDate = latestDate;
            const multiCurrentDateSpan = document.getElementById('multiCurrentDate');
            if (multiCurrentDateSpan) {
                multiCurrentDateSpan.innerText = currentMultiDate;
            }
            await loadMultiThreadData(currentProjectId, currentMultiRule, currentMultiDate);
        }
    }
}

/**
 * 更新多线程图表类型按钮状态
 */
function updateMultiChartTypeButtons() {
    const runtimeBtn = document.getElementById('multiChartRuntimeBtn');
    const memoryBtn = document.getElementById('multiChartMemoryBtn');
    
    if (runtimeBtn) {
        if (currentMultiChartType === 'runtime') {
            runtimeBtn.classList.add('btn-primary');
            runtimeBtn.classList.remove('btn-secondary');
        } else {
            runtimeBtn.classList.add('btn-secondary');
            runtimeBtn.classList.remove('btn-primary');
        }
    }
    if (memoryBtn) {
        if (currentMultiChartType === 'memory') {
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
        if (currentMultiChartType === 'runtime') {
            runtimeContainer.classList.remove('hidden');
            memoryContainer.classList.add('hidden');
        } else {
            runtimeContainer.classList.add('hidden');
            memoryContainer.classList.remove('hidden');
        }
    }
    
    const multiChartCardTitle = document.getElementById('multiChartCardTitle');
    if (multiChartCardTitle) {
        multiChartCardTitle.innerText = currentMultiChartType === 'runtime' ? '⏱️ Runtime 性能曲线' : '💾 Memory 使用曲线';
    }
    
    if (currentMultiThreadData && currentMultiThreadData.length > 0) {
        setTimeout(() => {
            if (Array.isArray(currentMultiThreadData) && currentMultiThreadData[0]?.threads_data) {
                renderMultiThreadChart();
            } else if (Array.isArray(currentMultiThreadData) && currentMultiThreadData[0]?.date) {
                renderMultiThreadComparisonChart();
            } else {
                renderMultiThreadChart();
            }
        }, 50);
    }
}

/**
 * 切换多线程图表类型
 */
function selectMultiChartType(type) {
    if (currentMultiChartType === type) return;
    currentMultiChartType = type;
    updateMultiChartTypeButtons();
}

/**
 * 打开线程选择模态框
 */
function openThreadSelectorModal() {
    if (!availableThreads || availableThreads.length === 0) {
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
 * 构建线程选择模态框内容
 */
function buildThreadSelectorModal() {
    const container = document.getElementById('threadSelectorModalContent');
    if (!container) return;
    
    const filterInput = document.getElementById('threadFilterInput');
    const filterText = filterInput?.value || '';
    const filteredThreads = availableThreads.filter(thread => 
        thread.toLowerCase().includes(filterText.toLowerCase())
    );
    
    container.innerHTML = filteredThreads.map(threadId => {
        const isChecked = selectedMultiThreads.includes(threadId);
        const displayName = threadId === '0' ? '线程0' : `线程 ${threadId}`;
        return `
            <label class="thread-checkbox ${isChecked ? 'selected' : ''}" data-thread="${threadId}">
                <input type="checkbox" value="${threadId}" ${isChecked ? 'checked' : ''}>
                <span>${displayName}</span>
            </label>
        `;
    }).join('');
    
    container.querySelectorAll('.thread-checkbox input').forEach(cb => {
        cb.addEventListener('change', (e) => {
            e.stopPropagation();
            const label = e.target.closest('.thread-checkbox');
            if (label) {
                if (e.target.checked) {
                    label.classList.add('selected');
                } else {
                    label.classList.remove('selected');
                }
            }
        });
    });
    
    container.querySelectorAll('.thread-checkbox').forEach(label => {
        label.addEventListener('click', (e) => {
            if (e.target.tagName !== 'INPUT') {
                const checkbox = label.querySelector('input');
                if (checkbox) {
                    checkbox.checked = !checkbox.checked;
                    if (checkbox.checked) {
                        label.classList.add('selected');
                    } else {
                        label.classList.remove('selected');
                    }
                }
            }
        });
    });
}

/**
 * 从模态框更新选中的线程
 */
function updateSelectedThreadsFromModal() {
    const modalContent = document.getElementById('threadSelectorModalContent');
    if (!modalContent) return;
    
    selectedMultiThreads = [];
    modalContent.querySelectorAll('.thread-checkbox input:checked').forEach(cb => {
        selectedMultiThreads.push(cb.value);
    });
}

/**
 * 线程选择全选按钮
 */
function selectAllThreadsInModal() {
    const modalContent = document.getElementById('threadSelectorModalContent');
    if (!modalContent) return;
    
    const checkboxes = modalContent.querySelectorAll('.thread-checkbox input');
    checkboxes.forEach(cb => {
        cb.checked = true;
        const label = cb.closest('.thread-checkbox');
        if (label) label.classList.add('selected');
    });
    updateSelectedThreadsFromModal();
}

/**
 * 线程选择全不选按钮
 */
function deselectAllThreadsInModal() {
    const modalContent = document.getElementById('threadSelectorModalContent');
    if (!modalContent) return;
    
    const checkboxes = modalContent.querySelectorAll('.thread-checkbox input');
    checkboxes.forEach(cb => {
        cb.checked = false;
        const label = cb.closest('.thread-checkbox');
        if (label) label.classList.remove('selected');
    });
    updateSelectedThreadsFromModal();
}

/**
 * 线程选择反选按钮
 */
function inverseSelectThreadsInModal() {
    const modalContent = document.getElementById('threadSelectorModalContent');
    if (!modalContent) return;
    
    const checkboxes = modalContent.querySelectorAll('.thread-checkbox input');
    checkboxes.forEach(cb => {
        cb.checked = !cb.checked;
        const label = cb.closest('.thread-checkbox');
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
    if (selectedMultiThreads.length === 0) {
        selectedMultiThreads = [...availableThreads];
        showNotification('未选择任何线程，已自动全选');
    }
    renderMultiThreadChart();
    closeThreadSelectorModal();
}

/**
 * 加载多线程规则列表
 */
async function loadMultiRules(projectId) {
    try {
        const response = await fetch(`/api/project/${projectId}`);
        const data = await response.json();
        
        const ruleSelect = document.getElementById('multiRuleSelect');
        if (ruleSelect && data?.rules?.length) {
            ruleSelect.innerHTML = '<option value="">-- 请选择阶段 --</option>' + 
                data.rules.map(rule => `<option value="${rule}">${rule}</option>`).join('');
            
            if (data.rules.length > 0 && !currentMultiRule) {
                const firstRule = data.rules[0];
                ruleSelect.value = firstRule;
                currentMultiRule = firstRule;
                await loadMultiDates(projectId, firstRule);
            }
        }
        
        const searchInput = document.getElementById('multiRuleSearch');
        if (searchInput) {
            searchInput.removeEventListener('input', multiRuleSearchHandler);
            searchInput.addEventListener('input', multiRuleSearchHandler);
        }
    } catch (error) {
        console.error('加载规则失败:', error);
    }
}

/**
 * 多线程规则搜索处理函数（防抖）
 */
let multiRuleSearchHandler = debounce(() => {
    const projectData = projectsData[currentProjectId];
    if (!projectData) return;
    
    const rules = projectData.rules || [];
    const searchText = document.getElementById('multiRuleSearch').value.toLowerCase();
    
    const filteredRules = searchText ? rules.filter(rule => rule.toLowerCase().includes(searchText)) : rules;
    
    const ruleSelect = document.getElementById('multiRuleSelect');
    const currentValue = ruleSelect.value;
    
    ruleSelect.innerHTML = '<option value="">-- 请选择阶段 --</option>';
    filteredRules.forEach(rule => {
        const option = document.createElement('option');
        option.value = rule;
        option.textContent = rule;
        ruleSelect.appendChild(option);
    });
    
    if (currentValue && filteredRules.includes(currentValue)) {
        ruleSelect.value = currentValue;
        currentMultiRule = currentValue;
        loadMultiDates(currentProjectId, currentMultiRule);
    } else if (filteredRules.length > 0 && !currentMultiRule) {
        ruleSelect.value = filteredRules[0];
        currentMultiRule = filteredRules[0];
        loadMultiDates(currentProjectId, currentMultiRule);
    }
}, 300);

/**
 * 加载多线程可用日期
 */
async function loadMultiDates(projectId, ruleName) {
    if (!ruleName) return;
    
    try {
        const response = await fetch(`/api/project/${projectId}`);
        const data = await response.json();
        
        const ruleData = data?.rule_data?.[ruleName];
        if (ruleData?.dates?.length) {
            multiAvailableDates = ruleData.dates;
            currentMultiDate = multiAvailableDates[multiAvailableDates.length - 1];
            const multiCurrentDateSpan = document.getElementById('multiCurrentDate');
            if (multiCurrentDateSpan) {
                multiCurrentDateSpan.innerText = currentMultiDate;
            }
            
            await loadMultiThreadData(projectId, ruleName, currentMultiDate);
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
            availableThreads = result.threads_data.map(d => d.threads.toString()).sort((a, b) => parseInt(a) - parseInt(b));
            
            if (selectedMultiThreads.length === 0) {
                selectedMultiThreads = [...availableThreads];
            } else {
                selectedMultiThreads = selectedMultiThreads.filter(t => availableThreads.includes(t));
                if (selectedMultiThreads.length === 0) {
                    selectedMultiThreads = [...availableThreads];
                }
            }
            
            if (!charts.multiRuntime || !charts.multiMemory) {
                initMultiCharts();
            }
            
            currentMultiThreadData = result.threads_data;
            
            renderMultiThreadChart();
            updateMultiStats(currentMultiThreadData);
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
function renderMultiThreadChart() {
    if (!currentMultiThreadData || currentMultiThreadData.length === 0) {
        return;
    }
    
    const filteredData = currentMultiThreadData.filter(d => selectedMultiThreads.includes(d.threads.toString()));
    
    if (filteredData.length === 0) {
        const chart = currentMultiChartType === 'runtime' ? charts.multiRuntime : charts.multiMemory;
        if (chart) {
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
    const isRuntime = currentMultiChartType === 'runtime';
    const chartData = isRuntime ? filteredData.map(d => d.runtime) : filteredData.map(d => d.memory);
    const yAxisName = isRuntime ? 'Runtime (秒)' : 'Memory (MB)';
    const color = isRuntime ? '#6366f1' : '#10b981';
    const chart = isRuntime ? charts.multiRuntime : charts.multiMemory;
    
    if (!chart) return;
    
    const option = {
        backgroundColor: 'transparent',
        title: { show: false },
        tooltip: { 
            trigger: 'axis', 
            formatter: (params) => {
                if (!params?.length) return '';
                const unit = isRuntime ? '秒' : 'MB';
                let value = params[0].value;
                let displayValue = (value !== null && value !== undefined) ? 
                    (isRuntime ? value.toFixed(2) : (value >= 1024 ? (value / 1024).toFixed(2) + ' GB' : value.toFixed(2))) : 'N/A';
                return `${params[0].axisValue} 线程: ${displayValue} ${unit}`;
            }
        },
        xAxis: { 
            type: 'category', 
            name: '线程数', 
            data: threads,
            axisLabel: { color: '#94a3b8', fontSize: 11, rotate: 0 },
            axisLine: { lineStyle: { color: '#475569' } },
            axisTick: { show: true }
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
        series: [{ 
            type: 'line', 
            name: isRuntime ? 'Runtime' : 'Memory',
            data: chartData,
            smooth: true, 
            lineStyle: { width: 3, color: color },
            symbolSize: 8,
            symbol: 'circle',
            areaStyle: { opacity: 0.1, color: color },
            connectNulls: false,
            itemStyle: { color: color }
        }],
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
    setTimeout(() => chart.resize(), 50);
}

/**
 * 更新多线程统计卡片
 */
function updateMultiStats(threadsData) {
    const runtimes = threadsData.map(d => d.runtime).filter(v => v !== null && v !== undefined);
    const memories = threadsData.map(d => d.memory).filter(v => v !== null && v !== undefined);
    
    const avgRuntime = runtimes.length ? (runtimes.reduce((a, b) => a + b, 0) / runtimes.length).toFixed(1) : '-';
    const avgMemory = memories.length ? (memories.reduce((a, b) => a + b, 0) / memories.length).toFixed(1) : '-';
    const maxRuntime = runtimes.length ? Math.max(...runtimes).toFixed(1) : '-';
    const minRuntime = runtimes.length ? Math.min(...runtimes).toFixed(1) : '-';
    const maxMemory = memories.length ? Math.max(...memories).toFixed(1) : '-';
    const minMemory = memories.length ? Math.min(...memories).toFixed(1) : '-';
    
    const multiStats = document.getElementById('multiStats');
    if (multiStats) {
        multiStats.innerHTML = `
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


// ==================================================
// 数据对比模块
// ==================================================

/**
 * 根据是否选择了case来更新对比页面控件的禁用状态
 */
function updateCompareControlsState(hasCase) {
    const controls = [
        'compareModeSelect',
        'compareRuleSelect',
        'compareDate1',
        'compareDate2',
        'toleranceMode',
        'compareDimensionSelect',
        'toleranceRuntime',
        'toleranceMemory',
        'executeCompareBtn',
        'exportCompareBtn'
    ];
    
    controls.forEach(controlId => {
        const element = document.getElementById(controlId);
        if (element) {
            element.disabled = !hasCase;
        }
    });
    
    const modeSelect = document.getElementById('compareModeSelect');
    if (modeSelect) modeSelect.disabled = !hasCase;
    
    const warningDiv = document.getElementById('compareNoCaseWarning');
    const resultArea = document.getElementById('compareResultArea');
    
    if (warningDiv) {
        warningDiv.style.display = hasCase ? 'none' : 'flex';
    }
    if (resultArea) {
        resultArea.style.display = 'none';
    }
    
    currentCompareResult = null;
    currentFilteredData = [];
    
    const compareSummary = document.getElementById('compareSummary');
    if (compareSummary) {
        compareSummary.innerHTML = '';
    }
    
    const tableBody = document.getElementById('compareTableBody');
    if (tableBody) {
        tableBody.innerHTML = '';
    }
}

/**
 * 加载对比日期列表
 */
async function loadCompareDates(projectId) {
    if (!projectId) {
        updateCompareControlsState(false);
        return;
    }
    
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
            const currentDate1 = date1Select?.value;
            const currentDate2 = date2Select?.value;
            
            if (date1Select) {
                date1Select.innerHTML = '<option value="">请选择日期</option>';
                data.dates.forEach(date => {
                    date1Select.appendChild(new Option(date, date));
                });
                if (currentDate1 && data.dates.includes(currentDate1)) {
                    date1Select.value = currentDate1;
                } else if (data.dates.length > 0) {
                    date1Select.value = data.dates[0];
                }
            }
            
            if (date2Select) {
                date2Select.innerHTML = '<option value="">请选择日期</option>';
                data.dates.forEach(date => {
                    date2Select.appendChild(new Option(date, date));
                });
                if (currentDate2 && data.dates.includes(currentDate2)) {
                    date2Select.value = currentDate2;
                } else if (data.dates.length > 1) {
                    date2Select.value = data.dates[1];
                } else if (data.dates.length > 0) {
                    date2Select.value = data.dates[0];
                }
            }
            
            updateCompareControlsState(true);
        } else {
            updateCompareControlsState(false);
        }
    } catch (error) {
        console.error('加载日期失败:', error);
        updateCompareControlsState(false);
    }
}

/**
 * 加载对比规则列表
 */
async function loadCompareRules(projectId) {
    if (!projectId) {
        updateCompareControlsState(false);
        return;
    }
    
    try {
        const response = await fetch(`/api/project/${projectId}`);
        const data = await response.json();
        
        const ruleSelect = document.getElementById('compareRuleSelect');
        const currentValue = ruleSelect?.value;
        
        if (ruleSelect && data?.rules?.length) {
            ruleSelect.innerHTML = '<option value="all">📊 所有阶段</option>' + 
                data.rules.map(rule => `<option value="${rule}">${rule}</option>`).join('');
            
            if (currentValue && (currentValue === 'all' || data.rules.includes(currentValue))) {
                ruleSelect.value = currentValue;
            } else if (data.rules.length > 0) {
                ruleSelect.value = 'all';
            }
        }
        
        updateCompareControlsState(true);
    } catch (error) {
        console.error('加载规则失败:', error);
        updateCompareControlsState(false);
    }
}

/**
 * 保存对比配置到服务器
 */
async function saveCompareConfig(projectId, config) {
    if (!projectId) return false;
    
    try {
        const response = await fetch('/api/compare_config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                project_id: projectId,
                config: {
                    tolerance_runtime: config.tolerance_runtime,
                    tolerance_memory: config.tolerance_memory
                }
            })
        });
        
        const result = await response.json();
        if (result.success) {
            return true;
        }
    } catch (error) {
        console.error('保存对比配置失败:', error);
    }
    return false;
}

/**
 * 加载对比配置
 */
async function loadCompareConfig(projectId) {
    if (!projectId) return {};
    
    try {
        const url = `/api/compare_config?project_id=${encodeURIComponent(projectId)}`;
        const response = await fetch(url);
        const result = await response.json();
        
        if (result.success && result.config) {
            return result.config;
        }
    } catch (error) {
        console.error('加载对比配置失败:', error);
    }
    return {};
}

/**
 * 应用配置到表单
 */
function applyCompareConfigToForm(config) {
    if (!config || Object.keys(config).length === 0) return false;
    
    let applied = false;
    
    if (config.tolerance_runtime !== undefined && !isNaN(config.tolerance_runtime)) {
        const runtimeInput = document.getElementById('toleranceRuntime');
        if (runtimeInput) {
            runtimeInput.value = config.tolerance_runtime;
            applied = true;
        }
    }
    
    if (config.tolerance_memory !== undefined && !isNaN(config.tolerance_memory)) {
        const memoryInput = document.getElementById('toleranceMemory');
        if (memoryInput) {
            memoryInput.value = config.tolerance_memory;
            applied = true;
        }
    }
    
    return applied;
}

/**
 * 获取当前表单配置
 */
function getCurrentCompareConfig() {
    return {
        tolerance_runtime: parseFloat(document.getElementById('toleranceRuntime').value) || 0,
        tolerance_memory: parseFloat(document.getElementById('toleranceMemory').value) || 0,
        tolerance_mode: document.getElementById('toleranceMode').value,
        compare_dimension: document.getElementById('compareDimensionSelect').value,
        date1: document.getElementById('compareDate1').value,
        date2: document.getElementById('compareDate2').value
    };
}

/**
 * 项目切换时加载配置
 */
async function onCompareProjectChange(projectId) {
    if (!projectId) {
        updateCompareControlsState(false);
        return;
    }
    
    await loadCompareDates(projectId);
    await loadCompareRules(projectId);
    
    const config = await loadCompareConfig(projectId);
    applyCompareConfigToForm(config);
}

/**
 * 构建排序列表
 */
function buildSortedList(rulesComparison, type, isIncrease) {
    if (!rulesComparison || rulesComparison.length === 0) return [];
    
    const list = rulesComparison
        .filter(r => r.has_data && r[`${type}_change_pct`] !== null && r[`${type}_change_pct`] !== undefined)
        .filter(r => isIncrease ? r[`${type}_change_pct`] > 0 : r[`${type}_change_pct`] < 0)
        .map(r => ({
            rule: r.rule_name,
            change_pct: isIncrease ? r[`${type}_change_pct`] : Math.abs(r[`${type}_change_pct`])
        }))
        .sort((a, b) => b.change_pct - a.change_pct);
    
    return list;
}

/**
 * 执行对比
 */
async function executeCompare() {
    const projectId = document.getElementById('compareCaseSelect').value;
    if (!projectId) {
        showNotification('请先选择一个项目', true);
        return;
    }
    
    const compareMode = document.getElementById('compareModeSelect').value;
    let ruleName = document.getElementById('compareRuleSelect').value;
    const date1 = document.getElementById('compareDate1').value;
    const date2 = document.getElementById('compareDate2').value;
    const toleranceRuntime = parseFloat(document.getElementById('toleranceRuntime').value) || 0;
    const toleranceMemory = parseFloat(document.getElementById('toleranceMemory').value) || 0;
    const toleranceMode = document.getElementById('toleranceMode').value;
    const compareDimension = document.getElementById('compareDimensionSelect').value;
    
    if (compareMode === 'all') ruleName = 'all';
    
    if (!date1 || !date2) {
        showNotification('请选择两个日期进行对比', true);
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
                tolerance_mode: toleranceMode,
                compare_dimension: compareDimension,
                save_config: true
            })
        });
        
        const result = await response.json();
        
        if (result.success && result.result) {
            currentCompareResult = result.result;
            displayCompareResult(result.result);
            const compareResultArea = document.getElementById('compareResultArea');
            if (compareResultArea) compareResultArea.style.display = 'block';
            setTimeout(() => initStatsTooltips(), 100);
            await saveCompareConfig(projectId, {
                tolerance_runtime: toleranceRuntime,
                tolerance_memory: toleranceMemory
            });
            showNotification('对比配置已保存');
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
 * 添加表格筛选器
 */
function addTableFilter() {
    const compareResultArea = document.getElementById('compareResultArea');
    if (!compareResultArea) return;
    
    if (document.getElementById('tableFilterInput')) return;
    
    const tableContainer = compareResultArea.querySelector('.table-container');
    if (!tableContainer) return;
    
    const filterBar = document.createElement('div');
    filterBar.className = 'table-filter-bar';
    filterBar.style.cssText = `
        display: flex;
        align-items: center;
        gap: 1rem;
        margin-bottom: 1rem;
        padding: 0.75rem 1rem;
        background: rgba(15, 23, 42, 0.6);
        border-radius: var(--radius-lg);
        flex-wrap: wrap;
    `;
    
    filterBar.innerHTML = `
        <div style="display: flex; align-items: center; gap: 0.5rem;">
            <span>🔍</span>
            <input type="text" id="tableFilterInput" placeholder="筛选阶段名称..." 
                   style="width: 250px; padding: 0.5rem 0.75rem; background: rgba(0,0,0,0.3); border: 1px solid var(--border); border-radius: var(--radius-md); color: var(--text-primary);">
        </div>
        <div style="display: flex; align-items: center; gap: 0.5rem;">
            <span>📊 显示:</span>
            <select id="filterStatusSelect" style="padding: 0.5rem 0.75rem; background: rgba(0,0,0,0.3); border: 1px solid var(--border); border-radius: var(--radius-md); color: var(--text-primary);">
                <option value="all">全部阶段</option>
                <option value="increase">仅显示增加</option>
                <option value="decrease">仅显示减少</option>
                <option value="no_data">仅显示无数据</option>
            </select>
        </div>
        <div style="display: flex; align-items: center; gap: 0.5rem;">
            <span>📈 排序:</span>
            <select id="filterSortSelect" style="padding: 0.5rem 0.75rem; background: rgba(0,0,0,0.3); border: 1px solid var(--border); border-radius: var(--radius-md); color: var(--text-primary);">
                <option value="none">无排序</option>
                <option value="runtime_inc">Runtime 增加最多</option>
                <option value="runtime_dec">Runtime 减少最多</option>
                <option value="memory_inc">Memory 增加最多</option>
                <option value="memory_dec">Memory 减少最多</option>
            </select>
        </div>
        <button id="clearTableFilterBtn" class="btn btn-secondary" style="padding: 0.5rem 1rem;">清除筛选</button>
        <span id="filterResultCount" style="color: var(--text-muted); font-size: 0.75rem;">共 0 条</span>
    `;
    
    tableContainer.parentNode.insertBefore(filterBar, tableContainer);
    
    const filterInput = document.getElementById('tableFilterInput');
    const statusSelect = document.getElementById('filterStatusSelect');
    const sortSelect = document.getElementById('filterSortSelect');
    const clearBtn = document.getElementById('clearTableFilterBtn');
    
    if (filterInput) {
        filterInput.addEventListener('input', debounce(() => {
            currentFilterText = filterInput.value;
            applyTableFilter();
        }, 300));
    }
    
    if (statusSelect) {
        statusSelect.addEventListener('change', () => {
            applyTableFilter();
        });
    }
    
    if (sortSelect) {
        sortSelect.addEventListener('change', () => {
            applyTableFilter();
        });
    }
    
    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            if (filterInput) filterInput.value = '';
            if (statusSelect) statusSelect.value = 'all';
            if (sortSelect) sortSelect.value = 'none';
            currentFilterText = '';
            applyTableFilter();
        });
    }
}

/**
 * 应用表格筛选
 */
function applyTableFilter() {
    if (!currentFilteredData.length) return;
    
    const filterText = currentFilterText.toLowerCase();
    const statusFilter = document.getElementById('filterStatusSelect')?.value || 'all';
    const sortBy = document.getElementById('filterSortSelect')?.value || 'none';
    
    let filtered = [...currentFilteredData];
    
    if (filterText) {
        filtered = filtered.filter(rule => 
            rule.rule_name && rule.rule_name.toLowerCase().includes(filterText)
        );
    }
    
    if (statusFilter !== 'all') {
        filtered = filtered.filter(rule => {
            if (statusFilter === 'increase') {
                return rule.runtime_change_pct > 0;
            } else if (statusFilter === 'decrease') {
                return rule.runtime_change_pct < 0;
            } else if (statusFilter === 'no_data') {
                return !rule.has_data;
            }
            return true;
        });
    }
    
    if (sortBy !== 'none') {
        filtered.sort((a, b) => {
            switch (sortBy) {
                case 'runtime_inc':
                    return (b.runtime_change_pct || -Infinity) - (a.runtime_change_pct || -Infinity);
                case 'runtime_dec':
                    return (a.runtime_change_pct || Infinity) - (b.runtime_change_pct || Infinity);
                case 'memory_inc':
                    return (b.memory_change_pct || -Infinity) - (a.memory_change_pct || -Infinity);
                case 'memory_dec':
                    return (a.memory_change_pct || Infinity) - (b.memory_change_pct || Infinity);
                default:
                    return 0;
            }
        });
    }
    
    renderFilteredTable(filtered);
    
    const countSpan = document.getElementById('filterResultCount');
    if (countSpan) {
        countSpan.textContent = `共 ${filtered.length} 条`;
    }
}

/**
 * 渲染筛选后的表格 - 根据对比维度动态显示列
 */
function renderFilteredTable(filteredData) {
    const tbody = document.getElementById('compareTableBody');
    if (!tbody) return;
    
    // 获取当前对比维度
    const compareDimensionSelect = document.getElementById('compareDimensionSelect');
    const compareDimension = compareDimensionSelect ? compareDimensionSelect.value : 'both';
    const compareRuntime = compareDimension === 'runtime' || compareDimension === 'both';
    const compareMemory = compareDimension === 'memory' || compareDimension === 'both';
    
    tbody.innerHTML = filteredData.map(rule => {
        const statusText = () => {
            if (!rule.has_data) return '无数据';
            // 根据对比维度决定显示哪个状态
            if (compareRuntime && compareMemory) {
                // 两者都显示时，优先显示有变化的
                if (rule.runtime_status === 'increase' || rule.memory_status === 'increase') return '⬆️ 增加';
                if (rule.runtime_status === 'decrease' || rule.memory_status === 'decrease') return '⬇️ 减少';
                return '➖ 不变';
            } else if (compareRuntime) {
                if (rule.runtime_status === 'increase') return '⬆️ 增加';
                if (rule.runtime_status === 'decrease') return '⬇️ 减少';
                return '➖ 不变';
            } else if (compareMemory) {
                if (rule.memory_status === 'increase') return '⬆️ 增加';
                if (rule.memory_status === 'decrease') return '⬇️ 减少';
                return '➖ 不变';
            }
            return '无数据';
        };
        
        // 安全获取数值，处理 null/undefined
        const runtime1 = rule.runtime1 !== null && rule.runtime1 !== undefined ? rule.runtime1.toFixed(2) : 'N/A';
        const runtime2 = rule.runtime2 !== null && rule.runtime2 !== undefined ? rule.runtime2.toFixed(2) : 'N/A';
        const runtimeDiff = rule.runtime_diff !== null && rule.runtime_diff !== undefined ? rule.runtime_diff.toFixed(2) : 'N/A';
        const runtimeChangePct = rule.runtime_change_pct !== null && rule.runtime_change_pct !== undefined ? rule.runtime_change_pct.toFixed(2) + '%' : 'N/A';
        
        const memory1 = rule.memory1 !== null && rule.memory1 !== undefined ? rule.memory1.toFixed(2) : 'N/A';
        const memory2 = rule.memory2 !== null && rule.memory2 !== undefined ? rule.memory2.toFixed(2) : 'N/A';
        const memoryDiff = rule.memory_diff !== null && rule.memory_diff !== undefined ? rule.memory_diff.toFixed(2) : 'N/A';
        const memoryChangePct = rule.memory_change_pct !== null && rule.memory_change_pct !== undefined ? rule.memory_change_pct.toFixed(2) + '%' : 'N/A';
        
        const runtimeClass = () => {
            if (!rule.has_data) return '';
            if (rule.runtime_change_pct > 0) return 'status-increase';
            if (rule.runtime_change_pct < 0) return 'status-decrease';
            return '';
        };
        
        const memoryClass = () => {
            if (!rule.has_data) return '';
            if (rule.memory_change_pct > 0) return 'status-increase';
            if (rule.memory_change_pct < 0) return 'status-decrease';
            return '';
        };
        
        let rowHtml = `<tr>
            <td style="text-align:left; font-weight:500;">${escapeHtml(rule.rule_name)}</td>`;
        
        if (compareRuntime) {
            rowHtml += `
                <td>${runtime1}</td>
                <td>${runtime2}</td>
                <td>${runtimeDiff}</td>
                <td class="${runtimeClass()}">${runtimeChangePct}</td>`;
        }
        
        if (compareMemory) {
            rowHtml += `
                <td>${memory1}</td>
                <td>${memory2}</td>
                <td>${memoryDiff}</td>
                <td class="${memoryClass()}">${memoryChangePct}</td>`;
        }
        
        rowHtml += `<td>${statusText()}</td>
            </tr>`;
        return rowHtml;
    }).join('');
}

function displayCompareResult(result) {
    const isAllRules = result.mode === 'all_rules';
    const compareResultTitle = document.getElementById('compareResultTitle');
    if (compareResultTitle) {
        compareResultTitle.innerHTML = isAllRules ? '📈 全阶段对比结果' : `📈 单阶段对比结果 - ${result.rule_name}`;
    }
    
    const summary = result.summary;
    const compareDimension = result.compare_dimension || 'both';
    const compareRuntime = compareDimension === 'runtime' || compareDimension === 'both';
    const compareMemory = compareDimension === 'memory' || compareDimension === 'both';
    
    const runtimeStatsContainer = document.getElementById('compareRuntimeStats');
    const memoryStatsContainer = document.getElementById('compareMemoryStats');
    const runtimeStatsRow = document.getElementById('compareRuntimeStatsRow');
    const memoryStatsRow = document.getElementById('compareMemoryStatsRow');
    
    if (isAllRules) {
        const runtimeSummary = compareRuntime ? (summary.runtime || {}) : {};
        const memorySummary = compareMemory ? (summary.memory || {}) : {};
        const rulesComparison = result.rules_comparison || [];
        
        currentFilteredData = rulesComparison;
        
        if (compareRuntime && runtimeStatsContainer) {
            runtimeStatsRow.style.display = 'block';
            
            runtimeStatsContainer.innerHTML = `
                <div class="stat-item">
                    <div class="stat-value status-increase">${runtimeSummary.total_increase || 0}</div>
                    <div class="stat-label">Runtime增加阶段</div>
                </div>
                <div class="stat-item">
                    <div class="stat-value status-decrease">${runtimeSummary.total_decrease || 0}</div>
                    <div class="stat-label">Runtime减少阶段</div>
                </div>
                <div class="stat-item">
                    <div class="stat-value">${runtimeSummary.avg_change_pct || 0}%</div>
                    <div class="stat-label">Runtime平均变化率</div>
                </div>
                <div class="stat-item">
                    <div class="stat-value">${runtimeSummary.max_increase_pct ? runtimeSummary.max_increase_pct.toFixed(2) + '%' : '0%'}</div>
                    <div class="stat-label">Runtime最大增加</div>
                </div>
                <div class="stat-item">
                    <div class="stat-value">${runtimeSummary.max_decrease_pct ? Math.abs(runtimeSummary.max_decrease_pct).toFixed(2) + '%' : '0%'}</div>
                    <div class="stat-label">Runtime最大减少</div>
                </div>
            `;
            
            // 为增加和减少卡片添加 tooltip 数据
            const items = runtimeStatsContainer.querySelectorAll('.stat-item');
            const increaseCard = items[0];
            const decreaseCard = items[1];
            
            if (increaseCard && runtimeSummary.increase_list && runtimeSummary.increase_list.length > 0) {
                increaseCard.setAttribute('data-tooltip-html', buildStatsTooltipHtml(runtimeSummary.increase_list, 'Runtime', '增加'));
                increaseCard.style.cursor = 'help';
            } else if (increaseCard) {
                increaseCard.setAttribute('data-tooltip-html', '<div style="padding: 8px 12px;">暂无Runtime增加阶段</div>');
                increaseCard.style.cursor = 'help';
            }
            
            if (decreaseCard && runtimeSummary.decrease_list && runtimeSummary.decrease_list.length > 0) {
                decreaseCard.setAttribute('data-tooltip-html', buildStatsTooltipHtml(runtimeSummary.decrease_list, 'Runtime', '减少'));
                decreaseCard.style.cursor = 'help';
            } else if (decreaseCard) {
                decreaseCard.setAttribute('data-tooltip-html', '<div style="padding: 8px 12px;">暂无Runtime减少阶段</div>');
                decreaseCard.style.cursor = 'help';
            }
        } else if (runtimeStatsRow) {
            runtimeStatsRow.style.display = 'none';
        }
        
        if (compareMemory && memoryStatsContainer) {
            memoryStatsRow.style.display = 'block';
            
            memoryStatsContainer.innerHTML = `
                <div class="stat-item">
                    <div class="stat-value status-increase">${memorySummary.total_increase || 0}</div>
                    <div class="stat-label">Memory增加阶段</div>
                </div>
                <div class="stat-item">
                    <div class="stat-value status-decrease">${memorySummary.total_decrease || 0}</div>
                    <div class="stat-label">Memory减少阶段</div>
                </div>
                <div class="stat-item">
                    <div class="stat-value">${memorySummary.avg_change_pct || 0}%</div>
                    <div class="stat-label">Memory平均变化率</div>
                </div>
                <div class="stat-item">
                    <div class="stat-value">${memorySummary.max_increase_pct ? memorySummary.max_increase_pct.toFixed(2) + '%' : '0%'}</div>
                    <div class="stat-label">Memory最大增加</div>
                </div>
                <div class="stat-item">
                    <div class="stat-value">${memorySummary.max_decrease_pct ? Math.abs(memorySummary.max_decrease_pct).toFixed(2) + '%' : '0%'}</div>
                    <div class="stat-label">Memory最大减少</div>
                </div>
            `;
            
            const items = memoryStatsContainer.querySelectorAll('.stat-item');
            const increaseCard = items[0];
            const decreaseCard = items[1];
            
            if (increaseCard && memorySummary.increase_list && memorySummary.increase_list.length > 0) {
                increaseCard.setAttribute('data-tooltip-html', buildStatsTooltipHtml(memorySummary.increase_list, 'Memory', '增加'));
                increaseCard.style.cursor = 'help';
            } else if (increaseCard) {
                increaseCard.setAttribute('data-tooltip-html', '<div style="padding: 8px 12px;">暂无Memory增加阶段</div>');
                increaseCard.style.cursor = 'help';
            }
            
            if (decreaseCard && memorySummary.decrease_list && memorySummary.decrease_list.length > 0) {
                decreaseCard.setAttribute('data-tooltip-html', buildStatsTooltipHtml(memorySummary.decrease_list, 'Memory', '减少'));
                decreaseCard.style.cursor = 'help';
            } else if (decreaseCard) {
                decreaseCard.setAttribute('data-tooltip-html', '<div style="padding: 8px 12px;">暂无Memory减少阶段</div>');
                decreaseCard.style.cursor = 'help';
            }
        } else if (memoryStatsRow) {
            memoryStatsRow.style.display = 'none';
        }
        
        // 渲染表格表头
        const compareTableHeader = document.getElementById('compareTableHeader');
        if (compareTableHeader) {
            let headerHtml = '<tr>';
            headerHtml += '<th>阶段名称</th>';
            
            if (compareRuntime) {
                headerHtml += '<th>Runtime(基准)</th><th>Runtime(对比)</th><th>Runtime差值</th><th>Runtime变化率(%)</th>';
            }
            
            if (compareMemory) {
                headerHtml += '<th>Memory(基准)</th><th>Memory(对比)</th><th>Memory差值</th><th>Memory变化率(%)</th>';
            }
            
            headerHtml += '<th>状态</th>';
            headerHtml += '</tr>';
            compareTableHeader.innerHTML = headerHtml;
        }
        
        addTableFilter();
        applyTableFilter();
    } else {
        // 单阶段对比模式
        const comparisons = result.comparisons || [];
        
        if (compareRuntime && runtimeStatsContainer) {
            runtimeStatsRow.style.display = 'block';
            runtimeStatsContainer.innerHTML = `
                <div class="stat-item">
                    <div class="stat-value status-increase">${summary.runtime_increased || 0}</div>
                    <div class="stat-label">Runtime增加</div>
                </div>
                <div class="stat-item">
                    <div class="stat-value status-decrease">${summary.runtime_decreased || 0}</div>
                    <div class="stat-label">Runtime减少</div>
                </div>
                <div class="stat-item">
                    <div class="stat-value">${summary.runtime_unchanged || 0}</div>
                    <div class="stat-label">Runtime不变</div>
                </div>
                <div class="stat-item">
                    <div class="stat-value">${summary.runtime_max_change || 0}%</div>
                    <div class="stat-label">Runtime最大变化</div>
                </div>
                <div class="stat-item">
                    <div class="stat-value">${summary.runtime_avg_change || 0}%</div>
                    <div class="stat-label">Runtime平均变化</div>
                </div>
            `;
            
            const items = runtimeStatsContainer.querySelectorAll('.stat-item');
            const increaseCard = items[0];
            const decreaseCard = items[1];
            
            if (increaseCard && summary.runtime_increase_list && summary.runtime_increase_list.length > 0) {
                increaseCard.setAttribute('data-tooltip-html', buildSingleStatsTooltipHtml(summary.runtime_increase_list, 'Runtime', '增加'));
                increaseCard.style.cursor = 'help';
            } else if (increaseCard) {
                increaseCard.setAttribute('data-tooltip-html', '<div style="padding: 8px 12px;">暂无Runtime增加数据点</div>');
                increaseCard.style.cursor = 'help';
            }
            
            if (decreaseCard && summary.runtime_decrease_list && summary.runtime_decrease_list.length > 0) {
                decreaseCard.setAttribute('data-tooltip-html', buildSingleStatsTooltipHtml(summary.runtime_decrease_list, 'Runtime', '减少'));
                decreaseCard.style.cursor = 'help';
            } else if (decreaseCard) {
                decreaseCard.setAttribute('data-tooltip-html', '<div style="padding: 8px 12px;">暂无Runtime减少数据点</div>');
                decreaseCard.style.cursor = 'help';
            }
        } else if (runtimeStatsRow) {
            runtimeStatsRow.style.display = 'none';
        }
        
        if (compareMemory && memoryStatsContainer) {
            memoryStatsRow.style.display = 'block';
            memoryStatsContainer.innerHTML = `
                <div class="stat-item">
                    <div class="stat-value status-increase">${summary.memory_increased || 0}</div>
                    <div class="stat-label">Memory增加</div>
                </div>
                <div class="stat-item">
                    <div class="stat-value status-decrease">${summary.memory_decreased || 0}</div>
                    <div class="stat-label">Memory减少</div>
                </div>
                <div class="stat-item">
                    <div class="stat-value">${summary.memory_unchanged || 0}</div>
                    <div class="stat-label">Memory不变</div>
                </div>
                <div class="stat-item">
                    <div class="stat-value">${summary.memory_max_change || 0}%</div>
                    <div class="stat-label">Memory最大变化</div>
                </div>
                <div class="stat-item">
                    <div class="stat-value">${summary.memory_avg_change || 0}%</div>
                    <div class="stat-label">Memory平均变化</div>
                </div>
            `;
            
            const items = memoryStatsContainer.querySelectorAll('.stat-item');
            const increaseCard = items[0];
            const decreaseCard = items[1];
            
            if (increaseCard && summary.memory_increase_list && summary.memory_increase_list.length > 0) {
                increaseCard.setAttribute('data-tooltip-html', buildSingleStatsTooltipHtml(summary.memory_increase_list, 'Memory', '增加'));
                increaseCard.style.cursor = 'help';
            } else if (increaseCard) {
                increaseCard.setAttribute('data-tooltip-html', '<div style="padding: 8px 12px;">暂无Memory增加数据点</div>');
                increaseCard.style.cursor = 'help';
            }
            
            if (decreaseCard && summary.memory_decrease_list && summary.memory_decrease_list.length > 0) {
                decreaseCard.setAttribute('data-tooltip-html', buildSingleStatsTooltipHtml(summary.memory_decrease_list, 'Memory', '减少'));
                decreaseCard.style.cursor = 'help';
            } else if (decreaseCard) {
                decreaseCard.setAttribute('data-tooltip-html', '<div style="padding: 8px 12px;">暂无Memory减少数据点</div>');
                decreaseCard.style.cursor = 'help';
            }
        } else if (memoryStatsRow) {
            memoryStatsRow.style.display = 'none';
        }
        
        // 渲染表格表头
        const compareTableHeader = document.getElementById('compareTableHeader');
        if (compareTableHeader) {
            let headerHtml = '</table>';
            headerHtml += '<th>序号</th><th>日期</th>';
            
            if (compareRuntime) {
                headerHtml += '<th>Runtime(基准)</th><th>Runtime(对比)</th><th>Runtime差值</th><th>Runtime变化率(%)</th><th>Runtime状态</th>';
            }
            
            if (compareMemory) {
                headerHtml += '<th>Memory(基准)</th><th>Memory(对比)</th><th>Memory差值</th><th>Memory变化率(%)</th><th>Memory状态</th>';
            }
            
            headerHtml += '</tr>';
            compareTableHeader.innerHTML = headerHtml;
        }
        
        const tableBody = document.getElementById('compareTableBody');
        if (tableBody) {
            tableBody.innerHTML = comparisons.map(comp => {
                let rowHtml = `<tr><td>${comp.index + 1}</td><td>${comp.date}</td>`;
                
                if (compareRuntime) {
                    const runtimeStatusClass = comp.runtime_status === 'increase' ? 'status-increase' : 
                                               (comp.runtime_status === 'decrease' ? 'status-decrease' : '');
                    rowHtml += `
                        <td>${comp.runtime1 !== null ? comp.runtime1.toFixed(2) : 'N/A'}</td>
                        <td>${comp.runtime2 !== null ? comp.runtime2.toFixed(2) : 'N/A'}</td>
                        <td>${comp.runtime_diff !== null ? comp.runtime_diff.toFixed(2) : 'N/A'}</td>
                        <td class="${runtimeStatusClass}">${comp.runtime_change_pct !== null ? comp.runtime_change_pct.toFixed(2) + '%' : 'N/A'}</td>
                        <td>${comp.runtime_status || 'N/A'}</td>
                    `;
                }
                if (compareMemory) {
                    const memoryStatusClass = comp.memory_status === 'increase' ? 'status-increase' : 
                                              (comp.memory_status === 'decrease' ? 'status-decrease' : '');
                    rowHtml += `
                        <td>${comp.memory1 !== null ? comp.memory1.toFixed(2) : 'N/A'}</td>
                        <td>${comp.memory2 !== null ? comp.memory2.toFixed(2) : 'N/A'}</td>
                        <td>${comp.memory_diff !== null ? comp.memory_diff.toFixed(2) : 'N/A'}</td>
                        <td class="${memoryStatusClass}">${comp.memory_change_pct !== null ? comp.memory_change_pct.toFixed(2) + '%' : 'N/A'}</td>
                        <td>${comp.memory_status || 'N/A'}</td>
                    `;
                }
                rowHtml += '</tr>';
                return rowHtml;
            }).join('');
        }
    }
    
    // 初始化 tooltips
    setTimeout(() => initStatsTooltips(), 50);
}

/**
 * 构建全阶段对比的tooltip HTML
 */
function buildStatsTooltipHtml(items, metricName, trend) {
    if (!items || items.length === 0) {
        return `<div style="padding: 8px 12px;">暂无${metricName}${trend}阶段</div>`;
    }
    
    const sign = trend === '增加' ? '+' : '';
    const color = trend === '增加' ? '#ef4444' : '#10b981';
    
    let html = `<div style="min-width: 220px; max-width: 300px;">`;
    html += `<div style="font-weight: bold; margin-bottom: 8px; border-bottom: 1px solid #334155; padding-bottom: 6px;">📊 ${metricName}${trend} Top${Math.min(items.length, 10)}</div>`;
    
    items.slice(0, 10).forEach((item, idx) => {
        const name = item.name || item.date || '未知';
        const changePct = item.change_pct;
        html += `<div style="display: flex; justify-content: space-between; gap: 12px; padding: 5px 0; font-size: 0.7rem; border-bottom: 1px solid rgba(51, 65, 85, 0.3);">`;
        html += `<span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 160px;" title="${escapeHtml(name)}">${idx + 1}. ${escapeHtml(name)}</span>`;
        html += `<span style="color: ${color}; font-weight: 500; flex-shrink: 0;">${sign}${changePct}%</span>`;
        html += `</div>`;
    });
    
    if (items.length > 10) {
        html += `<div style="margin-top: 6px; padding-top: 4px; text-align: center; color: #64748b; font-size: 0.65rem;">共 ${items.length} 个阶段</div>`;
    }
    
    html += `</div>`;
    return html;
}

/**
 * 构建单阶段对比的tooltip HTML
 */
function buildSingleStatsTooltipHtml(items, metricName, trend) {
    if (!items || items.length === 0) {
        return `<div style="padding: 8px 12px;">暂无${metricName}${trend}数据点</div>`;
    }
    
    const sign = trend === '增加' ? '+' : '';
    const color = trend === '增加' ? '#ef4444' : '#10b981';
    
    let html = `<div style="min-width: 240px; max-width: 320px;">`;
    html += `<div style="font-weight: bold; margin-bottom: 8px; border-bottom: 1px solid #334155; padding-bottom: 6px;">📊 ${metricName}${trend} Top${Math.min(items.length, 10)}</div>`;
    
    items.slice(0, 10).forEach((item, idx) => {
        const date = item.date || '未知';
        const changePct = item.change_pct;
        const value = item.value;
        html += `<div style="display: flex; justify-content: space-between; gap: 12px; padding: 5px 0; font-size: 0.7rem; border-bottom: 1px solid rgba(51, 65, 85, 0.3);">`;
        html += `<span style="flex: 1;">${idx + 1}. ${escapeHtml(date)}</span>`;
        html += `<span style="color: ${color}; font-weight: 500; min-width: 65px; text-align: right;">${sign}${changePct}%</span>`;
        html += `<span style="color: #94a3b8; min-width: 55px; text-align: right;">(${trend === '增加' ? '+' : ''}${value})</span>`;
        html += `</div>`;
    });
    
    if (items.length > 10) {
        html += `<div style="margin-top: 6px; padding-top: 4px; text-align: center; color: #64748b; font-size: 0.65rem;">共 ${items.length} 个数据点</div>`;
    }
    
    html += `</div>`;
    return html;
}

// 确保 HTML 转义函数可用
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
/**
 * 构建全阶段对比的tooltip HTML
 */
function buildStatsTooltipHtml(items, metricName, trend) {
    if (!items || items.length === 0) {
        return `<div style="padding: 8px 12px;">暂无${metricName}${trend}阶段</div>`;
    }
    
    const sign = trend === '增加' ? '+' : '';
    const color = trend === '增加' ? '#ef4444' : '#10b981';
    
    let html = `<div style="min-width: 220px; max-width: 300px;">`;
    html += `<div style="font-weight: bold; margin-bottom: 8px; border-bottom: 1px solid #334155; padding-bottom: 6px;">📊 ${metricName}${trend} Top${Math.min(items.length, 10)}</div>`;
    
    items.slice(0, 10).forEach((item, idx) => {
        const name = item.name || item.date || '未知';
        const changePct = item.change_pct;
        html += `<div style="display: flex; justify-content: space-between; gap: 12px; padding: 5px 0; font-size: 0.7rem; border-bottom: 1px solid rgba(51, 65, 85, 0.3);">`;
        html += `<span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 160px;" title="${escapeHtml(name)}">${idx + 1}. ${escapeHtml(name)}</span>`;
        html += `<span style="color: ${color}; font-weight: 500; flex-shrink: 0;">${sign}${changePct}%</span>`;
        html += `</div>`;
    });
    
    if (items.length > 10) {
        html += `<div style="margin-top: 6px; padding-top: 4px; text-align: center; color: #64748b; font-size: 0.65rem;">共 ${items.length} 个阶段</div>`;
    }
    
    html += `</div>`;
    return html;
}

/**
 * 构建单阶段对比的tooltip HTML
 */
function buildSingleStatsTooltipHtml(items, metricName, trend) {
    if (!items || items.length === 0) {
        return `<div style="padding: 8px 12px;">暂无${metricName}${trend}数据点</div>`;
    }
    
    const sign = trend === '增加' ? '+' : '';
    const color = trend === '增加' ? '#ef4444' : '#10b981';
    
    let html = `<div style="min-width: 240px; max-width: 320px;">`;
    html += `<div style="font-weight: bold; margin-bottom: 8px; border-bottom: 1px solid #334155; padding-bottom: 6px;">📊 ${metricName}${trend} Top${Math.min(items.length, 10)}</div>`;
    
    items.slice(0, 10).forEach((item, idx) => {
        const date = item.date || '未知';
        const changePct = item.change_pct;
        const value = item.value;
        html += `<div style="display: flex; justify-content: space-between; gap: 12px; padding: 5px 0; font-size: 0.7rem; border-bottom: 1px solid rgba(51, 65, 85, 0.3);">`;
        html += `<span style="flex: 1;">${idx + 1}. ${escapeHtml(date)}</span>`;
        html += `<span style="color: ${color}; font-weight: 500; min-width: 65px; text-align: right;">${sign}${changePct}%</span>`;
        html += `<span style="color: #94a3b8; min-width: 55px; text-align: right;">(${trend === '增加' ? '+' : ''}${value})</span>`;
        html += `</div>`;
    });
    
    if (items.length > 10) {
        html += `<div style="margin-top: 6px; padding-top: 4px; text-align: center; color: #64748b; font-size: 0.65rem;">共 ${items.length} 个数据点</div>`;
    }
    
    html += `</div>`;
    return html;
}

// 确保 HTML 转义函数可用
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
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
// 日期选择模块（时序曲线图）
// ==================================================

let pendingSelectedDates = [];

/**
 * 构建日期选择器
 */
function buildDatePicker(usePending = false) {
    const container = document.getElementById('dateOptionsContainer');
    if (!container) return;
    
    const currentSelection = usePending ? pendingSelectedDates : selectedDates;
    const filterInput = document.getElementById('dateFilterInput');
    const filterText = filterInput?.value || '';
    const filteredDates = availableDates.filter(date => date.toLowerCase().includes(filterText.toLowerCase()));
    
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
                if (!pendingSelectedDates.includes(date)) pendingSelectedDates.push(date);
            } else {
                pendingSelectedDates = pendingSelectedDates.filter(d => d !== date);
            }
        });
    });
}

/**
 * 全选所有日期
 */
function selectAllDates() {
    const container = document.getElementById('dateOptionsContainer');
    if (!container) return;
    
    const checkboxes = container.querySelectorAll('input[type="checkbox"]');
    pendingSelectedDates = [];
    checkboxes.forEach(cb => {
        cb.checked = true;
        pendingSelectedDates.push(cb.value);
    });
}

/**
 * 全不选所有日期
 */
function deselectAllDates() {
    const container = document.getElementById('dateOptionsContainer');
    if (!container) return;
    
    const checkboxes = container.querySelectorAll('input[type="checkbox"]');
    pendingSelectedDates = [];
    checkboxes.forEach(cb => {
        cb.checked = false;
    });
}

/**
 * 反选日期
 */
function inverseSelectDates() {
    const container = document.getElementById('dateOptionsContainer');
    if (!container) return;
    
    const checkboxes = container.querySelectorAll('input[type="checkbox"]');
    pendingSelectedDates = [];
    checkboxes.forEach(cb => {
        cb.checked = !cb.checked;
        if (cb.checked) {
            pendingSelectedDates.push(cb.value);
        }
    });
}

/**
 * 打开日期选择模态框
 */
function openDatePickerModal() {
    pendingSelectedDates = [...selectedDates];
    buildDatePicker(true);
    const modal = document.getElementById('datePickerModal');
    if (modal) modal.classList.remove('hidden');
}

/**
 * 关闭日期选择模态框
 */
function closeDatePickerModal() {
    const modal = document.getElementById('datePickerModal');
    if (modal) modal.classList.add('hidden');
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
// 自定义曲线图模块
// ==================================================

// 自定义曲线图全局变量
// let customProjectsData = {};
// let customCurrentProjectId = null;
// let customCurrentRule = null;
// let customSelectedDates = [];
// let customAvailableDates = [];
// let customCurrentChartType = 'runtime';
// let customCharts = {};
// let customCachedToolData = {};
// let customPendingSelectedDates = [];

/**
 * 获取用户数据（调用后端API）
 */
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
            customProjectsData = result.data;
            
            // const dataInfo = document.getElementById('customDataInfo');
            // if (dataInfo) dataInfo.style.display = 'block';
            
            const projectIds = Object.keys(customProjectsData);
            
            const caseSelect = document.getElementById('customCaseSelect');
            if (caseSelect) {
                caseSelect.innerHTML = '<option value="">-- 请选择项目 --</option>' + 
                    projectIds.map(pid => `<option value="${pid}">${customProjectsData[pid].project_name || pid}</option>`).join('');
                caseSelect.disabled = false;
            }
            
            const projectNameSpan = document.getElementById('customProjectName');
            if (projectNameSpan && projectIds.length > 0) {
                projectNameSpan.textContent = projectIds.join(', ');
            }
            
            const datesSet = new Set();
            const rulesSet = new Set();
            Object.values(customProjectsData).forEach(project => {
                if (project.dates) project.dates.forEach(d => datesSet.add(d));
                if (project.rules) project.rules.forEach(r => rulesSet.add(r));
            });
            
            const availableDatesSpan = document.getElementById('customAvailableDates');
            if (availableDatesSpan) availableDatesSpan.textContent = Array.from(datesSet).sort().slice(0, 5).join(', ') + (datesSet.size > 5 ? '...' : '');
            
            const availableRulesSpan = document.getElementById('customAvailableRules');
            if (availableRulesSpan) availableRulesSpan.textContent = Array.from(rulesSet).slice(0, 5).join(', ') + (rulesSet.size > 5 ? '...' : '');
            
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

/**
 * 获取当前选中的自定义项目数据
 */
function getCurrentCustomProjectData() {
    if (!customCurrentProjectId) return null;
    return customProjectsData[customCurrentProjectId];
}

/**
 * 更新自定义曲线图阶段选择下拉框
 */
function updateCustomRuleSelect() {
    const projectData = getCurrentCustomProjectData();
    if (!projectData) return;
    
    const rules = projectData.rules || [];
    const searchText = document.getElementById('customRuleSearch').value.toLowerCase();
    
    let filteredRules = rules;
    if (searchText) {
        filteredRules = rules.filter(rule => rule.toLowerCase().includes(searchText));
    }
    
    const select = document.getElementById('customRuleSelect');
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
        customCurrentRule = currentValue;
    } else if (filteredRules.length > 0 && !customCurrentRule) {
        select.value = filteredRules[0];
        customCurrentRule = filteredRules[0];
    }
    
    if (customCurrentRule) {
        const currentRuleNameSpan = document.getElementById('customCurrentRuleName');
        if (currentRuleNameSpan) {
            currentRuleNameSpan.innerText = customCurrentRule;
        }
        updateCustomDateSelectionInfo();
        refreshCustomTimelineCharts();
    }
}

/**
 * 获取过滤后的自定义工具数据
 */
function getFilteredCustomToolData(toolData) {
    if (!toolData || !toolData.dates) return null;
    
    const filterSet = new Set(customSelectedDates);
    
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
 * 获取当前选中的自定义工具数据（带缓存）
 */
function getCurrentCustomToolData() {
    if (!customCurrentRule) return null;
    
    if (customCachedToolData[customCurrentRule] && customCachedToolData[customCurrentRule].projectId === customCurrentProjectId) {
        return customCachedToolData[customCurrentRule].data;
    }
    
    const projectData = getCurrentCustomProjectData();
    if (!projectData?.rule_data[customCurrentRule]) return null;
    
    customCachedToolData[customCurrentRule] = {
        projectId: customCurrentProjectId,
        data: projectData.rule_data[customCurrentRule]
    };
    
    return projectData.rule_data[customCurrentRule];
}

/**
 * 更新自定义曲线图日期选择信息
 */
function updateCustomDateSelectionInfo() {
    const projectData = getCurrentCustomProjectData();
    if (!projectData) return;
    
    customAvailableDates = projectData.available_dates || projectData.dates || [];
    
    if (customSelectedDates.length === 0) {
        customSelectedDates = customAvailableDates.slice(-51);
    }
    
    const dateRangeSpan = document.getElementById('customDateRange');
    if (dateRangeSpan) {
        dateRangeSpan.innerText = customSelectedDates.length ? `${customSelectedDates[0]} 至 ${customSelectedDates[customSelectedDates.length - 1]}` : '无';
    }
    const dataPointsSpan = document.getElementById('customDataPoints');
    if (dataPointsSpan) {
        dataPointsSpan.innerText = customSelectedDates.length;
    }
}

/**
 * 更新自定义曲线图图表类型按钮状态
 */
function updateCustomChartTypeButtons() {
    const buttons = document.querySelectorAll('#customChartTypeButtons .chart-type-btn');
    buttons.forEach(btn => {
        const type = btn.dataset.type;
        if (type === customCurrentChartType) {
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
        if (customCurrentChartType === 'runtime') {
            runtimeContainer.classList.remove('hidden');
            memoryContainer.classList.add('hidden');
        } else {
            runtimeContainer.classList.add('hidden');
            memoryContainer.classList.remove('hidden');
        }
    }

    const chartCardTitle = document.getElementById('customChartCardTitle');
    if (chartCardTitle) {
        chartCardTitle.innerText = customCurrentChartType === 'runtime' ? '⏱️ Runtime 性能曲线 - 用户数据' : '💾 Memory 使用曲线 - 用户数据';
    }
    
    if (customCurrentChartType === 'runtime') {
        customCharts.runtime?.resize();
    } else {
        customCharts.memory?.resize();
    }
}

/**
 * 切换自定义曲线图图表类型
 */
function selectCustomChartType(type) {
    if (customCurrentChartType === type) return;
    customCurrentChartType = type;
    updateCustomChartTypeButtons();
    refreshCustomTimelineCharts();
}

/**
 * 渲染自定义曲线图
 */
function renderCustomTimelineChart(chartType, dataKey, color, yAxisName, yAxisFormatter = null) {
    const toolData = getCurrentCustomToolData();
    if (!toolData) {
        if (customCharts[chartType]) customCharts[chartType].clear();
        return;
    }
    
    const filteredData = getFilteredCustomToolData(toolData);
    if (!filteredData || filteredData.dates.length === 0) {
        if (customCharts[chartType]) customCharts[chartType].clear();
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
    const palette = ['#6366f1', '#f59e0b', '#10b981', '#ef4444', '#06b6d4', '#8b5cf6', '#ec4899', '#84cc16'];
    
    const seriesList = threadIds.map((threadId, index) => {
        const threadInfo = threadMetrics[threadId];
        let values = threadInfo?.[dataKey] || [];
        
        const mappedValues = [];
        const originalDates = toolData.dates || [];
        
        dates.forEach(selectedDate => {
            const dateIndex = originalDates.indexOf(selectedDate);
            if (dateIndex !== -1 && values[dateIndex] !== undefined) {
                mappedValues.push(values[dateIndex]);
            } else {
                mappedValues.push(null);
            }
        });
        
        const seriesColor = palette[index % palette.length];
        const threadLabel = threadId === '0' ? '线程0' : `其他线程${threadId}`;
        
        const seriesData = mappedValues.map((value, idx) => {
            return {
                value: value,
                symbol: 'circle',
                symbolSize: 6
            };
        });
        
        return {
            threadId,
            name: threadLabel,
            type: 'line',
            data: seriesData,
            smooth: false,
            lineStyle: { width: 2, color: seriesColor },
            areaStyle: { opacity: 0.08, color: seriesColor },
            connectNulls: false,
            showSymbol: true,
            step: false
        };
    });
    
    // 更新统计
    const allValues = seriesList
        .flatMap(series => series.data.map(item => item.value))
        .filter(v => v !== null && v !== undefined && v > 0);
    
    const unit = dataKey === 'runtimes' ? '秒' : 'MB';
    const label = dataKey === 'runtimes' ? 'Runtime' : 'Memory';
    if (chartType === customCurrentChartType) {
        updateCustomStats(allValues, unit, label);
    }
    
    const avgValue = allValues.length > 0 ? (allValues.reduce((a, b) => a + b, 0) / allValues.length).toFixed(1) : 0;
    
    // 图例默认选中状态（默认只选线程0）
    const legendSelected = {};
    threadIds.forEach(threadId => {
        const seriesName = threadId === '0' ? '线程0' : `其他线程${threadId}`;
        legendSelected[seriesName] = (threadId === '0');
    });
    
    const tooltipFormatter = function(params) {
        if (!params?.length) return '';
        const date = params[0].axisValue;
        const rows = params.map(p => `<div>${p.seriesName}: ${p.value} ${unit}</div>`).join('');
        return `<strong>📅 ${date}</strong>${rows}`;
    };
    
    const option = {
        backgroundColor: 'transparent',
        tooltip: {
            trigger: 'axis',
            backgroundColor: 'rgba(30, 41, 59, 0.95)',
            borderColor: color,
            borderWidth: 1,
            textStyle: { color: '#f1f5f9', fontSize: 12 },
            formatter: tooltipFormatter
        },
        grid: { left: '8%', right: '8%', top: '18%', bottom: '10%', containLabel: true },
        xAxis: {
            type: 'category',
            data: dates,
            axisLabel: { rotate: dates.length > 10 ? 30 : 0, color: '#94a3b8', fontSize: 11 },
            axisLine: { lineStyle: { color: '#475569' } },
            boundaryGap: false
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
    
    if (customCharts[chartType]) {
        customCharts[chartType].setOption(option, { notMerge: false, lazyUpdate: true });
    }
}

/**
 * 刷新自定义曲线图
 */
function refreshCustomTimelineCharts() {
    if (!customCurrentRule) return;
    
    renderCustomTimelineChart('runtime', 'runtimes', '#6366f1', 'Runtime (秒)');
    renderCustomTimelineChart('memory', 'memories', '#10b981', 'Memory (MB)', (value) => {
        if (value >= 1024) return (value / 1024).toFixed(1) + ' GB';
        return value + ' MB';
    });
    updateCustomChartTypeButtons();
}

/**
 * 更新自定义曲线图统计卡片
 */
function updateCustomStats(allValues, unit, label) {
    const container = document.getElementById('customStatsMain');
    if (!container) return;
    
    if (allValues.length === 0) {
        container.innerHTML = '<div class="stat-item"><div class="stat-value">-</div><div class="stat-label">暂无数据</div></div>';
        return;
    }
    
    const total = allValues.reduce((a, b) => a + b, 0);
    const avg = (total / allValues.length).toFixed(1);
    const max = Math.max(...allValues);
    const min = Math.min(...allValues);
    
    container.innerHTML = `
        <div class="stat-item"><div class="stat-value">${total.toFixed(1)}<span style="font-size:0.875rem;">${unit}</span></div><div class="stat-label">总${label}</div></div>
        <div class="stat-item"><div class="stat-value">${avg}<span style="font-size:0.875rem;">${unit}</span></div><div class="stat-label">平均${label}</div></div>
        <div class="stat-item"><div class="stat-value">${max.toFixed(1)}<span style="font-size:0.875rem;">${unit}</span></div><div class="stat-label">最大${label}</div></div>
        <div class="stat-item"><div class="stat-value">${min.toFixed(1)}<span style="font-size:0.875rem;">${unit}</span></div><div class="stat-label">最小${label}</div></div>
    `;
}

/**
 * 构建自定义曲线图日期选择器
 */
function buildCustomDatePicker(usePending = false) {
    const container = document.getElementById('customDateOptionsContainer');
    if (!container) return;
    
    const currentSelection = usePending ? customPendingSelectedDates : customSelectedDates;
    const filterInput = document.getElementById('customDateFilterInput');
    const filterText = filterInput?.value || '';
    const filteredDates = customAvailableDates.filter(date => date.toLowerCase().includes(filterText.toLowerCase()));
    
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
                if (!customPendingSelectedDates.includes(date)) customPendingSelectedDates.push(date);
            } else {
                customPendingSelectedDates = customPendingSelectedDates.filter(d => d !== date);
            }
        });
    });
}

/**
 * 全选自定义曲线图所有日期
 */
function selectAllCustomDates() {
    const container = document.getElementById('customDateOptionsContainer');
    if (!container) return;
    
    const checkboxes = container.querySelectorAll('input[type="checkbox"]');
    customPendingSelectedDates = [];
    checkboxes.forEach(cb => {
        cb.checked = true;
        customPendingSelectedDates.push(cb.value);
    });
}

/**
 * 全不选自定义曲线图所有日期
 */
function deselectAllCustomDates() {
    const container = document.getElementById('customDateOptionsContainer');
    if (!container) return;
    
    const checkboxes = container.querySelectorAll('input[type="checkbox"]');
    customPendingSelectedDates = [];
    checkboxes.forEach(cb => {
        cb.checked = false;
    });
}

/**
 * 反选自定义曲线图日期
 */
function inverseSelectCustomDates() {
    const container = document.getElementById('customDateOptionsContainer');
    if (!container) return;
    
    const checkboxes = container.querySelectorAll('input[type="checkbox"]');
    customPendingSelectedDates = [];
    checkboxes.forEach(cb => {
        cb.checked = !cb.checked;
        if (cb.checked) {
            customPendingSelectedDates.push(cb.value);
        }
    });
}

/**
 * 打开自定义曲线图日期选择模态框
 */
function openCustomDatePickerModal() {
    customPendingSelectedDates = [...customSelectedDates];
    buildCustomDatePicker(true);
    const modal = document.getElementById('customDatePickerModal');
    if (modal) modal.classList.remove('hidden');
}

/**
 * 关闭自定义曲线图日期选择模态框
 */
function closeCustomDatePickerModal() {
    const modal = document.getElementById('customDatePickerModal');
    if (modal) modal.classList.add('hidden');
}

/**
 * 确认自定义曲线图日期选择
 */
function confirmCustomDateSelection() {
    if (customPendingSelectedDates.length === 0) {
        customPendingSelectedDates = customAvailableDates.slice(-51);
    }
    customSelectedDates = [...customPendingSelectedDates];
    updateCustomDateSelectionInfo();
    refreshCustomTimelineCharts();
    closeCustomDatePickerModal();
}

/**
 * 重置自定义曲线图日期选择
 */
function resetCustomDateSelection(useAll = false) {
    customSelectedDates = useAll ? [...customAvailableDates] : customAvailableDates.slice(-51);
    updateCustomDateSelectionInfo();
    refreshCustomTimelineCharts();
}

/**
 * 初始化自定义曲线图图表
 */
function initCustomCharts() {
    const runtimeDom = document.getElementById('custom-chart-runtime');
    const memoryDom = document.getElementById('custom-chart-memory');
    
    if (runtimeDom) {
        customCharts.runtime = echarts.init(runtimeDom);
    }
    if (memoryDom) {
        customCharts.memory = echarts.init(memoryDom);
    }
    
    window.addEventListener('resize', () => {
        Object.values(customCharts).forEach(chart => chart?.resize());
    });
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
            Object.assign(projectsData, result.data);
            mrUpdateDates = buildMrUpdateMap(result.perf);
            currentDataVersion = result.version;
            cachedToolData = {};
            
            if (result.project_list?.length) {
                const caseSelect = document.getElementById('caseSelect');
                const currentVal = caseSelect?.value;
                if (caseSelect) {
                    caseSelect.innerHTML = result.project_list.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
                    if (result.project_list.some(p => p.id === currentVal)) {
                        caseSelect.value = currentVal;
                    }
                }
                
                const multiCaseSelect = document.getElementById('multiCaseSelect');
                if (multiCaseSelect) {
                    multiCaseSelect.innerHTML = result.project_list.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
                    if (result.project_list.some(p => p.id === currentVal)) {
                        multiCaseSelect.value = currentVal;
                    }
                }
                
                const compareCaseSelect = document.getElementById('compareCaseSelect');
                const oldCompareValue = compareCaseSelect?.value;
                if (compareCaseSelect) {
                    compareCaseSelect.innerHTML = '<option value="">-- 请选择case --</option>' + 
                        result.project_list.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
                    
                    if (oldCompareValue && result.project_list.some(p => p.id === oldCompareValue)) {
                        compareCaseSelect.value = oldCompareValue;
                    } else if (result.project_list.length > 0) {
                        compareCaseSelect.value = result.project_list[0].id;
                    }
                    
                    if (compareCaseSelect.value) {
                        await onCompareProjectChange(compareCaseSelect.value);
                    } else {
                        updateCompareControlsState(false);
                    }
                }
            }
            
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
    const containers = document.querySelectorAll('.view-container');
    containers.forEach(view => {
        view.classList.remove('active');
    });
    const targetView = document.getElementById(`${viewId}View`);
    if (targetView) targetView.classList.add('active');
    
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
        item.classList.remove('active');
        if (item.dataset.view === viewId) {
            item.classList.add('active');
        }
    });
    
    if (viewId === 'multithread') {
        setTimeout(() => {
            if (charts.multiRuntime) charts.multiRuntime.resize();
            if (charts.multiMemory) charts.multiMemory.resize();
            if (currentMultiThreadData && currentMultiThreadData.length > 0) {
                if (Array.isArray(currentMultiThreadData) && currentMultiThreadData[0]?.date) {
                    renderMultiThreadComparisonChart();
                } else {
                    renderMultiThreadChart();
                }
            }
        }, 100);
    } else if (viewId === 'timeline') {
        setTimeout(() => {
            if (charts.runtime) charts.runtime.resize();
            if (charts.memory) charts.memory.resize();
        }, 100);
    } else if (viewId === 'custom') {
        setTimeout(() => {
            if (customCharts.runtime) customCharts.runtime.resize();
            if (customCharts.memory) customCharts.memory.resize();
        }, 100);
    }
}


// ==================================================
// 返回主页
// ==================================================

function backToHome() {
    window.location.href = '/';
}


// ==================================================
// 初始化 ECharts
// ==================================================

function initCharts() {
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
    
    initMultiCharts();
    
    window.addEventListener('resize', () => {
        Object.values(charts).forEach(chart => chart?.resize());
    });
    
    observeChartRendering();
    setTimeout(() => {
        addControlButtonsToLegend();
    }, 500);
}


// ==================================================
// 事件绑定
// ==================================================

function bindEvents() {
    // 时序曲线图 - 项目选择
    const caseSelect = document.getElementById('caseSelect');
    if (caseSelect) {
        caseSelect.addEventListener('change', (e) => {
            currentProjectId = e.target.value;
            currentRule = null;
            cachedToolData = {};
            selectedDates = [];
            updateRuleSelect();
            updateProjectStats();
            updateDateSelectionInfo();
        });
    }
    
    // 时序曲线图 - 规则选择
    const ruleSelect = document.getElementById('ruleSelect');
    if (ruleSelect) {
        ruleSelect.addEventListener('change', (e) => {
            currentRule = e.target.value;
            if (currentRule) {
                const currentRuleNameSpan = document.getElementById('currentRuleName');
                if (currentRuleNameSpan) currentRuleNameSpan.innerText = currentRule;
                refreshTimelineCharts();
            }
        });
    }
    
    // 时序曲线图 - 规则搜索
    const ruleSearch = document.getElementById('ruleSearch');
    if (ruleSearch) {
        ruleSearch.addEventListener('input', debounce(() => {
            updateRuleSelect();
        }, 300));
    }
    
    // 时序曲线图 - 图表类型切换
    const chartTypeBtns = document.querySelectorAll('#chartTypeButtons .chart-type-btn');
    chartTypeBtns.forEach(btn => {
        btn.addEventListener('click', () => selectChartType(btn.dataset.type));
    });
    
    // 刷新按钮
    const refreshBtn = document.getElementById('refreshDataBtn');
    if (refreshBtn) refreshBtn.addEventListener('click', refreshAllData);
    
    // 日期选择按钮
    const openDatePickerBtn = document.getElementById('openDatePickerBtn');
    if (openDatePickerBtn) openDatePickerBtn.addEventListener('click', openDatePickerModal);
    
    const closeDateModalBtn = document.getElementById('closeDateModalBtn');
    if (closeDateModalBtn) closeDateModalBtn.addEventListener('click', closeDatePickerModal);
    
    const confirmDateBtn = document.getElementById('confirmDateBtn');
    if (confirmDateBtn) confirmDateBtn.addEventListener('click', confirmDateSelection);
    
    const selectRecentBtn = document.getElementById('selectRecentBtn');
    if (selectRecentBtn) selectRecentBtn.addEventListener('click', () => resetDateSelection(false));
    
    const selectAllDatesBtn = document.getElementById('selectAllDatesBtn');
    if (selectAllDatesBtn) selectAllDatesBtn.addEventListener('click', selectAllDates);
    
    const deselectAllDatesBtn = document.getElementById('deselectAllDatesBtn');
    if (deselectAllDatesBtn) deselectAllDatesBtn.addEventListener('click', deselectAllDates);
    
    const inverseDatesBtn = document.getElementById('inverseDatesBtn');
    if (inverseDatesBtn) inverseDatesBtn.addEventListener('click', inverseSelectDates);
    
    const dateFilterInput = document.getElementById('dateFilterInput');
    if (dateFilterInput) {
        dateFilterInput.addEventListener('input', debounce(() => {
            buildDatePicker(true);
        }, 150));
    }
    
    // 多线程 - 项目选择
    const multiCaseSelect = document.getElementById('multiCaseSelect');
    if (multiCaseSelect) {
        multiCaseSelect.addEventListener('change', async (e) => {
            currentProjectId = e.target.value;
            currentMultiRule = null;
            selectedMultiThreads = [];
            availableThreads = [];
            await loadMultiRules(currentProjectId);
        });
    }
    
    // 多线程 - 规则选择
    const multiRuleSelectEl = document.getElementById('multiRuleSelect');
    if (multiRuleSelectEl) {
        multiRuleSelectEl.addEventListener('change', async (e) => {
            currentMultiRule = e.target.value;
            if (currentMultiRule) {
                await loadMultiDates(currentProjectId, currentMultiRule);
            }
        });
    }
    
    // 多线程 - 日期选择按钮
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
        multiDateFilterInput.addEventListener('input', debounce(() => {
            buildMultiDatePicker(true);
        }, 150));
    }
    
    // 多线程 - 图表类型切换按钮
    const multiChartRuntimeBtn = document.getElementById('multiChartRuntimeBtn');
    if (multiChartRuntimeBtn) {
        multiChartRuntimeBtn.addEventListener('click', () => selectMultiChartType('runtime'));
    }
    const multiChartMemoryBtn = document.getElementById('multiChartMemoryBtn');
    if (multiChartMemoryBtn) {
        multiChartMemoryBtn.addEventListener('click', () => selectMultiChartType('memory'));
    }
    
    // 多线程 - 线程选择按钮
    const openThreadSelectorBtn = document.getElementById('openThreadSelectorBtn');
    if (openThreadSelectorBtn) {
        openThreadSelectorBtn.addEventListener('click', openThreadSelectorModal);
    }
    
    // 线程选择模态框按钮
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
        threadFilterInput.addEventListener('input', debounce(() => {
            buildThreadSelectorModal();
        }, 150));
    }
    
    // 对比 - 项目选择
    const compareCaseSelect = document.getElementById('compareCaseSelect');
    if (compareCaseSelect) {
        compareCaseSelect.addEventListener('change', async (e) => {
            const projId = e.target.value;
            if (projId) {
                await onCompareProjectChange(projId);
            } else {
                updateCompareControlsState(false);
            }
        });
    }
    
    // 对比 - 模式切换
    const compareModeSelect = document.getElementById('compareModeSelect');
    if (compareModeSelect) {
        compareModeSelect.addEventListener('change', async (e) => {
            const ruleGroup = document.getElementById('compareRuleGroup');
            if (ruleGroup) {
                if (e.target.value === 'all') {
                    ruleGroup.style.display = 'none';
                } else {
                    ruleGroup.style.display = 'block';
                }
            }
        });
        if (compareModeSelect.value === 'all') {
            const ruleGroup = document.getElementById('compareRuleGroup');
            if (ruleGroup) ruleGroup.style.display = 'none';
        }
    }
    
    // 对比 - 执行按钮
    const executeCompareBtn = document.getElementById('executeCompareBtn');
    if (executeCompareBtn) executeCompareBtn.addEventListener('click', executeCompare);
    
    // 对比 - 导出按钮
    const exportCompareBtn = document.getElementById('exportCompareBtn');
    if (exportCompareBtn) exportCompareBtn.addEventListener('click', exportCompareResult);
    
    // 自定义曲线图 - 加载用户数据按钮
    const loadCustomDataBtn = document.getElementById('loadCustomDataBtn');
    if (loadCustomDataBtn) {
        loadCustomDataBtn.addEventListener('click', async () => {
            const casePath = document.getElementById('customCasePath').value.trim();
            if (!casePath) {
                showNotification('请输入用户数据路径', true);
                return;
            }
            const data = await fetchUserData(casePath);
            if (data) {
                const caseSelect = document.getElementById('customCaseSelect');
                if (caseSelect && caseSelect.options.length > 0) {
                    customCurrentProjectId = caseSelect.value;
                    updateCustomRuleSelect();
                    updateCustomDateSelectionInfo();
                    updateCustomChartTypeButtons();
                }
            }
        });
    }
    
    // 自定义曲线图 - 项目选择
    const customCaseSelect = document.getElementById('customCaseSelect');
    if (customCaseSelect) {
        customCaseSelect.addEventListener('change', (e) => {
            customCurrentProjectId = e.target.value;
            customCurrentRule = null;
            customCachedToolData = {};
            customSelectedDates = [];
            
            const ruleSelect = document.getElementById('customRuleSelect');
            const ruleSearch = document.getElementById('customRuleSearch');
            const openDatePicker = document.getElementById('customOpenDatePickerBtn');
            const selectRecent = document.getElementById('customSelectRecentBtn');
            
            if (customCurrentProjectId) {
                ruleSelect.disabled = false;
                ruleSearch.disabled = false;
                openDatePicker.disabled = false;
                selectRecent.disabled = false;
                updateCustomRuleSelect();
                updateCustomDateSelectionInfo();
                updateCustomChartTypeButtons();
            } else {
                ruleSelect.disabled = true;
                ruleSearch.disabled = true;
                openDatePicker.disabled = true;
                selectRecent.disabled = true;
            }
        });
    }
    
    // 自定义曲线图 - 规则选择
    const customRuleSelect = document.getElementById('customRuleSelect');
    if (customRuleSelect) {
        customRuleSelect.addEventListener('change', (e) => {
            customCurrentRule = e.target.value;
            if (customCurrentRule) {
                const currentRuleNameSpan = document.getElementById('customCurrentRuleName');
                if (currentRuleNameSpan) currentRuleNameSpan.innerText = customCurrentRule;
                refreshCustomTimelineCharts();
            }
        });
    }
    
    // 自定义曲线图 - 规则搜索
    const customRuleSearch = document.getElementById('customRuleSearch');
    if (customRuleSearch) {
        customRuleSearch.addEventListener('input', debounce(() => {
            updateCustomRuleSelect();
        }, 300));
    }
    
    // 自定义曲线图 - 图表类型切换
    const customChartTypeBtns = document.querySelectorAll('#customChartTypeButtons .chart-type-btn');
    customChartTypeBtns.forEach(btn => {
        btn.addEventListener('click', () => selectCustomChartType(btn.dataset.type));
    });
    
    // 自定义曲线图 - 日期选择按钮
    const customOpenDatePickerBtn = document.getElementById('customOpenDatePickerBtn');
    if (customOpenDatePickerBtn) customOpenDatePickerBtn.addEventListener('click', openCustomDatePickerModal);
    
    const customCloseDateModalBtn = document.getElementById('customCloseDateModalBtn');
    if (customCloseDateModalBtn) customCloseDateModalBtn.addEventListener('click', closeCustomDatePickerModal);
    
    const customConfirmDateBtn = document.getElementById('customConfirmDateBtn');
    if (customConfirmDateBtn) customConfirmDateBtn.addEventListener('click', confirmCustomDateSelection);
    
    const customSelectRecentBtn = document.getElementById('customSelectRecentBtn');
    if (customSelectRecentBtn) customSelectRecentBtn.addEventListener('click', () => resetCustomDateSelection(false));
    
    const customSelectAllDatesBtn = document.getElementById('customSelectAllDatesBtn');
    if (customSelectAllDatesBtn) customSelectAllDatesBtn.addEventListener('click', selectAllCustomDates);
    
    const customDeselectAllDatesBtn = document.getElementById('customDeselectAllDatesBtn');
    if (customDeselectAllDatesBtn) customDeselectAllDatesBtn.addEventListener('click', deselectAllCustomDates);
    
    const customInverseDatesBtn = document.getElementById('customInverseDatesBtn');
    if (customInverseDatesBtn) customInverseDatesBtn.addEventListener('click', inverseSelectCustomDates);
    
    const customDateFilterInput = document.getElementById('customDateFilterInput');
    if (customDateFilterInput) {
        customDateFilterInput.addEventListener('input', debounce(() => {
            buildCustomDatePicker(true);
        }, 150));
    }
    
    // 导航菜单
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
        item.addEventListener('click', () => switchView(item.dataset.view));
    });
    
    // 返回主页按钮
    const backToHomeBtn = document.getElementById('backToHomeBtn');
    if (backToHomeBtn) backToHomeBtn.addEventListener('click', backToHome);
}


// ==================================================
// 页面初始化
// ==================================================

/**
 * 检测是否为浏览器刷新
 */
function isBrowserRefresh() {
    if (performance && performance.getEntriesByType) {
        const navigationEntries = performance.getEntriesByType('navigation');
        if (navigationEntries.length > 0) {
            const nav = navigationEntries[0];
            if (nav.type === 'reload') {
                return true;
            }
        }
    }
    
    if (performance && performance.navigation) {
        if (performance.navigation.type === performance.navigation.TYPE_RELOAD) {
            return true;
        }
    }
    
    const isInitialLoad = sessionStorage.getItem(`page_loaded_${toolId}`);
    if (!isInitialLoad) {
        sessionStorage.setItem(`page_loaded_${toolId}`, 'true');
        return false;
    }
    
    return true;
}

/**
 * 页面加载时自动刷新数据
 */
async function autoRefreshOnLoad() {
    const isRefresh = isBrowserRefresh();
    
    if (isRefresh) {
        console.log('检测到浏览器刷新，正在更新数据...');
        showNotification('检测到页面刷新，正在获取最新数据...');
        
        try {
            const response = await fetch('/api/refresh', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tool: toolId, mode: 'single' })
            });
            
            const result = await response.json();
            
            if (result.success) {
                Object.assign(projectsData, result.data);
                mrUpdateDates = buildMrUpdateMap(result.perf);
                currentDataVersion = result.version;
                cachedToolData = {};
                
                if (result.project_list && result.project_list.length) {
                    const caseSelect = document.getElementById('caseSelect');
                    const currentVal = caseSelect?.value;
                    if (caseSelect) {
                        caseSelect.innerHTML = result.project_list.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
                        if (result.project_list.some(p => p.id === currentVal)) {
                            caseSelect.value = currentVal;
                        }
                    }
                    
                    const multiCaseSelect = document.getElementById('multiCaseSelect');
                    if (multiCaseSelect) {
                        multiCaseSelect.innerHTML = result.project_list.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
                        if (result.project_list.some(p => p.id === currentVal)) {
                            multiCaseSelect.value = currentVal;
                        }
                    }
                    
                    const compareCaseSelect = document.getElementById('compareCaseSelect');
                    if (compareCaseSelect) {
                        const oldValue = compareCaseSelect.value;
                        compareCaseSelect.innerHTML = '<option value="">-- 请选择case --</option>' + 
                            result.project_list.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
                        if (oldValue && result.project_list.some(p => p.id === oldValue)) {
                            compareCaseSelect.value = oldValue;
                        } else if (result.project_list.length > 0) {
                            compareCaseSelect.value = result.project_list[0].id;
                        }
                        if (compareCaseSelect.value) {
                            await onCompareProjectChange(compareCaseSelect.value);
                        } else {
                            updateCompareControlsState(false);
                        }
                    }
                }
                
                updateLastUpdateTime();
                showNotification('数据已更新到最新版本');
            } else {
                console.warn('刷新失败:', result.message);
                showNotification('数据更新失败，使用缓存数据', true);
            }
        } catch (error) {
            console.error('自动刷新失败:', error);
            showNotification('自动刷新失败，使用缓存数据', true);
        }
    } else {
        console.log('正常页面加载，使用服务端数据');
        mrUpdateDates = buildMrUpdateMap(perf);
        const compareSelect = document.getElementById('compareCaseSelect');
        if (compareSelect && compareSelect.options.length > 0) {
            if (compareSelect.value) {
                await onCompareProjectChange(compareSelect.value);
            } else {
                updateCompareControlsState(false);
            }
        } else {
            updateCompareControlsState(false);
        }
    }
}

/**
 * 初始化应用
 */
async function init() {
    initCharts();
    initCustomCharts();
    bindEvents();
    
    await autoRefreshOnLoad();
    
    const caseSelect = document.getElementById('caseSelect');
    if (caseSelect && caseSelect.options.length > 0) {
        currentProjectId = caseSelect.value;
        updateRuleSelect();
        updateProjectStats();
        updateDateSelectionInfo();
        updateChartTypeButtons();
    }
    
    const multiCaseSelect = document.getElementById('multiCaseSelect');
    if (multiCaseSelect && multiCaseSelect.options.length > 0) {
        currentProjectId = multiCaseSelect.value;
        await loadMultiRules(currentProjectId);
    }
    
    const compareSelect = document.getElementById('compareCaseSelect');
    if (compareSelect && compareSelect.options.length > 0) {
        if (!compareSelect.value && compareSelect.options.length > 0) {
            compareSelect.value = compareSelect.options[0]?.value || '';
        }
        if (compareSelect.value) {
            await onCompareProjectChange(compareSelect.value);
        } else {
            updateCompareControlsState(false);
        }
    } else {
        updateCompareControlsState(false);
    }
    
    // 设置自定义曲线图初始状态
    const customRuleSelect = document.getElementById('customRuleSelect');
    const customRuleSearch = document.getElementById('customRuleSearch');
    const customOpenDatePicker = document.getElementById('customOpenDatePickerBtn');
    const customSelectRecent = document.getElementById('customSelectRecentBtn');
    
    if (customRuleSelect) customRuleSelect.disabled = true;
    if (customRuleSearch) customRuleSearch.disabled = true;
    if (customOpenDatePicker) customOpenDatePicker.disabled = true;
    if (customSelectRecent) customSelectRecent.disabled = true;
    
    if (initialMode === 'multi') {
        switchView('multithread');
    } else if (initialMode === 'compare') {
        switchView('compare');
    } else if (initialMode === 'custom') {
        switchView('custom');
    }
    
    // 定期检查数据更新
    setInterval(() => {
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
    updateMultiChartTypeButtons();
}

// 挂载全局函数
window.selectMultiChartType = selectMultiChartType;
window.openThreadSelectorModal = openThreadSelectorModal;
window.closeThreadSelectorModal = closeThreadSelectorModal;
window.confirmThreadSelection = confirmThreadSelection;

// ==================================================
// 自定义 Tooltip 组件（支持HTML内容）
// ==================================================

// 全局 tooltip 实例
let statsTooltip = null;

/**
 * 初始化统计卡片的 tooltip
 */
function initStatsTooltips() {
    // 创建 tooltip 元素
    if (!statsTooltip) {
        statsTooltip = document.createElement('div');
        statsTooltip.id = 'statsTooltip';
        statsTooltip.style.cssText = `
            position: fixed;
            visibility: hidden;
            opacity: 0;
            background: var(--bg-card);
            border: 1px solid var(--primary);
            border-radius: var(--radius-md);
            padding: 0;
            font-size: 0.7rem;
            z-index: 10000;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3), 0 0 0 1px rgba(99, 102, 241, 0.3);
            color: var(--text-primary);
            pointer-events: none;
            backdrop-filter: blur(8px);
            transition: opacity 0.15s ease, visibility 0.15s ease;
            max-width: 350px;
            min-width: 220px;
        `;
        document.body.appendChild(statsTooltip);
    }
    
    // 查找所有统计卡片
    const statItems = document.querySelectorAll('#compareRuntimeStats .stat-item, #compareMemoryStats .stat-item');
    
    statItems.forEach(item => {
        // 移除旧的事件监听器
        item.removeEventListener('mouseenter', handleStatsMouseEnter);
        item.removeEventListener('mouseleave', handleStatsMouseLeave);
        item.removeEventListener('mousemove', handleStatsMouseMove);
        
        // 添加新的事件监听器
        item.addEventListener('mouseenter', handleStatsMouseEnter);
        item.addEventListener('mouseleave', handleStatsMouseLeave);
        item.addEventListener('mousemove', handleStatsMouseMove);
    });
}

/**
 * 统计卡片鼠标进入事件
 */
function handleStatsMouseEnter(e) {
    const item = e.currentTarget;
    const tooltipHtml = item.getAttribute('data-tooltip-html');
    
    if (tooltipHtml && tooltipHtml.trim() !== '') {
        // 设置 tooltip 内容
        statsTooltip.innerHTML = tooltipHtml;
        statsTooltip.style.visibility = 'visible';
        statsTooltip.style.opacity = '1';
        
        // 设置位置
        updateTooltipPosition(e);
    }
}

/**
 * 统计卡片鼠标离开事件
 */
function handleStatsMouseLeave() {
    if (statsTooltip) {
        statsTooltip.style.visibility = 'hidden';
        statsTooltip.style.opacity = '0';
    }
}

/**
 * 统计卡片鼠标移动事件 - 更新 tooltip 位置
 */
function handleStatsMouseMove(e) {
    if (statsTooltip && statsTooltip.style.visibility === 'visible') {
        updateTooltipPosition(e);
    }
}

/**
 * 更新 tooltip 位置
 */
function updateTooltipPosition(e) {
    if (!statsTooltip) return;
    
    const x = e.clientX + 15;
    const y = e.clientY - 10;
    const tooltipRect = statsTooltip.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    
    let left = x;
    let top = y - tooltipRect.height;
    
    // 防止超出右边界
    if (left + tooltipRect.width > viewportWidth - 10) {
        left = viewportWidth - tooltipRect.width - 10;
    }
    
    // 防止超出左边界
    if (left < 10) {
        left = 10;
    }
    
    // 防止超出顶部边界
    if (top < 10) {
        top = y + 20;
    }
    
    // 防止超出底部边界
    if (top + tooltipRect.height > viewportHeight - 10) {
        top = viewportHeight - tooltipRect.height - 10;
    }
    
    statsTooltip.style.left = left + 'px';
    statsTooltip.style.top = top + 'px';
}

/**
 * 构建全阶段对比的tooltip HTML
 * @param {Array} items - 阶段列表
 * @param {string} metricName - 指标名称 ('Runtime' 或 'Memory')
 * @param {string} trend - 趋势 ('增加' 或 '减少')
 * @returns {string} HTML格式的tooltip内容
 */
function buildStatsTooltipHtml(items, metricName, trend) {
    if (!items || items.length === 0) {
        return `<div style="padding: 8px 12px;">暂无${metricName}${trend}阶段</div>`;
    }
    
    const sign = trend === '增加' ? '+' : '';
    const color = trend === '增加' ? '#ef4444' : '#10b981';
    
    let html = `<div style="min-width: 220px; max-width: 320px;">`;
    html += `<div style="font-weight: bold; margin-bottom: 8px; border-bottom: 1px solid #334155; padding: 8px 12px 6px 12px; background: rgba(99, 102, 241, 0.1); border-radius: var(--radius-md) var(--radius-md) 0 0;">📊 ${metricName}${trend} Top${Math.min(items.length, 10)}</div>`;
    html += `<div style="max-height: 300px; overflow-y: auto; padding: 4px 8px;">`;
    
    items.slice(0, 10).forEach((item, idx) => {
        const name = item.name || item.date || '未知';
        const changePct = item.change_pct;
        html += `<div style="display: flex; justify-content: space-between; gap: 12px; padding: 6px 0; font-size: 0.7rem; border-bottom: 1px solid rgba(51, 65, 85, 0.3);">`;
        html += `<span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 160px;" title="${escapeHtml(name)}">${idx + 1}. ${escapeHtml(name)}</span>`;
        html += `<span style="color: ${color}; font-weight: 500; flex-shrink: 0;">${sign}${changePct}%</span>`;
        html += `</div>`;
    });
    
    if (items.length > 10) {
        html += `<div style="margin-top: 6px; padding: 6px 0; text-align: center; color: #64748b; font-size: 0.65rem;">共 ${items.length} 个阶段</div>`;
    }
    
    html += `</div></div>`;
    return html;
}

/**
 * 构建单阶段对比的tooltip HTML
 * @param {Array} items - 日期列表
 * @param {string} metricName - 指标名称 ('Runtime' 或 'Memory')
 * @param {string} trend - 趋势 ('增加' 或 '减少')
 * @returns {string} HTML格式的tooltip内容
 */
function buildSingleStatsTooltipHtml(items, metricName, trend) {
    if (!items || items.length === 0) {
        return `<div style="padding: 8px 12px;">暂无${metricName}${trend}数据点</div>`;
    }
    
    const sign = trend === '增加' ? '+' : '';
    const color = trend === '增加' ? '#ef4444' : '#10b981';
    
    let html = `<div style="min-width: 240px; max-width: 320px;">`;
    html += `<div style="font-weight: bold; margin-bottom: 8px; border-bottom: 1px solid #334155; padding: 8px 12px 6px 12px; background: rgba(99, 102, 241, 0.1); border-radius: var(--radius-md) var(--radius-md) 0 0;">📊 ${metricName}${trend} Top${Math.min(items.length, 10)}</div>`;
    html += `<div style="max-height: 300px; overflow-y: auto; padding: 4px 8px;">`;
    
    items.slice(0, 10).forEach((item, idx) => {
        const date = item.date || '未知';
        const changePct = item.change_pct;
        const value = item.value;
        html += `<div style="display: flex; justify-content: space-between; gap: 12px; padding: 6px 0; font-size: 0.7rem; border-bottom: 1px solid rgba(51, 65, 85, 0.3);">`;
        html += `<span style="flex: 1;">${idx + 1}. ${escapeHtml(date)}</span>`;
        html += `<span style="color: ${color}; font-weight: 500; min-width: 65px; text-align: right;">${sign}${changePct}%</span>`;
        html += `<span style="color: #94a3b8; min-width: 55px; text-align: right;">(${trend === '增加' ? '+' : ''}${value})</span>`;
        html += `</div>`;
    });
    
    if (items.length > 10) {
        html += `<div style="margin-top: 6px; padding: 6px 0; text-align: center; color: #64748b; font-size: 0.65rem;">共 ${items.length} 个数据点</div>`;
    }
    
    html += `</div></div>`;
    return html;
}

// 启动应用
init();


