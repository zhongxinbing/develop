document.addEventListener('DOMContentLoaded', () => {
    const caseASelect = document.getElementById('compareCaseA');
    const caseBSelect = document.getElementById('compareCaseB');
    const ruleSelect = document.getElementById('compareRuleSelect');
    const metricSelect = document.getElementById('compareMetricSelect');
    const notice = document.getElementById('compareNotice');
    const chart = createLineChart('compareChart', '项目对比');
    const toolId = window.toolId || 'elint';
    const cache = {};

    function populateCases() {
        const list = window.projectList || [];
        const options = list.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
        caseASelect.innerHTML = options;
        caseBSelect.innerHTML = options;
        if (list.length > 1) {
            caseASelect.value = list[0].id;
            caseBSelect.value = list[1].id;
        }
        if (caseASelect.value && caseBSelect.value) {
            updateRuleOptions();
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

    async function updateRuleOptions() {
        const aData = await fetchProject(caseASelect.value);
        const bData = await fetchProject(caseBSelect.value);
        if (!aData || !bData) {
            ruleSelect.innerHTML = '';
            showNotice('请选择两个有效项目。');
            return;
        }
        const aRules = new Set(Object.keys(aData.rule_data || {}));
        const bRules = new Set(Object.keys(bData.rule_data || {}));
        const common = [...aRules].filter(rule => bRules.has(rule));
        if (common.length === 0) {
            ruleSelect.innerHTML = '';
            showNotice('两个项目间没有共同规则，请切换项目。');
            return;
        }
        ruleSelect.innerHTML = common.map(r => `<option value="${r}">${r}</option>`).join('');
        showNotice('');
        renderCompare();
    }

    function alignSeries(datesA, valuesA, datesB, valuesB) {
        const unionDates = Array.from(new Set([...datesA, ...datesB])).sort();
        const mapA = Object.fromEntries(datesA.map((d, idx) => [d, valuesA[idx]]));
        const mapB = Object.fromEntries(datesB.map((d, idx) => [d, valuesB[idx]]));
        return {
            dates: unionDates,
            valuesA: unionDates.map(d => mapA.hasOwnProperty(d) ? mapA[d] : null),
            valuesB: unionDates.map(d => mapB.hasOwnProperty(d) ? mapB[d] : null)
        };
    }

    async function renderCompare() {
        const aData = await fetchProject(caseASelect.value);
        const bData = await fetchProject(caseBSelect.value);
        const rule = ruleSelect.value;
        if (!aData || !bData || !rule) {
            return;
        }
        const metric = metricSelect.value || 'runtime';
        const aInfo = aData.rule_data?.[rule];
        const bInfo = bData.rule_data?.[rule];
        if (!aInfo || !bInfo) {
            showNotice('选择的规则在某个项目中不存在。');
            return;
        }
        const aDates = aInfo.dates || [];
        const bDates = bInfo.dates || [];
        const aValues = (aInfo.thread_metrics?.['0'] || {runtimes: [], memories: []})[metric] || [];
        const bValues = (bInfo.thread_metrics?.['0'] || {runtimes: [], memories: []})[metric] || [];
        const aligned = alignSeries(aDates, aValues.map(v => v == null ? null : parseFloat(v)), bDates, bValues.map(v => v == null ? null : parseFloat(v)));
        renderTimeSeries(chart, aligned.dates, [
            {name: `${caseASelect.options[caseASelect.selectedIndex].text} (${metric})`, type: 'line', data: aligned.valuesA},
            {name: `${caseBSelect.options[caseBSelect.selectedIndex].text} (${metric})`, type: 'line', data: aligned.valuesB}
        ]);
        showNotice('');
    }

    caseASelect.addEventListener('change', updateRuleOptions);
    caseBSelect.addEventListener('change', updateRuleOptions);
    ruleSelect.addEventListener('change', renderCompare);
    metricSelect.addEventListener('change', renderCompare);

    populateCases();
});