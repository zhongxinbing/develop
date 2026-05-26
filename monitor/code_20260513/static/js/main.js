// 匹配指定 CSS 选择器的元素
const toolCards = document.querySelectorAll('.tool-card');

let selectedTool = '';

function updatePreview() {
    // 主页现在直接点击卡片跳转，无需展示预览状态。
}

function selectTool(tool) {
    selectedTool = tool;
    toolCards.forEach(card => card.classList.toggle('active', card.dataset.tool === tool));
    updatePreview();
}

toolCards.forEach(card => {
    card.addEventListener('click', () => {
        selectTool(card.dataset.tool);
        submitAndNavigate();
    });
});

if (toolCards.length === 1) {
    selectTool(toolCards[0].dataset.tool);
}

updatePreview();

async function submitAndNavigate() {
    if (!selectedTool) {
        console.error('请先选择一个工具');
        return;
    }

    // 直接跳转前先请求后端，以保证工具配置加载。

    try {
        const response = await fetch('/api/get_config', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                tool: selectedTool,
                thread: 'single'
            })
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();

        window.location.href = `/${selectedTool}`;
    } catch (error) {
        console.error('请求失败:', error);
    }
}

