// 全局变量
let rootDirectoryHandle = null;  // 根目录句柄
let currentDirectoryHandle = null;  // 当前目录句柄
let directoryStack = [];  // 目录栈，用于返回上级
let fileList = [];
let currentRenameIndex = null;
let currentRenameType = null;  // 'file' 或 'folder'

// 分页相关
let currentPage = 1;
let itemsPerPage = 20;  // 默认值，稍后从 LocalStorage 加载

// 搜索相关
let searchKeyword = '';
let filteredFileList = [];  // 搜索过滤后的列表

// 路径相关
let currentPath = '';  // 当前文件夹的相对路径
let rootFolderFullPath = '';  // 根文件夹的完整磁盘路径

// 文件树相关
let fileTreeData = null;  // 文件树数据
let expandedFolders = new Set();  // 已展开的文件夹路径集合
let isTreeCollapsed = false;  // 树是否被收起

// 回收站相关
const TRASH_FOLDER_NAME = '.回收站';  // 回收站文件夹名称
let trashFolderHandle = null;  // 回收站句柄

// 预览相关
let currentPreviewURL = null;  // 当前预览文件的 ObjectURL

// 操作锁定
let isRenaming = false;  // 是否正在重命名
let isDeleting = false;  // 是否正在删除
let isUploading = false; // 是否正在上传
let isOperating = false; // 通用操作锁（防止所有并发操作）

// 文件大小限制（1GB = 1024 * 1024 * 1024 字节）
const MAX_FILE_SIZE = 1024 * 1024 * 1024;

// DOM 元素
const loadingOverlay = document.getElementById('loadingOverlay');
const loadingText = document.getElementById('loadingText');
const loadingProgress = document.getElementById('loadingProgress');
const progressBarContainer = document.getElementById('progressBarContainer');
const progressBar = document.getElementById('progressBar');
const progressPercentage = document.getElementById('progressPercentage');
const selectFolderBtn = document.getElementById('selectFolderBtn');
const clearFolderBtn = document.getElementById('clearFolderBtn');
const folderPath = document.getElementById('folderPath');
const uploadSection = document.getElementById('uploadSection');
const uploadBtn = document.getElementById('uploadBtn');
const createFolderBtn = document.getElementById('createFolderBtn');
const fileInput = document.getElementById('fileInput');
const fileListSection = document.getElementById('fileListSection');
const fileListElement = document.getElementById('fileList');
const emptyState = document.getElementById('emptyState');
const fileCount = document.getElementById('fileCount');
const navigationSection = document.getElementById('navigationSection');
const backBtn = document.getElementById('backBtn');
const breadcrumb = document.getElementById('breadcrumb');

// 分页元素
const pagination = document.getElementById('pagination');
const firstPageBtn = document.getElementById('firstPageBtn');
const prevPageBtn = document.getElementById('prevPageBtn');
const nextPageBtn = document.getElementById('nextPageBtn');
const lastPageBtn = document.getElementById('lastPageBtn');
const currentPageNum = document.getElementById('currentPageNum');
const totalPagesElement = document.getElementById('totalPages');
const itemsPerPageSelect = document.getElementById('itemsPerPageSelect');

// 搜索元素
const searchInput = document.getElementById('searchInput');
const searchBtn = document.getElementById('searchBtn');
const resetBtn = document.getElementById('resetBtn');
const clearPageBtn = document.getElementById('clearPageBtn');

// 文件树元素
const fileTreeSection = document.getElementById('fileTreeSection');
const fileTree = document.getElementById('fileTree');
const toggleTreeBtn = document.getElementById('toggleTreeBtn');
const toggleTreeIcon = document.getElementById('toggleTreeIcon');

// 模态框元素
const renameModal = document.getElementById('renameModal');
const newFileNameInput = document.getElementById('newFileName');
const confirmRenameBtn = document.getElementById('confirmRename');
const cancelRenameBtn = document.getElementById('cancelRename');

const createFolderModal = document.getElementById('createFolderModal');
const newFolderNameInput = document.getElementById('newFolderName');
const confirmCreateFolderBtn = document.getElementById('confirmCreateFolder');
const cancelCreateFolderBtn = document.getElementById('cancelCreateFolder');

const previewModal = document.getElementById('previewModal');
const previewTitle = document.getElementById('previewTitle');
const previewContent = document.getElementById('previewContent');
const closePreviewBtn = document.getElementById('closePreview');

const setPathModal = document.getElementById('setPathModal');
const fullPathInput = document.getElementById('fullPathInput');
const confirmSetPathBtn = document.getElementById('confirmSetPath');
const skipSetPathBtn = document.getElementById('skipSetPath');
const currentFolderNameElement = document.getElementById('currentFolderName');

// ==================== 存储管理 ====================
// LocalStorage 键名
const STORAGE_KEYS = {
    DIRECTORY_PATH: 'fm_directory_path',        // 文件夹完整路径
    ITEMS_PER_PAGE: 'fm_items_per_page',        // 每页显示数量
    LAST_OPENED: 'fm_last_opened',              // 最后打开时间
};

// IndexedDB 配置（仅用于存储文件夹句柄）
const DB_NAME = 'FileManagerDB';
const DB_VERSION = 1;
const STORE_NAME = 'directoryHandles';

// LocalStorage 工具函数
const LocalStorageHelper = {
    // 保存数据
    set(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
            return true;
        } catch (error) {
            console.error('[LocalStorage] 保存失败:', key, error);
            return false;
        }
    },
    
    // 读取数据
    get(key, defaultValue = null) {
        try {
            const value = localStorage.getItem(key);
            return value ? JSON.parse(value) : defaultValue;
        } catch (error) {
            console.error('[LocalStorage] 读取失败:', key, error);
            return defaultValue;
        }
    },
    
    // 删除数据
    remove(key) {
        try {
            localStorage.removeItem(key);
            return true;
        } catch (error) {
            console.error('[LocalStorage] 删除失败:', key, error);
            return false;
        }
    },
    
    // 清空所有数据
    clear() {
        try {
            Object.values(STORAGE_KEYS).forEach(key => {
                localStorage.removeItem(key);
            });
            return true;
        } catch (error) {
            console.error('[LocalStorage] 清空失败:', error);
            return false;
        }
    }
};

// 打开 IndexedDB（仅用于文件夹句柄）
function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
        
        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME);
            }
        };
    });
}

// 保存文件夹句柄和路径
async function saveDirectoryHandle(handle, fullPath = '') {
    try {
        console.log('[保存] 准备保存文件夹:', handle.name);
        
        // 1. 保存文件夹句柄到 IndexedDB（必须用 IndexedDB）
        const db = await openDB();
        const transaction = db.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        store.put(handle, 'lastDirectory');
        
        // 2. 保存配置信息到 LocalStorage（更快、更方便）
        if (fullPath) {
            LocalStorageHelper.set(STORAGE_KEYS.DIRECTORY_PATH, fullPath);
            console.log('[保存] ✅ 完整路径已保存到 LocalStorage:', fullPath);
        }
        
        // 保存最后打开时间
        LocalStorageHelper.set(STORAGE_KEYS.LAST_OPENED, new Date().toISOString());
        
        return new Promise((resolve, reject) => {
            transaction.oncomplete = () => {
                console.log('[保存] ✅ 文件夹句柄已保存到 IndexedDB');
                // 验证保存
                verifyDirectoryHandleSaved();
                resolve(true);
            };
            transaction.onerror = () => {
                console.error('[保存] ❌ 保存失败:', transaction.error);
                reject(transaction.error);
            };
        });
    } catch (error) {
        console.error('[保存] ❌ 保存文件夹句柄失败:', error);
        return false;
    }
}

// 加载保存的完整路径（从 LocalStorage）
async function loadDirectoryFullPath() {
    try {
        const path = LocalStorageHelper.get(STORAGE_KEYS.DIRECTORY_PATH, '');
        console.log('[加载] 从 LocalStorage 读取路径:', path || '未设置');
        return path;
    } catch (error) {
        console.error('[加载] 加载完整路径失败:', error);
        return '';
    }
}

// 验证文件夹句柄是否保存成功
async function verifyDirectoryHandleSaved() {
    try {
        const handle = await loadDirectoryHandle();
        if (handle) {
            console.log('[验证] ✅ 文件夹句柄保存验证成功:', handle.name);
        } else {
            console.error('[验证] ❌ 文件夹句柄保存验证失败');
        }
    } catch (error) {
        console.error('[验证] 验证时出错:', error);
    }
}

// 从 IndexedDB 加载文件夹句柄
async function loadDirectoryHandle() {
    try {
        console.log('[加载] 从 IndexedDB 读取文件夹...');
        const db = await openDB();
        const transaction = db.transaction(STORE_NAME, 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.get('lastDirectory');
        
        return new Promise((resolve, reject) => {
            request.onsuccess = () => {
                if (request.result) {
                    console.log('[加载] ✅ 找到保存的文件夹');
                } else {
                    console.log('[加载] ℹ️ 没有保存的文件夹');
                }
                resolve(request.result);
            };
            request.onerror = () => {
                console.error('[加载] ❌ 读取失败:', request.error);
                reject(request.error);
            };
        });
    } catch (error) {
        console.error('[加载] ❌ 加载文件夹句柄失败:', error);
        return null;
    }
}

// 清除保存的文件夹句柄和配置
async function clearDirectoryHandle() {
    try {
        // 1. 清除 IndexedDB 中的文件夹句柄
        const db = await openDB();
        const transaction = db.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        store.delete('lastDirectory');
        
        // 2. 清除 LocalStorage 中的配置信息
        LocalStorageHelper.clear();
        console.log('[清除] ✅ LocalStorage 配置已清除');
        
        return new Promise((resolve, reject) => {
            transaction.oncomplete = () => {
                console.log('[清除] ✅ IndexedDB 句柄已清除');
                resolve();
            };
            transaction.onerror = () => reject(transaction.error);
        });
    } catch (error) {
        console.error('[清除] 清除文件夹句柄失败:', error);
    }
}

// 检查浏览器支持
function checkBrowserSupport() {
    if (!('showDirectoryPicker' in window)) {
        alert('您的浏览器不支持文件系统访问API。请使用Chrome、Edge或其他支持的现代浏览器。');
        return false;
    }
    return true;
}

// 清除文件夹记忆
clearFolderBtn.addEventListener('click', async () => {
    if (confirm('确定要清除文件夹记忆吗？这将关闭当前文件夹，下次打开页面将不会自动加载。')) {
        await clearDirectoryHandle();
        
        // 重置所有状态
        rootDirectoryHandle = null;
        currentDirectoryHandle = null;
        directoryStack = [];
        fileList = [];
        currentPath = '';
        rootFolderFullPath = '';
        fileTreeData = null;
        expandedFolders.clear();
        searchKeyword = '';
        filteredFileList = [];
        currentPage = 1;
        trashFolderHandle = null;  // 重置回收站句柄
        
        // 隐藏所有区域
        uploadSection.style.display = 'none';
        fileListSection.style.display = 'none';
        navigationSection.style.display = 'none';
        clearFolderBtn.style.display = 'none';
        
        // 重置显示
        folderPath.textContent = '未选择文件夹';
        searchInput.value = '';
        fileListElement.innerHTML = '';
        fileTree.innerHTML = '';
        
        showNotification('✅ 文件夹记忆已清除，请重新选择文件夹', 'success');
        console.log('[清除] 文件夹记忆已清除，状态已重置');
    }
});

// 页面加载时自动加载上次的文件夹
window.addEventListener('DOMContentLoaded', async () => {
    console.log('[启动] 🚀 开始初始化...');
    
    // ⚠️ 重要：必须先从 LocalStorage 加载配置，再显示信息
    itemsPerPage = LocalStorageHelper.get(STORAGE_KEYS.ITEMS_PER_PAGE, 20);
    
    console.log('='.repeat(50));
    console.log('📦 存储信息:');
    console.log('- LocalStorage 路径:', LocalStorageHelper.get(STORAGE_KEYS.DIRECTORY_PATH, '未设置'));
    console.log('- 每页显示数量:', itemsPerPage);
    console.log('- 最后打开时间:', LocalStorageHelper.get(STORAGE_KEYS.LAST_OPENED, '未记录'));
    console.log('='.repeat(50));
    
    // 恢复用户设置到UI
    if (itemsPerPageSelect) {
        itemsPerPageSelect.value = itemsPerPage;
        console.log('[启动] ✅ 已恢复每页显示数量:', itemsPerPage);
    }
    
    if (!checkBrowserSupport()) {
        console.log('[启动] 浏览器不支持');
        return;
    }
    
    try {
        const savedHandle = await loadDirectoryHandle();
        console.log('[启动] 读取保存的句柄:', savedHandle ? '找到' : '未找到');
        
        if (savedHandle) {
            try {
                console.log('[启动] 文件夹名称:', savedHandle.name);
                
                // 验证文件夹句柄是否仍然有效
                try {
                    // 尝试访问文件夹来验证
                    await savedHandle.values().next();
                } catch (err) {
                    console.error('[启动] 文件夹句柄无效:', err);
                    await clearDirectoryHandle();
                    console.log('[启动] 已清除无效的文件夹记忆');
                    return;
                }
                
                // 查询权限状态
                let permissionStatus;
                try {
                    permissionStatus = await savedHandle.queryPermission({ mode: 'readwrite' });
                    console.log('[启动] 当前权限状态:', permissionStatus);
                } catch (err) {
                    console.log('[启动] queryPermission 失败，直接请求权限');
                    permissionStatus = 'prompt';
                }
                
                let permission = permissionStatus;
                
                // 如果没有权限，则请求权限
                if (permissionStatus !== 'granted') {
                    console.log('[启动] 请求权限中，请点击"允许"...');
                    try {
                        permission = await savedHandle.requestPermission({ mode: 'readwrite' });
                        console.log('[启动] 权限请求结果:', permission);
                    } catch (err) {
                        console.error('[启动] 权限请求失败:', err);
                        permission = 'denied';
                    }
                }
                
                if (permission === 'granted') {
                    console.log('[启动] 权限已授予，开始加载文件夹');
                    
                rootDirectoryHandle = savedHandle;
                currentDirectoryHandle = savedHandle;
                directoryStack = [savedHandle];
                currentPath = '';
                
                // 加载保存的完整路径
                rootFolderFullPath = await loadDirectoryFullPath();
                
                if (rootFolderFullPath) {
                    folderPath.textContent = `${rootFolderFullPath}`;
                } else {
                    folderPath.textContent = `${savedHandle.name} (未设置完整路径)`;
                }
                
                uploadSection.style.display = 'block';
                fileListSection.style.display = 'block';
                navigationSection.style.display = 'flex';
                backBtn.style.display = 'none';
                clearFolderBtn.style.display = 'inline-flex';
                
                updateBreadcrumb();
                await loadCurrentDirectory();
                await updateFileTree();
                await initTrashFolder(); // 初始化回收站
                    
                    console.log('[启动] ✅ 文件夹加载成功！');
                    
                    // 显示成功提示
                    showNotification('✅ 已自动加载上次选择的文件夹', 'success');
                } else {
                    console.log('[启动] ❌ 权限被拒绝，无法自动加载文件夹');
                    showNotification('⚠️ 权限被拒绝，请重新选择文件夹', 'warning');
                }
            } catch (error) {
                console.error('[启动] ❌ 错误:', error);
                console.error('[启动] 错误名称:', error.name);
                console.error('[启动] 错误消息:', error.message);
                
                // 如果权限已完全过期或文件夹不存在，清除记忆
                if (error.name === 'NotFoundError' || error.name === 'NotAllowedError') {
                    console.log('[启动] 清除无效的文件夹记忆');
                    await clearDirectoryHandle();
                    showNotification('ℹ️ 文件夹访问失败，已清除记忆', 'info');
                }
            }
        } else {
            console.log('[启动] 没有保存的文件夹，等待用户选择');
        }
    } catch (error) {
        console.error('[启动] 初始化错误:', error);
    }
});

// 通知容器（懒加载创建）
let notificationContainer = null;

// 确保通知容器存在
function ensureNotificationContainer() {
    if (!notificationContainer) {
        notificationContainer = document.createElement('div');
        notificationContainer.id = 'notificationContainer';
        notificationContainer.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            z-index: 10000;
            display: flex;
            flex-direction: column;
            gap: 10px;
            pointer-events: none;
        `;
        document.body.appendChild(notificationContainer);
    }
    return notificationContainer;
}

// 显示通知消息
function showNotification(message, type = 'info', duration = 3000) {
    const container = ensureNotificationContainer();
    
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    
    // 处理换行符，转换为 <br> 标签
    const formattedMessage = message.replace(/\n/g, '<br>');
    notification.innerHTML = formattedMessage;
    notification.style.pointerEvents = 'auto';
    
    container.appendChild(notification);
    
    // 指定时间后自动消失
    setTimeout(() => {
        notification.classList.add('fade-out');
        setTimeout(() => {
            if (container.contains(notification)) {
                container.removeChild(notification);
            }
            
            // 如果容器为空，可以移除容器（可选）
            if (container.children.length === 0) {
                // 保留容器以便下次使用，不移除
            }
        }, 300);
    }, duration);
}

// 显示加载动画
function showLoading(text = '处理中...', progress = '', showProgress = false) {
    if (loadingOverlay) {
        loadingText.textContent = text;
        loadingProgress.textContent = progress;
        loadingOverlay.classList.add('active');
        
        // 控制进度条显示
        if (showProgress) {
            progressBarContainer.style.display = 'block';
            progressPercentage.style.display = 'block';
        } else {
            progressBarContainer.style.display = 'none';
            progressPercentage.style.display = 'none';
        }
        
        // 禁止页面滚动
        document.body.style.overflow = 'hidden';
    }
}

// 隐藏加载动画
function hideLoading() {
    if (loadingOverlay) {
        loadingOverlay.classList.remove('active');
        // 恢复页面滚动
        document.body.style.overflow = '';
        // 重置进度条
        updateProgress(0);
    }
}

// 更新进度条
function updateProgress(percentage) {
    if (progressBar && progressPercentage) {
        const percent = Math.min(100, Math.max(0, percentage));
        progressBar.style.width = `${percent}%`;
        progressPercentage.textContent = `${Math.round(percent)}%`;
    }
}

// 格式化文件大小（用于显示）
function formatFileSizeForDisplay(bytes) {
    if (bytes === 0) return '0 B';
    
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// 检查文件大小是否超限
function checkFileSize(file) {
    if (file.size > MAX_FILE_SIZE) {
        const fileSize = formatFileSizeForDisplay(file.size);
        const maxSize = formatFileSizeForDisplay(MAX_FILE_SIZE);
        showNotification(
            `⚠️ 文件 "${file.name}" 过大（${fileSize}），超出限制（${maxSize}）\n操作有风险，请到磁盘手动操作`,
            'error',
            6000
        );
        return false;
    }
    return true;
}

// 选择根文件夹
selectFolderBtn.addEventListener('click', async () => {
    if (!checkBrowserSupport()) return;

    try {
        rootDirectoryHandle = await window.showDirectoryPicker();
        currentDirectoryHandle = rootDirectoryHandle;
        directoryStack = [rootDirectoryHandle];
        trashFolderHandle = null;  // 重置回收站句柄
        
        console.log('[选择] 用户选择了文件夹:', rootDirectoryHandle.name);
        
        // 立即请求持久化权限
        try {
            const permission = await rootDirectoryHandle.requestPermission({ mode: 'readwrite' });
            console.log('[选择] 权限状态:', permission);
            
            if (permission !== 'granted') {
                alert('需要授予文件夹访问权限才能使用文件管理器功能');
                return;
            }
        } catch (err) {
            console.error('[选择] 权限请求失败:', err);
        }
        
        // 显示路径设置对话框
        currentPath = '';
        showSetPathDialog();
    } catch (error) {
        if (error.name !== 'AbortError') {
            console.error('选择文件夹时出错:', error);
            alert('选择文件夹失败，请重试。');
        }
    }
});

// 加载当前目录
async function loadCurrentDirectory() {
    fileList = [];
    currentPage = 1;  // 重置到第一页
    searchKeyword = '';  // 清空搜索
    filteredFileList = [];
    searchInput.value = '';  // 清空搜索框
    
    try {
        for await (const entry of currentDirectoryHandle.values()) {
            // 在根目录时，跳过回收站文件夹
            if (currentPath === '' && entry.kind === 'directory' && entry.name === TRASH_FOLDER_NAME) {
                continue;
            }
            
            if (entry.kind === 'file') {
                const file = await entry.getFile();
                fileList.push({
                    name: file.name,
                    size: file.size,
                    type: 'file',
                    handle: entry,
                    path: currentPath ? `${currentPath}/${file.name}` : file.name
                });
            } else if (entry.kind === 'directory') {
                fileList.push({
                    name: entry.name,
                    size: 0,
                    type: 'folder',
                    handle: entry,
                    path: currentPath ? `${currentPath}/${entry.name}` : entry.name
                });
            }
        }
        
        // 排序：文件夹在前，然后按名称排序
        fileList.sort((a, b) => {
            if (a.type === b.type) {
                return a.name.localeCompare(b.name);
            }
            return a.type === 'folder' ? -1 : 1;
        });
        
        updateFileList();
    } catch (error) {
        console.error('读取文件时出错:', error);
    }
}

// 递归搜索所有子文件夹
async function searchAllDirectories(dirHandle, basePath = '') {
    const results = [];
    
    try {
        for await (const entry of dirHandle.values()) {
            // 在根目录时，跳过回收站文件夹
            if (basePath === '' && entry.kind === 'directory' && entry.name === TRASH_FOLDER_NAME) {
                continue;
            }
            
            const entryPath = basePath ? `${basePath}/${entry.name}` : entry.name;
            
            if (entry.kind === 'file') {
                const file = await entry.getFile();
                results.push({
                    name: entry.name,
                    size: file.size,
                    type: 'file',
                    handle: entry,
                    path: entryPath
                });
            } else if (entry.kind === 'directory') {
                // 添加文件夹本身
                results.push({
                    name: entry.name,
                    size: 0,
                    type: 'folder',
                    handle: entry,
                    path: entryPath
                });
                
                // 递归搜索子文件夹
                const subResults = await searchAllDirectories(entry, entryPath);
                results.push(...subResults);
            }
        }
    } catch (error) {
        console.error('递归搜索时出错:', error);
    }
    
    return results;
}

// 更新面包屑导航
function updateBreadcrumb() {
    breadcrumb.innerHTML = '';
    
    directoryStack.forEach((dirHandle, index) => {
        if (index > 0) {
            const separator = document.createElement('span');
            separator.className = 'breadcrumb-separator';
            separator.textContent = '›';
            breadcrumb.appendChild(separator);
        }
        
        const item = document.createElement('span');
        item.className = 'breadcrumb-item';
        item.textContent = dirHandle.name;
        
        // 添加点击功能（除了当前层级）
        if (index < directoryStack.length - 1) {
            item.classList.add('breadcrumb-clickable');
            item.addEventListener('click', () => navigateToBreadcrumb(index));
        } else {
            item.classList.add('breadcrumb-current');
        }
        
        breadcrumb.appendChild(item);
    });
    
    // 更新返回按钮显示状态
    backBtn.style.display = directoryStack.length > 1 ? 'block' : 'none';
}

// 导航到面包屑指定层级
async function navigateToBreadcrumb(targetIndex) {
    if (targetIndex < 0 || targetIndex >= directoryStack.length) return;
    
    // 移除目标层级之后的所有层级
    directoryStack = directoryStack.slice(0, targetIndex + 1);
    currentDirectoryHandle = directoryStack[directoryStack.length - 1];
    
    // 重新构建当前路径
    if (targetIndex === 0) {
        currentPath = '';
    } else {
        const pathParts = [];
        for (let i = 1; i <= targetIndex; i++) {
            pathParts.push(directoryStack[i].name);
        }
        currentPath = pathParts.join('/');
    }
    
    updateBreadcrumb();
    await loadCurrentDirectory();
    renderFileTree(); // 只需重新渲染，不需要重建整个树
}

// 返回上级目录
backBtn.addEventListener('click', async () => {
    if (directoryStack.length > 1) {
        directoryStack.pop();
        currentDirectoryHandle = directoryStack[directoryStack.length - 1];
        
        // 更新当前路径
        if (directoryStack.length === 1) {
            currentPath = '';
        } else {
            // 重新构建路径
            const pathParts = currentPath.split('/');
            pathParts.pop();
            currentPath = pathParts.join('/');
        }
        
        updateBreadcrumb();
        await loadCurrentDirectory();
        renderFileTree(); // 重新渲染文件树
    }
});

// 添加文件按钮
uploadBtn.addEventListener('click', () => {
    fileInput.click();
});

// 文件选择处理
fileInput.addEventListener('change', async (e) => {
    const files = Array.from(e.target.files);
    
    if (files.length === 0) return;
    
    // 检查是否有其他操作正在进行
    if (isOperating || isUploading) {
        showNotification('⚠️ 有其他操作正在进行，请稍候', 'warning');
        fileInput.value = '';
        return;
    }
    
    // 检查文件大小
    const oversizedFiles = files.filter(file => file.size > MAX_FILE_SIZE);
    if (oversizedFiles.length > 0) {
        const maxSize = formatFileSizeForDisplay(MAX_FILE_SIZE);
        
        // 列出超大文件名称（最多显示3个）
        const fileNames = oversizedFiles.slice(0, 3).map(f => f.name).join('、');
        const moreText = oversizedFiles.length > 3 ? ` 等${oversizedFiles.length}个` : '';
        
        showNotification(
            `⚠️ 文件 "${fileNames}${moreText}" 超出限制（${maxSize}）\n操作有风险，请到磁盘手动操作`,
            'error',
            7000
        );
    }
    
    // 过滤掉超大文件
    const validFiles = files.filter(file => file.size <= MAX_FILE_SIZE);
    
    if (validFiles.length === 0) {
        fileInput.value = '';
        return;
    }
    
    // 设置操作锁
    isUploading = true;
    isOperating = true;
    
    try {
        // 计算总文件大小
        const totalSize = validFiles.reduce((sum, file) => sum + file.size, 0);
        let uploadedSize = 0;
        
        showLoading(`正在上传文件...`, `共 ${validFiles.length} 个文件 (${formatFileSizeForDisplay(totalSize)})`, true);
        updateProgress(0);
    
    let successCount = 0;
    let skipCount = 0;
    let failCount = 0;
    
    for (let i = 0; i < validFiles.length; i++) {
        const file = validFiles[i];
        const fileSize = formatFileSizeForDisplay(file.size);
        
        // 更新进度文本
        showLoading(
            `正在上传文件...`, 
            `${i + 1}/${validFiles.length}: ${file.name} (${fileSize})`,
            true
        );
        
        const result = await addFileToDirectory(file);
        
        // 更新已上传大小和进度条
        uploadedSize += file.size;
        const progressPercent = (uploadedSize / totalSize) * 100;
        updateProgress(progressPercent);
        
        if (result === 'success') {
            successCount++;
        } else if (result === 'skipped') {
            skipCount++;
        } else {
            failCount++;
        }
    }
    
        fileInput.value = '';
        
        showLoading('正在刷新文件列表...', `已上传 ${successCount} 个文件`, false);
        await loadCurrentDirectory();
        hideLoading();
        
        // 生成详细的结果消息
        let message = '';
        if (failCount === 0 && skipCount === 0) {
            message = `✅ 已成功添加 ${successCount} 个文件`;
            showNotification(message, 'success');
        } else {
            const parts = [];
            if (successCount > 0) parts.push(`成功 ${successCount}`);
            if (skipCount > 0) parts.push(`跳过 ${skipCount}`);
            if (failCount > 0) parts.push(`失败 ${failCount}`);
            message = `📊 ${parts.join('，')} 个文件`;
            showNotification(message, skipCount > 0 && failCount === 0 ? 'info' : 'warning');
        }
    } catch (error) {
        hideLoading();
        console.error('[上传] 上传过程出错:', error);
        showNotification('❌ 文件上传失败', 'error');
    } finally {
        // 释放操作锁
        isUploading = false;
        isOperating = false;
        fileInput.value = '';
    }
});

// 添加文件到当前目录
async function addFileToDirectory(file) {
    try {
        // 检查文件是否已存在
        let fileExists = false;
        try {
            await currentDirectoryHandle.getFileHandle(file.name);
            fileExists = true;
        } catch (e) {
            // 文件不存在，可以创建
        }
        
        if (fileExists) {
            // 文件已存在，询问用户是否覆盖
            const confirmOverwrite = confirm(`文件 "${file.name}" 已存在，是否覆盖？`);
            if (!confirmOverwrite) {
                console.log(`[上传] 用户跳过: ${file.name}`);
                return 'skipped';
            }
        }
        
        // 创建或覆盖文件
        const fileHandle = await currentDirectoryHandle.getFileHandle(file.name, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(file);
        await writable.close();
        console.log(`[上传] 成功添加: ${file.name}`);
        return 'success';
    } catch (error) {
        console.error('[上传] 失败:', file.name, error);
        showNotification(`❌ 添加文件 "${file.name}" 失败`, 'error');
        return 'failed';
    }
}

// 创建文件夹按钮
createFolderBtn.addEventListener('click', () => {
    newFolderNameInput.value = '';
    createFolderModal.classList.add('active');
    newFolderNameInput.focus();
});

// 确认创建文件夹
confirmCreateFolderBtn.addEventListener('click', async () => {
    // 检查是否有其他操作正在进行
    if (isOperating) {
        showNotification('⚠️ 有操作正在进行中，请稍候', 'warning');
        return;
    }
    
    const folderName = newFolderNameInput.value.trim();
    
    if (!folderName) {
        alert('文件夹名称不能为空');
        return;
    }
    
    // 检查文件夹名称是否包含非法字符
    if (/[<>:"/\\|?*]/.test(folderName)) {
        alert('文件夹名称包含非法字符（< > : " / \\ | ? *）');
        return;
    }
    
    // 禁止在根目录创建回收站同名文件夹
    if (folderName === TRASH_FOLDER_NAME && !currentPath) {
        showNotification('⚠️ 此名称为系统保留，请使用其他名称', 'warning', 3000);
        return;
    }
    
    isOperating = true;
    
    try {
        // 检查文件夹是否已存在
        try {
            await currentDirectoryHandle.getDirectoryHandle(folderName);
            showNotification(`⚠️ 文件夹 "${folderName}" 已存在`, 'warning');
            isOperating = false;  // 释放锁
            return;
        } catch (e) {
            // 文件夹不存在，可以创建
        }
        
        showLoading('正在创建文件夹...', `创建 "${folderName}"`);
        
        await currentDirectoryHandle.getDirectoryHandle(folderName, { create: true });
        createFolderModal.classList.remove('active');
        
        showLoading('正在刷新...', '正在更新文件列表...');
        await loadCurrentDirectory();
        await updateFileTree(); // 更新文件树
        
        hideLoading();
        showNotification(`✅ 文件夹 "${folderName}" 创建成功`, 'success');
    } catch (error) {
        hideLoading();
        console.error('创建文件夹时出错:', error);
        showNotification('❌ 创建文件夹失败', 'error');
    } finally {
        isOperating = false;
    }
});

// 取消创建文件夹
cancelCreateFolderBtn.addEventListener('click', () => {
    createFolderModal.classList.remove('active');
});

// 创建文件夹模态框外部点击关闭
createFolderModal.addEventListener('click', (e) => {
    if (e.target === createFolderModal) {
        createFolderModal.classList.remove('active');
    }
});

// 创建文件夹回车确认
newFolderNameInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        confirmCreateFolderBtn.click();
    }
});

// 更新文件列表显示（支持分页和搜索）
function updateFileList() {
    fileListElement.innerHTML = '';
    
    // 根据搜索关键词过滤列表
    const displayList = searchKeyword ? filteredFileList : fileList;
    
    if (displayList.length === 0) {
        emptyState.style.display = 'block';
        pagination.style.display = 'none';
        if (searchKeyword) {
            emptyState.innerHTML = '<p>🔍 未找到匹配的文件或文件夹</p>';
            fileCount.textContent = '0 项';
        } else {
            emptyState.innerHTML = '<p>📭 还没有文件，点击上方按钮添加文件</p>';
            fileCount.textContent = '0 项';
        }
        return;
    }
    
    emptyState.style.display = 'none';
    
    // 计算总页数
    const totalPages = Math.ceil(displayList.length / itemsPerPage);
    
    // 确保当前页在有效范围内
    if (currentPage > totalPages) {
        currentPage = totalPages;
    }
    if (currentPage < 1) {
        currentPage = 1;
    }
    
    // 计算当前页的起始和结束索引
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = Math.min(startIndex + itemsPerPage, displayList.length);
    
    // 获取当前页的项目
    const currentPageItems = displayList.slice(startIndex, endIndex);
    
    // 更新统计信息
    const folderCount = displayList.filter(item => item.type === 'folder').length;
    const fileCount2 = displayList.filter(item => item.type === 'file').length;
    
    let countText = '';
    if (folderCount > 0 && fileCount2 > 0) {
        countText = `${folderCount} 个文件夹, ${fileCount2} 个文件`;
    } else if (folderCount > 0) {
        countText = `${folderCount} 个文件夹`;
    } else {
        countText = `${fileCount2} 个文件`;
    }
    
    // 如果在搜索状态，显示搜索结果数量
    if (searchKeyword) {
        countText += ` (搜索: "${searchKeyword}")`;
    }
    
    fileCount.textContent = countText;
    
    // 显示当前页的项目
    currentPageItems.forEach((item, pageIndex) => {
        const itemElement = createFileItem(item);
        fileListElement.appendChild(itemElement);
    });
    
    // 更新分页控件
    updatePagination(totalPages);
}

// 更新分页控件
function updatePagination(totalPages) {
    if (totalPages <= 1) {
        pagination.style.display = 'none';
        return;
    }
    
    pagination.style.display = 'flex';
    currentPageNum.textContent = currentPage;
    totalPagesElement.textContent = totalPages;
    
    // 更新按钮状态
    firstPageBtn.disabled = currentPage === 1;
    prevPageBtn.disabled = currentPage === 1;
    nextPageBtn.disabled = currentPage === totalPages;
    lastPageBtn.disabled = currentPage === totalPages;
}

// 跳转到指定页
function goToPage(page) {
    // 根据搜索状态选择正确的列表
    const displayList = searchKeyword ? filteredFileList : fileList;
    const totalPages = Math.max(1, Math.ceil(displayList.length / itemsPerPage));
    
    // 确保页码在有效范围内
    if (page < 1) page = 1;
    if (page > totalPages) page = totalPages;
    
    currentPage = page;
    updateFileList();
    
    // 滚动到顶部
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// 分页按钮事件
firstPageBtn.addEventListener('click', () => goToPage(1));
prevPageBtn.addEventListener('click', () => goToPage(currentPage - 1));
nextPageBtn.addEventListener('click', () => goToPage(currentPage + 1));
lastPageBtn.addEventListener('click', () => {
    // 根据搜索状态选择正确的列表
    const displayList = searchKeyword ? filteredFileList : fileList;
    const totalPages = Math.ceil(displayList.length / itemsPerPage);
    goToPage(totalPages);
});

// 每页项数改变事件
itemsPerPageSelect.addEventListener('change', (e) => {
    itemsPerPage = parseInt(e.target.value);
    currentPage = 1;  // 重置到第一页
    
    // 保存到 LocalStorage
    LocalStorageHelper.set(STORAGE_KEYS.ITEMS_PER_PAGE, itemsPerPage);
    console.log('[设置] 每页显示数量已保存:', itemsPerPage);
    
    updateFileList();
});

// 搜索功能（递归搜索所有子文件夹）
async function performSearch() {
    const keyword = searchInput.value.trim();
    
    if (!keyword) {
        // 如果搜索框为空，显示全部
        searchKeyword = '';
        filteredFileList = [];
        currentPage = 1;
        updateFileList();
        return;
    }
    
    searchKeyword = keyword.toLowerCase();
    
    showLoading('正在搜索...', '正在递归搜索所有子文件夹...');
    
    try {
        // 递归搜索当前文件夹及所有子文件夹
        const allFiles = await searchAllDirectories(currentDirectoryHandle, currentPath);
        
        showLoading('正在搜索...', `正在过滤匹配项（共 ${allFiles.length} 个文件）...`);
        
        // 过滤匹配的文件
        filteredFileList = allFiles.filter(item => {
            return item.name.toLowerCase().includes(searchKeyword);
        });
        
        // 排序
        filteredFileList.sort((a, b) => {
            if (a.type === b.type) {
                return a.name.localeCompare(b.name);
            }
            return a.type === 'folder' ? -1 : 1;
        });
        
        currentPage = 1;  // 重置到第一页
        updateFileList();
        
        hideLoading();
        
        console.log(`[搜索] 关键词: "${keyword}", 找到 ${filteredFileList.length} 个结果`);
        showNotification(`✅ 找到 ${filteredFileList.length} 个匹配项`, 'success');
    } catch (error) {
        hideLoading();
        console.error('[搜索] 搜索失败:', error);
        showNotification('❌ 搜索失败', 'error');
    }
}

// 重置搜索
function resetSearch() {
    searchInput.value = '';
    searchKeyword = '';
    filteredFileList = [];
    currentPage = 1;
    updateFileList();
    console.log('[搜索] 已重置搜索');
}

// 显示设置路径对话框
function showSetPathDialog() {
    fullPathInput.value = '';
    currentFolderNameElement.textContent = rootDirectoryHandle.name;
    setPathModal.classList.add('active');
    fullPathInput.focus();
}

// 确认设置路径
confirmSetPathBtn.addEventListener('click', async () => {
    const fullPath = fullPathInput.value.trim();
    
    if (fullPath) {
        rootFolderFullPath = fullPath;
        folderPath.textContent = fullPath;
    } else {
        rootFolderFullPath = '';
        folderPath.textContent = `${rootDirectoryHandle.name} (未设置完整路径)`;
    }
    
    // 保存文件夹句柄和完整路径
    const saved = await saveDirectoryHandle(rootDirectoryHandle, fullPath);
    if (saved) {
        console.log('[选择] ✅ 文件夹已保存，下次打开会自动加载');
        showNotification('✅ 文件夹已保存，下次打开会自动加载', 'success');
    } else {
        console.warn('[选择] ⚠️ 文件夹保存失败');
        showNotification('⚠️ 文件夹保存失败，下次需要重新选择', 'warning');
    }
    
    uploadSection.style.display = 'block';
    fileListSection.style.display = 'block';
    navigationSection.style.display = 'flex';
    backBtn.style.display = 'none';
    clearFolderBtn.style.display = 'inline-flex';
    
    updateBreadcrumb();
    await loadCurrentDirectory();
    await updateFileTree();
    await initTrashFolder(); // 初始化回收站
    
    setPathModal.classList.remove('active');
});

// 跳过设置路径
skipSetPathBtn.addEventListener('click', async () => {
    rootFolderFullPath = '';
    folderPath.textContent = `${rootDirectoryHandle.name}`;
    
    // 保存文件夹句柄
    await saveDirectoryHandle(rootDirectoryHandle, '');
    
    uploadSection.style.display = 'block';
    fileListSection.style.display = 'block';
    navigationSection.style.display = 'flex';
    backBtn.style.display = 'none';
    clearFolderBtn.style.display = 'inline-flex';
    
    updateBreadcrumb();
    await loadCurrentDirectory();
    await updateFileTree();
    await initTrashFolder(); // 初始化回收站
    
    setPathModal.classList.remove('active');
});

// 路径输入框回车事件
fullPathInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        confirmSetPathBtn.click();
    }
});

// 点击路径设置模态框外部关闭
setPathModal.addEventListener('click', (e) => {
    if (e.target === setPathModal) {
        skipSetPathBtn.click();
    }
});

// 搜索按钮点击事件
searchBtn.addEventListener('click', performSearch);

// 重置按钮点击事件
resetBtn.addEventListener('click', resetSearch);

// 搜索框回车事件
searchInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        performSearch();
    }
});

// 清空本页功能
clearPageBtn.addEventListener('click', async () => {
    // 防止并发操作
    if (isDeleting || isOperating) {
        showNotification('⚠️ 有操作正在进行中，请稍候', 'warning');
        return;
    }
    
    // 在搜索状态下禁用批量删除（因为文件可能来自不同目录）
    if (searchKeyword) {
        showNotification('⚠️ 搜索状态下不支持批量删除，请先重置搜索', 'warning', 3000);
        return;
    }
    
    // 只在非搜索状态下操作
    const displayList = fileList;
    
    if (displayList.length === 0) {
        showNotification('ℹ️ 当前页面没有文件', 'info');
        return;
    }
    
    // 计算当前页的项目
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = Math.min(startIndex + itemsPerPage, displayList.length);
    const currentPageItems = displayList.slice(startIndex, endIndex);
    
    const itemCount = currentPageItems.length;
    const folderCount = currentPageItems.filter(item => item.type === 'folder').length;
    const fileCount = currentPageItems.filter(item => item.type === 'file').length;
    
    let message = `确定要删除本页的 ${itemCount} 项内容吗？\n\n`;
    if (folderCount > 0) {
        message += `包括：${folderCount} 个文件夹`;
        if (fileCount > 0) {
            message += `、${fileCount} 个文件`;
        }
        message += '\n⚠️ 文件夹中的所有内容也将被删除！';
    } else {
        message += `包括：${fileCount} 个文件`;
    }
    
    // 添加回收站选项
    message += '\n\n点击"确定"移到回收站，点击"取消"则不删除';
    
    if (!confirm(message)) {
        return;
    }
    
    isDeleting = true;
    isOperating = true;
    
    try {
        showLoading('正在删除...', `准备删除 ${itemCount} 项...`, true);
        updateProgress(0);
        
        let successCount = 0;
        let failCount = 0;
        
        // 删除当前页的所有项目
        let hasFolderDeleted = false;
        const deletedFolderPaths = [];
    
    for (let i = 0; i < currentPageItems.length; i++) {
        const item = currentPageItems[i];
        
        // 更新进度
        const progressPercent = (i / currentPageItems.length) * 100;
        updateProgress(progressPercent);
        
        showLoading(
            '正在删除...', 
            `删除中 ${i + 1}/${currentPageItems.length}: ${item.name}`,
            true
        );
        try {
            // 先移动到回收站
            const moved = await moveToTrash(item.handle, item.name, item.type);
            
            if (moved) {
                try {
                    // 移动成功后删除原文件
                    await currentDirectoryHandle.removeEntry(item.name, { recursive: item.type === 'folder' });
                    if (item.type === 'folder') {
                        hasFolderDeleted = true;
                        deletedFolderPaths.push(item.path);
                    }
                    successCount++;
                    console.log(`[清空] 已移到回收站: ${item.name}`);
                } catch (deleteError) {
                    // 已复制到回收站，但删除原文件失败
                    failCount++;
                    console.error(`[清空] 已移到回收站但删除原文件失败: ${item.name}`, deleteError);
                    showNotification(`⚠️ "${item.name}" 已在回收站，但原文件删除失败`, 'warning', 4000);
                }
            } else {
                // 移动失败，跳过此项（不做永久删除）
                failCount++;
                console.log(`[清空] 移动到回收站失败，已跳过: ${item.name}`);
            }
        } catch (error) {
            failCount++;
            console.error(`[清空] 操作失败: ${item.name}`, error);
        }
    }
    
    // 完成删除，设置进度为100%
    updateProgress(100);
    
    showLoading('正在刷新...', '正在重新加载文件列表...', false);
    
    // 重新加载文件列表
    await loadCurrentDirectory();
    
    // 如果删除了文件夹，清理展开状态并更新文件树
    if (hasFolderDeleted) {
        showLoading('正在刷新...', '正在更新文件树...', false);
        // 清理已删除文件夹及其子文件夹的展开状态
        deletedFolderPaths.forEach(path => {
            const pathsToDelete = Array.from(expandedFolders).filter(p => p === path || p.startsWith(path + '/'));
            pathsToDelete.forEach(p => expandedFolders.delete(p));
        });
        
        await updateFileTree();
    }
    
        hideLoading();
    
        // 显示结果
        if (failCount === 0) {
            showNotification(`✅ 已成功删除 ${successCount} 项`, 'success');
        } else {
            showNotification(`⚠️ 成功 ${successCount} 项，失败 ${failCount} 项`, 'warning');
        }
    } catch (error) {
        hideLoading();
        console.error('[清空] 删除失败:', error);
        showNotification('❌ 删除操作失败', 'error');
    } finally {
        isDeleting = false;  // 释放锁
        isOperating = false;
    }
});

// 创建文件/文件夹项
function createFileItem(item) {
    const div = document.createElement('div');
    div.className = item.type === 'folder' ? 'file-item folder' : 'file-item';
    
    const icon = item.type === 'folder' ? '📁' : getFileIcon(item.name);
    const size = item.type === 'folder' ? '文件夹' : formatFileSize(item.size);
    
    // 使用完整磁盘路径（如果设置了）或相对路径
    let fullPath;
    if (rootFolderFullPath) {
        fullPath = item.path ? `${rootFolderFullPath}\\${item.path.replace(/\//g, '\\')}` : rootFolderFullPath;
    } else {
        fullPath = rootDirectoryHandle ? `${rootDirectoryHandle.name}/${item.path}` : item.path;
    }
    
    // 使用 path 作为唯一标识
    const itemPath = item.path.replace(/'/g, "\\'");
    const itemName = item.name.replace(/'/g, "\\'");
    
    if (item.type === 'folder') {
        div.innerHTML = `
            <div class="file-info">
                <span class="file-icon">${icon}</span>
                <div class="file-details">
                    <div class="file-name">${item.name}</div>
                    <div class="file-path-info">
                        <span class="file-size">${size}</span>
                        <span class="path-separator">•</span>
                        <span class="location-icon">📍</span>
                        <span class="file-location" title="${fullPath}">${fullPath}</span>
                    </div>
                </div>
            </div>
            <div class="file-actions">
                <button class="btn btn-enter" onclick='enterFolderByPath("${itemPath}")'>
                    <span class="icon">📂</span>
                    打开
                </button>
                <button class="btn btn-edit" onclick='renameItemByPath("${itemPath}", "folder")'>
                    <span class="icon">✏️</span>
                    重命名
                </button>
                <button class="btn btn-danger" onclick='deleteItemByPath("${itemPath}", "folder")'>
                    <span class="icon">🗑️</span>
                    删除
                </button>
            </div>
        `;
    } else {
        div.innerHTML = `
            <div class="file-info">
                <span class="file-icon">${icon}</span>
                <div class="file-details">
                    <div class="file-name">${item.name}</div>
                    <div class="file-path-info">
                        <span class="file-size">${size}</span>
                        <span class="path-separator">•</span>
                        <span class="location-icon">📍</span>
                        <span class="file-location" title="${fullPath}">${fullPath}</span>
                    </div>
                </div>
            </div>
            <div class="file-actions">
                <button class="btn btn-download" onclick='downloadFileByPath("${itemPath}")' title="下载文件">
                    <span class="icon">💾</span>
                    下载
                </button>
                <button class="btn btn-preview" onclick='previewFileByPath("${itemPath}")'>
                    <span class="icon">👁️</span>
                    预览
                </button>
                <button class="btn btn-edit" onclick='renameItemByPath("${itemPath}", "file")'>
                    <span class="icon">✏️</span>
                    重命名
                </button>
                <button class="btn btn-danger" onclick='deleteItemByPath("${itemPath}", "file")'>
                    <span class="icon">🗑️</span>
                    删除
                </button>
            </div>
        `;
    }
    
    return div;
}

// 初始化回收站文件夹
async function initTrashFolder() {
    try {
        if (!rootDirectoryHandle) return false;
        
        // 获取或创建回收站文件夹
        trashFolderHandle = await rootDirectoryHandle.getDirectoryHandle(TRASH_FOLDER_NAME, { create: true });
        console.log('[回收站] 初始化成功');
        return true;
    } catch (error) {
        console.error('[回收站] 初始化失败:', error);
        return false;
    }
}

// 生成格式化的日期时间字符串（年月日时分秒）
function formatDateTime(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    return `${year}${month}${day}_${hours}${minutes}${seconds}`;
}

// 移动文件到回收站
async function moveToTrash(itemHandle, itemName, itemType) {
    try {
        // 确保回收站已初始化
        if (!trashFolderHandle) {
            const initialized = await initTrashFolder();
            if (!initialized) {
                throw new Error('回收站初始化失败');
            }
        }
        
        // 生成带日期时间的名称避免冲突
        const now = new Date();
        const dateTimeStr = formatDateTime(now);
        const trashName = `${dateTimeStr}_${itemName}`;
        
        if (itemType === 'file') {
            // 移动文件到回收站
            const file = await itemHandle.getFile();
            const trashFileHandle = await trashFolderHandle.getFileHandle(trashName, { create: true });
            const writable = await trashFileHandle.createWritable();
            await writable.write(file);
            await writable.close();
        } else {
            // 移动文件夹到回收站
            const trashDirHandle = await trashFolderHandle.getDirectoryHandle(trashName, { create: true });
            await copyFolderContents(itemHandle, trashDirHandle);
        }
        
        console.log(`[回收站] 已移入: ${itemName} -> ${trashName}`);
        return true;
    } catch (error) {
        console.error('[回收站] 移动失败:', error);
        return false;
    }
}

// 递归复制文件夹内容（带进度回调）
async function copyFolderContents(sourceHandle, targetHandle, progressCallback = null) {
    let copiedCount = 0;
    let errorCount = 0;
    
    try {
        for await (const entry of sourceHandle.values()) {
            try {
                if (entry.kind === 'file') {
                    // 复制文件
                    const file = await entry.getFile();
                    const newFileHandle = await targetHandle.getFileHandle(entry.name, { create: true });
                    const writable = await newFileHandle.createWritable();
                    await writable.write(file);
                    await writable.close();
                    copiedCount++;
                    
                    // 调用进度回调
                    if (progressCallback) {
                        progressCallback(entry.name, copiedCount);
                    }
                    
                    console.log(`[复制] 文件: ${entry.name}`);
                } else if (entry.kind === 'directory') {
                    // 递归复制子文件夹
                    const newDirHandle = await targetHandle.getDirectoryHandle(entry.name, { create: true });
                    const result = await copyFolderContents(entry, newDirHandle, progressCallback);
                    copiedCount += result.copiedCount;
                    errorCount += result.errorCount;
                    console.log(`[复制] 文件夹: ${entry.name}`);
                }
            } catch (error) {
                console.error(`[复制] 失败: ${entry.name}`, error);
                errorCount++;
            }
        }
    } catch (error) {
        console.error('[复制] 遍历文件夹失败:', error);
        errorCount++;
    }
    
    return { copiedCount, errorCount };
}

// 通过路径下载文件
window.downloadFileByPath = async function(path) {
    try {
        // 从所有列表中查找该文件
        let file = fileList.find(item => item.path === path && item.type === 'file');
        
        if (!file && searchKeyword) {
            file = filteredFileList.find(item => item.path === path && item.type === 'file');
        }
        
        if (!file) {
            showNotification('❌ 未找到该文件', 'error');
            return;
        }
        
        showNotification('💾 正在准备下载...', 'info');
        const fileObj = await file.handle.getFile();
        const url = URL.createObjectURL(fileObj);
        
        // 创建下载链接
        const a = document.createElement('a');
        a.href = url;
        a.download = fileObj.name;
        a.click();
        
        // 延迟释放URL
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        
        showNotification(`✅ 已下载: ${fileObj.name}`, 'success');
        console.log('[下载] 文件:', fileObj.name);
    } catch (error) {
        console.error('[下载] 失败:', error);
        showNotification('❌ 下载失败', 'error');
    }
};

// 构建文件树数据
async function buildFileTree(dirHandle, basePath = '') {
    const tree = {
        name: dirHandle.name,
        path: basePath,
        type: 'folder',
        handle: dirHandle,
        children: []
    };
    
    try {
        for await (const entry of dirHandle.values()) {
            if (entry.kind === 'directory') {
                // 在根目录时，跳过回收站文件夹
                if (basePath === '' && entry.name === TRASH_FOLDER_NAME) {
                    continue;
                }
                
                const childPath = basePath ? `${basePath}/${entry.name}` : entry.name;
                const childTree = await buildFileTree(entry, childPath);
                tree.children.push(childTree);
            }
        }
        
        // 按名称排序
        tree.children.sort((a, b) => a.name.localeCompare(b.name));
    } catch (error) {
        console.error('[文件树] 构建失败:', error);
    }
    
    return tree;
}

// 更新文件树
async function updateFileTree() {
    if (!rootDirectoryHandle) return;
    
    fileTreeData = await buildFileTree(rootDirectoryHandle, '');
    
    // 确保根节点始终展开
    expandedFolders.add('');
    
    renderFileTree();
}

// 渲染文件树
function renderFileTree() {
    if (!fileTreeData) {
        fileTree.innerHTML = '<div class="tree-empty">暂无数据</div>';
        return;
    }
    
    fileTree.innerHTML = '';
    const rootNode = createTreeNode(fileTreeData, 0);
    fileTree.appendChild(rootNode);
}

// 创建树节点
function createTreeNode(node, level) {
    const div = document.createElement('div');
    div.className = 'tree-node';
    
    const itemDiv = document.createElement('div');
    itemDiv.className = 'tree-item';
    itemDiv.style.paddingLeft = `${level * 20}px`;
    
    // 当前路径高亮
    if (node.path === currentPath) {
        itemDiv.classList.add('tree-item-active');
    }
    
    const hasChildren = node.children && node.children.length > 0;
    const isExpanded = expandedFolders.has(node.path);
    
    // 展开/折叠图标
    const toggleIcon = document.createElement('span');
    toggleIcon.className = 'tree-toggle';
    if (hasChildren) {
        toggleIcon.textContent = isExpanded ? '▼' : '▶';
        toggleIcon.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleFolder(node.path);
        });
    } else {
        toggleIcon.textContent = '·';
        toggleIcon.style.opacity = '0.3';
    }
    
    // 文件夹图标
    const icon = document.createElement('span');
    icon.className = 'tree-icon';
    icon.textContent = '📁';
    
    // 文件夹名称
    const name = document.createElement('span');
    name.className = 'tree-name';
    name.textContent = node.name;
    
    // 点击导航
    itemDiv.addEventListener('click', () => navigateToTreeNode(node));
    
    itemDiv.appendChild(toggleIcon);
    itemDiv.appendChild(icon);
    itemDiv.appendChild(name);
    div.appendChild(itemDiv);
    
    // 子节点
    if (hasChildren && isExpanded) {
        const childrenDiv = document.createElement('div');
        childrenDiv.className = 'tree-children';
        node.children.forEach(child => {
            childrenDiv.appendChild(createTreeNode(child, level + 1));
        });
        div.appendChild(childrenDiv);
    }
    
    return div;
}

// 切换文件夹展开/折叠
function toggleFolder(path) {
    if (expandedFolders.has(path)) {
        expandedFolders.delete(path);
    } else {
        expandedFolders.add(path);
    }
    renderFileTree();
}

// 导航到树节点
async function navigateToTreeNode(node) {
    try {
        // 构建目录栈
        const pathParts = node.path ? node.path.split('/') : [];
        directoryStack = [rootDirectoryHandle];
        
        let currentHandle = rootDirectoryHandle;
        for (const part of pathParts) {
            currentHandle = await currentHandle.getDirectoryHandle(part);
            directoryStack.push(currentHandle);
        }
        
        currentDirectoryHandle = currentHandle;
        currentPath = node.path;
        
        updateBreadcrumb();
        await loadCurrentDirectory();
        renderFileTree(); // 重新渲染树以更新高亮
    } catch (error) {
        console.error('[文件树] 导航失败:', error);
        showNotification('❌ 导航失败', 'error');
    }
}

// 切换树侧边栏
toggleTreeBtn.addEventListener('click', () => {
    isTreeCollapsed = !isTreeCollapsed;
    if (isTreeCollapsed) {
        fileTreeSection.classList.add('collapsed');
        toggleTreeIcon.textContent = '▶';
    } else {
        fileTreeSection.classList.remove('collapsed');
        toggleTreeIcon.textContent = '◀';
    }
});

// 通过路径进入文件夹
window.enterFolderByPath = async function(path) {
    try {
        // 从所有列表中查找该文件夹
        let folder = fileList.find(item => item.path === path && item.type === 'folder');
        
        if (!folder && searchKeyword) {
            folder = filteredFileList.find(item => item.path === path && item.type === 'folder');
        }
        
        if (!folder) {
            showNotification('❌ 未找到该文件夹', 'error');
            return;
        }
        
        // 检查是否是当前目录的直接子文件夹
        const isDirectChild = folder.path === (currentPath ? `${currentPath}/${folder.name}` : folder.name);
        
        if (isDirectChild) {
            // 如果是直接子文件夹，直接添加到栈
            currentDirectoryHandle = folder.handle;
            directoryStack.push(folder.handle);
            currentPath = folder.path;
        } else {
            // 如果不是直接子文件夹（比如从搜索结果进入），需要重建完整路径
            const pathParts = folder.path.split('/');
            directoryStack = [rootDirectoryHandle];
            
            let currentHandle = rootDirectoryHandle;
            let builtPath = '';
            
            for (const part of pathParts) {
                currentHandle = await currentHandle.getDirectoryHandle(part);
                directoryStack.push(currentHandle);
                builtPath = builtPath ? `${builtPath}/${part}` : part;
            }
            
            currentDirectoryHandle = currentHandle;
            currentPath = folder.path;
        }
        
        updateBreadcrumb();
        await loadCurrentDirectory();
        renderFileTree(); // 只需重新渲染，不需要重建树
    } catch (error) {
        console.error('进入文件夹时出错:', error);
        showNotification('❌ 无法打开文件夹', 'error');
    }
};

// 获取文件图标
function getFileIcon(fileName) {
    const ext = fileName.split('.').pop().toLowerCase();
    const iconMap = {
        'pdf': '📄',
        'doc': '📝',
        'docx': '📝',
        'txt': '📃',
        'jpg': '🖼️',
        'jpeg': '🖼️',
        'png': '🖼️',
        'gif': '🖼️',
        'mp4': '🎬',
        'avi': '🎬',
        'mp3': '🎵',
        'wav': '🎵',
        'zip': '📦',
        'rar': '📦',
        'exe': '⚙️',
        'html': '🌐',
        'css': '🎨',
        'js': '💻',
        'json': '📋',
        'xml': '📋'
    };
    
    return iconMap[ext] || '📄';
}

// 格式化文件大小
function formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// 通过路径重命名文件或文件夹
window.renameItemByPath = function(path, type) {
    // 只允许重命名当前目录下的项目
    const pathParts = path.split('/');
    const currentDepth = currentPath ? currentPath.split('/').length : 0;
    const itemDepth = pathParts.length;
    
    // 检查是否是当前目录的直接子项
    const isDirectChild = itemDepth === currentDepth + 1;
    
    if (!isDirectChild) {
        showNotification('⚠️ 只能重命名当前目录下的文件，请先进入该文件所在目录', 'warning', 4000);
        return;
    }
    
    // 在当前目录的 fileList 中查找
    const index = fileList.findIndex(item => item.path === path && item.type === type);
    if (index === -1) {
        showNotification('❌ 未找到该文件', 'error');
        return;
    }
    
    const item = fileList[index];
    
    // 禁止重命名回收站文件夹
    if (type === 'folder' && item.name === TRASH_FOLDER_NAME && !currentPath) {
        showNotification('⚠️ 不能重命名系统回收站文件夹', 'warning', 3000);
        return;
    }
    
    currentRenameIndex = index;
    currentRenameType = type;
    
    // 如果是文件，只显示文件名部分（不含扩展名）
    if (type === 'file') {
        const lastDotIndex = item.name.lastIndexOf('.');
        if (lastDotIndex > 0) {
            newFileNameInput.value = item.name.substring(0, lastDotIndex);
        } else {
            newFileNameInput.value = item.name;
        }
    } else {
        newFileNameInput.value = item.name;
    }
    
    renameModal.classList.add('active');
    newFileNameInput.focus();
    newFileNameInput.select();
};

// 确认重命名
confirmRenameBtn.addEventListener('click', async () => {
    if (currentRenameIndex === null) return;
    
    // 防止并发操作
    if (isRenaming || isOperating) {
        showNotification('⚠️ 有操作正在进行中，请稍候', 'warning');
        return;
    }
    
    const newName = newFileNameInput.value.trim();
    
    if (!newName) {
        alert('名称不能为空');
        return;
    }
    
    const item = fileList[currentRenameIndex];
    
    // 检查文件夹名称是否包含非法字符
    if (/[<>:"/\\|?*]/.test(newName)) {
        alert('名称包含非法字符（< > : " / \\ | ? *）');
        return;
    }
    
    isRenaming = true;
    isOperating = true;
    
    try {
        if (currentRenameType === 'file') {
            // 获取原文件的扩展名
            const lastDotIndex = item.name.lastIndexOf('.');
            let extension = '';
            let originalNameWithoutExt = item.name;
            
            if (lastDotIndex > 0) {
                extension = item.name.substring(lastDotIndex);
                originalNameWithoutExt = item.name.substring(0, lastDotIndex);
            }
            
            // 检查是否实际修改了名称
            if (newName === originalNameWithoutExt) {
                renameModal.classList.remove('active');
                isRenaming = false;  // 释放锁
                isOperating = false;  // 释放锁
                return;
            }
            
            // 自动添加扩展名
            const finalName = extension ? `${newName}${extension}` : newName;
            
            // 检查新文件名是否已存在
            try {
                await currentDirectoryHandle.getFileHandle(finalName);
                alert(`文件名 "${finalName}" 已存在，请使用其他名称`);
                isRenaming = false;  // 释放锁
                isOperating = false;  // 释放锁
                return;
            } catch (e) {
                // 文件不存在，可以继续
            }
            
            // 检查文件大小（防止重命名超大文件导致崩溃）
            const file = await item.handle.getFile();
            
            if (file.size > MAX_FILE_SIZE) {
                const fileSize = formatFileSizeForDisplay(file.size);
                const maxSize = formatFileSizeForDisplay(MAX_FILE_SIZE);
                showNotification(
                    `⚠️ 文件过大（${fileSize}），超出限制（${maxSize}）\n无法重命名，请到磁盘手动操作`,
                    'error',
                    6000
                );
                isRenaming = false;  // 释放锁
                isOperating = false;  // 释放锁
                return;
            }
            
            showLoading('正在重命名文件...', `${item.name} → ${finalName}`);
            
            // 重命名文件（使用流式处理，避免大文件内存问题）
            const newFileHandle = await currentDirectoryHandle.getFileHandle(finalName, { create: true });
            const writable = await newFileHandle.createWritable();
            await writable.write(file);  // 直接写入File对象，浏览器会处理流式传输
            await writable.close();
            
            await currentDirectoryHandle.removeEntry(item.name);
            
            hideLoading();
            showNotification(`✅ 文件已重命名为 "${finalName}"`, 'success');
        } else {
            // 文件夹重命名
            // 检查是否实际修改了名称
            if (newName === item.name) {
                renameModal.classList.remove('active');
                isRenaming = false;  // 释放锁
                isOperating = false;  // 释放锁
                return;
            }
            
            // 禁止重命名为回收站名称（在根目录时）
            if (newName === TRASH_FOLDER_NAME && !currentPath) {
                alert('此名称为系统保留，请使用其他名称');
                isRenaming = false;  // 释放锁
                isOperating = false;  // 释放锁
                return;
            }
            
            // 检查新文件夹名是否已存在
            try {
                await currentDirectoryHandle.getDirectoryHandle(newName);
                alert(`文件夹名 "${newName}" 已存在，请使用其他名称`);
                isRenaming = false;  // 释放锁
                isOperating = false;  // 释放锁
                return;
            } catch (e) {
                // 文件夹不存在，可以继续
            }
            
            // 确认操作
            const confirmRename = confirm(`文件夹重命名需要复制所有内容，可能需要较长时间。\n\n确定要将 "${item.name}" 重命名为 "${newName}" 吗？`);
            if (!confirmRename) {
                isRenaming = false;  // 释放锁
                isOperating = false;  // 释放锁
                return;
            }
            
            showLoading('正在重命名文件夹...', `${item.name} → ${newName}`, true);
            updateProgress(0);
            
            let newDirHandle = null;
            let totalCopied = 0;
            
            try {
                // 创建新文件夹
                newDirHandle = await currentDirectoryHandle.getDirectoryHandle(newName, { create: true });
                
                showLoading('正在复制文件夹内容...', '正在统计文件数量...', true);
                
                // 递归复制所有内容，带进度回调
                console.log(`[重命名] 开始复制文件夹: ${item.name} -> ${newName}`);
                
                const result = await copyFolderContents(item.handle, newDirHandle, (fileName, count) => {
                    totalCopied = count;
                    showLoading(
                        '正在复制文件夹内容...', 
                        `已复制 ${count} 个文件: ${fileName}`,
                        true
                    );
                    // 无法精确计算百分比，使用脉冲式进度
                    const pulseProgress = 10 + (count % 80);
                    updateProgress(pulseProgress);
                });
                
                console.log(`[重命名] 复制完成: 成功 ${result.copiedCount} 项，失败 ${result.errorCount} 项`);
                
                if (result.errorCount > 0) {
                    hideLoading();
                    // 复制过程有错误，询问是否继续
                    const continueDelete = confirm(`复制过程中有 ${result.errorCount} 个项目失败。\n\n是否仍要删除旧文件夹 "${item.name}"？\n（选择"取消"将保留旧文件夹）`);
                    
                    if (!continueDelete) {
                        showNotification(`⚠️ 新文件夹 "${newName}" 已创建，旧文件夹 "${item.name}" 已保留`, 'warning', 5000);
                        await loadCurrentDirectory();
                        await updateFileTree();
                        renameModal.classList.remove('active');
                        currentRenameIndex = null;
                        currentRenameType = null;
                        isRenaming = false;  // 释放锁
                        isOperating = false;  // 释放锁
                        return;
                    }
                    showLoading('正在删除旧文件夹...', '');
                }
                
                showLoading('正在删除旧文件夹...', `删除 ${item.name}`);
                
                // 删除旧文件夹
                await currentDirectoryHandle.removeEntry(item.name, { recursive: true });
                
                showLoading('正在更新文件树...', '');
                
                // 清理旧文件夹的展开状态
                const oldPath = item.path;
                const pathsToDelete = Array.from(expandedFolders).filter(p => p === oldPath || p.startsWith(oldPath + '/'));
                pathsToDelete.forEach(p => expandedFolders.delete(p));
                
                // 更新文件树
                await updateFileTree();
                
                hideLoading();
                // 优化提示信息
                let message = `✅ 文件夹已重命名为 "${newName}"`;
                if (result.copiedCount > 0) {
                    message += `（已复制 ${result.copiedCount} 项）`;
                } else {
                    message += `（空文件夹）`;
                }
                showNotification(message, 'success', 4000);
                
            } catch (error) {
                console.error('[重命名] 失败:', error);
                hideLoading();
                
                // 尝试清理已创建的新文件夹
                if (newDirHandle) {
                    try {
                        await currentDirectoryHandle.removeEntry(newName, { recursive: true });
                        console.log('[重命名] 已清理未完成的新文件夹');
                    } catch (cleanupError) {
                        console.error('[重命名] 清理失败:', cleanupError);
                    }
                }
                
                showNotification('❌ 文件夹重命名失败', 'error');
                throw error;
            }
        }
        
        showLoading('正在刷新...', '');
        await loadCurrentDirectory();
        hideLoading();
        
        renameModal.classList.remove('active');
        currentRenameIndex = null;
        currentRenameType = null;
    } catch (error) {
        hideLoading();
        console.error('重命名时出错:', error);
        showNotification('❌ 重命名失败，请重试', 'error');
    } finally {
        isRenaming = false;  // 释放锁
        isOperating = false;
    }
});

// 取消重命名
cancelRenameBtn.addEventListener('click', () => {
    renameModal.classList.remove('active');
    currentRenameIndex = null;
    currentRenameType = null;
    isRenaming = false;  // 释放锁
    isOperating = false;  // 释放锁
});

// 点击重命名模态框外部关闭
renameModal.addEventListener('click', (e) => {
    if (e.target === renameModal) {
        renameModal.classList.remove('active');
        currentRenameIndex = null;
        currentRenameType = null;
        isRenaming = false;  // 释放锁
        isOperating = false;  // 释放锁
    }
});

// 回车确认重命名
newFileNameInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        confirmRenameBtn.click();
    }
});

// 删除文件或文件夹
window.deleteItem = async function(index, type) {
    const item = fileList[index];
    const itemType = type === 'folder' ? '文件夹' : '文件';
    
    if (!confirm(`确定要删除${itemType} "${item.name}" 吗？${type === 'folder' ? '\n注意：文件夹中的所有内容也将被删除！' : ''}`)) {
        return;
    }
    
    try {
        await currentDirectoryHandle.removeEntry(item.name, { recursive: type === 'folder' });
        await loadCurrentDirectory();
    } catch (error) {
        console.error('删除时出错:', error);
        alert(`删除${itemType}失败`);
    }
};

// 通过路径删除文件或文件夹
window.deleteItemByPath = async function(path, type) {
    // 防止并发操作
    if (isDeleting || isOperating) {
        showNotification('⚠️ 有操作正在进行中，请稍候', 'warning');
        return;
    }
    
    // 从路径中提取文件名（最后一部分）
    const pathParts = path.split('/');
    const name = pathParts[pathParts.length - 1];
    
    // 禁止删除回收站文件夹
    if (type === 'folder' && name === TRASH_FOLDER_NAME && pathParts.length === 1) {
        showNotification('⚠️ 不能删除系统回收站文件夹', 'warning', 3000);
        return;
    }
    
    const itemType = type === 'folder' ? '文件夹' : '文件';
    
    // 询问用户删除方式
    const deleteOption = confirm(`确定要删除${itemType} "${name}" 吗？\n\n点击"确定"移到回收站\n点击"取消"则不删除${type === 'folder' ? '\n\n⚠️ 文件夹中的所有内容也将一起移动' : ''}`);
    
    if (!deleteOption) {
        return;
    }
    
    isDeleting = true;
    isOperating = true;
    
    try {
        showLoading('正在删除...', `正在处理 ${itemType} "${name}"`);
        
        // 定位到文件/文件夹所在的目录
        let targetDirHandle = rootDirectoryHandle;
        let itemHandle = null;
        
        if (pathParts.length > 1) {
            // 文件在子目录中，需要导航到该目录
            const dirPath = pathParts.slice(0, -1);
            for (const dirName of dirPath) {
                targetDirHandle = await targetDirHandle.getDirectoryHandle(dirName);
            }
        }
        
        // 获取项目句柄
        if (type === 'file') {
            itemHandle = await targetDirHandle.getFileHandle(name);
        } else {
            itemHandle = await targetDirHandle.getDirectoryHandle(name);
        }
        
        // 移动到回收站
        showLoading('正在移动到回收站...', `${itemType} "${name}"`);
        const moved = await moveToTrash(itemHandle, name, type);
        
        if (moved) {
            try {
                // 移动成功后删除原文件
                showLoading('正在删除原文件...', `${itemType} "${name}"`);
                await targetDirHandle.removeEntry(name, { recursive: type === 'folder' });
                hideLoading();
                showNotification(`✅ ${itemType} "${name}" 已移到回收站`, 'success');
            } catch (deleteError) {
                hideLoading();
                // 已复制到回收站，但删除原文件失败
                console.error('[删除] 已移到回收站但删除原文件失败:', deleteError);
                showNotification(`⚠️ 文件已在回收站，但原文件删除失败，请手动删除`, 'warning', 5000);
            }
        } else {
            hideLoading();
            // 移动失败，询问是否永久删除
            const permanentDelete = confirm(`移动到回收站失败。\n\n是否要永久删除${itemType} "${name}"？\n⚠️ 此操作不可恢复！`);
            if (permanentDelete) {
                showLoading('正在永久删除...', `${itemType} "${name}"`);
                await targetDirHandle.removeEntry(name, { recursive: type === 'folder' });
                hideLoading();
                showNotification(`✅ 已永久删除: ${name}`, 'success');
            } else {
                showNotification('❌ 删除已取消', 'info');
                isDeleting = false;  // 释放锁
                isOperating = false;  // 释放锁
                return;
            }
        }
        
        showLoading('正在刷新...', '正在更新列表...');
        
        // 如果在搜索状态，重新执行搜索
        if (searchKeyword) {
            const allFiles = await searchAllDirectories(currentDirectoryHandle, currentPath);
            filteredFileList = allFiles.filter(item => {
                return item.name.toLowerCase().includes(searchKeyword);
            });
            filteredFileList.sort((a, b) => {
                if (a.type === b.type) {
                    return a.name.localeCompare(b.name);
                }
                return a.type === 'folder' ? -1 : 1;
            });
            updateFileList();
        } else {
            // 如果不在搜索状态，判断是否需要刷新当前目录
            let isInCurrentDir = false;
            
            if (!currentPath) {
                // 在根目录：只有一级路径的项目属于当前目录
                isInCurrentDir = pathParts.length === 1;
            } else {
                // 在子目录：检查是否是当前目录的直接子项
                isInCurrentDir = path.startsWith(currentPath + '/') && pathParts.length === currentPath.split('/').length + 1;
            }
            
            if (isInCurrentDir) {
                await loadCurrentDirectory();
            }
        }
        
        if (type === 'folder') {
            // 清理已删除文件夹及其子文件夹的展开状态
            const deletedPaths = Array.from(expandedFolders).filter(p => p === path || p.startsWith(path + '/'));
            deletedPaths.forEach(p => expandedFolders.delete(p));
            
            await updateFileTree(); // 删除文件夹后更新文件树
        }
        
        hideLoading();
    } catch (error) {
        hideLoading();
        console.error('删除时出错:', error);
        showNotification(`❌ 删除${itemType}失败`, 'error');
    } finally {
        isDeleting = false;  // 释放锁
        isOperating = false;
    }
};

// 通过路径预览文件
window.previewFileByPath = async function(path) {
    try {
        // 从所有列表中查找该文件
        let file = fileList.find(item => item.path === path && item.type === 'file');
        
        if (!file && searchKeyword) {
            file = filteredFileList.find(item => item.path === path && item.type === 'file');
        }
        
        if (!file) {
            showNotification('❌ 未找到该文件', 'error');
            return;
        }
        
        previewTitle.textContent = `预览: ${file.name}`;
        previewContent.innerHTML = '<div style="padding: 40px; color: #718096;">加载中...</div>';
        previewModal.classList.add('active');
        
        const fileObj = await file.handle.getFile();
        const fileType = getFileType(file.name);
        
        switch (fileType) {
            case 'image':
                await previewImage(fileObj);
                break;
            case 'text':
                await previewText(fileObj);
                break;
            case 'pdf':
                await previewPDF(fileObj);
                break;
            case 'video':
                await previewVideo(fileObj);
                break;
            case 'audio':
                await previewAudio(fileObj);
                break;
            default:
                showUnsupportedPreview(file);
        }
    } catch (error) {
        console.error('预览文件时出错:', error);
        previewContent.innerHTML = `
            <div class="preview-unsupported">
                <div class="icon">⚠️</div>
                <p>预览失败</p>
                <p class="file-info-text">无法加载此文件</p>
            </div>
        `;
    }
};

// 获取文件类型
function getFileType(fileName) {
    const ext = fileName.split('.').pop().toLowerCase();
    
    const types = {
        image: ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg'],
        text: ['txt', 'js', 'css', 'html', 'json', 'xml', 'md', 'csv', 'log', 'py', 'java', 'cpp', 'c', 'h', 'ts', 'jsx', 'tsx', 'vue', 'php', 'rb', 'go', 'rs', 'swift', 'kt'],
        pdf: ['pdf'],
        video: ['mp4', 'webm', 'ogg', 'avi', 'mov'],
        audio: ['mp3', 'wav', 'ogg', 'm4a', 'aac']
    };
    
    for (const [type, extensions] of Object.entries(types)) {
        if (extensions.includes(ext)) {
            return type;
        }
    }
    
    return 'unsupported';
}

// 预览图片
async function previewImage(file) {
    // 释放之前的URL
    if (currentPreviewURL) {
        URL.revokeObjectURL(currentPreviewURL);
        currentPreviewURL = null;
    }
    const url = URL.createObjectURL(file);
    currentPreviewURL = url;
    previewContent.innerHTML = `
        <img src="${url}" class="preview-image" alt="预览图片">
    `;
}

// 预览文本
async function previewText(file) {
    // 释放之前的URL（文本不需要URL，但为了一致性）
    if (currentPreviewURL) {
        URL.revokeObjectURL(currentPreviewURL);
        currentPreviewURL = null;
    }
    const text = await file.text();
    const escapedText = escapeHtml(text);
    previewContent.innerHTML = `
        <pre class="preview-text">${escapedText}</pre>
    `;
}

// 预览PDF
async function previewPDF(file) {
    // 释放之前的URL
    if (currentPreviewURL) {
        URL.revokeObjectURL(currentPreviewURL);
        currentPreviewURL = null;
    }
    const url = URL.createObjectURL(file);
    currentPreviewURL = url;
    previewContent.innerHTML = `
        <iframe src="${url}" class="preview-pdf"></iframe>
    `;
}

// 预览视频
async function previewVideo(file) {
    // 释放之前的URL
    if (currentPreviewURL) {
        URL.revokeObjectURL(currentPreviewURL);
        currentPreviewURL = null;
    }
    const url = URL.createObjectURL(file);
    currentPreviewURL = url;
    previewContent.innerHTML = `
        <video controls class="preview-video">
            <source src="${url}" type="${file.type}">
            您的浏览器不支持视频播放
        </video>
    `;
}

// 预览音频
async function previewAudio(file) {
    // 释放之前的URL
    if (currentPreviewURL) {
        URL.revokeObjectURL(currentPreviewURL);
        currentPreviewURL = null;
    }
    const url = URL.createObjectURL(file);
    currentPreviewURL = url;
    previewContent.innerHTML = `
        <audio controls class="preview-audio">
            <source src="${url}" type="${file.type}">
            您的浏览器不支持音频播放
        </audio>
    `;
}

// 显示不支持的文件类型
function showUnsupportedPreview(item) {
    const fileIcon = getFileIcon(item.name);
    const fileSize = formatFileSize(item.size);
    
    previewContent.innerHTML = `
        <div class="preview-unsupported">
            <div class="icon">${fileIcon}</div>
            <p>此文件类型暂不支持预览</p>
            <p class="file-info-text">${item.name}</p>
            <p class="file-info-text">大小: ${fileSize}</p>
        </div>
    `;
}

// HTML转义
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// 关闭预览
closePreviewBtn.addEventListener('click', () => {
    // 释放ObjectURL
    if (currentPreviewURL) {
        URL.revokeObjectURL(currentPreviewURL);
        currentPreviewURL = null;
    }
    previewModal.classList.remove('active');
    previewContent.innerHTML = '';
});

// 点击预览模态框外部关闭
previewModal.addEventListener('click', (e) => {
    if (e.target === previewModal) {
        // 释放ObjectURL
        if (currentPreviewURL) {
            URL.revokeObjectURL(currentPreviewURL);
            currentPreviewURL = null;
        }
        previewModal.classList.remove('active');
        previewContent.innerHTML = '';
    }
});

// ESC 键关闭所有模态框
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        // 关闭重命名模态框
        if (renameModal.classList.contains('active')) {
            renameModal.classList.remove('active');
            currentRenameIndex = null;
            currentRenameType = null;
            isRenaming = false;  // 释放锁
            isOperating = false;  // 释放锁
        }
        
        // 关闭创建文件夹模态框
        if (createFolderModal.classList.contains('active')) {
            createFolderModal.classList.remove('active');
        }
        
        // 关闭预览模态框
        if (previewModal.classList.contains('active')) {
            // 释放ObjectURL
            if (currentPreviewURL) {
                URL.revokeObjectURL(currentPreviewURL);
                currentPreviewURL = null;
            }
            previewModal.classList.remove('active');
            previewContent.innerHTML = '';
        }
        
        // 注意：不关闭设置路径模态框，因为这是初始化必需的
    }
});
