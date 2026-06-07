// frontend/js/app.js
// 等待所有脚本加载完成后再启动应用
(function() {
    function initApp() {
        // 检查所有依赖是否已加载
        if (typeof Router === 'undefined') {
            console.error('Router not loaded');
            return;
        }
        if (typeof HomePage === 'undefined') {
            console.error('HomePage not loaded');
            return;
        }
        if (typeof ConfigPage === 'undefined') {
            console.error('ConfigPage not loaded');
            return;
        }
        if (typeof ToolPage === 'undefined') {
            console.error('ToolPage not loaded');
            return;
        }
        
        // 所有依赖都已加载，启动应用
        window.router = new Router();
        window.router.start();
    }
    
    // 如果DOM已加载完成，立即初始化；否则等待
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initApp);
    } else {
        initApp();
    }
})();