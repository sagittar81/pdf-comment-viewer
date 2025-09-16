// PDF.js 워커 설정
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

// 전역 변수
let pdfDoc = null;
let pageNum = 1;
let pageCount = 0;
let scale = 1.2;
let rendering = false;
let pageRendering = false;
let pageNumPending = null;
let currentZoom = 1.2;

// DOM 요소들
const sidebar = document.getElementById('sidebar');
const welcomeScreen = document.getElementById('welcomeScreen');
const pdfViewer = document.getElementById('pdfViewer');
const mainToolbar = document.getElementById('mainToolbar');
const fileInfo = document.getElementById('fileInfo');
const fileName = document.getElementById('fileName');
const fileDetails = document.getElementById('fileDetails');
const thumbnails = document.getElementById('thumbnails');
const pageInfo = document.getElementById('pageInfo');
const zoomLevel = document.getElementById('zoomLevel');
const dragDropArea = document.getElementById('dragDropArea');

// 파일 드래그 앤 드롭 핸들러
document.addEventListener('dragover', (e) => {
  e.preventDefault();
  dragDropArea.classList.add('active');
});

document.addEventListener('dragleave', (e) => {
  if (e.clientX === 0 && e.clientY === 0) {
    dragDropArea.classList.remove('active');
  }
});

document.addEventListener('drop', (e) => {
  e.preventDefault();
  dragDropArea.classList.remove('active');

  const files = e.dataTransfer.files;
  if (files.length > 0 && files[0].type === 'application/pdf') {
    loadPdfFromFile(files[0]);
  }
});

document.addEventListener('wheel', (event) => {
  if (event.ctrlKey) { // pinch 제스처 감지
    event.preventDefault();
    const delta = event.deltaY > 0 ? -0.1 : 0.1;
    scale = Math.min(Math.max(0.5, currentZoom + delta), 5.0); // 최소 0.5x ~ 최대 5x

    // PDF.js render 다시 호출
    renderPage(currentPage, scale);
  }
}, { passive: false });

// Electron API 이벤트 리스너
if (window.electronAPI) {
  window.electronAPI.onLoadPdf(async (filePath) => {
    const result = await window.electronAPI.readPdfFile(filePath);
    if (result.success) {
      const uint8Array = new Uint8Array(
        atob(result.data)
          .split('')
          .map(char => char.charCodeAt(0))
      );
      loadPdf(uint8Array, result.fileName);
    } else {
      alert('파일을 읽을 수 없습니다: ' + result.error);
    }
  });
}

// 파일 열기 함수
async function openFile() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.pdf';
  input.onchange = (e) => {
    const file = e.target.files[0];
    if (file) {
      loadPdfFromFile(file);
    }
  };
  input.click();
}

// 파일에서 PDF 로드
async function loadPdfFromFile(file) {
  const arrayBuffer = await file.arrayBuffer();
  const uint8Array = new Uint8Array(arrayBuffer);
  loadPdf(uint8Array, file.name);
}

// PDF 로드 함수 - 간단한 방식
async function loadPdf(data, filename) {
  try {
    // 로딩 표시
    pdfViewer.innerHTML = '<div class="loading">PDF를 로딩 중...</div>';

    // 간단한 PDF 로딩
    pdfDoc = await pdfjsLib.getDocument(data).promise;
    pageCount = pdfDoc.numPages;

    // UI 업데이트
    welcomeScreen.style.display = 'none';
    mainToolbar.style.display = 'flex';
    fileInfo.style.display = 'block';

    // 파일 정보 표시
    fileName.textContent = filename;
    fileDetails.textContent = `${pageCount} 페이지`;

    // 첫 페이지 렌더링
    pageNum = 1;
    await renderAllPages();
    await generateThumbnails();
    updatePageInfo();

  } catch (error) {
    console.error('PDF 로드 오류:', error);
    alert('PDF 파일을 로드할 수 없습니다: ' + error.message);
  }
}

// 모든 페이지 렌더링
async function renderAllPages() {
  pdfViewer.innerHTML = '';

  for (let num = 1; num <= pageCount; num++) {
    const pageContainer = document.createElement('div');
    pageContainer.className = 'pdf-page';
    pageContainer.id = `page-${num}`;

    const canvas = document.createElement('canvas');
    const annotationLayer = document.createElement('div');
    annotationLayer.className = 'annotation-layer';

    pageContainer.appendChild(canvas);
    pageContainer.appendChild(annotationLayer);
    pdfViewer.appendChild(pageContainer);

    await renderPage(num, canvas, annotationLayer);
  }
}

// 개별 페이지 렌더링 - 간단한 방식
async function renderPage(num, canvas, annotationLayer) {
  try {
    const page = await pdfDoc.getPage(num);
    const viewport = page.getViewport({ scale: scale });

    const context = canvas.getContext('2d');
    canvas.height = viewport.height;
    canvas.width = viewport.width;

    // 기존 렌더링 취소
    if (canvas.renderTask) {
      canvas.renderTask.cancel();
    }

    // 페이지 렌더링
    const renderContext = {
      canvasContext: context,
      viewport: viewport
    };

    canvas.renderTask = page.render(renderContext);
    await canvas.renderTask.promise;

    // 주석 레이어 설정
    annotationLayer.style.width = viewport.width + 'px';
    annotationLayer.style.height = viewport.height + 'px';

    // 간단한 주석 렌더링
    await renderAnnotations(page, viewport, annotationLayer);

  } catch (error) {
    if (error.name !== 'RenderingCancelledException') {
      console.error(`페이지 ${num} 렌더링 오류:`, error);
    }
  }
}

// 간단한 주석 렌더링 함수
async function renderAnnotations(page, viewport, annotationLayer) {
  try {
    annotationLayer.innerHTML = '';

    // 주석 레이어 기본 설정
    annotationLayer.style.width = viewport.width + 'px';
    annotationLayer.style.height = viewport.height + 'px';
    annotationLayer.style.position = 'absolute';
    annotationLayer.style.top = '0px';
    annotationLayer.style.left = '0px';
    annotationLayer.style.pointerEvents = 'none';
    annotationLayer.style.zIndex = '10';

    // 주석 가져오기
    const annotations = await page.getAnnotations();
    console.log('모든 주석:', annotations);

    if (annotations.length === 0) {
      return;
    }

    // modificationDate 기준으로 주석들을 그룹핑
    const annotationsByModDate = {};
    annotations.forEach(ann => {
      console.log('주석 정보:', {
        id: ann.id,
        subtype: ann.subtype,
        contents: ann.contents,
        richText: ann.richText,
        modificationDate: ann.modificationDate
      });

      const modDate = ann.modificationDate;
      if (modDate) {
        if (!annotationsByModDate[modDate]) {
          annotationsByModDate[modDate] = [];
        }
        annotationsByModDate[modDate].push(ann);
      }
    });

    console.log('modificationDate별 그룹핑:', annotationsByModDate);

    // 중복 주석 필터링 및 렌더링
    const renderedModificationDates = new Set();

    Object.entries(annotationsByModDate).forEach(([modDate, annotationGroup]) => {
      if (renderedModificationDates.has(modDate)) return;
      renderedModificationDates.add(modDate);

      // 그룹에서 메인 주석 찾기 (보통 Popup이 아닌 첫 번째)
      const mainAnnotation = annotationGroup.find(ann => ann.subtype !== 'Popup') || annotationGroup[0];

      if (!mainAnnotation || !mainAnnotation.rect) return;

      console.log(`그룹 처리: ${modDate}`, annotationGroup);

      // 주석 그룹 렌더링
      renderAnnotationGroup(mainAnnotation, annotationGroup, viewport, annotationLayer);
    });

    // 주석 개수 표시
    const uniqueCount = renderedModificationDates.size;
    if (uniqueCount > 0) {
      addAnnotationCounter(annotationLayer, uniqueCount);
    }

  } catch (error) {
    console.error('주석 렌더링 오류:', error);
  }
}

// 주석 그룹 렌더링 함수
function renderAnnotationGroup(mainAnnotation, annotationGroup, viewport, annotationLayer) {
  console.log('주석 그룹 렌더링:', mainAnnotation, annotationGroup);

  try {
    // StrikeOut 주석의 선 그리기
    if (mainAnnotation.subtype === 'StrikeOut' && mainAnnotation.quadPoints) {
      mainAnnotation.quadPoints.forEach(quad => {
        const [x1, y1, x3, y3] = quad;
        const [vx1, vy1] = viewport.convertToViewportPoint(x1, y1);
        const [vx3, vy3] = viewport.convertToViewportPoint(x3, y3);

        // strikeout 선 그리기
        const strikeDiv = document.createElement('div');
        strikeDiv.style.position = 'absolute';
        strikeDiv.style.left = `${Math.min(vx1, vx3)}px`;
        strikeDiv.style.top = `${(vy1 + vy3) / 2}px`;
        strikeDiv.style.width = `${Math.abs(vx1 - vx3)}px`;
        strikeDiv.style.height = '2px';
        strikeDiv.style.backgroundColor = 'red';
        strikeDiv.style.zIndex = '12';
        annotationLayer.appendChild(strikeDiv);
      });
    }

    // 메인 주석 내용 처리
    let baseContent = getAnnotationContent(mainAnnotation);
    if (!baseContent || baseContent.trim() === '') {
      baseContent = `${mainAnnotation.subtype || 'Unknown'} 주석`;
    }

    // 같은 그룹의 다른 주석들 내용 수집 (내부 주석들)
    const otherAnnotations = annotationGroup.filter(ann =>
      ann !== mainAnnotation &&
      ann.subtype !== 'Popup'
    );

    const otherContents = otherAnnotations
      .map(ann => getAnnotationContent(ann))
      .filter(content => content && content.trim() !== '');

    // 전체 내용 조합
    let fullContent = baseContent;
    if (otherContents.length > 0) {
      fullContent = `${baseContent}\n내부 주석: ${otherContents.join(', ')}`;
    }

    console.log('최종 내용:', fullContent);

    // 팝업 생성
    const [x1, y1, x2, y2] = mainAnnotation.rect;
    const [vx1, vy1] = viewport.convertToViewportPoint(x1, y1);
    const [vx2, vy2] = viewport.convertToViewportPoint(x2, y2);

    const popup = document.createElement('div');
    popup.className = 'annotation-popup';
    popup.textContent = fullContent;

    // 스타일 설정
    popup.style.backgroundColor = 'rgba(255,255,255,0.9)';
    popup.style.color = mainAnnotation.subtype === 'StrikeOut' ? 'blue' : 'red';
    popup.style.border = `1px solid ${mainAnnotation.subtype === 'StrikeOut' ? 'blue' : 'red'}`;
    popup.style.borderRadius = '4px';
    popup.style.padding = '8px';
    popup.style.position = 'absolute';
    popup.style.left = `${vx1}px`;
    popup.style.top = `${vy1 - 10}px`;
    popup.style.transform = 'translateY(-100%)';
    popup.style.pointerEvents = 'auto';
    popup.style.userSelect = 'text';
    popup.style.whiteSpace = 'pre-line';
    popup.style.zIndex = '15';
    popup.style.cursor = 'grab';
    popup.style.fontSize = '12px';
    popup.style.maxWidth = '200px';
    popup.style.wordWrap = 'break-word';
    popup.style.boxShadow = '0 2px 8px rgba(0,0,0,0.2)';
    popup.setAttribute('tabindex', '0');

    // 드래그 기능 추가
    addDragFunctionality(popup);

    // 클릭 이벤트
    popup.addEventListener('click', function () {
      document.querySelectorAll('.annotation-popup').forEach(el => {
        el.style.zIndex = '15';
      });
      popup.style.zIndex = '20';
      popup.focus();
    });

    annotationLayer.appendChild(popup);

  } catch (error) {
    console.error('주석 그룹 렌더링 오류:', error);
  }
}

// 주석 내용 추출 함수
function getAnnotationContent(annotation) {
  let content = annotation.contents || annotation.richText || '';

  if (typeof content === 'object' && content !== null) {
    if (content.str) {
      content = content.str;
    } else if (content.text) {
      content = content.text;
    } else if (content.content) {
      content = content.content;
    } else if (Array.isArray(content)) {
      content = content.map(item =>
        typeof item === 'string' ? item : (item.str || item.text || String(item))
      ).join(' ');
    } else {
      content = `${annotation.subtype || 'Unknown'} 주석`;
    }
  }

  if (typeof content !== 'string') {
    content = String(content || '');
  }

  return content;
}

// 드래그 기능 추가
function addDragFunctionality(popup) {
  let offsetX, offsetY, isDragging = false;
  let dragStartedInsideSelection = false;

  popup.addEventListener('mousedown', function (e) {
    const selection = window.getSelection();
    if (selection && selection.toString().length > 0) {
      dragStartedInsideSelection = true;
      return;
    }

    isDragging = true;
    offsetX = e.clientX - popup.offsetLeft;
    offsetY = e.clientY - popup.offsetTop;
    popup.style.cursor = 'grabbing';
  });

  document.addEventListener('mousemove', function (e) {
    if (!isDragging || dragStartedInsideSelection) return;
    popup.style.left = `${e.clientX - offsetX}px`;
    popup.style.top = `${e.clientY - offsetY}px`;
  });

  document.addEventListener('mouseup', function () {
    if (isDragging) {
      isDragging = false;
      dragStartedInsideSelection = false;
      popup.style.cursor = 'grab';
    }
  });
}

// 주석 개수 카운터 추가
function addAnnotationCounter(annotationLayer, count) {
  const countLabel = document.createElement('div');
  countLabel.textContent = `주석 개수: ${count}`;
  countLabel.style.position = 'absolute';
  countLabel.style.top = '8px';
  countLabel.style.right = '12px';
  countLabel.style.backgroundColor = 'rgba(255,255,255,0.9)';
  countLabel.style.padding = '4px 8px';
  countLabel.style.borderRadius = '8px';
  countLabel.style.fontWeight = 'bold';
  countLabel.style.color = 'red';
  countLabel.style.fontSize = '12px';
  countLabel.style.zIndex = '20';
  countLabel.style.border = '1px solid #ccc';
  annotationLayer.appendChild(countLabel);
}

// 썸네일 생성
async function generateThumbnails() {
  thumbnails.innerHTML = '';

  for (let num = 1; num <= pageCount; num++) {
    const thumbnailContainer = document.createElement('div');
    thumbnailContainer.className = 'thumbnail';
    if (num === pageNum) {
      thumbnailContainer.classList.add('active');
    }

    const canvas = document.createElement('canvas');
    const page = await pdfDoc.getPage(num);
    const viewport = page.getViewport({ scale: 0.2 });

    const context = canvas.getContext('2d');
    canvas.height = viewport.height;
    canvas.width = viewport.width;

    const renderContext = {
      canvasContext: context,
      viewport: viewport
    };

    await page.render(renderContext).promise;

    thumbnailContainer.appendChild(canvas);
    thumbnailContainer.addEventListener('click', () => {
      goToPage(num);
    });

    thumbnails.appendChild(thumbnailContainer);
  }
}

// 페이지 이동
function goToPage(num) {
  if (num < 1 || num > pageCount) return;

  pageNum = num;
  updateActiveThumbnail();
  updatePageInfo();

  const pageElement = document.getElementById(`page-${num}`);
  if (pageElement) {
    const viewerRect = pdfViewer.getBoundingClientRect();
    const pageRect = pageElement.getBoundingClientRect();
    const scrollTop = pdfViewer.scrollTop + pageRect.top - viewerRect.top - 20;

    pdfViewer.scrollTo({
      top: scrollTop,
      behavior: 'smooth'
    });
  }
}

// 활성 썸네일 업데이트
function updateActiveThumbnail() {
  const thumbnailElements = document.querySelectorAll('.thumbnail');
  thumbnailElements.forEach((thumb, index) => {
    if (index + 1 === pageNum) {
      thumb.classList.add('active');
    } else {
      thumb.classList.remove('active');
    }
  });
}

// 페이지 정보 업데이트
function updatePageInfo() {
  pageInfo.textContent = `${pageNum} / ${pageCount}`;
}

// 줌 컨트롤
function zoomIn() {
  currentZoom = Math.min(currentZoom * 1.1, 5.0);
  applyZoom();
}

function zoomOut() {
  currentZoom = Math.max(currentZoom / 1.1, 0.3);
  applyZoom();
}

function actualSize() {
  currentZoom = 1.0;
  applyZoom();
}

function fitToWidth() {
  const container = pdfViewer;
  const containerWidth = container.clientWidth - 40;

  if (pdfDoc) {
    const currentPage = pageNum;

    pdfDoc.getPage(1).then(page => {
      const viewport = page.getViewport({ scale: 1.0 });
      const newScale = Math.min(containerWidth / viewport.width, 2.0);

      if (Math.abs(scale - newScale) > 0.01) {
        scale = newScale;
        applyZoom();
      }
    });
  }
}

function showLoadingOverlay(message = '📄 페이지 다시 로딩 중...') {
  const overlay = document.getElementById('loadingOverlay');
  overlay.textContent = message;
  overlay.style.visibility = 'visible';
}

function hideLoadingOverlay() {
  document.getElementById('loadingOverlay').style.visibility = 'hidden';
}

function applyZoom() {
  const pdfContainer = pdfViewer;
  const currentScrollLeft = pdfContainer.scrollLeft;
  const currentScrollTop = pdfContainer.scrollTop;

  const scrollLeftRatio = currentScrollLeft / (pdfContainer.scrollWidth - pdfContainer.clientWidth || 1);
  const scrollTopRatio = currentScrollTop / (pdfContainer.scrollHeight - pdfContainer.clientHeight || 1);

  const pages = document.querySelectorAll('.pdf-page');
  pages.forEach(page => {
    page.style.transform = `scale(${currentZoom})`;
    page.style.transformOrigin = 'top left';
    page.style.marginBottom = `${20 * currentZoom}px`;
  });

  if (typeof zoomLevel !== 'undefined') {
    zoomLevel.textContent = Math.round(currentZoom * 100) + '%';
  }

  requestAnimationFrame(() => {
    const newScrollWidth = pdfContainer.scrollWidth - pdfContainer.clientWidth;
    const newScrollHeight = pdfContainer.scrollHeight - pdfContainer.clientHeight;

    pdfContainer.scrollLeft = newScrollWidth * scrollLeftRatio;
    pdfContainer.scrollTop = newScrollHeight * scrollTopRatio;
  });
}

// Cmd+A: 현재 주석만 전체 선택
document.addEventListener('keydown', e => {
  const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
  const isSelectAll = (isMac && e.metaKey && e.key === 'a') || (!isMac && e.ctrlKey && e.key === 'a');

  if (!isSelectAll) return;

  const selection = window.getSelection();
  const active = document.activeElement;

  if (selection && selection.type === 'Range' && selection.toString().length > 0) {
    return;
  }

  if (active && active.classList.contains('annotation-popup')) {
    e.preventDefault();

    const range = document.createRange();
    range.selectNodeContents(active);
    selection.removeAllRanges();
    selection.addRange(range);
  }
});

// 키보드 단축키
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'a') return;

  if (e.ctrlKey || e.metaKey) {
    switch (e.key) {
      case '=':
      case '+':
        e.preventDefault();
        zoomIn();
        break;
      case '-':
        e.preventDefault();
        zoomOut();
        break;
      case '0':
        e.preventDefault();
        actualSize();
        break;
    }
  } else {
    switch (e.key) {
      case 'ArrowDown':
      case 'PageDown':
        e.preventDefault();
        goToPage(pageNum + 1);
        break;
      case 'ArrowUp':
      case 'PageUp':
        e.preventDefault();
        goToPage(pageNum - 1);
        break;
      case 'Home':
        e.preventDefault();
        goToPage(1);
        break;
      case 'End':
        e.preventDefault();
        goToPage(pageCount);
        break;
    }
  }
});

// 스크롤 이벤트로 현재 페이지 추적
let scrollTimeout;
pdfViewer.addEventListener('scroll', handleScroll);

function handleScroll() {
  if (scrollTimeout) {
    clearTimeout(scrollTimeout);
  }

  scrollTimeout = setTimeout(() => {
    updateCurrentPageFromScroll();
  }, 100);
}

function updateCurrentPageFromScroll() {
  const viewerRect = pdfViewer.getBoundingClientRect();
  const viewerCenter = viewerRect.top + viewerRect.height / 2;

  for (let num = 1; num <= pageCount; num++) {
    const pageElement = document.getElementById(`page-${num}`);
    if (pageElement) {
      const pageRect = pageElement.getBoundingClientRect();
      if (pageRect.top <= viewerCenter && pageRect.bottom >= viewerCenter) {
        if (pageNum !== num) {
          pageNum = num;
          updateActiveThumbnail();
          updatePageInfo();
        }
        break;
      }
    }
  }
}

// 초기화
document.addEventListener('DOMContentLoaded', () => {
  updatePageInfo();
  console.log('PDF 주석 뷰어 초기화 완료');
});