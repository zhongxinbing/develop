// 通用请求封装
async function request(url, method = "GET", data = {}) {
    const opts = { method, headers: { "Content-Type": "application/json" } };
    if (method !== "GET") opts.body = JSON.stringify(data);
    const res = await fetch(url, opts);
    return await res.json();
}

// 弹窗显示/隐藏
function showModal(id) {
    document.getElementById(id).style.display = "flex";
}
function hideModal(id) {
    document.getElementById(id).style.display = "none";
}

// 跳转页面
function goPage(url) {
    window.location.href = url;
}