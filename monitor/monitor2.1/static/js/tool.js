/**
 * EDA性能监控系统 - 主入口脚本
 * 负责初始化、事件绑定和视图切换
 */


// ==================================================
// 工具函数
// ==================================================
window.charts = {};

function resizeAllCharts() {
    if (window.charts) {
        Object.values(window.charts).forEach(chart => {
            if (chart && typeof chart.resize === 'function') {
                chart.resize();
            }
        });
    }
    if (window.customCharts) {
        Object.values(window.customCharts).forEach(chart => {
            if (chart && typeof chart.resize === 'function') {
                chart.resize();
            }
        });
    }
    if (typeof ChartManager !== 'undefined' && ChartManager.resizeAll) {
        ChartManager.resizeAll();
    }
}

window.addEventListener('resize', debounce(() => {
    requestAnimationFrame(resizeAllCharts);
}, 150));

function showLoading(show) {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) {
        overlay.classList.toggle('hidden', !show);
    }
}

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        later();
    };
}

function formatDateTime(date) {
    if (!date) date = new Date();
    return date.toLocaleString('zh-CN');
}

function getDateRangeText(dates) {
    if (!dates || dates.length === 0) return '无';
    return `${dates[0]} 至 ${dates[dates.length - 1]}`;
}

function updateLastUpdateTime() {
    const now = new Date();
    const timeStr = now.toLocaleString('zh-CN');
    const lastUpdateText = document.getElementById('lastUpdateText');
    if (lastUpdateText) {
        lastUpdateText.innerHTML = `最后更新: ${timeStr}`;
    }
    const statusDot = document.getElementById('statusDot');
    if (statusDot) {
        statusDot.classList.add('updating');
        setTimeout(() => statusDot.classList.remove('updating'), 1000);
    }
}

function buildMrUpdateMap(perfData) {
    const mrMap = {};
    if (perfData && perfData.cpu) {
        Object.keys(perfData.cpu).forEach(date => {
            const comment = perfData.cpu[date];
            if (comment && comment !== 'undefined' && comment !== '' && comment !== 'None') {
                mrMap[date] = comment;
            }
        });
    }
    if (perfData && perfData.mem) {
        Object.keys(perfData.mem).forEach(date => {
            const comment = perfData.mem[date];
            if (comment && comment !== 'undefined' && comment !== '' && comment !== 'None') {
                if (!mrMap[date]) mrMap[date] = '';
                mrMap[date] += (mrMap[date] ? ' | ' : '') + comment;
            }
        });
    }
    return mrMap;
}

function isBrowserRefresh() {
    if (performance && performance.getEntriesByType) {
        const navigationEntries = performance.getEntriesByType('navigation');
        if (navigationEntries.length > 0 && navigationEntries[0].type === 'reload') return true;
    }
    if (performance && performance.navigation && performance.navigation.type === performance.navigation.TYPE_RELOAD) return true;
    const isInitialLoad = sessionStorage.getItem(`page_loaded_${toolId}`);
    if (!isInitialLoad) { 
        sessionStorage.setItem(`page_loaded_${toolId}`, 'true'); 
        return false; 
    }
    return true;
}

// ==================================================
// 刷新数据
// ==================================================

async function refreshAllData() {
    showLoading(true);
    try {
        const response = await fetch('/api/refresh', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tool: toolId, mode: 'single' })
        });
        const result = await response.json();
        
        if (result.success) {
            Object.assign(projectsData, result.data);
            timelineState.mrUpdateDates = buildMrUpdateMap(result.perf);
            timelineState.cachedToolData = {};
            
            // 更新项目选择框
            if (result.project_list?.length) {
                const caseSelect = document.getElementById('caseSelect');
                const currentVal = caseSelect?.value;
                if (caseSelect) {
                    caseSelect.innerHTML = result.project_list.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
                    if (result.project_list.some(p => p.id === currentVal)) caseSelect.value = currentVal;
                }
                
                const multiCaseSelect = document.getElementById('multiCaseSelect');
                if (multiCaseSelect) {
                    multiCaseSelect.innerHTML = result.project_list.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
                    if (result.project_list.some(p => p.id === currentVal)) multiCaseSelect.value = currentVal;
                }
                
                const compareCaseSelect = document.getElementById('compareCaseSelect');
                const oldCompareValue = compareCaseSelect?.value;
                if (compareCaseSelect) {
                    compareCaseSelect.innerHTML = '<option value="">-- 请选择case --</option>' + 
                        result.project_list.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
                    if (oldCompareValue && result.project_list.some(p => p.id === oldCompareValue)) {
                        compareCaseSelect.value = oldCompareValue;
                    } else if (result.project_list.length > 0) {
                        compareCaseSelect.value = result.project_list[0].id;
                    }
                    if (compareCaseSelect.value) await onCompareProjectChange(compareCaseSelect.value);
                    else updateCompareControlsState(false);
                }
            }
            
            // 刷新时序图
            if (timelineState.currentProjectId && projectsData[timelineState.currentProjectId]) {
                updateTimelineRuleSelect();
                updateTimelineProjectStats();
                updateTimelineDateInfo();
                refreshTimelineCharts();
            } else if (result.project_list && result.project_list.length > 0 && !timelineState.currentProjectId) {
                timelineState.currentProjectId = result.project_list[0].id;
                updateTimelineRuleSelect();
                updateTimelineProjectStats();
                updateTimelineDateInfo();
                refreshTimelineCharts();
            }
            
            updateLastUpdateTime();
            showNotification('数据刷新成功');
        } else {
            throw new Error(result.message || '刷新失败');
        }
    } catch (error) {
        console.error('刷新失败:', error);
        showNotification('刷新失败: ' + error.message, true);
    } finally {
        showLoading(false);
    }
}

async function autoRefreshOnLoad() {
    const isRefresh = isBrowserRefresh();
    if (isRefresh) {
        console.log('检测到浏览器刷新，正在更新数据...');
        showNotification('检测到页面刷新，正在获取最新数据...');
        try {
            const response = await fetch('/api/refresh', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tool: toolId, mode: 'single' })
            });
            const result = await response.json();
            if (result.success) {
                Object.keys(projectsData).forEach(key => delete projectsData[key]);
                Object.assign(projectsData, result.data);
                timelineState.mrUpdateDates = buildMrUpdateMap(result.perf);
                timelineState.cachedToolData = {};
                
                if (result.project_list && result.project_list.length) {
                    const caseSelect = document.getElementById('caseSelect');
                    const currentVal = caseSelect?.value;
                    if (caseSelect) {
                        caseSelect.innerHTML = result.project_list.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
                        if (result.project_list.some(p => p.id === currentVal)) caseSelect.value = currentVal;
                        else if (result.project_list.length > 0 && !caseSelect.value) caseSelect.value = result.project_list[0].id;
                    }
                    
                    const multiCaseSelect = document.getElementById('multiCaseSelect');
                    if (multiCaseSelect) {
                        multiCaseSelect.innerHTML = result.project_list.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
                        if (result.project_list.some(p => p.id === currentVal)) multiCaseSelect.value = currentVal;
                        else if (result.project_list.length > 0 && !multiCaseSelect.value) multiCaseSelect.value = result.project_list[0].id;
                    }
                    
                    const compareCaseSelect = document.getElementById('compareCaseSelect');
                    const oldCompareValue = compareCaseSelect?.value;
                    if (compareCaseSelect) {
                        compareCaseSelect.innerHTML = '<option value="">-- 请选择case --</option>' + 
                            result.project_list.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
                        if (oldCompareValue && result.project_list.some(p => p.id === oldCompareValue)) {
                            compareCaseSelect.value = oldCompareValue;
                        } else if (result.project_list.length > 0) {
                            compareCaseSelect.value = result.project_list[0].id;
                        }
                        if (compareCaseSelect.value) await onCompareProjectChange(compareCaseSelect.value);
                        else updateCompareControlsState(false);
                    }
                }
                
                if (timelineState.currentProjectId && projectsData[timelineState.currentProjectId]) {
                    updateTimelineRuleSelect();
                    updateTimelineProjectStats();
                    updateTimelineDateInfo();
                    refreshTimelineCharts();
                } else if (result.project_list && result.project_list.length > 0 && !timelineState.currentProjectId) {
                    timelineState.currentProjectId = result.project_list[0].id;
                    updateTimelineRuleSelect();
                    updateTimelineProjectStats();
                    updateTimelineDateInfo();
                    refreshTimelineCharts();
                }
                
                updateLastUpdateTime();
                showNotification('数据已更新到最新版本');
            } else {
                console.warn('刷新失败:', result.message);
                showNotification('数据更新失败，使用缓存数据', true);
            }
        } catch (error) {
            console.error('自动刷新失败:', error);
            showNotification('自动刷新失败，使用缓存数据', true);
        }
    } else {
        console.log('正常页面加载，使用服务端数据');
        timelineState.mrUpdateDates = buildMrUpdateMap(perf);
        const compareSelect = document.getElementById('compareCaseSelect');
        if (compareSelect && compareSelect.options.length > 0) {
            if (compareSelect.value) await onCompareProjectChange(compareSelect.value);
            else updateCompareControlsState(false);
        } else {
            updateCompareControlsState(false);
        }
    }
}

// ==================================================
// 视图切换
// ==================================================

// 在 tool.js 中替换 switchView 函数

function switchView(viewId) {
    const containers = document.querySelectorAll('.view-container');
    containers.forEach(view => view.classList.remove('active'));
    const targetView = document.getElementById(`${viewId}View`);
    if (targetView) targetView.classList.add('active');
    
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
        item.classList.remove('active');
        if (item.dataset.view === viewId) item.classList.add('active');
    });
    
    // 使用 requestAnimationFrame 确保 DOM 更新完成后再 resize
    const resizeAllCharts = () => {
        // 重新调整所有已存在图表的大小
        if (charts.runtime && !charts.runtime.isDisposed()) charts.runtime.resize();
        if (charts.memory && !charts.memory.isDisposed()) charts.memory.resize();
        if (charts.multiRuntime && !charts.multiRuntime.isDisposed()) charts.multiRuntime.resize();
        if (charts.multiMemory && !charts.multiMemory.isDisposed()) charts.multiMemory.resize();
        if (customCharts && customCharts.runtime && !customCharts.runtime.isDisposed()) customCharts.runtime.resize();
        if (customCharts && customCharts.memory && !customCharts.memory.isDisposed()) customCharts.memory.resize();
        
        // 使用安全调用方式
        if (typeof ChartManager !== 'undefined' && ChartManager.resizeAll) {
            ChartManager.resizeAll();
        }
    };
    
    // 延迟执行，等待 CSS 过渡/动画完成
    setTimeout(() => {
        requestAnimationFrame(resizeAllCharts);
    }, 50);
    
    // 视图切换后的特定逻辑
    if (viewId === 'multithread') {
        setTimeout(() => {
        // 先确保容器可见并调整尺寸
        const multiRuntimeContainer = document.getElementById('chart-multi-runtime');
        const multiMemoryContainer = document.getElementById('chart-multi-memory');
        
        if (multiRuntimeContainer && multiRuntimeContainer.offsetWidth > 0) {
            if (charts.multiRuntime && !charts.multiRuntime.isDisposed()) {
                charts.multiRuntime.resize();
            }
        }
        if (multiMemoryContainer && multiMemoryContainer.offsetWidth > 0) {
            if (charts.multiMemory && !charts.multiMemory.isDisposed()) {
                charts.multiMemory.resize();
            }
        }
        
        // 重新渲染数据
        if (multiState.currentData && multiState.currentData.length > 0) {
            if (Array.isArray(multiState.currentData) && multiState.currentData[0]?.date) {
                renderMultiThreadComparisonChart();
            } else {
                renderMultiThreadChart();
            }
        }
        
        // 再次确保图表尺寸正确
        requestAnimationFrame(() => {
            if (charts.multiRuntime && !charts.multiRuntime.isDisposed()) charts.multiRuntime.resize();
            if (charts.multiMemory && !charts.multiMemory.isDisposed()) charts.multiMemory.resize();
        });
    }, 100);
    } else if (viewId === 'timeline') {
        setTimeout(() => { 
            if (typeof refreshTimelineCharts === 'function' && timelineState.currentRule) {
                refreshTimelineCharts();
            }
            requestAnimationFrame(() => {
                if (charts.runtime && !charts.runtime.isDisposed()) charts.runtime.resize();
                if (charts.memory && !charts.memory.isDisposed()) charts.memory.resize();
            });
        }, 100);
    } else if (viewId === 'custom') {
        setTimeout(() => { 
        // 先确保容器可见并调整尺寸
        const customRuntimeContainer = document.getElementById('custom-chart-runtime');
        const customMemoryContainer = document.getElementById('custom-chart-memory');
        
        if (customRuntimeContainer && customRuntimeContainer.offsetWidth > 0) {
            if (customCharts.runtime && !customCharts.runtime.isDisposed()) {
                customCharts.runtime.resize();
            }
        }
        if (customMemoryContainer && customMemoryContainer.offsetWidth > 0) {
            if (customCharts.memory && !customCharts.memory.isDisposed()) {
                customCharts.memory.resize();
            }
        }
        
        // 重新渲染数据
        if (typeof refreshCustomCharts === 'function') {
            if (customState && customState.currentProjectId && customState.currentRule) {
                refreshCustomCharts();
            } else if (customState && customState.availableDates && customState.availableDates.length > 0) {
                // 如果有可用日期但未选择阶段，先更新阶段选择
                if (typeof updateCustomRuleSelect === 'function') {
                    updateCustomRuleSelect();
                }
                if (customState.selectedDates.length === 0 && customState.availableDates.length > 0) {
                    customState.selectedDates = customState.availableDates.slice(-51);
                    if (typeof updateCustomDateInfo === 'function') updateCustomDateInfo();
                }
            }
        }
        
        // 再次确保图表尺寸正确
        requestAnimationFrame(() => {
            if (customCharts && customCharts.runtime && !customCharts.runtime.isDisposed()) customCharts.runtime.resize();
            if (customCharts && customCharts.memory && !customCharts.memory.isDisposed()) customCharts.memory.resize();
        });
    }, 150);
    }
}

function backToHome() { 
    window.location.href = '/'; 
}

// ==================================================
// 项目数据解析
// ==================================================

window.parseProjectData = function(projectData, projectId) {
    if (projectData.rule_data) return projectData;
    
    const dailyMetrics = projectData.daily_metrics || projectData;
    const allRules = new Set();
    const dates = Object.keys(dailyMetrics).sort();
    const availableDates = projectData.available_dates || dates.slice();
    
    Object.values(dailyMetrics).forEach(dayData => {
        Object.keys(dayData).forEach(rule => allRules.add(rule));
    });
    
    const ruleData = {};
    const rulesList = Array.from(allRules).sort();
    
    rulesList.forEach(rule => {
        const ruleInfo = {
            dates: [],
            runtimes: [],
            memories: [],
            cores: [],
            thread_metrics: {}
        };
        
        dates.forEach((date, idx) => {
            ruleInfo.dates.push(date);
            const dayData = dailyMetrics[date] || {};
            const ruleMetrics = dayData[rule] || {};
            
            if (ruleMetrics.thread_metrics) {
                Object.entries(ruleMetrics.thread_metrics).forEach(([tid, metrics]) => {
                    if (!ruleInfo.thread_metrics[tid]) {
                        ruleInfo.thread_metrics[tid] = { runtimes: [], memories: [], cores: [] };
                    }
                    while (ruleInfo.thread_metrics[tid].runtimes.length <= idx) {
                        ruleInfo.thread_metrics[tid].runtimes.push(null);
                        ruleInfo.thread_metrics[tid].memories.push(null);
                        ruleInfo.thread_metrics[tid].cores.push(null);
                    }
                    ruleInfo.thread_metrics[tid].runtimes[idx] = metrics.runtime;
                    ruleInfo.thread_metrics[tid].memories[idx] = metrics.memory;
                    ruleInfo.thread_metrics[tid].cores[idx] = metrics.cores;
                });
            } else {
                if (!ruleInfo.thread_metrics['0']) {
                    ruleInfo.thread_metrics['0'] = { runtimes: [], memories: [], cores: [] };
                }
                while (ruleInfo.thread_metrics['0'].runtimes.length <= idx) {
                    ruleInfo.thread_metrics['0'].runtimes.push(null);
                    ruleInfo.thread_metrics['0'].memories.push(null);
                    ruleInfo.thread_metrics['0'].cores.push(null);
                }
                ruleInfo.thread_metrics['0'].runtimes[idx] = ruleMetrics.runtime;
                ruleInfo.thread_metrics['0'].memories[idx] = ruleMetrics.memory;
                ruleInfo.thread_metrics['0'].cores[idx] = ruleMetrics.cores;
            }
        });
        
        // 设置默认线程（线程0）
        if (ruleInfo.thread_metrics['0']) {
            ruleInfo.runtimes = ruleInfo.thread_metrics['0'].runtimes;
            ruleInfo.memories = ruleInfo.thread_metrics['0'].memories;
            ruleInfo.cores = ruleInfo.thread_metrics['0'].cores;
        }
        
        ruleData[rule] = ruleInfo;
    });
    
    return {
        dates: dates,
        available_dates: availableDates,
        rules: rulesList,
        rule_data: ruleData,
        project_name: projectData.project_name || projectId,
        description: projectData.description || ''
    };
};

// ==================================================
// 图表初始化
// ==================================================

function initCharts() {
    if (typeof echarts === 'undefined') {
        console.error('ECharts library not loaded');
        return;
    }
    
    const runtimeDom = document.getElementById('chart-runtime');
    const memoryDom = document.getElementById('chart-memory');
    
    if (runtimeDom) {
        if (charts.runtime) charts.runtime.dispose();
        charts.runtime = echarts.init(runtimeDom);
    }
    if (memoryDom) {
        if (charts.memory) charts.memory.dispose();
        charts.memory = echarts.init(memoryDom);
    }
    
    // 初始化多线程图表
    const multiRuntimeDom = document.getElementById('chart-multi-runtime');
    const multiMemoryDom = document.getElementById('chart-multi-memory');
    
    if (multiRuntimeDom) {
        if (charts.multiRuntime) charts.multiRuntime.dispose();
        charts.multiRuntime = echarts.init(multiRuntimeDom);
    }
    if (multiMemoryDom) {
        if (charts.multiMemory) charts.multiMemory.dispose();
        charts.multiMemory = echarts.init(multiMemoryDom);
    }
}

// ==================================================
// 事件绑定
// ==================================================

function bindEvents() {
    // 导航
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
        item.addEventListener('click', () => switchView(item.dataset.view));
    });
    
    // 返回首页
    const backToHomeBtn = document.getElementById('backToHomeBtn');
    if (backToHomeBtn) backToHomeBtn.addEventListener('click', backToHome);
    
    // 刷新按钮
    const refreshBtn = document.getElementById('refreshDataBtn');
    if (refreshBtn) refreshBtn.addEventListener('click', refreshAllData);
    
    // 时序图事件
    bindTimelineEvents();
    
    // 多线程事件
    bindMultiThreadEvents();
    
    // 对比事件
    bindCompareEvents();
    
    // 自定义图表事件
    bindCustomChartEvents();
}

// ==================================================
// 初始化
// ==================================================

async function init() {
    initCharts();
    initCustomCharts();
    bindEvents();
    
    if (typeof preloadDefaultDataForCustom === 'function') {
        await preloadDefaultDataForCustom();
    }

    await autoRefreshOnLoad();
    
    // 初始化时序图
    const caseSelect = document.getElementById('caseSelect');
    if (caseSelect && caseSelect.options.length > 0) {
        timelineState.currentProjectId = caseSelect.value;
        updateTimelineRuleSelect();
        updateTimelineProjectStats();
        updateTimelineDateInfo();
        updateTimelineChartTypeButtons();
    }
    
    // 初始化多线程
    const multiCaseSelect = document.getElementById('multiCaseSelect');
    if (multiCaseSelect && multiCaseSelect.options.length > 0) {
        multiState.currentProjectId = multiCaseSelect.value;
        await loadMultiRules(multiState.currentProjectId);
    }
    
    // 初始化对比模块
    const compareSelect = document.getElementById('compareCaseSelect');
    if (compareSelect && compareSelect.options.length > 0) {
        if (!compareSelect.value && compareSelect.options.length > 0) {
            compareSelect.value = compareSelect.options[0]?.value || '';
        }
        if (compareSelect.value) await onCompareProjectChange(compareSelect.value);
        else updateCompareControlsState(false);
    } else {
        updateCompareControlsState(false);
    }
    
    // 禁用自定义图表控件直到数据加载
    const customRuleSelect = document.getElementById('customRuleSelect');
    const customRuleSearch = document.getElementById('customRuleSearch');
    const customOpenDatePicker = document.getElementById('customOpenDatePickerBtn');
    const customSelectRecent = document.getElementById('customSelectRecentBtn');
    if (customRuleSelect) customRuleSelect.disabled = true;
    if (customRuleSearch) customRuleSearch.disabled = true;
    if (customOpenDatePicker) customOpenDatePicker.disabled = true;
    if (customSelectRecent) customSelectRecent.disabled = true;
    
    // 设置默认视图
    if (initialMode === 'multi') switchView('multithread');
    else if (initialMode === 'compare') switchView('compare');
    else if (initialMode === 'custom') switchView('custom');
    
    // 定期检查更新
    setInterval(() => {
        fetch('/api/check_update', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tool: toolId, mode: 'single' })
        }).then(res => res.json()).then(result => { 
            if (result.has_update) showNotification('发现新数据，点击刷新按钮更新'); 
        }).catch(() => {});
    }, 30000);
    
    updateLastUpdateTime();
    updateMultiChartTypeButtons();
}

// 启动
init();