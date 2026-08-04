/**
 * 单线程模块 - 处理单线程数据展示和图表渲染
 */
class SingleThreadManager {
    constructor() {
        this.chart = null;
        this.currentChartType = 'cputime';
        this.selectedCasename = '';
        this.selectedRules = ['Overall'];
        this.selectedDates = [];
        this.allDates = [];
        this.allRules = [];
        this.rawData = {};
        this.userAddedData = {};
        this.allData = {};
        
        // ID前缀：使用 'single' 前缀区分
        this.idPrefix = 'single';
        
        // DOM 元素
        this.casenameSelect = null;
        this.ruleSelect = null;
        this.ruleSearch = null;
        this.datePickerBtn = null;
        this.latest50Btn = null;
        this.addDataBtn = null;
        
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
        this.compRuleSearch = null;
        
        // 绑定方法
        this.renderChart = this.renderChart.bind(this);
        this.updateRulesAndDates = this.updateRulesAndDates.bind(this);
        this.performComparison = this.performComparison.bind(this);
        this.exportComparison = this.exportComparison.bind(this);
    }
    
    /**
     * 初始化单线程模块
     */
    async init(rawData, userAddedData, extraData) {
        console.log('SingleThreadManager.init 开始',extraData);
        
        // 获取 DOM 元素
        this.casenameSelect = document.getElementById(`${this.idPrefix}CasenameSelect`);
        this.ruleSelect = document.getElementById(`${this.idPrefix}RuleSelect`);
        this.ruleSearch = document.getElementById(`${this.idPrefix}RuleSearch`);
        this.datePickerBtn = document.getElementById(`${this.idPrefix}DatePickerBtn`);
        this.latest50Btn = document.getElementById(`${this.idPrefix}Latest50Btn`);
        this.addDataBtn = document.getElementById(`${this.idPrefix}AddDataBtn`);
        
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
        this.compRuleSearch = document.getElementById(`${this.idPrefix}CompRuleSearch`);


        this.rawData = rawData;
        // this.rawData = cleanRawData;
        this.userAddedData = userAddedData || {};
        this.allData = { ...this.rawData, ...this.userAddedData };
        this.extraData = extraData
        
        // 初始化图表容器
        this.initChartContainer();
        // 初始化Casename选择框
        this.updateCasenameSelect();
        // 初始化 rule 和 日期 选择框
        await this.updateRulesAndDates();
        // 初始化事件监听器
        this.initEventListeners();
        // 初始化日期选择器
        this.initDatePickerModal();
        // 初始化添加数据弹窗
        this.initAddDataModal();
        // 初始化对比面板
        if (this.allDates.length > 0) {
            this.selectLatest50Days();
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
            console.log('图表容器初始化成功');
        } else {
            console.error('找不到图表容器 #mainChart');
        }
    }

    /**
     * 更新Casename选择框
     */
    updateCasenameSelect() {
        if (!this.casenameSelect) return;
        
        const casenames = Object.keys(this.allData).filter(name => {
            const rule = this.allData[name];
            return rule ;
        });

        const options = casenames.map(name => 
            `<option value="${this.escapeHtml(name)}">${this.escapeHtml(name)}</option>`
        ).join('');
        
        this.casenameSelect.innerHTML = options;
        if (casenames.length > 0 && !this.selectedCasename) {
            this.selectedCasename = casenames[0];
            this.casenameSelect.value = this.selectedCasename;
        }
        
        this.syncComparisonCasenameSelect(casenames);
    }

    /**
     * 同步对比面板的 casename 选项
     */
    syncComparisonCasenameSelect(casenames) {
        
        if (!this.compCasenameSelect) return;
        
        const currentValue = this.compCasenameSelect.value;
        const options = casenames.map(name => 
            `<option value="${this.escapeHtml(name)}">${this.escapeHtml(name)}</option>`
        ).join('');
        
        this.compCasenameSelect.innerHTML = options;
        
        if (currentValue && casenames.includes(currentValue)) {
            this.compCasenameSelect.value = currentValue;
        } else if (casenames.length > 0 && this.selectedCasename) {
            this.compCasenameSelect.value = this.selectedCasename;
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
        
        const ruleData = this.allData[this.selectedCasename];
        if (!ruleData || typeof ruleData !== 'object') {
            console.log('updateRulesAndDates: 无有效的 rule 数据', this.selectedCasename);
            return;
        }
        
        const rulesSet = new Set(Object.keys(ruleData[this.currentChartType]));
        
        this.allRules = Array.from(rulesSet).sort();
        
        if (this.allRules.includes('Overall')) {
            this.allRules = ['Overall', ...this.allRules.filter(r => r !== 'Overall')];
        }
        
        if (this.allRules.includes('Overall') && this.selectedRules.length === 0) {
            this.selectedRules = ['Overall'];
        }
        // 更新规则选择框
        this.updateRuleSelect();
        // 更新对比 rule 选择框
        this.updateCompareModeSelect();
        // 更新日期选择框
        this.updateDateSelects();
        // 更新概览
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
        // 对比数据中的 日期 1选择框
        if (this.date1Select) {
            const options = this.allData[this.selectedCasename][this.currentChartType][this.selectedRules].map(date => 
                `<option value="${date}">${this.formatDate(date)}</option>`
            ).join('');
            this.date1Select.innerHTML = options;
        }
        // 对比数据中的 日期 2选择框
        if (this.date2Select) {
            const allDates = new Set(this.allData[this.selectedCasename][this.currentChartType][this.selectedRules]);
            this.allDates = Array.from(allDates).sort();
            
            const options = this.allData[this.selectedCasename][this.currentChartType][this.selectedRules].map(date => 
                `<option value="${date}">${this.formatDate(date)}</option>`
            ).join('');
            this.date2Select.innerHTML = options;
            if (this.allDates.length > 1) {
                this.date2Select.value = this.allDates[this.allDates.length - 1];
            }
        }
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
     * 渲染图表 - 主要入口
     */
    async renderChart() {
        if (!this.selectedCasename) {
            console.log('renderChart: 未选择 casename');
            return;
        }
        
        if (!this.chart) {
            this.initChartContainer();
            if (!this.chart) {
                console.error('renderChart: 图表实例不存在');
                return;
            }
        }
        
        if (this.selectedRules.length === 0) {
            this.selectedRules = ['Overall'];
        }
        
        if (this.selectedDates.length === 0) {
            this.selectedDates = this.allDates.slice(-50);
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
                // raw_data: this.allData,
                casename: this.selectedCasename,
                rules: this.selectedRules,
                dates: this.selectedDates,
                mode: 'single',
                chart_type: this.currentChartType,
                toolID: window.toolId,
                selected_threads: [-1],
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
        if (!this.chart || this.chart.isDisposed()) {
            this.initChartContainer();
            if (!this.chart) return;
        }
        const { dates, rules, crash_dates } = chartData;
        const normalizedType = (this.currentChartType || 'cputime').toLowerCase();

        const isRuntime = normalizedType === 'runtime' || normalizedType === 'cputime' || normalizedType === 'realtime';
        const yAxisName = isRuntime ? 'Runtime (s)' : 'Memory (MB)';

        
        const crashDatesSet = new Set(crash_dates || []);
        const formattedDates = dates.map(d => this.formatDate(d));
        
        // 获取数据点样式的函数
        const getItemStyle = (date) => {
            if (this.extraData && this.extraData.cpu && this.extraData.cpu[date] && isRuntime) {
                return { color: '#F59E0B', borderColor: '#D97706', borderWidth: 6 };
            }
            if (this.extraData && this.extraData.mem && this.extraData.mem[date] && !isRuntime) {
                return { color: '#F59E0B', borderColor: '#D97706', borderWidth: 6 };
            }
            return null;
        };
        
        const colors = ['#00E5FF', '#A855F7', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#14B8A6', '#F97316'];
        let colorIndex = 0;
        
        const series = [];
        // 存储所有有效数据用于计算平均值
        let allValidValues = [];
        for (const [ruleName, ruleData] of Object.entries(rules)) {
            const values = ruleData.values || [];
            const color = colors[colorIndex % colors.length];
            colorIndex++;
            
            // 收集有效值用于计算平均值
            const validValues = values.filter(v => v !== null && v !== undefined);
            allValidValues = allValidValues.concat(validValues);

            // 为每个数据点添加样式
            const dataWithStyle = values.map((val, idx) => {
                const date = dates[idx];
                const itemStyle = getItemStyle(date);
                if (itemStyle && val !== null && val !== undefined) {
                    return { value: val, itemStyle: itemStyle };
                }
                return val;
            });
                
            series.push({
                name: ruleName,
                type: 'line',
                data: dataWithStyle,
                smooth: false,
                symbol: 'circle',
                symbolSize: 6,
                connectNulls: false,
                lineStyle: { width: 2, color: color },
                itemStyle: { 
                    color: color, 
                    borderColor: '#0F172A', 
                    borderWidth: 1,
                    borderRadius: 4
                },
                emphasis: { focus: 'series' }
            });
        }
        
        // 计算平均值并添加虚线
        if (allValidValues.length > 0) {
            const avgValue = allValidValues.reduce((a, b) => a + b, 0) / allValidValues.length;
            const avgColor = isRuntime ? '#F59E0B' : '#EC4899';
            series.push({
                name: '平均值',
                type: 'line',
                data: Array(dates.length).fill(avgValue),
                smooth: false,
                symbol: 'none',
                lineStyle: { 
                    width: 2, 
                    color: avgColor,
                    type: 'dashed'
                },
                itemStyle: { color: avgColor },
                emphasis: { focus: 'none' },
                z: 1
            });
        }

        // 标记崩溃日期（红色背景区域）
        const markAreas = [];
        if (crashDatesSet.size > 0) {
            let startIndex = -1;
            for (let i = 0; i < dates.length; i++) {
                if (crashDatesSet.has(dates[i])) {
                    if (startIndex === -1) {
                        startIndex = i;
                    }
                } else {
                    if (startIndex !== -1) {
                        markAreas.push([{ xAxis: startIndex }, { xAxis: i - 1 }]);
                        startIndex = -1;
                    }
                }
            }
            if (startIndex !== -1) {
                markAreas.push([{ xAxis: startIndex }, { xAxis: dates.length - 1 }]);
            }
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
                    const date = dates[dataIndex];
                    
                    let html = `<div style="font-weight:600;margin-bottom:8px;">📅 ${date}</div>`;
                    
                    for (const p of params) {
                        const value = p.value;
                        const seriesName = p.seriesName;
                        const color = p.color;
                        const unit = isRuntime ? "s" :"MB"
                        html += `<div style="display:flex;justify-content:space-between;gap:16px;margin-bottom:4px;">
                            <span style="color:${color}">● ${this.escapeHtml(seriesName)}</span>
                            <span style="font-family:monospace;font-weight:600;">${value !== '-' && value !== null ? Number(value).toFixed(2) : 'N/A'} ${unit}</span>
                        </div>`;
                    }

                    if (this.extraData.cpu && this.extraData.mem) {
                        if (isRuntime) {
                            if (this.extraData.cpu[date]) {
                                html += `<div class="mr-update">MR更新: ${this.extraData.cpu[date]}</div>`
                            }
                        } else {
                            if (this.extraData.mem[date]) {
                                html += `<div class="mr-update">MR更新: ${this.extraData.mem[date]}</div>`
                            }
                        }
                    }
                    
                    if (crashDatesSet.has(date)) {
                        html += `<div style="color:#EF4444;font-size:11px;margin-top:6px;border-top:1px solid #334155;padding-top:4px;">
                            ⚠️ 该日期缺少 Overall 数据
                        </div>`;
                    }
                    
                    return html;
                }
            },
            legend: {
                data: series.map(s => s.name),
                textStyle: { color: '#F1F5F9' },
                type: 'scroll',
                left: 10,
                top: 0,
                backgroundColor: 'rgba(11, 15, 26, 0.8)',
                borderRadius: 8,
                pageIconColor: '#00E5FF',
                pageTextStyle: { color: '#F1F5F9' },
                pageIconSize: 12,
                pageFormatter: '{current}/{total}'
            },
            grid: {
                left: '3%',
                right: '8%',
                top: '15%',
                bottom: '8%',
                containLabel: true,
                backgroundColor: 'transparent'
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
        
        // 添加崩溃区域标记
        if (markAreas.length > 0 && series.length > 0) {
            option.series[0].markArea = {
                silent: true,
                itemStyle: {
                    color: 'rgba(239, 68, 68, 0.15)',
                    borderColor: '#EF4444',
                    borderWidth: 0
                },
                data: markAreas
            };
        }
        
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
     * 更新统计信息
     */
    updateStatistics(chartData) {
        const { dates, overall_data } = chartData;
        const normalizedType = (this.currentChartType || 'cputime').toLowerCase();
        const isRuntime = normalizedType === 'runtime' || normalizedType === 'cputime' || normalizedType === 'realtime';
        
        if (!overall_data || !overall_data.values) {
            this.resetStatistics();
            return;
        }
        
        const values = overall_data.values.filter(v => v !== null && v !== undefined);
        if (values.length === 0) {
            this.resetStatistics();
            return;
        }
        
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
        
        if (totalLabel) totalLabel.textContent = isRuntime ? '总 Runtime (秒)' : '总 Memory (MB)';
        if (avgLabel) avgLabel.textContent = isRuntime ? '平均 Runtime (秒)' : '平均 Memory (MB)';
    }
    
    /**
     * 重置统计信息
     */
    resetStatistics() {
        const elements = ['dateRange', 'totalValue', 'avgValue', 'maxValue', 'minValue'];
        elements.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.textContent = '-';
        });
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

        if (this.compRuleSearch) {
            this.compRuleSearch.addEventListener('input', () => {
                this.updateCompareModeSelect();
            });
        }
    }
    
    /**
     * 执行数据对比
     */
    async performComparison() {
        const date1 = this.date1Select ? this.date1Select.value : '';
        const date2 = this.date2Select ? this.date2Select.value : '';
        // 对比 rule
        const compareMode = this.compareModeSelect ? this.compareModeSelect.value : 'all';
        // 对比维度
        const dimension = this.dimensionSelect ? this.dimensionSelect.value : 'all';
        // 对比阈值
        const runtimeThresholdVal = parseFloat(this.runtimeThreshold?.value || 0);
        const memoryThresholdVal = parseFloat(this.memoryThreshold?.value || 0);
       
        const errorMode = this.errorModeSelect ? this.errorModeSelect.value : 'absolute';
        
        let rulesToCompare = [];
        if (compareMode === 'all') {
            console.log(compareMode);
            rulesToCompare = this.allRules;
        } else {
            rulesToCompare = [compareMode];
        }
        
        if (!date1 || !date2) {
            this.showToast('请选择两个日期进行对比', 'error');
            return;
        }
        
        try {
            const responseData = {
                tool_id: window.toolId,
                mode: this.idPrefix,
                casename: this.selectedCasename,
                date1: date1,
                date2: date2,
                compare_mode: compareMode,
                dimension: dimension,
                runtime_threshold: runtimeThresholdVal,
                memory_threshold: memoryThresholdVal,
                error_mode: errorMode
            }
            console.log(responseData);
            const response = await axios.post('/api/comparison', responseData);

            if (response.data.success) {
                this.renderComparisonResults(response.data.data, dimension,date1,date2,errorMode);
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
     * 更新对比 rule 选择框
     */
    updateCompareModeSelect() {
        
        const compareModeTerm = this.compRuleSearch ? this.compRuleSearch.value.toLowerCase() : '';
        const filteredCompareRules = compareModeTerm 
            ? this.allRules.filter(rule => rule.toLowerCase().includes(compareModeTerm))
            : this.allRules;

        let compareModeOptions = `<option value="all" >对比全部 rule</option>`
       
        compareModeOptions += filteredCompareRules.map(rule => 
            `<option value="${this.escapeHtml(rule)}"}>
                ${this.escapeHtml(rule)}
            </option>`
        ).join('');

        
        this.compareModeSelect.innerHTML = compareModeOptions;
    }
    
    /**
     * 渲染对比结果
     */
    renderComparisonResults(result, dimension, date1, date2, errorMode) {
        const stats = result.statistics;
        const comparisons = result.comparisons;

        // 获取前十 rule 列表的辅助函数
        const getTopRules = (items, limit = 10) => {
            if (!items || items.length === 0) return [];
            return items.slice(0, limit);
        };
        
        // 生成 tooltip 内容
        const generateTooltipContent = (items, label, unit, color) => {
            if (!items || items.length === 0) {
                return `<div class="tooltip-item"><div class="tooltip-item-name" style="color:${color || '#94A3B8'};">暂无数据</div></div>`;
            }
            return items.map(item => {
                const name = Array.isArray(item) ? item[0] : (item.name || '未知');
                const value = Array.isArray(item) ? item[1] : (item.value || 0);
                return `
                    <div class="tooltip-item">
                        <div class="tooltip-item-name">${this.escapeHtml(name)}</div>
                        <div class="tooltip-item-desc">${label}: ${value.toFixed(2)}${unit}</div>
                    </div>
                `;
            }).join('');
        };

        const runtimeUnit = errorMode === 'percentage' ? '%' : 's';
        const memoryUnit = errorMode === 'percentage' ? '%' : 'MB';
        
        // 获取前十数据
        const runtimeIncreased = getTopRules(stats.runtime_increased);
        const runtimeDecreased = getTopRules(stats.runtime_decreased);
        const memoryIncreased = getTopRules(stats.memory_increased);
        const memoryDecreased = getTopRules(stats.memory_decreased);

        const statsGrid = document.getElementById('comparisonStatsGrid');
        if (statsGrid) {
            let statsGridHtml = "";
            if (dimension == 'all' || dimension == 'cputime') {
                
                statsGridHtml += `
                    <div class="comparison-stat-card tooltip-card">
                        <h4>Runtime 增加 Rule</h4>
                        <div class="comparison-stat-value">${stats.runtime_increased.length}</div>
                        <div class="tooltip-content">
                            <div class="tooltip-header" style="color:#EF4444;border-bottom:1px solid rgba(16,185,129,0.2);padding-bottom:3px;margin-bottom:3px;">
                                ⬆️ 增加最多的 Rule (TOP ${Math.min(runtimeIncreased.length, 10)})
                            </div>
                            ${generateTooltipContent(runtimeIncreased, '增加', runtimeUnit, '#EF4444')}
                        </div>
                    </div>
                    <div class="comparison-stat-card tooltip-card">
                        <h4>Runtime 减少 Rule</h4>
                        <div class="comparison-stat-value">${stats.runtime_decreased.length || "0"}</div>
                        <div class="tooltip-content">
                            <div class="tooltip-header" style="color:#10B981;border-bottom:1px solid rgba(239,68,68,0.2);padding-bottom:3px;margin-bottom:3px;">
                                ⬇️ 减少最多的 Rule (TOP ${Math.min(runtimeDecreased.length, 10)})
                            </div>
                            ${generateTooltipContent(runtimeDecreased, '减少', runtimeUnit, '#10B981')}
                        </div>
                    </div>
                    <div class="comparison-stat-card">
                        <h4>Runtime 增加最大</h4>
                        <div class="comparison-stat-value">${stats.max_runtime_increased && stats.max_runtime_increased["name"] ? this.escapeHtml(stats.max_runtime_increased["name"]) : "NA"}</div>
                    </div>
                    <div class="comparison-stat-card">
                        <h4>Runtime 减少最大</h4>
                        <div class="comparison-stat-value">${stats.max_runtime_decreased && stats.max_runtime_decreased["name"] ? this.escapeHtml(stats.max_runtime_decreased["name"]) : "NA"}</div>
                    </div>
                    <div class="comparison-stat-card ">
                        <h4>平均 Runtime 变化率</h4>
                        <div class="comparison-stat-value">${stats.avg_runtime_change.toFixed(2) || "0"}%</div>
                    </div>
                `;
            }
            if (dimension == 'all' || dimension == 'memory') {
                statsGridHtml += `
                    <div class="comparison-stat-card tooltip-card">
                        <h4>Memory 增加 Rule</h4>
                        <div class="comparison-stat-value">${stats.memory_increased.length || "0"}</div>
                        <div class="tooltip-content">
                            <div class="tooltip-header" style="color:#EF4444;border-bottom:1px solid rgba(16,185,129,0.2);padding-bottom:3px;margin-bottom:3px;">
                                ⬆️ 增加最多的 Rule (TOP ${Math.min(memoryIncreased.length, 10)})
                            </div>
                            ${generateTooltipContent(memoryIncreased, '增加', memoryUnit, '#EF4444')}
                        </div>
                    </div>
                    <div class="comparison-stat-card tooltip-card">
                        <h4>Memory 减少 Rule</h4>
                        <div class="comparison-stat-value">${stats.memory_decreased.length || "0"}</div>
                        <div class="tooltip-content">
                            <div class="tooltip-header" style="color:#10B981;border-bottom:1px solid rgba(239,68,68,0.2);padding-bottom:3px;margin-bottom:3px;">
                                ⬇️ 减少最多的 Rule (TOP ${Math.min(memoryDecreased.length, 10)})
                            </div>
                            ${generateTooltipContent(memoryDecreased, '减少', memoryUnit, '#10B981')}
                        </div>
                    </div>
                    <div class="comparison-stat-card">
                        <h4>Memory 增加最大</h4>
                        <div class="comparison-stat-value">${stats.max_memory_increased && stats.max_memory_increased["name"] ? this.escapeHtml(stats.max_memory_increased["name"]) : "NA"}</div>
                    </div>
                    <div class="comparison-stat-card">
                        <h4>Memory 减少最大</h4>
                        <div class="comparison-stat-value">${stats.max_memory_decreased && stats.max_memory_decreased["name"] ? this.escapeHtml(stats.max_memory_decreased["name"]) : "NA"}</div>
                    </div>
                    <div class="comparison-stat-card">
                        <h4>平均 Memory 变化率</h4>
                        <div class="comparison-stat-value">${stats.avg_memory_change.toFixed(2) || "0"}%</div>
                    </div>
                `;
            }
            statsGrid.innerHTML = statsGridHtml;
        }
        
        const tableBody = document.getElementById('comparisonTableBody');
        const tableContainer = document.querySelector('.comparison-table-container');
        
        if (tableBody) {
            // 确保表格有正确的结构 - 使用 thead 和 tbody
            const table = tableBody.closest('table');
            if (table) {
                // 确保有 thead
                let thead = table.querySelector('thead');
                if (!thead) {
                    thead = document.createElement('thead');
                    // 如果表格已经有 tr 在 tbody 外部，移到 thead
                    const firstRow = table.querySelector('tr');
                    if (firstRow && firstRow.parentElement === table) {
                        table.removeChild(firstRow);
                        thead.appendChild(firstRow);
                    }
                    table.insertBefore(thead, tableBody);
                }
                
                // 确保 tbody 存在且正确
                if (tableBody.parentElement !== table) {
                    // 如果 tbody 不在 table 中，重新组织
                    const newTbody = document.createElement('tbody');
                    newTbody.id = 'comparisonTableBody';
                    // 移动所有 tr 到新 tbody
                    const allRows = table.querySelectorAll('tr');
                    allRows.forEach(row => {
                        if (row.parentElement === table || row.parentElement === tableBody) {
                            newTbody.appendChild(row);
                        }
                    });
                    table.appendChild(newTbody);
                    // 更新引用
                    document.getElementById('comparisonTableBody').id = '';
                    newTbody.id = 'comparisonTableBody';
                    // 更新 tableBody 引用
                    const newTableBody = document.getElementById('comparisonTableBody');
                    if (newTableBody) {
                        tableBody = newTableBody;
                    }
                }
            }
            
            // 构建表头 - 使用更简洁的列名
            let headerHtml = '<tr>';
            headerHtml += '<th data-label="Rule">Rule</th>';
            let hasRuntime = (dimension == 'all' || dimension == 'runtime');
            let hasMemory = (dimension == 'all' || dimension == 'memory');
            
            if (hasRuntime) {
                const errorLabel = errorMode == 'absolute' ? '差值' : '变化率';
                headerHtml += `
                    <th data-label="Runtime(${date1})">R(${date1})</th>
                    <th data-label="Runtime(${date2})">R(${date2})</th>
                    <th data-label="R ${errorLabel}">R ${errorLabel}</th>
                    <th data-label="R 状态">R 状态</th>
                `;
            }
            if (hasMemory) {
                const errorLabel = errorMode == 'absolute' ? '差值' : '变化率';
                headerHtml += `
                    <th data-label="Memory(${date1})">M(${date1})</th>
                    <th data-label="Memory(${date2})">M(${date2})</th>
                    <th data-label="M ${errorLabel}">M ${errorLabel}</th>
                    <th data-label="M 状态">M 状态</th>
                `;
            }
            headerHtml += '</tr>';
            
            // 更新 thead
            const tableElement = tableBody.closest('table');
            const theadElement = tableElement ? tableElement.querySelector('thead') : null;
            if (theadElement) {
                theadElement.innerHTML = headerHtml;
            } else if (tableElement) {
                const newThead = document.createElement('thead');
                newThead.innerHTML = headerHtml;
                tableElement.insertBefore(newThead, tableBody);
            }
            
            // 构建表格行数据
            let rowsHtml = '';
            comparisons.forEach(comp => {
                let rowHtml = `<tr>`;
                rowHtml += `<td data-label="Rule">${this.escapeHtml(comp[0])}</td>`;
                
                if (hasRuntime) {
                    rowHtml += `<td data-label="R(${date1})">${this.escapeHtml(comp[1])}</td>`;
                    rowHtml += `<td data-label="R(${date2})">${this.escapeHtml(comp[2])}</td>`;
                    rowHtml += `<td data-label="R ${errorMode == 'absolute' ? '差值' : '变化率'}">${this.escapeHtml(comp[3])}</td>`;
                    rowHtml += `<td data-label="R 状态">${this.escapeHtml(comp[4])}</td>`;
                }
                
                if (hasMemory) {
                    const offset = hasRuntime ? 4 : 0;
                    rowHtml += `<td data-label="M(${date1})">${this.escapeHtml(comp[1+offset])}</td>`;
                    rowHtml += `<td data-label="M(${date2})">${this.escapeHtml(comp[2+offset])}</td>`;
                    rowHtml += `<td data-label="M ${errorMode == 'absolute' ? '差值' : '变化率'}">${this.escapeHtml(comp[3+offset])}</td>`;
                    rowHtml += `<td data-label="M 状态">${this.escapeHtml(comp[4+offset])}</td>`;
                }
                
                rowHtml += `</tr>`;
                rowsHtml += rowHtml;
            });
            
            tableBody.innerHTML = rowsHtml;
            
            // 为表格容器添加响应式类
            if (tableContainer) {
                tableContainer.classList.add('responsive-table-container');
            }
            
            // 初始化搜索功能（保持表头固定）
            this.initComparisonSearch();
        }
    }
    /**
     * 初始化对比表格搜索功能
     */
    initComparisonSearch() {
        const searchInput = document.getElementById('comparisonSearch');
        const tableBody = document.getElementById('comparisonTableBody');
        
        if (!searchInput || !tableBody) return;
        
        // 移除旧的事件监听器
        const newSearch = searchInput.cloneNode(true);
        searchInput.parentNode.replaceChild(newSearch, searchInput);
        
        newSearch.addEventListener('input', function() {
            const term = this.value.toLowerCase().trim();
            const rows = tableBody.querySelectorAll('tr');
            let visibleCount = 0;
            
            rows.forEach(row => {
                const text = row.textContent.toLowerCase();
                if (term === '' || text.includes(term)) {
                    row.style.display = '';
                    visibleCount++;
                } else {
                    row.style.display = 'none';
                }
            });
            
            // 显示/隐藏"无结果"提示
            const noResult = document.getElementById('comparisonNoResult');
            if (term && visibleCount === 0) {
                if (!noResult) {
                    const tr = document.createElement('tr');
                    tr.id = 'comparisonNoResult';
                    const td = document.createElement('td');
                    td.colSpan = tableBody.querySelector('tr')?.cells.length || 1;
                    td.textContent = '没有匹配的 Rule';
                    td.style.textAlign = 'center';
                    td.style.padding = '20px';
                    td.style.color = '#94A3B8';
                    tr.appendChild(td);
                    tableBody.appendChild(tr);
                }
            } else if (noResult) {
                noResult.remove();
            }
        });
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
        // 点击打开弹窗
        openBtn.addEventListener('click', () => {
            this.updateDatePickerModal();
            modal.classList.add('active');
            document.body.style.overflow = 'hidden';
        });
        // 点击关闭弹窗
        const closeModal = () => {
            modal.classList.remove('active');
            document.body.style.overflow = '';
        };
        // 点击关闭弹窗
        if (closeBtn) closeBtn.addEventListener('click', closeModal);
        if (cancelBtn) cancelBtn.addEventListener('click', closeModal);
        // 点击确认选择
        if (confirmBtn) {
            confirmBtn.addEventListener('click', () => {
                const checkboxes = document.querySelectorAll('.date-checkbox:checked');
                this.selectedDates = Array.from(checkboxes).map(cb => cb.value);
                // 确认选择后，关闭弹窗
                closeModal();
                this.renderChart();
            });
            
        }
        // 点击全选/取消全选
        if (selectAllCheckbox) {
            selectAllCheckbox.addEventListener('change', (e) => {
                const checkboxes = document.querySelectorAll('.date-checkbox');
                checkboxes.forEach(cb => cb.checked = e.target.checked);
            });
        }
        // 点击搜索日期
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
window.SingleThreadManager = SingleThreadManager;