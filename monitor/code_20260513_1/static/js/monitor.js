
// 防抖函数
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// 简单哈希函数，用于比较数据是否变化
function simpleHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    return hash.toString();
}

// 获取服务器访问地址
function getServerAddress() {
    fetch('/api/server-info')
        .then(response => response.json())
        .then(data => {
            const addressDiv = document.getElementById('serverAddress');
            if (data.local_ip) {
                addressDiv.innerHTML = `http://${data.local_ip}:${data.port}  |  http://localhost:${data.port}`;
            } else {
                addressDiv.innerHTML = `http://localhost:${data.port}`;
            }
        })
        .catch(err => {
            console.error('获取服务器地址失败:', err);
            document.getElementById('serverAddress').innerHTML = '请查看控制台输出';
        });
}
// 获取当前的 casename
function getCurrentProjectData() {

    return projectsData[casename]; 
}

// 优化：使用虚拟滚动和分页的阶段选择器
function updateRuleSelect() {
    const caseData = getCurrentProjectData();
    const rules = caseData.rules;
    // 获取搜索框的输入的值
    const searchText = document.getElementById('ruleSearch').value.toLowerCase();
    
    // 过滤阶段
    let filteredRules = rules;
    if (searchText) {
        filteredRules = rules.filter(rule => rule.toLowerCase().includes(searchText));
    }
    
    // 缓存过滤后的阶段列表
    cachedTools = filteredRules;
    
    const select = document.getElementById('ruleSelect');
    // 获取当前 选择器的值
    const currentValue = select.value;
    
    // 保存当前滚动位置（如果有的话）
    const scrollPos = select.scrollTop;
    
    // 使用DocumentFragment批量添加，提高性能
    const fragment = document.createDocumentFragment();
    
    // 添加默认选项
    const defaultOption = document.createElement('option');
    defaultOption.value = '';
    defaultOption.textContent = '-- 请选择阶段 --';
    fragment.appendChild(defaultOption);
    
    // 添加阶段选项（限制显示数量以提高性能，但保留所有选项供选择）
    // 对于200+阶段，浏览器处理option元素还是可以的，我们直接全部添加
    filteredRules.forEach(rule => {
        const option = document.createElement('option');
        option.value = rule;
        option.textContent = rule;
        fragment.appendChild(option);
    });
       
    // 清空并重新填充
    select.innerHTML = '';
    select.appendChild(fragment);
    
    // 恢复滚动位置
    select.scrollTop = scrollPos;
    
    const ruleCount = filteredRules.length;
    // document.getElementById('ruleCount').innerHTML = `🔧 显示 ${ruleCount} 个阶段 (总计 ${rules.length})`;
    
    // 恢复之前选择的阶段
    if (currentValue && filteredRules.includes(currentValue)) {
        select.value = currentValue;
        currentRule = currentValue;
    } else if (filteredRules.length > 0 && !currentRule) {
        select.value = filteredRules[0];
        currentRule = filteredRules[0];
    } else if (filteredRules.length === 0) {
        currentRule = null;
    }
    
    if (currentRule) {
        document.getElementById('currentRuleName').innerText = currentRule;
        // 使用防抖延迟渲染
        debouncedRenderCharts();
    } else {
        document.getElementById('currentRuleName').innerText = '未选择';
        clearCharts();
    }
}

// 防抖渲染函数
const debouncedRenderCharts = debounce(() => {
    if (currentRule) {
        refreshAllCharts();
    }
}, 100);

// 优化：使用缓存的数据避免重复查找
function getCurrentToolDataOptimized() {
    if (!currentRule) return null;
    
    // 检查缓存
    if (cachedToolData[currentRule] && cachedToolData[currentRule].projectId === casename) {
        return cachedToolData[currentRule].data;
    }
    
    const projectData = getCurrentProjectData();
    if (!projectData.rule_data[currentRule]) return null;
    
    // 缓存数据
    cachedToolData[currentRule] = {
        projectId: casename,
        data: projectData.rule_data[currentRule]
    };
    
    // 限制缓存大小，避免内存占用过大
    const cacheKeys = Object.keys(cachedToolData);
    if (cacheKeys.length > 50) {
        // 删除最旧的缓存项
        delete cachedToolData[cacheKeys[0]];
    }
    
    return projectData.rule_data[currentRule];
}

// 清空所有图表
function clearCharts() {
    Object.keys(charts).forEach(key => {
        if (charts[key]) {
            charts[key].clear();
        }
    });
    
    // 清空统计卡片
    ['stats-runtime', 'stats-memory', 'stats-cores'].forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            element.innerHTML = '<div class="stat-card">请选择阶段</div>';
        }
    });
    
    // 重置哈希缓存
    lastRenderedDataHash = {
        runtime: '',
        memory: '',
        cores: ''
    };
}

function updateStats(containerId, data, unit, label) {
    const validData = data.filter(v => v !== null && v !== undefined && v > 0);
    if (validData.length === 0) {
        document.getElementById(containerId).innerHTML = '<div class="stat-card">暂无数据</div>';
        return;
    }
    const total = validData.reduce((a, b) => a + b, 0);
    const avg = (total / validData.length).toFixed(1);
    const max = Math.max(...validData);
    const min = Math.min(...validData);
    
    document.getElementById(containerId).innerHTML = `
        <div class="stat-card"><div class="stat-label">📊 总${label}</div><div class="stat-value">${total.toFixed(1)}<span class="stat-unit">${unit}</span></div></div>
        <div class="stat-card"><div class="stat-label">⚡ 平均${label}</div><div class="stat-value">${avg}<span class="stat-unit">${unit}</span></div></div>
        <div class="stat-card"><div class="stat-label">📈 最大${label}</div><div class="stat-value">${max}<span class="stat-unit">${unit}</span></div></div>
        <div class="stat-card"><div class="stat-label">📉 最小${label}</div><div class="stat-value">${min}<span class="stat-unit">${unit}</span></div></div>
    `;
}

// 优化：增量更新图表，避免不必要的重绘
function renderEChartOptimized(chartType, dataKey, color, yAxisName, yAxisFormatter = null) {
    const toolData = getCurrentToolDataOptimized();
    if (!toolData) {
        if (charts[chartType]) {
            charts[chartType].clear();
        }
        return;
    }
    
    const dates = toolData.dates;
    const values = toolData[dataKey];
    
    // 生成数据哈希，检查是否需要更新
    const dataHash = simpleHash(JSON.stringify({dates, values, currentRule}));
    if (lastRenderedDataHash[chartType] === dataHash && charts[chartType] && !charts[chartType].isDisposed()) {
        // 数据未变化，跳过渲染
        return;
    }
    lastRenderedDataHash[chartType] = dataHash;
    
    // 过滤有效数据用于统计
    const validValues = values.filter(v => v !== null && v !== undefined);
    
    // 更新统计卡片
    let unit = dataKey === 'runtimes' ? '秒' : (dataKey === 'memories' ? 'MB' : '核心');
    let label = dataKey === 'runtimes' ? 'Runtime' : (dataKey === 'memories' ? 'Memory' : 'CPU核心数');
    updateStats(`stats-${chartType}`, values, unit, label);
    
    // 计算平均值
    const avgValue = validValues.length > 0 
        ? (validValues.reduce((a, b) => a + b, 0) / validValues.length).toFixed(1)
        : 0;
    
    // 准备ECharts选项
    const option = {
        backgroundColor: 'transparent',
        tooltip: {
            trigger: 'axis',
            axisPointer: { type: 'shadow' },
            backgroundColor: 'rgba(15, 23, 42, 0.96)',
            borderColor: color,
            borderWidth: 1,
            textStyle: { color: '#f1f5f9', fontSize: 12, fontFamily: 'monospace' },
            formatter: function(params) {
                if (!params || params.length === 0) return '';
                const dataPoint = params[0];
                const value = dataPoint.value;
                const date = dataPoint.axisValue;
                let valueText = '';
                if (dataKey === 'runtimes') {
                    cpu = perf.cpu
                    des = cpu[date]
                    valueText = `${value} 秒`;
                } else if (dataKey === 'memories') {
                    mem = perf.mem
                    des = mem[date]
                    valueText = `${value} MB`;
                } else {
                    valueText = `${value} 核心`;
                }
                return `
                    <strong>📅 ${date}</strong><br/>
                    <span style="color: ${color};">${label}: ${valueText}</span><br/>
                    <span style="color: #94a3b8;">🔧 阶段: ${currentRule}</span><br/>
                    <span style="color: #94a3b8;">MR更新: ${des}</span>
                `;
            }
        },
        grid: {
            left: '8%',
            right: '5%',
            top: '15%',
            bottom: '10%',
            containLabel: true,
            backgroundColor: 'rgba(15, 23, 42, 0.3)',
            borderWidth: 0
        },
        xAxis: {
            type: 'category',
            data: dates,
            axisLabel: {
                rotate: dates.length > 10 ? 30 : 0,
                color: '#94a3b8',
                fontSize: 11,
                interval: Math.floor(dates.length / 10)
            },
            axisLine: { lineStyle: { color: '#475569' } },
            axisTick: { show: false }
        },
        yAxis: {
            type: 'value',
            name: yAxisName,
            nameTextStyle: { color: '#cbd5e1', fontSize: 12 },
            axisLabel: {
                color: '#94a3b8',
                fontSize: 11,
                formatter: yAxisFormatter
            },
            axisLine: { lineStyle: { color: '#475569' } },
            splitLine: { lineStyle: { color: 'rgba(71, 85, 105, 0.3)', type: 'dashed' } }
        },
        series: [
            {
                name: label,
                type: 'line',
                data: values,
                smooth: false,
                symbol: 'circle',
                symbolSize: 6,
                lineStyle: { width: 2, color: color, shadowBlur: 8, shadowColor: color },
                areaStyle: {
                    opacity: 0.15,
                    color: color
                },
                itemStyle: {
                    color: color,
                    borderColor: '#1e293b',
                    borderWidth: 1.5
                },
                emphasis: { focus: 'series' },
                connectNulls: false,
                animation: false  // 禁用动画提高性能
            },
            {
                name: '平均值',
                type: 'line',
                data: new Array(dates.length).fill(parseFloat(avgValue)),
                data: new Array(dates.length).fill(parseFloat(avgValue)),
                lineStyle: {
                    width: 1.5,
                    color: '#f59e0b',
                    type: 'dashed',
                    shadowBlur: 0
                },
                symbol: 'none',
                smooth: false,
                step: false,
                emphasis: { scale: false },
                tooltip: { show: false }
            }
        ],
        legend: {
            textStyle: { color: '#cbd5e1', fontSize: 11 },
            right: 10,
            top: 0,
            itemWidth: 25,
            itemHeight: 12
        },
        toolbox: {
            feature: {
                saveAsImage: { title: '保存为图片', backgroundColor: 'rgba(15, 23, 42, 0.8)' },
                zoom: { title: { zoom: '区域缩放', back: '还原' } }
            },
            iconStyle: { borderColor: '#94a3b8' },
            emphasis: { iconStyle: { borderColor: color } }
        }
    };
    
    // 使用notMerge: false进行增量更新
    if (charts[chartType] && !charts[chartType].isDisposed()) {
        charts[chartType].setOption(option, {
            notMerge: false,
            lazyUpdate: true
        });
    }
}

function refreshAllCharts() {
    if (!currentRule) {
        clearCharts();
        return;
    }
    
    // 使用requestAnimationFrame优化渲染时机
    requestAnimationFrame(() => {
        // Runtime图表
        renderEChartOptimized('runtime', 'runtimes', chartColors.runtime, 'Runtime (秒)');
        
        // Memory图表
        renderEChartOptimized('memory', 'memories', chartColors.memory, 'Memory (MB)', function(value) {
            if (value >= 1024) {
                return (value / 1024).toFixed(1) + ' GB';
            }
            return value + ' MB';
        });
        
        // Cores图表
        renderEChartOptimized('cores', 'cores', chartColors.cores, 'CPU核心数', function(value) {
            return value + ' 核';
        });
    });
}

function initCharts() {

    const runtimeChartDom = document.getElementById('chart-runtime');
    const memoryChartDom = document.getElementById('chart-memory');
    const coresChartDom = document.getElementById('chart-cores');

    if (runtimeChartDom && !charts.runtime) {
        charts.runtime = echarts.init(runtimeChartDom, null, {
            renderer: 'canvas',
            useDirtyRect: false
        });
    }
    if (memoryChartDom && !charts.memory) {
        charts.memory = echarts.init(memoryChartDom, null, {
            renderer: 'canvas',
            useDirtyRect: false
        });
    }
    if (coresChartDom && !charts.cores) {
        charts.cores = echarts.init(coresChartDom, null, {
            renderer: 'canvas',
            useDirtyRect: false
        });
    }
    
    // 窗口大小变化时调整图表
    const resizeHandler = debounce(() => {
        Object.values(charts).forEach(chart => {
            if (chart && !chart.isDisposed()) {
                chart.resize();
            }
        });
    }, 200);
    window.addEventListener('resize', resizeHandler);
}

function showNotification(message, isError = false) {
    const notification = document.createElement('div');
    notification.className = 'notification' + (isError ? ' error' : '');
    notification.innerHTML = isError ? '❌ ' + message : '✅ ' + message;
    document.body.appendChild(notification);
    setTimeout(() => {
        notification.style.animation = 'slideIn 0.3s ease reverse';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

async function refreshData() {
    const refreshBtn = document.getElementById('refreshBtn');
    const originalText = refreshBtn.innerHTML;
    refreshBtn.innerHTML = '<span class="spinner"></span> 刷新中...';
    refreshBtn.classList.add('loading');
    
    try {
        const response = await fetch('/api/refresh', { method: 'POST' });
        const result = await response.json();
        
        if (result.success) {
            // 更新数据
            Object.assign(projectsData, result.data);
            
            // 清空缓存
            cachedToolData = {};
            lastRenderedDataHash = {
                runtime: '',
                memory: '',
                cores: ''
            };
            
            document.getElementById('lastUpdateTime').innerHTML = `最后更新: ${result.last_update}`;
            
            if (result.project_list) {
                const caseSelect = document.getElementById('caseSelect');
                const currentProject = caseSelect.value;
                caseSelect.innerHTML = '';
                result.project_list.forEach(project => {
                    const option = document.createElement('option');
                    option.value = project.id;
                    option.textContent = project.name;
                    caseSelect.appendChild(option);
                });
                if (projectsData[currentProject]) {
                    caseSelect.value = currentProject;
                } else if (result.project_list.length > 0) {
                    caseSelect.value = result.project_list[0].id;
                    casename = result.project_list[0].id;
                }
                // const projectData = getCurrentProjectData();
                // if (projectData) {
                //     document.getElementById('projectDesc').innerText = projectData.description || '';
                //     document.getElementById('projectDesc').title = projectData.description || '';
                // }
            }
            
            updateRuleSelect();
            updateProjectStats();
            showNotification(`数据刷新成功！`);
        } else {
            throw new Error(result.message || '刷新失败');
        }
    } catch (error) {
        console.error('刷新数据失败:', error);
        showNotification(`刷新失败: ${error.message}`, true);
    } finally {
        refreshBtn.innerHTML = originalText;
        refreshBtn.classList.remove('loading');
    }
}

function updateProjectStats() {
    const projectData = getCurrentProjectData();
    if (!projectData) return;
    
    const rulesCount = projectData.rules.length;
    const datesCount = projectData.dates.length;
    
    // 计算平均Runtime（采样部分阶段以提高性能）
    let totalRuntime = 0;
    let runtimeCount = 0;
    const sampleSize = Math.min(50, rulesCount);
    const sampledRules = projectData.rules.slice(0, sampleSize);
    
    for (const rule of sampledRules) {
        const runtimes = projectData.rule_data[rule].runtimes.filter(v => v !== null);
        if (runtimes.length > 0) {
            totalRuntime += runtimes.reduce((a, b) => a + b, 0);
            runtimeCount += runtimes.length;
        }
    }
    const avgRuntime = runtimeCount > 0 ? (totalRuntime / runtimeCount).toFixed(0) : 0;
    
    document.getElementById('projectStats').innerHTML = `
        <div class="badge-item"><span>📊</span> 阶段数: ${rulesCount}</div>
        <div class="badge-item"><span>📅</span> 天数: ${datesCount}</div>
        <div class="badge-item"><span>⏱️</span> 平均Runtime: ${avgRuntime} min</div>
    `;
    document.getElementById('dateRange').innerText = projectData.dates[0] + ' 至 ' + projectData.dates[projectData.dates.length - 1];
    document.getElementById('dataPoints').innerText = projectData.dates.length;
}

function setupSearchListener() {
    const searchInput = document.getElementById('ruleSearch');
    const debouncedUpdate = debounce(() => {
        updateRuleSelect();
    }, 300);
    
    searchInput.addEventListener('input', debouncedUpdate);
}

function switchTab(tabId) {

    document.querySelectorAll('.tab-content').forEach(tab => tab.classList.add('hidden'));
    document.getElementById(`${tabId}-tab`).classList.remove('hidden');
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelector(`.tab-btn[data-tab="${tabId}"]`).classList.add('active');
    
    // 切换标签后重新调整图表大小
    setTimeout(() => {
        const chart = charts[tabId];
        if (chart && !chart.isDisposed()) {
            chart.resize();
        }
    }, 100);
}

// 事件监听
document.querySelectorAll('.tab-btn').forEach(btn => btn.addEventListener('click', () => switchTab(btn.dataset.tab)));
document.getElementById('caseSelect').addEventListener('change', (e) => {
    casename = e.target.value;
    currentRule = null;
 
    
    // 清空缓存
    cachedToolData = {};
    lastRenderedDataHash = {
        runtime: '',
        memory: '',
        cores: ''
    };

    updateRuleSelect();
    updateProjectStats();
    // const projectData = getCurrentProjectData();

    // document.getElementById('projectDesc').innerText = projectData.description || '';
    // document.getElementById('projectDesc').title = projectData.description || '';
});
document.getElementById('ruleSelect').addEventListener('change', (e) => {
    currentRule = e.target.value;
    if (currentRule) {
        document.getElementById('currentRuleName').innerText = currentRule;
        debouncedRenderCharts();
    } else {
        document.getElementById('currentRuleName').innerText = '未选择';
        clearCharts();
    }
});
document.getElementById('refreshBtn').addEventListener('click', () => refreshData());

// 初始化
initCharts();
setupSearchListener();
updateRuleSelect();
updateProjectStats();
getServerAddress();

// 延迟首次渲染
setTimeout(() => {
    if (currentRule) {
        refreshAllCharts();
    }
}, 200);

      
 
               
      
      