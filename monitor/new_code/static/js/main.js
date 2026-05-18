const toolSelect = document.getElementById('toolSelect');
const threadSelect = document.getElementById('threadSelect');
const previewTool = document.getElementById('previewTool');
const previewThread = document.getElementById('previewThread');
const statusMsg = document.getElementById('statusMsg');
const submitBtn = document.getElementById('submitBtn');
const targetInfo = document.getElementById('targetInfo');
const targetPageSpan = document.getElementById('targetPage');

function updatePreview() {
    const tool = toolSelect.value;
    const thread = threadSelect.value;
    
    let toolText = '未选择';
    if (tool === 'elint') toolText = 'ELINT';
    if (tool === 'ecdc') toolText = 'ECDC';
    
    let threadText = '未选择';
    if (thread === 'single') threadText = '单线程';
    if (thread === 'multi') threadText = '多线程';
    
    previewTool.textContent = toolText;
    previewThread.textContent = threadText;
    
    if (tool && thread) {
        targetPageSpan.textContent = `/${tool}_${thread}`;
        targetInfo.style.display = 'block';
    } else {
        targetInfo.style.display = 'none';
    }
}

toolSelect.addEventListener('change', updatePreview);
threadSelect.addEventListener('change', updatePreview);
updatePreview();

async function submitAndNavigate() {
    const tool = toolSelect.value;
    const thread = threadSelect.value;
    
    if (!tool || !thread) {
        statusMsg.innerHTML = '❌ 请完整选择工具和线程模式';
        statusMsg.style.color = '#ef4444';
        return;
    }
    
    statusMsg.innerHTML = '<span class="spinner" style="display: inline-block; width: 16px; height: 16px;"></span> 正在获取数据...';
    statusMsg.style.color = '#f59e0b';
    
    try {
        const response = await fetch('/api/get_config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tool, thread })
        });
        
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        const data = await response.json();
        
        const toolName = tool === 'elint' ? 'ELINT' : 'ECDC';
        const threadName = thread === 'single' ? '单线程' : '多线程';
        
        statusMsg.innerHTML = `✅ 数据获取成功！即将跳转到 ${toolName} - ${threadName} 监控页面...`;
        statusMsg.style.color = '#10b981';
        
        setTimeout(() => {
            window.location.href = `/${tool}_${thread}`;
        }, 1000);
        
    } catch (error) {
        console.error('请求失败:', error);
        statusMsg.innerHTML = `❌ 数据获取失败: ${error.message}`;
        statusMsg.style.color = '#ef4444';
    }
}

submitBtn.addEventListener('click', (e) => {
    e.preventDefault();
    submitAndNavigate();
});

function updateThreadOptions() {
    const currentTool = toolSelect.value;
    const threadConfig = toolConfig[currentTool]?.thread || {};
    
    const optionsHtml = Object.entries(threadConfig)
        .map(([value, text]) => `<option value="${value}">${text}</option>`)
        .join('');
    
    threadSelect.innerHTML = `<option value="">请选择线程模式</option>${optionsHtml}`;
    updatePreview();
}

toolSelect.addEventListener('change', updateThreadOptions);