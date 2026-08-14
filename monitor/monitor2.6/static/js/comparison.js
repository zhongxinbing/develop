/**
 * 数据对比模块 - 统一对比入口
 * 支持单线程版本对比和多线程对比
 */
class ComparisonManager {
    constructor() {
        this.toolId = null;
        this.isInitialized = false;
        this.mode = 'single';

        // UI 组件引用
        this.casenameSelect = null;
        this.dimensionSelect = null;
        this.threadSelect = null;
        this.ruleSelect = null;
        this.date1Select = null;
        this.date2Select = null;
        this.errorModeSelect = null;
        this.runtimeThreshold = null;
        this.memoryThreshold = null;
        this.confirmBtn = null;
        this.exportBtn = null;

        // 数据缓存与选中状态
        this.allCasenames = [];
        this.allDimensions = ['cputime', 'realtime', 'peakmem', 'incmem', 'realtimeincmem'];
        this.allThreads = [];
        this.allRules = [];
        this.allDates = [];
        this.caseData = {};

        this.selectedCasename = '';
        this.selectedDimensions = [];  // 改为数组，支持多维度
        this.selectedThreads = [];
        this.selectedRule = '';
        this.selectedDate1 = '';
        this.selectedDate2 = '';
        this.selectedErrorMode = '';
        this.runtimeThresholdValue = 0;
        this.memoryThresholdValue = 0;

        this.comparisonData = null;

        // 绑定事件
        this._onCasenameChange = this._onCasenameChange.bind(this);
        this._onDimensionChange = this._onDimensionChange.bind(this);
        this._onThreadChange = this._onThreadChange.bind(this);
        this._onRuleChange = this._onRuleChange.bind(this);
        this._onDate1Change = this._onDate1Change.bind(this);
        this._onDate2Change = this._onDate2Change.bind(this);
        this._performComparison = this._performComparison.bind(this);
        this._exportComparison = this._exportComparison.bind(this);
    }

    /**
     * 初始化对比管理器
     */
    init(toolId) {
        this.toolId = toolId;

        // 初始化 Casename 选择器
        this.casenameSelect = new SearchableSelect({
            container: document.getElementById('compCasenameSelect'),
            options: [],
            placeholder: '请选择 Casename...',
            onChange: this._onCasenameChange
        });

        // 初始化对比维度选择器 - 支持多选
        this.dimensionSelect = new SearchableSelect({
            container: document.getElementById('compDimensionSelect'),
            options: [],
            multiple: true,
            placeholder: '请选择对比维度...',
            onChange: this._onDimensionChange
        });

        // 初始化线程数选择器
        this.threadSelect = new SearchableSelect({
            container: document.getElementById('compThreadSelect'),
            options: [],
            multiple: true,
            placeholder: '请选择线程数...',
            onChange: this._onThreadChange
        });

        // 初始化 Rule 选择器
        this.ruleSelect = new SearchableSelect({
            container: document.getElementById('compRuleSelect'),
            options: [],
            placeholder: '请选择 Rule...',
            onChange: this._onRuleChange
        });

        // 初始化日期1选择器
        this.date1Select = new SearchableSelect({
            container: document.getElementById('compDate1Select'),
            options: [],
            placeholder: '请选择日期...',
            onChange: this._onDate1Change
        });

        // 初始化日期2选择器
        this.date2Select = new SearchableSelect({
            container: document.getElementById('compDate2Select'),
            options: [],
            placeholder: '请选择日期...',
            onChange: this._onDate2Change
        });

        // 初始化误差模式选择器
        this.errorModeSelect = new SearchableSelect({
            container: document.getElementById('compErrorModeSelect'),
            options: [
                { value: 'absolute', label: '绝对值' },
                { value: 'percentage', label: '百分比' }
            ],
            placeholder: '请选择误差模式...',
            onChange: (value) => {
                this.selectedErrorMode = value || 'absolute';
            }
        });

        // 初始化阈值输入框和按钮
        this.runtimeThreshold = document.getElementById('compRuntimeThreshold');
        this.memoryThreshold = document.getElementById('compMemoryThreshold');
        this.confirmBtn = document.getElementById('compConfirmBtn');
        this.exportBtn = document.getElementById('compExportBtn');

        // 绑定按钮事件
        this.confirmBtn.addEventListener('click', this._performComparison);
        this.exportBtn.addEventListener('click', this._exportComparison);

        this.isInitialized = true;
        this._populateCasenameOptions();
        
        // 默认选择误差模式
        if (this.errorModeSelect) {
            this.errorModeSelect.setValue('absolute');
            this.selectedErrorMode = 'absolute';
        }
    }

    // ==================== 事件处理方法 ====================

    _onCasenameChange(value) {
        this.selectedCasename = value;
        if (value) {
            this._loadDimensions(value);
        }
    }

    _onDimensionChange(values) {
        this.selectedDimensions = values || [];
        if (values && values.length > 0 && this.selectedCasename) {
            this._loadRulesAndThreads(values[0]);  // 使用第一个维度加载
        }
    }

    _onThreadChange(values) {
        this.selectedThreads = values ? values.map(v => parseInt(v)) : [];
        this._updateDateVisibility();
        // 更新布局后，重新调整日期选项
        if (this.selectedCasename && this.selectedDimensions.length > 0) {
            this._loadDates();
        }
    }

    _onRuleChange(value) {
        this.selectedRule = value;
        if (this.selectedCasename && this.selectedDimensions.length > 0) {
            this._loadDates();
        }
    }

    _onDate1Change(value) {
        this.selectedDate1 = value;
        this._updateDate2Options();
    }

    _onDate2Change(value) {
        this.selectedDate2 = value;
        this._updateDate1Options();
    }

    // ==================== 数据加载方法 ====================

    async _populateCasenameOptions() {
        const data = window.multiData || {};
        this.allCasenames = data;
        const options = this.allCasenames.map(name => ({ value: name, label: name }));
        this.casenameSelect.setOptions(options);
        
    }

    async _loadDimensions(casename) {
        // const caseData = this.caseData[casename] || {};

        // 加载case的数据
        const response = await axios.post('/api/chart/parsers', {
            toolId: window.toolId,
            casename: this.selectedCasename,
            chartType: 'comparison',
        });
        
        if (response.data.success) {
            const caseData = response.data.data;
            this.caseData[this.selectedCasename] = caseData;
        } else {
            this.showErrorMessage(chart, response.data.error || '获取数据失败');
        }
        const caseData = this.caseData[casename] || {};
        if (!caseData) {
            this.dimensionSelect.setOptions([]);
            return;
        }

        const availableDimensions = [];
        const dimensionMap = {
            'cputime': 'CPU Time',
            'realtime': 'Real Time',
            'peakmem': '峰值内存',
            'incmem': '增量内存',
            'realtimeincmem': '实时增量内存'
        };

        for (const dim of this.allDimensions) {
            if (caseData[dim] && Object.keys(caseData[dim]).length > 0) {
                availableDimensions.push({ value: dim, label: dimensionMap[dim] || dim });
            }
        }

        this.dimensionSelect.setOptions(availableDimensions);
        
        // 默认全选所有维度
        if (availableDimensions.length > 0) {
            const allValues = availableDimensions.map(d => d.value);
            this.dimensionSelect.setValue(allValues);
            this.selectedDimensions = allValues;
        }
    }

    _loadRulesAndThreads(dimension) {
        const data = this.caseData || {};
        const caseData = data[this.selectedCasename];
        if (!caseData || !caseData[dimension]) {
            this.ruleSelect.setOptions([]);
            this.threadSelect.setOptions([]);
            return;
        }

        const dimData = caseData[dimension];
        const rules = Object.keys(dimData).sort();

        // 更新 Rule 选择器
        const ruleOptions = rules.map(r => ({ value: r, label: r }));
        ruleOptions.unshift({ value: 'all', label: '全部 (对比所有 Rule)' });
        this.ruleSelect.setOptions(ruleOptions);
        this.allRules = rules;

        // 提取所有线程数
        const threadSet = new Set();
        for (const rule of rules) {
            const ruleData = dimData[rule];
            if (ruleData) {
                for (const thread of Object.keys(ruleData)) {
                    if (thread !== '-1' && !isNaN(parseInt(thread))) {
                        threadSet.add(parseInt(thread));
                    }
                }
            }
        }
        // 添加单线程
        if (Object.keys(dimData).some(r => dimData[r]['-1'])) {
            threadSet.add(-1);
        }

        this.allThreads = Array.from(threadSet).sort((a, b) => {
            if (a === -1) return -1;
            if (b === -1) return 1;
            return a - b;
        });

        const threadOptions = this.allThreads.map(t => ({
            value: String(t),
            label: t === -1 ? '单线程' : `${t} 线程`
        }));

        this.threadSelect.setOptions(threadOptions);

        // 默认选中单线程
        if (threadOptions.length > 0) {
            const singleThread = threadOptions.find(o => o.value === '-1');
            if (singleThread) {
                this.threadSelect.setValue(['-1']);
                this.selectedThreads = [-1];
            } else {
                this.threadSelect.setValue([threadOptions[0].value]);
                this.selectedThreads = [parseInt(threadOptions[0].value)];
            }
        }

        this._loadDates();
        this._updateDateVisibility();
    }

    _loadDates() {
        const data = this.caseData || {};
        const caseData = data[this.selectedCasename];
        if (!caseData || !this.selectedDimensions.length) {
            return;
        }

        const dimData = caseData[this.selectedDimensions[0]];
        const dateSet = new Set();
        const selectedThreads = this.selectedThreads.map(t => String(t));

        for (const rule of Object.keys(dimData)) {
            if (this.selectedRule && this.selectedRule !== 'all' && rule !== this.selectedRule) {
                continue;
            }
            const ruleData = dimData[rule];
            if (!ruleData) continue;

            for (const thread of selectedThreads) {
                if (ruleData[thread] && ruleData[thread].date) {
                    ruleData[thread].date.forEach(d => dateSet.add(d));
                }
            }
        }

        this.allDates = Array.from(dateSet).sort();
        const options = this.allDates.map(d => ({ value: d, label: this._formatDate(d) }));

        this.date1Select.setOptions(options);
        this.date2Select.setOptions(options);

        // 默认选择
        const threadCount = this.selectedThreads.length;
        if (this.allDates.length > 0) {
            if (threadCount <= 1 && this.allDates.length >= 2) {
                // 单线程：选最近两个日期
                this.date1Select.setValue(this.allDates[this.allDates.length - 2], true);
                this.selectedDate1 = this.allDates[this.allDates.length - 2];
                this.date2Select.setValue(this.allDates[this.allDates.length - 1], true);
                this.selectedDate2 = this.allDates[this.allDates.length - 1];
            } else {
                // 多线程：只选一个日期
                this.date1Select.setValue(this.allDates[this.allDates.length - 1], true);
                this.selectedDate1 = this.allDates[this.allDates.length - 1];
                this.selectedDate2 = '';
                this.date2Select.setValue('', true);
            }
        }
    }

    // ==================== UI 更新方法 ====================

    _updateDateVisibility() {
        const date2Group = document.getElementById('compDate2Group');
        const formContainer = document.querySelector('#comparisonContainer .comparison-form > div:first-child');
        if (!date2Group) return;

        const threadCount = this.selectedThreads ? this.selectedThreads.length : 0;
        const date1Label = document.querySelector('#comparisonContainer .filter-group label[for="compDate1Select"]');

        // 判断是否多维度
        const dimCount = this.selectedDimensions ? this.selectedDimensions.length : 0;

        if (threadCount <= 1) {
            // 单线程：显示日期2
            date2Group.style.display = '';
            if (date1Label) {
                date1Label.textContent = '📅 日期1 *';
            }
            if (formContainer) {
                formContainer.style.gridTemplateColumns = '1fr 1fr 1fr 1fr 1fr 1fr';
            }
        } else {
            // 多线程：隐藏日期2
            date2Group.style.display = 'none';
            if (date1Label) {
                date1Label.textContent = '📅 日期 *';
            }
            this.selectedDate2 = '';
            if (formContainer) {
                formContainer.style.gridTemplateColumns = '1fr 1fr 1fr 1fr 1fr';
            }
        }
    }

    _updateDate1Options() {
        if (!this.selectedDate2) return;
        const options = this.allDates
            .filter(d => d !== this.selectedDate2)
            .map(d => ({ value: d, label: this._formatDate(d) }));
        this.date1Select.setOptions(options);
        if (options.length > 0 && !this.selectedDate1) {
            this.date1Select.setValue(options[0].value, true);
            this.selectedDate1 = options[0].value;
        }
    }

    _updateDate2Options() {
        if (!this.selectedDate1) return;
        const options = this.allDates
            .filter(d => d !== this.selectedDate1)
            .map(d => ({ value: d, label: this._formatDate(d) }));
        this.date2Select.setOptions(options);
        if (options.length > 0 && !this.selectedDate2) {
            this.date2Select.setValue(options[0].value, true);
            this.selectedDate2 = options[0].value;
        }
    }

    // ==================== 执行对比 ====================

    async _performComparison() {
        // 验证必填参数
        if (!this.selectedCasename) {
            this._showToast('请选择 Casename', 'error');
            return;
        }

        if (!this.selectedDate1) {
            this._showToast('请选择日期', 'error');
            return;
        }

        const isMultiThread = this.selectedThreads.length > 1;
        const isMultiDimension = this.selectedDimensions.length > 1;

        if (!isMultiThread && !this.selectedDate2) {
            this._showToast('单线程对比需要选择两个日期', 'error');
            return;
        }

        // 获取阈值
        this.runtimeThresholdValue = parseFloat(this.runtimeThreshold?.value || 0);
        this.memoryThresholdValue = parseFloat(this.memoryThreshold?.value || 0);

        // 构建参数
        const dimensions = this.selectedDimensions.length > 0 ? this.selectedDimensions : null;
        const compareMode = (this.selectedRule === 'all' || !this.selectedRule) ? 'all' : this.selectedRule;
        const errorMode = this.selectedErrorMode || 'absolute';
        const compareType = isMultiThread ? 'thread' : 'single';

        // 提示信息
        if (!this.selectedDimensions.length) {
            this._showToast('请选择至少一个对比维度', 'error');
            return;
        }

        // 按钮加载状态
        this.confirmBtn.textContent = '对比中...';
        this.confirmBtn.disabled = true;

        try {
            const payload = {
                tool_id: this.toolId,
                mode: 'multi',
                casename: this.selectedCasename,
                date1: this.selectedDate1,
                date2: isMultiThread ? '' : this.selectedDate2,
                compare_mode: [compareMode],
                dimensions: dimensions,  // 传递维度数组
                runtime_threshold: this.runtimeThresholdValue,
                memory_threshold: this.memoryThresholdValue,
                error_mode: errorMode,
                threads: this.selectedThreads,
                compare_type: compareType,
                is_multi_dimension: isMultiDimension
            };
            
            console.log('对比参数:', payload);
            const response = await axios.post('/api/comparison', payload);
            console.warn('对比响应:', response.data.data);
            if (response.data.success) {
                this.comparisonData = response.data.data;
                this._renderResults(response.data.data, isMultiDimension, isMultiThread);
                this._showToast('对比完成', 'success');
            } else {
                this._showToast(response.data.error || '对比失败', 'error');
            }
        } catch (error) {
            console.error('对比失败:', error);
            this._showToast('对比失败: ' + (error.message || '未知错误'), 'error');
        } finally {
            this.confirmBtn.textContent = '确认对比';
            this.confirmBtn.disabled = false;
        }
    }

    // ==================== 渲染结果 ====================

    _renderResults(result, isMultiDimension, isMultiThread) {
        const stats = result.statistics || {};
        const comparisons = result.comparisons || [];

        this._renderStatsCards(stats, isMultiDimension, isMultiThread);
        this._renderComparisonTable(comparisons, isMultiDimension, isMultiThread);

        const countEl = document.getElementById('comparisonResultCount');
        if (countEl) {
            countEl.textContent = `共 ${comparisons.length} 条`;
        }

        this._initSearch();
    }

    _renderStatsCards(stats, isMultiDimension, isMultiThread) {
        const container = document.getElementById('comparisonStatsGrid');
        if (!container) return;

        // 多维度对比显示不同的统计卡片
        if (isMultiDimension) {
            container.innerHTML = `
                <div class="comparison-stat-card">
                    <h4>对比模式</h4>
                    <div class="comparison-stat-value">多维度对比</div>
                </div>
                <div class="comparison-stat-card">
                    <h4>对比项数</h4>
                    <div class="comparison-stat-value">${stats.totalComparisons || 0}</div>
                </div>
                <div class="comparison-stat-card">
                    <h4>维度数量</h4>
                    <div class="comparison-stat-value">${this.selectedDimensions.length}</div>
                </div>
            `;
            return;
        }

        if (isMultiThread) {
            container.innerHTML = `
                <div class="comparison-stat-card">
                    <h4>对比模式</h4>
                    <div class="comparison-stat-value">多线程对比</div>
                </div>
                <div class="comparison-stat-card">
                    <h4>对比项数</h4>
                    <div class="comparison-stat-value">${stats.totalComparisons || 0}</div>
                </div>
            `;
            return;
        }

        // 单维度单线程对比统计
        const runtimeIncreased = stats.runtime_increased || [];
        const runtimeDecreased = stats.runtime_decreased || [];
        const memoryIncreased = stats.memory_increased || [];
        const memoryDecreased = stats.memory_decreased || [];
        const maxRuntimeIncreased = stats.max_runtime_increased || { name: 'NA', value: 0 };
        const maxRuntimeDecreased = stats.max_runtime_decreased || { name: 'NA', value: 0 };
        const maxMemoryIncreased = stats.max_memory_increased || { name: 'NA', value: 0 };
        const maxMemoryDecreased = stats.max_memory_decreased || { name: 'NA', value: 0 };
        const avgRuntimeChange = stats.avg_runtime_change || 0;
        const avgMemoryChange = stats.avg_memory_change || 0;

        container.innerHTML = `
            <div class="comparison-stat-card tooltip-card">
                <h4>Runtime 增加</h4>
                <div class="comparison-stat-value">${runtimeIncreased.length}</div>
                <div class="tooltip-content">${this._generateTooltipItems(runtimeIncreased, '增加', 's')}</div>
            </div>
            <div class="comparison-stat-card tooltip-card">
                <h4>Runtime 减少</h4>
                <div class="comparison-stat-value">${runtimeDecreased.length}</div>
                <div class="tooltip-content">${this._generateTooltipItems(runtimeDecreased, '减少', 's')}</div>
            </div>
            <div class="comparison-stat-card">
                <h4>Runtime 增加最大</h4>
                <div class="comparison-stat-value">${this._escapeHtml(maxRuntimeIncreased.name || 'NA')}</div>
            </div>
            <div class="comparison-stat-card">
                <h4>Runtime 减少最大</h4>
                <div class="comparison-stat-value">${this._escapeHtml(maxRuntimeDecreased.name || 'NA')}</div>
            </div>
            <div class="comparison-stat-card">
                <h4>平均 Runtime 变化率</h4>
                <div class="comparison-stat-value">${avgRuntimeChange.toFixed(2)}%</div>
            </div>
            <div class="comparison-stat-card tooltip-card">
                <h4>Memory 增加</h4>
                <div class="comparison-stat-value">${memoryIncreased.length}</div>
                <div class="tooltip-content">${this._generateTooltipItems(memoryIncreased, '增加', 'MB')}</div>
            </div>
            <div class="comparison-stat-card tooltip-card">
                <h4>Memory 减少</h4>
                <div class="comparison-stat-value">${memoryDecreased.length}</div>
                <div class="tooltip-content">${this._generateTooltipItems(memoryDecreased, '减少', 'MB')}</div>
            </div>
            <div class="comparison-stat-card">
                <h4>Memory 增加最大</h4>
                <div class="comparison-stat-value">${this._escapeHtml(maxMemoryIncreased.name || 'NA')}</div>
            </div>
            <div class="comparison-stat-card">
                <h4>Memory 减少最大</h4>
                <div class="comparison-stat-value">${this._escapeHtml(maxMemoryDecreased.name || 'NA')}</div>
            </div>
            <div class="comparison-stat-card">
                <h4>平均 Memory 变化率</h4>
                <div class="comparison-stat-value">${avgMemoryChange.toFixed(2)}%</div>
            </div>
        `;
    }

    _generateTooltipItems(items, label, unit) {
        // 处理 items 可能是对象的情况
    if (!items) {
        return '<div class="tooltip-item"><div class="tooltip-item-name">暂无数据</div></div>';
    }
    
    // 如果是对象，转换为数组
    let itemArray = items;
    if (typeof items === 'object' && !Array.isArray(items)) {
        // 对象格式: { ruleName: diffValue, ... }
        itemArray = Object.entries(items).map(([name, value]) => [name, value]);
    }
    
    if (!Array.isArray(itemArray) || itemArray.length === 0) {
        return '<div class="tooltip-item"><div class="tooltip-item-name">暂无数据</div></div>';
    }
    
    return itemArray.slice(0, 10).map(item => {
        // 处理 item 可能是数组或对象
        let name, value;
        if (Array.isArray(item)) {
            name = item[0];
            value = item[1];
        } else if (typeof item === 'object' && item !== null) {
            name = item.name || '未知';
            value = item.value || 0;
        } else {
            return '';
        }
        return `
            <div class="tooltip-item">
                <div class="tooltip-item-name">${this._escapeHtml(String(name))}</div>
                <div class="tooltip-item-desc">${label}: ${typeof value === 'number' ? value.toFixed(2) : String(value)}${unit}</div>
            </div>
        `;
    }).join('');
    }

    _renderComparisonTable(comparisons, isMultiDimension, isMultiThread) {
        const headEl = document.getElementById('comparisonTableHead');
        const bodyEl = document.getElementById('comparisonTableBody');
        if (!headEl || !bodyEl) return;

        if (!comparisons || comparisons.length === 0) {
            headEl.innerHTML = '';
            bodyEl.innerHTML = '<tr><td style="text-align:center;padding:20px;color:#94A3B8;">暂无对比数据</td></tr>';
            return;
        }
        console.warn('对比数据:', comparisons);
        const firstRow = comparisons[0];
        
        // 判断对比类型
        const isThreadCompare = firstRow.length > 1 && typeof firstRow[1] === 'string' && /-1|^\d+线程$/.test(firstRow[1]);
        console.warn('对比类型:', isThreadCompare);
        console.warn('对比类型:', firstRow.length );
        console.warn('对比类型:', typeof firstRow[1] );
        console.warn('对比类型:', firstRow[1] );
        let headers = ['Rule'];
        let colGroups = [];

        if (isMultiDimension) {
            // 多维度对比：每个维度占4列
            const dimensions = this.selectedDimensions;
            const dimNames = {
                'cputime': 'CPU Time',
                'realtime': 'Real Time',
                'peakmem': '峰值内存',
                'incmem': '增量内存',
                'realtimeincmem': '实时增量内存'
            };
            
            for (const dim of dimensions) {
                const dimLabel = dimNames[dim] || dim;
                headers.push(`${dimLabel}(日期1)`, `${dimLabel}(日期2)`, `${dimLabel}差值`, `${dimLabel}状态`);
            }
        } else if (isThreadCompare) {
            // 多线程对比
            for (let i = 1; i < firstRow.length; i += 2) {
                const threadName = firstRow[i] || `线程${(i-1)/2+1}`;
                const nextThread = i + 2 < firstRow.length ? firstRow[i+2] : null;
                if (nextThread) {
                    headers.push(threadName, `${threadName}->${nextThread}`);
                } else {
                    headers.push(threadName);
                }
            }
        } else {
            // 单维度单线程对比
            const hasRuntime = firstRow.length >= 5;
            const hasMemory = firstRow.length >= 9;

            if (hasRuntime) {
                headers.push('R(日期1)', 'R(日期2)', 'R 差值', 'R 状态');
            }
            if (hasMemory) {
                headers.push('M(日期1)', 'M(日期2)', 'M 差值', 'M 状态');
            }
        }

        headEl.innerHTML = `<tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr>`;

        let rowsHtml = '';
        for (const row of comparisons) {
            let rowHtml = '<tr>';
            let idx = 0;
            rowHtml += `<td>${this._escapeHtml(row[idx++])}</td>`;

            if (isMultiDimension) {
                // 多维度：每个维度4列
                for (let d = 0; d < this.selectedDimensions.length; d++) {
                    if (idx + 3 < row.length) {
                        const val1 = row[idx++];
                        const val2 = row[idx++];
                        const diff = row[idx++];
                        const status = row[idx++];
                        
                        rowHtml += `<td>${val1 !== undefined && val1 !== null ? Number(val1).toFixed(2) : '-'}</td>`;
                        rowHtml += `<td>${val2 !== undefined && val2 !== null ? Number(val2).toFixed(2) : '-'}</td>`;
                        rowHtml += `<td>${diff !== undefined && diff !== null && !isNaN(diff) ? Number(diff).toFixed(2) : diff}</td>`;
                        const statusClass = status === '⬆️增加' ? 'increased' : (status === '⬇️减少' ? 'decreased' : '');
                        rowHtml += `<td><span class="status-badge ${statusClass}">${this._escapeHtml(status)}</span></td>`;
                    }
                }
            } else if (isThreadCompare) {
                // 多线程
                for (let i = idx; i < row.length; i += 2) {
                    const threadName = row[i] || '';
                    const value = row[i + 1] !== undefined ? row[i + 1] : '-';
                    rowHtml += `<td>${this._escapeHtml(threadName)}</td>`;
                    rowHtml += `<td>${value !== null && value !== undefined && !isNaN(value) ? Number(value).toFixed(2) : value}</td>`;
                }
            } else {
                // 单维度单线程
                if (row.length >= 5) {
                    for (let i = 0; i < 4; i++) {
                        const val = row[idx++];
                        if (i === 3) {
                            const statusClass = val === '⬆️增加' ? 'increased' : (val === '⬇️减少' ? 'decreased' : '');
                            rowHtml += `<td><span class="status-badge ${statusClass}">${this._escapeHtml(val)}</span></td>`;
                        } else {
                            rowHtml += `<td>${val !== undefined && val !== null ? Number(val).toFixed(2) : '-'}</td>`;
                        }
                    }
                }
                if (row.length >= 9) {
                    for (let i = 0; i < 4; i++) {
                        const val = row[idx++];
                        if (i === 3) {
                            const statusClass = val === '⬆️增加' ? 'increased' : (val === '⬇️减少' ? 'decreased' : '');
                            rowHtml += `<td><span class="status-badge ${statusClass}">${this._escapeHtml(val)}</span></td>`;
                        } else {
                            rowHtml += `<td>${val !== undefined && val !== null ? Number(val).toFixed(2) : '-'}</td>`;
                        }
                    }
                }
            }

            rowHtml += '</tr>';
            rowsHtml += rowHtml;
        }

        bodyEl.innerHTML = rowsHtml;
    }

    // ==================== 搜索功能 ====================

    _initSearch() {
        const searchInput = document.getElementById('comparisonSearch');
        const tableBody = document.getElementById('comparisonTableBody');
        const resultCount = document.getElementById('comparisonResultCount');

        if (!searchInput || !tableBody) return;

        // 移除旧监听
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

            if (resultCount) {
                resultCount.textContent = `共 ${visibleCount} 条`;
            }

            const noResult = document.getElementById('comparisonNoResult');
            if (term && visibleCount === 0) {
                if (!noResult) {
                    const tr = document.createElement('tr');
                    tr.id = 'comparisonNoResult';
                    const td = document.createElement('td');
                    const firstRow = tableBody.querySelector('tr');
                    td.colSpan = firstRow ? firstRow.cells.length : 1;
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

    // ==================== 导出功能 ====================

    _exportComparison() {
        const tableBody = document.getElementById('comparisonTableBody');
        if (!tableBody) return;

        const rows = Array.from(tableBody.querySelectorAll('tr'));
        if (rows.length === 0) {
            this._showToast('没有可导出的数据', 'error');
            return;
        }

        // 获取表头
        const headEl = document.querySelector('#comparisonTableHead');
        let headers = [];
        if (headEl) {
            const ths = headEl.querySelectorAll('th');
            headers = Array.from(ths).map(th => th.textContent.trim());
        }

        const csvData = rows.map(row => {
            const cells = Array.from(row.querySelectorAll('td'));
            return cells.map(cell => cell.textContent.trim().replace(/\n/g, ';')).join(',');
        });

        if (headers.length === 0 && csvData.length > 0) {
            const firstRow = csvData[0].split(',');
            headers = firstRow.map((_, i) => `列${i+1}`);
        }

        const csvContent = [headers.join(','), ...csvData].join('\n');
        const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.href = url;
        link.setAttribute('download', `comparison_${new Date().toISOString().slice(0,19)}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);

        this._showToast('导出成功', 'success');
    }

    // ==================== 工具方法 ====================

    _formatDate(dateStr) {
        if (!dateStr) return '';
        if (dateStr.includes('_user')) {
            return dateStr.replace('_user', ' (用户)');
        }
        if (dateStr.length === 8 && /^\d+$/.test(dateStr)) {
            return `${dateStr.slice(0,4)}-${dateStr.slice(4,6)}-${dateStr.slice(6,8)}`;
        }
        return dateStr;
    }

    _escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    _showToast(message, type = 'info') {
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
        // 清理资源
    }
}

window.ComparisonManager = ComparisonManager;