# AGENTS.md

为 AI 编码代理提供本仓库的工作指引。

## 项目概述

- 这是用户 nailcui 的 GitHub Pages 个人主页，线上地址：<https://nailcui.github.io>
- 纯静态站点：无构建工具、无框架。现有页面：
  - `index.html`：主页，样式内联。
  - `fog.html` + `fog-data.js`：世界迷雾模块（城市点亮地图）。`fog.html` 按用户明确要求引入了天地图 JS API 4.0（站点唯一的外部依赖）；未配置 Key 时自动进入本地演示模式，页面仍完全可用。（底图最初用高德，因高德需单独注册账号，应用户要求换为天地图，高德版实现见 git 历史 `d7fc074`。）
- 主分支为 `master`，页面文案以中文为主。

## 常用操作

- 本地预览：直接用浏览器打开 `index.html`，或运行 `python3 -m http.server 8000` 后访问 <http://localhost:8000>（`fog.html` 建议用 http.server 预览）。
- 部署：推送到 `master` 后 GitHub Pages 自动构建，约 1 分钟生效。若页面没变化，多半是浏览器缓存，强制刷新（Cmd+Shift+R）即可。
- 推送：HTTPS 无凭证可用，必须走 SSH。若 remote 是 HTTPS 地址，可直接执行：
  `git push git@github.com:nailcui/Nailcui.github.io.git master`

## 约定

- 保持零依赖的纯静态 HTML/CSS；不主动引入构建工具、框架或外部 CDN 资源，除非用户明确要求（当前唯一例外：`fog.html` 的天地图 JS API）。
- **所有页面与模块必须同时兼容电脑端与手机端**：响应式布局、触控可操作、通过 viewport 与安全区（safe-area）适配；任何页面改动后需在桌面与移动两种端验证。
- 提交信息用简短英文祈使句，例如 `Rebuild site with a simple homepage`。
- 不要提交 `CNAME`（历史上反复创建又删除过，当前未使用自定义域名）。
- 不要把高德 Key 之外的私密凭证提交进仓库；高德 Web端 Key 本身是前端公开的，防盗用靠在高德控制台配置域名白名单。

## 世界迷雾模块（fog.html）

- 组成：`fog.html`（页面与逻辑）、`fog-data.js`（城市数据 + 天地图 Key 配置）。
- 三种点亮样式，右下角按钮切换，选择存 localStorage：`neon` 霓虹光圈（城市中心光晕+光环）、`fog` 迷雾探索（暗幕按城市挖空、透出底图）、`pulse` 星火脉冲（光点扩散波纹）。光效均由页面内 canvas 绘制，与底图提供方解耦。
- 城市交互：悬停显示名称/日期提示，点击弹出卡片（第 N 站、省份、点亮日期、已照亮天数、备注）。
- 数据维护：编辑 `fog-data.js` 的 `FOG_CITIES`，字段与示例见文件头注释。`lng/lat` 为 GCJ-02 城市中心坐标（粗略即可），天地图模式下页面自动转换为 WGS84。日期与备注当前均为示例数据，待用户自行修改。
- 地图来源：天地图（自然资源部官方平台，中国境界合规性最高；底图样式用 CSS 滤镜反色为夜间效果）。Key 申请：<https://console.tianditu.gov.cn>（个人免费、需实名），浏览器端 Key 填入 `fog-data.js` 的 `FOG_CONFIG.tianditu.key`。**不要**引入第三方 GeoJSON 或境外底图（OSM 等）绘制行政区划，避免法律与政治风险。注意：天地图无免费的行政区划边界查询接口，如需恢复「城区多边形」点亮效果，高德版实现（DistrictSearch 边界）见 git 历史 `d7fc074`，但需用户自行注册高德账号。
- 未配置/无效 Key 时自动进入「演示模式」：抽象经纬网点阵 + 三种样式照常可切换演示，不含任何行政区划边界。

## 历史

- 2026-10-10：应用户要求清空了原有的技术笔记内容（go/java/kubernetes/zookeeper 等目录）并重建首页。旧内容仍在 git 历史中，恢复时从提交 `5b0ca65` 之前的记录查找。
- 2026-10-10：新增世界迷雾模块（`fog.html` + `fog-data.js`），首页加入口；未配置 Key 时有演示模式兜底。
- 2026-10-10：世界迷雾底图由高德切换为天地图（高德需单独注册账号，用户改选天地图；切换后点亮样式以城市中心光效呈现，因天地图不提供免费的行政区划边界接口）。
