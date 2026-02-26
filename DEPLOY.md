# 部署指南

## 架构

```
GitHub 仓库 (lianbang999-crypto/bojingji)
    ↓ 手动部署
Cloudflare Pages (bojingji.pages.dev)
    ↓ 自定义域名
fayin.uk
```

音频文件单独存储在 Cloudflare R2，不在本仓库中。

---

## Cloudflare Pages 部署

### 前提条件
- 安装 Node.js（用于 npx wrangler）
- 拥有 Cloudflare 账号和 API Token

### 部署命令

```bash
CLOUDFLARE_API_TOKEN=<你的API_TOKEN> \
CLOUDFLARE_ACCOUNT_ID=<你的ACCOUNT_ID> \
npx wrangler pages deploy . --project-name=bojingji --branch=main
```

### 注意事项
- 部署的是整个项目根目录（`.`），包括 index.html、manifest.json、data/、icons/
- 不要把 .md 文档文件排除，它们不影响网站功能
- 部署后访问 https://bojingji.pages.dev 验证

---

## Cloudflare R2（音频存储）

音频文件存储在 R2 存储桶中，通过公开 URL 访问：
```
https://pub-7be57e30faae4f81bbd76b61006ac8fc.r2.dev/{文件夹}/{文件名}.mp3
```

### 添加新音频
1. 登录 Cloudflare Dashboard → R2
2. 上传 .mp3 文件到对应文件夹
3. 在 `data/audio-data.json` 中添加对应的专辑/集数配置
4. 重新部署网站

### 重要
- **不要删除 R2 上已有的音频文件**，否则用户播放会 404
- 上传前确认文件名与 audio-data.json 中的 fileName 一致

---

## GitHub 操作

### 推送代码
```bash
git add index.html data/ icons/ manifest.json
git commit -m "描述变更内容"
git push origin main
```

### 克隆仓库
```bash
git clone https://github.com/lianbang999-crypto/bojingji.git
```

---

## 域名配置

- 主域名：bojingji.pages.dev（Cloudflare Pages 自动分配）
- 自定义域名：fayin.uk（在 Cloudflare Pages → Custom domains 中配置）
- DNS 由 Cloudflare 管理

---

## 部署检查清单

每次部署后验证：
- [ ] 首页正常加载
- [ ] 能正常播放音频
- [ ] "我的"页面显示正常
- [ ] 浅色/深色主题切换正常
- [ ] PWA 安装功能正常
- [ ] 浏览器控制台无错误
