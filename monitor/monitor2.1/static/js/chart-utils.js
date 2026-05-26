/**
 * 图表工具函数模块
 */

// ==================================================
// 图表实例管理
// ==================================================

// 全局图表实例存储
// 全局图表实例存储
const ChartManager = {
    charts: {},
    
    /**
     * 获取或创建图表实例
     * @param {string} id - 容器ID
     * @param {boolean} createIfNotExist - 是否创建新实例
     * @returns {object} ECharts实例
     */
    get(id, createIfNotExist = true) {
        if (!this.charts[id] && createIfNotExist) {
            const dom = document.getElementById(id);
            if (dom && typeof echarts !== 'undefined') {
                if (this.charts[id]) {
                    this.charts[id].dispose();
                }
                this.charts[id] = echarts.init(dom);
                console.log(`[ChartManager] Created chart for ${id}`);
            } else if (!dom) {
                console.warn(`[ChartManager] DOM element not found: ${id}`);
            } else if (typeof echarts === 'undefined') {
                console.error('[ChartManager] ECharts not loaded');
            }
        }
        return this.charts[id];
    },
    
    /**
     * 设置图表实例
     * @param {string} id - 容器ID
     * @param {object} chart - ECharts实例
     */
    set(id, chart) {
        this.charts[id] = chart;
    },
    
    /**
     * 销毁图表实例
     * @param {string} id - 容器ID
     */
    dispose(id) {
        if (this.charts[id]) {
            this.charts[id].dispose();
            delete this.charts[id];
        }
    },
    
    /**
     * 调整所有图表大小
     */
    resizeAll() {
        Object.values(this.charts).forEach(chart => {
            if (chart && !chart.isDisposed()) {
                chart.resize();
            }
        });
    },
    
    /**
     * 清空所有图表
     */
    clearAll() {
        Object.values(this.charts).forEach(chart => {
            if (chart && !chart.isDisposed()) {
                chart.clear();
            }
        });
    }
};
// ==================================================
// 图表配置生成器
// ==================================================

const ChartConfig = {
    /**
     * 获取基础配置
     * @returns {object} 基础配置
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
     * @returns {object} X轴配置
     */
    getXAxisConfig(data, name = '') {
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
            boundaryGap: false
        };
    },
    
    /**
     * 获取Y轴配置
     * @param {string} name - Y轴名称
     * @param {string} unit - 单位
     * @returns {object} Y轴配置
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
     * @param {Array} data - 图例数据
     * @param {object} selected - 选中状态
     * @returns {object} 图例配置
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
     * @param {string} unit - 单位
     * @param {Function} customFormatter - 自定义格式化函数
     * @returns {object} Tooltip配置
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
     * @param {string} name - 系列名称
     * @param {Array} data - 数据
     * @param {string} color - 颜色
     * @param {object} options - 额外选项
     * @returns {object} 系列配置
     */
    getSeriesConfig(name, data, color, options = {}) {
        return {
            name: name,
            type: 'line',
            data: data,
            smooth: options.smooth || false,
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
     * @param {Array} dates - 日期数组
     * @param {number} avgValue - 平均值
     * @returns {object} 参考线配置
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
    }
};

// ==================================================
// 图例控制按钮
// ==================================================

let legendControlsAdded = false;

/**
 * 在图例中添加控制按钮（全选/反选）
 * @param {object} chart - ECharts实例
 */
function addLegendControlButtons(chart) {
    if (legendControlsAdded) return;
    
    const legendContainer = document.querySelector('.echarts-legend');
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

// 监听图表渲染完成
function observeChartRendering(containerId, chart) {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    const observer = new MutationObserver(() => {
        addLegendControlButtons(chart);
    });
    observer.observe(container, { attributes: true, childList: true, subtree: true });
}

// ==================================================
// 统计卡片更新
// ==================================================

/**
 * 更新统计卡片
 * @param {string} containerId - 容器ID
 * @param {Array} values - 数值数组
 * @param {string} unit - 单位
 * @param {string} label - 标签
 */
function updateStatsCard(containerId, values, unit, label) {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    const valid = filterValidNumbers(values);
    
    if (valid.length === 0) {
        container.innerHTML = '<div class="stat-item"><div class="stat-value">-</div><div class="stat-label">暂无数据</div></div>';
        return;
    }
    
    const total = calculateSum(valid);
    const avg = (total / valid.length).toFixed(1);
    const max = calculateMax(valid);
    const min = calculateMin(valid);
    
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