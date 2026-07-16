/**
 * 主页面逻辑
 * 负责工具列表展示、工具统计、页面导航
 */

// API 基础路径
const API_BASE = '/api';

// 全局状态
let tools = {};

// DOM 元素
const toolCountEl = document.getElementById('toolCount');
const toolsGrid = document.getElementById('toolsGrid');
const emptyState = document.getElementById('emptyState');
const configBtn = document.getElementById('configBtn');
const statsCard = document.getElementById('statsCard');
emptyState.addEventListener('click', navigateToConfig);
/**
 * 加载工具列表
 */
async function loadTools() {
    try {
        const response = await axios.get(`${API_BASE}/tools`);
        if (response.data.success) {
            tools = response.data.data || {};
            renderTools();
            updateToolCount();
            // updateTooltip();
        }
    } catch (error) {
        console.error('加载工具列表失败:', error);
        showError('加载工具列表失败，请刷新重试');
    }
}

/**
 * 渲染工具卡片
 */
function renderTools() {
    const toolKeys = Object.keys(tools);
    
    if (toolKeys.length === 0) {
        // 元素的 CSS display 属性设置为 grid，确保空状态提示居中显示
        toolsGrid.style.display = 'grid';
        emptyState.style.display = 'flex';
        toolsGrid.innerHTML = '';
        toolsGrid.appendChild(emptyState);
        return;
    }
    // 如果有工具，则显示工具网格，隐藏空状态提示
    emptyState.style.display = 'none';
    toolsGrid.innerHTML = '';
    // 遍历工具列表，创建工具卡片并添加到网格中
    toolKeys.forEach(toolId => {
        const tool = tools[toolId];
        const card = createToolCard(toolId, tool);
        toolsGrid.appendChild(card);
    });
}

/**
 * 创建工具卡片 DOM
 */
function createToolCard(toolId, tool) {
    const card = document.createElement('div');
    card.className = 'tool-card';
    card.onclick = () => navigateToTool(toolId);
    
    const hasSingle = tool.single_path;
    const hasMulti = tool.multi_path;
    
    card.innerHTML = `
        <div class="tool-card-icon">
            ⚙
        </div>
        <h3>${escapeHtml(tool.tool_name || toolId)}</h3>
        <p>${escapeHtml(tool.description || '暂无描述')}</p>
        <div class="tool-card-meta">
            ${hasSingle ? '<span><i class="fas fa-chart-simple"></i> 单线程</span>' : ''}
            ${hasMulti ? '<span><i class="fas fa-diagram-project"></i> 多线程</span>' : ''}
        </div>
    `;
    
    return card;
}

/**
 * 更新工具数量显示
 */
function updateToolCount() {
    const count = Object.keys(tools).length;
    toolCountEl.textContent = count;
}

/**
 * 更新工具提示浮层内容
 */
function updateTooltip() {
    const tooltipList = document.getElementById('tooltipList');
    if (!tooltipList) return;
    
    const toolKeys = Object.keys(tools);
    
    if (toolKeys.length === 0) {
        tooltipList.innerHTML = '<div class="tooltip-item"><div class="tooltip-item-name">暂无工具</div></div>';
        return;
    }
    
    tooltipList.innerHTML = '';
    toolKeys.forEach(toolId => {
        const tool = tools[toolId];
        const item = document.createElement('div');
        item.className = 'tooltip-item';
        item.innerHTML = `
            <div class="tooltip-item-name">${escapeHtml(tool.tool_name || toolId)}</div>
            <div class="tooltip-item-desc">${escapeHtml(tool.description || '暂无描述')}</div>
        `;
        tooltipList.appendChild(item);
    });
}

/**
 * 跳转到工具页面
 */
function navigateToTool(toolId) {
    // 使用 window.location.href 跳转到工具页面
    window.location.href = `/tool/${encodeURIComponent(toolId)}`;
    // 使用 window.open 打开新窗口
    // window.open(`/tool/${encodeURIComponent(toolId)}`, '_blank');
}

/**
 * 跳转到配置页面
 */
function navigateToConfig() {
    window.location.href = '/config';
}

/**
 * 显示错误提示
 */
function showError(message) {
    // 可以使用 toast 组件，这里简单用 alert
    console.error(message);
    // 可以添加一个简单的 toast 提示
    const toast = document.createElement('div');
    toast.className = 'toast-error';
    toast.textContent = message;
    toast.style.cssText = `
        position: fixed;
        bottom: 20px;
        left: 50%;
        transform: translateX(-50%);
        background: #EF4444;
        color: white;
        padding: 8px 16px;
        border-radius: 8px;
        font-size: 14px;
        z-index: 1000;
    `;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

/**
 * HTML 转义
 */
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * 初始化页面
 */
function init() {
    loadTools();
    configBtn.addEventListener('click', navigateToConfig);
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', init);