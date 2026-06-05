async function loadTools() {
  const response = await fetch('/api/tools');
  const tools = await response.json();
  const toolGrid = document.getElementById('tool-grid');
  const tooltipList = document.getElementById('tooltip-list');
  const toolCount = document.getElementById('tool-count');
  const emptyState = document.getElementById('empty-state');

  toolGrid.innerHTML = '';
  tooltipList.innerHTML = '';
  toolCount.textContent = tools.length;
  if (tools.length === 0) {
    emptyState.hidden = false;
    return;
  }
  emptyState.hidden = true;

  tools.forEach(tool => {
    const card = document.createElement('div');
    card.className = 'tool-card';
    card.innerHTML = `
      <h3>${tool.name}</h3>
      <p>${tool.description || '暂无描述'}</p>
      <a class="button primary" href="/tool/${tool.id}">进入工具</a>
    `;
    toolGrid.appendChild(card);

    const item = document.createElement('div');
    item.className = 'tooltip-item';
    item.innerHTML = `<strong>${tool.name}</strong><div>${tool.description || '暂无描述'}</div>`;
    tooltipList.appendChild(item);
  });
}

window.addEventListener('DOMContentLoaded', loadTools);
