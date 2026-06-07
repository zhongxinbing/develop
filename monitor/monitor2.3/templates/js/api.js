const API_BASE = 'http://localhost:5000/api';

// 通用请求函数
async function request(url, options = {}) {
    const config = {
        headers: {
            'Content-Type': 'application/json',
            ...options.headers
        },
        ...options
    };
    
    try {
        const response = await fetch(`${API_BASE}${url}`, config);
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'Request failed');
        }
        
        return data;
    } catch (error) {
        console.error('API Error:', error);
        showToast(error.message, 'error');
        throw error;
    }
}

// 工具管理API
const ToolAPI = {
    getAll: () => request('/tools'),
    get: (toolName) => request(`/tools/${encodeURIComponent(toolName)}`),
    create: (toolData) => request('/tools', {
        method: 'POST',
        body: JSON.stringify(toolData)
    }),
    update: (toolName, toolData) => request(`/tools/${encodeURIComponent(toolName)}`, {
        method: 'PUT',
        body: JSON.stringify(toolData)
    }),
    delete: (toolName) => request(`/tools/${encodeURIComponent(toolName)}`, {
        method: 'DELETE'
    })
};

// 数据API
const DataAPI = {
    getSingleThread: (toolName) => request(`/data/${encodeURIComponent(toolName)}/single`, {
        method: 'POST'
    }),
    getMultiThread: (toolName) => request(`/data/${encodeURIComponent(toolName)}/multi`, {
        method: 'POST'
    }),
    getCustomCurve: (toolName) => request(`/data/${encodeURIComponent(toolName)}/custom`, {
        method: 'POST'
    }),
    addUserData: (toolName, paths) => request(`/data/${encodeURIComponent(toolName)}/user-data`, {
        method: 'POST',
        body: JSON.stringify({ paths })
    }),
    clearCache: (toolName) => request(`/data/${encodeURIComponent(toolName)}/clear-cache`, {
        method: 'POST'
    })
};

// 对比API
const CompareAPI = {
    compare: (toolName, params) => request(`/compare/${encodeURIComponent(toolName)}`, {
        method: 'POST',
        body: JSON.stringify(params)
    })
};