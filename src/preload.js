const { contextBridge, ipcRenderer } = require('electron');

// 렌더러 프로세스에서 사용할 API 노출
contextBridge.exposeInMainWorld('electronAPI', {
    // PDF 파일 읽기
    readPdfFile: (filePath) => ipcRenderer.invoke('read-pdf-file', filePath),

    // PDF 로드 이벤트 리스너
    onLoadPdf: (callback) => {
        ipcRenderer.on('load-pdf', (event, filePath) => {
            callback(filePath);
        });
    },

    // 이벤트 리스너 제거
    removeAllListeners: (channel) => {
        ipcRenderer.removeAllListeners(channel);
    }
});