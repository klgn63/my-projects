import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

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

// 낚시 관련 변수
let isRodEquipped = true;
let castState = 'idle'; // 'idle', 'charging', 'flying', 'casted'
let castPower = 0;
let fishingRodGroup, bobber, fishingLine, bobberArrow;
let rod1Group, rod2Group, rod3Group, rodTipDummy;
let waterDropSound, struggleSound;
const bobberVelocity = new THREE.Vector3();
const bobberWorldPos = new THREE.Vector3();
const rodTipWorldPos = new THREE.Vector3();
let isMouseDown = false; // 마우스 클릭 상태 추적 (챔질용)

// 찌 흔들림 물리 (Spring)
const bobberSwingVel = new THREE.Vector3();
const bobberSwingOff = new THREE.Vector3();
const prevCameraPos = new THREE.Vector3();

// 물고기 및 낚시 로직 변수
let rodBendX = 0; // 좌우 휨 정도
let rodBendY = 0; // 상하 휨 정도
let biteTimer = 0;
let biteDuration = 0;
let fishSize = 0; // 물고기 난이도/힘 (1~10)
let fishDistance = 0; // 끌어올려야 하는 거리
let fishModel, fishMixer, fishAction, catchMsg;
let catchMsgTimeout = null;
let iceboxGroup = null;
let interactMsg = null;
let iceboxText = null;
let releaseMsg = null;
let storedFishCount = 0;
let hasFish = false;

// 물고기 종류 정의
const fishTypes = [
  { id: 'bamti', name: '밤티고기', asset: 'asset/bamti_fish.glb', minSize: 15, maxSize: 60, scaleMult: 0.8, storeScale: 0.1, caughtRot: [0, 0, Math.PI / 2], count: 0, model: null, mixer: null, action: null },
  { id: 'spiny', name: '가시납지리', asset: 'asset/Spiny_bitterling.glb', minSize: 5, maxSize: 15, scaleMult: 65.0, storeScale: 6.5, caughtRot: [-Math.PI / 2, 0, 0], count: 0, model: null, mixer: null, action: null },
  { id: 'hongnae', name: '홍지네가리', asset: 'asset/hongnae.glb', minSize: 8, maxSize: 20, scaleMult: 25.0, storeScale: 2.5, caughtRot: [-Math.PI / 2, 0, 0], count: 0, model: null, mixer: null, action: null }
];
let currentFishIndex = 0;

let rippleRings = []; // 입질 시 파동 효과
let struggleTimer = 0; // 실랑이 유지 시간
let mudParticles = []; // 도망갈 때 흙먼지 효과

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
  scene.add(camera); // 카메라에 붙은 낚시대를 렌더링하기 위해 씬에 추가

  // 낚시대 재구성 (자연스럽고 사실적으로)
  fishingRodGroup = new THREE.Group();

  // 카본/대나무 느낌의 짙은 갈색 재질
  const rodBodyMat = new THREE.MeshStandardMaterial({ color: 0x1a0a00, roughness: 0.7, metalness: 0.1 });
  const rodGripMat = new THREE.MeshStandardMaterial({ color: 0x3b2a1a, roughness: 0.95 }); // 손잡이 코르크 느낌
  const reelMat = new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.3, metalness: 0.8 }); // 릴 은색

  // 손잡이 (두꺼운 코르크 그립)
  const gripGeo = new THREE.CylinderGeometry(0.07, 0.09, 1.5, 8);
  const grip = new THREE.Mesh(gripGeo, rodGripMat);
  grip.position.y = 0.75;
  fishingRodGroup.add(grip);

  // 로드 1단 (두꺼운 하단부)
  rod1Group = new THREE.Group();
  rod1Group.position.y = 1.5; // 손잡이 끝나는 지점
  const rod1Geo = new THREE.CylinderGeometry(0.045, 0.07, 4.0, 8);
  const rod1 = new THREE.Mesh(rod1Geo, rodBodyMat);
  rod1.position.y = 2.0; // 실린더 중심 (길이 4.0의 절반)
  rod1Group.add(rod1);
  fishingRodGroup.add(rod1Group);

  // 로드 2단 (중간)
  rod2Group = new THREE.Group();
  rod2Group.position.y = 4.0; // rod1 끝나는 지점 (로컬 y 4.0)
  const rod2Geo = new THREE.CylinderGeometry(0.02, 0.045, 4.5, 8);
  const rod2 = new THREE.Mesh(rod2Geo, rodBodyMat);
  rod2.position.y = 2.25; // 실린더 중심
  rod2Group.add(rod2);
  rod1Group.add(rod2Group);

  // 로드 3단 (가장 얇은 끝부분)
  rod3Group = new THREE.Group();
  rod3Group.position.y = 4.5; // rod2 끝나는 지점 (로컬 y 4.5)
  const rod3Geo = new THREE.CylinderGeometry(0.005, 0.02, 4.0, 6);
  const rod3 = new THREE.Mesh(rod3Geo, rodBodyMat);
  rod3.position.y = 2.0; // 실린더 중심
  rod3Group.add(rod3);
  rod2Group.add(rod3Group);

  // 낚시대 끝단 (줄이 연결되는 부분)
  rodTipDummy = new THREE.Group();
  rodTipDummy.position.y = 4.0; // rod3 끝
  rod3Group.add(rodTipDummy);

  // 릴 시트 (손잡이 위쪽 은색 릴)
  const reelBodyGeo = new THREE.CylinderGeometry(0.12, 0.12, 0.3, 12);
  const reelBody = new THREE.Mesh(reelBodyGeo, reelMat);
  reelBody.position.set(-0.1, 1.7, 0);
  reelBody.rotation.z = Math.PI / 2;
  fishingRodGroup.add(reelBody);

  // 릴 스풀
  const reelSpoolGeo = new THREE.TorusGeometry(0.08, 0.03, 8, 16);
  const reelSpool = new THREE.Mesh(reelSpoolGeo, reelMat);
  reelSpool.position.set(-0.22, 1.7, 0);
  reelSpool.rotation.y = Math.PI / 2;
  fishingRodGroup.add(reelSpool);

  // 줄 가이드 링 (3개, 각 마디의 끝부분에 배치하여 같이 휘어지게 함)
  const guideMat = new THREE.MeshStandardMaterial({ color: 0xcccccc, roughness: 0.2, metalness: 0.9 });
  
  const guide1 = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.008, 6, 12), guideMat);
  guide1.position.set(0, 4.0, 0); // rod1Group의 끝
  guide1.rotation.x = Math.PI / 2;
  rod1Group.add(guide1);

  const guide2 = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.008, 6, 12), guideMat);
  guide2.position.set(0, 4.5, 0); // rod2Group의 끝
  guide2.rotation.x = Math.PI / 2;
  rod2Group.add(guide2);

  const guide3 = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.008, 6, 12), guideMat);
  guide3.position.set(0, 4.0, 0); // rod3Group의 끝 (초릿대)
  guide3.rotation.x = Math.PI / 2;
  rod3Group.add(guide3);

  // 낚시대 그룹 위치: 카메라 오른쪽 하단, 앞으로 뻗음
  // 손잡이가 화면 우하단에 오도록 위치 설정
  fishingRodGroup.position.set(0.5, -1.8, -1.0);
  // 앞으로 눕히고 약간 오른쪽으로 기울임
  fishingRodGroup.rotation.order = 'YXZ';
  fishingRodGroup.rotation.x = -Math.PI * 0.38; // 앞으로 약 68도 기울임
  fishingRodGroup.rotation.z = Math.PI * 0.08;  // 오른쪽으로 약간 기울임
  camera.add(fishingRodGroup);

  // 낚시대 끝단 로컬 위치 계산 (rod3 끝 = y: 9.5 → 월드 변환을 위해 Group 기준)
  // rod tip은 fishingRodGroup 로컬 y=9.5에 위치
  // animate에서 매 프레임 월드 좌표로 변환

  // 찌 (Bobber) - 실제 낚시찌처럼 길쭉한 원통+구 형태
  const bobberGroup = new THREE.Group();

  const bobberTopGeo = new THREE.SphereGeometry(0.35, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2);
  const bobberTopMat = new THREE.MeshStandardMaterial({ color: 0xff2200, roughness: 0.3 });
  const bobberTop = new THREE.Mesh(bobberTopGeo, bobberTopMat);
  bobberTop.position.y = 0.2;
  bobberGroup.add(bobberTop);

  const bobberBotGeo = new THREE.SphereGeometry(0.35, 12, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
  const bobberBotMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 });
  const bobberBot = new THREE.Mesh(bobberBotGeo, bobberBotMat);
  bobberBot.position.y = 0.2;
  bobberGroup.add(bobberBot);

  // 찌 안테나 (얇은 빨간 막대)
  const antennaGeo = new THREE.CylinderGeometry(0.03, 0.015, 0.9, 6);
  const antennaMat = new THREE.MeshStandardMaterial({ color: 0xff0000 });
  const antenna = new THREE.Mesh(antennaGeo, antennaMat);
  antenna.position.y = 0.85;
  bobberGroup.add(antenna);

  bobber = bobberGroup;
  bobber.visible = true;
  scene.add(bobber);

  // 물고기 모델 (GLB 에셋 다중 로드)
  const gltfLoader = new GLTFLoader();
  
  fishTypes.forEach((type) => {
    const group = new THREE.Group();
    scene.add(group);
    group.visible = false;
    type.model = group;
    
    gltfLoader.load(type.asset, (gltf) => {
      const model = gltf.scene;
      // 물고기가 X축 방향으로 설정되어 있을 수 있으므로 필요한 경우 회전
      model.rotation.y = Math.PI / 2;
      group.add(model);
      
      // 그림자 설정
      model.traverse((child) => {
        if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });
  
      // 애니메이션 믹서 설정
      if (gltf.animations && gltf.animations.length > 0) {
        type.mixer = new THREE.AnimationMixer(model);
        type.action = type.mixer.clipAction(gltf.animations[0]);
      }
    });
  });

  // 초기 더미 참조
  fishModel = fishTypes[0].model;
  fishMixer = fishTypes[0].mixer;
  fishAction = fishTypes[0].action;

  // 입질 파동 이펙트 (Ripples)
  for (let i = 0; i < 3; i++) {
    const ringGeo = new THREE.RingGeometry(0.1, 0.2, 16);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, side: THREE.DoubleSide });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2; // 수면과 평행
    ring.visible = false;
    scene.add(ring);
    rippleRings.push({ mesh: ring, age: 0, active: false });
  }

  // 노란색 화살표 마커 (캐스팅 시 찌 위치 표시용)
  const arrowGroup = new THREE.Group();
  // 화살표 삼각형
  const arrowShape = new THREE.Shape();
  arrowShape.moveTo(0, 0);
  arrowShape.lineTo(-0.3, 0.6);
  arrowShape.lineTo(0.3, 0.6);
  arrowShape.lineTo(0, 0);
  const arrowGeo = new THREE.ShapeGeometry(arrowShape);
  const arrowMat = new THREE.MeshBasicMaterial({ color: 0xffdd00, side: THREE.DoubleSide });
  const arrowMesh = new THREE.Mesh(arrowGeo, arrowMat);
  arrowGroup.add(arrowMesh);
  // 화살표 막대
  const arrowStickGeo = new THREE.PlaneGeometry(0.12, 0.5);
  const arrowStick = new THREE.Mesh(arrowStickGeo, arrowMat);
  arrowStick.position.y = 0.85;
  arrowGroup.add(arrowStick);
  bobberArrow = arrowGroup;
  bobberArrow.visible = false;
  scene.add(bobberArrow);

  // 흙먼지 파티클 (물고기 도망갈 때)
  const mudGeo = new THREE.SphereGeometry(0.2, 4, 4);
  const mudMat = new THREE.MeshBasicMaterial({ color: 0x5c4033, transparent: true, opacity: 0.8 });
  for (let i = 0; i < 8; i++) {
    const p = new THREE.Mesh(mudGeo, mudMat);
    p.visible = false;
    scene.add(p);
    mudParticles.push({ mesh: p, velocity: new THREE.Vector3(), life: 0 });
  }

  // 낚싯줄: 다중 점으로 자연스러운 곡선 표현 (10개 점의 catenary)
  const LINE_POINTS = 12;
  const lineMat = new THREE.LineBasicMaterial({ color: 0xdddddd, transparent: true, opacity: 0.6 });
  const linePoints = [];
  for (let i = 0; i < LINE_POINTS; i++) linePoints.push(new THREE.Vector3());
  const lineGeo = new THREE.BufferGeometry().setFromPoints(linePoints);
  fishingLine = new THREE.Line(lineGeo, lineMat);
  fishingLine.visible = true;
  fishingLine.frustumCulled = false; // 시야 밖에서도 항상 렌더링
  scene.add(fishingLine);

  const audioLoader = new THREE.AudioLoader();

  clickSound = new THREE.Audio(audioListener);
  audioLoader.load('sound/click.mp3', (buffer) => {
    clickSound.setBuffer(buffer);
    clickSound.setVolume(1.0);
  });

  waterDropSound = new THREE.Audio(audioListener);
  audioLoader.load('sound/water-drop.mp3', (buffer) => {
    waterDropSound.setBuffer(buffer);
    waterDropSound.setVolume(1.0);
  });

  struggleSound = new THREE.Audio(audioListener);
  audioLoader.load('sound/fish_sp.mp3', (buffer) => {
    struggleSound.setBuffer(buffer);
    struggleSound.setLoop(true); // 실랑이 중 계속 재생되도록 루프
    struggleSound.setVolume(1.0);
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
    { xMin: 70, xMax: 120, zMin: -400, zMax: 400, spacing: 12 },
    // 자갈지대 (듬성듬성)
    { xMin: 120, xMax: 150, zMin: -400, zMax: 400, spacing: 16 },
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
        
        // 물가(localX < 120)일수록 크고 높은 수풀이 많이 자라도록 확률과 크기 조정
        let isLarge = false;
        let largeScale = 1;

        if (localX < 120) {
          // 물가: 80% 확률로 크고 높은 수풀
          if (Math.random() > 0.2) {
            isLarge = true;
            largeScale = 1.5 + Math.random() * 1.5;
          }
        } else if (localX < 150) {
          // 자갈지대: 40% 확률로 중간 정도의 큰 수풀
          if (Math.random() > 0.6) {
            isLarge = true;
            largeScale = 1.0 + Math.random() * 0.8;
          }
        } else {
          // 숲(육지쪽): 10% 확률로 약간만 큰 수풀, 대부분은 기본이거나 작은 수풀
          if (Math.random() > 0.9) {
            isLarge = true;
            largeScale = 1.0 + Math.random() * 0.4;
          } else {
            // 육지 쪽 기본 수풀의 크기도 조금 더 작게 설정
            bush.scale.multiplyScalar(0.6 + Math.random() * 0.4);
          }
        }

        if (isLarge) {
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

  // 7. 마우스 조작 이벤트 (Pointer Lock 적용)
  const blocker = document.getElementById('blocker');
  const instructions = document.getElementById('instructions');
  
  // 물고기 포획 메시지 UI 생성
  catchMsg = document.createElement('div');
  catchMsg.id = 'catch-message';
  catchMsg.style.position = 'absolute';
  catchMsg.style.bottom = '15%';
  catchMsg.style.left = '50%';
  catchMsg.style.transform = 'translateX(-50%)';
  catchMsg.style.color = '#ffffff';
  catchMsg.style.fontSize = '24px';
  catchMsg.style.fontWeight = 'bold';
  catchMsg.style.textShadow = '2px 2px 4px rgba(0,0,0,0.8)';
  catchMsg.style.display = 'none';
  catchMsg.style.pointerEvents = 'none';
  catchMsg.style.zIndex = '100';
  catchMsg.style.textAlign = 'center';
  document.body.appendChild(catchMsg);

  // 상호작용(아이스박스) UI
  interactMsg = document.createElement('div');
  interactMsg.style.position = 'absolute';
  interactMsg.style.bottom = '20%';
  interactMsg.style.left = '50%';
  interactMsg.style.transform = 'translateX(-50%)';
  interactMsg.style.color = '#ffffff';
  interactMsg.style.fontSize = '24px';
  interactMsg.style.fontWeight = 'bold';
  interactMsg.style.textShadow = '2px 2px 4px rgba(0,0,0,0.8)';
  interactMsg.style.display = 'none';
  interactMsg.style.pointerEvents = 'none';
  interactMsg.style.zIndex = '100';
  document.body.appendChild(interactMsg);

  // 아이스박스 3D 텍스트(플로팅 UI)
  iceboxText = document.createElement('div');
  iceboxText.style.position = 'absolute';
  iceboxText.style.color = '#ffffff';
  iceboxText.style.fontSize = '18px';
  iceboxText.style.fontWeight = 'bold';
  iceboxText.style.textShadow = '1px 1px 2px #000';
  iceboxText.style.display = 'none';
  iceboxText.style.pointerEvents = 'none';
  iceboxText.style.zIndex = '90';
  iceboxText.style.textAlign = 'center';
  iceboxText.style.transform = 'translate(-50%, -100%)';
  iceboxText.innerHTML = `저장된 물고기 없음`;
  document.body.appendChild(iceboxText);

  // 아이스박스(스폰 지점 부근) 생성 (진짜로 속이 비어있게 조립)
  iceboxGroup = new THREE.Group();
  const outMat = new THREE.MeshStandardMaterial({ color: 0xadd8e6, roughness: 0.5 });
  const inMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8 });

  // 1. 바닥
  const baseOuter = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.05, 0.8), outMat);
  baseOuter.position.y = 0.025;
  iceboxGroup.add(baseOuter);
  const baseInner = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.05, 0.7), inMat);
  baseInner.position.y = 0.075;
  iceboxGroup.add(baseInner);

  // 2. 왼쪽/오른쪽 벽
  const wLOut = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.8, 0.8), outMat);
  wLOut.position.set(-0.575, 0.4, 0);
  iceboxGroup.add(wLOut);
  const wLIn = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.75, 0.7), inMat);
  wLIn.position.set(-0.525, 0.425, 0);
  iceboxGroup.add(wLIn);

  const wROut = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.8, 0.8), outMat);
  wROut.position.set(0.575, 0.4, 0);
  iceboxGroup.add(wROut);
  const wRIn = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.75, 0.7), inMat);
  wRIn.position.set(0.525, 0.425, 0);
  iceboxGroup.add(wRIn);

  // 3. 앞/뒤 벽
  const wFOut = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.8, 0.05), outMat);
  wFOut.position.set(0, 0.4, 0.375);
  iceboxGroup.add(wFOut);
  const wFIn = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.75, 0.05), inMat);
  wFIn.position.set(0, 0.425, 0.325);
  iceboxGroup.add(wFIn);

  const wBOut = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.8, 0.05), outMat);
  wBOut.position.set(0, 0.4, -0.375);
  iceboxGroup.add(wBOut);
  const wBIn = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.75, 0.05), inMat);
  wBIn.position.set(0, 0.425, -0.325);
  iceboxGroup.add(wBIn);

  // 그림자 일괄 적용
  iceboxGroup.children.forEach(c => { c.castShadow = true; c.receiveShadow = true; });

  // 뚜껑 (옆에 놓임)
  const lid = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.1, 0.8), outMat);
  lid.position.set(1.0, 0.05, 0);
  lid.rotation.z = Math.PI / 12; // 비스듬히 놓임
  lid.castShadow = true;
  lid.receiveShadow = true;
  iceboxGroup.add(lid);

  // 위치 설정 (맵 중앙 자갈지대 부근)
  iceboxGroup.scale.set(6.0, 6.0, 6.0); // 크기 대폭 확대 (6배)
  iceboxGroup.position.set(113, getTerrainHeight(113, -5), -5);
  scene.add(iceboxGroup);

  const crosshair = document.getElementById('crosshair');
  const glCanvas = renderer.domElement;
  let isFirstLoad = true;

  // 처음에는 크로스헤어 숨김
  if (crosshair) crosshair.style.display = 'none';

  // 포인터 잠금 요청 함수
  const requestLock = () => {
    try {
      if (glCanvas.requestPointerLock) {
        glCanvas.requestPointerLock();
      } else if (glCanvas.mozRequestPointerLock) {
        glCanvas.mozRequestPointerLock();
      } else if (glCanvas.webkitRequestPointerLock) {
        glCanvas.webkitRequestPointerLock();
      }
    } catch(err) {
      console.warn('Pointer lock request failed:', err);
    }
  };

  // 포인터 잠금 해제 함수
  const releaseLock = () => {
    const exitFn = document.exitPointerLock
      || document.mozExitPointerLock
      || document.webkitExitPointerLock;
    if (exitFn) exitFn.call(document);
  };

  // blocker 클릭 → 게임 시작
  blocker.addEventListener('click', (e) => {
    if (e.target.tagName !== 'A') {
      isFirstLoad = false;
      requestLock();
    }
  });

  // canvas 클릭해도 재개 가능
  glCanvas.addEventListener('click', () => {
    if (!document.pointerLockElement && !document.mozPointerLockElement) {
      requestLock();
    }
  });

  // pointerlockchange 이벤트 리스너 (파이어폭스: mozpointerlockchange)
  const onPointerLockChange = () => {
    const locked = !!(document.pointerLockElement || document.mozPointerLockElement);
    if (locked) {
      blocker.style.display = 'none';
      if (crosshair) crosshair.style.display = 'block';
    } else if (!isFirstLoad) {
      // 최초 로드가 아닌 경우에만 일시정지 표시
      blocker.style.display = 'flex';
      if (crosshair) crosshair.style.display = 'none';
      instructions.innerHTML = `
        <span style="font-size:36px; font-weight: 900; color:#fff; margin-bottom: 20px; display:inline-block;">일시정지</span><br/><br/>
        클릭하여 다시 시작합니다<br/><br/>
        <b>이동:</b> W, A, S, D<br/>
        <b>점프:</b> Space<br/>
        <b>시야:</b> 마우스<br/>
        <b>일시정지:</b> Q 키<br/><br/>
        <a href="kl_earn.html" class="back-btn" style="position:relative; display:inline-block; margin-top:20px;">← 도박장으로 돌아가기</a>
      `;
    }
  };

  document.addEventListener('pointerlockchange', onPointerLockChange);
  document.addEventListener('mozpointerlockchange', onPointerLockChange);

  document.addEventListener('mousemove', (e) => {
    const locked = !!(document.pointerLockElement || document.mozPointerLockElement);
    if (locked) {
      const mx = e.movementX || e.mozMovementX || 0;
      const my = e.movementY || e.mozMovementY || 0;
      yaw -= mx * 0.002;
      pitch -= my * 0.002;
      pitch = Math.max(-Math.PI/2 + 0.1, Math.min(Math.PI/2 - 0.1, pitch));

      // 낚시 캐스팅 차징
      if (isRodEquipped && castState === 'charging') {
        const speed = Math.sqrt(mx * mx + my * my);
        castPower += speed * 0.03; // 파워 누적 계수
        castPower = Math.min(castPower, 45); // 최대 파워 제한
      }

      // 챔질(회수) 및 실랑이 로직: 마우스 클릭 중 + 시야를 위로 빠르게 올리는 동작
      if (isRodEquipped && isMouseDown) {
        if (['casted', 'waiting_bite', 'pre_biting'].includes(castState)) {
          // 물고기 없는 상태(또는 입질/예신 대기 중)에서 일반 회수
          if (my < -60) {
            castState = 'idle';
            bobberSwingVel.set(0, 0, 0);
            bobberSwingOff.set(0, 0, 0);
            if (fishModel) fishModel.visible = false;
            if (fishAction) fishAction.stop();
            if (catchMsg) catchMsg.style.display = 'none';
          }
        } else if (castState === 'biting') {
          // 입질 중 챔질 성공 -> 실랑이 시작
          if (my < -50) {
            castState = 'struggling';
            fishSize = Math.floor(Math.random() * 10) + 1; // 1~10 랜덤 크기(힘)
            fishDistance = fishSize * 6; // 난이도 대폭 상승 (기존 3 -> 6)
            struggleTimer = performance.now() + 4000; // 4초 안에 당기지 않으면 도망감
            bobberSwingVel.set(0, 0, 0);
            bobberSwingOff.set(0, 0, 0);
            
            // 물고기 무작위 선택
            currentFishIndex = Math.floor(Math.random() * fishTypes.length);
            const activeFish = fishTypes[currentFishIndex];
            fishModel = activeFish.model;
            fishMixer = activeFish.mixer;
            fishAction = activeFish.action;
            
            // 실랑이 소리 재생
            if (struggleSound && struggleSound.buffer && !struggleSound.isPlaying) {
              struggleSound.play();
            }
            
            // 실랑이 시작 시 물고기 모델 표시 및 애니메이션 재생
            if (fishModel) {
              fishModel.visible = true;
              // 1~10 난이도에 비례하여 0.3(30%) ~ 1.1(110%) 스케일 무작위 적용 후 개별 크기 조절
              const fishScale = (0.3 + ((fishSize - 1) / 9) * 0.8) * activeFish.scaleMult;
              fishModel.scale.setScalar(fishScale);
              if (fishAction) {
                fishAction.reset();
                fishAction.play();
              }
            }
          }
        } else if (castState === 'struggling') {
          // 실랑이 중 마우스 조작 (휨 효과)
          if (my < 0) {
            rodBendY += (-my) * 0.005; // 휨 속도 복구
            if (rodBendY > 0.6) rodBendY = 0.6; // 최대 휨 한계 (원래 0.8보다 약간만 줄임)
          }
          if (mx !== 0) {
            // 낚싯대가 한쪽으로 휜 상태에서 마우스를 반대로 되돌릴 때(챔질 준비용) 반대방향으로 춤추지 않도록 감도 저하
            if ((rodBendX < -0.1 && mx > 0) || (rodBendX > 0.1 && mx < 0)) {
              rodBendX += mx * 0.001; 
            } else {
              rodBendX += mx * 0.006; 
            }
            if (rodBendX > 0.6) rodBendX = 0.6;
            if (rodBendX < -0.6) rodBendX = -0.6;
          }

          if (my < -20) {
            fishDistance -= (-my * 0.015); // 당기는 힘을 약간 줄여 난이도 상승
            struggleTimer = performance.now() + 2000 + (fishSize * 200); // 당기면 타이머 연장 (큰 고기일수록 여유)
            if (fishDistance <= 0) {
              // 물고기 낚음!
              castState = 'caught';
              hasFish = true; // 물고기 획득 상태
              // 찌 다시 보이게 유지, 모델은 이미 보이고 있음
              bobberSwingVel.set(0, 0, 0);
              bobberSwingOff.set(0, 0, 0);
              
              // 낚았으므로 실랑이 소리 정지
              if (struggleSound && struggleSound.isPlaying) {
                struggleSound.stop();
              }
              
              if (catchMsg) {
                // 크기 계산 (최소~최대)
                const activeFish = fishTypes[currentFishIndex];
                const fishLength = Math.round(activeFish.minSize + ((fishSize - 1) / 9) * (activeFish.maxSize - activeFish.minSize));
                let releaseText = '';
                 if (fishSize <= 3) {
                  releaseText = '<br><span style="font-size:16px; color:#ffffff; display:inline-block; margin-top:10px;">[G] 키를 눌러 방생하기</span>';
                }
                catchMsg.innerHTML = `[${activeFish.name}]를 잡았습니다!<br><span style="font-size:18px;">크기: ${fishLength}cm</span>${releaseText}`;
                catchMsg.style.display = 'block';
                
                // 7초 후 메시지 숨김
                if (catchMsgTimeout) clearTimeout(catchMsgTimeout);
                catchMsgTimeout = setTimeout(() => {
                  if (catchMsg) catchMsg.style.display = 'none';
                }, 7000);
              }
            }
          }
        }
      }
    }
  });

  document.addEventListener('mousedown', (e) => {
    const locked = !!(document.pointerLockElement || document.mozPointerLockElement);
    if (locked) {
      isMouseDown = true;
      if (isRodEquipped && castState === 'idle') {
        castState = 'charging';
        castPower = 0;
        hasFish = false; // 캐스팅 시 물고기 놓침
      }
    }
  });

  document.addEventListener('mouseup', (e) => {
    isMouseDown = false;
    const locked = !!(document.pointerLockElement || document.mozPointerLockElement);
    if (locked && isRodEquipped && castState === 'charging') {
      // 낚시대 끝 월드 좌표 계산
      if (fishingRodGroup) {
        fishingRodGroup.updateMatrixWorld(true);
        rodTipWorldPos.setFromMatrixPosition(rodTipDummy.matrixWorld);
      }

      castState = 'flying';
      bobberSwingVel.set(0, 0, 0);
      bobberSwingOff.set(0, 0, 0);

      // 찌 발사 위치: 낚시대 끝단
      bobber.position.copy(rodTipWorldPos);

      // 카메라가 바라보는 방향으로 발사 (약간 위쪽으로)
      const lookDir = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
      lookDir.y += 0.3;
      lookDir.normalize();

      const finalPower = Math.max(castPower, 10);
      bobberVelocity.copy(lookDir).multiplyScalar(finalPower);
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
    case 'KeyE':
      // 아이스박스 주변에 있고 잡은 물고기가 있을 경우 저장
      if (interactMsg && interactMsg.style.display === 'block' && hasFish) {
        hasFish = false;
        storedFishCount++;
        
        const activeFish = fishTypes[currentFishIndex];
        activeFish.count++;
        
        if (iceboxText) {
          const countsText = fishTypes.filter(f => f.count > 0).map(f => `${f.name} - ${f.count}마리`).join('<br>');
          iceboxText.innerHTML = countsText || '저장된 물고기 없음';
        }
        
        // 아이스박스 내부에 물고기 추가
        if (fishModel && iceboxGroup) {
          const storedFish = SkeletonUtils.clone(fishModel);
          // 아이스박스가 스케일 6이므로 상대적으로 작게 설정 (물고기 종류별 저장 크기 비율 적용)
          storedFish.scale.set(activeFish.storeScale, activeFish.storeScale, activeFish.storeScale); 
          
          // 아이스박스 내부 공간 내에서 랜덤 배치 (-0.4 ~ 0.4)
          const rx = (Math.random() - 0.5) * 0.7;
          const rz = (Math.random() - 0.5) * 0.4;
          // 바닥(y=0.075)부터 물고기가 쌓이는 효과
          const ry = 0.1 + (storedFishCount * 0.05); 
          
          storedFish.position.set(rx, ry, rz);
          // 바닥에 눕히기 위해 회전 (X/Z축 90도 회전 및 Y축 랜덤)
          storedFish.rotation.set(-Math.PI / 2, Math.random() * Math.PI, 0);
          
          iceboxGroup.add(storedFish);
        }

        // 물고기 숨기기 & 상태 리셋
        if (fishModel) fishModel.visible = false;
        if (fishAction) fishAction.stop();
        if (catchMsg) {
          catchMsg.style.display = 'none';
          if (catchMsgTimeout) clearTimeout(catchMsgTimeout);
        }
        
        // 낚싯줄에 매달려 있었다면 리셋
        if (castState === 'caught') {
          castState = 'idle';
          bobberSwingVel.set(0, 0, 0);
          bobberSwingOff.set(0, 0, 0);
        }
      } else if (interactMsg && interactMsg.style.display === 'block' && !hasFish) {
        // 물고기가 없는데 E를 누른 경우 임시 피드백
        interactMsg.innerText = '가진 물고기가 없습니다!';
        setTimeout(() => {
          if (interactMsg && interactMsg.style.display === 'block') interactMsg.innerText = '[E] 물고기 넣기';
        }, 1500);
      }
      break;
    case 'Space':
      if (canJump === true) velocity.y += 40;
      canJump = false;
      break;
    case 'Digit1':
      isRodEquipped = !isRodEquipped;
      if (fishingRodGroup) fishingRodGroup.visible = isRodEquipped;
      if (catchMsg) catchMsg.style.display = 'none';
      if (isRodEquipped) {
        // 낚시대 장착 시: 찌와 줄 다시 표시, 상태 초기화
        if (bobber) bobber.visible = true;
        if (fishingLine) fishingLine.visible = true;
        castState = 'idle';
        if (fishModel) fishModel.visible = false;
        if (fishAction) fishAction.stop();
      } else {
        // 낚시대 해제 시: 찌와 줄 숨김, 잡은 물고기 초기화
        if (bobber) bobber.visible = false;
        if (fishingLine) fishingLine.visible = false;
        if (fishModel) fishModel.visible = false;
        if (fishAction) fishAction.stop();
        if (struggleSound && struggleSound.isPlaying) struggleSound.stop();
        castState = 'idle';
      }
      break;
    case 'KeyQ':
      if (!!(document.pointerLockElement || document.mozPointerLockElement)) {
        const exitFn = document.exitPointerLock || document.mozExitPointerLock;
        if (exitFn) exitFn.call(document);
      }
      break;
    case 'KeyG':
      // 방생 조건: 낚음 상태, 물고기 있음, 난이도(크기) 3 이하
      if (castState === 'caught' && hasFish && fishSize <= 3) {
        hasFish = false;
        castState = 'releasing';
        if (releaseMsg) releaseMsg.style.display = 'none';
        if (catchMsg) catchMsg.style.display = 'none';
        if (catchMsgTimeout) clearTimeout(catchMsgTimeout);

        // 찌와 줄 원위치 초기화
        bobberSwingVel.set(0, 0, 0);
        bobberSwingOff.set(0, 0, 0);
        
        // 물고기를 찌 위치에서 분리 및 방생 애니메이션 변수 초기화
        if (fishModel) {
          fishModel.position.copy(bobber.position);
          fishModel.userData.isReleasing = true;
          fishModel.userData.velocityY = 0;
          fishModel.userData.dir = new THREE.Vector3();
          camera.getWorldDirection(fishModel.userData.dir);
          fishModel.userData.dir.y = 0;
          fishModel.userData.dir.normalize();
          fishModel.userData.velocityX = fishModel.userData.dir.x * 5;
          fishModel.userData.velocityZ = fishModel.userData.dir.z * 5;
        }
      }
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

  // 낚시 물리 및 낚싯줄 업데이트
  if (isRodEquipped && fishingRodGroup) {
    // 낚시대 자연스러운 휨 (탄성 복원)
    if (rodBendY > 0) {
      rodBendY -= delta * 1.5; // 서서히 펴짐
      if (rodBendY < 0) rodBendY = 0;
    }
    if (rodBendX > 0) {
      rodBendX -= delta * 1.5;
      if (rodBendX < 0) rodBendX = 0;
    } else if (rodBendX < 0) {
      rodBendX += delta * 1.5;
      if (rodBendX > 0) rodBendX = 0;
    }
    
    // 각 관절에 상하/좌우 휨(회전) 적용
    if (rod1Group && rod2Group && rod3Group) {
      rod1Group.rotation.x = -rodBendY * 0.2; // 하단은 덜 휨
      rod2Group.rotation.x = -rodBendY * 0.4; // 중간은 적당히
      rod3Group.rotation.x = -rodBendY * 0.8; // 끝은 많이 휨

      rod1Group.rotation.z = rodBendX * 0.15;
      rod2Group.rotation.z = rodBendX * 0.3;
      rod3Group.rotation.z = rodBendX * 0.6;
    }

    fishingRodGroup.updateMatrixWorld(true);

    // 낚시대 끝단 월드 위치 업데이트
    rodTipWorldPos.setFromMatrixPosition(rodTipDummy.matrixWorld);

    if (castState === 'flying') {
      bobberVelocity.y -= 9.8 * 4.0 * delta; // 중력 적용
      bobber.position.addScaledVector(bobberVelocity, delta);

      // 수면(y=0) 또는 지형 충돌 판정
      const terrainY = getTerrainHeight(bobber.position.x, bobber.position.z);
      const waterY = 0;
      const hitY = Math.max(terrainY, waterY);

      if (bobber.position.y <= hitY) {
        bobber.position.y = hitY;
        bobberVelocity.set(0, 0, 0);
        bobberSwingVel.set(0, 0, 0);
        bobberSwingOff.set(0, 0, 0);
        
        if (hitY <= 0.1) {
          // 물에 떨어짐: 입질 대기 상태로
          castState = 'waiting_bite';
          biteTimer = time + 3000 + Math.random() * 5000; // 3~8초 후 입질
          if (waterDropSound && waterDropSound.buffer) {
            if (waterDropSound.isPlaying) waterDropSound.stop();
            waterDropSound.play();
          }
        } else {
          // 땅에 떨어짐: 그냥 안착
          castState = 'casted';
        }
      }

    } else if (castState === 'casted' || castState === 'waiting_bite' || castState === 'pre_biting' || castState === 'biting') {
      // 기본 물결 출렁임
      const wave1 = Math.sin(bobber.position.x * 0.15 + time * 0.003) * 0.4;
      const wave2 = Math.cos(bobber.position.z * 0.1 + time * 0.004) * 0.25;
      bobber.position.y = wave1 + wave2;

      if (castState === 'waiting_bite') {
        if (time > biteTimer) {
          // 예신 시작
          castState = 'pre_biting';
          biteDuration = time + 2000 + Math.random() * 1500; // 2~3.5초 동안 예신 (2~3번 톡톡)
        }
      } else if (castState === 'pre_biting') {
        // 예신 이펙트: 불규칙하게 살짝살짝 들어가는 톡톡 애니메이션
        // Math.random()과 삼각함수를 섞어 Y축으로 빠르고 얕게 진동
        const preBiteY = -Math.abs(Math.sin(time * 0.015)) * (0.1 + Math.random() * 0.05);
        bobber.position.y += preBiteY;

        if (time > biteDuration) {
          // 본신 시작 (진짜 입질)
          castState = 'biting';
          biteDuration = time + 2000 + Math.random() * 2000; // 2~4초 동안 본신
          
          // 파동 이펙트 활성화
          rippleRings.forEach((r, i) => {
            r.active = true;
            r.age = -i * 0.5; // 시간차 발생
            r.mesh.visible = true;
            r.mesh.position.set(bobber.position.x, 0.05, bobber.position.z);
          });
        }
      } else if (castState === 'biting') {
        // 본신 이펙트: 수면 아래로 깊숙이 빨려들어가며 X/Z축으로 요동침
        bobber.position.y -= 0.3 + Math.abs(Math.sin(time * 0.05) * 0.2); // 아래로 쑥 빨려감
        bobber.position.x += (Math.random() - 0.5) * 0.15; // X축 요동
        bobber.position.z += (Math.random() - 0.5) * 0.15; // Z축 요동

        // 파동 이펙트 애니메이션
        rippleRings.forEach(r => {
          if (r.active) {
            r.age += delta * 2;
            if (r.age > 0) {
              const scale = 1 + r.age * 3;
              r.mesh.scale.set(scale, scale, scale);
              r.mesh.material.opacity = Math.max(0, 1 - r.age);
              if (r.age > 1) {
                r.age = 0; // 반복
                r.mesh.position.set(bobber.position.x, 0.05, bobber.position.z);
              }
            }
          }
        });

        if (time > biteDuration) {
          // 입질 놓침
          castState = 'waiting_bite';
          biteTimer = time + 4000 + Math.random() * 6000;
          rippleRings.forEach(r => { r.active = false; r.mesh.visible = false; });
        }
      }

    } else if (castState === 'struggling') {
      // 실랑이 중 물고기 애니메이션 업데이트
      if (fishMixer) {
        fishMixer.update(delta);
      }

      // 실랑이 상태: 파동 이펙트 끄기
      rippleRings.forEach(r => { r.active = false; r.mesh.visible = false; });

      // 물고기가 저항하며 찌가 이리저리 튀는 연출
      const struggleX = Math.sin(time * 0.02) * (fishSize * 0.1);
      const struggleZ = Math.cos(time * 0.015) * (fishSize * 0.1);
      
      const maxDist = fishSize * 6;
      const progress = 1 - (fishDistance / maxDist); // 0 -> 1
      
      const currentPos = bobber.position.clone();
      currentPos.lerp(rodTipWorldPos, 0.5 * delta); // 약간 끌려옴
      
      bobber.position.set(
        currentPos.x + struggleX,
        Math.max(0, getTerrainHeight(currentPos.x, currentPos.z)) - 0.2 + Math.sin(time * 0.05) * 0.2,
        currentPos.z + struggleZ
      );

      // 실랑이 중 물고기는 찌 아래에서 헤엄치며 버팀
      if (fishModel) {
        fishModel.position.copy(bobber.position);
        fishModel.position.y -= 0.5; // 수면 살짝 아래
        // 플레이어(낚시대 끝)의 반대 방향으로 도망가려는 듯이 바라봄
        const awayDir = new THREE.Vector3().subVectors(bobber.position, rodTipWorldPos);
        awayDir.y = 0;
        if (awayDir.lengthSq() > 0.001) {
          awayDir.normalize();
          const angle = Math.atan2(awayDir.x, awayDir.z);
          // GLB 모델의 머리가 +X 방향을 향한다고 가정 (init에서 Math.PI/2 회전)
          // 머리가 도망가는 방향(awayDir)을 향하도록 Y축 회전값 보정
          fishModel.rotation.set(0, angle - Math.PI / 2, 0);
        }
      }

      // 타이머 초과 시 물고기 도망감
      if (performance.now() > struggleTimer) {
        castState = 'waiting_bite';
        biteTimer = time + 4000 + Math.random() * 6000; // 다시 입질 대기
        if (fishModel) fishModel.visible = false;
        if (fishAction) fishAction.stop();
        if (catchMsg) catchMsg.style.display = 'none';
        
        // 도망갔으므로 실랑이 소리 정지
        if (struggleSound && struggleSound.isPlaying) {
          struggleSound.stop();
        }
        
        // 흙먼지 파티클 스폰
        mudParticles.forEach((p, i) => {
          p.mesh.visible = true;
          p.mesh.position.copy(bobber.position);
          p.mesh.position.y = 0.1; // 수면 근처
          const angle = (i / 8) * Math.PI * 2;
          p.velocity.set(Math.cos(angle) * 3, Math.random() * 2, Math.sin(angle) * 3);
          p.life = 1.0;
        });
      }

    } else if (castState === 'caught') {
      // 낚시에 성공하여 매달린 상태
      if (fishMixer) {
        fishMixer.update(delta);
      }
      
      // 찌가 낚시대 끝에 매달리도록 (관성/스윙 물리 적용)
      const camMove = new THREE.Vector3().subVectors(camera.position, prevCameraPos);
      bobberSwingVel.x -= camMove.x * 18;
      bobberSwingVel.z -= camMove.z * 18;
      bobberSwingVel.y -= camMove.y * 10;
      bobberSwingVel.y -= 25 * delta;
      bobberSwingVel.x -= bobberSwingOff.x * 12 * delta;
      bobberSwingVel.y -= bobberSwingOff.y * 12 * delta;
      bobberSwingVel.z -= bobberSwingOff.z * 12 * delta;
      bobberSwingVel.multiplyScalar(1 - 8 * delta);
      bobberSwingOff.addScaledVector(bobberSwingVel, delta);
      bobberSwingOff.clampLength(0, 1.5);

      bobber.position.set(
        rodTipWorldPos.x + bobberSwingOff.x,
        rodTipWorldPos.y + bobberSwingOff.y - 2.0, // 더 길게 늘어지게
        rodTipWorldPos.z + bobberSwingOff.z
      );
      
      // 물고기가 찌 아래에 세로로 매달리도록
      if (fishModel) {
        fishModel.position.copy(bobber.position);
        fishModel.position.y -= 0.5;
        
        // 개별 어종에 맞게 매달린 방향(세로) 적용
        const activeFish = fishTypes[currentFishIndex];
        const rot = activeFish.caughtRot;
        fishModel.rotation.set(rot[0], rot[1], rot[2]); 
        
        // 버둥거리는 효과 (로컬 Y축 기준 회전하여 파닥거림)
        // 밤티고기는 rotateY, 나머지는 X/Z축 방향에 맞춰 적용
        if (currentFishIndex === 0) {
          fishModel.rotateY(Math.sin(time * 0.01) * 0.5);
        } else {
          fishModel.rotateY(Math.sin(time * 0.01) * 0.5);
        }
      }

    } else if (castState === 'releasing') {
      if (fishModel && fishModel.userData.isReleasing) {
        const groundY = Math.max(getTerrainHeight(fishModel.position.x, fishModel.position.z), 1.0);
        
        fishModel.userData.velocityY -= 30 * delta; // 중력
        fishModel.position.x += fishModel.userData.velocityX * delta;
        fishModel.position.z += fishModel.userData.velocityZ * delta;
        fishModel.position.y += fishModel.userData.velocityY * delta;
        
        // 파닥거리는 회전
        fishModel.rotation.x += 15 * delta;
        fishModel.rotation.y += 20 * delta;
        fishModel.rotation.z += 10 * delta;
        
        if (fishModel.position.y <= groundY) {
          fishModel.position.y = groundY;
          if (groundY <= 1.0) {
            // 물에 닿음
            if (waterDropSound && waterDropSound.buffer) {
              if (waterDropSound.isPlaying) waterDropSound.stop();
              waterDropSound.play();
            }
            fishModel.visible = false;
            fishModel.userData.isReleasing = false;
            castState = 'idle';
          } else {
            // 땅에 닿아 튕김
            fishModel.userData.velocityY = 8; 
          }
        }
      } else {
        castState = 'idle';
      }
    } else if (castState === 'idle' || castState === 'charging') {
      // 달랑달랑 swing 물리: 카메라가 움직이면 찌가 관성으로 흔들림
      const camMove = new THREE.Vector3().subVectors(camera.position, prevCameraPos);
      // 카메라 이동 반대방향으로 관성력 추가
      bobberSwingVel.x -= camMove.x * 18;
      bobberSwingVel.z -= camMove.z * 18;
      bobberSwingVel.y -= camMove.y * 10;

      // 중력 (아래로 당김)
      bobberSwingVel.y -= 25 * delta;

      // 스프링 복원력 (원점으로 되돌아오려는 힘)
      bobberSwingVel.x -= bobberSwingOff.x * 12 * delta;
      bobberSwingVel.y -= bobberSwingOff.y * 12 * delta;
      bobberSwingVel.z -= bobberSwingOff.z * 12 * delta;

      // 댐핑 (서서히 멈춤)
      bobberSwingVel.multiplyScalar(1 - 8 * delta);

      // 오프셋 업데이트
      bobberSwingOff.addScaledVector(bobberSwingVel, delta);

      // 최대 흔들림 제한
      bobberSwingOff.clampLength(0, 2.5); // 더 길어진 줄에 맞춰 가동범위 넓힘

      // 찌 위치 = 낚시대 끝 + 오프셋 + 중력 처짐
      bobber.position.set(
        rodTipWorldPos.x + bobberSwingOff.x,
        rodTipWorldPos.y + bobberSwingOff.y - 1.5, // 0.3 -> 1.5로 늘어지게
        rodTipWorldPos.z + bobberSwingOff.z
      );
    }

    // 흙먼지 파티클 애니메이션
    mudParticles.forEach(p => {
      if (p.life > 0) {
        p.life -= delta * 0.5;
        p.mesh.position.addScaledVector(p.velocity, delta);
        p.mesh.scale.setScalar(p.life * 2);
        p.mesh.material.opacity = p.life * 0.8;
        if (p.life <= 0) p.mesh.visible = false;
      }
    });

    // 이전 카메라 위치 저장
    prevCameraPos.copy(camera.position);

    // 노란색 화살표 마커: 캐스팅 중(flying/casted/waiting_bite/biting/struggling)에 찌 위에 표시
    if (bobberArrow) {
      if (['flying', 'casted', 'waiting_bite', 'biting', 'struggling'].includes(castState)) {
        bobberArrow.visible = true;
        bobberArrow.position.set(bobber.position.x, bobber.position.y + 3, bobber.position.z);
        // 항상 카메라를 바라보도록 (빌보드)
        bobberArrow.lookAt(camera.position);
      } else {
        bobberArrow.visible = false;
      }
    }

    // 낚싯줄 QuadraticBezier 곡선 렌더링
    if (fishingLine) {
      const start = rodTipWorldPos;
      const end = bobber.position;

      // 중간점 제어 지점 (Control Point)
      const mid = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
      
      // 상태에 따른 줄의 처짐 정도(sag) 결정
      const sag = (castState === 'flying') ? 0 : 0.8;
      // 거리에 비례하여 아래로 더 늘어지도록 설정
      const droop = -sag * Math.max(0.3, start.distanceTo(end) * 0.15);
      mid.y += droop;

      // 베지어 곡선 생성
      const curve = new THREE.QuadraticBezierCurve3(start, mid, end);
      
      const positions = fishingLine.geometry.attributes.position.array;
      const N = positions.length / 3;
      
      // N개의 점으로 곡선을 따라 정점 업데이트
      const curvePoints = curve.getPoints(N - 1);
      for (let i = 0; i < N; i++) {
        positions[i * 3]     = curvePoints[i].x;
        positions[i * 3 + 1] = curvePoints[i].y;
        positions[i * 3 + 2] = curvePoints[i].z;
      }

      fishingLine.geometry.attributes.position.needsUpdate = true;
      fishingLine.geometry.computeBoundingSphere();
    }
  }

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

  if (iceboxGroup && camera) {
    // 플레이어(카메라)와 아이스박스의 2D 수평 거리만 계산 (높이 차이 무시)
    const dx = camera.position.x - iceboxGroup.position.x;
    const dz = camera.position.z - iceboxGroup.position.z;
    const dist2D = Math.sqrt(dx * dx + dz * dz);
    
    // UI 메시지 토글 (2D 거리 15 이내)
    if (dist2D < 15.0) {
      if (interactMsg) {
        interactMsg.innerText = '[E] 물고기 넣기';
        interactMsg.style.display = 'block';
      }
    } else {
      if (interactMsg) interactMsg.style.display = 'none';
    }

    // 아이스박스 플로팅 텍스트
    // 거리가 너무 멀면(예: 50 초과) 텍스트 숨김
    if (dist2D < 50.0) {
      const textPos = iceboxGroup.position.clone();
      textPos.y += 4.5; // 스케일이 6이므로 텍스트 위치도 더 높게 조정
      const projectPos = textPos.project(camera);
      if (projectPos.z < 1) { // 카메라 앞에 있을 때만
        const x = (projectPos.x * .5 + .5) * window.innerWidth;
        const y = (projectPos.y * -.5 + .5) * window.innerHeight;
        if (iceboxText) {
          iceboxText.style.display = 'block';
          iceboxText.style.left = `${x}px`;
          iceboxText.style.top = `${y}px`;
        }
      } else {
        if (iceboxText) iceboxText.style.display = 'none';
      }
    } else {
      if (iceboxText) iceboxText.style.display = 'none';
    }
  }

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
