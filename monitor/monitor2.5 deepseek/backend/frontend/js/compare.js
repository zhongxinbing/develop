// 数据对比功能
async function performComparison() {
    const casename = document.getElementById('compareCasename').value;
    const date1 = document.getElementById('date1').value;
    const date2 = document.getElementById('date2').value;
    const compareMode = document.getElementById('compareMode').value;
    const errorMode = document.getElementById('errorMode').value;
    const dimension = document.getElementById('compareDimension').value;
    const runtimeRange = parseFloat(document.getElementById('runtimeRange').value) || 0;
    const memoryRange = parseFloat(document.getElementById('memoryRange').value) || 0;
    
    if (!casename || !date1 || !date2) {
        showError('请选择完整的对比信息');
        return;
    }
    
    try {
        // 获取两个日期的数据
        const data1 = await getDataForDate(casename, date1);
        const data2 = await getDataForDate(casename, date2);
        
        const comparison = {
            statistics: calculateStatistics(data1, data2, dimension, errorMode, runtimeRange, memoryRange),
            details: calculateDetails(data1, data2, compareMode)
        };
        
        displayComparisonResults(comparison);
    } catch (error) {
        console.error('Comparison failed:', error);
        showError('对比失败');
    }
}

function calculateStatistics(data1, data2, dimension, errorMode, runtimeRange, memoryRange) {
    const stats = {
        runtimeIncreased: [],
        runtimeDecreased: [],
        runtimeAvgChange: 0,
        runtimeMaxIncrease: 0,
        runtimeMaxDecrease: 0,
        memoryIncreased: [],
        memoryDecreased: [],
        memoryAvgChange: 0,
        memoryMaxIncrease: 0,
        memoryMaxDecrease: 0
    };
    
    if (dimension === 'all' || dimension === 'runtime') {
        // 计算runtime的统计信息
        const changes = [];
        
        for (const [rule, metrics1] of Object.entries(data1)) {
            if (rule === 'casename_key') continue;
            
            const metrics2 = data2[rule];
            if (metrics2) {
                const runtimeChange = metrics2.runtime - metrics1.runtime;
                const changePercent = (runtimeChange / metrics1.runtime) * 100;
                
                changes.push({ rule, change: runtimeChange, changePercent });
                
                if (runtimeChange > 0) {
                    stats.runtimeIncreased.push({ rule, change: runtimeChange, changePercent });
                    stats.runtimeMaxIncrease = Math.max(stats.runtimeMaxIncrease, runtimeChange);
                } else if (runtimeChange < 0) {
                    stats.runtimeDecreased.push({ rule, change: Math.abs(runtimeChange), changePercent: Math.abs(changePercent) });
                    stats.runtimeMaxDecrease = Math.max(stats.runtimeMaxDecrease, Math.abs(runtimeChange));
                }
            }
        }
        
        // 排序并取前10
        stats.runtimeIncreased.sort((a, b) => b.change - a.change);
        stats.runtimeDecreased.sort((a, b) => b.change - a.change);
        stats.runtimeIncreased = stats.runtimeIncreased.slice(0, 10);
        stats.runtimeDecreased = stats.runtimeDecreased.slice(0, 10);
        
        // 计算平均变化率
        const avgChange = changes.reduce((sum, c) => sum + c.changePercent, 0) / changes.length;
        stats.runtimeAvgChange = avgChange;
    }
    
    if (dimension === 'all' || dimension === 'memory') {
        // 计算memory的统计信息
        const changes = [];
        
        for (const [rule, metrics1] of Object.entries(data1)) {
            if (rule === 'casename_key') continue;
            
            const metrics2 = data2[rule];
            if (metrics2) {
                const memoryChange = metrics2.memory - metrics1.memory;
                const changePercent = (memoryChange / metrics1.memory) * 100;
                
                changes.push({ rule, change: memoryChange, changePercent });
                
                if (memoryChange > 0) {
                    stats.memoryIncreased.push({ rule, change: memoryChange, changePercent });
                    stats.memoryMaxIncrease = Math.max(stats.memoryMaxIncrease, memoryChange);
                } else if (memoryChange < 0) {
                    stats.memoryDecreased.push({ rule, change: Math.abs(memoryChange), changePercent: Math.abs(changePercent) });
                    stats.memoryMaxDecrease = Math.max(stats.memoryMaxDecrease, Math.abs(memoryChange));
                }
            }
        }
        
        // 排序并取前10
        stats.memoryIncreased.sort((a, b) => b.change - a.change);
        stats.memoryDecreased.sort((a, b) => b.change - a.change);
        stats.memoryIncreased = stats.memoryIncreased.slice(0, 10);
        stats.memoryDecreased = stats.memoryDecreased.slice(0, 10);
        
        // 计算平均变化率
        const avgChange = changes.reduce((sum, c) => sum + c.changePercent, 0) / changes.length;
        stats.memoryAvgChange = avgChange;
    }
    
    return stats;
}

function calculateDetails(data1, data2, compareMode) {
    const details = [];
    
    const allRules = new Set([...Object.keys(data1), ...Object.keys(data2)]);
    
    for (const rule of allRules) {
        if (rule === 'casename_key') continue;
        
        const metrics1 = data1[rule] || { runtime: 0, memory: 0 };
        const metrics2 = data2[rule] || { runtime: 0, memory: 0 };
        
        const runtimeChange = metrics2.runtime - metrics1.runtime;
        const runtimeChangePercent = metrics1.runtime !== 0 ? (runtimeChange / metrics1.runtime) * 100 : 0;
        const memoryChange = metrics2.memory - metrics1.memory;
        const memoryChangePercent = metrics1.memory !== 0 ? (memoryChange / metrics1.memory) * 100 : 0;
        
        details.push({
            rule,
            runtime1: metrics1.runtime,
            runtime2: metrics2.runtime,
            runtimeChange,
            runtimeChangePercent,
            memory1: metrics1.memory,
            memory2: metrics2.memory,
            memoryChange,
            memoryChangePercent
        });
    }
    
    return details;
}

function displayComparisonResults(comparison) {
    const resultsContainer = document.getElementById('compareResults');
    
    resultsContainer.innerHTML = `
        <div class="compare-stats">
            ${renderStatisticsCards(comparison.statistics)}
        </div>
        <div class="compare-table">
            <h4>详细对比结果</h4>
            <table>
                <thead>
                    <tr>
                        <th>Rule</th>
                        <th>Runtime (日期1)</th>
                        <th>Runtime (日期2)</th>
                        <th>Runtime变化</th>
                        <th>Runtime变化率</th>
                        <th>Memory (日期1)</th>
                        <th>Memory (日期2)</th>
                        <th>Memory变化</th>
                        <th>Memory变化率</th>
                    </tr>
                </thead>
                <tbody>
                    ${comparison.details.map(detail => `
                        <tr>
                            <td>${detail.rule}</td>
                            <td>${detail.runtime1.toFixed(2)}s</td>
                            <td>${detail.runtime2.toFixed(2)}s</td>
                            <td class="${detail.runtimeChange >= 0 ? 'increase' : 'decrease'}">
                                ${detail.runtimeChange >= 0 ? '+' : ''}${detail.runtimeChange.toFixed(2)}s
                            </td>
                            <td class="${detail.runtimeChangePercent >= 0 ? 'increase' : 'decrease'}">
                                ${detail.runtimeChangePercent >= 0 ? '+' : ''}${detail.runtimeChangePercent.toFixed(2)}%
                            </td>
                            <td>${detail.memory1.toFixed(2)}MB</td>
                            <td>${detail.memory2.toFixed(2)}MB</td>
                            <td class="${detail.memoryChange >= 0 ? 'increase' : 'decrease'}">
                                ${detail.memoryChange >= 0 ? '+' : ''}${detail.memoryChange.toFixed(2)}MB
                            </td>
                            <td class="${detail.memoryChangePercent >= 0 ? 'increase' : 'decrease'}">
                                ${detail.memoryChangePercent >= 0 ? '+' : ''}${detail.memoryChangePercent.toFixed(2)}%
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    `;
}

function renderStatisticsCards(statistics) {
    let html = '';
    
    if (statistics.runtimeIncreased && statistics.runtimeIncreased.length > 0) {
        html += `
            <div class="compare-stat-card">
                <h4>Runtime增加Rule (Top 10)</h4>
                <div class="value" title="${statistics.runtimeIncreased.map(r => `${r.rule}: +${r.change.toFixed(2)}s (${r.changePercent.toFixed(2)}%)`).join('\n')}">
                    ${statistics.runtimeIncreased.length}个Rule
                </div>
            </div>
        `;
    }
    
    if (statistics.runtimeDecreased && statistics.runtimeDecreased.length > 0) {
        html += `
            <div class="compare-stat-card">
                <h4>Runtime减少Rule (Top 10)</h4>
                <div class="value" title="${statistics.runtimeDecreased.map(r => `${r.rule}: -${r.change.toFixed(2)}s (${r.changePercent.toFixed(2)}%)`).join('\n')}">
                    ${statistics.runtimeDecreased.length}个Rule
                </div>
            </div>
        `;
    }
    
    html += `
        <div class="compare-stat-card">
            <h4>Runtime平均变化率</h4>
            <div class="value">${statistics.runtimeAvgChange.toFixed(2)}%</div>
        </div>
        <div class="compare-stat-card">
            <h4>Runtime最大增加</h4>
            <div class="value" title="${statistics.runtimeIncreased[0] ? `${statistics.runtimeIncreased[0].rule}: +${statistics.runtimeIncreased[0].change.toFixed(2)}s` : '-'}">
                ${statistics.runtimeMaxIncrease.toFixed(2)}s
            </div>
        </div>
        <div class="compare-stat-card">
            <h4>Runtime最大减少</h4>
            <div class="value" title="${statistics.runtimeDecreased[0] ? `${statistics.runtimeDecreased[0].rule}: -${statistics.runtimeDecreased[0].change.toFixed(2)}s` : '-'}">
                ${statistics.runtimeMaxDecrease.toFixed(2)}s
            </div>
        </div>
    `;
    
    if (statistics.memoryIncreased && statistics.memoryIncreased.length > 0) {
        html += `
            <div class="compare-stat-card">
                <h4>Memory增加Rule (Top 10)</h4>
                <div class="value" title="${statistics.memoryIncreased.map(m => `${m.rule}: +${m.change.toFixed(2)}MB (${m.changePercent.toFixed(2)}%)`).join('\n')}">
                    ${statistics.memoryIncreased.length}个Rule
                </div>
            </div>
        `;
    }
    
    return html;
}

async function getDataForDate(casename, date) {
    // 获取指定日期的数据
    // 这里需要根据实际API实现
    return {};
}

function exportComparisonResults() {
    const results = document.getElementById('compareResults');
    const blob = new Blob([results.innerText], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `comparison_${new Date().toISOString()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
}

// 设置对比视图的事件监听
document.addEventListener('DOMContentLoaded', () => {
    const confirmBtn = document.getElementById('confirmCompare');
    const exportBtn = document.getElementById('exportCompare');
    
    if (confirmBtn) {
        confirmBtn.addEventListener('click', performComparison);
    }
    
    if (exportBtn) {
        exportBtn.addEventListener('click', exportComparisonResults);
    }
});

function showError(message) {
    alert(message);
}