# PDF Viewer - Electron 기반 PDF 뷰어

주석 표시 기능을 포함한 macOS용 PDF 뷰어 애플리케이션입니다.

## 주요 기능

- ✅ PDF 파일 열기 및 표시
- ✅ 주석(Annotation) 표시 지원
- ✅ 썸네일 사이드바
- ✅ 줌 인/아웃 및 페이지 맞춤
- ✅ 키보드 단축키 지원
- ✅ 드래그 앤 드롭 파일 열기
- ✅ macOS 네이티브 메뉴
- ✅ DMG 배포 파일 생성

## 설치 및 실행

### 필요 조건
- Node.js 16 이상
- macOS (DMG 빌드용)

### 개발 환경 설정

```bash
# 저장소 클론
git clone <repository-url>
cd pdf-viewer-electron

# 의존성 설치
npm install

# 개발 모드 실행
npm run dev
```

### 빌드

```bash
# macOS DMG 빌드
npm run build:mac

# 또는 빌드 스크립트 사용
chmod +x build.sh
./build.sh
```

## 프로젝트 구조

```
src/
├── main.js          # 메인 프로세스
├── preload.js       # 프리로드 스크립트
├── renderer.html    # 렌더러 HTML
└── renderer.js      # 렌더러 스크립트
assets/
├── icon.icns        # macOS 앱 아이콘
└── dmg-background.png # DMG 배경 이미지
```

## 사용법

### 파일 열기
1. **메뉴**: File > Open PDF...
2. **드래그 앤 드롭**: PDF 파일을 앱 창에 드래그
3. **사이드바 버튼**: 좌측 사이드바의 "파일 열기" 버튼

### 키보드 단축키
- `Cmd/Ctrl + O`: 파일 열기
- `Cmd/Ctrl + =`: 줌 인
- `Cmd/Ctrl + -`: 줌 아웃
- `Cmd/Ctrl + 0`: 실제 크기
- `↑/↓`: 페이지 이동
- `Page Up/Page Down`: 페이지 이동
- `Home`: 첫 페이지로
- `End`: 마지막 페이지로

### 주석 기능
- PDF 내 주석이 자동으로 표시됩니다
- 주석 클릭 시 내용 확인 가능
- 하이라이트, 노트, 밑줄 등 다양한 주석 타입 지원

## 빌드 설정

### 아이콘 준비
macOS DMG 빌드를 위해 512x512 PNG 이미지를 준비한 후:

```bash
# 아이콘셋 폴더 생성
mkdir icon.iconset

# 다양한 크기 아이콘 생성 (PNG 원본에서)
sips -z 16 16 icon.png --out icon.iconset/icon_16x16.png
sips -z 32 32 icon.png --out icon.iconset/icon_16x16@2x.png
sips -z 32 32 icon.png --out icon.iconset/icon_32x32.png
sips -z 64 64 icon.png --out icon.iconset/icon_32x32@2x.png
sips -z 128 128 icon.png --out icon.iconset/icon_128x128.png
sips -z 256 256 icon.png --out icon.iconset/icon_128x128@2x.png
sips -z 256 256 icon.png --out icon.iconset/icon_256x256.png
sips -z 512 512 icon.png --out icon.iconset/icon_256x256@2x.png
sips -z 512 512 icon.png --out icon.iconset/icon_512x512.png
sips -z 1024 1024 icon.png --out icon.iconset/icon_512x512@2x.png

# ICNS 파일 생성
iconutil -c icns icon.iconset

# assets 폴더로 이동
mv icon.icns assets/
```

### DMG 배경 이미지 (선택사항)
- 배경 이미지: 540x380 PNG
- 파일명: `assets/dmg-background.png`

## 기술 스택

- **Electron**: 크로스 플랫폼 데스크톱 앱 프레임워크
- **PDF.js**: Mozilla의 PDF 렌더링 라이브러리
- **PDF-lib**: PDF 조작 라이브러리
- **electron-builder**: 앱 패키징 및 배포

## 라이센스

MIT License

## 기여

1. 이슈 생성
2. 기능 브랜치 생성
3. 변경사항 커밋
4. Pull Request 생성

## 문제해결

### 빌드 오류
- Node.js 버전 확인 (16 이상 필요)
- 의존성 재설치: `rm -rf node_modules package-lock.json && npm install`

### PDF 로딩 오류
- PDF 파일 손상 여부 확인
- 대용량 파일의 경우 메모리 부족 가능

### 주석이 표시되지 않음
- PDF 내 실제 주석 데이터 존재 여부 확인
- PDF 버전 호환성 확인