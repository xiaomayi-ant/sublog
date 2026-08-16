/**
 * 把一段文字的字形当作遮罩，在里面渲染流体。
 *
 * 和首页的河是两套东西，用途不同：
 *
 *   riverRenderer  Canvas 2D，几何驱动 —— 中心线 + 缎带，河道确定、水在其中流。
 *                  流动来自虚线相位平移，是一维位移。
 *   这里           WebGL，场驱动 —— 域扭曲场本身随时间演化，纹理被拉伸、卷起、
 *                  再合上。这才有打旋和折叠，是河那套模型做不出来的。
 *
 * 合成方式是水彩（减色）：颜料吸收光，浅→深表示"更多颜料"而不是"更亮"。
 * 白底上必须这样 —— 反过来用加色发光，低透明度的亮色叠到白上只会得到灰。
 *
 * 遮罩用两块画布做：WebGL 画流体（离屏），2D 画布 drawImage 之后用
 * destination-in 叠上文字，流体就被裁进字形里。比用 SVG 遮罩可靠 ——
 * 后者依赖 SVG 里的字体解析结果和 CSS 一致，跨浏览器不保证。
 */

// 着色器里的注释一律用短英文：模板字符串内的注释不会被压缩掉，会原样发给
// 每个访客。解释放在这里。
//
// 域扭曲（domain warp）：先算两层噪声 w1/w2，再拿它们去偏移采样坐标 q。
// 两层各自带时间项，于是扭曲场本身在演化 —— 纹理被拉伸、卷起、再合上。
// 这是流动感的来源，也是首页那条河做不到的地方（那边是虚线沿固定路径平移）。
// 频率步进 2.03 与 riverMath 的 fbm 取同一个值：整数倍频会让各层的峰周期性对齐。
//
// 高光：白纸上打白色高光等于没打，所以它必须是"深色区域里的一道亮"。
// 位置取密度的过渡带 —— 那一带正是场变化最快处，等价于沿梯度找边界，
// 但不需要 dFdx/dFdy。后者在 WebGL1 里要 OES_standard_derivatives 扩展，
// 而它并非处处可用：本机 ANGLE Metal 后端就不支持，早期版本因此整段编译失败。
//
// 不透明度留了 0.52 的下限：字首先得是一个字，纹理长在它身上，不能让低密度处
// 淡到把笔画咬断。这个值是对着原来那个实色 #c8f1ee 的分量调的。
const VERTEX_SHADER = `
attribute vec2 a_position;
varying vec2 v_uv;
void main() {
  v_uv = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}`;

const FRAGMENT_SHADER = `
precision highp float;
varying vec2 v_uv;
uniform vec2 u_resolution;
uniform float u_time;
uniform vec3 u_shallow;
uniform vec3 u_mid;
uniform vec3 u_deep;
uniform float u_sheen;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}

float fbm(vec2 p) {
  float value = 0.0;
  float amplitude = 0.5;
  mat2 rot = mat2(0.8, -0.6, 0.6, 0.8);
  for (int i = 0; i < 5; i++) {
    value += amplitude * noise(p);
    p = rot * p * 2.03 + vec2(17.13, 9.27);
    amplitude *= 0.5;
  }
  return value;
}

void main() {
  float aspect = u_resolution.x / max(1.0, u_resolution.y);
  vec2 p = (v_uv - 0.5) * vec2(aspect, 1.0) * 2.6;

  // domain warp
  float w1 = fbm(p * 1.15 + vec2(u_time * 0.052, -u_time * 0.036));
  float w2 = fbm(p * 1.40 + vec2(-u_time * 0.040, u_time * 0.047) + w1 * 0.85);
  vec2 q = p + (vec2(w1, w2) - 0.5) * 1.10;

  float broad = fbm(q * 0.92 + vec2(u_time * 0.029, -u_time * 0.022));
  float detail = fbm(q * 2.00 + vec2(-u_time * 0.058, u_time * 0.041) + broad * 0.9);
  float density = smoothstep(0.28, 0.84, broad * 0.66 + detail * 0.34);

  // pigment: subtractive, more colour means more pigment
  vec3 pigment = mix(mix(u_shallow, u_mid, 0.22), u_mid, smoothstep(0.0, 0.52, density));
  pigment = mix(pigment, u_deep, smoothstep(0.46, 0.94, density));

  // sheen: the transition band doubles as the steep-gradient band
  float rim = smoothstep(0.30, 0.52, density) * (1.0 - smoothstep(0.52, 0.80, density));
  float sheen = pow(rim, 1.3);
  float band = pow(max(0.0, sin((q.x - q.y) * 2.6 + detail * 4.2 - u_time * 0.20)), 22.0);
  pigment = mix(pigment, vec3(1.0), (sheen * 0.52 + band * density * 0.38) * u_sheen);

  gl_FragColor = vec4(pigment, min(1.0, density * 0.48 + 0.52));
}`;

function compile(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader) || 'shader compile failed';
    gl.deleteShader(shader);
    throw new Error(message);
  }
  return shader;
}

function hexToUnit(hex) {
  const value = hex.trim().replace('#', '');
  return [0, 2, 4].map((offset) => parseInt(value.slice(offset, offset + 2), 16) / 255);
}

/**
 * @param {{
 *   canvas: HTMLCanvasElement,
 *   source: HTMLElement,
 *   palette: { shallow: string, mid: string, deep: string },
 *   sheen?: number,
 * }} configuration
 * @returns {{ destroy(): void, ok: boolean } | null}
 */
export function createFluidGlyph(configuration) {
  const { canvas, source, palette, sheen = 1 } = configuration;
  if (!(canvas instanceof HTMLCanvasElement) || !(source instanceof HTMLElement)) return null;

  const view = canvas.getContext('2d');
  const buffer = document.createElement('canvas');
  const gl = buffer.getContext('webgl', { alpha: true, antialias: false, premultipliedAlpha: false });
  if (!view || !gl) return null;

  let program;
  try {
    program = gl.createProgram();
    gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERTEX_SHADER));
    gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(program) || 'program link failed');
    }
  } catch (error) {
    console.warn('[fluidGlyph]', error);
    return null;
  }

  gl.useProgram(program);
  const vertices = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vertices);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
  const attribute = gl.getAttribLocation(program, 'a_position');
  gl.enableVertexAttribArray(attribute);
  gl.vertexAttribPointer(attribute, 2, gl.FLOAT, false, 0, 0);
  gl.clearColor(0, 0, 0, 0);

  const uniforms = Object.fromEntries(
    ['u_resolution', 'u_time', 'u_shallow', 'u_mid', 'u_deep', 'u_sheen'].map((name) => [
      name,
      gl.getUniformLocation(program, name),
    ]),
  );

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let width = 0;
  let height = 0;
  let ratio = 1;
  let frame = 0;
  let visible = true;
  let destroyed = false;
  let glyph = { text: '', font: '', spacing: 0, baseline: 0, left: 0 };

  /** 从 DOM 里读真实排版，而不是在这里另写一套 —— 字号是 clamp() 出来的。 */
  function readGlyph() {
    const style = getComputedStyle(source);
    const rect = source.getBoundingClientRect();
    const size = parseFloat(style.fontSize);
    const spacingRaw = style.letterSpacing;
    return {
      text: (source.textContent || '').trim(),
      font: `${style.fontWeight} ${style.fontSize}/${style.lineHeight} ${style.fontFamily}`,
      spacing: spacingRaw === 'normal' ? 0 : parseFloat(spacingRaw) || 0,
      // 基线位置：行盒顶部 + 行高的一半 + 半个字高，够贴近 CSS 的实际排布
      baseline: (rect.height + size * 0.72) / 2,
      left: 0,
      size,
    };
  }

  function paintMask() {
    view.globalCompositeOperation = 'destination-in';
    view.fillStyle = '#000';
    view.textBaseline = 'alphabetic';
    view.font = glyph.font;
    if ('letterSpacing' in view) view.letterSpacing = `${glyph.spacing}px`;
    view.fillText(glyph.text, glyph.left, glyph.baseline);
    view.globalCompositeOperation = 'source-over';
  }

  function render(now) {
    if (destroyed || !width || !height) return;
    const time = reducedMotion.matches ? 0 : now * 0.001;
    gl.viewport(0, 0, buffer.width, buffer.height);
    gl.useProgram(program);
    gl.uniform2f(uniforms.u_resolution, buffer.width, buffer.height);
    gl.uniform1f(uniforms.u_time, time);
    gl.uniform1f(uniforms.u_sheen, sheen);
    gl.uniform3fv(uniforms.u_shallow, hexToUnit(palette.shallow));
    gl.uniform3fv(uniforms.u_mid, hexToUnit(palette.mid));
    gl.uniform3fv(uniforms.u_deep, hexToUnit(palette.deep));
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    view.setTransform(1, 0, 0, 1, 0, 0);
    view.clearRect(0, 0, canvas.width, canvas.height);
    view.setTransform(ratio, 0, 0, ratio, 0, 0);
    view.drawImage(buffer, 0, 0, width, height);
    paintMask();
  }

  function loop(now) {
    frame = 0;
    if (destroyed || !visible || reducedMotion.matches) return;
    render(now);
    frame = requestAnimationFrame(loop);
  }

  function schedule() {
    cancelAnimationFrame(frame);
    frame = 0;
    if (!destroyed && visible && !reducedMotion.matches) frame = requestAnimationFrame(loop);
  }

  function resize() {
    const rect = source.getBoundingClientRect();
    ratio = Math.min(window.devicePixelRatio || 1, 2);
    width = Math.max(1, rect.width);
    height = Math.max(1, rect.height);
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    buffer.width = canvas.width;
    buffer.height = canvas.height;
    glyph = readGlyph();
    render(0);
  }

  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(source);
  const intersectionObserver = new IntersectionObserver(([entry]) => {
    visible = entry?.isIntersecting !== false;
    schedule();
  });
  intersectionObserver.observe(canvas);
  const onMotionChange = () => {
    render(0);
    schedule();
  };
  reducedMotion.addEventListener('change', onMotionChange);

  resize();
  schedule();

  return {
    ok: true,
    destroy() {
      destroyed = true;
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
      reducedMotion.removeEventListener('change', onMotionChange);
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    },
  };
}
