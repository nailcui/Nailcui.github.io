/**
 * 世界迷雾（fog.html）—— 数据与配置文件
 *
 * ── 如何点亮一座城市 ─────────────────────────────────────────────
 * 往 FOG_CITIES 数组里加一条记录即可，字段说明：
 *   name      城市显示名（必填）
 *   province  省份/直辖市名，用于卡片与统计（必填）
 *   adcode    高德行政区划编码，用于绘制城市边界（推荐填写，查询：
 *             https://lbs.amap.com/api/webservice/guide/api/district ）
 *             不填时会用「name + 市」作为关键字查询边界
 *   lng / lat 城市中心坐标（GCJ-02，粗略即可），用于光点样式、
 *             悬停热区与无 Key 时的演示模式（推荐填写）
 *   date      点亮日期，格式 YYYY-MM-DD，可空
 *   note      卡片备注，可空
 * 数组顺序不重要，页面会按 date 自动排序为「第 N 站」。
 *
 * ── 高德地图 Key（免费）──────────────────────────────────────────
 * 1. 注册/登录 https://lbs.amap.com （个人开发者免费）
 * 2. 控制台 → 应用管理 → 创建应用 → 添加 Key，服务平台选「Web端(JS API)」
 * 3. 把 Key 和对应的安全密钥（securityJsCode）填到下面 FOG_CONFIG.amap
 * 4. 可选：在高德控制台为该 Key 设置域名白名单（如 *.github.io）
 * 未配置 Key 时页面会自动进入「演示模式」（抽象点阵，无行政区划底图）。
 * 若日后需要切换为天地图等合规底图，见 AGENTS.md「世界迷雾模块」章节。
 */
window.FOG_CONFIG = {
  // 默认点亮样式：'neon' 霓虹城区 | 'fog' 迷雾探索 | 'pulse' 星火脉冲
  style: 'neon',
  // 底图提供方，目前实现 'amap'
  provider: 'amap',
  amap: {
    key: '',            // ← 在这里填入高德 Web端(JS API) Key
    securityJsCode: ''  // ← 在这里填入该 Key 的安全密钥
  }
};

// 已点亮城市列表（以下日期与备注均为示例数据，请自行修改）
window.FOG_CITIES = [
  { name: '重庆',   province: '重庆', adcode: '500000', lng: 106.551, lat: 29.563, date: '2015-10-02', note: '洪崖洞夜景与长江索道' },
  { name: '长沙',   province: '湖南', adcode: '430100', lng: 112.982, lat: 28.194, date: '2016-04-30', note: '橘子洲头，小龙虾和夜市' },
  { name: '怀化',   province: '湖南', adcode: '431200', lng: 109.974, lat: 27.55,  date: '2016-05-01', note: '湘西的绿皮火车记忆' },
  { name: '张家界', province: '湖南', adcode: '430800', lng: 110.479, lat: 29.127, date: '2016-05-02', note: '三千奇峰，云海步道' },
  { name: '咸宁',   province: '湖北', adcode: '421200', lng: 114.322, lat: 29.841, date: '2017-10-03', note: '温泉小城，桂花开时' },
  { name: '南昌',   province: '江西', adcode: '360100', lng: 115.858, lat: 28.683, date: '2018-04-05', note: '赣江边的滕王阁' },
  { name: '郑州',   province: '河南', adcode: '410100', lng: 113.625, lat: 34.747, date: '2018-10-01', note: '二七塔与一碗胡辣汤' },
  { name: '安阳',   province: '河南', adcode: '410500', lng: 114.352, lat: 36.103, date: '2018-10-03', note: '殷墟，甲骨文之乡' },
  { name: '南京',   province: '江苏', adcode: '320100', lng: 118.796, lat: 32.06,  date: '2019-03-16', note: '梧桐树下的老城' },
  { name: '宣城',   province: '安徽', adcode: '341800', lng: 118.758, lat: 30.946, date: '2019-03-17', note: '皖南山水，宣纸之乡' },
  { name: '上海',   province: '上海', adcode: '310000', lng: 121.474, lat: 31.23,  date: '2019-05-01', note: '外滩的风与弄堂的烟火' },
  { name: '金华',   province: '浙江', adcode: '330700', lng: 119.649, lat: 29.089, date: '2020-08-15', note: '婺江两岸，火腿飘香' },
  { name: '温州',   province: '浙江', adcode: '330300', lng: 120.699, lat: 28.0,   date: '2020-08-16', note: '瓯江夜游，山水诗源头' },
  { name: '宁波',   province: '浙江', adcode: '330200', lng: 121.55,  lat: 29.874, date: '2020-08-17', note: '老外滩与一碗汤圆' },
  { name: '福州',   province: '福建', adcode: '350100', lng: 119.297, lat: 26.074, date: '2021-05-01', note: '三坊七巷，榕城温泉' }
];
