/*
 * 磁力片搭建 · 造型数据
 * 每个造型 = 按搭建顺序排列的零件（一步一片）+ 阶段划分。坐标单位 1 = 正方形边长，y 轴向上，地面 y = 0；
 * 世界方向约定：+z 为「前」，-x 为「左」。零件只用正方形 / 等边三角形 / 直角三角形三种基础片型。
 * 所有造型均经过 tiles-core.js 的 analyze() 校验：边长不被拉伸、零件不重复、每一片要么落地，
 * 要么与之前某片整边吸合（不悬空）。结构为示意教学，未做承重或稳定性仿真。
 */
(function (G) {
  'use strict';
  var C = G.TilesCore;
  var X = [1, 0, 0], NX = [-1, 0, 0], Y = [0, 1, 0], Z = [0, 0, 1], NZ = [0, 0, -1];
  var H = Math.sqrt(3) / 2, R2 = Math.SQRT1_2;

  function mk(id, type, color, pts, ext) {
    var p = { id: id, type: type, color: color, pts: pts };
    if (ext) for (var k in ext) p[k] = ext[k];
    return p;
  }
  function S(id, color, o, u, v, ext) { return mk(id, 'square', color, C.square(o, u, v), ext); }
  function E(id, color, a, b, up, ext) { return mk(id, 'triEq', color, C.triEq(a, b, up), ext); }
  function R(id, color, o, u, v, ext) { return mk(id, 'triRight', color, C.triRight(o, u, v), ext); }

  // 四棱锥尖顶：在边长 1 的方口上，四片等边三角形顶点恰好交于中心上方 √½ 处
  function pyramid(pre, color, cx, cz, y, whereName) {
    var A = [cx - 0.5, y, cz + 0.5], B = [cx + 0.5, y, cz + 0.5], Cc = [cx + 0.5, y, cz - 0.5], D = [cx - 0.5, y, cz - 0.5];
    var T = [cx, y + Math.SQRT1_2, cz];
    function face(id, a, b, side) {
      return E(pre + id, color, a, b, C.V.sub(T, C.V.mid(a, b)), { where: whereName + side + '侧' });
    }
    return [face('pf', A, B, '前'), face('pr', B, Cc, '右'), face('pb', Cc, D, '后'), face('pl', D, A, '左')];
  }

  /* ============ 1. 阳光小房子（入门 · 20 片） ============ */
  var slopeF = [0, H, -0.5], slopeB = [0, H, 0.5];   // 屋面坡向：水平 0.5、抬高 √3/2，坡长恰为 1
  var house = {
    id: 'house', name: '阳光小房子', theme: 'building', level: 1,
    intro: '四面墙、两片三角山墙、四片斜屋顶，再配一条小路和两棵树。',
    tip: '屋顶的坡度刚好等于三角形的斜边，四片屋顶会和山墙严丝合缝地吸在一起。',
    view: { az: 32, el: 24 },
    stages: [
      { title: '铺门前小路', from: 0, to: 3, desc: '先在地面铺出门廊和小路，确定房子的位置。', view: { az: 20, el: 46 } },
      { title: '围出四面墙', from: 4, to: 9, desc: '沿着门廊后侧立起一圈墙，绕一周首尾相接。', view: { az: 34, el: 26 } },
      { title: '立起三角山墙', from: 10, to: 11, desc: '左右两面短墙上各立一片等边三角形。', view: { az: 62, el: 22 } },
      { title: '盖上斜屋顶', from: 12, to: 15, desc: '四片正方形斜搭在山墙与长墙之间，前后各两片。', view: { az: 28, el: 36 } },
      { title: '种两棵小树', from: 16, to: 19, desc: '房子两旁各种一棵树：一片树干加一片树冠。', view: { az: 16, el: 20 } }
    ],
    pieces: [
      S('porch', 'blue', [0, 0, 0.5], Z, X, { where: '作品中线偏右的位置',
        note: '取 1 片蓝色正方形，平铺在地面上当门廊。稍后房子的前墙右半边就立在它的后侧边上。' }),
      S('path', 'blue', [0, 0, 1.5], Z, X, { where: '门廊正前方' }),
      R('bushL', 'purple', [0, 0, 1.5], NX, Z, { where: '小路左侧，直角朝向小路' }),
      R('bushR', 'purple', [1, 0, 1.5], X, Z, { where: '小路右侧，直角朝向小路' }),
      S('wFL', 'yellow', [-1, 0, 0.5], X, Y, { where: '门廊左边，与门廊后侧边对齐成一条线',
        note: '取 1 片黄色正方形，竖直立在地面上，放在门廊左边——让它的底边与门廊的后侧边对齐成一条直线，这是前墙的左半边。' }),
      S('wFR', 'yellow', [0, 0, 0.5], X, Y, { where: '前墙右半边' }),
      S('wR', 'yellow', [1, 0, 0.5], NZ, Y, { where: '房子右侧，向后转 90°' }),
      S('wBR', 'yellow', [1, 0, -0.5], NX, Y, { where: '后墙右半边' }),
      S('wBL', 'yellow', [0, 0, -0.5], NX, Y, { where: '后墙左半边' }),
      S('wL', 'yellow', [-1, 0, -0.5], Z, Y, { where: '房子左侧，把一圈墙合拢' }),
      E('gR', 'coral', [1, 1, 0.5], [1, 1, -0.5], Y, { where: '右侧短墙顶上，尖角朝上' }),
      E('gL', 'coral', [-1, 1, -0.5], [-1, 1, 0.5], Y, { where: '左侧短墙顶上，尖角朝上' }),
      S('rF1', 'coral', [-1, 1, 0.5], X, slopeF, { where: '前坡左半边，下沿搭在前墙顶上' }),
      S('rF2', 'coral', [0, 1, 0.5], X, slopeF, { where: '前坡右半边' }),
      S('rB2', 'coral', [1, 1, -0.5], NX, slopeB, { where: '后坡右半边' }),
      S('rB1', 'coral', [0, 1, -0.5], NX, slopeB, { where: '后坡左半边，屋顶合拢' }),
      S('tLt', 'green', [-3, 0, 0.5], X, Y, { where: '房子左边隔开一格的位置，当树干',
        note: '取 1 片绿色正方形，竖直立在房子左边、与前墙齐平并隔开一格的位置，当作树干。单独立着容易倒，可以先用手扶着。' }),
      E('tLc', 'green', [-3, 1, 0.5], [-2, 1, 0.5], Y, { where: '左边树干顶上，当树冠' }),
      S('tRt', 'green', [2, 0, 0.5], X, Y, { where: '房子右边隔开一格的位置，当树干' }),
      E('tRc', 'green', [2, 1, 0.5], [3, 1, 0.5], Y, { where: '右边树干顶上，当树冠' })
    ]
  };

  /* ============ 2. 池塘小黄鸭（入门 · 22 片） ============ */
  var duck = {
    id: 'duck', name: '池塘小黄鸭', theme: 'animal', level: 1,
    intro: '坐在蓝色池塘上的小黄鸭：方身体、扬起的翅膀和尾巴，还有张开的扁嘴。',
    tip: '翅膀、尾巴和嘴巴都只靠一条边吸住，角度可以和孩子一起慢慢调。',
    view: { az: 14, el: 18 },
    stages: [
      { title: '铺一片小池塘', from: 0, to: 5, desc: '两片正方形做池底，四周加四片三角形波纹。', view: { az: 30, el: 52 } },
      { title: '围出圆滚滚的身体', from: 6, to: 11, desc: '沿着池底四边立起一圈墙。', view: { az: 40, el: 26 } },
      { title: '翅膀和尾巴', from: 12, to: 14, desc: '身体左半边的前后各伸出一只翅膀，最左边翘起尾巴。', view: { az: -38, el: 24 } },
      { title: '小脑袋', from: 15, to: 19, desc: '在身体右半边上面再围一个小方块当脑袋。', view: { az: 58, el: 24 } },
      { title: '扁扁的嘴巴', from: 20, to: 21, desc: '脑袋正前方上下各伸出一片三角形，嘴巴张开啦。', view: { az: 78, el: 16 } }
    ],
    pieces: [
      S('f1', 'blue', [-1, 0, -0.5], X, Z, { where: '作品中间偏左，当池底' }),
      S('f2', 'blue', [0, 0, -0.5], X, Z, { where: '第 1 片右边，当池底' }),
      E('rp1', 'blue', [-1, 0, 0.5], [0, 0, 0.5], Z, { where: '池底左前方，尖角朝外' }),
      E('rp2', 'blue', [0, 0, 0.5], [1, 0, 0.5], Z, { where: '池底右前方，尖角朝外' }),
      E('rp3', 'blue', [0, 0, -0.5], [-1, 0, -0.5], NZ, { where: '池底左后方，尖角朝外' }),
      E('rp4', 'blue', [1, 0, -0.5], [0, 0, -0.5], NZ, { where: '池底右后方，尖角朝外' }),
      S('bFL', 'yellow', [-1, 0, 0.5], X, Y, { where: '身体前侧左半边' }),
      S('bFR', 'yellow', [0, 0, 0.5], X, Y, { where: '身体前侧右半边' }),
      S('bR', 'yellow', [1, 0, 0.5], NZ, Y, { where: '身体最右端（胸口）' }),
      S('bBR', 'yellow', [1, 0, -0.5], NX, Y, { where: '身体后侧右半边' }),
      S('bBL', 'yellow', [0, 0, -0.5], NX, Y, { where: '身体后侧左半边' }),
      S('bL', 'yellow', [-1, 0, -0.5], Z, Y, { where: '身体最左端，把一圈合拢' }),
      R('wingF', 'yellow', [-1, 1, 0.5], X, [0, R2, R2], { where: '身体前侧左半边顶上，向前上方张开' }),
      R('wingB', 'yellow', [-1, 1, -0.5], X, [0, R2, -R2], { where: '身体后侧左半边顶上，向后上方张开' }),
      E('tail', 'yellow', [-1, 1, -0.5], [-1, 1, 0.5], [-0.5, H, 0], { where: '身体最左端顶上，向后微微翘起' }),
      S('hS1', 'yellow', [0, 1, 0.5], X, Y, { where: '前侧右半边墙顶上，脑袋的一侧' }),
      S('hF', 'yellow', [1, 1, 0.5], NZ, Y, { where: '胸口那片墙顶上，脑袋的正面' }),
      S('hS2', 'yellow', [1, 1, -0.5], NX, Y, { where: '后侧右半边墙顶上，脑袋的另一侧' }),
      S('hB', 'yellow', [0, 1, -0.5], Z, Y, { where: '脑袋背后，横跨在身体上方',
        note: '取 1 片黄色正方形，竖直放在脑袋背后：它的下方是空的，靠左右两条竖边分别吸住第 16、18 片的后缘。' }),
      S('hT', 'yellow', [0, 2, 0.5], X, NZ, { where: '脑袋顶上，盖住小方块' }),
      E('billU', 'coral', [1, 2, -0.5], [1, 2, 0.5], X, { where: '脑袋正面的顶边，水平向前伸出（上嘴）' }),
      E('billL', 'coral', [1, 1, -0.5], [1, 1, 0.5], X, { where: '脑袋正面的底边，水平向前伸出（下嘴）' })
    ]
  };

  /* ============ 3. 双塔小城堡（进阶 · 38 片） ============ */
  var castle = {
    id: 'castle', name: '双塔小城堡', theme: 'building', level: 2,
    intro: '两座带城门的高塔、中间一座有露台的大厅，塔顶是四棱尖顶，门前还有小院和围栏。',
    tip: '城门上方的「门楣」靠左右两边吸住，搭的时候可以先用手托一下。',
    view: { az: 28, el: 22 },
    stages: [
      { title: '左塔第一层（留出城门）', from: 0, to: 2, desc: '三面墙围成「凹」字，正面空着当城门。', view: { az: 30, el: 26 } },
      { title: '左塔第二层与门楣', from: 3, to: 6, desc: '再叠一层，正面加一片门楣盖住城门上方。', view: { az: 18, el: 22 } },
      { title: '右塔', from: 7, to: 13, desc: '用蓝色正方形照同样的方法搭出右塔。', view: { az: 40, el: 24 } },
      { title: '中间大厅与露台', from: 14, to: 19, desc: '两塔之间立起前后墙，顶上平铺两片露台。', view: { az: 24, el: 40 } },
      { title: '两座尖顶', from: 20, to: 27, desc: '每座塔顶用四片等边三角形围成四棱尖顶。', view: { az: 30, el: 30 } },
      { title: '门前小院与围栏', from: 28, to: 37, desc: '门前平铺一排小院，中间立两扇围栏，塔外再放两丛灌木。', view: { az: 14, el: 34 } }
    ],
    pieces: [
      S('L1l', 'yellow', [-2, 0, -0.5], Z, Y, { where: '左塔最左侧（第一层）' }),
      S('L1b', 'yellow', [-1, 0, -0.5], NX, Y, { where: '左塔背面（第一层）' }),
      S('L1r', 'yellow', [-1, 0, 0.5], NZ, Y, { where: '左塔靠内一侧（第一层），正面留空当城门' }),
      S('L2l', 'yellow', [-2, 1, -0.5], Z, Y, { where: '左塔最左侧（第二层）' }),
      S('L2b', 'yellow', [-1, 1, -0.5], NX, Y, { where: '左塔背面（第二层）' }),
      S('L2r', 'yellow', [-1, 1, 0.5], NZ, Y, { where: '左塔靠内一侧（第二层）' }),
      S('L2f', 'yellow', [-2, 1, 0.5], X, Y, { where: '左塔正面第二层',
        note: '取 1 片黄色正方形，竖直放在左塔正面第二层当门楣：下方空着就是城门，靠左右两条竖边分别吸住第 4、6 片的前缘。' }),
      S('R1r', 'blue', [2, 0, 0.5], NZ, Y, { where: '右塔最右侧（第一层）',
        note: '开始搭右塔：取 1 片蓝色正方形，竖直立在地面上，与左塔对齐、两塔之间空出两格宽（正好放得下大厅的两片前墙），这是右塔最右侧的墙。' }),
      S('R1b', 'blue', [2, 0, -0.5], NX, Y, { where: '右塔背面（第一层）' }),
      S('R1l', 'blue', [1, 0, -0.5], Z, Y, { where: '右塔靠内一侧（第一层），正面留空当城门' }),
      S('R2r', 'blue', [2, 1, 0.5], NZ, Y, { where: '右塔最右侧（第二层）' }),
      S('R2b', 'blue', [2, 1, -0.5], NX, Y, { where: '右塔背面（第二层）' }),
      S('R2l', 'blue', [1, 1, -0.5], Z, Y, { where: '右塔靠内一侧（第二层）' }),
      S('R2f', 'blue', [1, 1, 0.5], X, Y, { where: '右塔正面第二层',
        note: '取 1 片蓝色正方形，竖直放在右塔正面第二层当门楣：靠左右两条竖边分别吸住第 11、13 片的前缘，下方留出城门。' }),
      S('Hf1', 'green', [-1, 0, 0.5], X, Y, { where: '两塔之间，大厅前墙左半边' }),
      S('Hf2', 'green', [0, 0, 0.5], X, Y, { where: '大厅前墙右半边' }),
      S('Hb2', 'green', [1, 0, -0.5], NX, Y, { where: '大厅后墙右半边' }),
      S('Hb1', 'green', [0, 0, -0.5], NX, Y, { where: '大厅后墙左半边' }),
      S('Ht1', 'purple', [-1, 1, 0.5], X, NZ, { where: '大厅顶上左半边，当露台' }),
      S('Ht2', 'purple', [0, 1, 0.5], X, NZ, { where: '大厅顶上右半边，当露台' })
    ]
      .concat(pyramid('L', 'coral', -1.5, 0, 2, '左塔顶'))
      .concat(pyramid('R', 'coral', 1.5, 0, 2, '右塔顶'))
      .concat([
        S('C1', 'yellow', [-2, 0, 0.5], X, Z, { where: '左塔城门正前方' }),
        S('C2', 'blue', [-1, 0, 0.5], X, Z, { where: '大厅前墙左半边正前方' }),
        S('C3', 'yellow', [0, 0, 0.5], X, Z, { where: '大厅前墙右半边正前方' }),
        S('C4', 'blue', [1, 0, 0.5], X, Z, { where: '右塔城门正前方' }),
        S('F1', 'coral', [-1, 0, 1.5], X, Y, { where: '小院中间偏左的前沿，当围栏' }),
        S('F2', 'coral', [0, 0, 1.5], X, Y, { where: '小院中间偏右的前沿，当围栏' }),
        E('F1c', 'yellow', [-1, 1, 1.5], [0, 1, 1.5], Y, { where: '左边围栏顶上' }),
        E('F2c', 'yellow', [0, 1, 1.5], [1, 1, 1.5], Y, { where: '右边围栏顶上' }),
        R('BL', 'purple', [-2, 0, -0.5], NX, Z, { where: '左塔外侧地面，当灌木' }),
        R('BR', 'purple', [2, 0, 0.5], X, NZ, { where: '右塔外侧地面，当灌木' })
      ])
  };

  var list = [house, duck, castle];
  list.forEach(function (m) { C.analyze(m); m.hash = C.modelHash(m); });

  G.TilesModels = {
    list: list,
    get: function (id) {
      for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
      return null;
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
