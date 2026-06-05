const API_BASE = 'http://localhost:3000/api';

let currentToolId = null;
let currentToolConfig = null;
let currentSingleData = null;
let currentMultiData = null;
let selectedDates = [];
let currentView = 'single';

// 初始化
document.addEventListener('DOMContentLoaded', async () => {
    const urlParams = new URLSearchParams(window.location.search);
    currentToolId = urlParams.get('toolId');
    
    if (!currentToolId) {
        alert('无效的工具ID');
        window.location.href = 'index.html';
        return;
    }
    
    await loadToolConfig();
    await loadCasenames();
    setupEventListeners();
    setupTabEvents();
});

async function loadToolConfig() {
    try {
        const response = await fetch(`${API_BASE}/tools/${currentToolId}`);
        currentToolConfig = await response.json();
        
        document.getElementById('toolName').textContent = currentToolConfig.toolName;
        document.getElementById('toolDescription').textContent = currentToolConfig.toolDescription || '';
    } catch (error) {
        console.error('Failed to load tool config:', error);
        showError('加载工具配置失败');
    }
}

async function loadCasenames() {
    try {
        // 从数据中获取casename列表
        const data = await loadSingleThreadData();
        if (data) {
            const casenames = Object.keys(data);
            populateCasenameSelects(casenames);
        }
    } catch (error) {
        console.error('Failed to load casenames:', error);
    }
}

async function loadSingleThreadData(casename = null) {
    try {
        const selectedCasename = casename || document.getElementById('singleCasename')?.value;
        if (!selectedCasename) return null;
        
        const response = await fetch(`${API_BASE}/data/single/${currentToolId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                casename: selectedCasename,
                dataSource: currentToolConfig.singleThreadFunc
            })
        });
        
        currentSingleData = await response.json();
        return currentSingleData;
    } catch (error) {
        console.error('Failed to load single thread data:', error);
        return null;
    }
}

async function loadMultiThreadData(casename = null, threadNum = null) {
    try {
        const selectedCasename = casename || document.getElementById('multiCasename')?.value;
        const selectedThreadNum = threadNum || document.getElementById('multiThreadNum')?.value;
        
        if (!selectedCasename || !selectedThreadNum) return null;
        
        const response = await fetch(`${API_BASE}/data/multi/${currentToolId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                casename: selectedCasename,
                threadNum: parseInt(selectedThreadNum),
                dataSource: currentToolConfig.multiThreadFunc
            })
        });
        
        currentMultiData = await response.json();
        return currentMultiData;
    } catch (error) {
        console.error('Failed to load multi thread data:', error);
        return null;
    }
}

function populateCasenameSelects(casenames) {
    const selects = ['singleCasename', 'multiCasename', 'compareCasename'];
    selects.forEach(selectId => {
        const select = document.getElementById(selectId);
        if (select) {
            select.innerHTML = '<option value="">请选择Case</option>' +
                casenames.map(name => `<option value="${name}">${name}</option>`).join('');
        }
    });
}

function setupEventListeners() {
    // 单线程事件
    document.getElementById('singleCasename')?.addEventListener('change', onSingleCasenameChange);
    document.getElementById('singleRule')?.addEventListener('change', onSingleRuleChange);
    document.getElementById('singleRuleSearch')?.addEventListener('input', onSingleRuleSearch);
    document.getElementById('singleDateBtn')?.addEventListener('click', () => openDateModal('single'));
    document.getElementById('singleLatest50Btn')?.addEventListener('click', () => loadLatest50Days('single'));
    document.getElementById('singleAddDataBtn')?.addEventListener('click', () => openAddDataModal('single'));
    
    // 多线程事件
    document.getElementById('multiCasename')?.addEventListener('change', onMultiCasenameChange);
    document.getElementById('multiThreadNum')?.addEventListener('change', onMultiThreadNumChange);
    document.getElementById('multiRule')?.addEventListener('change', onMultiRuleChange);
    document.getElementById('multiRuleSearch')?.addEventListener('input', onMultiRuleSearch);
    document.getElementById('multiDateBtn')?.addEventListener('click', () => openDateModal('multi'));
    document.getElementById('multiLatest50Btn')?.addEventListener('click', () => loadLatest50Days('multi'));
    document.getElementById('multiAddDataBtn')?.addEventListener('click', () => openAddDataModal('multi'));
}

function setupTabEvents() {
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const view = btn.dataset.view;
            switchView(view);
        });
    });
}

function switchView(view) {
    currentView = view;
    
    // 更新按钮样式
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.view === view) {
            btn.classList.add('active');
        }
    });
    
    // 显示对应视图
    document.querySelectorAll('.view-container').forEach(container => {
        container.classList.remove('active');
    });
    document.getElementById(`${view}View`).classList.add('active');
    
    // 加载对应数据
    if (view === 'single') {
        loadSingleViewData();
    } else if (view === 'multi') {
        loadMultiViewData();
    } else if (view === 'compare') {
        loadCompareViewData();
    }
}

async function onSingleCasenameChange() {
    const casename = document.getElementById('singleCasename').value;
    if (casename) {
        await loadSingleThreadData(casename);
        updateSingleRuleSelect();
        await updateSingleCharts();
    }
}

function updateSingleRuleSelect() {
    if (!currentSingleData) return;
    
    const casename = document.getElementById('singleCasename').value;
    const data = currentSingleData[casename];
    
    if (data && data.daily_metrics_key) {
        const rules = new Set();
        Object.values(data.daily_metrics_key).forEach(dayData => {
            Object.keys(dayData).forEach(rule => rules.add(rule));
        });
        
        const ruleSelect = document.getElementById('singleRule');
        ruleSelect.innerHTML = '<option value="">全部Rule</option>' +
            Array.from(rules).map(rule => `<option value="${rule}">${rule}</option>`).join('');
    }
}

function onSingleRuleSearch() {
    const searchTerm = document.getElementById('singleRuleSearch').value.toLowerCase();
    const ruleSelect = document.getElementById('singleRule');
    const options = ruleSelect.options;
    
    for (let i = 1; i < options.length; i++) {
        const text = options[i].text.toLowerCase();
        options[i].style.display = text.includes(searchTerm) ? '' : 'none';
    }
}

async function updateSingleCharts() {
    const casename = document.getElementById('singleCasename').value;
    const selectedRule = document.getElementById('singleRule').value;
    
    if (!currentSingleData || !casename) return;
    
    const data = currentSingleData[casename];
    if (!data || !data.daily_metrics_key) return;
    
    // 准备数据
    const dates = [];
    const runtimeData = [];
    const memoryData = [];
    
    const sortedDates = Object.keys(data.daily_metrics_key).sort();
    const displayDates = selectedDates.length > 0 ? sortedDates.filter(d => selectedDates.includes(d)) : sortedDates;
    
    for (const date of displayDates) {
        const dayData = data.daily_metrics_key[date];
        let totalRuntime = 0;
        let totalMemory = 0;
        let ruleCount = 0;
        
        for (const [rule, metrics] of Object.entries(dayData)) {
            if (selectedRule && selectedRule !== rule) continue;
            
            // 检查是否crash（没有Overall rule）
            if (rule === 'Overall' && !dayData['Overall']) {
                // 标记为crash，数据点显示红色
                totalRuntime = NaN;
                totalMemory = NaN;
                break;
            }
            
            totalRuntime += metrics.runtime || 0;
            totalMemory += metrics.memory || 0;
            ruleCount++;
        }
        
        if (!isNaN(totalRuntime)) {
            runtimeData.push([date, totalRuntime / ruleCount]);
            memoryData.push([date, totalMemory / ruleCount]);
        } else {
            runtimeData.push([date, null]);
            memoryData.push([date, null]);
        }
    }
    
    // 渲染图表
    renderRuntimeChart('singleRuntimeChart', runtimeData, currentToolConfig);
    renderMemoryChart('singleMemoryChart', memoryData, currentToolConfig);
    
    // 更新统计信息
    updateSingleStats(runtimeData, memoryData);
}

function updateSingleStats(runtimeData, memoryData) {
    const runtimeValues = runtimeData.filter(d => d[1] !== null).map(d => d[1]);
    const memoryValues = memoryData.filter(d => d[1] !== null).map(d => d[1]);
    
    const runtimeStats = {
        total: runtimeValues.reduce((a, b) => a + b, 0),
        average: runtimeValues.reduce((a, b) => a + b, 0) / runtimeValues.length,
        max: Math.max(...runtimeValues),
        min: Math.min(...runtimeValues)
    };
    
    const memoryStats = {
        total: memoryValues.reduce((a, b) => a + b, 0),
        average: memoryValues.reduce((a, b) => a + b, 0) / memoryValues.length,
        max: Math.max(...memoryValues),
        min: Math.min(...memoryValues)
    };
    
    // 显示统计信息
    document.getElementById('singleRuntimeStats').innerHTML = `
        <div class="stat-item">
            <span class="stat-label">日期范围</span>
            <span class="stat-value">${runtimeData[0]?.[0] || '-'} ~ ${runtimeData[runtimeData.length-1]?.[0] || '-'}</span>
        </div>
        <div class="stat-item">
            <span class="stat-label">总Runtime</span>
            <span class="stat-value">${runtimeStats.total.toFixed(2)}</span>
        </div>
        <div class="stat-item">
            <span class="stat-label">平均Runtime</span>
            <span class="stat-value">${runtimeStats.average.toFixed(2)}</span>
        </div>
        <div class="stat-item stat-tooltip" title="最大Runtime的Rule详情">
            <span class="stat-label">最大Runtime</span>
            <span class="stat-value">${runtimeStats.max.toFixed(2)}</span>
        </div>
        <div class="stat-item stat-tooltip" title="最小Runtime的Rule详情">
            <span class="stat-label">最小Runtime</span>
            <span class="stat-value">${runtimeStats.min.toFixed(2)}</span>
        </div>
    `;
    
    document.getElementById('singleMemoryStats').innerHTML = `
        <div class="stat-item">
            <span class="stat-label">总Memory</span>
            <span class="stat-value">${memoryStats.total.toFixed(2)} MB</span>
        </div>
        <div class="stat-item">
            <span class="stat-label">平均Memory</span>
            <span class="stat-value">${memoryStats.average.toFixed(2)} MB</span>
        </div>
        <div class="stat-item stat-tooltip" title="最大Memory的Rule详情">
            <span class="stat-label">最大Memory</span>
            <span class="stat-value">${memoryStats.max.toFixed(2)} MB</span>
        </div>
        <div class="stat-item stat-tooltip" title="最小Memory的Rule详情">
            <span class="stat-label">最小Memory</span>
            <span class="stat-value">${memoryStats.min.toFixed(2)} MB</span>
        </div>
    `;
    
    // 更新概况
    const totalCases = Object.keys(currentSingleData).length;
    const totalDays = runtimeData.length;
    document.getElementById('singleOverview').innerHTML = `
        <div class="overview-stat">
            <span class="label">总Case数</span>
            <span class="value">${totalCases}</span>
        </div>
        <div class="overview-stat">
            <span class="label">总天数</span>
            <span class="value">${totalDays}</span>
        </div>
    `;
}

function onSingleRuleChange() {
    updateSingleCharts();
}

function loadLatest50Days(view) {
    // 加载最近50天的数据
    if (view === 'single' && currentSingleData) {
        const casename = document.getElementById('singleCasename').value;
        const data = currentSingleData[casename];
        if (data && data.daily_metrics_key) {
            const dates = Object.keys(data.daily_metrics_key).sort();
            selectedDates = dates.slice(-50);
            updateSingleCharts();
        }
    }
}

function openDateModal(view) {
    currentViewForModal = view;
    const modal = document.getElementById('dateModal');
    const datesList = document.getElementById('datesList');
    
    // 获取所有日期
    let dates = [];
    if (view === 'single' && currentSingleData) {
        const casename = document.getElementById('singleCasename').value;
        const data = currentSingleData[casename];
        if (data && data.daily_metrics_key) {
            dates = Object.keys(data.daily_metrics_key).sort();
        }
    } else if (view === 'multi' && currentMultiData) {
        const casename = document.getElementById('multiCasename').value;
        const data = currentMultiData[casename];
        if (data && data.daily_metrics_key) {
            dates = Object.keys(data.daily_metrics_key).sort();
        }
    }
    
    datesList.innerHTML = dates.map(date => `
        <label class="date-checkbox">
            <input type="checkbox" value="${date}" ${selectedDates.includes(date) ? 'checked' : ''}>
            <span>${date}</span>
        </label>
    `).join('');
    
    modal.style.display = 'flex';
}

function closeDateModal() {
    document.getElementById('dateModal').style.display = 'none';
}

function confirmDates() {
    const checkboxes = document.querySelectorAll('#datesList input[type="checkbox"]');
    selectedDates = Array.from(checkboxes).filter(cb => cb.checked).map(cb => cb.value);
    closeDateModal();
    
    if (currentViewForModal === 'single') {
        updateSingleCharts();
    } else if (currentViewForModal === 'multi') {
        updateMultiCharts();
    }
}

function openAddDataModal(view) {
    currentViewForModal = view;
    const modal = document.getElementById('addDataModal');
    modal.style.display = 'flex';
}

function closeAddDataModal() {
    document.getElementById('addDataModal').style.display = 'none';
    document.getElementById('dataPaths').value = '';
}

async function confirmAddData() {
    const paths = document.getElementById('dataPaths').value.split('\n').filter(p => p.trim());
    
    try {
        const response = await fetch(`${API_BASE}/data/user-data/${currentToolId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ paths })
        });
        
        if (response.ok) {
            closeAddDataModal();
            // 重新加载数据
            if (currentViewForModal === 'single') {
                await loadSingleThreadData();
                updateSingleCharts();
            } else if (currentViewForModal === 'multi') {
                await loadMultiThreadData();
                updateMultiCharts();
            }
            showSuccess('数据添加成功');
        } else {
            showError('数据添加失败');
        }
    } catch (error) {
        console.error('Failed to add data:', error);
        showError('数据添加失败');
    }
}

function showError(message) {
    alert(message);
}

function showSuccess(message) {
    alert(message);
}

// 多线程相关函数（类似单线程，需要实现）
async function loadSingleViewData() {
    // 实现加载单线程视图数据
}

async function loadMultiViewData() {
    // 实现加载多线程视图数据
}

async function loadCompareViewData() {
    // 实现加载对比视图数据
}

async function onMultiCasenameChange() {
    // 实现多线程casename变化处理
}

async function onMultiThreadNumChange() {
    // 实现线程数变化处理
}

function onMultiRuleChange() {
    // 实现多线程rule变化处理
}

function onMultiRuleSearch() {
    // 实现多线程rule搜索
}

async function updateMultiCharts() {
    // 实现多线程图表更新
}