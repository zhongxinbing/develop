/**
 * 单线程模块 - 处理单线程数据展示和图表渲染
 */
class SingleThreadManager {
    constructor() {
        this.chart = null;
        this.currentChartType = 'runtime';
        this.selectedCasename = '';
        this.selectedRules = ['Overall'];
        this.selectedDates = [];
        this.allDates = [];
        this.allRules = [];
        this.rawData = {};
        this.userAddedData = {};
        this.multiThreadAllData = {};
        
        // DOM 元素
        this.casenameSelect = document.getElementById('casenameSelect');
        this.ruleSelect = document.getElementById('ruleSelect');
        this.ruleSearch = document.getElementById('ruleSearch');
        this.datePickerBtn = document.getElementById('datePickerBtn');
        this.latest50Btn = document.getElementById('latest50Btn');
        this.addDataBtn = document.getElementById('addDataBtn');
        
        // 绑定方法
        this.renderChart = this.renderChart.bind(this);
    }
    
    /**
     * 初始化单线程模块
     */
    async init(rawData, userAddedData) {
        console.log('SingleThreadManager.init 开始');
        
        // 清理和验证数据格式
        let cleanRawData = {};
        
        if (rawData && typeof rawData === 'object') {
            // 遍历所有项目
            for (const [key, value] of Object.entries(rawData)) {
                // 跳过内部字段
                if (key === 'dataFiles' || key === '__multi_processed_logs__' || key === 'signal' || key === 'multi') {
                    continue;
                }
                
                // 验证数据格式：必须有 daily_metrics
                if (value && typeof value === 'object') {
                    if (value.daily_metrics) {
                        // 标准单线程格式
                        cleanRawData[key] = value;
                    } else if (value.casename && value.daily_metrics) {
                        // 另一种标准格式
                        cleanRawData[key] = value;
                    } else {
                        // 可能是直接包含 daily_metrics 但不标准，尝试修复
                        console.warn(`SingleThread: 项目 ${key} 格式异常，跳过`, value);
                    }
                }
            }
        }
        
        this.rawData = cleanRawData;
        this.userAddedData = userAddedData || {};
        this.multiThreadAllData = { ...this.rawData, ...this.userAddedData };
        
        console.log('SingleThreadManager 处理后数据 keys:', Object.keys(this.multiThreadAllData));
        
        // 如果有数据，打印第一个项目的结构用于调试
        if (Object.keys(this.multiThreadAllData).length > 0) {
            const firstKey = Object.keys(this.multiThreadAllData)[0];
            console.log(`SingleThread 项目示例 (${firstKey}):`, {
                hasDailyMetrics: !!this.multiThreadAllData[firstKey]?.daily_metrics,
                datesCount: Object.keys(this.multiThreadAllData[firstKey]?.daily_metrics || {}).length
            });
        }
        
        this.updateCasenameSelect();
        await this.updateRulesAndDates();
        this.initEventListeners();
        this.initDatePickerModal();
        this.initAddDataModal();
        
        if (this.allDates.length > 0) {
            this.selectLatest50Days();
        }
        
        console.log('SingleThreadManager.init 完成', { 
            allDates: this.allDates.length, 
            allRules: this.allRules.length 
        });
    }

    /**
     * 更新Casename选择框
     */
    updateCasenameSelect() {
        // 只显示有 daily_metrics 的项目
        const casenames = Object.keys(this.multiThreadAllData).filter(name => {
            const data = this.multiThreadAllData[name];
            return data && typeof data === 'object' && data.daily_metrics;
        });
        
        console.log('updateCasenameSelect - casenames:', casenames);
        
        const options = casenames.map(name => 
            `<option value="${this.escapeHtml(name)}">${this.escapeHtml(name)}</option>`
        ).join('');
        
        if (this.casenameSelect) {
            this.casenameSelect.innerHTML = options;
            if (casenames.length > 0 && !this.selectedCasename) {
                this.selectedCasename = casenames[0];
                this.casenameSelect.value = this.selectedCasename;
                console.log('选中单线程 casename:', this.selectedCasename);
            }
        }
    }

    /**
     * 更新Rules和Dates
     */
    async updateRulesAndDates() {
        if (!this.selectedCasename || !this.multiThreadAllData[this.selectedCasename]) {
            console.log('updateRulesAndDates: 无有效的 casename', this.selectedCasename);
            return;
        }
        
        const caseData = this.multiThreadAllData[this.selectedCasename];
        const dailyMetrics = caseData.daily_metrics || {};
        
        console.log('updateRulesAndDates - dailyMetrics keys:', Object.keys(dailyMetrics));
        
        const rulesSet = new Set();
        const datesSet = new Set();
        
        Object.keys(dailyMetrics).forEach(date => {
            datesSet.add(date);
            const metrics = dailyMetrics[date];
            if (metrics && typeof metrics === 'object') {
                Object.keys(metrics).forEach(rule => {
                    rulesSet.add(rule);
                });
            }
        });
        
        this.allRules = Array.from(rulesSet).sort();
        this.allDates = Array.from(datesSet).sort();
        
        if (this.allRules.includes('Overall')) {
            this.allRules = ['Overall', ...this.allRules.filter(r => r !== 'Overall')];
        }
        
        console.log('updateRulesAndDates 完成', { 
            allRules: this.allRules.length, 
            allDates: this.allDates.length 
        });
        
        this.updateRuleSelect();
        this.updateDateSelects();
    }
    
    /**
     * 更新规则选择框
     */
    updateRuleSelect() {
        const searchTerm = this.ruleSearch ? this.ruleSearch.value.toLowerCase() : '';
        const filteredRules = searchTerm 
            ? this.allRules.filter(rule => rule.toLowerCase().includes(searchTerm))
            : this.allRules;
        
        const options = filteredRules.map(rule => 
            `<option value="${this.escapeHtml(rule)}" ${this.selectedRules.includes(rule) ? 'selected' : ''}>
                ${this.escapeHtml(rule)}
            </option>`
        ).join('');
        
        if (this.ruleSelect) {
            this.ruleSelect.innerHTML = options;
            // 确保多选功能正常
            this.ruleSelect.multiple = true;
            this.ruleSelect.size = 5;
        }
    }
    
    /**
     * 使用指定数据刷新
     */
    async refreshWithData(rawData, userAddedData) {
        this.rawData = rawData || {};
        this.userAddedData = userAddedData || {};
        this.multiThreadAllData = { ...this.rawData, ...this.userAddedData };
        this.selectedRules = ['Overall'];
        
        this.updateCasenameSelect();
        await this.updateRulesAndDates();
        this.selectedDates = this.allDates.slice(-50);
        await this.renderChart();
        this.updateOverview();
    }

    /**
     * 更新日期选择框
     */
    updateDateSelects() {
        // 更新对比面板的日期选择框
        const date1Select = document.getElementById('date1Select');
        const date2Select = document.getElementById('date2Select');
        
        const options = this.allDates.map(date => 
            `<option value="${date}">${this.formatDate(date)}</option>`
        ).join('');
        
        if (date1Select) date1Select.innerHTML = options;
        if (date2Select) {
            date2Select.innerHTML = options;
            if (this.allDates.length > 1) {
                date2Select.value = this.allDates[this.allDates.length - 1];
            }
        }
    }
    
    /**
     * 选择最近50天
     */
    selectLatest50Days() {
        this.selectedDates = this.allDates.slice(-50);
        console.log('selectLatest50Days - selectedDates:', this.selectedDates.length);
        this.updateDatePickerModal();
        this.renderChart();
    }
    
    /**
     * 渲染图表
     */
    async renderChart() {
        if (!this.selectedCasename) {
            console.log('renderChart: 无 selectedCasename');
            return;
        }
        
        if (this.selectedRules.length === 0) {
            console.log('renderChart: 无 selectedRules，使用默认');
            this.selectedRules = ['Overall'];
        }
        
        if (this.selectedDates.length === 0) {
            console.log('renderChart: 无 selectedDates，使用最近50天');
            this.selectedDates = this.allDates.slice(-50);
        }
        
        console.log('renderChart 参数:', {
            casename: this.selectedCasename,
            rules: this.selectedRules,
            dates: this.selectedDates.length,
            mode: 'single'
        });
        
        // 获取或创建图表实例
        const container = document.getElementById('mainChart');
        if (!container) {
            console.error('mainChart 容器不存在');
            return;
        }
        
        if (this.chart) {
            this.chart.dispose();
        }
        this.chart = echarts.init(container);
        
        // 显示加载状态
        this.chart.showLoading({
            text: '加载中...',
            color: '#00E5FF',
            textColor: '#94A3B8',
            maskColor: 'rgba(11, 15, 26, 0.6)'
        });
        
        try {
            const requestData = {
                raw_data: this.multiThreadAllData,
                casename: this.selectedCasename,
                rules: this.selectedRules,
                dates: this.selectedDates,
                mode: 'single',
                chart_type: this.currentChartType
            };
            
            console.log('发送请求:', requestData);
            
            const response = await axios.post('/api/chart/data', requestData);
            
            console.log('收到响应:', response.data);
            
            if (response.data.success) {
                let chartData = response.data.data;
                if (typeof chartData === 'string') {
                    chartData = JSON.parse(chartData);
                }
                
                this.chart.hideLoading();
                
                if (Object.keys(chartData.rules || {}).length === 0) {
                    console.warn('没有可显示的图表数据');
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
            this.showErrorMessage('获取图表数据失败: ' + (error.response?.data?.error || error.message));
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
     * 绘制图表
     */
    drawChart(chartData) {
        const { dates, rules, crash_dates } = chartData;
        const isRuntime = this.currentChartType === 'runtime';
        const yAxisName = isRuntime ? 'Runtime (s)' : 'Memory (MB)';
        
        const crashDatesSet = new Set(crash_dates || []);
        const formattedDates = dates.map(d => this.formatDate(d));
        
        const series = [];
        for (const [seriesName, ruleData] of Object.entries(rules)) {
            const values = ruleData.values || [];
            
            series.push({
                name: seriesName,
                type: 'line',
                data: values,
                smooth: false,
                symbol: 'circle',
                symbolSize: 6,
                connectNulls: false,
                lineStyle: { width: 2 },
                emphasis: { focus: 'series' },
                tooltip: {
                    formatter: (params) => {
                        if (!params || params.length === 0) return '';
                        const dataIndex = params[0].dataIndex;
                        const date = dates[dataIndex];
                        const value = values[dataIndex];
                        
                        let html = `<div style="font-weight:600;margin-bottom:8px;">${this.formatDate(date)}</div>`;
                        html += `<div style="display:flex;justify-content:space-between;gap:16px;">
                            <span>${this.escapeHtml(seriesName)}:</span>
                            <span style="font-family:monospace;font-weight:600;">${value !== null && value !== undefined ? value.toFixed(2) : 'N/A'}</span>
                        </div>`;
                        
                        if (crashDatesSet.has(date)) {
                            html += `<div style="color:#EF4444;font-size:11px;margin-top:4px;">⚠️ Crash - 缺少 Overall 数据</div>`;
                        }
                        
                        if (date && date.includes('_user')) {
                            html += `<div style="color:#10B981;font-size:11px;margin-top:4px;">📎 用户添加</div>`;
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
                pageIconSize: 12
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
            console.log('updateStatistics: 无 overall_data');
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
     * 刷新数据
     */
    async refresh() {
        this.userAddedData = {};
        this.multiThreadAllData = { ...this.rawData };
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
                console.log('Casename changed to:', this.selectedCasename);
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
                console.log('Rules changed:', this.selectedRules);
                this.renderChart();
            });
        }
        
        if (this.latest50Btn) {
            this.latest50Btn.addEventListener('click', () => {
                this.selectLatest50Days();
            });
        }
    }
    
    /**
     * 更新项目概况
     */
    updateOverview() {
        const totalCases = Object.keys(this.multiThreadAllData).length;
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
                this.multiThreadAllData = { ...this.rawData, ...this.userAddedData };
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
}

// 全局实例
window.SingleThreadManager = SingleThreadManager;