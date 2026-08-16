/**
 * 流体场 —— 一块画着水的离屏画布，不关心它最终被裁成什么形状。
 *
 * 抽出来是因为有两个消费方，且还会有第三个：
 *
 *   fluidGlyph      用文字的字形当遮罩（404 页的「404」）
 *   riverRenderer   用河道缎带当遮罩（首页的河，可选）
 *
 * 遮罩的做法都一样：这里往离屏画布上画满流体，调用方再用
 * globalCompositeOperation 把它裁进自己的形状。谁都不必知道对方的存在。
 *
 * ── 着色器在做什么 ────────────────────────────────────────────────
 *
 * 域扭曲（domain warp）：先算两层噪声 w1/w2，再拿它们去偏移采样坐标 q。
 * 两层各自带时间项，于是扭曲场本身在演化 —— 纹理被拉伸、卷起、再合上。
 * 这是流动感的来源，也是几何驱动的河做不到的地方（那边是虚线沿固定路径
 * 平移，一维位移，缺平流、涡量和折叠）。
 * 频率步进 2.03 与 riverMath 的 fbm 取同一个值：整数倍频会让各倍频的峰
 * 周期性对齐，叠出肉眼可见的规律条纹。
 *
 * 合成是减色的（水彩）：颜料吸收光，浅→深表示"更多颜料"而不是"更亮"。
 * 白底上必须这样 —— 反过来用加色发光，低透明度的亮色叠到白上只会得到灰。
 * 参考项目 fluidglass-ui 就是加色模型，实测在白底上塌成脏灰块。
 *
 * 高光：白纸上打白色高光等于没打，所以它必须是"深色区域里的一道亮"。
 * 位置取密度的过渡带 —— 那一带正是场变化最快处，等价于沿梯度找边界，
 * 但不需要 dFdx/dFdy。后者在 WebGL1 里要 OES_standard_derivatives 扩展，
 * 而它并非处处可用：本机 ANGLE Metal 后端就不支持，早期版本因此整段编译失败。
 *
 * 着色器里的注释一律用短英文：模板字符串内的注释不会被压缩掉，会原样发给
 * 每个访客。解释放在这里。
 */

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
uniform float u_floor;
uniform float u_span;
uniform float u_scale;

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
  vec2 p = (v_uv - 0.5) * vec2(aspect, 1.0) * u_scale;

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
  float band = pow(max(0.0, sin((q.x - q.y) * 2.6 + detail * 4.2 - u_time * 0.20)), 22.0);
  pigment = mix(pigment, vec3(1.0), (pow(rim, 1.3) * 0.52 + band * density * 0.38) * u_sheen);

  gl_FragColor = vec4(pigment, min(1.0, density * u_span + u_floor));
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

const toUnit = (rgb) => [rgb[0] / 255, rgb[1] / 255, rgb[2] / 255];

/**
 * @param {{
 *   palette: { shallow: readonly number[], mid: readonly number[], deep: readonly number[] },
 *   sheen?: number,
 *   floor?: number,
 *   span?: number,
 *   scale?: number,
 * }} options
 * @returns {{ canvas: HTMLCanvasElement, resize(w: number, h: number): void,
 *             render(time: number): void, destroy(): void } | null}
 *   拿不到 WebGL 时返回 null —— 调用方据此走自己的降级路径，而不是收到一个异常。
 */
export function createFluidField(options) {
  const { palette, sheen = 1, floor = 0.52, span = 0.48, scale = 2.6 } = options;
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl', { alpha: true, antialias: false, premultipliedAlpha: false });
  if (!gl) return null;

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
    console.warn('[fluidField]', error);
    return null;
  }

  gl.useProgram(program);
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
  const attribute = gl.getAttribLocation(program, 'a_position');
  gl.enableVertexAttribArray(attribute);
  gl.vertexAttribPointer(attribute, 2, gl.FLOAT, false, 0, 0);
  gl.clearColor(0, 0, 0, 0);

  const uniforms = Object.fromEntries(
    ['u_resolution', 'u_time', 'u_shallow', 'u_mid', 'u_deep', 'u_sheen', 'u_floor', 'u_span', 'u_scale'].map(
      (name) => [name, gl.getUniformLocation(program, name)],
    ),
  );

  return {
    canvas,
    resize(width, height) {
      canvas.width = Math.max(1, Math.round(width));
      canvas.height = Math.max(1, Math.round(height));
    },
    render(time) {
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.useProgram(program);
      gl.uniform2f(uniforms.u_resolution, canvas.width, canvas.height);
      gl.uniform1f(uniforms.u_time, time);
      gl.uniform1f(uniforms.u_sheen, sheen);
      gl.uniform1f(uniforms.u_floor, floor);
      gl.uniform1f(uniforms.u_span, span);
      gl.uniform1f(uniforms.u_scale, scale);
      gl.uniform3fv(uniforms.u_shallow, toUnit(palette.shallow));
      gl.uniform3fv(uniforms.u_mid, toUnit(palette.mid));
      gl.uniform3fv(uniforms.u_deep, toUnit(palette.deep));
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    },
    destroy() {
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    },
  };
}
