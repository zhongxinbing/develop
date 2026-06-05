import fs from 'fs';
import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'url';
import path from 'path';
import { ensureUserDirectory, readJson, writeJson, resolveToolCachePath, resolveToolConfigPath, resolveToolDataPath } from './backend/storage.js';
import { loadSingleThreadData, loadMultiThreadData, loadCustomCurveData } from './backend/toolDataSources.js';

const app = express();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicPath = path.join(__dirname, 'public');

app.use(cors());
app.use(express.json());
if (fs.existsSync(publicPath)) {
  app.use(express.static(publicPath));
}

function getUserId(req) {
  return String(req.query.userId || req.body?.userId || 'default_user');
}

app.get('/api/tools', (req, res) => {
  const userId = getUserId(req);
  const tools = readJson(resolveToolConfigPath(userId), {});
  res.json(tools);
});

app.post('/api/tools', (req, res) => {
  const userId = getUserId(req);
  const config = req.body?.config;
  if (!config || !config.id) {
    return res.status(400).json({ error: '缺少工具配置或 id' });
  }
  const toolPath = resolveToolConfigPath(userId);
  const tools = readJson(toolPath, {});
  tools[config.id] = config;
  writeJson(toolPath, tools);
  ensureUserDirectory(userId);
  res.json(config);
});

app.get('/api/tools/:toolId/data', async (req, res) => {
  const userId = getUserId(req);
  const toolId = req.params.toolId;
  const tools = readJson(resolveToolConfigPath(userId), {});
  const config = tools[toolId];
  if (!config) {
    return res.status(404).json({ error: '工具未找到' });
  }
  const single = await loadSingleThreadData(config.singleThreadPath);
  const multi = config.multiThreadPath ? await loadMultiThreadData(config.multiThreadPath) : undefined;
  const custom = config.customCurveFunc ? await loadCustomCurveData(config.customCurveFunc) : undefined;
  const combined = { single, multi, custom };
  writeJson(resolveToolDataPath(userId, toolId), combined);
  res.json(combined);
});

app.get('/api/tools/:toolId/cache', (req, res) => {
  const userId = getUserId(req);
  const cache = readJson(resolveToolCachePath(userId, req.params.toolId), {});
  res.json(cache);
});

app.post('/api/tools/:toolId/cache', (req, res) => {
  const userId = getUserId(req);
  const toolId = req.params.toolId;
  const payload = req.body?.payload ?? {};
  writeJson(resolveToolCachePath(userId, toolId), payload);
  res.json({ success: true });
});

app.post('/api/tools/:toolId/ensure', (req, res) => {
  const userId = getUserId(req);
  const toolId = req.params.toolId;
  const toolDir = ensureUserDirectory(userId);
  const dataPath = resolveToolDataPath(userId, toolId);
  if (!path.existsSync(dataPath)) {
    writeJson(dataPath, { single: {}, multi: {}, custom: {} });
  }
  res.json({ created: true, path: dataPath });
});

app.post('/api/tools/:toolId/compare', (req, res) => {
  const userId = getUserId(req);
  const toolId = req.params.toolId;
  const payload = req.body?.payload || {};
  const compareResult = {
    summary: {
      ruleCount: 8,
      runtimeIncrease: 3,
      runtimeDecrease: 2,
      memoryIncrease: 2,
      memoryDecrease: 1
    },
    topRuntimeIncrease: [{ rule: 'Overall', delta: 4.1 }],
    topRuntimeDecrease: [{ rule: 'FastPath', delta: -2.0 }],
    topMemoryIncrease: [{ rule: 'HeavyRule', delta: 10.3 }],
    topMemoryDecrease: [{ rule: 'LightRule', delta: -5.4 }],
    comparisonTable: [
      { rule: 'Overall', runtime1: 26.1, runtime2: 24.3, memory1: 42.7, memory2: 40.2, delta: -1.8 },
      { rule: 'FastPath', runtime1: 8.1, runtime2: 7.9, memory1: 12.3, memory2: 12.0, delta: -0.2 }
    ],
    payload
  };
  res.json(compareResult);
});
app.post('/api/tools/:toolId/ensure', (req, res) => {
  const userId = getUserId(req);
  const toolId = req.params.toolId;
  ensureUserDirectory(userId);
  const dataPath = resolveToolDataPath(userId, toolId);
  if (!fs.existsSync(dataPath)) {
    writeJson(dataPath, { single: {}, multi: {}, custom: {} });
  }
  res.json({ created: true, path: dataPath });
});

app.post('/api/tools/:toolId/compare', (req, res) => {
  const userId = getUserId(req);
  const toolId = req.params.toolId;
  const payload = req.body?.payload || {};
  const compareResult = {
    summary: {
      ruleCount: 8,
      runtimeIncrease: 3,
      runtimeDecrease: 2,
      memoryIncrease: 2,
      memoryDecrease: 1
    },
    topRuntimeIncrease: [{ rule: 'Overall', delta: 4.1 }],
    topRuntimeDecrease: [{ rule: 'FastPath', delta: -2.0 }],
    topMemoryIncrease: [{ rule: 'HeavyRule', delta: 10.3 }],
    topMemoryDecrease: [{ rule: 'LightRule', delta: -5.4 }],
    comparisonTable: [
      { rule: 'Overall', runtime1: 26.1, runtime2: 24.3, memory1: 42.7, memory2: 40.2, delta: -1.8 },
      { rule: 'FastPath', runtime1: 8.1, runtime2: 7.9, memory1: 12.3, memory2: 12.0, delta: -0.2 }
    ],
    payload
  };
  res.json(compareResult);
});
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`);
});
