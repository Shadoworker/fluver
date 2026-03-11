const numberAndUnit = /^([+-]?(\d+(\.\d*)?|\.\d+)(e[+-]?\d+)?)([a-z%]*)$/i;
const transforms = /\)\s*,?\s*/;
const delimiter = /[\s,]+/;

const attr = (el, k, v) => v === undefined ? el.getAttribute(k) : el.setAttribute(k, v);
const rgba = v => `rgba(${v[0]},${v[1]},${v[2]},${v[3]})`;

function getOrig(o, element) {
  const origin = o.origin;
  let ox = o.ox ?? o.originX ?? "center";
  let oy = o.oy ?? o.originY ?? "center";

  if (origin != null) {
    [ox, oy] = Array.isArray(origin) ? origin
      : typeof origin === "object" ? [origin.x, origin.y]
      : [origin, origin];
  }

  const condX = typeof ox === "string";
  const condY = typeof oy === "string";

  if (condX || condY) {
    const { height, width, x, y } = element.getBBox();
    if (condX) ox = ox.includes("left") ? x : ox.includes("right") ? x + width : x + width / 2;
    if (condY) oy = oy.includes("top") ? y : oy.includes("bottom") ? y + height : y + height / 2;
  }

  return [ox, oy];
}

const rad = d => ((d % 360) * Math.PI) / 180;

const segmentParameters = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7, Z: 0 };

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
  if (Array.isArray(array)) array = Array.prototype.concat.apply([], array);
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

const easing = {
  bezier(x1, y1, x2, y2) {
    return t => {
      if (t < 0) return x1 > 0 ? (y1 / x1) * t : x2 > 0 ? (y2 / x2) * t : 0;
      if (t > 1) return x2 < 1 ? ((1 - y2) / (1 - x2)) * t + (y2 - x2) / (1 - x2)
        : x1 < 1 ? ((1 - y1) / (1 - x1)) * t + (y1 - x1) / (1 - x1) : 1;
      return 3 * t * (1 - t) ** 2 * y1 + 3 * t ** 2 * (1 - t) * y2 + t ** 3;
    };
  },
  steps(steps, stepPosition = "end") {
    stepPosition = stepPosition.split("-").reverse()[0];
    let jumps = steps;
    if (stepPosition === "none") --jumps;
    else if (stepPosition === "both") ++jumps;
    return (t, beforeFlag = false) => {
      let step = Math.floor(t * steps);
      const jumping = (t * step) % 1 === 0;
      if (stepPosition === "start" || stepPosition === "both") ++step;
      if (beforeFlag && jumping) --step;
      if (t >= 0 && step < 0) step = 0;
      if (t <= 1 && step > jumps) step = jumps;
      return step / jumps;
    };
  },
};

class SVGNumber {
  constructor(...args) { this.init(...args); }

  init(value, unit) {
    unit = Array.isArray(value) ? value[1] : unit;
    value = Array.isArray(value) ? value[0] : value;
    this.value = 0;
    this.unit = unit || "";

    if (typeof value === "number") {
      this.value = isNaN(value) ? 0 : !isFinite(value) ? value < 0 ? -3.4e38 : +3.4e38 : value;
    } else if (typeof value === "string") {
      const u = value.match(numberAndUnit);
      if (u) {
        this.value = parseFloat(u[1]);
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
    if (Array.isArray(array)) return array;
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
  else if (Array.isArray(value)) return SVGArray;
};

class Ease {
  constructor(fn) { this.ease = easing[fn] || fn; }
  done() { return false; }
  step(from, to, pos) {
    if (typeof from !== "number") return pos < 1 ? from : to;
    return from + (to - from) * this.ease(pos);
  }
}
 
function extend(modules, methods) {
  modules = Array.isArray(modules) ? modules : [modules];
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
    const source = Array.isArray(x) ? { x: x[0], y: x[1] }
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

class Gradient {
  constructor(type = "linear") {
    this.type = type;
    this.id = `grad-${Math.random().toString(36).slice(2, 9)}`;
    this.stops = [];
    this.attrs = type === "linear" 
      ? { x1: "0%", y1: "0%", x2: "100%", y2: "0%" }
      : { cx: "50%", cy: "50%", r: "50%", fx: "50%", fy: "50%" };
     
  }

  // Chainable stop adder
  addStop(offset, color, opacity = 1) {
    const off = typeof offset === "number" ? `${(offset * 100).toFixed(2)}%` : offset;
    this.stops.push({ offset: off, color, opacity });
    return this;
  }

  // Unified setter for linear (from/to) and radial (center/radius)
  set(props) {
    Object.assign(this.attrs, props);
    return this;
  }

  toElement() {
    const el = document.createElementNS("http://www.w3.org/2000/svg", this.type + "Gradient");
    const allAttrs = { id: this.id, gradientUnits: "objectBoundingBox", spreadMethod: "pad", ...this.attrs };
    
    for (let key in allAttrs) if (allAttrs[key]) attr(el, key, allAttrs[key]);

    this.stops.forEach(s => {
      const stop = document.createElementNS("http://www.w3.org/2000/svg", "stop");
      attr(stop, "offset", s.offset);
      attr(stop, "stop-color", s.color);
      if (s.opacity < 1) attr(stop, "stop-opacity", s.opacity);
      el.appendChild(stop);
    });

    return el;
  }

  attachTo(container) {
    return container.appendChild(this.toElement());
  }

  applyTo(el, attrName = "fill") {
    const target = typeof el === "string" ? document.querySelector(el) : el;
    attr(target, attrName, `url(#${this.id})`);
    return this;
  }
}
class Matrix {
  constructor(...args) { this.init(...args); }

  static fmtTx(o) {
    const flipBoth = o.flip === "both" || o.flip === true;
    const flipX = o.flip && (flipBoth || o.flip === "x") ? -1 : 1;
    const flipY = o.flip && (flipBoth || o.flip === "y") ? -1 : 1;
    const skewX = o.skew?.length ? o.skew[0] : isFinite(o.skew) ? o.skew : isFinite(o.skewX) ? o.skewX : 0;
    const skewY = o.skew?.length ? o.skew[1] : isFinite(o.skew) ? o.skew : isFinite(o.skewY) ? o.skewY : 0;
    const scaleX = o.scale?.length ? o.scale[0] * flipX : isFinite(o.scale) ? o.scale * flipX : isFinite(o.scaleX) ? o.scaleX * flipX : flipX;
    const scaleY = o.scale?.length ? o.scale[1] * flipY : isFinite(o.scale) ? o.scale * flipY : isFinite(o.scaleY) ? o.scaleY * flipY : flipY;
    const shear = o.shear || 0, theta = o.rotate || o.theta || 0;
    const origin = new Point(o.origin || o.around || o.ox || o.originX, o.oy || o.originY);
    const position = new Point(o.position || o.px || o.positionX || NaN, o.py || o.positionY || NaN);
    const translate = new Point(o.translate || o.tx || o.translateX, o.ty || o.translateY);
    const relative = new Point(o.relative || o.rx || o.relativeX, o.ry || o.relativeY);
    return { scaleX, scaleY, skewX, skewY, shear, theta,
      rx: relative.x, ry: relative.y, tx: translate.x, ty: translate.y,
      ox: origin.x, oy: origin.y, px: position.x, py: position.y };
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
    const sx = ccw * Math.sqrt(a * a + b * b);
    const thetaRad = Math.atan2(ccw * b, ccw * a), theta = (180 / Math.PI) * thetaRad;
    const ct = Math.cos(thetaRad), st = Math.sin(thetaRad);
    const lam = (a * c + b * d) / det;
    const sy = (c * sx) / (lam * a - b) || (d * sx) / (lam * b + a);
    const tx = e - cx + cx * ct * sx + cy * (lam * ct * sx - st * sy);
    const ty = f - cy + cx * st * sx + cy * (lam * st * sx + ct * sy);
    return { scaleX: sx, scaleY: sy, shear: lam, rotate: theta, translateX: tx, translateY: ty,
      originX: cx, originY: cy, a: this.a, b: this.b, c: this.c, d: this.d, e: this.e, f: this.f };
  }

  init(source) {
    const base = Matrix.fromArr([1, 0, 0, 1, 0, 0]);
    source = source instanceof Element ? mtxify(source)
      : typeof source === "string" ? Matrix.fromArr(source.split(delimiter).map(parseFloat))
      : Array.isArray(source) ? Matrix.fromArr(source)
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
    const cos = Math.cos(r), sin = Math.sin(r), { a, b, c, d, e, f } = this;
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
 
  shrO(lx, cx = 0, cy = 0) {
    const { a, b, c, d, e, f } = this;
    this.a = a + b * lx; this.c = c + d * lx; this.e = e + f * lx - cy * lx;
    return this;
  }

  skew() { return this.clone().skwO(...arguments); }
  skwO(x, y = x, cx = 0, cy = 0) {
    if (arguments.length === 3) { cy = cx; cx = y; y = x; }
    x = rad(x); y = rad(y);
    const lx = Math.tan(x), ly = Math.tan(y), { a, b, c, d, e, f } = this;
    this.a = a + b * lx; this.b = b + a * ly;
    this.c = c + d * lx; this.d = d + c * ly;
    this.e = e + f * lx - cy * lx; this.f = f + e * ly - cx * ly;
    return this;
  }

  skewX(x, cx, cy) { return this.skew(x, 0, cx, cy); }
  skewY(y, cx, cy) { return this.skew(0, y, cx, cy); }

  toArray() { return [this.a, this.b, this.c, this.d, this.e, this.f]; }
  toString() { return `matrix(${this.a},${this.b},${this.c},${this.d},${this.e},${this.f})`; }

  transform(o) {
    if (Matrix.isMx(o)) return new Matrix(o).mulO(this);
    const t = Matrix.fmtTx(o);
    const { x: ox, y: oy } = new Point(t.ox, t.oy).transform(this);
    const transformer = new Matrix()
      .txO(t.rx, t.ry).lmulO(this).txO(-ox, -oy)
      .sclO(t.scaleX, t.scaleY).skwO(t.skewX, t.skewY).shrO(t.shear)
      .rotO(t.theta).txO(ox, oy);
    if (isFinite(t.px) || isFinite(t.py)) {
      const origin = new Point(ox, oy).transform(transformer);
      transformer.txO(isFinite(t.px) ? t.px - origin.x : 0, isFinite(t.py) ? t.py - origin.y : 0);
    }
    transformer.txO(t.tx, t.ty);
    return transformer;
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

const movingUtility = {
  el: null,
  move(el, x, y) {
    this.el = el;
    const type = attr(el, 'id').split('-')[1];
    return type === 'path' ? this.movePath(x, y) : '';
  },
  movePath(x, y) {
    const box = this.el.getBBox();
    x -= box.x + box.width * 0.5;
    y -= box.y + box.height * 0.5;
    const pathArray = pPath(attr(this.el, 'd'));
    if (!isNaN(x) && !isNaN(y)) {
      for (let l, i = pathArray.length - 1; i >= 0; i--) {
        l = pathArray[i][0];
        if (l === 'M') { pathArray[i][1] += x; pathArray[i][2] += y; }
        else if (l === 'C') {
          pathArray[i][1] += x; pathArray[i][2] += y;
          pathArray[i][3] += x; pathArray[i][4] += y;
          pathArray[i][5] += x; pathArray[i][6] += y;
        } 
      }
    }
    return arrToStr(pathArray);
  }
};

const sizingUtility = {
  el: null, width: null, height: null,
  size(el, width, height) {
    this.el = el; this.width = width; this.height = height;
    const type = attr(el, 'id').split('-')[1];
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
    const scaleX = (v, base) => (v - base.x) * this.width / base.width + base.x;
    const scaleY = (v, base) => (v - base.y) * this.height / base.height + base.y;
    for (let i = pathArray.length - 1; i >= 0; i--) {
      const l = pathArray[i][0];
      if (l === 'M') {
        pathArray[i][1] = scaleX(pathArray[i][1], box); pathArray[i][2] = scaleY(pathArray[i][2], box);
      }
      else if (l === 'C') {
        pathArray[i][1] = scaleX(pathArray[i][1], box); pathArray[i][2] = scaleY(pathArray[i][2], box);
        pathArray[i][3] = scaleX(pathArray[i][3], box); pathArray[i][4] = scaleY(pathArray[i][4], box);
        pathArray[i][5] = scaleX(pathArray[i][5], box); pathArray[i][6] = scaleY(pathArray[i][6], box);
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
  if (!Matrix.isMx(o)) o = { ...o, origin: getOrig(o, el) };
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
    const b = F.EASINGS.linear;
    this._stepper = stepper || new Ease(easing.bezier(b[0], b[1], b[2], b[3]));
    this._from = this._to = this._type = this._context = this._morphObj = null;
  }

  at(pos) { return this._morphObj.morph(this._from, this._to, pos, this._stepper, this._context); }

  done() {
    return this._context.map(this._stepper.done).reduce((last, curr) => last && curr, true);
  }

  from(val) { if (val == null) return this._from; this._from = this._set(val); return this; }
  stepper(stepper) { if (stepper == null) return this._stepper; this._stepper = stepper; return this; }
  to(val) { if (val == null) return this._to; this._to = this._set(val); return this; }
  type(type) { if (type == null) return this._type; this._type = type; return this; }

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
    this.sampler = typeof document !== 'undefined' ? document.createElementNS("http://www.w3.org/2000/svg", "path") : null;
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
    let bestShift = 0, minDistance = Infinity, n = a.length;
    for (let s = 0; s < n; s++) {
      let dist = 0;
      for (let i = 0; i < n; i++) {
        const j = (i + s) % n;
        dist += (a[i][0] - b[j][0]) ** 2 + (a[i][1] - b[j][1]) ** 2;
      }
      if (dist < minDistance) { minDistance = dist; bestShift = s; }
    }
    return [...b.slice(bestShift), ...b.slice(0, bestShift)];
  }
  // 3. Generate the actual animation function
  mkMorph(d1, d2) {
    const p1 = this.sample(d1);
    const p2 = this.align(p1, this.sample(d2));

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
      }, "");
    };
  }
}

class PathReshaper {
  constructor() {
    this.commandsRegex = /([MC])([^MC]+)/gi;
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
    const find = p => sp.findIndex(s => s.x === p.x && s.y === p.y);
    return (find(h) - find(p1)) / (find(p2) - find(p1));
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
  static __TRANSFORMS = ["translateX","translateY","anchor","scaleX","scaleY","rotate","translateZ","rotateX","rotateY","rotateZ","anchorX","anchorY","skew","skewX","skewY","perspective","matrix","matrix3d"];
  static __SCALES = ["scaleX", "scaleY"];
  static __COLORS = { fill: "fill", stroke: "stroke" };
  static __SIZES = ["width", "height"];
  static __PATHS = { followPath: "followPath", morphTo: "morphTo", d: "d" };
  static __STROKE = { strokeWidth: "stroke-width", strokeDasharray: "stroke-dasharray", strokeDashoffset: "stroke-dashoffset" };
  static __EFFECTS = { effectX: "effectX", effectY: "effectY", effectBlur: "effectBlur", effectColor: "effectColor" };

  static __GEOM_MODIFIERS = ["d", "points", "text"];
  static EASINGS = {
    linear: [0.0,0.0,1.0,1.0],
    easeInQuad: [0.55,0.085,0.68,0.53], easeOutQuad: [0.25,0.46,0.45,0.94], easeInOutQuad: [0.455,0.03,0.515,0.955],
    easeInCubic: [0.55,0.055,0.675,0.19], easeOutCubic: [0.215,0.61,0.355,1.0], easeInOutCubic: [0.645,0.045,0.355,1.0],
    easeInQuart: [0.895,0.03,0.685,0.22], easeOutQuart: [0.165,0.84,0.44,1.0], easeInOutQuart: [0.77,0.0,0.175,1.0],
    easeInQuint: [0.755,0.05,0.855,0.06], easeOutQuint: [0.23,1.0,0.32,1.0], easeInOutQuint: [0.86,0.0,0.07,1.0],
    easeInSine: [0.47,0.0,0.745,0.715], easeOutSine: [0.39,0.575,0.565,1.0], easeInOutSine: [0.445,0.05,0.55,0.95],
    easeInExpo: [0.95,0.05,0.795,0.035], easeOutExpo: [0.19,1.0,0.22,1.0], easeInOutExpo: [1.0,0.0,0.0,1.0],
    easeInCirc: [0.6,0.04,0.98,0.335], easeOutCirc: [0.075,0.82,0.165,1.0], easeInOutCirc: [0.785,0.135,0.15,0.86],
    easeInElastic: [0.47,-0.03,0.745,0.715], easeOutElastic: [0.39,0.575,0.565,1.425], easeInOutElastic: [0.68,-0.55,0.265,1.55],
    easeInBounce: [0.6,-0.28,0.735,0.045], easeOutBounce: [0.175,0.885,0.32,1.275], easeInOutBounce: [0.68,-0.55,0.265,1.55],
  };

  static utils = {
    getDist(p1, p2) { return Math.sqrt((p2.x-p1.x)**2 + (p2.y-p1.y)**2); },
    getEllipseLen(el) {
      const a = parseFloat(attr(el, "rx")) || 0;
      const b = parseFloat(attr(el, "ry")) || 0;
      return Math.PI * (3 * (a + b) - Math.sqrt((3 * a + b) * (a + 3 * b)));
    },
    getRectLen(el) { return attr(el, "width") * 2 + attr(el, "height") * 2; },
    getPolygonLen(el) {
      const pts = el.points, n = pts.numberOfItems;
      let len = 0;
      for (let i = 0; i < n - 1; i++) len += F.utils.getDist(pts.getItem(i), pts.getItem(i + 1));
      return len + F.utils.getDist(pts.getItem(n - 1), pts.getItem(0));
    },
    getTotLen(el) {
      if (el.getTotalLength) return el.getTotalLength();
      switch (el.type) {
        case "ellipse": return F.utils.getEllipseLen(el);
        case "rect": return F.utils.getRectLen(el);
        case "polygon": return F.utils.getPolygonLen(el);
      }
    },
    followVal(followPathTween, progress) {
      const runner = followPathTween.runner, path = runner.followedPath;
      const centered = runner.params.centered, rotated = runner.params.rotated;
      const point = (offset = 0) => path.getPointAtLength(progress + offset >= 1 ? progress + offset : 0);
      const p = point(), p0 = point(-1), p1 = point(+1);
      const angle = (Math.atan2(p1.y - p0.y, p1.x - p0.x) * 180) / Math.PI;
      if (!path._followghost) path._followghost = path.cloneNode();
      path._followghost._bbox = path.getBBox();
      transform(path._followghost, transform(path), false, true);
      path._followghost.bbox = () => path._followghost._bbox;
      transform(path._followghost, {translate : [p.x, p.y]}, true, true);
      return { transform: transform(path._followghost), angle, rotated, centered };
    },
    hexToRgba(hex) {
      hex = hex.replace(/[^0-9a-fA-F]/g, "");
      if (hex.length < 5) hex = hex.split("").map(s => s + s).join("");
      const rgba = hex.match(/.{1,2}/g).map(s => parseInt(s, 16));
      rgba[3] = rgba.length > 3 ? parseFloat((rgba[3] / 255).toFixed(2)) : 1;
      return { r: rgba[0], g: rgba[1], b: rgba[2], a: rgba[3] };
    },
    fmtColor(color) {
      if (color[0] === "#") { const c = this.hexToRgba(color); return `rgba(${c.r},${c.g},${c.b},${c.a})`; }
      return color;
    },
    cssGrad(el) {
      const isRadial = el.tagName === "radialGradient";
      const stops = Array.from(el.querySelectorAll("stop")).map(stop => {
        const offsetAttr = attr(stop, "offset") || "0";
        const offsetValue = offsetAttr.includes("%") ? offsetAttr : parseFloat(offsetAttr) * 100 + "%";
        return `${attr(stop, "stop-color") || "rgba(0,0,0,1)"} ${offsetValue}`;
      }).join(", ");

      if (!isRadial) {
        const x1 = parseFloat(attr(el, "x1") || 0), y1 = parseFloat(attr(el, "y1") || 0);
        const x2 = parseFloat(attr(el, "x2") || 0), y2 = parseFloat(attr(el, "y2") || 0);
        const angle = ((Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI + 90) % 360;
        return `linear-gradient(${angle.toFixed(0)}deg, ${stops})`;
      }

      let cx = attr(el, "cx") || "50%", cy = attr(el, "cy") || "50%";
      if (!cx.includes("%") && !isNaN(cx)) cx = parseFloat(cx) * 100 + "%";
      if (!cy.includes("%") && !isNaN(cy)) cy = parseFloat(cy) * 100 + "%";
      return `radial-gradient(circle ${stops})`;
    },
    isText(_el) { return _el.nodeName === "text"; },
    isMedia(_el) { return attr(_el, 'id').split('-')[1] === 'image'; },
    isGradient(_colorString) { return _colorString.includes && _colorString.includes("%"); },
    fmtGrad(initialColor, targetColor) {
      const rgbaRegex = /rgba?(\(\s*\d+\s*,\s*\d+\s*,\s*\d+)(?:\s*,.+?)?\)/g;
      const toRgbaStr = c => { const x = this.hexToRgba(c); return `rgba(${x.r},${x.g},${x.b},${x.a})`; };
      if (this.isGradient(targetColor) && !this.isGradient(initialColor)) {
        if (initialColor[0] === "#") initialColor = toRgbaStr(initialColor);
        initialColor = targetColor.toLowerCase().replaceAll(rgbaRegex, initialColor);
      } else if (this.isGradient(initialColor) && !this.isGradient(targetColor)) {
        if (targetColor[0] === "#") targetColor = toRgbaStr(targetColor);
        targetColor = initialColor.toLowerCase().replaceAll(rgbaRegex, targetColor);
      }
      return { initialColor, targetColor };
    },
    getGradVals(_colorString) {
      const type = _colorString.split("-gradient")[0];
      const part11 = (_colorString.split("gradient(")[1].split("%)")[0] + "%").toLowerCase();
      const segments = part11.split(", rgba");
      const angle = segments[0].split("deg")[0];
      const values = [];
      for (let i = 1; i < segments.length; i++) {
        values.push({ color: "rgba" + segments[i].split(") ")[0] + ")", offset: segments[i].split(") ")[1] });
      }
      return { type, angle, values };
    },
    gradDToArr(data) {
      const { angle, values } = data;
      let arr = [parseInt(angle)];
      for (const { color, offset } of values) {
        arr = [...arr, ...this.rgbaToArr(color), parseInt(offset)];
      }
      return arr;
    },
    rgbaToArr(color) {
      const rgba = color.replace(/^rgba?\(|\s+|\)$/g, "").split(",");
      return [parseInt(rgba[0]), parseInt(rgba[1]), parseInt(rgba[2]), parseInt(rgba[3])];
    },
    parseGradArr(data) {
      const angle = data[0], stops = [];
      for (let i = 1; i < data.length; i += 5)
        stops.push({ color: `rgba(${data[i]},${data[i+1]},${data[i+2]},${data[i+3]})`, offset: data[i+4] });
      return { angle, stops };
    },
    setGradEl(_el, _ghost, _baseColorType = null, _gradientType = null, _gradientAngle = null, _stopPoints = null) {
      const _elemId = attr(_el, "id");
      const gradientId = `${_elemId}--gradient--item--${_baseColorType}`;
      const existing = document.querySelector(`#${gradientId}`);
      if (existing) existing.remove();

      const gradient = new Gradient(_gradientType);
      gradient.id = gradientId;
      const svgOwner = _el.ownerSVGElement;

      for (const _vals of _stopPoints) gradient.addStop(_vals.offset, _vals.color);

      if (_gradientType === "linear") {
        const rad = ((parseInt(_gradientAngle) + 90) * Math.PI) / 180;
        gradient.set({x1:0.5 + 0.5 * Math.cos(rad), y1:0.5 + 0.5 * Math.sin(rad),x2:0.5 - 0.5 * Math.cos(rad), y2:0.5 - 0.5 * Math.sin(rad)});
      }
      gradient.attachTo(svgOwner.querySelector("defs"));
      if (_baseColorType === "fill") gradient.applyTo(_ghost._baseRefEl);
      else gradient.applyTo(_el, "stroke");
    },
    updateImg(el, imgRealWidth = null, imgRealHeight = null, renderMode = "FILL", tile = 4, hspace = 0, vspace = 0) {
      const imagePattern = document.querySelector(`#${attr(el, 'id')}--pattern--background`);
      const imagePatternImage = imagePattern.firstChild;
      const img = new window.Image();
      img.src = attr(imagePatternImage, 'href');
      img.onload = () => {
        if (!imgRealWidth || !imgRealHeight) { imgRealWidth = img.naturalWidth; imgRealHeight = img.naturalHeight; }
        const elemX = parseFloat(attr(el, 'x')), elemY = parseFloat(attr(el, 'y'));
        const { width: elemWidth, height: elemHeight } = el.getBBox();
        const setAttrs = (node, attrs) => Object.entries(attrs).forEach(([k, v]) => attr(node, k, v));
        if (renderMode === "FILL" || renderMode === "FIT") {
          const isFill = renderMode === "FILL";
          const wRatio = elemWidth / imgRealWidth, hRatio = elemHeight / imgRealHeight;
          const scaler = (imgRealWidth > imgRealHeight) === isFill ? hRatio : wRatio;
          const newW = imgRealWidth * scaler, newH = imgRealHeight * scaler;
          setAttrs(imagePattern, { width: imgRealWidth, height: imgRealHeight, x: elemX + (elemWidth - newW) / 2, y: elemY + (elemHeight - newH) / 2 });
          setAttrs(imagePatternImage, { width: imgRealWidth, height: imgRealHeight, transform: `scale(${scaler})` });
        } else if (renderMode === "TILE") {
          if (tile < 1) return;
          const tileW = imgRealWidth / (100 - tile) * 5, tileH = imgRealHeight / (100 - tile) * 5;
          setAttrs(imagePattern, { width: tileW + (elemWidth - tileW) * (hspace / 100), height: tileH + (elemHeight - tileH) * (vspace / 100), baseWidth: imgRealWidth, baseHeight: imgRealHeight, hSpacing: hspace, vSpacing: vspace, x: elemX, y: elemY });
          setAttrs(imagePatternImage, { width: tileW, height: tileH });
        }
      };
    }
  };

  constructor(options = {}) {
    this.animations = [];
    this._allTweens = [];
    this.config = {
      duration: null,
      speed: options.speed || 1,
      loop: options.loop || false,
      autoplay: options.autoplay ?? false,
      onUpdate: options.update || null,
      onComplete: options.complete || null,
    };
    this.maxDuration = 0;
    this.lastElapsed = 0;
    this.rafId = null;
    this.isPlaying = false;
    this.isCompleted = false;
    this.progress = 0;
    this.dirtyProperties = new Set();
  }

  add(data) {
    data = this._reorder(data);
    const elements = document.querySelectorAll(data.targets) ?? [];
    const hasTransforms = this._objectHasProps(data, F.__TRANSFORMS);
    const hasTranslateX = this._objectHasProps(data, ["translateX"]);
    const elementAnimationDuration = this._getElAnimDur(data);

    elements.forEach((el, i) => {
      const snapshot = el.cloneNode(true);
      const ghost = el.cloneNode();
      ghost._bbox = el.getBBox();
      ghost.getBBox = () => ghost._bbox;

      let dataAnchor = attr(el, 'anchor');
      dataAnchor = dataAnchor?.replace(/(\w+)\s*:/g, '"$1":');
      const anchor = dataAnchor ? [JSON.parse(dataAnchor).x, JSON.parse(dataAnchor).y] : [0.5, 0.5];
      ghost._anchor = anchor;

      const tId = attr(el, "id");
      ghost._baseRefEl = document.querySelector(`#${tId}--def-base-ref`);
      ghost._maskEl = document.querySelector(`#${tId}--mask--`);
      ghost._transalterersStates = {};

      if (hasTransforms && !hasTranslateX) {
        data["translateX"] = [{ value: transform(snapshot).translateX, duration: elementAnimationDuration }];
        data = this._reorder(data);
        ghost._staticTranslateX = true;
      }

      const item = { el, targets: data.targets, _ghost: ghost, _snapshot: snapshot, animatables: {} };

      for (const prop in data) {
        if (prop === "targets" || !data[prop] || !Array.isArray(data[prop])) continue;
        item.animatables[prop] = [];
        let startValue = this._initState(el, prop, ghost);
        let startAnchor = ghost._anchor;
        const steps = data[prop];

        steps?.forEach((step, j) => {
          const timings = Array.isArray(step.stagger)
            ? this._calcStagger(step.delay || 0, step.stagger, elements.length, i, step.duration)
            : [step.delay || 0, 0];

          // Add global timeline delay
          const stepDuration = step.duration - timings[1];

          let runner = new Morphable();
          if (!(prop in F.__COLORS)) runner.from(startValue);
          runner.params = step.params;

          let finalValue = step.value;

          if (F.__TRANSFORMS.includes(prop)) {
            let val = step.value - startValue.dec()[prop];
            if (prop === "translateX" || prop === "translateY") {
              const dx = prop === "translateX" ? val : 0, dy = prop === "translateY" ? val : 0;
              finalValue = startValue.clone().transform({ translate: [dx, dy] }, true);
              if (prop === "translateY") ghost._transalterersStates[prop] = step.value;
            } else {
              if (prop === "anchor") { runner = new Morphable(); runner.from(startAnchor); }
              else {
                if (prop === "scaleX" || prop === "scaleY") val = step.value / startValue.dec()[prop];
                finalValue = startValue.clone().transform({ [prop]: val }, true);
              }
              ghost._transalterersStates[prop] = step.value;
            }
            startValue = finalValue; startAnchor = step.value;
          } else if (prop in F.__COLORS) {
            startValue = Array.isArray(startValue) ? rgba(startValue) : startValue;
            if (F.utils.isGradient(finalValue)) {
              runner = new Morphable();
              const formatted = F.utils.fmtGrad(startValue, finalValue);
              const initGrad = F.utils.gradDToArr(F.utils.getGradVals(formatted.initialColor));
              const finalGrad = F.utils.getGradVals(formatted.targetColor);
              finalValue = F.utils.gradDToArr(finalGrad).toLocaleString();
              runner.from(initGrad.toLocaleString());
              runner.gradientType = finalGrad.type;
            } else {
              runner.from(F.utils.rgbaToArr(F.utils.fmtColor(startValue)));
              finalValue = F.utils.rgbaToArr(F.utils.fmtColor(finalValue));
            }
          } else if (prop === "strokeDasharray") {
            runner = new Morphable();
            const diff = finalValue.length - startValue.length;
            if (diff > 0) startValue = [...startValue, ...new Array(diff).fill(startValue.at(-1))];
            else finalValue = [...finalValue, ...new Array(Math.abs(diff)).fill(finalValue.at(-1))];
            startValue = startValue.map(e => parseInt(e));
            finalValue = finalValue.map(e => parseInt(e));
            runner.from(startValue);
          } else if (prop === "morphTo") {
            const toPathSelector = finalValue;
            const fromPath = step.params?.resetPath ? attr(el, "d") : Array.isArray(startValue) ? startValue.toString() : startValue;
            const toPathEl = document.querySelector(toPathSelector);
            if (!toPathEl) return;
            runner.fromPath = { d: fromPath };
            runner.toPath = { d: attr(toPathEl, "d") };
            let destClone = toPathEl.cloneNode();
            toPathEl.pathString = attr(toPathEl, "d");
            destClone.pathString = toPathEl.pathString;
            const sbox = el.getBBox();
            movingUtility.move(destClone, sbox.x + sbox.width * 0.5, sbox.y + sbox.height * 0.5);
            runner.toPath.d = attr(destClone, "d");
            runner.interpolator = pathMorpherIns.mkMorph(runner.fromPath.d, runner.toPath.d);
            finalValue = runner.toPath.d;
          } else if (prop === "d") {
            startValue = Array.isArray(startValue) ? startValue.toString() : startValue;
            const reshapResult = new PathReshaper().reshape(startValue, finalValue);
            runner.interpolator = pathMorpherIns.mkMorph(reshapResult[0], reshapResult[1]);
          } else if (prop === "followPath") {
            const followedPath = document.querySelector(finalValue);
            if (!followedPath) return;
            const pathTotalLen = followedPath.getTotalLength();
            finalValue = pathTotalLen;
            if (!step.params?.reversed) runner.from(0);
            else { runner.from(finalValue); finalValue = 0; }
            runner.followedPath = followedPath;
            runner.params = { centered: step.params?.centered || false, rotated: step.params?.rotated || false, reversed: step.params?.reversed || false };
          } else if (prop in F.__EFFECTS) {
            runner = new Morphable();
            const { effectSelector, filterSelector, filterProperty } = step.params;
            runner.params = step.params;

            const effectEl = document.querySelector(`${effectSelector}`)[0];
            const propertyHandlerEl = effectEl?.findOne(filterSelector);
            if (propertyHandlerEl && startValue == null) startValue = attr(propertyHandlerEl, filterProperty);
          
            runner.from(startValue);
          }

          if (prop === "anchor") runner.to(step.value);
          else runner.to(finalValue);

          runner.staggered = Array.isArray(step.stagger) ? step.stagger : false;
          const b = F.EASINGS[step.easing] || F.EASINGS.linear;
          runner.stepper(step.steps ? new Ease(easing.steps(step.steps)) : new Ease(easing.bezier(b[0], b[1], b[2], b[3])));

          if (!F.__TRANSFORMS.includes(prop)) startValue = new runner._morphObj.constructor(runner.to());
          if (prop === "strokeDashoffset") runner.dashoffsetLen = F.utils.getTotLen(el);

          const tween = { el, _ghost: ghost, prop, runner, duration: stepDuration, delay: timings[0] };
          item.animatables[prop].push(tween);
        });
      }
      this.animations.push(item);
    });

    this._compile();
    if (this.config.autoplay) this.play();
    return this;
  }

  _compile() {
    const tweens = [];
    let calcMax = 0;
    for (const anim of this.animations)
      for (const prop in anim.animatables)
        for (const tw of anim.animatables[prop]) {
          tweens.push(tw);
          calcMax = Math.max(calcMax, (tw.delay || 0) + (tw.duration || 0));
        }
    this._allTweens = tweens;
    this.maxDuration = this.config.duration || calcMax;
  }

  _getElAnimDur(data) {
    const durations = [];
    for (const prop in data) {
      if (prop === "targets" || !data[prop] || !Array.isArray(data[prop])) continue;
      data[prop].forEach(kf => durations.push((kf.duration || 0) + (kf.delay || 0)));
    }
    return Math.min(0, Math.max(...durations));
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
    return this._allTweens.filter(tween => {
      const isPreDelay = elapsed < tween.delay;
      return !(this.isPlaying ? isPreDelay : isPreDelay && tween.runner.staggered);
    });
  }

  _render(elapsed) {
    const elapsedTweens = this._elapsed(elapsed);
    for (const tween of elapsedTweens) {
      if (this.fullReset && tween.runner.staggered) {
        if (!tween.delayTemp) tween.delayTemp = tween.delay;
        tween.delay = 0;
      } else if (!this.fullReset && tween.delayTemp) {
        tween.delay = tween.delayTemp;
      }
      let localProgress = Math.max(0, Math.min(1, (elapsed - tween.delay) / (tween.duration || 1)));
      this._animate(tween, elapsedTweens, localProgress);
    }
  }

  _animate(tween, elapsedTweens, localProgress) {
    const el = tween.el;
    let val, prop = tween.prop;
    const ghost = tween._ghost;

    val = tween.runner.at(localProgress);

    if (F.__TRANSFORMS.includes(prop)) {
      const { x: bx, y: by, width: bw, height: bh } = ghost.getBBox();
      const ox = bx + bw * ghost._anchor[0];
      const oy = by + bh * ghost._anchor[1];

      const transEl = () => transform(el, transform(ghost), false, true);

      const translateYTransformer = v => {
        transform(ghost, { translateY: v - transform(ghost).translateY }, true, true);
        transEl()
      };
      const rotateTransformer = v => {
        transform(ghost, { rotate: v - transform(ghost).rotate, ox, oy }, true, true);
        transEl()
      };
      const scaleTransformer = (tsX, tsY) => {
        transform(ghost, { scale: [tsX, tsY], ox, oy }, true, true);
        transEl()
      };
      const anchorTransform = v => { ghost._anchor = v; };

      if (prop === "translateX") { transform(el, val, false, true); transform(ghost, val, false, true); }
      else if (prop === "translateY") translateYTransformer(val.dec().translateY);
      else if (prop === "anchor") anchorTransform(val);
      else if (F.__SCALES.includes(prop)) scaleTransformer(val.dec().scaleX, val.dec().scaleY);
      else if (prop === "rotate") rotateTransformer(val.dec().rotate);

      const transformers = { translateY: translateYTransformer, anchor: anchorTransform, scaleX: scaleTransformer, scaleY: scaleTransformer, rotate: rotateTransformer };

      if (!ghost._staticTranslateX) {
        for (const [p, transformer] of Object.entries(transformers)) {
          if (!this._hasTween(elapsedTweens, el, p)) {
            const v = ghost._transalterersStates[p];
            if (v) {
              F.__SCALES.includes(p) ? p === "scaleX" ? transformer(v, 1) : transformer(1, v)
              : transformer(v);
            }
          }
        }
      }
    } else if (prop === "morphTo" || prop === "d") {
      val = tween.runner.interpolator(localProgress);
      attr(el, "d", val);
    } else if (prop === "followPath") {
      const fv = F.utils.followVal(tween, val);
      transform(el, fv.transform, false, true);
      if (fv.centered) {
        const { x, y, width, height } = el.getBBox();
        transform(el, { translate: [-(x + width / 2), -(y + height / 2)] }, true, true);
      }
      if (fv.rotated) transform(el, { rotate: fv.angle - transform(el).rotate }, true, true);
    } else if (prop in F.__COLORS) {
      if (tween.runner.gradientType) {
        const gd = F.utils.parseGradArr(val);
        F.utils.setGradEl(el, ghost, prop, tween.runner.gradientType, gd.angle, gd.stops);
      } else {
        attr(prop === "fill" ? (ghost._baseRefEl || el) : el, prop, rgba(val));
      }
    } else if (F.__SIZES.includes(prop)) {
      const box = el.getBBox();
      box.width = prop === "width" ? val : box.width;
      box.height = prop === "height" ? val : box.height;
      if (F.utils.isText(el)) attr(el, "font-size", val);
      else {
        sizingUtility.size(el, box.width, box.height);
        if (F.utils.isMedia(el)) updateImg(el, box.width, box.height);
      }
    } else if (prop in F.__EFFECTS) {
      const { effectSelector, filterSelector, filterProperty } = tween.runner.params;
      const effectEl = document.querySelector(`${effectSelector}`);
      const propertyHandlerEl = effectEl?.querySelector(filterSelector);
      if (propertyHandlerEl) {
        if (prop === "effectColor" && filterProperty === "flood-color")
          val = rgba(val);
        attr(propertyHandlerEl, filterProperty, val.toString());
      }
    } else if (prop === "borderRadius") {
      attr(el, 'rx', val); attr(el, 'ry', val);
    } else if (prop === "maskedBy") {
      const v = val.value[0];
      const maskHolder = ghost._baseRefEl ? ghost._baseRefEl.parentNode : el;
      if (v !== (attr(maskHolder, "_mask") || "")) {
        attr(maskHolder, "mask", v ? `url(#${v})` : v);
        attr(maskHolder, "_mask", v);
      }
    } else if (prop === "maskType") {
      const f = val.value[0] === "out" ? ["black", "white"] : ["white", "black"];
      ghost._maskEl.childNodes.forEach((c, i) => attr(c, "fill", i === 0 ? f[0] : f[1]));
    } else {
      if (prop in F.__STROKE) {
        prop = F.__STROKE[prop];
        if (prop === "stroke-dasharray") val = val.join(" ").trim();
        if (prop === "stroke-dashoffset") {
          let dashoffsetLen = tween.runner.dashoffsetLen;
          const targetSizeChanged = this._elHasProps(el, [...F.__SIZES, ...F.__SCALES]);
          if (targetSizeChanged) dashoffsetLen = F.utils.getTotLen(el);
          val = dashoffsetLen * (val / 100);
          if (!attr(el, "stroke-dasharray") || targetSizeChanged) {
            if (!attr(el, "stroke-dasharray"))
              this.dirtyProperties.add({ el: el, property: "stroke-dasharray" });
            attr(el, "stroke-dasharray", dashoffsetLen);
          }
        }
      }
      attr(el, prop, val);
    }

    if (F.__GEOM_MODIFIERS.includes(prop)) {
      attr(tween._ghost, prop, val);
      tween._ghost._bbox = el.getBBox();
    }
  }

  _cleanDirtyProps() {
    this.dirtyProperties.forEach(d => attr(d.el, d.property, null));
    this.dirtyProperties.clear();
  }

  play(direction = 1) {
    this.pause();
    setTimeout(() => {
      this._cleanDirtyProps();
      this.isPlaying = true;
      this.isCompleted = false;
      if (direction === 1 && this.lastElapsed >= this.maxDuration) this.lastElapsed = 0;
      if (direction === -1 && this.lastElapsed <= 0) this.lastElapsed = this.maxDuration;

      let startTime = null;
      const initialElapsed = this.lastElapsed;
      const tick = now => {
        if (!startTime) startTime = now;
        const progressDelta = (now - startTime) * this.config.speed;
        let elapsed = direction === 1 ? initialElapsed + progressDelta : initialElapsed - progressDelta;

        if (elapsed > this.maxDuration || elapsed < 0) {
          if (this.config.loop) {
            this.lastElapsed = elapsed > this.maxDuration ? 0 : this.maxDuration;
            startTime = now;
            this.play(direction);
          } else {
            this.lastElapsed = elapsed > this.maxDuration ? this.maxDuration : 0;
            this._render(this.lastElapsed);
            if (this.config.onComplete) this.config.onComplete();
            this.pause();
            if (this.lastElapsed === this.maxDuration) this.isCompleted = true;
          }
          return;
        }

        this.lastElapsed = elapsed;
        this._render(elapsed);
        this.progress = (elapsed / this.maxDuration) * 100;
        if (this.config.onUpdate) this.config.onUpdate();
        this.rafId = requestAnimationFrame(tick);
      };
      this.rafId = requestAnimationFrame(tick);
    }, 100);
  }

  pause() { this.isPlaying = false; if (this.rafId) cancelAnimationFrame(this.rafId); }

  _initState(el, prop, ghost) {
    if (F.__TRANSFORMS.includes(prop)) return new Matrix(el);
    if (prop in F.__COLORS) {
      const fill = attr(ghost._baseRefEl || el, prop) || "#000";
      if (fill.includes("url")) {
        const id = fill.match(/#([^") ]*)/)[1];
        return F.utils.cssGrad(document.querySelector(`#${id}`));
      }
      return fill;
    }
    if (prop === "followPath") return 0;
    if (prop in F.__PATHS) return attr(el, "d");
    if (prop in F.__EFFECTS) return null;
    if (prop === "borderRadius") return attr(el, "rx") || 0;
    if (prop === "maskedBy") {
      const mask = attr(ghost._baseRefEl?.parentNode ?? el, "mask") || "";
      return mask.split("#")[1]?.slice(0, -1) ?? "";
    }
    if (prop === "maskType") return attr(ghost._maskEl.firstChild, "fill") === "white" ? "in" : "out";
    return attr(el, prop) || 0;
  }

  _reorder(obj) {
    const result = {};
    [...F.__TRANSFORMS, ...F.__SIZES].forEach(key => { if (key in obj) result[key] = obj[key]; });
    Object.keys(obj).forEach(key => { if (!(key in result)) result[key] = obj[key]; });
    return result;
  }

  _calcStagger(delay, staggerArr, totalElements, index, totalDuration) {
      let [s, r, g] = staggerArr;
      if (typeof s === "string") s = (totalElements * parseInt(s)) / 100;
      if (typeof r === "string") r = (totalElements * parseInt(r)) / 100;
      const step = totalDuration * (g / 100);
      const segWidth = step / Math.round(totalElements / r);
      const relIndex = Math.floor((index - s) / r);
      return [Math.ceil(delay + segWidth * relIndex), Math.ceil(step - segWidth)];
    }
  
}