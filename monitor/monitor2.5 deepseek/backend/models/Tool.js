const fs = require('fs-extra');
const path = require('path');

class Tool {
    constructor() {
        this.configPath = path.join(__dirname, '../../data/tools_config.json');
        this.init();
    }

    async init() {
        if (!await fs.pathExists(this.configPath)) {
            await fs.writeJson(this.configPath, {});
        }
    }

    async getAllTools() {
        return await fs.readJson(this.configPath);
    }

    async getTool(toolId) {
        const tools = await this.getAllTools();
        return tools[toolId];
    }

    async saveTool(toolId, toolConfig) {
        const tools = await this.getAllTools();
        tools[toolId] = {
            ...toolConfig,
            id: toolId,
            createdAt: new Date().toISOString()
        };
        await fs.writeJson(this.configPath, tools);
        
        // 创建工具专属数据目录
        const toolDataDir = path.join(__dirname, `../../data/${toolId}`);
        await fs.ensureDir(toolDataDir);
        
        return tools[toolId];
    }

    async deleteTool(toolId) {
        const tools = await this.getAllTools();
        delete tools[toolId];
        await fs.writeJson(this.configPath, tools);
        
        // 删除工具数据目录
        const toolDataDir = path.join(__dirname, `../../data/${toolId}`);
        if (await fs.pathExists(toolDataDir)) {
            await fs.remove(toolDataDir);
        }
    }

    async updateTool(toolId, toolConfig) {
        return await this.saveTool(toolId, toolConfig);
    }
}

module.exports = new Tool();