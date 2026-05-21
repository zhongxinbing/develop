/**
 * EDA 性能监控系统 - 工具页面主脚本
 * 支持时序曲线图、多线程对比、数据对比三大功能
 * 使用 ECharts 进行数据可视化
 * 
 * 功能模块：
 * 1. 时序曲线图 (Timeline) - 展示单线程性能趋势
 * 2. 多线程对比 (Multi-thread) - 对比不同线程的性能
 * 3. 数据对比 (Compare) - 对比不同日期的性能数据
 */

// ==================================================
// 工具函数模块
// ==================================================

/**
 * 防抖函数 - 限制函数调用频率
 * @param {Function} func - 要执行的函数
 * @param {number} wait - 等待时间（毫秒）
 * @returns {Function} 防抖后的函数
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
 * @param {string} message - 消息内容
 * @param {boolean} isError - 是否为错误消息
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
        font-size: 14px;
        font-weight: 500;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    `;
    document.body.appendChild(notification);
    setTimeout(() => notification.remove(), 3000);
}

/**
 * 显示/隐藏加载状态
 * @param {boolean} show - 是否显示加载状态
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
 * @param {Object} perfData - 性能数据
 * @returns {Object} 日期到MR评论的映射
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
 * 格式化工具提示HTML
 * @param {Array} items - 数据项列表
 * @param {string} title - 标题
 * @returns {string} HTML字符串
 */
function formatTooltipListHtml(items, title) {
    if (!items || items.length === 0) return title;
    const top10 = items.slice(0, 10);
    const itemsHtml = top10.map((item, i) => {
        const changeColor = item.change_pct > 0 ? '#ef4444' : '#10b981';
        const arrow = item.change_pct > 0 ? '⬆️' : '⬇️';
        return `<div style="display: flex; justify-content: space-between; gap: 20px; padding: 4px 0;">
                    <span style="color: #94a3b8;">${i+1}. ${item.rule}</span>
                    <span style="color: ${changeColor}; font-weight: 600;">${arrow} ${Math.abs(item.change_pct).toFixed(2)}%</span>
                </div>`;
    }).join('');
    
    return `<div style="min-width: 280px;">
                <div style="font-weight: 600; margin-bottom: 8px; padding-bottom: 6px; border-bottom: 1px solid #334155;">📊 ${title}</div>
                ${itemsHtml}
                ${items.length > 10 ? `<div style="margin-top: 6px; padding-top: 4px; border-top: 1px solid #334155; color: #64748b; font-size: 11px;">... 共 ${items.length} 项，仅显示前10</div>` : ''}
            </div>`;
}

/**
 * 为统计卡片添加工具提示
 * @param {HTMLElement} element - 目标元素
 * @param {string} tooltipHtml - 工具提示HTML
 */
function addStatCardTooltip(element, tooltipHtml) {
    if (!element) return;
    
    element.removeEventListener('mouseenter', element._tooltipHandler);
    element.removeEventListener('mouseleave', element._tooltipHandlerLeave);
    
    let tooltipEl = null;
    
    const showTooltip = (e) => {
        tooltipEl = document.createElement('div');
        tooltipEl.className = 'stat-card-tooltip';
        tooltipEl.innerHTML = tooltipHtml;
        tooltipEl.style.cssText = `
            position: fixed;
            background: #1e293b;
            border: 1px solid #6366f1;
            border-radius: 8px;
            padding: 10px 14px;
            font-size: 12px;
            color: #f1f5f9;
            z-index: 10000;
            box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.5), 0 0 20px rgba(99, 102, 241, 0.3);
            backdrop-filter: blur(4px);
            max-width: 350px;
            pointer-events: none;
            font-family: monospace;
            line-height: 1.5;
        `;
        document.body.appendChild(tooltipEl);
        
        const rect = element.getBoundingClientRect();
        let left = rect.right + 10;
        let top = rect.top;
        
        if (left + 350 > window.innerWidth) {
            left = rect.left - 360;
        }
        if (top + 300 > window.innerHeight) {
            top = window.innerHeight - 310;
        }
        if (top < 0) top = 10;
        
        tooltipEl.style.left = left + 'px';
        tooltipEl.style.top = top + 'px';
        tooltipEl.style.animation = 'tooltipFadeIn 0.15s ease-out';
    };
    
    const hideTooltip = () => {
        if (tooltipEl) {
            tooltipEl.remove();
            tooltipEl = null;
        }
    };
    
    element._tooltipHandler = showTooltip;
    element._tooltipHandlerLeave = hideTooltip;
    
    element.addEventListener('mouseenter', showTooltip);
    element.addEventListener('mouseleave', hideTooltip);
}

// 添加工具提示动画样式
const tooltipStyle = document.createElement('style');
tooltipStyle.textContent = `
    @keyframes tooltipFadeIn {
        from {
            opacity: 0;
            transform: translateY(-5px);
        }
        to {
            opacity: 1;
            transform: translateY(0);
        }
    }
`;
document.head.appendChild(tooltipStyle);


// ==================================================
// 时序曲线图模块
// ==================================================

/**
 * 获取当前选中的项目数据
 * @returns {Object} 项目数据
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
    
    const summaryEl = document.getElementById('selectedDateSummary');
    if (summaryEl) {
        summaryEl.innerText = selectedDates.length === availableDates.length ? '全部可用日期' : `${selectedDates.length} 条已选`;
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
 * @param {string} type - 图表类型 ('runtime' 或 'memory')
 */
function selectChartType(type) {
    currentChartType = type;
    updateChartTypeButtons();
    refreshTimelineCharts();
}

/**
 * 获取过滤后的工具数据（根据选中的日期）
 * @param {Object} toolData - 工具数据
 * @returns {Object} 过滤后的数据
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
 * @returns {Object} 工具数据
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
 * @param {string} date - 日期
 * @returns {boolean}
 */
function hasMrUpdate(date) {
    const comment = mrUpdateDates[date];
    return comment && comment !== 'undefined' && comment !== '' && comment !== 'None';
}

/**
 * 获取MR更新评论
 * @param {string} date - 日期
 * @returns {string}
 */
function getMrComment(date) {
    return mrUpdateDates[date] || '';
}

/**
 * 更新统计卡片
 * @param {string} containerId - 容器ID
 * @param {Array} data - 数据数组
 * @param {string} unit - 单位
 * @param {string} label - 标签
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
 * @param {Object} params - ECharts事件参数
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
 * @param {string} chartType - 图表类型 ('runtime' 或 'memory')
 * @param {string} dataKey - 数据键名 ('runtimes' 或 'memories')
 * @param {string} color - 主题色
 * @param {string} yAxisName - Y轴名称
 * @param {Function} yAxisFormatter - Y轴格式化函数
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
        const threadLabel = threadId === '0' ? 'e线程0' : `其他线程${threadId}`;
        
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
        const seriesName = threadId === '0' ? 'e线程0' : `其他线程${threadId}`;
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
 * @param {boolean} usePending - 是否使用待确认的日期
 */
function buildMultiDatePicker(usePending = false) {
    const container = document.getElementById('multiDateOptionsContainer');
    if (!container) return;
    
    const currentSelection = usePending ? pendingMultiSelectedDates : [currentMultiDate];
    const filterInput = document.getElementById('multiDateFilterInput');
    const filterText = filterInput?.value || '';
    const filteredDates = multiAvailableDates.filter(date => date.toLowerCase().includes(filterText.toLowerCase()));
    
    container.innerHTML = filteredDates.map(date => `
        <label class="date-option">
            <input type="radio" name="multiDate" value="${date}" ${currentSelection.includes(date) ? 'checked' : ''}>
            <span>${date}</span>
        </label>
    `).join('');
    
    container.querySelectorAll('input[type="radio"]').forEach(cb => {
        cb.addEventListener('change', (e) => {
            pendingMultiSelectedDates = [e.target.value];
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
    
    const newDate = pendingMultiSelectedDates[0];
    if (newDate !== currentMultiDate) {
        currentMultiDate = newDate;
        const multiCurrentDateSpan = document.getElementById('multiCurrentDate');
        if (multiCurrentDateSpan) {
            multiCurrentDateSpan.innerText = currentMultiDate;
        }
        await loadMultiThreadData(currentProjectId, currentMultiRule, currentMultiDate);
    }
    closeMultiDatePickerModal();
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
            renderMultiThreadChart();
        }, 50);
    }
}

/**
 * 切换多线程图表类型
 * @param {string} type - 图表类型
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
    
    const selectAllBtn = document.createElement('button');
    selectAllBtn.textContent = '☑ 全选';
    selectAllBtn.className = 'btn btn-secondary';
    selectAllBtn.style.cssText = 'padding: 0.5rem 1rem; margin-right: 0.75rem;';
    selectAllBtn.onclick = () => {
        const checkboxes = container.querySelectorAll('.thread-checkbox input');
        checkboxes.forEach(cb => {
            cb.checked = true;
            const label = cb.closest('.thread-checkbox');
            if (label) label.classList.add('selected');
        });
        updateSelectedThreadsFromModal();
    };
    
    const inverseBtn = document.createElement('button');
    inverseBtn.textContent = '🔄 反选';
    inverseBtn.className = 'btn btn-secondary';
    inverseBtn.style.cssText = 'padding: 0.5rem 1rem;';
    inverseBtn.onclick = () => {
        const checkboxes = container.querySelectorAll('.thread-checkbox input');
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
    };
    
    container.innerHTML = '';
    
    const buttonBar = document.createElement('div');
    buttonBar.style.cssText = 'display: flex; gap: 0.5rem; margin-bottom: 1rem; padding-bottom: 0.75rem; border-bottom: 1px solid var(--border);';
    buttonBar.appendChild(selectAllBtn);
    buttonBar.appendChild(inverseBtn);
    container.appendChild(buttonBar);
    
    const checkboxGroup = document.createElement('div');
    checkboxGroup.className = 'thread-checkbox-group';
    checkboxGroup.style.cssText = 'max-height: 300px; overflow-y: auto;';
    
    checkboxGroup.innerHTML = availableThreads.map(threadId => {
        const isChecked = selectedMultiThreads.includes(threadId);
        const displayName = threadId === '0' ? 'e线程0' : `线程 ${threadId}`;
        return `
            <label class="thread-checkbox ${isChecked ? 'selected' : ''}" data-thread="${threadId}">
                <input type="checkbox" value="${threadId}" ${isChecked ? 'checked' : ''}>
                <span>${displayName}</span>
            </label>
        `;
    }).join('');
    
    checkboxGroup.querySelectorAll('.thread-checkbox input').forEach(cb => {
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
            updateSelectedThreadsFromModal();
        });
    });
    
    container.appendChild(checkboxGroup);
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
 * @param {string} projectId - 项目ID
 * @param {string} ruleName - 规则名称
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
 * @param {string} projectId - 项目ID
 * @param {string} ruleName - 规则名称
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
        console.log('请求多线程数据:', { projectId, ruleName, date });
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
    
    if (!chart) {
        initMultiCharts();
        const newChart = isRuntime ? charts.multiRuntime : charts.multiMemory;
        if (!newChart) return;
    }
    
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
 * @param {Array} threadsData - 线程数据
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
 * 加载对比日期列表
 * @param {string} projectId - 项目ID
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
            const currentDate1 = date1Select?.value;
            const currentDate2 = date2Select?.value;
            
            if (date1Select) {
                date1Select.innerHTML = '<option value="">请选择日期</option>';
                data.dates.forEach(date => {
                    date1Select.appendChild(new Option(date, date));
                });
                if (currentDate1 && data.dates.includes(currentDate1)) {
                    date1Select.value = currentDate1;
                }
            }
            
            if (date2Select) {
                date2Select.innerHTML = '<option value="">请选择日期</option>';
                data.dates.forEach(date => {
                    date2Select.appendChild(new Option(date, date));
                });
                if (currentDate2 && data.dates.includes(currentDate2)) {
                    date2Select.value = currentDate2;
                }
            }
        }
    } catch (error) {
        console.error('加载日期失败:', error);
    }
}

/**
 * 加载对比规则列表
 * @param {string} projectId - 项目ID
 */
async function loadCompareRules(projectId) {
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
            }
        }
    } catch (error) {
        console.error('加载规则失败:', error);
    }
}

/**
 * 保存对比配置到服务器
 * @param {string} projectId - 项目ID
 * @param {Object} config - 配置对象
 * @returns {Promise<boolean>}
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
 * @param {string} projectId - 项目ID
 * @returns {Promise<Object>}
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
 * @param {Object} config - 配置对象
 * @returns {boolean}
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
 * @param {string} projectId - 项目ID
 */
async function onCompareProjectChange(projectId) {
    if (!projectId) return;
    
    await loadCompareDates(projectId);
    await loadCompareRules(projectId);
    
    const config = await loadCompareConfig(projectId);
    applyCompareConfigToForm(config);
}

/**
 * 构建排序列表
 * @param {Array} rulesComparison - 规则对比数据
 * @param {string} type - 类型 ('runtime' 或 'memory')
 * @param {boolean} isIncrease - 是否增加
 * @returns {Array}
 */
function buildSortedList(rulesComparison, type, isIncrease) {
    if (!rulesComparison || rulesComparison.length === 0) return [];
    
    const list = rulesComparison
        .filter(r => r.has_data && r[`${type}_change_pct`] !== null)
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
    const compareMode = document.getElementById('compareModeSelect').value;
    let ruleName = document.getElementById('compareRuleSelect').value;
    const date1 = document.getElementById('compareDate1').value;
    const date2 = document.getElementById('compareDate2').value;
    const toleranceRuntime = parseFloat(document.getElementById('toleranceRuntime').value) || 0;
    const toleranceMemory = parseFloat(document.getElementById('toleranceMemory').value) || 0;
    const toleranceMode = document.getElementById('toleranceMode').value;
    const compareDimension = document.getElementById('compareDimensionSelect').value;
    
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
 * 渲染筛选后的表格
 * @param {Array} filteredData - 筛选后的数据
 */
function renderFilteredTable(filteredData) {
    const tbody = document.getElementById('compareTableBody');
    if (!tbody) return;
    
    tbody.innerHTML = filteredData.map(rule => {
        const statusText = () => {
            if (!rule.has_data) return '无数据';
            if (rule.runtime_status === 'increase') return '⬆️ 增加';
            if (rule.runtime_status === 'decrease') return '⬇️ 减少';
            return '➖ 不变';
        };
        return `
            <tr>
                <td style="text-align:left; font-weight:500;">${rule.rule_name}</td>
                <td>${rule.runtime1 !== null ? rule.runtime1.toFixed(2) : 'N/A'}</td>
                <td>${rule.runtime2 !== null ? rule.runtime2.toFixed(2) : 'N/A'}</td>
                <td>${rule.runtime_diff !== null ? rule.runtime_diff.toFixed(2) : 'N/A'}</td>
                <td class="${rule.runtime_change_pct > 0 ? 'status-increase' : (rule.runtime_change_pct < 0 ? 'status-decrease' : '')}">${rule.runtime_change_pct !== null ? rule.runtime_change_pct.toFixed(2) + '%' : 'N/A'}</td>
                <td>${rule.memory1 !== null ? rule.memory1.toFixed(2) : 'N/A'}</td>
                <td>${rule.memory2 !== null ? rule.memory2.toFixed(2) : 'N/A'}</td>
                <td>${rule.memory_diff !== null ? rule.memory_diff.toFixed(2) : 'N/A'}</td>
                <td class="${rule.memory_change_pct > 0 ? 'status-increase' : (rule.memory_change_pct < 0 ? 'status-decrease' : '')}">${rule.memory_change_pct !== null ? rule.memory_change_pct.toFixed(2) + '%' : 'N/A'}</td>
                <td>${statusText()}</td>
            </tr>
        `;
    }).join('');
}

/**
 * 显示对比结果
 * @param {Object} result - 对比结果
 */
function displayCompareResult(result) {
    const isAllRules = result.mode === 'all_rules';
    const compareResultTitle = document.getElementById('compareResultTitle');
    if (compareResultTitle) {
        compareResultTitle.innerHTML = isAllRules ? '📈 全阶段对比结果' : `📈 单阶段对比结果 - ${result.rule_name}`;
    }
    
    const summary = result.summary;
    
    if (isAllRules) {
        const runtimeSummary = summary.runtime || {};
        const memorySummary = summary.memory || {};
        const rulesComparison = result.rules_comparison || [];
        
        currentFilteredData = rulesComparison;
        
        const runtimeIncreaseList = buildSortedList(rulesComparison, 'runtime', true);
        const runtimeDecreaseList = buildSortedList(rulesComparison, 'runtime', false);
        const memoryIncreaseList = buildSortedList(rulesComparison, 'memory', true);
        const memoryDecreaseList = buildSortedList(rulesComparison, 'memory', false);
        
        const compareSummary = document.getElementById('compareSummary');
        if (compareSummary) {
            compareSummary.innerHTML = `
                <div class="stat-item" id="statRuntimeIncrease">
                    <div class="stat-value status-increase">${runtimeSummary.total_increase || 0}</div>
                    <div class="stat-label">Runtime增加阶段</div>
                </div>
                <div class="stat-item" id="statRuntimeDecrease">
                    <div class="stat-value status-decrease">${runtimeSummary.total_decrease || 0}</div>
                    <div class="stat-label">Runtime减少阶段</div>
                </div>
                <div class="stat-item" id="statMemoryIncrease">
                    <div class="stat-value status-increase">${memorySummary.total_increase || 0}</div>
                    <div class="stat-label">Memory增加阶段</div>
                </div>
                <div class="stat-item" id="statMemoryDecrease">
                    <div class="stat-value status-decrease">${memorySummary.total_decrease || 0}</div>
                    <div class="stat-label">Memory减少阶段</div>
                </div>
                <div class="stat-item" id="statRuntimeAvg">
                    <div class="stat-value">${runtimeSummary.avg_change_pct || 0}%</div>
                    <div class="stat-label">Runtime平均变化率</div>
                </div>
                <div class="stat-item" id="statMemoryAvg">
                    <div class="stat-value">${memorySummary.avg_change_pct || 0}%</div>
                    <div class="stat-label">Memory平均变化率</div>
                </div>
                <div class="stat-item" id="statRuntimeMaxInc">
                    <div class="stat-value">${runtimeSummary.max_increase_pct.toFixed(2) || 0}%</div>
                    <div class="stat-label">Runtime最大增加</div>
                </div>
                <div class="stat-item" id="statRuntimeMaxDec">
                    <div class="stat-value">${runtimeSummary.max_decrease_pct.toFixed(2) || 0}%</div>
                    <div class="stat-label">Runtime最大减少</div>
                </div>
                <div class="stat-item" id="statMemoryMaxInc">
                    <div class="stat-value">${memorySummary.max_increase_pct.toFixed(2) || 0}%</div>
                    <div class="stat-label">Memory最大增加</div>
                </div>
                <div class="stat-item" id="statMemoryMaxDec">
                    <div class="stat-value">${memorySummary.max_decrease_pct.toFixed(2) || 0}%</div>
                    <div class="stat-label">Memory最大减少</div>
                </div>
            `;
        }
        
        addStatCardTooltip(document.getElementById('statRuntimeIncrease'), formatTooltipListHtml(runtimeIncreaseList, 'Runtime 增加排行'));
        addStatCardTooltip(document.getElementById('statRuntimeDecrease'), formatTooltipListHtml(runtimeDecreaseList, 'Runtime 减少排行'));
        addStatCardTooltip(document.getElementById('statMemoryIncrease'), formatTooltipListHtml(memoryIncreaseList, 'Memory 增加排行'));
        addStatCardTooltip(document.getElementById('statMemoryDecrease'), formatTooltipListHtml(memoryDecreaseList, 'Memory 减少排行'));
        
        const compareTableHeader = document.getElementById('compareTableHeader');
        if (compareTableHeader) {
            compareTableHeader.innerHTML = `
                <tr>
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
                </tr>
            `;
        }
        
        addTableFilter();
        applyTableFilter();
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
// 日期选择模块（时序曲线图）
// ==================================================

let pendingSelectedDates = [];

/**
 * 构建日期选择器
 * @param {boolean} usePending - 是否使用待确认的日期
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
 * @param {boolean} useAll - 是否选择全部
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
 * @param {string} viewId - 视图ID
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
            renderMultiThreadChart();
        }, 100);
    } else if (viewId === 'timeline') {
        setTimeout(() => {
            if (charts.runtime) charts.runtime.resize();
            if (charts.memory) charts.memory.resize();
        }, 100);
    }
}


// ==================================================
// 返回主页
// ==================================================

/**
 * 返回主页
 */
function backToHome() {
    window.location.href = '/';
}


// ==================================================
// 初始化 ECharts
// ==================================================

/**
 * 初始化所有图表
 */
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

/**
 * 绑定所有事件
 */
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
    if (selectAllDatesBtn) selectAllDatesBtn.addEventListener('click', () => resetDateSelection(true));
    
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
    
    // 对比 - 项目选择
    const compareCaseSelect = document.getElementById('compareCaseSelect');
    if (compareCaseSelect) {
        compareCaseSelect.addEventListener('change', async (e) => {
            const projId = e.target.value;
            if (projId) {
                await onCompareProjectChange(projId);
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
    }
    
    // 对比 - 执行按钮
    const executeCompareBtn = document.getElementById('executeCompareBtn');
    if (executeCompareBtn) executeCompareBtn.addEventListener('click', executeCompare);
    
    // 对比 - 导出按钮
    const exportCompareBtn = document.getElementById('exportCompareBtn');
    if (exportCompareBtn) exportCompareBtn.addEventListener('click', exportCompareResult);
    
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
// 挂载全局函数
// ==================================================

window.selectMultiChartType = selectMultiChartType;
window.openThreadSelectorModal = openThreadSelectorModal;
window.closeThreadSelectorModal = closeThreadSelectorModal;
window.confirmThreadSelection = confirmThreadSelection;


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
            await onCompareProjectChange(compareSelect.value);
        }
    }
}

/**
 * 初始化应用
 */
async function init() {
    initCharts();
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
        compareSelect.value = compareSelect.options[0]?.value || '';
        if (compareSelect.value) {
            await onCompareProjectChange(compareSelect.value);
        }
    }
    
    if (initialMode === 'multi') {
        switchView('multithread');
    } else if (initialMode === 'compare') {
        switchView('compare');
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

// 启动应用
init();