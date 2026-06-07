class CompareChart {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.currentResult = null;
        this.currentFilters = {};
        this.currentTooltip = null;
    }
    
    render(result, filters) {
        this.currentResult = result;
        this.currentFilters = filters;
        
        if (!result || !result.statistics) {
            this.showEmpty();
            return;
        }
        
        this.renderStatistics(result.statistics);
        this.renderTable(result.results, result.out_of_tolerance_count);
    }
    
    showEmpty() {
        if (this.container) {
            this.container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-chart-line empty-icon"></i>
                    <p>暂无对比数据</p>
                    <p class="text-muted">请选择对比参数后点击"确认对比"</p>
                </div>
            `;
        }
    }
    
    renderStatistics(statistics) {
        const statsHtml = `
            <div class="stats-grid">
                <div class="stat-card">
                    <div class="stat-value" style="color: var(--success);">${statistics.runtime.increase_count}</div>
                    <div class="stat-label">
                        Runtime 增加Rule
                        <span class="stat-hint" data-tooltip="${this.formatTooltipList(statistics.runtime.top_increases, 'runtime')}">
                            <i class="fas fa-question-circle"></i>
                        </span>
                    </div>
                </div>
                <div class="stat-card">
                    <div class="stat-value" style="color: var(--danger);">${statistics.runtime.decrease_count}</div>
                    <div class="stat-label">
                        Runtime 减少Rule
                        <span class="stat-hint" data-tooltip="${this.formatTooltipList(statistics.runtime.top_decreases, 'runtime')}">
                            <i class="fas fa-question-circle"></i>
                        </span>
                    </div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${statistics.runtime.avg_change}%</div>
                    <div class="stat-label">Runtime 平均变化率</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value" style="color: var(--warning);">${this.formatMaxChange(statistics.runtime.max_increase)}</div>
                    <div class="stat-label">
                        Runtime 最大增加
                        <span class="stat-hint" data-tooltip="${this.formatMaxTooltip(statistics.runtime.max_increase)}">
                            <i class="fas fa-question-circle"></i>
                        </span>
                    </div>
                </div>
                <div class="stat-card">
                    <div class="stat-value" style="color: var(--info);">${this.formatMaxChange(statistics.runtime.max_decrease)}</div>
                    <div class="stat-label">
                        Runtime 最大减少
                        <span class="stat-hint" data-tooltip="${this.formatMaxTooltip(statistics.runtime.max_decrease)}">
                            <i class="fas fa-question-circle"></i>
                        </span>
                    </div>
                </div>
            </div>
            <div class="stats-grid" style="margin-top: var(--spacing-4);">
                <div class="stat-card">
                    <div class="stat-value" style="color: var(--success);">${statistics.memory.increase_count}</div>
                    <div class="stat-label">
                        Memory 增加Rule
                        <span class="stat-hint" data-tooltip="${this.formatTooltipList(statistics.memory.top_increases, 'memory')}">
                            <i class="fas fa-question-circle"></i>
                        </span>
                    </div>
                </div>
                <div class="stat-card">
                    <div class="stat-value" style="color: var(--danger);">${statistics.memory.decrease_count}</div>
                    <div class="stat-label">
                        Memory 减少Rule
                        <span class="stat-hint" data-tooltip="${this.formatTooltipList(statistics.memory.top_decreases, 'memory')}">
                            <i class="fas fa-question-circle"></i>
                        </span>
                    </div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${statistics.memory.avg_change}%</div>
                    <div class="stat-label">Memory 平均变化率</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value" style="color: var(--warning);">${this.formatMaxChange(statistics.memory.max_increase)}</div>
                    <div class="stat-label">
                        Memory 最大增加
                        <span class="stat-hint" data-tooltip="${this.formatMaxTooltip(statistics.memory.max_increase)}">
                            <i class="fas fa-question-circle"></i>
                        </span>
                    </div>
                </div>
                <div class="stat-card">
                    <div class="stat-value" style="color: var(--info);">${this.formatMaxChange(statistics.memory.max_decrease)}</div>
                    <div class="stat-label">
                        Memory 最大减少
                        <span class="stat-hint" data-tooltip="${this.formatMaxTooltip(statistics.memory.max_decrease)}">
                            <i class="fas fa-question-circle"></i>
                        </span>
                    </div>
                </div>
            </div>
        `;
        
        let statsContainer = this.container.querySelector('.compare-stats');
        if (!statsContainer) {
            statsContainer = document.createElement('div');
            statsContainer.className = 'compare-stats';
            this.container.insertBefore(statsContainer, this.container.firstChild);
        }
        statsContainer.innerHTML = statsHtml;
        this.bindTooltips();
    }
    
    formatTooltipList(items, type) {
        if (!items || items.length === 0) return '暂无数据';
        const list = items.map(item => {
            const change = type === 'runtime' ? `${item[1].toFixed(2)}s (${item[2].toFixed(1)}%)` : `${item[1].toFixed(2)}MB (${item[2].toFixed(1)}%)`;
            return `${item[0]}: ${change}`;
        });
        return list.join('<br>');
    }
    
    formatMaxChange(item) {
        if (!item) return '0';
        return item[1].toFixed(2);
    }
    
    formatMaxTooltip(item) {
        if (!item) return '暂无数据';
        return `${item[0]}: ${item[1].toFixed(2)} (${item[2].toFixed(1)}%)`;
    }
    
    renderTable(results, outOfToleranceCount) {
        const tableHtml = `
            <div class="compare-table-container">
                <div class="compare-table-filters" style="margin-bottom: var(--spacing-3);">
                    <input type="text" class="filter-input" id="table-filter" placeholder="搜索rule..." style="width: 200px;">
                </div>
                <table class="compare-table">
                    <thead>
                        <tr>
                            <th>Rule</th>
                            <th>基准值</th>
                            <th>对比值</th>
                            <th>差值</th>
                            <th>状态</th>
                        </tr>
                    </thead>
                    <tbody id="compare-table-body">
                        ${this.renderTableRows(results)}
                    </tbody>
                </table>
                <div class="compare-summary" style="margin-top: var(--spacing-3); padding: var(--spacing-2); background: var(--bg-base); border-radius: var(--radius-md);">
                    共 ${results.length} 条规则，其中 ${outOfToleranceCount} 条超出容忍范围
                </div>
            </div>
        `;
        
        let tableContainer = this.container.querySelector('.compare-table-container');
        if (!tableContainer) {
            tableContainer = document.createElement('div');
            this.container.appendChild(tableContainer);
        }
        tableContainer.innerHTML = tableHtml;
        
        const filterInput = document.getElementById('table-filter');
        if (filterInput) {
            filterInput.addEventListener('input', (e) => {
                this.filterTable(e.target.value, results);
            });
        }
    }
    
    renderTableRows(results) {
        return results.map(row => `
            <tr class="${row.is_out_of_tolerance ? 'out-of-tolerance' : ''}">
                <td><strong>${row.rule}</strong></td>
                <td>${row.value1}</td>
                <td>${row.value2}</td>
                <td style="color: ${this.getDiffColor(row)}">${row.diff}</td>
                <td>${row.is_out_of_tolerance ? '<span style="color: var(--danger);">⚠️ 超差</span>' : '<span style="color: var(--success);">✓ 正常</span>'}</td>
            </tr>
        `).join('');
    }
    
    getDiffColor(row) {
        if (row.runtime_diff !== undefined) {
            if (row.runtime_diff > 0) return 'var(--danger)';
            if (row.runtime_diff < 0) return 'var(--success)';
        }
        if (row.memory_diff !== undefined) {
            if (row.memory_diff > 0) return 'var(--danger)';
            if (row.memory_diff < 0) return 'var(--success)';
        }
        return 'var(--text-secondary)';
    }
    
    filterTable(searchText, allResults) {
        const filtered = allResults.filter(row => 
            row.rule.toLowerCase().includes(searchText.toLowerCase())
        );
        const tbody = document.getElementById('compare-table-body');
        if (tbody) {
            tbody.innerHTML = this.renderTableRows(filtered);
        }
    }
    
    bindTooltips() {
        const hints = this.container.querySelectorAll('.stat-hint');
        hints.forEach(hint => {
            hint.addEventListener('mouseenter', (e) => {
                const tooltip = e.currentTarget.getAttribute('data-tooltip');
                if (tooltip) {
                    this.showTooltip(e.currentTarget, tooltip);
                }
            });
            hint.addEventListener('mouseleave', () => {
                this.hideTooltip();
            });
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
    
    exportToCSV() {
        if (!this.currentResult || !this.currentResult.results) {
            showToast('没有可导出的数据', 'warning');
            return;
        }
        
        const data = this.currentResult.results.map(row => ({
            'Rule': row.rule,
            '基准值': row.value1,
            '对比值': row.value2,
            '差值': row.diff,
            '状态': row.is_out_of_tolerance ? '超差' : '正常'
        }));
        
        const filename = `compare_${this.currentFilters.date1}_vs_${this.currentFilters.date2}.csv`;
        downloadCSV(data, filename);
        showToast('导出成功', 'success');
    }
}