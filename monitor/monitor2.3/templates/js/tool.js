class ToolPage {
    constructor() {
        this.container = null;
        this.tool = null;
        this.currentMode = 'single';
        this.currentMenu = 'runtime';
        this.data = { single: null, multi: null, user: null };
        this.runtimeChart = null;
        this.memoryChart = null;
        this.compareChart = null;
        this.currentFilters = { casename: '', rule: 'Overall', dates: [] };
        this.currentTooltip = null;
    }
    
    async render() {
        this.container = document.getElementById('router-view');
        if (!this.container) return;
        
        const toolName = store.getState().currentTool;
        if (!toolName) { router.navigateTo('/'); return; }
        
        try {
            this.tool = await ToolAPI.get(toolName);
            if (!this.tool) { router.navigateTo('/'); return; }
        } catch (error) {
            showToast('加载工具失败', 'error');
            router.navigateTo('/');
            return;
        }
        
        await this.loadData();
        this.container.innerHTML = this.getHTML();
        this.initCharts();
        this.bindEvents();
        this.renderCurrentView();
    }
    
    async loadData() {
        try {
            if (this.tool.single_thread_path) {
                this.data.single = await DataAPI.getSingleThread(this.tool.tool_name);
            }
            if (this.tool.multi_thread_path) {
                this.data.multi = await DataAPI.getMultiThread(this.tool.tool_name);
            }
        } catch (error) {
            showToast('加载数据失败', 'error');
        }
    }
    
    getHTML() {
        return `
            <div class="tool-container">
                <div class="tool-header">
                    <div class="tool-header-left"><button class="back-btn" id="back-btn"><i class="fas fa-arrow-left"></i></button><h2>工具: ${this.escapeHtml(this.tool.tool_name)}</h2></div>
                    <button class="refresh-btn" id="refresh-btn"><i class="fas fa-sync-alt"></i></button>
                </div>
                <div class="tool-nav">
                    <button class="nav-item ${this.currentMode === 'single' ? 'active' : ''}" data-mode="single">单线程</button>
                    <button class="nav-item ${this.currentMode === 'multi' ? 'active' : ''}" data-mode="multi">多线程</button>
                    <button class="nav-item ${this.currentMode === 'thread' ? 'active' : ''}" data-mode="thread">线程曲线图</button>
                </div>
                <div class="tool-main">
                    <div class="tool-sidebar">
                        <div class="sidebar-menu">
                            <div class="menu-item ${this.currentMenu === 'runtime' ? 'active' : ''}" data-menu="runtime"><i class="fas fa-clock"></i><span>Runtime</span></div>
                            <div class="menu-item ${this.currentMenu === 'memory' ? 'active' : ''}" data-menu="memory"><i class="fas fa-memory"></i><span>Memory</span></div>
                            <div class="menu-item ${this.currentMenu === 'compare' ? 'active' : ''}" data-menu="compare"><i class="fas fa-chart-line"></i><span>数据对比</span></div>
                        </div>
                        <div class="filter-section" id="filter-section">${this.getFilterHTML()}</div>
                    </div>
                    <div class="tool-content" id="tool-content">
                        <div id="chart-container" style="height: 400px;"></div>
                        <div id="stats-container"></div>
                        <div id="overview-container"></div>
                        <div id="compare-container"></div>
                    </div>
                </div>
            </div>
        `;
    }
    
    getFilterHTML() {
        if (this.currentMenu === 'compare') {
            const casenames = this.getCasenameList();
            const dates = this.getDateList();
            return `
                <div class="filter-group"><label>Casename</label><select class="filter-select" id="compare-casename"><option value="">请选择</option>${casenames.map(c => `<option value="${c}">${c}</option>`).join('')}</select></div>
                <div class="filter-group"><label>对比模式</label><select class="filter-select" id="compare-mode"><option value="all">对比全部rule</option><option value="filter">指定rule</option></select></div>
                <div class="filter-group" id="rule-filter-group" style="display: none;"><label>搜索Rule</label><input type="text" class="filter-input" id="compare-rule-filter" placeholder="输入rule名称..."></div>
                <div class="filter-group"><label>日期1 (基准)</label><select class="filter-select" id="compare-date1"><option value="">请选择</option>${dates.map(d => `<option value="${d}">${d}</option>`).join('')}</select></div>
                <div class="filter-group"><label>日期2 (对比)</label><select class="filter-select" id="compare-date2"><option value="">请选择</option>${dates.map(d => `<option value="${d}">${d}</option>`).join('')}</select></div>
                <div class="filter-group"><label>误差模式</label><select class="filter-select" id="error-mode"><option value="absolute">绝对值</option><option value="percentage">百分比</option></select></div>
                <div class="filter-group"><label>对比维度</label><select class="filter-select" id="compare-dimension"><option value="all">全部</option><option value="runtime">Runtime</option><option value="memory">Memory</option></select></div>
                <div class="filter-group"><label>Runtime 误差范围</label><input type="number" class="filter-input" id="runtime-tolerance" value="0" step="0.1"></div>
                <div class="filter-group"><label>Memory 误差范围</label><input type="number" class="filter-input" id="memory-tolerance" value="0" step="0.1"></div>
                <div class="filter-buttons"><button class="btn btn-primary btn-sm" id="confirm-compare"><i class="fas fa-chart-bar"></i> 确认对比</button><button class="btn btn-outline btn-sm" id="export-compare"><i class="fas fa-download"></i> 导出结果</button></div>
            `;
        }
        
        const casenames = this.getCasenameList();
        const rules = this.getRuleList();
        return `
            <div class="filter-group"><label>Casename</label><select class="filter-select" id="casename-select"><option value="">请选择</option>${casenames.map(c => `<option value="${c}" ${this.currentFilters.casename === c ? 'selected' : ''}>${c}</option>`).join('')}</select></div>
            <div class="filter-group"><label>Rule</label><select class="filter-select" id="rule-select">${rules.map(r => `<option value="${r}" ${this.currentFilters.rule === r ? 'selected' : ''}>${r}</option>`).join('')}</select></div>
            <div class="filter-group"><label>搜索Rule</label><input type="text" class="filter-input" id="rule-search" placeholder="输入rule名称..."></div>
            <div class="filter-buttons"><button class="btn btn-outline btn-sm" id="date-picker-btn"><i class="fas fa-calendar"></i> 选择日期</button><button class="btn btn-outline btn-sm" id="latest-50-btn">最新50天</button><button class="btn btn-success btn-sm" id="add-data-btn"><i class="fas fa-plus-circle"></i> 添加数据</button></div>
        `;
    }
    
    getCasenameList() {
        const data = this.currentMode === 'single' ? this.data.single : this.data.multi;
        return data ? Object.keys(data) : [];
    }
    
    getRuleList() {
        const data = this.currentMode === 'single' ? this.data.single : this.data.multi;
        const casename = this.currentFilters.casename;
        if (!data || !casename || !data[casename]) return ['Overall'];
        const rules = new Set();
        const dailyMetrics = data[casename].daily_metrics || {};
        for (const dayData of Object.values(dailyMetrics)) {
            for (const rule of Object.keys(dayData)) rules.add(rule);
        }
        return Array.from(rules).sort();
    }
    
    getDateList() {
        const data = this.currentMode === 'single' ? this.data.single : this.data.multi;
        const casename = this.currentFilters.casename;
        if (!data || !casename || !data[casename]) return [];
        return Object.keys(data[casename].daily_metrics || {}).sort();
    }
    
    initCharts() {
        this.runtimeChart = new RuntimeChart('chart-container');
        this.memoryChart = new MemoryChart('chart-container');
        this.compareChart = new CompareChart('compare-container');
    }
    
    bindEvents() {
        document.getElementById('back-btn')?.addEventListener('click', () => router.navigateTo('/'));
        document.getElementById('refresh-btn')?.addEventListener('click', async () => {
            await DataAPI.clearCache(this.tool.tool_name);
            await this.loadData();
            this.renderCurrentView();
            showToast('数据已刷新', 'success');
        });
        
        document.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', () => {
                this.currentMode = item.dataset.mode;
                this.render();
            });
        });
        
        document.querySelectorAll('.menu-item').forEach(item => {
            item.addEventListener('click', () => {
                this.currentMenu = item.dataset.menu;
                this.render();
            });
        });
        
        if (this.currentMenu !== 'compare') this.bindFilterEvents();
        else this.bindCompareEvents();
    }
    
    bindFilterEvents() {
        document.getElementById('casename-select')?.addEventListener('change', (e) => {
            this.currentFilters.casename = e.target.value;
            this.updateRuleSelect();
            this.renderCurrentView();
        });
        document.getElementById('rule-select')?.addEventListener('change', (e) => {
            this.currentFilters.rule = e.target.value;
            this.renderCurrentView();
        });
        document.getElementById('rule-search')?.addEventListener('input', debounce((e) => {
            this.filterRuleOptions(e.target.value);
        }, 300));
        document.getElementById('date-picker-btn')?.addEventListener('click', () => this.showDatePicker());
        document.getElementById('latest-50-btn')?.addEventListener('click', () => this.selectLatest50Days());
        document.getElementById('add-data-btn')?.addEventListener('click', () => this.showAddDataModal());
    }
    
    bindCompareEvents() {
        const compareMode = document.getElementById('compare-mode');
        const ruleFilterGroup = document.getElementById('rule-filter-group');
        compareMode?.addEventListener('change', (e) => {
            if (ruleFilterGroup) ruleFilterGroup.style.display = e.target.value === 'filter' ? 'block' : 'none';
        });
        document.getElementById('confirm-compare')?.addEventListener('click', async () => await this.performCompare());
        document.getElementById('export-compare')?.addEventListener('click', () => this.compareChart?.exportToCSV());
    }
    
    async performCompare() {
        const casename = document.getElementById('compare-casename')?.value;
        const date1 = document.getElementById('compare-date1')?.value;
        const date2 = document.getElementById('compare-date2')?.value;
        const compareMode = document.getElementById('compare-mode')?.value;
        const ruleFilter = document.getElementById('compare-rule-filter')?.value;
        const errorMode = document.getElementById('error-mode')?.value;
        const compareDimension = document.getElementById('compare-dimension')?.value;
        const runtimeTolerance = parseFloat(document.getElementById('runtime-tolerance')?.value || 0);
        const memoryTolerance = parseFloat(document.getElementById('memory-tolerance')?.value || 0);
        
        if (!casename || !date1 || !date2) {
            showToast('请填写完整的对比参数', 'warning');
            return;
        }
        
        try {
            const result = await CompareAPI.compare(this.tool.tool_name, {
                casename, date1, date2, compare_mode: compareMode,
                rule_filter: compareMode === 'filter' ? ruleFilter : null,
                error_mode: errorMode, compare_dimension: compareDimension,
                runtime_tolerance: runtimeTolerance, memory_tolerance: memoryTolerance
            });
            this.compareChart.render(result, { date1, date2 });
        } catch (error) {
            showToast('对比失败', 'error');
        }
    }
    
    updateRuleSelect() {
        const rules = this.getRuleList();
        const ruleSelect = document.getElementById('rule-select');
        if (ruleSelect) {
            ruleSelect.innerHTML = rules.map(r => `<option value="${r}">${r}</option>`).join('');
            if (!rules.includes(this.currentFilters.rule)) {
                this.currentFilters.rule = rules[0] || 'Overall';
                ruleSelect.value = this.currentFilters.rule;
            }
        }
    }
    
    filterRuleOptions(searchText) {
        const rules = this.getRuleList();
        const filtered = rules.filter(r => r.toLowerCase().includes(searchText.toLowerCase()));
        const ruleSelect = document.getElementById('rule-select');
        if (ruleSelect) {
            ruleSelect.innerHTML = filtered.map(r => `<option value="${r}">${r}</option>`).join('');
        }
    }
    
    showDatePicker() {
        const dates = this.getDateList();
        const modal = document.createElement('div');
        modal.className = 'modal-overlay date-picker-modal';
        modal.innerHTML = `
            <div class="modal" style="width: 500px;">
                <div class="modal-header"><h3>选择日期</h3><button class="modal-close">&times;</button></div>
                <div class="modal-body">
                    <div class="date-search"><input type="text" class="input" id="date-search" placeholder="搜索日期..."></div>
                    <div class="select-all"><label><input type="checkbox" id="select-all-checkbox"> 全选</label></div>
                    <div class="date-list" id="date-list">${this.renderDateList(dates)}</div>
                </div>
                <div class="modal-footer"><button class="btn btn-outline modal-cancel">取消</button><button class="btn btn-primary modal-confirm">确认</button></div>
            </div>
        `;
        document.body.appendChild(modal);
        
        const selectedSet = new Set(this.currentFilters.dates);
        document.querySelectorAll('.date-checkbox').forEach(cb => { if (selectedSet.has(cb.value)) cb.checked = true; });
        
        document.getElementById('select-all-checkbox')?.addEventListener('change', (e) => {
            document.querySelectorAll('.date-checkbox:not(.hidden)').forEach(cb => cb.checked = e.target.checked);
        });
        document.getElementById('date-search')?.addEventListener('input', (e) => {
            const searchText = e.target.value.toLowerCase();
            document.querySelectorAll('.date-item').forEach(item => {
                const date = item.querySelector('label')?.textContent;
                item.classList.toggle('hidden', !(date && date.toLowerCase().includes(searchText)));
            });
        });
        
        modal.querySelector('.modal-confirm')?.addEventListener('click', () => {
            const selected = Array.from(document.querySelectorAll('.date-checkbox:checked')).map(cb => cb.value);
            this.currentFilters.dates = selected;
            this.renderCurrentView();
            modal.remove();
        });
        
        const closeModal = () => modal.remove();
        modal.querySelector('.modal-close')?.addEventListener('click', closeModal);
        modal.querySelector('.modal-cancel')?.addEventListener('click', closeModal);
        modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
    }
    
    renderDateList(dates) {
        const grouped = {};
        dates.forEach(date => {
            const [year, month] = date.split('-');
            const key = `${year}年${month}月`;
            if (!grouped[key]) grouped[key] = [];
            grouped[key].push(date);
        });
        let html = '';
        for (const [group, groupDates] of Object.entries(grouped)) {
            html += `<div class="date-group"><div class="date-group-title">${group}</div>`;
            groupDates.forEach(date => {
                html += `<div class="date-item"><input type="checkbox" class="date-checkbox" value="${date}" id="date-${date}"><label for="date-${date}">${date}</label></div>`;
            });
            html += `</div>`;
        }
        return html;
    }
    
    selectLatest50Days() {
        const allDates = this.getDateList();
        this.currentFilters.dates = allDates.slice(-50);
        this.renderCurrentView();
        showToast(`已选择最近${this.currentFilters.dates.length}天`, 'success');
    }
    
    showAddDataModal() {
        const modal = document.createElement('div');
        modal.className = 'modal-overlay add-data-modal';
        modal.innerHTML = `
            <div class="modal" style="width: 500px;">
                <div class="modal-header"><h3>添加数据</h3><button class="modal-close">&times;</button></div>
                <div class="modal-body"><textarea class="paths-textarea" id="paths-input" placeholder="每行输入一个数据路径&#10;例如：&#10;/data/user1/&#10;/data/user2/"></textarea></div>
                <div class="modal-footer"><button class="btn btn-outline modal-cancel">取消</button><button class="btn btn-success modal-confirm">确认</button></div>
            </div>
        `;
        document.body.appendChild(modal);
        
        modal.querySelector('.modal-confirm')?.addEventListener('click', async () => {
            const pathsText = modal.querySelector('#paths-input').value;
            const paths = pathsText.split('\n').filter(p => p.trim());
            if (paths.length === 0) { showToast('请至少输入一个路径', 'warning'); return; }
            try {
                const userData = await DataAPI.addUserData(this.tool.tool_name, paths);
                if (this.data.single) this.mergeUserData(this.data.single, userData);
                if (this.data.multi) this.mergeUserData(this.data.multi, userData);
                modal.remove();
                this.renderCurrentView();
                showToast('数据添加成功', 'success');
            } catch (error) { showToast('添加失败', 'error'); }
        });
        
        const closeModal = () => modal.remove();
        modal.querySelector('.modal-close')?.addEventListener('click', closeModal);
        modal.querySelector('.modal-cancel')?.addEventListener('click', closeModal);
        modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
    }
    
    mergeUserData(targetData, userData) {
        for (const [casename, caseData] of Object.entries(userData)) {
            if (!targetData[casename]) targetData[casename] = { daily_metrics: {} };
            const dailyMetrics = caseData.daily_metrics || {};
            for (const [date, metrics] of Object.entries(dailyMetrics)) {
                targetData[casename].daily_metrics[date] = metrics;
            }
        }
    }
    
    renderCurrentView() {
        const data = this.currentMode === 'single' ? this.data.single : this.data.multi;
        const chartContainer = document.getElementById('chart-container');
        const statsContainer = document.getElementById('stats-container');
        const overviewContainer = document.getElementById('overview-container');
        const compareContainer = document.getElementById('compare-container');
        
        if (this.currentMenu === 'compare') {
            if (chartContainer) chartContainer.style.display = 'none';
            if (statsContainer) statsContainer.style.display = 'none';
            if (overviewContainer) overviewContainer.style.display = 'none';
            if (compareContainer) compareContainer.style.display = 'block';
        } else if (this.currentMenu === 'runtime') {
            if (chartContainer) chartContainer.style.display = 'block';
            if (statsContainer) statsContainer.style.display = 'block';
            if (overviewContainer) overviewContainer.style.display = 'block';
            if (compareContainer) compareContainer.style.display = 'none';
            if (data && this.runtimeChart) {
                this.runtimeChart.render(data, this.currentFilters);
                const stats = this.runtimeChart.updateStats(data, this.currentFilters);
                const overview = this.runtimeChart.updateOverview(data);
                this.renderStats(stats, 'runtime');
                this.renderOverview(overview);
            }
        } else if (this.currentMenu === 'memory') {
            if (chartContainer) chartContainer.style.display = 'block';
            if (statsContainer) statsContainer.style.display = 'block';
            if (overviewContainer) overviewContainer.style.display = 'block';
            if (compareContainer) compareContainer.style.display = 'none';
            if (data && this.memoryChart) {
                this.memoryChart.render(data, this.currentFilters);
                const stats = this.memoryChart.updateStats(data, this.currentFilters);
                const overview = this.memoryChart.updateOverview(data);
                this.renderStats(stats, 'memory');
                this.renderOverview(overview);
            }
        }
    }
    
    renderStats(stats, type) {
        const container = document.getElementById('stats-container');
        if (!stats) { container.innerHTML = '<div class="empty-state">请选择Casename</div>'; return; }
        container.innerHTML = `
            <div class="stats-grid">
                <div class="stat-card"><div class="stat-value">${stats.dateRange}</div><div class="stat-label">日期范围</div></div>
                <div class="stat-card"><div class="stat-value">${type === 'runtime' ? stats.totalRuntime : stats.totalMemory}</div><div class="stat-label">总 ${type === 'runtime' ? 'Runtime' : 'Memory'}</div></div>
                <div class="stat-card"><div class="stat-value">${type === 'runtime' ? stats.avgRuntime : stats.avgMemory}</div><div class="stat-label">平均 ${type === 'runtime' ? 'Runtime' : 'Memory'}</div></div>
                <div class="stat-card"><div class="stat-value">${type === 'runtime' ? stats.maxRuntime : stats.maxMemory}</div><div class="stat-label">最大 ${type === 'runtime' ? 'Runtime' : 'Memory'}<span class="stat-hint" data-tooltip="${type === 'runtime' ? stats.maxRuntimeRule : stats.maxMemoryRule}"><i class="fas fa-question-circle"></i></span></div></div>
                <div class="stat-card"><div class="stat-value">${type === 'runtime' ? stats.minRuntime : stats.minMemory}</div><div class="stat-label">最小 ${type === 'runtime' ? 'Runtime' : 'Memory'}<span class="stat-hint" data-tooltip="${type === 'runtime' ? stats.minRuntimeRule : stats.minMemoryRule}"><i class="fas fa-question-circle"></i></span></div></div>
            </div>
        `;
        this.bindStatTooltips();
    }
    
    renderOverview(overview) {
        const container = document.getElementById('overview-container');
        if (!overview) return;
        container.innerHTML = `
            <div class="overview-card"><div class="overview-stats">
                <div class="overview-item"><span class="overview-value">${overview.totalCases}</span><span class="text-muted">总Case数</span></div>
                <div class="overview-item"><span class="overview-value">${overview.totalRules}</span><span class="text-muted">总阶段数</span></div>
                <div class="overview-item"><span class="overview-value">${overview.totalDays}</span><span class="text-muted">总天数</span></div>
            </div></div>
        `;
    }
    
    bindStatTooltips() {
        document.querySelectorAll('.stat-hint').forEach(hint => {
            hint.addEventListener('mouseenter', (e) => {
                const tooltipText = e.currentTarget.getAttribute('data-tooltip');
                if (tooltipText) this.showTooltip(e.currentTarget, tooltipText);
            });
            hint.addEventListener('mouseleave', () => this.hideTooltip());
        });
    }
    
    showTooltip(element, content) {
        this.hideTooltip();
        const tooltip = document.createElement('div');
        tooltip.className = 'tooltip';
        tooltip.innerHTML = content;
        tooltip.style.position = 'fixed';
        const rect = element.getBoundingClientRect();
        tooltip.style.left = rect.left + 'px';
        tooltip.style.top = (rect.bottom + 5) + 'px';
        document.body.appendChild(tooltip);
        this.currentTooltip = tooltip;
    }
    
    hideTooltip() {
        if (this.currentTooltip) {
            this.currentTooltip.remove();
            this.currentTooltip = null;
        }
    }
    
    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}