/**
 * 数据对比模块 - 版本对比 & 线程对比
 * 依赖：全局工具函数 escapeHtml, formatDate, showToast（由 tool.js 提供）
 *       以及 ECharts 全局变量 echarts
 */
class ComparisonManager {
    /**
     * 构造函数
     * 初始化对比管理器的属性
     */
    constructor() {
        this.comparisonChart = null;
        this.toolId = null;
        this.currentMode = null;
        this.isInitialized = false;
        
        // 可搜索下拉框组件实例
        this.casenameSelect = null;
        this.date1Select = null;
        this.date2Select = null;
        this.dimensionSelect = null;
        this.errorModeSelect = null;
        this.ruleSelect = null;
        this.threadSelect = null;
        
        this.threadCasenameSelect = null;
        this.threadDate1Select = null;
        this.threadDate2Select = null;
        this.threadDimensionSelect = null;
        this.threadRuleSelect = null;
    }


    init(toolId, getCurrentMode) {
        this.toolId = toolId;
        this.getCurrentMode = getCurrentMode;

        // ========== 版本对比 ==========
        this.casenameSelect = new SearchableSelect({
            container: document.getElementById('compCasenameSelect'),
            options: [],
            placeholder: '请选择 Casename...',
            onChange: (value) => {
                if (value) {
                    window.comparisonManager?._updateForm(value, 'version');
                }
            }
        });

        this.date1Select = new SearchableSelect({
            container: document.getElementById('compDate1Select'),
            options: [],
            placeholder: '请选择日期1...',
            onChange: () => {}
        });

        this.date2Select = new SearchableSelect({
            container: document.getElementById('compDate2Select'),
            options: [],
            placeholder: '请选择日期2...',
            onChange: () => {}
        });

        this.dimensionSelect = new SearchableSelect({
            container: document.getElementById('compDimensionSelect'),
            options: [
                { value: 'all', label: '全部' },
                { value: 'runtime', label: 'Runtime' },
                { value: 'memory', label: 'Memory' }
            ],
            placeholder: '请选择对比维度...',
            onChange: () => {}
        });

        this.errorModeSelect = new SearchableSelect({
            container: document.getElementById('compErrorModeSelect'),
            options: [
                { value: 'absolute', label: '绝对值' },
                { value: 'percentage', label: '百分比' }
            ],
            placeholder: '请选择误差模式...',
            onChange: () => {}
        });

        this.ruleSelect = new SearchableSelect({
            container: document.getElementById('compRuleSelect'),
            options: [],
            multiple: true,
            placeholder: '请选择 Rule...',
            onChange: () => {}
        });

        this.threadSelect = new SearchableSelect({
            container: document.getElementById('compThreadSelect'),
            options: [],
            multiple: true,
            placeholder: '请选择线程...',
            onChange: () => {}
        });

        // ========== 线程对比 ==========
        this.threadCasenameSelect = new SearchableSelect({
            container: document.getElementById('threadCompCasenameSelect'),
            options: [],
            placeholder: '请选择 Casename...',
            onChange: (value) => {
                if (value) {
                    window.comparisonManager?._updateForm(value, 'thread');
                }
            }
        });

        this.threadRuleSelect = new SearchableSelect({
            container: document.getElementById('threadCompRuleSelect'),
            options: [],
            multiple: true,
            placeholder: '请选择 Rule...',
            onChange: () => {}
        });

        // ===== 修复：线程多选选择框 =====
        this.threadThreadSelect = new SearchableSelect({
            container: document.getElementById('threadCompThreadSelect'),
            options: [],
            multiple: true,
            placeholder: '请选择线程...',
            onChange: () => {}
        });

        // ===== 修复：日期选择框 =====
        this.threadDateSelect = new SearchableSelect({
            container: document.getElementById('threadCompDateSelect'),
            options: [],
            placeholder: '请选择日期...',
            onChange: () => {}
        });

        this.threadDimensionSelect = new SearchableSelect({
            container: document.getElementById('threadCompDimensionSelect'),
            options: [
                { value: 'runtime', label: 'Runtime' },
                { value: 'memory', label: 'Memory' }
            ],
            placeholder: '请选择对比维度...',
            onChange: () => {}
        });

        // ===== 修复：误差模式选择框 =====
        this.threadErrorModeSelect = new SearchableSelect({
            container: document.getElementById('threadCompErrorModeSelect'),
            options: [
                { value: 'absolute', label: '绝对值' },
                { value: 'percentage', label: '百分比' }
            ],
            placeholder: '请选择误差模式...',
            onChange: () => {}
        });

        // 阈值输入框
        this.threadRuntimeThreshold = document.getElementById('threadCompRuntimeThreshold');
        this.threadMemoryThreshold = document.getElementById('threadCompMemoryThreshold');

        // 导出按钮
        this.threadExportBtn = document.getElementById('threadCompExportBtn');

        this._bindEvents();
        this._populateForms();
        this.isInitialized = true;
    }

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

    _bindEvents() {
        document.querySelectorAll('.comparison-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                this.showSubMode(tab.dataset.submode);
            });
        });

        document.getElementById('compConfirmBtn')?.addEventListener('click', () => this._performVersionComparison());
        document.getElementById('compExportBtn')?.addEventListener('click', () => this._exportVersionComparison());
        document.getElementById('threadCompConfirmBtn')?.addEventListener('click', () => this._performThreadComparison());

        document.getElementById('compRuleSearch')?.addEventListener('input', function() {
            ComparisonManager._filterOptions('compRuleSelect', this.value);
        });
        document.getElementById('threadCompRuleSearch')?.addEventListener('input', function() {
            ComparisonManager._filterOptions('threadCompRuleSelect', this.value);
        });

        document.getElementById('threadCompConfirmBtn')?.addEventListener('click', () => this._performThreadComparison());
        document.getElementById('threadCompExportBtn')?.addEventListener('click', () => this._exportThreadComparison());

    }

    static _filterOptions(selectId, keyword) {
        // 对于 SearchableSelect 组件，搜索是内置的
        // 这里的 filterOptions 方法可以保留用于兼容
        const container = document.getElementById(selectId);
        if (!container) return;
        const select = container.querySelector('.searchable-select');
        if (select) {
            const searchInput = select.querySelector('.dropdown-search input');
            if (searchInput) {
                searchInput.value = keyword;
                searchInput.dispatchEvent(new Event('input'));
            }
        }
    }

    _populateForms() {
        this._populateForm('version');
        this._populateForm('thread');
    }

    _populateForm(type) {
        const prefix = type === 'version' ? 'comp' : 'threadComp';
        const casenameSelect = type === 'version' ? this.casenameSelect : this.threadCasenameSelect;
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
        const currentVal = casenameSelect.getValue();
        
        const options = casenames.map(name => ({
            value: name,
            label: name
        }));
        
        casenameSelect.setOptions(options);

        if (currentVal && casenames.includes(currentVal)) {
            casenameSelect.setValue(currentVal);
        } else if (casenames.length > 0) {
            casenameSelect.setValue(casenames[0]);
        }

        if (casenameSelect.getValue()) {
            this._updateForm(casenameSelect.getValue(), type);
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

        const ruleSelect = type === 'version' ? this.ruleSelect : this.threadRuleSelect;
        if (ruleSelect) {
            const currentVals = ruleSelect.getValue() || [];
            const options = rules.map(r => ({
                value: r,
                label: r
            }));
            ruleSelect.setOptions(options);
            if (currentVals.length > 0) {
                const validVals = currentVals.filter(v => rules.includes(v));
                if (validVals.length > 0) {
                    ruleSelect.setValue(validVals);
                }
            }
        }

        // 获取日期列表
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

        // ===== 版本对比：日期1 和 日期2 =====
        if (type === 'version') {
            const date1Select = this.date1Select;
            const date2Select = this.date2Select;
            
            if (date1Select) {
                const options = dates.map(d => ({
                    value: d,
                    label: formatDate(d)
                }));
                date1Select.setOptions(options);
                if (dates.length > 0) date1Select.setValue(dates[0]);
            }
            if (date2Select) {
                const options = dates.map(d => ({
                    value: d,
                    label: formatDate(d)
                }));
                date2Select.setOptions(options);
                if (dates.length > 1) date2Select.setValue(dates[dates.length - 1]);
                else if (dates.length > 0) date2Select.setValue(dates[0]);
            }
        }

        // ===== 线程对比：日期（单选） =====
        if (type === 'thread') {
            const dateSelect = this.threadDateSelect;
            if (dateSelect) {
                const options = dates.map(d => ({
                    value: d,
                    label: formatDate(d)
                }));
                dateSelect.setOptions(options);
                if (dates.length > 0) dateSelect.setValue(dates[dates.length - 1]);
            }

            // 线程对比的线程选择框
            const threadSelect = this.threadThreadSelect;
            if (threadSelect && mode === 'multi') {
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
                allThreads = [...new Set(allThreads)].sort((a, b) => a - b);
                const currentThreads = threadSelect.getValue() || [];
                const options = allThreads.map(t => ({
                    value: String(t),
                    label: t + ' 线程'
                }));
                threadSelect.setOptions(options);
                if (currentThreads.length > 0) {
                    const validVals = currentThreads.filter(v => allThreads.includes(Number(v)));
                    if (validVals.length > 0) {
                        threadSelect.setValue(validVals);
                    }
                }
            }
        }
    }

    // ==================== 版本对比 ====================

    /**
     * 执行版本对比
     * 收集表单参数，调用后端 API 进行版本对比计算
     */
    async _performVersionComparison() {
        // 收集表单参数
        const casename = document.getElementById('compCasenameSelect')?.value;
        const date1 = document.getElementById('compDate1Select')?.value;
        const date2 = document.getElementById('compDate2Select')?.value;
        const dimension = document.getElementById('compDimensionSelect')?.value;
        const errorMode = document.getElementById('compErrorModeSelect')?.value;
        const runtimeThreshold = parseFloat(document.getElementById('compRuntimeThreshold')?.value || 0);
        const memoryThreshold = parseFloat(document.getElementById('compMemoryThreshold')?.value || 0);

        // 获取选中的规则（多选时取第一个作为对比模式）
        const ruleSelect = document.getElementById('compRuleSelect');
        const selectedRules = Array.from(ruleSelect.selectedOptions).map(o => o.value);
        const compareMode = selectedRules.length === 0 ? 'all' : selectedRules[0];

        // 获取选中的线程列表
        const threadSelect = document.getElementById('compThreadSelect');
        const threads = Array.from(threadSelect.selectedOptions).map(o => parseInt(o.value));

        // 验证必填参数
        if (!casename || !date1 || !date2) {
            showToast('请选择 Casename 和两个日期', 'error');
            return;
        }

        // 更新按钮状态
        const confirmBtn = document.getElementById('compConfirmBtn');
        const originalText = confirmBtn.textContent;
        confirmBtn.textContent = '对比中...';
        confirmBtn.disabled = true;

        try {
            // 发送对比请求
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
                // 渲染对比结果
                this._renderVersionResults(response.data.data, dimension, date1, date2, errorMode);
            } else {
                showToast(response.data.error || '对比失败', 'error');
            }
        } catch (error) {
            console.error('版本对比失败:', error);
            showToast('版本对比失败: ' + (error.message || '未知错误'), 'error');
        } finally {
            // 恢复按钮状态
            confirmBtn.textContent = originalText;
            confirmBtn.disabled = false;
        }
    }

    /**
     * 渲染版本对比结果
     * 显示统计卡片、对比结果表格，并支持搜索过滤
     * @param {object} result - 后端返回的对比结果
     * @param {string} dimension - 对比维度 ('all'|'runtime'|'memory')
     * @param {string} date1 - 日期1
     * @param {string} date2 - 日期2
     * @param {string} errorMode - 误差模式 ('absolute'|'percentage')
     */
    _renderVersionResults(result, dimension, date1, date2, errorMode) {
        const stats = result.statistics;
        const comparisons = result.comparisons;

        // ---------- 渲染统计卡片 ----------
        const statsGrid = document.getElementById('versionStatsGrid');
        if (statsGrid) {
            let html = '';
            // Runtime 统计卡片
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
            // Memory 统计卡片
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

        // ---------- 渲染对比结果表格 ----------
        const tableHead = document.getElementById('versionTableHead');
        const tableBody = document.getElementById('versionTableBody');
        if (tableHead && tableBody) {
            // 构建表头
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

            // 构建表格行
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

        // 初始化表格搜索功能
        this._initSearch('versionComparisonSearch', 'versionTableBody');
    }

    /**
     * 生成 Tooltip 内容 HTML
     * 用于统计卡片的悬浮提示，展示具体的 Rule 变化详情
     * @param {Array} items - 数据项数组
     * @param {string} label - 变化标签（如 "增加"/"减少"）
     * @param {string} unit - 单位（如 "s"/"%"/"MB"）
     * @returns {string} HTML 字符串
     */
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

    /**
     * 初始化表格搜索功能
     * 绑定搜索框的 input 事件，实时过滤表格行
     * @param {string} searchInputId - 搜索输入框 ID
     * @param {string} tableBodyId - 表格主体 ID
     */
    _initSearch(searchInputId, tableBodyId) {
        const searchInput = document.getElementById(searchInputId);
        const tableBody = document.getElementById(tableBodyId);
        if (!searchInput || !tableBody) return;

        // 克隆节点以移除旧事件监听
        const newSearch = searchInput.cloneNode(true);
        searchInput.parentNode.replaceChild(newSearch, searchInput);

        newSearch.addEventListener('input', function() {
            const term = this.value.toLowerCase().trim();
            const rows = tableBody.querySelectorAll('tr');
            let visibleCount = 0;
            // 遍历所有行，根据搜索词显示/隐藏
            rows.forEach(row => {
                const text = row.textContent.toLowerCase();
                if (term === '' || text.includes(term)) {
                    row.style.display = '';
                    visibleCount++;
                } else {
                    row.style.display = 'none';
                }
            });
            // 显示/隐藏 "无匹配结果" 提示
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
     * 导出版本对比结果为 CSV 文件
     * 收集表格数据，生成带 BOM 的 UTF-8 CSV 文件并触发下载
     */
    _exportVersionComparison() {
        const tableBody = document.getElementById('versionTableBody');
        if (!tableBody) return;

        // 收集表格行数据
        const rows = Array.from(tableBody.querySelectorAll('tr'));
        const csvData = rows.map(row => {
            const cells = Array.from(row.querySelectorAll('td'));
            return cells.map(cell => cell.textContent.trim().replace(/\n/g, ';')).join(',');
        });

        // 构建 CSV 内容
        const headers = ['Rule', '日期1值', '日期2值', '差值', '状态'];
        const csvContent = [headers, ...csvData].map(row => row.join(',')).join('\n');

        // 创建下载链接并触发下载
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

    /**
     * 执行线程对比
     * 收集表单参数，调用后端 API 进行线程对比计算
     */
    async _performThreadComparison() {
        // 收集表单参数
        const casename = document.getElementById('threadCompCasenameSelect')?.value;
        const date = document.getElementById('threadCompDateSelect')?.value;
        const dimension = document.getElementById('threadCompDimensionSelect')?.value;
        const errorMode = document.getElementById('threadCompErrorModeSelect')?.value;
        const runtimeThreshold = parseFloat(document.getElementById('threadCompRuntimeThreshold')?.value || 0);
        const memoryThreshold = parseFloat(document.getElementById('threadCompMemoryThreshold')?.value || 0);

        // 获取选中的规则（多选）
        const ruleSelect = document.getElementById('threadCompRuleSelect');
        const selectedRules = ruleSelect?.value || [];

        // 获取选中的线程（多选）
        const threadSelect = document.getElementById('threadCompThreadSelect');
        const selectedThreads = threadSelect?.value || [];

        // 验证必填参数
        if (!casename || !date || selectedRules.length === 0) {
            showToast('请选择 Casename、日期和至少一个 Rule', 'error');
            return;
        }

        // 使用第一个规则作为对比规则，或者使用 'all'
        const compareMode = selectedRules.length === 0 ? 'all' : selectedRules[0];

        // 更新按钮状态
        const confirmBtn = document.getElementById('threadCompConfirmBtn');
        const originalText = confirmBtn.textContent;
        confirmBtn.textContent = '对比中...';
        confirmBtn.disabled = true;

        try {
            const response = await axios.post('/api/comparison', {
                tool_id: this.toolId,
                mode: 'multi',
                casename: casename,
                date1: date,
                compare_mode: compareMode,
                dimension: dimension,
                runtime_threshold: runtimeThreshold,
                memory_threshold: memoryThreshold,
                error_mode: errorMode,
                threads: selectedThreads,
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

    /**
     * 渲染线程对比结果
     * 使用 ECharts 绘制折线图，展示不同日期各规则在线程维度上的性能对比
     * @param {object} result - 后端返回的对比结果
     * @param {string} dimension - 对比维度 ('runtime'|'memory')
     */
    _renderThreadResults(result, dimension) {
        // 确保图表实例有效
        if (!this.comparisonChart || this.comparisonChart.isDisposed()) {
            this._initThreadChartContainer();
            if (!this.comparisonChart) return;
        }

        const rulesData = result.rules || {};   // 各规则的对比数据
        const threads = result.threads || [];   // 线程数列表
        const date1 = result.date1 || '';
        const date2 = result.date2 || '';

        // 无数据时显示提示
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

        // 准备配色方案
        const colors = ['#00E5FF', '#A855F7', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#14B8A6', '#F97316'];
        let colorIdx = 0;
        const series = [];
        const legendData = [];

        // 为每个规则生成两条折线（date1 实线，date2 虚线）
        Object.entries(rulesData).forEach(([ruleName, rule]) => {
            const color1 = colors[colorIdx % colors.length];
            const color2 = colors[(colorIdx + 1) % colors.length];
            colorIdx += 2;

            // date1 折线（实线）
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

            // date2 折线（虚线）
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

        // 构建 ECharts 配置
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

        // 应用配置并绑定窗口大小调整事件
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

    _exportThreadComparison() {
    // 导出线程对比结果为 CSV
    const chart = this.comparisonChart;
    if (!chart || chart.isDisposed()) {
        showToast('没有可导出的图表数据', 'error');
        return;
    }

    // 获取图表数据
    const option = chart.getOption();
    const series = option.series || [];
    const xAxisData = option.xAxis?.[0]?.data || [];

    if (series.length === 0 || xAxisData.length === 0) {
        showToast('没有可导出的数据', 'error');
        return;
    }

    // 构建 CSV
    let csv = '线程';
    series.forEach(s => { csv += `,${s.name}`; });
    csv += '\n';

    for (let i = 0; i < xAxisData.length; i++) {
        csv += xAxisData[i];
        series.forEach(s => {
            const val = s.data?.[i] ?? '';
            csv += `,${val}`;
        });
        csv += '\n';
    }

    // 下载 CSV
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.href = url;
    link.setAttribute('download', `thread_comparison_${new Date().toISOString().slice(0,19)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

}



// 在 ComparisonManager 构造函数中添加
this.threadCompThreadSelect = null;
this.threadCompErrorModeSelect = null;
this.threadCompRuntimeThreshold = null;
this.threadCompMemoryThreshold = null;
this.threadCompExportBtn = null;

// 在 init 方法中添加初始化（在现有的 threadComp 初始化后面添加）
this.threadCompThreadSelect = new SearchableSelect({
    container: document.getElementById('threadCompThreadSelect'),
    options: [],
    multiple: true,
    placeholder: '请选择线程...',
    onChange: () => {}
});

this.threadCompErrorModeSelect = new SearchableSelect({
    container: document.getElementById('threadCompErrorModeSelect'),
    options: [
        { value: 'absolute', label: '绝对值' },
        { value: 'percentage', label: '百分比' }
    ],
    placeholder: '请选择误差模式...',
    onChange: () => {}
});




// 阈值输入框
this.threadCompRuntimeThreshold = document.getElementById('threadCompRuntimeThreshold');
this.threadCompMemoryThreshold = document.getElementById('threadCompMemoryThreshold');

// 导出按钮
this.threadCompExportBtn = document.getElementById('threadCompExportBtn');

// 将 ComparisonManager 暴露到全局作用域，供其他模块使用
window.ComparisonManager = ComparisonManager;