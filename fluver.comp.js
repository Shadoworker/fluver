const numberAndUnit = /^([+-]?(\d+(\.\d*)?|\.\d+)(e[+-]?\d+)?)([a-z%]*)$/i;
const transforms = /\)\s*,?\s*/;
const delimiter = /[\s,]+/;const attr = (el, k, v) => v === undefined ? el.getAttribute(k) : el.setAttribute(k, v);
const svgEl = tag => document.createElementNS("http://www.w3.org/2000/svg", tag);
const MATH = Math, isArray = Array.isArray, num = parseFloat, query = (sel) => document.querySelector(sel);
const rgba = v => `rgba(${v[0]},${v[1]},${v[2]},${v[3]})`;
const rad = d => ((d % 360) * MATH.PI) / 180;const segmentParameters = { M: 2, C: 6, Z: 0 };
const pathHandlers = {
M(c, p, p0) { p.x = p0.x = c[0]; p.y = p0.y = c[1]; return ['M', p.x, p.y]; },
C(c, p) { p.x = c[4]; p.y = c[5]; return ['C', c[0], c[1], c[2], c[3], c[4], c[5]]; }
};for (const ch of ['m', 'c']) {
pathHandlers[ch] = (I => (c, p, p0) => {
for (let j = 0; j < c.length; j++) c[j] += j % 2 ? p.y : p.x;
return pathHandlers[I](c, p, p0);
})(ch.toUpperCase());
}const makeAbs = p => pathHandlers[p.segment[0]](p.segment.slice(1), p.p, p.p0);
const segComplete = p => p.segment.length && p.segment.length - 1 === segmentParameters[p.segment[0].toUpperCase()];function newSeg(parser, token) {
if (parser.inNumber) finNum(parser, false);
const pathLetter = /[MC]/i.test(token);
if (pathLetter) parser.segment = [token];
parser.inSegment = true;
return pathLetter;
}function finNum(parser, inNumber) {
if (!parser.inNumber) throw new Error('Parser Error');
if (parser.number) parser.segment.push(parseFloat(parser.number));
parser.inNumber = inNumber;
parser.number = '';
parser.pointSeen = false;
parser.hasExponent = false;
if (segComplete(parser)) finSeg(parser);
}function finSeg(parser) {
parser.inSegment = false;
if (parser.absolute) parser.segment = makeAbs(parser);
parser.segments.push(parser.segment);
}function pathParse(d, toAbsolute = true) {
let index = 0, token = '';
const parser = {
segment: [], inNumber: false, number: '', lastToken: '',
inSegment: false, segments: [], pointSeen: false, hasExponent: false,
absolute: toAbsolute, p0: new Point(), p: new Point()
};while (parser.lastToken = token, token = d.charAt(index++)) {
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
}if (parser.inNumber) finNum(parser, false);
if (parser.inSegment && segComplete(parser)) finSeg(parser);
return parser.segments;
}const isExponential = parser => parser.lastToken.toUpperCase() === 'E';
const isArc = parser => parser.segment.length && parser.segment[0].toUpperCase() === 'A' && (parser.segment.length === 4 || parser.segment.length === 5);const pPath = (d = 'M0 0') => pathParse(isArray(d) ? Array.prototype.concat.apply([], d).toString() : d);function pPoly(array = [0, 0]) {
const points = [];
array = isArray(array) ? Array.prototype.concat.apply([], array) : array.trim().split(delimiter).map(parseFloat);
if (array.length % 2 !== 0) array.pop();
for (let i = 0; i < array.length; i += 2) points.push([array[i], array[i + 1]]);
return points;
}const bezier = (y1, y2) => t => 3 * t * (1 - t) ** 2 * y1 + 3 * t ** 2 * (1 - t) * y2 + t ** 3;
const stepsEase = n => t => MATH.min(n, MATH.max(0, MATH.floor(t * n))) / n;
class SVGNumber {
constructor(v) { this.init(v); }
init(v) {
let u = isArray(v) ? v[1] : "", m;
v = isArray(v) ? v[0] : v;
this.value = 0;
if (typeof v == "number") this.value = isNaN(v) ? 0 : isFinite(v) ? v : v < 0 ? -3.4e38 : 3.4e38;
else if (v instanceof SVGNumber) { this.value = v.value; u = v.unit; }
else if (typeof v == "string" && (m = v.match(numberAndUnit))) {
this.value = num(m[1]);
u = m[5];
if (u == "%") this.value /= 100;
else if (u == "s") this.value *= 1e3;
}
this.unit = u || "";
return this;
}
toArray() { return [this.value, this.unit]; }
toString() { const { value: v, unit: u } = this; return (u == "%" ? ~~(v * 1e8) / 1e6 : u == "s" ? v / 1e3 : v) + u; }
valueOf() { return this.value; }
}
class SVGArray extends Array {
init(a) { this.length = 0; this.push(...(isArray(a) ? a : a.trim().split(delimiter).map(num))); return this; }
toArray() { return [].concat(...this); }
toString() { return this.join(" "); }
}
class NonMorph {
init(v) { this.value = v; return this; }
toArray() { return [this.value]; }
valueOf() { return this.value; }
}
class Point { constructor() { this.x = this.y = 0; } }
const TF = "transform", KEYS = [..."abcdef"], I6 = [1, 0, 0, 1, 0, 0];
const isMx = o => o && KEYS.some(k => o[k] != null);
const mtxify = el => (attr(el, TF) || "").split(transforms).slice(0, -1)
.reduce((m, s) => m.mulO(new Matrix(s.split("(")[1].split(delimiter).map(num))), new Matrix());
class Matrix {
constructor(...a) { this.init(a.length > 1 ? a : a[0] instanceof Element ? mtxify(a[0]) : a[0]); }
init(s) {
const v = isArray(s) ? s : isMx(s) ? KEYS.map(k => s[k]) : [];
KEYS.forEach((k, i) => this[k] = v[i] ?? I6[i]);
return this;
}
toArray() { return KEYS.map(k => this[k]); }
toString() { return `matrix(${this.toArray()})`; }
mulO(r) {
const { a, b, c, d, e, f } = this;
return Object.assign(this, { a: a * r.a + c * r.b, b: b * r.a + d * r.b, c: a * r.c + c * r.d, d: b * r.c + d * r.d, e: e + a * r.e + c * r.f, f: f + b * r.e + d * r.f });
}
dec() {
const { a, b, c, d, e, f } = this, det = a * d - b * c, ccw = det > 0 ? 1 : -1;
const sx = ccw * MATH.sqrt(a * a + b * b), th = MATH.atan2(ccw * b, ccw * a), lam = (a * c + b * d) / det;
return { sx, sy: (c * sx) / (lam * a - b) || (d * sx) / (lam * b + a), ro: (180 / MATH.PI) * th, tx: det ? e : NaN, ty: det ? f : NaN };
}
transform(o) {
if (isMx(o)) return new Matrix(o).mulO(this);
const { a, b, c, d, e, f } = this, s = o.scale, tr = o.translate || o.tx, ox = o.ox ?? 0, oy = o.oy ?? 0;
const pick = (i, v) => (s?.length ? s[i] : isFinite(s) ? s : isFinite(v) ? v : 1) * 1;
const [tx, ty] = isArray(tr) ? tr : [tr, o.ty];
const X = a * ox + c * oy + e, Y = b * ox + d * oy + f, r = rad(o.ro || 0), cos = MATH.cos(r), sin = MATH.sin(r);
return [[1, 0, 0, 1, -X || 0, -Y || 0], [pick(0, o.sx), 0, 0, pick(1, o.sy), 0, 0], [cos, sin, -sin, cos, 0, 0], [1, 0, 0, 1, X || 0, Y || 0], [1, 0, 0, 1, tx || 0, ty || 0]]
.reduce((m, t) => new Matrix(t).mulO(m), new Matrix(this));
}
}
const arrToStr = a => a.map(seg => seg[0] + seg.slice(1).filter(v => v != null).join(' ')).join('') + ' ';const movingUtility = {
el: null,
move(el, x, y) {
this.el = el;
return attr(el, 'id').split('-')[1] === 'path' ? this.movePath(x, y) : '';
},
movePath(x, y) {
const box = this.el.getBBox();
x -= box.x + box.width * 0.5;
y -= box.y + box.height * 0.5;
const pathArray = pPath(attr(this.el, 'd'));
if (!isNaN(x) && !isNaN(y)) {
for (let i = pathArray.length - 1; i >= 0; i--) {
const l = pathArray[i][0];
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
};const resize = (el, width, height) => {
const type = String(el.tagName || "").toLowerCase(), b = el.getBBox();
if (type == "rect" || type == "image") { attr(el, "width", new SVGNumber(width)); attr(el, "height", new SVGNumber(height)); }
else if (type == "ellipse") {
const [cx, cy, Rx, Ry] = ["cx", "cy", "rx", "ry"].map(k => attr(el, k)), rx = new SVGNumber(width).value / 2, ry = new SVGNumber(height).value / 2;
attr(el, "rx", rx); attr(el, "cx", ((cx || 0) - (Rx || 0)) + rx);
attr(el, "ry", ry); attr(el, "cy", ((cy || 0) - (Ry || 0)) + ry);
} else if (type == "path") {
const W = b.width || 1, H = b.height || 1, a = pPath(attr(el, "d"));
for (const s of a) for (let j = 1; j < s.length; j++) s[j] = j % 2 ? ((s[j] - b.x) * width) / W + b.x : ((s[j] - b.y) * height) / H + b.y;
attr(el, "d", arrToStr(a));
} else if (type == "polygon") {
const pts = pPoly(attr(el, "points"));
for (const p of pts) {
if (b.width) p[0] = (p[0] - b.x) * width / b.width + b.x;
if (b.height) p[1] = (p[1] - b.y) * height / b.height + b.y;
}
attr(el, "points", pts.map(p => p.join(",")).join(" "));
}
};
;const transform = (el, o, rel) => o ? attr(el, TF, new Matrix(rel && el).transform(o)) : new Matrix(el).dec();
const morphableTypes = [SVGNumber, Matrix, SVGArray, NonMorph];
const typeOf = v => typeof v == "number" ? SVGNumber
: typeof v == "string" ? (delimiter.test(v) ? SVGArray : numberAndUnit.test(v) ? SVGNumber : NonMorph)
: morphableTypes.includes(v.constructor) ? v.constructor : isArray(v) ? SVGArray : undefined;
class Morphable {
_set(v) {
const T = this._type = this._type || typeOf(v);
this._obj = this._obj || new T();
return new T().init(v).toArray();
}
from(v) { if (v != null) this._from = this._set(v); }
to(v) { if (v != null) this._to = this._set(v); }
at(pos) { return this._obj.init(this._from.map((f, i) => typeof f != "number" ? (pos < 1 ? f : this._to[i]) : f + (this._to[i] - f) * this.ease(pos))); }
next() { return this._type == NonMorph ? this._to[0] : new this._type().init(this._to); }
}
class PathMorpher {
constructor(segments = 128) {
this.segments = segments;
this.sampler =  document.createElementNS("http://www.w3.org/2000/svg", "path");
}
sample(d) {
if (!this.sampler) return [];
attr(this.sampler, "d", d);
const len = this.sampler.getTotalLength();
return Array.from({ length: this.segments + 1 }, (_, i) => {
const p = this.sampler.getPointAtLength((i / this.segments) * len);
return [p.x, p.y];
});
}
align(a, b) {
const s = this.bestShift(a, b);
return [...b.slice(s), ...b.slice(0, s)];
}
sameMorph(d1, d2) {
const nums = (d) => (d.match(/[+-]?\d*\.?\d+(?:e[+-]?\d+)?/gi) || []).map(Number);
const closed = d => { const n = nums(d); return /z\s*$/i.test(d) || (MATH.abs(n[n.length - 2] - n[0]) < 1e-6 && MATH.abs(n[n.length - 1] - n[1]) < 1e-6); };
const cubicOnly = (d) => {
const c = d.match(/[a-z]/gi) || [];
if (c[0] !== "M" || c.length < 2) return false;
const body = c.slice(1);
if (body[body.length - 1].toUpperCase() === "Z") body.pop();
return body.length > 0 && body.every(x => x === "C") && nums(d).length === 2 + 6 * body.length;
};
if (!cubicOnly(d1) || !cubicOnly(d2) || closed(d1) !== closed(d2)) return null;
const full = (d) => {
const n = nums(d), lx = n[n.length - 2], ly = n[n.length - 1];
if (!closed(d) || (MATH.abs(lx - n[0]) < 1e-6 && MATH.abs(ly - n[1]) < 1e-6)) return n;
return [...n, lx + (n[0] - lx) / 3, ly + (n[1] - ly) / 3, lx + (2 * (n[0] - lx)) / 3, ly + (2 * (n[1] - ly)) / 3, n[0], n[1]];
};
const a = full(d1), b = full(d2);
if (a.length !== b.length) return null;
const count = (b.length - 2) / 6, ends = (n) => Array.from({ length: count }, (_, i) => [n[6 + i * 6], n[7 + i * 6]]);
const shift = closed(d1) ? this.bestShift(ends(a), ends(b)) : 0;
const to = shift ? [b[2 + ((shift - 1) % count) * 6 + 4], b[2 + ((shift - 1) % count) * 6 + 5]] : [b[0], b[1]];
for (let i = 0; i < count; i++) to.push(...b.slice(2 + ((i + shift) % count) * 6, 8 + ((i + shift) % count) * 6));
return (t) => {
const v = a.map((x, i) => x + (to[i] - x) * t);
let d = `M${v[0]},${v[1]}`;
for (let i = 2; i < v.length; i += 6) d += `C${v[i]},${v[i + 1]} ${v[i + 2]},${v[i + 3]} ${v[i + 4]},${v[i + 5]}`;
return d;
};
}
bestShift(a, b) {
let best = 0, min = Infinity;
for (let s = 0; s < a.length; s++) {
let dist = 0;
for (let i = 0; i < a.length; i++) {
const j = (i + s) % a.length;
dist += (a[i][0] - b[j][0]) ** 2 + (a[i][1] - b[j][1]) ** 2;
}
if (dist < min) { min = dist; best = s; }
}
return best;
}
mkMorph(d1, d2) {
const same = this.sameMorph(d1, d2);
if (same) return same;
const p1 = this.sample(d1);
const p2 = this.align(p1, this.sample(d2));
return (t) => {
const interpolated = p1.map((p, i) => [p[0] + (p2[i][0] - p[0]) * t, p[1] + (p2[i][1] - p[1]) * t]);
return interpolated.reduce((path, p, i) => {
if (i === 0) return `M${p[0]},${p[1]}`;
const prev = interpolated[i - 1];
return path + `C${(prev[0] * 2 + p[0]) / 3},${(prev[1] * 2 + p[1]) / 3} ${(prev[0] + p[0] * 2) / 3},${(prev[1] + p[1] * 2) / 3} ${p[0]},${p[1]}`;
}, "");
};
}
}class PathReshaper {
constructor() {
this.commandsRegex = /([MC])([^MC]+)/gi;
this._sampler = document.createElementNS("http://www.w3.org/2000/svg", "path");
}
_smplPath(d) {
attr(this._sampler, "d", d);
this._sampler.shapePoints = this.getCrvPts(d);
}
mkPt(x, y, cp0x = 0, cp0y = 0, cp1x = 0, cp1y = 0) {
const cp0 = { x: cp0x, y: cp0y }, cp1 = { x: cp1x, y: cp1y }, point = { x, y, cp0, cp1 };
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
} else if (type === "C") {
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
mkBez(prev_ep, ep) { return `C${prev_ep.cp1.x} ${prev_ep.cp1.y} ${ep.cp0.x} ${ep.cp0.y} ${ep.x} ${ep.y}`; }
sameEndPt(p1, p2, eps = 0.001) { return MATH.abs(p1.x - p2.x) < eps && MATH.abs(p1.y - p2.y) < eps; }
findPt(points1, points2) {
for (let i = 0; i < points2.length; i++) {
if (!points1.some(p => this.sameEndPt(p, points2[i])))
return { added: points2[i], insertIndex: i, prevInsertIndex: i - 1, nextInsertIndex: i + 1 };
}
return null;
}
getCrvPts(d) {
const commands = d.match(this.commandsRegex) || [], points = [], step = 1 / 150;
let currentX = 0, currentY = 0;
for (const command of commands) {
const type = command[0], values = command.substring(1).trim().split(/[\s,]+/).map(parseFloat);
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
const reshapedIdx = points2.length > points1.length ? 0 : 1, keptIdx = 1 - reshapedIdx;
const pointsToReshape = reshapedIdx === 0 ? points1 : points2;
const pointsToKeep = keptIdx === 0 ? points1 : points2;
const pathToKeep = keptIdx === 0 ? path1 : path2;
const diff = this.findPt(pointsToReshape, pointsToKeep);if (!diff || points1.length === points2.length) return { 0: path1, 1: path2 };

const { added, insertIndex, prevInsertIndex, nextInsertIndex } = diff;
const start = pointsToKeep[prevInsertIndex], end = pointsToKeep[nextInsertIndex];
const start_ = pointsToReshape[prevInsertIndex], end_ = pointsToReshape[insertIndex];

this._smplPath(pathToKeep);
const result = this.splitBez(start_, start_.cp1, end_.cp0, end_, this.getPtRelIdx(added, start, end));
const { newPoint, endPoint, startPoint } = result;

pointsToReshape.splice(insertIndex, 0, this.mkPt(newPoint.ep.x, newPoint.ep.y, newPoint.cp0.x, newPoint.cp0.y, newPoint.cp1.x, newPoint.cp1.y));
pointsToReshape[prevInsertIndex].cp1.x = startPoint.cp.x;
pointsToReshape[prevInsertIndex].cp1.y = startPoint.cp.y;
pointsToReshape[nextInsertIndex].cp0.x = endPoint.cp.x;
pointsToReshape[nextInsertIndex].cp0.y = endPoint.cp.y;

return { [reshapedIdx]: this.render(pointsToReshape), [keptIdx]: pathToKeep };
}
}const pathMorpherIns = new PathMorpher();
const maskHolder = el => el.tagName != "g" ? el.parentNode : el, _imgCache = new Map(), DA = "stroke-dasharray", BLACK = "rgba(0,0,0,1)";
const TRANSFORMS = ["tx", "ty", "an", "sx", "sy", "ro", "sk", "sky"], SCALES = ["sx", "sy"], SIZES = ["w", "h"];
const COLORS = { f: "fill", st: "stroke" }, PATHS = { fp: 1, mo: 1, d: 1 }, EFFECTS = { ex: 1, ey: 1, eb: 1, ec: 1 };
const STROKE = { sw: "stroke-width", da: DA, do: "stroke-dashoffset" };
// each easing: the curve's two y control values, bezier(y1, y2)
const EASINGS = {
li: [0, 1], iq: [0.085, 0.53], oq: [0.46, 0.94], ioq: [0.03, 0.955], ic: [0.055, 0.19], oc: [0.61, 1],
ioc: [0.045, 1], iq4: [0.03, 0.22], oq4: [0.84, 1], ioq4: [0, 1], iq5: [0.05, 0.06], oq5: [1, 1],
ioq5: [0, 1], is: [0, 0.715], os: [0.575, 1], ios: [0.05, 0.95], ie: [0.05, 0.035], oe: [1, 1],
ioe: [0, 1], ir: [0.04, 0.335], or: [0.82, 1], ior: [0.135, 0.86], iel: [-0.03, 0.715], oel: [0.575, 1.425],
ioel: [-0.55, 1.55], ib: [-0.28, 0.045], ob: [0.885, 1.275], iob: [-0.55, 1.55]
};
const toDeg = r => r * 180 / MATH.PI, clamp01 = v => MATH.max(0, MATH.min(1, v));
const skewOf = el => {
const [x, py, y, px] = (attr(el, "skew") || "").trim().split(delimiter).map(Number), n = v => isFinite(v) ? v : 0;
return { x: n(x), y: n(y), px: n(px), py: n(py) };
};
const tans = s => [MATH.tan(rad(s.x || 0)), MATH.tan(rad(s.y || 0))];
const unskew = (m, s) => { const [tx, ty] = tans(s); return new Matrix(m).mulO(new Matrix(1, -ty, -tx, 1 + tx * ty, tx * s.py, ty * s.px - tx * ty * s.py)); };
const reskew = (m, from, to) => { const [tx, ty] = tans(to); return unskew(m, from).mulO(new Matrix(1 + tx * ty, ty, tx, 1, -(tx * ty * to.px + tx * to.py), -ty * to.px)); };
const rotOf = el => (el._sk?.y ? unskew(new Matrix(el), el._sk) : new Matrix(el)).dec().ro;
const getTotLen = el => el.getTotalLength && el.getTotalLength();
const ctmOf = node => {
let top = null;
for (let n = node; n && n.nodeType === 1 && n !== node.ownerSVGElement; n = n.parentNode) if (getComputedStyle(n).display == "none") top = n;
if (!top) return node.getCTM();
const chain = [];
for (let n = node; ; n = n.parentNode) { chain.unshift(n); if (n === top) break; }
let m = top.parentNode.getCTM ? top.parentNode.getCTM() : node.ownerSVGElement.createSVGMatrix();
chain.forEach(n => { const t = n.transform && n.transform.baseVal.consolidate(); if (t) m = m.multiply(t.matrix); });
return m;
};
const svgPt = (svg, p, m) => { const sp = svg.createSVGPoint(); sp.x = p.x; sp.y = p.y; return sp.matrixTransform(m); };
const buildLUT = path => {
const svg = path.ownerSVGElement, ctm = ctmOf(path), len = getTotLen(path), lut = [], arc = [];
for (let i = 0; i <= 1000; i++) {
const q = lut[i] = svgPt(svg, path.getPointAtLength((i / 1000) * len), ctm), o = lut[i - 1];
if (o) { const dx = q.x - o.x, dy = q.y - o.y; arc[i] = arc[i - 1] + MATH.sqrt(dx * dx + dy * dy); } else arc[i] = 0;
}
return { lut, arc, total: arc[1000] };
};
const sampleLUT = ({ lut, arc, total }, t) => {
const target = clamp01(t) * total;
let lo = 0, hi = lut.length - 1;
while (lo < hi - 1) { const mid = (lo + hi) >> 1; arc[mid] < target ? lo = mid : hi = mid; }
const k = (target - arc[lo]) / (arc[hi] - arc[lo] || 1);
return { x: lut[lo].x + (lut[hi].x - lut[lo].x) * k, y: lut[lo].y + (lut[hi].y - lut[lo].y) * k };
};
const cssGrad = el => {
const pc = v => v.includes("%") ? v : num(v) * 100 + "%";
const stops = [...el.querySelectorAll("stop")].map(s => `${attr(s, "stop-color") || BLACK} ${pc(attr(s, "offset") || "0")}`).join(", ");
if (el.tagName == "radialGradient") return `radial-gradient(circle, ${stops})`;
const [x1, y1, x2, y2] = ["x1", "y1", "x2", "y2"].map(k => num(attr(el, k) || 0));
return `linear-gradient(${((toDeg(MATH.atan2(y2 - y1, x2 - x1)) + 90) % 360).toFixed(0)}deg, ${stops})`;
};
const isGradient = c => c.includes && c.includes("%");
const fmtGrad = (i, t) => {
const re = /rgba?(\(\s*\d+\s*,\s*\d+\s*,\s*\d+)(?:\s*,.+?)?\)/g;
if (isGradient(t) && !isGradient(i)) i = t.toLowerCase().replaceAll(re, i);
else if (isGradient(i) && !isGradient(t)) t = i.toLowerCase().replaceAll(re, t);
return [i, t];
};
const gradArr = s => {
const [anglePart, ...stops] = (s.split("gradient(")[1].split("%)")[0].toLowerCase() + "%").split(", rgba");
const a = [parseInt(anglePart.split("deg")[0]), ...stops.flatMap(st => [...rgbaToArr("rgba" + st.split(") ")[0] + ")"), parseInt(st.split(") ")[1])])];
a.type = s.split("-gradient")[0];
return a;
};
const rgbaToArr = color => {
color = String(color || "").trim();
if (color[0] == "#") {
let h = color.slice(1);
if (h.length === 3 || h.length === 4) h = h.split("").map(c => c + c).join("");
const n = i => parseInt(h.slice(i, i + 2), 16);
return [n(0), n(2), n(4), h.length === 8 ? n(6) / 255 : 1];
}
const v = color.replace(/^rgba?\(|\s+|\)$/g, "").split(","), a = num(v[3]);
return [parseInt(v[0]) || 0, parseInt(v[1]) || 0, parseInt(v[2]) || 0, isFinite(a) ? a : 1];
};
const setGrad = (el, prop, type, d) => {
const id = `${attr(el, "id")}-gr-i-${prop}`, g = svgEl(type + "Gradient");
query(`#${id}`)?.remove();
let at = { cx: "50%", cy: "50%", r: "50%", fx: "50%", fy: "50%" };
if (type == "linear") {
const r = ((parseInt(d[0]) + 90) * MATH.PI) / 180, c = 0.5 * MATH.cos(r), s = 0.5 * MATH.sin(r);
at = { x1: 0.5 + c, y1: 0.5 + s, x2: 0.5 - c, y2: 0.5 - s };
}
at = { id, gradientUnits: "objectBoundingBox", spreadMethod: "pad", ...at };
for (const k in at) if (at[k]) attr(g, k, at[k]);
for (let i = 1; i < d.length; i += 5) {
const stop = svgEl("stop");
attr(stop, "offset", `${d[i + 4].toFixed(2)}%`);
attr(stop, "stop-color", rgba(d.slice(i, i + 4)));
g.appendChild(stop);
}
el.ownerSVGElement.querySelector("defs").appendChild(g);
attr(el, COLORS[prop], `url(#${id})`);
};
const updateImg = async (el, iw, ih) => {
const pattern = query(`#${attr(el, "id")}-p-bg`), img = pattern.firstChild;
if (!iw || !ih) {
const href = attr(img, "href") || attr(img, "xlink:href");
({ w: iw, h: ih } = await (_imgCache.get(href) || new Promise(res => {
const im = new Image();
im.onload = () => { const z = { w: im.naturalWidth, h: im.naturalHeight }; _imgCache.set(href, z); res(z); };
im.src = href;
})));
}
const x = num(attr(el, "x")), y = num(attr(el, "y")), { width: w, height: h } = el.getBBox(), k = iw > ih ? h / ih : w / iw;
for (const [node, o] of [[pattern, { width: iw, height: ih, x: x + (w - iw * k) / 2, y: y + (h - ih * k) / 2 }], [img, { width: iw, height: ih, transform: `scale(${k})` }]]) for (const key in o) attr(node, key, o[key]);
};
class F {
constructor(o = {}) {
this.animations = [];
this._allTweens = [];
this.config = { loop: o.loop || false, onUpdate: o.update, onComplete: o.complete };
this.maxDuration = this.lastElapsed = 0;
this.dirtyProperties = new Set();
}
add(data) {
data = this._reorder(data);
const els = document.querySelectorAll(data.t), hasTr = TRANSFORMS.some(p => p in data), hastx = "tx" in data;
els.forEach((el, i) => {
const ghost = el.cloneNode(), an = attr(el, "anchor")?.replace(/(\w+)\s*:/g, '"$1":'), A = an && JSON.parse(an);
ghost._bbox = el.getBBox();
ghost._anchor = A ? [A.x, A.y] : [0.5, 0.5];
ghost._skew = ghost._sk = skewOf(el);
ghost._maskEl = query(`#${attr(el, "id")}-m-`);
ghost._transalterersStates = {};
if (hasTr && !hastx) { data.tx = [{}]; data = this._reorder(data); ghost._statictx = true; }
const item = { el, animatables: {} };
for (const prop in data) {
if (prop == "t" || !isArray(data[prop])) continue;
const tweens = item.animatables[prop] = [], steps = data[prop], isTr = TRANSFORMS.includes(prop);
let sv = this._initState(el, prop, ghost), sa = ghost._anchor;
if ((prop == "ro" || SCALES.includes(prop)) && ghost._skew.y) sv = unskew(sv, ghost._skew);
steps.forEach((step, j) => {
const value = step.v, g = step.s, p = step.p, runner = new Morphable();
const tm = isArray(g) ? this._calcStagger(step.w || 0, g, els.length, i, step.d) : [step.w || 0, 0];
let fin = value, from = sv;
runner.p = p;
if (prop == "sk" || prop == "sky") sv = value;
else if (isTr) {
// (for an anchor sv is the previous [x, y] key, not a matrix: val isn't used there)
const val = value - (sv.dec?.() || sv)[prop];
if (prop == "tx" || prop == "ty") {
fin = sv.transform({ translate: [prop == "tx" ? val : 0, prop == "ty" ? val : 0] });
if (prop == "ty") ghost._transalterersStates.ty = value;
} else {
if (prop == "an") from = sa;
else fin = sv.transform({ [prop]: SCALES.includes(prop) ? value / sv.dec()[prop] : val });
ghost._transalterersStates[prop] = value;
}
sv = fin; sa = value;
} else if (prop in COLORS) {
if (isGradient(fin)) {
const [ic, tc] = fmtGrad(sv, fin), fg = gradArr(tc);
from = gradArr(ic).toLocaleString();
fin = fg.toLocaleString();
runner.gradientType = fg.type;
} else { from = rgbaToArr(sv); fin = rgbaToArr(fin); }
sv = value;
} else if (prop == "da") {
// pad the shorter list with its last value; "none" or junk counts as 0
const diff = fin.length - sv.length, ints = a => a.map(e => parseInt(e) || 0);
if (diff > 0) sv = [...sv, ...Array(diff).fill(sv.at(-1))];
else fin = [...fin, ...Array(-diff).fill(fin.at(-1))];
from = sv = ints(sv);
fin = ints(fin);
} else if (prop == "mo") {
const toPathEl = query(fin);
if (!toPathEl) return;
runner.fromPath = { d: p?.rp ? attr(el, "d") : isArray(sv) ? sv.toString() : sv };
runner.toPath = { d: attr(toPathEl, "d") };
const destClone = toPathEl.cloneNode();
destClone.pathString = toPathEl.pathString = attr(toPathEl, "d");
const sbox = el.getBBox();
movingUtility.move(destClone, sbox.x + sbox.width * 0.5, sbox.y + sbox.height * 0.5);
runner.toPath.d = attr(destClone, "d");
runner.interpolator = pathMorpherIns.mkMorph(runner.fromPath.d, runner.toPath.d);
fin = runner.toPath.d;
} else if (prop == "d") {
sv = isArray(sv) ? sv.toString() : sv;
const reshapResult = new PathReshaper().reshape(sv, fin);
runner.interpolator = pathMorpherIns.mkMorph(reshapResult[0], reshapResult[1]);
} else if (prop == "fp") {
const path = query(fin);
if (!path) return;
const len = getTotLen(path), rev = !!p?.vd, prev = steps[j - 1];
const hasPg = q => q.p?.pg != null && isFinite(Number(q.p.pg)), pg = q => clamp01(Number(q.p.pg));
const end = hasPg(step) ? pg(step) : 1;
const start = hasPg(step) && prev && prev.v === step.v && !!prev.p?.vd === rev && hasPg(prev) ? pg(prev) : 0;
runner.followPathLength = len;
runner.followPathStart = rev ? 1 - start : start;
runner.followPathEnd = rev ? 1 - end : end;
from = len * runner.followPathStart;
fin = len * runner.followPathEnd;
runner.followedPath = path;
runner.lutData = buildLUT(path);
runner.p = { cd: p?.cd || false, rd: p?.rd || false, vd: rev };
} else if (prop in EFFECTS) {
const h = query(`${p.es}`)?.querySelector(p.fs);
if (h && sv == null) sv = attr(h, p.fp);
from = sv;
}
runner.from(from);
runner.to(fin);
const b = EASINGS[step.e] || EASINGS.li, held = step.st || step.steps || (step.e == "cn" ? 1 : 0);
if (prop == "fp") runner.followPathLinear = !held && (!step.e || step.e == "li" || step.e == "linear");
runner.ease = held ? stepsEase(held) : bezier(b[0], b[1]);
if (prop == "d" || prop == "mo") sv = fin;
else if (!isTr && !(prop in COLORS)) sv = runner.next();
if (prop == "do") runner.dashoffsetLen = getTotLen(el);
tweens.push({ el, _ghost: ghost, prop, runner, duration: step.d - tm[1], delay: tm[0] });
});
}
this.animations.push(item);
});
this._allTweens = this.animations.flatMap(a => Object.values(a.animatables).flat());
this.maxDuration = MATH.max(0, ...this._allTweens.map(t => (t.delay || 0) + (t.duration || 0)));
return this;
}
_render(elapsed) {
const map = new Map();
for (const tw of this._allTweens) {
const started = elapsed >= tw.delay, key = attr(tw.el, "id") + "_" + tw.prop;
if ((started || !this.isPlaying) && (started || !map.has(key))) map.set(key, tw);
}
const list = [...map.values()];
for (const tw of list) this._animate(tw, list, clamp01((elapsed - tw.delay) / (tw.duration || 1)));
}
_animate(tween, list, pr) {
const { el, _ghost: ghost, prop, runner } = tween, has = p => list.some(t => t.el === el && t.prop == p);
let val = runner.at(pr);
const { x: bx, y: by, width: bw, height: bh } = ghost._bbox, ox = bx + bw * ghost._anchor[0], oy = by + bh * ghost._anchor[1];
if (TRANSFORMS.includes(prop)) {
const fp = has("fp"), src = fp ? el : ghost, put = () => attr(el, TF, new Matrix(src));
const T = {
ty: v => { transform(ghost, { ty: v - transform(ghost).ty }, 1); put(); },
an: v => { ghost._anchor = v; },
sx: (x, y) => { transform(src, { scale: [x, y], ox, oy }, 1); put(); },
ro: v => { transform(src, { ro: v - rotOf(src), ox, oy }, 1); put(); }
};
if (prop == "tx") { if (!fp) { transform(el, val); transform(ghost, val); el._sk = ghost._sk = ghost._skew; } }
else if (prop == "an") T.an(val);
else if (prop == "sk" || prop == "sky") {
const from = src._sk || { x: 0, y: 0, px: 0, py: 0 }, to = { x: from.x || 0, y: from.y || 0, px: ox, py: oy };
to[prop == "sk" ? "x" : "y"] = Number(val?.value ?? val) || 0;
attr(src, TF, reskew(new Matrix(src), from, to));
src._sk = el._sk = to;
put();
} else { const D = val.dec(); prop == "ty" ? T.ty(D.ty) : prop == "ro" ? T.ro(D.ro) : T.sx(D.sx, D.sy); }
if (!ghost._statictx) for (const p of ["ty", "an", "sx", "sy", "ro"]) {
const v = ghost._transalterersStates[p];
if (v && !has(p)) p == "sx" ? T.sx(v, 1) : p == "sy" ? T.sx(1, v) : T[p](v);
}
} else if (prop == "mo" || prop == "d") {
attr(el, "d", runner.interpolator(pr));
} else if (prop == "fp") {
const { followPathLength: L, followPathStart: s, followPathEnd: e, lutData, followedPath, p: { cd, rd } } = runner;
const progress = runner.followPathLinear ? s + (e - s) * pr : L > 0 ? val / L : s, S = t => sampleLUT(lutData, t);
const p0 = S(progress - 0.001), p1 = S(progress + 0.001), pc = el.parentNode.getCTM();
const pt = svgPt(followedPath.ownerSVGElement, S(progress), pc.inverse());
let angle = toDeg(MATH.atan2(p1.y - p0.y, p1.x - p0.x));
if (rd && pc) angle -= toDeg(MATH.atan2(pc.b, pc.a));
transform(el, { tx: pt.x - (cd ? ox : 0), ty: pt.y - (cd ? oy : 0), ox, oy });
el._sk = null;
if (rd) transform(el, { ro: angle - transform(el).ro, ox, oy }, 1);
} else if (prop in COLORS) {
runner.gradientType ? setGrad(el, prop, runner.gradientType, val) : attr(el, COLORS[prop], rgba(val));
} else if (SIZES.includes(prop)) {
const box = el.getBBox();
box[prop == "w" ? "width" : "height"] = val;
if (el.nodeName == "text") attr(el, "font-size", val);
else {
resize(el, box.width, box.height);
if (attr(el, "id").split("-")[1] == "image") updateImg(el, box.width, box.height);
}
} else if (prop in EFFECTS) {
const { es, fs, fp } = runner.p, h = query(`${es}`)?.querySelector(fs);
if (h) attr(h, fp, prop == "ec" && fp == "flood-color" ? rgba(val) : val);
} else if (prop == "rd") {
attr(el, "rx", val); attr(el, "ry", val);
} else if (prop == "v") {
if (val != Number(el.style.visibility != "hidden")) el.style.visibility = val == 1 ? "visible" : "hidden";
} else if (prop == "mb") {
const v = val.value[0], holder = maskHolder(el);
if (v !== (attr(holder, "_mask") || "")) { attr(holder, "mask", v ? `url(#${v})` : v); attr(holder, "_mask", v); }
} else if (prop == "mt") {
const f = val.value[0] == "out" ? ["black", "white"] : ["white", "black"];
ghost._maskEl.childNodes.forEach((c, i) => attr(c, "fill", f[i ? 1 : 0]));
} else {
if (prop == "da") val = val.join(" ").trim();
if (prop == "do") {
const changed = [...SIZES, ...SCALES].some(p => p in this.animations.find(a => a.el === el).animatables);
const len = changed ? getTotLen(el) : runner.dashoffsetLen, da = attr(el, DA);
val = len * (val / 100);
if (!da || changed) { if (!da) this.dirtyProperties.add({ el, property: DA }); attr(el, DA, len); }
}
const tp = STROKE[prop] || prop;
attr(tp == "op" ? el.parentNode : el, tp == "op" ? "opacity" : tp, val);
}
}
play() {
this.dirtyProperties.forEach(d => attr(d.el, d.property, null));
this.dirtyProperties.clear();
this.isPlaying = true;
if (this.lastElapsed >= this.maxDuration) this.lastElapsed = 0;
let startTime = null;
const initial = this.lastElapsed, c = this.config, tick = now => {
if (!startTime) startTime = now;
const elapsed = initial + (now - startTime);
if (elapsed > this.maxDuration) {
if (c.loop) { this.lastElapsed = 0; this.play(); }
else { this._render(this.lastElapsed = this.maxDuration); c.onComplete?.(); this.pause(); }
return;
}
this._render(this.lastElapsed = elapsed);
c.onUpdate?.();
this.rafId = requestAnimationFrame(tick);
};
this.rafId = requestAnimationFrame(tick);
}
pause() { this.isPlaying = false; if (this.rafId) cancelAnimationFrame(this.rafId); }
_initState(el, prop, ghost) {
if (prop == "sk" || prop == "sky") return skewOf(el)[prop == "sk" ? "x" : "y"];
if (TRANSFORMS.includes(prop)) return new Matrix(el);
if (prop in COLORS) {
const n = COLORS[prop], own = attr(el, n);
const fill = (own && own != "none" ? own : el.tagName != "g" && el.parentNode && attr(el.parentNode, n)) || BLACK;
return fill.includes("url") ? cssGrad(query(`#${fill.match(/#([^") ]*)/)[1]}`)) : fill;
}
if (prop == "fp") return 0;
if (prop in PATHS) return attr(el, "d");
if (prop in EFFECTS) return null;
// the element's own dash list (none: a single 0, like the editor)
if (prop == "da") return (attr(el, DA) || "0").split(delimiter);
if (prop == "rd") return attr(el, "rx") || 0;
if (prop == "mb") return (attr(maskHolder(el), "mask") || "").split("#")[1]?.slice(0, -1) ?? "";
if (prop == "mt") return attr(ghost._maskEl.firstChild, "fill") == "white" ? "in" : "out";
return attr(el, prop) || 0;
}
_reorder(o) {
const r = {};
for (const k of ["fp", ...TRANSFORMS, ...SIZES, ...Object.keys(o)]) if (k in o && !(k in r)) r[k] = o[k];
return r;
}
_calcStagger(delay, staggerArr, totalElements, index, totalDuration) {
let [s, r, g] = staggerArr;
if (typeof s == "string") s = (totalElements * parseInt(s)) / 100;
if (typeof r == "string") r = (totalElements * parseInt(r)) / 100;
const step = totalDuration * (g / 100);
const segWidth = step / MATH.round(totalElements / r);
const relIndex = MATH.floor((index - s) / r);
return [MATH.ceil(delay + segWidth * relIndex), MATH.ceil(step - segWidth)];
}
}
