/**
 * 工具配置管理页面脚本
 */

// ==================================================
// 全局变量
// ==================================================
let currentTools = [];
let pendingDeleteId = null;

// ==================================================
// 工具函数
// ==================================================
function showLoading(show) {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) {
        overlay.style.display = show ? 'flex' : 'none';
    }
}

// ==================================================
// API调用
// ==================================================
async function loadTools() {
    showLoading(true);
    try {
        const response = await fetch('/api/tools');
        const result = await response.json();
        
        if (result.success) {
            currentTools = result.tools;
            renderToolsGrid();
        } else {
            showNotification('加载工具列表失败: ' + result.error, true);
        }
    } catch (error) {
        console.error('加载工具列表失败:', error);
        showNotification('加载工具列表失败', true);
    } finally {
        showLoading(false);
    }
}

async function saveTool(toolData) {
    showLoading(true);
    try {
        const response = await fetch(`/api/tool/${toolData.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(toolData)
        });
        const result = await response.json();
        
        if (result.success) {
            showNotification('工具保存成功');
            await loadTools();
            switchView('tools');
            return true;
        } else {
            showNotification('保存失败: ' + result.error, true);
            return false;
        }
    } catch (error) {
        console.error('保存失败:', error);
        showNotification('保存失败: ' + error.message, true);
        return false;
    } finally {
        showLoading(false);
    }
}

async function deleteTool(toolId) {
    showLoading(true);
    try {
        const response = await fetch(`/api/tool/${toolId}`, {
            method: 'DELETE'
        });
        const result = await response.json();
        
        if (result.success) {
            showNotification('工具删除成功');
            await loadTools();
            return true;
        } else {
            showNotification('删除失败: ' + result.error, true);
            return false;
        }
    } catch (error) {
        console.error('删除失败:', error);
        showNotification('删除失败', true);
        return false;
    } finally {
        showLoading(false);
    }
}

// ==================================================
// 表单验证函数
// ==================================================
function validateToolId(toolId) {
    if (!toolId) {
        return { valid: false, message: '工具ID不能为空' };
    }
    if (!/^[a-zA-Z0-9_]+$/.test(toolId)) {
        return { valid: false, message: '工具ID只能包含字母、数字和下划线' };
    }
    return { valid: true, message: '' };
}

function validateRequiredFields(fields) {
    const errors = [];
    for (const [fieldName, value] of Object.entries(fields)) {
        if (!value || value.trim() === '') {
            errors.push(`${fieldName}不能为空`);
        }
    }
    return errors;
}

function getFormData() {
    const toolId = document.getElementById('toolId').value.trim();
    const toolName = document.getElementById('toolName').value.trim();
    const toolIcon = document.getElementById('toolIcon').value.trim();
    const singleOriginalPath = document.getElementById('singleOriginalPath').value.trim();
    
    const errors = [];
    
    const idValidation = validateToolId(toolId);
    if (!idValidation.valid) errors.push(idValidation.message);
    
    const requiredErrors = validateRequiredFields({
        '工具名称': toolName,
        '工具图标': toolIcon,
        'Single模式原始数据路径': singleOriginalPath
    });
    errors.push(...requiredErrors);
    
    if (currentTools.some(t => t.id === toolId)) {
        errors.push(`工具ID "${toolId}" 已存在，请使用其他ID`);
    }
    
    if (errors.length > 0) {
        showNotification(errors.join('；'), true);
        return null;
    }
    
    return {
        id: toolId,
        name: toolName,
        description: document.getElementById('toolDesc').value.trim(),
        icon: toolIcon,
        mem: document.getElementById('memPath').value.trim(),
        cpu: document.getElementById('cpuPath').value.trim(),
        single_original_path: singleOriginalPath,
        multi_original_path: document.getElementById('multiOriginalPath').value.trim()
    };
}

function getEditFormData() {
    const toolName = document.getElementById('editToolName').value.trim();
    const toolIcon = document.getElementById('editToolIcon').value.trim();
    const singleOriginalPath = document.getElementById('editSingleOriginalPath').value.trim();
    
    const errors = validateRequiredFields({
        '工具名称': toolName,
        '工具图标': toolIcon,
        'Single模式原始数据路径': singleOriginalPath
    });
    
    if (errors.length > 0) {
        showNotification(errors.join('；'), true);
        return null;
    }
    
    return {
        id: document.getElementById('editToolId').value,
        name: toolName,
        description: document.getElementById('editToolDesc').value.trim(),
        icon: toolIcon,
        mem: document.getElementById('editMemPath').value.trim(),
        cpu: document.getElementById('editCpuPath').value.trim(),
        single_original_path: singleOriginalPath,
        multi_original_path: document.getElementById('editMultiOriginalPath').value.trim()
    };
}

// ==================================================
// 渲染函数
// ==================================================
function renderToolsGrid() {
    const grid = document.getElementById('toolsGrid');
    
    if (!currentTools.length) {
        grid.innerHTML = `
            <div style="grid-column: 1/-1; text-align: center; padding: 3rem;">
                <div style="font-size: 3rem; margin-bottom: 1rem;">🔧</div>
                <p style="color: var(--text-secondary);">暂无工具配置</p>
                <p style="color: var(--text-muted); font-size: 0.8rem; margin-top: 0.5rem;">点击下方按钮添加第一个工具</p>
                <button class="btn btn-primary" onclick="switchView('add')" style="margin-top: 1rem;">➕ 添加第一个工具</button>
            </div>
        `;
        return;
    }
    
    grid.innerHTML = currentTools.map(tool => `
        <div class="tool-card">
            <div class="tool-card-header">
                <div class="tool-card-icon">${escapeHtml(tool.icon) || '🔧'}</div>
                <div class="tool-card-info">
                    <div class="tool-card-name">${escapeHtml(tool.name)}</div>
                    <div class="tool-card-desc">${escapeHtml(tool.description || '无描述')}</div>
                    <div style="font-size: 0.65rem; color: var(--text-muted); margin-top: 0.25rem;">ID: ${tool.id}</div>
                </div>
            </div>
            <div class="tool-card-body">
                <div style="display: flex; gap: 1rem; flex-wrap: wrap; margin-bottom: 0.75rem;">
                    <span class="badge ${tool.has_single ? 'badge-success' : 'badge-warning'}">
                        ${tool.has_single ? '✅ Single已配置' : '⚠️ Single未配置'}
                    </span>
                    <span class="badge ${tool.has_multi ? 'badge-success' : 'badge-warning'}">
                        ${tool.has_multi ? '✅ Multi已配置' : '⚠️ Multi未配置'}
                    </span>
                </div>
                <div style="font-size: 0.7rem; color: var(--text-muted);">
                    <div>📈 Single Original: ${tool.single_original_path || '未配置'}</div>
                    ${tool.multi_original_path ? `<div>🔄 Multi Original: ${tool.multi_original_path}</div>` : ''}
                </div>
                ${tool.last_updated ? `<div style="font-size: 0.6rem; color: var(--text-muted); margin-top: 0.5rem;">最后更新: ${tool.last_updated}</div>` : ''}
            </div>
            <div class="tool-card-footer">
                <button class="btn btn-secondary" onclick="openEditModal('${tool.id}')">✏️ 编辑</button>
                <button class="btn btn-danger" onclick="confirmDelete('${tool.id}', '${escapeHtml(tool.name)}')">🗑️ 删除</button>
            </div>
        </div>
    `).join('');
}

// ==================================================
// 编辑功能
// ==================================================
async function openEditModal(toolId) {
    const tool = currentTools.find(t => t.id === toolId);
    if (!tool) return;
    
    document.getElementById('editToolId').value = tool.id;
    document.getElementById('editToolName').value = tool.name || '';
    document.getElementById('editToolDesc').value = tool.description || '';
    document.getElementById('editToolIcon').value = tool.icon || '🔧';
    
    document.getElementById('editMemPath').value = tool.mem || '';
    document.getElementById('editCpuPath').value = tool.cpu || '';
    document.getElementById('editSingleOriginalPath').value = tool.single_original_path || '';
    document.getElementById('editMultiOriginalPath').value = tool.multi_original_path || '';
    
    document.getElementById('editModal').classList.remove('hidden');
}

function closeEditModal() {
    document.getElementById('editModal').classList.add('hidden');
}

function confirmDelete(toolId, toolName) {
    pendingDeleteId = toolId;
    document.getElementById('deleteToolName').textContent = toolName;
    document.getElementById('deleteModal').classList.remove('hidden');
}

function closeDeleteModal() {
    pendingDeleteId = null;
    document.getElementById('deleteModal').classList.add('hidden');
}

async function executeDelete() {
    if (pendingDeleteId) {
        await deleteTool(pendingDeleteId);
        closeDeleteModal();
    }
}

// ==================================================
// 视图切换
// ==================================================
function switchView(viewId) {
    const containers = document.querySelectorAll('.view-container');
    containers.forEach(view => {
        view.classList.remove('active');
    });
    
    const targetView = document.getElementById(`${viewId}View`);
    if (targetView) targetView.classList.add('active');
    
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
        item.classList.remove('active');
        if (item.dataset.view === viewId) {
            item.classList.add('active');
        }
    });
    
    if (viewId === 'add') {
        document.getElementById('addToolForm').reset();
        document.getElementById('toolId').value = '';
        document.getElementById('toolIcon').value = '🔧';
    } else if (viewId === 'tools') {
        loadTools();
    }
}

function backToHome() {
    window.location.href = '/';
}

// ==================================================
// 事件绑定
// ==================================================
function bindEvents() {
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', () => switchView(item.dataset.view));
    });
    
    document.getElementById('backToHomeBtn').addEventListener('click', backToHome);
    document.getElementById('refreshBtn').addEventListener('click', loadTools);
    document.getElementById('addToolBtn').addEventListener('click', () => switchView('add'));
    document.getElementById('cancelAddBtn').addEventListener('click', () => switchView('tools'));
    
    document.getElementById('addToolForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const toolData = getFormData();
        if (toolData) await saveTool(toolData);
    });
    
    document.getElementById('editToolForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const toolData = getEditFormData();
        if (toolData) {
            await saveTool(toolData);
            closeEditModal();
        }
    });
    
    document.getElementById('confirmDeleteBtn').addEventListener('click', executeDelete);
}

// ==================================================
// 初始化
// ==================================================
async function init() {
    bindEvents();
    await loadTools();
}

init();