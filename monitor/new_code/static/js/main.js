
/**
 * EDA 性能监控系统 - 主页面脚本
 * 负责渲染工具卡片网格，处理导航跳转
 * 使用 Grid 布局展示工具卡片，支持悬浮效果
 */

// 计算总模式数
toolsConfig.forEach(tool => {
    if (tool.has_single) modeCount++;
    if (tool.has_multi) modeCount++;
});

// 更新统计显示
document.getElementById('toolCount').textContent = toolCount;
document.getElementById('modeCount').textContent = modeCount;

/**
 * 渲染工具卡片网格
 * 使用 Grid 布局，每个卡片包含图标、标题、描述和模式选择按钮
 */
function renderToolsGrid() {
    const gridContainer = document.getElementById('toolsGrid');
    
    if (!toolsConfig || toolsConfig.length === 0) {
        gridContainer.innerHTML = `
            <div style="grid-column: 1/-1; text-align: center; padding: 3rem;">
                <p style="color: var(--text-secondary);">暂无可用工具，请检查配置</p>
            </div>
        `;
        return;
    }
    
    // 生成卡片 HTML
    const cardsHtml = toolsConfig.map(tool => `
        <div class="tool-card" data-tool-id="${tool.id}">
            <div class="card-header">
                <div class="card-icon">${tool.icon || '🔧'}</div>
                <div class="card-title">
                    <h2>${tool.name}</h2>
                    <p>${tool.description || 'EDA 工具性能监控'}</p>
                </div>
            </div>
            <div class="card-content">
                <div class="tool-description">
                    ${getToolDescription(tool.id)}
                </div>
                <div class="mode-buttons">
                    ${tool.has_single ? `<button class="mode-btn single" data-mode="single">📈 时序曲线图</button>` : ''}
                    ${tool.has_multi ? `<button class="mode-btn multi" data-mode="multi">🔄 多线程对比图</button>` : ''}
                </div>
            </div>
            <div class="card-footer">
                <div class="status-badge">
                    <span class="status-dot"></span>
                    <span>服务可用</span>
                </div>
                <span>点击按钮开始监控 →</span>
            </div>
        </div>
    `).join('');
    
    gridContainer.innerHTML = cardsHtml;
    
    // 绑定卡片事件
    bindCardEvents();
}

/**
 * 获取工具描述
 * @param {string} toolId - 工具ID
 * @returns {string} 工具描述文本
 */
function getToolDescription(toolId) {
    const descriptions = {
        'elint': 'ELINT 工具用于代码规范检查和Lint分析，支持Runtime和Memory性能监控。提供单线程时序图和多线程对比图两种视图模式。',
        'ecdc': 'ECDC 工具用于跨时钟域分析，检测设计中的CDC问题。实时监控CDC检查的性能指标。'
    };
    return descriptions[toolId] || 'EDA 流程性能监控工具，提供全面的性能数据可视化分析能力。';
}

/**
 * 显示加载状态
 * @param {boolean} show - 是否显示加载遮罩
 */
function showLoading(show) {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) {
        overlay.style.display = show ? 'flex' : 'none';
    }
}

/**
 * 导航到工具页面
 * @param {string} toolId - 工具ID
 * @param {string} mode - 模式 (single/multi)
 */
function navigateToTool(toolId, mode) {
    // 显示加载状态
    showLoading(true);
    
    // 构建目标URL
    const targetUrl = `/tool/${toolId}?mode=${mode}`;
    
    // 延迟跳转，让加载动画有显示时间
    setTimeout(() => {
        window.location.href = targetUrl;
    }, 300);
}

/**
 * 绑定卡片按钮点击事件
 */
function bindCardEvents() {
    // 绑定单线程模式按钮
    document.querySelectorAll('.mode-btn.single').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const card = btn.closest('.tool-card');
            const toolId = card.dataset.toolId;
            navigateToTool(toolId, 'single');
        });
    });
    
    // 绑定多线程模式按钮
    document.querySelectorAll('.mode-btn.multi').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const card = btn.closest('.tool-card');
            const toolId = card.dataset.toolId;
            navigateToTool(toolId, 'multi');
        });
    });
    
    // 可选：点击卡片整体也可跳转（默认跳转到单线程模式）
    document.querySelectorAll('.tool-card').forEach(card => {
        card.addEventListener('click', (e) => {
            // 如果点击的是按钮，不重复触发
            if (e.target.classList && e.target.classList.contains('mode-btn')) {
                return;
            }
            const toolId = card.dataset.toolId;
            const tool = toolsConfig.find(t => t.id === toolId);
            if (tool && tool.has_single) {
                navigateToTool(toolId, 'single');
            } else if (tool && tool.has_multi) {
                navigateToTool(toolId, 'multi');
            }
        });
    });
}

/**
 * 页面初始化
 */
function init() {
    renderToolsGrid();
    
    // 添加页面可见性变化监听，刷新统计数据
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
            // 页面重新可见时，可以触发数据检查
            console.log('页面已激活');
        }
    });
}

// 启动应用
init();
