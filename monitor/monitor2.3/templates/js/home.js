// frontend/js/home.js
class HomePage {
    constructor() {
        this.container = null;
        this.tools = [];
    }
    
    async render() {
        this.container = document.getElementById('router-view');
        if (!this.container) return;
        
        await this.loadTools();
        this.container.innerHTML = this.getHTML();
        this.bindEvents();
    }
    
    async loadTools() {
        try {
            this.tools = await ToolAPI.getAll();
            store.setState({ tools: this.tools });
        } catch (error) {
            console.error('Failed to load tools:', error);
            this.tools = [];
        }
    }
    
    getHTML() {
        const toolCount = this.tools.length;
        const toolListHtml = this.tools.map(tool => `
            <div class="tool-tooltip-item">
                <div class="tool-tooltip-name">${this.escapeHtml(tool.tool_name)}</div>
                <div class="tool-tooltip-desc">${this.escapeHtml(tool.tool_description || '暂无描述')}</div>
            </div>
        `).join('');
        
        const toolsHtml = toolCount === 0 ? `
            <div class="empty-state">
                <div class="empty-icon"><i class="fas fa-tools"></i></div>
                <p>暂无配置工具</p>
                <p class="text-muted">点击右下角 + 号开始配置</p>
            </div>
        ` : `
            <div class="tools-grid">
                ${this.tools.map(tool => `
                    <div class="tool-card" data-tool-name="${this.escapeHtml(tool.tool_name)}">
                        <div class="tool-card-icon"><i class="fas fa-wrench"></i></div>
                        <h3>${this.escapeHtml(tool.tool_name)}</h3>
                        <div class="tool-card-desc">${this.escapeHtml(tool.tool_description || '暂无描述')}</div>
                        <div class="tool-card-path"><i class="fas fa-folder"></i> ${this.escapeHtml(tool.single_thread_path || '未配置')}</div>
                    </div>
                `).join('')}
            </div>
        `;
        
        return `
            <div class="home-container">
                <div class="home-header">
                    <div class="logo">
                        <div class="logo-icon"><i class="fas fa-chart-line"></i></div>
                        <span>EDA QOR 性能监控平台</span>
                    </div>
                    <div class="user-info"><i class="fas fa-user-circle"></i><span>用户</span></div>
                </div>
                <div class="home-main">
                    <div class="tool-stats">
                        <div class="stats-card" id="stats-card">
                            <div class="stats-number">${toolCount}</div>
                            <div class="stats-label">已配置工具</div>
                            <div class="tool-tooltip hidden" id="tool-tooltip">${toolListHtml || '<div class="tool-tooltip-item">暂无工具</div>'}</div>
                        </div>
                    </div>
                    ${toolsHtml}
                </div>
                <button class="config-fab" id="config-fab"><i class="fas fa-plus"></i></button>
            </div>
        `;
    }
    
    bindEvents() {
        const statsCard = document.getElementById('stats-card');
        const tooltip = document.getElementById('tool-tooltip');
        let hoverTimeout;
        
        if (statsCard && tooltip) {
            statsCard.addEventListener('mouseenter', () => {
                clearTimeout(hoverTimeout);
                tooltip.classList.remove('hidden');
            });
            statsCard.addEventListener('mouseleave', () => {
                hoverTimeout = setTimeout(() => tooltip.classList.add('hidden'), 200);
            });
        }
        
        document.querySelectorAll('.tool-card').forEach(card => {
            card.addEventListener('click', () => {
                const toolName = card.dataset.toolName;
                store.setState({ currentTool: toolName });
                router.navigateTo('/tool');
            });
        });
        
        const configFab = document.getElementById('config-fab');
        if (configFab) {
            configFab.addEventListener('click', () => router.navigateTo('/config'));
        }
    }
    
    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}