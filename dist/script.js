import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.121.1/build/three.module.js';
import { OrbitControls } from 'https://cdn.jsdelivr.net/npm/three@0.121.1/examples/jsm/controls/OrbitControls.js';

const getRandomNumber = function (min, max) {
  return Math.floor(Math.random() * (max - min + 1) + min);
};

const vertexParticlesShaderSource = `
uniform float uTime;

varying vec3 vPosition;
varying vec3 vNormal;

float PI = 3.14159265359;

//	Simplex 3D Noise 
//	by Ian McEwan, Ashima Arts
//
vec4 permute(vec4 x){return mod(((x*34.0)+1.0)*x, 289.0);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159 - 0.85373472095314 * r;}

float snoise(vec3 v){ 
  const vec2  C = vec2(1.0/6.0, 1.0/3.0) ;
  const vec4  D = vec4(0.0, 0.5, 1.0, 2.0);

  // First corner
  vec3 i  = floor(v + dot(v, C.yyy) );
  vec3 x0 =   v - i + dot(i, C.xxx) ;

  // Other corners
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min( g.xyz, l.zxy );
  vec3 i2 = max( g.xyz, l.zxy );

  //  x0 = x0 - 0. + 0.0 * C 
  vec3 x1 = x0 - i1 + 1.0 * C.xxx;
  vec3 x2 = x0 - i2 + 2.0 * C.xxx;
  vec3 x3 = x0 - 1. + 3.0 * C.xxx;

  // Permutations
  i = mod(i, 289.0 ); 
  vec4 p = permute( permute( permute( 
             i.z + vec4(0.0, i1.z, i2.z, 1.0 ))
           + i.y + vec4(0.0, i1.y, i2.y, 1.0 )) 
           + i.x + vec4(0.0, i1.x, i2.x, 1.0 ));

  // Gradients
  // ( N*N points uniformly over a square, mapped onto an octahedron.)
  float n_ = 1.0/7.0; // N=7
  vec3  ns = n_ * D.wyz - D.xzx;

  vec4 j = p - 49.0 * floor(p * ns.z *ns.z);  //  mod(p,N*N)

  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_ );    // mod(j,N)

  vec4 x = x_ *ns.x + ns.yyyy;
  vec4 y = y_ *ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);

  vec4 b0 = vec4( x.xy, y.xy );
  vec4 b1 = vec4( x.zw, y.zw );

  vec4 s0 = floor(b0)*2.0 + 1.0;
  vec4 s1 = floor(b1)*2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));

  vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy ;
  vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww ;

  vec3 p0 = vec3(a0.xy,h.x);
  vec3 p1 = vec3(a0.zw,h.y);
  vec3 p2 = vec3(a1.xy,h.z);
  vec3 p3 = vec3(a1.zw,h.w);

  // Normalise gradients
  vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2, p2), dot(p3,p3)));
  p0 *= norm.x;
  p1 *= norm.y;
  p2 *= norm.z;
  p3 *= norm.w;

  // Mix final noise value
  vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
  m = m * m;
  return 42.0 * dot( m*m, vec4( dot(p0,x0), dot(p1,x1), 
                                dot(p2,x2), dot(p3,x3) ) );
}

void main() {
  vPosition = position;
  vec3 p = position;
  float noisy = snoise(position);
  
  p.x += cos(p.x + uTime) * noisy * 0.5;
  p.y += abs(tan(p.y * 0.8 + uTime / 2.0)) * 0.1;
  p.z += sin(p.z + uTime) * noisy * 0.5;
  
  vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
  gl_PointSize = 5.0 * (1.0 / - mvPosition.z);
  gl_Position = projectionMatrix * mvPosition;
}

`;

const fragmentParticlesShaderSource = `
uniform float uTime;

varying vec3 vPosition;
varying vec3 vNormal;

void main () {
  gl_FragColor = vec4(vPosition * vPosition, 1.0);
}

`;

const vertexSphereShaderSource = `
uniform float uTime;
varying vec3 vPosition;

void main() {
  vec3 p = position;
  vPosition = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}

`;

const fragmentSphereShaderSource = `
uniform float uTime;
varying vec3 vPosition;

void main () {
  gl_FragColor = vec4(vPosition * vPosition, 1.0);
  //gl_FragColor = vec4(1.0, 1.0, 1.0, 1.0);
}

`;

/**
 * class Sketch
 */
class Sketch {
  constructor() {
    /** renderer */
    this.renderer =
      new THREE.WebGLRenderer({
        antialias: true,
        alpha: true
      });
    document.getElementById('container').appendChild(this.renderer.domElement);
    
    /** setup */
    this.setupEvents();
    this.statsInit();
    this.init();
  }

  statsInit() {
    this.stats = new Stats();
    this.stats.setMode(0);
    this.stats.domElement.style.position = 'absolute';
    this.stats.domElement.style.left = '0';
    this.stats.domElement.style.top = '0';
    document.getElementById('container').appendChild(this.stats.domElement);
  }
  
  init() {
    /** time */
    this.time = new THREE.Clock(true);
    
    /** mouse */
    this.mouse = new THREE.Vector2();
    
    /** canvas size */
    this.width = window.innerWidth;
    this.height = window.innerHeight;

    /** scene */
    this.scene = new THREE.Scene();
    
    /** setup and render */
    this.setupCanvas();
    this.setupCamera();
    //this.setupLight();
    this.setupShape();
    
    this.render();
  }
  
  setupCanvas() {
    /** renderer */
    this.renderer.setSize(this.width, this.height);
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setClearColor(0x000000, 1.0);
    
    /** style */
    this.renderer.domElement.style.position = 'fixed';
    this.renderer.domElement.style.top = '0';
    this.renderer.domElement.style.left = '0';
    this.renderer.domElement.style.zIndex = '0';
    this.renderer.domElement.style.outline = 'none';
  }
  
  setupCamera() {
    const fov = 70;
    //const fovRadian = (fov / 2) * (Math.PI / 180);
    
    //this.dist = this.height / 2 / Math.tan(fovRadian);
    this.camera =
      new THREE.PerspectiveCamera(
        fov,
        this.width / this.height,
        0.01,
        1000
      );
    this.camera.position.set(0, 0, 5);
    this.camera.lookAt(new THREE.Vector3());
    this.scene.add(this.camera);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
  }
  
  setupLight() {
    /** directinal light */
    this.directionalLight = new THREE.DirectionalLight(0xffffff);
    this.scene.add(this.directionalLight);

    /** point light*/
    //this.pointLight = new THREE.PointLight(0xffffff, 1, this.dist);
    //this.pointLight.position.set(0, this.dist, 0);
    //this.scene.add(this.pointLight);
  }
  
  setupShape() {
    this.shapes = new Array();
    const radian = Math.PI * 2 / 80;
    const s = new Shape(this, 0, 0, 0);
    this.shapes.push(s);
  }
  
  render() {
    this.stats.begin(); // -------------------- //
    
    const time = this.time.getElapsedTime();
    
    /** shapes */
    for (let i = 0; i < this.shapes.length; i++) {
      this.shapes[i].update(time);
    }
    
    this.renderer.render(this.scene, this.camera);
    
    this.stats.end();   // -------------------- //
    this.animationId = requestAnimationFrame(this.render.bind(this));
  }
  
  setupEvents() {
    window.addEventListener('resize', this.resize.bind(this), false);
    window.addEventListener('mousemove', this.mousemove.bind(this), false);
  }
  
  resize() {
    const id = this.animationId;
    
    cancelAnimationFrame(id);
    this.init();
  }
  
  mousemove(event) {
    this.mouse.x = event.clientX - (this.width / 2);
    this.mouse.y = - event.clientY + (this.height / 2);
  }
}

class Shape {
  constructor(sketch, x, y, z) {
    this.sketch = sketch;
    this.init(x, y, z);
  }
  
  init(x, y, z) {
    /** points */
    this.material = new THREE.ShaderMaterial({
      side: THREE.DoubleSide,
      uniforms: {
        uTime: {type: 'f', value: 0},
      },
      blending: THREE.AdditiveBlending,
      transparent: true,
      vertexShader: vertexParticlesShaderSource,
      fragmentShader: fragmentParticlesShaderSource
    });
    
    const N = 300000;
    const positions = new Float32Array(N * 3);
    this.geometry = new THREE.BufferGeometry();
    
    /**
     * This fantastic code is from Yuri Artyukh-san
     * His YouTube Channel : https://www.youtube.com/channel/UCDo7RTzizoOdPjY8A-xDR7g
     * Thank you so much.
     */
    const inc = Math.PI * (3 - Math.sqrt(5));
    const off = 2 / N;
    const rad = 1.7;
    
    for (let i = 0; i < N; i++) {
      const y = i * off - 1 + (off / 2);
      const r = Math.sqrt(1 - y * y);
      const phi = i * inc;
      
      positions[i * 3 + 0] = (rad * Math.cos(phi) * r);
      positions[i * 3 + 1] = (rad * y);
      positions[i * 3 + 2] = (rad * Math.sin(phi) * r);
    }
    
    /** end */
    
    this.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.mesh = new THREE.Points(this.geometry, this.material);
    this.sketch.scene.add(this.mesh);
    
    /** sphere */
    this.sphereMaterial = new THREE.ShaderMaterial({
      //side: THREE.DoubleSide,
      uniforms: {
        uTime: {type: 'f', value: 0},
      },
      //blending: THREE.AdditiveBlending,
      //transparent: true,
      vertexShader: vertexSphereShaderSource,
      fragmentShader: fragmentSphereShaderSource
    });
    
    this.sphereGeometry = new THREE.SphereGeometry(1.1, 18, 18);
    this.sphereMesh = new THREE.Mesh(this.sphereGeometry, this.sphereMaterial);
    this.sketch.scene.add(this.sphereMesh);
  }
  
  update(time) {
    this.mesh.material.uniforms.uTime.value = time;
    this.mesh.rotation.y = -time * 0.2;
    this.mesh.rotation.z = -time * 0.1;
    this.sphereMesh.material.uniforms.uTime.value = time;
    this.sphereMesh.rotation.y = -time * 0.2;
    this.sphereMesh.rotation.z = -time * 0.1;
  }
}

window.addEventListener('load', () => {
  console.clear();

  const loading = document.getElementById('loading');
  loading.classList.add('loaded');

  new Sketch();
});