# 净土百问数据库更新 - 快速操作指南

## 🎯 目标
修复13个无法播放的音频文件

## 📋 问题文件列表
- 第38集: 如何理解"直心是道场"
- 第41集: "色不异空"和"色即是空"的区别
- 第54集: 如何理解"都摄六根，净念相继"
- 第59集: "唯心净土，自性弥陀"如何理解
- 第67集: 如何理解"不可以少善根福德得生彼国"
- 第68集: "如染香人，身有香气……"如何理解
- 第79集: 《圆通章》中"从生至生"如何理解
- 第80集: "万法不离自性"与"一切法无自性"
- 第81集: 《观经四帖疏》中"门余八万四千"的含义
- 第87集: 阿弥陀佛的"阿"字念"o"可以吗
- 第108集: 如何做到"都摄六根，净念相继"
- 第118集: 请开示"诚"与"敬"的重要性
- 第128集: "能行即是佛，何须念!"这个知见对不对

## 🔧 操作步骤

### 步骤1：登录Cloudflare
1. 访问：https://dash.cloudflare.com
2. 登录你的账号

### 步骤2：进入D1数据库
1. 左侧菜单：**Workers & Pages**
2. 点击：**D1 SQL Database**
3. 选择你的数据库（名称可能是：foyue、foyue-db或类似）

### 步骤3：执行SQL更新
1. 点击 **"Console"** 标签
2. 复制以下SQL语句：

```sql
-- 更新第38集
UPDATE episodes
SET file_name = '如何理解"直心是道场".mp3'
WHERE series_id = 'jingtu-baiwen' AND episode_num = 38;

-- 更新第41集
UPDATE episodes
SET file_name = '"色不异空"和"色即是空"的区别.mp3'
WHERE series_id = 'jingtu-baiwen' AND episode_num = 41;

-- 更新第54集
UPDATE episodes
SET file_name = '如何理解"都摄六根，净念相继".mp3'
WHERE series_id = 'jingtu-baiwen' AND episode_num = 54;

-- 更新第59集
UPDATE episodes
SET file_name = '"唯心净土，自性弥陀"如何理解.mp3'
WHERE series_id = 'jingtu-baiwen' AND episode_num = 59;

-- 更新第67集
UPDATE episodes
SET file_name = '如何理解"不可以少善根福德得生彼国".mp3'
WHERE series_id = 'jingtu-baiwen' AND episode_num = 67;

-- 更新第68集
UPDATE episodes
SET file_name = '"如染香人，身有香气……"如何理解.mp3'
WHERE series_id = 'jingtu-baiwen' AND episode_num = 68;

-- 更新第79集
UPDATE episodes
SET file_name = '《圆通章》中"从生至生"如何理解.mp3'
WHERE series_id = 'jingtu-baiwen' AND episode_num = 79;

-- 更新第80集
UPDATE episodes
SET file_name = '"万法不离自性"与"一切法无自性".mp3'
WHERE series_id = 'jingtu-baiwen' AND episode_num = 80;

-- 更新第81集
UPDATE episodes
SET file_name = '《观经四帖疏》中"门余八万四千"的含义.mp3'
WHERE series_id = 'jingtu-baiwen' AND episode_num = 81;

-- 更新第87集
UPDATE episodes
SET file_name = '阿弥陀佛的"阿"字念"o"可以吗.mp3'
WHERE series_id = 'jingtu-baiwen' AND episode_num = 87;

-- 更新第108集
UPDATE episodes
SET file_name = '如何做到"都摄六根，净念相继".mp3'
WHERE series_id = 'jingtu-baiwen' AND episode_num = 108;

-- 更新第118集
UPDATE episodes
SET file_name = '请开示"诚"与"敬"的重要性.mp3'
WHERE series_id = 'jingtu-baiwen' AND episode_num = 118;

-- 更新第128集
UPDATE episodes
SET file_name = '"能行即是佛，何须念!"这个知见对不对.mp3'
WHERE series_id = 'jingtu-baiwen' AND episode_num = 128;
```

3. 粘贴到Console中
4. 点击 **"Execute"** 按钮

### 步骤4：验证更新
执行以下查询验证：

```sql
SELECT episode_num, title, file_name
FROM episodes
WHERE series_id = 'jingtu-baiwen'
  AND episode_num IN (38, 41, 54, 59, 67, 68, 79, 80, 81, 87, 108, 118, 128)
ORDER BY episode_num;
```

**预期结果**：文件名应该包含弯引号（"和"）

### 步骤5：测试音频
更新后，测试这些URL：

```bash
# 测试第38集
curl -I "https://audio.foyue.org/772643034503463d9b954f0eea5ce80b/净土百问/如何理解"直心是道场".mp3"

# 测试第41集
curl -I "https://audio.foyue.org/772643034503463d9b954f0eea5ce80b/净土百问/"色不异空"和"色即是空"的区别.mp3"
```

**预期结果**：返回 `HTTP/2 200` 而不是 `404`

## ✅ 成功标志

- ✅ SQL执行成功（显示"Query executed successfully"）
- ✅ 验证查询返回正确的文件名
- ✅ 音频URL可以访问（返回200）
- ✅ 网站上可以正常播放这13个音频

## 🔍 注意事项

1. **字符编码**：确保复制SQL时使用UTF-8编码
2. **引号类型**：注意使用弯引号（"和"）而不是直引号（"）
3. **备份数据**：建议先备份数据库（可选）
4. **立即生效**：更新后立即生效，无需重启

## 📞 需要帮助？

如果遇到问题，请提供：
- SQL执行结果截图
- 错误信息
- 验证查询的结果

## 🎯 预期效果

更新后，这13个音频文件应该可以正常播放了！
