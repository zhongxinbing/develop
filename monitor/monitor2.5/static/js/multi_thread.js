/**
 * 多线程模块 - 处理多线程数据展示和图表渲染
 */
class MultiThreadManager {
    constructor() {
        this.chart = null;
        this.currentChartType = 'cputime';
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

        this.idPrefix = 'multi';

        this.casenameSelect = null;
        this.ruleSelect = null;
        this.ruleSearch = null;
        this.datePickerBtn = null;
        this.latest50Btn = null;
        this.addDataBtn = null;
        this.threadSelectorContainer = null;
        this.threadOptions = null;
        this.selectedThreadsDisplay = null;
        this.threadSearchInput = null;

        this.renderChart = this.renderChart.bind(this);
        this.updateRulesAndDates = this.updateRulesAndDates.bind(this);
        this.toggleDropdown = this.toggleDropdown.bind(this);
        this.selectAllThreads = this.selectAllThreads.bind(this);
        this.clearAllThreads = this.clearAllThreads.bind(this);
    }

    async init(rawData, userAddedData, extraData) {
        console.log('MultiThreadManager.init 开始', rawData);

        this.ruleSearch = document.getElementById(`${this.idPrefix}RuleSearch`);
        this.datePickerBtn = document.getElementById(`${this.idPrefix}DatePickerBtn`);
        this.latest50Btn = document.getElementById(`${this.idPrefix}Latest50Btn`);
        this.addDataBtn = document.getElementById(`${this.idPrefix}AddDataBtn`);

        this.threadSelectorContainer = document.getElementById(`${this.idPrefix}ThreadSelectorContainer`);
        this.threadOptions = document.getElementById(`${this.idPrefix}ThreadOptions`);
        this.selectedThreadsDisplay = document.getElementById(`${this.idPrefix}SelectedThreadsDisplay`);
        this.threadSearchInput = document.getElementById(`${this.idPrefix}ThreadSearchInput`);

        this.rawData = rawData;
        this.userAddedData = userAddedData || {};
        this.allData = { ...this.rawData, ...this.userAddedData };
        this.extraData = extraData;

        this.casenameSelect = new SearchableSelect({
            container: document.getElementById(`${this.idPrefix}CasenameSelect`),
            options: [],
            placeholder: '请选择 Casename...',
            onChange: async (value) => {
                if (value) {
                    this.selectedCasename = value;
                    await this.updateRulesAndDates();
                    this.selectedRules = ['Overall'];
                    this.selectedDates = this.allDates.slice(-50);
                    const chart = window.mainChart || echarts.getInstanceByDom(document.getElementById('mainChart'));
                    if (chart) {
                        await this.renderChart(chart);
                    }
                    this.updateOverview();
                }
            }
        });

        this.ruleSelect = new SearchableSelect({
            container: document.getElementById(`${this.idPrefix}RuleSelect`),
            options: [],
            placeholder: '请选择 Rule...',
            onChange: (values) => {
                this.selectedRules = values.length > 0 ? [values] : ['Overall'];
                const chart = window.mainChart || echarts.getInstanceByDom(document.getElementById('mainChart'));
                if (chart) {
                    this.renderChart(chart);
                }
            }
        });

        this.updateCasenameSelect();
        await this.updateRulesAndDates();
        this.initEventListeners();
        this.initDatePickerModal();
        this.initAddDataModal();

        if (this.allDates.length > 0) {
            this.selectLatest50Days();
        }
        this.updateOverview();
    }

    updateCasenameSelect() {
        if (!this.casenameSelect) return;
        
        const casenames = Object.keys(this.allData).filter(name => {
            const rule_dates = this.allData[name];
            return rule_dates;
        });
        
        const options = casenames.map(name => ({
            value: name,
            label: name
        }));
        
        this.casenameSelect.setOptions(options);
        
        if (casenames.length > 0 && !this.selectedCasename) {
            this.selectedCasename = casenames[0];
            this.casenameSelect.setValue(this.selectedCasename);
        }
    }

    async updateRulesAndDates() {
        if (!this.selectedCasename || !this.allData[this.selectedCasename]) {
            console.log('updateRulesAndDates: 无有效的 casename', this.selectedCasename);
            return;
        }
        const caseData = this.allData[this.selectedCasename] || {};
        const rulesSet = new Set(Object.keys(caseData[this.currentChartType] || {}));
        this.allRules = Array.from(rulesSet).sort();
        if (this.allRules.includes('Overall')) {
            this.allRules = ['Overall', ...this.allRules.filter(r => r !== 'Overall')];
        }
        this.updateRuleSelect();

        const allDatesSet = new Set();
        this.allRules.forEach(rule => {
            const ruleInfo = caseData[this.currentChartType]?.[rule];
            Object.keys(ruleInfo).forEach(thread => {
                const dates = ruleInfo[thread];
                if (dates && dates.date) {
                    dates.date.forEach(d => allDatesSet.add(d));
                }
            });
        });
        this.allDates = Array.from(allDatesSet).sort();
        console.warn('updateRulesAndDates: allDates', caseData);
        const threadsSet = new Set();
        this.allRules.forEach(rule => {
            const ruleInfo = caseData[this.currentChartType]?.[rule];
            const threads = Object.keys(ruleInfo || {});
            if (threads && threads.length > 0) {
                threads.forEach(t => threadsSet.add(t));
            }
        });
        this.availableThreads = Array.from(threadsSet).sort((a, b) => a - b);
        this.selectedThreads = this.availableThreads.slice(0, Math.min(2, this.availableThreads.length));
        this.renderThreadOptions();

        this.updateOverview();
    }

    updateRuleSelect() {
        if (!this.ruleSelect) return;
        
        const searchTerm = this.ruleSearch ? this.ruleSearch.value.toLowerCase() : '';
        const filteredRules = searchTerm
            ? this.allRules.filter(rule => rule.toLowerCase().includes(searchTerm))
            : this.allRules;
        
        const options = filteredRules.map(rule => ({
            value: rule,
            label: rule
        }));
        
        this.ruleSelect.setOptions(options);
        if (this.selectedRules.length > 0) {
            this.ruleSelect.setValue(this.selectedRules[0]);
        }
    }

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

    renderThreadOptions() {
        if (!this.threadOptions) return;
        if (this.availableThreads.length === 0) {
            this.threadOptions.innerHTML = '<div style="padding: 12px; text-align: center; color: #94A3B8;">暂无线程数据</div>';
            return;
        }
        this.threadOptions.innerHTML = this.availableThreads.map(thread =>
            `<label class="multi-select-option" style="display: flex; align-items: center; gap: 8px; padding: 8px 12px; cursor: pointer;">
                <input type="checkbox" value="${thread}"
                    ${this.selectedThreads.includes(thread) ? 'checked' : ''}
                    onchange="window.multiThreadManager && window.multiThreadManager.toggleThreadSelection(${thread}, this.checked)">
                <span>${thread} 线程</span>
            </label>`
        ).join('');
        this.updateSelectedThreadsDisplay();
    }

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

    selectAllThreads() {
        this.selectedThreads = [...this.availableThreads];
        this.renderThreadOptions();
        this.renderChart();
    }

    clearAllThreads() {
        this.selectedThreads = [];
        this.renderThreadOptions();
        this.renderChart();
    }

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

    selectLatest50Days() {
        this.selectedDates = this.allDates.slice(-50);
        this.updateDatePickerModal();
        this.renderChart();
    }

    async renderChart(chartInstance) {
        const chart = chartInstance || window.mainChart || echarts.getInstanceByDom(document.getElementById('mainChart'));
        
        if (!chart) {
            console.error('renderChart: 图表实例不存在');
            return;
        }
        this.chart = chart;

        if (!this.selectedCasename) {
            console.log('renderChart: 未选择 casename');
            this.showNoDataMessage(chart);
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

        chart.showLoading({
            text: '加载中...',
            color: '#00E5FF',
            textColor: '#94A3B8',
            maskColor: 'rgba(11, 15, 26, 0.6)'
        });

        try {
            const requestData = {
                toolID: window.toolId,
                casename: this.selectedCasename,
                rules: this.selectedRules,
                dates: this.selectedDates,
                mode: 'multi',
                chart_type: this.currentChartType,
                selected_threads: this.selectedThreads,
            };
            const response = await axios.post('/api/chart/data', requestData);
            console.warn('renderChart: response', response.data.data);
            if (response.data.success) {
                let chartData = response.data.data;
                if (typeof chartData === 'string') {
                    chartData = JSON.parse(chartData);
                }
                chart.hideLoading();
                if (Object.keys(chartData.rules || {}).length === 0) {
                    this.showNoDataMessage(chart);
                } else {
                    this.drawChart(chart, chartData);
                    this.updateStatistics(chartData);
                }
            } else {
                console.error('获取图表数据失败:', response.data.error);
                chart.hideLoading();
                this.showErrorMessage(chart, response.data.error || '获取数据失败');
            }
        } catch (error) {
            console.error('获取图表数据失败:', error);
            chart.hideLoading();
            this.showErrorMessage(chart, '获取图表数据失败: ' + (error.message || '未知错误'));
        }
    }

    drawChart(chart, chartData) {
        if (!chart || chart.isDisposed()) {
            console.error('drawChart: 图表实例无效');
            return;
        }

        const { dates, rules, crash_dates, all_threads, selected_threads } = chartData;
        const normalizedType = (this.currentChartType || 'runtime').toLowerCase();
        const isRuntime = normalizedType === 'runtime' || normalizedType === 'cputime' || normalizedType === 'realtime';
        const yAxisName = isRuntime ? 'Runtime (s)' : 'Memory (MB)';

        // 图表标题映射
        const titleMap = {
            'cputime': 'CPU Time',
            'realtime': 'Real Time',
            'peakmem': '峰值内存',
            'incmem': '增量内存',
            'realtimeincmem': '实时增量内存'
        };
        const chartTitle = titleMap[this.currentChartType] || this.currentChartType;

        const crashDatesSet = new Set(crash_dates || []);
        const formattedDates = dates.map(d => this.formatDate(d));

        const getItemStyle = (date) => {
            if (this.extraData && this.extraData.cpu && this.extraData.cpu[date] && isRuntime) {
                return { color: '#F59E0B', borderColor: '#D97706', borderWidth: 6 };
            }
            if (this.extraData && this.extraData.mem && this.extraData.mem[date] && !isRuntime) {
                return { color: '#F59E0B', borderColor: '#D97706', borderWidth: 6 };
            }
            return null;
        };

        const threadColors = {
            0: '#00E5FF', 2: '#A855F7', 4: '#10B981',
            6: '#8d816b', 8: '#EF4444', 16: '#4102d3',
            32: '#EC4899', 64: '#14B8A6', 128: '#F97316'
        };

        const visibleThreads = selected_threads || all_threads || [];
        const series = [];
        let allValidValues = [];

        for (const [seriesName, ruleData] of Object.entries(rules)) {
            const values = ruleData.values || [];
            const thread = ruleData.thread || 0;
            const color = threadColors[thread] || '#A855F7';
            const validValues = values.filter(v => v !== null && v !== undefined);
            allValidValues = allValidValues.concat(validValues);

            const dataWithStyle = values.map((val, idx) => {
                const date = dates[idx];
                const itemStyle = getItemStyle(date);
                if (itemStyle && val !== null && val !== undefined) {
                    return { value: val, itemStyle: itemStyle };
                }
                return val;
            });

            series.push({
                name: seriesName,
                type: 'line',
                data: dataWithStyle,
                smooth: false,
                symbol: 'circle',
                symbolSize: 6,
                connectNulls: false,
                lineStyle: { width: 2, color: color },
                itemStyle: { color: color, borderColor: '#0F172A', borderWidth: 1, borderRadius: 4 },
                emphasis: { focus: 'series' }
            });
        }

        if (allValidValues.length > 0) {
            const avgValue = allValidValues.reduce((a, b) => a + b, 0) / allValidValues.length;
            const avgColor = isRuntime ? '#F59E0B' : '#EC4899';
            series.push({
                name: '平均值',
                type: 'line',
                data: Array(dates.length).fill(avgValue),
                smooth: false,
                symbol: 'none',
                lineStyle: { width: 2, color: avgColor, type: 'dashed' },
                itemStyle: { color: avgColor },
                emphasis: { focus: 'none' },
                z: 1
            });
        }

        const markAreas = [];
        if (crashDatesSet.size > 0) {
            let startIndex = -1;
            for (let i = 0; i < dates.length; i++) {
                if (crashDatesSet.has(dates[i])) {
                    if (startIndex === -1) startIndex = i;
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
            title: {
                text: chartTitle,
                left: 'center',
                top: 0,
                textStyle: {
                    color: '#F1F5F9',
                    fontSize: 16,
                    fontWeight: 600
                }
            },
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
                        const unit = isRuntime ? "s" : "MB";
                        html += `<div style="display:flex;justify-content:space-between;gap:16px;margin-bottom:4px;">
                            <span style="color:${color}">● ${this.escapeHtml(seriesName)}</span>
                            <span style="font-family:monospace;font-weight:600;">${value !== '-' && value !== null ? Number(value).toFixed(2) : 'N/A'} ${unit}</span>
                        </div>`;
                    }

                    if (this.extraData && this.extraData.cpu && this.extraData.mem) {
                        if (isRuntime) {
                            if (this.extraData.cpu[date]) {
                                html += `<div class="mr-update">MR更新: ${this.extraData.cpu[date]}</div>`;
                            }
                        } else {
                            if (this.extraData.mem[date]) {
                                html += `<div>MR更新: ${this.extraData.mem[date]}</div>`;
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
                top: 40,
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
                top: '18%',
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

        if (!this._resizeHandler) {
            this._resizeHandler = () => {
                if (this.chart && !this.chart.isDisposed()) {
                    this.chart.resize();
                }
            };
            window.addEventListener('resize', this._resizeHandler);
        }
    }

    updateStatistics(chartData) {
        const { dates, overall_data } = chartData;
        const normalizedType = (this.currentChartType || 'runtime').toLowerCase();
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

    resetStatistics() {
        ['dateRange', 'totalValue', 'avgValue', 'maxValue', 'minValue'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.textContent = '-';
        });
    }

    setChartType(type) {
        this.currentChartType = type;
        this.renderChart();
    }

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

    initEventListeners() {
        if (this.ruleSearch) {
            this.ruleSearch.addEventListener('input', () => {
                this.updateRuleSelect();
            });
        }
        if (this.latest50Btn) {
            this.latest50Btn.addEventListener('click', () => {
                this.selectLatest50Days();
            });
        }
        this.initThreadSelector();
    }

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
                if (window.currentMode !== 'multi') {
                    console.log('日期选择确认被忽略：当前模式不是 multi');
                    closeModal();
                    return;
                }
                
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

    updateDatePickerModal() {
        const dateList = document.getElementById('dateList');
        if (!dateList) return;
        
        dateList.innerHTML = this.allDates.map(date => `
            <div class="date-item" onclick="this.querySelector('.date-checkbox').click();">
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

    showNoDataMessage(chart) {
        if (chart && !chart.isDisposed()) {
            chart.clear();
            chart.setOption({
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

    showErrorMessage(chart, message) {
        if (chart && !chart.isDisposed()) {
            chart.setOption({
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

    toggleDropdown() {
        const dropdown = document.getElementById(`${this.idPrefix}ThreadDropdown`);
        if (dropdown) {
            dropdown.style.display = dropdown.style.display === 'none' ? 'block' : 'none';
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

window.MultiThreadManager = MultiThreadManager;