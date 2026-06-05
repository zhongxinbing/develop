document.addEventListener('DOMContentLoaded', () => {
    const select = document.getElementById('singleCaseSelect');
    const ruleSelect = document.getElementById('singleRuleSelect');
    const runtimeBtn = document.getElementById('singleRuntimeBtn');
    const memoryBtn = document.getElementById('singleMemoryBtn');
    const compareRuleA = document.getElementById('singleCompareRuleA');
    const compareRuleB = document.getElementById('singleCompareRuleB');
    const compareMetric = document.getElementById('singleCompareMetric');
    const customRule = document.getElementById('singleCustomRule');
    const customThreadSelect = document.getElementById('singleCustomThreadSelect');
    const customMetric = document.getElementById('singleCustomMetric');
    const chart = createLineChart('singleChart', '单线程曲线');
    const compareChart = createLineChart('singleCompareChart', '单线程对比');
    const customChart = createLineChart('singleCustomChart', '单线程自定义');
    const toolId = window.toolId || 'elint';
    let currentType = 'runtime';
    const cache = {};

    async function fetchProject(pid) {
        if (!pid) return null;
        if (cache[pid]) return cache[pid];
        const resp = await fetch(`/api/project/${toolId}/${pid}`);
        if (!resp.ok) return null;
        const data = await resp.json();
        cache[pid] = data;
        return data;
    }

    function setOptions(selectElement, options) {
        selectElement.innerHTML = options.map(item => `<option value="${item.value}">${item.label}</option>`).join('');
    }

    async function populateCases() {
        const list = window.projectList || [];
        setOptions(select, list.map(p => ({value: p.id, label: p.name})));
        if (list.length > 0) await loadProject(list[0].id);
    }

    async function loadProject(pid) {
        const data = await fetchProject(pid);
        if (!data) return;
        const rules = Object.keys(data.rule_data || {});
        setOptions(ruleSelect, rules.map(r => ({value: r, label: r})));
        setOptions(compareRuleA, rules.map(r => ({value: r, label: r})));
        setOptions(compareRuleB, rules.map(r => ({value: r, label: r})));
        setOptions(customRule, rules.map(r => ({value: r, label: r})));
        if (rules.length > 0) {
            const firstRule = rules[0];
            await renderForRule(firstRule);
            await renderCompare();
            await loadCustomThreads(firstRule);
        }
    }

    async function renderForRule(rule) {
        const pid = select.value;
        if (!pid || !rule) return;
        const data = await fetchProject(pid);
        if (!data) return;
        const ruleInfo = data.rule_data[rule];
        if (!ruleInfo) return;
        const dates = ruleInfo.dates || [];
        const threadIds = Object.keys(ruleInfo.thread_metrics || {});
        const firstThread = threadIds.length > 0 ? threadIds[0] : null;
        const threadData = firstThread ? ruleInfo.thread_metrics[firstThread] : {runtimes: [], memories: []};
        const values = (currentType === 'runtime' ? threadData.runtimes : threadData.memories || []).map(v => (v === null || v === undefined) ? null : parseFloat(v));
        renderTimeSeries(chart, dates, [{name: currentType === 'runtime' ? 'Runtime' : 'Memory', type: 'line', data: values}]);
    }

    async function renderCompare() {
        const pid = select.value;
        const ruleA = compareRuleA.value;
        const ruleB = compareRuleB.value;
        const metric = compareMetric.value || 'runtime';
        if (!pid || !ruleA || !ruleB) return;
        const data = await fetchProject(pid);
        if (!data) return;
        const infoA = data.rule_data?.[ruleA];
        const infoB = data.rule_data?.[ruleB];
        if (!infoA || !infoB) return;
        const dates = Array.from(new Set([...infoA.dates, ...infoB.dates])).sort();
        const threadA = infoA.thread_metrics?.['0'] || {runtimes: [], memories: []};
        const threadB = infoB.thread_metrics?.['0'] || {runtimes: [], memories: []};
        const mapA = Object.fromEntries(infoA.dates.map((d, idx) => [d, threadA[metric]?.[idx] ?? null]));
        const mapB = Object.fromEntries(infoB.dates.map((d, idx) => [d, threadB[metric]?.[idx] ?? null]));
        const valuesA = dates.map(d => mapA[d] == null ? null : parseFloat(mapA[d]));
        const valuesB = dates.map(d => mapB[d] == null ? null : parseFloat(mapB[d]));
        renderTimeSeries(compareChart, dates, [
            {name: `${ruleA} ${metric}`, type: 'line', data: valuesA},
            {name: `${ruleB} ${metric}`, type: 'line', data: valuesB}
        ]);
    }

    async function loadCustomThreads(rule) {
        const pid = select.value;
        if (!pid || !rule) return;
        const data = await fetchProject(pid);
        if (!data) return;
        const threadIds = Object.keys(data.rule_data?.[rule]?.thread_metrics || {}).sort((a, b) => parseInt(a) - parseInt(b));
        setOptions(customThreadSelect, threadIds.map(t => ({value: t, label: `线程 ${t}`})));
        await renderCustom();
    }

    async function renderCustom() {
        const pid = select.value;
        const rule = customRule.value;
        const threadId = customThreadSelect.value;
        const metric = customMetric.value || 'runtime';
        if (!pid || !rule || !threadId) return;
        const data = await fetchProject(pid);
        if (!data) return;
        const info = data.rule_data?.[rule];
        if (!info) return;
        const dates = info.dates || [];
        const threadData = info.thread_metrics?.[threadId] || {runtimes: [], memories: []};
        const values = (threadData[metric] || []).map(v => (v === null || v === undefined) ? null : parseFloat(v));
        renderTimeSeries(customChart, dates, [{name: `线程 ${threadId} ${metric}`, type: 'line', data: values}]);
    }

    runtimeBtn.addEventListener('click', () => {
        currentType = 'runtime';
        runtimeBtn.classList.add('active');
        memoryBtn.classList.remove('active');
        renderForRule(ruleSelect.value);
    });

    memoryBtn.addEventListener('click', () => {
        currentType = 'memory';
        memoryBtn.classList.add('active');
        runtimeBtn.classList.remove('active');
        renderForRule(ruleSelect.value);
    });

    select.addEventListener('change', () => loadProject(select.value));
    ruleSelect.addEventListener('change', () => renderForRule(ruleSelect.value));
    compareRuleA.addEventListener('change', renderCompare);
    compareRuleB.addEventListener('change', renderCompare);
    compareMetric.addEventListener('change', renderCompare);
    customRule.addEventListener('change', () => loadCustomThreads(customRule.value));
    customThreadSelect.addEventListener('change', renderCustom);
    customMetric.addEventListener('change', renderCustom);

    populateCases();
});