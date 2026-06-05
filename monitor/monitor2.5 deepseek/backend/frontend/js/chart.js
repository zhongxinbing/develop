// 渲染Runtime图表
function renderRuntimeChart(containerId, data, toolConfig) {
    const chart = echarts.init(document.getElementById(containerId));
    
    const option = {
        title: {
            text: 'Runtime Performance Trend',
            left: 'center'
        },
        tooltip: {
            trigger: 'axis',
            formatter: function(params) {
                if (!params || params.length === 0) return '';
                
                const dataPoint = params[0];
                const date = dataPoint.name;
                const value = dataPoint.value;
                
                let tooltipText = `<strong>日期: ${date}</strong><br/>
                                   Runtime: ${value.toFixed(2)}s<br/>`;
                
                // 添加额外显示信息
                if (toolConfig && toolConfig.extraDisplay) {
                    toolConfig.extraDisplay.forEach(extra => {
                        tooltipText += `${extra}: 待获取<br/>`;
                    });
                }
                
                // 添加前一天对比
                const prevIndex = data.findIndex(d => d[0] === date) - 1;
                if (prevIndex >= 0) {
                    const prevValue = data[prevIndex][1];
                    const change = ((value - prevValue) / prevValue * 100).toFixed(2);
                    tooltipText += `与前一天对比: ${change}%<br/>`;
                }
                
                return tooltipText;
            }
        },
        xAxis: {
            type: 'category',
            name: '日期',
            axisLabel: {
                rotate: 45,
                interval: 0
            }
        },
        yAxis: {
            type: 'value',
            name: 'Runtime (s)',
            axisLabel: {
                formatter: '{value}s'
            }
        },
        series: [{
            name: 'Runtime',
            type: 'line',
            data: data,
            smooth: false,
            lineStyle: {
                width: 2,
                color: '#1890ff'
            },
            itemStyle: {
                color: function(params) {
                    // 如果是crash的数据点，显示红色
                    if (params.value[1] === null) {
                        return '#f5222d';
                    }
                    // 用户添加的数据显示绿色
                    if (params.dataIndex >= data.length - 10) {
                        return '#52c41a';
                    }
                    return '#1890ff';
                }
            },
            symbol: 'circle',
            symbolSize: 8,
            connectNulls: false
        }],
        grid: {
            left: '3%',
            right: '5%',
            bottom: '10%',
            containLabel: true
        },
        dataZoom: [
            {
                type: 'slider',
                start: 0,
                end: 100
            }
        ]
    };
    
    chart.setOption(option);
    return chart;
}

// 渲染Memory图表
function renderMemoryChart(containerId, data, toolConfig) {
    const chart = echarts.init(document.getElementById(containerId));
    
    const option = {
        title: {
            text: 'Memory Usage Trend',
            left: 'center'
        },
        tooltip: {
            trigger: 'axis',
            formatter: function(params) {
                if (!params || params.length === 0) return '';
                
                const dataPoint = params[0];
                const date = dataPoint.name;
                const value = dataPoint.value;
                
                let tooltipText = `<strong>日期: ${date}</strong><br/>
                                   Memory: ${value.toFixed(2)} MB<br/>`;
                
                // 添加额外显示信息
                if (toolConfig && toolConfig.extraDisplay) {
                    toolConfig.extraDisplay.forEach(extra => {
                        tooltipText += `${extra}: 待获取<br/>`;
                    });
                }
                
                // 添加前一天对比
                const prevIndex = data.findIndex(d => d[0] === date) - 1;
                if (prevIndex >= 0) {
                    const prevValue = data[prevIndex][1];
                    const change = ((value - prevValue) / prevValue * 100).toFixed(2);
                    tooltipText += `与前一天对比: ${change}%<br/>`;
                }
                
                return tooltipText;
            }
        },
        xAxis: {
            type: 'category',
            name: '日期',
            axisLabel: {
                rotate: 45,
                interval: 0
            }
        },
        yAxis: {
            type: 'value',
            name: 'Memory (MB)',
            axisLabel: {
                formatter: '{value} MB'
            }
        },
        series: [{
            name: 'Memory',
            type: 'line',
            data: data,
            smooth: false,
            lineStyle: {
                width: 2,
                color: '#52c41a'
            },
            itemStyle: {
                color: function(params) {
                    if (params.value[1] === null) {
                        return '#f5222d';
                    }
                    if (params.dataIndex >= data.length - 10) {
                        return '#faad14';
                    }
                    return '#52c41a';
                }
            },
            symbol: 'circle',
            symbolSize: 8,
            connectNulls: false
        }],
        grid: {
            left: '3%',
            right: '5%',
            bottom: '10%',
            containLabel: true
        },
        dataZoom: [
            {
                type: 'slider',
                start: 0,
                end: 100
            }
        ]
    };
    
    chart.setOption(option);
    return chart;
}

// 渲染线程曲线图
function renderThreadCurvesChart(containerId, data, threadNumbers) {
    const chart = echarts.init(document.getElementById(containerId));
    
    const series = [];
    threadNumbers.forEach(threadNum => {
        series.push({
            name: `${threadNum} 线程`,
            type: 'line',
            data: data[threadNum] || [],
            smooth: false
        });
    });
    
    const option = {
        title: {
            text: '多线程性能对比',
            left: 'center'
        },
        tooltip: {
            trigger: 'axis'
        },
        legend: {
            data: threadNumbers.map(t => `${t} 线程`),
            top: 30
        },
        xAxis: {
            type: 'category',
            name: '日期'
        },
        yAxis: {
            type: 'value',
            name: 'Runtime (s)'
        },
        series: series,
        grid: {
            containLabel: true
        },
        dataZoom: [
            {
                type: 'slider',
                start: 0,
                end: 100
            }
        ]
    };
    
    chart.setOption(option);
    return chart;
}