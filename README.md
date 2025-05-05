# TinyMock Cross-Request Chrome Extension

一个强大的 Chrome 扩展，为网页提供跨域请求能力，支持多种请求类型和高级功能。

## 功能特性

- 🚀 支持跨域请求
- 🔄 自动重试机制
- ⏱️ 可配置超时时间
- 🔒 安全的 CORS 处理
- 📤 支持文件上传
- 🛡️ 请求频率限制
- 🔧 可自定义配置
- 📝 详细的错误处理

## 安装说明

1. 从 Chrome 网上应用店安装
2. 或手动安装：
   - 下载项目代码
   - 打开 Chrome 扩展管理页面 (chrome://extensions/)
   - 开启"开发者模式"
   - 点击"加载已解压的扩展程序"
   - 选择项目目录

## 配置选项

扩展提供以下可配置项：

```javascript
{
    timeout: 5000,        // 请求超时时间（毫秒）
    maxRetries: 3,        // 最大重试次数
    retryDelay: 1000,     // 重试延迟时间（毫秒）
    rateLimit: {
        windowMs: 60000,  // 时间窗口（毫秒）
        max: 100          // 最大请求次数
    }
}
```

## API 文档

### crossRequest(options)

发起跨域请求的主要方法。

#### 参数说明

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| url | string | 是 | 请求地址 |
| method | string | 否 | 请求方法，默认 GET |
| headers | object | 否 | 请求头 |
| data | object/string | 否 | 请求数据 |
| files | object | 否 | 文件上传配置 |
| success | function | 否 | 成功回调 |
| error | function | 否 | 错误回调 |

## 使用示例

### 1. GET 请求

```javascript
crossRequest({
    url: 'http://api.example.com/data',
    method: 'GET',
    success: function(res, header) {
        console.log('响应数据:', res);
        console.log('响应头:', header);
    },
    error: function(error) {
        console.error('请求失败:', error);
    }
});
```

### 2. POST 请求

```javascript
crossRequest({
    url: 'http://api.example.com/submit',
    method: 'POST',
    headers: {
        'Content-Type': 'application/json'
    },
    data: {
        name: 'John',
        age: 30,
        address: {
            city: 'New York'
        }
    },
    success: function(res) {
        console.log('提交成功:', res);
    },
    error: function(error) {
        console.error('提交失败:', error);
    }
});
```

### 3. 文件上传

```javascript
crossRequest({
    url: 'http://api.example.com/upload',
    method: 'POST',
    data: {
        description: '项目文档'
    },
    files: {
        document: 'fileInputId'  // 文件输入框的 DOM ID
    },
    success: function(res) {
        console.log('上传成功:', res);
    },
    error: function(error) {
        console.error('上传失败:', error);
    }
});
```

## 错误处理

扩展提供详细的错误信息，包括：

- 超时错误
- 网络错误
- 请求频率限制
- 无效的 URL
- 不支持的请求方法
- 其他错误

错误对象格式：

```javascript
{
    error: true,
    message: '错误描述',
    name: '错误类型',
    type: '具体错误类型',
    details: '详细错误信息'
}
```

## 注意事项

1. 确保请求的 URL 是有效的 HTTP/HTTPS 地址
2. 文件上传时需要提供正确的文件输入框 ID
3. 注意请求频率限制，避免触发限制
4. 建议设置适当的超时时间和重试次数

## 贡献指南

欢迎提交 Issue 和 Pull Request 来帮助改进这个项目。

## 许可证

MIT License

## 打包说明

### 生成 .crx 文件

1. 打开 Chrome 浏览器，访问 `chrome://extensions/`
2. 确保右上角的"开发者模式"已开启
3. 点击"打包扩展程序"按钮
4. 在"扩展程序根目录"中选择项目目录
5. 点击"打包扩展程序"按钮
6. 打包完成后，会在项目目录的上一级目录生成两个文件：
   - `.crx` 文件：这是打包好的扩展文件
   - `.pem` 文件：这是扩展的私钥文件，请妥善保管

### 注意事项

1. `.pem` 文件用于后续更新扩展，请务必安全保存
2. 如果丢失 `.pem` 文件，将无法更新已发布的扩展
3. 建议将 `.pem` 文件添加到 `.gitignore` 中
4. 发布到 Chrome 网上应用店时不需要 `.crx` 文件，而是需要打包成 `.zip` 文件

### 发布到 Chrome 网上应用店

1. 访问 [Chrome 开发者控制台](https://chrome.google.com/webstore/devconsole)
2. 点击"新建项目"
3. 上传打包好的 `.zip` 文件
4. 填写扩展信息：
   - 扩展名称
   - 简短描述
   - 详细描述
   - 至少一张截图
   - 图标
5. 选择发布类型（公开/私有）
6. 提交审核

### 更新扩展

1. 修改 `manifest.json` 中的版本号
2. 重新打包扩展
3. 在开发者控制台上传新版本
4. 等待审核通过