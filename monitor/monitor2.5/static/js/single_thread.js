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

        this.idPrefix = 'single';

        this.casenameSelect = null;
        this.ruleSelect = null;
        this.ruleSearch = null;
        this.datePickerBtn = null;
        this.latest50Btn = null;
        this.addDataBtn = null;

        this.renderChart = this.renderChart.bind(this);
        this.updateRulesAndDates = this.updateRulesAndDates.bind(this);
    }

    async init(rawData, userAddedData, extraData) {
        console.log('SingleThreadManager.init 开始', rawData);

        this.ruleSearch = document.getElementById(`${this.idPrefix}RuleSearch`);
        this.datePickerBtn = document.getElementById(`${this.idPrefix}DatePickerBtn`);
        this.latest50Btn = document.getElementById(`${this.idPrefix}Latest50Btn`);
        this.addDataBtn = document.getElementById(`${this.idPrefix}AddDataBtn`);

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
            const rule = this.allData[name];
            return rule;
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
        const ruleData = this.allData[this.selectedCasename];
        if (!ruleData || typeof ruleData !== 'object') {
            console.log('updateRulesAndDates: 无有效的 rule 数据', this.selectedCasename);
            return;
        }
        // console.log('updateRulesAndDates: ruleData', this.currentChartType);
        const rulesSet = new Set(Object.keys(ruleData[this.currentChartType] || {}));
        console.warn('updateRulesAndDates: rulesSet', rulesSet);
        this.allRules = Array.from(rulesSet).sort();
        if (this.allRules.includes('Overall')) {
            this.allRules = ['Overall', ...this.allRules.filter(r => r !== 'Overall')];
        }
        if (this.allRules.includes('Overall') && this.selectedRules.length === 0) {
            this.selectedRules = ['Overall'];
        }
        
        const  allDatesSet = new Set(ruleData[this.currentChartType][this.selectedRules[0]])
        
        this.allDates = Array.from(allDatesSet).sort();

        this.updateRuleSelect();
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
            return;
        }
        if (this.selectedRules.length === 0) {
            this.selectedRules = ['Overall'];
        }
        if (this.selectedDates.length === 0) {
            this.selectedDates = this.allDates.slice(-50);
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
                mode: 'single',
                chart_type: this.currentChartType,
                selected_threads: [-1],
            };
            const response = await axios.post('/api/chart/data', requestData);
            
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

        const { dates, rules, crash_dates } = chartData;
        const normalizedType = (this.currentChartType || 'cputime').toLowerCase();
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

        const colors = ['#00E5FF', '#A855F7', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#14B8A6', '#F97316'];
        let colorIndex = 0;
        const series = [];
        let allValidValues = [];

        for (const [ruleName, ruleData] of Object.entries(rules)) {
            const values = ruleData.values || [];
            const color = colors[colorIndex % colors.length];
            colorIndex++;

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
                name: ruleName,
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
                        const unit = isRuntime ? "s" :"MB";
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
                                html += `<div class="mr-update">MR更新: ${this.extraData.mem[date]}</div>`;
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

        chart.setOption(option, true);

        if (!this._resizeHandler) {
            this._resizeHandler = () => {
                if (chart && !chart.isDisposed()) {
                    chart.resize();
                }
            };
            window.addEventListener('resize', this._resizeHandler);
        }
    }

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

    resetStatistics() {
        ['dateRange', 'totalValue', 'avgValue', 'maxValue', 'minValue'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.textContent = '-';
        });
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
                if (window.currentMode !== 'single') {
                    console.log('日期选择确认被忽略：当前模式不是 single');
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
        dateList.innerHTML = this.allDates.map(date =>
            `<div class="date-item" onclick="this.querySelector('.date-checkbox').click();">
                <input type="checkbox" class="date-checkbox" value="${date}"
                    ${this.selectedDates.includes(date) ? 'checked' : ''}>
                <span>${this.formatDate(date)}</span>
            </div>`
        ).join('');
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
        this.chart = null;
    }
}

window.SingleThreadManager = SingleThreadManager;