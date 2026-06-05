const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs-extra');

const toolsRouter = require('./routes/tools');
const dataRouter = require('./routes/data');
const compareRouter = require('./routes/compare');

const app = express();
const PORT = process.env.PORT || 3000;

// 中间件
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// 静态文件服务
app.use('/frontend', express.static(path.join(__dirname, '../frontend')));
app.use('/data', express.static(path.join(__dirname, '../data')));

// API路由
app.use('/api/tools', toolsRouter);
app.use('/api/data', dataRouter);
app.use('/api/compare', compareRouter);

// 确保数据目录存在
const dataDir = path.join(__dirname, '../data');
fs.ensureDirSync(dataDir);

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`http://localhost:${PORT}/frontend/index.html`);
});