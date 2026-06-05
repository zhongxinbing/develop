const NodeCache = require('node-cache');
const fs = require('fs-extra');
const path = require('path');

class DataCache {
    constructor() {
        this.cache = new NodeCache({ stdTTL: 3600, checkperiod: 120 });
        this.userDataCache = new NodeCache({ stdTTL: 300 }); // 用户添加的数据缓存5分钟
    }

    getCacheKey(toolId, dataType, casename, threadNum = null) {
        return `${toolId}_${dataType}_${casename}_${threadNum || 'single'}`;
    }

    async getData(toolId, dataType, casename, threadNum = null) {
        const key = this.getCacheKey(toolId, dataType, casename, threadNum);
        return this.cache.get(key);
    }

    async setData(toolId, dataType, casename, data, threadNum = null) {
        const key = this.getCacheKey(toolId, dataType, casename, threadNum);
        this.cache.set(key, data);
        
        // 同时保存到文件
        const toolDataDir = path.join(__dirname, `../../data/${toolId}`);
        await fs.ensureDir(toolDataDir);
        
        const filename = `${dataType}_${casename}${threadNum ? `_thread${threadNum}` : ''}.json`;
        await fs.writeJson(path.join(toolDataDir, filename), data);
    }

    async loadFromFile(toolId, dataType, casename, threadNum = null) {
        const toolDataDir = path.join(__dirname, `../../data/${toolId}`);
        const filename = `${dataType}_${casename}${threadNum ? `_thread${threadNum}` : ''}.json`;
        const filePath = path.join(toolDataDir, filename);
        
        if (await fs.pathExists(filePath)) {
            return await fs.readJson(filePath);
        }
        return null;
    }

    addUserData(toolId, data) {
        const userDataKey = `${toolId}_user_data`;
        const existingData = this.userDataCache.get(userDataKey) || [];
        existingData.push(data);
        this.userDataCache.set(userDataKey, existingData);
    }

    getUserData(toolId) {
        return this.userDataCache.get(`${toolId}_user_data`) || [];
    }

    clearUserData(toolId) {
        this.userDataCache.del(`${toolId}_user_data`);
    }
}

module.exports = new DataCache();