document.addEventListener('DOMContentLoaded', () => {
    const caseSelect = document.getElementById('customCaseSelect');
    const ruleSelect = document.getElementById('customRuleSelect');
    const threadSelect = document.getElementById('customThreadSelect');
    const metricSelect = document.getElementById('customMetricSelect');
    const notice = document.getElementById('customNotice');
    const chart = createLineChart('customChart', '自定义曲线图');
    const toolId = window.toolId || 'elint';
    const cache = {};

    function populateCases() {
        const list = window.projectList || [];
        caseSelect.innerHTML = list.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
        if (caseSelect.value) {
            loadProject(caseSelect.value);
        }
    }

    function showNotice(message) {
        notice.textContent = message;
        notice.classList.toggle('hidden', !message);
    }

    async function fetchProject(pid) {
        if (!pid) return null;
        if (cache[pid]) return cache[pid];
        const resp = await fetch(`/api/project/${toolId}/${pid}`);
        if (!resp.ok) return null;
        const data = await resp.json();
        cache[pid] = data;
        return data;
    }

    async function loadProject(pid) {
        const data = await fetchProject(pid);
        if (!data) {
            ruleSelect.innerHTML = '';
            threadSelect.innerHTML = '';
            showNotice('请选择有效项目。');
            return;
        }
        const rules = Object.keys(data.rule_data || {});
        ruleSelect.innerHTML = rules.map(r => `<option value="${r}">${r}</option>`).join('');
        if (rules.length > 0) {
            loadThreads(pid, rules[0]);
            showNotice('');
        } else {
            threadSelect.innerHTML = '';
            showNotice('当前项目无可用规则。');
        }
    }

    function loadThreads(pid, rule) {
        const data = cache[pid];
        const ruleInfo = data?.rule_data?.[rule];
        const threadIds = Object.keys(ruleInfo?.thread_metrics || {}).sort((a, b) => parseInt(a) - parseInt(b));
        if (threadIds.length === 0) {
            threadSelect.innerHTML = '';
            showNotice('当前规则未包含线程数据。');
            return;
        }
        threadSelect.innerHTML = threadIds.map(t => `<option value="${t}">线程 ${t}</option>`).join('');
        renderCustom();
    }

    async function renderCustom() {
        const pid = caseSelect.value;
        const rule = ruleSelect.value;
        const threadId = threadSelect.value;
        const metric = metricSelect.value || 'runtime';
        if (!pid || !rule || !threadId) {
            showNotice('请选择项目、规则与线程。');
            return;
        }
        const data = await fetchProject(pid);
        if (!data) {
            showNotice('无法加载项目数据。');
            return;
        }
        const ruleInfo = data.rule_data?.[rule];
        if (!ruleInfo) {
            showNotice('当前规则不存在。');
            return;
        }
        const dates = ruleInfo.dates || [];
        const threadData = ruleInfo.thread_metrics?.[threadId] || {runtimes: [], memories: []};
        const values = (threadData[metric] || []).map(v => (v === null || v === undefined) ? null : parseFloat(v));
        renderTimeSeries(chart, dates, [{ name: `线程 ${threadId} ${metric}`, type: 'line', data: values }]);
        showNotice('');
    }

    caseSelect.addEventListener('change', () => loadProject(caseSelect.value));
    ruleSelect.addEventListener('change', () => loadThreads(caseSelect.value, ruleSelect.value));
    threadSelect.addEventListener('change', renderCustom);
    metricSelect.addEventListener('change', renderCustom);

    populateCases();
});