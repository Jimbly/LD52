#pragma WebGL2

precision lowp float;

varying vec2 interp_texcoord;

uniform vec4 color1;
uniform vec4 color2;
uniform sampler2D inputTexture0;
void main()
{
  vec4 tex = texture2D(inputTexture0, interp_texcoord);
  tex.rgb = mix(color1.rgb, color2.rgb, tex.rgb);
  gl_FragColor = tex;
}
