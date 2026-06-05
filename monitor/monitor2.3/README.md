# EDA QOR 性能监控项目

这是一个基于 React + Vite 的前端应用，配合 Node.js + Express 后端，用于实现 EDA QOR 性能监控系统。

## 目录结构

- `src/` - 前端源码
  - `App.tsx` - 主应用路由和布局
  - `pages/HomePage.tsx` - 主页面，显示工具总览和已配置工具
  - `pages/ConfigPage.tsx` - 工具配置页面，支持新增工具并保存
  - `pages/ToolPage.tsx` - 工具详情页面，支持单线程/多线程/对比视图
  - `api.ts` - 前端请求后端接口
  - `types.ts` - TypeScript 数据类型定义
  - `utils.ts` - 工具函数
  - `styles.css` - 全局样式
- `backend/` - 后端辅助模块
  - `storage.js` - 用户目录、JSON 持久化、工具数据路径管理
  - `toolDataSources.js` - 单线程、多线程和自定义曲线数据加载占位函数
- `data/` - 用户数据存储目录
- `server.js` - Express 后端入口
- `package.json` - 项目依赖与脚本
- `tsconfig.json` - TypeScript 配置
- `vite.config.ts` - Vite 配置

## 功能说明

### 前端

- 首页显示工具数量，鼠标悬停时显示工具详情
- 配置页面支持：
  - 查看当前已配置工具
  - 新建工具配置；包括名称、描述、单线程/多线程路径、额外显示字段、接口函数名称
  - 保存配置后自动跳转到工具页面
- 工具页面支持：
  - 单线程、 多线程、 对比三种视图
  - runtime / memory 子视图
  - casename、rule 选择
  - rule 搜索
  - 日期选择、多选与“最新50天”按钮
  - 添加数据路径弹窗（用户添加数据不会随页面刷新保存）
  - 曲线图展示与 Tooltip 提示
  - 性能统计与项目概况展示
  - 对比结果导出 CSV

### 后端

- 提供 REST API：
  - `GET /api/tools` - 获取当前用户工具配置
  - `POST /api/tools` - 保存工具配置
  - `GET /api/tools/:toolId/data` - 获取工具数据并写入工具数据 JSON
  - `GET /api/tools/:toolId/cache` - 读取用户工具缓存
  - `POST /api/tools/:toolId/cache` - 写入用户工具缓存
  - `POST /api/tools/:toolId/ensure` - 确保工具数据文件存在
  - `POST /api/tools/:toolId/compare` - 生成对比结果（示例数据）
- 用户数据存储在 `data/<userId>/`，不同用户之间数据隔离
- 每个工具会自动生成独立数据 JSON 文件
- 数据刷新后会重新加载后端数据，但不会恢复“用户添加数据”状态

## 安装与运行

> 请在支持 `npm` 的环境中执行以下命令。

```bash
cd c:\Users\xbzhong\Desktop\lint\script\monitor\develop\monitor\monitor2.3
npm install
npm run dev
```

- 前端开发服务器默认运行在 `http://localhost:5173`
- 后端默认运行在 `http://localhost:3000`

## 重要提示

- `backend/toolDataSources.js` 中的 `loadSingleThreadData`、`loadMultiThreadData`、`loadCustomCurveData` 为数据加载占位函数，可根据实际项目替换为真实的数据读取逻辑。
- 工具配置数据保存到 `data/<userId>/tools.json`，每个工具数据保存为 `data/<userId>/<toolId>-data.json`。
- `userId` 由前端生成并保存在 `localStorage` 中，确保不同浏览器或用户的数据隔离。

## 可拓展点

- 增加真实文件路径解析和数据文件读取
- 将 `compare` 接口实现成真实差异计算
- 支持用户上传数据并写入每日数据点
- 添加用户认证和多用户登录

---

此项目以现代 UI 布局方式构建，使用 Flexbox 与 Grid 以及 ECharts 曲线图，适合作为 EDA QOR 性能监控原型。