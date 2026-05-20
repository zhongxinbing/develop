/**
 * EDA 性能监控系统 - 主脚本
 * 支持时序曲线图、多线程对比、数据对比三大功能
 * 使用 ECharts 进行数据可视化
 */

// ==================================================
// 工具函数
// ==================================================

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

function simpleHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    return hash.toString();
}

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

function showLoading(show) {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) {
        overlay.classList.toggle('hidden', !show);
    }
}

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
 * 格式化 tooltip 内容 - 显示前10个阶段及其变化率
 * @param {Array} items - 阶段数据列表 [{rule, change_pct}]
 * @param {string} title - 标题
 * @returns {string} 格式化后的 HTML 字符串
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
 * 为统计卡片添加 tooltip 功能
 * @param {HTMLElement} element - 卡片元素
 * @param {string} tooltipHtml - tooltip HTML 内容
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

function getCurrentProjectData() {
    return projectsData[currentProjectId];
}

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

function selectChartType(type) {
    currentChartType = type;
    updateChartTypeButtons();
    refreshTimelineCharts();
}

/**
 * 过滤工具数据 - 只保留选中的日期
 * 关键修复：确保日期和对应的数据值一一对应，且过滤后顺序正确
 */
function getFilteredToolData(toolData) {
    if (!toolData || !toolData.dates) return null;
    
    // 使用 Map 提高查找效率
    const filterSet = new Set(selectedDates);
    
    const filtered = {
        dates: [],
        runtimes: [],
        memories: [],
        cores: []
    };
    
    // 按日期顺序遍历原始数据
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
 * 检查某个日期是否有MR更新（用于数据点高亮）
 * @param {string} date - 日期字符串
 * @returns {boolean} 是否有MR更新
 */
function hasMrUpdate(date) {
    const comment = mrUpdateDates[date];
    return comment && comment !== 'undefined' && comment !== '' && comment !== 'None';
}

/**
 * 获取MR更新的注释文本
 * @param {string} date - 日期字符串
 * @returns {string} MR更新注释
 */
function getMrComment(date) {
    return mrUpdateDates[date] || '';
}

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
        selectedThreads = legendData.map(name => {
            if (name === 'e线程0') return '0';
            if (name.startsWith('其他线程')) return name.replace('其他线程', '');
            return null;
        }).filter(t => t);
        showNotification('已全选所有线程');
    }
}

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
 * 渲染时序曲线图 - 核心函数
 * MR更新日期的数据点会标红显示
 * 
 * 关键修复：当日期范围选择后，最后一个数据点之后不再画线
 * 通过使用 connectNulls: false 并确保没有后续数据点来实现
 */
function renderTimelineChart(chartType, dataKey, color, yAxisName, yAxisFormatter = null) {
    const toolData = getCurrentToolData();
    if (!toolData) {
        if (charts[chartType]) charts[chartType].clear();
        return;
    }
    
    // 获取过滤后的数据（只包含选中的日期）
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
    
    // 构建系列数据
    const seriesList = threadIds.map((threadId, index) => {
        const threadInfo = threadMetrics[threadId];
        // 获取当前线程在该指标下的值数组
        let values = threadInfo?.[dataKey] || [];
        
        // 重要：需要根据选中的日期重新映射值
        // 因为 threadInfo 中的值是按原始日期顺序的
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
        
        const palette = ['#6366f1', '#f59e0b', '#10b981', '#ef4444', '#06b6d4', '#8b5cf6', '#ec4899', '#84cc16'];
        const seriesColor = palette[index % palette.length];
        const threadLabel = threadId === '0' ? 'e线程0' : `其他线程${threadId}`;
        
        // 构建数据点，包含MR更新高亮
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
            connectNulls: false,  // 关键：不连接空值，确保最后一个有效数据点后断开
            showSymbol: true,
            step: false
        };
    });
    
    // 计算统计值（只使用有效数据）
    const allValues = seriesList
        .flatMap(series => series.data.map(item => item.value))
        .filter(v => v !== null && v !== undefined && v > 0);
    
    const unit = dataKey === 'runtimes' ? '秒' : 'MB';
    const label = dataKey === 'runtimes' ? 'Runtime' : 'Memory';
    if (chartType === currentChartType) {
        updateStats('stats-main', allValues, unit, label);
    }
    
    const avgValue = allValues.length > 0 ? (allValues.reduce((a, b) => a + b, 0) / allValues.length).toFixed(1) : 0;
    
    // 图例默认选中状态
    const legendSelected = {};
    threadIds.forEach(threadId => {
        const seriesName = threadId === '0' ? 'e线程0' : `其他线程${threadId}`;
        legendSelected[seriesName] = (threadId === '0');
    });
    
    selectedThreads = threadIds.filter(threadId => legendSelected[threadId === '0' ? 'e线程0' : `其他线程${threadId}`]);
    
    // 构建tooltip显示MR更新信息
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
            // 确保X轴只显示选中的日期
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
                tooltip: { show: false },
                connectNulls: false
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

function addControlButtonsToLegend() {
    const legendContainer = document.querySelector('.chart-container .echarts-legend');
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

let currentMultiChartType = 'runtime';

async function loadMultiRules(projectId) {
    try {
        const response = await fetch(`/api/project/${projectId}`);
        const data = await response.json();
        
        const ruleSelect = document.getElementById('multiRuleSelect');
        if (data?.rules?.length) {
            ruleSelect.innerHTML = '<option value="">-- 请选择阶段 --</option>' + 
                data.rules.map(rule => `<option value="${rule}">${rule}</option>`).join('');
            
            // 自动选择第一个规则
            if (data.rules.length > 0 && !currentMultiRule) {
                const firstRule = data.rules[0];
                ruleSelect.value = firstRule;
                currentMultiRule = firstRule;
                loadMultiDates(projectId, firstRule);
            }
        }
    } catch (error) {
        console.error('加载规则失败:', error);
    }
}

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

function renderMultiThreadCharts(threadsData) {
    const threads = threadsData.map(d => d.threads);
    const runtimes = threadsData.map(d => d.runtime);
    const memories = threadsData.map(d => d.memory);
    
    const commonOption = {
        tooltip: { 
            trigger: 'axis', 
            formatter: (params) => {
                if (!params?.length) return '';
                const unit = currentMultiChartType === 'runtime' ? '秒' : 'MB';
                return `${params[0].axisValue} 线程: ${params[0].value} ${unit}`;
            }
        },
        xAxis: { type: 'category', name: '线程数', data: threads },
        yAxis: { 
            type: 'value', 
            name: currentMultiChartType === 'runtime' ? 'Runtime (秒)' : 'Memory (MB)',
            axisLabel: currentMultiChartType === 'memory' ? 
                { formatter: (value) => value >= 1024 ? (value / 1024).toFixed(1) + ' GB' : value + ' MB' } : 
                undefined
        },
        series: [{ 
            type: 'line', 
            data: currentMultiChartType === 'runtime' ? runtimes : memories,
            smooth: true, 
            lineStyle: { width: 3, color: currentMultiChartType === 'runtime' ? '#6366f1' : '#10b981' }, 
            symbolSize: 8,
            areaStyle: { opacity: 0.1, color: currentMultiChartType === 'runtime' ? '#6366f1' : '#10b981' },
            connectNulls: false
        }],
        grid: { top: 50, bottom: 30, left: 60, right: 40 }
    };
    
    if (currentMultiChartType === 'runtime' && charts.multiRuntime) {
        charts.multiRuntime.setOption(commonOption);
        charts.multiRuntime.resize();
    } else if (currentMultiChartType !== 'runtime' && charts.multiMemory) {
        charts.multiMemory.setOption(commonOption);
        charts.multiMemory.resize();
    }
}

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

/**
 * 为多线程对比添加切换按钮（与时序曲线图一致）
 */
function addMultiChartToggleButtons() {
    const multiView = document.getElementById('multithreadView');
    if (!multiView) return;
    
    if (document.getElementById('multiChartToggleButtons')) return;
    
    // 查找图表卡片
    const chartCard = multiView.querySelector('.multi-chart-card');
    if (!chartCard) return;
    
    // 创建按钮容器
    const buttonContainer = document.createElement('div');
    buttonContainer.id = 'multiChartToggleButtons';
    buttonContainer.className = 'chart-type-buttons';
    buttonContainer.style.cssText = 'display: flex; gap: 0.5rem; margin-bottom: 1rem;';
    
    buttonContainer.innerHTML = `
        <button id="multiChartRuntimeBtn" class="btn btn-primary chart-type-btn" data-type="runtime">⏱️ Runtime</button>
        <button id="multiChartMemoryBtn" class="btn btn-secondary chart-type-btn" data-type="memory">💾 Memory</button>
    `;
    
    // 插入到卡片头部之后
    const cardHeader = chartCard.querySelector('.card-header');
    if (cardHeader) {
        cardHeader.insertAdjacentElement('afterend', buttonContainer);
    } else {
        chartCard.prepend(buttonContainer);
    }
    
    // 绑定事件
    const runtimeBtn = document.getElementById('multiChartRuntimeBtn');
    const memoryBtn = document.getElementById('multiChartMemoryBtn');
    
    if (runtimeBtn) {
        runtimeBtn.addEventListener('click', () => {
            currentMultiChartType = 'runtime';
            updateMultiChartTypeButtons();
            if (currentMultiRule && currentMultiDate) {
                loadMultiThreadData(currentProjectId, currentMultiRule, currentMultiDate);
            }
        });
    }
    
    if (memoryBtn) {
        memoryBtn.addEventListener('click', () => {
            currentMultiChartType = 'memory';
            updateMultiChartTypeButtons();
            if (currentMultiRule && currentMultiDate) {
                loadMultiThreadData(currentProjectId, currentMultiRule, currentMultiDate);
            }
        });
    }
}

function updateMultiChartTypeButtons() {
    const runtimeBtn = document.getElementById('multiChartRuntimeBtn');
    const memoryBtn = document.getElementById('multiChartMemoryBtn');
    
    if (runtimeBtn) {
        runtimeBtn.classList.toggle('btn-primary', currentMultiChartType === 'runtime');
        runtimeBtn.classList.toggle('btn-secondary', currentMultiChartType !== 'runtime');
    }
    if (memoryBtn) {
        memoryBtn.classList.toggle('btn-primary', currentMultiChartType === 'memory');
        memoryBtn.classList.toggle('btn-secondary', currentMultiChartType !== 'memory');
    }
    
    const runtimeContainer = document.getElementById('multi-runtime-container');
    const memoryContainer = document.getElementById('multi-memory-container');
    
    if (runtimeContainer && memoryContainer) {
        runtimeContainer.style.display = currentMultiChartType === 'runtime' ? 'block' : 'none';
        memoryContainer.style.display = currentMultiChartType === 'memory' ? 'block' : 'none';
    }
    
    const titleEl = document.getElementById('multiChartCardTitle');
    if (titleEl) {
        titleEl.innerText = currentMultiChartType === 'runtime' ? '⏱️ Runtime 性能曲线' : '💾 Memory 使用曲线';
    }
}

// ==================================================
// 数据对比模块
// ==================================================

let currentCompareResult = null;
let currentFilteredData = [];

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
            
            if (data.dates.length >= 2) {
                date1Select.value = data.dates[data.dates.length - 2];
                date2Select.value = data.dates[data.dates.length - 1];
            }
        }
    } catch (error) {
        console.error('加载日期失败:', error);
    }
}

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
 * 构建排序列表用于 tooltip
 * @param {Array} rulesComparison - 对比结果数组
 * @param {string} type - 'runtime' 或 'memory'
 * @param {boolean} isIncrease - true: 增加, false: 减少
 * @returns {Array} 排序后的列表 [{rule, change_pct}]
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
 * 为对比表格添加筛选输入框
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

let currentFilterText = '';

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
        return `<tr>
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
        </tr>`;
    }).join('');
}

function displayCompareResult(result) {
    const isAllRules = result.mode === 'all_rules';
    document.getElementById('compareResultTitle').innerHTML = 
        isAllRules ? '📈 全阶段对比结果' : `📈 单阶段对比结果 - ${result.rule_name}`;
    
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
        
        const runtimeIncreaseTooltip = formatTooltipListHtml(runtimeIncreaseList, 'Runtime 增加排行 (前10)');
        const runtimeDecreaseTooltip = formatTooltipListHtml(runtimeDecreaseList, 'Runtime 减少排行 (前10)');
        const memoryIncreaseTooltip = formatTooltipListHtml(memoryIncreaseList, 'Memory 增加排行 (前10)');
        const memoryDecreaseTooltip = formatTooltipListHtml(memoryDecreaseList, 'Memory 减少排行 (前10)');
        
        document.getElementById('compareSummary').innerHTML = `
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
        
        addStatCardTooltip(document.getElementById('statRuntimeIncrease'), runtimeIncreaseTooltip);
        addStatCardTooltip(document.getElementById('statRuntimeDecrease'), runtimeDecreaseTooltip);
        addStatCardTooltip(document.getElementById('statMemoryIncrease'), memoryIncreaseTooltip);
        addStatCardTooltip(document.getElementById('statMemoryDecrease'), memoryDecreaseTooltip);
        
        const avgRuntimeList = rulesComparison
            .filter(r => r.has_data && r.runtime_change_pct !== null)
            .map(r => ({ rule: r.rule_name, change_pct: Math.abs(r.runtime_change_pct) }))
            .sort((a, b) => b.change_pct - a.change_pct);
        const avgMemoryList = rulesComparison
            .filter(r => r.has_data && r.memory_change_pct !== null)
            .map(r => ({ rule: r.rule_name, change_pct: Math.abs(r.memory_change_pct) }))
            .sort((a, b) => b.change_pct - a.change_pct);
        
        addStatCardTooltip(document.getElementById('statRuntimeAvg'), formatTooltipListHtml(avgRuntimeList, 'Runtime 变化率排行 (前10)'));
        addStatCardTooltip(document.getElementById('statMemoryAvg'), formatTooltipListHtml(avgMemoryList, 'Memory 变化率排行 (前10)'));
        addStatCardTooltip(document.getElementById('statRuntimeMaxInc'), formatTooltipListHtml(runtimeIncreaseList, 'Runtime 增加排行 (前10)'));
        addStatCardTooltip(document.getElementById('statRuntimeMaxDec'), formatTooltipListHtml(runtimeDecreaseList, 'Runtime 减少排行 (前10)'));
        addStatCardTooltip(document.getElementById('statMemoryMaxInc'), formatTooltipListHtml(memoryIncreaseList, 'Memory 增加排行 (前10)'));
        addStatCardTooltip(document.getElementById('statMemoryMaxDec'), formatTooltipListHtml(memoryDecreaseList, 'Memory 减少排行 (前10)'));
        
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
        
        addTableFilter();
        applyTableFilter();
        
    } else {
        const comparisons = result.comparisons || [];
        const runtimeChangeList = comparisons
            .filter(c => c.runtime_change_pct !== null)
            .map(c => ({ rule: c.date || `数据点${c.index + 1}`, change_pct: Math.abs(c.runtime_change_pct) }))
            .sort((a, b) => b.change_pct - a.change_pct);
        
        document.getElementById('compareSummary').innerHTML = `
            <div class="stat-item" id="statTotalPoints">
                <div class="stat-value">${summary.total || 0}</div>
                <div class="stat-label">数据点数</div>
            </div>
            <div class="stat-item" id="statRuntimeInc">
                <div class="stat-value status-increase">${summary.runtime_increased || 0}</div>
                <div class="stat-label">Runtime增加</div>
            </div>
            <div class="stat-item" id="statRuntimeDec">
                <div class="stat-value status-decrease">${summary.runtime_decreased || 0}</div>
                <div class="stat-label">Runtime减少</div>
            </div>
            <div class="stat-item" id="statRuntimeAvgChange">
                <div class="stat-value">${summary.runtime_avg_change || 0}%</div>
                <div class="stat-label">平均变化率</div>
            </div>
        `;
        
        addStatCardTooltip(document.getElementById('statRuntimeAvgChange'), formatTooltipListHtml(runtimeChangeList, '变化率排行 (前10)'));
        
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

function openDatePickerModal() {
    pendingSelectedDates = [...selectedDates];
    buildDatePicker(true);
    document.getElementById('datePickerModal').classList.remove('hidden');
}

function closeDatePickerModal() {
    document.getElementById('datePickerModal').classList.add('hidden');
}

function confirmDateSelection() {
    if (pendingSelectedDates.length === 0) {
        pendingSelectedDates = availableDates.slice(-51);
    }
    selectedDates = [...pendingSelectedDates];
    updateDateSelectionInfo();
    refreshTimelineCharts();
    closeDatePickerModal();
}

function resetDateSelection(useAll = false) {
    selectedDates = useAll ? [...availableDates] : availableDates.slice(-51);
    updateDateSelectionInfo();
    refreshTimelineCharts();
}

// ==================================================
// 数据刷新模块
// ==================================================

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
                const currentVal = caseSelect.value;
                caseSelect.innerHTML = result.project_list.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
                if (result.project_list.some(p => p.id === currentVal)) {
                    caseSelect.value = currentVal;
                }
                
                // 同时更新多线程和对比模块的项目选择框
                const multiCaseSelect = document.getElementById('multiCaseSelect');
                if (multiCaseSelect) {
                    multiCaseSelect.innerHTML = result.project_list.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
                    if (result.project_list.some(p => p.id === currentVal)) {
                        multiCaseSelect.value = currentVal;
                    }
                }
                
                const compareCaseSelect = document.getElementById('compareCaseSelect');
                if (compareCaseSelect) {
                    compareCaseSelect.innerHTML = '<option value="">-- 请选择case --</option>' + 
                        result.project_list.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
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

function switchView(viewId) {
    document.querySelectorAll('.view-container').forEach(view => {
        view.classList.remove('active');
    });
    document.getElementById(`${viewId}View`).classList.add('active');
    
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
        if (item.dataset.view === viewId) {
            item.classList.add('active');
        }
    });
    
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
    
    const multiRuntimeDom = document.getElementById('chart-multi-runtime');
    const multiMemoryDom = document.getElementById('chart-multi-memory');
    
    if (multiRuntimeDom) charts.multiRuntime = echarts.init(multiRuntimeDom);
    if (multiMemoryDom) charts.multiMemory = echarts.init(multiMemoryDom);
    
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
    document.getElementById('caseSelect').addEventListener('change', (e) => {
        currentProjectId = e.target.value;
        currentRule = null;
        cachedToolData = {};
        selectedDates = [];
        updateRuleSelect();
        updateProjectStats();
        updateDateSelectionInfo();
    });
    
    document.getElementById('ruleSelect').addEventListener('change', (e) => {
        currentRule = e.target.value;
        if (currentRule) {
            document.getElementById('currentRuleName').innerText = currentRule;
            refreshTimelineCharts();
        }
    });
    
    document.getElementById('ruleSearch').addEventListener('input', debounce(() => {
        updateRuleSelect();
    }, 300));
    
    document.querySelectorAll('.chart-type-btn').forEach(btn => {
        btn.addEventListener('click', () => selectChartType(btn.dataset.type));
    });
    
    document.getElementById('refreshDataBtn').addEventListener('click', refreshAllData);
    
    document.getElementById('openDatePickerBtn')?.addEventListener('click', openDatePickerModal);
    document.getElementById('closeDateModalBtn')?.addEventListener('click', closeDatePickerModal);
    document.getElementById('confirmDateBtn')?.addEventListener('click', confirmDateSelection);
    document.getElementById('selectRecentBtn')?.addEventListener('click', () => resetDateSelection(false));
    document.getElementById('selectAllDatesBtn')?.addEventListener('click', () => resetDateSelection(true));
    
    document.getElementById('dateFilterInput')?.addEventListener('input', debounce(() => {
        buildDatePicker(true);
    }, 150));
    
    // 多线程模块事件绑定
    const multiCaseSelect = document.getElementById('multiCaseSelect');
    if (multiCaseSelect) {
        multiCaseSelect.addEventListener('change', (e) => {
            currentProjectId = e.target.value;
            // 重置当前选中的规则
            currentMultiRule = null;
            loadMultiRules(currentProjectId);
        });
    }
    
    const multiRuleSelect = document.getElementById('multiRuleSelect');
    if (multiRuleSelect) {
        multiRuleSelect.addEventListener('change', (e) => {
            currentMultiRule = e.target.value;
            if (currentMultiRule) {
                loadMultiDates(currentProjectId, currentMultiRule);
            }
        });
    }
    
    const multiDateSelect = document.getElementById('multiDateSelect');
    if (multiDateSelect) {
        multiDateSelect.addEventListener('change', (e) => {
            currentMultiDate = e.target.value;
            if (currentMultiRule && currentMultiDate) {
                loadMultiThreadData(currentProjectId, currentMultiRule, currentMultiDate);
            }
        });
    }
    
    document.getElementById('multiRefreshBtn')?.addEventListener('click', () => {
        if (currentMultiRule && currentMultiDate) {
            loadMultiThreadData(currentProjectId, currentMultiRule, currentMultiDate);
        }
    });
    
    // 对比模块事件绑定
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
    
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', () => switchView(item.dataset.view));
    });
    
    document.getElementById('backToHomeBtn')?.addEventListener('click', backToHome);
}

// ==================================================
// 初始化应用
// ==================================================

async function init() {
    initCharts();
    bindEvents();
    
    // 检测浏览器刷新并自动获取最新数据
    await autoRefreshOnLoad();
    
    // 设置初始项目ID
    const caseSelect = document.getElementById('caseSelect');
    if (caseSelect && caseSelect.options.length > 0) {
        currentProjectId = caseSelect.value;
        updateRuleSelect();
        updateProjectStats();
        updateDateSelectionInfo();
        updateChartTypeButtons();
    }
    
    // 多线程对比模块初始化 - 自动加载第一个case的数据
    const multiCaseSelect = document.getElementById('multiCaseSelect');
    if (multiCaseSelect && multiCaseSelect.options.length > 0) {
        currentProjectId = multiCaseSelect.value;
        // 加载第一个case的规则列表，会自动选择第一个规则并加载数据
        await loadMultiRules(currentProjectId);
    }
    
    if (initialMode === 'multi') {
        switchView('multithread');
    } else if (initialMode === 'compare') {
        switchView('compare');
        const compareSelect = document.getElementById('compareCaseSelect');
        const projId = compareSelect?.value || currentProjectId;
        if (projId) {
            currentProjectId = projId;
            await loadCompareDates(currentProjectId);
            await loadCompareRules(currentProjectId);
        }
    }
    
    // 设置定时检查更新
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
    
    // 添加多线程图表切换按钮
    setTimeout(() => {
        addMultiChartToggleButtons();
    }, 500);
}

// ==================================================
        // 检测是否为浏览器刷新（包括 F5、Ctrl+R、浏览器刷新按钮）
        // ==================================================
        function isBrowserRefresh() {
            // 方法1: 使用 PerformanceNavigationTiming API (现代浏览器)
            if (performance && performance.getEntriesByType) {
                const navigationEntries = performance.getEntriesByType('navigation');
                if (navigationEntries.length > 0) {
                    const nav = navigationEntries[0];
                    // type: 'navigate' (正常导航), 'reload' (刷新), 'back_forward' (前进/后退)
                    if (nav.type === 'reload') {
                        return true;
                    }
                }
            }
            
            // 方法2: 使用旧的 performance.navigation API (兼容旧浏览器)
            if (performance && performance.navigation) {
                if (performance.navigation.type === performance.navigation.TYPE_RELOAD) {
                    return true;
                }
            }
            
            // 方法3: 检查 URL 参数或 sessionStorage 标记
            // 如果是通过链接点击进入，不是刷新
            const isInitialLoad = sessionStorage.getItem(`page_loaded_${toolId}`);
            if (!isInitialLoad) {
                // 首次加载，设置标记
                sessionStorage.setItem(`page_loaded_${toolId}`, 'true');
                return false;
            }
            
            // 如果有标记且没有通过 navigation API 检测到，可能是后退/前进
            // 为了安全，也刷新一下数据
            return true;
        }
        
        // ==================================================
        // 页面初始化时自动刷新数据
        // ==================================================
        async function autoRefreshOnLoad() {
            const isRefresh = isBrowserRefresh();
            
            if (isRefresh) {
                console.log('检测到浏览器刷新，正在更新数据...');
                showNotification('检测到页面刷新，正在获取最新数据...');
                
                try {
                    // 调用刷新API获取最新数据
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
                        if (result.project_list && result.project_list.length) {
                            const caseSelect = document.getElementById('caseSelect');
                            const currentVal = caseSelect.value;
                            caseSelect.innerHTML = result.project_list.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
                            if (result.project_list.some(p => p.id === currentVal)) {
                                caseSelect.value = currentVal;
                            }
                            
                            // 同时更新多线程和对比模块的项目选择框
                            const multiCaseSelect = document.getElementById('multiCaseSelect');
                            if (multiCaseSelect) {
                                multiCaseSelect.innerHTML = result.project_list.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
                                if (result.project_list.some(p => p.id === currentVal)) {
                                    multiCaseSelect.value = currentVal;
                                }
                            }
                            
                            const compareCaseSelect = document.getElementById('compareCaseSelect');
                            if (compareCaseSelect) {
                                compareCaseSelect.innerHTML = '<option value="">-- 请选择case --</option>' + 
                                    result.project_list.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
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
                // 正常加载时也更新MR映射
                mrUpdateDates = buildMrUpdateMap(perf);
            }
        }
    

// 启动应用
init();