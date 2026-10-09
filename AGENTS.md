# AGENTS.md

为 AI 编码代理提供本仓库的工作指引。

## 项目概述

- 这是用户 nailcui 的 GitHub Pages 个人主页，线上地址：<https://nailcui.github.io>
- 纯静态站点：无构建工具、无框架。现有页面：
  - `index.html`：主页，样式内联。
  - `fog.html` + `fog-data.js`：世界迷雾模块（城市点亮地图）。`fog.html` 按用户明确要求引入了高德地图 JS API 2.0（站点唯一的外部依赖）；未配置 Key 时自动进入本地演示模式，页面仍完全可用。
- 主分支为 `master`，页面文案以中文为主。

## 常用操作

- 本地预览：直接用浏览器打开 `index.html`，或运行 `python3 -m http.server 8000` 后访问 <http://localhost:8000>（`fog.html` 建议用 http.server 预览）。
- 部署：推送到 `master` 后 GitHub Pages 自动构建，约 1 分钟生效。若页面没变化，多半是浏览器缓存，强制刷新（Cmd+Shift+R）即可。
- 推送：HTTPS 无凭证可用，必须走 SSH。若 remote 是 HTTPS 地址，可直接执行：
  `git push git@github.com:nailcui/Nailcui.github.io.git master`

## 约定

- 保持零依赖的纯静态 HTML/CSS；不主动引入构建工具、框架或外部 CDN 资源，除非用户明确要求（当前唯一例外：`fog.html` 的高德地图 JS API）。
- **所有页面与模块必须同时兼容电脑端与手机端**：响应式布局、触控可操作、通过 viewport 与安全区（safe-area）适配；任何页面改动后需在桌面与移动两种端验证。
- 提交信息用简短英文祈使句，例如 `Rebuild site with a simple homepage`。
- 不要提交 `CNAME`（历史上反复创建又删除过，当前未使用自定义域名）。
- 不要把高德 Key 之外的私密凭证提交进仓库；高德 Web端 Key 本身是前端公开的，防盗用靠在高德控制台配置域名白名单。

## 世界迷雾模块（fog.html）

- 组成：`fog.html`（页面与逻辑）、`fog-data.js`（城市数据 + 高德 Key 配置）。
- 三种点亮样式，右下角按钮切换，选择存 localStorage：`neon` 霓虹城区（高德行政区划多边形发光）、`fog` 迷雾探索（暗幕按城区形状挖空 + 发光边界，canvas 实现）、`pulse` 星火脉冲（城市中心光点扩散波纹）。
- 城市交互：悬停显示名称/日期提示，点击弹出卡片（第 N 站、省份、点亮日期、已照亮天数、备注）。
- 数据维护：编辑 `fog-data.js` 的 `FOG_CITIES`，字段与示例见文件头注释。`adcode` 用高德行政区划编码（查询：<https://lbs.amap.com/api/webservice/guide/api/district>）；`lng/lat` 为 GCJ-02 城市中心坐标（粗略即可）。日期与备注当前均为示例数据，待用户自行修改。
- 地图来源：优先高德（免费 Web端 JS API，Key + securityJsCode 填在 `fog-data.js` 的 `FOG_CONFIG.amap`）。底图与行政区划边界均来自高德官方服务，保证中国境界、九段线等绘制合规；**不要**自行引入第三方 GeoJSON 或境外底图（OSM 等）绘制行政区划，避免法律与政治风险。若日后高德不可用需切换天地图：申请天地图浏览器端 Key 后替换 `initAMap` 实现，注意其坐标系为 CGCS2000（≈WGS84），城市中心坐标与边界数据源需相应更换。
- 未配置/无效 Key 时自动进入「演示模式」：抽象经纬网点阵 + 三种样式照常可切换演示，不含任何行政区划边界。

## 历史

- 2026-10-10：应用户要求清空了原有的技术笔记内容（go/java/kubernetes/zookeeper 等目录）并重建首页。旧内容仍在 git 历史中，恢复时从提交 `5b0ca65` 之前的记录查找。
- 2026-10-10：新增世界迷雾模块（`fog.html` + `fog-data.js`），首页加入口；高德为指定底图来源，未配置 Key 时有演示模式兜底。
