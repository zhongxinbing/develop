// 简化的 chart helper using ECharts
function createLineChart(containerId, title) {
    const dom = document.getElementById(containerId);
    if (!dom) return null;
    const chart = echarts.init(dom, null, {renderer: 'canvas'});
    const option = {
        title: {text: title, left: 'center', textStyle: {color: '#cbd5e1'}},
        tooltip: {trigger: 'axis'},
        xAxis: {type: 'category', data: [], axisLine: {lineStyle: {color: '#475569'}}},
        yAxis: {type: 'value', axisLine: {lineStyle: {color: '#475569'}}},
        series: []
    };
    chart.setOption(option);
    window.addEventListener('resize', () => chart.resize());
    return chart;
}

function renderTimeSeries(chart, dates, seriesList) {
    if (!chart) return;
    const option = {
        xAxis: {data: dates},
        series: seriesList
    };
    chart.setOption(option, {notMerge: false});
}
