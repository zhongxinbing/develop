/**
 * 数据对比模块 - 版本对比 & 线程对比
 * 依赖：全局工具函数 escapeHtml, formatDate, showToast（由 tool.js 提供）
 *       以及 ECharts 全局变量 echarts
 */
class ComparisonManager {
    constructor() {
        this.comparisonChart = null;
        this.toolId = null;
        this.currentMode = null; // 'single' 或 'multi'
        this.isInitialized = false;
    }

    /**
     * 初始化对比模块
     * @param {string} toolId - 工具ID
     * @param {function} getCurrentMode - 返回当前模式（'single'/'multi'）的函数
     */
    init(toolId, getCurrentMode) {
        this.toolId = toolId;
        this.getCurrentMode = getCurrentMode;
        this._bindEvents();
        this._populateForms();
        this.isInitialized = true;
    }

    /**
     * 显示对比子选项卡（版本/线程）
     */
    showSubMode(submode) {
        const versionPanel = document.getElementById('versionComparisonPanel');
        const threadPanel = document.getElementById('threadComparisonPanel');
        const tabs = document.querySelectorAll('.comparison-tab');

        tabs.forEach(tab => {
            const mode = tab.dataset.submode;
            const isActive = mode === submode;
            tab.classList.toggle('active', isActive);
            tab.style.background = isActive ? 'var(--primary)' : 'transparent';
            tab.style.color = isActive ? 'var(--bg-deep)' : 'var(--text-secondary)';
        });

        if (versionPanel) versionPanel.style.display = (submode === 'version') ? 'block' : 'none';
        if (threadPanel) threadPanel.style.display = (submode === 'thread') ? 'block' : 'none';

        if (submode === 'thread') {
            this._initThreadChartContainer();
        }
    }

    /**
     * 初始化线程对比图表容器
     */
    _initThreadChartContainer() {
        const container = document.getElementById('threadChart');
        if (container) {
            if (this.comparisonChart) {
                this.comparisonChart.dispose();
            }
            this.comparisonChart = echarts.init(container);
            console.log('线程对比图表容器初始化成功');
        } else {
            console.error('找不到线程对比图表容器 #threadChart');
        }
    }

    // ==================== 事件绑定 ====================
    _bindEvents() {
        // 子选项卡切换
        document.querySelectorAll('.comparison-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                this.showSubMode(tab.dataset.submode);
            });
        });

        // 版本对比确认按钮
        document.getElementById('compConfirmBtn')?.addEventListener('click', () => this._performVersionComparison());
        // 版本对比导出按钮
        document.getElementById('compExportBtn')?.addEventListener('click', () => this._exportVersionComparison());
        // 线程对比确认按钮
        document.getElementById('threadCompConfirmBtn')?.addEventListener('click', () => this._performThreadComparison());

        // 搜索过滤规则（版本对比）
        document.getElementById('compRuleSearch')?.addEventListener('input', function() {
            ComparisonManager._filterOptions('compRuleSelect', this.value);
        });
        // 搜索过滤规则（线程对比）
        document.getElementById('threadCompRuleSearch')?.addEventListener('input', function() {
            ComparisonManager._filterOptions('threadCompRuleSelect', this.value);
        });

        // Casename 变更时更新日期和规则列表
        document.getElementById('compCasenameSelect')?.addEventListener('change', function() {
            window.comparisonManager?._updateForm(this.value, 'version');
        });
        document.getElementById('threadCompCasenameSelect')?.addEventListener('change', function() {
            window.comparisonManager?._updateForm(this.value, 'thread');
        });
    }

    /**
     * 过滤下拉选项（用于规则搜索）
     */
    static _filterOptions(selectId, keyword) {
        const select = document.getElementById(selectId);
        if (!select) return;
        const options = select.querySelectorAll('option');
        const lower = keyword.toLowerCase();
        options.forEach(opt => {
            opt.style.display = opt.textContent.toLowerCase().includes(lower) ? '' : 'none';
        });
    }

    // ==================== 表单填充 ====================
    _populateForms() {
        this._populateForm('version');
        this._populateForm('thread');
    }

    _populateForm(type) {
        const prefix = type === 'version' ? 'comp' : 'threadComp';
        const casenameSelect = document.getElementById(`${prefix}CasenameSelect`);
        if (!casenameSelect) return;

        const mode = this.getCurrentMode();
        let allData = {};
        if (mode === 'single' && window.singleData) {
            allData = window.singleData;
        } else if (mode === 'multi' && window.multiData) {
            allData = window.multiData;
        } else {
            allData = window.singleData || {};
        }

        const casenames = Object.keys(allData);
        const currentVal = casenameSelect.value;
        casenameSelect.innerHTML = casenames.map(name =>
            `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`
        ).join('');
        if (currentVal && casenames.includes(currentVal)) {
            casenameSelect.value = currentVal;
        } else if (casenames.length > 0) {
            casenameSelect.value = casenames[0];
        }

        if (casenameSelect.value) {
            this._updateForm(casenameSelect.value, type);
        }
    }

    _updateForm(casename, type) {
        const prefix = type === 'version' ? 'comp' : 'threadComp';
        const mode = this.getCurrentMode();
        let allData = {};
        if (mode === 'single') allData = window.singleData || {};
        else if (mode === 'multi') allData = window.multiData || {};
        else allData = window.singleData || {};

        const caseData = allData[casename];
        if (!caseData) return;

        // 提取规则
        const rulesSet = new Set();
        if (caseData.runtime) {
            Object.keys(caseData.runtime).forEach(r => rulesSet.add(r));
        }
        if (caseData.memory) {
            Object.keys(caseData.memory).forEach(r => rulesSet.add(r));
        }
        let rules = Array.from(rulesSet).sort();
        if (rules.includes('Overall')) {
            rules.splice(rules.indexOf('Overall'), 1);
            rules.unshift('Overall');
        }

        // 更新规则选择框
        const ruleSelect = document.getElementById(`${prefix}RuleSelect`);
        if (ruleSelect) {
            const currentVals = Array.from(ruleSelect.selectedOptions).map(o => o.value);
            ruleSelect.innerHTML = rules.map(r =>
                `<option value="${escapeHtml(r)}" ${currentVals.includes(r) ? 'selected' : ''}>${escapeHtml(r)}</option>`
            ).join('');
        }

        // 提取日期
        let dates = [];
        if (caseData.runtime && caseData.runtime['Overall']) {
            dates = caseData.runtime['Overall'].dates || [];
        } else if (caseData.memory && caseData.memory['Overall']) {
            dates = caseData.memory['Overall'].dates || [];
        } else {
            const firstRule = rules[0];
            if (firstRule && caseData.runtime && caseData.runtime[firstRule]) {
                dates = caseData.runtime[firstRule].dates || [];
            }
        }
        dates.sort();

        // 更新日期选择框
        const date1Select = document.getElementById(`${prefix}Date1Select`);
        const date2Select = document.getElementById(`${prefix}Date2Select`);
        if (date1Select) {
            date1Select.innerHTML = dates.map(d =>
                `<option value="${d}">${formatDate(d)}</option>`
            ).join('');
            if (dates.length > 0) date1Select.value = dates[0];
        }
        if (date2Select) {
            date2Select.innerHTML = dates.map(d =>
                `<option value="${d}">${formatDate(d)}</option>`
            ).join('');
            if (dates.length > 1) date2Select.value = dates[dates.length - 1];
            else if (dates.length > 0) date2Select.value = dates[0];
        }

        // 如果是版本对比且模式为 multi，更新线程选择框
        if (type === 'version' && mode === 'multi') {
            const threadSelect = document.getElementById('compThreadSelect');
            if (threadSelect) {
                const multiData = window.multiData || {};
                const caseMulti = multiData[casename];
                let allThreads = [];
                if (caseMulti) {
                    ['runtime', 'memory'].forEach(cat => {
                        if (caseMulti[cat]) {
                            Object.values(caseMulti[cat]).forEach(ruleData => {
                                if (ruleData && ruleData.all_threads) {
                                    allThreads = allThreads.concat(ruleData.all_threads);
                                }
                            });
                        }
                    });
                }
                allThreads = [...new Set(allThreads)].sort((a,b) => a - b);
                const currentThreads = Array.from(threadSelect.selectedOptions).map(o => o.value);
                threadSelect.innerHTML = allThreads.map(t =>
                    `<option value="${t}" ${currentThreads.includes(String(t)) ? 'selected' : ''}>${t} 线程</option>`
                ).join('');
            }
        }
    }

    // ==================== 版本对比 ====================
    async _performVersionComparison() {
        const casename = document.getElementById('compCasenameSelect')?.value;
        const date1 = document.getElementById('compDate1Select')?.value;
        const date2 = document.getElementById('compDate2Select')?.value;
        const dimension = document.getElementById('compDimensionSelect')?.value;
        const errorMode = document.getElementById('compErrorModeSelect')?.value;
        const runtimeThreshold = parseFloat(document.getElementById('compRuntimeThreshold')?.value || 0);
        const memoryThreshold = parseFloat(document.getElementById('compMemoryThreshold')?.value || 0);

        const ruleSelect = document.getElementById('compRuleSelect');
        const selectedRules = Array.from(ruleSelect.selectedOptions).map(o => o.value);
        const compareMode = selectedRules.length === 0 ? 'all' : selectedRules[0];

        const threadSelect = document.getElementById('compThreadSelect');
        const threads = Array.from(threadSelect.selectedOptions).map(o => parseInt(o.value));

        if (!casename || !date1 || !date2) {
            showToast('请选择 Casename 和两个日期', 'error');
            return;
        }

        const confirmBtn = document.getElementById('compConfirmBtn');
        const originalText = confirmBtn.textContent;
        confirmBtn.textContent = '对比中...';
        confirmBtn.disabled = true;

        try {
            const response = await axios.post('/api/comparison', {
                tool_id: this.toolId,
                mode: this.getCurrentMode(),
                casename: casename,
                date1: date1,
                date2: date2,
                compare_mode: compareMode,
                dimension: dimension,
                runtime_threshold: runtimeThreshold,
                memory_threshold: memoryThreshold,
                error_mode: errorMode,
                threads: threads,
                compare_type: 'version'
            });

            if (response.data.success) {
                this._renderVersionResults(response.data.data, dimension, date1, date2, errorMode);
            } else {
                showToast(response.data.error || '对比失败', 'error');
            }
        } catch (error) {
            console.error('版本对比失败:', error);
            showToast('版本对比失败: ' + (error.message || '未知错误'), 'error');
        } finally {
            confirmBtn.textContent = originalText;
            confirmBtn.disabled = false;
        }
    }

    _renderVersionResults(result, dimension, date1, date2, errorMode) {
        const stats = result.statistics;
        const comparisons = result.comparisons;

        const statsGrid = document.getElementById('versionStatsGrid');
        if (statsGrid) {
            let html = '';
            if (dimension === 'all' || dimension === 'runtime') {
                html += `
                    <div class="comparison-stat-card tooltip-card">
                        <h4>Runtime 增加 Rule</h4>
                        <div class="comparison-stat-value">${stats.runtime_increased ? stats.runtime_increased.length : 0}</div>
                        <div class="tooltip-content">${this._generateTooltipItems(stats.runtime_increased, '增加', errorMode === 'percentage' ? '%' : 's')}</div>
                    </div>
                    <div class="comparison-stat-card tooltip-card">
                        <h4>Runtime 减少 Rule</h4>
                        <div class="comparison-stat-value">${stats.runtime_decreased ? stats.runtime_decreased.length : 0}</div>
                        <div class="tooltip-content">${this._generateTooltipItems(stats.runtime_decreased, '减少', errorMode === 'percentage' ? '%' : 's')}</div>
                    </div>
                    <div class="comparison-stat-card">
                        <h4>Runtime 增加最大</h4>
                        <div class="comparison-stat-value">${stats.max_runtime_increased && stats.max_runtime_increased.name ? escapeHtml(stats.max_runtime_increased.name) : 'NA'}</div>
                    </div>
                    <div class="comparison-stat-card">
                        <h4>Runtime 减少最大</h4>
                        <div class="comparison-stat-value">${stats.max_runtime_decreased && stats.max_runtime_decreased.name ? escapeHtml(stats.max_runtime_decreased.name) : 'NA'}</div>
                    </div>
                    <div class="comparison-stat-card">
                        <h4>平均 Runtime 变化率</h4>
                        <div class="comparison-stat-value">${(stats.avg_runtime_change || 0).toFixed(2)}%</div>
                    </div>
                `;
            }
            if (dimension === 'all' || dimension === 'memory') {
                html += `
                    <div class="comparison-stat-card tooltip-card">
                        <h4>Memory 增加 Rule</h4>
                        <div class="comparison-stat-value">${stats.memory_increased ? stats.memory_increased.length : 0}</div>
                        <div class="tooltip-content">${this._generateTooltipItems(stats.memory_increased, '增加', errorMode === 'percentage' ? '%' : 'MB')}</div>
                    </div>
                    <div class="comparison-stat-card tooltip-card">
                        <h4>Memory 减少 Rule</h4>
                        <div class="comparison-stat-value">${stats.memory_decreased ? stats.memory_decreased.length : 0}</div>
                        <div class="tooltip-content">${this._generateTooltipItems(stats.memory_decreased, '减少', errorMode === 'percentage' ? '%' : 'MB')}</div>
                    </div>
                    <div class="comparison-stat-card">
                        <h4>Memory 增加最大</h4>
                        <div class="comparison-stat-value">${stats.max_memory_increased && stats.max_memory_increased.name ? escapeHtml(stats.max_memory_increased.name) : 'NA'}</div>
                    </div>
                    <div class="comparison-stat-card">
                        <h4>Memory 减少最大</h4>
                        <div class="comparison-stat-value">${stats.max_memory_decreased && stats.max_memory_decreased.name ? escapeHtml(stats.max_memory_decreased.name) : 'NA'}</div>
                    </div>
                    <div class="comparison-stat-card">
                        <h4>平均 Memory 变化率</h4>
                        <div class="comparison-stat-value">${(stats.avg_memory_change || 0).toFixed(2)}%</div>
                    </div>
                `;
            }
            statsGrid.innerHTML = html;
        }

        const tableHead = document.getElementById('versionTableHead');
        const tableBody = document.getElementById('versionTableBody');
        if (tableHead && tableBody) {
            let headerHtml = '<tr><th>Rule</th>';
            if (dimension === 'all' || dimension === 'runtime') {
                const errorLabel = errorMode === 'absolute' ? '差值' : '变化率';
                headerHtml += `
                    <th>R(${date1})</th>
                    <th>R(${date2})</th>
                    <th>R ${errorLabel}</th>
                    <th>R 状态</th>
                `;
            }
            if (dimension === 'all' || dimension === 'memory') {
                const errorLabel = errorMode === 'absolute' ? '差值' : '变化率';
                headerHtml += `
                    <th>M(${date1})</th>
                    <th>M(${date2})</th>
                    <th>M ${errorLabel}</th>
                    <th>M 状态</th>
                `;
            }
            headerHtml += '</tr>';
            tableHead.innerHTML = headerHtml;

            let rowsHtml = '';
            comparisons.forEach(comp => {
                let rowHtml = `<tr><td>${escapeHtml(comp[0])}</td>`;
                let idx = 1;
                if (dimension === 'all' || dimension === 'runtime') {
                    rowHtml += `
                        <td>${comp[idx++]}</td>
                        <td>${comp[idx++]}</td>
                        <td>${comp[idx++]}</td>
                        <td>${escapeHtml(comp[idx++])}</td>
                    `;
                }
                if (dimension === 'all' || dimension === 'memory') {
                    rowHtml += `
                        <td>${comp[idx++]}</td>
                        <td>${comp[idx++]}</td>
                        <td>${comp[idx++]}</td>
                        <td>${escapeHtml(comp[idx++])}</td>
                    `;
                }
                rowHtml += '</tr>';
                rowsHtml += rowHtml;
            });
            tableBody.innerHTML = rowsHtml;
        }

        this._initSearch('versionComparisonSearch', 'versionTableBody');
    }

    _generateTooltipItems(items, label, unit) {
        if (!items || items.length === 0) {
            return '<div class="tooltip-item"><div class="tooltip-item-name">暂无数据</div></div>';
        }
        return items.slice(0, 10).map(item => {
            const name = Array.isArray(item) ? item[0] : (item.name || '未知');
            const value = Array.isArray(item) ? item[1] : (item.value || 0);
            return `
                <div class="tooltip-item">
                    <div class="tooltip-item-name">${escapeHtml(name)}</div>
                    <div class="tooltip-item-desc">${label}: ${value.toFixed(2)}${unit}</div>
                </div>
            `;
        }).join('');
    }

    _initSearch(searchInputId, tableBodyId) {
        const searchInput = document.getElementById(searchInputId);
        const tableBody = document.getElementById(tableBodyId);
        if (!searchInput || !tableBody) return;

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

    _exportVersionComparison() {
        const tableBody = document.getElementById('versionTableBody');
        if (!tableBody) return;

        const rows = Array.from(tableBody.querySelectorAll('tr'));
        const csvData = rows.map(row => {
            const cells = Array.from(row.querySelectorAll('td'));
            return cells.map(cell => cell.textContent.trim().replace(/\n/g, ';')).join(',');
        });

        const headers = ['Rule', '日期1值', '日期2值', '差值', '状态'];
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

    // ==================== 线程对比 ====================
    async _performThreadComparison() {
        const casename = document.getElementById('threadCompCasenameSelect')?.value;
        const date1 = document.getElementById('threadCompDate1Select')?.value;
        const date2 = document.getElementById('threadCompDate2Select')?.value;
        const dimension = document.getElementById('threadCompDimensionSelect')?.value;

        const ruleSelect = document.getElementById('threadCompRuleSelect');
        const selectedRules = Array.from(ruleSelect.selectedOptions).map(o => o.value);
        const compareMode = selectedRules.length === 0 ? 'all' : selectedRules[0];

        if (!casename || !date1 || !date2 || !compareMode) {
            showToast('请选择 Casename、两个日期和至少一个 Rule', 'error');
            return;
        }

        const confirmBtn = document.getElementById('threadCompConfirmBtn');
        const originalText = confirmBtn.textContent;
        confirmBtn.textContent = '加载中...';
        confirmBtn.disabled = true;

        try {
            const response = await axios.post('/api/comparison', {
                tool_id: this.toolId,
                mode: 'multi',
                casename: casename,
                date1: date1,
                date2: date2,
                compare_mode: compareMode,
                dimension: dimension,
                compare_type: 'thread'
            });

            if (response.data.success) {
                this._renderThreadResults(response.data.data, dimension);
            } else {
                showToast(response.data.error || '线程对比失败', 'error');
            }
        } catch (error) {
            console.error('线程对比失败:', error);
            showToast('线程对比失败: ' + (error.message || '未知错误'), 'error');
        } finally {
            confirmBtn.textContent = originalText;
            confirmBtn.disabled = false;
        }
    }

    _renderThreadResults(result, dimension) {
        if (!this.comparisonChart || this.comparisonChart.isDisposed()) {
            this._initThreadChartContainer();
            if (!this.comparisonChart) return;
        }

        const rulesData = result.rules || {};
        const threads = result.threads || [];
        const date1 = result.date1 || '';
        const date2 = result.date2 || '';

        if (!threads.length || Object.keys(rulesData).length === 0) {
            this.comparisonChart.clear();
            this.comparisonChart.setOption({
                graphic: [{
                    type: 'text',
                    left: 'center',
                    top: 'center',
                    style: { text: '无数据', fill: '#94A3B8', fontSize: 14 }
                }]
            });
            return;
        }

        const colors = ['#00E5FF', '#A855F7', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#14B8A6', '#F97316'];
        let colorIdx = 0;
        const series = [];
        const legendData = [];

        Object.entries(rulesData).forEach(([ruleName, rule]) => {
            const color1 = colors[colorIdx % colors.length];
            const color2 = colors[(colorIdx + 1) % colors.length];
            colorIdx += 2;

            series.push({
                name: `${ruleName} (${dimension === 'runtime' ? 'Runtime' : 'Memory'}) - ${date1}`,
                type: 'line',
                data: rule.date1_values,
                smooth: false,
                symbol: 'circle',
                symbolSize: 6,
                lineStyle: { width: 2, color: color1 },
                itemStyle: { color: color1, borderColor: '#0F172A', borderWidth: 1 },
                emphasis: { focus: 'series' }
            });
            legendData.push(series[series.length - 1].name);

            series.push({
                name: `${ruleName} (${dimension === 'runtime' ? 'Runtime' : 'Memory'}) - ${date2}`,
                type: 'line',
                data: rule.date2_values,
                smooth: false,
                symbol: 'diamond',
                symbolSize: 6,
                lineStyle: { width: 2, color: color2, type: 'dashed' },
                itemStyle: { color: color2, borderColor: '#0F172A', borderWidth: 1 },
                emphasis: { focus: 'series' }
            });
            legendData.push(series[series.length - 1].name);
        });

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
                    let html = `<div style="font-weight:600;margin-bottom:8px;">🧵 线程数: ${thread}</div>`;
                    params.forEach(p => {
                        const val = p.value;
                        const name = p.seriesName;
                        const color = p.color;
                        const unit = dimension === 'runtime' ? 's' : 'MB';
                        html += `<div style="display:flex;justify-content:space-between;gap:16px;margin-bottom:4px;">
                            <span style="color:${color}">● ${escapeHtml(name)}</span>
                            <span style="font-family:monospace;font-weight:600;">${val !== null && val !== undefined ? Number(val).toFixed(2) : 'N/A'} ${unit}</span>
                        </div>`;
                    });
                    return html;
                }
            },
            legend: {
                data: legendData,
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
                axisLabel: { fontSize: 12, color: '#94A3B8', fontWeight: 500 },
                axisLine: { lineStyle: { color: '#334155' } },
                axisTick: { show: false },
                axisPointer: { show: true }
            },
            yAxis: {
                type: 'value',
                name: dimension === 'runtime' ? 'Runtime (s)' : 'Memory (MB)',
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

        this.comparisonChart.setOption(option, true);
        if (!this.comparisonChart._resizeHandler) {
            this.comparisonChart._resizeHandler = () => {
                if (this.comparisonChart && !this.comparisonChart.isDisposed()) {
                    this.comparisonChart.resize();
                }
            };
            window.addEventListener('resize', this.comparisonChart._resizeHandler);
        }
    }
}

// 暴露全局实例
window.ComparisonManager = ComparisonManager;