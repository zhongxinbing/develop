class MemoryChart {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.chart = null;
        this.currentData = null;
        this.currentFilters = {
            casename: null,
            rule: null,
            dates: []
        };
    }
    
    init() {
        if (this.chart) {
            this.chart.dispose();
        }
        this.chart = echarts.init(this.container);
        this.setupResize();
    }
    
    setupResize() {
        window.addEventListener('resize', () => {
            if (this.chart) {
                this.chart.resize();
            }
        });
    }
    
    render(data, filters) {
        if (!this.chart) this.init();
        
        this.currentData = data;
        this.currentFilters = filters;
        
        const { xAxisData, seriesData, tooltipData } = this.prepareData(data, filters);
        
        const option = {
            grid: {
                left: '3%',
                right: '5%',
                top: '10%',
                bottom: '8%',
                containLabel: true
            },
            tooltip: {
                trigger: 'axis',
                formatter: (params) => this.formatTooltip(params, tooltipData),
                axisPointer: { type: 'shadow' }
            },
            xAxis: {
                type: 'category',
                data: xAxisData,
                name: '日期',
                nameLocation: 'middle',
                nameGap: 35,
                axisLabel: {
                    rotate: xAxisData.length > 20 ? 45 : 0,
                    interval: 0,
                    fontSize: 11
                }
            },
            yAxis: {
                type: 'value',
                name: 'Memory (MB)',
                nameLocation: 'middle',
                nameGap: 45
            },
            series: seriesData,
            legend: {
                data: seriesData.map(s => s.name),
                textStyle: { color: 'var(--text-secondary)' },
                right: 10,
                top: 0
            },
            toolbox: {
                feature: {
                    saveAsImage: { title: '保存为图片' },
                    zoom: { title: '区域缩放' },
                    restore: { title: '重置' }
                },
                right: 10,
                top: 30
            }
        };
        
        this.chart.setOption(option, true);
    }
    
    prepareData(data, filters) {
        const xAxisData = [];
        const seriesMap = new Map();
        const tooltipData = new Map();
        
        const casename = filters.casename;
        if (!casename || !data[casename]) {
            return { xAxisData: [], seriesData: [], tooltipData: new Map() };
        }
        
        const dailyMetrics = data[casename].daily_metrics || {};
        const dates = filters.dates.length > 0 ? filters.dates : Object.keys(dailyMetrics).sort();
        
        const rules = new Set();
        for (const date of dates) {
            const dayData = dailyMetrics[date];
            if (dayData) {
                for (const rule in dayData) {
                    if (filters.rule && rule !== filters.rule) continue;
                    rules.add(rule);
                    if (!tooltipData.has(rule)) tooltipData.set(rule, new Map());
                }
            }
        }
        
        dates.sort();
        
        for (const date of dates) {
            xAxisData.push(date);
            const dayData = dailyMetrics[date] || {};
            
            for (const rule of rules) {
                const memory = dayData[rule]?.memory;
                if (!seriesMap.has(rule)) {
                    seriesMap.set(rule, []);
                }
                seriesMap.get(rule).push(memory !== undefined ? memory : null);
                
                const ruleTooltip = tooltipData.get(rule) || new Map();
                ruleTooltip.set(date, {
                    value: memory,
                    extra: dayData[rule]?.extra || {}
                });
                tooltipData.set(rule, ruleTooltip);
            }
        }
        
        const seriesData = [];
        const colors = ['#00E5FF', '#A855F7', '#10B981', '#F59E0B', '#EF4444', '#FBBF24'];
        let colorIndex = 0;
        
        for (const [rule, values] of seriesMap) {
            seriesData.push({
                name: rule,
                type: 'line',
                data: values,
                smooth: false,
                symbol: 'circle',
                symbolSize: 6,
                lineStyle: { width: 2, color: colors[colorIndex % colors.length] },
                connectNulls: false
            });
            colorIndex++;
        }
        
        return { xAxisData, seriesData, tooltipData };
    }
    
    formatTooltip(params, tooltipData) {
        if (!params || params.length === 0) return '';
        
        const date = params[0].axisValue;
        let html = `<div style="font-weight:600;margin-bottom:8px;">📅 ${date}</div>`;
        
        for (const param of params) {
            const rule = param.seriesName;
            const value = param.value;
            const data = tooltipData.get(rule)?.get(date);
            
            if (value === null || value === undefined) continue;
            
            html += `
                <div style="margin-bottom:6px;">
                    <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#00E5FF;margin-right:8px;"></span>
                    <span style="font-weight:500;">${rule}</span>: <span style="color:#00E5FF;">${value.toFixed(2)} MB</span>
            `;
            
            if (data?.extra) {
                html += `<div style="margin-left:18px;font-size:11px;color:#FBBF24;">`;
                for (const [key, val] of Object.entries(data.extra)) {
                    html += `${key}: ${val}<br>`;
                }
                html += `</div>`;
            }
            
            html += `</div>`;
        }
        
        return html;
    }
    
    updateStats(data, filters) {
        const casename = filters.casename;
        if (!casename || !data[casename]) return null;
        
        const dailyMetrics = data[casename].daily_metrics || {};
        const dates = filters.dates.length > 0 ? filters.dates : Object.keys(dailyMetrics);
        
        let totalMemory = 0;
        let count = 0;
        let maxMemory = -Infinity;
        let minMemory = Infinity;
        let maxMemoryRule = '';
        let minMemoryRule = '';
        
        for (const date of dates) {
            const dayData = dailyMetrics[date];
            if (!dayData) continue;
            
            for (const [rule, metrics] of Object.entries(dayData)) {
                if (filters.rule && rule !== filters.rule) continue;
                const memory = metrics.memory;
                if (memory !== undefined) {
                    totalMemory += memory;
                    count++;
                    if (memory > maxMemory) {
                        maxMemory = memory;
                        maxMemoryRule = rule;
                    }
                    if (memory < minMemory) {
                        minMemory = memory;
                        minMemoryRule = rule;
                    }
                }
            }
        }
        
        return {
            dateRange: dates.length > 0 ? `${dates[0]} ~ ${dates[dates.length - 1]}` : '无数据',
            totalMemory: totalMemory.toFixed(2),
            avgMemory: count > 0 ? (totalMemory / count).toFixed(2) : '0',
            maxMemory: maxMemory > -Infinity ? maxMemory.toFixed(2) : '0',
            maxMemoryRule,
            minMemory: minMemory < Infinity ? minMemory.toFixed(2) : '0',
            minMemoryRule
        };
    }
    
    updateOverview(data) {
        let totalCases = 0;
        let totalDays = 0;
        const allRules = new Set();
        
        for (const [casename, caseData] of Object.entries(data)) {
            totalCases++;
            const dailyMetrics = caseData.daily_metrics || {};
            const dates = Object.keys(dailyMetrics);
            totalDays = Math.max(totalDays, dates.length);
            
            for (const dayData of Object.values(dailyMetrics)) {
                for (const rule of Object.keys(dayData)) {
                    allRules.add(rule);
                }
            }
        }
        
        return {
            totalCases,
            totalRules: allRules.size,
            totalDays
        };
    }
    
    resize() {
        if (this.chart) this.chart.resize();
    }
    
    destroy() {
        if (this.chart) {
            this.chart.dispose();
            this.chart = null;
        }
    }
}