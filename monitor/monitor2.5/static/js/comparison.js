/**
 * 数据对比模块 - 单线程对比 & 多线程对比
 * 依赖：全局工具函数 escapeHtml, formatDate, showToast（由 tool.js 提供）
 */
/**
 * 数据对比管理器类
 * 支持单线程对比（版本对比）和多线程对比（线程对比）两种模式
 *
 * 主要功能：
 * - 单线程对比：选择 casename、对比维度、规则、日期进行两个版本的性能数据对比
 * - 多线程对比：选择 casename、对比维度、线程数、规则、日期进行多线程性能数据对比
 * - 支持误差模式（绝对值/百分比）、运行时间和内存阈值筛选
 * - 支持统计卡片展示、对比表格渲染、CSV 导出
 */
class ComparisonManager {
    constructor() {
        // 工具 ID 和当前模式（由外部初始化时传入）
        this.toolId = null;
        this.currentMode = null;
        this.isInitialized = false;
        
        // ========== 单线程对比：UI 组件引用 ==========
        this.singleCasenameSelect = null;      // Casename 下拉选择器
        this.singleDimensionSelect = null;     // 对比维度下拉选择器
        this.singleRuleSelect = null;          // Rule 下拉选择器
        this.singleDate1Select = null;          // 日期 1 下拉选择器（基准日期）
        this.singleDate2Select = null;         // 日期 2 下拉选择器（对比日期）
        this.singleErrorModeSelect = null;     // 误差模式下拉选择器
        this.singleRuntimeThreshold = null;    // 运行时间阈值输入框
        this.singleMemoryThreshold = null;     // 内存阈值输入框
        this.singleConfirmBtn = null;          // 确认对比按钮
        this.singleExportBtn = null;           // 导出按钮
        
        // 单线程对比：数据缓存与选中状态
        this.singleAllCasenames = [];
        this.singleAllDimensions = ['cputime', 'realtime', 'peakmem', 'incmem', 'realtimeincmem'];
        this.singleAllRules = [];
        this.singleAllDates = [];
        this.singleSelectedCasename = '';
        this.singleSelectedDimension = '';
        this.singleSelectedRule = '';
        this.singleSelectedDate1 = '';
        this.singleSelectedDate2 = '';
        this.singleSelectedErrorMode = '';
        this.singleRuntimeThresholdValue = 0;
        this.singleMemoryThresholdValue = 0;
        this.singleComparisonData = null;
        
        // ========== 多线程对比：UI 组件引用 ==========
        this.multiCasenameSelect = null;       // Casename 下拉选择器
        this.multiDimensionSelect = null;      // 对比维度下拉选择器
        this.multiThreadSelect = null;         // 线程数多选下拉选择器
        this.multiRuleSelect = null;           // Rule 下拉选择器
        this.multiDate1Select = null;          // 日期 1 下拉选择器（基准日期）
        this.multiDate2Select = null;          // 日期 2 下拉选择器（对比日期）
        this.multiErrorModeSelect = null;      // 误差模式下拉选择器
        this.multiRuntimeThreshold = null;     // 运行时间阈值输入框
        this.multiMemoryThreshold = null;      // 内存阈值输入框
        this.multiConfirmBtn = null;           // 确认对比按钮
        this.multiExportBtn = null;            // 导出按钮
        
        // 多线程对比：数据缓存与选中状态
        this.multiAllCasenames = [];
        this.multiAllDimensions = ['cputime', 'realtime', 'peakmem', 'incmem', 'realtimeincmem'];
        this.multiAllThreads = [];
        this.multiAllRules = [];
        this.multiAllDates = [];
        this.multiSelectedCasename = '';
        this.multiSelectedDimension = '';
        this.multiSelectedThreads = [];
        this.multiSelectedRule = '';
        this.multiSelectedDate1 = '';
        this.multiSelectedDate2 = '';
        this.multiSelectedErrorMode = '';
        this.multiRuntimeThresholdValue = 0;
        this.multiMemoryThresholdValue = 0;
        this.multiComparisonData = null;
        
        // 将事件处理方法绑定到实例，确保 this 指向正确
        this._onSingleCasenameChange = this._onSingleCasenameChange.bind(this);
        this._onSingleDimensionChange = this._onSingleDimensionChange.bind(this);
        this._onSingleRuleChange = this._onSingleRuleChange.bind(this);
        this._onMultiCasenameChange = this._onMultiCasenameChange.bind(this);
        this._onMultiDimensionChange = this._onMultiDimensionChange.bind(this);
        this._onMultiThreadChange = this._onMultiThreadChange.bind(this);
        this._onMultiRuleChange = this._onMultiRuleChange.bind(this);
    }

    /**
     * 初始化对比管理器
     * @param {string} toolId - 工具 ID，用于 API 请求
     * @param {Function} getCurrentMode - 获取当前模式的回调函数
     */
    init(toolId, getCurrentMode) {
        this.toolId = toolId;
        this.getCurrentMode = getCurrentMode;
        
        // ========== 初始化单线程对比组件 ==========
        // 初始化 Casename 选择器
        this.singleCasenameSelect = new SearchableSelect({
            container: document.getElementById('compCasenameSelect'),
            options: [],
            placeholder: '请选择 Casename...',
            onChange: this._onSingleCasenameChange
        });
        
        // 初始化对比维度选择器
        this.singleDimensionSelect = new SearchableSelect({
            container: document.getElementById('compDimensionSelect'),
            options: [],
            placeholder: '请选择对比维度...',
            onChange: this._onSingleDimensionChange
        });
        
        // 初始化 Rule 选择器
        this.singleRuleSelect = new SearchableSelect({
            container: document.getElementById('compRuleSelect'),
            options: [],
            placeholder: '请选择 Rule...',
            onChange: this._onSingleRuleChange
        });
        
        // 初始化日期 1 选择器（基准日期）
        // 选择日期 1 后自动更新日期 2 的可用选项（排除已选中的日期 1）
        this.singleDate1Select = new SearchableSelect({
            container: document.getElementById('compDate1Select'),
            options: [],
            placeholder: '请选择日期...',
            onChange: (value) => {
                this.singleSelectedDate1 = value;
                this._updateSingleDate2Options();
            }
        });
        
        // 初始化日期 2 选择器（对比日期）
        // 选择日期 2 后自动更新日期 1 的可用选项（排除已选中的日期 2）
        this.singleDate2Select = new SearchableSelect({
            container: document.getElementById('compDate2Select'),
            options: [],
            placeholder: '请选择日期...',
            onChange: (value) => {
                this.singleSelectedDate2 = value;
                this._updateSingleDate1Options();
            }
        });
        
        // 初始化误差模式选择器
        // 支持 "绝对值" 和 "百分比" 两种误差计算方式
        this.singleErrorModeSelect = new SearchableSelect({
            container: document.getElementById('compErrorModeSelect'),
            options: [
                { value: 'absolute', label: '绝对值' },
                { value: 'percentage', label: '百分比' }
            ],
            placeholder: '请选择误差模式...',
            onChange: (value) => {
                this.singleSelectedErrorMode = value;
            }
        });
        
        // 初始化阈值输入框和按钮元素引用
        this.singleRuntimeThreshold = document.getElementById('compRuntimeThreshold');
        this.singleMemoryThreshold = document.getElementById('compMemoryThreshold');
        this.singleConfirmBtn = document.getElementById('compConfirmBtn');
        this.singleExportBtn = document.getElementById('compExportBtn');
        
        // ========== 初始化多线程对比组件 ==========
        // 初始化 Casename 选择器
        this.multiCasenameSelect = new SearchableSelect({
            container: document.getElementById('threadCompCasenameSelect'),
            options: [],
            placeholder: '请选择 Casename...',
            onChange: this._onMultiCasenameChange
        });
        
        // 初始化对比维度选择器
        this.multiDimensionSelect = new SearchableSelect({
            container: document.getElementById('threadCompDimensionSelect'),
            options: [],
            placeholder: '请选择对比维度...',
            onChange: this._onMultiDimensionChange
        });
        
        // 初始化线程数多选选择器（支持同时选择多个线程数进行对比）
        this.multiThreadSelect = new SearchableSelect({
            container: document.getElementById('threadCompThreadSelect'),
            options: [],
            multiple: true,
            placeholder: '请选择线程数...',
            onChange: this._onMultiThreadChange
        });
        
        // 初始化 Rule 选择器
        this.multiRuleSelect = new SearchableSelect({
            container: document.getElementById('threadCompRuleSelect'),
            options: [],
            placeholder: '请选择 Rule...',
            onChange: this._onMultiRuleChange
        });
        
        // 初始化日期 1 选择器（基准日期）
        this.multiDate1Select = new SearchableSelect({
            container: document.getElementById('threadCompDate1Select'),
            options: [],
            placeholder: '请选择日期...',
            onChange: (value) => {
                this.multiSelectedDate1 = value;
                // 只有在版本对比模式（单线程）时才联动更新日期2
                if (this.multiSelectedThreads.length <= 1) {
                    this._updateMultiDate2Options();
                }
            }
        });
        
        // 初始化日期 2 选择器（对比日期）
        this.multiDate2Select = new SearchableSelect({
            container: document.getElementById('threadCompDate2Select'),
            options: [],
            placeholder: '请选择日期...',
            onChange: (value) => {
                this.multiSelectedDate2 = value;
                if (this.multiSelectedThreads.length <= 1) {
                    this._updateMultiDate1Options();
                }
            }
        });
        
        // 初始化误差模式选择器
        this.multiErrorModeSelect = new SearchableSelect({
            container: document.getElementById('threadCompErrorModeSelect'),
            options: [
                { value: 'absolute', label: '绝对值' },
                { value: 'percentage', label: '百分比' }
            ],
            placeholder: '请选择误差模式...',
            onChange: (value) => {
                this.multiSelectedErrorMode = value;
            }
        });
        
        // 初始化阈值输入框和按钮元素引用
        this.multiRuntimeThreshold = document.getElementById('threadCompRuntimeThreshold');
        this.multiMemoryThreshold = document.getElementById('threadCompMemoryThreshold');
        this.multiConfirmBtn = document.getElementById('threadCompConfirmBtn');
        this.multiExportBtn = document.getElementById('threadCompExportBtn');
        
        // 绑定事件监听
        this._bindEvents();
        // 初始化 Casename 下拉选项
        this._populateCasenameOptions();
        this.isInitialized = true;
    }

    // ==================== 单线程对比方法 ====================

    /**
     * Casename 变更事件处理
     * 选择 Casename 后，加载该 Casename 下的可用对比维度
     * @param {string} value - 选中的 Casename 值
     */
    _onSingleCasenameChange(value) {
        this.singleSelectedCasename = value;
        if (value) {
            this._loadSingleData(value);
        }
    }

    /**
     * 对比维度变更事件处理
     * 选择维度后，加载该维度下的可用 Rule 列表
     * @param {string} value - 选中的维度值（如 cputime, realtime 等）
     */
    _onSingleDimensionChange(value) {
        this.singleSelectedDimension = value;
        if (value && this.singleSelectedCasename) {
            this._loadSingleRules(value);
        }
    }

    /**
     * Rule 变更事件处理
     * 选择 Rule 后，加载该 Rule 下的可用日期列表
     * @param {string} value - 选中的 Rule 值
     */
    _onSingleRuleChange(value) {
        this.singleSelectedRule = value;
        if (value && this.singleSelectedCasename && this.singleSelectedDimension) {
            this._loadSingleDates(value);
        }
    }

    /**
     * 加载指定 Casename 的数据
     * 从全局数据中获取该 Casename 可用的对比维度，自动选中第一个维度
     * @param {string} casename - Casename 名称
     */
    _loadSingleData(casename) {
        console.log('======================= _loadSingleData =======================')
        // 根据当前模式从全局数据中获取数据源
        const mode = this.getCurrentMode();
        let allData = {};
        if (mode === 'single') {
            allData = window.singleData || {};
        } else {
            allData = window.multiData || {};
        }
        
        const caseData = allData[casename];
        if (!caseData) {
            // 该 Casename 无数据，清空所有下拉选项
            this.singleDimensionSelect.setOptions([]);
            this.singleRuleSelect.setOptions([]);
            this.singleDate1Select.setOptions([]);
            this.singleDate2Select.setOptions([]);
            return;
        }
        
        // 构建维度中文标签映射
        const availableDimensions = [];
        const dimensionMap = {
            'cputime': 'CPU Time',
            'realtime': 'Real Time',
            'peakmem': '峰值内存',
            'incmem': '增量内存',
            'realtimeincmem': '实时增量内存'
        };
        
        // 筛选有数据的维度
        for (const dim of this.singleAllDimensions) {
            if (caseData[dim] && Object.keys(caseData[dim]).length > 0) {
                availableDimensions.push({ value: dim, label: dimensionMap[dim] || dim });
            }
        }
        
        this.singleDimensionSelect.setOptions(availableDimensions);
        
        // 自动选择第一个维度作为默认值
        if (availableDimensions.length > 0) {
            this.singleDimensionSelect.setValue(availableDimensions[0].value);
            this.singleSelectedDimension = availableDimensions[0].value;
            this._loadSingleRules(availableDimensions[0].value);
        }
        console.log('======================= _loadSingleData =======================')
    }

    /**
     * 加载指定维度下的 Rule 列表
     * @param {string} dimension - 对比维度
     */
    _loadSingleRules(dimension) {
        console.log('======================= _loadSingleRules =======================')
        const mode = this.getCurrentMode();
        let allData = {};
        if (mode === 'single') {
            allData = window.singleData || {};
        } else {
            allData = window.multiData || {};
        }
        
        const caseData = allData[this.singleSelectedCasename];
        if (!caseData || !caseData[dimension]) {
            this.singleRuleSelect.setOptions([]);
            return;
        }
        
        // 获取该维度下所有 Rule 并排序
        const rules = Object.keys(caseData[dimension]).sort();
        const options = rules.map(rule => ({ value: rule, label: rule }));
        
        // 在选项最前方添加 "全部" 选项，支持一次性对比所有 Rule
        options.unshift({ value: 'all', label: '全部 (对比所有 Rule)' });
        
        this.singleRuleSelect.setOptions(options);
        this.singleAllRules = rules;
        
        // 默认选择 "全部"
        this.singleRuleSelect.setValue('all');
        this.singleSelectedRule = 'all';
        this._loadSingleDates('all');
        console.log('======================= _loadSingleRules =======================')
    }

    /**
     * 加载指定 Rule 下的可用日期列表
     * 如果 rule 为 'all'，则获取所有 Rule 的日期并集
     * @param {string} rule - Rule 名称或 'all'
     */
    _loadSingleDates(rule) {
        console.log('======================= _loadSingleDates =======================')
        const mode = this.getCurrentMode();
        let allData = {};
        if (mode === 'single') {
            allData = window.singleData || {};
        } else {
            allData = window.multiData || {};
        }
        
        const caseData = allData[this.singleSelectedCasename];
        if (!caseData || !caseData[this.singleSelectedDimension]) {
            return;
        }
        
        let dates = [];
        if (rule === 'all') {
            // 获取所有规则的日期并集
            const dateSet = new Set();
            for (const r of this.singleAllRules) {
                const ruleData = caseData[this.singleSelectedDimension][r].dates;
                if (ruleData && Array.isArray(ruleData)) {
                    ruleData.forEach(d => dateSet.add(d));
                }
            }
            dates = Array.from(dateSet).sort();
        } else {
            // 获取指定规则的日期列表
            const ruleData = caseData[this.singleSelectedDimension][rule].dates;
            if (ruleData && Array.isArray(ruleData)) {
                dates = ruleData.sort();
            }
        }
        
        this.singleAllDates = dates;
        const options = dates.map(d => ({ value: d, label: formatDate(d) }));
        
        // 同时更新日期 1 和日期 2 的下拉选项
        this.singleDate1Select.setOptions(options);
        this.singleDate2Select.setOptions(options);
        
        // 默认选择最近两个日期作为对比基准
        if (dates.length >= 2) {
            this.singleDate1Select.setValue(dates[dates.length - 2], true);
            this.singleSelectedDate1 = dates[dates.length - 2];
            this.singleDate2Select.setValue(dates[dates.length - 1], true);
            this.singleSelectedDate2 = dates[dates.length - 1];
        } else if (dates.length === 1) {
            this.singleDate1Select.setValue(dates[0], true);
            this.singleSelectedDate1 = dates[0];
        }
        console.log('======================= _loadSingleDates =======================')
    }

    /**
     * 更新日期 1 的可选列表
     * 当日期 2 被选中后，日期 1 的选项中排除日期 2
     */
    _updateSingleDate1Options() {
        if (this.singleSelectedDate2) {
            const options = this.singleAllDates
                .filter(d => d !== this.singleSelectedDate2)
                .map(d => ({ value: d, label: formatDate(d) }));
            this.singleDate1Select.setOptions(options);
            if (options.length > 0) {
                this.singleDate1Select.setValue(options[0].value, true);
                this.singleSelectedDate1 = options[0].value;
            }
        }
    }

    /**
     * 更新日期 2 的可选列表
     * 当日期 1 被选中后，日期 2 的选项中排除日期 1
     */
    _updateSingleDate2Options() {
        if (this.singleSelectedDate1) {
            const options = this.singleAllDates
                .filter(d => d !== this.singleSelectedDate1)
                .map(d => ({ value: d, label: formatDate(d) }));
            this.singleDate2Select.setOptions(options);
            if (options.length > 0) {
                this.singleDate2Select.setValue(options[0].value, true);
                this.singleSelectedDate2 = options[0].value;
            }
        }
    }

    /**
     * 执行单线程对比
     * 发送 POST 请求到后端 API，获取两个日期之间的性能数据对比结果
     */
    async _performSingleComparison() {
        // 验证必填参数：Casename 和两个日期
        if (!this.singleSelectedCasename) {
            showToast('请选择 Casename', 'error');
            return;
        }
        
        if (!this.singleSelectedDate1 || !this.singleSelectedDate2) {
            showToast('请选择两个日期', 'error');
            return;
        }
        
        // 获取用户输入的阈值
        this.singleRuntimeThresholdValue = parseFloat(this.singleRuntimeThreshold?.value || 0);
        this.singleMemoryThresholdValue = parseFloat(this.singleMemoryThreshold?.value || 0);
        
        // 确定对比参数
        const dimension = this.singleSelectedDimension || null;
        const compareMode = (this.singleSelectedRule === 'all' || !this.singleSelectedRule) ? 'all' : this.singleSelectedRule;
        const errorMode = this.singleSelectedErrorMode || 'absolute';
        
        // 提示用户当前使用的默认参数
        if (!this.singleSelectedDimension) {
            showToast('将对比所有维度', 'info');
        }
        if (!this.singleSelectedRule || this.singleSelectedRule === 'all') {
            showToast('将对比所有 Rule', 'info');
        }
        if (!this.singleSelectedErrorMode) {
            showToast('将使用默认误差模式: 绝对值', 'info');
        }
        
        // 更新按钮为加载状态
        this.singleConfirmBtn.textContent = '对比中...';
        this.singleConfirmBtn.disabled = true;
        
        try {
            // 发送对比请求到后端
            const response = await axios.post('/api/comparison', {
                tool_id: this.toolId,
                mode: 'single',
                casename: this.singleSelectedCasename,
                date1: this.singleSelectedDate1,
                date2: this.singleSelectedDate2,
                compare_mode: compareMode,
                dimension: dimension,
                runtime_threshold: this.singleRuntimeThresholdValue,
                memory_threshold: this.singleMemoryThresholdValue,
                error_mode: errorMode,
                compare_type: 'version'
            });
            
            if (response.data.success) {
                this.singleComparisonData = response.data.data;
                this._renderSingleResults(response.data.data);
                showToast('对比完成', 'success');
            } else {
                showToast(response.data.error || '对比失败', 'error');
            }
        } catch (error) {
            console.error('单线程对比失败:', error);
            showToast('对比失败: ' + (error.message || '未知错误'), 'error');
        } finally {
            // 恢复按钮状态
            this.singleConfirmBtn.textContent = '确认对比';
            this.singleConfirmBtn.disabled = false;
        }
    }

    /**
     * 渲染单线程对比结果
     * 包括统计卡片、对比表格和结果计数
     */
    _renderSingleResults(result) {
        const stats = result.statistics || {};
        const comparisons = result.comparisons || [];
        
        // 渲染统计卡片
        this._renderStatsCards('versionStatsGrid', stats);
        
        // 渲染对比表格
        this._renderComparisonTable('versionTableHead', 'versionTableBody', comparisons, stats);
        
        // 更新结果计数
        const countEl = document.getElementById('versionResultCount');
        if (countEl) {
            countEl.textContent = `共 ${comparisons.length} 条`;
        }
        
        // 初始化表格搜索功能
        this._initSearch('versionComparisonSearch', 'versionTableBody', 'versionResultCount');
    }

    // ==================== 多线程对比方法 ====================

    /**
     * Casename 变更事件处理（多线程）
     * @param {string} value - 选中的 Casename 值
     */
    _onMultiCasenameChange(value) {
        this.multiSelectedCasename = value;
        if (value) {
            this._loadMultiData(value);
        }
    }

    /**
     * 对比维度变更事件处理（多线程）
     * @param {string} value - 选中的维度值
     */
    _onMultiDimensionChange(value) {
        this.multiSelectedDimension = value;
        if (value && this.multiSelectedCasename) {
            this._loadMultiThreadsAndRules(value);
        }
    }

    /**
     * 线程数变更事件处理（多线程）
     * @param {Array} values - 选中的线程数数组
     */
    _onMultiThreadChange(values) {
        this.multiSelectedThreads = values || [];
        if (this.multiSelectedDimension && this.multiSelectedCasename) {
            this._loadMultiDates();
        }
        // 根据线程数量动态调整日期选择器显示
        this._updateMultiDateVisibility();
    }

    /**
     * Rule 变更事件处理（多线程）
     * @param {string} value - 选中的 Rule 值
     */
    _onMultiRuleChange(value) {
        this.multiSelectedRule = value;
        if (this.multiSelectedCasename && this.multiSelectedDimension) {
            this._loadMultiDates();
        }
    }

    /**
     * 加载指定 Casename 的多线程数据
     * 获取可用的对比维度列表
     * @param {string} casename - Casename 名称
     */
    _loadMultiData(casename) {
        const allData = window.multiData || {};
        const caseData = allData[casename];
        if (!caseData) {
            // 清空所有下拉选项
            this.multiDimensionSelect.setOptions([]);
            this.multiThreadSelect.setOptions([]);
            this.multiRuleSelect.setOptions([]);
            this.multiDate1Select.setOptions([]);
            this.multiDate2Select.setOptions([]);
            return;
        }
        
        // 构建维度中文标签映射
        const availableDimensions = [];
        const dimensionMap = {
            'cputime': 'CPU Time',
            'realtime': 'Real Time',
            'peakmem': '峰值内存',
            'incmem': '增量内存',
            'realtimeincmem': '实时增量内存'
        };
        
        // 筛选有数据的维度
        for (const dim of this.multiAllDimensions) {
            if (caseData[dim] && Object.keys(caseData[dim]).length > 0) {
                availableDimensions.push({ value: dim, label: dimensionMap[dim] || dim });
            }
        }
        
        this.multiDimensionSelect.setOptions(availableDimensions);
        
        // 自动选择第一个维度
        if (availableDimensions.length > 0) {
            this.multiDimensionSelect.setValue(availableDimensions[0].value);
            this.multiSelectedDimension = availableDimensions[0].value;
            this._loadMultiThreadsAndRules(availableDimensions[0].value);
        }
    }

    /**
     * 加载指定维度下的线程数和 Rule 列表
     * 从 Rule 名称中解析线程数信息（格式: "rule(thread)"）
     * @param {string} dimension - 对比维度
     */
    _loadMultiThreadsAndRules(dimension) {
        const allData = window.multiData || {};
        const caseData = allData[this.multiSelectedCasename];   
        if (!caseData || !caseData[dimension]) {
            this.multiThreadSelect.setOptions([]);
            this.multiRuleSelect.setOptions([]);
            return;
        }
        
        const dimData = caseData[dimension];
        const rules = Object.keys(dimData).sort();
        this.multiAllRules = rules;
        
        // 从 Rule 名称中解析线程数（匹配 "rule(数字)" 格式）
        const threadSet = new Set();
        for (const rule of rules) {
            const ruleData = dimData[rule];
            if (ruleData) {
                ruleData.all_threads.forEach(item => {
                    threadSet.add(item);
                });
            }
        }
        this.multiAllThreads = Array.from(threadSet).sort((a, b) => a - b);
        
        // 更新线程数多选下拉选项
        const threadOptions = this.multiAllThreads.map(t => ({
            value: String(t),
            label: `${t} 线程`
        }));
        this.multiThreadSelect.setOptions(threadOptions);
        
        // 默认选择所有线程
        if (threadOptions.length > 0) {
            this.multiThreadSelect.setValue(threadOptions.map(o => o.value));
            this.multiSelectedThreads = threadOptions.map(o => parseInt(o.value));
        }
        
        // 更新 Rule 选择器
        const ruleOptions = rules.map(r => ({ value: r, label: r }));
        ruleOptions.unshift({ value: 'all', label: '全部 (对比所有 Rule)' });
        this.multiRuleSelect.setOptions(ruleOptions);
        this.multiRuleSelect.setValue('all');
        this.multiSelectedRule = 'all';
        
        // 加载日期列表
        this._loadMultiDates();
        // 更新日期可见性
        this._updateMultiDateVisibility();
    }

    /**
     * 加载多线程对比的可用日期列表
     * 根据选中的 Casename、维度、线程数和 Rule 筛选出所有可用日期
     *
     * 数据结构说明：
     * - window.multiData[casename][dimension][rule] = { dates: ['date1', 'date2', ...] }
     * - rule 命名格式: "ruleName(threadCount)"，括号内为线程数
     *
     * 筛选逻辑：
     * 1. 如果选中了特定 Rule（非 'all'），则只处理该 Rule
     * 2. 从 Rule 名称中提取线程数信息，与用户选中的线程数进行匹配
     * 3. 收集所有匹配 Rule 的日期并集，去重排序后填充到日期下拉选择器
     */
    _loadMultiDates() {
        console.log('======================= _loadMultiDates =======================')

        const allData = window.multiData || {};
        const caseData = allData[this.multiSelectedCasename];
        if (!caseData || !caseData[this.multiSelectedDimension]) {
            return;
        }
        
        const dimData = caseData[this.multiSelectedDimension];
        const dateSet = new Set();
        const selectedThreads = this.multiSelectedThreads.map(t => String(t));
        
        for (const rule of this.multiAllRules) {
            if (this.multiSelectedRule !== 'all' && rule !== this.multiSelectedRule) {
                continue;
            }
            const ruleData = dimData[rule];
            if (!ruleData) {
                continue;
            }
            
            let matched = false;
            for (const thread of selectedThreads) {
                if (ruleData.all_threads.includes(parseInt(thread))) {
                    matched = true;
                    break;
                }
            }
            if (!matched && selectedThreads.length > 0) {
                continue;
            }
            ruleData.dates.forEach(d => dateSet.add(d));
        }
        
        this.multiAllDates = Array.from(dateSet).sort();
        const options = this.multiAllDates.map(d => ({ value: d, label: formatDate(d) }));
        
        this.multiDate1Select.setOptions(options);
        this.multiDate2Select.setOptions(options);
        
        // 默认选择最近两个日期作为对比基准（仅当至少有两个日期且为版本对比模式）
        if (this.multiAllDates.length >= 2 && this.multiSelectedThreads.length <= 1) {
            this.multiDate1Select.setValue(this.multiAllDates[this.multiAllDates.length - 2], true);
            this.multiSelectedDate1 = this.multiAllDates[this.multiAllDates.length - 2];
            this.multiDate2Select.setValue(this.multiAllDates[this.multiAllDates.length - 1], true);
            this.multiSelectedDate2 = this.multiAllDates[this.multiAllDates.length - 1];
        } else if (this.multiAllDates.length >= 1) {
            // 多线程对比时，默认选最新日期
            this.multiDate1Select.setValue(this.multiAllDates[this.multiAllDates.length - 1], true);
            this.multiSelectedDate1 = this.multiAllDates[this.multiAllDates.length - 1];
        }
    }

    /**
     * 更新多线程日期 1 的可选列表（排除日期 2）
     * 仅在版本对比模式下调用（线程数 <= 1）
     */
    _updateMultiDate1Options() {
        if (this.multiSelectedDate2 && this.multiSelectedThreads.length <= 1) {
            const options = this.multiAllDates
                .filter(d => d !== this.multiSelectedDate2)
                .map(d => ({ value: d, label: formatDate(d) }));
            this.multiDate1Select.setOptions(options);
            if (options.length > 0) {
                this.multiDate1Select.setValue(options[0].value, true);
                this.multiSelectedDate1 = options[0].value;
            }
        }
    }

    /**
     * 更新多线程日期 2 的可选列表（排除日期 1）
     * 仅在版本对比模式下调用（线程数 <= 1）
     */
    _updateMultiDate2Options() {
        if (this.multiSelectedDate1 && this.multiSelectedThreads.length <= 1) {
            const options = this.multiAllDates
                .filter(d => d !== this.multiSelectedDate1)
                .map(d => ({ value: d, label: formatDate(d) }));
            this.multiDate2Select.setOptions(options);
            if (options.length > 0) {
                this.multiDate2Select.setValue(options[0].value, true);
                this.multiSelectedDate2 = options[0].value;
            }
        }
    }

    /**
     * 根据选中的线程数量更新日期选择器的显示
     * 单线程（<=1）→ 显示两个日期；多线程（>1）→ 仅显示一个日期
     */
    _updateMultiDateVisibility() {
        const date2Group = document.getElementById('threadCompDate2Group');
        const date1Label = document.querySelector('#threadComparisonPanel .filter-group label[for="threadCompDate1Select"]');
        if (!date2Group) return;

        const threadCount = this.multiSelectedThreads ? this.multiSelectedThreads.length : 0;
        if (threadCount <= 1) {
            // 单线程：显示日期1和日期2
            date2Group.style.display = '';
            if (date1Label) {
                date1Label.textContent = '📅 日期1 *';
            }
            // 确保日期2有值
            if (!this.multiSelectedDate2 && this.multiAllDates.length > 1) {
                this.multiDate2Select.setValue(this.multiAllDates[this.multiAllDates.length - 1], true);
                this.multiSelectedDate2 = this.multiAllDates[this.multiAllDates.length - 1];
            }
        } else {
            // 多线程：隐藏日期2，日期1改为“日期”
            date2Group.style.display = 'none';
            if (date1Label) {
                date1Label.textContent = '📅 日期 *';
            }
            // 清空日期2的值，避免误传
            this.multiSelectedDate2 = '';
        }
    }

    /**
     * 执行多线程对比
     * 发送 POST 请求到后端 API，获取多线程性能数据对比结果
     */
    async _performMultiComparison() {
        // 验证必填参数
        if (!this.multiSelectedCasename) {
            showToast('请选择 Casename', 'error');
            return;
        }
        
        if (!this.multiSelectedDate1) {
            showToast('请选择日期', 'error');
            return;
        }
        
        if (!this.multiSelectedThreads || this.multiSelectedThreads.length === 0) {
            showToast('请选择至少一个线程', 'error');
            return;
        }
        
        // 获取用户输入的阈值
        this.multiRuntimeThresholdValue = parseFloat(this.multiRuntimeThreshold?.value || 0);
        this.multiMemoryThresholdValue = parseFloat(this.multiMemoryThreshold?.value || 0);
        
        // 确定对比参数
        const dimension = this.multiSelectedDimension || null;
        const compareMode = (this.multiSelectedRule === 'all' || !this.multiSelectedRule) ? 'all' : this.multiSelectedRule;
        const errorMode = this.multiSelectedErrorMode || 'absolute';
        
        // 确定对比类型：线程数<=1为版本对比，>1为线程对比
        const isMultiThread = this.multiSelectedThreads.length > 1;
        const compareType = isMultiThread ? 'thread' : 'version';
        
        // 提示用户当前使用的默认参数
        if (!this.multiSelectedDimension) {
            showToast('将对比所有维度', 'info');
        }
        if (!this.multiSelectedRule || this.multiSelectedRule === 'all') {
            showToast('将对比所有 Rule', 'info');
        }
        if (!this.multiSelectedErrorMode) {
            showToast('将使用默认误差模式: 绝对值', 'info');
        }
        if (isMultiThread) {
            showToast('多线程对比模式：将对比同一日期下不同线程的性能', 'info');
        } else {
            showToast('版本对比模式：将对比同一线程在不同日期的性能', 'info');
        }
        
        // 更新按钮为加载状态
        this.multiConfirmBtn.textContent = '对比中...';
        this.multiConfirmBtn.disabled = true;
        
        try {
            // 构建请求参数
            const payload = {
                tool_id: this.toolId,
                mode: 'multi',
                casename: this.multiSelectedCasename,
                date1: this.multiSelectedDate1,
                date2: isMultiThread ? '' : this.multiSelectedDate2,  // 多线程对比时不传 date2
                compare_mode: compareMode,
                dimension: dimension,
                runtime_threshold: this.multiRuntimeThresholdValue,
                memory_threshold: this.multiMemoryThresholdValue,
                error_mode: errorMode,
                threads: this.multiSelectedThreads,
                compare_type: compareType
            };
            
            const response = await axios.post('/api/comparison', payload);
            
            if (response.data.success) {
                this.multiComparisonData = response.data.data;
                this._renderMultiResults(response.data.data);
                showToast('对比完成', 'success');
            } else {
                showToast(response.data.error || '对比失败', 'error');
            }
        } catch (error) {
            console.error('多线程对比失败:', error);
            showToast('对比失败: ' + (error.message || '未知错误'), 'error');
        } finally {
            // 恢复按钮状态
            this.multiConfirmBtn.textContent = '确认对比';
            this.multiConfirmBtn.disabled = false;
        }
    }

    /**
     * 渲染多线程对比结果
     * 包括统计卡片、对比表格和结果计数
     */
    _renderMultiResults(result) {
        const stats = result.statistics || {};
        const comparisons = result.comparisons || [];
        
        // 渲染统计卡片
        this._renderStatsCards('threadStatsGrid', stats);
        
        // 渲染对比表格
        this._renderComparisonTable('threadTableHead', 'threadTableBody', comparisons, stats);
        
        // 更新结果计数
        const countEl = document.getElementById('threadResultCount');
        if (countEl) {
            countEl.textContent = `共 ${comparisons.length} 条`;
        }
        
        // 初始化表格搜索功能
        this._initSearch('threadComparisonSearch', 'threadTableBody', 'threadResultCount');
    }

    // ==================== 通用渲染方法 ====================

    /**
     * 渲染统计卡片
     * 根据统计数据生成 Runtime 和 Memory 的增减统计卡片
     * @param {string} containerId - 容器元素 ID
     * @param {Object} stats - 统计数据对象
     */
    _renderStatsCards(containerId, stats) {
        const container = document.getElementById(containerId);
        if (!container) return;
        
        let html = '';
        
        // ========== Runtime 统计卡片 ==========
        const runtimeIncreased = stats.runtime_increased || [];
        const runtimeDecreased = stats.runtime_decreased || [];
        const maxRuntimeIncreased = stats.max_runtime_increased || { name: 'NA', value: 0 };
        const maxRuntimeDecreased = stats.max_runtime_decreased || { name: 'NA', value: 0 };
        const avgRuntimeChange = stats.avg_runtime_change || 0;
        
        html += `
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
                <div class="comparison-stat-value">${escapeHtml(maxRuntimeIncreased.name || 'NA')}</div>
            </div>
            <div class="comparison-stat-card">
                <h4>Runtime 减少最大</h4>
                <div class="comparison-stat-value">${escapeHtml(maxRuntimeDecreased.name || 'NA')}</div>
            </div>
            <div class="comparison-stat-card">
                <h4>平均 Runtime 变化率</h4>
                <div class="comparison-stat-value">${avgRuntimeChange.toFixed(2)}%</div>
            </div>
        `;
        
        // ========== Memory 统计卡片 ==========
        const memoryIncreased = stats.memory_increased || [];
        const memoryDecreased = stats.memory_decreased || [];
        const maxMemoryIncreased = stats.max_memory_increased || { name: 'NA', value: 0 };
        const maxMemoryDecreased = stats.max_memory_decreased || { name: 'NA', value: 0 };
        const avgMemoryChange = stats.avg_memory_change || 0;
        
        html += `
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
                <div class="comparison-stat-value">${escapeHtml(maxMemoryIncreased.name || 'NA')}</div>
            </div>
            <div class="comparison-stat-card">
                <h4>Memory 减少最大</h4>
                <div class="comparison-stat-value">${escapeHtml(maxMemoryDecreased.name || 'NA')}</div>
            </div>
            <div class="comparison-stat-card">
                <h4>平均 Memory 变化率</h4>
                <div class="comparison-stat-value">${avgMemoryChange.toFixed(2)}%</div>
            </div>
        `;
        
        container.innerHTML = html;
    }

    /**
     * 生成工具提示 HTML 内容
     * @param {Array} items - 数据项数组，每项包含名称和值
     * @param {string} label - 变化描述标签（如 "增加"、"减少"）
     * @param {string} unit - 单位（如 "s"、"MB"）
     * @returns {string} 工具提示 HTML 字符串
     */
    _generateTooltipItems(items, label, unit) {
        if (!items || items.length === 0) {
            return '<div class="tooltip-item"><div class="tooltip-item-name">暂无数据</div></div>';
        }
        
        // 最多显示前 10 项
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
     * 渲染对比结果表格
     * 根据对比数据动态生成表头和表格行
     * 数据格式: [rule, date1_val, date2_val, diff, status, date1_val_mem, date2_val_mem, diff_mem, status_mem]
     * 对于多线程对比，数据格式为: [rule, thread1_name, thread1_val, thread2_name, thread2_val, ...]
     * @param {string} headId - 表头元素 ID
     * @param {string} bodyId - 表体元素 ID
     * @param {Array} comparisons - 对比数据数组
     * @param {Object} stats - 统计数据（预留扩展）
     */
    _renderComparisonTable(headId, bodyId, comparisons, stats) {
        const headEl = document.getElementById(headId);
        const bodyEl = document.getElementById(bodyId);
        if (!headEl || !bodyEl) return;
        
        if (!comparisons || comparisons.length === 0) {
            headEl.innerHTML = '';
            bodyEl.innerHTML = '<tr><td style="text-align:center;padding:20px;color:#94A3B8;">暂无对比数据</td></tr>';
            return;
        }
        
        // 根据数据结构动态生成表头
        const firstRow = comparisons[0];
        let headers = ['Rule'];
        let colCount = 1;
        
        // 检测是否为多线程对比模式（第一列后跟着 "N线程" 这样的字符串）
        const isThreadCompare = firstRow.length > 1 && typeof firstRow[1] === 'string' && /^\d+线程$/.test(firstRow[1]);
        
        if (isThreadCompare) {
            // 多线程对比：每两个单元格为一组（线程名 + 值）
            for (let i = 1; i < firstRow.length; i += 2) {
                const threadName = firstRow[i] || `线程${(i-1)/2+1}`;
                headers.push(threadName, `${threadName} 值`);
                colCount += 2;
            }
        } else {
            // 版本对比：检测是否包含 Runtime 和 Memory 数据
            const hasRuntime = firstRow.length >= 5;
            const hasMemory = firstRow.length >= 9;
            
            if (hasRuntime) {
                headers.push('R(日期1)', 'R(日期2)', 'R 差值', 'R 状态');
                colCount += 4;
            }
            if (hasMemory) {
                headers.push('M(日期1)', 'M(日期2)', 'M 差值', 'M 状态');
                colCount += 4;
            }
        }
        
        headEl.innerHTML = `<tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr>`;
        
        // 渲染数据行
        let rowsHtml = '';
        for (const row of comparisons) {
            let rowHtml = '<tr>';
            let idx = 0;
            
            // Rule 列
            rowHtml += `<td>${escapeHtml(row[idx++])}</td>`;
            
            if (isThreadCompare) {
                // 多线程对比：遍历后续的线程名和值
                for (let i = idx; i < row.length; i += 2) {
                    const threadName = row[i] || '';
                    const value = row[i+1] !== undefined ? row[i+1] : '-';
                    rowHtml += `<td>${escapeHtml(threadName)}</td>`;
                    rowHtml += `<td>${value !== null && value !== undefined ? Number(value).toFixed(2) : '-'}</td>`;
                }
            } else {
                // 版本对比：原有逻辑
                if (row.length >= 5) {
                    // Runtime 数据
                    for (let i = 0; i < 4; i++) {
                        const val = row[idx++];
                        if (i === 3) {
                            const statusClass = val === '⬆️增加' ? 'increased' : (val === '⬇️减少' ? 'decreased' : '');
                            rowHtml += `<td><span class="status-badge ${statusClass}">${escapeHtml(val)}</span></td>`;
                        } else {
                            rowHtml += `<td>${val !== undefined && val !== null ? Number(val).toFixed(2) : '-'}</td>`;
                        }
                    }
                }
                if (row.length >= 9) {
                    // Memory 数据
                    for (let i = 0; i < 4; i++) {
                        const val = row[idx++];
                        if (i === 3) {
                            const statusClass = val === '⬆️增加' ? 'increased' : (val === '⬇️减少' ? 'decreased' : '');
                            rowHtml += `<td><span class="status-badge ${statusClass}">${escapeHtml(val)}</span></td>`;
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

    /**
     * 初始化表格搜索功能
     * 为搜索输入框绑定 input 事件，实现实时过滤表格行
     * @param {string} searchInputId - 搜索输入框 ID
     * @param {string} tableBodyId - 表格主体 ID
     * @param {string} resultCountId - 结果计数元素 ID
     */
    _initSearch(searchInputId, tableBodyId, resultCountId) {
        const searchInput = document.getElementById(searchInputId);
        const tableBody = document.getElementById(tableBodyId);
        const resultCount = document.getElementById(resultCountId);
        
        if (!searchInput || !tableBody) return;
        
        // 通过克隆节点移除旧的事件监听，避免重复绑定
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

    /**
     * 导出单线程对比结果为 CSV 文件
     */
    _exportSingleComparison() {
        this._exportComparison('versionTableBody', 'single_comparison');
    }

    /**
     * 导出多线程对比结果为 CSV 文件
     */
    _exportMultiComparison() {
        this._exportComparison('threadTableBody', 'multi_comparison');
    }

    /**
     * 通用对比结果导出方法
     * 将表格数据导出为 CSV 文件并触发浏览器下载
     * @param {string} tableBodyId - 表格主体元素 ID
     * @param {string} prefix - 导出文件名前缀
     */
    _exportComparison(tableBodyId, prefix) {
        const tableBody = document.getElementById(tableBodyId);
        if (!tableBody) return;
        
        const rows = Array.from(tableBody.querySelectorAll('tr'));
        if (rows.length === 0) {
            showToast('没有可导出的数据', 'error');
            return;
        }
        
        // 获取表头
        const headEl = tableBody.closest('.comparison-table-container').querySelector('thead');
        let headers = [];
        if (headEl) {
            const ths = headEl.querySelectorAll('th');
            headers = Array.from(ths).map(th => th.textContent.trim());
        }
        
        // 提取表格数据为 CSV 行
        const csvData = rows.map(row => {
            const cells = Array.from(row.querySelectorAll('td'));
            return cells.map(cell => cell.textContent.trim().replace(/\n/g, ';')).join(',');
        });
        
        // 如果没有表头，从第一行推断列名
        if (headers.length === 0 && csvData.length > 0) {
            const firstRow = csvData[0].split(',');
            headers = firstRow.map((_, i) => `列${i+1}`);
        }
        
        // 构造 CSV 内容并添加 UTF-8 BOM 以支持 Excel 正确显示
        const csvContent = [headers.join(','), ...csvData].join('\n');
        const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.href = url;
        link.setAttribute('download', `${prefix}_${new Date().toISOString().slice(0,19)}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        
        showToast('导出成功', 'success');
    }

    // ==================== 公共方法 ====================

    /**
     * 切换对比子模式（版本对比 / 线程对比）
     * @param {string} submode - 子模式值 ('version' 或 'thread')
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
        
        if (versionPanel) {
            versionPanel.style.display = (submode === 'version') ? 'block' : 'none';
        }
        if (threadPanel) {
            threadPanel.style.display = (submode === 'thread') ? 'block' : 'none';
        }
    }

    /**
     * 绑定事件监听
     * - 选项卡切换事件
     * - 单线程对比确认/导出按钮事件
     * - 多线程对比确认/导出按钮事件
     */
    _bindEvents() {
        document.querySelectorAll('.comparison-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                this.showSubMode(tab.dataset.submode);
            });
        });
        
        if (this.singleConfirmBtn) {
            this.singleConfirmBtn.addEventListener('click', () => this._performSingleComparison());
        }
        if (this.singleExportBtn) {
            this.singleExportBtn.addEventListener('click', () => this._exportSingleComparison());
        }
        
        if (this.multiConfirmBtn) {
            this.multiConfirmBtn.addEventListener('click', () => this._performMultiComparison());
        }
        if (this.multiExportBtn) {
            this.multiExportBtn.addEventListener('click', () => this._exportMultiComparison());
        }
    }

    /**
     * 从全局数据中填充 Casename 下拉选项
     * 分别从 window.singleData 和 window.multiData 获取
     */
    _populateCasenameOptions() {
        const singleData = window.singleData || {};
        const multiData = window.multiData || {};
        
        const singleCasenames = Object.keys(singleData);
        const singleOptions = singleCasenames.map(name => ({ value: name, label: name }));
        if (this.singleCasenameSelect) {
            this.singleCasenameSelect.setOptions(singleOptions);
        }
        
        const multiCasenames = Object.keys(multiData);
        const multiOptions = multiCasenames.map(name => ({ value: name, label: name }));
        if (this.multiCasenameSelect) {
            this.multiCasenameSelect.setOptions(multiOptions);
        }
    }

    /**
     * 销毁方法（预留）
     */
    dispose() {
        // 清理资源
    }
}

window.ComparisonManager = ComparisonManager;