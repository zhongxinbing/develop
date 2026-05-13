
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
    
    // 更新目标页面显示
    if (tool && thread) {
        const targetPage = `/${tool}_${thread}`;
        targetPageSpan.textContent = targetPage;
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
    
    // 验证选择
    if (!tool || !thread) {
        statusMsg.innerHTML = '❌ 请完整选择工具和线程模式';
        statusMsg.className = 'error';
        return;
    }
    
    // 显示加载状态
    statusMsg.innerHTML = '<span class="loading"></span> 正在获取数据...';
    statusMsg.className = '';
    
    try {
        // 先获取数据
        const response = await fetch('/api/get_config', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                tool: tool,
                thread: thread
            })
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        const data = await response.json();
        console.log('获取到的数据:', data);
        
        // 显示成功信息
        const toolName = tool === 'elint' ? 'ELINT' : 'ECDC';
        const threadName = thread === 'single' ? '单线程' : '多线程';
        
        statusMsg.innerHTML = `✅ 数据获取成功！<br>
            📊 工具: ${toolName}<br>
            ⚡ 线程模式: ${threadName}<br>
            🎯 配置值: <strong>${data.original_path || 'N/A'}</strong><br>
            📝 说明: ${data.data_path || '无'}<br>
            <span style="font-size:0.85rem;">⏰ 即将跳转到对应页面...</span>`;
        statusMsg.className = 'success';
        
        // 延迟1秒后跳转，让用户看到获取到的数据
        setTimeout(() => {
            window.location.href = `/${tool}_${thread}`;
        }, 1500);
        
    } catch (error) {
        console.error('请求失败:', error);
        statusMsg.innerHTML = `❌ 数据获取失败: ${error.message}<br>
            💡 请确保后端服务正常运行<br>
            🔧 当前选择: ${tool}/${thread}`;
        statusMsg.className = 'error';
    }
}

submitBtn.addEventListener('click', (e) => {
    // 阻止按钮的默认行为，让你可以用 JavaScript 完全控制接下来的操作
    e.preventDefault();
    submitAndNavigate();
});

// // 根据工具来显示线程模式
function updatetoolSelect() {

    const select = document.getElementById('toolSelect');
    // 获取当前 选择器的值
    const currentTool = select.value;
    const threadSelectJson = toolConfig[currentTool].thread
    console.log("可选择线程:", threadSelectJson)

    const optionsHtml = Object.entries(threadSelectJson)
        .map(([value, text]) => `<option value="${value}">${text}</option>`)
        .join('');

    document.getElementById("threadSelect").innerHTML = `<option value="" selected>请选择线程模式</option> ${optionsHtml}`

}

document.getElementById('toolSelect').addEventListener('change', (e) => {
    updatetoolSelect();
});