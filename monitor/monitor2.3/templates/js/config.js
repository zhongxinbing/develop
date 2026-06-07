class ConfigPage {
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
        } catch (error) {
            console.error('Failed to load tools:', error);
            this.tools = [];
        }
    }
    
    getHTML() {
        const toolsListHtml = this.tools.map(tool => this.getToolConfigCardHtml(tool)).join('');
        return `
            <div class="config-container">
                <div class="config-header">
                    <button class="back-btn" id="back-btn"><i class="fas fa-arrow-left"></i><span>返回主页</span></button>
                    <h1>工具配置中心</h1>
                </div>
                <div class="config-content">
                    <div class="tools-list">${toolsListHtml || '<div class="empty-state">暂无配置的工具</div>'}</div>
                    <button class="add-tool-btn" id="add-tool-btn"><i class="fas fa-plus"></i><span>添加工具</span></button>
                </div>
            </div>
        `;
    }
    
    getToolConfigCardHtml(tool) {
        const extraDisplay = tool.extra_display || {};
        return `
            <div class="tool-config-card" data-tool-name="${tool.tool_name}">
                <div class="tool-config-header">
                    <div class="tool-config-name">${this.escapeHtml(tool.tool_name)}</div>
                    <div class="tool-config-actions">
                        <button class="edit-tool" data-tool-name="${tool.tool_name}"><i class="fas fa-edit"></i></button>
                        <button class="delete-tool" data-tool-name="${tool.tool_name}"><i class="fas fa-trash"></i></button>
                    </div>
                </div>
                <div class="tool-config-desc">${this.escapeHtml(tool.tool_description || '暂无描述')}</div>
                <div class="tool-config-details">
                    ${tool.single_thread_path ? `<span class="detail-tag"><i class="fas fa-microchip"></i> 单线程: ${this.escapeHtml(tool.single_thread_path)}</span>` : ''}
                    ${tool.multi_thread_path ? `<span class="detail-tag"><i class="fas fa-server"></i> 多线程: ${this.escapeHtml(tool.multi_thread_path)}</span>` : ''}
                </div>
            </div>
        `;
    }
    
    bindEvents() {
        document.getElementById('back-btn')?.addEventListener('click', () => router.navigateTo('/'));
        document.getElementById('add-tool-btn')?.addEventListener('click', () => this.showToolModal());
        
        document.querySelectorAll('.edit-tool').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const toolName = btn.dataset.toolName;
                const tool = this.tools.find(t => t.tool_name === toolName);
                if (tool) this.showToolModal(tool);
            });
        });
        
        document.querySelectorAll('.delete-tool').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const toolName = btn.dataset.toolName;
                if (confirm(`确定要删除工具 "${toolName}" 吗？`)) {
                    await ToolAPI.delete(toolName);
                    await this.loadTools();
                    this.render();
                }
            });
        });
    }
    
    showToolModal(tool = null) {
        const isEdit = !!tool;
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal" style="width: 700px; max-width: 90vw;">
                <div class="modal-header"><h3>${isEdit ? '编辑工具' : '添加工具'}</h3><button class="modal-close">&times;</button></div>
                <div class="modal-body">
                    <form id="tool-form">
                        <div class="form-group"><label class="form-label">工具名称 <span class="text-danger">*</span></label><input type="text" class="input" name="tool_name" value="${this.escapeHtml(tool?.tool_name || '')}" required></div>
                        <div class="form-group"><label class="form-label">工具描述</label><textarea class="input" name="tool_description" rows="3">${this.escapeHtml(tool?.tool_description || '')}</textarea></div>
                        <div class="form-group"><label class="form-label">单线程数据路径</label><input type="text" class="input" name="single_thread_path" value="${this.escapeHtml(tool?.single_thread_path || '')}"><div class="form-help">数据文件存放的目录路径</div></div>
                        <div class="form-group"><label class="form-label">多线程数据路径 <span class="optional">(可选)</span></label><input type="text" class="input" name="multi_thread_path" value="${this.escapeHtml(tool?.multi_thread_path || '')}"></div>
                        <div class="form-group"><label class="form-label">单线程接口函数</label><input type="text" class="input" name="single_thread_interface" value="${this.escapeHtml(tool?.single_thread_interface || 'load_single_thread_data')}"></div>
                        <div class="form-group"><label class="form-label">多线程接口函数</label><input type="text" class="input" name="multi_thread_interface" value="${this.escapeHtml(tool?.multi_thread_interface || 'load_multi_thread_data')}"></div>
                    </form>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-outline modal-cancel">取消</button>
                    <button class="btn btn-primary modal-save">保存并跳转</button>
                    <button class="btn btn-secondary modal-save-only">仅保存</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        const closeModal = () => modal.remove();
        modal.querySelector('.modal-close')?.addEventListener('click', closeModal);
        modal.querySelector('.modal-cancel')?.addEventListener('click', closeModal);
        modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
        
        modal.querySelector('.modal-save')?.addEventListener('click', async () => {
            const formData = this.getFormData(modal);
            await this.saveTool(formData, isEdit);
            closeModal();
            if (!isEdit) router.navigateTo('/tool');
            else { await this.loadTools(); this.render(); }
        });
        
        modal.querySelector('.modal-save-only')?.addEventListener('click', async () => {
            const formData = this.getFormData(modal);
            await this.saveTool(formData, isEdit);
            closeModal();
            await this.loadTools();
            this.render();
        });
    }
    
    getFormData(modal) {
        const form = modal.querySelector('#tool-form');
        return {
            tool_name: form.querySelector('[name="tool_name"]').value,
            tool_description: form.querySelector('[name="tool_description"]').value,
            single_thread_path: form.querySelector('[name="single_thread_path"]').value,
            multi_thread_path: form.querySelector('[name="multi_thread_path"]').value,
            single_thread_interface: form.querySelector('[name="single_thread_interface"]').value,
            multi_thread_interface: form.querySelector('[name="multi_thread_interface"]').value
        };
    }
    
    async saveTool(data, isEdit) {
        try {
            if (isEdit) {
                await ToolAPI.update(data.tool_name, data);
                showToast('工具更新成功', 'success');
            } else {
                await ToolAPI.create(data);
                showToast('工具创建成功', 'success');
                store.setState({ currentTool: data.tool_name });
            }
        } catch (error) {
            showToast(error.message, 'error');
        }
    }
    
    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}