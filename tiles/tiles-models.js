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

  /* ============ 4. 乖乖小猫（入门 · 14 片） ============ */
  var cat = {
    id: 'cat', name: '乖乖小猫', theme: 'animal', level: 1,
    intro: '方脑袋、尖耳朵的小猫，旁边还放着它的食盆和小鱼干。',
    tip: '耳朵立在脑袋左右两条顶边上，尾巴是斜着搭上去的，只靠一条边吸住。',
    view: { az: 32, el: 20 },
    stages: [
      { title: '围出身体', from: 0, to: 3, desc: '四片正方形围成一个方方的身体。', view: { az: 34, el: 26 } },
      { title: '接上脑袋', from: 4, to: 7, desc: '身体上面再围一层同样大小的方脑袋。', view: { az: 40, el: 24 } },
      { title: '立起尖耳朵', from: 8, to: 9, desc: '脑袋左右两条顶边上各立一片等边三角形。', view: { az: 58, el: 22 } },
      { title: '甩出小尾巴', from: 10, to: 10, desc: '一片直角三角形斜斜地翘到身后。', view: { az: -30, el: 22 } },
      { title: '摆好饭碗和小鱼', from: 11, to: 13, desc: '地上放一片食盆，再用两片三角形拼一条小鱼。', view: { az: 16, el: 40 } }
    ],
    pieces: [
      S('cF', 'green', [-0.5, 0, 0.5], X, Y, { where: '中间偏前，当身体的前面' }),
      S('cL', 'green', [-0.5, 0, -0.5], Z, Y, { where: '身体的左面' }),
      S('cB', 'green', [0.5, 0, -0.5], NX, Y, { where: '身体的后面' }),
      S('cR', 'green', [0.5, 0, 0.5], NZ, Y, { where: '身体的右面，围拢一圈' }),
      S('hF', 'green', [-0.5, 1, 0.5], X, Y, { where: '身体前片正上方' }),
      S('hL', 'green', [-0.5, 1, -0.5], Z, Y, { where: '身体左片正上方' }),
      S('hB', 'green', [0.5, 1, -0.5], NX, Y, { where: '身体后片正上方' }),
      S('hR', 'green', [0.5, 1, 0.5], NZ, Y, { where: '身体右片正上方，脑袋合拢' }),
      E('earL', 'coral', [-0.5, 2, -0.5], [-0.5, 2, 0.5], Y, { where: '脑袋左侧顶边上，尖角朝上' }),
      E('earR', 'coral', [0.5, 2, 0.5], [0.5, 2, -0.5], Y, { where: '脑袋右侧顶边上，尖角朝上' }),
      R('tail', 'blue', [0.5, 1, -0.5], NX, [0, R2, -R2], { where: '身体后片顶边上，向斜后方翘起',
        note: '取 1 片蓝色直角三角形，斜搭在身体后片的顶边上：一条直角边对齐顶边，整片向斜后方翘起当尾巴。只靠一条边吸住，放好后轻轻扶一下角度。' }),
      S('bowl', 'coral', [0.5, 0, 0.5], X, Z, { where: '小猫右前方，当食盆' }),
      E('fishB', 'blue', [1.5, 0, 0.5], [1.5, 0, -0.5], X, { where: '食盆右后方，尖角朝右，当鱼身' }),
      E('fishT', 'blue', [1.5, 0, -0.5], [1.5 + H, 0, 0], [0.5, 0, -H], { where: '鱼身后侧的斜边外，拼出鱼尾' })
    ]
  };

  /* ============ 5. 长耳小兔（入门 · 15 片） ============ */
  var bunny = {
    id: 'bunny', name: '长耳小兔', theme: 'animal', level: 1,
    intro: '两只长耳朵高高竖起的小兔子，脚边放着一根大胡萝卜。',
    tip: '长耳朵是每边两片正方形叠起来的，叠到第三层开始会有点晃，扶着放。',
    view: { az: 38, el: 18 },
    stages: [
      { title: '围出身体', from: 0, to: 3, desc: '四片正方形围出圆滚滚的身体。', view: { az: 34, el: 26 } },
      { title: '接上脑袋', from: 4, to: 7, desc: '身体上面再围一层当脑袋。', view: { az: 40, el: 24 } },
      { title: '竖起长耳朵', from: 8, to: 11, desc: '脑袋左右顶边上各叠两片，竖出两只长耳朵。', view: { az: 0, el: 16 } },
      { title: '贴上小尾巴', from: 12, to: 12, desc: '一片等边三角形水平伸到身后当绒球尾巴。', view: { az: -28, el: 24 } },
      { title: '种一根胡萝卜', from: 13, to: 14, desc: '用直角三角形和等边三角形在地上拼一根胡萝卜。', view: { az: 14, el: 44 } }
    ],
    pieces: [
      S('bF', 'purple', [-0.5, 0, 0.5], X, Y, { where: '中间偏前，当身体的前面' }),
      S('bL', 'purple', [-0.5, 0, -0.5], Z, Y, { where: '身体的左面' }),
      S('bB', 'purple', [0.5, 0, -0.5], NX, Y, { where: '身体的后面' }),
      S('bR', 'purple', [0.5, 0, 0.5], NZ, Y, { where: '身体的右面，围拢一圈' }),
      S('hF', 'purple', [-0.5, 1, 0.5], X, Y, { where: '身体前片正上方' }),
      S('hL', 'purple', [-0.5, 1, -0.5], Z, Y, { where: '身体左片正上方' }),
      S('hB', 'purple', [0.5, 1, -0.5], NX, Y, { where: '身体后片正上方' }),
      S('hR', 'purple', [0.5, 1, 0.5], NZ, Y, { where: '身体右片正上方，脑袋合拢' }),
      S('earL1', 'yellow', [-0.5, 2, -0.5], Z, Y, { where: '脑袋左侧顶边上，左耳下半截' }),
      S('earL2', 'yellow', [-0.5, 3, -0.5], Z, Y, { where: '左耳下半截正上方，耳朵封顶' }),
      S('earR1', 'yellow', [0.5, 2, -0.5], Z, Y, { where: '脑袋右侧顶边上，右耳下半截' }),
      S('earR2', 'yellow', [0.5, 3, -0.5], Z, Y, { where: '右耳下半截正上方，耳朵封顶' }),
      E('pom', 'coral', [-0.5, 1, -0.5], [0.5, 1, -0.5], NZ, { where: '身体后片顶边上，水平伸向身后当绒球' }),
      R('crop', 'coral', [1.5, 0, 0.8], X, Z, { where: '小兔右前方，当胡萝卜' }),
      E('leaf', 'green', [1.5, 0, 0.8], [2.5, 0, 0.8], NZ, { where: '胡萝卜宽的那头，当萝卜叶' })
    ]
  };

  /* ============ 6. 冲天小火箭（入门 · 20 片） ============ */
  var rocket = {
    id: 'rocket', name: '冲天小火箭', theme: 'vehicle', level: 1,
    intro: '立在发射台上准备升空的小火箭：两层高的箭身、尖尖的鼻锥和四片尾翼。',
    tip: '四片尾翼分别卡在箭身底部的四个角上；鼻锥的四片三角形会在正上方交成一个尖。',
    view: { az: 26, el: 16 },
    stages: [
      { title: '立起箭身', from: 0, to: 7, desc: '四片墙围一圈，再往上叠一层。', view: { az: 30, el: 20 } },
      { title: '装上尾翼', from: 8, to: 11, desc: '四片直角三角形卡在箭身底部的四个角，斜边朝外。', view: { az: 20, el: 22 } },
      { title: '接上鼻锥', from: 12, to: 15, desc: '箭身顶上四片等边三角形围成尖尖的鼻锥。', view: { az: 28, el: 30 } },
      { title: '铺发射台', from: 16, to: 19, desc: '四片正方形贴着箭身四周平铺，就是发射台。', view: { az: 18, el: 46 } }
    ],
    pieces: [
      S('rF1', 'blue', [-0.5, 0, 0.5], X, Y, { where: '箭身正面（第一层）' }),
      S('rL1', 'blue', [-0.5, 0, -0.5], Z, Y, { where: '箭身左面（第一层）' }),
      S('rB1', 'blue', [0.5, 0, -0.5], NX, Y, { where: '箭身背面（第一层）' }),
      S('rR1', 'blue', [0.5, 0, 0.5], NZ, Y, { where: '箭身右面（第一层），围拢一圈' }),
      S('rF2', 'blue', [-0.5, 1, 0.5], X, Y, { where: '箭身正面（第二层）' }),
      S('rL2', 'blue', [-0.5, 1, -0.5], Z, Y, { where: '箭身左面（第二层）' }),
      S('rB2', 'blue', [0.5, 1, -0.5], NX, Y, { where: '箭身背面（第二层）' }),
      S('rR2', 'blue', [0.5, 1, 0.5], NZ, Y, { where: '箭身右面（第二层）' }),
      R('finSE', 'purple', [0.5, 0, 0.5], Y, [R2, 0, R2], { where: '箭身右前角的竖边上，斜边朝外撇' }),
      R('finSW', 'purple', [-0.5, 0, 0.5], Y, [-R2, 0, R2], { where: '箭身左前角的竖边上，斜边朝外撇' }),
      R('finNW', 'purple', [-0.5, 0, -0.5], Y, [-R2, 0, -R2], { where: '箭身左后角的竖边上，斜边朝外撇' }),
      R('finNE', 'purple', [0.5, 0, -0.5], Y, [R2, 0, -R2], { where: '箭身右后角的竖边上，斜边朝外撇' })
    ]
      .concat(pyramid('rk', 'coral', 0, 0, 2, '鼻锥'))
      .concat([
        S('padN', 'yellow', [-0.5, 0, -1.5], X, Z, { where: '箭身正后方，当发射台' }),
        S('padS', 'yellow', [-0.5, 0, 0.5], X, Z, { where: '箭身正前方，当发射台' }),
        S('padE', 'yellow', [0.5, 0, -0.5], Z, X, { where: '箭身右侧，当发射台' }),
        S('padW', 'yellow', [-1.5, 0, -0.5], Z, X, { where: '箭身左侧，当发射台' })
      ])
  };

  /* ============ 7. 花园小凉亭（进阶 · 20 片） ============ */
  // 四根两层高的柱子按「风车」方式各占一个角、朝向互不相同：每一面都只挡住一半，凉亭四面通透
  var pavilion = {
    id: 'pavilion', name: '花园小凉亭', theme: 'creative', level: 2,
    intro: '四根柱子像风车叶一样各占一个角，撑起一片平顶，柱子上方翘起小尖檐，四面通透可以乘凉。',
    tip: '柱子单独立着容易倒，可以请小朋友帮忙扶着；四片亭顶盖上以后，四根柱子就互相撑住了。',
    view: { az: 30, el: 24 },
    stages: [
      { title: '立起四根柱子', from: 0, to: 7, desc: '每根柱子由两片正方形叠成，四根柱子各占一个角、朝向都不一样。', view: { az: 34, el: 24 } },
      { title: '盖上平平的亭顶', from: 8, to: 11, desc: '四片正方形平铺在柱子顶上，拼成 2×2 的亭顶。', view: { az: 30, el: 46 } },
      { title: '翘起小尖檐', from: 12, to: 15, desc: '每根柱子正上方的亭顶边上立一片等边三角形。', view: { az: 26, el: 28 } },
      { title: '台阶和小灌木', from: 16, to: 19, desc: '正面的空当前铺两级台阶，两旁放两丛灌木。', view: { az: 14, el: 40 } }
    ],
    pieces: [
      S('pNWa', 'yellow', [-1, 0, -1], Z, Y, { where: '左侧靠后，当第一根柱子的下半截' }),
      S('pNWb', 'yellow', [-1, 1, -1], Z, Y, { where: '第一根柱子的上半截' }),
      S('pNEa', 'yellow', [0, 0, -1], X, Y, { where: '背面靠右，当第二根柱子的下半截' }),
      S('pNEb', 'yellow', [0, 1, -1], X, Y, { where: '第二根柱子的上半截' }),
      S('pSEa', 'yellow', [1, 0, 0], Z, Y, { where: '右侧靠前，当第三根柱子的下半截' }),
      S('pSEb', 'yellow', [1, 1, 0], Z, Y, { where: '第三根柱子的上半截' }),
      S('pSWa', 'yellow', [-1, 0, 1], X, Y, { where: '正面靠左，当第四根柱子的下半截' }),
      S('pSWb', 'yellow', [-1, 1, 1], X, Y, { where: '第四根柱子的上半截' }),
      S('rfNW', 'green', [-1, 2, -1], X, Z, { where: '亭顶左后格',
        note: '取 1 片绿色正方形，水平搭在第一根柱子顶上，当亭顶的第一格：它现在只靠一条边吸住，先用手托着，等四格亭顶拼齐就稳了。' }),
      S('rfNE', 'green', [0, 2, -1], X, Z, { where: '亭顶右后格' }),
      S('rfSE', 'green', [0, 2, 0], X, Z, { where: '亭顶右前格' }),
      S('rfSW', 'green', [-1, 2, 0], X, Z, { where: '亭顶左前格，亭顶合拢' }),
      E('eNW', 'coral', [-1, 2, -1], [-1, 2, 0], Y, { where: '第一根柱子正上方的亭顶边上，尖角朝上' }),
      E('eNE', 'coral', [0, 2, -1], [1, 2, -1], Y, { where: '第二根柱子正上方的亭顶边上，尖角朝上' }),
      E('eSE', 'coral', [1, 2, 0], [1, 2, 1], Y, { where: '第三根柱子正上方的亭顶边上，尖角朝上' }),
      E('eSW', 'coral', [-1, 2, 1], [0, 2, 1], Y, { where: '第四根柱子正上方的亭顶边上，尖角朝上' }),
      S('step1', 'blue', [0, 0, 1], X, Z, { where: '正面没有柱子的空当前，当第一级台阶' }),
      S('step2', 'blue', [0, 0, 2], X, Z, { where: '第一级台阶正前方' }),
      R('buR', 'purple', [1, 0, 1], X, Z, { where: '台阶右边，当灌木' }),
      R('buL', 'purple', [0, 0, 1], NX, Z, { where: '台阶左边、第四根柱子前面，当灌木' })
    ]
  };

  /* ============ 8. 大风车磨坊（进阶 · 30 片） ============ */
  // 塔身正面最上层那片正方形兼作门楣和风车「轮毂」：四片直角三角形与它在同一平面内、各占一条边，
  // 像纸风车一样朝同一方向转；叶片不靠悬挑的横梁，全部直接吸在塔身上
  var windmill = {
    id: 'windmill', name: '大风车磨坊', theme: 'building', level: 2,
    intro: '三层高的蓝色磨坊塔，正面上方装着四片转向一致的风车叶，旁边有小仓库，门前有小路和栅栏。',
    tip: '大门有两层高，第 10 片「门楣」靠左右两条竖边吸住；四片风车叶都装在它的四条边上，装好后轻轻扶正。',
    view: { az: 22, el: 14 },
    stages: [
      { title: '塔身第一层', from: 0, to: 2, desc: '三面墙围成「凹」字，正面空着当大门。', view: { az: 28, el: 22 } },
      { title: '塔身第二层', from: 3, to: 5, desc: '照第一层再叠一层，正面继续空着，大门有两层高。', view: { az: 28, el: 20 } },
      { title: '第三层与门楣', from: 6, to: 9, desc: '第三层四面合拢，正面那片同时是门楣和风车轮毂。', view: { az: 18, el: 18 } },
      { title: '尖尖的塔顶', from: 10, to: 13, desc: '四片等边三角形围成四棱尖顶。', view: { az: 26, el: 30 } },
      { title: '四片风车叶', from: 14, to: 17, desc: '门楣的四条边上各装一片直角三角形，朝同一方向转。', view: { az: 6, el: 10 } },
      { title: '旁边的小仓库', from: 18, to: 21, desc: '借用塔身右墙，再围三面墙、盖一片顶。', view: { az: 46, el: 26 } },
      { title: '小路、栅栏和灌木', from: 22, to: 29, desc: '门前铺小路，左边立两扇栅栏，再放两丛灌木。', view: { az: 14, el: 34 } }
    ],
    pieces: [
      S('wB1', 'blue', [0.5, 0, -0.5], NX, Y, { where: '塔身背面（第一层）' }),
      S('wL1', 'blue', [-0.5, 0, -0.5], Z, Y, { where: '塔身左面（第一层）' }),
      S('wR1', 'blue', [0.5, 0, 0.5], NZ, Y, { where: '塔身右面（第一层），正面空着当大门' }),
      S('wB2', 'blue', [0.5, 1, -0.5], NX, Y, { where: '塔身背面（第二层）' }),
      S('wL2', 'blue', [-0.5, 1, -0.5], Z, Y, { where: '塔身左面（第二层）' }),
      S('wR2', 'blue', [0.5, 1, 0.5], NZ, Y, { where: '塔身右面（第二层）' }),
      S('wB3', 'blue', [0.5, 2, -0.5], NX, Y, { where: '塔身背面（第三层）' }),
      S('wL3', 'blue', [-0.5, 2, -0.5], Z, Y, { where: '塔身左面（第三层）' }),
      S('wR3', 'blue', [0.5, 2, 0.5], NZ, Y, { where: '塔身右面（第三层）' }),
      S('hub', 'blue', [-0.5, 2, 0.5], X, Y, { where: '塔身正面第三层',
        note: '取 1 片蓝色正方形，竖直放在塔身正面第三层当门楣：下面空着两层高，就是磨坊的大门；它靠左右两条竖边分别吸住第 8、9 片的前缘。稍后四片风车叶都装在它的四条边上。' })
    ]
      .concat(pyramid('wm', 'coral', 0, 0, 3, '塔顶'))
      .concat([
        R('blT', 'yellow', [-0.5, 3, 0.5], X, Y, { where: '门楣的顶边上，从左上角向上伸出' }),
        R('blR', 'yellow', [0.5, 3, 0.5], [0, -1, 0], X, { where: '门楣的右边上，从右上角向右伸出' }),
        R('blB', 'yellow', [0.5, 2, 0.5], NX, [0, -1, 0], { where: '门楣的底边下，从右下角向下伸进门洞上方' }),
        R('blL', 'yellow', [-0.5, 2, 0.5], Y, NX, { where: '门楣的左边上，从左下角向左伸出' }),
        S('shF', 'green', [0.5, 0, 0.5], X, Y, { where: '塔身右边，与大门齐平（小仓库正面）' }),
        S('shR', 'green', [1.5, 0, 0.5], NZ, Y, { where: '小仓库右面' }),
        S('shB', 'green', [1.5, 0, -0.5], NX, Y, { where: '小仓库背面，借用塔身右墙围拢' }),
        S('shT', 'purple', [0.5, 1, 0.5], X, NZ, { where: '小仓库顶上，平铺盖住' }),
        S('path1', 'blue', [-0.5, 0, 0.5], X, Z, { where: '大门正前方，当小路' }),
        S('path2', 'blue', [-0.5, 0, 1.5], X, Z, { where: '第一块小路的正前方' }),
        S('fe1', 'coral', [-2.5, 0, 1.5], X, Y, { where: '小路左边靠外，当栅栏' }),
        S('fe2', 'coral', [-1.5, 0, 1.5], X, Y, { where: '小路左边靠里，当栅栏' }),
        E('fe1c', 'yellow', [-2.5, 1, 1.5], [-1.5, 1, 1.5], Y, { where: '外侧栅栏顶上' }),
        E('fe2c', 'yellow', [-1.5, 1, 1.5], [-0.5, 1, 1.5], Y, { where: '里侧栅栏顶上' }),
        R('bu1', 'purple', [1.5, 0, 0.5], X, Z, { where: '小仓库右前方，当灌木' }),
        R('bu2', 'purple', [-0.5, 0, -0.5], NX, NZ, { where: '塔身左后方，当灌木' })
      ])
  };

  /* ============ 9. 呜呜小火车（挑战 · 42 片） ============ */
  // 车头朝左（-x）：锅炉由两个并排的小方块组成，前格顶上是烟囱、后格顶上扣尖顶蒸汽包，
  // 驾驶室的前墙只有上层（下层就是锅炉尾墙），车厢彼此空一格、格里铺枕木
  var train = {
    id: 'train', name: '呜呜小火车', theme: 'vehicle', level: 3,
    intro: '一列四节的小火车：车头有烟囱、尖顶蒸汽包和两层驾驶室，后面拖着煤水车和两节车厢，车厢之间铺着枕木。',
    tip: '挑战款，片数多、步骤长，可以分几次搭，进度会自动保存。每节车厢都单独立在地上，彼此空出一格放枕木。',
    view: { az: 14, el: 16 },
    stages: [
      { title: '车头锅炉', from: 0, to: 6, desc: '两个小方块并排，拼成两格长的锅炉。', view: { az: 34, el: 24 } },
      { title: '烟囱与蒸汽包', from: 7, to: 14, desc: '锅炉前格顶上围烟囱，后格顶上扣一个尖顶蒸汽包。', view: { az: 30, el: 26 } },
      { title: '驾驶室与排障器', from: 15, to: 23, desc: '锅炉后面立起两层驾驶室、盖上车顶，车头前面装排障器。', view: { az: -30, el: 22 } },
      { title: '煤水车', from: 24, to: 28, desc: '驾驶室后面空一格，围一个带盖的小方斗。', view: { az: 20, el: 26 } },
      { title: '第一节车厢', from: 29, to: 33, desc: '先铺底板，再沿四条边立起车厢壁。', view: { az: 18, el: 24 } },
      { title: '第二节车厢', from: 34, to: 38, desc: '底板加两侧壁，两端用直角三角形当挡板，是一节敞车。', view: { az: 22, el: 24 } },
      { title: '铺上枕木', from: 39, to: 41, desc: '在车厢之间的空格里平铺正方形当枕木。', view: { az: 8, el: 36 } }
    ],
    pieces: [
      S('bF', 'blue', [0, 0, -0.5], Z, Y, { where: '车头最前面，当锅炉正面' }),
      S('bSL1', 'blue', [0, 0, -0.5], X, Y, { where: '锅炉后侧，靠车头这一格' }),
      S('bSR1', 'blue', [0, 0, 0.5], X, Y, { where: '锅炉前侧，靠车头这一格' }),
      S('bM', 'blue', [1, 0, -0.5], Z, Y, { where: '锅炉中间，围出第一格' }),
      S('bSL2', 'blue', [1, 0, -0.5], X, Y, { where: '锅炉后侧，第二格' }),
      S('bSR2', 'blue', [1, 0, 0.5], X, Y, { where: '锅炉前侧，第二格' }),
      S('bB', 'blue', [2, 0, -0.5], Z, Y, { where: '锅炉尾部，把第二格合拢' }),
      S('cF', 'blue', [0, 1, -0.5], Z, Y, { where: '锅炉正面的顶上，当烟囱正面' }),
      S('cSL', 'blue', [0, 1, -0.5], X, Y, { where: '烟囱后侧' }),
      S('cSR', 'blue', [0, 1, 0.5], X, Y, { where: '烟囱前侧' }),
      S('cB', 'blue', [1, 1, -0.5], Z, Y, { where: '烟囱背面，把烟囱围成小方块' })
    ]
      .concat(pyramid('dm', 'coral', 1.5, 0, 1, '锅炉第二格顶上，蒸汽包'))
      .concat([
        S('kF', 'yellow', [2, 1, -0.5], Z, Y, { where: '锅炉尾部的顶上，当驾驶室正面' }),
        S('kSL1', 'yellow', [2, 0, -0.5], X, Y, { where: '驾驶室后侧（下层）' }),
        S('kSR1', 'yellow', [2, 0, 0.5], X, Y, { where: '驾驶室前侧（下层）' }),
        S('kB1', 'yellow', [3, 0, -0.5], Z, Y, { where: '驾驶室尾部（下层）' }),
        S('kSL2', 'yellow', [2, 1, -0.5], X, Y, { where: '驾驶室后侧（上层）' }),
        S('kSR2', 'yellow', [2, 1, 0.5], X, Y, { where: '驾驶室前侧（上层）' }),
        S('kB2', 'yellow', [3, 1, -0.5], Z, Y, { where: '驾驶室尾部（上层）' }),
        S('kT', 'purple', [2, 2, -0.5], X, Z, { where: '驾驶室顶上，当车顶' }),
        E('plow', 'coral', [0, 0, -0.5], [0, 0, 0.5], NX, { where: '车头最前面，尖角朝前，当排障器' }),
        S('tF', 'green', [4, 0, -0.5], Z, Y, { where: '驾驶室后面空一格，当煤水车靠车头的一面' }),
        S('tSL', 'green', [4, 0, -0.5], X, Y, { where: '煤水车后侧' }),
        S('tSR', 'green', [4, 0, 0.5], X, Y, { where: '煤水车前侧' }),
        S('tB', 'green', [5, 0, -0.5], Z, Y, { where: '煤水车尾部，围成小方块' }),
        S('tT', 'yellow', [4, 1, -0.5], X, Z, { where: '煤水车顶上，当煤堆' }),
        S('w1f', 'blue', [6, 0, -0.5], X, Z, { where: '煤水车后面空一格，当第一节车厢的底板' }),
        S('w1F', 'yellow', [6, 0, -0.5], Z, Y, { where: '底板靠车头的边上，当车厢前壁' }),
        S('w1SL', 'yellow', [6, 0, -0.5], X, Y, { where: '车厢后侧' }),
        S('w1SR', 'yellow', [6, 0, 0.5], X, Y, { where: '车厢前侧' }),
        S('w1B', 'yellow', [7, 0, -0.5], Z, Y, { where: '车厢尾部，把车厢合拢' }),
        S('w2f', 'blue', [8, 0, -0.5], X, Z, { where: '第一节车厢后面空一格，当最后一节车厢的底板' }),
        S('w2SL', 'green', [8, 0, -0.5], X, Y, { where: '敞车后侧' }),
        S('w2SR', 'green', [8, 0, 0.5], X, Y, { where: '敞车前侧' }),
        R('w2e1', 'coral', [8, 0, -0.5], Z, Y, { where: '敞车靠车头那一端，直角在下' }),
        R('w2e2', 'coral', [9, 0, 0.5], NZ, Y, { where: '敞车尾端，直角在下' }),
        S('tie1', 'blue', [3, 0, -0.5], X, Z, { where: '驾驶室和煤水车之间的空格，当枕木' }),
        S('tie2', 'blue', [5, 0, -0.5], X, Z, { where: '煤水车和第一节车厢之间的空格' }),
        S('tie3', 'blue', [7, 0, -0.5], X, Z, { where: '两节车厢之间的空格' })
      ])
  };

  var list = [house, duck, castle, cat, bunny, rocket, pavilion, windmill, train];
  list.forEach(function (m) { C.analyze(m); m.hash = C.modelHash(m); });

  G.TilesModels = {
    list: list,
    get: function (id) {
      for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
      return null;
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
