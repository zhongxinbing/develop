async function fetchTools() {
  const response = await fetch('/api/tools');
  return response.json();
}

function renderToolRow(tool) {
  const row = document.createElement('div');
  row.className = 'tool-card';
  row.innerHTML = `
    <h3>${tool.name}</h3>
    <p>${tool.description || '暂无描述'}</p>
    <p><strong>单线程数据路径：</strong>${tool.single_path || '未配置'}</p>
    <p><strong>多线程数据路径：</strong>${tool.multi_path || '未配置'}</p>
    <a class="button primary" href="/tool/${tool.id}">查看</a>
  `;
  return row;
}

async function loadConfigList() {
  const tools = await fetchTools();
  const list = document.getElementById('tool-list');
  const empty = document.getElementById('config-empty');
  list.innerHTML = '';
  if (!tools.length) {
    empty.hidden = false;
    return;
  }
  empty.hidden = true;
  tools.forEach(tool => list.appendChild(renderToolRow(tool)));
}

function showAddPanel() {
  document.getElementById('add-tool-panel').hidden = false;
}

function hideAddPanel() {
  document.getElementById('add-tool-panel').hidden = true;
}

async function submitToolForm(event) {
  event.preventDefault();
  const form = event.target;
  const payload = {
    name: form.name.value,
    description: form.description.value,
    single_path: form.single_path.value,
    multi_path: form.multi_path.value,
    extra_fields: form.extra_fields.value,
    single_data_func: form.single_data_func.value,
    multi_data_func: form.multi_data_func.value,
    custom_curve_func: form.custom_curve_func.value
  };
  const response = await fetch('/api/tools', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    const error = await response.json();
    alert(error.error || '保存失败');
    return;
  }
  const result = await response.json();
  window.location.href = `/tool/${result.id}`;
}

window.addEventListener('DOMContentLoaded', () => {
  loadConfigList();
  document.getElementById('open-add-tool').addEventListener('click', showAddPanel);
  document.getElementById('cancel-add').addEventListener('click', hideAddPanel);
  document.getElementById('tool-form').addEventListener('submit', submitToolForm);
});
