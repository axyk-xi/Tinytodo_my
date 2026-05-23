const { app, BrowserWindow, Menu, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

// 延迟初始化的数据路径
let dataPath;

function getDataPath() {
    if (!dataPath) {
        dataPath = path.join(app.getPath('userData'), 'todos.json');
    }
    return dataPath;
}

function loadData() {
    try {
        const p = getDataPath();
        if (fs.existsSync(p)) {
            return JSON.parse(fs.readFileSync(p, 'utf-8'));
        }
    } catch (e) {
        console.error('读取数据失败:', e);
    }
    return [];
}

function saveData(todos) {
    try {
        fs.writeFileSync(getDataPath(), JSON.stringify(todos, null, 2), 'utf-8');
    } catch (e) {
        console.error('保存数据失败:', e);
    }
}

let mainWindow;
let alwaysOnTopMenuItem;
let autoLaunchMenuItem;

function syncAlwaysOnTopMenu() {
    if (alwaysOnTopMenuItem && mainWindow) {
        alwaysOnTopMenuItem.checked = mainWindow.isAlwaysOnTop();
    }
}

function syncAutoLaunchMenu() {
    if (autoLaunchMenuItem) {
        autoLaunchMenuItem.checked = app.getLoginItemSettings().openAtLogin;
    }
}

function toggleAlwaysOnTop() {
    if (!mainWindow) return true;

    const next = !mainWindow.isAlwaysOnTop();
    mainWindow.setAlwaysOnTop(next);
    syncAlwaysOnTopMenu();
    return next;
}

function toggleAutoLaunch() {
    const next = !app.getLoginItemSettings().openAtLogin;
    app.setLoginItemSettings({ openAtLogin: next });
    syncAutoLaunchMenu();
    return next;
}

function createApplicationMenu() {
    const template = [
        {
            label: app.name,
            submenu: [
                { role: 'about' },
                { type: 'separator' },
                { role: 'hide' },
                { role: 'hideOthers' },
                { role: 'unhide' },
                { type: 'separator' },
                { role: 'quit' }
            ]
        },
        {
            label: 'Edit',
            submenu: [
                { role: 'undo' },
                { role: 'redo' },
                { type: 'separator' },
                { role: 'cut' },
                { role: 'copy' },
                { role: 'paste' },
                { role: 'selectAll' }
            ]
        },
        {
            label: 'Settings',
            submenu: [
                {
                    id: 'auto-launch',
                    label: '开机自动启动',
                    type: 'checkbox',
                    checked: false,
                    click: () => toggleAutoLaunch()
                }
            ]
        },
        {
            label: 'Window',
            submenu: [
                { role: 'minimize' },
                { role: 'zoom' },
                { type: 'separator' },
                {
                    id: 'always-on-top',
                    label: '持续展示在最前方',
                    type: 'checkbox',
                    checked: true,
                    click: () => toggleAlwaysOnTop()
                },
                {
                    label: '切换深色 / 浅色主题',
                    accelerator: 'CmdOrCtrl+Shift+L',
                    click: () => {
                        if (mainWindow) mainWindow.webContents.send('toggle-theme');
                    }
                },
                { type: 'separator' },
                { role: 'front' }
            ]
        },
        {
            role: 'help'
        }
    ];

    const menu = Menu.buildFromTemplate(template);
    alwaysOnTopMenuItem = menu.getMenuItemById('always-on-top');
    autoLaunchMenuItem = menu.getMenuItemById('auto-launch');
    syncAutoLaunchMenu();
    Menu.setApplicationMenu(menu);
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 360,
        height: 520,
        frame: false,
        transparent: true,
        vibrancy: 'under-window',
        visualEffectState: 'active',
        alwaysOnTop: true,
        resizable: true,
        hasShadow: true,
        roundedCorners: true,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false
        }
    });

    mainWindow.loadFile('index.html');
    syncAlwaysOnTopMenu();

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

// IPC 通信：加载 todos
ipcMain.handle('load-todos', () => {
    return loadData();
});

// IPC 通信：保存 todos
ipcMain.handle('save-todos', (event, todos) => {
    saveData(todos);
    return true;
});

// IPC 通信：切换置顶
ipcMain.handle('toggle-always-on-top', () => {
    return toggleAlwaysOnTop();
});

// IPC 通信：窗口控制
ipcMain.on('window-minimize', () => {
    if (mainWindow) mainWindow.minimize();
});

ipcMain.on('window-close', () => {
    if (mainWindow) mainWindow.close();
});

// IPC 通信：主题同步
ipcMain.on('set-theme', (event, theme) => {
    if (mainWindow) {
        mainWindow.setVibrancy(theme === 'dark' ? 'dark' : 'light');
    }
});

app.whenReady().then(() => {
    createApplicationMenu();
    createWindow();
});

app.on('window-all-closed', () => {
    app.quit();
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});
