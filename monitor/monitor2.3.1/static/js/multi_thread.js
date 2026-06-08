/**
 * 多线程模块 - 处理多线程数据展示和图表渲染
 */
class MultiThreadManager {
    constructor() {
        this.chart = null;
        this.currentChartType = 'runtime';
        this.selectedCasename = '';
        this.selectedRules = ['Overall'];
        this.selectedDates = [];
        this.selectedThreads = [2, 4];
        this.availableThreads = [];
        this.allDates = [];
        this.allRules = [];
        this.rawData = {};
        this.userAddedData = {};
        this.allData = {};
        
        // ID前缀：使用 'multi' 前缀区分
        this.idPrefix = 'multi';
        
        // DOM 元素（延迟初始化，在 init 中获取）
        this.casenameSelect = null;
        this.ruleSelect = null;
        this.ruleSearch = null;
        this.datePickerBtn = null;
        this.latest50Btn = null;
        this.addDataBtn = null;
        
        // 线程选择器元素
        this.threadSelectorContainer = null;
        this.threadOptions = null;
        this.selectedThreadsDisplay = null;
        this.threadSearchInput = null;
        
        // 对比面板元素
        this.compCasenameSelect = null;
        this.confirmCompareBtn = null;
        this.exportCompareBtn = null;
        this.date1Select = null;
        this.date2Select = null;
        this.compareModeSelect = null;
        this.dimensionSelect = null;
        this.runtimeThreshold = null;
        this.memoryThreshold = null;
        this.errorModeSelect = null;
        
        // 绑定方法（直接绑定，不调用外部方法）
        this.renderChart = this.renderChart.bind(this);
        this.updateRulesAndDates = this.updateRulesAndDates.bind(this);
        this.performComparison = this.performComparison.bind(this);
        this.exportComparison = this.exportComparison.bind(this);
        this.toggleDropdown = this.toggleDropdown.bind(this);
        this.selectAllThreads = this.selectAllThreads.bind(this);
        this.clearAllThreads = this.clearAllThreads.bind(this);
    }

    /**
     * 初始化多线程模块
     */
    async init(rawData, userAddedData) {
        console.log('MultiThreadManager.init 开始');
        
        // 获取 DOM 元素
        this.casenameSelect = document.getElementById(`${this.idPrefix}CasenameSelect`);
        this.ruleSelect = document.getElementById(`${this.idPrefix}RuleSelect`);
        this.ruleSearch = document.getElementById(`${this.idPrefix}RuleSearch`);
        this.datePickerBtn = document.getElementById(`${this.idPrefix}DatePickerBtn`);
        this.latest50Btn = document.getElementById(`${this.idPrefix}Latest50Btn`);
        this.addDataBtn = document.getElementById(`${this.idPrefix}AddDataBtn`);
        
        // 线程选择器元素
        this.threadSelectorContainer = document.getElementById(`${this.idPrefix}ThreadSelectorContainer`);
        this.threadOptions = document.getElementById(`${this.idPrefix}ThreadOptions`);
        this.selectedThreadsDisplay = document.getElementById(`${this.idPrefix}SelectedThreadsDisplay`);
        this.threadSearchInput = document.getElementById(`${this.idPrefix}ThreadSearchInput`);
        
        // 对比面板元素
        this.compCasenameSelect = document.getElementById(`${this.idPrefix}CompCasenameSelect`);
        this.confirmCompareBtn = document.getElementById(`${this.idPrefix}ConfirmCompareBtn`);
        this.exportCompareBtn = document.getElementById(`${this.idPrefix}ExportCompareBtn`);
        this.date1Select = document.getElementById(`${this.idPrefix}Date1Select`);
        this.date2Select = document.getElementById(`${this.idPrefix}Date2Select`);
        this.compareModeSelect = document.getElementById(`${this.idPrefix}CompareModeSelect`);
        this.dimensionSelect = document.getElementById(`${this.idPrefix}DimensionSelect`);
        this.runtimeThreshold = document.getElementById(`${this.idPrefix}RuntimeThreshold`);
        this.memoryThreshold = document.getElementById(`${this.idPrefix}MemoryThreshold`);
        this.errorModeSelect = document.getElementById(`${this.idPrefix}ErrorModeSelect`);
        
        // 清理和验证数据格式
        let cleanRawData = {};
        
        if (rawData && typeof rawData === 'object') {
            for (const [key, value] of Object.entries(rawData)) {
                // 跳过内部字段
                if (key === 'dataFiles' || key === '__multi_processed_logs__' || key === 'signal' || key === 'multi') {
                    continue;
                }
                
                // 验证多线程数据格式：必须有 daily_metrics 且内部有 thread_metrics
                if (value && typeof value === 'object' && value.daily_metrics) {
                    // 检查是否包含多线程特征数据
                    let hasMultiThread = false;
                    for (const dateMetrics of Object.values(value.daily_metrics)) {
                        if (dateMetrics && typeof dateMetrics === 'object') {
                            for (const ruleData of Object.values(dateMetrics)) {
                                if (ruleData && ruleData.thread_metrics) {
                                    hasMultiThread = true;
                                    break;
                                }
                            }
                        }
                        if (hasMultiThread) break;
                    }
                    
                    if (hasMultiThread) {
                        cleanRawData[key] = value;
                    } else {
                        console.log(`MultiThread: 项目 ${key} 没有多线程数据特征，跳过`);
                    }
                }
            }
        }
        
        this.rawData = cleanRawData;
        this.userAddedData = userAddedData || {};
        this.allData = { ...this.rawData, ...this.userAddedData };
        
        console.log('MultiThreadManager 处理后数据 keys:', Object.keys(this.allData));
        
        this.updateCasenameSelect();
        await this.updateRulesAndDates();
        this.initThreadSelector();
        this.initEventListeners();
        this.initDatePickerModal();
        this.initAddDataModal();
        
        if (this.allDates.length > 0) {
            this.selectLatest50Days();
        }
        
        console.log('MultiThreadManager.init 完成', { 
            allDates: this.allDates.length, 
            allRules: this.allRules.length,
            availableThreads: this.availableThreads 
        });
    }

    /**
     * 更新Casename选择框
     */
    updateCasenameSelect() {
        if (!this.casenameSelect) return;
        
        // 只显示有多线程数据的项目
        const casenames = Object.keys(this.allData).filter(name => {
            const data = this.allData[name];
            if (!data || typeof data !== 'object' || !data.daily_metrics) return false;
            
            // 检查是否包含 thread_metrics
            for (const dateMetrics of Object.values(data.daily_metrics)) {
                if (dateMetrics && typeof dateMetrics === 'object') {
                    for (const ruleData of Object.values(dateMetrics)) {
                        if (ruleData && ruleData.thread_metrics) {
                            return true;
                        }
                    }
                }
            }
            return false;
        });
        
        const options = casenames.map(name => 
            `<option value="${this.escapeHtml(name)}">${this.escapeHtml(name)}</option>`
        ).join('');
        
        this.casenameSelect.innerHTML = options;
        if (casenames.length > 0 && !this.selectedCasename) {
            this.selectedCasename = casenames[0];
            this.casenameSelect.value = this.selectedCasename;
        }
    }
    
    /**
     * 更新Rules和Dates
     */
    async updateRulesAndDates() {
        if (!this.selectedCasename || !this.allData[this.selectedCasename]) {
            console.log('updateRulesAndDates: 无有效的 casename', this.selectedCasename);
            return;
        }
        
        const caseData = this.allData[this.selectedCasename];
        const dailyMetrics = caseData.daily_metrics || {};
        
        const rulesSet = new Set();
        const datesSet = new Set();
        const threadsSet = new Set();
        
        Object.keys(dailyMetrics).forEach(date => {
            datesSet.add(date);
            const metrics = dailyMetrics[date];
            Object.keys(metrics).forEach(rule => {
                rulesSet.add(rule);
                const ruleData = metrics[rule];
                if (ruleData && ruleData.thread_metrics) {
                    Object.keys(ruleData.thread_metrics).forEach(tk => {
                        try {
                            threadsSet.add(parseInt(tk));
                        } catch (e) {
                            threadsSet.add(0);
                        }
                    });
                }
            });
        });
        
        this.allRules = Array.from(rulesSet).sort();
        this.allDates = Array.from(datesSet).sort();
        this.availableThreads = Array.from(threadsSet).sort((a, b) => a - b);
        
        // 确保 Overall 在第一位
        if (this.allRules.includes('Overall')) {
            this.allRules = ['Overall', ...this.allRules.filter(r => r !== 'Overall')];
        }
        
        // 如果没有可用线程，使用默认值
        if (this.availableThreads.length === 0) {
            this.availableThreads = [2, 4];
        }
        
        // 默认选择所有线程（但限制最多显示5个）
        this.selectedThreads = [...this.availableThreads].slice(0, 5);
        
        this.updateRuleSelect();
        this.renderThreadOptions();
        this.updateDateSelects();
        this.updateOverview();
    }
    
    /**
     * 更新规则选择框
     */
    updateRuleSelect() {
        if (!this.ruleSelect) return;
        
        const searchTerm = this.ruleSearch ? this.ruleSearch.value.toLowerCase() : '';
        const filteredRules = searchTerm 
            ? this.allRules.filter(rule => rule.toLowerCase().includes(searchTerm))
            : this.allRules;
        
        const options = filteredRules.map(rule => 
            `<option value="${this.escapeHtml(rule)}" ${this.selectedRules.includes(rule) ? 'selected' : ''}>
                ${this.escapeHtml(rule)}
            </option>`
        ).join('');
        
        this.ruleSelect.innerHTML = options;
        this.ruleSelect.multiple = true;
        this.ruleSelect.size = 5;
    }
    
    /**
     * 更新日期选择框
     */
    updateDateSelects() {
        if (this.date1Select) {
            const options = this.allDates.map(date => 
                `<option value="${date}">${this.formatDate(date)}</option>`
            ).join('');
            this.date1Select.innerHTML = options;
        }
        
        if (this.date2Select) {
            const options = this.allDates.map(date => 
                `<option value="${date}">${this.formatDate(date)}</option>`
            ).join('');
            this.date2Select.innerHTML = options;
            if (this.allDates.length > 1) {
                this.date2Select.value = this.allDates[this.allDates.length - 1];
            }
        }
    }
    
    /**
     * 更新项目概况
     */
    updateOverview() {
        const totalCases = Object.keys(this.allData).length;
        const totalRules = this.allRules.length;
        const totalDays = this.allDates.length;
        
        const totalCasesEl = document.getElementById('totalCases');
        const totalRulesEl = document.getElementById('totalRules');
        const totalDaysEl = document.getElementById('totalDays');
        
        if (totalCasesEl) totalCasesEl.textContent = totalCases;
        if (totalRulesEl) totalRulesEl.textContent = totalRules;
        if (totalDaysEl) totalDaysEl.textContent = totalDays;
    }
    
    /**
     * 渲染线程选项
     */
    renderThreadOptions() {
        if (!this.threadOptions) return;
        
        if (this.availableThreads.length === 0) {
            this.threadOptions.innerHTML = '<div style="padding: 12px; text-align: center; color: #94A3B8;">暂无线程数据</div>';
            return;
        }
        
        this.threadOptions.innerHTML = this.availableThreads.map(thread => `
            <label class="multi-select-option" style="display: flex; align-items: center; gap: 8px; padding: 8px 12px; cursor: pointer;">
                <input type="checkbox" value="${thread}" 
                    ${this.selectedThreads.includes(thread) ? 'checked' : ''}
                    onchange="window.multiThreadManager && window.multiThreadManager.toggleThreadSelection(${thread}, this.checked)">
                <span>${thread} 线程</span>
            </label>
        `).join('');
        
        this.updateSelectedThreadsDisplay();
    }
    
    /**
     * 切换线程选择
     */
    toggleThreadSelection(thread, isSelected) {
        if (isSelected) {
            if (!this.selectedThreads.includes(thread)) {
                this.selectedThreads.push(thread);
            }
        } else {
            this.selectedThreads = this.selectedThreads.filter(t => t !== thread);
        }
        this.selectedThreads.sort((a, b) => a - b);
        this.updateSelectedThreadsDisplay();
        this.renderChart();
    }
    
    /**
     * 更新线程显示
     */
    updateSelectedThreadsDisplay() {
        if (!this.selectedThreadsDisplay) return;
        
        if (this.selectedThreads.length === 0) {
            this.selectedThreadsDisplay.textContent = '未选择';
        } else if (this.selectedThreads.length <= 3) {
            this.selectedThreadsDisplay.textContent = this.selectedThreads.map(t => `${t}线程`).join(', ');
        } else {
            this.selectedThreadsDisplay.textContent = `${this.selectedThreads.length}个线程`;
        }
    }
    
    /**
     * 全选所有线程
     */
    selectAllThreads() {
        this.selectedThreads = [...this.availableThreads];
        this.renderThreadOptions();
        this.renderChart();
    }
    
    /**
     * 清空所有线程
     */
    clearAllThreads() {
        this.selectedThreads = [];
        this.renderThreadOptions();
        this.renderChart();
    }
    
    /**
     * 初始化线程选择器
     */
    initThreadSelector() {
        if (this.threadSelectorContainer) {
            this.threadSelectorContainer.style.display = 'block';
        }
        
        if (this.threadSearchInput) {
            this.threadSearchInput.addEventListener('input', (e) => {
                this.filterThreadOptions(e.target.value);
            });
        }
    }
    
    /**
     * 过滤线程选项
     */
    filterThreadOptions(searchTerm) {
        const options = document.querySelectorAll('.multi-select-option');
        const term = searchTerm.toLowerCase();
        
        options.forEach(option => {
            const text = option.querySelector('span')?.textContent.toLowerCase() || '';
            if (term === '' || text.includes(term)) {
                option.style.display = '';
            } else {
                option.style.display = 'none';
            }
        });
    }
    
    /**
     * 选择最近50天
     */
    selectLatest50Days() {
        this.selectedDates = this.allDates.slice(-50);
        this.updateDatePickerModal();
        this.renderChart();
    }
    
    /**
     * 渲染图表
     */
    async renderChart() {
        if (!this.selectedCasename || !this.chart) {
            console.log('renderChart: 缺少必要参数', { 
                selectedCasename: this.selectedCasename, 
                hasChart: !!this.chart 
            });
            return;
        }
        
        if (this.selectedRules.length === 0) {
            this.selectedRules = ['Overall'];
        }
        
        if (this.selectedDates.length === 0) {
            this.selectedDates = this.allDates.slice(-50);
        }
        
        if (this.selectedThreads.length === 0 && this.availableThreads.length > 0) {
            this.selectedThreads = [this.availableThreads[0]];
        }
        
        // 显示加载状态
        this.chart.showLoading({
            text: '加载中...',
            color: '#00E5FF',
            textColor: '#94A3B8',
            maskColor: 'rgba(11, 15, 26, 0.6)'
        });
        
        try {
            const requestData = {
                raw_data: this.allData,
                casename: this.selectedCasename,
                rules: this.selectedRules,
                dates: this.selectedDates,
                mode: 'multi',
                chart_type: this.currentChartType,
                selected_threads: this.selectedThreads
            };
            
            const response = await axios.post('/api/chart/data', requestData);
            
            if (response.data.success) {
                let chartData = response.data.data;
                if (typeof chartData === 'string') {
                    chartData = JSON.parse(chartData);
                }
                
                this.chart.hideLoading();
                
                if (Object.keys(chartData.rules || {}).length === 0) {
                    this.showNoDataMessage();
                } else {
                    this.drawChart(chartData);
                    this.updateStatistics(chartData);
                }
            } else {
                console.error('获取图表数据失败:', response.data.error);
                this.chart.hideLoading();
                this.showErrorMessage(response.data.error || '获取数据失败');
            }
        } catch (error) {
            console.error('获取图表数据失败:', error);
            this.chart.hideLoading();
            this.showErrorMessage('获取图表数据失败: ' + (error.message || '未知错误'));
        }
    }
    
    /**
     * 绘制图表
     */
    drawChart(chartData) {
        const { dates, rules, crash_dates } = chartData;
        const isRuntime = this.currentChartType === 'runtime';
        const yAxisName = isRuntime ? 'Runtime (s)' : 'Memory (MB)';
        
        const crashDatesSet = new Set(crash_dates || []);
        const formattedDates = dates.map(d => this.formatDate(d));
        
        // 线程颜色映射
        const threadColors = {
            0: '#00E5FF', 2: '#A855F7', 4: '#10B981',
            6: '#F59E0B', 8: '#EF4444', 16: '#8B5CF6',
            32: '#EC4899', 64: '#14B8A6', 128: '#F97316'
        };
        
        const series = [];
        for (const [seriesName, ruleData] of Object.entries(rules)) {
            const values = ruleData.values || [];
            const thread = ruleData.thread || 0;
            const color = threadColors[thread] || '#A855F7';
            
            series.push({
                name: seriesName,
                type: 'line',
                data: values,
                smooth: false,
                symbol: 'circle',
                symbolSize: 6,
                connectNulls: false,
                lineStyle: { width: 2, color: color },
                itemStyle: { color: color, borderColor: '#0F172A', borderWidth: 1 },
                emphasis: { focus: 'series' },
                tooltip: {
                    formatter: (params) => {
                        if (!params || params.length === 0) return '';
                        const dataIndex = params[0].dataIndex;
                        const date = dates[dataIndex];
                        const value = values[dataIndex];
                        
                        let html = `<div style="font-weight:600;margin-bottom:8px;">${this.formatDate(date)}</div>`;
                        html += `<div style="display:flex;justify-content:space-between;gap:16px;">
                            <span style="color:${color}">●</span>
                            <span>${this.escapeHtml(seriesName)}:</span>
                            <span style="font-family:monospace;font-weight:600;">${value !== null && value !== undefined ? value.toFixed(2) : 'N/A'}</span>
                        </div>`;
                        
                        if (crashDatesSet.has(date)) {
                            html += `<div style="color:#EF4444;font-size:11px;margin-top:4px;">⚠️ Crash - 缺少数据</div>`;
                        }
                        
                        return html;
                    }
                }
            });
        }
        
        const option = {
            backgroundColor: 'transparent',
            tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
            legend: {
                data: series.map(s => s.name),
                textStyle: { color: '#F1F5F9' },
                type: 'scroll',
                right: 10,
                top: 0,
                pageIconColor: '#00E5FF',
                pageTextStyle: { color: '#F1F5F9' },
                pageIconSize: 12,
                pageFormatter: '{current}/{total}'
            },
            grid: {
                left: '3%',
                right: '8%',
                top: '18%',
                bottom: '8%',
                containLabel: true
            },
            xAxis: {
                type: 'category',
                name: '日期',
                data: formattedDates,
                axisLabel: {
                    rotate: dates.length > 30 ? 45 : 0,
                    fontSize: 10,
                    color: '#94A3B8',
                    interval: dates.length > 50 ? Math.floor(dates.length / 20) : 0
                },
                axisLine: { lineStyle: { color: '#334155' } },
                axisTick: { show: false }
            },
            yAxis: {
                type: 'value',
                name: yAxisName,
                nameTextStyle: { color: '#94A3B8' },
                axisLabel: { color: '#94A3B8' },
                splitLine: { lineStyle: { color: '#1E293B' } }
            },
            series: series
        };
        
        this.chart.setOption(option, true);
        
        // 监听窗口大小变化
        window.addEventListener('resize', () => {
            if (this.chart) {
                this.chart.resize();
            }
        });
    }
    
    /**
     * 更新统计信息
     */
    updateStatistics(chartData) {
        const { dates, overall_data } = chartData;
        const isRuntime = this.currentChartType === 'runtime';
        
        if (!overall_data || !overall_data.values) {
            return;
        }
        
        const values = overall_data.values.filter(v => v !== null && v !== undefined);
        if (values.length === 0) return;
        
        const total = values.reduce((a, b) => a + b, 0);
        const avg = total / values.length;
        const max = Math.max(...values);
        const min = Math.min(...values);
        
        const dateRangeEl = document.getElementById('dateRange');
        const totalValueEl = document.getElementById('totalValue');
        const avgValueEl = document.getElementById('avgValue');
        const maxValueEl = document.getElementById('maxValue');
        const minValueEl = document.getElementById('minValue');
        const totalLabel = document.getElementById('totalLabel');
        const avgLabel = document.getElementById('avgLabel');
        
        if (dateRangeEl) {
            dateRangeEl.textContent = dates.length > 0 
                ? `${this.formatDate(dates[0])} ~ ${this.formatDate(dates[dates.length-1])}` 
                : '-';
        }
        if (totalValueEl) totalValueEl.textContent = total.toFixed(2);
        if (avgValueEl) avgValueEl.textContent = avg.toFixed(2);
        if (maxValueEl) maxValueEl.textContent = max.toFixed(2);
        if (minValueEl) minValueEl.textContent = min.toFixed(2);
        
        if (totalLabel) totalLabel.textContent = isRuntime ? 'Total Runtime' : 'Total Memory';
        if (avgLabel) avgLabel.textContent = isRuntime ? 'Average Runtime' : 'Average Memory';
    }
    
    /**
     * 切换图表类型
     */
    setChartType(type) {
        this.currentChartType = type;
        this.renderChart();
    }
    
    /**
     * 使用指定数据刷新
     */
    async refreshWithData(rawData, userAddedData) {
        this.rawData = rawData || {};
        this.userAddedData = userAddedData || {};
        this.allData = { ...this.rawData, ...this.userAddedData };
        this.selectedRules = ['Overall'];
        
        this.updateCasenameSelect();
        await this.updateRulesAndDates();
        this.selectedDates = this.allDates.slice(-50);
        await this.renderChart();
        this.updateOverview();
    }
    
    /**
     * 刷新数据
     */
    async refresh() {
        this.userAddedData = {};
        this.allData = { ...this.rawData };
        this.selectedRules = ['Overall'];
        this.selectedDates = this.allDates.slice(-50);
        this.updateCasenameSelect();
        await this.updateRulesAndDates();
        await this.renderChart();
        this.updateOverview();
    }
    
    /**
     * 初始化事件监听
     */
    initEventListeners() {
        if (this.casenameSelect) {
            this.casenameSelect.addEventListener('change', async (e) => {
                this.selectedCasename = e.target.value;
                await this.updateRulesAndDates();
                this.selectedRules = ['Overall'];
                this.selectedDates = this.allDates.slice(-50);
                await this.renderChart();
                this.updateOverview();
            });
        }
        
        if (this.ruleSearch) {
            this.ruleSearch.addEventListener('input', () => {
                this.updateRuleSelect();
            });
        }
        
        if (this.ruleSelect) {
            this.ruleSelect.addEventListener('change', (e) => {
                this.selectedRules = Array.from(this.ruleSelect.selectedOptions).map(opt => opt.value);
                this.renderChart();
            });
        }
        
        if (this.latest50Btn) {
            this.latest50Btn.addEventListener('click', () => {
                this.selectLatest50Days();
            });
        }
        
        // 对比按钮
        if (this.confirmCompareBtn) {
            this.confirmCompareBtn.addEventListener('click', this.performComparison);
        }
        
        if (this.exportCompareBtn) {
            this.exportCompareBtn.addEventListener('click', this.exportComparison);
        }
        
        if (this.compCasenameSelect) {
            this.compCasenameSelect.addEventListener('change', (e) => {
                if (this.casenameSelect) {
                    this.casenameSelect.value = e.target.value;
                    this.selectedCasename = e.target.value;
                    this.updateRulesAndDates();
                }
            });
        }
    }
    
    /**
     * 执行数据对比
     */
    async performComparison() {
        const date1 = this.date1Select ? this.date1Select.value : '';
        const date2 = this.date2Select ? this.date2Select.value : '';
        const compareMode = this.compareModeSelect ? this.compareModeSelect.value : 'all';
        const dimension = this.dimensionSelect ? this.dimensionSelect.value : 'all';
        const runtimeThresholdVal = parseFloat(this.runtimeThreshold?.value || 0);
        const memoryThresholdVal = parseFloat(this.memoryThreshold?.value || 0);
        const errorMode = this.errorModeSelect ? this.errorModeSelect.value : 'absolute';
        
        let rulesToCompare = [];
        if (compareMode === 'all') {
            rulesToCompare = this.allRules;
        } else {
            rulesToCompare = [compareMode];
        }
        
        if (!date1 || !date2) {
            this.showToast('请选择两个日期进行对比', 'error');
            return;
        }
        
        try {
            const response = await axios.post('/api/comparison', {
                raw_data: this.allData,
                casename: this.selectedCasename,
                date1: date1,
                date2: date2,
                rules: rulesToCompare,
                compare_mode: compareMode,
                dimension: dimension,
                runtime_threshold: runtimeThresholdVal,
                memory_threshold: memoryThresholdVal,
                error_mode: errorMode
            });
            
            if (response.data.success) {
                this.renderComparisonResults(response.data.data);
                const comparisonResults = document.getElementById('comparisonResults');
                if (comparisonResults) comparisonResults.style.display = 'block';
                
                const chartContainer = document.querySelector('.chart-container');
                if (chartContainer) chartContainer.style.display = 'none';
                
                const statsGrid = document.getElementById('statsGrid');
                if (statsGrid) statsGrid.style.display = 'none';
                
                const overviewCard = document.querySelector('.overview-card');
                if (overviewCard) overviewCard.style.display = 'none';
            }
        } catch (error) {
            console.error('执行对比失败:', error);
            this.showToast('执行对比失败', 'error');
        }
    }
    
    /**
     * 渲染对比结果
     */
    renderComparisonResults(result) {
        const stats = result.statistics;
        const comparisons = result.comparisons;
        
        const statsGrid = document.getElementById('comparisonStatsGrid');
        if (statsGrid) {
            statsGrid.innerHTML = `
                <div class="comparison-stat-card">
                    <h4>Runtime 增加 Rule</h4>
                    <div class="comparison-stat-value">${stats.runtime_increased.length}</div>
                </div>
                <div class="comparison-stat-card">
                    <h4>Runtime 减少 Rule</h4>
                    <div class="comparison-stat-value">${stats.runtime_decreased.length}</div>
                </div>
                <div class="comparison-stat-card">
                    <h4>Memory 增加 Rule</h4>
                    <div class="comparison-stat-value">${stats.memory_increased.length}</div>
                </div>
                <div class="comparison-stat-card">
                    <h4>Memory 减少 Rule</h4>
                    <div class="comparison-stat-value">${stats.memory_decreased.length}</div>
                </div>
                <div class="comparison-stat-card">
                    <h4>平均 Runtime 变化率</h4>
                    <div class="comparison-stat-value">${stats.avg_runtime_change.toFixed(2)}%</div>
                </div>
                <div class="comparison-stat-card">
                    <h4>平均 Memory 变化率</h4>
                    <div class="comparison-stat-value">${stats.avg_memory_change.toFixed(2)}%</div>
                </div>
            `;
        }
        
        const tableBody = document.getElementById('comparisonTableBody');
        if (tableBody) {
            tableBody.innerHTML = comparisons.map(comp => `
                <tr class="${comp.is_out_of_tolerance ? 'out-of-tolerance' : ''}">
                    <td>${this.escapeHtml(comp.rule)}</td>
                    <td>R: ${comp.date1_value.runtime?.toFixed(2) || 'N/A'}<br>M: ${comp.date1_value.memory?.toFixed(2) || 'N/A'}</td>
                    <td>R: ${comp.date2_value.runtime?.toFixed(2) || 'N/A'}<br>M: ${comp.date2_value.memory?.toFixed(2) || 'N/A'}</td>
                    <td>R: ${comp.difference.runtime?.toFixed(2) || 'N/A'}<br>M: ${comp.difference.memory?.toFixed(2) || 'N/A'}</td>
                    <td>R: ${comp.percentage.runtime?.toFixed(2) || 'N/A'}%<br>M: ${comp.percentage.memory?.toFixed(2) || 'N/A'}%</td>
                    <td>${comp.is_out_of_tolerance ? '<span class="status-badge warning">超差</span>' : '<span class="status-badge">正常</span>'}</td>
                </tr>
            `).join('');
        }
    }
    
    /**
     * 导出对比结果
     */
    exportComparison() {
        const tableBody = document.getElementById('comparisonTableBody');
        if (!tableBody) return;
        
        const rows = Array.from(tableBody.querySelectorAll('tr'));
        const csvData = rows.map(row => {
            const cells = Array.from(row.querySelectorAll('td'));
            return cells.map(cell => cell.textContent.trim().replace(/\n/g, ';')).join(',');
        });
        
        const headers = ['Rule', '日期1值', '日期2值', '绝对差值', '百分比变化', '状态'];
        const csvContent = [headers, ...csvData].map(row => row.join(',')).join('\n');
        
        const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.href = url;
        link.setAttribute('download', `comparison_${new Date().toISOString().slice(0,19)}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }
    
    /**
     * 初始化日期选择弹窗
     */
    initDatePickerModal() {
        const modal = document.getElementById('datePickerModal');
        const openBtn = this.datePickerBtn;
        const closeBtn = document.getElementById('closeDateModalBtn');
        const cancelBtn = document.getElementById('cancelDateBtn');
        const confirmBtn = document.getElementById('confirmDateBtn');
        const selectAllCheckbox = document.getElementById('selectAllDates');
        const dateSearch = document.getElementById('dateSearch');
        
        if (!openBtn || !modal) return;
        
        openBtn.addEventListener('click', () => {
            this.updateDatePickerModal();
            modal.classList.add('active');
            document.body.style.overflow = 'hidden';
        });
        
        const closeModal = () => {
            modal.classList.remove('active');
            document.body.style.overflow = '';
        };
        
        if (closeBtn) closeBtn.addEventListener('click', closeModal);
        if (cancelBtn) cancelBtn.addEventListener('click', closeModal);
        
        if (confirmBtn) {
            confirmBtn.addEventListener('click', () => {
                const checkboxes = document.querySelectorAll('.date-checkbox:checked');
                this.selectedDates = Array.from(checkboxes).map(cb => cb.value);
                closeModal();
                this.renderChart();
            });
        }
        
        if (selectAllCheckbox) {
            selectAllCheckbox.addEventListener('change', (e) => {
                const checkboxes = document.querySelectorAll('.date-checkbox');
                checkboxes.forEach(cb => cb.checked = e.target.checked);
            });
        }
        
        if (dateSearch) {
            dateSearch.addEventListener('input', (e) => {
                const searchTerm = e.target.value.toLowerCase();
                const items = document.querySelectorAll('.date-item');
                items.forEach(item => {
                    const date = item.querySelector('.date-checkbox')?.value || '';
                    if (date.toLowerCase().includes(searchTerm)) {
                        item.style.display = '';
                    } else {
                        item.style.display = 'none';
                    }
                });
            });
        }
    }
    
    /**
     * 更新日期选择弹窗内容
     */
    updateDatePickerModal() {
        const dateList = document.getElementById('dateList');
        if (!dateList) return;
        
        dateList.innerHTML = this.allDates.map(date => `
            <div class="date-item">
                <input type="checkbox" class="date-checkbox" value="${date}" 
                    ${this.selectedDates.includes(date) ? 'checked' : ''}>
                <span>${this.formatDate(date)}</span>
            </div>
        `).join('');
        
        const selectAll = document.getElementById('selectAllDates');
        if (selectAll) {
            selectAll.checked = this.selectedDates.length === this.allDates.length && this.allDates.length > 0;
        }
    }
    
    /**
     * 初始化添加数据弹窗
     */
    initAddDataModal() {
        const modal = document.getElementById('addDataModal');
        const openBtn = this.addDataBtn;
        const closeBtn = document.getElementById('closeAddDataModalBtn');
        const cancelBtn = document.getElementById('cancelAddDataBtn');
        const confirmBtn = document.getElementById('confirmAddDataBtn');
        const dataPathsTextarea = document.getElementById('dataPaths');
        
        if (!openBtn || !modal) return;
        
        openBtn.addEventListener('click', () => {
            modal.classList.add('active');
            document.body.style.overflow = 'hidden';
            if (dataPathsTextarea) dataPathsTextarea.value = '';
            if (confirmBtn) confirmBtn.disabled = true;
        });
        
        const closeModal = () => {
            modal.classList.remove('active');
            document.body.style.overflow = '';
        };
        
        if (closeBtn) closeBtn.addEventListener('click', closeModal);
        if (cancelBtn) cancelBtn.addEventListener('click', closeModal);
        
        if (dataPathsTextarea) {
            dataPathsTextarea.addEventListener('input', () => {
                if (confirmBtn) {
                    confirmBtn.disabled = !dataPathsTextarea.value.trim();
                }
            });
        }
        
        if (confirmBtn) {
            confirmBtn.addEventListener('click', async () => {
                const paths = dataPathsTextarea.value.split('\n').filter(p => p.trim());
                if (paths.length > 0) {
                    closeModal();
                    await this.addUserData(paths);
                }
            });
        }
    }
    
    /**
     * 添加用户数据
     */
    async addUserData(paths) {
        try {
            const response = await axios.post(`/api/tools/${window.toolId}/extra`, { paths });
            if (response.data.success) {
                const newData = response.data.data || {};
                this.userAddedData = { ...this.userAddedData, ...newData };
                this.allData = { ...this.rawData, ...this.userAddedData };
                this.updateCasenameSelect();
                await this.updateRulesAndDates();
                await this.renderChart();
                this.updateOverview();
                this.showToast('数据添加成功', 'success');
            }
        } catch (error) {
            console.error('添加数据失败:', error);
            this.showToast('添加数据失败', 'error');
        }
    }
    
    /**
     * 显示无数据提示
     */
    showNoDataMessage() {
        if (this.chart) {
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
        if (this.chart) {
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
     * 显示Toast提示
     */
    showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.textContent = message;
        toast.style.cssText = `
            position: fixed;
            bottom: 20px;
            left: 50%;
            transform: translateX(-50%);
            background: ${type === 'success' ? '#10B981' : type === 'error' ? '#EF4444' : '#3B82F6'};
            color: white;
            padding: 10px 20px;
            border-radius: 8px;
            font-size: 14px;
            z-index: 1100;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        `;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
    }
    
    /**
     * 切换下拉菜单（供全局调用）
     */
    toggleDropdown() {
        const dropdown = document.getElementById(`${this.idPrefix}ThreadDropdown`);
        if (dropdown) {
            dropdown.style.display = dropdown.style.display === 'none' ? 'block' : 'none';
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
}

// 全局实例
window.MultiThreadManager = MultiThreadManager;