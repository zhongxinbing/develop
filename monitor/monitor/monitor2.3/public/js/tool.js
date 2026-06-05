const toolState = {
  userId: '',
  toolId: '',
  toolConfig: null,
  currentView: 'single',
  currentSubview: 'runtime',
  data: null,
  dateKeys: [],
  selectedDates: [],
  searchRule: '',
  selectedCase: '',
  selectedRule: '',
  compareState: {
    caseName: '',
    compareMode: 'all',
    compareRule: '',
    date1: '',
    date2: '',
    errorMode: 'abs',
    dimension: 'all',
    runtimeRange: '',
    memoryRange: '',
  },
  customCurve: null,
  userAddedData: [],
};

const query = new URLSearchParams(window.location.search);

toolState.userId = query.get('userId');
toolState.toolId = query.get('toolId');

const parseToolParams = () => {
  const caseSelect = document.getElementById('case-select');
  const ruleSelect = document.getElementById('rule-select');
  const compareCase = document.getElementById('compare-case');
  const compareMode = document.getElementById('compare-mode');
  const compareDate1 = document.getElementById('compare-date1');
  const compareDate2 = document.getElementById('compare-date2');

  caseSelect.value = toolState.selectedCase;
  ruleSelect.value = toolState.selectedRule;
  compareCase.value = toolState.compareState.caseName;
  compareMode.value = toolState.compareState.compareMode;
  compareDate1.value = toolState.compareState.date1;
  compareDate2.value = toolState.compareState.date2;
};

const fetchTool = async () => {
  const response = await fetch(`/api/tools/${encodeURIComponent(toolState.toolId)}?userId=${encodeURIComponent(toolState.userId)}`);
  const result = await response.json();
  if (result.error) {
    alert(result.error || '工具加载失败');
    return;
  }
  toolState.toolConfig = result.tool;
  document.getElementById('tool-title').textContent = result.tool.toolName;
  document.getElementById('tool-description').textContent = result.tool.toolDescription;
};

const fetchData = async () => {
  const response = await fetch(`/api/tools/${encodeURIComponent(toolState.toolId)}/data?userId=${encodeURIComponent(toolState.userId)}&view=${toolState.currentView}`);
  const result = await response.json();
  if (result.error) {
    alert(result.error || '数据加载失败');
    return;
  }
  toolState.data = result.data;
  toolState.extraDisplay = result.extraDisplay || [];
  initializeSelectors();
  await loadExtraDataIfNeeded();
  renderChart();
};

const fetchCustomCurve = async () => {
  const response = await fetch(`/api/tools/${encodeURIComponent(toolState.toolId)}/custom-curve?userId=${encodeURIComponent(toolState.userId)}`);
  const result = await response.json();
  toolState.customCurve = result.data;
};

const buildOptions = (series, legend = []) => {
  return {
    tooltip: {
      trigger: 'axis',
      formatter: (params) => {
        if (!Array.isArray(params)) return '';
        const item = params[0];
        const extra = item.data?.extra || {};
        const prev = item.data?.prevValue;
        const cpu = extra.runtime || extra.memory ? `<div>${Object.entries(extra).map(([name, value]) => `${name}: ${value}`).join('<br/>')}</div>` : '';
        return `<div style="text-align:left;">日期: ${item.name}<br/>值: ${item.value}${prev !== undefined ? `<br/>较前一天: ${((item.value - prev) >= 0 ? '+' : '')}${(item.value - prev).toFixed(2)}` : ''}${cpu}${extra.crash ? '<br/><span style="color:#f87171">crash</span>' : ''}</div>`;
      },
    },
    legend: { data: legend, textStyle: { color: '#cbd5e1' } },
    grid: { left: '8%', right: '5%', top: '16%', bottom: '14%' },
    xAxis: { type: 'category', data: toolState.selectedDates, axisLine: { lineStyle: { color: '#475569' } }, axisLabel: { color: '#cbd5e1' } },
    yAxis: { type: 'value', axisLine: { lineStyle: { color: '#475569' } }, splitLine: { lineStyle: { color: 'rgba(148,163,184,0.12)' } }, axisLabel: { color: '#cbd5e1' } },
    series,
  };
};

const getSelectedDateRange = () => {
  if (!toolState.selectedDates.length) return [0, 0];
  return [toolState.selectedDates[0], toolState.selectedDates[toolState.selectedDates.length-1]];
};

const computeSummary = (values = [], metricName) => {
  if (!values.length) return { total: '--', average: '--', max: '--', min: '--', maxRule: '', minRule: '' };
  const total = values.reduce((sum, v) => sum + v.value, 0);
  const avg = total / values.length;
  const maxPoint = values.reduce((acc, v) => acc == null || v.value > acc.value ? v : acc, null);
  const minPoint = values.reduce((acc, v) => acc == null || v.value < acc.value ? v : acc, null);
  return {
    total: total.toFixed(2),
    average: avg.toFixed(2),
    max: maxPoint.value.toFixed(2),
    min: minPoint.value.toFixed(2),
    maxRule: maxPoint.rule || '',
    minRule: minPoint.rule || '',
  };
};

const initializeSelectors = () => {
  const rawCases = Object.keys(toolState.data || {});
  const caseSelect = document.getElementById('case-select');
  const compareCase = document.getElementById('compare-case');
  const compareMode = document.getElementById('compare-mode');
  const compareDate1 = document.getElementById('compare-date1');
  const compareDate2 = document.getElementById('compare-date2');
  const ruleSelect = document.getElementById('rule-select');
  const ruleSearch = document.getElementById('rule-search');

  caseSelect.innerHTML = ''; compareCase.innerHTML = '';
  rawCases.forEach((caseName) => {
    const option = document.createElement('option');
    option.value = caseName; option.textContent = caseName;
    caseSelect.appendChild(option);
    compareCase.appendChild(option.cloneNode(true));
  });

  const rules = new Set();
  rawCases.forEach((caseName) => {
    const metrics = toolState.data[caseName].daily_metrics_key || {};
    Object.values(metrics).forEach((dayItem) => {
      Object.keys(dayItem).forEach((ruleName) => rules.add(ruleName));
    });
  });
  ruleSelect.innerHTML = '';
  Array.from(rules).sort().forEach((ruleName) => {
    const option = document.createElement('option');
    option.value = ruleName; option.textContent = ruleName;
    ruleSelect.appendChild(option);
  });

  compareMode.innerHTML = '<option value="all">对比全部rule</option>' + Array.from(rules).sort().map((ruleName) => `<option value="${ruleName}">${ruleName}</option>`).join('');
  compareDate1.innerHTML = ''; compareDate2.innerHTML = '';
  toolState.dateKeys = Object.keys((toolState.data[rawCases[0]] || {}).daily_metrics_key || {}).sort();
  toolState.selectedDates = [...toolState.dateKeys];
  toolState.dateKeys.forEach((date) => {
    compareDate1.innerHTML += `<option value="${date}">${date}</option>`;
    compareDate2.innerHTML += `<option value="${date}">${date}</option>`;
  });

  toolState.selectedCase = rawCases[0] || '';
  toolState.selectedRule = ruleSelect.options[0] ? ruleSelect.options[0].value : '';
  toolState.compareState.caseName = rawCases[0] || '';
  toolState.compareState.date1 = toolState.dateKeys[0] || '';
  toolState.compareState.date2 = toolState.dateKeys[toolState.dateKeys.length - 1] || '';

  parseToolParams();
  populateDatePicker();
};

const populateDatePicker = () => {
  const dateList = document.getElementById('date-list');
  const dateSearch = document.getElementById('date-search');
  const toggleAll = document.getElementById('toggle-all-dates');

  const renderDates = () => {
    const filter = dateSearch.value.trim();
    dateList.innerHTML = '';
    toolState.dateKeys.filter((date) => date.includes(filter)).forEach((date) => {
      const label = document.createElement('label');
      label.innerHTML = `<input type="checkbox" value="${date}" ${toolState.selectedDates.includes(date) ? 'checked' : ''} /> ${date}`;
      const input = label.querySelector('input');
      input.addEventListener('change', () => {
        if (input.checked) {
          toolState.selectedDates.push(date);
        } else {
          toolState.selectedDates = toolState.selectedDates.filter((item) => item !== date);
        }
        toolState.selectedDates.sort();
      });
      dateList.appendChild(label);
    });
  };

  dateSearch.addEventListener('input', renderDates);
  toggleAll.addEventListener('click', () => {
    const allSelected = toolState.selectedDates.length === toolState.dateKeys.length;
    toolState.selectedDates = allSelected ? [] : [...toolState.dateKeys];
    renderDates();
  });
  renderDates();
};

const getSeriesData = () => {
  if (!toolState.data) return [];
  if (toolState.currentView === 'thread') {
    if (!toolState.customCurve) return [];
    return [{
      name: '自定义曲线',
      type: 'line',
      data: toolState.customCurve.curve.filter((item) => toolState.selectedDates.includes(item.date)).map((item) => item.value),
      symbol: 'circle',
      lineStyle: { width: 3 },
      itemStyle: { color: '#22c55e' },
    }];
  }

  const caseData = toolState.data[toolState.selectedCase] || {};
  const daily = caseData.daily_metrics_key || {};
  const ruleName = toolState.selectedRule;
  const values = toolState.selectedDates.map((date, index) => {
    const ruleData = daily[date]?.[ruleName];
    if (!ruleData) return { value: 0, extra: {}, prevValue: undefined, rule: ruleName };
    const rawValue = toolState.currentSubview === 'memory' ? (ruleData.memory ?? ruleData.thread_metrics?.['1']?.memory ?? 0) : (ruleData.runtime ?? ruleData.thread_metrics?.['1']?.runtime ?? 0);
    const prev = index > 0 ? (toolState.selectedDates[index - 1] in daily ? ((toolState.currentSubview === 'memory' ? (daily[toolState.selectedDates[index - 1]][ruleName]?.memory ?? daily[toolState.selectedDates[index - 1]][ruleName]?.thread_metrics?.['1']?.memory) : (daily[toolState.selectedDates[index - 1]][ruleName]?.runtime ?? daily[toolState.selectedDates[index - 1]][ruleName]?.thread_metrics?.['1']?.runtime)) || 0) : undefined) : undefined;
    const crash = ruleName !== 'Overall' && !(daily[date] && daily[date]['Overall']);
    return {
      value: rawValue.toFixed(2),
      extra: toolState.extraDisplay.reduce((acc, key) => ({ ...acc, [key]: toolState.toolConfig[key] || 'N/A' }), {}),
      prevValue: prev,
      rule: ruleName,
      itemStyle: crash ? { color: '#f87171' } : undefined,
    };
  });
  const seriesData = values.map((item) => ({ value: item.value, extra: item.extra, prevValue: item.prevValue, itemStyle: item.itemStyle, rule: item.rule }));
  const pathSeries = toolState.userAddedData.map((entry) => ({
    name: entry.path,
    type: 'line',
    data: entry.points.map((it) => ({ value: it.value, extra: { source: '用户添加' }, itemStyle: { color: '#22c55e' } })),
    lineStyle: { type: 'dashed' },
    symbol: 'circle',
  }));

  return [{ name: ruleName, type: 'line', data: seriesData, symbol: 'circle', lineStyle: { width: 3 }, itemStyle: { color: '#60a5fa' } }, ...pathSeries];
};

const renderChart = async () => {
  if (!toolState.data) return;
  if (toolState.currentView === 'thread' && !toolState.customCurve) {
    await fetchCustomCurve();
  }
  const chartDom = document.getElementById('chart-container');
  const chart = echarts.init(chartDom);
  const series = getSeriesData();
  const options = buildOptions(series, series.map((item) => item.name));
  chart.setOption(options);

  const values = series[0]?.data?.map((item) => ({ value: Number(item.value), rule: series[0].name }));
  const summary = computeSummary(values || []);
  const range = getSelectedDateRange();
  document.getElementById('range-text').textContent = `${range[0] || '--'} ~ ${range[1] || '--'}`;
  document.getElementById('total-value').textContent = summary.total;
  document.getElementById('average-value').textContent = summary.average;
  document.getElementById('max-value').textContent = summary.max;
  document.getElementById('max-value').title = `最大的 ${toolState.currentSubview} rule: ${summary.maxRule}`;
  document.getElementById('min-value').textContent = summary.min;
  document.getElementById('min-value').title = `最小的 ${toolState.currentSubview} rule: ${summary.minRule}`;
  document.getElementById('overview-text').textContent = `Case数 ${Object.keys(toolState.data).length} · 阶段数 ${toolState.selectedRule || '--'} · 天数 ${toolState.selectedDates.length}`;
};

const handleViewChange = (newView) => {
  toolState.currentView = newView;
  document.querySelectorAll('.view-tabs .tab-button').forEach((button) => button.classList.toggle('active', button.dataset.view === newView));
  fetchData();
};

const handleSubviewChange = (newSubview) => {
  toolState.currentSubview = newSubview;
  document.querySelectorAll('.subview-tabs .tab-button').forEach((button) => button.classList.toggle('active', button.dataset.subview === newSubview));
  document.getElementById('compare-panel').classList.toggle('hidden', newSubview !== 'compare');
  document.getElementById('chart-container').parentElement.classList.toggle('hidden', newSubview === 'compare');
  document.getElementById('stats-grid').classList.toggle('hidden', newSubview === 'compare');
  if (newSubview !== 'compare') {
    renderChart();
  }
};

const attachEventListeners = () => {
  document.querySelectorAll('.view-tabs .tab-button').forEach((button) => {
    button.addEventListener('click', () => handleViewChange(button.dataset.view));
  });
  document.querySelectorAll('.subview-tabs .tab-button').forEach((button) => {
    button.addEventListener('click', () => handleSubviewChange(button.dataset.subview));
  });

  document.getElementById('case-select').addEventListener('change', (event) => {
    toolState.selectedCase = event.target.value;
    renderChart();
  });
  document.getElementById('rule-select').addEventListener('change', (event) => {
    toolState.selectedRule = event.target.value;
    renderChart();
  });
  document.getElementById('rule-search').addEventListener('input', (event) => {
    const query = event.target.value.trim().toLowerCase();
    const options = document.querySelectorAll('#rule-select option');
    options.forEach((opt) => {
      opt.hidden = !opt.value.toLowerCase().includes(query);
    });
  });
  document.getElementById('date-picker-open').addEventListener('click', () => document.getElementById('date-picker-modal').classList.remove('hidden'));
  document.getElementById('close-date-picker').addEventListener('click', () => document.getElementById('date-picker-modal').classList.add('hidden'));
  document.getElementById('apply-date-selection').addEventListener('click', () => {
    toolState.selectedDates.sort();
    document.getElementById('date-picker-modal').classList.add('hidden');
    renderChart();
  });
  document.getElementById('last-50').addEventListener('click', () => {
    toolState.selectedDates = toolState.dateKeys.slice(-50);
    renderChart();
  });
  document.getElementById('add-data').addEventListener('click', () => document.getElementById('add-data-modal').classList.remove('hidden'));
  document.getElementById('close-add-data').addEventListener('click', () => document.getElementById('add-data-modal').classList.add('hidden'));
  document.getElementById('confirm-add-data').addEventListener('click', () => {
    const paths = document.getElementById('add-data-paths').value.split('\n').map((line) => line.trim()).filter(Boolean);
    if (!paths.length) return;
    const today = new Date();
    const points = toolState.selectedDates.slice(-5).map((date, index) => ({
      date,
      value: (Math.random() * 6 + 10).toFixed(2),
    }));
    toolState.userAddedData.push({ path: paths.join(', '), points });
    document.getElementById('add-data-modal').classList.add('hidden');
    document.getElementById('add-data-paths').value = '';
    renderChart();
  });

  document.getElementById('compare-confirm').addEventListener('click', runCompare);
  document.getElementById('export-compare').addEventListener('click', exportCompareResults);
  document.getElementById('compare-case').addEventListener('change', (event) => { toolState.compareState.caseName = event.target.value; });
  document.getElementById('compare-mode').addEventListener('change', (event) => { toolState.compareState.compareMode = event.target.value; });
  document.getElementById('compare-date1').addEventListener('change', (event) => { toolState.compareState.date1 = event.target.value; });
  document.getElementById('compare-date2').addEventListener('change', (event) => { toolState.compareState.date2 = event.target.value; });
  document.getElementById('compare-error').addEventListener('change', (event) => { toolState.compareState.errorMode = event.target.value; });
  document.getElementById('compare-dimension').addEventListener('change', (event) => { toolState.compareState.dimension = event.target.value; });
  document.getElementById('compare-runtime-range').addEventListener('input', (event) => { toolState.compareState.runtimeRange = event.target.value; });
  document.getElementById('compare-memory-range').addEventListener('input', (event) => { toolState.compareState.memoryRange = event.target.value; });
};

const loadExtraDataIfNeeded = async () => {
  if (toolState.currentView === 'thread' && !toolState.customCurve) {
    await fetchCustomCurve();
  }
};

const runCompare = () => {
  const summaryContainer = document.getElementById('compare-results');
  const toolData = toolState.data[toolState.compareState.caseName];
  if (!toolData) {
    summaryContainer.textContent = '请选择有效的 casename。';
    return;
  }
  const day1 = toolData.daily_metrics_key[toolState.compareState.date1] || {};
  const day2 = toolData.daily_metrics_key[toolState.compareState.date2] || {};
  const rules = toolState.compareState.compareMode === 'all'
    ? Array.from(new Set([...Object.keys(day1), ...Object.keys(day2)]))
    : [toolState.compareState.compareMode];

  const rows = rules.map((rule) => {
    const value = (dim) => {
      if (dim === 'runtime') {
        return Number(day2[rule]?.runtime ?? day2[rule]?.thread_metrics?.['1']?.runtime ?? 0) - Number(day1[rule]?.runtime ?? day1[rule]?.thread_metrics?.['1']?.runtime ?? 0);
      }
      if (dim === 'memory') {
        return Number(day2[rule]?.memory ?? day2[rule]?.thread_metrics?.['1']?.memory ?? 0) - Number(day1[rule]?.memory ?? day1[rule]?.thread_metrics?.['1']?.memory ?? 0);
      }
      return Number(day2[rule]?.runtime ?? day2[rule]?.thread_metrics?.['1']?.runtime ?? 0) - Number(day1[rule]?.runtime ?? day1[rule]?.thread_metrics?.['1']?.runtime ?? 0);
    };
    const runtimeDelta = value('runtime');
    const memoryDelta = value('memory');
    const error = toolState.compareState.errorMode === 'pct'
      ? `${((runtimeDelta / ((Number(day1[rule]?.runtime ?? 1))) * 100) || 0).toFixed(2)}% / ${((memoryDelta / ((Number(day1[rule]?.memory ?? 1))) * 100) || 0).toFixed(2)}%` 
      : `${runtimeDelta.toFixed(2)} / ${memoryDelta.toFixed(2)}`;
    return { rule, runtimeDelta, memoryDelta, error };
  });

  const model = rows.filter((row) => {
    if (toolState.compareState.dimension === 'runtime') {
      return Math.abs(row.runtimeDelta) >= Number(toolState.compareState.runtimeRange || 0);
    }
    if (toolState.compareState.dimension === 'memory') {
      return Math.abs(row.memoryDelta) >= Number(toolState.compareState.memoryRange || 0);
    }
    return true;
  });

  const topIncrease = [...model].sort((a, b) => b.runtimeDelta - a.runtimeDelta).slice(0, 10);
  const topDecrease = [...model].sort((a, b) => a.runtimeDelta - b.runtimeDelta).slice(0, 10);
  summaryContainer.innerHTML = `
    <div><strong>对比结果</strong> (${toolState.compareState.date1} vs ${toolState.compareState.date2})</div>
    <div class="stat-card" style="margin-top:12px;">平均变化率: ${model.length ? (model.reduce((sum, item) => sum + Math.abs(item.runtimeDelta), 0) / model.length).toFixed(2) : '0'}</div>
    <div style="margin-top:16px;">${model.map((item) => `<div>${item.rule}: ${item.error}</div>`).join('')}</div>
    <div style="margin-top:16px;"><strong>runtime 增加前十</strong>${topIncrease.map((item) => `<div>${item.rule} ${item.runtimeDelta.toFixed(2)}</div>`).join('')}</div>
    <div style="margin-top:16px;"><strong>runtime 减少前十</strong>${topDecrease.map((item) => `<div>${item.rule} ${item.runtimeDelta.toFixed(2)}</div>`).join('')}</div>
  `;
};

const exportCompareResults = () => {
  const content = document.getElementById('compare-results').innerText;
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `compare-${toolState.toolId}.txt`;
  document.body.appendChild(a);
  a.click();
  URL.revokeObjectURL(url);
  a.remove();
};

window.addEventListener('DOMContentLoaded', async () => {
  if (!toolState.userId || !toolState.toolId) {
    alert('找不到 userId 或 toolId，请返回配置页面重新进入。');
    return;
  }
  await fetchTool();
  attachEventListeners();
  await fetchData();
  handleSubviewChange(toolState.currentSubview);
});
