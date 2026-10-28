/* ============================================================
   vehicle3d.js — models/ 共享 WebGL 微引擎（供各工程车辆页复用）
   手写 WebGL 1：光照/阴影贴图/雾/天空/粒子/地面覆盖层/轨道相机/
   键盘+触屏输入/HUD 骨架。纯静态零依赖，无外部请求。
   页面用法：
     var app = V3D.createApp({ ...opts });
     app.setScene(rootNode, dynDrawFn);
     app.start(function (dt, t) { 每帧模拟 });
   ============================================================ */
(function (global) {
'use strict';

var PI = Math.PI;
function rad(d) { return d * PI / 180; }
function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
function lerp(a, b, t) { return a + (b - a) * t; }
function nearAng(cur, target) {
  var d = (target - cur) % (2 * PI);
  if (d > PI) d -= 2 * PI;
  if (d < -PI) d += 2 * PI;
  return cur + d;
}
function hash1(n) { var s = Math.sin(n) * 43758.5453; return s - Math.floor(s); }
function vnoise(x, y, z) {
  var xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  var xf = x - xi, yf = y - yi, zf = z - zi;
  var u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
  function h(i, j, k) { return hash1(xi + i + (yi + j) * 57.0 + (zi + k) * 113.0); }
  var a = lerp(lerp(h(0,0,0), h(1,0,0), u), lerp(h(0,1,0), h(1,1,0), u), v);
  var b = lerp(lerp(h(0,0,1), h(1,0,1), u), lerp(h(0,1,1), h(1,1,1), u), v);
  return lerp(a, b, w);
}

/* ---------------- 4x4 矩阵（列主序） ---------------- */
function m4() { return new Float32Array(16); }
function m4ident(o) {
  o = o || m4();
  o[0]=1;o[1]=0;o[2]=0;o[3]=0; o[4]=0;o[5]=1;o[6]=0;o[7]=0;
  o[8]=0;o[9]=0;o[10]=1;o[11]=0; o[12]=0;o[13]=0;o[14]=0;o[15]=1;
  return o;
}
var _m4tmp = m4();
function m4mul(a, b, o) { /* o = a*b（o 与 a/b 重叠时也安全） */
  o = o || m4();
  var t = (o === a || o === b) ? _m4tmp : o;
  for (var c = 0; c < 4; c++) {
    var b0=b[c*4], b1=b[c*4+1], b2=b[c*4+2], b3=b[c*4+3];
    t[c*4]   = a[0]*b0 + a[4]*b1 + a[8]*b2  + a[12]*b3;
    t[c*4+1] = a[1]*b0 + a[5]*b1 + a[9]*b2  + a[13]*b3;
    t[c*4+2] = a[2]*b0 + a[6]*b1 + a[10]*b2 + a[14]*b3;
    t[c*4+3] = a[3]*b0 + a[7]*b1 + a[11]*b2 + a[15]*b3;
  }
  if (t !== o) o.set(t);
  return o;
}
function T(x, y, z) { var m = m4ident(); m[12]=x; m[13]=y; m[14]=z; return m; }
function S(x, y, z) { var m = m4ident(); m[0]=x; m[5]=y; m[10]=z; return m; }
function RX(a) { var m=m4ident(), c=Math.cos(a), s=Math.sin(a); m[5]=c;m[6]=s;m[9]=-s;m[10]=c; return m; }
function RY(a) { var m=m4ident(), c=Math.cos(a), s=Math.sin(a); m[0]=c;m[2]=-s;m[8]=s;m[10]=c; return m; }
function RZ(a) { var m=m4ident(), c=Math.cos(a), s=Math.sin(a); m[0]=c;m[1]=s;m[4]=-s;m[5]=c; return m; }
function m4chain() {
  var o = m4ident();
  for (var i = 0; i < arguments.length; i++) m4mul(o, arguments[i], o);
  return o;
}
function m4persp(fovy, aspect, near, far, o) {
  o = o || m4();
  var f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
  o[0]=f/aspect;o[1]=0;o[2]=0;o[3]=0;
  o[4]=0;o[5]=f;o[6]=0;o[7]=0;
  o[8]=0;o[9]=0;o[10]=(far+near)*nf;o[11]=-1;
  o[12]=0;o[13]=0;o[14]=2*far*near*nf;o[15]=0;
  return o;
}
function m4ortho(l, r, b, t, n, f, o) {
  o = o || m4();
  o[0]=2/(r-l);o[1]=0;o[2]=0;o[3]=0;
  o[4]=0;o[5]=2/(t-b);o[6]=0;o[7]=0;
  o[8]=0;o[9]=0;o[10]=-2/(f-n);o[11]=0;
  o[12]=-(r+l)/(r-l);o[13]=-(t+b)/(t-b);o[14]=-(f+n)/(f-n);o[15]=1;
  return o;
}
function m4lookAt(eye, ctr, up, o) {
  o = o || m4();
  var zx=eye[0]-ctr[0], zy=eye[1]-ctr[1], zz=eye[2]-ctr[2];
  var zl = Math.hypot(zx,zy,zz)||1; zx/=zl; zy/=zl; zz/=zl;
  var xx=up[1]*zz-up[2]*zy, xy=up[2]*zx-up[0]*zz, xz=up[0]*zy-up[1]*zx;
  var xl = Math.hypot(xx,xy,xz)||1; xx/=xl; xy/=xl; xz/=xl;
  var yx=zy*xz-zz*xy, yy=zz*xx-zx*xz, yz=zx*xy-zy*xx;
  o[0]=xx;o[1]=yx;o[2]=zx;o[3]=0;
  o[4]=xy;o[5]=yy;o[6]=zy;o[7]=0;
  o[8]=xz;o[9]=yz;o[10]=zz;o[11]=0;
  o[12]=-(xx*eye[0]+xy*eye[1]+xz*eye[2]);
  o[13]=-(yx*eye[0]+yy*eye[1]+yz*eye[2]);
  o[14]=-(zx*eye[0]+zy*eye[1]+zz*eye[2]);
  o[15]=1;
  return o;
}
function m4inv(m, o) {
  o = o || m4();
  var a00=m[0],a01=m[1],a02=m[2],a03=m[3],
      a10=m[4],a11=m[5],a12=m[6],a13=m[7],
      a20=m[8],a21=m[9],a22=m[10],a23=m[11],
      a30=m[12],a31=m[13],a32=m[14],a33=m[15];
  var b00=a00*a11-a01*a10, b01=a00*a12-a02*a10, b02=a00*a13-a03*a10,
      b03=a01*a12-a02*a11, b04=a01*a13-a03*a11, b05=a02*a13-a03*a12,
      b06=a20*a31-a21*a30, b07=a20*a32-a22*a30, b08=a20*a33-a23*a30,
      b09=a21*a32-a22*a31, b10=a21*a33-a23*a31, b11=a22*a33-a23*a32;
  var det = b00*b11-b01*b10+b02*b09+b03*b08-b04*b07+b05*b06;
  if (!det) { return m4ident(o); }
  det = 1 / det;
  o[0]=(a11*b11-a12*b10+a13*b09)*det;
  o[1]=(a02*b10-a01*b11-a03*b09)*det;
  o[2]=(a31*b05-a32*b04+a33*b03)*det;
  o[3]=(a22*b04-a21*b05-a23*b03)*det;
  o[4]=(a12*b08-a10*b11-a13*b07)*det;
  o[5]=(a00*b11-a02*b08+a03*b07)*det;
  o[6]=(a32*b02-a30*b05-a33*b01)*det;
  o[7]=(a20*b05-a22*b02+a23*b01)*det;
  o[8]=(a10*b10-a11*b08+a13*b06)*det;
  o[9]=(a01*b08-a00*b10-a03*b06)*det;
  o[10]=(a30*b04-a31*b02+a33*b00)*det;
  o[11]=(a21*b02-a20*b04-a23*b00)*det;
  o[12]=(a11*b07-a10*b09-a12*b06)*det;
  o[13]=(a00*b09-a01*b07+a02*b06)*det;
  o[14]=(a31*b01-a30*b03-a32*b00)*det;
  o[15]=(a20*b03-a21*b01+a22*b00)*det;
  return o;
}
function pt(m, x, y, z, out) {
  out = out || [0, 0, 0];
  out[0] = m[0]*x + m[4]*y + m[8]*z  + m[12];
  out[1] = m[1]*x + m[5]*y + m[9]*z  + m[13];
  out[2] = m[2]*x + m[6]*y + m[10]*z + m[14];
  return out;
}
var _n3t = new Float32Array(9);
function n3(m, o) {
  o = o || new Float32Array(9);
  var a00=m[0],a01=m[1],a02=m[2], a10=m[4],a11=m[5],a12=m[6], a20=m[8],a21=m[9],a22=m[10];
  var d00=a11*a22-a12*a21, d01=-(a01*a22-a02*a21), d02=a01*a12-a02*a11;
  var d10=-(a10*a22-a12*a20), d11=a00*a22-a02*a20, d12=-(a00*a12-a02*a10);
  var d20=a10*a21-a11*a20, d21=-(a00*a21-a01*a20), d22=a00*a11-a01*a10;
  var det=a00*d00+a10*d01+a20*d02; if (!det) det = 1;
  var id = 1 / det;
  o[0]=d00*id; o[1]=d10*id; o[2]=d20*id;
  o[3]=d01*id; o[4]=d11*id; o[5]=d21*id;
  o[6]=d02*id; o[7]=d12*id; o[8]=d22*id;
  return o;
}

/* ---------------- 几何构建 ---------------- */
function Geo() { this.p = []; this.n = []; this.t = []; this.i = []; this.v = 0; }
Geo.prototype.vert = function (m, nm, x, y, z, nx, ny, nz, u, v) {
  this.p.push(m[0]*x + m[4]*y + m[8]*z + m[12], m[1]*x + m[5]*y + m[9]*z + m[13], m[2]*x + m[6]*y + m[10]*z + m[14]);
  this.n.push(nm[0]*nx + nm[3]*ny + nm[6]*nz, nm[1]*nx + nm[4]*ny + nm[7]*nz, nm[2]*nx + nm[5]*ny + nm[8]*nz);
  this.t.push(u || 0, v || 0);
  return this.v++;
};
Geo.prototype.quad = function (m, n, a, b, c, d) {
  var nm = n3(m);
  var i0 = this.vert(m, nm, a[0],a[1],a[2], n[0],n[1],n[2], a[3]||0, a[4]||0);
  var i1 = this.vert(m, nm, b[0],b[1],b[2], n[0],n[1],n[2], b[3]||0, b[4]||0);
  var i2 = this.vert(m, nm, c[0],c[1],c[2], n[0],n[1],n[2], c[3]||0, c[4]||0);
  var i3 = this.vert(m, nm, d[0],d[1],d[2], n[0],n[1],n[2], d[3]||0, d[4]||0);
  this.i.push(i0, i1, i2, i0, i2, i3);
};
Geo.prototype.faceN = function (a, b, c) {
  var ux=b[0]-a[0], uy=b[1]-a[1], uz=b[2]-a[2];
  var vx=c[0]-a[0], vy=c[1]-a[1], vz=c[2]-a[2];
  var nx=uy*vz-uz*vy, ny=uz*vx-ux*vz, nz=ux*vy-uy*vx;
  var l = Math.hypot(nx,ny,nz)||1;
  return [nx/l, ny/l, nz/l];
};
Geo.prototype.box = function (m, hx, hy, hz) {
  var X=hx, Y=hy, Z=hz;
  this.quad(m, [1,0,0],  [X,-Y,-Z],[X,Y,-Z],[X,Y,Z],[X,-Y,Z]);
  this.quad(m, [-1,0,0], [-X,-Y,Z],[-X,Y,Z],[-X,Y,-Z],[-X,-Y,-Z]);
  this.quad(m, [0,1,0],  [-X,Y,-Z],[-X,Y,Z],[X,Y,Z],[X,Y,-Z]);
  this.quad(m, [0,-1,0], [-X,-Y,Z],[-X,-Y,-Z],[X,-Y,-Z],[X,-Y,Z]);
  this.quad(m, [0,0,1],  [-X,-Y,Z],[X,-Y,Z],[X,Y,Z],[-X,Y,Z]);
  this.quad(m, [0,0,-1], [X,-Y,-Z],[-X,-Y,-Z],[-X,Y,-Z],[X,Y,-Z]);
  return this;
};
Geo.prototype.rbox = function (m, hx, hy, hz, r, sub) {
  sub = sub || 4;
  r = Math.min(r === undefined ? Math.min(hx,hy,hz)*0.22 : r, Math.min(hx,hy,hz)*0.48, hx*0.48, hy*0.48, hz*0.48);
  var ihx = Math.max(hx - r, 0.012), ihy = Math.max(hy - r, 0.012), ihz = Math.max(hz - r, 0.012);
  var nm = n3(m);
  var faces = [
    { n:[1,0,0],  u:[0,0,-1], v:[0,1,0] },
    { n:[-1,0,0], u:[0,0,1],  v:[0,1,0] },
    { n:[0,1,0],  u:[1,0,0],  v:[0,0,1] },
    { n:[0,-1,0], u:[1,0,0],  v:[0,0,-1] },
    { n:[0,0,1],  u:[1,0,0],  v:[0,1,0] },
    { n:[0,0,-1], u:[-1,0,0], v:[0,1,0] }
  ];
  var grid = [];
  for (var f = 0; f < 6; f++) {
    var fc = faces[f];
    var hu = Math.abs(fc.u[0])*hx + Math.abs(fc.u[1])*hy + Math.abs(fc.u[2])*hz;
    var hv = Math.abs(fc.v[0])*hx + Math.abs(fc.v[1])*hy + Math.abs(fc.v[2])*hz;
    var pts = [];
    for (var j = 0; j <= sub; j++) {
      for (var i = 0; i <= sub; i++) {
        var a = i/sub*2-1, b = j/sub*2-1;
        var qx = fc.n[0]*hx + fc.u[0]*a*hu + fc.v[0]*b*hv;
        var qy = fc.n[1]*hx + fc.u[1]*a*hu + fc.v[1]*b*hv;
        var qz = fc.n[2]*hx + fc.u[2]*a*hu + fc.v[2]*b*hv;
        var ql = Math.hypot(qx,qy,qz)||1;
        var dx=qx/ql, dy=qy/ql, dz=qz/ql;
        var t = 1/Math.max(Math.abs(dx)/ihx, Math.abs(dy)/ihy, Math.abs(dz)/ihz);
        pts.push(this.vert(m, nm, dx*t + dx*r, dy*t + dy*r, dz*t + dz*r, dx, dy, dz, 0, 0));
      }
    }
    grid.push(pts);
  }
  for (f = 0; f < 6; f++) {
    var pts2 = grid[f];
    for (j = 0; j < sub; j++) for (i = 0; i < sub; i++) {
      var a0 = pts2[j*(sub+1)+i], a1 = pts2[j*(sub+1)+i+1],
          b1 = pts2[(j+1)*(sub+1)+i+1], b0 = pts2[(j+1)*(sub+1)+i];
      this.i.push(a0, a1, b1, a0, b1, b0);
    }
  }
  return this;
};
Geo.prototype.cyl = function (m, r0, r1, h, seg, caps) {
  seg = seg || 16;
  if (caps === undefined) caps = true;
  var nm = n3(m);
  var y0 = -h/2, y1 = h/2;
  var ring0 = [], ring1 = [];
  for (var i = 0; i <= seg; i++) {
    var a = i/seg * 2*PI;
    var ca = Math.cos(a), sa = Math.sin(a);
    var slope = (r0 - r1) / h;
    var nl = Math.hypot(1, slope);
    ring0.push(this.vert(m, nm, ca*r0, y0, sa*r0, ca/nl, slope/nl, sa/nl, 0, 0));
    ring1.push(this.vert(m, nm, ca*r1, y1, sa*r1, ca/nl, slope/nl, sa/nl, 0, 0));
  }
  for (i = 0; i < seg; i++) this.i.push(ring0[i], ring1[i], ring1[i+1], ring0[i], ring1[i+1], ring0[i+1]);
  if (caps) {
    var c0 = this.vert(m, nm, 0, y1, 0, 0, 1, 0, 0, 0);
    var c1 = this.vert(m, nm, 0, y0, 0, 0, -1, 0, 0, 0);
    for (i = 0; i < seg; i++) {
      var aa = i/seg*2*PI, ab = (i+1)/seg*2*PI;
      var t0 = this.vert(m, nm, Math.cos(aa)*r1, y1, Math.sin(aa)*r1, 0, 1, 0, 0, 0);
      var t1 = this.vert(m, nm, Math.cos(ab)*r1, y1, Math.sin(ab)*r1, 0, 1, 0, 0, 0);
      this.i.push(c0, t1, t0);
      var b0 = this.vert(m, nm, Math.cos(aa)*r0, y0, Math.sin(aa)*r0, 0, -1, 0, 0, 0);
      var b1 = this.vert(m, nm, Math.cos(ab)*r0, y0, Math.sin(ab)*r0, 0, -1, 0, 0, 0);
      this.i.push(c1, b0, b1);
    }
  }
  return this;
};
Geo.prototype.sphere = function (m, r, seg, rings, sy) {
  seg = seg || 14; rings = rings || 10;
  if (sy === undefined) sy = 1;
  var nm = n3(m);
  var grid = [];
  for (var j = 0; j <= rings; j++) {
    var row = [];
    var phi = j/rings * PI;
    for (var i = 0; i <= seg; i++) {
      var th = i/seg * 2*PI;
      var nx = Math.sin(phi)*Math.cos(th), ny = Math.cos(phi), nz = Math.sin(phi)*Math.sin(th);
      row.push(this.vert(m, nm, nx*r, ny*r*sy, nz*r, nx, ny, nz, 0, 0));
    }
    grid.push(row);
  }
  for (j = 0; j < rings; j++) for (i = 0; i < seg; i++) {
    this.i.push(grid[j][i], grid[j][i+1], grid[j+1][i+1], grid[j][i], grid[j+1][i+1], grid[j+1][i]);
  }
  return this;
};
Geo.prototype.rock = function (m, r, seed) {
  var nm = n3(m);
  var seg = 10, rings = 7;
  var P = [];
  for (var j = 0; j <= rings; j++) {
    var row = [];
    var phi = j/rings * PI;
    for (var i = 0; i <= seg; i++) {
      var th = i/seg * 2*PI;
      var dx = Math.sin(phi)*Math.cos(th), dy = Math.cos(phi), dz = Math.sin(phi)*Math.sin(th);
      var nse = vnoise(dx*2.1+seed, dy*2.1+seed*2, dz*2.1)*0.5 + vnoise(dx*4.7+seed, dy*4.7, dz*4.7+seed)*0.25;
      var rr = r * (0.78 + 0.5*nse);
      row.push([dx*rr, dy*rr*0.8, dz*rr]);
    }
    P.push(row);
  }
  for (j = 0; j < rings; j++) for (i = 0; i < seg; i++) {
    var a = P[j][i], b = P[j][i+1], c = P[j+1][i+1], d = P[j+1][i];
    var fn = this.faceN(a, b, c);
    var ia = this.vert(m, nm, a[0],a[1],a[2], fn[0],fn[1],fn[2], 0,0);
    var ib = this.vert(m, nm, b[0],b[1],b[2], fn[0],fn[1],fn[2], 0,0);
    var ic = this.vert(m, nm, c[0],c[1],c[2], fn[0],fn[1],fn[2], 0,0);
    var id = this.vert(m, nm, d[0],d[1],d[2], fn[0],fn[1],fn[2], 0,0);
    this.i.push(ia, ib, ic, ia, ic, id);
  }
  return this;
};
Geo.prototype.mound = function (m, r, h, seed) {
  var nm = n3(m);
  var seg = 26, rings = 6;
  var grid = [];
  for (var j = 0; j <= rings; j++) {
    var row = [];
    var v = j/rings;
    var y = v * h;
    var base = r * Math.pow(1 - v, 0.85) + 0.12;
    for (var i = 0; i <= seg; i++) {
      var th = i/seg * 2*PI;
      var ca = Math.cos(th), sa = Math.sin(th);
      var nse = vnoise(ca*3+seed, v*4+seed*3, sa*3) - 0.5;
      var rr = base * (1 + 0.3*nse);
      var slope = h / r;
      var nl = Math.hypot(1, slope);
      row.push(this.vert(m, nm, ca*rr, y + 0.12*nse, sa*rr, ca/nl, slope/nl, sa/nl, 0, 0));
    }
    grid.push(row);
  }
  for (j = 0; j < rings; j++) for (i = 0; i < seg; i++) {
    this.i.push(grid[j][i], grid[j+1][i], grid[j+1][i+1], grid[j][i], grid[j+1][i+1], grid[j][i+1]);
  }
  return this;
};
Geo.prototype.arcShell = function (m, cx, cy, R, a0, a1, z0, z1, th, seg) {
  seg = seg || 14;
  var nm = n3(m);
  var steps = [ [R + th/2, 1], [R - th/2, -1] ];
  for (var s = 0; s < 2; s++) {
    var rr = steps[s][0], sign = steps[s][1];
    var prev = null;
    for (var i = 0; i <= seg; i++) {
      var a = a0 + (a1 - a0) * i/seg;
      var ca = Math.cos(a), sa = Math.sin(a);
      var cur = [];
      cur.push(this.vert(m, nm, cx + ca*rr, cy + sa*rr, z0, ca*sign, sa*sign, 0, 0, 0));
      cur.push(this.vert(m, nm, cx + ca*rr, cy + sa*rr, z1, ca*sign, sa*sign, 0, 0, 0));
      if (prev) this.i.push(prev[0], prev[1], cur[1], prev[0], cur[1], cur[0]);
      prev = cur;
    }
  }
  [[a0, -1], [a1, 1]].forEach(function (end) {
    var a = end[0];
    var ca = Math.cos(a), sa = Math.sin(a);
    var tx = -sa * end[1], ty = ca * end[1];
    var q0 = this.vert(m, nm, cx + ca*(R-th/2), cy + sa*(R-th/2), z0, tx, ty, 0, 0, 0);
    var q1 = this.vert(m, nm, cx + ca*(R+th/2), cy + sa*(R+th/2), z0, tx, ty, 0, 0, 0);
    var q2 = this.vert(m, nm, cx + ca*(R+th/2), cy + sa*(R+th/2), z1, tx, ty, 0, 0, 0);
    var q3 = this.vert(m, nm, cx + ca*(R-th/2), cy + sa*(R-th/2), z1, tx, ty, 0, 0, 0);
    this.i.push(q0, q1, q2, q0, q2, q3);
  }, this);
  return this;
};
Geo.prototype.arcPlate = function (m, cx, cy, R, a0, a1, z, seg) {
  seg = seg || 14;
  var nm = n3(m);
  var c = this.vert(m, nm, cx, cy, z, 0, 0, z > 0 ? 1 : -1, 0, 0);
  var prev = null;
  for (var i = 0; i <= seg; i++) {
    var a = a0 + (a1 - a0) * i/seg;
    var cur = this.vert(m, nm, cx + Math.cos(a)*R, cy + Math.sin(a)*R, z, 0, 0, z > 0 ? 1 : -1, 0, 0);
    if (prev !== null) this.i.push(c, prev, cur);
    prev = cur;
  }
  var e0 = [cx + Math.cos(a0)*R, cy + Math.sin(a0)*R], e1 = [cx + Math.cos(a1)*R, cy + Math.sin(a1)*R];
  var nz = z > 0 ? 1 : -1;
  var s0 = this.vert(m, nm, e0[0], e0[1], z, 0, 0, nz, 0, 0);
  var s1 = this.vert(m, nm, e1[0], e1[1], z, 0, 0, nz, 0, 0);
  var cc = this.vert(m, nm, cx, cy, z, 0, 0, nz, 0, 0);
  this.i.push(cc, s1, s0);
  return this;
};
Geo.prototype.tube = function (m, pts, r, seg) {
  seg = seg || 8;
  var g2 = new Geo();
  for (var i = 0; i < pts.length - 1; i++) {
    var a = pts[i], b = pts[i+1];
    var dx = b[0]-a[0], dy = b[1]-a[1], dz = b[2]-a[2];
    var L = Math.hypot(dx, dy, dz)||1;
    var mid = [(a[0]+b[0])/2, (a[1]+b[1])/2, (a[2]+b[2])/2];
    var d = [dx/L, dy/L, dz/L];
    var rx = 0, ry = 1, rz = 0;
    if (Math.abs(d[1]) > 0.95) { rx = 1; ry = 0; }
    var xx = ry*d[2]-rz*d[1], xy = rz*d[0]-rx*d[2], xz = rx*d[1]-ry*d[0];
    var xl = Math.hypot(xx,xy,xz)||1; xx/=xl; xy/=xl; xz/=xl;
    var zx = xy*d[2]-xz*d[1], zy = xz*d[0]-xx*d[2], zz = xx*d[1]-xy*d[0];
    var bm = m4ident();
    bm[0]=xx; bm[1]=xy; bm[2]=xz;
    bm[4]=d[0]; bm[5]=d[1]; bm[6]=d[2];
    bm[8]=zx; bm[9]=zy; bm[10]=zz;
    bm[12]=mid[0]; bm[13]=mid[1]; bm[14]=mid[2];
    g2.cyl(m4mul(m, bm), r, r, L, seg, false);
    g2.sphere(m4mul(m, T(a[0], a[1], a[2])), r, 8, 6);
    if (i === pts.length - 2) g2.sphere(m4mul(m, T(b[0], b[1], b[2])), r, 8, 6);
  }
  this.merge(g2);
  return this;
};
/* 变截面放样：pts = [{x,y,w,h,r}] 沿局部平面中心线，w=横向(Z)宽、h=竖向(Y)高，
   生成 8 点倒角截面连续条带——焊接箱型梁外观（大面平滑、棱边倒角）。 */
Geo.prototype.loft = function (m, pts, opt) {
  opt = opt || {};
  var sides = 8;
  var nm = n3(m);
  var rings = [];
  var segN = pts.length - 1;
  for (var i = 0; i < pts.length; i++) {
    var p = pts[i];
    var a = pts[Math.max(i - 1, 0)], b = pts[Math.min(i + 1, pts.length - 1)];
    var dx = b.x - a.x, dy = b.y - a.y;
    var L = Math.hypot(dx, dy) || 1;
    dx /= L; dy /= L;
    var ux = -dy, uy = dx; /* 截面 up 向量（2D） */
    var r = p.r === undefined ? 0.24 : p.r;
    var c = 1 - r;
    var hw = p.h / 2, ww = p.w / 2;
    var prof = [
      { y: hw, z: 0, ny: 1, nz: 0 },
      { y: hw * c, z: ww * c, ny: 0.707, nz: 0.707 },
      { y: 0, z: ww, ny: 0, nz: 1 },
      { y: -hw * c, z: ww * c, ny: -0.707, nz: 0.707 },
      { y: -hw, z: 0, ny: -1, nz: 0 },
      { y: -hw * c, z: -ww * c, ny: -0.707, nz: -0.707 },
      { y: 0, z: -ww, ny: 0, nz: -1 },
      { y: hw * c, z: -ww * c, ny: 0.707, nz: -0.707 }
    ];
    var ring = [];
    for (var t = 0; t < sides; t++) {
      var q = prof[t];
      var n3x = ux * q.ny, n3y = uy * q.ny, n3z = q.nz;
      ring.push(this.vert(m, nm, p.x + ux * q.y, p.y + uy * q.y, q.z, n3x, n3y, n3z, 0, 0));
    }
    rings.push(ring);
  }
  for (i = 0; i < segN; i++) {
    for (var t2 = 0; t2 < sides; t2++) {
      var s2 = (t2 + 1) % sides;
      this.i.push(rings[i][t2], rings[i][s2], rings[i + 1][s2], rings[i][t2], rings[i + 1][s2], rings[i + 1][t2]);
    }
  }
  /* 端盖 */
  function cap(ring, sign) {
    var a = pts[sign > 0 ? pts.length - 1 : 0];
    var b2 = pts[sign > 0 ? pts.length - 2 : 1];
    var dx2 = a.x - b2.x, dy2 = a.y - b2.y;
    var L2 = Math.hypot(dx2, dy2) || 1;
    var cx = L2 > 0.0001 ? dx2 / L2 : 1, cy = L2 > 0.0001 ? dy2 / L2 : 0;
    var cIdx = this.vert(m, nm, a.x, a.y, 0, cx * sign, cy * sign, 0, 0, 0);
    for (var t3 = 0; t3 < sides; t3++) {
      var t4 = (t3 + 1) % sides;
      if (sign > 0) this.i.push(cIdx, ring[t3], ring[t4]);
      else this.i.push(cIdx, ring[t4], ring[t3]);
    }
  }
  if (opt.caps !== false) {
    cap.call(this, rings[0], -1);
    cap.call(this, rings[pts.length - 1], 1);
  }
  return this;
};

Geo.prototype.merge = function (o) {
  var base = this.v;
  for (var i = 0; i < o.p.length; i++) { this.p.push(o.p[i]); this.n.push(o.n[i]); this.t.push(o.t[i]); }
  for (i = 0; i < o.i.length; i++) this.i.push(o.i[i] + base);
  this.v += o.v;
  return this;
};

function makeMesh(gl, geo) {
  if (!geo.i.length) return null;
  var n = geo.p.length / 3;
  if (n > 65500) throw new Error('geo too big: ' + n);
  var inter = new Float32Array(n * 8);
  for (var i = 0; i < n; i++) {
    inter[i*8]   = geo.p[i*3];
    inter[i*8+1] = geo.p[i*3+1];
    inter[i*8+2] = geo.p[i*3+2];
    inter[i*8+3] = geo.n[i*3];
    inter[i*8+4] = geo.n[i*3+1];
    inter[i*8+5] = geo.n[i*3+2];
    inter[i*8+6] = geo.t[i*2];
    inter[i*8+7] = geo.t[i*2+1];
  }
  var vbo = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(gl.ARRAY_BUFFER, inter, gl.STATIC_DRAW);
  var ibo = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(geo.i), gl.STATIC_DRAW);
  return { vbo: vbo, ibo: ibo, n: geo.i.length, belt: false };
}
function makeBeltMesh(gl, geo) {
  var n = geo.v;
  var inter = new Float32Array(n * 7);
  for (var i = 0; i < n; i++) {
    inter[i*7]   = geo.p[i*3];
    inter[i*7+1] = geo.p[i*3+1];
    inter[i*7+2] = geo.p[i*3+2];
    inter[i*7+3] = geo.n[i*3];
    inter[i*7+4] = geo.n[i*3+1];
    inter[i*7+5] = geo.n[i*3+2];
    inter[i*7+6] = geo.t[i];
  }
  var vbo = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(gl.ARRAY_BUFFER, inter, gl.STATIC_DRAW);
  var ibo = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(geo.i), gl.STATIC_DRAW);
  return { vbo: vbo, ibo: ibo, n: geo.i.length, belt: true };
}
function bindMesh(prog, mesh) {
  var gl = prog.gl;
  gl.bindBuffer(gl.ARRAY_BUFFER, mesh.vbo);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.ibo);
  if (mesh.belt) {
    gl.enableVertexAttribArray(prog.a.aPos);
    gl.vertexAttribPointer(prog.a.aPos, 3, gl.FLOAT, false, 28, 0);
    gl.enableVertexAttribArray(prog.a.aNor);
    gl.vertexAttribPointer(prog.a.aNor, 3, gl.FLOAT, false, 28, 12);
    gl.enableVertexAttribArray(prog.a.aT);
    gl.vertexAttribPointer(prog.a.aT, 1, gl.FLOAT, false, 28, 24);
  } else {
    gl.enableVertexAttribArray(prog.a.aPos);
    gl.vertexAttribPointer(prog.a.aPos, 3, gl.FLOAT, false, 32, 0);
    gl.enableVertexAttribArray(prog.a.aNor);
    gl.vertexAttribPointer(prog.a.aNor, 3, gl.FLOAT, false, 32, 12);
    if (prog.a.aUV >= 0) {
      gl.enableVertexAttribArray(prog.a.aUV);
      gl.vertexAttribPointer(prog.a.aUV, 2, gl.FLOAT, false, 32, 24);
    }
  }
}

/* ---------------- 节点 ---------------- */
function Node(parent, m) {
  this.parent = parent || null;
  this.children = [];
  this.local = m || m4ident();
  this.world = m4ident();
  this.meshes = null;
  this.glass = null;
  this.decals = null;
  if (parent) parent.children.push(this);
}
Node.prototype.update = function (pw) {
  m4mul(pw || this.parent.world, this.local, this.world);
  for (var i = 0; i < this.children.length; i++) this.children[i].update();
};
Node.prototype.add = function (gl, geo, mat) {
  var mesh = makeMesh(gl, geo);
  if (!mesh) return;
  (this.meshes = this.meshes || []).push({ mesh: mesh, mat: mat });
};
Node.prototype.addGlass = function (gl, geo, mat) {
  var mesh = makeMesh(gl, geo);
  if (!mesh) return;
  (this.glass = this.glass || []).push({ mesh: mesh, mat: mat });
};
Node.prototype.addDecal = function (gl, geo, mat) {
  var mesh = makeMesh(gl, geo);
  if (!mesh) return;
  (this.decals = this.decals || []).push({ mesh: mesh, mat: mat });
};

/* ---------------- 颜色/纹理 ---------------- */
function lin(hex) {
  var r = (hex >> 16 & 255) / 255, g = (hex >> 8 & 255) / 255, b = (hex & 255) / 255;
  function f(c) { return Math.pow(c, 2.2); }
  return [f(r), f(g), f(b)];
}
function Mat(hex, spec, shin, opts) {
  opts = opts || {};
  return {
    color: lin(hex),
    spec: spec || [0.06, 0.06, 0.06],
    shin: shin === undefined ? 16 : shin,
    emis: opts.emis ? lin(opts.emis).map(function (c) { return c * (opts.emisK || 1); }) : [0, 0, 0],
    alpha: opts.alpha === undefined ? 1 : opts.alpha,
    tex: opts.tex || null,
    cut: opts.cut || 0,
    metal: opts.metal === undefined ? 0.1 : opts.metal,  /* 金属度：环境反射占比 */
    mud: opts.mud === undefined ? 0.12 : opts.mud        /* 泥污权重：低处溅泥 */
  };
}
function canvasTex(gl, cv, mipmap, clampWrap) {
  var t = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, cv);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, clampWrap ? gl.CLAMP_TO_EDGE : gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, clampWrap ? gl.CLAMP_TO_EDGE : gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, mipmap ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  if (mipmap) gl.generateMipmap(gl.TEXTURE_2D);
  return t;
}
function makeStripeTex(gl) {
  var cv = document.createElement('canvas');
  cv.width = 256; cv.height = 64;
  var c = cv.getContext('2d');
  c.fillStyle = '#e8b40e';
  c.fillRect(0, 0, 256, 64);
  c.fillStyle = '#17181a';
  c.save();
  c.translate(-64, 0);
  for (var i = 0; i < 12; i++) {
    c.beginPath();
    c.moveTo(i * 48, 64);
    c.lineTo(i * 48 + 24, 64);
    c.lineTo(i * 48 + 24 + 64, 0);
    c.lineTo(i * 48 + 64, 0);
    c.closePath();
    c.fill();
  }
  c.restore();
  for (i = 0; i < 130; i++) {
    c.fillStyle = 'rgba(70,64,50,' + (Math.random() * 0.16).toFixed(3) + ')';
    c.fillRect(Math.random() * 256, Math.random() * 64, 1 + Math.random() * 3, 1 + Math.random() * 2);
  }
  return canvasTex(gl, cv, false, true);
}

function makeLabelTex(gl, text, sub) {
  var cv = document.createElement('canvas');
  cv.width = 512; cv.height = 256;
  var c = cv.getContext('2d');
  c.clearRect(0, 0, 512, 256);
  c.fillStyle = '#181818';
  c.font = '900 130px -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif';
  c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillText(text, 256, 100);
  if (sub) {
    c.font = '600 30px -apple-system, "Segoe UI", sans-serif';
    c.fillStyle = '#2a2a2a';
    c.fillText(sub, 256, 200);
  }
  return canvasTex(gl, cv, false, true);
}

/* ============================================================
   createApp
   ============================================================ */
function createApp(opts) {
  opts = opts || {};

  /* ---------- 全局错误兜底 ---------- */
  window.addEventListener('error', function (e) {
    var em = document.getElementById('errMask');
    if (em) {
      em.classList.add('show');
      var msg = e.message || (e.error && e.error.message) || '未知错误';
      em.firstElementChild.textContent = '3D 渲染初始化失败：' + msg +
        (e.lineno ? '（第 ' + e.lineno + ' 行）' : '');
    }
  });

  /* ---------- HUD 注入 ---------- */
  var hud = document.createElement('div');
  hud.innerHTML =
    '<div class="hud" id="hudTop">' +
      '<div class="title-block">' +
        '<div style="display:flex;gap:8px;flex-wrap:wrap;">' +
          '<a class="pill" href="' + (opts.back || './index.html') + '">‹ 模型箱</a>' +
          '<span class="pill"><b>' + opts.title + '</b>&nbsp;<i>' + (opts.badge || '') + '</i></span>' +
        '</div>' +
        '<span class="title-sub">手写 WebGL · 可驾驶仿真 · 零外部资源</span>' +
      '</div>' +
      '<div id="hudBtns"></div>' +
    '</div>' +
    '<div class="hud pill" id="hint"></div>' +
    '<div class="hud" id="keysCard"><h3>操 作</h3></div>' +
    '<div class="hud" id="credit">示意模型 · 手写 WebGL · 无外部资源</div>' +
    '<div id="touchUI">' +
      '<div class="tc" id="dpad">' +
        '<span></span><button data-k="f">▲</button><span></span>' +
        '<button data-k="l">◀</button><button data-k="stop" class="mid">停</button><button data-k="r">▶</button>' +
        '<span></span><button data-k="b">▼</button><span></span>' +
      '</div>' +
      '<div class="tc" id="jpad"></div>' +
    '</div>' +
    '<div id="helpMask"><div id="helpCard">' + (opts.help || '') + '<button id="helpClose">知道了</button></div></div>' +
    '<div id="errMask"><div>当前浏览器不支持 WebGL，无法渲染 3D 场景。<br>请更换现代浏览器后重试。</div></div>';
  while (hud.firstChild) document.body.appendChild(hud.firstChild);

  var btnDefs = opts.buttons || [];
  var hudBtns = document.getElementById('hudBtns');
  var btnEls = {};
  btnDefs.forEach(function (b) {
    var el = document.createElement('button');
    el.className = 'btnh';
    el.textContent = b.label;
    el.addEventListener('click', function () {
      this.blur();
      b.onClick(el);
    });
    hudBtns.appendChild(el);
    btnEls[b.id] = el;
  });
  var jpad = document.getElementById('jpad');
  (opts.touchRight || []).forEach(function (t) {
    var el = document.createElement('button');
    el.setAttribute('data-k', t[0]);
    el.textContent = t[1];
    jpad.appendChild(el);
  });

  var keysCard = document.getElementById('keysCard');
  (opts.keys || []).forEach(function (row) {
    var div = document.createElement('div');
    div.className = 'row';
    div.innerHTML = row.map(function (cell) {
      return '<span>' + cell + '</span>';
    }).join('');
    keysCard.appendChild(div);
  });

  var isTouch = global.matchMedia('(pointer: coarse)').matches;
  if (isTouch) document.body.classList.add('touch');
  var reduced = global.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var hint = document.getElementById('hint');
  hint.textContent = opts.hint || '';
  setTimeout(function () { hint.classList.add('show'); }, 600);
  setTimeout(function () { hint.classList.remove('show'); }, 6200);

  var helpMask = document.getElementById('helpMask');
  document.getElementById('helpClose').addEventListener('click', function () { helpMask.classList.remove('show'); });
  helpMask.addEventListener('click', function (e) { if (e.target === helpMask) helpMask.classList.remove('show'); });
  function toggleHelp() { helpMask.classList.toggle('show'); }

  /* ---------- GL ---------- */
  var canvas = document.getElementById('gl');
  var gl = canvas.getContext('webgl', { antialias: true, alpha: false, powerPreference: 'high-performance' })
        || canvas.getContext('experimental-webgl', { antialias: true, alpha: false });
  if (!gl) {
    document.getElementById('errMask').classList.add('show');
    return null;
  }
  gl.disable(gl.CULL_FACE);

  function compile(type, src) {
    var s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      throw new Error('shader: ' + gl.getShaderInfoLog(s) + '\n' + src);
    }
    return s;
  }
  function program(vsSrc, fsSrc, uniforms, attribs) {
    var p = gl.createProgram();
    gl.attachShader(p, compile(gl.VERTEX_SHADER, vsSrc));
    gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fsSrc));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      throw new Error('link: ' + gl.getProgramInfoLog(p));
    }
    var o = { p: p, u: {}, a: {}, gl: gl };
    uniforms.forEach(function (n) { o.u[n] = gl.getUniformLocation(p, n); });
    attribs.forEach(function (n) { o.a[n] = gl.getAttribLocation(p, n); });
    return o;
  }

  var U_LIGHT = ['uProj','uView','uModel','uNrm','uLightVP'];
  var U_MAT = ['uColor','uSpec','uShin','uEmis','uAlpha','uSunDir','uSunCol','uSkyCol','uGndCol','uCamPos','uFogCol','uFogDen','uShadow','uTexel','uShadowOn','uMap','uUseTex','uCut','uMetal','uMud','uZenith','uHorizon','uMudCol'];
  var A_OBJ = ['aPos','aNor','aUV'];

  var VS_OBJ = [
    'attribute vec3 aPos; attribute vec3 aNor; attribute vec2 aUV;',
    'uniform mat4 uProj, uView, uModel; uniform mat3 uNrm; uniform mat4 uLightVP;',
    'varying vec3 vW; varying vec3 vN; varying vec2 vUV; varying vec4 vLP;',
    'void main(){',
    '  vec4 wp = uModel * vec4(aPos, 1.0);',
    '  vW = wp.xyz; vN = uNrm * aNor; vUV = aUV; vLP = uLightVP * wp;',
    '  gl_Position = uProj * uView * wp;',
    '}'].join('\n');

  var VS_BELT = [
    'attribute vec3 aPos; attribute vec3 aNor; attribute float aT;',
    'uniform mat4 uProj, uView, uModel; uniform mat3 uNrm; uniform mat4 uLightVP;',
    'uniform float uBelt; uniform vec3 uBeltCfg;',
    'varying vec3 vW; varying vec3 vN; varying vec2 vUV; varying vec4 vLP;',
    'const float PI = 3.14159265;',
    'void main(){',
    '  float Lb = uBeltCfg.x; float R = uBeltCfg.y;',
    '  float s = fract(aT + uBelt / uBeltCfg.z) * uBeltCfg.z;',
    '  vec2 p; vec2 tn; vec2 nr;',
    '  if (s < Lb) { p = vec2(-Lb*0.5 + s, 2.0*R); tn = vec2(1.0, 0.0); nr = vec2(0.0, 1.0); }',
    '  else if (s < Lb + PI*R) { float a = 1.57079632 - (s - Lb)/R; vec2 c = vec2(Lb*0.5, R);',
    '    p = c + R*vec2(cos(a), sin(a)); tn = vec2(sin(a), -cos(a)); nr = vec2(cos(a), sin(a)); }',
    '  else if (s < 2.0*Lb + PI*R) { float d = s - Lb - PI*R; p = vec2(Lb*0.5 - d, 0.0); tn = vec2(-1.0, 0.0); nr = vec2(0.0, -1.0); }',
    '  else { float a = -1.57079632 - (s - 2.0*Lb - PI*R)/R; vec2 c = vec2(-Lb*0.5, R);',
    '    p = c + R*vec2(cos(a), sin(a)); tn = vec2(sin(a), -cos(a)); nr = vec2(cos(a), sin(a)); }',
    '  vec3 lp = vec3(p.x + tn.x*aPos.x + nr.x*aPos.y, p.y + tn.y*aPos.x + nr.y*aPos.y, aPos.z);',
    '  vec3 ln = vec3(tn.x*aNor.x + nr.x*aNor.y, tn.y*aNor.x + nr.y*aNor.y, aNor.z);',
    '  vec4 wp = uModel * vec4(lp, 1.0);',
    '  vW = wp.xyz; vN = uNrm * ln; vUV = vec2(0.0); vLP = uLightVP * wp;',
    '  gl_Position = uProj * uView * wp;',
    '}'].join('\n');

  var SHADOW_CHUNK = [
    'float unpackD(vec4 c){ return dot(c, vec4(1.0, 1.0/255.0, 1.0/65025.0, 1.0/16581375.0)); }',
    'float shadowF(float ndl){',
    '  if (uShadowOn < 0.5) return 1.0;',
    '  vec3 lp = vLP.xyz / vLP.w * 0.5 + 0.5;',
    '  if (lp.x < 0.02 || lp.x > 0.98 || lp.y < 0.02 || lp.y > 0.98 || lp.z > 0.999) return 1.0;',
    '  float bias = 0.0017 + 0.0024 * (1.0 - ndl);',
    '  float sum = 0.0;',
    '  for (int i = -1; i <= 1; i++) for (int j = -1; j <= 1; j++) {',
    '    float d = unpackD(texture2D(uShadow, lp.xy + vec2(float(i), float(j)) * uTexel));',
    '    sum += (lp.z - bias > d) ? 0.0 : 1.0;',
    '  }',
    '  return sum / 9.0;',
    '}'
  ].join('\n');

  var FS_HEAD = [
    '#ifdef GL_FRAGMENT_PRECISION_HIGH',
    'precision highp float;',
    '#else',
    'precision mediump float;',
    '#endif',
    'varying vec3 vW; varying vec3 vN; varying vec2 vUV; varying vec4 vLP;',
    'uniform vec3 uColor; uniform vec3 uSpec; uniform float uShin; uniform vec3 uEmis; uniform float uAlpha;',
    'uniform vec3 uSunDir; uniform vec3 uSunCol; uniform vec3 uSkyCol; uniform vec3 uGndCol;',
    'uniform vec3 uCamPos; uniform vec3 uFogCol; uniform float uFogDen;',
    'uniform sampler2D uShadow; uniform float uTexel; uniform float uShadowOn;',
    'uniform sampler2D uMap; uniform float uUseTex; uniform float uCut;',
    'uniform float uMetal; uniform float uMud;',
    'uniform vec3 uZenith; uniform vec3 uHorizon; uniform vec3 uMudCol;'
  ].join('\n');

  var FS_LIGHT = FS_HEAD + '\n' + SHADOW_CHUNK + '\n' + [
    'vec3 envAt(vec3 r){',
    '  float up = clamp(r.y * 0.62 + 0.10, 0.0, 1.0);',
    '  vec3 sky = mix(uHorizon, uZenith, pow(up, 0.8));',
    '  vec3 gnd = mix(uHorizon * 0.40, uHorizon * 0.30, clamp(-r.y * 2.0, 0.0, 1.0));',
    '  vec3 e = mix(gnd, sky, step(0.0, r.y));',
    '  float sd = max(dot(r, uSunDir), 0.0);',
    '  e += uSunCol * pow(sd, 48.0) * 1.35;',
    '  return e;',
    '}',
    'void main(){',
    '  vec4 texc = vec4(1.0); float alpha = uAlpha;',
    '  if (uUseTex > 0.5) { texc = texture2D(uMap, vUV); if (texc.a < uCut) discard; alpha *= texc.a; }',
    '  vec3 N = normalize(vN);',
    '  vec3 V = normalize(uCamPos - vW);',
    '  float ndl = dot(N, uSunDir);',
    '  float dif = max(ndl, 0.0);',
    '  float sh = shadowF(ndl);',
    '  vec3 hemi = mix(uGndCol, uSkyCol, N.y * 0.5 + 0.5);',
    '  /* 泥污：低处溅泥 + 细碎色斑 */',
    '  float nz = fract(sin(dot(floor(vW.xz * 4.0) + floor(vec2(vW.y * 7.0)), vec2(127.1, 311.7))) * 43758.5);',
    '  float mud = uMud * clamp((0.72 - vW.y) * 1.35, 0.0, 1.0) * (0.55 + 0.45 * nz);',
    '  vec3 albedo = mix(uColor * texc.rgb, uMudCol, mud);',
    '  /* 程序化环境反射 + 菲涅尔 */',
    '  vec3 R = reflect(-V, N);',
    '  vec3 env = envAt(R);',
    '  float fres = pow(1.0 - max(dot(N, V), 0.0), 3.0);',
    '  vec3 H = normalize(uSunDir + V);',
    '  float sp = pow(max(dot(N, H), 0.0), uShin) * dif;',
    '  float metal = uMetal;',
    '  float kd = 1.0 - metal * 0.72;',
    '  vec3 col =',
    '    albedo * kd * (hemi + vec3(0.045))',
    '    + albedo * kd * uSunCol * dif * sh',
    '    + env * (metal * (0.50 + 0.38 * dif * sh) + fres * 0.30) * (0.35 + 0.65 * metal + 0.35 * fres)',
    '    + uSpec * uSunCol * sp * sh * 0.9',
    '    + uEmis;',
    '  float dist = length(uCamPos - vW);',
    '  float fog = 1.0 - exp(-uFogDen * uFogDen * dist * dist);',
    '  col = mix(col, uFogCol, fog);',
    '  gl_FragColor = vec4(pow(max(col, vec3(0.0)), vec3(0.4545)), alpha);',
    '}'
  ].join('\n');

  var FS_GROUND = FS_HEAD + '\n' + [
    'uniform sampler2D uDetail; uniform sampler2D uDecal; uniform float uDetScale; uniform float uDecScale;',
    SHADOW_CHUNK,
    'void main(){',
    '  vec3 N = normalize(vN);',
    '  float dTex = texture2D(uDetail, vW.xz * uDetScale).r;',
    '  vec3 albedo = uColor * (0.5 + 1.0 * (dTex - 0.5));',
    '  vec4 dec = texture2D(uDecal, vW.xz * uDecScale + 0.5);',
    '  albedo = mix(albedo, pow(dec.rgb, vec3(2.2)), dec.a);',
    '  float ndl = dot(N, uSunDir);',
    '  float dif = max(ndl, 0.0);',
    '  float sh = shadowF(ndl);',
    '  vec3 hemi = mix(uGndCol, uSkyCol, N.y * 0.5 + 0.5);',
    '  vec3 V = normalize(uCamPos - vW);',
    '  vec3 H = normalize(uSunDir + V);',
    '  float sp = pow(max(dot(N, H), 0.0), uShin) * dif;',
    '  vec3 col = albedo * (hemi + vec3(0.055)) + albedo * uSunCol * dif * sh + uSpec * uSunCol * sp * sh * 0.9;',
    '  float dist = length(uCamPos - vW);',
    '  float fog = 1.0 - exp(-uFogDen * uFogDen * dist * dist);',
    '  col = mix(col, uFogCol, fog);',
    '  gl_FragColor = vec4(pow(max(col, vec3(0.0)), vec3(0.4545)), 1.0);',
    '}'
  ].join('\n');

  var FS_PACK = [
    'precision mediump float;',
    'void main(){',
    '  vec4 s = vec4(1.0, 255.0, 65025.0, 16581375.0) * gl_FragCoord.z;',
    '  s = fract(s);',
    '  s -= s.yzww * vec4(1.0/255.0, 1.0/255.0, 1.0/255.0, 0.0);',
    '  gl_FragColor = s;',
    '}'].join('\n');

  var VS_SKY = [
    'attribute vec2 aPos;',
    'uniform mat4 uInvVP; uniform vec3 uCamPos;',
    'varying vec3 vDir;',
    'void main(){',
    '  vec4 f = uInvVP * vec4(aPos, 1.0, 1.0);',
    '  vDir = f.xyz / f.w - uCamPos;',
    '  gl_Position = vec4(aPos, 0.9999, 1.0);',
    '}'].join('\n');

  var FS_SKY = [
    '#ifdef GL_FRAGMENT_PRECISION_HIGH',
    'precision highp float;',
    '#else',
    'precision mediump float;',
    '#endif',
    'varying vec3 vDir;',
    'uniform vec3 uZenith; uniform vec3 uHorizon; uniform vec3 uSunDir; uniform vec3 uSunCol;',
    'void main(){',
    '  vec3 d = normalize(vDir);',
    '  float h = clamp(d.y * 1.5 + 0.1, 0.0, 1.0);',
    '  vec3 col = mix(uHorizon, uZenith, pow(h, 0.85));',
    '  float sd = max(dot(d, uSunDir), 0.0);',
    '  col += uSunCol * (pow(sd, 700.0) * 1.2 + pow(sd, 8.0) * 0.10);',
    '  if (d.y < 0.0) col = mix(col, uHorizon * 0.92, clamp(-d.y * 8.0, 0.0, 1.0));',
    '  gl_FragColor = vec4(pow(col, vec3(0.4545)), 1.0);',
    '}'].join('\n');

  var VS_PART = [
    'attribute vec4 aP; attribute vec4 aC;',
    'uniform mat4 uProj, uView; uniform float uPtH;',
    'varying vec3 vC; varying float vA;',
    'void main(){',
    '  vec4 cp = uProj * uView * vec4(aP.xyz, 1.0);',
    '  gl_Position = cp;',
    '  float sz = aP.w * uPtH / max(cp.w, 0.1);',
    '  gl_PointSize = clamp(sz, 1.0, 110.0);',
    '  vC = aC.rgb; vA = aC.a;',
    '}'].join('\n');

  var FS_PART = [
    '#ifdef GL_FRAGMENT_PRECISION_HIGH',
    'precision highp float;',
    '#else',
    'precision mediump float;',
    '#endif',
    'varying vec3 vC; varying float vA;',
    'void main(){',
    '  float d = length(gl_PointCoord - vec2(0.5)) * 2.0;',
    '  float a = smoothstep(1.0, 0.3, d) * vA;',
    '  if (a < 0.01) discard;',
    '  gl_FragColor = vec4(pow(max(vC, vec3(0.0)), vec3(0.4545)), a);',
    '}'].join('\n');

  var pMain   = program(VS_OBJ, FS_LIGHT,  U_LIGHT.concat(U_MAT), A_OBJ);
  var pBelt   = program(VS_BELT, FS_LIGHT, U_LIGHT.concat(U_MAT, ['uBelt','uBeltCfg']), ['aPos','aNor','aT']);
  var pDepth  = program(VS_OBJ,  FS_PACK,  U_LIGHT, A_OBJ);
  var pDepthBelt = program(VS_BELT, FS_PACK, U_LIGHT.concat(['uBelt','uBeltCfg']), ['aPos','aNor','aT']);
  var pGround = program(VS_OBJ,  FS_GROUND, U_LIGHT.concat(U_MAT, ['uDetail','uDecal','uDetScale','uDecScale']), A_OBJ);
  var pSky    = program(VS_SKY,  FS_SKY,   ['uInvVP','uCamPos','uZenith','uHorizon','uSunDir','uSunCol'], ['aPos']);
  var pPart   = program(VS_PART, FS_PART,  ['uProj','uView','uPtH'], ['aP','aC']);

  /* ---------- 阴影 FBO ---------- */
  var SHADOW_SIZE = isTouch ? 1024 : 2048;
  var shadowTex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, shadowTex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, SHADOW_SIZE, SHADOW_SIZE, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  var shadowFBO = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, shadowFBO);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, shadowTex, 0);
  var shadowRB = gl.createRenderbuffer();
  gl.bindRenderbuffer(gl.RENDERBUFFER, shadowRB);
  gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, SHADOW_SIZE, SHADOW_SIZE);
  gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, shadowRB);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);

  /* ---------- 环境纹理 ---------- */
  var detCv = document.createElement('canvas');
  detCv.width = detCv.height = 256;
  (function () {
    var c = detCv.getContext('2d');
    c.fillStyle = '#847760'; c.fillRect(0, 0, 256, 256);
    for (var i = 0; i < 900; i++) {
      var g = 90 + Math.random() * 90;
      c.fillStyle = 'rgba(' + (g|0) + ',' + ((g*0.92)|0) + ',' + ((g*0.75)|0) + ',' + (0.12 + Math.random()*0.25) + ')';
      var r = 1 + Math.random() * 2.6;
      c.beginPath();
      c.arc(Math.random()*256, Math.random()*256, r, 0, 7);
      c.fill();
    }
    for (i = 0; i < 40; i++) {
      c.fillStyle = 'rgba(60,52,40,' + (0.08 + Math.random()*0.1) + ')';
      c.beginPath();
      c.arc(Math.random()*256, Math.random()*256, 8 + Math.random()*26, 0, 7);
      c.fill();
    }
  })();
  var texDetail = canvasTex(gl, detCv, true, false);

  var DEC_SIZE = 1024, DEC_WORLD = opts.decalWorld || 120;
  var decCv = document.createElement('canvas');
  decCv.width = decCv.height = DEC_SIZE;
  var decCtx = decCv.getContext('2d');
  var texDecal = canvasTex(gl, decCv, false, true);
  var decalDirty = false, decalLast = 0;

  var blobCv = document.createElement('canvas');
  blobCv.width = blobCv.height = 128;
  (function () {
    var c = blobCv.getContext('2d');
    var g = c.createRadialGradient(64, 64, 6, 64, 64, 62);
    g.addColorStop(0, 'rgba(255,255,255,0.85)');
    g.addColorStop(0.65, 'rgba(255,255,255,0.4)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, 128, 128);
  })();
  var texBlob = canvasTex(gl, blobCv, false, true);

  var texLabel = makeLabelTex(gl, opts.badge || '', opts.badgeSub || null);

  /* ---------- 地面覆盖层 ---------- */
  function decUV(wx, wz) {
    return [(wx / DEC_WORLD + 0.5) * DEC_SIZE, (wz / DEC_WORLD + 0.5) * DEC_SIZE];
  }
  function stampRect(wx, wz, ang, w, l, alpha, color) {
    var p = decUV(wx, wz);
    if (p[0] < 4 || p[0] > DEC_SIZE - 4 || p[1] < 4 || p[1] > DEC_SIZE - 4) return;
    decCtx.save();
    decCtx.translate(p[0], p[1]);
    decCtx.rotate(-ang);
    decCtx.fillStyle = color || 'rgba(48,40,30,' + alpha + ')';
    decCtx.fillRect(-l/2, -w/2, l, w);
    decCtx.restore();
    decalDirty = true;
  }
  function stampBlob(wx, wz, r, alpha, color) {
    var p = decUV(wx, wz);
    if (p[0] < 4 || p[0] > DEC_SIZE - 4 || p[1] < 4 || p[1] > DEC_SIZE - 4) return;
    var col = color || '58,47,33';
    var g = decCtx.createRadialGradient(p[0], p[1], 0, p[0], p[1], r);
    g.addColorStop(0, 'rgba(' + col + ',' + alpha + ')');
    g.addColorStop(1, 'rgba(' + col + ',0)');
    decCtx.fillStyle = g;
    decCtx.fillRect(p[0]-r, p[1]-r, r*2, r*2);
    decalDirty = true;
  }
  function uploadDecal(now) {
    if (!decalDirty || now - decalLast < 0.35) return;
    decalLast = now;
    decalDirty = false;
    gl.bindTexture(gl.TEXTURE_2D, texDecal);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, decCv);
  }

  /* ---------- 地面 / 道具 ---------- */
  var groundSize = 300;
  var gGround = new Geo();
  (function () {
    var h = groundSize / 2;
    gGround.vert(m4ident(), m4ident(), -h, 0, -h, 0, 1, 0, 0, 0);
    gGround.vert(m4ident(), m4ident(),  h, 0, -h, 0, 1, 0, 0, 0);
    gGround.vert(m4ident(), m4ident(),  h, 0,  h, 0, 1, 0, 0, 0);
    gGround.vert(m4ident(), m4ident(), -h, 0,  h, 0, 1, 0, 0, 0);
    gGround.i.push(0, 1, 2, 0, 2, 3);
  })();
  var meshGround = makeMesh(gl, gGround);

  var gBlob = new Geo();
  (function () {
    gBlob.vert(m4ident(), m4ident(), -1, 0, -1, 0, 1, 0, 0, 0);
    gBlob.vert(m4ident(), m4ident(),  1, 0, -1, 0, 1, 0, 0, 1);
    gBlob.vert(m4ident(), m4ident(),  1, 0,  1, 0, 1, 0, 1, 1);
    gBlob.vert(m4ident(), m4ident(), -1, 0,  1, 0, 1, 0, 1, 0);
    gBlob.i.push(0, 1, 2, 0, 2, 3);
  })();
  var meshBlob = makeMesh(gl, gBlob);
  var blobMat = { color: [0.02,0.02,0.02], spec: [0,0,0], shin: 1, emis: [0,0,0], alpha: 0.4, tex: texBlob, cut: 0.02 };
  var blobState = { on: false, x: 0, z: 0, h: 0, w: 3.4, l: 2.1 };

  /* 默认道具：土堆/岩石/锥桶/木箱/远山 */
  var MOUND = opts.mound || null;
  function moundH(wx, wz) {
    if (!MOUND) return 0;
    var dx = wx - MOUND.x, dz = wz - MOUND.z;
    var d = Math.hypot(dx, dz);
    if (d >= MOUND.r) return 0;
    var t = d / MOUND.r;
    return MOUND.h * Math.pow(Math.cos(t * PI / 2), 1.35);
  }
  var props = {};
  (function () {
    if (MOUND) {
      var gd = new Geo();
      gd.mound(T(MOUND.x, 0, MOUND.z), MOUND.r, MOUND.h, 7.3);
      props.mound = makeMesh(gl, gd);
    }
    var rocks = opts.rocks || [[-6.5, 0.28, -5.2, 0.75, 3.1], [9.5, 0.16, 4.8, 0.42, 8.7], [12.8, 0.24, 7.6, 0.6, 15.2], [-2.4, 0.1, -8.8, 0.3, 21.9]];
    if (rocks.length) {
      var gr = new Geo();
      rocks.forEach(function (rk) {
        gr.rock(m4chain(T(rk[0], rk[1], rk[2]), RY(rk[4] || 0.7)), rk[3], rk[5] || 3.1);
      });
      props.rocks = makeMesh(gl, gr);
    }
    var cones = opts.cones || [[2.6, 4.2, 0.3], [3.4, 4.9, 1.9], [2.1, 5.3, 3.4]];
    if (cones.length) {
      var gc = new Geo(), gw = new Geo();
      cones.forEach(function (p) {
        var m = T(p[0], 0, p[1]);
        gc.cyl(m4mul(m, T(0, 0.36, 0)), 0.025, 0.155, 0.72, 14, true);
        gw.cyl(m4mul(m, T(0, 0.42, 0)), 0.108, 0.118, 0.1, 14, false);
        gw.box(m4mul(m, T(0, 0.02, 0)), 0.21, 0.022, 0.21);
      });
      props.cones = makeMesh(gl, gc);
      props.conesW = makeMesh(gl, gw);
    }
    var crates = opts.crates || [[-4.6, 0.38, -0.8, 0.38], [-4.5, 1.05, -0.72, 0.34], [-3.7, 0.3, -1.3, 0.3, 0.5]];
    if (crates.length) {
      var gw2 = new Geo();
      crates.forEach(function (c) {
        gw2.box(c[5] !== undefined ? m4chain(T(c[0], c[1], c[2]), RY(c[5])) : T(c[0], c[1], c[2]), c[3], c[3], c[3]);
      });
      props.crates = makeMesh(gl, gw2);
    }
    var hills = opts.hills || [
      [-82, 55, 34, 14], [-40, -88, 42, 18], [70, -70, 30, 11],
      [95, 25, 38, 15], [30, 96, 45, 19], [-60, 80, 28, 9]
    ];
    if (hills.length) {
      var gh = new Geo();
      hills.forEach(function (hh, i) {
        gh.mound(T(hh[0], 0, hh[1]), hh[2], hh[3], i * 3.7 + 2);
      });
      props.hills = makeMesh(gl, gh);
    }
  })();

  /* ---------- 相机 ---------- */
  var cam = {
    yaw: 0, pitch: 0.3, dist: 10.5,
    yawT: 0, pitchT: 0.3, distT: 10.5,
    tx: 0, tz: 0, ty: 2.1
  };
  var isTouchCam = global.matchMedia('(pointer: coarse)').matches;
  if (opts.cam) {
    cam.yaw = cam.yawT = opts.cam.yaw !== undefined ? opts.cam.yaw : 0;
    cam.pitch = cam.pitchT = opts.cam.pitch || 0.3;
    cam.dist = cam.distT = (opts.cam.dist || 10.5) * (isTouchCam ? 1.6 : 1);
  }
  var follow = opts.follow !== false;
  var pointers = {};
  var lastPinch = 0;
  canvas.addEventListener('pointerdown', function (e) {
    pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
    try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
    canvas.classList.add('drag');
    var ids = Object.keys(pointers);
    if (ids.length === 2) {
      var a = pointers[ids[0]], b = pointers[ids[1]];
      lastPinch = Math.hypot(a.x - b.x, a.y - b.y);
    }
  });
  canvas.addEventListener('pointermove', function (e) {
    var p = pointers[e.pointerId];
    if (!p) return;
    var ids = Object.keys(pointers);
    if (ids.length === 1) {
      cam.yawT -= (e.clientX - p.x) * 0.0056;
      cam.pitchT = clamp(cam.pitchT + (e.clientY - p.y) * 0.0045, 0.05, 1.32);
    }
    p.x = e.clientX; p.y = e.clientY;
    if (ids.length === 2) {
      var a = pointers[ids[0]], b = pointers[ids[1]];
      var d = Math.hypot(a.x - b.x, a.y - b.y);
      if (lastPinch > 0) cam.distT = clamp(cam.distT * (lastPinch / Math.max(d, 1)), 4.5, 40);
      lastPinch = d;
    }
  });
  function ptrUp(e) {
    delete pointers[e.pointerId];
    if (!Object.keys(pointers).length) canvas.classList.remove('drag');
    lastPinch = 0;
  }
  canvas.addEventListener('pointerup', ptrUp);
  canvas.addEventListener('pointercancel', ptrUp);
  canvas.addEventListener('wheel', function (e) {
    e.preventDefault();
    cam.distT = clamp(cam.distT * Math.exp(e.deltaY * 0.0011), 4.5, 40);
  }, { passive: false });
  canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  document.addEventListener('gesturestart', function (e) { e.preventDefault(); });
  function camReset() {
    if (opts.cam) {
      cam.yawT = opts.cam.yaw !== undefined ? opts.cam.yaw : 0;
      cam.pitchT = opts.cam.pitch || 0.3;
      cam.distT = opts.cam.dist || 10.5;
    }
    follow = opts.follow !== false;
    var bf = document.getElementById('btnFollow');
    if (bf) bf.classList.toggle('on', follow);
  }

  /* ---------- 输入 ---------- */
  var key = { f: 0, b: 0, l: 0, r: 0 };
  var extraKey = opts.extraKeys || {}; /* code -> k */
  function manualCancel() { if (opts.onManual) opts.onManual(); }
  function stopAll() {
    for (var k in key) key[k] = 0;
    if (opts.onStop) opts.onStop();
  }
  var KEYMAP = {
    KeyW: 'f', ArrowUp: 'f',
    KeyS: 'b', ArrowDown: 'b',
    KeyA: 'l', ArrowLeft: 'l',
    KeyD: 'r', ArrowRight: 'r'
  };
  var MANUAL_KEYS = ['f','b','l','r'];
  document.addEventListener('keydown', function (e) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    var k = KEYMAP[e.code] || extraKey[e.code];
    if (k) {
      key[k] = 1;
      if (MANUAL_KEYS.indexOf(k) >= 0 || opts.manualExtra && opts.manualExtra.indexOf(k) >= 0) manualCancel();
      e.preventDefault();
      return;
    }
    if (e.code === 'Space') { stopAll(); e.preventDefault(); return; }
    if (e.code === 'Enter' && opts.onEnter) { opts.onEnter(); e.preventDefault(); return; }
    if (e.code === 'KeyC') { followToggle(); return; }
    if (e.code === 'KeyH') { toggleHelp(); return; }
    if (opts.onKey) opts.onKey(e.code);
  });
  document.addEventListener('keyup', function (e) {
    var k = KEYMAP[e.code] || extraKey[e.code];
    if (k) key[k] = 0;
  });
  global.addEventListener('blur', function () { for (var k in key) key[k] = 0; });
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) for (var k in key) key[k] = 0;
  });
  document.querySelectorAll('.tc button[data-k]').forEach(function (btn) {
    var k = btn.getAttribute('data-k');
    function down(e) {
      e.preventDefault();
      try { btn.setPointerCapture(e.pointerId); } catch (err) {}
      btn.classList.add('act');
      if (k === 'stop') { stopAll(); return; }
      key[k] = 1;
      manualCancel();
    }
    function up() {
      btn.classList.remove('act');
      if (k !== 'stop') key[k] = 0;
    }
    btn.addEventListener('pointerdown', down);
    btn.addEventListener('pointerup', up);
    btn.addEventListener('pointercancel', up);
    btn.addEventListener('lostpointercapture', up);
  });

  /* 「跟随镜头」按钮（可选） */
  var btnFollow = document.getElementById('btnFollow');
  function followToggle() {
    follow = !follow;
    if (btnFollow) btnFollow.classList.toggle('on', follow);
  }
  if (opts.followBtn && btnFollow) {
    btnFollow.style.display = '';
    btnFollow.classList.add('on');
    btnFollow.addEventListener('click', function () { this.blur(); followToggle(); });
  } else if (btnFollow) {
    btnFollow.style.display = 'none';
  }

  /* ---------- 粒子 ---------- */
  var PMAX = 340;
  var parts = [];
  var partBufP = new Float32Array(PMAX * 4);
  var partBufC = new Float32Array(PMAX * 4);
  var partVboP = gl.createBuffer();
  var partVboC = gl.createBuffer();
  function spawnP(x, y, z, vx, vy, vz, size, life, r, g, b, a, grav) {
    if (parts.length >= PMAX) parts.shift();
    parts.push({ x:x, y:y, z:z, vx:vx, vy:vy, vz:vz, s:size, l:life, l0:life, r:r, g:g, b:b, a:a, gr:grav });
  }
  function updateParts(dt) {
    for (var i = parts.length - 1; i >= 0; i--) {
      var p = parts[i];
      p.l -= dt;
      if (p.l <= 0) { parts.splice(i, 1); continue; }
      p.vy -= p.gr * dt;
      var dr = 1 - 1.6 * dt; if (dr < 0) dr = 0;
      p.vx *= dr; p.vz *= dr;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.y < 0.02 && p.gr > 0) { p.y = 0.02; p.vy = 0; p.vx *= 0.9; p.vz *= 0.9; }
    }
  }

  /* ---------- 渲染 ---------- */
  var FOV = rad(52);
  var proj = m4ident(), view = m4ident(), lightVP = m4ident(), invVP = m4ident();
  var vpTemp = m4ident();
  var SUN_DIR = (function () {
    var v = opts.sun || [0.42, 0.72, 0.32];
    var l = Math.hypot(v[0], v[1], v[2]);
    return [v[0]/l, v[1]/l, v[2]/l];
  })();
  var SUN_COL = lin(opts.sunColor || 0xffe8c0).map(function (c) { return c * 1.28; });
  var SKY_COL = lin(0x9db8d8).map(function (c) { return c * 0.62; });
  var GND_COL = lin(0x6b5f4c).map(function (c) { return c * 0.62; });
  var FOG_COL = lin(0xd3dade);
  var ZEN_COL = lin(0x5a83b8);
  var HOR_COL = lin(0xd3dade);
  var MUD_COL = lin(0x5c4c38);
  var FOG_DEN = 0.0105;
  var dirtCol = lin(opts.dirt || 0x6d5f49);

  var curProg = null;
  function use(prog) { if (curProg !== prog) { gl.useProgram(prog.p); curProg = prog; } }
  var _nbuf = new Float32Array(9);
  function setLightU(prog) {
    gl.uniformMatrix4fv(prog.u.uProj, false, proj);
    gl.uniformMatrix4fv(prog.u.uView, false, view);
    gl.uniformMatrix4fv(prog.u.uLightVP, false, lightVP);
    gl.uniform3fv(prog.u.uSunDir, SUN_DIR);
    gl.uniform3fv(prog.u.uSunCol, SUN_COL);
    gl.uniform3fv(prog.u.uSkyCol, SKY_COL);
    gl.uniform3fv(prog.u.uGndCol, GND_COL);
    gl.uniform3fv(prog.u.uCamPos, [eye[0], eye[1], eye[2]]);
    gl.uniform3fv(prog.u.uFogCol, FOG_COL);
    gl.uniform1f(prog.u.uFogDen, FOG_DEN);
    gl.uniform1i(prog.u.uShadow, 0);
    gl.uniform1f(prog.u.uTexel, 1 / SHADOW_SIZE);
    gl.uniform1f(prog.u.uShadowOn, 1);
    if (prog.u.uMetal) {
      gl.uniform3fv(prog.u.uZenith, ZEN_COL);
      gl.uniform3fv(prog.u.uHorizon, HOR_COL);
      gl.uniform3fv(prog.u.uMudCol, MUD_COL);
    }
  }
  function drawMat(prog, mesh, mat, model) {
    if (!mesh || !mat) return;
    bindMesh(prog, mesh);
    gl.uniformMatrix4fv(prog.u.uModel, false, model);
    gl.uniformMatrix3fv(prog.u.uNrm, false, n3(model, _nbuf));
    gl.uniform3fv(prog.u.uColor, mat.color);
    gl.uniform3fv(prog.u.uSpec, mat.spec);
    gl.uniform1f(prog.u.uShin, mat.shin);
    gl.uniform3fv(prog.u.uEmis, mat.emis);
    gl.uniform1f(prog.u.uAlpha, mat.alpha);
    if (prog.u.uMetal) {
      gl.uniform1f(prog.u.uMetal, mat.metal === undefined ? 0.1 : mat.metal);
      gl.uniform1f(prog.u.uMud, mat.mud === undefined ? 0.12 : mat.mud);
    }
    if (mat.tex) {
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, mat.tex);
      gl.uniform1i(prog.u.uMap, 1);
      gl.uniform1f(prog.u.uUseTex, 1);
      gl.uniform1f(prog.u.uCut, mat.cut);
    } else {
      gl.uniform1f(prog.u.uUseTex, 0);
    }
    gl.drawElements(gl.TRIANGLES, mesh.n, gl.UNSIGNED_SHORT, 0);
  }
  var eye = [0, 0, 0];
  var sceneRoot = null, sceneDyn = null, sceneGlassRoot = null;

  function drawNodeMeshes(node, prog) {
    if (node.meshes) {
      for (var i = 0; i < node.meshes.length; i++) {
        var m = node.meshes[i];
        drawMat(prog, m.mesh, m.mat, node.world);
      }
    }
    if (node.decals && prog === pMain) {
      for (i = 0; i < node.decals.length; i++) drawMat(prog, node.decals[i].mesh, node.decals[i].mat, node.world);
    }
    for (i = 0; i < node.children.length; i++) drawNodeMeshes(node.children[i], prog);
  }
  function drawNodeDepth(node, prog) {
    if (node.meshes) for (var i = 0; i < node.meshes.length; i++) {
      bindMesh(prog, node.meshes[i].mesh);
      gl.uniformMatrix4fv(prog.u.uModel, false, node.world);
      gl.drawElements(gl.TRIANGLES, node.meshes[i].mesh.n, gl.UNSIGNED_SHORT, 0);
    }
    if (node.glass) for (i = 0; i < node.glass.length; i++) {
      bindMesh(prog, node.glass[i].mesh);
      gl.uniformMatrix4fv(prog.u.uModel, false, node.world);
      gl.drawElements(gl.TRIANGLES, node.glass[i].mesh.n, gl.UNSIGNED_SHORT, 0);
    }
    for (i = 0; i < node.children.length; i++) drawNodeDepth(node.children[i], prog);
  }
  function drawGlassNode(n) {
    if (n.glass) for (var i = 0; i < n.glass.length; i++) drawMat(pMain, n.glass[i].mesh, n.glass[i].mat, n.world);
    for (i = 0; i < n.children.length; i++) drawGlassNode(n.children[i]);
  }

  function drawParts() {
    if (!parts.length) return;
    var n = 0;
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i];
      var f = p.l / p.l0;
      partBufP[n*4] = p.x; partBufP[n*4+1] = p.y; partBufP[n*4+2] = p.z; partBufP[n*4+3] = p.s;
      partBufC[n*4] = p.r; partBufC[n*4+1] = p.g; partBufC[n*4+2] = p.b; partBufC[n*4+3] = p.a * f;
      n++;
    }
    gl.useProgram(pPart.p);
    gl.uniformMatrix4fv(pPart.u.uProj, false, proj);
    gl.uniformMatrix4fv(pPart.u.uView, false, view);
    gl.uniform1f(pPart.u.uPtH, canvas.height / (2 * Math.tan(FOV / 2)));
    gl.bindBuffer(gl.ARRAY_BUFFER, partVboP);
    gl.bufferData(gl.ARRAY_BUFFER, partBufP.subarray(0, n * 4), gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(pPart.a.aP);
    gl.vertexAttribPointer(pPart.a.aP, 4, gl.FLOAT, false, 16, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, partVboC);
    gl.bufferData(gl.ARRAY_BUFFER, partBufC.subarray(0, n * 4), gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(pPart.a.aC);
    gl.vertexAttribPointer(pPart.a.aC, 4, gl.FLOAT, false, 16, 0);
    gl.drawArrays(gl.POINTS, 0, n);
  }

  var skyBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, skyBuf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 3,-1, -1,3]), gl.STATIC_DRAW);

  function renderShadow() {
    gl.bindFramebuffer(gl.FRAMEBUFFER, shadowFBO);
    gl.viewport(0, 0, SHADOW_SIZE, SHADOW_SIZE);
    gl.clearColor(1, 1, 1, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    var c = opts.shadowCenter || function () { return [0, 1.2, 0]; };
    var ctr = c();
    var eyeP = [ctr[0] + SUN_DIR[0] * 42, ctr[1] + SUN_DIR[1] * 42, ctr[2] + SUN_DIR[2] * 42];
    m4lookAt(eyeP, ctr, [0, 1, 0], view);
    var half = opts.shadowHalf || 12;
    m4ortho(-half, half, -half, half, 2, 90, proj);
    m4mul(proj, view, lightVP);
    use(pDepth);
    gl.uniformMatrix4fv(pDepth.u.uProj, false, proj);
    gl.uniformMatrix4fv(pDepth.u.uView, false, view);
    gl.uniformMatrix4fv(pDepth.u.uLightVP, false, lightVP);
    if (sceneRoot) drawNodeDepth(sceneRoot, pDepth);
    if (sceneDyn) sceneDyn(pDepth, true);
    [props.mound, props.rocks, props.cones, props.conesW, props.crates].forEach(function (mesh) {
      if (!mesh) return;
      bindMesh(pDepth, mesh);
      gl.uniformMatrix4fv(pDepth.u.uModel, false, m4ident());
      gl.drawElements(gl.TRIANGLES, mesh.n, gl.UNSIGNED_SHORT, 0);
    });
    use(pDepthBelt);
    gl.uniformMatrix4fv(pDepthBelt.u.uProj, false, proj);
    gl.uniformMatrix4fv(pDepthBelt.u.uView, false, view);
    gl.uniformMatrix4fv(pDepthBelt.u.uLightVP, false, lightVP);
    if (sceneDyn) sceneDyn(pDepthBelt, true, true);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  function resize() {
    var dpr = Math.min(window.devicePixelRatio || 1, isTouch ? 1.8 : 2);
    var w = Math.round(canvas.clientWidth * dpr);
    var h = Math.round(canvas.clientHeight * dpr);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
  }
  window.addEventListener('resize', resize);

  function renderMain() {
    resize();
    gl.viewport(0, 0, canvas.width, canvas.height);
    m4persp(FOV, canvas.width / Math.max(canvas.height, 1), 0.3, 400, proj);
    var k = Math.min(1, frameDt * 7);
    cam.yaw = lerp(cam.yaw, cam.yawT, k);
    cam.pitch = lerp(cam.pitch, cam.pitchT, k);
    cam.dist = lerp(cam.dist, cam.distT, k);
    if (follow && opts.followTarget) {
      var tp = opts.followTarget();
      cam.tx = lerp(cam.tx, tp[0], k * 0.9);
      cam.tz = lerp(cam.tz, tp[1], k * 0.9);
    }
    var ty = cam.ty;
    var cp = Math.cos(cam.pitch), sp2 = Math.sin(cam.pitch);
    eye[0] = cam.tx + cam.dist * cp * Math.cos(cam.yaw);
    eye[1] = ty + cam.dist * sp2;
    eye[2] = cam.tz + cam.dist * cp * Math.sin(cam.yaw);
    if (eye[1] < 0.4) eye[1] = 0.4;
    m4lookAt(eye, [cam.tx, ty, cam.tz], [0, 1, 0], view);
    m4mul(proj, view, vpTemp);
    m4inv(vpTemp, invVP);

    gl.clearColor(FOG_COL[0], FOG_COL[1], FOG_COL[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, shadowTex);

    /* 天空 */
    gl.disable(gl.DEPTH_TEST);
    gl.depthMask(false);
    use(pSky);
    gl.uniformMatrix4fv(pSky.u.uInvVP, false, invVP);
    gl.uniform3fv(pSky.u.uCamPos, eye);
    gl.uniform3fv(pSky.u.uZenith, ZEN_COL);
    gl.uniform3fv(pSky.u.uHorizon, HOR_COL);
    gl.uniform3fv(pSky.u.uSunDir, SUN_DIR);
    gl.uniform3fv(pSky.u.uSunCol, SUN_COL);
    gl.bindBuffer(gl.ARRAY_BUFFER, skyBuf);
    gl.enableVertexAttribArray(pSky.a.aPos);
    gl.vertexAttribPointer(pSky.a.aPos, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(true);

    /* 地面 */
    use(pGround);
    setLightU(pGround);
    gl.uniform3fv(pGround.u.uColor, dirtCol);
    gl.uniform3fv(pGround.u.uSpec, [0.02, 0.02, 0.02]);
    gl.uniform1f(pGround.u.uShin, 6);
    gl.uniform3fv(pGround.u.uEmis, [0, 0, 0]);
    gl.uniform1f(pGround.u.uAlpha, 1);
    gl.uniform1f(pGround.u.uUseTex, 0);
    gl.uniform1f(pGround.u.uDetScale, 0.25);
    gl.uniform1f(pGround.u.uDecScale, 1 / DEC_WORLD);
    gl.uniform1i(pGround.u.uDetail, 2);
    gl.uniform1i(pGround.u.uDecal, 3);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, texDetail);
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, texDecal);
    bindMesh(pGround, meshGround);
    gl.drawElements(gl.TRIANGLES, meshGround.n, gl.UNSIGNED_SHORT, 0);

    /* 柔影 */
    if (blobState.on) {
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.depthMask(false);
      use(pMain);
      setLightU(pMain);
      var blobM = m4chain(T(blobState.x, 0.015, blobState.z), RY(blobState.h), S(blobState.w, 1, blobState.l));
      drawMat(pMain, meshBlob, blobMat, blobM);
      gl.depthMask(true);
      gl.disable(gl.BLEND);
    }

    /* 道具 + 车辆 */
    use(pMain);
    setLightU(pMain);
    var M_MOUND = Mat(opts.moundColor || 0x61533e, [0.02,0.02,0.02], 6);
    var M_ROCK = Mat(0x8a8880, [0.05,0.05,0.05], 10);
    var M_CONE = Mat(0xd8571e, [0.2,0.08,0.03], 24);
    var M_WHITE = Mat(0xd8d8d8, [0.2,0.2,0.2], 20);
    var M_WOOD = Mat(0xa87b4a, [0.03,0.03,0.03], 8);
    var M_HILL = Mat(0x565c4a, [0.01,0.01,0.01], 4);
    drawMat(pMain, props.mound, M_MOUND, m4ident());
    drawMat(pMain, props.rocks, M_ROCK, m4ident());
    drawMat(pMain, props.cones, M_CONE, m4ident());
    drawMat(pMain, props.conesW, M_WHITE, m4ident());
    drawMat(pMain, props.crates, M_WOOD, m4ident());
    drawMat(pMain, props.hills, M_HILL, m4ident());
    if (sceneRoot) drawNodeMeshes(sceneRoot, pMain);
    if (sceneDyn) sceneDyn(pMain, false);

    /* 粒子 */
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);
    drawParts();
    /* 玻璃 */
    use(pMain);
    setLightU(pMain);
    if (sceneRoot) drawGlassNode(sceneRoot);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
  }

  var perfT = 0, lastT = 0, frameDt = 0.016;
  function frame(ts) {
    if (!lastT) lastT = ts;
    frameDt = clamp((ts - lastT) / 1000, 0.001, 0.05);
    lastT = ts;
    perfT += frameDt;
    if (opts.update) opts.update(frameDt, perfT);
    renderShadow();
    renderMain();
    requestAnimationFrame(frame);
  }

  var app = {
    gl: gl,
    canvas: canvas,
    isTouch: isTouch,
    reduced: reduced,
    key: key,
    cam: cam,
    t: function () { return perfT; },
    dt: function () { return frameDt; },
    setScene: function (root, dynFn) { sceneRoot = root; sceneDyn = dynFn; },
    setBlob: function (on, x, z, h, w, l) { blobState.on = !!on; if (on) { blobState.x = x; blobState.z = z; blobState.h = h; blobState.w = w; blobState.l = l; } },
    setFollowTarget: function (fn) { opts.followTarget = fn; },
    setShadowCenter: function (fn) { opts.shadowCenter = fn; },
    spawnP: spawnP,
    updateParts: updateParts,
    stampRect: stampRect,
    stampBlob: stampBlob,
    uploadDecal: uploadDecal,
    moundH: moundH,
    mound: MOUND,
    drawMat: drawMat,
    pMain: pMain,
    pBelt: pBelt,
    pDepth: pDepth,
    pDepthBelt: pDepthBelt,
    prog: program,
    makeMesh: function (g) { return makeMesh(gl, g); },
    makeBeltMesh: function (g) { return makeBeltMesh(gl, g); },
    Node: Node,
    Mat: Mat,
    makeLabelTex: function (t, s) { return makeLabelTex(gl, t, s); },
    texLabel: texLabel,
    makeStripeTex: function () { return makeStripeTex(gl); },
    camReset: camReset,
    useProg: use,
    setLightU: setLightU,
    setBtnOn: function (id, on) { if (btnEls[id]) btnEls[id].classList.toggle('on', !!on); },
    isDemoOn: function () { return demoOn; },
    /* 调试/测试：手动步进一帧 */
    step: function (dt) {
      frameDt = dt || 0.016;
      perfT += frameDt;
      if (opts.update) opts.update(frameDt, perfT);
      renderShadow();
      renderMain();
    }
  };
  var demoOn = false;
  app.setDemo = function (on) { demoOn = !!on; if (btnEls.demo) btnEls.demo.classList.toggle('on', demoOn); };

  /* 供自动化测试/调试使用 */
  global.__v3d = app;

  app.start = function () {
    resize();
    requestAnimationFrame(frame);
  };
  return app;
}

/* 液压缸：A、B 两点间绘制缸筒+镀铬杆（unitCyl/unitSph 为单位网格） */
var _cylM = null, _dirV = [0,0,0];
function axisMat(A, d, sx, sy, sz, o) {
  var rx = 0, ry = 1, rz = 0;
  if (Math.abs(d[1]) > 0.95) { rx = 1; ry = 0; rz = 0; }
  var cx = ry*d[2]-rz*d[1], cy = rz*d[0]-rx*d[2], cz = rx*d[1]-ry*d[0];
  var cl = Math.hypot(cx,cy,cz)||1; cx/=cl; cy/=cl; cz/=cl;
  var zx = cy*d[2]-cz*d[1], zy = cz*d[0]-cx*d[2], zz = cx*d[1]-cy*d[0];
  o[0]=cx*sx; o[1]=cy*sx; o[2]=cz*sx; o[3]=0;
  o[4]=d[0]*sy; o[5]=d[1]*sy; o[6]=d[2]*sy; o[7]=0;
  o[8]=zx*sx; o[9]=zy*sx; o[10]=zz*sx; o[11]=0;
  o[12]=A[0]; o[13]=A[1]; o[14]=A[2]; o[15]=1;
  return o;
}
function makeCylHelper(unitCyl, unitSph, cylM) {
  _cylM = cylM;
  return function (drawOne, A, B, rB, rR) {
    var dx = B[0]-A[0], dy = B[1]-A[1], dz = B[2]-A[2];
    var L = Math.hypot(dx, dy, dz)||1;
    _dirV[0]=dx/L; _dirV[1]=dy/L; _dirV[2]=dz/L;
    var barrelL = L * 0.58;
    axisMat(A, _dirV, rB, barrelL, rB, _cylM);
    drawOne(unitCyl, 'barrel', _cylM);
    var rodA = [A[0] + _dirV[0] * (barrelL - 0.03), A[1] + _dirV[1] * (barrelL - 0.03), A[2] + _dirV[2] * (barrelL - 0.03)];
    axisMat(rodA, _dirV, rR, L - barrelL + 0.05, rR, _cylM);
    drawOne(unitCyl, 'rod', _cylM);
    axisMat(B, _dirV, rR * 1.5, 0.045, rR * 1.5, _cylM);
    drawOne(unitSph, 'joint', _cylM);
    axisMat(A, _dirV, rR * 1.5, 0.045, rR * 1.5, _cylM);
    drawOne(unitSph, 'joint', _cylM);
  };
}

/* 履带几何（页面级构建：局部 (u,v,z) 顶点 + 沿程参数 t） */
function buildBeltGeo(Lb, R, W, N) {
  var total = 2 * Lb + 2 * PI * R;
  var g = { p: [], n: [], t: [], i: [], v: 0 };
  function bvert(x, y, z, nx, ny, nz, t) {
    g.p.push(x, y, z); g.n.push(nx, ny, nz); g.t.push(t);
    return g.v++;
  }
  function bquad(a, b, c, d) { g.i.push(a, b, c, a, c, d); }
  function linkBox(x0, x1, y0, y1, z0, z1, tc) {
    var t0 = tc + x0 / total, t1 = tc + x1 / total;
    bquad(
      bvert(x0, y0, z0, 0, 0, -1, t0), bvert(x1, y0, z0, 0, 0, -1, t1),
      bvert(x1, y1, z0, 0, 0, -1, t1), bvert(x0, y1, z0, 0, 0, -1, t0));
    bquad(
      bvert(x1, y0, z1, 0, 0, 1, t1), bvert(x0, y0, z1, 0, 0, 1, t0),
      bvert(x0, y1, z1, 0, 0, 1, t0), bvert(x1, y1, z1, 0, 0, 1, t1));
    bquad(
      bvert(x0, y1, z0, 0, 1, 0, t0), bvert(x0, y1, z1, 0, 1, 0, t0),
      bvert(x1, y1, z1, 0, 1, 0, t1), bvert(x1, y1, z0, 0, 1, 0, t1));
    bquad(
      bvert(x1, y0, z0, 0, -1, 0, t1), bvert(x1, y0, z1, 0, -1, 0, t1),
      bvert(x0, y0, z1, 0, -1, 0, t0), bvert(x0, y0, z0, 0, -1, 0, t0));
    bquad(
      bvert(x0, y0, z1, -1, 0, 0, t0), bvert(x0, y0, z0, -1, 0, 0, t0),
      bvert(x0, y1, z0, -1, 0, 0, t0), bvert(x0, y1, z1, -1, 0, 0, t0));
    bquad(
      bvert(x1, y0, z0, 1, 0, 0, t1), bvert(x1, y0, z1, 1, 0, 0, t1),
      bvert(x1, y1, z1, 1, 0, 0, t1), bvert(x1, y1, z0, 1, 0, 0, t1));
  }
  var pitch = total / N;
  for (var i = 0; i < N; i++) {
    var tc = (i + 0.5) / N;
    var hl = pitch * 0.44;
    linkBox(-hl, hl, 0.018, 0.075, -W/2, W/2, tc);
    linkBox(-hl*0.72, hl*0.72, 0.075, 0.125, -W/2+0.05, W/2-0.05, tc);
  }
  return { geo: g, total: total };
}
/* 动态软管：A→M→B 三段黑色橡胶管（每帧重算，随关节运动）。
   makeTubeHelper(unitCyl, unitSph, scratchM) 返回 fn(drawOne, A, B, sag, r, side)
   sag: 中点沿 -Y 下垂量；side: 水平侧偏。 */
function makeTubeHelper(unitCyl, unitSph, scratchM) {
  var mid = [0, 0, 0], d1v = [0, 0, 0], d2v = [0, 0, 0];
  return function (drawOne, A, B, sag, r, side) {
    mid[0] = (A[0] + B[0]) / 2 + (side || 0);
    mid[1] = (A[1] + B[1]) / 2 - sag;
    mid[2] = (A[2] + B[2]) / 2;
    var dx1 = mid[0] - A[0], dy1 = mid[1] - A[1], dz1 = mid[2] - A[2];
    var L1 = Math.hypot(dx1, dy1, dz1) || 1;
    d1v[0] = dx1 / L1; d1v[1] = dy1 / L1; d1v[2] = dz1 / L1;
    axisMat(A, d1v, r, L1, r, scratchM);
    drawOne(unitCyl, 'tube', scratchM);
    var dx2 = B[0] - mid[0], dy2 = B[1] - mid[1], dz2 = B[2] - mid[2];
    var L2 = Math.hypot(dx2, dy2, dz2) || 1;
    d2v[0] = dx2 / L2; d2v[1] = dy2 / L2; d2v[2] = dz2 / L2;
    axisMat(mid, d2v, r, L2, r, scratchM);
    drawOne(unitCyl, 'tube', scratchM);
    var rc = r * 1.45;
    axisMat(mid, d1v, rc, 0.025, rc, scratchM);
    drawOne(unitSph, 'joint', scratchM); /* 弯头球 */
    axisMat(A, d1v, rc, 0.035, rc, scratchM);
    drawOne(unitSph, 'joint', scratchM); /* 端部接头 */
  };
}

/* 履带绘制（pBelt 或 pDepthBelt） */
var _beltMat = null;
function drawBelt(app, mesh, model, travel, Lb, R, mat, depthPass) {
  var gl = app.gl;
  var prog = depthPass ? app.pDepthBelt : app.pBelt;
  app.useProg(prog);
  gl.uniform1f(prog.u.uBelt, travel);
  gl.uniform3f(prog.u.uBeltCfg, Lb, R, 2 * Lb + 2 * PI * R);
  if (depthPass) {
    bindMesh(prog, mesh);
    gl.uniformMatrix4fv(prog.u.uModel, false, model);
    gl.drawElements(gl.TRIANGLES, mesh.n, gl.UNSIGNED_SHORT, 0);
  } else {
    app.setLightU(prog);
    if (!_beltMat) {
      _beltMat = Mat(0x2a2a2e, [0.07, 0.07, 0.075], 10, { metal: 0.48, mud: 0.5 });
    }
    app.drawMat(prog, mesh, mat || _beltMat, model);
  }
}

global.V3D = {
  PI: PI, rad: rad, clamp: clamp, lerp: lerp, nearAng: nearAng,
  T: T, S: S, RX: RX, RY: RY, RZ: RZ,
  m4: m4, m4ident: m4ident, m4mul: m4mul, m4chain: m4chain,
  m4persp: m4persp, m4ortho: m4ortho, m4lookAt: m4lookAt, m4inv: m4inv,
  pt: pt, n3: n3,
  Geo: Geo, makeMesh: makeMesh, makeBeltMesh: makeBeltMesh, bindMesh: bindMesh,
  Node: Node, lin: lin, Mat: Mat, canvasTex: canvasTex, makeLabelTex: makeLabelTex,
  createApp: createApp,
  makeCylHelper: makeCylHelper,
  makeTubeHelper: makeTubeHelper,
  loft: function (geo, m, pts, opt) { return geo.loft(m, pts, opt); },
  buildBeltGeo: buildBeltGeo,
  drawBelt: drawBelt
};

})(window);
