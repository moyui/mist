# HTTP响应格式迁移指南

## 前端适配指南

### 响应格式变更

**旧格式:**
```typescript
const data = await response.json();
```

**新格式:**
```typescript
const { success, code, data, message } = await response.json();

if (!success) {
  // 处理错误
  console.error(`Error ${code}: ${message}`);
  return;
}

// 使用data
```

### 错误码映射

| Code | 说明 | 前端处理建议 |
|------|------|------------|
| 200 | 成功 | 正常处理数据 |
| 1001 | 参数错误 | 提示用户检查输入 |
| 1002 | 日期范围错误 | 提示用户选择有效日期范围 |
| 2001 | 数据不存在 | 提示用户数据未找到 |
| 5000 | 服务器错误 | 提示用户稍后重试 |

### 国际化支持

前端可根据message字段进行翻译：

```typescript
const errorMessages = {
  INVALID_PARAMETER: '参数错误',
  DATA_NOT_FOUND: '数据不存在',
  INTERNAL_SERVER_ERROR: '服务器内部错误',
};

const displayMessage = errorMessages[message] || message;
```

### 示例代码

```typescript
async function fetchIndicatorData(params) {
  const response = await fetch('/api/indicator/macd', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });

  const result = await response.json();

  if (!result.success) {
    // 显示错误提示
    showError(result.message);
    return null;
  }

  // 使用返回的数据
  return result.data;
}
```

## 测试建议

1. 测试所有API调用
2. 验证错误处理
3. 检查loading状态
4. 验证数据显示
