const pageId = document.body.dataset.page;

function safeJson(obj) {
    try {
        return JSON.parse(obj);
    } catch {
        return obj;
    }
}

function initHomePage() {
    document.querySelectorAll('.tool-enter').forEach(button => {
        button.addEventListener('click', async () => {
            const tool = button.dataset.tool;
            const payload = { tool, thread: 'single' };
            await fetch('/api/config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            window.location.href = '/elint';
        });
    });
    document.getElementById('defaultMonitorBtn')?.addEventListener('click', () => {
        window.location.href = '/elint';
    });
}

function initMonitorPage() {
    const projectSelect = document.getElementById('projectSelect');
    const ruleSelect = document.getElementById('ruleSelect');
    const ruleSearch = document.getElementById('ruleSearch');
    const refreshBtn = document.getElementById('refreshBtn');
    const cpuLabel = document.getElementById('perfCpu');
    const memLabel = document.getElementById('perfMem');
    const extraLabel = document.getElementById('perfExtra');
    const threadSection = document.getElementById('threadSection');
    const modeButtons = Array.from(document.querySelectorAll('.toggle-btn'));

    let activeMode = initialThreadMode || 'single';
    let selectedProject = initialProjectId || '';
    let currentRule = '';
    let charts = {};

    function updatePerf() {
        cpuLabel.textContent = perfStats?.cpu || 'N/A';
        memLabel.textContent = perfStats?.memory || 'N/A';
        extraLabel.textContent = perfStats?.extra || 'N/A';
    }

    function buildProjectOptions() {
        Object.entries(projectsData).forEach(([id, project]) => {
            const option = document.createElement('option');
            option.value = id;
            option.textContent = project.project_name;
            projectSelect.appendChild(option);
        });
        if (!selectedProject) {
            selectedProject = projectSelect.options[0]?.value || '';
        }
        projectSelect.value = selectedProject;
    }

    function getActiveProject() {
        return projectsData[selectedProject] || Object.values(projectsData)[0] || null;
    }

    function buildRuleOptions() {
        const project = getActiveProject();
        if (!project) {
            return;
        }
        ruleSelect.innerHTML = '';
        const rules = project.rules || [];
        rules.forEach(rule => {
            const option = document.createElement('option');
            option.value = rule;
            option.textContent = rule;
            ruleSelect.appendChild(option);
        });
        currentRule = rules[0] || '';
        ruleSelect.value = currentRule;
    }

    function renderCharts() {
        const project = getActiveProject();
        if (!project || !currentRule) {
            return;
        }
        const ruleData = project.rule_data[currentRule] || {};
        const dates = project.dates || [];
        const runtime = (ruleData.runtimes || []).map(v => v == null ? '-' : v);
        const memory = (ruleData.memories || []).map(v => v == null ? '-' : v);

        if (!charts.runtime) {
            charts.runtime = echarts.init(document.getElementById('chartRuntime'));
        }
        if (!charts.memory) {
            charts.memory = echarts.init(document.getElementById('chartMemory'));
        }

        charts.runtime.setOption({
            title: { text: `${currentRule} - Runtime`, left: 'left', textStyle: { color: '#111827' }},
            tooltip: { trigger: 'axis' },
            xAxis: { type: 'category', data: dates, boundaryGap: false },
            yAxis: { type: 'value', name: '秒' },
            series: [{ name: 'Runtime', type: 'line', data: runtime, smooth: true, lineStyle: { color: '#2563eb' } }]
        });

        charts.memory.setOption({
            title: { text: `${currentRule} - Memory`, left: 'left', textStyle: { color: '#111827' }},
            tooltip: { trigger: 'axis' },
            xAxis: { type: 'category', data: dates, boundaryGap: false },
            yAxis: { type: 'value', name: 'MB' },
            series: [{ name: 'Memory', type: 'line', data: memory, smooth: true, lineStyle: { color: '#10b981' } }]
        });

        if (activeMode === 'multi') {
            threadSection.hidden = false;
            renderThreadChart(project, currentRule, project.dates);
        } else {
            threadSection.hidden = true;
        }
    }

    function renderThreadChart(project, rule, dates) {
        const ruleData = project.rule_data[rule] || {};
        const threadKeys = ruleData.thread_counts || [];
        const chartEl = document.getElementById('chartThread');
        if (!charts.thread) {
            charts.thread = echarts.init(chartEl);
        }
        const series = threadKeys.map(key => {
            const threadInfo = ruleData.thread_metrics?.[key] || { runtimes: [], memories: [] };
            return {
                name: `${key} 线程`,
                type: 'line',
                data: threadInfo.runtimes.map(v => v == null ? '-' : v),
                smooth: true
            };
        });
        charts.thread.setOption({
            title: { text: `${currentRule} - 线程 Runtime`, left: 'left', textStyle: { color: '#111827' }},
            tooltip: { trigger: 'axis' },
            legend: { type: 'scroll', top: 32 },
            xAxis: { type: 'category', data: dates, boundaryGap: false },
            yAxis: { type: 'value', name: '秒' },
            series
        });
    }

    function refreshPage() {
        if (!projectSelect.options.length) return;
        buildRuleOptions();
        updatePerf();
        renderCharts();
    }

    projectSelect.addEventListener('change', () => {
        selectedProject = projectSelect.value;
        refreshPage();
    });
    ruleSelect.addEventListener('change', () => {
        currentRule = ruleSelect.value;
        renderCharts();
    });
    ruleSearch.addEventListener('input', () => {
        const keyword = ruleSearch.value.trim().toLowerCase();
        const project = getActiveProject();
        ruleSelect.innerHTML = '';
        project.rules.filter(rule => rule.toLowerCase().includes(keyword)).forEach(rule => {
            const option = document.createElement('option');
            option.value = rule;
            option.textContent = rule;
            ruleSelect.appendChild(option);
        });
        currentRule = ruleSelect.value || currentRule;
        renderCharts();
    });
    refreshBtn.addEventListener('click', async () => {
            refreshBtn.disabled = true;
            refreshBtn.textContent = '刷新中...';
        try {
            const response = await fetch('/api/refresh', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tool: 'elint', thread: activeMode })
            });
            const data = await response.json();
            if (data.success) {
                window.location.reload();
            } else {
                alert(data.message || '刷新失败');
            }
        } catch (error) {
            console.error(error);
            alert('刷新失败，请检查控制台');
            } finally {
                refreshBtn.disabled = false;
                refreshBtn.textContent = '刷新数据';
        }
    });
    modeButtons.forEach(button => {
        button.addEventListener('click', () => {
            modeButtons.forEach(item => item.classList.remove('active'));
            button.classList.add('active');
            activeMode = button.dataset.mode;
            renderCharts();
        });
    });

    buildProjectOptions();
    modeButtons.forEach(button => {
        if (button.dataset.mode === activeMode) button.classList.add('active');
    });
    refreshPage();
}

function init() {
    if (pageId === 'home') {
        initHomePage();
    }
    if (pageId === 'monitor') {
        initMonitorPage();
    }
}

document.addEventListener('DOMContentLoaded', init);
