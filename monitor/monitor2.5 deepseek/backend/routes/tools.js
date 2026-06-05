const express = require('express');
const router = express.Router();
const Tool = require('../models/Tool');
const { v4: uuidv4 } = require('uuid');

// 获取所有工具
router.get('/', async (req, res) => {
    try {
        const tools = await Tool.getAllTools();
        res.json(tools);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 获取单个工具
router.get('/:toolId', async (req, res) => {
    try {
        const tool = await Tool.getTool(req.params.toolId);
        if (!tool) {
            return res.status(404).json({ error: 'Tool not found' });
        }
        res.json(tool);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 创建工具
router.post('/', async (req, res) => {
    try {
        const toolId = uuidv4();
        const toolConfig = req.body;
        const tool = await Tool.saveTool(toolId, toolConfig);
        res.json(tool);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 更新工具
router.put('/:toolId', async (req, res) => {
    try {
        const tool = await Tool.updateTool(req.params.toolId, req.body);
        res.json(tool);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 删除工具
router.delete('/:toolId', async (req, res) => {
    try {
        await Tool.deleteTool(req.params.toolId);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;