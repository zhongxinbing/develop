/**
 * 线程曲线图模块 - 处理线程数 vs 性能数据展示
 * 与单线程/多线程保持一致的实现方式
 */
class ThreadChartManager {
    constructor() {
        this.chart = null;
        this.currentChartType = 'runtime';
        this.selectedCasename = '';
        this.selectedRule = '';
        this.selectedDate = '';
        this.allCasenames = [];
        this.allRules = [];
        this.allDates = [];
        this.rawData = {};
        this.userAddedData = {};
        this.allData = {};
        
        // ID前缀：使用 'thread' 前缀区分
        this.idPrefix = 'thread';
        
        // DOM 元素
        this.casenameSelect = null;
        this.ruleSelect = null;
        this.ruleSearch = null;
        this.dateSelect = null;
        this.refreshBtn = null;
        
        // 绑定方法
        this.renderChart = this.renderChart.bind(this);
        this.updateRules = this.updateRules.bind(this);
        this.updateDates = this.updateDates.bind(this);
    }

    /**
     * 初始化线程曲线图模块
     */
    async init(rawData, userAddedData, multiData) {
        console.log('ThreadChartManager.init 开始');
        
        // 获取 DOM 元素
        this.casenameSelect = document.getElementById(`${this.idPrefix}CasenameSelect`);
        this.ruleSelect = document.getElementById(`${this.idPrefix}RuleSelect`);
        this.ruleSearch = document.getElementById(`${this.idPrefix}RuleSearch`);
        this.dateSelect = document.getElementById(`${this.idPrefix}DateSelect`);
        this.refreshBtn = document.getElementById(`refreshThreadChartBtn`);
        
        // 存储数据（线程曲线图使用多线程数据）
        this.rawData = rawData || {};
        this.userAddedData = userAddedData || {};
        this.allData = { ...this.rawData, ...this.userAddedData };
        
        // 初始化图表容器
        this.initChartContainer();
        
        // 更新选择框
        await this.updateCasenameSelect();
        await this.updateRules();
        await this.updateDates();
        
        // 初始化事件监听
        this.initEventListeners();
        
        // 自动加载第一个可用的数据
        if (this.allCasenames.length > 0) {
            this.selectedCasename = this.allCasenames[0];
            this.casenameSelect.value = this.selectedCasename;
            await this.updateRules();
            await this.updateDates();
            await this.renderChart();
        }
    }

    /**
     * 初始化图表容器
     */
    initChartContainer() {
        const container = document.getElementById('mainChart');
        if (container) {
            if (this.chart) {
                this.chart.dispose();
            }
            this.chart = echarts.init(container);
            console.log('线程曲线图图表容器初始化成功');
        } else {
            console.error('找不到图表容器 #mainChart');
        }
    }

    /**
     * 更新 Casename 选择框
     */
    async updateCasenameSelect() {
        if (!this.casenameSelect) return;
        
        // 获取所有有多线程数据的 casename
        this.allCasenames = Object.keys(this.allData).filter(name => {
            const caseData = this.allData[name];
            if (!caseData || typeof caseData !== 'object') return false;
            
            // 检查是否包含 runtime 或 memory 数据且有线程信息
            for (const type of ['runtime', 'memory']) {
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
        
        const options = this.allCasenames.map(name => 
            `<option value="${this.escapeHtml(name)}">${this.escapeHtml(name)}</option>`
        ).join('');
        
        this.casenameSelect.innerHTML = options;
        
        if (this.allCasenames.length > 0 && !this.selectedCasename) {
            this.selectedCasename = this.allCasenames[0];
            this.casenameSelect.value = this.selectedCasename;
        }
    }

    /**
     * 更新 Rule 选择框
     */
    async updateRules() {
        if (!this.ruleSelect || !this.selectedCasename) return;
        
        const caseData = this.allData[this.selectedCasename];
        if (!caseData) return;
        
        // 获取当前图表类型对应的规则
        const typeData = caseData[this.currentChartType];
        if (!typeData) {
            this.ruleSelect.innerHTML = '<option value="">暂无规则</option>';
            return;
        }
        
        // 获取所有规则，并过滤出有线程数据的
        let allRules = Object.keys(typeData).filter(rule => {
            const ruleData = typeData[rule];
            return ruleData && ruleData.all_threads && ruleData.all_threads.length > 0;
        });
        
        this.allRules = allRules.sort();
        
        // 确保 Overall 在第一位
        if (this.allRules.includes('Overall')) {
            this.allRules = ['Overall', ...this.allRules.filter(r => r !== 'Overall')];
        }
        
        // 应用搜索过滤
        const searchTerm = this.ruleSearch ? this.ruleSearch.value.toLowerCase() : '';
        const filteredRules = searchTerm 
            ? this.allRules.filter(rule => rule.toLowerCase().includes(searchTerm))
            : this.allRules;
        
        const options = filteredRules.map(rule => 
            `<option value="${this.escapeHtml(rule)}" ${this.selectedRule === rule ? 'selected' : ''}>
                ${this.escapeHtml(rule)}
            </option>`
        ).join('');
        
        this.ruleSelect.innerHTML = options || '<option value="">暂无匹配规则</option>';
        
        // 自动选择第一个规则
        if (filteredRules.length > 0 && !this.selectedRule) {
            this.selectedRule = filteredRules[0];
            this.ruleSelect.value = this.selectedRule;
        }
    }

    /**
     * 更新 Date 选择框
     */
    async updateDates() {
        if (!this.dateSelect || !this.selectedCasename || !this.selectedRule) return;
        
        const caseData = this.allData[this.selectedCasename];
        if (!caseData) return;
        
        const typeData = caseData[this.currentChartType];
        if (!typeData) return;
        
        const ruleData = typeData[this.selectedRule];
        if (!ruleData) return;
        
        // 获取日期列表
        this.allDates = (ruleData.dates || []).sort();
        
        const options = this.allDates.map(date => 
            `<option value="${date}" ${this.selectedDate === date ? 'selected' : ''}>
                ${this.formatDate(date)}
            </option>`
        ).join('');
        
        this.dateSelect.innerHTML = options || '<option value="">暂无日期</option>';
        
        // 自动选择最后一个日期（最新）
        if (this.allDates.length > 0 && !this.selectedDate) {
            this.selectedDate = this.allDates[this.allDates.length - 1];
            this.dateSelect.value = this.selectedDate;
        }
    }

    /**
     * 渲染图表
     */
    async renderChart() {
        if (!this.selectedCasename || !this.selectedRule || !this.selectedDate) {
            console.log('renderChart: 缺少必要参数', {
                casename: this.selectedCasename,
                rule: this.selectedRule,
                date: this.selectedDate
            });
            return;
        }
        
        // 确保图表容器已初始化
        if (!this.chart || this.chart.isDisposed()) {
            this.initChartContainer();
            if (!this.chart) {
                console.error('renderChart: 图表实例不存在');
                return;
            }
        }
        
        // 显示加载状态
        this.chart.showLoading({
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
                this.chart.hideLoading();
                this.drawChart(response.data.data);
            } else {
                this.chart.hideLoading();
                this.showErrorMessage(response.data.error || '获取数据失败');
            }
        } catch (error) {
            console.error('加载线程曲线图数据失败:', error);
            this.chart.hideLoading();
            this.showErrorMessage('加载数据失败: ' + (error.message || '未知错误'));
        }
    }

    /**
     * 绘制图表
     */
    drawChart(chartData) {
        if (!this.chart || this.chart.isDisposed()) {
            this.initChartContainer();
            if (!this.chart) return;
        }
        
        const { threads, runtime, memory } = chartData;
        const normalizedType = (this.currentChartType || 'runtime').toLowerCase();
        const isRuntime = normalizedType === 'runtime' || normalizedType === 'cputime' || normalizedType === 'easpletime' || normalizedType === 'easepletime' || normalizedType === 'elapsedtime' || normalizedType === 'realtime';
        const yAxisName = isRuntime ? 'Runtime (s)' : 'Memory (MB)';
        const seriesData = isRuntime ? runtime : memory;
        const seriesName = isRuntime ? 'Runtime' : 'Memory';
        const color = isRuntime ? '#00E5FF' : '#A855F7';
        
        // 检查数据是否有效
        if (!seriesData || seriesData.length === 0 || seriesData.every(v => v === null || v === undefined)) {
            this.showNoDataMessage();
            return;
        }
        
        // 处理数据：过滤掉无效值，但保留索引用于显示
        const validData = seriesData.map((v, i) => ({
            thread: threads[i],
            value: v
        }));
        
        // 计算有效数据的平均值
        const validValues = seriesData.filter(v => v !== null && v !== undefined);
        let avgValue = null;
        if (validValues.length > 0) {
            avgValue = validValues.reduce((a, b) => a + b, 0) / validValues.length;
        }
        
        // 构建 series
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
        
        // 添加平均值线
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
        
        // 监听窗口大小变化
        if (!this._resizeHandler) {
            this._resizeHandler = () => {
                if (this.chart && !this.chart.isDisposed()) {
                    this.chart.resize();
                }
            };
            window.addEventListener('resize', this._resizeHandler);
        }
    }

    /**
     * 切换图表类型
     */
    setChartType(type) {
        this.currentChartType = type;
        // 切换时重新加载数据
        this.renderChart();
    }

    /**
     * 刷新数据
     */
    async refresh() {
        this.userAddedData = {};
        this.allData = { ...this.rawData };
        await this.updateCasenameSelect();
        await this.updateRules();
        await this.updateDates();
        await this.renderChart();
    }

    /**
     * 使用指定数据刷新
     */
    async refreshWithData(rawData, userAddedData) {
        this.rawData = rawData || {};
        this.userAddedData = userAddedData || {};
        this.allData = { ...this.rawData, ...this.userAddedData };
        
        await this.updateCasenameSelect();
        await this.updateRules();
        await this.updateDates();
        await this.renderChart();
    }

    /**
     * 初始化事件监听
     */
    initEventListeners() {
        // Casename 选择变更
        if (this.casenameSelect) {
            this.casenameSelect.addEventListener('change', async (e) => {
                this.selectedCasename = e.target.value;
                this.selectedRule = '';
                this.selectedDate = '';
                await this.updateRules();
                await this.updateDates();
                await this.renderChart();
            });
        }
        
        // Rule 搜索
        if (this.ruleSearch) {
            this.ruleSearch.addEventListener('input', () => {
                this.updateRules();
            });
        }
        
        // Rule 选择变更
        if (this.ruleSelect) {
            this.ruleSelect.addEventListener('change', async (e) => {
                this.selectedRule = e.target.value;
                this.selectedDate = '';
                await this.updateDates();
                await this.renderChart();
            });
        }
        
        // Date 选择变更
        if (this.dateSelect) {
            this.dateSelect.addEventListener('change', async (e) => {
                this.selectedDate = e.target.value;
                await this.renderChart();
            });
        }
        
        // 刷新按钮
        if (this.refreshBtn) {
            this.refreshBtn.addEventListener('click', async () => {
                await this.renderChart();
            });
        }
    }

    /**
     * 显示无数据提示
     */
    showNoDataMessage() {
        if (this.chart && !this.chart.isDisposed()) {
            this.chart.setOption({
                title: {
                    show: true,
                    text: '暂无数据',
                    left: 'center',
                    top: 'center',
                    textStyle: { color: '#94A3B8', fontSize: 14 }
                }
            });
        }
    }

    /**
     * 显示错误消息
     */
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

    /**
     * 格式化日期
     */
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

    /**
     * HTML转义
     */
    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * 析构方法
     */
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

// 全局实例
window.ThreadChartManager = ThreadChartManager;