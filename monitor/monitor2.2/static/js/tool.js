// file: static/js/tool.js (更新版)
/**
 * EDA性能监控系统 - 主入口脚本
 * 负责初始化、事件绑定和视图切换
 */

// 全局变量
window.charts = {};

// ==================================================
// 图表初始化
// ==================================================

function initCharts() {
    if (typeof echarts === 'undefined') {
        console.error('ECharts library not loaded');
        return;
    }
    
    // 单线程曲线图图表
    const singleRuntimeDom = document.getElementById('single-chart-runtime');
    const singleMemoryDom = document.getElementById('single-chart-memory');
    if (singleRuntimeDom) {
        if (charts['single-runtime']) charts['single-runtime'].dispose();
        charts['single-runtime'] = echarts.init(singleRuntimeDom);
    }
    if (singleMemoryDom) {
        if (charts['single-memory']) charts['single-memory'].dispose();
        charts['single-memory'] = echarts.init(singleMemoryDom);
    }
    
    // 多线程曲线图图表
    const multiThreadRuntimeDom = document.getElementById('multi-thread-chart-runtime');
    const multiThreadMemoryDom = document.getElementById('multi-thread-chart-memory');
    if (multiThreadRuntimeDom) {
        if (charts['multi-thread-runtime']) charts['multi-thread-runtime'].dispose();
        charts['multi-thread-runtime'] = echarts.init(multiThreadRuntimeDom);
    }
    if (multiThreadMemoryDom) {
        if (charts['multi-thread-memory']) charts['multi-thread-memory'].dispose();
        charts['multi-thread-memory'] = echarts.init(multiThreadMemoryDom);
    }
    
    // 线程曲线图图表（原多线程对比）
    const threadCompareRuntimeDom = document.getElementById('thread-compare-chart-runtime');
    const threadCompareMemoryDom = document.getElementById('thread-compare-chart-memory');
    if (threadCompareRuntimeDom) {
        if (charts['thread-compare-runtime']) charts['thread-compare-runtime'].dispose();
        charts['thread-compare-runtime'] = echarts.init(threadCompareRuntimeDom);
    }
    if (threadCompareMemoryDom) {
        if (charts['thread-compare-memory']) charts['thread-compare-memory'].dispose();
        charts['thread-compare-memory'] = echarts.init(threadCompareMemoryDom);
    }
}

function resizeAllCharts() {
    Object.values(charts).forEach(chart => {
        if (chart && typeof chart.resize === 'function') {
            chart.resize();
        }
    });
    if (typeof ChartManager !== 'undefined' && ChartManager.resizeAll) {
        ChartManager.resizeAll();
    }
}

window.addEventListener('resize', debounce(() => {
    requestAnimationFrame(resizeAllCharts);
}, 150));

// ==================================================
// 工具函数
// ==================================================

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
        timeout = setTimeout(later, wait);
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
            const mrUpdateDates = buildMrUpdateMap(result.perf);
            
            // 更新各模块的MR更新映射
            singleThreadState.mrUpdateDates = mrUpdateDates;
            multiThreadState.mrUpdateDates = mrUpdateDates;
            threadCompareState.mrUpdateDates = mrUpdateDates;
            
            // 清空缓存
            singleThreadState.cachedToolData = {};
            multiThreadState.cachedToolData = {};
            threadCompareState.cachedToolData = {};
            
            // 更新项目选择框
            if (result.project_list?.length) {
                const projectListHtml = result.project_list.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
                
                // 单线程项目选择
                const singleCaseSelect = document.getElementById('singleCaseSelect');
                const singleCurrentVal = singleCaseSelect?.value;
                if (singleCaseSelect) {
                    singleCaseSelect.innerHTML = projectListHtml;
                    if (result.project_list.some(p => p.id === singleCurrentVal)) singleCaseSelect.value = singleCurrentVal;
                }
                
                // 多线程项目选择
                const multiThreadCaseSelect = document.getElementById('multiThreadCaseSelect');
                const multiThreadCurrentVal = multiThreadCaseSelect?.value;
                if (multiThreadCaseSelect) {
                    multiThreadCaseSelect.innerHTML = projectListHtml;
                    if (result.project_list.some(p => p.id === multiThreadCurrentVal)) multiThreadCaseSelect.value = multiThreadCurrentVal;
                }
                
                // 线程曲线图项目选择
                const threadCompareCaseSelect = document.getElementById('threadCompareCaseSelect');
                const threadCompareCurrentVal = threadCompareCaseSelect?.value;
                if (threadCompareCaseSelect) {
                    threadCompareCaseSelect.innerHTML = projectListHtml;
                    if (result.project_list.some(p => p.id === threadCompareCurrentVal)) threadCompareCaseSelect.value = threadCompareCurrentVal;
                }
                
                // 对比模块项目选择
                const compareCaseSelect = document.getElementById('compareCaseSelect');
                const oldCompareValue = compareCaseSelect?.value;
                if (compareCaseSelect) {
                    compareCaseSelect.innerHTML = '<option value="">-- 请选择case --</option>' + projectListHtml;
                    if (oldCompareValue && result.project_list.some(p => p.id === oldCompareValue)) {
                        compareCaseSelect.value = oldCompareValue;
                    } else if (result.project_list.length > 0) {
                        compareCaseSelect.value = result.project_list[0].id;
                    }
                    if (compareCaseSelect.value) await onCompareProjectChange(compareCaseSelect.value);
                    else updateCompareControlsState(false);
                }
            }
            
            // 刷新各模块
            if (singleThreadState.currentProjectId && projectsData[singleThreadState.currentProjectId]) {
                updateSingleThreadRuleSelect();
                updateSingleProjectStats();
                updateSingleThreadDateInfo();
                refreshSingleThreadCharts();
            } else if (result.project_list && result.project_list.length > 0 && !singleThreadState.currentProjectId) {
                singleThreadState.currentProjectId = result.project_list[0].id;
                updateSingleThreadRuleSelect();
                updateSingleProjectStats();
                updateSingleThreadDateInfo();
                refreshSingleThreadCharts();
            }
            
            if (multiThreadState.currentProjectId && projectsData[multiThreadState.currentProjectId]) {
                updateMultiThreadRuleSelect();
                updateMultiThreadProjectStats();
                updateMultiThreadDateInfo();
                refreshMultiThreadCharts();
            } else if (result.project_list && result.project_list.length > 0 && !multiThreadState.currentProjectId) {
                multiThreadState.currentProjectId = result.project_list[0].id;
                updateMultiThreadRuleSelect();
                updateMultiThreadProjectStats();
                updateMultiThreadDateInfo();
                refreshMultiThreadCharts();
            }
            
            if (threadCompareState.currentProjectId && projectsData[threadCompareState.currentProjectId]) {
                await loadThreadCompareRules(threadCompareState.currentProjectId);
            } else if (result.project_list && result.project_list.length > 0 && !threadCompareState.currentProjectId) {
                threadCompareState.currentProjectId = result.project_list[0].id;
                await loadThreadCompareRules(threadCompareState.currentProjectId);
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
                const mrUpdateDates = buildMrUpdateMap(result.perf);
                
                singleThreadState.mrUpdateDates = mrUpdateDates;
                multiThreadState.mrUpdateDates = mrUpdateDates;
                threadCompareState.mrUpdateDates = mrUpdateDates;
                
                singleThreadState.cachedToolData = {};
                multiThreadState.cachedToolData = {};
                threadCompareState.cachedToolData = {};
                
                if (result.project_list && result.project_list.length) {
                    const projectListHtml = result.project_list.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
                    
                    const singleCaseSelect = document.getElementById('singleCaseSelect');
                    const singleCurrentVal = singleCaseSelect?.value;
                    if (singleCaseSelect) {
                        singleCaseSelect.innerHTML = projectListHtml;
                        if (result.project_list.some(p => p.id === singleCurrentVal)) singleCaseSelect.value = singleCurrentVal;
                        else if (result.project_list.length > 0 && !singleCaseSelect.value) singleCaseSelect.value = result.project_list[0].id;
                    }
                    
                    const multiThreadCaseSelect = document.getElementById('multiThreadCaseSelect');
                    const multiThreadCurrentVal = multiThreadCaseSelect?.value;
                    if (multiThreadCaseSelect) {
                        multiThreadCaseSelect.innerHTML = projectListHtml;
                        if (result.project_list.some(p => p.id === multiThreadCurrentVal)) multiThreadCaseSelect.value = multiThreadCurrentVal;
                        else if (result.project_list.length > 0 && !multiThreadCaseSelect.value) multiThreadCaseSelect.value = result.project_list[0].id;
                    }
                    
                    const threadCompareCaseSelect = document.getElementById('threadCompareCaseSelect');
                    const threadCompareCurrentVal = threadCompareCaseSelect?.value;
                    if (threadCompareCaseSelect) {
                        threadCompareCaseSelect.innerHTML = projectListHtml;
                        if (result.project_list.some(p => p.id === threadCompareCurrentVal)) threadCompareCaseSelect.value = threadCompareCurrentVal;
                        else if (result.project_list.length > 0 && !threadCompareCaseSelect.value) threadCompareCaseSelect.value = result.project_list[0].id;
                    }
                    
                    const compareCaseSelect = document.getElementById('compareCaseSelect');
                    const oldCompareValue = compareCaseSelect?.value;
                    if (compareCaseSelect) {
                        compareCaseSelect.innerHTML = '<option value="">-- 请选择case --</option>' + projectListHtml;
                        if (oldCompareValue && result.project_list.some(p => p.id === oldCompareValue)) {
                            compareCaseSelect.value = oldCompareValue;
                        } else if (result.project_list.length > 0) {
                            compareCaseSelect.value = result.project_list[0].id;
                        }
                        if (compareCaseSelect.value) await onCompareProjectChange(compareCaseSelect.value);
                        else updateCompareControlsState(false);
                    }
                }
                
                if (singleThreadState.currentProjectId && projectsData[singleThreadState.currentProjectId]) {
                    updateSingleThreadRuleSelect();
                    updateSingleProjectStats();
                    updateSingleThreadDateInfo();
                    refreshSingleThreadCharts();
                } else if (result.project_list && result.project_list.length > 0 && !singleThreadState.currentProjectId) {
                    singleThreadState.currentProjectId = result.project_list[0].id;
                    updateSingleThreadRuleSelect();
                    updateSingleProjectStats();
                    updateSingleThreadDateInfo();
                    refreshSingleThreadCharts();
                }
                
                if (multiThreadState.currentProjectId && projectsData[multiThreadState.currentProjectId]) {
                    updateMultiThreadRuleSelect();
                    updateMultiThreadProjectStats();
                    updateMultiThreadDateInfo();
                    refreshMultiThreadCharts();
                } else if (result.project_list && result.project_list.length > 0 && !multiThreadState.currentProjectId) {
                    multiThreadState.currentProjectId = result.project_list[0].id;
                    updateMultiThreadRuleSelect();
                    updateMultiThreadProjectStats();
                    updateMultiThreadDateInfo();
                    refreshMultiThreadCharts();
                }
                
                if (threadCompareState.currentProjectId && projectsData[threadCompareState.currentProjectId]) {
                    await loadThreadCompareRules(threadCompareState.currentProjectId);
                } else if (result.project_list && result.project_list.length > 0 && !threadCompareState.currentProjectId) {
                    threadCompareState.currentProjectId = result.project_list[0].id;
                    await loadThreadCompareRules(threadCompareState.currentProjectId);
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
        const mrUpdateDates = buildMrUpdateMap(perf);
        singleThreadState.mrUpdateDates = mrUpdateDates;
        multiThreadState.mrUpdateDates = mrUpdateDates;
        threadCompareState.mrUpdateDates = mrUpdateDates;
        
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
    
    // 延迟执行，等待 CSS 过渡完成
    setTimeout(() => {
        requestAnimationFrame(resizeAllCharts);
    }, 50);
    
    // 视图切换后的特定逻辑
    if (viewId === 'single-thread') {
        setTimeout(() => {
            if (typeof refreshSingleThreadCharts === 'function' && singleThreadState.currentRule) {
                refreshSingleThreadCharts();
            }
            requestAnimationFrame(() => {
                if (charts['single-runtime'] && !charts['single-runtime'].isDisposed()) charts['single-runtime'].resize();
                if (charts['single-memory'] && !charts['single-memory'].isDisposed()) charts['single-memory'].resize();
            });
        }, 100);
    } else if (viewId === 'multi-thread') {
        setTimeout(() => {
            if (typeof refreshMultiThreadCharts === 'function' && multiThreadState.currentRule) {
                refreshMultiThreadCharts();
            }
            requestAnimationFrame(() => {
                if (charts['multi-thread-runtime'] && !charts['multi-thread-runtime'].isDisposed()) charts['multi-thread-runtime'].resize();
                if (charts['multi-thread-memory'] && !charts['multi-thread-memory'].isDisposed()) charts['multi-thread-memory'].resize();
            });
        }, 100);
    } else if (viewId === 'thread-compare') {
        setTimeout(() => {
            if (threadCompareState.currentData && threadCompareState.currentData.length > 0) {
                if (Array.isArray(threadCompareState.currentData) && threadCompareState.currentData[0]?.date) {
                    renderThreadCompareComparisonChart();
                } else {
                    renderThreadCompareChart();
                }
            }
            requestAnimationFrame(() => {
                if (charts['thread-compare-runtime'] && !charts['thread-compare-runtime'].isDisposed()) charts['thread-compare-runtime'].resize();
                if (charts['thread-compare-memory'] && !charts['thread-compare-memory'].isDisposed()) charts['thread-compare-memory'].resize();
            });
        }, 100);
    } else if (viewId === 'compare') {
        // 对比视图无需额外处理
    } else if (viewId === 'custom') {
        setTimeout(() => { 
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
            
            if (typeof refreshCustomCharts === 'function') {
                if (customState && customState.currentProjectId && customState.currentRule) {
                    refreshCustomCharts();
                } else if (customState && customState.availableDates && customState.availableDates.length > 0) {
                    if (typeof updateCustomRuleSelect === 'function') {
                        updateCustomRuleSelect();
                    }
                    if (customState.selectedDates.length === 0 && customState.availableDates.length > 0) {
                        customState.selectedDates = customState.availableDates.slice(-51);
                        if (typeof updateCustomDateInfo === 'function') updateCustomDateInfo();
                    }
                }
            }
            
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
    
    // 各模块事件绑定
    bindSingleThreadEvents();
    bindMultiThreadChartEvents();
    bindThreadCompareEvents();
    bindCompareEvents();
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
    
    // 初始化单线程曲线图
    const singleCaseSelect = document.getElementById('singleCaseSelect');
    if (singleCaseSelect && singleCaseSelect.options.length > 0) {
        singleThreadState.currentProjectId = singleCaseSelect.value;
        updateSingleThreadRuleSelect();
        updateSingleProjectStats();
        updateSingleThreadDateInfo();
        updateSingleChartTypeButtons();
    }
    
    // 初始化多线程曲线图
    const multiThreadCaseSelect = document.getElementById('multiThreadCaseSelect');
    if (multiThreadCaseSelect && multiThreadCaseSelect.options.length > 0) {
        multiThreadState.currentProjectId = multiThreadCaseSelect.value;
        updateMultiThreadRuleSelect();
        updateMultiThreadProjectStats();
        updateMultiThreadDateInfo();
        updateMultiThreadChartTypeButtons();
    }
    
    // 初始化线程曲线图
    const threadCompareCaseSelect = document.getElementById('threadCompareCaseSelect');
    if (threadCompareCaseSelect && threadCompareCaseSelect.options.length > 0) {
        threadCompareState.currentProjectId = threadCompareCaseSelect.value;
        await loadThreadCompareRules(threadCompareState.currentProjectId);
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
    if (initialMode === 'multi') switchView('thread-compare');
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
    updateMultiThreadChartTypeButtons();
    updateThreadCompareChartTypeButtons();
}

// 启动
init();