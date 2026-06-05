document.addEventListener('DOMContentLoaded', () => {
    const select = document.getElementById('threadsCaseSelect');
    const ruleSelect = document.getElementById('threadsRuleSelect');
    const dateSelect = document.getElementById('threadsDateSelect');
    const runtimeBtn = document.getElementById('threadsRuntimeBtn');
    const memoryBtn = document.getElementById('threadsMemoryBtn');
    const compareDateA = document.getElementById('threadsCompareDateA');
    const compareDateB = document.getElementById('threadsCompareDateB');
    const compareMetric = document.getElementById('threadsCompareMetric');
    const customRule = document.getElementById('threadsCustomRule');
    const customThreadSelect = document.getElementById('threadsCustomThreadSelect');
    const customMetric = document.getElementById('threadsCustomMetric');
    const chart = createLineChart('threadsChart', '线程分布曲线');
    const compareChart = createLineChart('threadsCompareChart', '线程日期对比');
    const customChart = createLineChart('threadsCustomChart', '线程自定义曲线');
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
        setOptions(customRule, rules.map(r => ({value: r, label: r})));
        if (rules.length > 0) {
            const firstRule = rules[0];
            await loadDates(pid, firstRule);
            await loadCompareDates(pid, firstRule);
            await loadCustomThreads(firstRule);
        }
    }

    async function loadDates(pid, rule) {
        const data = await fetchProject(pid);
        if (!data) return;
        const dates = data.rule_data?.[rule]?.dates || [];
        setOptions(dateSelect, dates.map(d => ({value: d, label: d})));
        if (dates.length > 0) renderThreads(pid, rule, dates[0]);
    }

    async function renderThreads(pid, rule, date) {
        const data = await fetchProject(pid);
        if (!data) return;
        const ruleInfo = data.rule_data?.[rule];
        if (!ruleInfo) return;
        const threadIds = Object.keys(ruleInfo.thread_metrics || {}).sort((a, b) => parseInt(a) - parseInt(b));
        const idx = ruleInfo.dates.indexOf(date);
        const series = threadIds.map(tid => {
            const values = (currentType === 'runtime' ? ruleInfo.thread_metrics[tid].runtimes : ruleInfo.thread_metrics[tid].memories).map(v => (v === null || v === undefined) ? null : parseFloat(v));
            return {name: `线程 ${tid}`, type: 'line', data: values};
        });
        renderTimeSeries(chart, ruleInfo.dates, series);
    }

    async function loadCompareDates(pid, rule) {
        const data = await fetchProject(pid);
        if (!data) return;
        const dates = data.rule_data?.[rule]?.dates || [];
        setOptions(compareDateA, dates.map(d => ({value: d, label: d})));
        setOptions(compareDateB, dates.map(d => ({value: d, label: d})));
        if (dates.length > 1) {
            compareDateB.value = dates[dates.length - 1];
            compareDateA.value = dates[0];
            renderCompare();
        }
    }

    async function renderCompare() {
        const pid = select.value;
        const rule = ruleSelect.value;
        const dateA = compareDateA.value;
        const dateB = compareDateB.value;
        const metric = compareMetric.value || 'runtime';
        if (!pid || !rule || !dateA || !dateB) return;
        const data = await fetchProject(pid);
        if (!data) return;
        const ruleInfo = data.rule_data?.[rule];
        if (!ruleInfo) return;
        const threadIds = Object.keys(ruleInfo.thread_metrics || {}).sort((a, b) => parseInt(a) - parseInt(b));
        const valuesA = threadIds.map(tid => {
            const idx = ruleInfo.dates.indexOf(dateA);
            return idx >= 0 ? ruleInfo.thread_metrics[tid][metric]?.[idx] : null;
        });
        const valuesB = threadIds.map(tid => {
            const idx = ruleInfo.dates.indexOf(dateB);
            return idx >= 0 ? ruleInfo.thread_metrics[tid][metric]?.[idx] : null;
        });
        renderTimeSeries(compareChart, threadIds.map(t => `线程 ${t}`), [
            {name: `${dateA} ${metric}`, type: 'line', data: valuesA.map(v => v == null ? null : parseFloat(v))},
            {name: `${dateB} ${metric}`, type: 'line', data: valuesB.map(v => v == null ? null : parseFloat(v))}
        ]);
    }

    async function loadCustomThreads(rule) {
        const pid = select.value;
        if (!pid || !rule) return;
        const data = await fetchProject(pid);
        if (!data) return;
        const threadIds = Object.keys(data.rule_data?.[rule]?.thread_metrics || {}).sort((a, b) => parseInt(a) - parseInt(b));
        setOptions(customThreadSelect, threadIds.map(t => ({value: t, label: `线程 ${t}`})));
        renderCustom();
    }

    async function renderCustom() {
        const pid = select.value;
        const rule = customRule.value;
        const threadId = customThreadSelect.value;
        const metric = customMetric.value || 'runtime';
        if (!pid || !rule || !threadId) return;
        const data = await fetchProject(pid);
        if (!data) return;
        const ruleInfo = data.rule_data?.[rule];
        if (!ruleInfo) return;
        const values = (ruleInfo.thread_metrics?.[threadId]?.[metric] || []).map(v => (v === null || v === undefined) ? null : parseFloat(v));
        renderTimeSeries(customChart, ruleInfo.dates, [{name: `线程 ${threadId} ${metric}`, type: 'line', data: values}]);
    }

    runtimeBtn.addEventListener('click', () => {
        currentType = 'runtime';
        runtimeBtn.classList.add('active');
        memoryBtn.classList.remove('active');
        renderThreads(select.value, ruleSelect.value, dateSelect.value);
    });

    memoryBtn.addEventListener('click', () => {
        currentType = 'memory';
        memoryBtn.classList.add('active');
        runtimeBtn.classList.remove('active');
        renderThreads(select.value, ruleSelect.value, dateSelect.value);
    });

    select.addEventListener('change', () => loadProject(select.value));
    ruleSelect.addEventListener('change', () => {
        loadDates(select.value, ruleSelect.value);
        loadCompareDates(select.value, ruleSelect.value);
        loadCustomThreads(ruleSelect.value);
    });
    dateSelect.addEventListener('change', () => renderThreads(select.value, ruleSelect.value, dateSelect.value));
    compareDateA.addEventListener('change', renderCompare);
    compareDateB.addEventListener('change', renderCompare);
    compareMetric.addEventListener('change', renderCompare);
    customRule.addEventListener('change', () => loadCustomThreads(customRule.value));
    customThreadSelect.addEventListener('change', renderCustom);
    customMetric.addEventListener('change', renderCustom);

    populateCases();
});