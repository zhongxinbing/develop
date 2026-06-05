const express = require('express');
const router = express.Router();
const DataCache = require('../models/DataCache');
const fs = require('fs-extra');
const path = require('path');

// 获取单线程数据
router.post('/single/:toolId', async (req, res) => {
    try {
        const { toolId } = req.params;
        const { casename, dataSource } = req.body;
        
        // 先尝试从缓存获取
        let data = await DataCache.getData(toolId, 'single', casename);
        
        if (!data && dataSource) {
            // 调用用户提供的函数获取数据
            try {
                const userFunction = eval(`(${dataSource})`);
                data = await userFunction();
                await DataCache.setData(toolId, 'single', casename, data);
            } catch (error) {
                // 尝试从文件加载
                data = await DataCache.loadFromFile(toolId, 'single', casename);
            }
        }
        
        // 合并用户添加的数据
        const userData = DataCache.getUserData(toolId);
        if (userData.length > 0) {
            data = mergeUserData(data, userData);
        }
        
        res.json(data || {});
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 获取多线程数据
router.post('/multi/:toolId', async (req, res) => {
    try {
        const { toolId } = req.params;
        const { casename, threadNum, dataSource } = req.body;
        
        let data = await DataCache.getData(toolId, 'multi', casename, threadNum);
        
        if (!data && dataSource) {
            try {
                const userFunction = eval(`(${dataSource})`);
                data = await userFunction(threadNum);
                await DataCache.setData(toolId, 'multi', casename, data, threadNum);
            } catch (error) {
                data = await DataCache.loadFromFile(toolId, 'multi', casename, threadNum);
            }
        }
        
        res.json(data || {});
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 添加用户数据
router.post('/user-data/:toolId', async (req, res) => {
    try {
        const { toolId } = req.params;
        const { paths } = req.body;
        
        // 处理用户提供的路径，读取数据
        const userData = await processUserPaths(paths);
        DataCache.addUserData(toolId, userData);
        
        res.json({ success: true, data: userData });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 清除用户数据（刷新页面时调用）
router.delete('/user-data/:toolId', async (req, res) => {
    try {
        const { toolId } = req.params;
        DataCache.clearUserData(toolId);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

function mergeUserData(originalData, userDataList) {
    // 合并用户添加的数据到原始数据中
    const merged = { ...originalData };
    
    userDataList.forEach(userData => {
        Object.keys(userData).forEach(casename => {
            if (!merged[casename]) {
                merged[casename] = userData[casename];
            } else {
                // 合并 daily_metrics
                Object.keys(userData[casename].daily_metrics_key).forEach(date => {
                    if (!merged[casename].daily_metrics_key[date]) {
                        merged[casename].daily_metrics_key[date] = userData[casename].daily_metrics_key[date];
                    } else {
                        Object.assign(merged[casename].daily_metrics_key[date], 
                                    userData[casename].daily_metrics_key[date]);
                    }
                });
            }
        });
    });
    
    return merged;
}

async function processUserPaths(paths) {
    // 处理用户提供的路径，读取数据
    // 这里需要根据实际需求实现
    return {};
}

module.exports = router;