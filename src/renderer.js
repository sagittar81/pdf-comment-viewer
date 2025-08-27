// PDF.js 워커 설정
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

// 전역 변수
let pdfDoc = null;
let pageNum = 1;
let pageCount = 0;
let scale = 1.5;
let rendering = false;
let pageRendering = false;
let pageNumPending = null;

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
        scale = Math.min(Math.max(0.5, scale + delta), 5.0); // 최소 0.5x ~ 최대 5x

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

        console.log('PDF 로드 완료:', {
            pages: pageCount,
            filename: filename
        });

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
        console.log(`페이지 ${num}: 주석 분석 시작...`);
        await renderAnnotations(page, viewport, annotationLayer);

    } catch (error) {
        if (error.name !== 'RenderingCancelledException') {
            console.error(`페이지 ${num} 렌더링 오류:`, error);
        }
    }
}

// 간단한 주석 렌더링 함수 - ChatGPT 방식 적용
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

        // 간단하게 주석 가져오기 (ChatGPT 방식)
        const annotations = await page.getAnnotations();

        console.log(`페이지 ${page.pageNumber}: ${annotations.length}개 주석 발견`);

        if (annotations.length === 0) {
            return;
        }

        // 답글 관계 매핑
        const repliesByParent = {};
        annotations.forEach(ann => {
            if (ann.replyTo) {
                if (!repliesByParent[ann.replyTo]) repliesByParent[ann.replyTo] = [];
                repliesByParent[ann.replyTo].push(ann);
            }
        });

        // 중복 주석 필터링 (modificationDate 기준)
        const renderedModificationDates = new Set();

        annotations.forEach(annotation => {
            // Popup이나 답글은 건너뛰기
            if (annotation.replyTo || annotation.subtype === 'Popup') return;

            // 중복 modificationDate 건너뛰기
            const modDate = annotation.modificationDate;
            if (modDate && renderedModificationDates.has(modDate)) return;
            if (modDate) renderedModificationDates.add(modDate);

            // rect 정보가 없으면 건너뛰기
            if (!annotation.rect) return;

            console.log('주석 정보:', {
                type: annotation.subtype,
                contents: annotation.contents,
                rect: annotation.rect,
                modDate: modDate
            });

            // 주석 렌더링
            renderSingleAnnotation(annotation, repliesByParent, viewport, annotationLayer);
        });

        // 주석 개수 표시
        const uniqueCount = renderedModificationDates.size;
        if (uniqueCount > 0) {
            addAnnotationCounter(annotationLayer, uniqueCount);
        }

    } catch (error) {
        console.error('주석 렌더링 오류:', error);
        addTestAnnotation(annotationLayer, viewport);
    }
}

// 개별 주석 렌더링
function renderSingleAnnotation(annotation, repliesByParent, viewport, annotationLayer) {
    try {
        if (annotation.subtype === 'StrikeOut' && annotation.quadPoints) {
            annotation.quadPoints.forEach(quad => {
                // quadPoints 는 [x1, y1, x2, y2, x3, y3, x4, y4] 형태
                const [x1, y1, x2, y2, x3, y3, x4, y4] = quad;

                // viewport 좌표로 변환
                const [vx1, vy1] = viewport.convertToViewportPoint(x1, y1);
                const [vx2, vy2] = viewport.convertToViewportPoint(x2, y2);
                const [vx3, vy3] = viewport.convertToViewportPoint(x3, y3);
                const [vx4, vy4] = viewport.convertToViewportPoint(x4, y4);

                // strikeout 영역 계산 (y 중앙)
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
            //return; // StrikeOut은 여기서 끝
        }
        // 기본 내용 - 객체 처리 개선
        let baseContent = annotation.contents || annotation.richText || '';

        // 객체인 경우 적절히 파싱
        if (typeof baseContent === 'object' && baseContent !== null) {
            if (baseContent.str) {
                // PDF.js의 텍스트 객체인 경우
                baseContent = baseContent.str;
            } else if (baseContent.text) {
                // 일반적인 text 속성
                baseContent = baseContent.text;
            } else if (baseContent.content) {
                // content 속성
                baseContent = baseContent.content;
            } else if (Array.isArray(baseContent)) {
                // 배열인 경우 합치기
                baseContent = baseContent.map(item =>
                    typeof item === 'string' ? item : (item.str || item.text || String(item))
                ).join(' ');
            } else {
                // 기타 객체는 JSON으로 변환 후 읽기 쉽게 정리
                try {
                    const jsonStr = JSON.stringify(baseContent);
                    // 간단한 객체면 키-값 형태로 표시
                    if (jsonStr.length < 200) {
                        baseContent = Object.entries(baseContent)
                            .filter(([key, value]) => value && key !== 'rect' && key !== 'id')
                            .map(([key, value]) => `${key}: ${value}`)
                            .join(', ');
                    } else {
                        baseContent = `${annotation.subtype || 'Unknown'} 주석 (복합 데이터)`;
                    }
                } catch (e) {
                    baseContent = `${annotation.subtype || 'Unknown'} 주석`;
                }
            }
        }

        // 문자열이 아닌 경우 문자열로 변환
        if (typeof baseContent !== 'string') {
            baseContent = String(baseContent || '');
        }

        if (!baseContent || baseContent.trim() === '') {
            baseContent = `${annotation.subtype || 'Unknown'} 주석`;
        }

        // 답글 내용 - 객체 처리 개선
        const replies = repliesByParent[annotation.id] || [];
        const replyContents = replies
            .map(r => {
                let content = r.contents || r.richText || '';

                // 객체인 경우 적절히 파싱
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
                        content = `답글 (${r.subtype || 'Reply'})`;
                    }
                }

                // 문자열이 아닌 경우 문자열로 변환
                if (typeof content !== 'string') {
                    content = String(content || '');
                }

                return content;
            })
            .filter(content => content && content.trim() !== '');

        // 전체 내용 조합
        const allContent = [baseContent, ...replyContents.map(r => `↪️ ${r.trim()}`)];
        const fullContent = allContent.join('\n');

        // 좌표 변환
        const [x1, y1, x2, y2] = annotation.rect;
        const [vx1, vy1] = viewport.convertToViewportPoint(x1, y1);
        const [vx2, vy2] = viewport.convertToViewportPoint(x2, y2);

        const x = vx1;
        const y = (vy1 + vy2) / 2;

        // 화면 범위 벗어나면 건너뛰기
        if (x < 0 || x > viewport.width || y < 0 || y > viewport.height) return;

        // 주석 팝업 생성
        const popup = document.createElement('div');
        popup.className = 'annotation-popup';
        popup.textContent = fullContent;

        // 스타일 설정
        popup.style.backgroundColor = 'rgba(255, 255, 255, 0.4)';
        popup.style.color = 'rgba(255, 0, 0, 1)';
        popup.style.border = '1px solid red';
        popup.style.borderRadius = '4px';
        popup.style.padding = '8px';
        popup.style.position = 'absolute';
        popup.style.left = `${x}px`;
        popup.style.top = `${y - 10}px`;
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
        console.error('개별 주석 렌더링 오류:', error);
    }
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
    scale = Math.min(scale * 1.2, 3.0);
    updateZoom();
}

function zoomOut() {
    scale = Math.max(scale / 1.2, 0.3);
    updateZoom();
}

function actualSize() {
    scale = 1.0;
    updateZoom();
}

function fitToWidth() {
    const container = pdfViewer;
    const containerWidth = container.clientWidth - 40;

    if (pdfDoc) {
        // 현재 페이지 상태 저장
        const currentPage = pageNum;

        pdfDoc.getPage(1).then(page => {
            const viewport = page.getViewport({ scale: 1.0 });
            const newScale = Math.min(containerWidth / viewport.width, 2.0);

            // 스케일이 실제로 변경된 경우만 업데이트
            if (Math.abs(scale - newScale) > 0.01) {
                scale = newScale;
                updateZoom();
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

// 줌 업데이트 - 현재 스크롤 위치 기준으로 유지
async function updateZoom() {
    showLoadingOverlay();
    if (!pdfDoc) return;

    // 현재 상태 저장
    const currentPage = pageNum;
    const currentScrollTop = pdfViewer.scrollTop;
    const currentScrollLeft = pdfViewer.scrollLeft;

    // 현재 보고 있는 페이지 요소의 상대적 위치 계산
    const currentPageElement = document.getElementById(`page-${currentPage}`);
    let relativeScrollPosition = 0;

    if (currentPageElement) {
        const pageRect = currentPageElement.getBoundingClientRect();
        const viewerRect = pdfViewer.getBoundingClientRect();
        relativeScrollPosition = pageRect.top - viewerRect.top;
    }

    // 줌 레벨 표시 업데이트
    zoomLevel.textContent = Math.round(scale * 100) + '%';

    // 스크롤 이벤트 임시 비활성화
    pdfViewer.removeEventListener('scroll', handleScroll);

    // 모든 페이지 다시 렌더링
    await renderAllPages();

    // 렌더링 완료 후 위치 복원
    setTimeout(() => {
        const newPageElement = document.getElementById(`page-${currentPage}`);
        if (newPageElement) {
            // 새로운 스케일에 맞춰 스크롤 위치 조정
            const newScrollTop = newPageElement.offsetTop + relativeScrollPosition - 20;

            pdfViewer.scrollTo({
                top: Math.max(0, newScrollTop),
                left: currentScrollLeft,
                behavior: 'auto'
            });
        }

        // 페이지 정보 복원
        pageNum = currentPage;
        updateActiveThumbnail();
        updatePageInfo();

        // 스크롤 이벤트 다시 활성화
        setTimeout(() => {
            pdfViewer.addEventListener('scroll', handleScroll);
        }, 200);

    }, 150); // 렌더링 안정화를 위한 지연
    hideLoadingOverlay();
}

// 스크롤 핸들러 함수 분리
function handleScroll() {
    if (scrollTimeout) {
        clearTimeout(scrollTimeout);
    }

    scrollTimeout = setTimeout(() => {
        updateCurrentPageFromScroll();
    }, 100);
}

// Cmd+A: 현재 주석만 전체 선택 (ChatGPT 방식)
document.addEventListener('keydown', e => {
    const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
    const isSelectAll = (isMac && e.metaKey && e.key === 'a') || (!isMac && e.ctrlKey && e.key === 'a');

    if (!isSelectAll) return;

    const selection = window.getSelection();
    const active = document.activeElement;

    // 사용자가 이미 일부 텍스트를 선택한 경우 기본 동작 유지
    if (selection && selection.type === 'Range' && selection.toString().length > 0) {
        return;
    }

    // 현재 주석만 전체 선택
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
    // Cmd+A는 위에서 별도 처리
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

// 스크롤 이벤트로 현재 페이지 추적 - 핸들러 함수 사용
let scrollTimeout;
pdfViewer.addEventListener('scroll', handleScroll);

// 스크롤 위치에 따른 현재 페이지 업데이트
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
    console.log('간단한 PDF 주석 뷰어 초기화 완료');
});