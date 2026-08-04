/**
 * 工具页面逻辑 - 主控制器
 * 负责模式切换、数据加载、对比功能（版本对比 & 线程对比）
 */

// 从 URL 获取工具 ID
const pathParts = window.location.pathname.split('/').filter(Boolean);
const toolId = pathParts[0] === 'tool' && pathParts.length >= 2 ? pathParts[1] : pathParts[pathParts.length - 1];
window.toolId = toolId;

// 全局状态
let toolConfig = null;
let rawData = {};
let userAddedData = {};
let currentMode = 'single';          // 'single' | 'multi' | 'thread' | 'comparison'
let currentChartType = 'cputime';
let singleThreadManager = null;
let multiThreadManager = null;
let threadChartManager = null;
let comparisonManager = null;

const CHART_GROUP_MAP = {
    cputime: 'runtime',
    realtime: 'runtime',
    peakmem: 'memory',
    incmem: 'memory',
    realtimeincmem: 'memory'
};

/**
 * 解析图表类型所属的分组
 * 
 * 根据传入的图表类型参数，通过映射表查找对应的图表分组。
 * 如果映射表中不存在，则直接返回规范化后的类型名称；
 * 若参数为空，则返回默认值 'runtime'。
 * 
 * @param {string} chartType - 图表类型标识，可为空
 * @returns {string} 图表分组名称，默认为 'runtime'
 */
function resolveChartGroup(chartType) {
    // 将图表类型转为字符串并转为小写，默认为 'runtime'
    const key = String(chartType || 'runtime').toLowerCase();
    // 优先从映射表中查找分组，找不到则返回 key，最后兜底返回 'runtime'
    return CHART_GROUP_MAP[key] || key || 'runtime';
}

/**
 * 获取指定分组下的默认子图表类型
 * 
 * 根据传入的分组名称返回对应的默认子图表类型：
 * - 内存分组 ('memory') 返回 'peakmem'（峰值内存）
 * - 其他分组默认返回 'cputime'（CPU 时间）
 * 
 * @param {string} group - 图表分组名称，如 'memory'、'runtime' 等
 * @returns {string} 默认子图表类型标识
 */
function getDefaultSubChart(group) {
    // 内存分组默认显示峰值内存图表，其他分组默认显示 CPU 时间图表
    return group === 'memory' ? 'peakmem' : 'cputime';
}

/**
 * 从侧边栏获取当前激活的图表类型
 * 
 * 根据侧边栏元素的 ID，查找当前选中的菜单项并返回对应的图表类型。
 * 查找优先级：子菜单 > 主菜单 > 默认值 'cputime'。
 * 对于 'runtime' 和 'memory' 分组，会进一步解析为默认子图表。
 * 
 * @param {string} sidebarId - 侧边栏元素的 DOM ID
 * @returns {string} 当前激活的图表类型标识，默认为 'cputime'
 */
function getActiveChartFromSidebar(sidebarId) {
    // 根据 ID 获取侧边栏 DOM 元素，若不存在则返回默认值
    const sidebar = document.getElementById(sidebarId);
    if (!sidebar) return 'cputime';

    // 优先查找已激活的子菜单项
    const activeSubMenuItem = sidebar.querySelector('.sub-menu-item.active');
    if (activeSubMenuItem) {
        // 返回子菜单对应的图表类型，优先使用 chart 属性，其次 threadChart，最后兜底
        return activeSubMenuItem.dataset.chart || activeSubMenuItem.dataset.threadChart || 'cputime';
    }

    // 若没有激活的子菜单，则查找激活的主菜单项
    const activeMenuItem = sidebar.querySelector('.menu-item.active');
    // 获取主菜单对应的图表类型，缺省为 'runtime'
    const menuChart = activeMenuItem ? (activeMenuItem.dataset.chart || activeMenuItem.dataset.threadChart) : 'runtime';
    // 对于 runtime 和 memory 这两个分组，需要解析为其默认的子图表
    if (menuChart === 'runtime' || menuChart === 'memory') {
        return getDefaultSubChart(resolveChartGroup(menuChart));
    }
    // 其他情况直接返回菜单对应的图表类型
    return menuChart || 'cputime';
}

/**
 * 同步侧边栏的选中状态
 * 
 * 根据选中的图表类型，更新侧边栏中主菜单和子菜单的激活状态。
 * 主菜单按分组匹配，子菜单按具体图表类型匹配。
 * 最后同步分组导航的展开/折叠状态。
 * 
 * @param {string} sidebarId - 侧边栏元素的 DOM ID
 * @param {string} selectedChartType - 当前选中的图表类型
 */
function syncSidebarSelection(sidebarId, selectedChartType) {
    // 获取侧边栏 DOM 元素，若不存在则直接返回
    const sidebar = document.getElementById(sidebarId);
    if (!sidebar) return;

    // 解析选中图表类型所属的分组
    const group = resolveChartGroup(selectedChartType);

    // 遍历所有主菜单项，根据分组匹配激活状态
    sidebar.querySelectorAll('.menu-item').forEach(menuItem => {
        // 获取主菜单项对应的图表分组标识
        const menuKey = menuItem.dataset.chart || menuItem.dataset.threadChart;
        // 判断该项是否属于当前选中的分组
        const isActive = menuKey === group;
        // 切换 active 类名
        menuItem.classList.toggle('active', isActive);
    });

    // 遍历所有子菜单项，根据具体图表类型匹配激活状态
    sidebar.querySelectorAll('.sub-menu-item').forEach(subItem => {
        // 获取子菜单项对应的具体图表类型
        const subKey = subItem.dataset.chart || subItem.dataset.threadChart;
        // 判断该项是否为当前选中的图表类型
        const isActive = subKey === selectedChartType;
        // 切换 active 类名
        subItem.classList.toggle('active', isActive);
    });

    // 同步分组导航的展开/折叠状态
    syncGroupNavigation(sidebarId, group);
}

/**
 * 同步分组导航的展开/折叠状态
 * 
 * 根据指定的分组名称，更新侧边栏中主菜单和子菜单的展开/折叠状态。
 * - 主菜单：匹配分组时添加 active 类，未匹配的 runtime/memory 类菜单保持折叠
 * - 子菜单：仅当父级菜单匹配分组时展开，其余子菜单折叠
 * 
 * @param {string} sidebarId - 侧边栏元素的 DOM ID
 * @param {string} expandedGroup - 需要展开的分组名称，如 'runtime'、'memory'
 */
function syncGroupNavigation(sidebarId, expandedGroup) {
    // 获取侧边栏 DOM 元素，若不存在则直接返回
    const sidebar = document.getElementById(sidebarId);
    if (!sidebar) return;

    // 获取侧边栏内所有主菜单项和子菜单容器
    const menuItems = sidebar.querySelectorAll('.menu-item');
    const subMenus = sidebar.querySelectorAll('.sub-menu');

    // 遍历主菜单项，更新激活和折叠状态
    menuItems.forEach(menu => {
        // 判断当前菜单是否为 runtime 或 memory 类型（需要折叠的菜单）
        const isRuntimeMemory = menu.dataset.chart === 'runtime' || menu.dataset.chart === 'memory';
        const isThreadRuntimeMemory = menu.dataset.threadChart === 'runtime' || menu.dataset.threadChart === 'memory';
        // 判断当前菜单是否为需要展开的目标分组
        const shouldExpand = (menu.dataset.chart === expandedGroup) || (menu.dataset.threadChart === expandedGroup);
        // 匹配分组时添加 active 类
        menu.classList.toggle('active', shouldExpand);
        // 未匹配且为 runtime/memory 类型时保持折叠状态
        menu.classList.toggle('collapsed', !shouldExpand && (isRuntimeMemory || isThreadRuntimeMemory));
    });

    // 遍历子菜单容器，根据父级菜单状态更新展开/折叠
    subMenus.forEach(subMenu => {
        // 获取子菜单的父级主菜单项（前一个兄弟元素）
        const parent = subMenu.previousElementSibling;
        // 判断父级菜单是否为当前展开的分组
        const isExpanded = parent && (
            (parent.dataset.chart && parent.dataset.chart === expandedGroup) ||
            (parent.dataset.threadChart && parent.dataset.threadChart === expandedGroup)
        );
        // 折叠不匹配的子菜单
        subMenu.classList.toggle('collapsed', !isExpanded);
    });
}

/**
 * 初始化侧边栏默认状态
 * 
 * 该函数在页面加载时调用，负责：
 * 1. 将三个侧边栏（单线程、多线程、线程视图）的分组导航同步到 'runtime' 分组，
 *    使其默认展开运行时相关的子菜单。
 * 2. 将每个侧边栏中 cputime（CPU 时间）对应的子菜单项设为默认激活状态，
 *    确保首次进入页面时显示 CPU 时间相关的图表。
 */
function initializeDefaultSidebarState() {
    // 将三个侧边栏的分组导航同步到 'runtime' 分组（展开运行时分组）
    syncGroupNavigation('singleSidebar', 'runtime');
    syncGroupNavigation('multiSidebar', 'runtime');
    syncGroupNavigation('threadSidebar', 'runtime');

    // 单线程侧边栏：将 chart 类型为 'cputime' 的子菜单项设为激活状态
    document.querySelectorAll('#singleSidebar .sub-menu-item').forEach(item => {
        item.classList.toggle('active', item.dataset.chart === 'cputime');
    });
    // 多线程侧边栏：将 chart 类型为 'cputime' 的子菜单项设为激活状态
    document.querySelectorAll('#multiSidebar .sub-menu-item').forEach(item => {
        item.classList.toggle('active', item.dataset.chart === 'cputime');
    });
    // 线程视图侧边栏：将 threadChart 类型为 'cputime' 的子菜单项设为激活状态
    document.querySelectorAll('#threadSidebar .sub-menu-item').forEach(item => {
        item.classList.toggle('active', item.dataset.threadChart === 'cputime');
    });
}

// DOM 元素
const toolNameEl = document.getElementById('toolName');
const toolDescEl = document.getElementById('toolDesc');
const backBtn = document.getElementById('backBtn');
const refreshBtn = document.getElementById('refreshBtn');
const modeNavItems = document.querySelectorAll('.mode-nav-item');

/**
 * 页面主入口函数 - 初始化流程
 * 
 * 按顺序执行以下步骤：
 * 1. 加载工具配置信息（如工具ID、名称等元数据）
 * 2. 初始化侧边栏默认状态（展开运行时分组，选中 cputime 菜单项）
 * 3. 加载业务数据（如性能指标、图表数据等）
 * 4. 绑定 DOM 事件监听器
 * 5. 初始化对比模块管理器，用于对比模式下的子选项卡切换
 */
async function init() {
    console.log('页面初始化开始');

    // 加载工具配置（工具元信息、权限、可用图表列表等）
    await loadToolConfig();

    // 同步侧边栏分组导航 + 设置默认激活的子菜单项
    initializeDefaultSidebarState();

    // 加载页面所需的全部业务数据（异步，需等待完成）
    await loadData();

    // 绑定全局 DOM 事件监听器（按钮点击、菜单切换等）
    initEventListeners();
    
    // 初始化对比模块管理器
    comparisonManager = new ComparisonManager();
    // 传入工具ID和获取当前模式的回调函数
    comparisonManager.init(toolId, () => currentMode);
    
    console.log('页面初始化完成');
}

/**
 * 加载工具配置
 */
async function loadToolConfig() {
    try {
        const response = await axios.get('/api/tools');
        if (response.data.success) {
            const tools = response.data.data;
            toolConfig = tools[toolId];
            if (toolConfig) {
                toolNameEl.textContent = toolConfig.tool_name || toolId;
                toolDescEl.textContent = toolConfig.description || '';
                console.log('工具配置加载成功:', toolConfig.tool_name);
            } else {
                showError('工具不存在');
            }
        } else {
            console.error('加载工具配置失败:', response.data.error);
            showError('加载工具配置失败: ' + (response.data.error || '未知错误'));
        }
    } catch (error) {
        console.error('加载工具配置失败:', error);
        showError('加载工具配置失败');
    }
}

/**
 * 加载数据
 */
async function loadData() {
    try {
        showLoading(true);
        const response = await axios.post(`/api/tools/${toolId}/data`);

        if (response.data.success) {
            showSuccess('正在加载数据，请稍等...');
            const data = response.data.data || {};

            let singleData = {};
            let multiData = {};
            let extraData = {};
            let userData = {};

            if (typeof data === 'string') {
                try {
                    const parsed = JSON.parse(data);
                    if (parsed.single) singleData = parsed.single;
                    if (parsed.multi) multiData = parsed.multi;
                    if (parsed.extra) extraData = parsed.extra;
                    if (parsed.user) userData = parsed.user;
                } catch (e) {
                    singleData = data;
                }
            } else {
                if (data.single) singleData = data.single;
                if (data.multi) multiData = data.multi;
                if (data.extra) extraData = data.extra;
                if (data.user) userData = data.user;
            }

            window.singleData = singleData;
            window.multiData = multiData;
            window.extraData = extraData;
            window.userData = userData;

            showSuccess(response.data.message);

            // 获取图表容器
            const container = document.getElementById('mainChart');

            // 初始化单线程模块
            if (window.SingleThreadManager) {
                singleThreadManager = new window.SingleThreadManager();
                if (container) {
                    singleThreadManager.chart = echarts.init(container);
                }
                await singleThreadManager.init(singleData, userData, extraData);
                singleThreadManager.updateOverview();
            }

            // 初始化多线程模块
            if (window.MultiThreadManager) {
                multiThreadManager = new window.MultiThreadManager();
                if (container) {
                    multiThreadManager.chart = echarts.init(container);
                }
                await multiThreadManager.init(multiData, userData, extraData);
                multiThreadManager.updateOverview();
            }

            // 初始化线程曲线图模块
            if (window.ThreadChartManager) {
                threadChartManager = new window.ThreadChartManager();
                if (container) {
                    threadChartManager.chart = echarts.init(container);
                }
                await threadChartManager.init(multiData, userData);
            }

            // 默认显示单线程模式
            await switchToSingleMode();
        } else {
            console.error('加载数据失败:', response.data.error);
            showError('加载数据失败: ' + (response.data.error || '未知错误'));
        }
    } catch (error) {
        console.error('加载数据失败:', error);
        showError('加载数据失败:' + (error.response?.data?.error || error.message));
    } finally {
        showLoading(false);
    }
}

// ===== 模式切换函数 =====

function updateModeNav(mode) {
    modeNavItems.forEach(item => {
        item.classList.toggle('active', item.dataset.mode === mode);
    });
}

function toggleSidebars(mode) {
    const singleSidebar = document.getElementById('singleSidebar');
    const multiSidebar = document.getElementById('multiSidebar');
    const threadSidebar = document.getElementById('threadSidebar');

    singleSidebar.style.display = (mode === 'single') ? 'flex' : 'none';
    multiSidebar.style.display = (mode === 'multi') ? 'flex' : 'none';
    threadSidebar.style.display = (mode === 'thread') ? 'flex' : 'none';
}

function showThreadSelector(show) {
    const container = document.getElementById('multiThreadSelectorContainer');
    if (container) container.style.display = show ? 'block' : 'none';
}

function hideThreadSelector() {
    showThreadSelector(false);
}

function showNormalContent(show) {
    const normal = document.getElementById('normalContent');
    if (normal) normal.style.display = show ? 'block' : 'none';
}

function showComparisonContainer(show) {
    const container = document.getElementById('comparisonContainer');
    if (container) container.style.display = show ? 'block' : 'none';
}

async function switchToComparisonMode() {
    currentMode = 'comparison';
    updateModeNav('comparison');
    toggleSidebars(null);
    hideThreadSelector();
    showNormalContent(false);
    showComparisonContainer(true);
    
    // 使用 ComparisonManager 显示子选项卡
    if (comparisonManager) {
        comparisonManager.showSubMode('version');
    }
}


// ===== 模式切换具体实现 =====

async function switchToSingleMode() {
    currentMode = 'single';
    updateModeNav('single');
    toggleSidebars('single');
    hideThreadSelector();
    showNormalContent(true);
    showComparisonContainer(false);

    const currentChartType = getActiveChartFromSidebar('singleSidebar');
    if (currentChartType !== 'comparison') {
        await renderSingleChart();
    }
    if (singleThreadManager) singleThreadManager.updateOverview();
}

async function switchToMultiMode() {
    currentMode = 'multi';
    updateModeNav('multi');
    toggleSidebars('multi');
    showThreadSelector(true);
    showNormalContent(true);
    showComparisonContainer(false);

    const currentChartType = getActiveChartFromSidebar('multiSidebar');
    if (currentChartType !== 'comparison') {
        await renderMultiChart();
    }
    if (multiThreadManager) multiThreadManager.updateOverview();
}

async function switchToThreadMode() {
    currentMode = 'thread';
    updateModeNav('thread');
    toggleSidebars('thread');
    hideThreadSelector();
    showNormalContent(true);
    showComparisonContainer(false);

    if (threadChartManager) {
        // 获取当前选中的图表类型
        const activeSub = document.querySelector('#threadSidebar .sub-menu-item.active');
        const chartType = activeSub ? activeSub.dataset.threadChart : 'cputime';
        threadChartManager.setChartType(chartType);
        await threadChartManager.renderChart();
    }
}

async function switchToComparisonMode() {
    currentMode = 'comparison';
    updateModeNav('comparison');
    toggleSidebars(null);          // 隐藏所有侧边栏
    hideThreadSelector();
    showNormalContent(false);
    showComparisonContainer(true);

    // 默认显示版本对比子选项卡
    // showComparisonSubMode('version');
}

async function renderSingleChart() {
    if (singleThreadManager) {
        await singleThreadManager.renderChart();
    }
}

/**
 * 渲染多线程图表
 * 
 * 异步函数，通过多线程管理器渲染图表。
 * 如果多线程管理器实例存在，则调用其 renderChart 方法进行图表渲染。
 * 
 * @returns {Promise<void>} 返回一个 Promise，在图表渲染完成后 resolve
 */
async function renderMultiChart() {
    // 检查多线程管理器实例是否存在
    if (multiThreadManager) {
        // 等待多线程管理器完成图表渲染
        await multiThreadManager.renderChart();
    }
}










// ===== 通用工具函数 =====

function showLoading(show) {
    const overlay = document.getElementById('chartLoadingOverlay');
    if (overlay) {
        overlay.classList.toggle('visible', Boolean(show));
        overlay.setAttribute('aria-busy', show ? 'true' : 'false');
    }
}

function showSuccess(message) {
    showToast(message, 'success');
}

function showError(message) {
    showToast(message, 'error');
}

function showToast(message, type = 'info') {
    const toast = document.createElement('div');
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

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatDate(dateStr) {
    if (!dateStr) return '';
    if (dateStr.includes('_user')) {
        return dateStr.replace('_user', ' (用户)');
    }
    if (dateStr.length === 8 && /^\d+$/.test(dateStr)) {
        return `${dateStr.slice(0,4)}-${dateStr.slice(4,6)}-${dateStr.slice(6,8)}`;
    }
    return dateStr;
}

// ===== 事件监听（侧边栏等） =====

function initEventListeners() {
    // 返回按钮
    backBtn.addEventListener('click', () => {
        window.location.href = '/';
    });

    // 刷新按钮
    refreshBtn.addEventListener('click', refreshData);

    // 模式切换
    modeNavItems.forEach(item => {
        item.addEventListener('click', async () => {
            const mode = item.dataset.mode;
            if (mode === 'single') await switchToSingleMode();
            else if (mode === 'multi') await switchToMultiMode();
            else if (mode === 'thread') await switchToThreadMode();
            else if (mode === 'comparison') await switchToComparisonMode();
        });
    });

    // 单线程侧边栏菜单切换
    const singleMenuItems = document.querySelectorAll('#singleSidebar .menu-item');
    singleMenuItems.forEach(item => {
        item.addEventListener('click', () => {
            const chartType = item.dataset.chart;
            const subMenu = item.nextElementSibling;

            if (chartType === 'runtime' || chartType === 'memory') {
                const defaultSubChart = getDefaultSubChart(resolveChartGroup(chartType));
                document.querySelectorAll('#singleSidebar .sub-menu-item').forEach(subItem => {
                    subItem.classList.toggle('active', subItem.dataset.chart === defaultSubChart);
                });
                syncGroupNavigation('singleSidebar', chartType);
                currentChartType = defaultSubChart;
                if (subMenu) {
                    subMenu.classList.remove('collapsed');
                }
            } else {
                document.querySelectorAll('#singleSidebar .sub-menu-item').forEach(subItem => {
                    subItem.classList.remove('active');
                });
                syncGroupNavigation('singleSidebar', chartType);
                currentChartType = chartType;
            }

            if (chartType !== 'comparison') {
                if (singleThreadManager) {
                    singleThreadManager.setChartType(currentChartType);
                }
            }
        });
    });

    const singleSubMenuItems = document.querySelectorAll('#singleSidebar .sub-menu-item');
    singleSubMenuItems.forEach(item => {
        item.addEventListener('click', () => {
            const targetChart = item.dataset.chart || 'cputime';
            syncSidebarSelection('singleSidebar', targetChart);
            currentChartType = targetChart;
            if (singleThreadManager) {
                singleThreadManager.setChartType(targetChart);
            }
        });
    });

    // 多线程侧边栏菜单切换
    const multiMenuItems = document.querySelectorAll('#multiSidebar .menu-item');
    multiMenuItems.forEach(item => {
        item.addEventListener('click', () => {
            const chartType = item.dataset.chart;
            const subMenu = item.nextElementSibling;

            if (chartType === 'runtime' || chartType === 'memory') {
                const defaultSubChart = getDefaultSubChart(resolveChartGroup(chartType));
                document.querySelectorAll('#multiSidebar .sub-menu-item').forEach(subItem => {
                    subItem.classList.toggle('active', subItem.dataset.chart === defaultSubChart);
                });
                syncGroupNavigation('multiSidebar', chartType);
                currentChartType = defaultSubChart;
                if (subMenu) {
                    subMenu.classList.remove('collapsed');
                }
            } else {
                document.querySelectorAll('#multiSidebar .sub-menu-item').forEach(subItem => {
                    subItem.classList.remove('active');
                });
                syncGroupNavigation('multiSidebar', chartType);
                currentChartType = chartType;
            }

            if (chartType !== 'comparison') {
                if (multiThreadManager) {
                    multiThreadManager.setChartType(currentChartType);
                }
            }
        });
    });

    const multiSubMenuItems = document.querySelectorAll('#multiSidebar .sub-menu-item');
    multiSubMenuItems.forEach(item => {
        item.addEventListener('click', () => {
            const targetChart = item.dataset.chart || 'cputime';
            syncSidebarSelection('multiSidebar', targetChart);
            currentChartType = targetChart;
            if (multiThreadManager) {
                multiThreadManager.setChartType(targetChart);
            }
        });
    });

    // 线程曲线图侧边栏菜单切换
    const threadMenuItems = document.querySelectorAll('#threadSidebar .menu-item');
    threadMenuItems.forEach(item => {
        item.addEventListener('click', () => {
            const chartType = item.dataset.threadChart || 'runtime';
            const defaultSubChart = chartType === 'runtime' ? 'cputime' : chartType === 'memory' ? 'peakmem' : chartType;
            document.querySelectorAll('#threadSidebar .sub-menu-item').forEach(subItem => {
                subItem.classList.toggle('active', subItem.dataset.threadChart === defaultSubChart);
            });
            syncGroupNavigation('threadSidebar', chartType);
            if (threadChartManager) {
                threadChartManager.setChartType(defaultSubChart);
            }
        });
    });

    const threadSubMenuItems = document.querySelectorAll('#threadSidebar .sub-menu-item');
    threadSubMenuItems.forEach(item => {
        item.addEventListener('click', () => {
            const chartType = item.dataset.threadChart || 'cputime';
            syncSidebarSelection('threadSidebar', chartType);
            if (threadChartManager) {
                threadChartManager.setChartType(chartType);
            }
        });
    });
}

async function refreshData() {
    try {
        showLoading(true);
        const response = await axios.post(`/api/tools/${toolId}/refresh`);
        if (response.data.success) {
            const data = response.data.data || {};
            let singleData = {};
            let multiData = {};
            let extraData = {};
            let userData = {};
            if (typeof data === 'string') {
                try {
                    const parsed = JSON.parse(data);
                    if (parsed.single) singleData = parsed.single;
                    if (parsed.multi) multiData = parsed.multi;
                    if (parsed.extra) extraData = parsed.extra;
                    if (parsed.user) userData = parsed.user;
                } catch (e) {
                    singleData = data;
                }
            } else {
                if (data.single) singleData = data.single;
                if (data.multi) multiData = data.multi;
                if (data.extra) extraData = data.extra;
                if (data.user) userData = data.user;
            }
            window.singleData = singleData;
            window.multiData = multiData;
            window.extraData = extraData;
            window.userData = userData;

            if (singleThreadManager) {
                await singleThreadManager.refreshWithData(singleData, userData);
            }
            if (multiThreadManager) {
                await multiThreadManager.refreshWithData(multiData, userData);
            }
            if (threadChartManager) {
                await threadChartManager.refreshWithData(multiData, userData);
            }
            showSuccess('数据刷新成功');
        }
    } catch (error) {
        console.error('刷新数据失败:', error);
        showError('刷新数据失败');
    } finally {
        showLoading(false);
    }
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', init);