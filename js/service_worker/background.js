(function (globalThis) {
    // 常量定义
    const CONSTANTS = {
        CONNECTION_NAME: 'cross_request-bridge',
        DEFAULT_CONFIG: {
            timeout: 5000,
            maxRetries: 3,
            retryDelay: 1000,
            allowedMethods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
            rateLimit: {
                windowMs: 60000,
                max: 100
            }
        },
        CONFIG_LIMITS: {
            timeout: { min: 1000, max: 30000 },
            maxRetries: { min: 0, max: 10 },
            retryDelay: { min: 100, max: 5000 }
        },
        CORS_HEADERS: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
            'Access-Control-Allow-Headers': '*',
            'Access-Control-Allow-Credentials': 'true'
        }
    };

    // 配置管理器
    class ConfigManager {
        constructor() {
            this.config = { ...CONSTANTS.DEFAULT_CONFIG };
        }

        async load() {
            try {
                const result = await chrome.storage.sync.get('requestConfig');
                if (result.requestConfig) {
                    this.config = {
                        ...this.config,
                        ...result.requestConfig,
                        allowedMethods: this.config.allowedMethods,
                        rateLimit: {
                            ...this.config.rateLimit,
                            ...(result.requestConfig.rateLimit || {})
                        }
                    };
                }
            } catch (error) {
                console.warn('配置加载失败:', error);
            }
        }

        async save(newConfig) {
            try {
                this.validateConfig(newConfig);
                const configToSave = {
                    timeout: newConfig.timeout,
                    maxRetries: newConfig.maxRetries,
                    retryDelay: newConfig.retryDelay
                };

                await chrome.storage.sync.set({ requestConfig: configToSave });
                this.config = { ...this.config, ...configToSave };
                return true;
            } catch (error) {
                console.warn('配置保存失败:', error);
                throw error;
            }
        }

        validateConfig(config) {
            const { timeout, maxRetries, retryDelay } = CONSTANTS.CONFIG_LIMITS;
            
            if (config.timeout && (config.timeout < timeout.min || config.timeout > timeout.max)) {
                throw new Error(`超时时间必须在${timeout.min}-${timeout.max}毫秒之间`);
            }
            if (config.maxRetries && (config.maxRetries < maxRetries.min || config.maxRetries > maxRetries.max)) {
                throw new Error(`重试次数必须在${maxRetries.min}-${maxRetries.max}之间`);
            }
            if (config.retryDelay && (config.retryDelay < retryDelay.min || config.retryDelay > retryDelay.max)) {
                throw new Error(`重试延迟必须在${retryDelay.min}-${retryDelay.max}毫秒之间`);
            }
        }

        get() {
            return this.config;
        }
    }

    // 请求管理器
    class RequestManager {
        constructor(configManager) {
            this.configManager = configManager;
            this.requestCounters = new Map();
        }

        isValidUrl(url) {
            try {
                const urlObj = new URL(url);
                return urlObj.protocol === 'http:' || urlObj.protocol === 'https:';
            } catch {
                return false;
            }
        }

        checkRateLimit(origin) {
            const now = Date.now();
            const counter = this.requestCounters.get(origin) || { count: 0, timestamp: now };
            const { windowMs, max } = this.configManager.get().rateLimit;
            
            if (now - counter.timestamp > windowMs) {
                counter.count = 1;
                counter.timestamp = now;
            } else if (counter.count >= max) {
                return false;
            } else {
                counter.count++;
            }
            
            this.requestCounters.set(origin, counter);
            return true;
        }

        async addCorsRule(url) {
            try {
                const urlObj = new URL(url);
                const ruleId = Math.floor(Math.random() * 1000000);
                
                await chrome.declarativeNetRequest.updateDynamicRules({
                    removeRuleIds: [ruleId]
                });

                const rule = {
                    id: ruleId,
                    priority: 1,
                    action: {
                        type: "modifyHeaders",
                        responseHeaders: Object.entries(CONSTANTS.CORS_HEADERS).map(([header, value]) => ({
                            header,
                            operation: "set",
                            value
                        }))
                    },
                    condition: {
                        urlFilter: urlObj.origin + "/*",
                        resourceTypes: ["xmlhttprequest"]
                    }
                };

                await chrome.declarativeNetRequest.updateDynamicRules({
                    addRules: [rule]
                });

                return ruleId;
            } catch (error) {
                console.warn('CORS规则添加失败:', error);
                return null;
            }
        }

        async fetchWithRetry(req, retryCount = 0) {
            let ruleId = null;
            let timeoutId = null;
            let controller = null;

            try {
                controller = new AbortController();
                const config = this.configManager.get();
                
                timeoutId = setTimeout(() => {
                    controller.abort();
                    console.warn(`请求超时 (${config.timeout}ms)`);
                }, config.timeout);

                const method = (req.method || "GET").toUpperCase();
                const data = req.data || "";
                const headers = req.headers || {};
                
                ruleId = await this.addCorsRule(req.url);
                
                const reqConfig = {
                    method,
                    headers,
                    mode: 'cors',
                    credentials: 'include',
                    signal: controller.signal
                };

                if (method === 'POST') {
                    const contentType = headers['Content-Type'] || headers['content-type'] || "application/json";
                    reqConfig.body = this.prepareRequestBody(data, contentType);
                }

                const response = await fetch(req.url, reqConfig);
                await this.cleanupResources(timeoutId, ruleId);
                return response;
            } catch (error) {
                await this.cleanupResources(timeoutId, ruleId);
                return this.handleRetry(error, req, retryCount);
            }
        }

        prepareRequestBody(data, contentType) {
            if (contentType.includes("json")) {
                return typeof data === 'string' ? data : JSON.stringify(data);
            }
            if (contentType.includes("x-www-form-urlencoded")) {
                return new URLSearchParams(data);
            }
            return data;
        }

        async cleanupResources(timeoutId, ruleId) {
            if (timeoutId) {
                clearTimeout(timeoutId);
            }
            if (ruleId) {
                try {
                    await chrome.declarativeNetRequest.updateDynamicRules({
                        removeRuleIds: [ruleId]
                    });
                } catch (e) {
                    console.warn('CORS规则清理失败:', e);
                }
            }
        }

        async handleRetry(error, req, retryCount) {
            const config = this.configManager.get();
            
            if (error.name === 'AbortError') {
                error.message = `请求超时 (${config.timeout}ms)`;
            }

            if (retryCount < config.maxRetries && 
                (error.name === 'AbortError' || error.name === 'TypeError' || error.message.includes('network'))) {
                const delay = config.retryDelay * (retryCount + 1);
                console.warn(`重试请求 (${retryCount + 1}/${config.maxRetries}) 延迟: ${delay}ms`);
                await new Promise(resolve => setTimeout(resolve, delay));
                return this.fetchWithRetry(req, retryCount + 1);
            }

            throw error;
        }

        async handleResponse(res) {
            const resText = await res.text();
            let parsedBody;
            try {
                parsedBody = JSON.parse(resText);
            } catch {
                parsedBody = resText;
            }

            const headers = Object.fromEntries(res.headers.entries());

            return {
                header: headers,
                status: res.status,
                statusText: res.statusText,
                body: parsedBody
            };
        }

        handleError(error) {
            const errorInfo = {
                error: true,
                message: error.message || '未知错误',
                name: error.name || 'Error',
                stack: error.stack
            };

            if (error.name === 'AbortError') {
                errorInfo.type = 'timeout';
                errorInfo.details = `请求超时 (${this.configManager.get().timeout}ms)`;
            } else if (error.name === 'TypeError' && error.message.includes('network')) {
                errorInfo.type = 'network';
                errorInfo.details = '网络错误';
            }

            return errorInfo;
        }

        async fetch(req) {
            if (!this.isValidUrl(req.url)) {
                throw new Error('无效的URL');
            }

            const config = this.configManager.get();
            if (!config.allowedMethods.includes(req.method?.toUpperCase())) {
                throw new Error('不支持的请求方法');
            }

            const origin = new URL(req.url).origin;
            if (!this.checkRateLimit(origin)) {
                throw new Error('请求频率超限');
            }

            try {
                const response = await this.fetchWithRetry(req);
                return await this.handleResponse(response);
            } catch (error) {
                throw this.handleError(error);
            }
        }
    }

    // 初始化
    const configManager = new ConfigManager();
    const requestManager = new RequestManager(configManager);

    // 加载配置
    configManager.load();

    // 监听配置更新
    chrome.storage.onChanged.addListener((changes, namespace) => {
        if (namespace === 'sync' && changes.requestConfig) {
            configManager.save(changes.requestConfig.newValue)
                .catch(error => console.warn('配置更新失败:', error));
        }
    });

    // 连接处理
    chrome.runtime.onConnect.addListener((connect) => {
        if (connect.name !== CONSTANTS.CONNECTION_NAME) return;

        connect.onMessage.addListener(async (msg) => {
            try {
                const resData = await requestManager.fetch(msg.req);
                connect.postMessage({
                    type: "fetch_callback",
                    nodeId: msg.nodeId,
                    requestId: msg.req.requestId,
                    success: true,
                    res: resData
                });
            } catch (error) {
                connect.postMessage({
                    type: "fetch_callback",
                    nodeId: msg.nodeId,
                    requestId: msg.req.requestId,
                    success: false,
                    res: error
                });
            }
        });

        connect.onDisconnect.addListener(() => {
            if (chrome.runtime.lastError) {
                console.warn('连接断开:', chrome.runtime.lastError.message);
            }
        });
    });

    // 消息处理
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.type === 'getConfig') {
            sendResponse(configManager.get());
            return true;
        }
        if (message.type === 'updateConfig') {
            configManager.save(message.config)
                .then(() => sendResponse({ success: true }))
                .catch(error => sendResponse({ success: false, error: error.message }));
            return true;
        }
    });

})(globalThis);