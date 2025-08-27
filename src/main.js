const { app, BrowserWindow, Menu, dialog, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow;

function createWindow() {
    // 메인 윈도우 생성
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js')
        },
        //titleBarStyle: 'hiddenInset', // macOS 스타일
        show: false,
        movable: true,
        frame: true
    });

    // HTML 파일 로드
    mainWindow.loadFile(path.join(__dirname, 'renderer.html'));

    // 윈도우가 준비되면 표시
    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
    });

    // 개발 모드에서 개발자 도구 열기
    if (process.argv.includes('--dev')) {
        mainWindow.webContents.openDevTools();
    }
}

// 메뉴 설정
function createMenu() {
    const template = [
        {
            label: 'File',
            submenu: [
                {
                    label: 'Open PDF...',
                    accelerator: 'CmdOrCtrl+O',
                    click: async () => {
                        const result = await dialog.showOpenDialog(mainWindow, {
                            properties: ['openFile'],
                            filters: [
                                { name: 'PDF Files', extensions: ['pdf'] }
                            ]
                        });

                        if (!result.canceled && result.filePaths.length > 0) {
                            const filePath = result.filePaths[0];
                            mainWindow.webContents.send('load-pdf', filePath);
                        }
                    }
                },
                { type: 'separator' },
                {
                    label: 'Quit',
                    accelerator: process.platform === 'darwin' ? 'Cmd+Q' : 'Ctrl+Q',
                    click: () => {
                        app.quit();
                    }
                }
            ]
        },
        {
            label: 'View',
            submenu: [
                { role: 'reload' },
                { role: 'forceReload' },
                { role: 'toggleDevTools' },
                { type: 'separator' },
                { role: 'resetZoom' },
                { role: 'zoomIn' },
                { role: 'zoomOut' },
                { type: 'separator' },
                { role: 'togglefullscreen' }
            ]
        },
        {
            label: 'Window',
            submenu: [
                { role: 'minimize' },
                { role: 'close' }
            ]
        }
    ];

    if (process.platform === 'darwin') {
        template.unshift({
            label: app.getName(),
            submenu: [
                { role: 'about' },
                { type: 'separator' },
                { role: 'services' },
                { type: 'separator' },
                { role: 'hide' },
                { role: 'hideOthers' },
                { role: 'unhide' },
                { type: 'separator' },
                { role: 'quit' }
            ]
        });

        // Window menu
        template[3].submenu = [
            { role: 'close' },
            { role: 'minimize' },
            { role: 'zoom' },
            { type: 'separator' },
            { role: 'front' }
        ];
    }

    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);
}

// IPC 핸들러들
ipcMain.handle('read-pdf-file', async (event, filePath) => {
    try {
        const data = fs.readFileSync(filePath);
        return {
            success: true,
            data: data.toString('base64'),
            fileName: path.basename(filePath)
        };
    } catch (error) {
        return {
            success: false,
            error: error.message
        };
    }
});

// 앱 이벤트 핸들러들
app.whenReady().then(() => {
    createWindow();
    createMenu();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

// 보안 설정
app.on('web-contents-created', (event, contents) => {
    contents.on('new-window', (event, navigationUrl) => {
        event.preventDefault();
    });

    contents.on('will-navigate', (event, navigationUrl) => {
        if (navigationUrl !== contents.getURL()) {
            event.preventDefault();
        }
    });
});