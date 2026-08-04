/**
 * 线程曲线图模块 - 处理线程数 vs 性能数据展示
 */
class ThreadChartManager {
    constructor() {
        this.chart = null;
        this.currentChartType = 'cputime';
        this.selectedCasename = '';
        this.selectedRule = '';
        this.selectedDate = '';
        this.allCasenames = [];
        this.allRules = [];
        this.allDates = [];
        this.rawData = {};
        this.userAddedData = {};
        this.allData = {};
        
        this.idPrefix = 'thread';
        
        this.casenameSelect = null;
        this.ruleSelect = null;
        this.ruleSearch = null;
        this.dateSelect = null;
        this.refreshBtn = null;
        
        this.renderChart = this.renderChart.bind(this);
        this.updateRules = this.updateRules.bind(this);
        this.updateDates = this.updateDates.bind(this);
    }

    async init(rawData, userAddedData, multiData) {
        console.log('线程曲线图模块 开始', rawData);
        
        this.ruleSearch = document.getElementById(`${this.idPrefix}RuleSearch`);
        this.refreshBtn = document.getElementById(`refreshThreadChartBtn`);
        
        this.rawData = rawData || {};
        this.userAddedData = userAddedData || {};
        this.allData = { ...this.rawData, ...this.userAddedData };
        
        this.casenameSelect = new SearchableSelect({
            container: document.getElementById(`${this.idPrefix}CasenameSelect`),
            options: [],
            placeholder: '请选择 Casename...',
            onChange: async (value) => {
                if (value) {
                    this.selectedCasename = value;
                    this.selectedRule = '';
                    this.selectedDate = '';
                    await this.updateRules();
                    await this.updateDates();
                    const chart = window.mainChart || echarts.getInstanceByDom(document.getElementById('mainChart'));
                    if (chart) {
                        await this.renderChart(chart);
                    }
                }
            }
        });

        this.ruleSelect = new SearchableSelect({
            container: document.getElementById(`${this.idPrefix}RuleSelect`),
            options: [],
            placeholder: '请选择 Rule...',
            onChange: async (value) => {
                if (value) {
                    this.selectedRule = value;
                    this.selectedDate = '';
                    await this.updateDates();
                    const chart = window.mainChart || echarts.getInstanceByDom(document.getElementById('mainChart'));
                    if (chart) {
                        await this.renderChart(chart);
                    }
                }
            }
        });

        this.dateSelect = new SearchableSelect({
            container: document.getElementById(`${this.idPrefix}DateSelect`),
            options: [],
            placeholder: '请选择日期...',
            onChange: async (value) => {
                if (value) {
                    this.selectedDate = value;
                    const chart = window.mainChart || echarts.getInstanceByDom(document.getElementById('mainChart'));
                    if (chart) {
                        await this.renderChart(chart);
                    }
                }
            }
        });
        
        // ========== 移除 initChartContainer ==========
        await this.updateCasenameSelect();
        await this.updateRules();
        await this.updateDates();
        this.initEventListeners();
        
        if (this.allCasenames.length > 0) {
            this.selectedCasename = this.allCasenames[0];
            this.casenameSelect.setValue(this.selectedCasename);
            await this.updateRules();
            await this.updateDates();
            const chart = window.mainChart || echarts.getInstanceByDom(document.getElementById('mainChart'));
            if (chart) {
                await this.renderChart(chart);
            }
        }
    }
    // initChartContainer() {
    //     const container = document.getElementById('mainChart');
    //     if (container) {
    //         if (this.chart) {
    //             this.chart.dispose();
    //         }
    //         this.chart = echarts.init(container);
    //         console.log('线程曲线图图表容器初始化成功');
    //     } else {
    //         console.error('找不到图表容器 #mainChart');
    //     }
    // }

    async updateCasenameSelect() {
        if (!this.casenameSelect) return;
        
        this.allCasenames = Object.keys(this.allData).filter(name => {
            const caseData = this.allData[name];
            if (!caseData || typeof caseData !== 'object') return false;
            
            for (const type of ['cputime', 'peakmem', 'incmem', 'realtime', 'realtimeincmem']) {
                if (caseData[type] && typeof caseData[type] === 'object') {
                    const rules = Object.keys(caseData[type]);
                    for (const rule of rules) {
                        const ruleData = caseData[type][rule];
                        if (ruleData && ruleData.all_threads && ruleData.all_threads.length > 0) {
                            return true;
                        }
                    }
                }
            }
            return false;
        });
        
        const options = this.allCasenames.map(name => ({
            value: name,
            label: name
        }));
        
        this.casenameSelect.setOptions(options);
        
        if (this.allCasenames.length > 0 && !this.selectedCasename) {
            this.selectedCasename = this.allCasenames[0];
            this.casenameSelect.setValue(this.selectedCasename);
        }
    }

    async updateRules() {
        if (!this.ruleSelect || !this.selectedCasename) return;
        
        const caseData = this.allData[this.selectedCasename];
        if (!caseData) return;
        
        const typeData = caseData[this.currentChartType];
        if (!typeData) {
            this.ruleSelect.setOptions([]);
            return;
        }
        
        let allRules = Object.keys(typeData).filter(rule => {
            const ruleData = typeData[rule];
            return ruleData && ruleData.all_threads && ruleData.all_threads.length > 0;
        });
        
        this.allRules = allRules.sort();
        
        if (this.allRules.includes('Overall')) {
            this.allRules = ['Overall', ...this.allRules.filter(r => r !== 'Overall')];
        }
        
        const searchTerm = this.ruleSearch ? this.ruleSearch.value.toLowerCase() : '';
        const filteredRules = searchTerm 
            ? this.allRules.filter(rule => rule.toLowerCase().includes(searchTerm))
            : this.allRules;
        
        const options = filteredRules.map(rule => ({
            value: rule,
            label: rule
        }));
        
        this.ruleSelect.setOptions(options);
        
        if (filteredRules.length > 0 && !this.selectedRule) {
            this.selectedRule = filteredRules[0];
            this.ruleSelect.setValue(this.selectedRule);
        }
    }

    async updateDates() {
        if (!this.dateSelect || !this.selectedCasename || !this.selectedRule) return;
        
        const caseData = this.allData[this.selectedCasename];
        if (!caseData) return;
        
        const typeData = caseData[this.currentChartType];
        if (!typeData) return;
        
        const ruleData = typeData[this.selectedRule];
        if (!ruleData) return;
        
        this.allDates = (ruleData.dates || []).sort();
        
        const options = this.allDates.map(date => ({
            value: date,
            label: this.formatDate(date)
        }));
        
        this.dateSelect.setOptions(options);
        
        if (this.allDates.length > 0 && !this.selectedDate) {
            this.selectedDate = this.allDates[this.allDates.length - 1];
            this.dateSelect.setValue(this.selectedDate);
        }
    }

    async renderChart(chartInstance) {
        const chart = chartInstance || window.mainChart || echarts.getInstanceByDom(document.getElementById('mainChart'));
        
        if (!chart) {
            console.error('renderChart: 图表实例不存在');
            return;
        }
        this.chart = chart;

        if (!this.selectedCasename || !this.selectedRule || !this.selectedDate) {
            console.log('renderChart: 缺少必要参数', {
                casename: this.selectedCasename,
                rule: this.selectedRule,
                date: this.selectedDate
            });
            return;
        }
        
        chart.showLoading({
            text: '加载中...',
            color: '#00E5FF',
            textColor: '#94A3B8',
            maskColor: 'rgba(11, 15, 26, 0.6)'
        });
        
        try {
            const response = await axios.post('/api/thread/chart/data', {
                casename: this.selectedCasename,
                rule: this.selectedRule,
                date: this.selectedDate,
                toolID: window.toolId,
                mode: this.currentChartType
            });
            
            if (response.data.success) {
                chart.hideLoading();
                this.drawChart(chart, response.data.data);
            } else {
                chart.hideLoading();
                this.showErrorMessage(chart, response.data.error || '获取数据失败');
            }
        } catch (error) {
            console.error('加载线程曲线图数据失败:', error);
            chart.hideLoading();
            this.showErrorMessage(chart, '加载数据失败: ' + (error.message || '未知错误'));
        }
    }

    drawChart(chart, chartData) {
        if (!chart || chart.isDisposed()) {
            console.error('drawChart: 图表实例无效');
            return;
        }

        const { threads, cputime, peakmem, realtime, incmem, realtimeincmem } = chartData;
        const normalizedType = (this.currentChartType || 'cputime').toLowerCase();
        const isRuntime = normalizedType === 'runtime' || normalizedType === 'cputime' || normalizedType === 'realtime';
        const yAxisName = isRuntime ? 'Runtime (s)' : 'Memory (MB)';

        const seriesData = chartData[normalizedType];
        const seriesName = isRuntime ? 'Runtime' : 'Memory';
        const color = isRuntime ? '#00E5FF' : '#A855F7';
        
        if (!seriesData || seriesData.length === 0 || seriesData.every(v => v === null || v === undefined)) {
            this.showNoDataMessage(chart);
            return;
        }
        
        const validValues = seriesData.filter(v => v !== null && v !== undefined);
        let avgValue = null;
        if (validValues.length > 0) {
            avgValue = validValues.reduce((a, b) => a + b, 0) / validValues.length;
        }
        
        const series = [{
            name: seriesName,
            type: 'line',
            data: seriesData,
            smooth: false,
            symbol: 'circle',
            symbolSize: 8,
            lineStyle: { width: 3, color: color },
            itemStyle: { 
                color: color, 
                borderColor: '#0F172A', 
                borderWidth: 2,
                borderRadius: 4
            },
            areaStyle: { 
                opacity: 0.1, 
                color: color 
            },
            connectNulls: false,
            emphasis: { focus: 'series' }
        }];
        
        if (avgValue !== null) {
            series.push({
                name: '平均值',
                type: 'line',
                data: Array(seriesData.length).fill(avgValue),
                smooth: false,
                symbol: 'none',
                lineStyle: { 
                    width: 2, 
                    color: '#F59E0B',
                    type: 'dashed'
                },
                itemStyle: { color: '#F59E0B' },
                emphasis: { focus: 'none' },
                z: 1
            });
        }
        
        const option = {
            backgroundColor: 'transparent',
            tooltip: {
                trigger: 'axis',
                axisPointer: { type: 'shadow' },
                backgroundColor: 'rgba(11, 15, 26, 0.95)',
                borderColor: '#00E5FF',
                borderWidth: 1,
                textStyle: { color: '#F1F5F9', fontSize: 12 },
                formatter: (params) => {
                    if (!params || params.length === 0) return '';
                    const dataIndex = params[0].dataIndex;
                    const thread = threads[dataIndex] || 'N/A';
                    const value = params[0].value;
                    const unit = isRuntime ? 's' : 'MB';
                    
                    let html = `<div style="font-weight:600;margin-bottom:8px;">🧵 线程数: ${thread}</div>`;
                    
                    for (const p of params) {
                        const val = p.value;
                        const name = p.seriesName;
                        const color = p.color;
                        html += `<div style="display:flex;justify-content:space-between;gap:16px;margin-bottom:4px;">
                            <span style="color:${color}">● ${this.escapeHtml(name)}</span>
                            <span style="font-family:monospace;font-weight:600;">
                                ${val !== null && val !== undefined ? Number(val).toFixed(2) : 'N/A'} ${unit}
                            </span>
                        </div>`;
                    }
                    
                    return html;
                }
            },
            legend: {
                data: series.map(s => s.name),
                textStyle: { color: '#F1F5F9' },
                left: 10,
                top: 0,
                backgroundColor: 'rgba(11, 15, 26, 0.8)',
                borderRadius: 8
            },
            grid: {
                left: '3%',
                right: '5%',
                top: '15%',
                bottom: '8%',
                containLabel: true,
                backgroundColor: 'transparent'
            },
            xAxis: {
                type: 'category',
                name: '线程数',
                data: threads,
                axisLabel: { 
                    fontSize: 12, 
                    color: '#94A3B8',
                    fontWeight: 500
                },
                axisLine: { lineStyle: { color: '#334155' } },
                axisTick: { show: false },
                axisPointer: { show: true }
            },
            yAxis: {
                type: 'value',
                name: yAxisName,
                nameTextStyle: { color: '#94A3B8' },
                axisLabel: { color: '#94A3B8' },
                splitLine: { lineStyle: { color: '#1E293B' } },
                axisLine: { show: false },
                axisTick: { show: false }
            },
            series: series,
            toolbox: {
                show: true,
                feature: {
                    saveAsImage: { title: '保存图片' },
                    restore: { title: '重置' }
                },
                iconStyle: { borderColor: '#94A3B8' },
                emphasis: { iconStyle: { borderColor: '#00E5FF' } }
            }
        };
        
        this.chart.setOption(option, true);
        
        if (!this._resizeHandler) {
            this._resizeHandler = () => {
                if (this.chart && !this.chart.isDisposed()) {
                    this.chart.resize();
                }
            };
            window.addEventListener('resize', this._resizeHandler);
        }
    }

    setChartType(type) {
        this.currentChartType = type;
        this.renderChart();
    }

    async refresh() {
        this.userAddedData = {};
        this.allData = { ...this.rawData };
        await this.updateCasenameSelect();
        await this.updateRules();
        await this.updateDates();
        await this.renderChart();
    }

    async refreshWithData(rawData, userAddedData) {
        this.rawData = rawData || {};
        this.userAddedData = userAddedData || {};
        this.allData = { ...this.rawData, ...this.userAddedData };
        
        await this.updateCasenameSelect();
        await this.updateRules();
        await this.updateDates();
        await this.renderChart();
    }

    initEventListeners() {
        if (this.ruleSearch) {
            this.ruleSearch.addEventListener('input', () => {
                this.updateRules();
            });
        }
        
        if (this.refreshBtn) {
            this.refreshBtn.addEventListener('click', async () => {
                await this.renderChart();
            });
        }
    }

    showNoDataMessage() {
        if (this.chart && !this.chart.isDisposed()) {
            this.chart.clear();
            this.chart.setOption({
                graphic: [{
                    type: 'text',
                    left: 'center',
                    top: 'center',
                    style: {
                        text: '暂无数据',
                        fill: '#94A3B8',
                        fontSize: 14
                    }
                }]
            });
        }
    }

    showErrorMessage(message) {
        if (this.chart && !this.chart.isDisposed()) {
            this.chart.setOption({
                title: {
                    show: true,
                    text: message,
                    left: 'center',
                    top: 'center',
                    textStyle: { color: '#EF4444', fontSize: 14 }
                }
            });
        }
    }

    formatDate(dateStr) {
        if (!dateStr) return '';
        if (dateStr.includes('_user')) {
            return dateStr.replace('_user', ' (用户)');
        }
        if (dateStr.length === 8 && /^\d+$/.test(dateStr)) {
            return `${dateStr.slice(0,4)}-${dateStr.slice(4,6)}-${dateStr.slice(6,8)}`;
        }
        return dateStr;
    }

    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    dispose() {
        if (this._resizeHandler) {
            window.removeEventListener('resize', this._resizeHandler);
            this._resizeHandler = null;
        }
        if (this.chart && !this.chart.isDisposed()) {
            this.chart.dispose();
            this.chart = null;
        }
    }
}

window.ThreadChartManager = ThreadChartManager;