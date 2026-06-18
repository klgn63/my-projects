import * as THREE from 'three';

let camera, scene, renderer;
let terrain, water;
const trees = [];
const clouds = [];
let waterVertices = [];

let hemiLight, dirLight, sun, glowSprite, moon, stars;
let audioListener, clickSound, natureSound, waterWalkSound, grassWalkSound, riverSound, nightRiverSound, riverAudioSource;
let audioStarted = false;
const birds = [];

// 플레이어 이동 및 시야 변수
let moveForward = false;
let moveBackward = false;
let moveLeft = false;
let moveRight = false;
let canJump = false;

// 커스텀 마우스 시야 제어 (드래그 방식)
let isDragging = false;
let yaw = 0; 
let pitch = 0; 

let prevTime = performance.now();
const velocity = new THREE.Vector3();

init();
animate();

function getTerrainHeight(worldX, z) {
  let y = 0;
  const absZ = Math.abs(z);

  // S자 강 형태를 위한 X좌표 오프셋 (지형 전체를 굽이치게 만듦)
  const riverOffsetX = Math.sin(z * 0.006) * 180;
  const x = worldX - riverOffsetX;

  if (x < -60) {
    y = 35 + Math.sin(x * 0.05) * 5 + Math.cos(z * 0.05) * 5;
  } else if (x >= -60 && x < -40) {
    const cliffTop = 25 + Math.sin(z * 0.03) * 10 + Math.cos(z * 0.07) * 8;
    const t = (-x - 40) / 20;
    y = -2 + Math.pow(t, 0.7) * (cliffTop + 2);
  } else if (x >= -40 && x <= 70) {
    y = -5;
  } else if (x > 70 && x <= 110) {
    const t = (x - 70) / 40;
    y = -5 + t * 8; // x=110일때 y=3, 물 높이(1.0)와 정확히 맞물림
  } else if (x > 110 && x <= 140) {
    const t = (x - 110) / 30;
    y = 3 + t * 1.0;
  } else if (x > 140 && x <= 400) {
    // 3가지 언덕 패턴을 Z 좌표 기준으로 번갈아 배치
    const hillType = Math.floor(Math.abs(z / 180)) % 3;
    if (hillType === 0) {
      // 패턴 A: 완만하게 솟은 둥근 언덕
      y = 4 + Math.sin((x - 130) * 0.038) * 6 + Math.cos(z * 0.025) * 3;
    } else if (hillType === 1) {
      // 패턴 B: 납작하고 물결치는 평지형
      y = 4 + Math.sin(x * 0.04 + z * 0.02) * 2 + Math.cos(z * 0.05) * 1.5;
    } else {
      // 패턴 C: 비대칭으로 솟은 날카로운 언덕
      y = 3 + Math.pow(Math.sin((x - 130) * 0.025), 2) * 18 + Math.sin(z * 0.03) * 2;
    }
  } else {
    y = 6 + (x - 400) * 0.05;
  }

  if (absZ > 350) {
    const overZ = absZ - 350;
    y += Math.pow(overZ, 1.2) * 0.06 + Math.sin(x * 0.03) * 12 + Math.cos(z * 0.05) * 8;
  }
  return y;
}

function init() {
  const container = document.getElementById('fishing-container');

  // 1. Scene & Camera
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87CEEB); 
  // 맵 크기 1400에 맞게 안개 밀도 조정
  scene.fog = new THREE.FogExp2(0x87CEEB, 0.0016); 

  camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 3000);
  // 시작 지점: 물가(자갈밭) 근처 (x=110)
  camera.position.set(110, 15, 0); 
  yaw = Math.PI / 2; // 강(왼쪽)을 바라봄

  // --- Audio Setup ---
  audioListener = new THREE.AudioListener();
  camera.add(audioListener);

  const audioLoader = new THREE.AudioLoader();

  clickSound = new THREE.Audio(audioListener);
  audioLoader.load('sound/click.mp3', (buffer) => {
    clickSound.setBuffer(buffer);
    clickSound.setVolume(1.0);
  });

  natureSound = new THREE.Audio(audioListener);
  audioLoader.load('sound/nature.mp3', (buffer) => {
    natureSound.setBuffer(buffer);
    natureSound.setLoop(true);
    natureSound.setVolume(1.0);
    if (audioStarted && !natureSound.isPlaying) natureSound.play();
  });

  waterWalkSound = new THREE.Audio(audioListener);
  audioLoader.load('sound/grk8567-river.mp3', (buffer) => {
    waterWalkSound.setBuffer(buffer);
    waterWalkSound.setLoop(true);
    waterWalkSound.setVolume(0.8);
  });

  grassWalkSound = new THREE.Audio(audioListener);
  audioLoader.load('sound/grass.mp3', (buffer) => {
    grassWalkSound.setBuffer(buffer);
    grassWalkSound.setLoop(true);
    grassWalkSound.setVolume(0.8);
  });

  riverSound = new THREE.PositionalAudio(audioListener);
  audioLoader.load('sound/river.mp3', (buffer) => {
    riverSound.setBuffer(buffer);
    riverSound.setRefDistance(50);
    riverSound.setRolloffFactor(1.5);
    riverSound.setLoop(true);
    riverSound.setVolume(1.5);
    if (audioStarted && sun.visible && !riverSound.isPlaying) riverSound.play();
  });

  nightRiverSound = new THREE.PositionalAudio(audioListener);
  audioLoader.load('sound/night-river.mp3', (buffer) => {
    nightRiverSound.setBuffer(buffer);
    nightRiverSound.setRefDistance(50);
    nightRiverSound.setRolloffFactor(1.5);
    nightRiverSound.setLoop(true);
    nightRiverSound.setVolume(1.5);
    if (audioStarted && moon.visible && !nightRiverSound.isPlaying) nightRiverSound.play();
  });

  riverAudioSource = new THREE.Object3D();
  scene.add(riverAudioSource);
  riverAudioSource.add(riverSound);
  riverAudioSource.add(nightRiverSound);

  // 브라우저 자동재생 정책 대응: 첫 클릭 시 배경음악 재생 및 안내창 숨김
  document.addEventListener('click', () => {
    if (audioListener.context.state === 'suspended') {
      audioListener.context.resume();
    }
    audioStarted = true;
    if (natureSound.buffer && !natureSound.isPlaying) natureSound.play();
    if (sun.visible && riverSound.buffer && !riverSound.isPlaying) riverSound.play();
    if (moon.visible && nightRiverSound.buffer && !nightRiverSound.isPlaying) nightRiverSound.play();
    
    birds.forEach(bird => {
      if (bird.userData.sound && bird.userData.sound.buffer && !bird.userData.sound.isPlaying) {
        const distToPlayer = camera.position.distanceTo(bird.position);
        if (distToPlayer < 70) {
          bird.userData.sound.play();
        }
      }
    });
    
    const blocker = document.getElementById('blocker');
    if (blocker) blocker.style.display = 'none';
  }, { once: true });

  // 2. 조명 (Lighting) - 초여름의 밝은 낮 시간대 (빛의 세기 20% 증가)
  hemiLight = new THREE.HemisphereLight(0xffffff, 0xffffff, 0.85);
  hemiLight.color.setHSL(0.6, 1, 0.6);
  hemiLight.groundColor.setHSL(0.095, 1, 0.75);
  hemiLight.position.set(0, 50, 0);
  scene.add(hemiLight);

  dirLight = new THREE.DirectionalLight(0xffffff, 1.45);
  dirLight.position.set(-500, 800, -200);
  dirLight.castShadow = true;
  dirLight.shadow.camera.near = 0.5;
  dirLight.shadow.camera.far = 1400;
  // 섀도우 맵 범위 조정 (1400 맵 기준)
  dirLight.shadow.camera.left = -420;
  dirLight.shadow.camera.right = 420;
  dirLight.shadow.camera.top = 420;
  dirLight.shadow.camera.bottom = -420;
  dirLight.shadow.mapSize.width = 2048;
  dirLight.shadow.mapSize.height = 2048;
  scene.add(dirLight);

  // 2-1. 태양 (Sun) 생성 및 코로나(빛번짐) 효과
  const sunGeo = new THREE.IcosahedronGeometry(40, 2); 
  const sunMat = new THREE.MeshBasicMaterial({ 
    color: 0xffffff, 
    fog: false 
  });
  sun = new THREE.Mesh(sunGeo, sunMat);

  // 캔버스를 이용해 태양의 코로나(Glow) 텍스처 생성
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const context = canvas.getContext('2d');
  const gradient = context.createRadialGradient(128, 128, 0, 128, 128, 128);
  gradient.addColorStop(0, 'rgba(255, 255, 255, 1.0)');
  gradient.addColorStop(0.2, 'rgba(255, 250, 200, 0.8)');
  gradient.addColorStop(0.5, 'rgba(255, 220, 150, 0.3)');
  gradient.addColorStop(1, 'rgba(255, 200, 100, 0.0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 256, 256);
  
  const glowTexture = new THREE.CanvasTexture(canvas);
  const glowMaterial = new THREE.SpriteMaterial({
    map: glowTexture,
    color: 0xffffee,
    transparent: true,
    blending: THREE.AdditiveBlending,
    fog: false
  });
  glowSprite = new THREE.Sprite(glowMaterial);
  glowSprite.scale.set(400, 400, 1); // 구체 반경(40)보다 10배 크게 번짐
  sun.add(glowSprite);

  // 밤하늘의 달(Moon) 생성
  const moonGeo = new THREE.IcosahedronGeometry(30, 2); 
  const moonMat = new THREE.MeshBasicMaterial({ 
    color: 0xddddff, 
    fog: false 
  });
  moon = new THREE.Mesh(moonGeo, moonMat);
  const moonPos = new THREE.Vector3(-400, 600, -300).normalize().multiplyScalar(1200);
  moon.position.copy(moonPos);
  moon.visible = false;
  scene.add(moon);

  // 밤하늘의 별(Stars) 생성
  const starsGeo = new THREE.BufferGeometry();
  const starsCount = 1000;
  const posArray = new Float32Array(starsCount * 3);
  for(let i = 0; i < starsCount * 3; i++) {
    posArray[i * 3] = (Math.random() - 0.5) * 3000;
    posArray[i * 3 + 1] = 200 + Math.random() * 800; // 하늘 높이
    posArray[i * 3 + 2] = (Math.random() - 0.5) * 3000;
  }
  starsGeo.setAttribute('position', new THREE.BufferAttribute(posArray, 3));
  const starsMat = new THREE.PointsMaterial({ size: 3, color: 0xffffff, transparent: true, opacity: 0.8, fog: false });
  stars = new THREE.Points(starsGeo, starsMat);
  stars.visible = false;
  scene.add(stars);

  // 광원 방향(-500, 800, -200)을 정규화하여 먼 거리에 배치
  const sunPos = new THREE.Vector3(-500, 800, -200).normalize().multiplyScalar(1200);
  sun.position.copy(sunPos);
  scene.add(sun);

  // 2-2. 하늘 구름 생성
  for (let i = 0; i < 20; i++) {
    const cloud = createCloud();
    cloud.position.set(
      (Math.random() - 0.5) * 2000,
      300 + Math.random() * 200, // 높은 하늘
      (Math.random() - 0.5) * 2000
    );
    const scale = 1.0 + Math.random() * 2.0;
    cloud.scale.set(scale, scale * 0.6, scale); // 약간 납작하게
    scene.add(cloud);
    clouds.push(cloud);
  }

  // 3. 지형 (Terrain) - 1400x1400 (성능과 스케일의 균형)
  const terrainSize = 1400;
  // 250x250 분할 (약 6.25만 정점, 적당한 디테일)
  const terrainGeo = new THREE.PlaneGeometry(terrainSize, terrainSize, 250, 250);
  terrainGeo.rotateX(-Math.PI / 2);

  const posAttr = terrainGeo.attributes.position;
  const vertexColors = [];

  for (let i = 0; i < posAttr.count; i++) {
    const worldX = posAttr.getX(i);
    const z = posAttr.getZ(i);
    let y = getTerrainHeight(worldX, z);
    
    let c = new THREE.Color();
    const absZ = Math.abs(z);

    // 지형 색상도 S자 강 형태와 완벽히 일치하도록 좌표계를 휨
    const riverOffsetX = Math.sin(z * 0.006) * 180;
    const x = worldX - riverOffsetX;

    // X 좌표(가로)에 따른 핵심 지형 묘사
    if (x < -60) {
      c.setHex(0x3b5e2b); // 숲
      if (y > 42 || Math.random() > 0.8) c.setHex(0x696969); // 바위 질감
    } 
    else if (x >= -60 && x < -40) {
      c.setHex(0x5c5c5c); // 회색 절벽 바위
      // 바위면에 이끼(녹색)과 흙(갈색) 혼합
      if (Math.random() > 0.65) c.setHex(0x4a5e3a);
      else if (Math.random() > 0.5) c.setHex(0x4a4036);
    } 
    else if (x >= -40 && x <= 70) {
      c.setHex(0x6b5b45); // 진흙/돌
    } 
    else if (x > 70 && x <= 110) {
      c.setHex(0x6b5b45); // 수중은 진흙
      if (y > 0) c.setHex(0x8b7d6b); // 수면 가까워지면 자갈색으로 변경
    } 
    else if (x > 110 && x <= 140) {
      c.setHex(0x8b7d6b); // 자갈색
      if (Math.random() > 0.7) c.setHex(0x556b2f); // 듬성듬성 풀색 혼합
    } 
    else if (x > 140 && x <= 400) {
      const hillType = Math.floor(Math.abs(z / 180)) % 3;
      if (hillType === 0) {
        c.setHex(0x6b8e23); // 올리브 풀밭
        if (y > 7) c.setHex(0x4a7a1e); // 언덕 꼭대기는 더 짙은 풀
      } else if (hillType === 1) {
        c.setHex(0x7a9e2e); // 밝은 올리브
        if (Math.random() > 0.85) c.setHex(0x8b7d6b); // 듬성듬성 흙
      } else {
        c.setHex(0x5a7a1a); // 짙은 풀
        if (y > 9) c.setHex(0x696969); // 높은 곳은 바위
      }
    } 
    else {
      c.setHex(0x2e4a22); // 짙고 어두운 숲
    }

    // Z 좌표(앞/뒤)에 따른 먼 배경 산맥 묘사 (허공 방지)
    if (absZ > 350) {
      const overZ = absZ - 350;
      // 멀리 있는 산은 숲/바위 색으로 덮기
      c.lerp(new THREE.Color(0x3b5e2b), Math.min(overZ / 300, 1.0));
      if (y > 50) c.lerp(new THREE.Color(0x696969), 0.5); // 고지대 바위
    }
    
    // 로우폴리 노이즈 추가
    y += (Math.random() - 0.5) * 0.5;
    
    posAttr.setY(i, y);
    vertexColors.push(c.r, c.g, c.b);
  }

  terrainGeo.setAttribute('color', new THREE.Float32BufferAttribute(vertexColors, 3));
  terrainGeo.computeVertexNormals();

  const terrainMat = new THREE.MeshStandardMaterial({ 
    vertexColors: true,
    roughness: 0.9,
    metalness: 0.1,
    flatShading: true
  });

  terrain = new THREE.Mesh(terrainGeo, terrainMat);
  terrain.receiveShadow = true;
  terrain.castShadow = true;
  scene.add(terrain);

  // 4. 강물 (Water) 
  // 강폭에 맞춰 폭을 150으로 제한 (-25 ~ 125 영역)
  // 길이가 2000이므로 맵 전체를 위아래로 관통함
  const waterGeo = new THREE.PlaneGeometry(150, terrainSize, 50, 200);
  waterGeo.rotateX(-Math.PI / 2);
  
  const wPosAttr = waterGeo.attributes.position;
  
  // 강물 평면도 지형과 동일하게 S자로 굽이치도록 정점 변형
  for (let i = 0; i < wPosAttr.count; i++) {
    const wz = wPosAttr.getZ(i);
    const riverOffsetX = Math.sin(wz * 0.006) * 180;
    wPosAttr.setX(i, wPosAttr.getX(i) + riverOffsetX);
  }
  waterGeo.computeVertexNormals();

  for (let i = 0; i < wPosAttr.count; i++) {
    waterVertices.push({
      x: wPosAttr.getX(i),
      y: wPosAttr.getY(i),
      z: wPosAttr.getZ(i)
    });
  }

  const waterMat = new THREE.MeshStandardMaterial({
    color: 0x4aa6ff,
    transparent: true,
    opacity: 0.5, 
    roughness: 0.1,
    metalness: 0.2, 
    flatShading: true
  });

  water = new THREE.Mesh(waterGeo, waterMat);
  water.position.set(25, 1.0, 0); // 물 객체가 x=100을 넘어 평지를 침범할 수 없도록 고정
  water.receiveShadow = true;
  scene.add(water);

  // 5. 나무 군락 배치 — 그리드 방식 (성능 최적화 적용)
  // 나무를 심을 구역 정의 (너무 많으면 브라우저가 멈추므로 spacing 최적화)
  const forestZones = [
    // 왼쪽 절벽 위 고지대 숲
    { xMin: -700, xMax: -65, zMin: -315, zMax: 315, spacing: 30 },
    // 오른쪽 내륙 숲 (깊은 쪽)
    { xMin: 200, xMax: 700, zMin: -315, zMax: 315, spacing: 30 },
    // 상류 쪽 앞 배경
    { xMin: -700, xMax: 700, zMin: 315, zMax: 665, spacing: 40 },
    // 하류 쪽 뒤 배경
    { xMin: -700, xMax: 700, zMin: -665, zMax: -315, spacing: 40 },
  ];

  for (const zone of forestZones) {
    for (let tx = zone.xMin; tx < zone.xMax; tx += zone.spacing) {
      for (let tz = zone.zMin; tz < zone.zMax; tz += zone.spacing) {
        const localX = tx + (Math.random() - 0.5) * zone.spacing * 0.9;
        const oz = tz + (Math.random() - 0.5) * zone.spacing * 0.9;

        // 나무도 S자 지형 곡선을 따라 굽이치게 오프셋 적용
        const riverOffsetX = Math.sin(oz * 0.006) * 180;
        const worldX = localX + riverOffsetX;

        // 레이캐스트 대신 수학 공식을 그대로 사용하여 연산량 10만배 감소 (렉 해결)
        const ty = getTerrainHeight(worldX, oz) - 0.5;

        // 50% 확률로 활엽수 또는 뾰족한 침엽수 생성
        const tree = Math.random() > 0.5 ? createLowPolyTree() : createPineTree();
        tree.position.set(worldX, ty, oz);
        tree.rotation.y = Math.random() * Math.PI * 2;
        tree.rotation.z = (Math.random() - 0.5) * 0.15;
        // 최대 크기 증가 (기존: 0.8~3.0 -> 변경: 1.5~4.5)
        const scale = 1.5 + Math.random() * 3.0;
        tree.scale.set(scale, scale, scale);
        
        tree.userData = {
          baseRotX: tree.rotation.x,
          baseRotZ: tree.rotation.z,
          windSpeed: 0.4 + Math.random() * 0.6,
          windOffset: Math.random() * Math.PI * 2
        };

        trees.push(tree);
        scene.add(tree);
      }
    }
  }

  // 6. 갈대(Reed) 배치 — 물가와 자갈지대에 심기
  const bushZones = [
    // 물가 수풀 (갈대가 물에 살짝 닿아있는 라인)
    { xMin: 80, xMax: 120, zMin: -400, zMax: 400, spacing: 12 },
    // 자갈지대 (듬성듬성)
    { xMin: 120, xMax: 150, zMin: -400, zMax: 400, spacing: 18 },
    // 숲 수풀
    { xMin: 150, xMax: 200, zMin: -400, zMax: 400, spacing: 26 },
  ];

  for (const zone of bushZones) {
    for (let tx = zone.xMin; tx < zone.xMax; tx += zone.spacing) {
      for (let tz = zone.zMin; tz < zone.zMax; tz += zone.spacing) {
        // 72% 확률로만 심기
        if (Math.random() > 0.72) continue;

        const localX = tx + (Math.random() - 0.5) * zone.spacing * 0.8;
        const oz = tz + (Math.random() - 0.5) * zone.spacing * 0.8;
        
        // 갈대도 S자 지형 곡선을 따라 굽이치게 오프셋 적용
        const riverOffsetX = Math.sin(oz * 0.0075) * 140;
        const worldX = localX + riverOffsetX;

        const by = getTerrainHeight(worldX, oz);

        const bush = createBush();
        bush.position.set(worldX, by, oz);
        bush.rotation.y = Math.random() * Math.PI * 2;
        bush.rotation.z = (Math.random() - 0.5) * 0.2;
        
        // 60% 확률로 기본 크기의 2배에 달하는 큰 수풀 생성
        if (Math.random() > 0.4) {
          const largeScale = 1 + Math.random() * 1.4;
          bush.scale.multiplyScalar(largeScale);
        }
        
        // 전체 바람 흔들림을 위해 trees 배열에 추가
        bush.userData = {
          baseRotX: 0,
          baseRotZ: bush.rotation.z,
          windSpeed: 1.5 + Math.random() * 1.5,
          windOffset: Math.random() * Math.PI * 2
        };
        trees.push(bush);
        scene.add(bush);
      }
    }
  }

  // 6. Renderer
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.appendChild(renderer.domElement);

  // 7. 마우스 드래그 조작 이벤트
  document.addEventListener('mousedown', (e) => {
    if (e.target.tagName !== 'BUTTON' && e.target.tagName !== 'A') {
      isDragging = true;
    }
  });

  document.addEventListener('mouseup', () => {
    isDragging = false;
  });

  document.addEventListener('mousemove', (e) => {
    if (isDragging) {
      yaw -= e.movementX * 0.003; 
      pitch -= e.movementY * 0.003;
      pitch = Math.max(-Math.PI/2 + 0.1, Math.min(Math.PI/2 - 0.1, pitch));
    }
  });

  // 키보드 이벤트
  document.addEventListener('keydown', onKeyDown);
  document.addEventListener('keyup', onKeyUp);
  window.addEventListener('resize', onWindowResize);

  spawnBirds();
}

function createLowPolyTree() {
  const group = new THREE.Group();

  const trunkGeo = new THREE.CylinderGeometry(0.5, 0.8, 6, 5); 
  const trunkMat = new THREE.MeshStandardMaterial({ 
    color: 0x5c4033, flatShading: true, roughness: 1.0 
  });
  const trunk = new THREE.Mesh(trunkGeo, trunkMat);
  trunk.position.y = 3;
  trunk.castShadow = true;
  trunk.receiveShadow = true;
  group.add(trunk);

  const leafMat = new THREE.MeshStandardMaterial({ 
    color: 0x2e8b57, flatShading: true, roughness: 0.8
  });
  
  const mainLeafGeo = new THREE.IcosahedronGeometry(3.5, 0); 
  const mainLeaf = new THREE.Mesh(mainLeafGeo, leafMat);
  mainLeaf.position.set(0, 6.5, 0);
  mainLeaf.castShadow = true;
  mainLeaf.receiveShadow = true;
  mainLeaf.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, 0);
  group.add(mainLeaf);

  const subLeafCount = 2 + Math.floor(Math.random() * 3);
  for(let i = 0; i < subLeafCount; i++) {
    const subLeafGeo = new THREE.IcosahedronGeometry(2.0 + Math.random(), 0);
    const subLeaf = new THREE.Mesh(subLeafGeo, leafMat);
    const angle = (i / subLeafCount) * Math.PI * 2 + Math.random();
    const radius = 1.8 + Math.random();
    subLeaf.position.set(Math.cos(angle) * radius, 5.0 + Math.random() * 2, Math.sin(angle) * radius);
    subLeaf.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, 0);
    subLeaf.castShadow = true;
    subLeaf.receiveShadow = true;
    group.add(subLeaf);
  }

  return group;
}

// 뾰족한 침엽수 생성 함수
function createPineTree() {
  const group = new THREE.Group();

  const trunkGeo = new THREE.CylinderGeometry(0.6, 0.9, 7, 5); 
  const trunkMat = new THREE.MeshStandardMaterial({ 
    color: 0x4a3b2c, flatShading: true, roughness: 1.0 
  });
  const trunk = new THREE.Mesh(trunkGeo, trunkMat);
  trunk.position.y = 3.5;
  trunk.castShadow = true;
  trunk.receiveShadow = true;
  group.add(trunk);

  const leafMat = new THREE.MeshStandardMaterial({ 
    color: 0x1e4d2e, // 짙은 침엽수색
    flatShading: true, roughness: 0.9
  });

  // 3~4단의 층층이 원뿔 모양 잎
  const tiers = 3 + Math.floor(Math.random() * 2);
  let yPos = 5.0;
  let radius = 4.0;
  
  for(let i = 0; i < tiers; i++) {
    // 반경 0.1(뾰족), 밑면 radius, 높이 5, 5각형
    const tierGeo = new THREE.CylinderGeometry(0.1, radius, 4.5 + Math.random(), 5 + Math.floor(Math.random()*2));
    const tier = new THREE.Mesh(tierGeo, leafMat);
    tier.position.y = yPos;
    tier.rotation.y = Math.random() * Math.PI;
    tier.rotation.z = (Math.random() - 0.5) * 0.1;
    tier.castShadow = true;
    tier.receiveShadow = true;
    group.add(tier);
    
    yPos += 3.0 + Math.random() * 1.0; 
    radius *= 0.65; 
  }

  return group;
}

// 물가 갈대/긴 풀 생성 함수
function createBush() {
  const group = new THREE.Group();

  // 갈대/풀 색상: 연두색, 억새풀 색상 등
  const grassColors = [0x7ab547, 0x8cb85c, 0x9bbb59, 0xa4c639, 0x6b8e23, 0xcdba88];
  
  // 가느다란 풀잎 5~10개를 한 곳에 모아서 생성
  const bladeCount = 5 + Math.floor(Math.random() * 6);
  
  for (let i = 0; i < bladeCount; i++) {
    const col = grassColors[Math.floor(Math.random() * grassColors.length)];
    const grassMat = new THREE.MeshStandardMaterial({
      color: col,
      flatShading: true,
      roughness: 0.8,
    });
    // 기본 수풀 높이
    const height = 3.2 + Math.random() * 3.3;
    const bladeGeo = new THREE.CylinderGeometry(0.02, 0.15, height, 4);
    const blade = new THREE.Mesh(bladeGeo, grassMat);
    
    // 밑동을 기준으로 위로 솟게
    blade.position.y = height / 2;
    
    const pivot = new THREE.Group();
    pivot.add(blade);
    
    // 약간씩 옆으로 퍼지게 회전
    pivot.rotation.y = Math.random() * Math.PI * 2;
    pivot.rotation.z = Math.random() * 0.4; // 밖으로 눕는 각도
    
    // 중심부 위치 약간 분산
    pivot.position.set(
      (Math.random() - 0.5) * 0.6,
      0,
      (Math.random() - 0.5) * 0.6
    );
    
    blade.castShadow = true;
    blade.receiveShadow = true;
    
    group.add(pivot);
  }

  // 전체 크기 무작위 조절
  const scale = 0.7 + Math.random() * 0.6;
  group.scale.set(scale, scale, scale);

  return group;
}

// 구름 생성 함수
function createCloud() {
  const group = new THREE.Group();
  const cloudMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    flatShading: true,
    transparent: true,
    opacity: 0.8, // 불투명도 낮춤 (기존 0.9 -> 0.8)
    roughness: 1.0,
  });

  const puffCount = 4 + Math.floor(Math.random() * 5);
  for (let i = 0; i < puffCount; i++) {
    const puffGeo = new THREE.IcosahedronGeometry(15 + Math.random() * 15, 0);
    const puff = new THREE.Mesh(puffGeo, cloudMat);
    puff.position.set(
      (Math.random() - 0.5) * 50,
      (Math.random() - 0.5) * 15,
      (Math.random() - 0.5) * 50
    );
    puff.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, 0);
    // 그림자 20% 정도 옅게 만들기: 구름 덩어리의 절반만 그림자를 캐스팅하도록 처리
    puff.castShadow = Math.random() > 0.5; 
    group.add(puff);
  }
  return group;
}

function onKeyDown(event) {
  switch (event.code) {
    case 'ArrowUp':
    case 'KeyW': moveForward = true; break;
    case 'ArrowLeft':
    case 'KeyA': moveLeft = true; break;
    case 'ArrowDown':
    case 'KeyS': moveBackward = true; break;
    case 'ArrowRight':
    case 'KeyD': moveRight = true; break;
    case 'Space':
      if (canJump === true) velocity.y += 40;
      canJump = false;
      break;
  }
}

function onKeyUp(event) {
  switch (event.code) {
    case 'ArrowUp':
    case 'KeyW': moveForward = false; break;
    case 'ArrowLeft':
    case 'KeyA': moveLeft = false; break;
    case 'ArrowDown':
    case 'KeyS': moveBackward = false; break;
    case 'ArrowRight':
    case 'KeyD': moveRight = false; break;
  }
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
  requestAnimationFrame(animate);

  const time = performance.now();
  const delta = Math.min((time - prevTime) / 1000, 0.1); 

  // 1. 물결 애니메이션
  const wPosAttr = water.geometry.attributes.position;
  for (let i = 0; i < waterVertices.length; i++) {
    const v = waterVertices[i];
    const wave1 = Math.sin(v.x * 0.15 + time * 0.003) * 1.2;
    const wave2 = Math.cos(v.z * 0.1 + time * 0.004) * 0.8;
    wPosAttr.setY(i, v.y + wave1 + wave2); 
  }
  water.geometry.computeVertexNormals();
  wPosAttr.needsUpdate = true;

  // 2. 나무 흔들림
  trees.forEach(tree => {
    const ud = tree.userData;
    const sway = Math.sin(time * 0.001 * ud.windSpeed + ud.windOffset) * 0.05;
    tree.rotation.z = ud.baseRotZ + sway;
    tree.rotation.x = ud.baseRotX + sway * 0.5;
  });

  // 구름 이동 애니메이션
  clouds.forEach(cloud => {
    // 하늘을 천천히 흐름
    cloud.position.x += 15.0 * delta; 
    cloud.position.z -= 5.0 * delta; 
    // 멀리 벗어나면 반대편에서 새로 스폰
    if (cloud.position.x > 1200) {
      cloud.position.x = -1200;
      cloud.position.z = (Math.random() - 0.5) * 2000;
      cloud.position.y = 300 + Math.random() * 200;
    }
  });

  // 3. 커스텀 마우스 시야 제어 적용
  camera.rotation.set(pitch, yaw, 0, 'YXZ');

  // 4. WASD 이동 물리
  velocity.x -= velocity.x * 10.0 * delta;
  velocity.z -= velocity.z * 10.0 * delta;
  velocity.y -= 9.8 * 15.0 * delta; 

  const moveSpeed = 600.0 * delta; 
  let moveZ = Number(moveBackward) - Number(moveForward);
  let moveX = Number(moveRight) - Number(moveLeft);
  
  if (moveX !== 0 || moveZ !== 0) {
    const angle = Math.atan2(moveX, moveZ);
    const moveAngle = yaw + angle;
    velocity.x += Math.sin(moveAngle) * moveSpeed;
    velocity.z += Math.cos(moveAngle) * moveSpeed;
  }

  camera.position.x += velocity.x * delta;
  camera.position.z += velocity.z * delta;
  camera.position.y += velocity.y * delta;

  // 5. 플레이어 맵 이탈 방지 (S자 굽이치는 지형에 맞게 충돌 범위도 같이 굽어짐)
  const playerRiverOffset = Math.sin(camera.position.z * 0.006) * 180;
  const localPx = camera.position.x - playerRiverOffset;

  if (localPx > 220) camera.position.x = 220 + playerRiverOffset; // 오른쪽 이동 가능 폭 30% 감소 (300 -> 210)
  if (localPx < -80) camera.position.x = -80 + playerRiverOffset; // 왼쪽 강 건너 절벽 경계는 유지
  if (camera.position.z > 290) camera.position.z = 290; // 앞뒤 이동폭 30% 감소 (400 -> 280)
  if (camera.position.z < -290) camera.position.z = -290;

  // 6. 수학 공식을 통한 즉각적인 지형 충돌 처리 (매 프레임 렉 발생 방지)
  let floorY = getTerrainHeight(camera.position.x, camera.position.z);

  const eyeHeight = Math.max(floorY + 10, -3); // 눈높이 지정 (물 속에 들어가도 최소 -3 유지)
  
  if (camera.position.y < eyeHeight) {
    velocity.y = 0;
    camera.position.y = eyeHeight;
    canJump = true;
  }

  // 7. 사운드 업데이트
  if (riverAudioSource) {
    const currentRiverOffset = Math.sin(camera.position.z * 0.006) * 180;
    // 물줄기의 중심(x=15)에 소스 위치
    riverAudioSource.position.set(15 + currentRiverOffset, 0, camera.position.z);
  }

  if (waterWalkSound && grassWalkSound) {
    const isMoving = (moveForward || moveBackward || moveLeft || moveRight);
    // 물 높이가 1.0이므로 floorY가 1.0 이하면 발이 물 속에 있음
    const inWater = floorY <= 1.0;
    
    if (isMoving && canJump) { 
      if (inWater) {
        if (grassWalkSound.isPlaying) grassWalkSound.pause();
        if (!waterWalkSound.isPlaying && waterWalkSound.buffer) waterWalkSound.play();
      } else {
        if (waterWalkSound.isPlaying) waterWalkSound.pause();
        if (!grassWalkSound.isPlaying && grassWalkSound.buffer) grassWalkSound.play();
      }
    } else {
      if (waterWalkSound.isPlaying) waterWalkSound.pause();
      if (grassWalkSound.isPlaying) grassWalkSound.pause();
    }
  }

  // 8. 새 애니메이션 및 AI 행동
  birds.forEach(bird => {
    const ud = bird.userData;
    
    // 상태 타이머 업데이트
    ud.stateTimer -= delta;
    if (ud.stateTimer <= 0) {
      const states = ['flying', 'hopping', 'drinking'];
      ud.state = states[Math.floor(Math.random() * states.length)];
      ud.stateTimer = 8 + Math.random() * 12;
      setBirdTarget(bird);
    }
    
    // 날개 짓 애니메이션
    let flapSpeed = 0;
    if (ud.state === 'flying') {
      flapSpeed = ud.type === 'tern' ? 14 : 24;
    } else if (ud.state === 'hopping') {
      // 걷거나 홉할 때 가끔 날개 퍼덕임
      flapSpeed = Math.abs(Math.sin(time * 0.005)) > 0.9 ? 8 : 0;
    }
    
    if (flapSpeed > 0) {
      const flap = Math.sin(time * 0.001 * flapSpeed) * 0.6;
      ud.wingL.rotation.z = flap;
      ud.wingR.rotation.z = -flap;
    } else {
      ud.wingL.rotation.z = 0;
      ud.wingR.rotation.z = 0;
    }
    
    // 상태별 물리 및 애니메이션
    if (ud.state === 'flying') {
      const dir = new THREE.Vector3().subVectors(ud.target, bird.position);
      const dist = dir.length();
      if (dist < 4) {
        setBirdTarget(bird);
      } else {
        dir.normalize();
        const speed = ud.type === 'tern' ? 35 : 22;
        bird.position.addScaledVector(dir, speed * delta);
        
        // 지형 충돌 방지: 날아다닐 때 항상 지면보다 최소 3 이상 위에 있도록 보정
        const currentGroundY = getTerrainHeight(bird.position.x, bird.position.z);
        if (bird.position.y < currentGroundY + 3) {
          bird.position.y = currentGroundY + 3;
        }
        
        // 부드러운 방향 회전
        const targetAngle = Math.atan2(dir.x, dir.z);
        let diff = targetAngle - bird.rotation.y;
        while (diff < -Math.PI) diff += Math.PI * 2;
        while (diff > Math.PI) diff -= Math.PI * 2;
        bird.rotation.y += diff * 5 * delta;
        
        // 날아갈 때 위아래 기울기
        bird.rotation.x = -dir.y * 0.4;
      }
    } else {
      // 지상 행동 (Hopping, Drinking)일 때 강물에 침범(잠수)하지 않도록 육지선(x >= 108 + riverOffsetX)으로 보정
      const currentRiverOffset = Math.sin(bird.position.z * 0.006) * 180;
      if (bird.position.x < 108 + currentRiverOffset) {
        bird.position.x = 108 + currentRiverOffset;
      }

      if (ud.state === 'hopping') {
        const dir = new THREE.Vector3(ud.target.x - bird.position.x, 0, ud.target.z - bird.position.z);
        const dist = dir.length();
        
        if (dist < 2) {
          setBirdTarget(bird);
        } else {
          dir.normalize();
          const speed = ud.type === 'tern' ? 7 : 4.5;
          bird.position.x += dir.x * speed * delta;
          bird.position.z += dir.z * speed * delta;
          
          // 이동 후 물가 안으로 들어갔는지 다시 체크 및 Y축 설정
          const newRiverOffset = Math.sin(bird.position.z * 0.006) * 180;
          if (bird.position.x < 108 + newRiverOffset) {
            bird.position.x = 108 + newRiverOffset;
          }
          const nextGroundY = getTerrainHeight(bird.position.x, bird.position.z);
          
          // 총총 뛰어다니는 홉 모션
          ud.hopTimer += delta * 18;
          const hopHeight = Math.abs(Math.sin(ud.hopTimer)) * 0.6;
          bird.position.y = nextGroundY + hopHeight;
          
          bird.rotation.y = Math.atan2(dir.x, dir.z);
          bird.rotation.x = 0;
        }
      } else if (ud.state === 'drinking') {
        const dir = new THREE.Vector3(ud.target.x - bird.position.x, 0, ud.target.z - bird.position.z);
        const dist = dir.length();
        
        if (dist > 2.0) {
          dir.normalize();
          const speed = ud.type === 'tern' ? 6 : 4;
          bird.position.x += dir.x * speed * delta;
          bird.position.z += dir.z * speed * delta;
          
          const newRiverOffset = Math.sin(bird.position.z * 0.006) * 180;
          if (bird.position.x < 108 + newRiverOffset) {
            bird.position.x = 108 + newRiverOffset;
          }
          const nextGroundY = getTerrainHeight(bird.position.x, bird.position.z);
          
          ud.hopTimer += delta * 12;
          bird.position.y = nextGroundY + Math.abs(Math.sin(ud.hopTimer)) * 0.4;
          bird.rotation.y = Math.atan2(dir.x, dir.z);
          bird.rotation.x = 0;
        } else {
          const newRiverOffset = Math.sin(bird.position.z * 0.006) * 180;
          if (bird.position.x < 108 + newRiverOffset) {
            bird.position.x = 108 + newRiverOffset;
          }
          const nextGroundY = getTerrainHeight(bird.position.x, bird.position.z);
          bird.position.y = nextGroundY;
          
          // 강쪽 바라보기
          bird.rotation.y = -Math.PI / 2;
          
          // 물마시기 모션 (고개 숙이기)
          ud.drinkingTimer += delta * 4;
          const drinkAngle = Math.max(0, Math.sin(ud.drinkingTimer)) * 0.7;
          bird.rotation.x = drinkAngle;
        }
      }
    }
    
    // 가까이 가면 새소리 birds.mp3 재생
    if (ud.sound) {
      const distToPlayer = camera.position.distanceTo(bird.position);
      if (distToPlayer < 70) {
        if (!ud.sound.isPlaying && audioStarted) {
          ud.sound.play();
        }
      } else {
        if (ud.sound.isPlaying) {
          ud.sound.pause();
        }
      }
    }
  });

  prevTime = time;
  renderer.render(scene, camera);
}

// 시간대 변경 로직
function setTimeOfDay(time) {
  if (!hemiLight || !dirLight || !sun || !moon || !stars) return;

  if (time === 'morning') {
    hemiLight.intensity = 0.85;
    dirLight.intensity = 1.45;
    scene.background.setHex(0x87CEEB);
    scene.fog.color.setHex(0x87CEEB);
    sun.visible = true;
    moon.visible = false;
    stars.visible = false;
    // 태양 위치 원상복구
    const sunPos = new THREE.Vector3(-500, 800, -200).normalize().multiplyScalar(1200);
    sun.position.copy(sunPos);
    glowSprite.material.color.setHex(0xffffee);
    glowSprite.scale.set(400, 400, 1);
    
    if (nightRiverSound && nightRiverSound.isPlaying) nightRiverSound.stop();
    if (riverSound && !riverSound.isPlaying && riverSound.buffer) riverSound.play();
  } else if (time === 'afternoon') {
    // 밝기 70% 수준
    hemiLight.intensity = 0.85 * 0.7;
    dirLight.intensity = 1.45 * 0.7;
    // 전체 하늘은 연한 살구색/노을빛으로
    scene.background.setHex(0xffdfc4); 
    scene.fog.color.setHex(0xffdfc4);
    sun.visible = true;
    moon.visible = false;
    stars.visible = false;
    // 태양 위치 아래로
    const sunPos = new THREE.Vector3(-600, 200, -400).normalize().multiplyScalar(1200);
    sun.position.copy(sunPos);
    // 태양 주변만 짙은 주황색/붉은색으로 넓게 번지게 처리
    glowSprite.material.color.setHex(0xff5500); 
    glowSprite.scale.set(1000, 1000, 1); 

    if (nightRiverSound && nightRiverSound.isPlaying) nightRiverSound.stop();
    if (riverSound && !riverSound.isPlaying && riverSound.buffer) riverSound.play();
  } else if (time === 'night') {
    // 밝기 24% 수준 (기존 30%의 80% 수준)
    hemiLight.intensity = 0.85 * 0.24;
    dirLight.intensity = 1.45 * 0.24;
    scene.background.setHex(0x050510);
    scene.fog.color.setHex(0x050510);
    sun.visible = false;
    moon.visible = true;
    stars.visible = true;

    if (riverSound && riverSound.isPlaying) riverSound.stop();
    if (nightRiverSound && !nightRiverSound.isPlaying && nightRiverSound.buffer) nightRiverSound.play();
  }
}

// UI 이벤트 리스너 추가
const btnMorning = document.getElementById('btn-morning');
const btnAfternoon = document.getElementById('btn-afternoon');
const btnNight = document.getElementById('btn-night');
const btnCurrent = document.getElementById('btn-current-time');

if (btnMorning && btnAfternoon && btnNight && btnCurrent) {
  btnMorning.addEventListener('click', () => {
    if(clickSound && clickSound.buffer) clickSound.play();
    setTimeOfDay('morning');
    btnCurrent.src = 'icons8-sun-32.png';
  });
  btnAfternoon.addEventListener('click', () => {
    if(clickSound && clickSound.buffer) clickSound.play();
    setTimeOfDay('afternoon');
    btnCurrent.src = 'icons8-sun-cloud-32.png';
  });
  btnNight.addEventListener('click', () => {
    if(clickSound && clickSound.buffer) clickSound.play();
    setTimeOfDay('night');
    btnCurrent.src = 'icons8-moon-32.png';
  });
}

function createLowPolyBird(type) {
  const group = new THREE.Group();
  group.rotation.order = 'YXZ'; // 회전 순서 설정: Yaw 우선 적용하여 오일러 회전 버그 해결
  
  // Body (몸통)
  const bodyGeo = new THREE.BoxGeometry(0.5, 0.35, 0.7);
  let bodyCol = 0xffffff; // 쇠제비갈매기: 흰색
  if (type === 'sparrow') bodyCol = 0x8b5a2b; // 참새: 갈색
  const bodyMat = new THREE.MeshStandardMaterial({ color: bodyCol, flatShading: true });
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);
  
  // Head (머리)
  const headGeo = new THREE.BoxGeometry(0.3, 0.3, 0.3);
  let headCol = 0x222222; // 쇠제비갈매기: 검은색 머리깃
  if (type === 'sparrow') headCol = 0x5c4033; // 참새: 짙은 갈색 머리
  const headMat = new THREE.MeshStandardMaterial({ color: headCol, flatShading: true });
  const head = new THREE.Mesh(headGeo, headMat);
  head.position.set(0, 0.25, 0.35);
  head.castShadow = true;
  head.receiveShadow = true;
  group.add(head);
  
  // Beak (부리)
  const beakGeo = new THREE.ConeGeometry(0.06, 0.25, 4);
  beakGeo.rotateX(Math.PI / 2);
  let beakCol = 0xffd700; // 쇠제비갈매기: 노란 부리
  if (type === 'sparrow') beakCol = 0x333333; // 참새: 어두운 부리
  const beakMat = new THREE.MeshStandardMaterial({ color: beakCol, flatShading: true });
  const beak = new THREE.Mesh(beakGeo, beakMat);
  beak.position.set(0, 0.22, 0.52);
  group.add(beak);
  
  // Wings (날개)
  const wingGeo = new THREE.BoxGeometry(0.7, 0.03, 0.35);
  let wingCol = 0xcccccc; // 쇠제비갈매기: 회색빛 날개
  if (type === 'sparrow') wingCol = 0x6e4720; // 참새: 어두운 갈색 날개
  const wingMat = new THREE.MeshStandardMaterial({ color: wingCol, flatShading: true });
  
  const wingLGroup = new THREE.Group();
  wingLGroup.position.set(-0.25, 0.05, 0);
  const wingL = new THREE.Mesh(wingGeo, wingMat);
  wingL.position.set(-0.35, 0, 0);
  wingL.castShadow = true;
  wingLGroup.add(wingL);
  group.add(wingLGroup);
  
  const wingRGroup = new THREE.Group();
  wingRGroup.position.set(0.25, 0.05, 0);
  const wingR = new THREE.Mesh(wingGeo, wingMat);
  wingR.position.set(0.35, 0, 0);
  wingR.castShadow = true;
  wingRGroup.add(wingR);
  group.add(wingRGroup);
  
  group.userData = {
    wingL: wingLGroup,
    wingR: wingRGroup
  };
  
  return group;
}

function setBirdTarget(bird) {
  const ud = bird.userData;
  
  if (ud.state === 'flying') {
    const tz = (Math.random() - 0.5) * 450;
    const riverOffsetX = Math.sin(tz * 0.006) * 180;
    const tx = riverOffsetX + (Math.random() - 0.5) * 250; 
    const groundY = getTerrainHeight(tx, tz);
    const ty = groundY + 15 + Math.random() * 20; // 지면 높이에 상대적으로 설정하여 산을 뚫지 않음
    ud.target.set(tx, ty, tz);
  } else if (ud.state === 'hopping') {
    const tz = bird.position.z + (Math.random() - 0.5) * 60;
    const riverOffsetX = Math.sin(tz * 0.006) * 180;
    const tx = 115 + riverOffsetX + Math.random() * 60;
    ud.target.set(tx, 0, tz);
  } else if (ud.state === 'drinking') {
    const tz = bird.position.z + (Math.random() - 0.5) * 40;
    const riverOffsetX = Math.sin(tz * 0.006) * 180;
    const tx = 108 + riverOffsetX; 
    ud.target.set(tx, 0, tz);
  }
}

function spawnBirds() {
  const birdTypes = [
    { type: 'tern', count: 2, scale: 3.0 }, // 1.2 * 2.5 = 3.0
    { type: 'sparrow', count: 4, scale: 1.0 } // 0.4 * 2.5 = 1.0
  ];
  
  const audioLoader = new THREE.AudioLoader();
  
  audioLoader.load('sound/birds.mp3', (buffer) => {
    birds.forEach(bird => {
      const sound = new THREE.PositionalAudio(audioListener);
      sound.setBuffer(buffer);
      sound.setRefDistance(15);
      sound.setRolloffFactor(1.5);
      sound.setLoop(true);
      sound.setVolume(0.8);
      bird.add(sound);
      bird.userData.sound = sound;
      
      if (audioStarted && camera.position.distanceTo(bird.position) < 70) {
        sound.play();
      }
    });
  });

  birdTypes.forEach(groupInfo => {
    for (let i = 0; i < groupInfo.count; i++) {
      const bird = createLowPolyBird(groupInfo.type);
      bird.scale.set(groupInfo.scale, groupInfo.scale, groupInfo.scale);
      
      const ud = {
        type: groupInfo.type,
        state: i % 2 === 0 ? 'flying' : 'hopping',
        stateTimer: 5 + Math.random() * 10,
        target: new THREE.Vector3(),
        hopTimer: Math.random() * 10,
        drinkingTimer: Math.random() * 10,
        wingL: bird.userData.wingL,
        wingR: bird.userData.wingR,
        sound: null
      };
      
      const z = (Math.random() - 0.5) * 400;
      const riverOffsetX = Math.sin(z * 0.006) * 180;
      let x = 120 + riverOffsetX + Math.random() * 40;
      let y = getTerrainHeight(x, z);
      
      if (ud.state === 'flying') {
        y = 20 + Math.random() * 20;
      }
      
      bird.position.set(x, y, z);
      bird.userData = ud;
      
      setBirdTarget(bird);
      
      birds.push(bird);
      scene.add(bird);
    }
  });
}
