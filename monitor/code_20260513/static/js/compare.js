async function loadProjectOptions() {
    const response = await fetch('/api/projects');
    const projects = await response.json();
    const projectSelect = document.getElementById('projectSelect');
    projectSelect.innerHTML = '<option value="">请选择项目</option>';
    projects.forEach(project => {
        const option = document.createElement('option');
        option.value = project.id;
        option.textContent = project.name;
        projectSelect.appendChild(option);
    });
}

async function loadProjectData(projectId) {
    const response = await fetch(`/api/project/${encodeURIComponent(projectId)}`);
    return response.ok ? await response.json() : null;
}

async function loadDates(projectId) {
    const response = await fetch('/api/get_dates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: projectId })
    });
    return response.ok ? await response.json() : null;
}

function updateRuleSelector(rules) {
    const ruleSelect = document.getElementById('ruleSelect');
    ruleSelect.innerHTML = '';
    rules.forEach(rule => {
        const option = document.createElement('option');
        option.value = rule;
        option.textContent = rule;
        ruleSelect.appendChild(option);
    });
}

function updateDateSelectors(dates) {
    const date1 = document.getElementById('date1Select');
    const date2 = document.getElementById('date2Select');
    date1.innerHTML = '<option value="">请选择日期</option>';
    date2.innerHTML = '<option value="">请选择日期</option>';
    dates.forEach(date => {
        const option1 = document.createElement('option');
        option1.value = date;
        option1.textContent = date;
        date1.appendChild(option1);
        const option2 = option1.cloneNode(true);
        date2.appendChild(option2);
    });
}

function renderSummary(summary) {
    const container = document.getElementById('summaryBoxes');
    container.innerHTML = '';
    for (const [label, value] of Object.entries(summary)) {
        const card = document.createElement('div');
        card.className = 'summary-card';
        card.innerHTML = `<strong>${value}</strong><span>${label}</span>`;
        container.appendChild(card);
    }
}

function renderTable(result) {
    const head = document.getElementById('tableHead');
    const body = document.getElementById('tableBody');
    body.innerHTML = '';
    if (result.mode === 'all_rules') {
        head.innerHTML = '<tr><th>阶段</th><th>Runtime(基准)</th><th>Runtime(对比)</th><th>变化</th><th>Memory(基准)</th><th>Memory(对比)</th><th>变化</th></tr>';
        result.rules_comparison.forEach(row => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${row.rule_name}</td>
                <td>${row.runtime1 ?? '-'}</td>
                <td>${row.runtime2 ?? '-'}</td>
                <td>${row.runtime_diff ?? '-'}</td>
                <td>${row.memory1 ?? '-'}</td>
                <td>${row.memory2 ?? '-'}</td>
                <td>${row.memory_diff ?? '-'}</td>
            `;
            body.appendChild(tr);
        });
    } else {
        head.innerHTML = '<tr><th>阶段</th><th>Runtime(基准)</th><th>Runtime(对比)</th><th>Runtime变化</th><th>Memory(基准)</th><th>Memory(对比)</th><th>Memory变化</th></tr>';
        result.comparisons?.forEach(row => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${row.rule_name}</td>
                <td>${row.runtime1 ?? '-'}</td>
                <td>${row.runtime2 ?? '-'}</td>
                <td>${row.runtime_diff ?? '-'}</td>
                <td>${row.memory1 ?? '-'}</td>
                <td>${row.memory2 ?? '-'}</td>
                <td>${row.memory_diff ?? '-'}</td>
            `;
            body.appendChild(tr);
        });
    }
}

function toggleRuleRow(mode) {
    const row = document.getElementById('ruleRow');
    row.style.display = mode === 'single' ? 'grid' : 'none';
}

async function initComparePage() {
    await loadProjectOptions();
    const projectSelect = document.getElementById('projectSelect');
    const compareMode = document.getElementById('compareMode');
    const compareBtn = document.getElementById('compareBtn');
    const compareSummary = document.getElementById('compareSummary');
    const compareTableCard = document.getElementById('compareTableCard');

    projectSelect.addEventListener('change', async () => {
        const projectId = projectSelect.value;
        if (!projectId) return;
        const projectData = await loadProjectData(projectId);
        if (projectData) {
            updateRuleSelector(projectData.rules || []);
            const dates = projectData.dates || [];
            updateDateSelectors(dates);
        }
    });

    compareMode.addEventListener('change', () => {
        toggleRuleRow(compareMode.value);
    });

    compareBtn.addEventListener('click', async () => {
        const projectId = projectSelect.value;
        const mode = compareMode.value;
        const ruleName = document.getElementById('ruleSelect').value || 'all';
        const date1 = document.getElementById('date1Select').value;
        const date2 = document.getElementById('date2Select').value;
        const toleranceRuntime = document.getElementById('toleranceRuntime').value;
        const toleranceMemory = document.getElementById('toleranceMemory').value;
        const toleranceMode = document.getElementById('toleranceMode').value;

        if (!projectId || !date1 || !date2) {
            alert('请选择项目和两个对比日期');
            return;
        }

        const response = await fetch('/api/compare', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                project_id: projectId,
                rule_name: mode === 'all' ? 'all' : ruleName,
                date1,
                date2,
                tolerance_runtime: toleranceRuntime,
                tolerance_memory: toleranceMemory,
                tolerance_mode: toleranceMode
            })
        });
        const data = await response.json();
        if (!data.success) {
            alert(data.error || '对比失败');
            return;
        }
        const result = data.result;
        renderSummary(result.summary || {});
        renderTable(result);
        compareSummary.hidden = false;
        compareTableCard.hidden = false;
    });

    toggleRuleRow(compareMode.value);
}

document.addEventListener('DOMContentLoaded', initComparePage);
