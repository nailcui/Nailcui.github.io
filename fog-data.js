/**
 * 世界迷雾（fog.html）—— 城市数据文件
 *
 * 底图为页面内嵌自绘的中国示意地图（fog-china.js），
 * 点亮城市的轮廓来自 fog-cities.js（按 adcode 关联），无需任何地图 Key。
 *
 * ── 如何点亮一座城市 ─────────────────────────────────────────────
 * 往 FOG_CITIES 数组里加一条记录即可，字段说明：
 *   name      城市显示名（必填）
 *   province  省份/直辖市名，用于卡片与统计（必填）
 *   adcode    行政区划编码（必填，用于关联 fog-cities.js 里的市域轮廓；
 *             新增城市需先在 DataV GeoAtlas 下载对应轮廓并加入 fog-cities.js，
 *             https://geo.datav.aliyun.com/areas_v3/bound/<adcode>.json ）
 *   lng / lat 城市中心坐标（必填；GCJ-02 或 WGS84 均可，示意地图内自洽，
 *             与坐标系的差异在城市尺度下可忽略）
 *   date      点亮日期，格式 YYYY-MM-DD，可空（留空显示「点亮日期待补充」）
 *   note      卡片备注，可空
 * 数组顺序即「第 N 站」编号（当前按点亮先后排列；填了 date 后会按日期排序）。
 *
 * style 为默认点亮样式：'neon' 霓虹光圈 | 'fog' 迷雾探索 | 'pulse' 星火脉冲
 */
window.FOG_CONFIG = {
  style: 'pulse'
};

// 已点亮城市（日期与备注待补充）
window.FOG_CITIES = [
  { name: '安阳',   province: '河南', adcode: '410500', lng: 114.352, lat: 36.103, date: '', note: '' },
  { name: '平顶山', province: '河南', adcode: '410400', lng: 113.308, lat: 33.737, date: '', note: '' },
  { name: '郑州',   province: '河南', adcode: '410100', lng: 113.625, lat: 34.747, date: '', note: '' },
  { name: '杭州',   province: '浙江', adcode: '330100', lng: 120.155, lat: 30.274, date: '', note: '' },
  { name: '上海',   province: '上海', adcode: '310000', lng: 121.474, lat: 31.230, date: '', note: '' },
  { name: '宁波',   province: '浙江', adcode: '330200', lng: 121.550, lat: 29.874, date: '', note: '' },
  { name: '台州',   province: '浙江', adcode: '331000', lng: 121.421, lat: 28.656, date: '', note: '' },
  { name: '绍兴',   province: '浙江', adcode: '330600', lng: 120.582, lat: 30.030, date: '', note: '' },
  { name: '嘉兴',   province: '浙江', adcode: '330400', lng: 120.751, lat: 30.762, date: '', note: '' },
  { name: '湖州',   province: '浙江', adcode: '330500', lng: 120.087, lat: 30.894, date: '', note: '' },
  { name: '南京',   province: '江苏', adcode: '320100', lng: 118.796, lat: 32.060, date: '', note: '' },
  { name: '景德镇', province: '江西', adcode: '360200', lng: 117.214, lat: 29.293, date: '', note: '' },
  { name: '湘潭',   province: '湖南', adcode: '430300', lng: 112.944, lat: 27.830, date: '', note: '' },
  { name: '湘西',   province: '湖南', adcode: '433100', lng: 109.739, lat: 28.312, date: '', note: '' },
  { name: '九江',   province: '江西', adcode: '360400', lng: 115.993, lat: 29.712, date: '', note: '' },
  { name: '平潭',   province: '福建', adcode: '350128', lng: 119.792, lat: 25.499, date: '', note: '' },
  { name: '福州',   province: '福建', adcode: '350100', lng: 119.297, lat: 26.074, date: '', note: '' },
  { name: '怀化',   province: '湖南', adcode: '431200', lng: 109.974, lat: 27.550, date: '', note: '' },
  { name: '常德',   province: '湖南', adcode: '430700', lng: 111.691, lat: 29.040, date: '', note: '' },
  { name: '张家界', province: '湖南', adcode: '430800', lng: 110.479, lat: 29.127, date: '', note: '' },
  { name: '萍乡',   province: '江西', adcode: '360300', lng: 113.854, lat: 27.623, date: '', note: '' },
  { name: '新余',   province: '江西', adcode: '360500', lng: 114.917, lat: 27.810, date: '', note: '' },
  { name: '南昌',   province: '江西', adcode: '360100', lng: 115.858, lat: 28.683, date: '', note: '' },
  { name: '宜春',   province: '江西', adcode: '360900', lng: 114.416, lat: 27.817, date: '', note: '' },
  { name: '衢州',   province: '浙江', adcode: '330800', lng: 118.859, lat: 28.970, date: '', note: '' },
  { name: '金华',   province: '浙江', adcode: '330700', lng: 119.649, lat: 29.089, date: '', note: '' }
];
