const API_BASE = 'http://localhost:3000/api';

let tools = [];

async function loadTools() {
    try {
        const response = await fetch(`${API_BASE}/tools`);
        tools = await response.json();
        
        updateToolsDisplay();
        updateToolsCount();
    } catch (error) {
        console.error('Failed to load tools:', error);
        showError('加载工具失败');
    }
}

function updateToolsDisplay() {
    const toolsGrid = document.getElementById('toolsGrid');
    
    if (Object.keys(tools).length === 0) {
        toolsGrid.innerHTML = `
            <div class="empty-state">
                <p>暂无配置的工具</p>
                <p>点击右上角"工具配置"按钮添加工具</p>
            </div>
        `;
        return;
    }
    
    toolsGrid.innerHTML = Object.entries(tools).map(([id, tool]) => `
        <div class="tool-card" data-tool-id="${id}">
            <h3>${escapeHtml(tool.toolName)}</h3>
            <p>${escapeHtml(tool.toolDescription || '暂无描述')}</p>
        </div>
    `).join('');
    
    // 添加点击事件
    document.querySelectorAll('.tool-card').forEach(card => {
        card.addEventListener('click', () => {
            const toolId = card.dataset.toolId;
            window.location.href = `tool.html?toolId=${toolId}`;
        });
    });
}

function updateToolsCount() {
    const count = Object.keys(tools).length;
    document.getElementById('toolCount').textContent = count;
    
    // 更新提示框内容
    const tooltipContent = document.querySelector('.tool-tooltip');
    if (tooltipContent && Object.keys(tools).length > 0) {
        tooltipContent.innerHTML = `
            <h4>工具列表</h4>
            <ul>
                ${Object.values(tools).map(tool => `
                    <li>
                        <strong>${escapeHtml(tool.toolName)}</strong>
                        <br>
                        <small>${escapeHtml(tool.toolDescription || '')}</small>
                    </li>
                `).join('')}
            </ul>
        `;
    }
}

function showError(message) {
    // 简单的错误提示
    alert(message);
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// 初始化
document.addEventListener('DOMContentLoaded', () => {
    loadTools();
    
    // 配置按钮事件
    document.getElementById('configBtn').addEventListener('click', () => {
        window.location.href = 'config.html';
    });
    
    // 创建tooltip
    const toolsCountDiv = document.querySelector('.tools-count');
    const tooltip = document.createElement('div');
    tooltip.className = 'tool-tooltip';
    toolsCountDiv.appendChild(tooltip);
});

// 监听页面刷新
window.addEventListener('beforeunload', async () => {
    // 清除用户添加的数据
    try {
        await fetch(`${API_BASE}/data/user-data/clear`, { method: 'DELETE' });
    } catch (error) {
        console.error('Failed to clear user data:', error);
    }
});