// ==================================================
// 文件: static/js/chart-utils.js
// 修改: 将 boundaryGap 改为 true（默认值）
// ==================================================

/**
 * 图表工具函数模块 - 统一的折线图样式（带平均值和参考线）
 */

// ==================================================
// 图表实例管理
// ==================================================

const ChartManager = {
    charts: {},
    
    get(id, createIfNotExist = true) {
        if (this.charts[id] && (this.charts[id].isDisposed && this.charts[id].isDisposed())) {
            delete this.charts[id];
        }
        
        if (!this.charts[id] && createIfNotExist) {
            const dom = document.getElementById(id);
            if (dom && typeof echarts !== 'undefined') {
                if (dom.offsetWidth > 0 && dom.offsetHeight > 0) {
                    this.charts[id] = echarts.init(dom);
                } else {
                    setTimeout(() => {
                        if (dom.offsetWidth > 0 && dom.offsetHeight > 0) {
                            this.charts[id] = echarts.init(dom);
                        }
                    }, 100);
                }
            }
        }
        return this.charts[id];
    },
    
    set(id, chart) {
        this.charts[id] = chart;
    },
    
    dispose(id) {
        if (this.charts[id]) {
            this.charts[id].dispose();
            delete this.charts[id];
        }
    },
    
    resizeAll() {
        Object.values(this.charts).forEach(chart => {
            if (chart && !chart.isDisposed()) {
                chart.resize();
            }
        });
    },
    
    clearAll() {
        Object.values(this.charts).forEach(chart => {
            if (chart && !chart.isDisposed()) {
                chart.clear();
            }
        });
    }
};

// ==================================================
// 统一的图表配置生成器 - 带平均值和参考线
// ==================================================

const ChartConfig = {
    /**
     * 获取基础配置
     */
    getBaseConfig() {
        return {
            backgroundColor: 'transparent',
            grid: {
                left: '8%',
                right: '8%',
                top: '18%',
                bottom: '10%',
                containLabel: true
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
    },
    
    /**
     * 获取X轴配置
     * @param {Array} data - X轴数据
     * @param {string} name - X轴名称
     * @param {boolean} boundaryGap - 是否留白边界，默认为true（曲线不接触边线）
     */
    getXAxisConfig(data, name = '', boundaryGap = true) {
        return {
            type: 'category',
            name: name,
            data: data,
            axisLabel: {
                rotate: data.length > 10 ? 30 : 0,
                color: '#94a3b8',
                fontSize: 11
            },
            axisLine: { lineStyle: { color: '#475569' } },
            boundaryGap: boundaryGap
        };
    },
    
    /**
     * 获取Y轴配置
     */
    getYAxisConfig(name, unit = '') {
        return {
            type: 'value',
            name: name,
            nameTextStyle: { color: '#cbd5e1', fontSize: 12 },
            axisLabel: {
                color: '#94a3b8',
                fontSize: 11,
                formatter: (value) => {
                    if (unit === 'MB' && value >= 1024) {
                        return (value / 1024).toFixed(1) + ' GB';
                    }
                    if (unit === '秒') {
                        return value.toFixed(2);
                    }
                    return value;
                }
            },
            splitLine: {
                lineStyle: { color: 'rgba(71, 85, 105, 0.3)', type: 'dashed' }
            }
        };
    },
    
    /**
     * 获取图例配置
     */
    getLegendConfig(data, selected = {}) {
        return {
            data: data,
            selected: selected,
            textStyle: { color: '#cbd5e1', fontSize: 11 },
            orient: 'horizontal',
            right: 10,
            top: 0,
            itemWidth: 25,
            itemHeight: 12
        };
    },
    
    /**
     * 获取Tooltip配置
     */
    getTooltipConfig(unit, customFormatter = null) {
        const baseConfig = {
            trigger: 'axis',
            backgroundColor: 'rgba(30, 41, 59, 0.95)',
            borderWidth: 1,
            textStyle: { color: '#f1f5f9', fontSize: 12 }
        };
        
        if (customFormatter) {
            baseConfig.formatter = customFormatter;
        } else {
            baseConfig.formatter = (params) => {
                if (!params?.length) return '';
                const rows = params.map(p => 
                    `<div>${p.seriesName}: ${p.value !== null ? p.value.toFixed(2) : 'N/A'} ${unit}</div>`
                ).join('');
                return `<strong>📅 ${params[0].axisValue}</strong>${rows}`;
            };
        }
        
        return baseConfig;
    },
    
    /**
     * 获取系列配置
     */
    getSeriesConfig(name, data, color, options = {}) {
        return {
            name: name,
            type: 'line',
            data: data,
            smooth: false,
            lineStyle: { width: 2, color: color },
            areaStyle: { opacity: 0.08, color: color },
            connectNulls: options.connectNulls || false,
            showSymbol: options.showSymbol !== false,
            symbol: options.symbol || 'circle',
            symbolSize: options.symbolSize || 6
        };
    },
    
    /**
     * 获取平均值参考线配置
     */
    getAverageLineConfig(dates, avgValue) {
        return {
            name: '平均值',
            type: 'line',
            data: new Array(dates.length).fill(parseFloat(avgValue)),
            lineStyle: { width: 1.5, color: '#f59e0b', type: 'dashed' },
            symbol: 'none',
            tooltip: { show: false }
        };
    },
    
    /**
     * 获取水平参考线配置
     */
    getReferenceLineConfig(dates, referenceValue, name = '参考线', color = '#06b6d4') {
        return {
            name: name,
            type: 'line',
            data: new Array(dates.length).fill(parseFloat(referenceValue)),
            lineStyle: { width: 1, color: color, type: 'dotted' },
            symbol: 'none',
            tooltip: { show: true, formatter: () => `📊 ${name}: ${referenceValue.toFixed(2)}` }
        };
    },
    
    /**
     * 获取完整的折线图配置（带平均值和参考线）
     * @param {Array} dates - X轴日期数据
     * @param {Array} seriesList - 系列列表
     * @param {string} yAxisName - Y轴名称
     * @param {number} avgValue - 平均值
     * @param {number} referenceValue - 参考线值
     * @param {Object} legendSelected - 图例选中状态
     * @param {Function} tooltipFormatter - 自定义tooltip格式化函数
     * @param {boolean} boundaryGap - X轴是否留白，默认true
     */
    getCompleteLineChartConfig(dates, seriesList, yAxisName, avgValue, referenceValue, legendSelected = {}, tooltipFormatter = null, boundaryGap = true) {
        const allSeries = [...seriesList];
        
        if (avgValue !== null && avgValue !== undefined && !isNaN(avgValue)) {
            allSeries.push(this.getAverageLineConfig(dates, avgValue));
        }
        
        if (referenceValue !== null && referenceValue !== undefined && !isNaN(referenceValue)) {
            allSeries.push(this.getReferenceLineConfig(dates, referenceValue));
        }
        
        const legendData = seriesList.map(s => s.name);
        if (avgValue !== null && avgValue !== undefined && !isNaN(avgValue)) {
            legendData.push('平均值');
        }
        if (referenceValue !== null && referenceValue !== undefined && !isNaN(referenceValue)) {
            legendData.push('参考线');
        }
        
        // 设置默认图例选中状态（默认只显示第一个系列）
        const defaultSelected = {};
        legendData.forEach((name, idx) => {
            defaultSelected[name] = idx === 0;
        });
        if (avgValue !== null && avgValue !== undefined && !isNaN(avgValue)) {
            defaultSelected['平均值'] = true;
        }
        if (referenceValue !== null && referenceValue !== undefined && !isNaN(referenceValue)) {
            defaultSelected['参考线'] = true;
        }
        
        const finalSelected = { ...defaultSelected, ...legendSelected };
        
        return {
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
                boundaryGap: boundaryGap
            },
            yAxis: {
                type: 'value',
                name: yAxisName,
                nameTextStyle: { color: '#cbd5e1', fontSize: 12 },
                axisLabel: {
                    color: '#94a3b8',
                    fontSize: 11,
                    formatter: (value) => {
                        if (yAxisName.includes('MB') && value >= 1024) {
                            return (value / 1024).toFixed(1) + ' GB';
                        }
                        if (yAxisName.includes('秒') || yAxisName.includes('Runtime')) {
                            return value.toFixed(2);
                        }
                        return value;
                    }
                },
                splitLine: {
                    lineStyle: { color: 'rgba(71, 85, 105, 0.3)', type: 'dashed' }
                }
            },
            series: allSeries,
            legend: {
                data: legendData,
                selected: finalSelected,
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
    }
};

// ==================================================
// 工具提示相关函数
// ==================================================

let statsTooltipInstance = null;

function initStatsTooltips() {
    if (!statsTooltipInstance) {
        statsTooltipInstance = document.createElement('div');
        statsTooltipInstance.id = 'statsTooltip';
        statsTooltipInstance.style.cssText = `
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
        document.body.appendChild(statsTooltipInstance);
    }
    
    const statItems = document.querySelectorAll('#compareRuntimeStats .stat-item, #compareMemoryStats .stat-item');
    statItems.forEach(item => {
        item.removeEventListener('mouseenter', handleStatsMouseEnter);
        item.removeEventListener('mouseleave', handleStatsMouseLeave);
        item.removeEventListener('mousemove', handleStatsMouseMove);
        item.addEventListener('mouseenter', handleStatsMouseEnter);
        item.addEventListener('mouseleave', handleStatsMouseLeave);
        item.addEventListener('mousemove', handleStatsMouseMove);
    });
}

function handleStatsMouseEnter(e) {
    const item = e.currentTarget;
    const tooltipHtml = item.getAttribute('data-tooltip-html');
    if (tooltipHtml && tooltipHtml.trim() !== '') {
        if (statsTooltipInstance) {
            statsTooltipInstance.innerHTML = tooltipHtml;
            statsTooltipInstance.style.visibility = 'visible';
            statsTooltipInstance.style.opacity = '1';
            updateTooltipPosition(e);
        }
    }
}

function handleStatsMouseLeave() {
    if (statsTooltipInstance) {
        statsTooltipInstance.style.visibility = 'hidden';
        statsTooltipInstance.style.opacity = '0';
    }
}

function handleStatsMouseMove(e) {
    if (statsTooltipInstance && statsTooltipInstance.style.visibility === 'visible') {
        updateTooltipPosition(e);
    }
}

function updateTooltipPosition(e) {
    if (!statsTooltipInstance) return;
    const x = e.clientX + 15;
    const y = e.clientY - 10;
    const tooltipRect = statsTooltipInstance.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    let left = x;
    let top = y - tooltipRect.height;
    if (left + tooltipRect.width > viewportWidth - 10) left = viewportWidth - tooltipRect.width - 10;
    if (left < 10) left = 10;
    if (top < 10) top = y + 20;
    if (top + tooltipRect.height > viewportHeight - 10) top = viewportHeight - tooltipRect.height - 10;
    statsTooltipInstance.style.left = left + 'px';
    statsTooltipInstance.style.top = top + 'px';
}

// ==================================================
// 图例控制按钮
// ==================================================

let legendControlsAdded = false;

function addLegendControlButtons(chart, chartId) {
    if (legendControlsAdded) return;
    
    const legendContainer = document.querySelector(`#${chartId} .echarts-legend`);
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
        if (chart) {
            const option = chart.getOption();
            const legendData = option.legend[0].data;
            const newSelected = {};
            legendData.forEach(name => { newSelected[name] = true; });
            chart.setOption({ legend: { selected: newSelected } });
            showNotification('已全选所有系列');
        }
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
        if (chart) {
            const option = chart.getOption();
            const legendSelected = option.legend[0].selected || {};
            const newSelected = {};
            Object.entries(legendSelected).forEach(([name, isSelected]) => {
                newSelected[name] = !isSelected;
            });
            chart.setOption({ legend: { selected: newSelected } });
            showNotification('已反选系列');
        }
    };
    
    buttonContainer.appendChild(selectAllBtn);
    buttonContainer.appendChild(inverseBtn);
    legendContainer.appendChild(buttonContainer);
    legendControlsAdded = true;
}

function observeChartRendering(containerId, chart) {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    const observer = new MutationObserver(() => {
        addLegendControlButtons(chart, containerId);
    });
    observer.observe(container, { attributes: true, childList: true, subtree: true });
}

// ==================================================
// 统计卡片更新
// ==================================================

function updateStatsCard(containerId, values, unit, label) {
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

// 导出全局对象
window.ChartManager = ChartManager;
window.ChartConfig = ChartConfig;
window.addLegendControlButtons = addLegendControlButtons;
window.observeChartRendering = observeChartRendering;
window.updateStatsCard = updateStatsCard;
window.initStatsTooltips = initStatsTooltips;