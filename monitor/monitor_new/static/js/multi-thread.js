document.addEventListener('DOMContentLoaded', () => {
    const select = document.getElementById('multiCaseSelect');
    const ruleSelect = document.getElementById('multiRuleSelect');
    const runtimeBtn = document.getElementById('multiRuntimeBtn');
    const memoryBtn = document.getElementById('multiMemoryBtn');
    const compareRuleA = document.getElementById('multiCompareRuleA');
    const compareRuleB = document.getElementById('multiCompareRuleB');
    const compareMetric = document.getElementById('multiCompareMetric');
    const customRule = document.getElementById('multiCustomRule');
    const customThreadSelect = document.getElementById('multiCustomThreadSelect');
    const customMetric = document.getElementById('multiCustomMetric');
    const chart = createLineChart('multiChart', '多线程曲线');
    const compareChart = createLineChart('multiCompareChart', '多线程对比');
    const customChart = createLineChart('multiCustomChart', '多线程自定义');
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

    function renderForRule(rule) {
        const pid = select.value;
        if (!pid || !rule) return;
        return fetchProject(pid).then(data => {
            if (!data) return;
            const ruleInfo = data.rule_data[rule];
            if (!ruleInfo) return;
            const dates = ruleInfo.dates || [];
            const threadIds = Object.keys(ruleInfo.thread_metrics || {}).sort((a, b) => parseInt(a) - parseInt(b));
            const series = threadIds.map(tid => {
                const pointData = ruleInfo.thread_metrics[tid] || {runtimes: [], memories: []};
                const values = (currentType === 'runtime' ? pointData.runtimes : pointData.memories || []).map(v => (v === null || v === undefined) ? null : parseFloat(v));
                return {name: `线程 ${tid}`, type: 'line', data: values};
            });
            renderTimeSeries(chart, dates, series);
        });
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
        const date = infoA.dates[infoA.dates.length - 1] || infoB.dates[infoB.dates.length - 1];
        const threadIds = Array.from(new Set([...Object.keys(infoA.thread_metrics || {}), ...Object.keys(infoB.thread_metrics || {})])).sort((a, b) => parseInt(a) - parseInt(b));
        const valuesA = threadIds.map(tid => {
            const row = infoA.thread_metrics?.[tid] || {runtimes: [], memories: []};
            const idx = infoA.dates.indexOf(date);
            return idx >= 0 ? row[metric]?.[idx] : null;
        });
        const valuesB = threadIds.map(tid => {
            const row = infoB.thread_metrics?.[tid] || {runtimes: [], memories: []};
            const idx = infoB.dates.indexOf(date);
            return idx >= 0 ? row[metric]?.[idx] : null;
        });
        renderTimeSeries(compareChart, threadIds.map(t => `线程 ${t}`), [
            {name: `${ruleA} ${metric}`, type: 'line', data: valuesA.map(v => v == null ? null : parseFloat(v))},
            {name: `${ruleB} ${metric}`, type: 'line', data: valuesB.map(v => v == null ? null : parseFloat(v))}
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