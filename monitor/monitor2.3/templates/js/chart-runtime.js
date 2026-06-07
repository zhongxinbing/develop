class RuntimeChart {
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
                name: 'Runtime (s)',
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
                const runtime = dayData[rule]?.runtime;
                if (!seriesMap.has(rule)) {
                    seriesMap.set(rule, []);
                }
                seriesMap.get(rule).push(runtime !== undefined ? runtime : null);
                
                const ruleTooltip = tooltipData.get(rule) || new Map();
                ruleTooltip.set(date, {
                    value: runtime,
                    extra: dayData[rule]?.extra || {},
                    isCrash: !dayData.Overall && rule !== 'Overall'
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
                itemStyle: {
                    color: (params) => {
                        const date = xAxisData[params.dataIndex];
                        const isCrash = tooltipData.get(rule)?.get(date)?.isCrash;
                        return isCrash ? '#EF4444' : colors[colorIndex % colors.length];
                    }
                },
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
            
            const isCrash = data?.isCrash;
            const color = isCrash ? '#EF4444' : '#00E5FF';
            
            html += `
                <div style="margin-bottom:6px;">
                    <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${color};margin-right:8px;"></span>
                    <span style="font-weight:500;">${rule}</span>: <span style="color:${color};">${value.toFixed(2)} s</span>
            `;
            
            if (data?.extra) {
                html += `<div style="margin-left:18px;font-size:11px;color:#FBBF24;">`;
                for (const [key, val] of Object.entries(data.extra)) {
                    html += `${key}: ${val}<br>`;
                }
                html += `</div>`;
            }
            
            if (isCrash) {
                html += `<div style="margin-left:18px;font-size:11px;color:#EF4444;">⚠️ Crash</div>`;
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
        
        let totalRuntime = 0;
        let count = 0;
        let maxRuntime = -Infinity;
        let minRuntime = Infinity;
        let maxRuntimeRule = '';
        let minRuntimeRule = '';
        
        for (const date of dates) {
            const dayData = dailyMetrics[date];
            if (!dayData) continue;
            
            for (const [rule, metrics] of Object.entries(dayData)) {
                if (filters.rule && rule !== filters.rule) continue;
                const runtime = metrics.runtime;
                if (runtime !== undefined) {
                    totalRuntime += runtime;
                    count++;
                    if (runtime > maxRuntime) {
                        maxRuntime = runtime;
                        maxRuntimeRule = rule;
                    }
                    if (runtime < minRuntime) {
                        minRuntime = runtime;
                        minRuntimeRule = rule;
                    }
                }
            }
        }
        
        return {
            dateRange: dates.length > 0 ? `${dates[0]} ~ ${dates[dates.length - 1]}` : '无数据',
            totalRuntime: totalRuntime.toFixed(2),
            avgRuntime: count > 0 ? (totalRuntime / count).toFixed(2) : '0',
            maxRuntime: maxRuntime > -Infinity ? maxRuntime.toFixed(2) : '0',
            maxRuntimeRule,
            minRuntime: minRuntime < Infinity ? minRuntime.toFixed(2) : '0',
            minRuntimeRule
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