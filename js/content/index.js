(function (win) {
    // 常量定义
    const CONNECTION_RETRY_DELAY = 1000;
    const NOTIFICATION_DISPLAY_TIME = 5000;
    
    // 工具函数
    const createNotification = (message) => {
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: #ff4444;
            color: white;
            padding: 10px 20px;
            border-radius: 4px;
            z-index: 999999;
        `;
        notification.textContent = message;
        document.body.appendChild(notification);
        setTimeout(() => notification.remove(), NOTIFICATION_DISPLAY_TIME);
    };

    const injectJs = (path, callback) => {
        const script = document.createElement('script');
        script.src = chrome.runtime.getURL(path);
        script.onload = function () {
            this.remove();
            callback?.();
        };
        (document.head || document.documentElement).appendChild(script);
    };

    // 连接管理
    let connect = null;
    let isConnecting = false;
    
    const handleConnectionError = (error) => {
        console.warn('Connection error:', error);
        if (error.message.includes('Extension context invalidated')) {
            console.warn('Extension has been reloaded or updated. Please refresh the page.');
            createNotification('扩展已更新，请刷新页面');
            return true;
        }
        return false;
    };

    const setupConnection = () => {
        if (isConnecting) return;
        
        try {
            isConnecting = true;
            connect = chrome.runtime.connect({name: "cross_request-bridge"});
            
            connect.onDisconnect.addListener(() => {
                isConnecting = false;
                if (chrome.runtime.lastError) {
                    if (!handleConnectionError(chrome.runtime.lastError)) {
                        setTimeout(setupConnection, CONNECTION_RETRY_DELAY);
                    }
                }
            });
        } catch (error) {
            isConnecting = false;
            if (!handleConnectionError(error)) {
                setTimeout(setupConnection, CONNECTION_RETRY_DELAY);
            }
        }
    };

    // 初始化
    const elementById = document.getElementById('cross-request-sign');
    if (!elementById) return;

    const randomId = Math.random().toString(36).slice(2);
    elementById.setAttribute("data-nodeId", randomId);
    
    setupConnection();

    // 消息处理
    win.addEventListener('message', (e) => {
        if (!e?.data || typeof e.data === 'string' || 
            e.data.source !== 'cross_request_page' || 
            !e.data.nodeId || !e.data.req || 
            e.data.nodeId !== randomId) {
            return;
        }

        if (!connect) {
            setupConnection();
        }
        
        try {
            connect.postMessage(e.data);
        } catch (error) {
            if (!handleConnectionError(error)) {
                setupConnection();
            }
        }
    });

    connect?.onMessage.addListener((msg) => {
        if (msg.type !== 'fetch_callback') return;
        msg.source = "cross_request_content";
        win.postMessage(msg, location.origin);
    });

    // 注入脚本
    injectJs('/js/inject/index.js', () => {
        try {
            elementById?.setAttribute('key', 'yapi');
        } catch (e) {
            console.error('Failed to set attribute:', e);
        }
    });
})(window);