/* 可视化公用脚本：矩阵渲染 + 分步演示器 + 行/列变换动画 */
(function (global) {
  'use strict';

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  /** 单元格内容：字符串→转义；{h:'...'} → 原生 HTML（用于算式） */
  function cellHtml(v) {
    if (v && typeof v === 'object' && v.h !== undefined) return v.h;
    return String(v).replace(/-/g, '−').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  /** 单元格是否为纯零 */
  function isZero(v) {
    if (v && typeof v === 'object') return v.zero === true;
    return v === 0 || v === '0';
  }

  function keySet(list) {
    var s = new Set();
    (list || []).forEach(function (p) { s.add(p[0] + ',' + p[1]); });
    return s;
  }

  /**
   * 渲染矩阵
   * @param {Array<Array>} rows 二维数组；单元格可以是数字/字符串，
   *                            也可以是 {h:'算式 HTML', v:'结果'} 这样的对象
   * @param {Object} opt
   *   aug     {number}  在第几列之后画竖线（0 表示第 1 列之后）
   *   pivot   [[r,c]]   主元高亮（绿色）
   *   hlRow   [r]       整行高亮（蓝色）
   *   target  [[r,c]]   即将处理的目标元（橙框）
   *   dim     [[r,c]]   淡化
   *   colHl   [c]       整列高亮
   *   calc    [[r,c]]   该格显示的是中间算式，用等宽字体并且不换行
   */
  function matrix(rows, opt) {
    opt = opt || {};
    var ncol = rows[0].length;
    var pivot = keySet(opt.pivot);
    var target = keySet(opt.target);
    var dim = keySet(opt.dim);
    var calc = keySet(opt.calc);
    var hlRow = new Set(opt.hlRow || []);
    var colHl = new Set(opt.colHl || []);
    var strike = keySet(opt.strike);
    var cells = '';
    rows.forEach(function (row, r) {
      row.forEach(function (v, c) {
        var cls = [];
        if (pivot.has(r + ',' + c)) cls.push('pivot');
        if (hlRow.has(r)) cls.push('hl-row');
        if (colHl.has(c)) cls.push('hl-col');
        if (target.has(r + ',' + c)) cls.push('target');
        if (dim.has(r + ',' + c)) cls.push('dim');
        if (calc.has(r + ',' + c)) cls.push('calc-cell');
        if (strike.has(r + ',' + c)) cls.push('struck');
        if (isZero(v)) cls.push('zero');
        if (opt.aug !== undefined && c === opt.aug + 1) cls.push('aug-bar');
        cells +=
          '<span class="' + cls.join(' ') + '" style="grid-row:' + (r + 1) +
          ';grid-column:' + (c + 1) + '">' + cellHtml(v) + '</span>';
      });
    });
    var cls = 'matrix' + (opt.bar ? ' matrix-bar' : '');
    return (
      '<span class="' + cls + '"><span class="bracket"></span>' +
      '<div class="cells" style="grid-template-columns:repeat(' + ncol + ',minmax(26px,auto))">' +
      cells + '</div><span class="bracket right"></span></span>'
    );
  }

  function arrow(label) {
    return '<span class="op-arrow">' + (label ? '<em>' + esc(label) + '</em>' : '') + ' &rarr;</span>';
  }

  /* =========================================================
     行变换的中间算式：把结果矩阵某一行的每一格写成
     "原值 ± k·源值 = 结果" 的形式
     用精确分数运算，避免出现 0.3333333 这种数字
     ========================================================= */

  /* ---- 分数 ---- */
  function gcd(a, b) {
    a = Math.abs(a); b = Math.abs(b);
    while (b) { var t = a % b; a = b; b = t; }
    return a || 1;
  }

  /** 是否是纯数字（含分数、小数、负号） */
  function isNumeric(x) {
    if (typeof x === 'number') return isFinite(x);
    if (x && typeof x === 'object') return x.n !== undefined;
    var s = String(x).replace(/−/g, '-').replace(/\s+/g, '').trim();
    return /^-?\d+(\/\d+)?$/.test(s) || /^-?\d*\.\d+$/.test(s);
  }

  /**
   * 解析成 {n, d}，d > 0。接受 2 / -2 / '−2' / '11/4' / '-1/2' / 0.5
   * 无法解析（符号表达式，如 'a'、'λ−3'）时返回 null
   */
  function frac(x) {
    if (x && typeof x === 'object' && x.n !== undefined) return x;
    var s = String(x).replace(/−/g, '-').replace(/\s+/g, '').trim();
    var m = /^(-?\d+)\/(\d+)$/.exec(s);
    if (m) {
      var n = parseInt(m[1], 10), d = parseInt(m[2], 10) || 1;
      if (d < 0) { n = -n; d = -d; }
      var g = gcd(n, d);
      return { n: n / g, d: d / g };
    }
    if (/^-?\d+$/.test(s)) return { n: parseInt(s, 10), d: 1 };
    if (/^-?\d*\.\d+$/.test(s)) {
      // 小数：用连分数逼近到分母 ≤ 1000
      var val = parseFloat(s);
      var sign = val < 0 ? -1 : 1;
      val = Math.abs(val);
      var h1 = 1, h0 = 0, k1 = 0, k0 = 1, b = val;
      for (var i = 0; i < 32; i++) {
        var a = Math.floor(b);
        var h2 = a * h1 + h0, k2 = a * k1 + k0;
        if (k2 > 1000) break;
        h0 = h1; h1 = h2; k0 = k1; k1 = k2;
        if (Math.abs(val - h1 / k1) < 1e-12) break;
        b = 1 / (b - a);
      }
      var nn = sign * h1, dd = k1 || 1;
      var g2 = gcd(nn, dd);
      return { n: nn / g2, d: dd / g2 };
    }
    return null;   // 符号表达式
  }

  /* ---- 表达式：数字走分数，符号一律原样保留 ---- */

  function fAdd(a, b) {
    var A = frac(a), B = frac(b);
    if (!A || !B) return null;
    var n = A.n * B.d + B.n * A.d, d = A.d * B.d, g = gcd(n, d);
    return { n: n / g, d: d / g };
  }
  function fMul(a, b) {
    var A = frac(a), B = frac(b);
    if (!A || !B) return null;
    var n = A.n * B.n, d = A.d * B.d, g = gcd(n, d);
    return { n: n / g, d: d / g };
  }
  function fNeg(a) {
    var A = frac(a);
    if (!A) return null;
    return { n: -A.n, d: A.d };
  }
  function fIsZero(a) { var A = frac(a); return !!A && A.n === 0; }
  function fIsOne(a) { var A = frac(a); return !!A && A.n === 1 && A.d === 1; }
  function fIsNeg(a) { var A = frac(a); return !!A && A.n < 0; }

  /** 显示：整数直接写，分数写 n/d，负号用 U+2212 */
  function fStr(a) {
    var A = frac(a);
    if (!A) return String(a).replace(/-/g, '\u2212');
    var s = A.d === 1 ? String(A.n) : (A.n + '/' + A.d);
    return s.replace(/-/g, '\u2212');
  }

  /** 显示任意值：数字走 fStr，符号原样（负号统一） */
  function show(a) {
    var A = frac(a);
    if (A) return fStr(a);
    return String(a).replace(/-/g, '\u2212');
  }

  /** 符号表达式在乘法里加括号 */
  function addParen(s) {
    var t = String(s).replace(/\u2212/g, '-');
    if (/^[A-Za-z\u0370-\u03ff\u4e00-\u9fa5][A-Za-z0-9\u0370-\u03ff\u4e00-\u9fa5]*$/.test(t)) return s;
    if (/^-?[A-Za-z\u0370-\u03ff\u4e00-\u9fa5][A-Za-z0-9\u0370-\u03ff\u4e00-\u9fa5]*$/.test(t)) return '(' + s + ')';
    if (/[+\-*/]/.test(t.replace(/^-/, ''))) return '(' + s + ')';
    if (/^-/.test(t)) return '(' + s + ')';
    return s;
  }

  /** 带括号（负数、符号表达式） */
  function fStrParen(a) {
    var A = frac(a);
    if (!A) return addParen(String(a).replace(/-/g, '\u2212'));
    if (A.d === 1) return A.n < 0 ? '(' + fStr(a) + ')' : String(A.n);
    return A.n < 0 ? '(' + fStr(a) + ')' : fStr(a);
  }

  /** 乘法项：k=±1 时省略系数 */
  function mulTerm(k, v) {
    var K = frac(k);
    if (K) {
      if (fIsOne(K)) return fStrParen(v);
      if (K.n === -1 && K.d === 1) return '\u2212' + fStrParen(v);
      return fStr(K) + '\u00b7' + fStrParen(v);
    }
    return addParen(String(k).replace(/-/g, '\u2212')) + '\u00b7' + fStrParen(v);
  }

  /** 构造 a ± k·b 的文本 */
  function makeExpr(p, k, s) {
    var pt = show(p);
    var K = frac(k);
    var kText, sign;
    if (K) {
      sign = fIsNeg(K) ? '\u2212' : '+';
      var absK = fIsNeg(K) ? fNeg(K) : K;
      kText = fIsOne(absK) ? '' : fStr(absK) + '\u00b7';
    } else {
      var raw = String(k).replace(/\s+/g, '').replace(/\u2212/g, '-');
      sign = /^-/.test(raw) ? '\u2212' : '+';
      kText = addParen(raw.replace(/^-/, '')).replace(/-/g, '−') + '·';
    }
    return pt + sign + kText + fStrParen(s);
  }

  /* ---- 轻量符号化简：把 a + q·b 化成 c0 + c1·a 的形式 ---- */

  /** 解析 "a"、"−a"、"a/2"、"−a/2"、"2−a/2"、"1/2" 这类简单表达式 → {terms:[[coef, name]]} 或 null */
  function parseLinear(str) {
    var t = String(str).replace(/\u2212/g, '-').replace(/\s+/g, '');
    if (!t) return null;
    // 切分成带符号的项
    var pieces = t.match(/[+-]?[^+-]+/g);
    if (!pieces) return null;
    var terms = [];
    for (var i = 0; i < pieces.length; i++) {
      var pc = pieces[i];
      var sign = 1;
      if (pc[0] === '+') pc = pc.slice(1);
      else if (pc[0] === '-') { sign = -1; pc = pc.slice(1); }
      if (!pc) return null;
      // 形如 3/4·a、a/2、2a、a、-a 等
      var m = /^(\d+(?:\/\d+)?)?\*?(?:([A-Za-z\u0370-\u03ff\u4e00-\u9fa5][A-Za-z0-9\u0370-\u03ff\u4e00-\u9fa5]*)(?:\/(\d+))?)?$/.exec(pc);
      if (!m) {
        // 带括号的复合项：(2-t)、(2-t)·1 等，展开后递归
        var pm = /^(\d+(?:\/\d+)?)?\*?\(([^()]+)\)$/.exec(pc);
        if (!pm) return null;
        var c1 = pm[1] ? frac(pm[1]) : { n: 1, d: 1 };
        if (!c1) return null;
        var inner = parseLinear(pm[2]);
        if (!inner) return null;
        inner.forEach(function (t) {
          terms.push([sign * c1.n * t[0] / c1.d, t[1]]);
        });
        continue;
      }
      var numPart = m[1], sym = m[2], den = m[3];
      if (!numPart && !sym) return null;
      if (!sym) {
        // 纯数字
        var c0 = frac(numPart);
        if (!c0) return null;
        terms.push([sign * c0.n / c0.d, '']);
      } else {
        var coef = numPart ? frac(numPart) : { n: 1, d: 1 };
        if (!coef) return null;
        var dd = den ? parseInt(den, 10) : 1;
        terms.push([sign * coef.n / (coef.d * dd), sym]);
      }
    }
    return terms;
  }

  /** 判断两串是否是同一符号 */
  function sameSym(a, b) { return a === b; }

  /**
   * 尝试对 p + k*b 做符号化简。
   * 返回 { text, ok } —— ok=false 表示化简失败，调用方应原样显示
   */
  /**
   * 展开 a + k·b，支持一元多项式（同一次数合并）。
   * 仅支持单变量、次数 ≤ 2 的简单情形；失败返回 null
   */
  function expandPoly(p, k, b) {
    var f = polyOf(p), g = polyOf(b), kk = polyOf(k);
    if (!f || !g || !kk) return null;
    if (kk.deg > 0) {
      // k 含变量：需要乘法
      var prod = polyMul(g, kk);
      if (!prod) return null;
      var sum = polyAdd(f, prod);
      return sum ? polyStr(sum) : null;
    }
    var scaled = polyScale(g, kk.c[0]);
    if (!scaled) return null;
    var sum2 = polyAdd(f, scaled);
    return sum2 ? polyStr(sum2) : null;
  }

  /** 解析成一元多项式 {c:[常数, 一次, 二次], deg:n, v:'t'}；失败 null */
  function polyOf(str) {
    var t = String(str).replace(/\u2212/g, '-').replace(/\s+/g, '');
    if (!t) return null;
    var pieces = t.match(/[+-]?[^+-]+/g);
    if (!pieces) return null;
    var c = [0, 0, 0], v = null, deg = 0;
    for (var i = 0; i < pieces.length; i++) {
      var pc = pieces[i], sign = 1;
      if (pc[0] === '+') pc = pc.slice(1);
      else if (pc[0] === '-') { sign = -1; pc = pc.slice(1); }
      if (!pc) return null;
      if (/^[\d./]+$/.test(pc)) {
        var q = frac(pc);
        if (!q) return null;
        c[0] += sign * q.n / q.d;
        continue;
      }
      // 变量项：a、2a、a/2、a^2
      var m = /^(\d+(?:\.\d+)?(?:\/\d+)?)?([A-Za-z\u0370-\u03ff\u4e00-\u9fa5])(?:(\^2)|\/(\d+))?$/.exec(pc);
      if (!m) return null;
      var coef = m[1] ? frac(m[1]) : { n: 1, d: 1 };
      if (!coef) return null;
      var name = m[2];
      if (v && v !== name) return null;
      v = name;
      var val = sign * coef.n / coef.d;
      if (m[3]) { c[2] += val; deg = Math.max(deg, 2); }
      else if (m[4]) { c[1] += val / parseInt(m[4], 10); deg = Math.max(deg, 1); }
      else { c[1] += val; deg = Math.max(deg, 1); }
    }
    return { c: c, deg: deg, v: v };
  }

  function polyScale(g, k) {
    return { c: [g.c[0] * k, g.c[1] * k, g.c[2] * k], deg: g.deg, v: g.v };
  }
  function polyAdd(f, g) {
    if (f.v && g.v && f.v !== g.v) return null;
    return {
      c: [f.c[0] + g.c[0], f.c[1] + g.c[1], f.c[2] + g.c[2]],
      deg: Math.max(f.deg, g.deg), v: f.v || g.v
    };
  }
  function polyMul(g, k) {
    if (g.deg + k.deg > 2) return null;
    var c = [0, 0, 0];
    for (var i = 0; i <= g.deg; i++) {
      for (var j = 0; j <= k.deg; j++) {
        if (i + j > 2) return null;
        c[i + j] += g.c[i] * k.c[j];
      }
    }
    return { c: c, deg: g.deg + k.deg, v: g.v || k.v };
  }

  /** 多项式转字符串：2t² − t + 3 */
  function polyStr(g) {
    var parts = [];
    for (var d = 2; d >= 0; d--) {
      var c = g.c[d];
      if (!c) continue;
      var lab = d === 0 ? '' : (d === 1 ? g.v : g.v + '²');
      var r = toFrac(c);
      var txt;
      if (!lab) txt = fmtNumStr(r.n / r.d);
      else if (r.n === 1 && r.d === 1) txt = lab;
      else if (r.n === -1 && r.d === 1) txt = '\u2212' + lab;
      else if (r.d === 1) txt = fmtNumStr(r.n) + lab;
      else if (r.n === 1) txt = lab + '/' + r.d;
      else if (r.n === -1) txt = '\u2212' + lab + '/' + r.d;
      else txt = fmtNumStr(r.n) + lab + '/' + r.d;
      if (parts.length && txt[0] !== '\u2212') parts.push('+');
      parts.push(txt);
    }
    return parts.length ? parts.join('') : '0';
  }

  function symbolicCombine(p, k, b) {
    var P = parseLinear(p), B = parseLinear(b);
    if (!P || !B) return null;
    var K = frac(k);
    var acc = {};
    function add(coef, sym) {
      var key = sym || '#';
      acc[key] = (acc[key] || 0) + coef;
    }
    P.forEach(function (t) { add(t[0], t[1]); });

    if (K) {
      // k 是数字：直接缩放 b 的每一项
      B.forEach(function (t) { add(t[0] * K.n / K.d, t[1]); });
    } else {
      // k 是符号表达式：k × b 需要符号乘数字，否则放弃
      var KT = parseLinear(k);
      if (!KT) return null;
      // k 必须只有一项（形如 -a/2），且 b 必须是纯数字
      if (KT.length !== 1 || KT[0][1] === '') return null;
      B.forEach(function (t) {
        if (t[1] !== '') return;   // b 含符号 → 会产生二次项，放弃
        add(KT[0][0] * t[0], KT[0][1]);
      });
    }
    // 检查是否有无法合并的复杂符号（多于 1 个不同的符号名）→ 放弃
    var syms = Object.keys(acc).filter(function (x) { return x !== '#'; });
    if (syms.length > 1) return null;

    var parts = [];
    var cst = acc['#'];
    syms.forEach(function (sym) {
      var c = acc[sym];
      if (!c) return;
      parts.push(fmtCoefSym(c, sym));
    });
    if (cst) parts.push(fmtNumStr(cst));
    if (!parts.length) return '0';
    // 拼接
    var text = parts[0];
    for (var i = 1; i < parts.length; i++) {
      var pt = parts[i];
      text += (pt[0] === '\u2212' ? '' : '+') + pt;
    }
    return text;
  }

  /** 系数×符号 的文本：1a → a，−1a → −a，1/2·a → a/2 */
  function fmtCoefSym(c, sym) {
    var r = toFrac(c);
    if (r.n === 0) return '0';
    if (r.d === 1) {
      if (r.n === 1) return sym;
      if (r.n === -1) return '\u2212' + sym;
      return fmtNumStr(r.n) + sym;
    }
    // 分数：a/2、−a/2、3a/2
    if (r.n === 1) return sym + '/' + r.d;
    if (r.n === -1) return '\u2212' + sym + '/' + r.d;
    return fmtNumStr(r.n) + sym + '/' + r.d;
  }

  /** 把浮点或分数转成 {n,d} */
  function toFrac(x) {
    if (typeof x === 'number') {
      if (Number.isInteger(x)) return { n: x, d: 1 };
      // 用连分数
      return frac(String(x)) || { n: x, d: 1 };
    }
    return frac(x) || { n: 0, d: 1 };
  }

  function fmtNumStr(x) {
    var r = toFrac(x);
    var str = r.d === 1 ? String(r.n) : (r.n + '/' + r.d);
    return str.replace(/-/g, '\u2212');
  }

  var fmtNum = show;

  /**
   * 第 target 行 += k × 源行
   * 能算算（分数精确），算不了（含符号）就保留表达式
   */
  function rowCalc(prev, src, k, opts) {
    opts = opts || {};
    var only = opts.calcCols;
    var out = [];
    for (var c = 0; c < prev.length; c++) {
      var p = prev[c], s = src[c];
      var res = fAdd(p, fMul(k, s));
      var useCalc = !only || only.indexOf(c) >= 0;
      if (!useCalc) { out.push(res === null ? makeExpr(p, k, s) : fStr(res)); continue; }

      var expr, resTxt;
      if (res !== null) {
        var K = frac(k);
        if (fIsZero(K)) expr = show(p);
        else {
          var sign = fIsNeg(K) ? '\u2212' : '+';
          expr = show(p) + sign + mulTerm(fIsNeg(K) ? fNeg(K) : K, s);
        }
        resTxt = fStr(res);
      } else {
        expr = makeExpr(p, k, s);
        var comb = symbolicCombine(p, k, s);
        resTxt = comb !== null ? comb : expandPoly(p, k, s);
      }
      out.push({
        h: '<span class="op">' + expr + '</span><span class="eq">=</span>' +
           '<span class="res">' + resTxt + '</span>',
        v: resTxt,
        zero: res !== null && res.n === 0,
        symbolic: res === null
      });
    }
    return out;
  }

  /** 某行整体乘 k 的算式 */
  function rowScaleCalc(prev, k, opts) {
    opts = opts || {};
    var only = opts.calcCols;
    var out = [];
    for (var c = 0; c < prev.length; c++) {
      var res = fMul(prev[c], k);
      var useCalc = !only || only.indexOf(c) >= 0;
      if (!useCalc) { out.push(res === null ? show(prev[c]) + '\u00d7' + fStrParen(k) : fStr(res)); continue; }
      var expr = show(prev[c]) + '\u00d7' + fStrParen(k);
      var resTxt;
      if (res !== null) resTxt = fStr(res);
      else {
        var comb = symbolicCombine('0', k, prev[c]);
        if (comb !== null) resTxt = comb;
        else {
          var K2 = frac(k), P2 = parseLinear(prev[c]);
          if (P2 && P2.length === 1 && K2) resTxt = fmtCoefSym(P2[0][0] * K2.n / K2.d, P2[0][1]);
          else resTxt = expr;
        }
      }
      out.push({
        h: '<span class="op">' + expr + '</span><span class="eq">=</span>' +
           '<span class="res">' + resTxt + '</span>',
        v: resTxt,
        zero: res !== null && res.n === 0,
        symbolic: res === null
      });
    }
    return out;
  }

/**
   * 把一行"算式单元格"还原成纯结果
   * plain(rowCalc(...)) → [0, '−1', 1, '−1']
   */
  function plain(row) {
    return row.map(function (x) {
      if (x && typeof x === 'object') return x.v !== undefined ? x.v : x.h;
      return x;
    });
  }

  /** 整张矩阵的去算式版本 */
  function plainAll(rows) {
    return rows.map(plain);
  }

  /* =========================================================
     行 / 列变换动画
     ========================================================= */

  var ANIM_ON = true;
  var CLR = {
    attention: '#fff8c5',
    attentionText: '#9a6700',
    accent: '#ddf4ff',
    accentText: '#0969da',
    rowHl: '#ddf4ff'
  };

  /** 把 cells 按行（或按列）分组 */
  function cellGroups(host, axis) {
    var groups = [];
    Array.prototype.forEach.call(host.children, function (c) {
      if (!c.style) return;
      if (c.className && String(c.className).indexOf('travel') >= 0) return;
      var g = parseInt(c.style.gridRow, 10);
      var col = parseInt(c.style.gridColumn, 10);
      if (isNaN(g) || isNaN(col)) return;
      var outer = axis === 'col' ? col - 1 : g - 1;
      var inner = axis === 'col' ? g - 1 : col - 1;
      if (!groups[outer]) groups[outer] = [];
      groups[outer][inner] = c;
    });
    return groups;
  }

  function rectOf(els) {
    var r = null;
    els.forEach(function (el) {
      if (!el || !el.getBoundingClientRect) return;
      var b = el.getBoundingClientRect();
      if (!r) {
        r = { left: b.left, top: b.top, right: b.right, bottom: b.bottom };
      } else {
        r.left = Math.min(r.left, b.left);
        r.top = Math.min(r.top, b.top);
        r.right = Math.max(r.right, b.right);
        r.bottom = Math.max(r.bottom, b.bottom);
      }
    });
    if (r) {
      r.width = r.right - r.left;
      r.height = r.bottom - r.top;
    }
    return r;
  }

  function animLabel(a) {
    if (a.label) return a.label;
    if (a.type === 'swap') return '互换';
    if (a.type === 'add') {
      var k = a.k;
      if (k === undefined || k === null) return '+';
      var abs = Math.abs(k);
      var sign = k < 0 ? '−' : '+';
      return sign + (abs === 1 ? '' : abs);
    }
    if (a.type === 'scale') return '×' + a.k;
    return '';
  }

  /** 清除某容器内残留的浮层与动画 */
  function clearAnim(root) {
    if (!root || !root.querySelectorAll) return;
    Array.prototype.forEach.call(root.querySelectorAll('.travel'), function (t) {
      if (t.remove) t.remove();
    });
    Array.prototype.forEach.call(root.querySelectorAll('.flash'), function (t) {
      if (t.__flashTimer) clearTimeout(t.__flashTimer);
      t.classList.remove('flash');
    });
  }

  /** 两组同时滑动到对方位置（交换） */
  function doSwap(box, host, axis, ga, gb) {
    if (!ga || !gb) return;
    var ra = rectOf(ga);
    var rb = rectOf(gb);
    if (!ra || !rb) return;
    var d = axis === 'col' ? rb.left - ra.left : rb.top - ra.top;
    var t = axis === 'col' ? 'translateX' : 'translateY';

    function slide(els, dist) {
      els.forEach(function (el) {
        if (!el || !el.animate) return;
        el.animate(
          [
            { transform: t + '(' + dist + 'px)', opacity: 0.35 },
            { transform: t + '(0px)', opacity: 1 }
          ],
          { duration: 400, easing: 'cubic-bezier(.2,.75,.2,1)' }
        );
      });
    }
    slide(ga, d);
    slide(gb, -d);
  }

  /** 复制源行列，滑到目标行列并标注系数 */
  function doAdd(box, host, axis, src, tgt, a) {
    if (!src || !tgt) return;
    var rs = rectOf(src);
    var rt = rectOf(tgt);
    if (!rs || !rt) return;
    var boxRect = box.getBoundingClientRect ? box.getBoundingClientRect() : { left: 0, top: 0 };

    var wrap = document.createElement('div');
    wrap.className = 'travel' + (axis === 'col' ? ' vertical' : '');
    wrap.style.left = (rs.left - boxRect.left) + 'px';
    wrap.style.top = (rs.top - boxRect.top) + 'px';
    wrap.style.flexDirection = axis === 'col' ? 'column' : 'row';
    wrap.style.gap = axis === 'col' ? '2px' : '10px';

    src.forEach(function (c) {
      if (!c) return;
      var cs = document.createElement('span');
      cs.className = 'tcell';
      cs.innerHTML = c.innerHTML;
      var cr = c.getBoundingClientRect ? c.getBoundingClientRect() : null;
      if (cr) {
        cs.style.width = cr.width + 'px';
        cs.style.height = cr.height + 'px';
        cs.style.lineHeight = cr.height + 'px';
      }
      wrap.appendChild(cs);
    });

    var tag = document.createElement('span');
    tag.className = 'k-tag';
    tag.textContent = animLabel(a);
    wrap.appendChild(tag);

    box.appendChild(wrap);

    var dx = axis === 'col' ? rt.left - rs.left : 0;
    var dy = axis === 'col' ? 0 : rt.top - rs.top;

    if (wrap.animate) {
      var an = wrap.animate(
        [
          { transform: 'translate(0,0)', opacity: 1 },
          { transform: 'translate(' + dx + 'px,' + dy + 'px)', opacity: 0.15 }
        ],
        { duration: 480, easing: 'cubic-bezier(.35,0,.4,1)' }
      );
      an.onfinish = function () { if (wrap.remove) wrap.remove(); };
    } else if (wrap.remove) {
      wrap.remove();
    }

    // 目标行列短暂加一层高亮（纯 class 切换，无过渡动画，避免晃眼）
    tgt.forEach(function (el) {
      if (!el || !el.classList) return;
      el.classList.add('flash');
      if (el.__flashTimer) clearTimeout(el.__flashTimer);
      el.__flashTimer = setTimeout(function () {
        el.classList.remove('flash');
      }, 700);
    });
  }

  /** 某行（列）整体缩放，表示乘/除以一个数 */
  function doScale(box, host, axis, grp, a) {
    if (!grp) return;
    var r = rectOf(grp);
    if (!r) return;
    var boxRect = box.getBoundingClientRect ? box.getBoundingClientRect() : { left: 0, top: 0 };

    var wrap = document.createElement('div');
    wrap.className = 'travel' + (axis === 'col' ? ' vertical' : '');
    wrap.style.left = (r.left - boxRect.left) + 'px';
    wrap.style.top = (r.top - boxRect.top) + 'px';
    wrap.style.flexDirection = axis === 'col' ? 'column' : 'row';
    wrap.style.gap = axis === 'col' ? '2px' : '10px';

    grp.forEach(function (c) {
      if (!c) return;
      var cs = document.createElement('span');
      cs.className = 'tcell';
      cs.innerHTML = c.innerHTML;
      var cr = c.getBoundingClientRect ? c.getBoundingClientRect() : null;
      if (cr) {
        cs.style.width = cr.width + 'px';
        cs.style.height = cr.height + 'px';
        cs.style.lineHeight = cr.height + 'px';
      }
      wrap.appendChild(cs);
    });

    var tag = document.createElement('span');
    tag.className = 'k-tag';
    tag.textContent = animLabel(a);
    wrap.appendChild(tag);
    box.appendChild(wrap);

    if (wrap.animate) {
      var an = wrap.animate(
        [{ transform: 'scale(1.16)', opacity: 1 }, { transform: 'scale(1)', opacity: 0 }],
        { duration: 540, easing: 'cubic-bezier(.3,0,.4,1)' }
      );
      an.onfinish = function () { if (wrap.remove) wrap.remove(); };
    } else if (wrap.remove) {
      wrap.remove();
    }

    grp.forEach(function (el) {
      if (!el || !el.classList) return;
      el.classList.add('flash');
      if (el.__flashTimer) clearTimeout(el.__flashTimer);
      el.__flashTimer = setTimeout(function () {
        el.classList.remove('flash');
      }, 700);
    });
  }

  function playAnim(stepEl, anim) {
    if (!ANIM_ON || !anim || !stepEl) return;
    var box = stepEl.querySelector('.matrix');
    var host = stepEl.querySelector('.matrix .cells');
    if (!box || !host) return;
    var list = Array.isArray(anim) ? anim : [anim];
    clearAnim(stepEl);

    var run = function () {
      list.forEach(function (a) {
        if (!a) return;
        var axis = a.axis === 'col' ? 'col' : 'row';
        var g = cellGroups(host, axis);
        try {
          if (a.type === 'swap') {
            doSwap(box, host, axis, g[a.a], g[a.b]);
          } else if (a.type === 'add') {
            doAdd(box, host, axis, g[a.source], g[a.target], a);
          } else if (a.type === 'scale') {
            doScale(box, host, axis, g[a.row], a);
          }
        } catch (e) { /* 动画失败不影响内容 */ }
      });
    };
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(run);
    else run();
  }

  /* =========================================================
     分步演示器
     ========================================================= */

  var ACTIVE = null;
  var ALL = [];

  function stepper(mount, steps, options) {
    options = options || {};
    var el = typeof mount === 'string' ? document.querySelector(mount) : mount;
    if (!el) return;
    var i = 0;

    el.innerHTML =
      '<div class="panel">' +
        '<div class="panel-head">' +
          '<span data-role="title">' + esc(options.title || '分步演示') + '</span>' +
          '<span class="hint" data-role="subtitle">' + esc(options.subtitle || '') + '</span>' +
          '<span style="flex:1"></span>' +
          '<span class="counter" data-role="counter"></span>' +
          '<span class="controls">' +
            '<button class="btn" data-role="prev">&larr; 上一步</button>' +
            '<button class="btn btn-primary" data-role="next">下一步 &rarr;</button>' +
            '<button class="btn" data-role="reset">从头开始</button>' +
          '</span>' +
        '</div>' +
        '<div class="panel-body">' +
          '<div class="progress"><i data-role="bar" style="width:0"></i></div>' +
          '<div data-role="view" class="steps"></div>' +
        '</div>' +
      '</div>';

    var view = el.querySelector('[data-role=view]');
    var counter = el.querySelector('[data-role=counter]');
    var bar = el.querySelector('[data-role=bar]');
    var prev = el.querySelector('[data-role=prev]');
    var next = el.querySelector('[data-role=next]');
    var reset = el.querySelector('[data-role=reset]');

    function render(prevIndex) {
      var s = steps[i];
      view.innerHTML =
        '<div class="step active">' +
          (s.title ? '<div class="step-title">' + s.title + '</div>' : '') +
          (s.op ? '<div class="op-line">' + s.op + '</div>' : '') +
          (s.html || '') +
          (s.note ? '<p class="why">' + s.note + '</p>' : '') +
        '</div>';
      counter.textContent = (i + 1) + ' / ' + steps.length;
      bar.style.width = ((i + 1) / steps.length) * 100 + '%';
      prev.disabled = i === 0;
      next.disabled = i === steps.length - 1;
      next.textContent = i === steps.length - 1 ? '已完成' : '下一步 →';

      // 只有向前走一步时才播放动画；直接跳转（重置/远程跳）不播
      if (s.anim && prevIndex !== undefined && i === prevIndex + 1) {
        playAnim(view.querySelector('.step.active'), s.anim);
      }
    }

    function go(n) {
      var old = i;
      i = Math.max(0, Math.min(steps.length - 1, n));
      render(old);
    }

    prev.addEventListener('click', function () { go(i - 1); });
    next.addEventListener('click', function () { go(i + 1); });
    reset.addEventListener('click', function () { i = 0; render(undefined); });

    el._go = go;
    el._step = function () { return i; };
    render(undefined);
    return el;
  }

  function pickActive() {
    var ae = document.activeElement;
    if (ae && ae.closest) {
      var p = ae.closest('.stepper');
      if (p && p._go) return p;
    }
    for (var i = 0; i < ALL.length; i++) {
      if (ALL[i].offsetParent !== null) return ALL[i];
    }
    return ACTIVE || ALL[0];
  }

  document.addEventListener('keydown', function (e) {
    if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
    var t = pickActive();
    if (!t || !t._go) return;
    if (e.key === 'ArrowRight') { t._go(t._step() + 1); e.preventDefault(); }
    if (e.key === 'ArrowLeft') { t._go(t._step() - 1); e.preventDefault(); }
  });

  document.addEventListener('click', function (e) {
    var p = e.target.closest ? e.target.closest('.stepper') : null;
    if (p && p._go) ACTIVE = p;
  });

  /* =========================================================
     真题题面块
     ========================================================= */
  /**
   * @param {Object} o
   *   src    '真题一 · 计算 3'   来源标识
   *   score  '10 分'             分值，可省
   *   body   题面 HTML（含公式与矩阵）
   */
  function exam(o) {
    return '<div class="exam">' +
      '<div class="bar"><span class="src">' + esc(o.src) + '</span>' +
      (o.qno ? '<span style="color:var(--fg-muted)">' + esc(o.qno) + '</span>' : '') +
      (o.score ? '<span class="score">' + esc(o.score) + '</span>' : '') +
      '</div>' +
      '<div class="q">' + (o.body || '') + '</div>' +
      '</div>';
  }

  global.Viz = {
    matrix: matrix,
    arrow: arrow,
    rowCalc: rowCalc,
    rowScaleCalc: rowScaleCalc,
    plain: plain,
    plainAll: plainAll,
    exam: exam,
    fmtNum: fmtNum,
    stepper: function (mount, steps, options) {
      var el = stepper(mount, steps, options);
      if (el && ALL.indexOf(el) === -1) ALL.push(el);
      return el;
    }
  };
})(window);
