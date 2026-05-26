/**
 * EDA 性能监控系统 - 主页面脚本
 * 负责渲染工具卡片网格，处理导航跳转
 * 使用 Grid 布局展示工具卡片，支持悬浮效果
 */

// 调试：打印工具配置
console.log('Tools Config:', toolsConfig);

// 计算总模式数
let modeCount = 0;
if (toolsConfig && toolsConfig.length > 0) {
    toolsConfig.forEach(tool => {
        if (tool.has_single) modeCount++;
        if (tool.has_multi) modeCount++;
    });
} else {
    console.warn('没有找到工具配置');
}

// 更新统计显示
const toolCountEl = document.getElementById('toolCount');
const modeCountEl = document.getElementById('modeCount');
if (toolCountEl) toolCountEl.textContent = toolsConfig ? toolsConfig.length : 0;
if (modeCountEl) modeCountEl.textContent = modeCount;

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
    console.log('导航到工具:', toolId, mode);
    showLoading(true);
    const targetUrl = `/tool/${toolId}?mode=${mode}`;
    
    setTimeout(() => {
        window.location.href = targetUrl;
    }, 300);
}

/**
 * 渲染工具卡片网格
 */
function renderToolsGrid() {
    const gridContainer = document.getElementById('toolsGrid');
    
    if (!gridContainer) {
        console.error('找不到 toolsGrid 容器');
        return;
    }
    
    if (!toolsConfig || toolsConfig.length === 0) {
        gridContainer.innerHTML = `
            <div style="grid-column: 1/-1; text-align: center; padding: 3rem;">
                <p style="color: var(--text-secondary);">暂无可用工具，请检查配置</p>
                <button class="mode-btn" onclick="window.location.href='/tools_config'" style="margin-top: 1rem; padding: 0.5rem 1rem;">
                    ⚙️ 前往配置
                </button>
            </div>
        `;
        return;
    }
    
    const cardsHtml = toolsConfig.map(tool => `
        <div class="tool-card" data-tool-id="${tool.id}">
            <div class="card-header">
                <div class="card-icon">${escapeHtml(tool.icon) || '🔧'}</div>
                <div class="card-title">
                    <h2>${escapeHtml(tool.name)}</h2>
                    <p>${escapeHtml(tool.description || 'EDA 工具性能监控')}</p>
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
    bindCardEvents();
}

/**
 * 绑定卡片按钮点击事件
 */
function bindCardEvents() {
    // 单线程模式按钮
    document.querySelectorAll('.mode-btn.single').forEach(btn => {
        btn.removeEventListener('click', handleSingleClick);
        btn.addEventListener('click', handleSingleClick);
    });
    
    // 多线程模式按钮
    document.querySelectorAll('.mode-btn.multi').forEach(btn => {
        btn.removeEventListener('click', handleMultiClick);
        btn.addEventListener('click', handleMultiClick);
    });
    
    // 卡片整体点击（默认单线程模式）
    document.querySelectorAll('.tool-card').forEach(card => {
        card.removeEventListener('click', handleCardClick);
        card.addEventListener('click', handleCardClick);
    });
}

/**
 * 单线程按钮点击处理
 */
function handleSingleClick(e) {
    e.stopPropagation();
    const card = this.closest('.tool-card');
    const toolId = card.dataset.toolId;
    navigateToTool(toolId, 'single');
}

/**
 * 多线程按钮点击处理
 */
function handleMultiClick(e) {
    e.stopPropagation();
    const card = this.closest('.tool-card');
    const toolId = card.dataset.toolId;
    navigateToTool(toolId, 'multi');
}

/**
 * 卡片点击处理
 */
function handleCardClick(e) {
    if (e.target.classList && e.target.classList.contains('mode-btn')) return;
    if (e.target.closest('.mode-btn')) return;
    
    const tool = toolsConfig.find(t => t.id === this.dataset.toolId);
    if (tool && tool.has_single) {
        navigateToTool(this.dataset.toolId, 'single');
    } else if (tool && tool.has_multi) {
        navigateToTool(this.dataset.toolId, 'multi');
    } else {
        console.warn('该工具没有可用的模式');
        showNotification('该工具暂无可用监控模式', true);
    }
}

/**
 * 显示通知
 */
function showNotification(message, isError = false) {
    const notification = document.createElement('div');
    notification.textContent = isError ? `❌ ${message}` : `✅ ${message}`;
    notification.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        padding: 12px 20px;
        background: ${isError ? '#ef4444' : '#10b981'};
        color: white;
        border-radius: 8px;
        z-index: 10000;
        animation: slideIn 0.3s ease;
        font-size: 14px;
        font-weight: 500;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    `;
    document.body.appendChild(notification);
    setTimeout(() => notification.remove(), 3000);
}

/**
 * 页面初始化
 */
function init() {
    console.log('页面初始化...');
    renderToolsGrid();
    
    // 添加动画样式
    const style = document.createElement('style');
    style.textContent = `
        @keyframes slideIn {
            from {
                transform: translateX(100%);
                opacity: 0;
            }
            to {
                transform: translateX(0);
                opacity: 1;
            }
        }
    `;
    document.head.appendChild(style);
}

// 等待DOM加载完成
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}