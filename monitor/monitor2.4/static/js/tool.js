let toolInfo = null;
let toolData = null;
let catalog = { cases: [], rules: [], dates: [] };
let activeMode = 'single';
let activeView = 'runtime';
let selectedCase = '';
let selectedRule = '';
let selectedDates = [];
let userAddedData = [];
let chartInstance = null;

async function fetchToolDetail() {
  const response = await fetch(`/api/tool/${TOOL_ID}`);
  if (!response.ok) {
    alert('工具信息加载失败');
    return null;
  }
  return response.json();
}

async function fetchCatalog() {
  const response = await fetch(`/api/tool/${TOOL_ID}/catalog`);
  if (!response.ok) {
    return { cases: [], rules: [], dates: [] };
  }
  return response.json();
}

function formatNumber(value) {
  return Number(value).toFixed(2);
}

function getSourceData() {
  const source = activeMode === 'single' ? toolData.single_thread : toolData.multi_thread;
  return source.concat(userAddedData.filter(item => item.mode === activeMode));
}

function filterItems(items) {
  return items.filter(item => {
    if (selectedCase && item.case !== selectedCase) {
      return false;
    }
    if (selectedRule && item.rule !== selectedRule) {
      return false;
    }
    if (selectedDates.length && !selectedDates.includes(item.date)) {
      return false;
    }
    return true;
  });
}

function buildOptions(selectElement, values, defaultLabel) {
  selectElement.innerHTML = '';
  const first = document.createElement('option');
  first.value = '';
  first.textContent = defaultLabel;
  selectElement.appendChild(first);
  values.forEach(value => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = value;
    selectElement.appendChild(option);
  });
}

function renderToolInfo() {
  document.getElementById('tool-name').textContent = toolInfo.name;
  document.getElementById('tool-desc').textContent = toolInfo.description || '暂无描述';
  const meta = document.getElementById('tool-extra');
  meta.innerHTML = `
    <span><strong>单线程路径：</strong>${toolInfo.single_path || '未配置'}</span>
    <span><strong>多线程路径：</strong>${toolInfo.multi_path || '未配置'}</span>
    <span><strong>额外字段：</strong>${toolInfo.extra_fields?.join(', ') || '无'}</span>
  `;
}

function renderTabs() {
  const modeTabs = document.getElementById('mode-tabs');
  const viewTabs = document.getElementById('view-tabs');
  modeTabs.innerHTML = '';
  viewTabs.innerHTML = '';
  ['single', 'multi', 'thread'].forEach(mode => {
    const button = document.createElement('button');
    button.className = `tab-button ${activeMode === mode ? 'active' : ''}`;
    button.textContent = mode === 'single' ? '单线程' : mode === 'multi' ? '多线程' : '线程曲线';
    button.addEventListener('click', () => {
      activeMode = mode;
      selectedDates = catalog.dates.slice(-50);
      renderTabs();
      renderFilters();
      renderChart();
    });
    modeTabs.appendChild(button);
  });

  ['runtime', 'memory', 'compare'].forEach(view => {
    const button = document.createElement('button');
    button.className = `tab-button ${activeView === view ? 'active' : ''}`;
    button.textContent = view === 'runtime' ? 'runtime' : view === 'memory' ? 'memory' : '数据对比';
    button.addEventListener('click', () => {
      activeView = view;
      renderTabs();
      renderChart();
      document.getElementById('compare-panel').style.display = view === 'compare' ? 'block' : 'none';
    });
    viewTabs.appendChild(button);
  });
}

function renderFilters() {
  const caseSelect = document.getElementById('case-select');
  const ruleSelect = document.getElementById('rule-select');
  const compareCase = document.getElementById('compare-case');
  const compareDateA = document.getElementById('compare-date-a');
  const compareDateB = document.getElementById('compare-date-b');

  buildOptions(caseSelect, catalog.cases, '选择 casename');
  buildOptions(ruleSelect, catalog.rules, '选择 rule');
  buildOptions(compareCase, catalog.cases, '选择 casename');
  buildOptions(compareDateA, catalog.dates.slice().reverse(), '选择日期1');
  buildOptions(compareDateB, catalog.dates.slice().reverse(), '选择日期2');

  selectedCase = catalog.cases[0] || '';
  selectedRule = catalog.rules[0] || '';
  if (caseSelect.options.length > 1) caseSelect.selectedIndex = 1;
  if (ruleSelect.options.length > 1) ruleSelect.selectedIndex = 1;
  if (compareCase.options.length > 1) compareCase.selectedIndex = 1;
  if (compareDateA.options.length > 1) compareDateA.selectedIndex = 1;
  if (compareDateB.options.length > 2) compareDateB.selectedIndex = 2;
  selectedCase = caseSelect.value;
  selectedRule = ruleSelect.value;

  caseSelect.addEventListener('change', e => {
    selectedCase = e.target.value;
    renderChart();
  });

  ruleSelect.addEventListener('change', e => {
    selectedRule = e.target.value;
    renderChart();
  });

  document.getElementById('rule-search').addEventListener('input', e => {
    const value = e.target.value.trim().toLowerCase();
    buildOptions(ruleSelect, catalog.rules.filter(item => item.toLowerCase().includes(value)), '选择 rule');
  });
}

function getFilteredSeries() {
  const items = filterItems(getSourceData()).sort((a, b) => a.date.localeCompare(b.date));
  const lastValues = {};
  const lines = items.map((item, index) => {
    const prev = items[index - 1];
    const prevValue = prev ? (activeView === 'runtime' ? prev.runtime : prev.memory) : null;
    const change = prevValue !== null ? ((activeView === 'runtime' ? item.runtime : item.memory) - prevValue).toFixed(2) : '0.00';
    const hasOverall = items.some(candidate => candidate.case === item.case && candidate.date === item.date && candidate.rule === 'Overall');
    return {
      name: `${item.case}/${item.rule}`,
      value: [item.date, activeView === 'runtime' ? item.runtime : item.memory],
      itemStyle: {
        color: item.user_added ? '#22c55e' : !hasOverall && item.rule !== 'Overall' ? '#f43f5e' : '#3366ff'
      },
      tooltip: {
        formatter: () => {
          const axisValue = item.date;
          const value = activeView === 'runtime' ? item.runtime : item.memory;
          const extras = toolInfo.extra_fields?.map(key => `${key}: ${item.extra?.[key] || '-'}`).join('<br>') || '';
          return `日期: ${axisValue}<br/>值: ${formatNumber(value)}<br/>${extras}<br/>变化: ${change}<br/>${item.user_added ? '来源: 用户添加' : ''}${!hasOverall && item.rule !== 'Overall' ? '<br/>状态: crash' : ''}`;
        }
      }
    };
  });
  return { items, lines };
}

function renderChart() {
  if (!chartInstance) {
    chartInstance = echarts.init(document.getElementById('chart'));
  }
  const { items, lines } = getFilteredSeries();
  const xAxis = [...new Set(items.map(item => item.date))];
  const series = [{
    type: 'line',
    smooth: true,
    symbol: 'circle',
    symbolSize: 10,
    lineStyle: { width: 3 },
    label: { show: false },
    data: lines
  }];
  const option = {
    tooltip: { trigger: 'item', formatter: params => params.data.tooltip.formatter() },
    xAxis: { type: 'category', data: xAxis, boundaryGap: false },
    yAxis: { type: 'value', name: activeView },
    grid: { left: '8%', right: '6%', bottom: '14%' },
    series
  };
  chartInstance.setOption(option);
  renderSummary(items);
}

function renderSummary(items) {
  const summary = document.getElementById('chart-summary');
  if (!items.length) {
    summary.innerHTML = '<div>当前筛选条件下无数据</div>';
    return;
  }
  const total = items.reduce((sum, item) => sum + (activeView === 'runtime' ? item.runtime : item.memory), 0);
  const average = total / items.length;
  const maxItem = items.reduce((best, item) => (activeView === 'runtime' ? item.runtime : item.memory) > (activeView === 'runtime' ? best.runtime : best.memory) ? item : best, items[0]);
  const minItem = items.reduce((best, item) => (activeView === 'runtime' ? item.runtime : item.memory) < (activeView === 'runtime' ? best.runtime : best.memory) ? item : best, items[0]);
  const totalCases = new Set(items.map(item => item.case)).size;
  const totalRules = new Set(items.map(item => item.rule)).size;
  const totalDays = new Set(items.map(item => item.date)).size;
  summary.innerHTML = `
    <div><strong>日期范围</strong><div>${selectedDates.length ? selectedDates[0] + ' ~ ' + selectedDates[selectedDates.length - 1] : '全部'}</div></div>
    <div><strong>总 ${activeView}</strong><div>${formatNumber(total)}</div></div>
    <div><strong>平均 ${activeView}</strong><div>${formatNumber(average)}</div></div>
    <div><strong>最大 ${activeView}</strong><div>${formatNumber(activeView === 'runtime' ? maxItem.runtime : maxItem.memory)} (${maxItem.rule})</div></div>
    <div><strong>最小 ${activeView}</strong><div>${formatNumber(activeView === 'runtime' ? minItem.runtime : minItem.memory)} (${minItem.rule})</div></div>
    <div><strong>项目概况</strong><div>Case: ${totalCases} / Rule: ${totalRules} / 天数: ${totalDays}</div></div>
  `;
}

function updateDateModal() {
  const list = document.getElementById('date-list');
  const filter = document.getElementById('date-search').value.trim().toLowerCase();
  list.innerHTML = '';
  catalog.dates.filter(date => date.includes(filter)).forEach(date => {
    const row = document.createElement('div');
    row.className = 'date-item';
    row.innerHTML = `
      <label><input type="checkbox" value="${date}" ${selectedDates.includes(date) ? 'checked' : ''}/> ${date}</label>
    `;
    list.appendChild(row);
  });
}

function showDateModal() {
  document.getElementById('date-modal').hidden = false;
  updateDateModal();
}

function hideDateModal() {
  document.getElementById('date-modal').hidden = true;
}

function toggleDateSelection() {
  const checkboxes = Array.from(document.querySelectorAll('#date-list input[type=checkbox]'));
  const allSelected = checkboxes.every(c => c.checked);
  checkboxes.forEach(checkbox => checkbox.checked = !allSelected);
}

function applyDateFilter() {
  selectedDates = Array.from(document.querySelectorAll('#date-list input[type=checkbox]:checked')).map(item => item.value);
  hideDateModal();
  renderChart();
}

function openAddPathModal() {
  document.getElementById('add-path-modal').hidden = false;
}

function hideAddPathModal() {
  document.getElementById('add-path-modal').hidden = true;
  document.getElementById('path-input').value = '';
}

function appendUserData(paths) {
  const currentItems = getSourceData();
  const lastDate = catalog.dates.slice(-1)[0] || new Date().toISOString().slice(0, 10);
  const nextDate = new Date(Date.parse(lastDate) + 86400000).toISOString().slice(0, 10);
  paths.forEach((path, index) => {
    if (!path) return;
    const baseValue = currentItems.length ? (activeView === 'runtime' ? currentItems[currentItems.length - 1].runtime : currentItems[currentItems.length - 1].memory) : 10;
    userAddedData.push({
      date: nextDate,
      case: selectedCase || 'custom_case',
      rule: selectedRule || `user_rule_${index + 1}`,
      runtime: baseValue + 3 * (index + 1),
      memory: baseValue + 1.5 * (index + 1),
      extra: { source: path },
      user_added: true,
      mode: activeMode
    });
  });
  if (!selectedDates.includes(nextDate)) {
    selectedDates = selectedDates.concat(nextDate);
  }
  hideAddPathModal();
  renderChart();
}

function applyAddPaths() {
  const input = document.getElementById('path-input').value.trim();
  const paths = input.split(/\r?\n/).map(item => item.trim()).filter(Boolean);
  if (!paths.length) {
    alert('请输入至少一个路径');
    return;
  }
  appendUserData(paths);
}

async function submitCompare() {
  const payload = {
    case: document.getElementById('compare-case').value,
    rule: document.getElementById('compare-rule').value,
    date_a: document.getElementById('compare-date-a').value,
    date_b: document.getElementById('compare-date-b').value,
    mode: document.getElementById('compare-mode').value,
    dimension: document.getElementById('compare-dimension').value,
    runtime_threshold: document.getElementById('runtime-threshold').value,
    memory_threshold: document.getElementById('memory-threshold').value
  };
  const response = await fetch(`/api/tool/${TOOL_ID}/compare`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const result = await response.json();
  renderCompareResult(result);
}

function renderCompareResult(result) {
  const container = document.getElementById('compare-result');
  if (!result.rows || !result.rows.length) {
    container.innerHTML = '<div class="empty-state">未找到符合条件的对比结果。</div>';
    return;
  }
  const summary = result.summary;
  const rowsHtml = result.rows.map(row => `
    <tr>
      <td>${row.case}</td>
      <td>${row.rule}</td>
      <td>${formatNumber(row.runtime_a)}</td>
      <td>${formatNumber(row.runtime_b)}</td>
      <td>${formatNumber(row.memory_a)}</td>
      <td>${formatNumber(row.memory_b)}</td>
      <td>${formatNumber(row.runtime_rate)}</td>
      <td>${formatNumber(row.memory_rate)}</td>
    </tr>
  `).join('');
  container.innerHTML = `
    <div class="chart-summary">
      <div><strong>对比数量</strong><div>${summary.count}</div></div>
      <div><strong>runtime 增加</strong><div>${summary.runtime_increase}</div></div>
      <div><strong>runtime 减少</strong><div>${summary.runtime_decrease}</div></div>
      <div><strong>memory 增加</strong><div>${summary.memory_increase}</div></div>
      <div><strong>memory 减少</strong><div>${summary.memory_decrease}</div></div>
    </div>
    <div class="table-wrap">
      <table class="compare-table">
        <thead>
          <tr><th>casename</th><th>rule</th><th>runtime A</th><th>runtime B</th><th>memory A</th><th>memory B</th><th>runtime 结果</th><th>memory 结果</th></tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    </div>
  `;
}

function exportCompareResult() {
  const table = document.querySelector('#compare-result table');
  if (!table) {
    alert('当前没有对比结果可导出');
    return;
  }
  const rows = Array.from(table.querySelectorAll('tr'));
  const csv = rows.map(row => Array.from(row.querySelectorAll('th, td')).map(cell => `"${cell.textContent.replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${toolInfo.name || 'compare'}_compare.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

async function initPage() {
  const detail = await fetchToolDetail();
  if (!detail) return;
  toolInfo = detail.tool;
  toolData = detail.data;
  catalog = await fetchCatalog();
  if (!catalog.dates.length) {
    catalog.dates = toolData.single_thread.concat(toolData.multi_thread).map(item => item.date).filter(Boolean);
    catalog.dates = [...new Set(catalog.dates)].sort();
  }
  selectedDates = catalog.dates.slice(-50);

  renderToolInfo();
  renderTabs();
  renderFilters();
  renderChart();
  document.getElementById('date-picker-button').addEventListener('click', showDateModal);
  document.getElementById('latest-50-button').addEventListener('click', () => {
    selectedDates = catalog.dates.slice(-50);
    renderChart();
  });
  document.getElementById('date-cancel').addEventListener('click', hideDateModal);
  document.getElementById('date-apply').addEventListener('click', applyDateFilter);
  document.getElementById('date-search').addEventListener('input', updateDateModal);
  document.getElementById('toggle-all-dates').addEventListener('click', toggleDateSelection);
  document.getElementById('open-add-path').addEventListener('click', openAddPathModal);
  document.getElementById('path-cancel').addEventListener('click', hideAddPathModal);
  document.getElementById('path-apply').addEventListener('click', applyAddPaths);
  document.getElementById('compare-submit').addEventListener('click', submitCompare);
  document.getElementById('compare-export').addEventListener('click', exportCompareResult);
  document.getElementById('compare-rule').addEventListener('input', e => {
    const term = e.target.value.trim().toLowerCase();
    const filtered = catalog.rules.filter(rule => rule.toLowerCase().includes(term));
    if (filtered.length) {
      const select = document.getElementById('rule-select');
      buildOptions(select, filtered, '选择 rule');
    }
  });
}

window.addEventListener('DOMContentLoaded', initPage);
