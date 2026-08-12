/**
 * 配置页面逻辑
 * 负责工具的增删改查、表单验证、弹窗管理
 */

// API 基础路径
const API_BASE = '/api';

// 全局状态
let tools = {};
let currentEditToolId = null;

// DOM 元素
const toolsList = document.getElementById('toolsList');
const toolCount = document.getElementById('toolCount');
const addToolBtn = document.getElementById('addToolBtn');
const backBtn = document.getElementById('backBtn');

// 弹窗元素
const toolModal = document.getElementById('toolModal');
const deleteModal = document.getElementById('deleteModal');
const modalTitle = document.getElementById('modalTitle');
const toolForm = document.getElementById('toolForm');
let deleteTargetId = null;

/**
 * 加载工具列表
 */
async function loadTools() {
    try {
        showLoading(true);

        const response = await axios.get(`${API_BASE}/tools`);
        if (response.data.success) {
            tools = response.data.data || {};
            console.log('工具列表加载成功:', tools);
            renderToolsList();
            updateToolCount();
        }
    } catch (error) {
        console.error('加载工具列表失败:', error);
        showError('加载工具列表失败，请刷新重试');
    } finally {
        showLoading(false);
    }
}

/**
 * 渲染工具列表
 */
function renderToolsList() {
    console.log('渲染工具列表:', tools);
    const toolKeys = Object.keys(tools);
    console.log('工具: ', toolKeys);
    console.log('工具数量:', toolKeys.length);
    
    if (toolKeys.length === 0) {
        toolsList.innerHTML = `
            <div class="empty-state" style="padding: 40px;">
                <div class="empty-icon">
                    <i class="fas fa-cube"></i>
                </div>
                <h3>暂无配置工具</h3>
                <p>点击下方按钮添加您的第一个工具</p>
            </div>
        `;
        return;
    }
    
    toolsList.innerHTML = '';
    toolKeys.forEach(toolId => {
        const tool = tools[toolId];
        console.log('创建工具配置卡片:', toolId, '配置:', tool);
        const card = createToolConfigCard(toolId, tool);
        console.log('添加工具配置卡片到列表:', card);
        toolsList.appendChild(card);
    });
}

/**
 * 创建工具配置卡片
 */
function createToolConfigCard(toolId, tool) {
    const card = document.createElement('div');
    card.className = 'tool-config-card';
    
    const hasSingle = tool.single_path;
    const hasMulti = tool.multi_path;
    const hasExtra = tool.extra_display_path;
    
    // 构建配置详情显示
    let singleDetail = '';
    if (hasSingle) {
        singleDetail = `<span><i class="fas fa-chart-simple"></i> 单线程: ${truncatePath(tool.single_path)}`;
        if (tool.single_file_pattern) {
            singleDetail += ` (匹配: ${tool.single_file_pattern})`;
        }
        if (tool.single_max_depth) {
            singleDetail += ` (深度: ${tool.single_max_depth})`;
        }
        singleDetail += `</span>`;
    }
    
    let multiDetail = '';
    if (hasMulti) {
        multiDetail = `<span><i class="fas fa-diagram-project"></i> 多线程: ${truncatePath(tool.multi_path)}`;
        if (tool.multi_file_pattern) {
            multiDetail += ` (匹配: ${tool.multi_file_pattern})`;
        }
        if (tool.multi_max_depth) {
            multiDetail += ` (深度: ${tool.multi_max_depth})`;
        }
        multiDetail += `</span>`;
    }
    
    card.innerHTML = `
        <div class="tool-config-info">
            <h4>${escapeHtml(tool.tool_name || toolId)}</h4>
            <p>${escapeHtml(tool.description || '暂无描述')}</p>
            <div class="tool-config-meta">
                ${hasSingle ? singleDetail : ''}
                ${hasMulti ? multiDetail : ''}
                ${hasExtra ? `<span><i class="fas fa-chart-line"></i> 额外显示</span>` : ''}
                ${tool.custom_curve_func ? `<span><i class="fas fa-custom"></i> 自定义曲线</span>` : ''}
            </div>
        </div>
        <div class="tool-config-actions">
            <button class="edit-btn" data-id="${toolId}" title="编辑">
                编辑
            </button>
            <button class="delete-btn" data-id="${toolId}" title="删除">
                删除
            </button>
        </div>
    `;
    
    const editBtn = card.querySelector('.edit-btn');
    const deleteBtn = card.querySelector('.delete-btn');

    editBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        openEditModal(toolId, tool);
    });

    deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        openDeleteModal(toolId, tool);
    });
    
    return card;
}

/**
 * 打开编辑弹窗
 */
function openEditModal(toolId, tool) {
    currentEditToolId = toolId;
    modalTitle.textContent = '编辑工具';
    
    // 填充表单 - 基础信息
    document.getElementById('toolName').value = tool.tool_name || toolId;
    document.getElementById('toolDesc').value = tool.description || '';
    
    // 单线程配置
    document.getElementById('singlePath').value = tool.single_path || '';
    document.getElementById('singleFunc').value = tool.single_func || '';
    document.getElementById('singleFilePattern').value = tool.single_file_pattern || '';
    document.getElementById('singleMaxDepth').value = tool.single_max_depth || 3;
    
    // 多线程配置
    document.getElementById('multiPath').value = tool.multi_path || '';
    document.getElementById('multiFunc').value = tool.multi_func || '';
    document.getElementById('multiFilePattern').value = tool.multi_file_pattern || '';
    document.getElementById('multiMaxDepth').value = tool.multi_max_depth || 6;
    
    // 额外显示配置
    document.getElementById('extraPath').value = tool.extra_display_path || '';
    document.getElementById('extraFunc').value = tool.extra_display_func || '';
    document.getElementById('extraFilePattern').value = tool.extra_file_pattern || '';
    
    // 自定义曲线函数
    document.getElementById('customFunc').value = tool.custom_curve_func || '';
    
    // 处理额外显示字段的启用状态
    handleExtraPathChange();
    
    openModal(toolModal);
}

/**
 * 打开添加弹窗
 */
function openAddModal() {
    currentEditToolId = null;
    modalTitle.textContent = '添加工具';
    toolForm.reset();
    document.getElementById('extraFunc').disabled = true;
    document.getElementById('singleMaxDepth').value = 3;
    document.getElementById('multiMaxDepth').value = 6;
    openModal(toolModal);
}

/**
 * 打开删除确认弹窗
 */
function openDeleteModal(toolId, tool) {
    deleteTargetId = toolId;
    document.getElementById('deleteToolName').textContent = tool.tool_name || toolId;
    openModal(deleteModal);
}

/**
 * 保存工具
 */
async function saveTool() {
    console.log('保存工具, 当前编辑工具ID:', currentEditToolId);
    const toolName = document.getElementById('toolName').value.trim();
    if (!toolName) {
        showError('请输入工具名称');
        return;
    }
    
    if (!currentEditToolId && tools[toolName]) {
        showError('工具名称已存在，请重新输入');
        return;
    }
    
    console.log('收集表单数据');
    const toolData = {
        tool_name: toolName,
        description: document.getElementById('toolDesc').value.trim(),
        // 单线程配置
        single_path: document.getElementById('singlePath').value.trim(),
        single_func: document.getElementById('singleFunc').value.trim(),
        single_file_pattern: document.getElementById('singleFilePattern').value.trim(),
        single_max_depth: parseInt(document.getElementById('singleMaxDepth').value) || 3,
        // 多线程配置
        multi_path: document.getElementById('multiPath').value.trim(),
        multi_func: document.getElementById('multiFunc').value.trim(),
        multi_file_pattern: document.getElementById('multiFilePattern').value.trim(),
        multi_max_depth: parseInt(document.getElementById('multiMaxDepth').value) || 6,
        // 额外显示配置
        extra_display_path: document.getElementById('extraPath').value.trim(),
        extra_display_func: document.getElementById('extraFunc').value.trim(),
        extra_file_pattern: document.getElementById('extraFilePattern').value.trim(),
        // 自定义曲线函数
        custom_curve_func: document.getElementById('customFunc').value.trim()
    };

    console.log('收集到的工具数据:', toolData);
    
    // 验证：单线程必须配置
    if (!toolData.single_path) {
        showError('单线程数据路径不能为空，请填写单线程接口路径');
        return;
    }

    if (toolData.single_path && !toolData.single_func) {
        showError('配置了单线程数据路径，请填写单线程接口函数');
        return;
    }

    if (toolData.multi_path && !toolData.multi_func) {
        showError('配置了多线程数据路径，请填写多线程接口函数');
        return;
    }
    
    try {
        let response;
        if (currentEditToolId) {
            console.log(`更新工具 ${currentEditToolId} 配置信息`, toolData);
            response = await axios.put(`${API_BASE}/tools/${encodeURIComponent(currentEditToolId)}`, toolData);
        } else {
            response = await axios.post(`${API_BASE}/tools`, { ...toolData });
        }
        
        if (response.data.success) {
            closeModal(toolModal);
            await loadTools();
            console.warn(`工具${toolName}配置信息保存成功`, response.data);
            showSuccess(currentEditToolId ? '工具更新成功' : '工具添加成功');
        } else {
            showError(response.data.error || '操作失败');
        }
    } catch (error) {
        console.error('保存工具失败:', error);
        showError('保存失败，请重试');
    }
}

/**
 * 保存并跳转
 */
async function saveAndJump() {
    const toolName = document.getElementById('toolName').value.trim();
    if (!toolName) {
        showError('请输入工具名称');
        return;
    }
    
    if (!currentEditToolId && tools[toolName]) {
        showError('工具名称已存在，请重新输入');
        return;
    }
    
    const toolData = {
        tool_name: toolName,
        description: document.getElementById('toolDesc').value.trim(),
        single_path: document.getElementById('singlePath').value.trim(),
        single_func: document.getElementById('singleFunc').value.trim(),
        single_file_pattern: document.getElementById('singleFilePattern').value.trim(),
        single_max_depth: parseInt(document.getElementById('singleMaxDepth').value) || 3,
        multi_path: document.getElementById('multiPath').value.trim(),
        multi_func: document.getElementById('multiFunc').value.trim(),
        multi_file_pattern: document.getElementById('multiFilePattern').value.trim(),
        multi_max_depth: parseInt(document.getElementById('multiMaxDepth').value) || 6,
        extra_display_path: document.getElementById('extraPath').value.trim(),
        extra_display_func: document.getElementById('extraFunc').value.trim(),
        extra_file_pattern: document.getElementById('extraFilePattern').value.trim(),
        custom_curve_func: document.getElementById('customFunc').value.trim()
    };
    
    if (toolData.single_path && !toolData.single_func) {
        showError('配置了单线程数据路径，请填写单线程接口函数');
        return;
    }
    if (toolData.multi_path && !toolData.multi_func) {
        showError('配置了多线程数据路径，请填写多线程接口函数');
        return;
    }
    
    try {
        let response;
        let finalToolId = currentEditToolId;
        
        if (currentEditToolId) {
            response = await axios.put(`${API_BASE}/tools/${encodeURIComponent(currentEditToolId)}`, toolData);
        } else {
            response = await axios.post(`${API_BASE}/tools`, { ...toolData, tool_id: toolName });
            finalToolId = toolName;
        }
        
        if (response.data.success) {
            window.location.href = `/tool/${encodeURIComponent(finalToolId)}`;
        } else {
            showError(response.data.error || '操作失败');
        }
    } catch (error) {
        console.error('保存工具失败:', error);
        showError('保存失败，请重试');
    }
}

/**
 * 删除工具
 */
async function deleteTool() {
    if (!deleteTargetId) return;
    console.log('删除工具, 工具ID:', deleteTargetId);
    try {
        const response = await axios.delete(`${API_BASE}/tools/${encodeURIComponent(deleteTargetId)}`);
        if (response.data.success) {
            closeModal(deleteModal);
            await loadTools();
            showSuccess(`${deleteTargetId}工具删除成功`);
            deleteTargetId = null;
        } else {
            showError(response.data.error || '删除失败');
        }
    } catch (error) {
        console.error('删除工具失败:', error);
        showError('删除失败，请重试');
    }
}

/**
 * 处理额外显示路径变化
 */
function handleExtraPathChange() {
    const extraPath = document.getElementById('extraPath');
    const extraFunc = document.getElementById('extraFunc');
    const extraPattern = document.getElementById('extraFilePattern');
    
    if (extraPath.value.trim()) {
        extraFunc.disabled = false;
        extraPattern.disabled = false;
    } else {
        extraFunc.disabled = true;
        extraFunc.value = '';
        extraPattern.disabled = true;
        extraPattern.value = '';
    }
}

/**
 * 更新工具数量显示
 */
function updateToolCount() {
    const count = Object.keys(tools).length;
    toolCount.textContent = count;
}

/**
 * 显示加载状态
 */
function showLoading(show) {
    if (show) {
        toolsList.innerHTML = `
            <div class="loading-spinner">
                <span>加载中...</span>
            </div>
        `;
    }
}

/**
 * 打开弹窗
 */
function openModal(modal) {
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
}

/**
 * 关闭弹窗
 */
function closeModal(modal) {
    modal.classList.remove('active');
    document.body.style.overflow = '';
}

/**
 * 显示成功消息
 */
function showSuccess(message) {
    showToast(message, 'success');
}

/**
 * 显示错误消息
 */
function showError(message) {
    showToast(message, 'error');
}

/**
 * 显示 Toast 提示
 */
function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    toast.style.cssText = `
        position: fixed;
        bottom: 20px;
        left: 50%;
        transform: translateX(-50%);
        background: ${type === 'success' ? '#10B981' : type === 'error' ? '#EF4444' : '#3B82F6'};
        color: white;
        padding: 10px 20px;
        border-radius: 8px;
        font-size: 14px;
        z-index: 1100;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    `;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

/**
 * 截断路径显示
 */
function truncatePath(path, maxLength = 30) {
    if (!path) return '';
    if (path.length <= maxLength) return path;
    return '...' + path.slice(-maxLength);
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
 * 初始化事件监听
 */
function initEventListeners() {
    backBtn.addEventListener('click', () => {
        window.location.href = '/';
    });
    
    addToolBtn.addEventListener('click', openAddModal);

    document.querySelectorAll('.modal-close, .modal-overlay').forEach(el => {
        el.addEventListener('click', (e) => {
            if (e.target === el || e.target.classList.contains('modal-close')) {
                closeModal(toolModal);
                closeModal(deleteModal);
            }
        });
    });
    
    document.getElementById('cancelModalBtn')?.addEventListener('click', () => closeModal(toolModal));
    document.getElementById('cancelDeleteBtn')?.addEventListener('click', () => closeModal(deleteModal));
    
    document.getElementById('saveModalBtn')?.addEventListener('click', saveTool);
    document.getElementById('saveAndJumpBtn')?.addEventListener('click', saveAndJump);
    document.getElementById('confirmDeleteBtn')?.addEventListener('click', deleteTool);
    
    document.getElementById('extraPath')?.addEventListener('input', handleExtraPathChange);
    console.log("config 中监听函数执行完成");
}

/**
 * 初始化页面
 */
function init() {
    initEventListeners();
    loadTools();
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', init);