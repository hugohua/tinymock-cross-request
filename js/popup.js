// 常量定义
const CONFIG = {
    TIMEOUT: {
        MIN: 1000,
        DEFAULT: 30000
    },
    MAX_RETRIES: {
        MIN: 0,
        MAX: 10,
        DEFAULT: 3
    },
    RETRY_DELAY: {
        MIN: 100,
        DEFAULT: 1000
    },
    STATUS_DISPLAY_TIME: 3000
};

// 配置验证器
const ConfigValidator = {
    validateTimeout(value) {
        const timeout = parseInt(value);
        if (isNaN(timeout) || timeout < CONFIG.TIMEOUT.MIN) {
            throw new Error(`超时时间必须大于等于${CONFIG.TIMEOUT.MIN}毫秒`);
        }
        return timeout;
    },

    validateMaxRetries(value) {
        const retries = parseInt(value);
        if (isNaN(retries) || retries < CONFIG.MAX_RETRIES.MIN || retries > CONFIG.MAX_RETRIES.MAX) {
            throw new Error(`重试次数必须在${CONFIG.MAX_RETRIES.MIN}-${CONFIG.MAX_RETRIES.MAX}之间`);
        }
        return retries;
    },

    validateRetryDelay(value) {
        const delay = parseInt(value);
        if (isNaN(delay) || delay < CONFIG.RETRY_DELAY.MIN) {
            throw new Error(`重试延迟时间必须大于等于${CONFIG.RETRY_DELAY.MIN}毫秒`);
        }
        return delay;
    }
};

// UI管理器
class UIManager {
    constructor() {
        this.elements = {
            timeout: document.getElementById('timeout'),
            maxRetries: document.getElementById('maxRetries'),
            retryDelay: document.getElementById('retryDelay'),
            save: document.getElementById('save'),
            status: document.getElementById('status')
        };
        this.statusTimeout = null;
    }

    showStatus(message, isSuccess) {
        const { status } = this.elements;
        status.textContent = message;
        status.className = `status ${isSuccess ? 'success' : 'error'}`;
        status.style.display = 'block';

        // 清除之前的定时器
        if (this.statusTimeout) {
            clearTimeout(this.statusTimeout);
        }

        // 设置新的定时器
        this.statusTimeout = setTimeout(() => {
            status.style.display = 'none';
        }, CONFIG.STATUS_DISPLAY_TIME);
    }

    async loadConfig() {
        try {
            const config = await chrome.runtime.sendMessage({ type: 'getConfig' });
            this.elements.timeout.value = config.timeout;
            this.elements.maxRetries.value = config.maxRetries;
            this.elements.retryDelay.value = config.retryDelay;
        } catch (error) {
            this.showStatus(`加载配置失败: ${error.message}`, false);
        }
    }

    getFormData() {
        return {
            timeout: this.elements.timeout.value,
            maxRetries: this.elements.maxRetries.value,
            retryDelay: this.elements.retryDelay.value
        };
    }
}

// 配置管理器
class ConfigManager {
    constructor(uiManager) {
        this.uiManager = uiManager;
    }

    async saveConfig(formData) {
        try {
            const validatedConfig = {
                timeout: ConfigValidator.validateTimeout(formData.timeout),
                maxRetries: ConfigValidator.validateMaxRetries(formData.maxRetries),
                retryDelay: ConfigValidator.validateRetryDelay(formData.retryDelay)
            };

            const response = await chrome.runtime.sendMessage({
                type: 'updateConfig',
                config: validatedConfig
            });

            if (response.success) {
                this.uiManager.showStatus('配置已保存', true);
            } else {
                throw new Error(response.error || '未知错误');
            }
        } catch (error) {
            this.uiManager.showStatus(`保存失败: ${error.message}`, false);
        }
    }
}

// 初始化应用
document.addEventListener('DOMContentLoaded', async () => {
    const uiManager = new UIManager();
    const configManager = new ConfigManager(uiManager);

    // 加载当前配置
    await uiManager.loadConfig();

    // 保存按钮点击事件
    uiManager.elements.save.addEventListener('click', async () => {
        const formData = uiManager.getFormData();
        await configManager.saveConfig(formData);
    });
}); 