class threadManager {
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
        this.allData = {};
        // DOM 元素
        this.casenameSelect = null;
        this.ruleSelect = null;
        this.ruleSearch = null;
        this.dateSelect = null;
        this.latest50Btn = null;
        this.addDataBtn = null;

    }

    async init(rawData, userAddedData, extraData) {
        this.casenameSelect = document.getElementById('threadCasenameSelect');
        this.ruleSelect = document.getElementById('threadRuleSelect');
        this.dateSelect = document.getElementById('threadDateSelect');
        this.ruleSearch = document.getElementById('threadRuleSearch');

        
        this.rawData = rawData;
        // this.rawData = cleanRawData;
        this.userAddedData = userAddedData || {};
        this.allData = { ...this.rawData, ...this.userAddedData };
        this.extraData = extraData

        // 初始化图表容器
        this.initChartContainer();

        // 初始化Casename选择框
        this.updateThreadSelects();
        // 初始化 rule 选择框
        await this.updateThreadRules();
        // 初始化事件监听器
        this.initEventListeners();
        // 初始化日期选择器
        this.initDatePickerModal();

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
     * 更新线程曲线图的 casename 选择框
     */
    async updateThreadSelects() {

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
    }

    /**
     * 更新线程曲线图的 rule 列表
     */
    async  updateThreadRules() {
        // 更新线程曲线图中的 Rule 选择框
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
        
    }

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
    // 初始化 线程 曲线图
    // async initThreadChartPanel() {
        
    //     this.casenameSelect = document.getElementById('selectedCasename');
    //     this.ruleSlect = document.getElementById('threadRuleSelect');
    //     this.dateSelect = document.getElementById('threadDateSelect');
    //     this.ruleSearch = document.getElementById('threadRuleSearch');
    //     // 为线程曲线图内的 Casename 选择框绑定切换事件
    //     if (this.casenameSelect) {
    //         this.casenameSelect.addEventListener('change', () => {
    //             updateThreadRules();
    //             updateThreadDates();
    //             loadThreadChartData();
    //         });
    //     }
    //     // 为线程曲线图内的 Rule 选择框绑定切换事件
    //     if (this.ruleSlect) {
    //         this.ruleSlect.addEventListener('change', loadThreadChartData);
    //     }
    //     // 为线程曲线图内的 Date 选择框绑定切换事件
    //     if (this.dateSelect) {
    //         this.dateSelect.addEventListener('change', loadThreadChartData);
    //     }
    //     // 为线程曲线图内的 Rule 搜索框绑定输入事件
    //     if (this.ruleSearch) {
    //         this.ruleSearch.addEventListener('input', updateThreadRules);
    //     }
        
    //     // 为线程曲线图内的 Runtime/Memory 菜单绑定切换事件
    //     const threadMenuItems = document.querySelectorAll('#threadSidebar .menu-item');
    //     threadMenuItems.forEach(item => {
    //         item.addEventListener('click', () => {
    //             // 更新活动状态
    //             threadMenuItems.forEach(menu => menu.classList.remove('active'));
    //             item.classList.add('active');
    //             // 重新加载线程曲线图数据
    //             loadThreadChartData();
    //         });
    //     });
    // }
}