const numberAndUnit = /^([+-]?(\d+(\.\d*)?|\.\d+)(e[+-]?\d+)?)([a-z%]*)$/i;
const transforms = /\)\s*,?\s*/;
const delimiter = /[\s,]+/;

const attr = (el, k, v) => v === undefined ? el.getAttribute(k) : el.setAttribute(k, v);
const svgEl = tag => document.createElementNS("http://www.w3.org/2000/svg", tag);
// Short local names for what the player calls often (the minifier shortens these, not globals)
const MATH = Math, isArray = Array.isArray, num = parseFloat, query = (sel) => document.querySelector(sel);
const rgba = v => `rgba(${v[0]},${v[1]},${v[2]},${v[3]})`;

const rad = d => ((d % 360) * MATH.PI) / 180;

const segmentParameters = { M: 2, C: 6, Z: 0 };

const pathHandlers = {
  M(c, p, p0) { p.x = p0.x = c[0]; p.y = p0.y = c[1]; return ['M', p.x, p.y]; },
  C(c, p) { p.x = c[4]; p.y = c[5]; return ['C', c[0], c[1], c[2], c[3], c[4], c[5]]; }
};

for (const ch of 'mc') {
  pathHandlers[ch] = (I => (c, p, p0) => {
    for (let j = 0; j < c.length; j++) c[j] += j % 2 ? p.y : p.x;
    return pathHandlers[I](c, p, p0);
  })(ch.toUpperCase());
}

const makeAbs = p => pathHandlers[p.segment[0]](p.segment.slice(1), p.p, p.p0);
const segComplete = p => p.segment.length && p.segment.length - 1 === segmentParameters[p.segment[0].toUpperCase()];

function newSeg(parser, token) {
  if (parser.inNumber) finNum(parser, false);
  const pathLetter = /[MC]/i.test(token);
  if (pathLetter) {
    parser.segment = [token];
  }

  parser.inSegment = true;
  return pathLetter;
}

function finNum(parser, inNumber) {
  if (!parser.inNumber) throw new Error('Parser Error');
  if (parser.number) parser.segment.push(parseFloat(parser.number));
  parser.inNumber = inNumber;
  parser.number = '';
  parser.pointSeen = false;
  parser.hasExponent = false;
  if (segComplete(parser)) finSeg(parser);
}

function finSeg(parser) {
  parser.inSegment = false;
  if (parser.absolute) parser.segment = makeAbs(parser);
  parser.segments.push(parser.segment);
}

function pathParse(d, toAbsolute = true) {
  let index = 0, token = '';
  const parser = {
    segment: [], inNumber: false, number: '', lastToken: '',
    inSegment: false, segments: [], pointSeen: false, hasExponent: false,
    absolute: toAbsolute, p0: new Point(), p: new Point()
  };

  while (parser.lastToken = token, token = d.charAt(index++)) {
    if (!parser.inSegment && newSeg(parser, token)) continue;

    if (token === '.') {
      if (parser.pointSeen || parser.hasExponent) { finNum(parser, false); --index; continue; }
      parser.inNumber = true; parser.pointSeen = true; parser.number += token; continue;
    }

    if (!isNaN(parseInt(token))) {
      if (parser.number === '0' || isArc(parser)) {
        parser.inNumber = true; parser.number = token; finNum(parser, true); continue;
      }
      parser.inNumber = true; parser.number += token; continue;
    }

    if (token === ' ' || token === ',') { if (parser.inNumber) finNum(parser, false); continue; }

    if (token === '-') {
      if (parser.inNumber && !isExponential(parser)) { finNum(parser, false); --index; continue; }
      parser.number += token; parser.inNumber = true; continue;
    }

    if (token.toUpperCase() === 'E') { parser.number += token; parser.hasExponent = true; continue; }

    if (/[MC]/i.test(token)) {
      if (parser.inNumber) finNum(parser, false);
      else if (!segComplete(parser)) throw new Error('parser Error');
      else finSeg(parser);
      --index;
    }
  }

  if (parser.inNumber) finNum(parser, false);
  if (parser.inSegment && segComplete(parser)) finSeg(parser);
  return parser.segments;
}

// A "-" right after an "e" is the exponent's sign, not a new number
function isExponential(parser) {
  return parser.lastToken.toUpperCase() === 'E';
}

function isArc(parser) {
  if (!parser.segment.length) return false;
  const len = parser.segment.length;
  return parser.segment[0].toUpperCase() === 'A' && (len === 4 || len === 5);
}

function pPath(d = 'M0 0') {
  if (Array.isArray(d)) d = Array.prototype.concat.apply([], d).toString();
  return pathParse(d);
}

function pPoly(array = [0, 0]) {
  const points = [];
  if (isArray(array)) array = Array.prototype.concat.apply([], array);
  else array = array.trim().split(delimiter).map(parseFloat);
  if (array.length % 2 !== 0) array.pop();
  for (let i = 0, len = array.length; i < len; i += 2) points.push([array[i], array[i + 1]]);
  return points;
}

function propSize(element, width, height, box) {
  if (width == null || height == null) {
    box = box || element.getBBox();
    if (width == null) width = box.width / box.height * height;
    else if (height == null) height = box.height / box.width * width;
  }
  return { width, height };
}

// Progress is always within 0-1 here (the player clamps it)
const easing = {
  bezier(x1, y1, x2, y2) {
    return t => 3 * t * (1 - t) ** 2 * y1 + 3 * t ** 2 * (1 - t) * y2 + t ** 3;
  },
  // Jumps at the end of each step (the only kind exports use)
  steps(steps) {
    return t => MATH.min(steps, MATH.max(0, MATH.floor(t * steps))) / steps;
  },
};

class SVGNumber {
  constructor(...args) { this.init(...args); }

  init(value, unit) {
    unit = isArray(value) ? value[1] : unit;
    value = isArray(value) ? value[0] : value;
    this.value = 0;
    this.unit = unit || "";

    if (typeof value === "number") {
      this.value = isNaN(value) ? 0 : !isFinite(value) ? value < 0 ? -3.4e38 : +3.4e38 : value;
    } else if (typeof value === "string") {
      const u = value.match(numberAndUnit);
      if (u) {
        this.value = num(u[1]);
        if (u[5] === "%") this.value /= 100;
        else if (u[5] === "s") this.value *= 1000;
        this.unit = u[5];
      }
    } else if (value instanceof SVGNumber) {
      this.value = value.valueOf();
      this.unit = value.unit;
    }
    return this;
  }

  toArray() { return [this.value, this.unit]; }

  toString() {
    return (this.unit === "%" ? ~~(this.value * 1e8) / 1e6
      : this.unit === "s" ? this.value / 1e3
      : this.value) + this.unit;
  }

  valueOf() { return this.value; }
}

class SVGArray extends Array {
  constructor(...args) { super(...args); this.init(...args); }
  clone() { return new this.constructor(this); }
  init(arr) {
    if (typeof arr === "number") return this;
    this.length = 0;
    this.push(...this.parse(arr));
    return this;
  }
  parse(array = []) {
    if (isArray(array)) return array;
    return array.trim().split(delimiter).map(parseFloat);
  }
  toArray() { return Array.prototype.concat.apply([], this); }
  toString() { return this.join(" "); }
  valueOf() { const ret = []; ret.push(...this); return ret; }
}

const typeOf = value => {
  const type = typeof value;
  if (type === "number") return SVGNumber;
  if (type === "string") {
    if (delimiter.test(value)) return SVGArray;
    if (numberAndUnit.test(value)) return SVGNumber;
    else return NonMorph;
  } else if (morphableTypes.indexOf(value.constructor) > -1) return value.constructor;
  else if (isArray(value)) return SVGArray;
};

class Ease {
  constructor(fn) { this.ease = easing[fn] || fn; }
  step(from, to, pos) {
    if (typeof from !== "number") return pos < 1 ? from : to;
    return from + (to - from) * this.ease(pos);
  }
}
 
function extend(modules, methods) {
  modules = isArray(modules) ? modules : [modules];
  for (let i = modules.length - 1; i >= 0; i--)
    for (const key in methods) modules[i].prototype[key] = methods[key];
}

function mkMorphable() {
  extend(morphableTypes, {
    to(val) { return new Morphable().type(this.constructor).from(this.toArray()).to(val); },
    fromArr(arr) { this.init(arr); return this; },
    toConsumable() { return this.toArray(); },
    morph(from, to, pos, stepper, context) {
      return this.fromArr(from.map((i, index) => stepper.step(i, to[index], pos, context[index], context)));
    },
  });
}

class Point {
  constructor(...args) { this.init(...args); }
  clone() { return new Point(this); }

  init(x, y) {
    const source = isArray(x) ? { x: x[0], y: x[1] }
      : typeof x === "object" ? { x: x.x, y: x.y }
      : { x, y };
    this.x = source.x ?? 0;
    this.y = source.y ?? 0;
    return this;
  }

  toArray() { return [this.x, this.y]; }
  transform(m) { return this.clone().txfmO(m); }

  txfmO(m) {
    if (!Matrix.isMx(m)) m = new Matrix(m);
    const { x, y } = this;
    this.x = m.a * x + m.c * y + m.e;
    this.y = m.b * x + m.d * y + m.f;
    return this;
  }
}

function mtxify(el) {
  return (attr(el, "transform") || "")
    .split(transforms).slice(0, -1)
    .map(str => { const kv = str.trim().split("("); return [kv[0], kv[1].split(delimiter).map(parseFloat)]; })
    .reverse()
    .reduce((matrix, t) => t[0] === "matrix" ? matrix.lmul(Matrix.fromArr(t[1])) : matrix[t[0]].apply(matrix, t[1]), new Matrix());
}

class Matrix {
  constructor(...args) { this.init(...args); }

  // The options the player passes: translate / tx / ty, scale / sx / sy, ro, and the pivot (ox, oy)
  static fmtTx(o) {
    const pick = (v, i, alt, def) => v?.length ? v[i] : isFinite(v) ? v : isFinite(alt) ? alt : def;
    const origin = new Point(o.ox, o.oy), translate = new Point(o.translate || o.tx, o.ty);
    return { sx: pick(o.scale, 0, o.sx, 1) * 1, sy: pick(o.scale, 1, o.sy, 1) * 1,
      theta: o.ro || 0, tx: translate.x, ty: translate.y, ox: origin.x, oy: origin.y };
  }

  static fromArr(a) { return { a: a[0], b: a[1], c: a[2], d: a[3], e: a[4], f: a[5] }; }

  static isMx(o) { return o.a != null || o.b != null || o.c != null || o.d != null || o.e != null || o.f != null; }

  static mxMul(l, r, o) {
    const a = l.a * r.a + l.c * r.b, b = l.b * r.a + l.d * r.b;
    const c = l.a * r.c + l.c * r.d, d = l.b * r.c + l.d * r.d;
    const e = l.e + l.a * r.e + l.c * r.f, f = l.f + l.b * r.e + l.d * r.f;
    o.a = a; o.b = b; o.c = c; o.d = d; o.e = e; o.f = f;
    return o;
  }

  clone() { return new Matrix(this); }

  dec(cx = 0, cy = 0) {
    const { a, b, c, d, e, f } = this;
    const det = a * d - b * c, ccw = det > 0 ? 1 : -1;
    const sx = ccw * MATH.sqrt(a * a + b * b);
    const thetaRad = MATH.atan2(ccw * b, ccw * a), theta = (180 / MATH.PI) * thetaRad;
    const ct = MATH.cos(thetaRad), st = MATH.sin(thetaRad);
    const lam = (a * c + b * d) / det;
    const sy = (c * sx) / (lam * a - b) || (d * sx) / (lam * b + a);
    const tx = e - cx + cx * ct * sx + cy * (lam * ct * sx - st * sy);
    const ty = f - cy + cx * st * sx + cy * (lam * st * sx + ct * sy);
    return { sx: sx, sy: sy, shear: lam, ro: theta, tx: tx, ty: ty,
      originX: cx, originY: cy, a: this.a, b: this.b, c: this.c, d: this.d, e: this.e, f: this.f };
  }

  init(source) {
    const base = Matrix.fromArr([1, 0, 0, 1, 0, 0]);
    source = source instanceof Element ? mtxify(source)
      : typeof source === "string" ? Matrix.fromArr(source.split(delimiter).map(parseFloat))
      : isArray(source) ? Matrix.fromArr(source)
      : typeof source === "object" && Matrix.isMx(source) ? source
      : typeof source === "object" ? new Matrix().transform(source)
      : arguments.length === 6 ? Matrix.fromArr([].slice.call(arguments))
      : base;
    this.a = source.a ?? base.a; this.b = source.b ?? base.b;
    this.c = source.c ?? base.c; this.d = source.d ?? base.d;
    this.e = source.e ?? base.e; this.f = source.f ?? base.f;
    return this;
  }

  lmul(matrix) { return this.clone().lmulO(matrix); }
  lmulO(matrix) {
    const l = matrix instanceof Matrix ? matrix : new Matrix(matrix);
    return Matrix.mxMul(l, this, this);
  }
  mulO(matrix) {
    const r = matrix instanceof Matrix ? matrix : new Matrix(matrix);
    return Matrix.mxMul(this, r, this);
  }
 
  rotO(r, cx = 0, cy = 0) {
    r = rad(r);
    const cos = MATH.cos(r), sin = MATH.sin(r), { a, b, c, d, e, f } = this;
    this.a = a * cos - b * sin; this.b = b * cos + a * sin;
    this.c = c * cos - d * sin; this.d = d * cos + c * sin;
    this.e = e * cos - f * sin + cy * sin - cx * cos + cx;
    this.f = f * cos + e * sin - cx * sin - cy * cos + cy;
    return this;
  }
 
  sclO(x, y = x, cx = 0, cy = 0) {
    if (arguments.length === 3) { cy = cx; cx = y; y = x; }
    const { a, b, c, d, e, f } = this;
    this.a = a * x; this.b = b * y; this.c = c * x; this.d = d * y;
    this.e = e * x - cx * x + cx; this.f = f * y - cy * y + cy;
    return this;
  }
 
  toArray() { return [this.a, this.b, this.c, this.d, this.e, this.f]; }
  toString() { return `matrix(${this.a},${this.b},${this.c},${this.d},${this.e},${this.f})`; }

  transform(o) {
    if (Matrix.isMx(o)) return new Matrix(o).mulO(this);
    const t = Matrix.fmtTx(o);
    const { x: ox, y: oy } = new Point(t.ox, t.oy).transform(this);
    return new Matrix().lmulO(this).txO(-ox, -oy).sclO(t.sx, t.sy).rotO(t.theta).txO(ox, oy).txO(t.tx, t.ty);
  }

  txO(x, y) { this.e += x || 0; this.f += y || 0; return this; }
}

const arrToStr = a => {
  let s = '';
  for (let i = 0, il = a.length; i < il; i++) {
    s += a[i][0];
    if (a[i][1] != null) {
      s += a[i][1];
      if (a[i][2] != null) {
        s += ' ' + a[i][2];
        if (a[i][3] != null) {
          s += ' ' + a[i][3] + ' ' + a[i][4];
          if (a[i][5] != null) {
            s += ' ' + a[i][5] + ' ' + a[i][6];
            if (a[i][7] != null) s += ' ' + a[i][7];
          }
        }
      }
    }
  }
  return s + ' ';
};



const sizingUtility = {
  el: null, width: null, height: null,
  size(el, width, height) {
    this.el = el; this.width = width; this.height = height;
    // The tag, not the id: Awa ids are "<type initial>-<hex>" ("r-1a2b..."), so
    // id.split('-')[1] was the hex part and no element ever resized
    const type = String(el.tagName || '').toLowerCase();
    if (type === 'ellipse') {
      this.el.designState = {
        cx: attr(el, 'cx'), cy: attr(el, 'cy'),
        rx: attr(el, 'rx'), ry: attr(el, 'ry')
      };
    }
    if (this[type]) this[type]();
  },
  ptsStr(p) { return p.map(pt => pt.join(',')).join(' '); },
  rect() {
    const p = propSize(this.el, this.width, this.height);
    attr(this.el, 'width', new SVGNumber(p.width));
    attr(this.el, 'height', new SVGNumber(p.height));
  },
  ellipse() {
    const _self = this;
    function width(w) {
      const ds = _self.el.designState;
      const prevCx = ds.cx || 0, prevRx = ds.rx || 0;
      const rx = w / 2;
      attr(_self.el, 'rx', rx); attr(_self.el, 'cx', (prevCx - prevRx) + rx);
    }
    function height(h) {
      const ds = _self.el.designState;
      const prevCy = ds.cy || 0, prevRy = ds.ry || 0;
      const ry = h / 2;
      attr(_self.el, 'ry', ry);
      attr(_self.el, 'cy', (prevCy - prevRy) + ry);
    }
    const p = propSize(this.el, this.width, this.height);
    width(new SVGNumber(p.width).value);
    height(new SVGNumber(p.height).value);
  },
  path() {
    const box = this.el.getBBox();
    box.width = box.width || 1; box.height = box.height || 1;
    const pathArray = pPath(attr(this.el, 'd'));
    const sx = (v, base) => (v - base.x) * this.width / base.width + base.x;
    const sy = (v, base) => (v - base.y) * this.height / base.height + base.y;
    for (let i = pathArray.length - 1; i >= 0; i--) {
      const l = pathArray[i][0];
      if (l === 'M') {
        pathArray[i][1] = sx(pathArray[i][1], box); pathArray[i][2] = sy(pathArray[i][2], box);
      }
      else if (l === 'C') {
        pathArray[i][1] = sx(pathArray[i][1], box); pathArray[i][2] = sy(pathArray[i][2], box);
        pathArray[i][3] = sx(pathArray[i][3], box); pathArray[i][4] = sy(pathArray[i][4], box);
        pathArray[i][5] = sx(pathArray[i][5], box); pathArray[i][6] = sy(pathArray[i][6], box);
      } 
    }
    attr(this.el, 'd', arrToStr(pathArray));
  },
  polygon() {
    const box = this.el.getBBox();
    const polygonArray = pPoly(attr(this.el, 'points'));
    for (let i = polygonArray.length - 1; i >= 0; i--) {
      if (box.width) polygonArray[i][0] = (polygonArray[i][0] - box.x) * this.width / box.width + box.x;
      if (box.height) polygonArray[i][1] = (polygonArray[i][1] - box.y) * this.height / box.height + box.y;
    }
    attr(this.el, 'points', this.ptsStr(polygonArray));
  },
  image() { this.rect(); }
};

function transform(el, o, relative, apply = false) {
  if (o == null || typeof o === "string") {
    const decomposed = new Matrix(el).dec();
    return o == null ? decomposed : decomposed[o];
  }
  const cleanRelative = relative === true ? el : relative || false;
  const result = new Matrix(cleanRelative).transform(o);
  return apply ? attr(el, "transform", result) : result;
}

class NonMorph {
  constructor(...args) {
    this.init(...args);
  }
  init(val) {
    this.value = val;
    return this;
  }
  toArray() {
    return [this.value];
  }
  valueOf() {
    return this.value;
  }
}


class Morphable {
  constructor(stepper) {
    const b = F.EASINGS.li;
    this._stepper = stepper || new Ease(easing.bezier(b[0], b[1], b[2], b[3]));
    this._from = this._to = this._type = this._context = this._morphObj = null;
  }

  at(pos) { return this._morphObj.morph(this._from, this._to, pos, this._stepper, this._context); }

  from(val) { if (val == null) return this._from; this._from = this._set(val); return this; }
  stepper(stepper) { this._stepper = stepper; return this; }
  to(val) { if (val == null) return this._to; this._to = this._set(val); return this; }
  type(type) { this._type = type; return this; }

  _set(value) {
    if (!this._type) this.type(typeOf(value));
    let result = new this._type(value);
    result = result.toConsumable();
    this._morphObj = this._morphObj || new this._type();
    this._context = this._context || Array.from({ length: result.length }, () => ({ done: true }));
    return result;
  }
}

const morphableTypes = [SVGNumber, Matrix, SVGArray, NonMorph];
mkMorphable();


class PathMorpher {
  constructor(segments = 128) {
    this.segments = segments;
    // Uses a hidden SVG path element to sample existing shapes
    this.sampler =  document.createElementNS("http://www.w3.org/2000/svg", "path");
  }
  // 1. Convert any path string into an array of [x, y] points
  sample(d) {
    if (!this.sampler) return [];
    attr(this.sampler, "d", d);
    const len = this.sampler.getTotalLength();
    return Array.from({ length: this.segments + 1 }, (_, i) => {
      const p = this.sampler.getPointAtLength((i / this.segments) * len);
      return [p.x, p.y];
    });
  }
  // 2. Shift points of shape B to minimize the distance to shape A (Prevents twisting)
  align(a, b) {
    const s = this.bestShift(a, b);
    return [...b.slice(s), ...b.slice(0, s)];
  }
  // Two paths of the same curves (one M, then only C, a closing Z allowed) morph curve by curve, as in
  // the editor (fluv.js createPathMorph): a closed one from the target's nearest starting curve
  sameMorph(d1, d2, dx, dy) {
    const nums = (d) => (d.match(/[+-]?\d*\.?\d+(?:e[+-]?\d+)?/gi) || []).map(Number);
    // Closed: a Z, or a last point back on M
    const closed = (d) => { const n = nums(d); return /z\s*$/i.test(d) || (Math.abs(n[n.length - 2] - n[0]) < 1e-6 && Math.abs(n[n.length - 1] - n[1]) < 1e-6); };
    const cubicOnly = (d) => {
      const c = d.match(/[a-z]/gi) || [];
      if (c[0] != "M" || c.length < 2) return false;
      const body = c.slice(1);
      if (body[body.length - 1].toUpperCase() == "Z") body.pop();
      return body.length > 0 && body.every((x) => x == "C") && nums(d).length == 2 + 6 * body.length;
    };
    if (!cubicOnly(d1) || !cubicOnly(d2) || closed(d1) != closed(d2)) return null;
    // The closing Z is a straight curve back to M, written out so it turns with the others
    const full = (d) => {
      const n = nums(d), lx = n[n.length - 2], ly = n[n.length - 1];
      if (!closed(d) || (Math.abs(lx - n[0]) < 1e-6 && Math.abs(ly - n[1]) < 1e-6)) return n;
      return [...n, lx + (n[0] - lx) / 3, ly + (n[1] - ly) / 3, lx + (2 * (n[0] - lx)) / 3, ly + (2 * (n[1] - ly)) / 3, n[0], n[1]];
    };
    const a = full(d1), b = full(d2).map((n, i) => n + (i % 2 ? dy : dx)); // the target moved by (dx, dy)
    if (a.length != b.length) return null;
    const count = (b.length - 2) / 6, ends = (n) => Array.from({ length: count }, (_, i) => [n[6 + i * 6], n[7 + i * 6]]);
    const shift = closed(d1) ? this.bestShift(ends(a), ends(b)) : 0;
    const to = shift ? [b[2 + ((shift - 1) % count) * 6 + 4], b[2 + ((shift - 1) % count) * 6 + 5]] : [b[0], b[1]];
    for (let i = 0; i < count; i++) to.push(...b.slice(2 + ((i + shift) % count) * 6, 8 + ((i + shift) % count) * 6));
    // A closed shape stays closed: without the Z the stroke has two open ends where it starts
    const z = closed(d1) ? "Z" : "";
    return (t) => {
      const v = a.map((x, i) => x + (to[i] - x) * t);
      let d = `M${v[0]},${v[1]}`;
      for (let i = 2; i < v.length; i += 6) d += `C${v[i]},${v[i + 1]} ${v[i + 2]},${v[i + 3]} ${v[i + 4]},${v[i + 5]}`;
      return d + z;
    };
  }
  bestShift(a, b) {
    let best = 0, min = Infinity;
    for (let s = 0; s < a.length; s++) {
      let dist = 0;
      for (let i = 0; i < a.length; i++) { const j = (i + s) % a.length; dist += (a[i][0] - b[j][0]) ** 2 + (a[i][1] - b[j][1]) ** 2; }
      if (dist < min) { min = dist; best = s; }
    }
    return best;
  }
  // 3. Generate the actual animation function
  // (dx, dy): the target moved (morph to shape: in place, see add)
  mkMorph(d1, d2, dx = 0, dy = 0) {
    const same = this.sameMorph(d1, d2, dx, dy);
    if (same) return same;
    const p1 = this.sample(d1);
    const p2 = this.align(p1, this.sample(d2).map(p => [p[0] + dx, p[1] + dy]));
    // Both closed: the morph is closed too (the alignment leaves the last sample one step short of the
    // first: an open path there showed a notch in the stroke)
    const closed = (d) => { const n = (d.match(/[+-]?\d*\.?\d+(?:e[+-]?\d+)?/gi) || []).map(Number); return /z\s*$/i.test(d) || (Math.abs(n[n.length - 2] - n[0]) < 1e-6 && Math.abs(n[n.length - 1] - n[1]) < 1e-6); };
    const z = closed(d1) && closed(d2) ? "Z" : "";

    // Returns a function that takes 't' (0 to 1)
    return (t) => {
      const interpolated = p1.map((p, i) => [
        p[0] + (p2[i][0] - p[0]) * t,
        p[1] + (p2[i][1] - p[1]) * t
      ]);

      // Create a smooth path string using simple Cubic Bezier segments
      return interpolated.reduce((path, p, i) => {
        if (i === 0) return `M${p[0]},${p[1]}`;
        const prev = interpolated[i - 1];
        // Automatic control point calculation for a smooth look
        const c1x = (prev[0] * 2 + p[0]) / 3, c1y = (prev[1] * 2 + p[1]) / 3;
        const c2x = (prev[0] + p[0] * 2) / 3, c2y = (prev[1] + p[1] * 2) / 3;
        return path + `C${c1x},${c1y} ${c2x},${c2y} ${p[0]},${p[1]}`;
      }, "") + z;
    };
  }
}

class PathReshaper {
  constructor() {
    this.commandsRegex = /([MC])([^MCZ]+)/gi; // a closing Z is not part of the last curve's numbers
    this._sampler = document.createElementNS("http://www.w3.org/2000/svg", "path");
  }

  _smplPath(d) {
    attr(this._sampler, "d", d);
    this._sampler.shapePoints = this.getCrvPts(d);
  }

  mkPt(x, y, cp0x = 0, cp0y = 0, cp1x = 0, cp1y = 0) {
    const cp0 = { x: cp0x, y: cp0y }, cp1 = { x: cp1x, y: cp1y };
    const point = { x, y, cp0, cp1 };
    cp0.ep = point; cp1.ep = point;
    return point;
  }

  getPtsFrmPathD(d) {
    const commands = d.match(this.commandsRegex) || [], points = [];
    let prev = null;
    for (const cmd of commands) {
      const type = cmd[0], nums = cmd.slice(1).trim().split(/[ ,]+/).map(Number);
      if (type === "M") {
        const point = this.mkPt(nums[0], nums[1], nums[0], nums[1], nums[0], nums[1]);
        points.push(point); prev = point;
      }
      if (type === "C") {
        for (let i = 0; i < nums.length; i += 6) {
          const [x1, y1, x2, y2, x, y] = nums.slice(i, i + 6);
          if (prev) { prev.cp1.x = x1; prev.cp1.y = y1; }
          const point = this.mkPt(x, y, x2, y2, x, y);
          points.push(point); prev = point;
        }
      }
    }
    return points;
  }

  render(points) {
    let pathString = "", pathStarted = false;
    for (let i = 0; i < points.length; i++) {
      const ep = points[i];
      if (!pathStarted) { pathString = `M${ep.x} ${ep.y}`; pathStarted = true; }
      if (i > 0) pathString += this.mkBez(points[i - 1], ep);
    }
    return pathString;
  }

  mkBez(prev_ep, ep) {
    return `C${prev_ep.cp1.x} ${prev_ep.cp1.y} ${ep.cp0.x} ${ep.cp0.y} ${ep.x} ${ep.y}`;
  }

  sameEndPt(p1, p2, eps = 0.001) { return Math.abs(p1.x - p2.x) < eps && Math.abs(p1.y - p2.y) < eps; }

  findPt(points1, points2) {
    for (let i = 0; i < points2.length; i++) {
      if (!points1.some(p => this.sameEndPt(p, points2[i])))
        return { added: points2[i], insertIndex: i, prevInsertIndex: i - 1, nextInsertIndex: i + 1 };
    }
    return null;
  }

  getCrvPts(d) {
    const commands = d.match(this.commandsRegex) || [], points = [];
    const STEPS = 150, step = 1 / STEPS;
    let currentX = 0, currentY = 0;
    for (const command of commands) {
      const type = command[0];
      const values = command.substring(1).trim().split(/[\s,]+/).map(parseFloat);
      if (type === "M") { currentX = values[0]; currentY = values[1]; }
      else if (type === "C") {
        const [x1, y1, x2, y2, x, y] = values;
        for (let t = 0; t <= 1; t += step) {
          points.push({
            x: currentX*(1-t)**3 + 3*x1*t*(1-t)**2 + 3*x2*t**2*(1-t) + x*t**3,
            y: currentY*(1-t)**3 + 3*y1*t*(1-t)**2 + 3*y2*t**2*(1-t) + y*t**3
          });
        }
        currentX = x; currentY = y;
      }
    }
    return points;
  }

  getPtRelIdx(h, p1, p2) {
    const sp = this._sampler.shapePoints;
    // The nearest sample from index f on: exact floats missed the curve's end (the samples stop just short of
    // t = 1), and a closed path's end is also its start (index 0): the split point landed far off the curve
    const find = (p, f = 0) => { let b = f; for (let i = f; i < sp.length; i++) if ((sp[i].x - p.x) ** 2 + (sp[i].y - p.y) ** 2 < (sp[b].x - p.x) ** 2 + (sp[b].y - p.y) ** 2) b = i; return b; };
    const s = find(p1);
    return (find(h, s) - s) / (find(p2, s + 1) - s);
  }

  splitBez(s, cp1, cp2, e, t = 0.5) {
    const B0 = [(1-t)*s.x+t*cp1.x, (1-t)*s.y+t*cp1.y];
    const B1 = [(1-t)*cp1.x+t*cp2.x, (1-t)*cp1.y+t*cp2.y];
    const B2 = [(1-t)*cp2.x+t*e.x, (1-t)*cp2.y+t*e.y];
    const B01 = [(1-t)*B0[0]+t*B1[0], (1-t)*B0[1]+t*B1[1]];
    const B12 = [(1-t)*B1[0]+t*B2[0], (1-t)*B1[1]+t*B2[1]];
    const B012 = [(1-t)*B01[0]+t*B12[0], (1-t)*B01[1]+t*B12[1]];
    return {
      newPoint: { ep: { x: B012[0], y: B012[1] }, cp0: { x: B01[0], y: B01[1] }, cp1: { x: B12[0], y: B12[1] } },
      startPoint: { cp: { x: B0[0], y: B0[1] } },
      endPoint: { cp: { x: B2[0], y: B2[1] } }
    };
  }

  reshape(path1, path2) {
    const points1 = this.getPtsFrmPathD(path1), points2 = this.getPtsFrmPathD(path2);
    const reshapedIdx = points2.length > points1.length ? 0 : 1;
    const keptIdx = 1 - reshapedIdx;
    const pointsToReshape = reshapedIdx === 0 ? points1 : points2;
    const pointsToKeep = keptIdx === 0 ? points1 : points2;
    const pathToKeep = keptIdx === 0 ? path1 : path2;
    const diff = this.findPt(pointsToReshape, pointsToKeep);

    if (!diff || points1.length === points2.length) return { 0: path1, 1: path2 };

    const { added, insertIndex, prevInsertIndex, nextInsertIndex } = diff;
    const start = pointsToKeep[prevInsertIndex], end = pointsToKeep[nextInsertIndex];
    const start_ = pointsToReshape[prevInsertIndex], end_ = pointsToReshape[insertIndex];
    // The added point is the first or the last one: no segment to split around it, the morph samples the paths
    if (!start || !end || !start_ || !end_) return { 0: path1, 1: path2 };

    this._smplPath(pathToKeep);
    const relIdx = this.getPtRelIdx(added, start, end);
    const result = this.splitBez(start_, start_.cp1, end_.cp0, end_, relIdx);
    const { newPoint, endPoint, startPoint } = result;

    const tPoint = this.mkPt(newPoint.ep.x, newPoint.ep.y, newPoint.cp0.x, newPoint.cp0.y, newPoint.cp1.x, newPoint.cp1.y);
    pointsToReshape.splice(insertIndex, 0, tPoint);
    pointsToReshape[prevInsertIndex].cp1.x = startPoint.cp.x;
    pointsToReshape[prevInsertIndex].cp1.y = startPoint.cp.y;
    pointsToReshape[nextInsertIndex].cp0.x = endPoint.cp.x;
    pointsToReshape[nextInsertIndex].cp0.y = endPoint.cp.y;

    return { [reshapedIdx]: this.render(pointsToReshape), [keptIdx]: pathToKeep };
  }
}

const pathMorpherIns = new PathMorpher();

class F {
  static __TRANSFORMS = ["tx","ty","an","sx","sy","ro","sk","sky"];
  static __SCALES = ["sx", "sy"];
  static __COLORS = { f: "f", st: "st" };
  static __SIZES = ["w", "h"];
  static __PATHS = { fp: "fp", mo: "mo", d: "d" };
  static __STROKE = { sw: "stroke-width", da: "stroke-dasharray", do: "stroke-dashoffset" };
  static __EFFECTS = { "ex": "ex", "ey": "ey", "eb": "eb", "ec": "ec" };

  static EASINGS = {
    li:   [0.0,0.0,1.0,1.0],
    iq:   [0.55,0.085,0.68,0.53],   oq:   [0.25,0.46,0.45,0.94],    ioq:  [0.455,0.03,0.515,0.955],
    ic:   [0.55,0.055,0.675,0.19],  oc:   [0.215,0.61,0.355,1.0],   ioc:  [0.645,0.045,0.355,1.0],
    iq4:  [0.895,0.03,0.685,0.22],  oq4:  [0.165,0.84,0.44,1.0],    ioq4: [0.77,0.0,0.175,1.0],
    iq5:  [0.755,0.05,0.855,0.06],  oq5:  [0.23,1.0,0.32,1.0],      ioq5: [0.86,0.0,0.07,1.0],
    is:   [0.47,0.0,0.745,0.715],   os:   [0.39,0.575,0.565,1.0],   ios:  [0.445,0.05,0.55,0.95],
    ie:   [0.95,0.05,0.795,0.035],  oe:   [0.19,1.0,0.22,1.0],      ioe:  [1.0,0.0,0.0,1.0],
    ir:   [0.6,0.04,0.98,0.335],    or:   [0.075,0.82,0.165,1.0],   ior:  [0.785,0.135,0.15,0.86],
    iel:  [0.47,-0.03,0.745,0.715], oel:  [0.39,0.575,0.565,1.425], ioel: [0.68,-0.55,0.265,1.55],
    ib:   [0.6,-0.28,0.735,0.045],  ob:   [0.175,0.885,0.32,1.275], iob:  [0.68,-0.55,0.265,1.55],
  }

  static utils = {
    // Dash lists, as the editor (fluv.js): "10 5" / [10, 5] -> 4 numbers >= 0 (dash, gap, dash, gap),
    // 6 for an imported 3-value list, or null when solid ("none", "0", empty)
    dashList(v) {
      const a = (isArray(v) ? [...v] : String(v ?? "").trim().split(delimiter)).map(num).filter(n => isFinite(n) && n >= 0);
      if (!a.some(n => n > 0)) return null;
      if (a.length === 1) return [a[0], a[0], a[0], a[0]];
      if (a.length === 2) return [...a, ...a];
      if (a.length === 3) return [...a, ...a]; // imported only: SVG doubles it (6 values)
      return a.slice(0, 4);
    },
    // Two lists of the same length that look as they should at both ends: solid = each dash as long as its
    // dash + gap (the gaps open from 0), repeated (not padded) to a common length so the pattern doesn't change
    matchDashes(from, to) {
      const solidLike = a => a.map((n, i) => (i % 2 ? 0 : n + a[i + 1]));
      if (!from && !to) return [[0], [0]];
      from = from || solidLike(to);
      to = to || solidLike(from);
      const gcd = (a, b) => (b ? gcd(b, a % b) : a);
      const len = (from.length * to.length) / gcd(from.length, to.length);
      const rep = a => Array.from({ length: len }, (_, i) => a[i % a.length]);
      return [rep(from), rep(to)];
    },
    // The length of one dash list (dash + gap + ...)
    // The list written: rounded, >= 0, and in its shortest form that draws the same (SVG repeats a dash list):
    // "5 5 5 5" -> "5", "20 10 20 10" -> "20 10", as the editor
    dashString(v) {
      const a = [...v].map(n => +MATH.max(0, n).toFixed(2));
      const p = a.findIndex((_, i) => i && a.length % i == 0 && a.every((n, j) => n == a[j % i]));
      return (p > 0 ? a.slice(0, p) : a).join(" ");
    },
    dashPeriod(v) {
      return (F.utils.dashList(v) || [0]).reduce((s, n) => s + n, 0);
    },
    // An element's design skew, from its "skew" attribute ("x pivotY [y pivotX]"): { x, y, px, py }
    skewOf(el) { const [x, py, y, px] = String(attr(el, "skew") ?? "").trim().split(/[\s,]+/).map(Number), n = v => isFinite(v) ? v : 0; return { x: n(x), y: n(y), px: n(px), py: n(py) }; },
    // The matrix without its innermost (local) skew: skewY then skewX around (px, py)
    unskew(m, s) { const tx = MATH.tan(rad(s.x || 0)), ty = MATH.tan(rad(s.y || 0)); return new Matrix(m).mulO(new Matrix(1, -ty, -tx, 1 + tx * ty, tx * s.py, ty * s.px - tx * ty * s.py)); },
    // The matrix with its innermost (local) skew moved from `from` to `to`
    reskew(m, from, to) { const tx = MATH.tan(rad(to.x || 0)), ty = MATH.tan(rad(to.y || 0)); return F.utils.unskew(m, from).mulO(new Matrix(1 + tx * ty, ty, tx, 1, -(tx * ty * to.px + tx * to.py), -ty * to.px)); },
    // An element's rotation, read without its skew (a skew Y tilts the x basis dec() reads)
    rotOf(el) { return (el._sk?.y ? F.utils.unskew(new Matrix(el), el._sk) : new Matrix(el)).dec().ro; },
    // Every shape has getTotalLength in today's browsers (the old per-shape fallbacks read el.type, which SVG elements don't have)
    getTotLen(el) { return el.getTotalLength && el.getTotalLength(); },
    
    // A path hidden by its layer's eye (display: none) still guides: Chrome gives it no CTM of its own (its
    // parent's, without its transform), so the hidden part's transforms are multiplied in
    ctmOf(node) {
      let top = null;
      for (let n = node; n && n.nodeType == 1 && n !== node.ownerSVGElement; n = n.parentNode) if (getComputedStyle(n).display == "none") top = n;
      if (!top) return node.getCTM();
      const chain = [];
      for (let n = node; ; n = n.parentNode) { chain.unshift(n); if (n === top) break; }
      let m = top.parentNode.getCTM ? top.parentNode.getCTM() : node.ownerSVGElement.createSVGMatrix();
      chain.forEach((n) => { const t = n.transform && n.transform.baseVal.consolidate(); if (t) m = m.multiply(t.matrix); });
      return m;
    },

    buildLUT(pathNode, samples = 1000) {
      const svgRoot = pathNode.ownerSVGElement;
      const ctm = this.ctmOf(pathNode);
      const totalLen = this.getTotLen(pathNode);

      const lut = Array.from({ length: samples + 1 }, (_, i) => {
        const sp = svgRoot.createSVGPoint();
        const local = pathNode.getPointAtLength((i / samples) * totalLen);
        sp.x = local.x; sp.y = local.y;
        return sp.matrixTransform(ctm);
      });

      const arcLengths = lut.reduce((acc, p, i) => {
        if (i === 0) return [0];
        const dx = p.x - lut[i-1].x, dy = p.y - lut[i-1].y;
        return [...acc, acc[i-1] + MATH.sqrt(dx*dx + dy*dy)];
      }, []);

      return { lut, arcLengths, total: arcLengths.at(-1) };
    },

    sampleLUT({ lut, arcLengths, total }, t) {
      const target = MATH.max(0, MATH.min(1, t)) * total;
      let lo = 0, hi = lut.length - 1;
      while (lo < hi - 1) {
        const mid = (lo + hi) >> 1;
        arcLengths[mid] < target ? lo = mid : hi = mid;
      }
      const alpha = (target - arcLengths[lo]) / (arcLengths[hi] - arcLengths[lo] || 1);
      return {
        x: lut[lo].x + (lut[hi].x - lut[lo].x) * alpha,
        y: lut[lo].y + (lut[hi].y - lut[lo].y) * alpha,
      };
    },

    followVal(tween, progress) {
      const el = tween.el;
      const runner = tween.runner, path = runner.followedPath;
      const {cd, rd} = runner.p;

      const svgRoot = path.ownerSVGElement;
      // Sample two adjacent points in screen space for tangent
      const STEP = 0.001;
      const p0 = this.sampleLUT(runner.lutData, progress - STEP);
      const p1 = this.sampleLUT(runner.lutData, progress + STEP);
      // Current point
      const screenPt = this.sampleLUT(runner.lutData, progress);

      // Angle in screen space
      let angle = MATH.atan2(p1.y - p0.y, p1.x - p0.x) * 180 / MATH.PI;
    
      // Convert screen → parent local space
      const targetParent = el.parentNode;
      const parentCTM = targetParent.getCTM();

      const sp = svgRoot.createSVGPoint();
      sp.x = screenPt.x;
      sp.y = screenPt.y;

      const p = sp.matrixTransform(parentCTM.inverse())

      // Subtract parent's own rotation from screen angle
      // so the element ros relative to its parent space, not screen
      if (rd && parentCTM) {
        const parentAngle = MATH.atan2(parentCTM.b, parentCTM.a) * 180 / MATH.PI;
        angle = angle - parentAngle;
      }

      return { x: p.x, y: p.y, angle, rd, cd};
    },
 
    cssGrad(el) {
      const isRadial = el.tagName === "radialGradient";
      const toPercent = v => v.includes("%") ? v : num(v) * 100 + "%";

      const stops = Array.from(el.querySelectorAll("stop")).map(s => {
        const offset = toPercent(attr(s, "offset") || "0");
        return `${attr(s, "stop-color") || "rgba(0,0,0,1)"} ${offset}`;
      }).join(", ");

      if (isRadial) return `radial-gradient(circle, ${stops})`;

      const [x1, y1, x2, y2] = ["x1","y1","x2","y2"].map(k => num(attr(el, k) || 0));
      const angle = ((MATH.atan2(y2 - y1, x2 - x1) * 180) / MATH.PI + 90) % 360;
      return `linear-gradient(${angle.toFixed(0)}deg, ${stops})`;
    },
    isText(_el) { return _el.nodeName === "text"; },
    isMedia(_el) { return attr(_el, 'id').split('-')[1] === 'image'; },
    isGradient(_colorString) { return _colorString.includes && _colorString.includes("%"); },
    fmtGrad(initialColor, targetColor) {
      const rgbaRegex = /rgba?(\(\s*\d+\s*,\s*\d+\s*,\s*\d+)(?:\s*,.+?)?\)/g;

      if (this.isGradient(targetColor) && !this.isGradient(initialColor))
        initialColor = targetColor.toLowerCase().replaceAll(rgbaRegex, initialColor);
      else if (this.isGradient(initialColor) && !this.isGradient(targetColor))
        targetColor = initialColor.toLowerCase().replaceAll(rgbaRegex, targetColor);

      return { initialColor, targetColor };
    },
    getGradVals(s) {
      const [type] = s.split("-gradient");
      const inner = s.split("gradient(")[1].split("%)")[0].toLowerCase() + "%";
      const [anglePart, ...stops] = inner.split(", rgba");
      return {
        type,
        angle: anglePart.split("deg")[0],
        values: stops.map(s => ({
          color:  "rgba" + s.split(") ")[0] + ")",
          offset: s.split(") ")[1]
        }))
      };
    },
    gradDToArr(data) {
      const { angle, values } = data;
      let arr = [parseInt(angle)];
      for (const { color, offset } of values) {
        arr = [...arr, ...this.rgbaToArr(color), parseInt(offset)];
      }
      return arr;
    },
    // rgb(a) or hex. Alpha is a fraction (parseInt made 0.5 -> 0, and rgb() -> NaN)
    // A tween from / to "none": that end is the other end's color(s), fully transparent (it fades, as the editor)
    noneAsTransparent(from, to) {
      const none = c => c == null || String(c).trim() == "none";
      const clear = c => F.utils.isGradient(c)
        ? String(c).replace(/rgba?\(([^,()]+),([^,()]+),([^,()]+)(?:,[^()]*)?\)/g, "rgba($1,$2,$3,0)")
        : rgba([...F.utils.rgbaToArr(c).slice(0, 3), 0]);
      if (none(from) && none(to)) return ["rgba(0,0,0,0)", "rgba(0,0,0,0)"];
      return [none(from) ? clear(to) : from, none(to) ? clear(from) : to];
    },
    rgbaToArr(color) {
      color = String(color || "").trim();
      if (color[0] === "#") {
        let h = color.slice(1);
        if (h.length === 3 || h.length === 4) h = h.split("").map(c => c + c).join("");
        const n = i => parseInt(h.slice(i, i + 2), 16);
        return [n(0), n(2), n(4), h.length === 8 ? n(6) / 255 : 1];
      }
      const rgba = color.replace(/^rgba?\(|\s+|\)$/g, "").split(",");
      const a = num(rgba[3]);
      return [parseInt(rgba[0]) || 0, parseInt(rgba[1]) || 0, parseInt(rgba[2]) || 0, isFinite(a) ? a : 1];
    },
    parseGradArr(data) {
      const angle = data[0], stops = [];
      for (let i = 1; i < data.length; i += 5)
        stops.push({ color: `rgba(${data[i]},${data[i+1]},${data[i+2]},${data[i+3]})`, offset: data[i+4] });
      return { angle, stops };
    },
    // The gradient a color step is drawn with (linear: by its angle; radial: centred)
    setGradEl(el, ghost, baseColorType = null, gradientType = null, gradientAngle = null, stopPoints = null) {
      const id = `${attr(el, "id")}-gr-i-${baseColorType}`;
      query(`#${id}`)?.remove();
      const g = svgEl(gradientType + "Gradient");
      let at = { cx: "50%", cy: "50%", r: "50%", fx: "50%", fy: "50%" };
      if (gradientType === "linear") {
        const r = ((parseInt(gradientAngle) + 90) * MATH.PI) / 180;
        at = { x1: 0.5 + 0.5 * MATH.cos(r), y1: 0.5 + 0.5 * MATH.sin(r), x2: 0.5 - 0.5 * MATH.cos(r), y2: 0.5 - 0.5 * MATH.sin(r) };
      }
      at = { id, gradientUnits: "objectBoundingBox", spreadMethod: "pad", ...at };
      for (const k in at) if (at[k]) attr(g, k, at[k]);
      for (const s of stopPoints) {
        const stop = svgEl("stop");
        attr(stop, "offset", `${s.offset.toFixed(2)}%`);
        attr(stop, "stop-color", s.color);
        g.appendChild(stop);
      }
      el.ownerSVGElement.querySelector("defs").appendChild(g);
      attr(el, baseColorType === "f" ? "fill" : "stroke", `url(#${id})`);
    },
    // An image element's pattern, fitted to cover it, from the element's size (the player passes it). Without one
    // there is nothing to fit: Pofton never writes an exact 0 (sizes are kept >= 1e-5)
    updateImg(el, iw = null, ih = null) {
      if (!iw || !ih) return;
      const pattern = query(`#${attr(el, 'id')}-p-bg`), img = pattern.firstChild;
      const x = num(attr(el, 'x')), y = num(attr(el, 'y')), { width: w, height: h } = el.getBBox();
      const k = iw > ih ? h / ih : w / iw;
      [[pattern, { width: iw, height: ih, x: x + (w - iw * k) / 2, y: y + (h - ih * k) / 2 }], [img, { width: iw, height: ih, transform: `scale(${k})` }]]
        .forEach(([node, o]) => { for (const key in o) attr(node, key, o[key]); });
    }
  };

  constructor(options = {}) {
    this.animations = [];
    this._allTweens = [];
    this.config = {
      loop: options.loop || false,
      onUpdate: options.update || null,
      onComplete: options.complete || null,
    };
    this.maxDuration = 0;
    this.lastElapsed = 0;
    this.rafId = null;
    this.isPlaying = false;
    this.dirtyProperties = new Set();
  }

  add(data) {
    data = this._reorder(data);
    const elements = document.querySelectorAll(data.t) ?? [];
    const hasTransforms = this._objectHasProps(data, F.__TRANSFORMS);
    const hastx = this._objectHasProps(data, ["tx"]);

    elements.forEach((el, i) => {
      const ghost = el.cloneNode();
      ghost._bbox = el.getBBox();
      ghost.getBBox = () => ghost._bbox;

      let dataAnchor = attr(el, 'anchor');
      dataAnchor = dataAnchor?.replace(/(\w+)\s*:/g, '"$1":');
      const an = dataAnchor ? [JSON.parse(dataAnchor).x, JSON.parse(dataAnchor).y] : [0.5, 0.5];
      ghost._anchor = an;
      ghost._skew = ghost._sk = F.utils.skewOf(el); // the design skew in the start matrix (_sk: the one in it now)

      const tId = attr(el, "id");
      // Its mask, when it is a mask source: the editor names it "<id>-m-" (MASK__BASE_ID)
      ghost._maskEl = query(`#${tId}-m-`);
      ghost._transalterersStates = {};

      if (hasTransforms && !hastx) {
        data.tx = [{}]; // holds the position: its old value / duration keys were never read (steps use v / d)
        data = this._reorder(data);
        ghost._statictx = true;
      }

      const item = { el, t: data.t, _ghost: ghost, animatables: {} };

      for (const prop in data) {
        if (prop === "t" || !data[prop] || !isArray(data[prop])) continue;
        item.animatables[prop] = [];
        let startValue = this._initState(el, prop, ghost);
        // Rotation and scales read from the matrix without its skew (a skew Y tilts its x basis)
        if ((prop === "ro" || prop === "sx" || prop === "sy") && ghost._skew.y) startValue = F.utils.unskew(startValue, ghost._skew);
        let startAnchor = ghost._anchor, startRo = null; // ro: the previous key's angle
        const steps = data[prop];

        steps?.forEach((step, j) => {

          const value = step.v;
          const g = step.s;

          const timings = isArray(g)
            ? this._calcStagger(step.w || 0, g, elements.length, i, step.d)
            : [step.w || 0, 0];

          // Add global timeline delay
          const stepDuration = step.d - timings[1];

          let runner = new Morphable();
          if (!(prop in F.__COLORS)) runner.from(startValue);
          runner.p = step.p;
          let finalValue = value;

          if (prop === "sk" || prop === "sky") startValue = value; // a plain angle, applied inside the matrix (skTransformer)
          else if (F.__TRANSFORMS.includes(prop)) {
            // (for an anchor startValue is the previous [x, y] key, not a matrix: val isn't used there)
            let val = value - (startValue.dec?.() || startValue)[prop];
            if (prop === "tx" || prop === "ty") {
              const dx = prop === "tx" ? val : 0, dy = prop === "ty" ? val : 0;
              finalValue = startValue.clone().transform({ translate: [dx, dy] }, true);
              if (prop === "ty") ghost._transalterersStates[prop] = value;
            } else {
              if (prop === "an") { runner = new Morphable(); runner.from(startAnchor); }
              else {
                if (prop === "sx" || prop === "sy") val = value / startValue.dec()[prop];
                finalValue = startValue.clone().transform({ [prop]: val }, true);
                // Rotation tweens its angle, as the editor: matrices blended entry by entry turned 0 -> 180 into a
                // jump, 360 into nothing. From the start pose's angle, then each key's
                if (prop === "ro") { runner = new Morphable(); runner.from(startRo ?? startValue.dec().ro); runner.toRo = Number(value) || 0; startRo = runner.toRo; }
              }
              ghost._transalterersStates[prop] = value;
            }
            startValue = finalValue; startAnchor = value;
          } else if (prop in F.__COLORS) {

            const finalValueTmp = finalValue;
            // "none" (no color): the other end's color made transparent; ending on it writes "none"
            const toNone = String(finalValue).trim() == "none";
            [startValue, finalValue] = F.utils.noneAsTransparent(startValue, finalValue);
            if (F.utils.isGradient(finalValue)) {
              runner = new Morphable();
              const formatted = F.utils.fmtGrad(startValue, finalValue);
              const initGrad = F.utils.gradDToArr(F.utils.getGradVals(formatted.initialColor));
              const finalGrad = F.utils.getGradVals(formatted.targetColor);
              finalValue = F.utils.gradDToArr(finalGrad).toLocaleString();
              runner.from(initGrad.toLocaleString());
              runner.gradientType = finalGrad.type;
            } else {
              runner.from(F.utils.rgbaToArr(startValue));
              finalValue = F.utils.rgbaToArr(finalValue);
            }
            runner.toNone = toNone;

            startValue = finalValueTmp;

          } else if (prop === "da") {
            runner = new Morphable();
            // Same number of items, same look at both ends; decimals kept, "none" handled as solid
            [startValue, finalValue] = F.utils.matchDashes(F.utils.dashList(startValue), F.utils.dashList(finalValue));
            runner.from(startValue);
          } else if (prop === "mo") {
            const toPathSelector = finalValue;
            const fromPath = step.p?.rp ? attr(el, "d") : isArray(startValue) ? startValue.toString() : startValue;
            const toPathEl = query(toPathSelector);
            if (!toPathEl) return;
            runner.fromPath = { d: fromPath };
            // In place, as the editor: the target's centre on the element's (it was meant to be: the move
            // was made on a detached clone, which has no box, and its result was never used)
            const sb = el.getBBox(), tb = toPathEl.getBBox();
            const dx = sb.x + sb.width / 2 - tb.x - tb.width / 2, dy = sb.y + sb.height / 2 - tb.y - tb.height / 2;
            runner.interpolator = pathMorpherIns.mkMorph(runner.fromPath.d, attr(toPathEl, "d"), dx, dy);
            runner.toPath = { d: runner.interpolator(1) }; // the end shape as drawn: the next key starts from it
            finalValue = runner.toPath.d;
          } else if (prop === "d") {
            startValue = isArray(startValue) ? startValue.toString() : startValue;
            const reshapResult = new PathReshaper().reshape(startValue, finalValue);
            runner.interpolator = pathMorpherIns.mkMorph(reshapResult[0], reshapResult[1]);
          } else if (prop === "fp") {
            const followedPath = query(finalValue);
            if (!followedPath) return;
            const pathTotalLen = F.utils.getTotLen(followedPath);

            // Position along the path (0-1) reached by this keyframe.
            const reversed = !!step.p?.vd;
            const hasProgress = step.p?.pg != null && isFinite(Number(step.p.pg));
            const endProgress = hasProgress ? MATH.max(0, MATH.min(1, Number(step.p.pg))) : 1;

            // Continue from the previous keyframe on the same path so their
            // spacing controls the speed along it.
            const previousStep = j > 0 ? steps[j - 1] : null;
            const previousProgress = hasProgress && previousStep
              && previousStep.v == step.v
              && (!!previousStep.p?.vd) == reversed
              && previousStep.p?.pg != null
              && isFinite(Number(previousStep.p.pg))
              ? MATH.max(0, MATH.min(1, Number(previousStep.p.pg)))
              : null;
            const startProgress = previousProgress != null ? previousProgress : 0;

            finalValue = pathTotalLen;
            runner.followPathLength = finalValue;
            runner.followPathStart = reversed ? 1 - startProgress : startProgress;
            runner.followPathEnd = reversed ? 1 - endProgress : endProgress;
            runner.from(pathTotalLen * runner.followPathStart);
            finalValue = pathTotalLen * runner.followPathEnd;
            runner.followedPath = followedPath;
            runner.lutData = F.utils.buildLUT(followedPath);
            runner.p = { cd: step.p?.cd || false, rd: step.p?.rd || false, vd: reversed };
          } 
          else if (prop in F.__EFFECTS) {
            runner = new Morphable();
            const { es, fs, fp } = step.p;
            runner.p = step.p;
            const effectEl = query(`${es}`);
            const propertyHandlerEl = effectEl?.querySelector(fs);
            if (propertyHandlerEl && startValue == null) startValue = attr(propertyHandlerEl, fp);
            runner.from(startValue);
          }

          if (prop === "an") runner.to(value);
          else if (prop === "ro") runner.to(runner.toRo);
          else runner.to(finalValue);

          runner.staggered = isArray(g) ? g : false;
          const b = F.EASINGS[step.e] || F.EASINGS.li;
          // Held steps: "st" is the exported key (it was never read: visibility / mask
          // holds interpolated), "cn" the constant easing (holds until the keyframe)
          const held = step.st || step.steps || (step.e === "cn" ? 1 : 0);
          if (prop === "fp") runner.followPathLinear = !held && (!step.e || step.e === "li" || step.e === "linear");
          runner.stepper(held ? new Ease(easing.steps(held)) : new Ease(easing.bezier(b[0], b[1], b[2], b[3])));

          // A path stays a path string for the next keyframe: as a value array
          // "M40 C60 ..." parsed to NaNs and broke every chained morph
          if (prop === "d") startValue = finalValue;
          else if (prop === "mo") startValue = runner.toPath.d;
          // A non-morphable value (mask id, mask type) is carried as is: wrapped again, the
          // next keyframe read the wrapper itself as its value ("url(#[object Object])")
          else if (!(F.__TRANSFORMS.includes(prop)) && !(prop in F.__COLORS))
            startValue = runner._morphObj instanceof NonMorph ? runner.to()[0] : new runner._morphObj.constructor(runner.to());
          if (prop === "do") runner.dashoffsetLen = F.utils.getTotLen(el);

          const tween = { el, _ghost: ghost, prop, runner, duration: stepDuration, delay: timings[0] };
          item.animatables[prop].push(tween);
        });
      }
      this.animations.push(item);
    });

    this._compile();
    return this;
  }

  _compile() {
    const tweens = [];
    let calcMax = 0;
    for (const anim of this.animations)
      for (const prop in anim.animatables)
        for (const tw of anim.animatables[prop]) {
          tweens.push(tw);
          calcMax = MATH.max(calcMax, (tw.delay || 0) + (tw.duration || 0));
        }
    this._allTweens = tweens;
    this.maxDuration = calcMax;
  }

  _objectHasProps(data, props) { return props.some(prop => prop in data); }

  _elHasProps(el, props) {
    const item = this.animations.find(a => a.el === el);
    return this._objectHasProps(item.animatables, props);
  }

  _hasTween(tweens, el, prop) {
    return tweens.some(t => t.el === el && t.prop === prop);
  }

  _elapsed(elapsed) {
    const map = new Map();
    for (const tween of this._allTweens) {
      const started = elapsed >= tween.delay;
      if (this.isPlaying && !started) continue;

      const key = `${attr(tween.el, "id")}_${tween.prop}`;
      if (started || !map.has(key)) map.set(key, tween);
    }
    return [...map.values()];
  }

  _render(elapsed) {
    const elapsedTweens = this._elapsed(elapsed);
    for (const tween of elapsedTweens) {
      // A tween of no length (a single keyframe) is at its end once reached, as the editor (it drew the start value)
      let localProgress = tween.duration > 0 ? MATH.max(0, MATH.min(1, (elapsed - tween.delay) / tween.duration)) : +(elapsed >= tween.delay);
      this._animate(tween, elapsedTweens, localProgress);
    }
  }

  _animate(tween, elapsedTweens, localProgress) {
    const el = tween.el;
    let val, prop = tween.prop;
    const ghost = tween._ghost;
    const box = el.getBBox();

    val = tween.runner.at(localProgress);

    const { x: bx, y: by, width: bw, height: bh } = ghost.getBBox();
    const ox = bx + bw * ghost._anchor[0];
    const oy = by + bh * ghost._anchor[1];

    if (F.__TRANSFORMS.includes(prop)) {

      const trSrc = this._hasTween(elapsedTweens, el, "fp") ? el : ghost;

      const transEl = () => transform(el, transform(trSrc), false, true);

      const tyTransformer = v => {
        transform(ghost, { ty: v - transform(ghost).ty }, true, true);
        transEl()
      };
      const roTransformer = v => {
        transform(trSrc, { ro: v - F.utils.rotOf(trSrc), ox, oy }, true, true);
        transEl()
      };
      const scaleTransformer = (tsX, tsY) => {
        transform(trSrc, { scale: [tsX, tsY], ox, oy }, true, true);
        transEl()
      };
      const anchorTransform = v => { ghost._anchor = v; };
      // Skew sits inside the matrix: this frame's starts from the design one (with its skew), unless a follow path
      // rebuilt it (no skew then). _sk: the skew in it now
      const skTransformer = (axis, v) => {
        const from = trSrc._sk || { x: 0, y: 0, px: 0, py: 0 }, to = { x: from.x || 0, y: from.y || 0, px: ox, py: oy };
        to[axis] = v;
        attr(trSrc, "transform", F.utils.reskew(new Matrix(trSrc), from, to));
        trSrc._sk = el._sk = to;
        transEl();
      };

       
      if (prop === "tx" && !this._hasTween(elapsedTweens, el, "fp")) { transform(el, val, false, true); transform(ghost, val, false, true); el._sk = ghost._sk = ghost._skew; }
      else if (prop === "ty") tyTransformer(val.dec().ty);
      else if (prop === "an") anchorTransform(val);
      else if (F.__SCALES.includes(prop)) scaleTransformer(val.dec().sx, val.dec().sy);
      else if (prop === "ro") roTransformer(Number(val) || 0); // the tweened angle
      else if (prop === "sk" || prop === "sky") skTransformer(prop === "sk" ? "x" : "y", Number(val?.value ?? val) || 0);

      const transformers = { ty: tyTransformer, an: anchorTransform, sx: scaleTransformer, sy: scaleTransformer, ro: roTransformer };

      if (!ghost._statictx) {
        for (const [p, transformer] of Object.entries(transformers)) {
          if (!this._hasTween(elapsedTweens, el, p)) {
            const v = ghost._transalterersStates[p];
            if (v) {
              F.__SCALES.includes(p) ? p === "sx" ? transformer(v, 1) : transformer(1, v)
              : transformer(v);
            }
          }
        }
      }
    } else if (prop === "mo" || prop === "d") {
      val = tween.runner.interpolator(tween.runner._stepper.ease(localProgress)); // the keyframe's easing (it ran linearly)
      attr(el, "d", val);
    }else if (prop == "fp") {
        const pathLength = tween.runner.followPathLength;
        const linear = tween.runner.followPathLinear;
        const startProgress = tween.runner.followPathStart ?? 0;
        const endProgress = tween.runner.followPathEnd ?? 1;
        const progress = linear
          ? startProgress + (endProgress - startProgress) * localProgress
          : (pathLength > 0 ? val / pathLength : startProgress);
        const { x, y, angle, cd, rd } = F.utils.followVal(tween, progress);
        const cx = cd ? ox : 0;
        const cy = cd ? oy : 0;

        transform(el, { tx: x - cx, ty: y - cy, ox, oy }, false, true)
        el._sk = null; // rebuilt without skew

        if (rd) {
          transform(el, { ro: angle - transform(el).ro, ox, oy }, true, true);
        }
      }
     else if (prop in F.__COLORS) {
      // Ended on "none" (no color): written as such, not as a transparent color
      if (tween.runner.toNone && localProgress >= 1) attr(el, prop === "f" ? "fill" : "stroke", "none");
      else if (tween.runner.gradientType) {
        const gd = F.utils.parseGradArr(val);
        F.utils.setGradEl(el, ghost, prop, tween.runner.gradientType, gd.angle, gd.stops);
      } else {
        // "f" / "st" are the short keys: the attributes are fill / stroke
        attr(el, prop === "f" ? "fill" : "stroke", rgba(val));
      }
    } else if (F.__SIZES.includes(prop)) {
      box.width = prop === "w" ? val : box.width;
      box.height = prop === "h" ? val : box.height;
      if (F.utils.isText(el)) attr(el, "font-size", val);
      else {
        sizingUtility.size(el, box.width, box.height);
        if (F.utils.isMedia(el)) F.utils.updateImg(el, box.width, box.height);
      }
    } else if (prop in F.__EFFECTS) {
      const { es, fs, fp } = tween.runner.p;
      const effectEl = query(`${es}`);
      const propertyHandlerEl = effectEl?.querySelector(fs);
      if (propertyHandlerEl) {
        if (prop === "ec" && fp === "flood-color")
          val = rgba(val);
        attr(propertyHandlerEl, fp, val.toString());
      }
    } else if (prop === "rd") {
      attr(el, 'rx', val); attr(el, 'ry', val);
    }
    else if (prop == "v") {
      if (val != Number(el.style.visibility !== "hidden")) el.style.visibility = val == 1 ? "visible" : "hidden";
    }
    else if (prop === "mb") {
      const v = val.value[0];
      const maskHolder = el.tagName != "g" ? el.parentNode : el;
      if (v !== (attr(maskHolder, "_mask") || "")) {
        attr(maskHolder, "mask", v ? `url(#${v})` : v);
        attr(maskHolder, "_mask", v);
      }
    } else if (prop === "mt") {
      const f = val.value[0] === "out" ? ["black", "white"] : ["white", "black"];
      ghost._maskEl.childNodes.forEach((c, i) => attr(c, "fill", i === 0 ? f[0] : f[1]));
    } else {
      if (prop in F.__STROKE) {
        const p = prop;
        prop = F.__STROKE[prop];
        if (p === "da") val = F.utils.dashString(val);
        // With its own dash-array animation, the offset moves the dash list (100% = its length)
        if (p === "do" && this._elHasProps(el, ["da"])) val = F.utils.dashPeriod(attr(el, "stroke-dasharray")) * (val / 100);
        else if (p === "do") {
          let dashoffsetLen = tween.runner.dashoffsetLen;
          const targetSizeChanged = this._elHasProps(el, [...F.__SIZES, ...F.__SCALES]);
          if (targetSizeChanged) dashoffsetLen = F.utils.getTotLen(el);
          val = dashoffsetLen * (val / 100);
          const da = "stroke-dasharray";
          if (!attr(el, da) || targetSizeChanged) {
            if (!attr(el, da))
              this.dirtyProperties.add({ el: el, property: da });
            attr(el, da, dashoffsetLen);
          }
        }
      }

      attr((prop == "op" ? el.parentNode : el), prop == "op" ? "opacity" : prop, val);
    }

  }

  _cleanDirtyProps() {
    this.dirtyProperties.forEach(d => attr(d.el, d.property, null));
    this.dirtyProperties.clear();
  }

  play() {
    this._cleanDirtyProps();
    this.isPlaying = true;
    if (this.lastElapsed >= this.maxDuration) this.lastElapsed = 0;

    let startTime = null;
    const initialElapsed = this.lastElapsed;
    const tick = now => {
      if (!startTime) startTime = now;
      const elapsed = initialElapsed + (now - startTime);

      if (elapsed > this.maxDuration) {
        if (this.config.loop) {
          this.lastElapsed = 0;
          startTime = now;
          this.play();
        } else {
          this.lastElapsed = this.maxDuration;
          this._render(this.lastElapsed);
          if (this.config.onComplete) this.config.onComplete();
          this.pause();
        }
        return;
      }

      this.lastElapsed = elapsed;
      this._render(elapsed);
      if (this.config.onUpdate) this.config.onUpdate();
      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  pause() { this.isPlaying = false; if (this.rafId) cancelAnimationFrame(this.rafId); }

  _initState(el, prop, ghost) {
    if (prop === "sk") return F.utils.skewOf(el).x;
    if (prop === "sky") return F.utils.skewOf(el).y;
    if (F.__TRANSFORMS.includes(prop)) return new Matrix(el);
    if (prop in F.__COLORS) {
      // An element's own color, else its wrapper's (Awa puts the fill on the wrapper g)
      const name = prop == "f" ? "fill" : "stroke";
      const own = attr(el, name);
      const fill = (own && own !== "none" ? own : (el.tagName != "g" && el.parentNode && attr(el.parentNode, name))) || "rgba(0,0,0,1)";
      if (fill.includes("url")) {
        const id = fill.match(/#([^") ]*)/)[1];
        return F.utils.cssGrad(query(`#${id}`));
      }
      return fill;
    }
    if (prop === "fp") return 0;
    if (prop in F.__PATHS) return attr(el, "d");
    if (prop in F.__EFFECTS) return null;
    // the element's own dash list, raw ("none" when unset): F.utils.dashList reads it (an attribute "da" never exists)
    if (prop === "da") return attr(el, "stroke-dasharray") || "none";
    if (prop === "rd") return attr(el, "rx") || 0;
    if (prop === "mb") {
      const mask = attr(el.tagName != "g" ? el.parentNode : el, "mask") || "";
      return mask.split("#")[1]?.slice(0, -1) ?? "";
    }
    if (prop === "mt") return attr(ghost._maskEl.firstChild, "fill") === "white" ? "in" : "out";
    return attr(el, prop) || 0;
  }

  _reorder(obj) {
    const result = {};
    // da before do (it reads the dash list)
    [F.__PATHS.fp,...F.__TRANSFORMS, ...F.__SIZES, "da"].forEach(key => { if (key in obj) result[key] = obj[key]; });
    Object.keys(obj).forEach(key => { if (!(key in result)) result[key] = obj[key]; });
    return result;
  }

  _calcStagger(delay, staggerArr, totalElements, index, totalDuration) {
      let [s, r, g] = staggerArr;
      if (typeof s === "string") s = (totalElements * parseInt(s)) / 100;
      if (typeof r === "string") r = (totalElements * parseInt(r)) / 100;
      const step = totalDuration * (g / 100);
      const segWidth = step / MATH.round(totalElements / r);
      const relIndex = MATH.floor((index - s) / r);
      return [MATH.ceil(delay + segWidth * relIndex), MATH.ceil(step - segWidth)];
    }
}