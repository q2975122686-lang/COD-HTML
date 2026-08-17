/* =====================================================================
   COD: OPS — 第一人称射击 (Three.js)
   单文件离线游戏：WASD 移动 / 鼠标视角 / 左键射击 / 右键开镜
   ===================================================================== */
(function () {
'use strict';

/* ------------------------------ helpers ------------------------------ */
const clamp = (v, a, b) => v < a ? a : (v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a, b) => a + Math.random() * (b - a);
const randInt = (a, b) => Math.floor(rand(a, b + 1));
const TAU = Math.PI * 2;
const $ = id => document.getElementById(id);
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const smooth = t => t * t * (3 - 2 * t);

/* ------------------------------ DOM refs ------------------------------ */
const el = {
  app: $('app'), menu: $('ui-menu'), pause: $('ui-pause'), death: $('ui-death'),
  hud: $('hud'), dmg: $('dmg'), lowhp: $('lowhp'), scope: $('scope'),
  healthFill: $('healthFill'), healthText: $('healthText'),
  staminaFill: $('staminaFill'), ammoMag: $('ammoMag'), ammoReserve: $('ammoReserve'),
  weaponName: $('weaponName'), grenadeCount: $('grenadeCount'),
  scoreVal: $('scoreVal'), waveVal: $('waveVal'), killVal: $('killVal'),
  crosshair: $('crosshair'), hitmarker: $('hitmarker'), toast: $('toast'),
  killfeed: $('killfeed'), waveTag: $('waveTag'), prompt: $('prompt'),
  radar: $('radar'), deathStats: $('deathStats'), err: $('err'),
  btnStart: $('btnStart'), btnResume: $('btnResume'), btnRespawn: $('btnRespawn')
};
const ctx2d = el.radar.getContext('2d');

/* ------------------------------ game state ------------------------------ */
const G = {
  started: false, paused: false, dead: false, muted: false,
  time: 0, score: 0, kills: 0, killstreak: 0, killsSinceDeath: 0,
  wave: 0, waveState: 'intro', waveTimer: 1.2, spawnQueue: 0, spawnTimer: 0,
  aliveEnemies: 0, enemySerial: 0, enemies: [],
  health: 100, lastDamage: -99, stamina: 100, staminaDelay: 0,
  crouch: false, grounded: true, vy: 0, eyeHeight: 1.62,
  yaw: 0, pitch: 0, recoilPitch: 0, recoilYaw: 0, shake: 0,
  pos: new THREE.Vector3(0, 0, 0), vel: new THREE.Vector3(), speed: 0,
  bobPhase: 0, stepFlag: false,
  fov: 75, ads: 0, adsDown: false,
  weaponIdx: 0, switchT: 0, oldIdx: -1, reloadT: 0, fireTimer: 0,
  bloom: 0, muzzleT: 0, kick: 0, clickT: 0, mouseDown: false,
  grenades: 3, grenadeT: 0, spread: 0.02, jumpQueued: false, hadLock: false,
  keys: Object.create(null)
};

/* ------------------------------ renderer ------------------------------ */
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
} catch (e) {
  el.err.style.display = 'flex'; return;
}
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputEncoding = THREE.sRGBEncoding;
el.app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xaebfca);
scene.fog = new THREE.FogExp2(0xaebfca, 0.0085);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.05, 500);
camera.rotation.order = 'YXZ';
scene.add(camera);

const hemi = new THREE.HemisphereLight(0xd8e6ff, 0x57513f, 0.95);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff1d6, 1.3);
sun.position.set(55, 85, 35);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -85; sun.shadow.camera.right = 85;
sun.shadow.camera.top = 85; sun.shadow.camera.bottom = -85;
sun.shadow.camera.near = 5; sun.shadow.camera.far = 300;
sun.shadow.bias = -0.0004;
scene.add(sun);

/* ------------------------------ procedural textures ------------------------------ */
function canvasTex(size, fn, repeat) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const x = c.getContext('2d'); fn(x, size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat || 1, repeat || 1);
  t.anisotropy = 4;
  return t;
}
function noiseFill(x, s, n, base) {
  for (let i = 0; i < n; i++) {
    x.fillStyle = 'rgba(' + randInt(0, 255) + ',' + randInt(0, 255) + ',' + randInt(0, 255) + ',' + rand(0.02, 0.09) + ')';
    x.fillRect(rand(0, s), rand(0, s), rand(1, 4), rand(1, 4));
  }
}
const texGround = canvasTex(256, (x, s) => {
  x.fillStyle = '#77755f'; x.fillRect(0, 0, s, s);
  noiseFill(x, s, 1400);
  x.strokeStyle = 'rgba(40,40,32,.25)'; x.lineWidth = 1;
  for (let i = 0; i < 22; i++) { x.beginPath(); x.moveTo(rand(0, s), rand(0, s)); x.lineTo(rand(0, s), rand(0, s)); x.stroke(); }
}, 30);
const texCrate = canvasTex(256, (x, s) => {
  x.fillStyle = '#7d6a42'; x.fillRect(0, 0, s, s);
  noiseFill(x, s, 900);
  x.strokeStyle = 'rgba(35,25,10,.85)'; x.lineWidth = 6; x.strokeRect(6, 6, s - 12, s - 12);
  x.lineWidth = 3; x.beginPath(); x.moveTo(6, 6); x.lineTo(s - 6, s - 6); x.moveTo(s - 6, 6); x.lineTo(6, s - 6); x.stroke();
  x.fillStyle = 'rgba(25,18,8,.8)'; x.font = 'bold 34px SimHei, sans-serif'; x.textAlign = 'center';
  x.fillText('军需', s / 2, s / 2 + 12);
}, 1);
const texWall = canvasTex(256, (x, s) => {
  x.fillStyle = '#8d8d84'; x.fillRect(0, 0, s, s);
  noiseFill(x, s, 1200);
  x.strokeStyle = 'rgba(30,30,28,.5)'; x.lineWidth = 4;
  x.strokeRect(0, 0, s, s);
  x.beginPath(); x.moveTo(0, s / 2); x.lineTo(s, s / 2); x.moveTo(s / 2, 0); x.lineTo(s / 2, s); x.stroke();
}, 3);
const texBuilding = canvasTex(256, (x, s) => {
  x.fillStyle = '#9a988c'; x.fillRect(0, 0, s, s);
  noiseFill(x, s, 900);
  x.strokeStyle = 'rgba(40,40,36,.45)'; x.lineWidth = 3;
  for (let i = 0; i < 5; i++) { x.strokeRect(i * 50 + 4, 4, 44, s - 8); }
  x.fillStyle = 'rgba(30,30,26,.55)';
  for (let i = 0; i < 4; i++) x.fillRect(i * 64 + 18, 8, 8, s - 16);
}, 4);
const texBarrel = canvasTex(128, (x, s) => {
  x.fillStyle = '#a3331f'; x.fillRect(0, 0, s, s);
  x.fillStyle = '#e6c56a'; x.fillRect(0, s * 0.35, s, s * 0.18);
  x.fillStyle = 'rgba(20,10,5,.5)';
  for (let i = 0; i < 40; i++) x.fillRect(rand(0, s), rand(0, s), 3, 2);
  x.fillStyle = '#1c1c1c'; x.font = 'bold 26px sans-serif'; x.textAlign = 'center';
  x.fillText('危险', s / 2, s * 0.28);
}, 1);
const texScorch = canvasTex(128, (x, s) => {
  const g = x.createRadialGradient(s / 2, s / 2, 6, s / 2, s / 2, s / 2);
  g.addColorStop(0, 'rgba(10,8,6,.95)'); g.addColorStop(0.7, 'rgba(20,16,12,.55)'); g.addColorStop(1, 'rgba(20,16,12,0)');
  x.fillStyle = g; x.fillRect(0, 0, s, s);
}, 1);

const matGround = new THREE.MeshStandardMaterial({ map: texGround, roughness: 0.96, metalness: 0 });
const matCrate = new THREE.MeshStandardMaterial({ map: texCrate, roughness: 0.85, metalness: 0.05 });
const matWall = new THREE.MeshStandardMaterial({ map: texWall, roughness: 0.9, metalness: 0.05 });
const matBuilding = new THREE.MeshStandardMaterial({ map: texBuilding, roughness: 0.92, metalness: 0.03 });
const matBarrel = new THREE.MeshStandardMaterial({ map: texBarrel, roughness: 0.7, metalness: 0.2 });

/* ------------------------------ map ------------------------------ */
const ground = new THREE.Mesh(new THREE.PlaneGeometry(220, 220), matGround);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const colliders = [];   // {minX,maxX,minZ,maxZ,h,mesh}
const solidMeshes = [ground];

const OBS = [
  // 外围墙
  { x: 0, z: -79, w: 164, d: 2, h: 7, mat: 'wall' }, { x: 0, z: 79, w: 164, d: 2, h: 7, mat: 'wall' },
  { x: -79, z: 0, w: 2, d: 164, h: 7, mat: 'wall' }, { x: 79, z: 0, w: 2, d: 164, h: 7, mat: 'wall' },
  // 中央掩体广场
  { x: 8, z: 0, w: 2.4, d: 6.5, h: 2.2, mat: 'crate' }, { x: -8, z: 0, w: 2.4, d: 6.5, h: 2.2, mat: 'crate' },
  { x: 0, z: 8, w: 6.5, d: 2.4, h: 2.2, mat: 'crate' }, { x: 0, z: -8, w: 6.5, d: 2.4, h: 2.2, mat: 'crate' },
  { x: 13, z: 10, w: 2.2, d: 2.2, h: 2.2, mat: 'crate' }, { x: -13, z: -10, w: 2.2, d: 2.2, h: 2.2, mat: 'crate' },
  // 西北仓库
  { x: -38, z: -36, w: 26, d: 18, h: 8, mat: 'building' },
  // 东南仓库
  { x: 38, z: 36, w: 20, d: 14, h: 7, mat: 'building' },
  // 东北院落
  { x: 30, z: -38, w: 24, d: 1.4, h: 3.2, mat: 'wall' },
  { x: 41, z: -26, w: 1.4, d: 24, h: 3.2, mat: 'wall' },
  { x: 17, z: -45, w: 1.4, d: 12, h: 3.2, mat: 'wall' },
  // 西南院落
  { x: -30, z: 38, w: 24, d: 1.4, h: 3.2, mat: 'wall' },
  { x: -41, z: 26, w: 1.4, d: 24, h: 3.2, mat: 'wall' },
  { x: -17, z: 45, w: 1.4, d: 12, h: 3.2, mat: 'wall' },
  // 散落掩体
  { x: 22, z: -18, w: 2.2, d: 2.2, h: 2.2, mat: 'crate' }, { x: -22, z: 18, w: 2.2, d: 2.2, h: 2.2, mat: 'crate' },
  { x: 26, z: 20, w: 3.4, d: 1.6, h: 1.4, mat: 'wall' }, { x: -26, z: -20, w: 3.4, d: 1.6, h: 1.4, mat: 'wall' },
  { x: 14, z: -30, w: 2.2, d: 2.2, h: 2.2, mat: 'crate' }, { x: -14, z: 30, w: 2.2, d: 2.2, h: 2.2, mat: 'crate' },
  { x: 34, z: -6, w: 5, d: 1.4, h: 1.3, mat: 'wall' }, { x: -34, z: 6, w: 5, d: 1.4, h: 1.3, mat: 'wall' },
  { x: 12, z: 36, w: 2.2, d: 2.2, h: 2.2, mat: 'crate' }, { x: -12, z: -36, w: 2.2, d: 2.2, h: 2.2, mat: 'crate' },
  { x: 47, z: 8, w: 3.6, d: 1.6, h: 2.2, mat: 'crate' }, { x: -47, z: -8, w: 3.6, d: 1.6, h: 2.2, mat: 'crate' },
  { x: 6, z: 47, w: 1.6, d: 3.6, h: 2.2, mat: 'crate' }, { x: -6, z: -47, w: 1.6, d: 3.6, h: 2.2, mat: 'crate' },
  { x: 52, z: 50, w: 3, d: 3, h: 2.2, mat: 'crate' }, { x: -52, z: -50, w: 3, d: 3, h: 2.2, mat: 'crate' },
  { x: 58, z: -52, w: 6, d: 1.4, h: 1.3, mat: 'wall' }, { x: -58, z: 52, w: 6, d: 1.4, h: 1.3, mat: 'wall' }
];
function addObstacle(cfg) {
  const geo = new THREE.BoxGeometry(cfg.w, cfg.h, cfg.d);
  const mat = cfg.mat === 'crate' ? matCrate : cfg.mat === 'building' ? matBuilding : matWall;
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(cfg.x, cfg.h / 2, cfg.z);
  mesh.castShadow = true; mesh.receiveShadow = true;
  scene.add(mesh);
  solidMeshes.push(mesh);
  colliders.push({ minX: cfg.x - cfg.w / 2, maxX: cfg.x + cfg.w / 2, minZ: cfg.z - cfg.d / 2, maxZ: cfg.z + cfg.d / 2, h: cfg.h, cfg });
}
OBS.forEach(addObstacle);

/* ------------------------------ explosive barrels ------------------------------ */
const barrels = [];
const barrelGeo = new THREE.CylinderGeometry(0.55, 0.55, 1.5, 14);
[[-20, 20], [20, -20], [36, -9], [-36, 9], [0, 34], [0, -34], [24, 42], [-24, -42]].forEach(p => {
  const m = new THREE.Mesh(barrelGeo, matBarrel);
  m.position.set(p[0], 0.75, p[1]);
  m.castShadow = true; m.receiveShadow = true;
  m.userData.barrel = true;
  scene.add(m);
  solidMeshes.push(m);
  barrels.push(m);
});

/* ------------------------------ collision ------------------------------ */
function resolveCircle(px, pz, r, out) {
  out.set(px, 0, pz);
  for (let i = 0; i < colliders.length; i++) {
    const o = colliders[i];
    const cx = clamp(out.x, o.minX, o.maxX);
    const cz = clamp(out.z, o.minZ, o.maxZ);
    const dx = out.x - cx, dz = out.z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 < r * r) {
      if (d2 > 1e-8) {
        const d = Math.sqrt(d2), push = (r - d) / d;
        out.x += dx * push; out.z += dz * push;
      } else {
        const lx = out.x - o.minX, ux = o.maxX - out.x, lz = out.z - o.minZ, uz = o.maxZ - out.z;
        const m = Math.min(lx, ux, lz, uz);
        if (m === lx) out.x = o.minX - r; else if (m === ux) out.x = o.maxX + r;
        else if (m === lz) out.z = o.minZ - r; else out.z = o.maxZ + r;
      }
    }
  }
  return out;
}
function segBlocked(x1, z1, x2, z2, minH) {
  for (let i = 0; i < colliders.length; i++) {
    const o = colliders[i];
    if (o.h <= minH) continue;
    let tmin = 0, tmax = 1;
    const dx = x2 - x1, dz = z2 - z1;
    if (Math.abs(dx) < 1e-9) {
      if (x1 < o.minX || x1 > o.maxX) continue;
    } else {
      let t1 = (o.minX - x1) / dx, t2 = (o.maxX - x1) / dx;
      if (t1 > t2) { const q = t1; t1 = t2; t2 = q; }
      tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
      if (tmin > tmax) continue;
    }
    if (Math.abs(dz) < 1e-9) {
      if (z1 < o.minZ || z1 > o.maxZ) continue;
    } else {
      let t1 = (o.minZ - z1) / dz, t2 = (o.maxZ - z1) / dz;
      if (t1 > t2) { const q = t1; t1 = t2; t2 = q; }
      tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
      if (tmin > tmax) continue;
    }
    return true;
  }
  return false;
}
function hasLOS(ax, ay, az, bx, by, bz) {
  return !segBlocked(ax, az, bx, bz, 1.15);
}

/* ------------------------------ weapons ------------------------------ */
const WEAPONS = [
  { id: 'm4', name: 'M4A1 突击步枪', auto: true, mag: 30, reserve: 120, damage: 34, headMult: 1.7,
    rpm: 780, spreadHip: 0.013, spreadAds: 0.0028, bloomShot: 0.006, recoil: 0.011, fov: 56,
    reload: 2.1, moveScale: 1.0, color: 0x2c302b, accent: 0x9c7c42, barrelLen: 0.52, shell: true, pellets: 1,
    hip: V3(0.27, -0.26, -0.55), ads: V3(0, -0.15, -0.4), tracer: 0xffd88a },
  { id: 'mp7', name: 'MP7 冲锋枪', auto: true, mag: 32, reserve: 160, damage: 24, headMult: 1.7,
    rpm: 950, spreadHip: 0.016, spreadAds: 0.004, bloomShot: 0.005, recoil: 0.0085, fov: 60,
    reload: 1.85, moveScale: 1.12, color: 0x24282c, accent: 0x3d4a55, barrelLen: 0.34, shell: true, pellets: 1,
    hip: V3(0.26, -0.25, -0.5), ads: V3(0, -0.15, -0.39), tracer: 0xcfe6ff },
  { id: 'm1014', name: 'M1014 霰弹枪', auto: false, mag: 8, reserve: 40, damage: 13, headMult: 1.25,
    rpm: 75, spreadHip: 0.045, spreadAds: 0.02, bloomShot: 0.03, recoil: 0.042, fov: 60,
    reload: 2.6, moveScale: 0.94, color: 0x3a3328, accent: 0x6b5533, barrelLen: 0.62, shell: true, pellets: 8,
    hip: V3(0.27, -0.25, -0.56), ads: V3(0, -0.15, -0.42), tracer: 0xffc98a },
  { id: 'm40', name: 'M40A3 狙击步枪', auto: false, mag: 5, reserve: 25, damage: 170, headMult: 2,
    rpm: 46, spreadHip: 0.09, spreadAds: 0.001, bloomShot: 0.09, recoil: 0.06, fov: 24,
    reload: 2.9, moveScale: 0.82, color: 0x34402e, accent: 0x4e5d40, barrelLen: 0.8, shell: false, pellets: 1, scope: true,
    hip: V3(0.27, -0.25, -0.58), ads: V3(0, -0.146, -0.34), tracer: 0xfff3c0 }
];
WEAPONS.forEach(w => { w.reserveMax = w.reserve; w.ammo = w.mag; });

const viewModels = [];
const matGunMetal = new THREE.MeshStandardMaterial({ color: 0x2a2d2c, roughness: 0.45, metalness: 0.75 });
const matGunDark = new THREE.MeshStandardMaterial({ color: 0x171a18, roughness: 0.6, metalness: 0.4 });
const matGunWood = new THREE.MeshStandardMaterial({ color: 0x5d482c, roughness: 0.8, metalness: 0.05 });

function vmBox(w, h, d, x, y, z, mat, parent, rx, ry, rz) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  if (rx) m.rotation.x = rx; if (ry) m.rotation.y = ry; if (rz) m.rotation.z = rz;
  parent.add(m); return m;
}
function buildViewModel(cfg) {
  const g = new THREE.Group();
  const accent = new THREE.MeshStandardMaterial({ color: cfg.accent, roughness: 0.55, metalness: 0.35 });
  const dark = cfg.id === 'm1014' ? matGunWood : matGunDark;
  vmBox(0.07, 0.1, 0.34, 0, 0, 0.02, matGunMetal, g);                    // 机匣
  vmBox(0.055, 0.07, 0.3, 0, -0.005, -0.22, accent, g);                  // 护木
  vmBox(0.036, 0.036, cfg.barrelLen, 0, 0.012, -0.14 - cfg.barrelLen / 2, dark, g); // 枪管
  vmBox(0.05, 0.085, 0.24, 0, -0.005, 0.3, dark, g);                     // 枪托
  vmBox(0.045, 0.17, 0.1, 0, -0.135, 0.05, matGunDark, g, 0.15);         // 弹匣
  vmBox(0.025, 0.05, 0.1, 0, 0.08, -0.06, dark, g);                      // 准星
  vmBox(0.03, 0.09, 0.06, 0, -0.105, 0.16, dark, g, 0.3);                // 握把
  if (cfg.id === 'm1014') vmBox(0.05, 0.05, 0.22, 0, -0.02, -0.32, accent, g); // 泵动护手
  if (cfg.scope) {
    const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.042, 0.2, 12), dark);
    scope.rotation.x = Math.PI / 2; scope.position.set(0, 0.105, -0.08);
    g.add(scope);
    cfg.scopeMesh = scope;
  }
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0.012, -0.14 - cfg.barrelLen - 0.02);
  g.add(muzzle);
  cfg.muzzleObj = muzzle;
  // 枪口闪光（十字面片 + 点光源）
  const flashGeo = new THREE.PlaneGeometry(0.16, 0.16);
  const flashMat = new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.95,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const f1 = new THREE.Mesh(flashGeo, flashMat), f2 = new THREE.Mesh(flashGeo, flashMat);
  f1.visible = f2.visible = false;
  muzzle.add(f1); muzzle.add(f2);
  const flashLight = new THREE.PointLight(0xffb45e, 0, 9, 2);
  muzzle.add(flashLight);
  cfg.flash = [f1, f2]; cfg.flashLight = flashLight;
  g.visible = false;
  camera.add(g);
  viewModels.push(g);
  return g;
}
WEAPONS.forEach(buildViewModel);

/* ------------------------------ enemies ------------------------------ */
const enemyHitMeshes = [];   // 射线检测用
const GUN_METAL = new THREE.MeshStandardMaterial({ color: 0x1c1f20, roughness: 0.5, metalness: 0.6 });

function makeSoldier(pos, heavy) {
  const e = {
    heavy: !!heavy, dead: false, deadT: 0, hp: heavy ? 230 : 100, maxHp: heavy ? 230 : 100,
    cooldown: rand(1.2, 3.2), burstLeft: 0, burstT: 0, strafeT: rand(1, 3), strafeDir: Math.random() < 0.5 ? 1 : -1,
    walkPhase: rand(0, TAU), preferred: rand(9, 16), flash: 0, gunKick: 0, alert: 1,
    name: '敌军士兵-' + (++G.enemySerial)
  };
  const group = new THREE.Group();
  group.position.copy(pos);
  const body = new THREE.Group();
  group.add(body);
  const cloth = new THREE.MeshStandardMaterial({ color: heavy ? 0x333d3c : 0x465045, roughness: 0.85 });
  const cloth2 = new THREE.MeshStandardMaterial({ color: heavy ? 0x262d2c : 0x394239, roughness: 0.85 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xc89a72, roughness: 0.9 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1a1d1a, roughness: 0.8 });

  function part(geo, mat, x, y, z, parent, opts) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    m.userData.enemy = e;
    if (opts) Object.assign(m.userData, opts);
    parent.add(m);
    enemyHitMeshes.push(m);
    return m;
  }
  // 腿
  const legGeo = new THREE.BoxGeometry(0.2, 0.78, 0.24);
  const legL = new THREE.Group(); legL.position.set(0.16, 0.78, 0);
  part(legGeo, cloth2, 0, -0.39, 0, legL); body.add(legL);
  const legR = new THREE.Group(); legR.position.set(-0.16, 0.78, 0);
  part(legGeo, cloth2, 0, -0.39, 0, legR); body.add(legR);
  // 躯干
  part(new THREE.BoxGeometry(0.62, 0.66, 0.34), cloth, 0, 1.25, 0, body);
  part(new THREE.BoxGeometry(0.65, 0.14, 0.37), dark, 0, 1.03, 0, body);
  // 头
  const headG = new THREE.Group(); headG.position.set(0, 1.63, 0);
  part(new THREE.BoxGeometry(0.3, 0.32, 0.3), skin, 0, 0.1, 0, headG, { head: true });
  part(new THREE.BoxGeometry(0.34, 0.16, 0.36), heavy ? dark : cloth2, 0, 0.3, 0, headG, { head: true });
  body.add(headG);
  // 手臂
  const armGeo = new THREE.BoxGeometry(0.16, 0.6, 0.16);
  const armL = new THREE.Group(); armL.position.set(-0.35, 1.52, 0);
  part(armGeo, cloth, 0, -0.28, 0, armL); body.add(armL);
  const armR = new THREE.Group(); armR.position.set(0.35, 1.52, 0);
  part(armGeo, cloth, 0, -0.28, 0, armR); body.add(armR);
  // 枪
  const gunG = new THREE.Group(); gunG.position.set(0, 1.5, -0.12);
  part(new THREE.BoxGeometry(0.09, 0.14, 0.7), GUN_METAL, 0, 0, -0.1, gunG);
  part(new THREE.BoxGeometry(0.05, 0.05, 0.55), GUN_METAL, 0, 0.02, -0.65, gunG);
  part(new THREE.BoxGeometry(0.07, 0.09, 0.24), matGunWood, 0, -0.02, 0.32, gunG);
  const muzzle = new THREE.Object3D(); muzzle.position.set(0, 0.02, -0.95);
  gunG.add(muzzle);
  body.add(gunG);
  // 背包
  part(new THREE.BoxGeometry(0.44, 0.5, 0.2), cloth2, 0, 1.22, 0.22, body);

  if (heavy) {
    body.scale.setScalar(1.1);
    part(new THREE.BoxGeometry(0.3, 0.22, 0.24), new THREE.MeshStandardMaterial({ color: 0x4a1414, roughness: 0.6 }), 0, 1.62, 0.21, body);
  }
  e.group = group; e.body = body; e.legL = legL; e.legR = legR; e.armL = armL; e.armR = armR;
  e.gunG = gunG; e.muzzle = muzzle;
  scene.add(group);
  G.aliveEnemies++;
  return e;
}

/* ------------------------------ particles / effects ------------------------------ */
const particles = [];
const tracers = [];
const casings = [];
const decals = [];
const flashes = [];
const grenades = [];

function addParticle(pos, color, count, speed, life, gravity, size) {
  for (let i = 0; i < count; i++) {
    if (particles.length > 320) {
      const old = particles.shift();
      scene.remove(old.mesh);
      old.mat.dispose();
    }
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(size || 0.06, size || 0.06, size || 0.06), mat);
    mesh.position.copy(pos);
    const a = rand(0, TAU), b = rand(-0.8, 1), sp = rand(speed * 0.35, speed);
    particles.push({ mesh, mat, vx: Math.cos(a) * sp, vy: b * sp, vz: Math.sin(a) * sp,
      life: life * rand(0.7, 1.2), max: life, gravity: gravity || 12 });
    scene.add(mesh);
  }
}
function addTracer(a, b, color, width) {
  const geo = new THREE.BufferGeometry().setFromPoints([a.clone(), b.clone()]);
  const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.85,
    blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
  const line = new THREE.Line(geo, mat);
  scene.add(line);
  tracers.push({ line, mat, life: 0.09, max: 0.09 });
}
function addCasing(pos, right) {
  if (casings.length > 40) return;
  const m = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.055, 6),
    new THREE.MeshStandardMaterial({ color: 0xd8a83c, roughness: 0.35, metalness: 0.85 }));
  m.position.copy(pos); m.position.addScaledVector(right, 0.22); m.position.y -= 0.1;
  casings.push({ mesh: m, vx: right.x * rand(1, 2.2) + rand(-0.4, 0.4), vy: rand(1.4, 2.6),
    vz: right.z * rand(1, 2.2) + rand(-0.4, 0.4), rx: rand(-8, 8), rz: rand(-8, 8), life: 2 });
  scene.add(m);
}
function addDecal(pos, normal) {
  if (decals.length > 36) { const old = decals.shift(); scene.remove(old.mesh); }
  const m = new THREE.Mesh(new THREE.PlaneGeometry(0.26, 0.26),
    new THREE.MeshBasicMaterial({ map: texScorch, transparent: true, depthWrite: false }));
  m.position.copy(pos).addScaledVector(normal, 0.02);
  m.lookAt(pos.clone().add(normal));
  scene.add(m);
  decals.push({ mesh: m, life: 20 });
}
function explode(pos, radius, dmg, friendly) {
  addParticle(pos, 0xffa040, 26, 9, 0.9, 6, 0.16);
  addParticle(pos, 0x3a2c20, 16, 6, 1.4, 3, 0.22);
  addParticle(pos, 0xffe08a, 12, 13, 0.5, 4, 0.12);
  const light = new THREE.PointLight(0xff9a3c, 90, radius * 3, 2);
  light.position.copy(pos).y += 0.6;
  scene.add(light);
  flashes.push({ light, life: 0.28, max: 0.28 });
  const distP = G.pos.distanceTo(pos);
  if (friendly && distP < radius) damagePlayer(clamp(dmg * (1 - distP / radius), 8, dmg));
  for (let i = G.enemies.length - 1; i >= 0; i--) {
    const e = G.enemies[i];
    if (e.dead) continue;
    const d = e.group.position.distanceTo(pos);
    if (d < radius) {
      e.alert = 1;
      damageEnemy(e, dmg * (1 - d / radius) + 10, false);
    }
  }
  if (distP < radius * 1.6) G.shake = Math.min(1, G.shake + 0.55 * (1 - distP / (radius * 1.6)));
}
function updateEffects(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life -= dt;
    if (p.life <= 0) { scene.remove(p.mesh); particles.splice(i, 1); continue; }
    p.vy -= p.gravity * dt;
    p.mesh.position.x += p.vx * dt; p.mesh.position.y += p.vy * dt; p.mesh.position.z += p.vz * dt;
    if (p.mesh.position.y < 0.03) { p.mesh.position.y = 0.03; p.vy *= -0.35; p.vx *= 0.7; p.vz *= 0.7; }
    p.mat.opacity = clamp(p.life / p.max, 0, 1);
    p.mesh.rotation.x += dt * 6; p.mesh.rotation.z += dt * 5;
  }
  for (let i = tracers.length - 1; i >= 0; i--) {
    const t = tracers[i]; t.life -= dt;
    if (t.life <= 0) { scene.remove(t.line); t.line.geometry.dispose(); t.mat.dispose(); tracers.splice(i, 1); continue; }
    t.mat.opacity = t.life / t.max;
  }
  for (let i = casings.length - 1; i >= 0; i--) {
    const c = casings[i]; c.life -= dt;
    if (c.life <= 0) { scene.remove(c.mesh); casings.splice(i, 1); continue; }
    c.vy -= 14 * dt;
    c.mesh.position.x += c.vx * dt; c.mesh.position.y += c.vy * dt; c.mesh.position.z += c.vz * dt;
    if (c.mesh.position.y < 0.025) { c.mesh.position.y = 0.025; c.vy *= -0.3; c.vx *= 0.6; c.vz *= 0.6; }
    c.mesh.rotation.x += c.rx * dt; c.mesh.rotation.z += c.rz * dt;
  }
  for (let i = decals.length - 1; i >= 0; i--) {
    decals[i].life -= dt;
    if (decals[i].life <= 0) { scene.remove(decals[i].mesh); decals.splice(i, 1); }
  }
  for (let i = flashes.length - 1; i >= 0; i--) {
    const f = flashes[i]; f.life -= dt;
    f.light.intensity = 90 * (f.life / f.max);
    if (f.life <= 0) { scene.remove(f.light); flashes.splice(i, 1); }
  }
  for (let i = grenades.length - 1; i >= 0; i--) {
    const g = grenades[i]; g.life += dt;
    g.vel.y -= 22 * dt;
    g.mesh.position.addScaledVector(g.vel, dt);
    g.mesh.rotation.x += g.spin * dt; g.mesh.rotation.z += g.spin * 0.7 * dt;
    if (g.trailT <= 0) { g.trailT = 0.04; addParticle(g.mesh.position, 0xbfc9b0, 1, 0.4, 0.25, 0, 0.04); }
    g.trailT -= dt;
    let hit = g.mesh.position.y <= 0.08;
    if (!hit) for (let j = 0; j < colliders.length; j++) {
      const o = colliders[j];
      if (g.mesh.position.x > o.minX - 0.1 && g.mesh.position.x < o.maxX + 0.1 &&
          g.mesh.position.z > o.minZ - 0.1 && g.mesh.position.z < o.maxZ + 0.1 &&
          g.mesh.position.y < o.h + 0.1) { hit = true; break; }
    }
    if (hit || g.life > 1.6) {
      scene.remove(g.mesh);
      explode(g.mesh.position, 9, 150, true);
      grenades.splice(i, 1);
    }
  }
}

/* ------------------------------ audio (WebAudio 合成) ------------------------------ */
let AC = null, master = null, noiseBuf = null;
function audioInit() {
  if (AC) { if (AC.state === 'suspended') AC.resume(); return; }
  try {
    AC = new (window.AudioContext || window.webkitAudioContext)();
    master = AC.createGain(); master.gain.value = G.muted ? 0 : 0.5;
    master.connect(AC.destination);
    const len = AC.sampleRate;
    noiseBuf = AC.createBuffer(1, len, AC.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  } catch (e) { AC = null; }
}
function sfxNoise(dur, freq, q, type, vol, when, slideTo) {
  if (!AC) return;
  const t0 = AC.currentTime + (when || 0);
  const src = AC.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
  const f = AC.createBiquadFilter(); f.type = type || 'lowpass'; f.frequency.value = freq; f.Q.value = q || 0.8;
  if (slideTo) f.frequency.exponentialRampToValueAtTime(Math.max(30, slideTo), t0 + dur);
  const gn = AC.createGain(); gn.gain.setValueAtTime(vol, t0);
  gn.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  src.connect(f); f.connect(gn); gn.connect(master);
  src.start(t0); src.stop(t0 + dur + 0.02);
}
function sfxTone(type, f0, f1, dur, vol, when) {
  if (!AC) return;
  const t0 = AC.currentTime + (when || 0);
  const o = AC.createOscillator(); o.type = type; o.frequency.setValueAtTime(f0, t0);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
  const gn = AC.createGain(); gn.gain.setValueAtTime(vol, t0);
  gn.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  o.connect(gn); gn.connect(master);
  o.start(t0); o.stop(t0 + dur + 0.02);
}
const sfx = {
  shot(kind) {
    if (kind === 'm1014') { sfxNoise(0.24, 1400, 0.6, 'lowpass', 0.9); sfxTone('square', 160, 45, 0.22, 0.5); }
    else if (kind === 'm40') { sfxNoise(0.38, 2200, 0.5, 'lowpass', 1.0); sfxTone('sawtooth', 300, 50, 0.3, 0.55); }
    else if (kind === 'mp7') { sfxNoise(0.1, 3000, 1, 'bandpass', 0.55); sfxTone('square', 520, 180, 0.08, 0.25); }
    else { sfxNoise(0.13, 2600, 0.8, 'lowpass', 0.7); sfxTone('sawtooth', 620, 160, 0.11, 0.32); }
  },
  enemy(dist) { const v = clamp(1 - dist / 75, 0.05, 0.5); sfxNoise(0.09, 1800, 1, 'bandpass', v); sfxTone('square', 420, 140, 0.06, v * 0.5); },
  reload() { sfxTone('square', 700, 300, 0.05, 0.15, 0); sfxTone('square', 500, 220, 0.05, 0.15, 0.55); sfxTone('square', 900, 420, 0.06, 0.18, 1.15); },
  hitmark() { sfxTone('square', 1900, 1400, 0.035, 0.16); },
  kill() { sfxTone('square', 2400, 1200, 0.08, 0.2); sfxTone('square', 1600, 900, 0.09, 0.18, 0.06); },
  hurt() { sfxNoise(0.14, 700, 0.7, 'lowpass', 0.55); sfxTone('sine', 180, 70, 0.16, 0.4); },
  empty() { sfxTone('square', 1200, 800, 0.03, 0.2); },
  step() { sfxNoise(0.045, 500, 0.7, 'lowpass', 0.08); },
  explosion() { sfxNoise(0.7, 900, 0.5, 'lowpass', 1.0); sfxTone('sine', 120, 35, 0.55, 0.8); },
  throwSnd() { sfxNoise(0.12, 1600, 1, 'bandpass', 0.2); }
};
function setMuted(m) { G.muted = m; if (master) master.gain.value = m ? 0 : 0.5; }

/* ------------------------------ player damage ------------------------------ */
let lastHitBy = null;
function damagePlayer(d) {
  if (G.dead) return;
  G.health -= d;
  G.lastDamage = G.time;
  G.shake = Math.min(1, G.shake + 0.35);
  sfx.hurt();
  el.dmg.style.opacity = 1;
  if (G.health <= 0) { G.health = 0; diePlayer(); }
}
function diePlayer() {
  G.dead = true; G.health = 0;
  G.mouseDown = false; G.adsDown = false; G.jumpQueued = false;
  document.exitPointerLock && document.exitPointerLock();
  el.death.style.display = 'flex';
  el.deathStats.textContent = '波次 ' + G.wave + ' · 得分 ' + G.score + ' · 击杀 ' + G.kills + ' · 最高连杀 ' + G.killstreak;
  el.hud.style.display = 'none';
}
function respawn() {
  G.dead = false; G.health = 100; G.pos.set(0, 0, 0); G.vel.set(0, 0, 0);
  G.lastDamage = -99; G.killsSinceDeath = 0; G.grenades = 3;
  const w = WEAPONS[G.weaponIdx]; w.ammo = w.mag; w.reserve = w.reserveMax;
  G.reloadT = 0; G.fireTimer = 0; G.bloom = 0;
  el.death.style.display = 'none';
  el.hud.style.display = 'block';
  requestLock();
}
function killEnemy(e, head) {
  if (e.dead) return;
  e.dead = true; e.deadT = 0;
  G.aliveEnemies--;
  G.kills++; G.killstreak++; G.killsSinceDeath++;
  const pts = 100 + (head ? 50 : 0) + (e.heavy ? 50 : 0);
  G.score += pts;
  sfx.kill();
  addParticle(e.body.position.clone().add(V3(0, 1.2, 0)), 0xb0120e, 12, 3.5, 0.5, 7, 0.09);
  showHitmarker(head ? 'head' : 'kill');
  addKillfeed(e.name + ' 已击毙  +' + pts);
  for (let i = enemyHitMeshes.length - 1; i >= 0; i--) {
    if (enemyHitMeshes[i].userData.enemy === e) enemyHitMeshes.splice(i, 1);
  }
  if (G.killsSinceDeath === 5) toast('连杀 ×5 — 空袭支援就绪');
  else if (G.killsSinceDeath === 10) toast('连杀 ×10 — 无人能挡');
  else if (G.killsSinceDeath === 15) toast('连杀 ×15 — 传说战士');
}
function damageEnemy(e, dmg, head) {
  if (e.dead) return false;
  e.hp -= dmg; e.flash = 0.12; e.alert = 1;
  if (e.hp <= 0) { killEnemy(e, head); return true; }
  return false;
}

/* ------------------------------ firing ------------------------------ */
const raycaster = new THREE.Raycaster();
const _dir = new THREE.Vector3(), _right = new THREE.Vector3(), _up = new THREE.Vector3();
const _tmpA = new THREE.Vector3(), _tmpB = new THREE.Vector3();

function weaponSpread() {
  const w = WEAPONS[G.weaponIdx];
  let s = lerp(w.spreadHip, w.spreadAds, G.ads) + G.bloom * 0.06;
  s += G.speed > 7 ? 0.008 : G.speed > 2.5 ? 0.0035 : 0;
  if (!G.grounded) s += 0.02;
  if (G.crouch) s *= 0.7;
  return s;
}
function fireOnce() {
  const w = WEAPONS[G.weaponIdx];
  if (G.switchT > 0 || G.reloadT > 0) return;
  if (w.ammo <= 0) {
    if (G.clickT <= 0) { sfx.empty(); G.clickT = 0.35; el.prompt.style.display = 'block'; }
    return;
  }
  w.ammo--;
  G.fireTimer = 60 / w.rpm;
  G.bloom = Math.min(1, G.bloom + w.bloomShot);
  const rec = lerp(w.recoil, w.recoil * 0.55, G.ads);
  G.recoilPitch += rec * rand(0.85, 1.35);
  G.recoilYaw += rand(-rec, rec) * 0.6;
  G.kick = 1;
  G.shake = Math.min(1, G.shake + rec * 14);
  G.muzzleT = 0.05;
  w.flashLight.intensity = 5;
  sfx.shot(w.id);
  camera.updateMatrixWorld(true);
  const muzzle = w.muzzleObj.getWorldPosition(_tmpA);
  const origin = camera.getWorldPosition(_tmpB);
  camera.getWorldDirection(_dir);
  _right.setFromMatrixColumn(camera.matrixWorld, 0).normalize();
  _up.setFromMatrixColumn(camera.matrixWorld, 1).normalize();
  const spread = weaponSpread();
  for (let p = 0; p < w.pellets; p++) {
    const d = _dir.clone();
    const r = spread * Math.sqrt(Math.random()), a = rand(0, TAU);
    d.addScaledVector(_right, Math.cos(a) * r).addScaledVector(_up, Math.sin(a) * r).normalize();
    raycaster.set(origin, d);
    raycaster.far = 300;
    const targets = enemyHitMeshes.length ? solidMeshes.concat(enemyHitMeshes) : solidMeshes;
    const hits = raycaster.intersectObjects(targets, true);
    const end = origin.clone().addScaledVector(d, 90);
    if (hits.length) {
      const hit = hits[0];
      end.copy(hit.point);
      const ud = hit.object.userData;
      if (ud.barrel) {
        explodeBarrel(hit.object, hit.point);
      } else if (ud.enemy) {
        const fall = clamp(1.15 - hit.distance * 0.003, 0.5, 1);
        let dmg = w.damage * fall * (ud.head ? w.headMult : 1);
        if (w.id === 'm1014') dmg *= clamp(1.5 - hit.distance * 0.025, 0.4, 1.5);
        damageEnemy(ud.enemy, dmg, !!ud.head);
        addParticle(hit.point, 0xc01a10, 5, 2.5, 0.4, 7, 0.07);
        showHitmarker(ud.head ? 'head' : '');
      } else {
        const n = hit.face ? hit.face.normal.clone().transformDirection(hit.object.matrixWorld) : V3(0, 1, 0);
        addParticle(hit.point, hit.object === ground ? 0x9a8f70 : 0xd8d2c0, 5, 2.2, 0.35, 6, 0.05);
        addDecal(hit.point, n);
      }
    }
    addTracer(muzzle, end, w.tracer, 0.018);
  }
  if (w.shell) addCasing(camera.getWorldPosition(_tmpA), _right.clone());
}
function explodeBarrel(mesh, point) {
  if (mesh.userData.barrel === 'dead') return;
  mesh.userData.barrel = 'dead';
  const idx = solidMeshes.indexOf(mesh); if (idx >= 0) solidMeshes.splice(idx, 1);
  scene.remove(mesh);
  addDecal(V3(point.x, 0.02, point.z), V3(0, 1, 0));
  explode(point, 7.5, 130, true);
  sfx.explosion();
}
function startReload() {
  const w = WEAPONS[G.weaponIdx];
  if (G.reloadT > 0 || G.switchT > 0 || w.ammo >= w.mag || w.reserve <= 0) return;
  G.reloadT = w.reload; G.bloom = Math.min(1, G.bloom + 0.08);
  el.prompt.style.display = 'none';
  sfx.reload();
}
function selectWeapon(i) {
  if (i < 0 || i >= WEAPONS.length || i === G.weaponIdx || G.switchT > 0) return;
  G.oldIdx = G.weaponIdx; G.weaponIdx = i; G.switchT = 0.5;
  G.reloadT = 0; G.fireTimer = 0; G.kick = 0;
}
function throwGrenade() {
  if (G.dead || G.paused || G.grenadeT > 0 || G.grenades <= 0) return;
  G.grenades--; G.grenadeT = 1.1;
  const fwd = camera.getWorldDirection(_dir);
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8),
    new THREE.MeshStandardMaterial({ color: 0x3d4a35, roughness: 0.6, metalness: 0.3 }));
  mesh.position.copy(camera.getWorldPosition(_tmpA)).addScaledVector(fwd, 0.7); mesh.position.y -= 0.12;
  const vel = fwd.clone().multiplyScalar(16); vel.y += 4.5;
  grenades.push({ mesh, vel, life: 0, spin: rand(8, 14), trailT: 0 });
  scene.add(mesh);
  sfx.throwSnd();
}

/* ------------------------------ waves / spawns ------------------------------ */
const SPAWNS = [];
for (let i = 0; i < 16; i++) {
  const a = i / 16 * TAU + rand(-0.1, 0.1);
  SPAWNS.push(V3(Math.cos(a) * rand(58, 70), 0, Math.sin(a) * rand(58, 70)));
}
function beginWave(n) {
  G.wave = n; G.waveState = 'combat';
  G.spawnQueue = Math.min(4 + n * 2, 15);
  G.spawnTimer = 0.6;
  showWaveTag('第 ' + n + ' 波');
  toast('第 ' + n + ' 波 · 敌军来袭');
}
function spawnEnemy() {
  let best = null, bestD = -1;
  for (let i = 0; i < SPAWNS.length; i++) {
    const d = G.pos.distanceTo(SPAWNS[i]);
    if (d > 24 && d > bestD) { bestD = d; best = SPAWNS[i]; }
  }
  if (!best) best = SPAWNS[randInt(0, SPAWNS.length - 1)];
  const heavy = G.wave >= 2 && Math.random() < (G.wave >= 5 ? 0.3 : 0.18);
  const e = makeSoldier(best.clone().add(V3(rand(-2, 2), 0, rand(-2, 2))), heavy);
  G.enemies.push(e);
  G.spawnQueue--;
}
function updateWaves(dt) {
  if (G.waveState === 'intro' || G.waveState === 'intermission') {
    G.waveTimer -= dt;
    if (G.waveTimer <= 0) beginWave(G.wave + 1);
  } else {
    if (G.spawnQueue > 0) {
      G.spawnTimer -= dt;
      if (G.spawnTimer <= 0) {
        spawnEnemy();
        G.spawnTimer = clamp(2.6 - G.wave * 0.18, 0.7, 2.6);
      }
    } else if (G.aliveEnemies <= 0) {
      G.score += 150 + G.wave * 50;
      G.waveState = 'intermission'; G.waveTimer = 4;
      showWaveTag('区域肃清 +' + (150 + G.wave * 50));
      toast('区域肃清 · 增援即将到达');
    }
  }
}

/* ------------------------------ enemy AI ------------------------------ */
function updateEnemy(e, dt) {
  if (e.dead) {
    e.deadT += dt;
    if (e.deadT < 0.5) e.body.rotation.x = lerp(0, 1.35, e.deadT / 0.5);
    else if (e.deadT > 3.2) e.body.position.y -= dt * 0.6;
    if (e.deadT > 4.2) { scene.remove(e.group); const i = G.enemies.indexOf(e); if (i >= 0) G.enemies.splice(i, 1); }
    return;
  }
  if (e.flash > 0) e.flash -= dt;
  const dx = G.pos.x - e.group.position.x, dz = G.pos.z - e.group.position.z;
  const dist = Math.hypot(dx, dz) || 0.001;
  e.group.rotation.y = Math.atan2(-dx, -dz);
  const los = dist < 80 && hasLOS(e.group.position.x, 1.55, e.group.position.z, G.pos.x, G.eyeHeight, G.pos.z);
  if (los) e.alert = 1;
  // 移动
  let mx = 0, mz = 0;
  if (los && dist < 52) {
    e.strafeT -= dt;
    if (e.strafeT <= 0) { e.strafeT = rand(1.4, 3.2); e.strafeDir *= -1; }
    const radial = clamp(dist - e.preferred, -1.2, 1.2);
    const nx = -dz / dist, nz = dx / dist;
    mx = (dx / dist) * radial * 0.85 + nx * e.strafeDir * 0.75;
    mz = (dz / dist) * radial * 0.85 + nz * e.strafeDir * 0.75;
  } else {
    mx = dx / dist; mz = dz / dist;
  }
  const speed = e.heavy ? 2.7 : (dist > 30 ? 4.6 : 3.3);
  const len = Math.hypot(mx, mz) || 1;
  const nx = e.group.position.x + mx / len * speed * dt;
  const nz = e.group.position.z + mz / len * speed * dt;
  e.group.position.copy(resolveCircle(nx, nz, 0.42, _tmpA));
  const moved = Math.hypot(e.group.position.x - (e._px || 0), e.group.position.z - (e._pz || 0));
  e._px = e.group.position.x; e._pz = e.group.position.z;
  e.walkPhase += dt * (moved > 0.001 ? 9 : 0);
  e.legL.rotation.x = Math.sin(e.walkPhase) * 0.65;
  e.legR.rotation.x = -Math.sin(e.walkPhase) * 0.65;
  // 瞄准
  const pitch = clamp(Math.atan2(G.eyeHeight - 1.5, dist), -0.5, 0.7);
  e.gunG.rotation.x = lerp(e.gunG.rotation.x, los ? pitch * 0.8 : -0.25, dt * 8);
  e.armL.rotation.x = lerp(e.armL.rotation.x, los ? -1.15 : -0.5, dt * 6);
  e.armR.rotation.x = lerp(e.armR.rotation.x, los ? -1.15 : -0.5, dt * 6);
  if (e.gunKick > 0) e.gunKick -= dt * 5;
  e.gunG.position.z = -0.12 + e.gunKick * 0.06;
  // 射击
  if (los && dist < 62) {
    if (e.cooldown <= 0 && e.burstLeft <= 0) {
      e.burstLeft = randInt(3, 5);
      e.burstT = rand(0.12, 0.3);
      e.cooldown = rand(2.3, 3.8) * (e.heavy ? 0.85 : 1);
    }
    if (e.burstLeft > 0) {
      e.burstT -= dt;
      if (e.burstT <= 0) {
        e.burstT = 0.14;
        e.burstLeft--;
        e.gunKick = 1;
        enemyFire(e, dist);
      }
    }
  }
  e.cooldown -= dt;
}
function enemyFire(e, dist) {
  e.group.updateMatrixWorld(true);
  const from = e.muzzle.getWorldPosition(_tmpA);
  const target = _tmpB.copy(G.pos); target.y += G.eyeHeight - 0.25;
  target.x += rand(-1, 1) * (0.25 + dist * 0.05);
  target.y += rand(-1, 1) * (0.2 + dist * 0.03);
  target.z += rand(-1, 1) * (0.25 + dist * 0.05);
  addTracer(from, target, 0xff8a5c, 0.014);
  sfx.enemy(dist);
  const moving = G.speed > 6 ? 0.14 : G.speed > 2 ? 0.07 : 0;
  const chance = clamp(0.8 - dist * 0.012 - (G.crouch ? 0.18 : 0) - moving, 0.05, 0.95);
  if (Math.random() < chance) damagePlayer(rand(6, 12) * (e.heavy ? 1.5 : 1));
}
function updateEnemySeparation() {
  for (let i = 0; i < G.enemies.length; i++) {
    const a = G.enemies[i]; if (a.dead) continue;
    for (let j = i + 1; j < G.enemies.length; j++) {
      const b = G.enemies[j]; if (b.dead) continue;
      const dx = b.group.position.x - a.group.position.x;
      const dz = b.group.position.z - a.group.position.z;
      const d = Math.hypot(dx, dz);
      if (d > 0.01 && d < 0.95) {
        const push = (0.95 - d) * 0.5 / d;
        a.group.position.x -= dx * push; a.group.position.z -= dz * push;
        b.group.position.x += dx * push; b.group.position.z += dz * push;
      }
    }
  }
}

/* ------------------------------ player controller ------------------------------ */
function updatePlayer(dt) {
  const k = G.keys;
  const f = (k['KeyW'] ? 1 : 0) - (k['KeyS'] ? 1 : 0);
  const s = (k['KeyD'] ? 1 : 0) - (k['KeyA'] ? 1 : 0);
  const sprint = k['ShiftLeft'] || k['ShiftRight'];
  const w = WEAPONS[G.weaponIdx];

  let speedBase = 5.4;
  if (G.crouch) speedBase *= 0.55;
  speedBase *= lerp(1, 0.62, G.ads) * w.moveScale;
  let sprinting = false;
  if (sprint && f > 0 && !G.ads && !G.crouch && G.stamina > 1 && G.grounded) {
    speedBase *= 1.55; sprinting = true;
    G.stamina = Math.max(0, G.stamina - 22 * dt); G.staminaDelay = 0.6;
  } else {
    G.staminaDelay -= dt;
    if (G.staminaDelay <= 0) G.stamina = Math.min(100, G.stamina + 16 * dt);
  }
  const fx = -Math.sin(G.yaw), fz = -Math.cos(G.yaw);
  const rx = Math.cos(G.yaw), rz = -Math.sin(G.yaw);
  let tx = (fx * f + rx * s), tz = (fz * f + rz * s);
  const tl = Math.hypot(tx, tz);
  if (tl > 1) { tx /= tl; tz /= tl; }
  const targetSpeed = speedBase * tl;
  G.vel.x = lerp(G.vel.x, tx * speedBase, clamp(dt * 9, 0, 1));
  G.vel.z = lerp(G.vel.z, tz * speedBase, clamp(dt * 9, 0, 1));
  G.speed = Math.hypot(G.vel.x, G.vel.z);

  // 跳跃 / 重力
  G.vy -= 16 * dt;
  if (G.grounded && G.jumpQueued) { G.vy = 5.3; G.grounded = false; G.jumpQueued = false; sfx.step(); }
  G.pos.y += G.vy * dt;
  if (G.pos.y <= 0) { G.pos.y = 0; G.vy = 0; G.grounded = true; }

  const ny = G.pos.y;
  resolveCircle(G.pos.x + G.vel.x * dt, G.pos.z + G.vel.z * dt, 0.42, _tmpA);
  G.pos.set(_tmpA.x, ny, _tmpA.z);

  // 蹲下
  const targetEye = G.crouch ? 1.05 : 1.62;
  G.eyeHeight = lerp(G.eyeHeight, targetEye, clamp(dt * 10, 0, 1));

  // 摇摆
  const bobAmp = clamp(G.speed / 6, 0, 1) * (G.grounded ? 1 : 0.25);
  G.bobPhase += dt * (3.2 + G.speed * 1.35);
  const bobY = Math.sin(G.bobPhase * 2) * 0.028 * bobAmp;
  const bobX = Math.cos(G.bobPhase) * 0.016 * bobAmp;

  // 脚步声
  const stepNow = Math.sin(G.bobPhase * 2) > 0;
  if (stepNow !== G.stepFlag && G.grounded && G.speed > 1.5) {
    G.stepFlag = stepNow;
    sfxNoise(0.05, sprinting ? 650 : 450, 0.7, 'lowpass', sprinting ? 0.14 : 0.08);
  }

  // 相机
  G.recoilPitch = lerp(G.recoilPitch, 0, clamp(dt * 9, 0, 1));
  G.recoilYaw = lerp(G.recoilYaw, 0, clamp(dt * 9, 0, 1));
  G.shake = Math.max(0, G.shake - dt * 2.2);
  const shX = rand(-1, 1) * G.shake * 0.008, shY = rand(-1, 1) * G.shake * 0.008;
  camera.position.set(G.pos.x, G.pos.y + G.eyeHeight + bobY, G.pos.z);
  camera.rotation.y = G.yaw;
  camera.rotation.x = G.pitch + G.recoilPitch + shX;
  camera.rotation.z = -s * 0.015 * bobAmp + G.recoilYaw * 0.3 + shY;
  camera.fov = lerp(camera.fov, lerp(75, w.fov, G.ads) + (sprinting ? 4 : 0), clamp(dt * 10, 0, 1));
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);

  // 开镜
  G.ads = lerp(G.ads, G.adsDown && !G.dead ? 1 : 0, clamp(dt * 10, 0, 1));
  G.spread = weaponSpread();

  // 射击 / 换弹 / 切换
  if (G.fireTimer > 0) G.fireTimer -= dt;
  if (G.clickT > 0) G.clickT -= dt;
  if (G.grenadeT > 0) G.grenadeT -= dt;
  G.bloom = Math.max(0, G.bloom - dt * 1.6);
  G.kick = Math.max(0, G.kick - dt * 7);
  if (G.reloadT > 0) {
    G.reloadT -= dt;
    if (G.reloadT <= 0) {
      const w2 = WEAPONS[G.weaponIdx];
      const take = Math.min(w2.mag - w2.ammo, w2.reserve);
      w2.ammo += take; w2.reserve -= take;
    }
  }
  if (G.switchT > 0) G.switchT -= dt;
  if (G.mouseDown && G.switchT <= 0 && G.reloadT <= 0 && G.fireTimer <= 0) {
    if (w.auto && w.ammo > 0) fireOnce(); else if (w.auto && w.ammo <= 0 && G.clickT <= 0) { sfx.empty(); G.clickT = 0.35; }
  }
  // 枪口闪光
  if (G.muzzleT > 0) {
    G.muzzleT -= dt;
    const fl = w.flash;
    fl[0].visible = fl[1].visible = true;
    fl[0].rotation.z = rand(0, TAU);
    fl[1].rotation.z = rand(0, TAU);
    const sc = rand(0.7, 1.25);
    fl[0].scale.set(sc, sc, 1); fl[1].scale.set(sc, sc, 1);
    w.flashLight.intensity = 5 * (G.muzzleT / 0.05);
  } else {
    w.flash[0].visible = w.flash[1].visible = false;
    w.flashLight.intensity = 0;
  }
  updateViewModels(dt);
}
function updateViewModels(dt) {
  for (let i = 0; i < viewModels.length; i++) {
    const vm = viewModels[i], cfg = WEAPONS[i];
    let drop = 0, reload = G.reloadT > 0 && i === G.weaponIdx;
    if (G.switchT > 0) {
      const t = 1 - G.switchT / 0.5;
      if (i === G.oldIdx && t < 0.5) { vm.visible = true; drop = t * 2; }
      else if (i === G.weaponIdx && t >= 0.5) { vm.visible = true; drop = 1 - (t - 0.5) * 2; }
      else vm.visible = false;
    } else {
      vm.visible = i === G.weaponIdx;
    }
    if (!vm.visible) continue;
    const bob = G.grounded ? clamp(G.speed / 7, 0, 1) : 0;
    const bx = Math.sin(G.bobPhase) * 0.007 * bob;
    const by = Math.abs(Math.cos(G.bobPhase)) * 0.007 * bob;
    let px = lerp(cfg.hip.x, cfg.ads.x, G.ads) + bx;
    let py = lerp(cfg.hip.y, cfg.ads.y, G.ads) + by - drop * 0.3;
    let pz = lerp(cfg.hip.z, cfg.ads.z, G.ads) + G.kick * 0.09 + drop * 0.18;
    let rx = G.kick * -0.22 + drop * 0.85;
    if (reload) { py -= 0.16; px += 0.1; rx += 0.55; }
    vm.position.set(px, py, pz);
    vm.rotation.set(rx, 0, lerp(-0.05, 0, G.ads));
    if (cfg.scopeMesh) cfg.scopeMesh.visible = !(cfg.scope && G.ads > 0.5);
  }
  void dt;
}

/* ------------------------------ UI ------------------------------ */
let hitmarkTimer = 0;
function showHitmarker(cls) {
  el.hitmarker.className = cls || '';
  el.hitmarker.style.transition = 'none';
  el.hitmarker.style.opacity = 1;
  requestAnimationFrame(() => {
    el.hitmarker.style.transition = 'opacity .22s';
    el.hitmarker.style.opacity = 0;
  });
  sfx.hitmark();
}
function addKillfeed(text) {
  const d = document.createElement('div');
  d.className = 'kf'; d.textContent = text;
  el.killfeed.appendChild(d);
  while (el.killfeed.children.length > 5) el.killfeed.removeChild(el.killfeed.firstChild);
  setTimeout(() => { d.style.opacity = 0; setTimeout(() => d.remove(), 1100); }, 3500);
}
let toastTimer = 0;
function toast(text) {
  el.toast.textContent = text; el.toast.classList.add('show');
  toastTimer = 2.6;
}
function showWaveTag(text) {
  el.waveTag.textContent = text;
  el.waveTag.style.display = 'block';
  el.waveTag.style.opacity = 1;
  setTimeout(() => { el.waveTag.style.opacity = 0; }, 1600);
  setTimeout(() => { el.waveTag.style.display = 'none'; }, 2300);
}
function updateHUD() {
  const w = WEAPONS[G.weaponIdx];
  el.healthFill.style.width = Math.max(0, G.health) + '%';
  el.healthText.textContent = '生命 ' + Math.ceil(Math.max(0, G.health));
  el.staminaFill.style.width = G.stamina + '%';
  el.ammoMag.textContent = w.ammo;
  el.ammoReserve.textContent = w.reserve;
  el.weaponName.textContent = w.name;
  el.grenadeCount.textContent = G.grenades;
  el.scoreVal.textContent = G.score;
  el.waveVal.textContent = G.wave;
  el.killVal.textContent = G.kills;
  el.lowhp.style.display = (G.health <= 35 && !G.dead) ? 'block' : 'none';
  if (w.ammo <= 0 && G.reloadT <= 0 && G.switchT <= 0) el.prompt.style.display = 'block';
  else if (G.reloadT > 0) { el.prompt.style.display = 'block'; el.prompt.textContent = '换弹中…'; }
  else { el.prompt.style.display = 'none'; el.prompt.textContent = '按 R 换弹'; }
  // 准星
  const sp = clamp(6 + G.spread * 2200, 6, 64);
  el.crosshair.style.setProperty('--spread', sp + 'px');
  el.crosshair.style.opacity = G.ads > 0.55 ? 0 : 1;
  el.scope.style.display = (G.ads > 0.6 && w.scope) ? 'block' : 'none';
  // 受击
  const since = G.time - G.lastDamage;
  el.dmg.style.opacity = since < 1 ? clamp(1 - since, 0, 1) : 0;
  if (toastTimer > 0) { toastTimer -= 1 / 60; if (toastTimer <= 0) el.toast.classList.remove('show'); }
}
function drawRadar() {
  const cv = el.radar, c = ctx2d, S = 168, scale = S / 110;
  c.clearRect(0, 0, S, S);
  c.fillStyle = 'rgba(8,14,8,.7)'; c.fillRect(0, 0, S, S);
  c.strokeStyle = 'rgba(140,190,110,.35)'; c.lineWidth = 1;
  c.beginPath(); c.arc(S / 2, S / 2, S * 0.46, 0, TAU); c.stroke();
  const ox = S / 2 - G.pos.x * scale, oz = S / 2 - G.pos.z * scale;
  c.fillStyle = 'rgba(150,190,130,.35)';
  for (let i = 0; i < colliders.length; i++) {
    const o = colliders[i];
    const x = ox + o.minX * scale, y = oz + o.minZ * scale;
    const w = (o.maxX - o.minX) * scale, h = (o.maxZ - o.minZ) * scale;
    if (x < -20 || y < -20 || x > S + 20 || y > S + 20) continue;
    c.fillRect(x, y, Math.max(2, w), Math.max(2, h));
  }
  c.fillStyle = '#ff5a3c';
  for (let i = 0; i < G.enemies.length; i++) {
    const e = G.enemies[i]; if (e.dead) continue;
    const x = ox + e.group.position.x * scale, y = oz + e.group.position.z * scale;
    if (x < 2 || y < 2 || x > S - 2 || y > S - 2) continue;
    c.beginPath(); c.arc(x, y, e.heavy ? 4 : 3, 0, TAU); c.fill();
  }
  c.save();
  c.translate(S / 2, S / 2); c.rotate(-G.yaw);
  c.fillStyle = '#e8ffd0';
  c.beginPath(); c.moveTo(0, -7); c.lineTo(5, 6); c.lineTo(0, 3); c.lineTo(-5, 6); c.closePath(); c.fill();
  c.restore();
}

/* ------------------------------ input ------------------------------ */
const canvas = renderer.domElement;
function requestLock() { if (document.pointerLockElement !== canvas) { const p = canvas.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } }
document.addEventListener('keydown', ev => {
  G.keys[ev.code] = true;
  if (ev.code === 'Space') { ev.preventDefault(); if (G.grounded) G.jumpQueued = true; }
  if (G.dead && ev.code === 'KeyR') { respawn(); return; }
  if (!G.started || G.dead) return;
  if (ev.code === 'KeyM') { setMuted(!G.muted); return; }
  if (G.paused) return;
  if (ev.code === 'KeyR') startReload();
  else if (ev.code === 'Digit1') selectWeapon(0);
  else if (ev.code === 'Digit2') selectWeapon(1);
  else if (ev.code === 'Digit3') selectWeapon(2);
  else if (ev.code === 'Digit4') selectWeapon(3);
  else if (ev.code === 'KeyG') throwGrenade();
  else if (ev.code === 'KeyC') G.crouch = !G.crouch;
});
document.addEventListener('keyup', ev => {
  G.keys[ev.code] = false;
  if (ev.code === 'Space') G.jumpQueued = false;
});
document.addEventListener('mousemove', ev => {
  if (document.pointerLockElement !== canvas || G.dead) return;
  G.yaw -= ev.movementX * 0.0021;
  G.pitch = clamp(G.pitch - ev.movementY * 0.0021, -1.45, 1.45);
});
document.addEventListener('mousedown', ev => {
  if (!G.started || G.dead || G.paused) return;
  if (ev.button === 0) {
    G.mouseDown = true;
    if (!WEAPONS[G.weaponIdx].auto) fireOnce();
  } else if (ev.button === 2) G.adsDown = true;
});
document.addEventListener('mouseup', ev => {
  if (ev.button === 0) G.mouseDown = false;
  else if (ev.button === 2) G.adsDown = false;
});
document.addEventListener('wheel', ev => {
  if (!G.started || G.dead || G.paused) return;
  selectWeapon(G.weaponIdx + (ev.deltaY > 0 ? 1 : -1));
});
document.addEventListener('contextmenu', ev => ev.preventDefault());
document.addEventListener('pointerlockchange', () => {
  const locked = document.pointerLockElement === canvas;
  if (locked) {
    G.hadLock = true;
    if (G.started && !G.dead) { G.paused = false; el.pause.style.display = 'none'; }
  } else if (G.started && !G.dead && G.hadLock) {
    G.paused = true; el.pause.style.display = 'flex';
  }
});
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

/* ------------------------------ game flow ------------------------------ */
function startGame() {
  audioInit();
  G.started = true;
  G.score = 0; G.kills = 0; G.killstreak = 0; G.killsSinceDeath = 0;
  G.health = 100; G.stamina = 100; G.pos.set(0, 0, 0);
  G.wave = 0; G.waveState = 'intro'; G.waveTimer = 1.0;
  G.spawnQueue = 0; G.aliveEnemies = 0;
  G.enemies.forEach(e => { scene.remove(e.group); });
  G.enemies.length = 0;
  enemyHitMeshes.length = 0;
  WEAPONS.forEach(w => { w.ammo = w.mag; w.reserve = w.reserveMax; });
  G.weaponIdx = 0; G.reloadT = 0; G.fireTimer = 0; G.bloom = 0;
  el.menu.style.display = 'none';
  el.hud.style.display = 'block';
  G.dead = false;
  requestLock();
}
el.btnStart.addEventListener('click', startGame);
el.btnResume.addEventListener('click', () => { audioInit(); G.paused = false; el.pause.style.display = 'none'; requestLock(); });
el.btnRespawn.addEventListener('click', () => { audioInit(); respawn(); });

/* ------------------------------ main loop ------------------------------ */
const clock = new THREE.Clock();
let hudTick = 0;
function tick() {
  requestAnimationFrame(tick);
  const dt = Math.min(clock.getDelta(), 0.05);
  if (!G.started) { renderer.render(scene, camera); return; }
  G.time += dt;
  if (!G.paused && !G.dead) {
    updatePlayer(dt);
    updateWaves(dt);
    for (let i = G.enemies.length - 1; i >= 0; i--) updateEnemy(G.enemies[i], dt);
    updateEnemySeparation();
    updateEffects(dt);
    // 生命恢复
    if (G.health < 100 && G.health > 0 && G.time - G.lastDamage > 5) G.health = Math.min(100, G.health + 14 * dt);
  } else {
    updateEffects(0);
  }
  hudTick++;
  if (hudTick % 2 === 0) updateHUD();
  drawRadar();
  renderer.render(scene, camera);
}
updateHUD();
drawRadar();
tick();
})();
