const API_BASE = 'http://localhost:3000/api';

let currentEditId = null;

async function loadTools() {
    try {
        const response = await fetch(`${API_BASE}/tools`);
        const tools = await response.json();
        displayTools(tools);
    } catch (error) {
        console.error('Failed to load tools:', error);
        showError('加载工具列表失败');
    }
}

function displayTools(tools) {
    const toolsList = document.getElementById('toolsList');
    
    if (Object.keys(tools).length === 0) {
        toolsList.innerHTML = `
            <div class="empty-state">
                <p>暂无配置的工具</p>
                <p>点击"添加工具"按钮开始配置</p>
            </div>
        `;
        return;
    }
    
    toolsList.innerHTML = Object.entries(tools).map(([id, tool]) => `
        <div class="tool-config-item">
            <div class="tool-config-info">
                <h3>${escapeHtml(tool.toolName)}</h3>
                <p>${escapeHtml(tool.toolDescription || '暂无描述')}</p>
                <div class="tool-config-details">
                    <span>🔧 单线程: ${tool.singleThreadPath || '未配置'}</span>
                    <span>⚡ 多线程: ${tool.multiThreadPath || '未配置'}</span>
                    <span>📊 额外显示: ${tool.extraDisplay ? tool.extraDisplay.join(', ') : '无'}</span>
                </div>
            </div>
            <div class="tool-config-actions">
                <button class="btn btn-edit" onclick="editTool('${id}', ${JSON.stringify(tool).replace(/"/g, '&quot;')})">编辑</button>
                <button class="btn btn-delete" onclick="deleteTool('${id}')">删除</button>
            </div>
        </div>
    `).join('');
}

function openModal(editMode = false) {
    const modal = document.getElementById('toolModal');
    modal.style.display = 'flex';
    
    if (!editMode) {
        document.getElementById('modalTitle').textContent = '添加工具';
        document.getElementById('toolForm').reset();
        currentEditId = null;
    }
}

function closeModal() {
    const modal = document.getElementById('toolModal');
    modal.style.display = 'none';
    currentEditId = null;
}

function editTool(id, tool) {
    currentEditId = id;
    document.getElementById('modalTitle').textContent = '编辑工具';
    document.getElementById('toolName').value = tool.toolName || '';
    document.getElementById('toolDescription').value = tool.toolDescription || '';
    document.getElementById('singleThreadPath').value = tool.singleThreadPath || '';
    document.getElementById('multiThreadPath').value = tool.multiThreadPath || '';
    document.getElementById('singleThreadFunc').value = tool.singleThreadFunc || '';
    document.getElementById('multiThreadFunc').value = tool.multiThreadFunc || '';
    document.getElementById('customFunc').value = tool.customFunc || '';
    
    // 设置额外显示的复选框
    if (tool.extraDisplay) {
        document.querySelectorAll('#extraDisplay input[type="checkbox"]').forEach(cb => {
            cb.checked = tool.extraDisplay.includes(cb.value);
        });
    }
    
    openModal(true);
}

async function saveTool() {
    const toolData = {
        toolName: document.getElementById('toolName').value,
        toolDescription: document.getElementById('toolDescription').value,
        singleThreadPath: document.getElementById('singleThreadPath').value,
        multiThreadPath: document.getElementById('multiThreadPath').value,
        extraDisplay: Array.from(document.querySelectorAll('#extraDisplay input:checked')).map(cb => cb.value),
        singleThreadFunc: document.getElementById('singleThreadFunc').value,
        multiThreadFunc: document.getElementById('multiThreadFunc').value,
        customFunc: document.getElementById('customFunc').value
    };
    
    if (!toolData.toolName) {
        showError('请填写工具名称');
        return;
    }
    
    try {
        let response;
        if (currentEditId) {
            response = await fetch(`${API_BASE}/tools/${currentEditId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(toolData)
            });
        } else {
            response = await fetch(`${API_BASE}/tools`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(toolData)
            });
        }
        
        if (response.ok) {
            closeModal();
            loadTools();
            showSuccess(currentEditId ? '工具更新成功' : '工具添加成功');
        } else {
            showError('保存失败');
        }
    } catch (error) {
        console.error('Failed to save tool:', error);
        showError('保存失败');
    }
}

async function deleteTool(id) {
    if (confirm('确定要删除这个工具吗？这将同时删除所有相关数据。')) {
        try {
            const response = await fetch(`${API_BASE}/tools/${id}`, {
                method: 'DELETE'
            });
            
            if (response.ok) {
                loadTools();
                showSuccess('工具删除成功');
            } else {
                showError('删除失败');
            }
        } catch (error) {
            console.error('Failed to delete tool:', error);
            showError('删除失败');
        }
    }
}

function showError(message) {
    alert(message);
}

function showSuccess(message) {
    alert(message);
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// 初始化
document.addEventListener('DOMContentLoaded', () => {
    loadTools();
    
    document.getElementById('addToolBtn').addEventListener('click', () => openModal(false));
    
    // 点击模态框外部关闭
    window.onclick = function(event) {
        const modal = document.getElementById('toolModal');
        if (event.target === modal) {
            closeModal();
        }
    };
});