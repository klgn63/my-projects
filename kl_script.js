document.addEventListener('DOMContentLoaded', () => {
  const cards = document.querySelectorAll('.bg_card');
  const container = document.querySelector('.card_container');
  const indicatorContainer = document.getElementById('indicators');
  const themeToggle = document.getElementById('themeToggle');
  const bat = document.getElementById('bat');
  let currentIndex = 0;

  // ===========================
  // 박쥐 새총 (물리 엔진 + 정확히 맞춰야 토글)
  // ===========================
  let isPullingBat = false;
  let pullOriginX = 0;
  let pullOriginY = 0;

  // 박쥐 DOM의 절대 좌표 중심점 (발사 시작점)
  function getBatCenter() {
    const rect = bat.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  }

  function getToggleCenter() {
    const rect = themeToggle.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  }

  bat.addEventListener('mousedown', (e) => {
    isPullingBat = true;
    // 당기기 시작 지점을 박쥐 원래 중심으로 저장
    const center = getBatCenter();
    pullOriginX = center.x;
    pullOriginY = center.y;
    bat.style.transition = 'none';
    bat.style.cursor = 'grabbing';
    e.preventDefault();
    e.stopPropagation();
  });

  document.addEventListener('mousemove', (e) => {
    if (!isPullingBat) return;
    // 마우스가 원점에서 얼마나 당겼는지
    const dx = e.clientX - pullOriginX;
    const dy = e.clientY - pullOriginY;
    // 최대 당기기 거리 제한 (고무줄 느낌)
    const maxPull = 120;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const clampedDx = dist > maxPull ? dx * (maxPull / dist) : dx;
    const clampedDy = dist > maxPull ? dy * (maxPull / dist) : dy;
    bat.style.transform = `translate(${clampedDx}px, ${clampedDy}px) rotate(${clampedDx * 0.3}deg) scale(${1 + dist * 0.003})`;
  });

  document.addEventListener('mouseup', (e) => {
    if (!isPullingBat) return;
    isPullingBat = false;
    bat.style.cursor = 'grab';

    const dx = e.clientX - pullOriginX;
    const dy = e.clientY - pullOriginY;
    const dist = Math.sqrt(dx * dx + dy * dy);

    // 최소 당기기 거리 체크
    if (dist < 40) {
      bat.style.transition = 'transform 0.3s ease-out';
      bat.style.transform = 'translate(0,0) rotate(0deg) scale(1)';
      return;
    }

    // 발사! 반대 방향으로 박쥐를 날림 (당긴 방향의 반대)
    const speed = Math.min(dist, 120); // 최대 속도 제한
    const vx = -(dx / dist) * speed * 6;
    const vy = -(dy / dist) * speed * 6;

    // 박쥐 DOM을 fixed로 바꿔서 화면에서 날아다니게 함
    const startRect = bat.getBoundingClientRect();

    // 화면 위에 떠있는 "발사체" 박쥐 생성
    const flyingBat = document.createElement('div');
    flyingBat.textContent = '🦇';
    flyingBat.style.cssText = `
      position: fixed;
      font-size: 32px;
      left: ${startRect.left}px;
      top: ${startRect.top}px;
      z-index: 9999;
      pointer-events: none;
      transition: none;
      transform-origin: center;
    `;
    document.body.appendChild(flyingBat);

    // 원래 박쥐는 원위치
    bat.style.transition = 'transform 0.3s ease-out';
    bat.style.transform = 'translate(0,0) rotate(0deg) scale(1)';

    // 물리 시뮬레이션
    let posX = startRect.left;
    let posY = startRect.top;
    let velX = vx;
    let velY = vy;
    const gravity = 0.8;
    let frame = 0;
    let hit = false;

    const toggleCenter = getToggleCenter();

    function animate() {
      if (hit) return;
      velY += gravity;
      posX += velX * 0.05;
      posY += velY * 0.05;
      frame++;

      flyingBat.style.left = posX + 'px';
      flyingBat.style.top = posY + 'px';
      flyingBat.style.transform = `rotate(${frame * (velX > 0 ? 15 : -15)}deg)`;

      // 화면 밖으로 나가면 제거 (실패)
      if (posX < -100 || posX > window.innerWidth + 100 || posY > window.innerHeight + 100) {
        flyingBat.remove();
        // 빗나감 표시
        showMissEffect();
        return;
      }

      // 버튼과의 충돌 판정 (반지름 28px 이내)
      const distToBtn = Math.sqrt(
        Math.pow(posX - toggleCenter.x, 2) + Math.pow(posY - toggleCenter.y, 2)
      );

      if (distToBtn < 28) {
        hit = true;
        flyingBat.remove();
        // 명중!
        themeToggle.classList.add('hit');
        document.body.classList.toggle('dark-mode');
        themeToggle.textContent = document.body.classList.contains('dark-mode') ? '☀️' : '🌙';
        showHitEffect(toggleCenter.x, toggleCenter.y);
        setTimeout(() => themeToggle.classList.remove('hit'), 300);
        return;
      }

      requestAnimationFrame(animate);
    }

    requestAnimationFrame(animate);
  });

  // 명중 이펙트 (반짝임 파티클)
  function showHitEffect(x, y) {
    for (let i = 0; i < 10; i++) {
      const star = document.createElement('div');
      star.textContent = ['💥','⭐','✨','🌟'][Math.floor(Math.random() * 4)];
      star.style.cssText = `
        position: fixed; font-size: 20px; left: ${x}px; top: ${y}px; z-index: 9999;
        pointer-events: none; transition: all 0.6s ease-out;
        transform: translate(-50%, -50%);
      `;
      document.body.appendChild(star);
      setTimeout(() => {
        star.style.transform = `translate(${(Math.random()-0.5)*120}px, ${(Math.random()-0.5)*120}px) scale(0)`;
        star.style.opacity = '0';
      }, 20);
      setTimeout(() => star.remove(), 700);
    }
  }

  // 빗나감 이펙트
  function showMissEffect() {
    const miss = document.createElement('div');
    miss.textContent = '빗나감! 다시 노려봐 🎯';
    miss.style.cssText = `
      position: fixed; top: 80px; right: 30px; background: #ef4444;
      color: white; padding: 8px 16px; border-radius: 8px; z-index: 9999;
      font-size: 14px; font-weight: bold; font-family: 'Inter', sans-serif;
      animation: slideInOut 1.5s ease forwards;
    `;
    document.body.appendChild(miss);
    setTimeout(() => miss.remove(), 1500);
  }

  // 미스 애니메이션 키프레임을 동적으로 삽입
  if (!document.getElementById('miss-keyframes')) {
    const style = document.createElement('style');
    style.id = 'miss-keyframes';
    style.textContent = `
      @keyframes slideInOut {
        0% { opacity: 0; transform: translateX(20px); }
        20% { opacity: 1; transform: translateX(0); }
        80% { opacity: 1; transform: translateX(0); }
        100% { opacity: 0; transform: translateX(20px); }
      }
    `;
    document.head.appendChild(style);
  }

  // ===========================
  // 캐러셀 인디케이터 생성
  // ===========================
  cards.forEach((_, i) => {
    const dot = document.createElement('button');
    dot.classList.add('dot');
    dot.addEventListener('click', () => {
      currentIndex = i;
      updateCarousel();
    });
    indicatorContainer.appendChild(dot);
  });

  function updateCarousel() {
    cards.forEach((card, index) => {
      card.classList.remove('active', 'prev', 'next', 'hidden-left', 'hidden-right');
      if (index === currentIndex) card.classList.add('active');
      else if (index === currentIndex - 1) card.classList.add('prev');
      else if (index === currentIndex + 1) card.classList.add('next');
      else if (index < currentIndex) card.classList.add('hidden-left');
      else card.classList.add('hidden-right');
    });
    const dots = indicatorContainer.querySelectorAll('.dot');
    dots.forEach((dot, i) => dot.classList.toggle('active', i === currentIndex));
  }

  // 측면 카드 클릭 이동
  cards.forEach((card) => {
    card.addEventListener('click', (e) => {
      if (card.classList.contains('prev')) { e.preventDefault(); currentIndex--; updateCarousel(); }
      else if (card.classList.contains('next')) { e.preventDefault(); currentIndex++; updateCarousel(); }
    });
  });

  // 마우스 드래그
  let isDragging = false;
  let startX = 0;
  const dragThreshold = 150;

  container.addEventListener('mousedown', (e) => { isDragging = true; startX = e.clientX; });
  container.addEventListener('mouseup', (e) => {
    if (!isDragging) return;
    isDragging = false;
    const deltaX = e.clientX - startX;
    if (deltaX < -dragThreshold && currentIndex < cards.length - 1) { currentIndex++; updateCarousel(); }
    else if (deltaX > dragThreshold && currentIndex > 0) { currentIndex--; updateCarousel(); }
  });
  container.addEventListener('mouseleave', () => { isDragging = false; });

  // 마우스 휠 (가로/세로)
  let wheelCooldown = false;
  container.addEventListener('wheel', (e) => {
    if (wheelCooldown) { e.preventDefault(); return; }
    const isHorizontal = Math.abs(e.deltaX) > Math.abs(e.deltaY);
    const delta = isHorizontal ? e.deltaX : e.deltaY;
    if (delta > 30 && currentIndex < cards.length - 1) {
      currentIndex++; updateCarousel();
      wheelCooldown = true; setTimeout(() => { wheelCooldown = false; }, 600);
    } else if (delta < -30 && currentIndex > 0) {
      currentIndex--; updateCarousel();
      wheelCooldown = true; setTimeout(() => { wheelCooldown = false; }, 600);
    }
    e.preventDefault();
  }, { passive: false });

  // 키보드 화살표
  document.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight' && currentIndex < cards.length - 1) { currentIndex++; updateCarousel(); }
    else if (e.key === 'ArrowLeft' && currentIndex > 0) { currentIndex--; updateCarousel(); }
  });

  updateCarousel();
});
