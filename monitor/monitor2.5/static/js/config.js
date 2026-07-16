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
    // 获取工具的键名数组
    const toolKeys = Object.keys(tools);
    console.log('工具: ', toolKeys);
    console.log('工具数量:', toolKeys.length);
    // 如果没有工具，显示空状态
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
    // 渲染工具卡片
    toolsList.innerHTML = '';
    // 遍历工具配置，创建卡片
    toolKeys.forEach(toolId => {
        const tool = tools[toolId];
        // 创建工具配置卡片
        console.log('创建工具配置卡片:', toolId, '配置:', tool);
        const card = createToolConfigCard(toolId, tool);
        // 将卡片添加到工具列表容器中
        console.log('添加工具配置卡片到列表:', card);
        toolsList.appendChild(card);
    });
}

/**
 * 创建工具配置卡片
 */
function createToolConfigCard(toolId, tool) {
    // 创建卡片元素
    const card = document.createElement('div');
    // 设置卡片样式
    card.className = 'tool-config-card';
    
    const hasSingle = tool.single_path;
    const hasMulti = tool.multi_path;
    const hasExtra = tool.extra_display_path;
    // 从工具配置中获取配置内容，设置卡片内容
    card.innerHTML = `
        <div class="tool-config-info">
            <h4>${escapeHtml(tool.tool_name || toolId)}</h4>
            <p>${escapeHtml(tool.description || '暂无描述')}</p>
            <div class="tool-config-meta">
                ${hasSingle ? `<span><i class="fas fa-chart-simple"></i> 单线程: ${truncatePath(tool.single_path)}</span>` : ''}
                ${hasMulti ? `<span><i class="fas fa-diagram-project"></i> 多线程: ${truncatePath(tool.multi_path)}</span>` : ''}
                ${hasExtra ? `<span><i class="fas fa-chart-line"></i> 额外显示</span>` : ''}
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
    
    // 绑定事件, 防止事件冒泡
    const editBtn = card.querySelector('.edit-btn');
    // 绑定编辑按钮点击事件
    const deleteBtn = card.querySelector('.delete-btn');

    // 绑定编辑按钮点击事件
    editBtn.addEventListener('click', (e) => {
        // 阻止事件冒泡，避免触发卡片点击事件
        e.stopPropagation();
        openEditModal(toolId, tool);
    });

    // 绑定删除按钮点击事件
    deleteBtn.addEventListener('click', (e) => {
        // 阻止事件冒泡，避免触发卡片点击事件
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
    
    // 填充表单
    document.getElementById('toolName').value = tool.tool_name || toolId;
    document.getElementById('toolDesc').value = tool.description || '';
    document.getElementById('singlePath').value = tool.single_path || '';
    document.getElementById('singleFunc').value = tool.single_func || '';
    document.getElementById('multiPath').value = tool.multi_path || '';
    document.getElementById('multiFunc').value = tool.multi_func || '';
    document.getElementById('extraPath').value = tool.extra_display_path || '';
    document.getElementById('extraFunc').value = tool.extra_display_func || '';
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
    
    // 检查工具名称是否已存在（添加模式）
    if (!currentEditToolId && tools[toolName]) {
        showError('工具名称已存在，请重新输入');
        return;
    }
    // 收集表单数据
    console.log('收集表单数据');
    const toolData = {
        tool_name: toolName,
        description: document.getElementById('toolDesc').value.trim(),
        single_path: document.getElementById('singlePath').value.trim(),
        single_func: document.getElementById('singleFunc').value.trim(),
        multi_path: document.getElementById('multiPath').value.trim(),
        multi_func: document.getElementById('multiFunc').value.trim(),
        extra_display_path: document.getElementById('extraPath').value.trim(),
        extra_display_func: document.getElementById('extraFunc').value.trim(),
        custom_curve_func: document.getElementById('customFunc').value.trim()
    };

    console.log('收集到的工具数据:', toolData);
    // 验证：单线成必须配置
    if (!toolData.single_path) {
        showError('单线成数据路径不能为空，请填写单线程接口路径');
        return;
    }

    // 验证：如果配置了单线程路径但没有配置函数
    if (toolData.single_path && !toolData.single_func) {
        showError('配置了单线程数据路径，请填写单线程接口函数');
        return;
    }

    // 验证：如果配置了多线程路径但没有配置函数
    if (toolData.multi_path && !toolData.multi_func) {
        showError('配置了多线程数据路径，请填写多线程接口函数');
        return;
    }
    
    try {
        let response;
        // 根据当前编辑工具 ID 判断是更新还是添加
        if (currentEditToolId) {
            // 更新
            console.log(`更新工具 ${currentEditToolId} 配置信息`, toolData);
            response = await axios.put(`${API_BASE}/tools/${encodeURIComponent(currentEditToolId)}`, toolData);
        } else {
            // 添加
            response = await axios.post(`${API_BASE}/tools`, { ...toolData});
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
    
    // 检查工具名称是否已存在（添加模式）
    if (!currentEditToolId && tools[toolName]) {
        showError('工具名称已存在，请重新输入');
        return;
    }
    
    const toolData = {
        tool_name: toolName,
        description: document.getElementById('toolDesc').value.trim(),
        single_path: document.getElementById('singlePath').value.trim(),
        single_func: document.getElementById('singleFunc').value.trim(),
        multi_path: document.getElementById('multiPath').value.trim(),
        multi_func: document.getElementById('multiFunc').value.trim(),
        extra_display_path: document.getElementById('extraPath').value.trim(),
        extra_display_func: document.getElementById('extraFunc').value.trim(),
        custom_curve_func: document.getElementById('customFunc').value.trim()
    };
    
    // 验证
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
            // 跳转到工具页面
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
    
    if (extraPath.value.trim()) {
        extraFunc.disabled = false;
    } else {
        extraFunc.disabled = true;
        extraFunc.value = '';
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
    // 给 modal 添加 active 类 css，显示弹窗
    modal.classList.add('active');
    // 给 body 添加 overflow hidden，防止背景滚动
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
    // 返回按钮、可以直接返回到主页面
    backBtn.addEventListener('click', () => {
        window.location.href = '/';
    });
    
    // 添加工具按钮，并弹出配置添加页面
    addToolBtn.addEventListener('click', openAddModal);

    // 弹窗关闭按钮
    document.querySelectorAll('.modal-close, .modal-overlay').forEach(el => {
        el.addEventListener('click', (e) => {
            if (e.target === el || e.target.classList.contains('modal-close')) {
                closeModal(toolModal);
                closeModal(deleteModal);
            }
        });
    });
    
    // 取消按钮
    document.getElementById('cancelModalBtn')?.addEventListener('click', () => closeModal(toolModal));
    document.getElementById('cancelDeleteBtn')?.addEventListener('click', () => closeModal(deleteModal));
    
    // 保存按钮
    document.getElementById('saveModalBtn')?.addEventListener('click', saveTool);
    document.getElementById('saveAndJumpBtn')?.addEventListener('click', saveAndJump);
    document.getElementById('confirmDeleteBtn')?.addEventListener('click', deleteTool);
    
    // 额外显示路径变化监听
    document.getElementById('extraPath')?.addEventListener('input', handleExtraPathChange);
    console.log("config 中监听函数执行完成")
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