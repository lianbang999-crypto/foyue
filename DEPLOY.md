# 部署指南

## 架构

```
GitHub 仓库 (lianbang999-crypto/bojingji)
    ↓ Git Push 自动触发
Cloudflare Pages (amituofo.pages.dev)
    ├── 构建命令: npm run build
    ├── 输出目录: dist
    ├── Pages Functions: functions/
    ├── D1 数据库: foyue-db
    └── 自定义域名: foyue.org
```

音频文件存储在 Cloudflare R2（4 个存储桶），不在本仓库中。

---

## Cloudflare Pages 部署

### 自动部署

项目已配置 GitHub 自动部署：
- 推送到 `main` 分支 → 自动构建部署到生产环境
- 推送到其他分支 → 自动构建预览环境

### Cloudflare Dashboard 构建设置

| 配置项 | 值 |
|--------|-----|
| 构建命令 | `npm run build` |
| 输出目录 | `dist` |
| Node.js 版本 | 20（或最新 LTS） |

### D1 数据库绑定

通过 `wrangler.toml` 配置：
```toml
[[d1_databases]]
binding = "DB"
database_name = "foyue-db"
database_id = "be0b21ab-4549-45bc-ac38-5f9e1864d061"
```

### 本地开发

```bash
npm install
npm run dev
```

Vite 开发服务器会将 `/api/*` 请求代理到 `https://foyue.org`，方便本地调试。

如需本地运行 Pages Functions + D1：
```bash
npx wrangler pages dev dist --d1=DB
```

---

## Cloudflare R2（音频存储）

音频文件存储在 4 个 R2 存储桶中，通过公开 URL 访问：
```
https://pub-05d3db9f377146d5bb450025565f7d1b.r2.dev/
https://pub-7a334cb009c14e10bbcfee54bb593a2a.r2.dev/
https://pub-7be57e30faae4f81bbd76b61006ac8fc.r2.dev/
https://pub-8c99ae05414d4672b1ec08a569ab3299.r2.dev/
```

### 添加新音频
1. 登录 Cloudflare Dashboard → R2
2. 上传 .mp3 文件到对应存储桶
3. 在 `public/data/audio-data.json` 中添加对应的系列/集数配置
4. 推送到 GitHub，自动部署

### 重要
- **不要删除 R2 上已有的音频文件**，否则用户播放会 404
- 上传前确认文件名与 audio-data.json 中的 fileName 一致

---

## 构建产物

`npm run build` 输出：
```
dist/
├── index.html                    # ~14 KB
├── assets/
│   ├── index-[hash].css          # ~31 KB (gzip ~6 KB)
│   └── index-[hash].js           # ~51 KB (gzip ~17 KB)
├── manifest.json
├── robots.txt
├── sitemap.xml
├── data/audio-data.json
└── icons/
```

---

## 域名配置

- Pages 域名：amituofo.pages.dev
- 自定义域名：foyue.org（在 Cloudflare Pages → Custom domains 中配置）
- DNS 由 Cloudflare 管理

---

## 部署检查清单

每次部署后验证：
- [ ] 首页正常加载（每日一句、佛号卡片、推荐系列）
- [ ] 能正常播放音频（迷你播放器 + 全屏播放器）
- [ ] 分类浏览正常（有声书 / 听经台）
- [ ] 搜索功能正常
- [ ] "我的"页面正常（历史、设置）
- [ ] 浅色/深色主题切换正常
- [ ] 语言切换正常（中/英/法）
- [ ] PWA 安装功能正常
- [ ] 浏览器控制台无错误
- [ ] 断点续播正常（刷新后恢复播放位置）
