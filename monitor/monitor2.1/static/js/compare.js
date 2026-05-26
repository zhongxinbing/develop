/**
 * 数据对比模块
 */

// 对比全局变量
let compareState = {
    currentProjectId: null,
    currentResult: null,
    currentFilteredData: [],
    currentFilterText: '',
    availableDates: []
};

// ==================================================
// 配置管理
// ==================================================
// 工具函数
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
/**
 * 加载对比配置
 * @param {string} projectId - 项目ID
 * @returns {Promise<object>} 配置对象
 */
async function loadCompareConfig(projectId) {
    if (!projectId) return {};
    
    try {
        const response = await fetch(`/api/compare_config?project_id=${encodeURIComponent(projectId)}`);
        const result = await response.json();
        if (result.success && result.config) return result.config;
    } catch (error) {
        console.error('加载对比配置失败:', error);
    }
    return {};
}

/**
 * 应用配置到表单
 * @param {object} config - 配置对象
 * @returns {boolean} 是否应用成功
 */
function applyCompareConfigToForm(config) {
    if (!config || Object.keys(config).length === 0) return false;
    
    let applied = false;
    
    if (config.tolerance_runtime !== undefined && !isNaN(config.tolerance_runtime)) {
        const runtimeInput = document.getElementById('toleranceRuntime');
        if (runtimeInput) {
            runtimeInput.value = config.tolerance_runtime;
            applied = true;
        }
    }
    
    if (config.tolerance_memory !== undefined && !isNaN(config.tolerance_memory)) {
        const memoryInput = document.getElementById('toleranceMemory');
        if (memoryInput) {
            memoryInput.value = config.tolerance_memory;
            applied = true;
        }
    }
    
    return applied;
}

/**
 * 保存对比配置到服务器
 * @param {string} projectId - 项目ID
 * @param {object} config - 配置对象
 * @returns {Promise<boolean>} 是否保存成功
 */
async function saveCompareConfig(projectId, config) {
    if (!projectId) return false;
    
    try {
        const response = await fetch('/api/compare_config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                project_id: projectId,
                config: {
                    tolerance_runtime: config.tolerance_runtime,
                    tolerance_memory: config.tolerance_memory
                }
            })
        });
        const result = await response.json();
        return result.success;
    } catch (error) {
        console.error('保存对比配置失败:', error);
        return false;
    }
}

// ==================================================
// 数据加载
// ==================================================

/**
 * 加载对比日期列表
 * @param {string} projectId - 项目ID
 */
async function loadCompareDates(projectId) {
    if (!projectId) {
        updateCompareControlsState(false);
        return;
    }
    
    try {
        const response = await fetch('/api/get_dates', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ project_id: projectId })
        });
        const data = await response.json();
        
        if (data.success && data.dates?.length) {
            const date1Select = document.getElementById('compareDate1');
            const date2Select = document.getElementById('compareDate2');
            const currentDate1 = date1Select?.value;
            const currentDate2 = date2Select?.value;
            
            compareState.availableDates = data.dates;
            
            if (date1Select) {
                date1Select.innerHTML = '<option value="">请选择日期</option>';
                data.dates.forEach(date => {
                    date1Select.appendChild(new Option(date, date));
                });
                if (currentDate1 && data.dates.includes(currentDate1)) {
                    date1Select.value = currentDate1;
                } else if (data.dates.length > 0) {
                    date1Select.value = data.dates[0];
                }
            }
            
            if (date2Select) {
                date2Select.innerHTML = '<option value="">请选择日期</option>';
                data.dates.forEach(date => {
                    date2Select.appendChild(new Option(date, date));
                });
                if (currentDate2 && data.dates.includes(currentDate2)) {
                    date2Select.value = currentDate2;
                } else if (data.dates.length > 1) {
                    date2Select.value = data.dates[1];
                } else if (data.dates.length > 0) {
                    date2Select.value = data.dates[0];
                }
            }
            
            updateCompareControlsState(true);
        } else {
            updateCompareControlsState(false);
        }
    } catch (error) {
        console.error('加载日期失败:', error);
        updateCompareControlsState(false);
    }
}

/**
 * 加载对比规则列表
 * @param {string} projectId - 项目ID
 */
async function loadCompareRules(projectId) {
    if (!projectId) {
        updateCompareControlsState(false);
        return;
    }
    
    try {
        const response = await fetch(`/api/project/${projectId}`);
        const data = await response.json();
        
        const ruleSelect = document.getElementById('compareRuleSelect');
        const currentValue = ruleSelect?.value;
        
        if (ruleSelect && data?.rules?.length) {
            ruleSelect.innerHTML = '<option value="all">📊 所有阶段</option>' + 
                data.rules.map(rule => `<option value="${rule}">${rule}</option>`).join('');
            
            if (currentValue && (currentValue === 'all' || data.rules.includes(currentValue))) {
                ruleSelect.value = currentValue;
            } else if (data.rules.length > 0) {
                ruleSelect.value = 'all';
            }
        }
        
        updateCompareControlsState(true);
    } catch (error) {
        console.error('加载规则失败:', error);
        updateCompareControlsState(false);
    }
}

/**
 * 项目切换时加载配置
 * @param {string} projectId - 项目ID
 */
async function onCompareProjectChange(projectId) {
    if (!projectId) {
        updateCompareControlsState(false);
        return;
    }
    
    await loadCompareDates(projectId);
    await loadCompareRules(projectId);
    
    const config = await loadCompareConfig(projectId);
    applyCompareConfigToForm(config);
}

// ==================================================
// 控件状态
// ==================================================

/**
 * 更新对比页面控件的禁用状态
 * @param {boolean} hasCase - 是否有case
 */
function updateCompareControlsState(hasCase) {
    const controls = [
        'compareModeSelect', 'compareRuleSelect', 'compareDate1', 'compareDate2',
        'toleranceMode', 'compareDimensionSelect', 'toleranceRuntime', 'toleranceMemory',
        'executeCompareBtn', 'exportCompareBtn'
    ];
    
    controls.forEach(controlId => {
        const element = document.getElementById(controlId);
        if (element) element.disabled = !hasCase;
    });
    
    const modeSelect = document.getElementById('compareModeSelect');
    if (modeSelect) modeSelect.disabled = !hasCase;
    
    const warningDiv = document.getElementById('compareNoCaseWarning');
    const resultArea = document.getElementById('compareResultArea');
    
    if (warningDiv) warningDiv.style.display = hasCase ? 'none' : 'flex';
    if (resultArea) resultArea.style.display = 'none';
    
    compareState.currentResult = null;
    compareState.currentFilteredData = [];
    
    const compareSummary = document.getElementById('compareSummary');
    if (compareSummary) compareSummary.innerHTML = '';
    
    const tableBody = document.getElementById('compareTableBody');
    if (tableBody) tableBody.innerHTML = '';
}

// ==================================================
// 对比执行
// ==================================================

/**
 * 获取当前表单配置
 * @returns {object} 配置对象
 */
function getCurrentCompareConfig() {
    return {
        tolerance_runtime: parseFloat(document.getElementById('toleranceRuntime').value) || 0,
        tolerance_memory: parseFloat(document.getElementById('toleranceMemory').value) || 0,
        tolerance_mode: document.getElementById('toleranceMode').value,
        compare_dimension: document.getElementById('compareDimensionSelect').value,
        date1: document.getElementById('compareDate1').value,
        date2: document.getElementById('compareDate2').value
    };
}

/**
 * 执行对比
 */
async function executeCompare() {
    const projectId = document.getElementById('compareCaseSelect')?.value;
    if (!projectId) {
        showNotification('请先选择一个项目', true);
        return;
    }
    
    const compareMode = document.getElementById('compareModeSelect')?.value;
    let ruleName = document.getElementById('compareRuleSelect')?.value;
    const date1 = document.getElementById('compareDate1')?.value;
    const date2 = document.getElementById('compareDate2')?.value;
    
    if (compareMode === 'all') ruleName = 'all';
    
    if (!date1 || !date2) {
        showNotification('请选择两个日期进行对比', true);
        return;
    }
    
    if (date1 === date2) {
        showNotification('请选择两个不同的日期', true);
        return;
    }
    
    const config = getCurrentCompareConfig();
    
    showLoading(true);
    
    try {
        const response = await fetch('/api/compare', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                project_id: projectId,
                rule_name: ruleName,
                date1, date2,
                tolerance_runtime: config.tolerance_runtime,
                tolerance_memory: config.tolerance_memory,
                tolerance_mode: config.tolerance_mode,
                compare_dimension: config.compare_dimension,
                save_config: true
            })
        });
        
        const result = await response.json();
        
        if (result.success && result.result) {
            compareState.currentResult = result.result;
            displayCompareResult(result.result);
            
            const compareResultArea = document.getElementById('compareResultArea');
            if (compareResultArea) compareResultArea.style.display = 'block';
            
            setTimeout(() => initStatsTooltips(), 100);
            
            await saveCompareConfig(projectId, {
                tolerance_runtime: config.tolerance_runtime,
                tolerance_memory: config.tolerance_memory
            });
            
            showNotification('对比完成，配置已保存');
        } else {
            showNotification('对比失败: ' + (result.error || '未知错误'), true);
        }
    } catch (error) {
        console.error('对比失败:', error);
        showNotification('对比失败: ' + error.message, true);
    } finally {
        showLoading(false);
    }
}

// ==================================================
// 结果展示
// ==================================================

/**
 * 构建排序列表
 * @param {Array} rulesComparison - 阶段对比列表
 * @param {string} type - 类型 (runtime/memory)
 * @param {boolean} isIncrease - 是否增加
 * @returns {Array} 排序后的列表
 */
function buildSortedList(rulesComparison, type, isIncrease) {
    if (!rulesComparison?.length) return [];
    
    return rulesComparison
        .filter(r => r.has_data && r[`${type}_change_pct`] !== null && r[`${type}_change_pct`] !== undefined)
        .filter(r => isIncrease ? r[`${type}_change_pct`] > 0 : r[`${type}_change_pct`] < 0)
        .map(r => ({
            name: r.rule_name,
            change_pct: isIncrease ? r[`${type}_change_pct`] : Math.abs(r[`${type}_change_pct`])
        }))
        .sort((a, b) => b.change_pct - a.change_pct);
}

function buildStatsTooltipHtml(items, metricName, trend) {
    if (!items || items.length === 0) return `<div style="padding: 8px 12px;">暂无${metricName}${trend}阶段</div>`;
    const sign = trend === '增加' ? '+' : '';
    const color = trend === '增加' ? '#ef4444' : '#10b981';
    let html = `<div style="min-width: 220px; max-width: 300px;"><div style="font-weight: bold; margin-bottom: 8px; border-bottom: 1px solid #334155; padding: 8px 12px 6px 12px; background: rgba(99, 102, 241, 0.1); border-radius: var(--radius-md) var(--radius-md) 0 0;">📊 ${metricName}${trend} Top${Math.min(items.length, 10)}</div><div style="max-height: 300px; overflow-y: auto; padding: 4px 8px;">`;
    items.slice(0, 10).forEach((item, idx) => {
        const name = item.name || item.date || '未知';
        const changePct = item.change_pct;
        html += `<div style="display: flex; justify-content: space-between; gap: 12px; padding: 6px 0; font-size: 0.7rem; border-bottom: 1px solid rgba(51, 65, 85, 0.3);">
            <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 160px;" title="${escapeHtml(name)}">${idx + 1}. ${escapeHtml(name)}</span>
            <span style="color: ${color}; font-weight: 500; flex-shrink: 0;">${sign}${changePct}%</span>
        </div>`;
    });
    if (items.length > 10) html += `<div style="margin-top: 6px; padding: 6px 0; text-align: center; color: #64748b; font-size: 0.65rem;">共 ${items.length} 个阶段</div>`;
    html += `</div></div>`;
    return html;
}
function buildSingleStatsTooltipHtml(items, metricName, trend) {
    if (!items || items.length === 0) return `<div style="padding: 8px 12px;">暂无${metricName}${trend}数据点</div>`;
    const sign = trend === '增加' ? '+' : '';
    const color = trend === '增加' ? '#ef4444' : '#10b981';
    let html = `<div style="min-width: 240px; max-width: 320px;"><div style="font-weight: bold; margin-bottom: 8px; border-bottom: 1px solid #334155; padding: 8px 12px 6px 12px; background: rgba(99, 102, 241, 0.1); border-radius: var(--radius-md) var(--radius-md) 0 0;">📊 ${metricName}${trend} Top${Math.min(items.length, 10)}</div><div style="max-height: 300px; overflow-y: auto; padding: 4px 8px;">`;
    items.slice(0, 10).forEach((item, idx) => {
        const date = item.date || '未知';
        const changePct = item.change_pct;
        const value = item.value;
        html += `<div style="display: flex; justify-content: space-between; gap: 12px; padding: 6px 0; font-size: 0.7rem; border-bottom: 1px solid rgba(51, 65, 85, 0.3);">
            <span style="flex: 1;">${idx + 1}. ${escapeHtml(date)}</span>
            <span style="color: ${color}; font-weight: 500; min-width: 65px; text-align: right;">${sign}${changePct}%</span>
            <span style="color: #94a3b8; min-width: 55px; text-align: right;">(${trend === '增加' ? '+' : ''}${value})</span>
        </div>`;
    });
    if (items.length > 10) html += `<div style="margin-top: 6px; padding: 6px 0; text-align: center; color: #64748b; font-size: 0.65rem;">共 ${items.length} 个数据点</div>`;
    html += `</div></div>`;
    return html;
}

/**
 * 显示对比结果
 * @param {object} result - 对比结果
 */
function displayCompareResult(result) {
    const isAllRules = result.mode === 'all_rules';
    const compareResultTitle = document.getElementById('compareResultTitle');
    if (compareResultTitle) {
        compareResultTitle.innerHTML = isAllRules ? '📈 全阶段对比结果' : `📈 单阶段对比结果 - ${result.rule_name}`;
    }
    
    const summary = result.summary;
    const compareDimension = result.compare_dimension || 'both';
    const compareRuntime = compareDimension === 'runtime' || compareDimension === 'both';
    const compareMemory = compareDimension === 'memory' || compareDimension === 'both';
    
    const runtimeStatsContainer = document.getElementById('compareRuntimeStats');
    const memoryStatsContainer = document.getElementById('compareMemoryStats');
    const runtimeStatsRow = document.getElementById('compareRuntimeStatsRow');
    const memoryStatsRow = document.getElementById('compareMemoryStatsRow');
    
    if (isAllRules) {
        // 全阶段对比
        const rulesComparison = result.rules_comparison || [];
        compareState.currentFilteredData = rulesComparison;
        
        if (compareRuntime && runtimeStatsContainer) {
            if (runtimeStatsRow) runtimeStatsRow.style.display = 'block';
            
            const runtimeSummary = summary.runtime || {};
            runtimeStatsContainer.innerHTML = `
                <div class="stat-item"><div class="stat-value status-increase">${runtimeSummary.total_increase || 0}</div><div class="stat-label">Runtime增加阶段</div></div>
                <div class="stat-item"><div class="stat-value status-decrease">${runtimeSummary.total_decrease || 0}</div><div class="stat-label">Runtime减少阶段</div></div>
                <div class="stat-item"><div class="stat-value">${runtimeSummary.avg_change_pct || 0}%</div><div class="stat-label">Runtime平均变化率</div></div>
                <div class="stat-item"><div class="stat-value">${runtimeSummary.max_increase_pct ? runtimeSummary.max_increase_pct.toFixed(2) + '%' : '0%'}</div><div class="stat-label">Runtime最大增加</div></div>
                <div class="stat-item"><div class="stat-value">${runtimeSummary.max_decrease_pct ? Math.abs(runtimeSummary.max_decrease_pct).toFixed(2) + '%' : '0%'}</div><div class="stat-label">Runtime最大减少</div></div>
            `;
            
            // 添加tooltip
            const increaseCard = runtimeStatsContainer.children[0];
            const decreaseCard = runtimeStatsContainer.children[1];
            if (increaseCard && runtimeSummary.increase_list?.length) {
                increaseCard.setAttribute('data-tooltip-html', buildStatsTooltipHtml(runtimeSummary.increase_list, 'Runtime', '增加'));
                increaseCard.style.cursor = 'help';
            }
            if (decreaseCard && runtimeSummary.decrease_list?.length) {
                decreaseCard.setAttribute('data-tooltip-html', buildStatsTooltipHtml(runtimeSummary.decrease_list, 'Runtime', '减少'));
                decreaseCard.style.cursor = 'help';
            }
        } else if (runtimeStatsRow) {
            runtimeStatsRow.style.display = 'none';
        }
        
        if (compareMemory && memoryStatsContainer) {
            if (memoryStatsRow) memoryStatsRow.style.display = 'block';
            
            const memorySummary = summary.memory || {};
            memoryStatsContainer.innerHTML = `
                <div class="stat-item"><div class="stat-value status-increase">${memorySummary.total_increase || 0}</div><div class="stat-label">Memory增加阶段</div></div>
                <div class="stat-item"><div class="stat-value status-decrease">${memorySummary.total_decrease || 0}</div><div class="stat-label">Memory减少阶段</div></div>
                <div class="stat-item"><div class="stat-value">${memorySummary.avg_change_pct || 0}%</div><div class="stat-label">Memory平均变化率</div></div>
                <div class="stat-item"><div class="stat-value">${memorySummary.max_increase_pct ? memorySummary.max_increase_pct.toFixed(2) + '%' : '0%'}</div><div class="stat-label">Memory最大增加</div></div>
                <div class="stat-item"><div class="stat-value">${memorySummary.max_decrease_pct ? Math.abs(memorySummary.max_decrease_pct).toFixed(2) + '%' : '0%'}</div><div class="stat-label">Memory最大减少</div></div>
            `;
            
            const increaseCard = memoryStatsContainer.children[0];
            const decreaseCard = memoryStatsContainer.children[1];
            if (increaseCard && memorySummary.increase_list?.length) {
                increaseCard.setAttribute('data-tooltip-html', buildStatsTooltipHtml(memorySummary.increase_list, 'Memory', '增加'));
                increaseCard.style.cursor = 'help';
            }
            if (decreaseCard && memorySummary.decrease_list?.length) {
                decreaseCard.setAttribute('data-tooltip-html', buildStatsTooltipHtml(memorySummary.decrease_list, 'Memory', '减少'));
                decreaseCard.style.cursor = 'help';
            }
        } else if (memoryStatsRow) {
            memoryStatsRow.style.display = 'none';
        }
        
        // 渲染表头
        const compareTableHeader = document.getElementById('compareTableHeader');
        if (compareTableHeader) {
            let headerHtml = '<tr>';
            headerHtml += '<th>阶段名称</th>';
            if (compareRuntime) {
                headerHtml += '<th>Runtime(基准)</th><th>Runtime(对比)</th><th>Runtime差值</th><th>Runtime变化率(%)</th>';
            }
            if (compareMemory) {
                headerHtml += '<th>Memory(基准)</th><th>Memory(对比)</th><th>Memory差值</th><th>Memory变化率(%)</th>';
            }
            headerHtml += '<th>状态</th></tr>';
            compareTableHeader.innerHTML = headerHtml;
        }
        
        addTableFilter();
        applyTableFilter();
    } else {
        // 单阶段对比
        const comparisons = result.comparisons || [];
        
        if (compareRuntime && runtimeStatsContainer) {
            if (runtimeStatsRow) runtimeStatsRow.style.display = 'block';
            runtimeStatsContainer.innerHTML = `
                <div class="stat-item"><div class="stat-value status-increase">${summary.runtime_increased || 0}</div><div class="stat-label">Runtime增加</div></div>
                <div class="stat-item"><div class="stat-value status-decrease">${summary.runtime_decreased || 0}</div><div class="stat-label">Runtime减少</div></div>
                <div class="stat-item"><div class="stat-value">${summary.runtime_unchanged || 0}</div><div class="stat-label">Runtime不变</div></div>
                <div class="stat-item"><div class="stat-value">${summary.runtime_max_change || 0}%</div><div class="stat-label">Runtime最大变化</div></div>
                <div class="stat-item"><div class="stat-value">${summary.runtime_avg_change || 0}%</div><div class="stat-label">Runtime平均变化</div></div>
            `;
            
            const increaseCard = runtimeStatsContainer.children[0];
            const decreaseCard = runtimeStatsContainer.children[1];
            if (increaseCard && summary.runtime_increase_list?.length) {
                increaseCard.setAttribute('data-tooltip-html', buildSingleStatsTooltipHtml(summary.runtime_increase_list, 'Runtime', '增加'));
                increaseCard.style.cursor = 'help';
            }
            if (decreaseCard && summary.runtime_decrease_list?.length) {
                decreaseCard.setAttribute('data-tooltip-html', buildSingleStatsTooltipHtml(summary.runtime_decrease_list, 'Runtime', '减少'));
                decreaseCard.style.cursor = 'help';
            }
        } else if (runtimeStatsRow) {
            runtimeStatsRow.style.display = 'none';
        }
        
        if (compareMemory && memoryStatsContainer) {
            if (memoryStatsRow) memoryStatsRow.style.display = 'block';
            memoryStatsContainer.innerHTML = `
                <div class="stat-item"><div class="stat-value status-increase">${summary.memory_increased || 0}</div><div class="stat-label">Memory增加</div></div>
                <div class="stat-item"><div class="stat-value status-decrease">${summary.memory_decreased || 0}</div><div class="stat-label">Memory减少</div></div>
                <div class="stat-item"><div class="stat-value">${summary.memory_unchanged || 0}</div><div class="stat-label">Memory不变</div></div>
                <div class="stat-item"><div class="stat-value">${summary.memory_max_change || 0}%</div><div class="stat-label">Memory最大变化</div></div>
                <div class="stat-item"><div class="stat-value">${summary.memory_avg_change || 0}%</div><div class="stat-label">Memory平均变化</div></div>
            `;
            
            const increaseCard = memoryStatsContainer.children[0];
            const decreaseCard = memoryStatsContainer.children[1];
            if (increaseCard && summary.memory_increase_list?.length) {
                increaseCard.setAttribute('data-tooltip-html', buildSingleStatsTooltipHtml(summary.memory_increase_list, 'Memory', '增加'));
                increaseCard.style.cursor = 'help';
            }
            if (decreaseCard && summary.memory_decrease_list?.length) {
                decreaseCard.setAttribute('data-tooltip-html', buildSingleStatsTooltipHtml(summary.memory_decrease_list, 'Memory', '减少'));
                decreaseCard.style.cursor = 'help';
            }
        } else if (memoryStatsRow) {
            memoryStatsRow.style.display = 'none';
        }
        
        // 渲染表头
        const compareTableHeader = document.getElementById('compareTableHeader');
        if (compareTableHeader) {
            let headerHtml = '<tr>';
            headerHtml += '<th>序号</th><th>日期</th>';
            if (compareRuntime) {
                headerHtml += '<th>Runtime(基准)</th><th>Runtime(对比)</th><th>Runtime差值</th><th>Runtime变化率(%)</th><th>Runtime状态</th>';
            }
            if (compareMemory) {
                headerHtml += '<th>Memory(基准)</th><th>Memory(对比)</th><th>Memory差值</th><th>Memory变化率(%)</th><th>Memory状态</th>';
            }
            headerHtml += '</tr>';
            compareTableHeader.innerHTML = headerHtml;
        }
        
        const tableBody = document.getElementById('compareTableBody');
        if (tableBody) {
            tableBody.innerHTML = comparisons.map(comp => {
                let rowHtml = `<tr><td>${comp.index + 1}</td><td>${comp.date}</td>`;
                
                if (compareRuntime) {
                    const runtimeStatusClass = comp.runtime_status === 'increase' ? 'status-increase' : 
                                               (comp.runtime_status === 'decrease' ? 'status-decrease' : '');
                    rowHtml += `
                        <td>${comp.runtime1 !== null ? comp.runtime1.toFixed(2) : 'N/A'}</td>
                        <td>${comp.runtime2 !== null ? comp.runtime2.toFixed(2) : 'N/A'}</td>
                        <td>${comp.runtime_diff !== null ? comp.runtime_diff.toFixed(2) : 'N/A'}</td>
                        <td class="${runtimeStatusClass}">${comp.runtime_change_pct !== null ? comp.runtime_change_pct.toFixed(2) + '%' : 'N/A'}</td>
                        <td>${comp.runtime_status || 'N/A'}</td>
                    `;
                }
                if (compareMemory) {
                    const memoryStatusClass = comp.memory_status === 'increase' ? 'status-increase' : 
                                              (comp.memory_status === 'decrease' ? 'status-decrease' : '');
                    rowHtml += `
                        <td>${comp.memory1 !== null ? comp.memory1.toFixed(2) : 'N/A'}</td>
                        <td>${comp.memory2 !== null ? comp.memory2.toFixed(2) : 'N/A'}</td>
                        <td>${comp.memory_diff !== null ? comp.memory_diff.toFixed(2) : 'N/A'}</td>
                        <td class="${memoryStatusClass}">${comp.memory_change_pct !== null ? comp.memory_change_pct.toFixed(2) + '%' : 'N/A'}</td>
                        <td>${comp.memory_status || 'N/A'}</td>
                    `;
                }
                rowHtml += '</tr>';
                return rowHtml;
            }).join('');
        }
    }
    
    setTimeout(() => initStatsTooltips(), 50);
}

// ==================================================
// 表格筛选
// ==================================================

/**
 * 添加表格筛选器
 */
function addTableFilter() {
    const compareResultArea = document.getElementById('compareResultArea');
    if (!compareResultArea) return;
    if (document.getElementById('tableFilterInput')) return;
    
    const tableContainer = compareResultArea.querySelector('.table-container');
    if (!tableContainer) return;
    
    const filterBar = document.createElement('div');
    filterBar.className = 'table-filter-bar';
    filterBar.style.cssText = `
        display: flex;
        align-items: center;
        gap: 1rem;
        margin-bottom: 1rem;
        padding: 0.75rem 1rem;
        background: rgba(15, 23, 42, 0.6);
        border-radius: var(--radius-lg);
        flex-wrap: wrap;
    `;
    
    filterBar.innerHTML = `
        <div style="display: flex; align-items: center; gap: 0.5rem;">
            <span>🔍</span>
            <input type="text" id="tableFilterInput" placeholder="筛选阶段名称..." style="width: 250px; padding: 0.5rem 0.75rem; background: rgba(0,0,0,0.3); border: 1px solid var(--border); border-radius: var(--radius-md); color: var(--text-primary);">
        </div>
        <div style="display: flex; align-items: center; gap: 0.5rem;">
            <span>📊 显示:</span>
            <select id="filterStatusSelect" style="padding: 0.5rem 0.75rem; background: rgba(0,0,0,0.3); border: 1px solid var(--border); border-radius: var(--radius-md); color: var(--text-primary);">
                <option value="all">全部阶段</option>
                <option value="increase">仅显示增加</option>
                <option value="decrease">仅显示减少</option>
                <option value="no_data">仅显示无数据</option>
            </select>
        </div>
        <div style="display: flex; align-items: center; gap: 0.5rem;">
            <span>📈 排序:</span>
            <select id="filterSortSelect" style="padding: 0.5rem 0.75rem; background: rgba(0,0,0,0.3); border: 1px solid var(--border); border-radius: var(--radius-md); color: var(--text-primary);">
                <option value="none">无排序</option>
                <option value="runtime_inc">Runtime 增加最多</option>
                <option value="runtime_dec">Runtime 减少最多</option>
                <option value="memory_inc">Memory 增加最多</option>
                <option value="memory_dec">Memory 减少最多</option>
            </select>
        </div>
        <button id="clearTableFilterBtn" class="btn btn-secondary" style="padding: 0.5rem 1rem;">清除筛选</button>
        <span id="filterResultCount" style="color: var(--text-muted); font-size: 0.75rem;">共 0 条</span>
    `;
    
    tableContainer.parentNode.insertBefore(filterBar, tableContainer);
    
    const filterInput = document.getElementById('tableFilterInput');
    const statusSelect = document.getElementById('filterStatusSelect');
    const sortSelect = document.getElementById('filterSortSelect');
    const clearBtn = document.getElementById('clearTableFilterBtn');
    
    if (filterInput) {
        filterInput.addEventListener('input', debounce(() => {
            compareState.currentFilterText = filterInput.value;
            applyTableFilter();
        }, 300));
    }
    
    if (statusSelect) {
        statusSelect.addEventListener('change', () => applyTableFilter());
    }
    
    if (sortSelect) {
        sortSelect.addEventListener('change', () => applyTableFilter());
    }
    
    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            if (filterInput) filterInput.value = '';
            if (statusSelect) statusSelect.value = 'all';
            if (sortSelect) sortSelect.value = 'none';
            compareState.currentFilterText = '';
            applyTableFilter();
        });
    }
}

/**
 * 应用表格筛选
 */
function applyTableFilter() {
    if (!compareState.currentFilteredData.length) return;
    
    const filterText = compareState.currentFilterText.toLowerCase();
    const statusFilter = document.getElementById('filterStatusSelect')?.value || 'all';
    const sortBy = document.getElementById('filterSortSelect')?.value || 'none';
    const compareDimension = document.getElementById('compareDimensionSelect')?.value || 'both';
    const compareRuntime = compareDimension === 'runtime' || compareDimension === 'both';
    const compareMemory = compareDimension === 'memory' || compareDimension === 'both';
    
    let filtered = [...compareState.currentFilteredData];
    
    if (filterText) {
        filtered = filtered.filter(rule => 
            rule.rule_name && rule.rule_name.toLowerCase().includes(filterText)
        );
    }
    
    if (statusFilter !== 'all') {
        filtered = filtered.filter(rule => {
            if (statusFilter === 'increase') return rule.runtime_change_pct > 0;
            if (statusFilter === 'decrease') return rule.runtime_change_pct < 0;
            if (statusFilter === 'no_data') return !rule.has_data;
            return true;
        });
    }
    
    if (sortBy !== 'none') {
        filtered.sort((a, b) => {
            switch (sortBy) {
                case 'runtime_inc': return (b.runtime_change_pct || -Infinity) - (a.runtime_change_pct || -Infinity);
                case 'runtime_dec': return (a.runtime_change_pct || Infinity) - (b.runtime_change_pct || Infinity);
                case 'memory_inc': return (b.memory_change_pct || -Infinity) - (a.memory_change_pct || -Infinity);
                case 'memory_dec': return (a.memory_change_pct || Infinity) - (b.memory_change_pct || Infinity);
                default: return 0;
            }
        });
    }
    
    renderFilteredTable(filtered, compareRuntime, compareMemory);
    
    const countSpan = document.getElementById('filterResultCount');
    if (countSpan) countSpan.textContent = `共 ${filtered.length} 条`;
}

/**
 * 渲染筛选后的表格
 * @param {Array} filteredData - 筛选后的数据
 * @param {boolean} compareRuntime - 是否对比Runtime
 * @param {boolean} compareMemory - 是否对比Memory
 */
function renderFilteredTable(filteredData, compareRuntime, compareMemory) {
    const tbody = document.getElementById('compareTableBody');
    if (!tbody) return;
    
    tbody.innerHTML = filteredData.map(rule => {
        const statusText = () => {
            if (!rule.has_data) return '无数据';
            if (compareRuntime && compareMemory) {
                if (rule.runtime_status === 'increase' || rule.memory_status === 'increase') return '⬆️ 增加';
                if (rule.runtime_status === 'decrease' || rule.memory_status === 'decrease') return '⬇️ 减少';
                return '➖ 不变';
            } else if (compareRuntime) {
                if (rule.runtime_status === 'increase') return '⬆️ 增加';
                if (rule.runtime_status === 'decrease') return '⬇️ 减少';
                return '➖ 不变';
            } else if (compareMemory) {
                if (rule.memory_status === 'increase') return '⬆️ 增加';
                if (rule.memory_status === 'decrease') return '⬇️ 减少';
                return '➖ 不变';
            }
            return '无数据';
        };
        
        const runtime1 = rule.runtime1 !== null && rule.runtime1 !== undefined ? rule.runtime1.toFixed(2) : 'N/A';
        const runtime2 = rule.runtime2 !== null && rule.runtime2 !== undefined ? rule.runtime2.toFixed(2) : 'N/A';
        const runtimeDiff = rule.runtime_diff !== null && rule.runtime_diff !== undefined ? rule.runtime_diff.toFixed(2) : 'N/A';
        const runtimeChangePct = rule.runtime_change_pct !== null && rule.runtime_change_pct !== undefined ? rule.runtime_change_pct.toFixed(2) + '%' : 'N/A';
        
        const memory1 = rule.memory1 !== null && rule.memory1 !== undefined ? rule.memory1.toFixed(2) : 'N/A';
        const memory2 = rule.memory2 !== null && rule.memory2 !== undefined ? rule.memory2.toFixed(2) : 'N/A';
        const memoryDiff = rule.memory_diff !== null && rule.memory_diff !== undefined ? rule.memory_diff.toFixed(2) : 'N/A';
        const memoryChangePct = rule.memory_change_pct !== null && rule.memory_change_pct !== undefined ? rule.memory_change_pct.toFixed(2) + '%' : 'N/A';
        
        const runtimeClass = () => {
            if (!rule.has_data) return '';
            if (rule.runtime_change_pct > 0) return 'status-increase';
            if (rule.runtime_change_pct < 0) return 'status-decrease';
            return '';
        };
        
        const memoryClass = () => {
            if (!rule.has_data) return '';
            if (rule.memory_change_pct > 0) return 'status-increase';
            if (rule.memory_change_pct < 0) return 'status-decrease';
            return '';
        };
        
        let rowHtml = `<tr><td style="text-align:left; font-weight:500;">${escapeHtml(rule.rule_name)}</td>`;
        
        if (compareRuntime) {
            rowHtml += `
                <td>${runtime1}</td>
                <td>${runtime2}</td>
                <td>${runtimeDiff}</td>
                <td class="${runtimeClass()}">${runtimeChangePct}</td>
            `;
        }
        
        if (compareMemory) {
            rowHtml += `
                <td>${memory1}</td>
                <td>${memory2}</td>
                <td>${memoryDiff}</td>
                <td class="${memoryClass()}">${memoryChangePct}</td>
            `;
        }
        
        rowHtml += `<td>${statusText()}</td></tr>`;
        return rowHtml;
    }).join('');
}

// ==================================================
// 导出功能
// ==================================================

/**
 * 导出对比结果
 */
async function exportCompareResult() {
    if (!compareState.currentResult) {
        showNotification('没有可导出的对比结果', true);
        return;
    }
    
    try {
        const response = await fetch('/api/export_compare', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ result: compareState.currentResult })
        });
        
        const result = await response.json();
        
        if (result.success) {
            const link = document.createElement('a');
            link.href = result.download_url;
            link.download = result.filename;
            link.click();
            showNotification('导出成功');
        } else {
            showNotification('导出失败: ' + (result.error || '未知错误'), true);
        }
    } catch (error) {
        console.error('导出失败:', error);
        showNotification('导出失败', true);
    }
}

// ==================================================
// 事件绑定
// ==================================================

/**
 * 绑定对比事件
 */
function bindCompareEvents() {
    // 项目选择
    const compareCaseSelect = document.getElementById('compareCaseSelect');
    if (compareCaseSelect) {
        compareCaseSelect.addEventListener('change', async (e) => {
            const projId = e.target.value;
            if (projId) {
                await onCompareProjectChange(projId);
            } else {
                updateCompareControlsState(false);
            }
        });
    }
    
    // 模式切换
    const compareModeSelect = document.getElementById('compareModeSelect');
    if (compareModeSelect) {
        compareModeSelect.addEventListener('change', (e) => {
            const ruleGroup = document.getElementById('compareRuleGroup');
            if (ruleGroup) {
                ruleGroup.style.display = e.target.value === 'all' ? 'none' : 'block';
            }
        });
        
        if (compareModeSelect.value === 'all') {
            const ruleGroup = document.getElementById('compareRuleGroup');
            if (ruleGroup) ruleGroup.style.display = 'none';
        }
    }
    
    // 执行对比
    const executeCompareBtn = document.getElementById('executeCompareBtn');
    if (executeCompareBtn) executeCompareBtn.addEventListener('click', executeCompare);
    
    // 导出结果
    const exportCompareBtn = document.getElementById('exportCompareBtn');
    if (exportCompareBtn) exportCompareBtn.addEventListener('click', exportCompareResult);
}

// 导出函数
window.compareState = compareState;
window.executeCompare = executeCompare;
window.exportCompareResult = exportCompareResult;