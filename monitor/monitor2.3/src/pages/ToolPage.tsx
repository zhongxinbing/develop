import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import ReactECharts from 'echarts-for-react';
import { fetchToolData, fetchTools, compareMetrics } from '../api';
import type { ToolConfig, CompareMode, CompareDimension } from '../types';

const VIEW_TYPES = ['single', 'multi', 'compare'] as const;
const SUBVIEWS = ['runtime', 'memory', 'compare'] as const;

function buildRules(data: any) {
  const rules = new Set<string>();
  Object.values(data || {}).forEach((caseItem: any) => {
    Object.values(caseItem.daily_metrics_key || {}).forEach((dateMetrics: any) => {
      Object.keys(dateMetrics).forEach((rule) => rules.add(rule));
    });
  });
  return Array.from(rules);
}

function buildDates(data: any) {
  const dates = new Set<string>();
  Object.values(data || {}).forEach((caseItem: any) => {
    Object.keys(caseItem.daily_metrics_key || {}).forEach((date) => dates.add(date));
  });
  return Array.from(dates).sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
}

function buildChartSeries(data: any, selectedCase: string, rule: string, viewType: 'runtime' | 'memory', chartType: 'single' | 'multi') {
  const values: number[] = [];
  const dates = buildDates(data);

  dates.forEach((date) => {
    const caseItem = data[selectedCase];
    const point = caseItem?.daily_metrics_key?.[date]?.[rule];
    if (!point) {
      values.push(NaN);
      return;
    }
    if (chartType === 'single') {
      values.push(point?.[viewType] ?? NaN);
    } else {
      const threads = point?.thread_metrics ?? {};
      const firstThread = Object.values(threads)[0];
      values.push(firstThread?.[viewType] ?? NaN);
    }
  });

  return { dates, values };
}

function makeChartOption(title: string, dates: string[], values: number[], viewType: 'runtime' | 'memory') {
  return {
    title: { text: title, left: 'center', textStyle: { color: '#cbd5e1' } },
    tooltip: {
      trigger: 'axis',
      formatter: (params: any) => {
        const item = params[0];
        return `<div style="color:#f8fafc"><strong>${item.axisValue}</strong><br/>${item.seriesName}: ${item.data}</div>`;
      }
    },
    xAxis: { type: 'category', data: dates, boundaryGap: false, axisLine: { lineStyle: { color: '#475569' } } },
    yAxis: { type: 'value', name: viewType, axisLine: { lineStyle: { color: '#475569' } }, splitLine: { lineStyle: { color: '#1e293b' } } },
    series: [{ name: viewType, type: 'line', smooth: true, data: values, symbolSize: 8, lineStyle: { width: 3 }, itemStyle: { color: '#38bdf8' }, areaStyle: { opacity: 0.1 } }],
    grid: { left: '8%', right: '5%', bottom: '12%', top: '16%' }
  };
}

export default function ToolPage({ userId }: { userId: string }) {
  const navigate = useNavigate();
  const { toolId } = useParams();
  const [tool, setTool] = useState<ToolConfig | null>(null);
  const [data, setData] = useState<any>({ single: null, multi: null, custom: null });
  const [activeView, setActiveView] = useState<(typeof VIEW_TYPES)[number]>('single');
  const [activeSubview, setActiveSubview] = useState<(typeof SUBVIEWS)[number]>('runtime');
  const [selectedCase, setSelectedCase] = useState('');
  const [selectedRule, setSelectedRule] = useState('Overall');
  const [searchRule, setSearchRule] = useState('');
  const [selectedDates, setSelectedDates] = useState<string[]>([]);
  const [showDateModal, setShowDateModal] = useState(false);
  const [dateSearch, setDateSearch] = useState('');
  const [allDatesSelected, setAllDatesSelected] = useState(false);
  const [userPaths, setUserPaths] = useState<string[]>([]);
  const [showPathModal, setShowPathModal] = useState(false);
  const [pathInput, setPathInput] = useState('');
  const [compareMode, setCompareMode] = useState<CompareMode>('absolute');
  const [compareDimension, setCompareDimension] = useState<CompareDimension>('all');
  const [compareDate1, setCompareDate1] = useState('');
  const [compareDate2, setCompareDate2] = useState('');
  const [compareResult, setCompareResult] = useState<any>(null);

  useEffect(() => {
    if (!toolId) return;
    fetchTools(userId).then((tools) => {
      const current = tools[toolId];
      setTool(current);
    });
  }, [toolId, userId]);

  useEffect(() => {
    if (!toolId) return;
    fetchToolData(userId, toolId).then((payload) => {
      setData(payload);
      const dataSource = payload.single || payload.multi || {};
      const firstCase = Object.keys(dataSource)[0];
      setSelectedCase(firstCase || '');
      setSelectedRule('Overall');
      const dates = buildDates(dataSource);
      setSelectedDates(dates.slice(-5));
      setCompareDate1(dates[0] || '');
      setCompareDate2(dates[dates.length - 1] || '');
    });
  }, [toolId, userId]);

  const currentData = useMemo(() => {
    if (activeView === 'single') return data.single || {};
    if (activeView === 'multi') return data.multi || {};
    return data.custom || {};
  }, [activeView, data]);

  const caseNames = useMemo(() => Object.keys(currentData), [currentData]);
  const rules = useMemo(() => buildRules(currentData).filter((rule) => rule.toLowerCase().includes(searchRule.toLowerCase())), [currentData, searchRule]);
  const dates = useMemo(() => buildDates(currentData), [currentData]);

  const selectedData = useMemo(() => buildChartSeries(currentData, selectedCase, selectedRule, activeSubview, activeView === 'multi' ? 'multi' : 'single'), [currentData, selectedCase, selectedRule, activeSubview, activeView]);

  const chartOption = useMemo(() => makeChartOption(`${tool?.name || '工具'} - ${activeSubview.toUpperCase()} 曲线`, selectedData.dates, selectedData.values, activeSubview === 'compare' ? 'runtime' : activeSubview), [tool, selectedData, activeSubview]);

  const displayRules = rules.length ? rules : ['Overall'];
  const chooseCase = selectedCase || (caseNames[0] || '');

  return (
    <div className="card-grid">
      <div className="card">
        <div className="card-header">
          <div>
            <h2 className="card-title">{tool?.name || '工具页面'}</h2>
            <p>{tool?.description || '正在加载工具信息...'}</p>
          </div>
          <div className="inline-row">
            <button className="secondary-button" onClick={() => navigate('/config')}>返回配置</button>
          </div>
        </div>
        <div className="view-tabs">
          {VIEW_TYPES.map((view) => (
            <button key={view} className={`view-tab ${activeView === view ? 'active' : ''}`} onClick={() => setActiveView(view)}>
              {view === 'single' ? '单线程' : view === 'multi' ? '多线程' : '对比'}
            </button>
          ))}
        </div>
        <div className="card">
          <div className="inline-row">
            <div className="form-row">
              <label>casename</label>
              <select value={chooseCase} onChange={(e) => setSelectedCase(e.target.value)}>
                {caseNames.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </div>
            <div className="form-row">
              <label>rule</label>
              <select value={selectedRule} onChange={(e) => setSelectedRule(e.target.value)}>
                {displayRules.map((rule) => <option key={rule} value={rule}>{rule}</option>)}
              </select>
            </div>
            <div className="form-row">
              <label>搜索 rule</label>
              <input value={searchRule} onChange={(e) => setSearchRule(e.target.value)} placeholder="搜索规则" />
            </div>
            <button className="action-button" type="button" onClick={() => setShowDateModal(true)}>选择日期</button>
            <button className="secondary-button" type="button" onClick={() => {
              const last50 = dates.slice(-50);
              setSelectedDates(last50);
            }}>最新50天</button>
            <button className="secondary-button" type="button" onClick={() => setShowPathModal(true)}>添加数据</button>
          </div>
        </div>
        <div className="card">
          <div className="view-tabs">
            {['runtime', 'memory'].map((view) => (
              <button key={view} className={`view-tab ${activeSubview === view ? 'active' : ''}`} onClick={() => setActiveSubview(view as typeof SUBVIEWS[number])}>
                {view}
              </button>
            ))}
          </div>
          <div className="chart-container">
            <ReactECharts option={chartOption} style={{ height: '420px', width: '100%' }} />
          </div>
          <div className="stats-grid">
            <div className="metric-card"><small>日期范围</small><div className="metric-value">{dates[0] || '-'} ~ {dates[dates.length - 1] || '-'}</div></div>
            <div className="metric-card"><small>总 runtime</small><div className="metric-value">{selectedData.values.filter((value) => !Number.isNaN(value)).reduce((sum, value) => sum + value, 0).toFixed(2)}</div></div>
            <div className="metric-card"><small>平均 runtime</small><div className="metric-value">{(selectedData.values.filter((value) => !Number.isNaN(value)).reduce((sum, value) => sum + value, 0) / Math.max(1, selectedData.values.filter((value) => !Number.isNaN(value)).length)).toFixed(2)}</div></div>
            <div className="metric-card"><small>最大 runtime <span title="最大 runtime 对应的 rule">?</span></small><div className="metric-value">{Math.max(...selectedData.values.filter((value) => !Number.isNaN(value)), 0).toFixed(2)}</div></div>
            <div className="metric-card"><small>最小 runtime <span title="最小 runtime 对应的 rule">?</span></small><div className="metric-value">{Math.min(...selectedData.values.filter((value) => !Number.isNaN(value)), 0).toFixed(2)}</div></div>
          </div>
          <div className="stats-grid">
            <div className="metric-card"><small>总 case 数</small><div className="metric-value">{caseNames.length || 0}</div></div>
            <div className="metric-card"><small>总阶段数</small><div className="metric-value">{rules.length || 0}</div></div>
            <div className="metric-card"><small>总天数</small><div className="metric-value">{dates.length || 0}</div></div>
          </div>
        </div>

        {activeView === 'compare' && (
          <div className="card">
            <h3 className="card-title">对比视图</h3>
            <div className="split-grid">
              <div className="form-row"><label>casename</label><select value={selectedCase} onChange={(e) => setSelectedCase(e.target.value)}>{caseNames.map((item) => <option key={item} value={item}>{item}</option>)}</select></div>
              <div className="form-row"><label>对比模式</label><select value={selectedRule} onChange={(e) => setSelectedRule(e.target.value)}>{displayRules.map((rule) => <option key={rule} value={rule}>{rule}</option>)}</select></div>
              <div className="form-row"><label>搜索 rule</label><input value={searchRule} onChange={(e) => setSearchRule(e.target.value)} /></div>
              <div className="form-row"><label>日期1</label><select value={compareDate1} onChange={(e) => setCompareDate1(e.target.value)}>{dates.map((date) => <option key={date} value={date}>{date}</option>)}</select></div>
              <div className="form-row"><label>日期2</label><select value={compareDate2} onChange={(e) => setCompareDate2(e.target.value)}>{dates.map((date) => <option key={date} value={date}>{date}</option>)}</select></div>
              <div className="form-row"><label>误差模式</label><select value={compareMode} onChange={(e) => setCompareMode(e.target.value as CompareMode)}><option value="absolute">绝对值</option><option value="percentage">百分比</option></select></div>
              <div className="form-row"><label>对比维度</label><select value={compareDimension} onChange={(e) => setCompareDimension(e.target.value as CompareDimension)}><option value="all">全部</option><option value="runtime">runtime</option><option value="memory">memory</option></select></div>
              <div className="form-row"><label>runtime 误差范围</label><input type="number" value={0} disabled /></div>
              <div className="form-row"><label>memory 误差范围</label><input type="number" value={0} disabled /></div>
            </div>
            <div className="inline-row" style={{ marginTop: 12 }}>
              <button className="action-button" type="button" onClick={() => {
                compareMetrics(userId, toolId!, { selectedCase, selectedRule, compareDate1, compareDate2, compareMode, compareDimension }).then(setCompareResult);
              }}>确认对比</button>
              <button className="secondary-button" type="button" onClick={() => {
                if (compareResult) {
                  const csv = ['rule,runtime1,runtime2,memory1,memory2,delta', ...compareResult.comparisonTable.map((row: any) => `${row.rule},${row.runtime1},${row.runtime2},${row.memory1},${row.memory2},${row.delta}`)].join('\n');
                  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `${tool?.name || 'compare'}-对比结果.csv`;
                  a.click();
                  URL.revokeObjectURL(url);
                }
              }}>导出对比结果</button>
            </div>

            {compareResult && (
              <div>
                <div className="stats-grid">
                  <div className="metric-card"><small>runtime 增加 rule</small><div className="metric-value">{compareResult.runtimeIncrease}</div></div>
                  <div className="metric-card"><small>runtime 减少 rule</small><div className="metric-value">{compareResult.runtimeDecrease}</div></div>
                  <div className="metric-card"><small>memory 增加 rule</small><div className="metric-value">{compareResult.memoryIncrease}</div></div>
                  <div className="metric-card"><small>memory 减少 rule</small><div className="metric-value">{compareResult.memoryDecrease}</div></div>
                </div>
                <table className="table-view">
                  <thead>
                    <tr><th>rule</th><th>runtime1</th><th>runtime2</th><th>memory1</th><th>memory2</th><th>delta</th></tr>
                  </thead>
                  <tbody>
                    {compareResult.comparisonTable.map((row: any) => (
                      <tr key={row.rule}><td>{row.rule}</td><td>{row.runtime1}</td><td>{row.runtime2}</td><td>{row.memory1}</td><td>{row.memory2}</td><td>{row.delta}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {showDateModal && (
        <div className="modal-overlay" onClick={() => setShowDateModal(false)}>
          <div className="modal-body" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">选择显示日期</h3>
              <button className="modal-close" onClick={() => setShowDateModal(false)}>关闭</button>
            </div>
            <div className="form-row">
              <label>搜索日期</label>
              <input value={dateSearch} onChange={(e) => setDateSearch(e.target.value)} placeholder="搜索日期" />
            </div>
            <button className="action-button" type="button" onClick={() => {
              if (allDatesSelected) {
                setSelectedDates([]);
              } else {
                setSelectedDates(dates);
              }
              setAllDatesSelected(!allDatesSelected);
            }}>{allDatesSelected ? '取消全选' : '全选'}</button>
            <div className="tool-list" style={{ maxHeight: '360px', overflowY: 'auto' }}>
              {dates.filter((date) => date.includes(dateSearch)).map((date) => (
                <label key={date} className="inline-row">
                  <input type="checkbox" checked={selectedDates.includes(date)} onChange={() => {
                    setSelectedDates((prev) => prev.includes(date) ? prev.filter((i) => i !== date) : [...prev, date]);
                  }} />
                  {date}
                </label>
              ))}
            </div>
          </div>
        </div>
      )}

      {showPathModal && (
        <div className="modal-overlay" onClick={() => setShowPathModal(false)}>
          <div className="modal-body" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">添加数据路径</h3>
              <button className="modal-close" onClick={() => setShowPathModal(false)}>关闭</button>
            </div>
            <div className="form-row">
              <label>路径输入（多条路径可用逗号分隔）</label>
              <textarea value={pathInput} onChange={(e) => setPathInput(e.target.value)} placeholder="请输入路径" />
            </div>
            <button className="action-button" type="button" onClick={() => {
              const newPaths = pathInput.split(',').map((item) => item.trim()).filter(Boolean);
              setUserPaths((prev) => [...prev, ...newPaths]);
              setShowPathModal(false);
            }}>确认</button>
            <div style={{ marginTop: 16 }}>
              <h4>新增路径</h4>
              <ul>
                {userPaths.map((path, index) => <li key={`${path}-${index}`}>{path}</li>)}
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
