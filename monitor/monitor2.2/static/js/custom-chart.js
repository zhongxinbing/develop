/**
 * 自定义曲线图模块 - 支持多Case批量添加和混合模式显示
 * 样式与多线程对比图保持一致
 * 新增功能：支持X轴选择（日期/线程）
 */

// 自定义曲线图全局变量
let customState = {
    projectsData: {},
    currentProjectId: null,
    currentRule: null,
    selectedDates: [],
    availableDates: [],
    currentChartType: 'runtime',
    cachedToolData: {},
    pendingSelectedDates: [],
    casePaths: [],
    showUserData: true,
    defaultProjectsData: {},
    isMixedMode: true,
    availableThreads: [],      // 可用的线程列表
    selectedThreads: [],       // 选中的线程
    // 新增 X轴相关状态
    xAxisMode: 'date',         // 'date' 或 'thread'
    selectedThreadsForXAxis: [], // X轴为线程模式时选中的线程（用于显示多条线）
    availableThreadsForXAxis: [] // X轴为线程模式时可用的线程列表
};

// 自定义图表实例
let customCharts = {};

// ==================================================
// 初始化自定义图表
// ==================================================

function initCustomCharts() {
    const runtimeDom = document.getElementById('custom-chart-runtime');
    const memoryDom = document.getElementById('custom-chart-memory');
    
    if (runtimeDom && !customCharts.runtime) {
        if (customCharts.runtime) customCharts.runtime.dispose();
        customCharts.runtime = echarts.init(runtimeDom);
    }
    if (memoryDom && !customCharts.memory) {
        if (customCharts.memory) customCharts.memory.dispose();
        customCharts.memory = echarts.init(memoryDom);
    }
}

// ==================================================
// 工具函数
// ==================================================

function updateCaseCount() {
    const caseCountSpan = document.getElementById('caseCount');
    if (caseCountSpan) {
        caseCountSpan.innerText = customState.casePaths.length;
    }
}

function getCurrentCustomProjectData() {
    if (!customState.currentProjectId) return null;
    
    // 混合模式：合并默认数据和用户数据
    if (customState.isMixedMode && customState.showUserData) {
        const defaultData = customState.defaultProjectsData[customState.currentProjectId];
        const userData = customState.projectsData[customState.currentProjectId];
        
        if (!defaultData && !userData) return null;
        
        return mergeProjectData(defaultData, userData, customState.currentProjectId);
    }
    
    // 仅用户数据模式
    const projectData = customState.projectsData[customState.currentProjectId];
    if (!projectData) return null;
    
    if (projectData.daily_metrics && !projectData.rule_data) {
        const parsed = window.parseProjectData ? 
            window.parseProjectData(projectData, customState.currentProjectId) : projectData;
        customState.projectsData[customState.currentProjectId] = parsed;
        return parsed;
    }
    
    return projectData;
}

function mergeProjectData(defaultData, userData, projectId) {
    if (!defaultData && !userData) return null;
    if (!defaultData) return parseProjectDataIfNeeded(userData, projectId);
    if (!userData) return parseProjectDataIfNeeded(defaultData, projectId);
    
    const parsedDefault = parseProjectDataIfNeeded(defaultData, projectId);
    const parsedUser = parseProjectDataIfNeeded(userData, projectId);
    
    const mergedRules = new Set([...(parsedDefault.rules || []), ...(parsedUser.rules || [])]);
    const mergedRuleData = {};
    const allDates = new Set();
    
    (parsedDefault.dates || []).forEach(d => allDates.add(d));
    (parsedUser.dates || []).forEach(d => allDates.add(d));
    const sortedDates = Array.from(allDates).sort();
    
    mergedRules.forEach(rule => {
        const defaultRuleData = parsedDefault.rule_data?.[rule] || {};
        const userRuleData = parsedUser.rule_data?.[rule] || {};
        mergedRuleData[rule] = mergeRuleData(defaultRuleData, userRuleData, sortedDates);
    });
    
    return {
        dates: sortedDates,
        available_dates: sortedDates,
        rules: Array.from(mergedRules).sort(),
        rule_data: mergedRuleData,
        project_name: parsedDefault.project_name || parsedUser.project_name || projectId,
        description: parsedDefault.description || parsedUser.description || '',
        _isMerged: true
    };
}

function parseProjectDataIfNeeded(data, projectId) {
    if (!data) return null;
    if (data.rule_data) return data;
    if (window.parseProjectData) {
        return window.parseProjectData(data, projectId);
    }
    return data;
}

function mergeRuleData(defaultData, userData, allDates) {
    const result = {
        dates: [...allDates],
        runtimes: [],
        memories: [],
        cores: [],
        thread_metrics: {}
    };
    
    const allThreads = new Set();
    const defaultThreads = defaultData.thread_metrics || {};
    const userThreads = userData.thread_metrics || {};
    
    Object.keys(defaultThreads).forEach(t => allThreads.add(t));
    Object.keys(userThreads).forEach(t => allThreads.add(t));
    
    const defaultDateMap = new Map();
    const userDateMap = new Map();
    
    (defaultData.dates || []).forEach((date, idx) => defaultDateMap.set(date, idx));
    (userData.dates || []).forEach((date, idx) => userDateMap.set(date, idx));
    
    allThreads.forEach(threadId => {
        const defaultThread = defaultThreads[threadId] || { runtimes: [], memories: [], cores: [] };
        const userThread = userThreads[threadId] || { runtimes: [], memories: [], cores: [] };
        
        const threadMetrics = {
            runtimes: [],
            memories: [],
            cores: []
        };
        
        allDates.forEach(date => {
            const defaultIdx = defaultDateMap.get(date);
            const userIdx = userDateMap.get(date);
            
            let runtime = null;
            let memory = null;
            let cores = null;
            
            if (userIdx !== undefined && userThread.runtimes?.[userIdx] !== null && userThread.runtimes?.[userIdx] !== undefined) {
                runtime = userThread.runtimes[userIdx];
                memory = userThread.memories[userIdx];
                cores = userThread.cores[userIdx];
            } else if (defaultIdx !== undefined) {
                runtime = defaultThread.runtimes?.[defaultIdx];
                memory = defaultThread.memories?.[defaultIdx];
                cores = defaultThread.cores?.[defaultIdx];
            }
            
            threadMetrics.runtimes.push(runtime);
            threadMetrics.memories.push(memory);
            threadMetrics.cores.push(cores);
        });
        
        result.thread_metrics[threadId] = threadMetrics;
    });
    
    // 设置默认线程（线程0或第一个）
    const defaultThreadId = allThreads.has('0') ? '0' : (Array.from(allThreads)[0] || '0');
    if (result.thread_metrics[defaultThreadId]) {
        result.runtimes = result.thread_metrics[defaultThreadId].runtimes;
        result.memories = result.thread_metrics[defaultThreadId].memories;
        result.cores = result.thread_metrics[defaultThreadId].cores;
    }
    
    return result;
}

function getCurrentCustomToolData() {
    if (!customState.currentRule) return null;
    
    const cache = customState.cachedToolData[customState.currentRule];
    if (cache && cache.projectId === customState.currentProjectId) {
        return cache.data;
    }
    
    const projectData = getCurrentCustomProjectData();
    if (!projectData?.rule_data?.[customState.currentRule]) return null;
    
    let toolData = projectData.rule_data[customState.currentRule];
    
    // 提取可用线程
    if (toolData && toolData.thread_metrics) {
        const threadIds = Object.keys(toolData.thread_metrics);
        customState.availableThreads = threadIds.sort((a, b) => parseInt(a) - parseInt(b));
        
        // 同步选中线程
        if (customState.selectedThreads.length === 0) {
            customState.selectedThreads = [...customState.availableThreads];
        } else {
            customState.selectedThreads = customState.selectedThreads.filter(
                t => customState.availableThreads.includes(t)
            );
            if (customState.selectedThreads.length === 0 && customState.availableThreads.length > 0) {
                customState.selectedThreads = [customState.availableThreads[0]];
            }
        }
        
        // 同步 X轴线程选择
        if (customState.selectedThreadsForXAxis.length === 0) {
            customState.selectedThreadsForXAxis = [...customState.availableThreads];
        } else {
            customState.selectedThreadsForXAxis = customState.selectedThreadsForXAxis.filter(
                t => customState.availableThreads.includes(t)
            );
            if (customState.selectedThreadsForXAxis.length === 0 && customState.availableThreads.length > 0) {
                customState.selectedThreadsForXAxis = [customState.availableThreads[0]];
            }
        }
    }
    
    if (!toolData.thread_metrics) {
        toolData.thread_metrics = {
            '0': {
                runtimes: toolData.runtimes || [],
                memories: toolData.memories || [],
                cores: toolData.cores || []
            }
        };
        customState.availableThreads = ['0'];
        customState.selectedThreads = ['0'];
        customState.selectedThreadsForXAxis = ['0'];
    }
    
    customState.cachedToolData[customState.currentRule] = {
        projectId: customState.currentProjectId,
        data: toolData
    };
    
    return toolData;
}

function getFilteredCustomToolData(toolData) {
    if (!toolData?.dates) return null;
    
    const filterSet = new Set(customState.selectedDates);
    const filtered = {
        dates: [],
        runtimes: [],
        memories: [],
        cores: []
    };
    
    toolData.dates.forEach((date, index) => {
        if (filterSet.has(date)) {
            filtered.dates.push(date);
            filtered.runtimes.push(toolData.runtimes?.[index] ?? null);
            filtered.memories.push(toolData.memories?.[index] ?? null);
            filtered.cores.push(toolData.cores?.[index] ?? null);
        }
    });
    
    return filtered;
}

function getDisplayableProjects() {
    if (customState.isMixedMode && customState.showUserData) {
        const defaultProjectIds = new Set(Object.keys(customState.defaultProjectsData));
        const displayProjects = {};
        
        Object.keys(customState.projectsData).forEach(pid => {
            if (defaultProjectIds.has(pid)) {
                displayProjects[pid] = customState.projectsData[pid];
            }
        });
        
        return displayProjects;
    }
    
    return customState.projectsData;
}

function updateCustomCaseSelect() {
    const caseSelect = document.getElementById('customCaseSelect');
    if (!caseSelect) return;
    
    const displayProjects = getDisplayableProjects();
    const projectIds = Object.keys(displayProjects);
    const currentValue = caseSelect.value;
    
    caseSelect.innerHTML = '<option value="">-- 请选择项目 --</option>' + 
        projectIds.map(pid => {
            const projectName = displayProjects[pid].project_name || pid;
            return `<option value="${pid}">${escapeHtml(projectName)}</option>`;
        }).join('');
    
    if (currentValue && projectIds.includes(currentValue)) {
        caseSelect.value = currentValue;
        customState.currentProjectId = currentValue;
    } else if (projectIds.length > 0 && customState.currentProjectId && projectIds.includes(customState.currentProjectId)) {
        caseSelect.value = customState.currentProjectId;
    } else if (projectIds.length > 0) {
        caseSelect.value = projectIds[0];
        customState.currentProjectId = projectIds[0];
    } else {
        customState.currentProjectId = null;
    }
    
    const hasProjects = projectIds.length > 0;
    const ruleSelect = document.getElementById('customRuleSelect');
    const ruleSearch = document.getElementById('customRuleSearch');
    const openDatePicker = document.getElementById('customOpenDatePickerBtn');
    const selectRecent = document.getElementById('customSelectRecentBtn');
    
    if (ruleSelect) ruleSelect.disabled = !hasProjects;
    if (ruleSearch) ruleSearch.disabled = !hasProjects;
    if (openDatePicker) openDatePicker.disabled = !hasProjects;
    if (selectRecent) selectRecent.disabled = !hasProjects;
    
    if (hasProjects && customState.currentProjectId) {
        updateCustomRuleSelect();
        updateCustomDateInfo();
        updateXAxisModeUI();
        refreshCustomCharts();
    }
}

// ==================================================
// X轴模式相关函数
// ==================================================

function updateXAxisModeUI() {
    const xAxisSelect = document.getElementById('customXAxisSelect');
    const threadGroup = document.getElementById('customThreadSelectGroup');
    
    if (xAxisSelect) {
        customState.xAxisMode = xAxisSelect.value;
    }
    
    if (threadGroup) {
        threadGroup.style.display = customState.xAxisMode === 'thread' ? 'block' : 'none';
    }
    
    // 刷新图表
    if (customState.currentRule) {
        refreshCustomCharts();
    }
}

function openCustomThreadSelectorModal() {
    if (!customState.availableThreads || customState.availableThreads.length === 0) {
        showNotification('暂无线程数据', true);
        return;
    }
    
    buildCustomThreadSelectorModal();
    const modal = document.getElementById('customThreadSelectorModal');
    if (modal) modal.classList.remove('hidden');
}

function closeCustomThreadSelectorModal() {
    const modal = document.getElementById('customThreadSelectorModal');
    if (modal) modal.classList.add('hidden');
}

function buildCustomThreadSelectorModal() {
    const container = document.getElementById('customThreadSelectorModalContent');
    if (!container) return;
    
    const filterText = document.getElementById('customThreadFilterInput')?.value || '';
    const filteredThreads = customState.availableThreads.filter(thread => 
        thread.toLowerCase().includes(filterText.toLowerCase())
    );
    
    container.innerHTML = filteredThreads.map(threadId => {
        const isChecked = customState.selectedThreadsForXAxis.includes(threadId);
        const displayName = threadId === '0' ? '线程0' : `线程 ${threadId}`;
        return `
            <label class="thread-option ${isChecked ? 'selected' : ''}" data-thread="${threadId}">
                <input type="checkbox" value="${threadId}" ${isChecked ? 'checked' : ''}>
                <span>${escapeHtml(displayName)}</span>
            </label>
        `;
    }).join('');
    
    container.querySelectorAll('.thread-option input').forEach(cb => {
        cb.addEventListener('change', (e) => {
            const label = e.target.closest('.thread-option');
            if (label) {
                if (e.target.checked) {
                    label.classList.add('selected');
                } else {
                    label.classList.remove('selected');
                }
            }
            e.stopPropagation();
        });
    });
    
    container.querySelectorAll('.thread-option').forEach(label => {
        label.removeEventListener('click', handleCustomThreadOptionClick);
        label.addEventListener('click', handleCustomThreadOptionClick);
    });
}

function handleCustomThreadOptionClick(e) {
    if (e.target.tagName === 'INPUT') return;
    
    const label = e.currentTarget;
    const checkbox = label.querySelector('input');
    if (checkbox) {
        if (checkbox.checked) {
            label.classList.add('selected');
        } else {
            label.classList.remove('selected');
        }
        const changeEvent = new Event('change', { bubbles: true });
        checkbox.dispatchEvent(changeEvent);
    }
}

function updateCustomSelectedThreadsFromModal() {
    const modalContent = document.getElementById('customThreadSelectorModalContent');
    if (!modalContent) return;
    
    customState.selectedThreadsForXAxis = [];
    modalContent.querySelectorAll('.thread-option input:checked').forEach(cb => {
        customState.selectedThreadsForXAxis.push(cb.value);
    });
    
    if (customState.selectedThreadsForXAxis.length === 0 && customState.availableThreads.length > 0) {
        customState.selectedThreadsForXAxis = [...customState.availableThreads];
    }
}

function selectAllCustomThreadsInModal() {
    const modalContent = document.getElementById('customThreadSelectorModalContent');
    if (!modalContent) return;
    
    const checkboxes = modalContent.querySelectorAll('.thread-option input');
    checkboxes.forEach(cb => {
        cb.checked = true;
        const label = cb.closest('.thread-option');
        if (label) label.classList.add('selected');
    });
    updateCustomSelectedThreadsFromModal();
}

function deselectAllCustomThreadsInModal() {
    const modalContent = document.getElementById('customThreadSelectorModalContent');
    if (!modalContent) return;
    
    const checkboxes = modalContent.querySelectorAll('.thread-option input');
    checkboxes.forEach(cb => {
        cb.checked = false;
        const label = cb.closest('.thread-option');
        if (label) label.classList.remove('selected');
    });
    updateCustomSelectedThreadsFromModal();
}

function inverseSelectCustomThreadsInModal() {
    const modalContent = document.getElementById('customThreadSelectorModalContent');
    if (!modalContent) return;
    
    const checkboxes = modalContent.querySelectorAll('.thread-option input');
    checkboxes.forEach(cb => {
        cb.checked = !cb.checked;
        const label = cb.closest('.thread-option');
        if (label) {
            if (cb.checked) {
                label.classList.add('selected');
            } else {
                label.classList.remove('selected');
            }
        }
    });
    updateCustomSelectedThreadsFromModal();
}

function confirmCustomThreadSelection() {
    updateCustomSelectedThreadsFromModal();
    if (customState.selectedThreadsForXAxis.length === 0) {
        customState.selectedThreadsForXAxis = [...customState.availableThreads];
        showNotification('未选择任何线程，已自动全选');
    }
    closeCustomThreadSelectorModal();
    refreshCustomCharts();
    updateSelectedThreadsForXAxisDisplay();
}

function updateSelectedThreadsForXAxisDisplay() {
    const displaySpan = document.getElementById('selectedThreadsForXAxisDisplay');
    if (displaySpan) {
        if (customState.selectedThreadsForXAxis.length === 0) {
            displaySpan.innerText = '未选择';
        } else if (customState.selectedThreadsForXAxis.length === customState.availableThreads.length) {
            displaySpan.innerText = '全部';
        } else {
            displaySpan.innerText = customState.selectedThreadsForXAxis.map(t => t === '0' ? '0' : t).join(', ');
        }
    }
}

// ==================================================
// 阶段选择
// ==================================================

function updateCustomRuleSelect() {
    const projectData = getCurrentCustomProjectData();
    if (!projectData) {
        const ruleSelect = document.getElementById('customRuleSelect');
        if (ruleSelect) {
            ruleSelect.innerHTML = '<option value="">-- 请选择阶段 --</option>';
        }
        customState.availableThreads = [];
        customState.selectedThreads = [];
        customState.selectedThreadsForXAxis = [];
        return;
    }
    
    const rules = projectData.rules || [];
    const searchText = document.getElementById('customRuleSearch')?.value.toLowerCase() || '';
    
    const filteredRules = searchText ? rules.filter(rule => rule.toLowerCase().includes(searchText)) : rules;
    
    const select = document.getElementById('customRuleSelect');
    const currentValue = select?.value;
    
    if (select) {
        select.innerHTML = '<option value="">-- 请选择阶段 --</option>';
        filteredRules.forEach(rule => {
            const option = document.createElement('option');
            option.value = rule;
            option.textContent = rule;
            select.appendChild(option);
        });
        
        if (currentValue && filteredRules.includes(currentValue)) {
            select.value = currentValue;
            customState.currentRule = currentValue;
        } else if (filteredRules.length > 0 && !customState.currentRule) {
            select.value = filteredRules[0];
            customState.currentRule = filteredRules[0];
        } else if (filteredRules.length === 0) {
            customState.currentRule = null;
        }
    }
    
    if (customState.currentRule) {
        const ruleNameSpan = document.getElementById('customCurrentRuleName');
        if (ruleNameSpan) ruleNameSpan.innerText = customState.currentRule;
        updateCustomDateInfo();
        updateXAxisModeUI();
        refreshCustomCharts();
    }
}

// ==================================================
// 日期选择（当X轴为日期模式时使用）
// ==================================================

function updateCustomDateInfo() {
    const projectData = getCurrentCustomProjectData();
    if (!projectData) {
        customState.availableDates = [];
        customState.selectedDates = [];
        const dateRangeSpan = document.getElementById('customDateRange');
        if (dateRangeSpan) dateRangeSpan.innerText = '无';
        const dataPointsSpan = document.getElementById('customDataPoints');
        if (dataPointsSpan) dataPointsSpan.innerText = '0';
        return;
    }
    
    customState.availableDates = projectData.available_dates || projectData.dates || [];
    
    if (customState.selectedDates.length === 0 && customState.availableDates.length > 0) {
        customState.selectedDates = customState.availableDates.slice(-51);
    }
    
    const availableSet = new Set(customState.availableDates);
    customState.selectedDates = customState.selectedDates.filter(date => availableSet.has(date));
    
    if (customState.selectedDates.length === 0 && customState.availableDates.length > 0) {
        customState.selectedDates = customState.availableDates.slice(-51);
    }
    
    const dateRangeSpan = document.getElementById('customDateRange');
    if (dateRangeSpan) {
        if (customState.selectedDates.length === 0) {
            dateRangeSpan.innerText = '无';
        } else {
            dateRangeSpan.innerText = getDateRangeText(customState.selectedDates);
        }
    }
    const dataPointsSpan = document.getElementById('customDataPoints');
    if (dataPointsSpan) {
        dataPointsSpan.innerText = customState.selectedDates.length;
    }
}

function openCustomDatePickerModal() {
    if (!customState.availableDates || customState.availableDates.length === 0) {
        showNotification('暂无可用日期', true);
        return;
    }
    customState.pendingSelectedDates = [...customState.selectedDates];
    buildCustomDatePicker(true);
    const modal = document.getElementById('customDatePickerModal');
    if (modal) modal.classList.remove('hidden');
}

function closeCustomDatePickerModal() {
    const modal = document.getElementById('customDatePickerModal');
    if (modal) modal.classList.add('hidden');
}

function buildCustomDatePicker(usePending = false) {
    const container = document.getElementById('customDateOptionsContainer');
    if (!container) return;
    
    const currentSelection = usePending ? customState.pendingSelectedDates : customState.selectedDates;
    const filterText = document.getElementById('customDateFilterInput')?.value || '';
    const filteredDates = customState.availableDates.filter(date => 
        date.toLowerCase().includes(filterText.toLowerCase())
    );
    
    container.innerHTML = filteredDates.map(date => `
        <label class="date-option">
            <input type="checkbox" value="${date}" ${currentSelection.includes(date) ? 'checked' : ''}>
            <span>${date}</span>
        </label>
    `).join('');
    
    container.querySelectorAll('input[type="checkbox"]').forEach(cb => {
        cb.addEventListener('change', (e) => {
            const date = e.target.value;
            if (e.target.checked) {
                if (!customState.pendingSelectedDates.includes(date)) {
                    customState.pendingSelectedDates.push(date);
                }
            } else {
                customState.pendingSelectedDates = customState.pendingSelectedDates.filter(d => d !== date);
            }
        });
    });
}

function confirmCustomDateSelection() {
    if (customState.pendingSelectedDates.length === 0) {
        customState.pendingSelectedDates = customState.availableDates.slice(-51);
    }
    customState.selectedDates = [...customState.pendingSelectedDates];
    updateCustomDateInfo();
    refreshCustomCharts();
    closeCustomDatePickerModal();
}

function resetCustomDateSelection(useAll = false) {
    customState.selectedDates = useAll ? [...customState.availableDates] : customState.availableDates.slice(-51);
    updateCustomDateInfo();
    refreshCustomCharts();
}

function selectAllCustomDates() {
    const container = document.getElementById('customDateOptionsContainer');
    if (!container) return;
    
    const checkboxes = container.querySelectorAll('input[type="checkbox"]');
    customState.pendingSelectedDates = [];
    checkboxes.forEach(cb => {
        cb.checked = true;
        customState.pendingSelectedDates.push(cb.value);
    });
}

function deselectAllCustomDates() {
    const container = document.getElementById('customDateOptionsContainer');
    if (!container) return;
    
    const checkboxes = container.querySelectorAll('input[type="checkbox"]');
    customState.pendingSelectedDates = [];
    checkboxes.forEach(cb => {
        cb.checked = false;
    });
}

function inverseSelectCustomDates() {
    const container = document.getElementById('customDateOptionsContainer');
    if (!container) return;
    
    const checkboxes = container.querySelectorAll('input[type="checkbox"]');
    customState.pendingSelectedDates = [];
    checkboxes.forEach(cb => {
        cb.checked = !cb.checked;
        if (cb.checked) {
            customState.pendingSelectedDates.push(cb.value);
        }
    });
}

function resetCustomDateToRecent(days = 50) {
    if (!customState.availableDates || customState.availableDates.length === 0) {
        customState.selectedDates = [];
        return;
    }
    
    const recentDays = Math.min(days, customState.availableDates.length);
    customState.selectedDates = customState.availableDates.slice(-recentDays);
    customState.pendingSelectedDates = [...customState.selectedDates];
    updateCustomDateInfo();
    refreshCustomCharts();
}

// ==================================================
// Case 管理
// ==================================================

function openAddCaseModal() {
    renderCaseConfigList();
    const modal = document.getElementById('addCaseModal');
    if (modal) modal.classList.remove('hidden');
}

function closeAddCaseModal() {
    const modal = document.getElementById('addCaseModal');
    if (modal) modal.classList.add('hidden');
}

function renderCaseConfigList() {
    const container = document.getElementById('caseConfigContainer');
    if (!container) return;
    
    updateCaseCount();
    
    if (customState.casePaths.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; padding: 2rem; color: var(--text-muted);">
                <div>📁 暂无Case配置</div>
                <div style="font-size: 0.8rem; margin-top: 0.5rem;">点击上方按钮添加Case路径</div>
            </div>
        `;
        return;
    }
    
    container.innerHTML = customState.casePaths.map((path, index) => `
        <div class="case-config-item" style="display: flex; align-items: center; gap: 0.75rem; padding: 0.75rem; background: rgba(15, 23, 42, 0.6); border-radius: var(--radius-md); margin-bottom: 0.5rem;">
            <span style="color: var(--primary-light);">📁</span>
            <span style="flex: 1; font-family: monospace; font-size: 0.8rem; word-break: break-all;">${escapeHtml(path)}</span>
            <button class="btn btn-danger" onclick="window.removeCaseConfig(${index})" style="padding: 0.25rem 0.75rem;">🗑️ 删除</button>
        </div>
    `).join('');
}

function addCaseConfig() {
    const input = document.getElementById('newCasePathInput');
    const newPath = input?.value.trim();
    
    if (!newPath) {
        showNotification('请输入Case路径', true);
        return;
    }
    
    if (customState.casePaths.includes(newPath)) {
        showNotification('该路径已存在', true);
        return;
    }
    
    customState.casePaths.push(newPath);
    if (input) input.value = '';
    renderCaseConfigList();
    showNotification('Case路径已添加');
}

function removeCaseConfig(index) {
    customState.casePaths.splice(index, 1);
    renderCaseConfigList();
    showNotification('Case路径已删除');
}

async function loadDefaultData() {
    showLoading(true);
    const loadingIndicator = document.getElementById('customLoadingIndicator');
    if (loadingIndicator) loadingIndicator.style.display = 'block';
    
    try {
        const response = await fetch('/api/fetch_default_user_data', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tool: window.toolId || 'elint' })
        });
        
        const result = await response.json();
        
        if (result.success) {
            customState.defaultProjectsData = result.data;
            
            if (customState.isMixedMode && customState.showUserData && customState.currentProjectId) {
                const projectData = getCurrentCustomProjectData();
                if (projectData) {
                    customState.availableDates = projectData.available_dates || projectData.dates || [];
                    customState.selectedDates = customState.availableDates.slice(-51);
                    updateCustomDateInfo();
                }
            }
            
            if (customState.isMixedMode && customState.showUserData) {
                updateCustomCaseSelect();
                if (customState.currentProjectId) {
                    updateCustomRuleSelect();
                    updateCustomDateInfo();
                    refreshCustomCharts();
                }
            }
            
            showNotification(`成功加载默认数据，共 ${Object.keys(result.data).length} 个项目`);
        } else {
            showNotification('加载默认数据失败: ' + (result.error || '未知错误'), true);
        }
    } catch (error) {
        console.error('加载默认数据失败:', error);
        showNotification('加载默认数据失败: ' + error.message, true);
    } finally {
        showLoading(false);
        if (loadingIndicator) loadingIndicator.style.display = 'none';
    }
}

async function confirmLoadCaseData() {
    if (customState.casePaths.length === 0) {
        showNotification('请先添加至少一个Case路径', true);
        return;
    }
    
    showLoading(true);
    const loadingIndicator = document.getElementById('customLoadingIndicator');
    if (loadingIndicator) loadingIndicator.style.display = 'block';
    
    try {
        const response = await fetch('/api/fetch_user_data_batch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ case_paths: customState.casePaths })
        });
        
        const result = await response.json();
        
        if (result.success) {
            customState.projectsData = result.data;
            await loadDefaultData();
            
            customState.selectedDates = [];
            customState.pendingSelectedDates = [];
            customState.availableThreads = [];
            customState.selectedThreads = [];
            customState.selectedThreadsForXAxis = [];
            updateCustomCaseSelect();
            
            const customView = document.getElementById('customView');
            const isCustomViewActive = customView && customView.classList.contains('active');
            
            const caseSelect = document.getElementById('customCaseSelect');
            if (caseSelect && caseSelect.options.length > 1 && isCustomViewActive) {
                customState.currentProjectId = caseSelect.options[1].value;
                const projectData = getCurrentCustomProjectData();
                if (projectData) {
                    customState.availableDates = projectData.available_dates || projectData.dates || [];
                    customState.selectedDates = customState.availableDates.slice(-51);
                    updateCustomDateInfo();
                    updateCustomRuleSelect();
                    refreshCustomCharts();
                }
            }
            
            showNotification(`成功加载 ${Object.keys(result.data).length} 个项目数据，显示最近50天`);
        } else {
            showNotification('加载失败: ' + (result.error || '未知错误'), true);
        }
    } catch (error) {
        console.error('加载用户数据失败:', error);
        showNotification('加载用户数据失败: ' + error.message, true);
    } finally {
        showLoading(false);
        if (loadingIndicator) loadingIndicator.style.display = 'none';
        closeAddCaseModal();
    }
}

async function toggleDataSource() {
    customState.showUserData = !customState.showUserData;
    customState.isMixedMode = customState.showUserData;
    
    const toggleBtn = document.getElementById('toggleDataSourceBtn');
    if (toggleBtn) {
        if (customState.showUserData) {
            toggleBtn.innerHTML = '📁 切换显示默认数据';
        } else {
            toggleBtn.innerHTML = '👤 切换显示用户数据';
        }
    }
    
    customState.cachedToolData = {};
    customState.selectedDates = [];
    customState.pendingSelectedDates = [];
    customState.availableThreads = [];
    customState.selectedThreads = [];
    customState.selectedThreadsForXAxis = [];
    updateCustomCaseSelect();
    
    if (customState.currentProjectId) {
        const projectData = getCurrentCustomProjectData();
        if (projectData) {
            customState.availableDates = projectData.available_dates || projectData.dates || [];
            customState.selectedDates = customState.availableDates.slice(-51);
            updateCustomDateInfo();
            updateCustomRuleSelect();
            refreshCustomCharts();
        }
    } else if (customState.casePaths.length > 0) {
        const caseSelect = document.getElementById('customCaseSelect');
        if (caseSelect && caseSelect.options.length > 1) {
            customState.currentProjectId = caseSelect.options[1].value;
            const projectData = getCurrentCustomProjectData();
            if (projectData) {
                customState.availableDates = projectData.available_dates || projectData.dates || [];
                customState.selectedDates = customState.availableDates.slice(-51);
                updateCustomDateInfo();
                updateCustomRuleSelect();
                refreshCustomCharts();
            }
        }
    }
    
    showNotification(customState.showUserData ? '已切换到混合模式，显示最近50天数据' : '已切换到仅用户数据模式，显示最近50天数据');
}

async function preloadDefaultDataForCustom() {
    try {
        const response = await fetch('/api/fetch_default_user_data', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tool: window.toolId || 'elint' })
        });
        
        const result = await response.json();
        
        if (result.success) {
            customState.defaultProjectsData = result.data;
        }
    } catch (error) {
        console.error('预加载默认数据失败:', error);
    }
}

// ==================================================
// 图表类型切换
// ==================================================

function updateCustomChartTypeButtons() {
    const runtimeBtn = document.getElementById('customChartRuntimeBtn');
    const memoryBtn = document.getElementById('customChartMemoryBtn');
    
    if (runtimeBtn) {
        if (customState.currentChartType === 'runtime') {
            runtimeBtn.classList.add('btn-primary');
            runtimeBtn.classList.remove('btn-secondary');
        } else {
            runtimeBtn.classList.add('btn-secondary');
            runtimeBtn.classList.remove('btn-primary');
        }
    }
    if (memoryBtn) {
        if (customState.currentChartType === 'memory') {
            memoryBtn.classList.add('btn-primary');
            memoryBtn.classList.remove('btn-secondary');
        } else {
            memoryBtn.classList.add('btn-secondary');
            memoryBtn.classList.remove('btn-primary');
        }
    }
    
    const runtimeContainer = document.getElementById('custom-chart-runtime');
    const memoryContainer = document.getElementById('custom-chart-memory');
    if (runtimeContainer && memoryContainer) {
        if (customState.currentChartType === 'runtime') {
            runtimeContainer.classList.remove('hidden');
            memoryContainer.classList.add('hidden');
        } else {
            runtimeContainer.classList.add('hidden');
            memoryContainer.classList.remove('hidden');
        }
    }
    
    const chartCardTitle = document.getElementById('customChartCardTitle');
    if (chartCardTitle) {
        chartCardTitle.innerText = customState.currentChartType === 'runtime' 
            ? '⏱️ Runtime 性能曲线' 
            : '💾 Memory 使用曲线';
    }
}

function selectCustomChartType(type) {
    if (customState.currentChartType === type) return;
    customState.currentChartType = type;
    updateCustomChartTypeButtons();
    refreshCustomCharts();
}

// ==================================================
// 图表渲染 - 支持 X轴选择（日期/线程）
// ==================================================

function updateCustomStatsCard(containerId, values, unit, label) {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    const valid = values.filter(v => v !== null && v !== undefined && !isNaN(v) && v > 0);
    
    if (valid.length === 0) {
        container.innerHTML = '<div class="stat-item"><div class="stat-value">-</div><div class="stat-label">暂无数据</div></div>';
        return;
    }
    
    const total = valid.reduce((a, b) => a + b, 0);
    const avg = (total / valid.length).toFixed(1);
    const max = Math.max(...valid);
    const min = Math.min(...valid);
    
    container.innerHTML = `
        <div class="stat-item"><div class="stat-value">${total.toFixed(1)}<span style="font-size:0.875rem;">${unit}</span></div><div class="stat-label">总${label}</div></div>
        <div class="stat-item"><div class="stat-value">${avg}<span style="font-size:0.875rem;">${unit}</span></div><div class="stat-label">平均${label}</div></div>
        <div class="stat-item"><div class="stat-value">${max.toFixed(1)}<span style="font-size:0.875rem;">${unit}</span></div><div class="stat-label">最大${label}</div></div>
        <div class="stat-item"><div class="stat-value">${min.toFixed(1)}<span style="font-size:0.875rem;">${unit}</span></div><div class="stat-label">最小${label}</div></div>
    `;
}

/**
 * 渲染自定义图表 - 支持 X轴选择
 */
function renderCustomChart(chartType, dataKey, yAxisName) {
    const toolData = getCurrentCustomToolData();
    
    if (!toolData) {
        const chart = customCharts[chartType];
        if (chart && !chart.isDisposed()) {
            chart.clear();
            chart.setOption({
                title: {
                    show: true,
                    text: '请先选择项目和阶段',
                    textStyle: { color: '#94a3b8' },
                    left: 'center',
                    top: 'center'
                }
            }, true);
        }
        return;
    }
    
    const projectData = getCurrentCustomProjectData();
    const isMerged = projectData && projectData._isMerged;
    const xAxisMode = customState.xAxisMode;
    const threadMetrics = toolData.thread_metrics || {};
    
    // 根据 X轴模式选择不同的渲染方式
    if (xAxisMode === 'thread') {
        renderCustomChartByThread(toolData, chartType, dataKey, yAxisName, isMerged);
    } else {
        renderCustomChartByDate(toolData, chartType, dataKey, yAxisName, isMerged);
    }
}

/**
 * 按日期渲染（原有功能，增强版）
 */
function renderCustomChartByDate(toolData, chartType, dataKey, yAxisName, isMerged) {
    const filteredData = getFilteredCustomToolData(toolData);
    if (!filteredData || filteredData.dates.length === 0) {
        const chart = customCharts[chartType];
        if (chart && !chart.isDisposed()) {
            chart.clear();
            chart.setOption({
                title: {
                    show: true,
                    text: '所选日期范围内无数据',
                    textStyle: { color: '#94a3b8' },
                    left: 'center',
                    top: 'center'
                }
            }, true);
        }
        return;
    }
    
    const dates = filteredData.dates;
    const threadMetrics = toolData.thread_metrics || {};
    
    // 使用选中的线程
    const selectedThreadsSet = new Set(customState.selectedThreads);
    let threadIds = Object.keys(threadMetrics)
        .filter(tid => selectedThreadsSet.has(tid))
        .sort((a, b) => parseInt(a) - parseInt(b));
    
    if (threadIds.length === 0) {
        threadIds = Object.keys(threadMetrics).sort((a, b) => parseInt(a) - parseInt(b));
    }
    
    const seriesList = [];
    const allValues = [];
    const palette = ['#6366f1', '#f59e0b', '#10b981', '#ef4444', '#06b6d4', '#8b5cf6', '#ec4899', '#84cc16'];
    
    threadIds.forEach((threadId, index) => {
        const threadInfo = threadMetrics[threadId];
        let values = threadInfo?.[dataKey] || [];
        
        const originalDates = toolData.dates || [];
        const seriesData = dates.map(selectedDate => {
            const dateIndex = originalDates.indexOf(selectedDate);
            const val = (dateIndex !== -1 && values[dateIndex] !== undefined) ? values[dateIndex] : null;
            if (val !== null && val !== undefined && val > 0) allValues.push(val);
            return val;
        });
        
        const threadLabel = threadId === '0' ? '线程0' : `线程 ${threadId}`;
        const seriesColor = isMerged ? '#f59e0b' : palette[index % palette.length];
        
        seriesList.push({
            name: threadLabel,
            type: 'line',
            data: seriesData,
            smooth: false,
            lineStyle: { width: 2, color: seriesColor },
            areaStyle: { opacity: 0.08, color: seriesColor },
            connectNulls: true,
            showSymbol: true,
            symbol: 'circle',
            symbolSize: 6
        });
    });
    
    if (chartType === customState.currentChartType) {
        const unit = dataKey === 'runtimes' ? '秒' : 'MB';
        const label = dataKey === 'runtimes' ? 'Runtime' : 'Memory';
        updateCustomStatsCard('customStatsMain', allValues, unit, label);
    }
    
    const avgValue = allValues.length > 0 
        ? (allValues.reduce((a, b) => a + b, 0) / allValues.length).toFixed(1) 
        : 0;
    
    let referenceValue = avgValue;
    if (dataKey === 'memories' && allValues.length > 0) {
        const sorted = [...allValues].sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        referenceValue = sorted[mid];
    }
    
    const legendSelected = {};
    seriesList.forEach((series, idx) => {
        legendSelected[series.name] = (idx === 0);
    });
    legendSelected['平均值'] = true;
    legendSelected['参考线'] = true;
    
    const tooltipFormatter = (params) => {
        if (!params?.length) return '';
        const unit = dataKey === 'runtimes' ? '秒' : 'MB';
        const date = params[0].axisValue;
        const dataSourceLabel = isMerged ? '(混合模式)' : '(用户数据)';
        const rows = params.map(p => {
            if (p.value === null || p.value === undefined) {
                return `<div>${p.seriesName}: N/A</div>`;
            }
            let displayValue = dataKey === 'runtimes' 
                ? p.value.toFixed(2) 
                : (p.value >= 1024 ? (p.value / 1024).toFixed(2) + ' GB' : p.value.toFixed(0));
            return `<div>${p.seriesName}: ${displayValue} ${unit}</div>`;
        }).join('');
        return `<strong>📅 ${date}</strong>${dataSourceLabel}${rows}`;
    };
    
    const option = {
        backgroundColor: 'transparent',
        tooltip: {
            trigger: 'axis',
            backgroundColor: 'rgba(30, 41, 59, 0.95)',
            borderWidth: 1,
            textStyle: { color: '#f1f5f9', fontSize: 12 },
            formatter: tooltipFormatter
        },
        grid: {
            left: '8%',
            right: '8%',
            top: '18%',
            bottom: '10%',
            containLabel: true
        },
        xAxis: {
            type: 'category',
            name: '日期',
            data: dates,
            axisLabel: {
                rotate: dates.length > 10 ? 30 : 0,
                color: '#94a3b8',
                fontSize: 11
            },
            axisLine: { lineStyle: { color: '#475569' } },
            boundaryGap: [0, "5%"] // 固定留白边界，避免曲线紧贴边线
        },
        yAxis: {
            type: 'value',
            name: yAxisName,
            nameTextStyle: { color: '#cbd5e1', fontSize: 12 },
            axisLabel: {
                color: '#94a3b8',
                fontSize: 11,
                formatter: (value) => {
                    if (dataKey === 'memories' && value >= 1024) {
                        return (value / 1024).toFixed(1) + ' GB';
                    }
                    if (dataKey === 'runtimes') {
                        return value.toFixed(2);
                    }
                    return value;
                }
            },
            splitLine: {
                lineStyle: { color: 'rgba(71, 85, 105, 0.3)', type: 'dashed' }
            }
        },
        series: [
            ...seriesList,
            {
                name: '平均值',
                type: 'line',
                data: new Array(dates.length).fill(parseFloat(avgValue)),
                lineStyle: { width: 1.5, color: '#f59e0b', type: 'dashed' },
                symbol: 'none',
                tooltip: { show: false }
            },
            {
                name: '参考线',
                type: 'line',
                data: new Array(dates.length).fill(parseFloat(referenceValue)),
                lineStyle: { width: 1, color: '#06b6d4', type: 'dotted' },
                symbol: 'none',
                tooltip: { show: true, formatter: () => `📊 参考线: ${referenceValue.toFixed(2)} ${dataKey === 'runtimes' ? '秒' : 'MB'}` }
            }
        ],
        legend: {
            data: seriesList.map(s => s.name).concat(['平均值', '参考线']),
            selected: legendSelected,
            textStyle: { color: '#cbd5e1', fontSize: 11 },
            orient: 'horizontal',
            right: 10,
            top: 0,
            itemWidth: 25,
            itemHeight: 12
        },
        toolbox: {
            feature: {
                saveAsImage: { title: '保存为图片' },
                zoom: { title: { zoom: '区域缩放', back: '还原' } },
                restore: { title: '重置' }
            },
            iconStyle: { borderColor: '#94a3b8' },
            right: 10,
            bottom: 10
        }
    };
    
    const chart = customCharts[chartType];
    if (chart && !chart.isDisposed()) {
        chart.setOption(option, { notMerge: true, lazyUpdate: false });
    }
    
    setTimeout(() => {
        if (chart && !chart.isDisposed()) {
            chart.resize();
        }
    }, 50);
}

/**
 * 按线程渲染（新增功能）
 * X轴为线程数，Y轴为性能值，每条线代表一个日期
 */
function renderCustomChartByThread(toolData, chartType, dataKey, yAxisName, isMerged) {
    const selectedDatesSet = new Set(customState.selectedDates);
    const allDates = toolData.dates || [];
    
    // 过滤出选中的日期
    const datesToShow = allDates.filter(date => selectedDatesSet.has(date));
    
    if (datesToShow.length === 0) {
        const chart = customCharts[chartType];
        if (chart && !chart.isDisposed()) {
            chart.clear();
            chart.setOption({
                title: {
                    show: true,
                    text: '请先选择日期',
                    textStyle: { color: '#94a3b8' },
                    left: 'center',
                    top: 'center'
                }
            }, true);
        }
        return;
    }
    
    // 获取要显示的线程列表
    let threadsToShow = [...customState.selectedThreadsForXAxis];
    if (threadsToShow.length === 0) {
        threadsToShow = Object.keys(toolData.thread_metrics || {}).sort((a, b) => parseInt(a) - parseInt(b));
    }
    
    if (threadsToShow.length === 0) {
        const chart = customCharts[chartType];
        if (chart && !chart.isDisposed()) {
            chart.clear();
            chart.setOption({
                title: {
                    show: true,
                    text: '无可用线程数据',
                    textStyle: { color: '#94a3b8' },
                    left: 'center',
                    top: 'center'
                }
            }, true);
        }
        return;
    }
    
    const threadMetrics = toolData.thread_metrics || {};
    const allValues = [];
    const palette = ['#6366f1', '#f59e0b', '#10b981', '#ef4444', '#06b6d4', '#8b5cf6', '#ec4899', '#84cc16'];
    const seriesList = [];
    
    // 为每个选中的日期创建一条线
    datesToShow.forEach((date, dateIndex) => {
        const dateIdx = allDates.indexOf(date);
        if (dateIdx === -1) return;
        
        const seriesData = threadsToShow.map(threadId => {
            const threadInfo = threadMetrics[threadId];
            let value = null;
            if (threadInfo && threadInfo[dataKey] && threadInfo[dataKey][dateIdx] !== undefined) {
                value = threadInfo[dataKey][dateIdx];
                if (value !== null && value !== undefined && value > 0) allValues.push(value);
            }
            return value;
        });
        
        const dateLabel = date;
        const seriesColor = palette[dateIndex % palette.length];
        
        seriesList.push({
            name: `日期 ${dateLabel}`,
            type: 'line',
            data: seriesData,
            smooth: false,
            lineStyle: { width: 2, color: seriesColor },
            areaStyle: { opacity: 0.08, color: seriesColor },
            connectNulls: true,
            showSymbol: true,
            symbol: 'circle',
            symbolSize: 6
        });
    });
    
    if (chartType === customState.currentChartType) {
        const unit = dataKey === 'runtimes' ? '秒' : 'MB';
        const label = dataKey === 'runtimes' ? 'Runtime' : 'Memory';
        updateCustomStatsCard('customStatsMain', allValues, unit, label);
    }
    
    // 计算平均值和参考线
    const avgValue = allValues.length > 0 
        ? (allValues.reduce((a, b) => a + b, 0) / allValues.length).toFixed(1) 
        : 0;
    
    let referenceValue = avgValue;
    if (dataKey === 'memories' && allValues.length > 0) {
        const sorted = [...allValues].sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        referenceValue = sorted[mid];
    }
    
    // 图例默认选中状态（默认只显示第一个系列）
    const legendSelected = {};
    seriesList.forEach((series, idx) => {
        legendSelected[series.name] = (idx === 0);
    });
    legendSelected['平均值'] = true;
    legendSelected['参考线'] = true;
    
    const xAxisData = threadsToShow.map(t => t === '0' ? '线程0' : `线程 ${t}`);
    
    const tooltipFormatter = (params) => {
        if (!params?.length) return '';
        const unit = dataKey === 'runtimes' ? '秒' : 'MB';
        const thread = params[0].axisValue;
        const dataSourceLabel = isMerged ? '(混合模式)' : '(用户数据)';
        const rows = params.map(p => {
            if (p.value === null || p.value === undefined) {
                return `<div>${p.seriesName}: N/A</div>`;
            }
            let displayValue = dataKey === 'runtimes' 
                ? p.value.toFixed(2) 
                : (p.value >= 1024 ? (p.value / 1024).toFixed(2) + ' GB' : p.value.toFixed(0));
            return `<div>${p.seriesName}: ${displayValue} ${unit}</div>`;
        }).join('');
        return `<strong>🧵 ${thread}</strong>${dataSourceLabel}${rows}`;
    };
    
    const option = {
        backgroundColor: 'transparent',
        tooltip: {
            trigger: 'axis',
            backgroundColor: 'rgba(30, 41, 59, 0.95)',
            borderWidth: 1,
            textStyle: { color: '#f1f5f9', fontSize: 12 },
            formatter: tooltipFormatter
        },
        grid: {
            left: '8%',
            right: '8%',
            top: '18%',
            bottom: '10%',
            containLabel: true
        },
        xAxis: {
            type: 'category',
            name: '线程数',
            data: xAxisData,
            axisLabel: {
                rotate: xAxisData.length > 10 ? 30 : 0,
                color: '#94a3b8',
                fontSize: 11
            },
            axisLine: { lineStyle: { color: '#475569' } },
            boundaryGap: [0, "5%"] // 固定留白边界，避免曲线紧贴边线
        },
        yAxis: {
            type: 'value',
            name: yAxisName,
            nameTextStyle: { color: '#cbd5e1', fontSize: 12 },
            axisLabel: {
                color: '#94a3b8',
                fontSize: 11,
                formatter: (value) => {
                    if (dataKey === 'memories' && value >= 1024) {
                        return (value / 1024).toFixed(1) + ' GB';
                    }
                    if (dataKey === 'runtimes') {
                        return value.toFixed(2);
                    }
                    return value;
                }
            },
            splitLine: {
                lineStyle: { color: 'rgba(71, 85, 105, 0.3)', type: 'dashed' }
            }
        },
        series: [
            ...seriesList,
            {
                name: '平均值',
                type: 'line',
                data: new Array(xAxisData.length).fill(parseFloat(avgValue)),
                lineStyle: { width: 1.5, color: '#f59e0b', type: 'dashed' },
                symbol: 'none',
                tooltip: { show: false }
            },
            {
                name: '参考线',
                type: 'line',
                data: new Array(xAxisData.length).fill(parseFloat(referenceValue)),
                lineStyle: { width: 1, color: '#06b6d4', type: 'dotted' },
                symbol: 'none',
                tooltip: { show: true, formatter: () => `📊 参考线: ${referenceValue.toFixed(2)} ${dataKey === 'runtimes' ? '秒' : 'MB'}` }
            }
        ],
        legend: {
            data: seriesList.map(s => s.name).concat(['平均值', '参考线']),
            selected: legendSelected,
            textStyle: { color: '#cbd5e1', fontSize: 11 },
            orient: 'horizontal',
            right: 10,
            top: 0,
            itemWidth: 25,
            itemHeight: 12
        },
        toolbox: {
            feature: {
                saveAsImage: { title: '保存为图片' },
                zoom: { title: { zoom: '区域缩放', back: '还原' } },
                restore: { title: '重置' }
            },
            iconStyle: { borderColor: '#94a3b8' },
            right: 10,
            bottom: 10
        }
    };
    
    const chart = customCharts[chartType];
    if (chart && !chart.isDisposed()) {
        chart.setOption(option, { notMerge: true, lazyUpdate: false });
    }
    
    setTimeout(() => {
        if (chart && !chart.isDisposed()) {
            chart.resize();
        }
    }, 50);
}

function refreshCustomCharts() {
    const customView = document.getElementById('customView');
    const isCustomViewActive = customView && customView.classList.contains('active');
    
    if (!isCustomViewActive) {
        console.log('不在自定义图表视图，跳过刷新');
        return;
    }
    
    if (!customState.currentRule) {
        console.log('未选择阶段，跳过刷新');
        return;
    }
    
    console.log('刷新自定义图表:', customState.currentProjectId, customState.currentRule, 'X轴模式:', customState.xAxisMode);
    
    const runtimeContainer = document.getElementById('custom-chart-runtime');
    const memoryContainer = document.getElementById('custom-chart-memory');
    
    if (runtimeContainer && runtimeContainer.offsetWidth > 0) {
        if (customCharts.runtime && !customCharts.runtime.isDisposed()) {
            customCharts.runtime.resize();
        }
    }
    if (memoryContainer && memoryContainer.offsetWidth > 0) {
        if (customCharts.memory && !customCharts.memory.isDisposed()) {
            customCharts.memory.resize();
        }
    }
    
    renderCustomChart('runtime', 'runtimes', 'Runtime (秒)');
    renderCustomChart('memory', 'memories', 'Memory (MB)');
    updateCustomChartTypeButtons();
    
    setTimeout(() => {
        if (customState.currentChartType === 'runtime' && customCharts.runtime && !customCharts.runtime.isDisposed()) {
            customCharts.runtime.resize();
        } else if (customState.currentChartType === 'memory' && customCharts.memory && !customCharts.memory.isDisposed()) {
            customCharts.memory.resize();
        }
    }, 100);
    
    setTimeout(() => {
        if (customState.currentChartType === 'runtime' && customCharts.runtime && !customCharts.runtime.isDisposed()) {
            customCharts.runtime.resize();
        } else if (customState.currentChartType === 'memory' && customCharts.memory && !customCharts.memory.isDisposed()) {
            customCharts.memory.resize();
        }
    }, 200);
}

// ==================================================
// 事件绑定
// ==================================================

function bindCustomChartEvents() {
    const addCaseBtn = document.getElementById('addCaseBtn');
    if (addCaseBtn) {
        addCaseBtn.removeEventListener('click', openAddCaseModal);
        addCaseBtn.addEventListener('click', openAddCaseModal);
    }
    
    const confirmLoadCaseBtn = document.getElementById('confirmLoadCaseBtn');
    if (confirmLoadCaseBtn) {
        confirmLoadCaseBtn.removeEventListener('click', confirmLoadCaseData);
        confirmLoadCaseBtn.addEventListener('click', confirmLoadCaseData);
    }
    
    const closeModalBtns = document.querySelectorAll('#addCaseModal .close-modal-btn, #closeCaseModalBtn, #closeCaseModalBtn2');
    closeModalBtns.forEach(btn => {
        btn.removeEventListener('click', closeAddCaseModal);
        btn.addEventListener('click', closeAddCaseModal);
    });
    
    const addCaseConfigBtn = document.getElementById('addCaseConfigBtn');
    if (addCaseConfigBtn) {
        addCaseConfigBtn.removeEventListener('click', addCaseConfig);
        addCaseConfigBtn.addEventListener('click', addCaseConfig);
    }
    
    const newCasePathInput = document.getElementById('newCasePathInput');
    if (newCasePathInput) {
        newCasePathInput.removeEventListener('keypress', handleCasePathKeypress);
        newCasePathInput.addEventListener('keypress', handleCasePathKeypress);
    }
    
    const toggleDataSourceBtn = document.getElementById('toggleDataSourceBtn');
    if (toggleDataSourceBtn) {
        toggleDataSourceBtn.removeEventListener('click', toggleDataSource);
        toggleDataSourceBtn.addEventListener('click', toggleDataSource);
    }
    
    const customCaseSelect = document.getElementById('customCaseSelect');
    if (customCaseSelect) {
        customCaseSelect.removeEventListener('change', handleCustomCaseChange);
        customCaseSelect.addEventListener('change', handleCustomCaseChange);
    }
    
    const customRuleSelect = document.getElementById('customRuleSelect');
    if (customRuleSelect) {
        customRuleSelect.removeEventListener('change', handleCustomRuleChange);
        customRuleSelect.addEventListener('change', handleCustomRuleChange);
    }
    
    const customRuleSearch = document.getElementById('customRuleSearch');
    if (customRuleSearch) {
        customRuleSearch.removeEventListener('input', customRuleSearchHandler);
        customRuleSearch.addEventListener('input', customRuleSearchHandler);
    }
    
    const customChartRuntimeBtn = document.getElementById('customChartRuntimeBtn');
    if (customChartRuntimeBtn) {
        customChartRuntimeBtn.removeEventListener('click', () => selectCustomChartType('runtime'));
        customChartRuntimeBtn.addEventListener('click', () => selectCustomChartType('runtime'));
    }
    const customChartMemoryBtn = document.getElementById('customChartMemoryBtn');
    if (customChartMemoryBtn) {
        customChartMemoryBtn.removeEventListener('click', () => selectCustomChartType('memory'));
        customChartMemoryBtn.addEventListener('click', () => selectCustomChartType('memory'));
    }
    
    const customOpenDatePickerBtn = document.getElementById('customOpenDatePickerBtn');
    if (customOpenDatePickerBtn) {
        customOpenDatePickerBtn.removeEventListener('click', openCustomDatePickerModal);
        customOpenDatePickerBtn.addEventListener('click', openCustomDatePickerModal);
    }
    
    const customCloseDateModalBtn = document.getElementById('customCloseDateModalBtn');
    if (customCloseDateModalBtn) {
        customCloseDateModalBtn.removeEventListener('click', closeCustomDatePickerModal);
        customCloseDateModalBtn.addEventListener('click', closeCustomDatePickerModal);
    }
    
    const customConfirmDateBtn = document.getElementById('customConfirmDateBtn');
    if (customConfirmDateBtn) {
        customConfirmDateBtn.removeEventListener('click', confirmCustomDateSelection);
        customConfirmDateBtn.addEventListener('click', confirmCustomDateSelection);
    }
    
    const customSelectRecentBtn = document.getElementById('customSelectRecentBtn');
    if (customSelectRecentBtn) {
        customSelectRecentBtn.removeEventListener('click', () => resetCustomDateSelection(false));
        customSelectRecentBtn.addEventListener('click', () => resetCustomDateSelection(false));
    }
    
    const customSelectAllDatesBtn = document.getElementById('customSelectAllDatesBtn');
    if (customSelectAllDatesBtn) {
        customSelectAllDatesBtn.removeEventListener('click', selectAllCustomDates);
        customSelectAllDatesBtn.addEventListener('click', selectAllCustomDates);
    }
    
    const customDeselectAllDatesBtn = document.getElementById('customDeselectAllDatesBtn');
    if (customDeselectAllDatesBtn) {
        customDeselectAllDatesBtn.removeEventListener('click', deselectAllCustomDates);
        customDeselectAllDatesBtn.addEventListener('click', deselectAllCustomDates);
    }
    
    const customInverseDatesBtn = document.getElementById('customInverseDatesBtn');
    if (customInverseDatesBtn) {
        customInverseDatesBtn.removeEventListener('click', inverseSelectCustomDates);
        customInverseDatesBtn.addEventListener('click', inverseSelectCustomDates);
    }
    
    const customDateFilterInput = document.getElementById('customDateFilterInput');
    if (customDateFilterInput) {
        customDateFilterInput.removeEventListener('input', customDateFilterHandler);
        customDateFilterInput.addEventListener('input', customDateFilterHandler);
    }
    
    // ========== 新增 X轴相关事件绑定 ==========
    const customXAxisSelect = document.getElementById('customXAxisSelect');
    if (customXAxisSelect) {
        customXAxisSelect.removeEventListener('change', handleXAxisChange);
        customXAxisSelect.addEventListener('change', handleXAxisChange);
    }
    
    const customOpenThreadSelectorBtn = document.getElementById('customOpenThreadSelectorBtn');
    if (customOpenThreadSelectorBtn) {
        customOpenThreadSelectorBtn.removeEventListener('click', openCustomThreadSelectorModal);
        customOpenThreadSelectorBtn.addEventListener('click', openCustomThreadSelectorModal);
    }
    
    const customSelectAllThreadsBtn = document.getElementById('customSelectAllThreadsBtn');
    if (customSelectAllThreadsBtn) {
        customSelectAllThreadsBtn.removeEventListener('click', selectAllCustomThreadsInModal);
        customSelectAllThreadsBtn.addEventListener('click', selectAllCustomThreadsInModal);
    }
    
    const customDeselectAllThreadsBtn = document.getElementById('customDeselectAllThreadsBtn');
    if (customDeselectAllThreadsBtn) {
        customDeselectAllThreadsBtn.removeEventListener('click', deselectAllCustomThreadsInModal);
        customDeselectAllThreadsBtn.addEventListener('click', deselectAllCustomThreadsInModal);
    }
    
    const customInverseThreadsBtn = document.getElementById('customInverseThreadsBtn');
    if (customInverseThreadsBtn) {
        customInverseThreadsBtn.removeEventListener('click', inverseSelectCustomThreadsInModal);
        customInverseThreadsBtn.addEventListener('click', inverseSelectCustomThreadsInModal);
    }
    
    const customCloseThreadModalBtn = document.getElementById('customCloseThreadModalBtn');
    if (customCloseThreadModalBtn) {
        customCloseThreadModalBtn.removeEventListener('click', closeCustomThreadSelectorModal);
        customCloseThreadModalBtn.addEventListener('click', closeCustomThreadSelectorModal);
    }
    
    const customConfirmThreadModalBtn = document.getElementById('customConfirmThreadModalBtn');
    if (customConfirmThreadModalBtn) {
        customConfirmThreadModalBtn.removeEventListener('click', confirmCustomThreadSelection);
        customConfirmThreadModalBtn.addEventListener('click', confirmCustomThreadSelection);
    }
    
    const customThreadFilterInput = document.getElementById('customThreadFilterInput');
    if (customThreadFilterInput) {
        customThreadFilterInput.removeEventListener('input', debounce(buildCustomThreadSelectorModal, 150));
        customThreadFilterInput.addEventListener('input', debounce(buildCustomThreadSelectorModal, 150));
    }
    
    window.removeEventListener('resize', customChartResizeHandler);
    window.addEventListener('resize', customChartResizeHandler);
}

function handleXAxisChange(e) {
    customState.xAxisMode = e.target.value;
    updateXAxisModeUI();
    if (customState.currentRule) {
        refreshCustomCharts();
    }
}

function handleCasePathKeypress(e) {
    if (e.key === 'Enter') addCaseConfig();
}

function handleCustomCaseChange(e) {
    const newProjectId = e.target.value;
    
    if (customState.currentProjectId === newProjectId) {
        return;
    }
    
    customState.currentProjectId = newProjectId;
    customState.currentRule = null;
    customState.cachedToolData = {};
    customState.selectedDates = [];
    customState.pendingSelectedDates = [];
    customState.availableThreads = [];
    customState.selectedThreads = [];
    customState.selectedThreadsForXAxis = [];
    
    if (customState.currentProjectId) {
        console.log('切换到项目:', customState.currentProjectId);
        
        const projectData = getCurrentCustomProjectData();
        if (projectData) {
            customState.availableDates = projectData.available_dates || projectData.dates || [];
            customState.selectedDates = customState.availableDates.slice(-51);
            updateCustomDateInfo();
            updateCustomRuleSelect();
            updateCustomChartTypeButtons();
            updateXAxisModeUI();
            refreshCustomCharts();
        }
    } else {
        const dateRangeSpan = document.getElementById('customDateRange');
        if (dateRangeSpan) dateRangeSpan.innerText = '无';
        const dataPointsSpan = document.getElementById('customDataPoints');
        if (dataPointsSpan) dataPointsSpan.innerText = '0';
        
        const runtimeChart = customCharts.runtime;
        const memoryChart = customCharts.memory;
        if (runtimeChart) {
            runtimeChart.clear();
            runtimeChart.setOption({
                title: {
                    show: true,
                    text: '请选择一个项目',
                    textStyle: { color: '#94a3b8' },
                    left: 'center',
                    top: 'center'
                }
            }, true);
        }
        if (memoryChart) {
            memoryChart.clear();
            memoryChart.setOption({
                title: {
                    show: true,
                    text: '请选择一个项目',
                    textStyle: { color: '#94a3b8' },
                    left: 'center',
                    top: 'center'
                }
            }, true);
        }
    }
}

function handleCustomRuleChange(e) {
    customState.currentRule = e.target.value;
    if (customState.currentRule) {
        const ruleNameSpan = document.getElementById('customCurrentRuleName');
        if (ruleNameSpan) ruleNameSpan.innerText = customState.currentRule;
        updateCustomDateInfo();
        updateXAxisModeUI();
        refreshCustomCharts();
    }
}

const customRuleSearchHandler = debounce(() => {
    updateCustomRuleSelect();
}, 300);

const customDateFilterHandler = debounce(() => {
    buildCustomDatePicker(true);
}, 150);

const customChartResizeHandler = () => {
    if (customCharts.runtime && !customCharts.runtime.isDisposed()) {
        customCharts.runtime.resize();
    }
    if (customCharts.memory && !customCharts.memory.isDisposed()) {
        customCharts.memory.resize();
    }
};

// 导出全局函数
window.customState = customState;
window.customCharts = customCharts;
window.initCustomCharts = initCustomCharts;
window.selectCustomChartType = selectCustomChartType;
window.refreshCustomCharts = refreshCustomCharts;
window.updateCustomChartTypeButtons = updateCustomChartTypeButtons;
window.bindCustomChartEvents = bindCustomChartEvents;
window.openAddCaseModal = openAddCaseModal;
window.closeAddCaseModal = closeAddCaseModal;
window.addCaseConfig = addCaseConfig;
window.removeCaseConfig = removeCaseConfig;
window.confirmLoadCaseData = confirmLoadCaseData;
window.toggleDataSource = toggleDataSource;
window.preloadDefaultDataForCustom = preloadDefaultDataForCustom;
window.updateCustomCaseSelect = updateCustomCaseSelect;
window.resetCustomDateToRecent = resetCustomDateToRecent;
// 新增导出
window.updateXAxisModeUI = updateXAxisModeUI;