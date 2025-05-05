(function (win) {
    // 常量定义
    const HTTP_METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'];
    const DEFAULT_TIMEOUT = 30000;
    const DEFAULT_METHOD = 'GET';
    
    // 工具函数
    const generateGuid = () => {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    };

    const isFunction = (fn) => typeof fn === 'function';
    const isString = (str) => typeof str === 'string';
    const isObject = (obj) => obj && typeof obj === 'object' && !Array.isArray(obj);

    // 判断是否启用插件
    let elementById = document.getElementById('cross-request-sign');
    if (!elementById) {
        return;
    }
    // 获取当前页面的ID
    let randomId = elementById.getAttribute("data-nodeId");

    // 请求配置验证
    const validateRequest = (req) => {
        if (!req) {
            throw new Error('请求配置不能为空');
        }
        if (!req.url) {
            throw new Error('URL不能为空');
        }
        if (req.method && !HTTP_METHODS.includes(req.method.toUpperCase())) {
            throw new Error(`不支持的HTTP方法: ${req.method}`);
        }
        return true;
    };

    // 处理文件上传
    const handleFileUpload = (files) => {
        if (!files) return null;
        
        const formData = new FormData();
        for (const [key, fileId] of Object.entries(files)) {
            const fileInput = document.getElementById(fileId);
            if (!fileInput?.files?.[0]) {
                throw new Error(`未找到文件输入框或文件为空: ${fileId}`);
            }
            formData.append(key, fileInput.files[0]);
        }
        return formData;
    };

    // 拦截器管理
    class InterceptorManager {
        constructor() {
            this.interceptors = [];
        }

        add(interceptor) {
            if (isFunction(interceptor)) {
                this.interceptors.push(interceptor);
                return true;
            }
            return false;
        }

        apply(data) {
            return this.interceptors.reduce((result, interceptor) => {
                try {
                    return interceptor(result);
                } catch (error) {
                    console.error('拦截器执行错误:', error);
                    return result;
                }
            }, data);
        }
    }

    // 请求管理器
    class RequestManager {
        constructor() {
            this.requests = new Map();
        }

        add(requestId, callbacks) {
            this.requests.set(requestId, callbacks);
        }

        remove(requestId) {
            return this.requests.delete(requestId);
        }

        get(requestId) {
            return this.requests.get(requestId);
        }
    }

    // 初始化
    const requestManager = new RequestManager();
    const requestInterceptors = new InterceptorManager();
    const responseInterceptors = new InterceptorManager();

    // 核心请求函数
    const crossRequest = (req) => {
        try {
            // 处理字符串形式的URL
            if (isString(req)) {
                req = { url: req };
            }

            // 验证请求配置
            validateRequest(req);

            const requestId = generateGuid();

            // 处理文件上传
            if (req.files) {
                req.data = handleFileUpload(req.files);
                delete req.files;
            }

            // 应用请求拦截器
            req = requestInterceptors.apply(req);

            // 注册请求回调
            requestManager.add(requestId, {
                success: (res, header, data) => {
                    try {
                        const processedRes = responseInterceptors.apply(res);
                        req.success?.(processedRes, header, data);
                    } catch (error) {
                        console.error('响应处理错误:', error);
                        req.error?.(error);
                    }
                },
                error: (error, header, data) => {
                    req.error?.(error, header, data);
                }
            });

            // 发送请求
            win.postMessage({
                source: "cross_request_page",
                nodeId: randomId,
                type: "fetch",
                req: {
                    caseId: req.caseId,
                    requestId,
                    url: req.url,
                    method: req.method?.toUpperCase() || DEFAULT_METHOD,
                    headers: req.headers || {},
                    data: req.data || "",
                    taskId: req.taskId || "",
                    timeout: req.timeout || DEFAULT_TIMEOUT,
                }
            }, location.origin);

            return requestId;
        } catch (error) {
            req.error?.(error);
            throw error;
        }
    };

    // 扩展方法
    Object.assign(crossRequest, {
        addRequestInterceptor: (interceptor) => requestInterceptors.add(interceptor),
        addResponseInterceptor: (interceptor) => responseInterceptors.add(interceptor),
        cancel: (requestId) => requestManager.remove(requestId)
    });

    // 消息处理
    win.addEventListener('message', (e) => {
        if (!e?.data || isString(e.data) || 
            e.data.source !== 'cross_request_content' || 
            e.data.nodeId !== randomId) {
            return;
        }

        if (e.data.type === "fetch_callback") {
            const requestId = e.data.requestId;
            const callbacks = requestManager.get(requestId);
            
            if (!callbacks) return;

            const { success, error } = callbacks;
            if (e.data.success) {
                success?.(e.data.res, e.data.res.header, e.data);
            } else {
                error?.(e.data.res, e.data.res.header, e.data);
            }
            requestManager.remove(requestId);
        }
    });

    // 暴露API
    win.crossRequest = crossRequest;
})(window);

