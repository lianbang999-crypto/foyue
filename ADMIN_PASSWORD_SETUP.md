# 管理后台密码设置指南

## 当前情况

管理后台密码存储在 Cloudflare 环境变量中，不在代码里。这样更安全。

## 设置密码为 `lianbang999` 的步骤

### 方法一：通过 Cloudflare Dashboard（推荐）

1. 登录 Cloudflare Dashboard
2. 进入你的 Pages 项目（foyue）
3. 点击 **Settings** → **Environment variables**
4. 找到 `ADMIN_TOKEN` 变量
5. 点击 **Edit**（编辑）
6. 将值改为：`lianbang999`
7. 点击 **Save**（保存）
8. 重新部署项目（Deployments → 点击最新的部署 → Retry deployment）

### 方法二：通过 Wrangler CLI

```bash
# 设置环境变量
npx wrangler pages secret put ADMIN_TOKEN --project-name=foyue

# 然后输入：lianbang999
```

## 验证密码

设置完成后：
1. 访问 `https://foyue.org/admin`
2. 输入密码：`lianbang999`
3. 点击"登录"

## 安全建议

⚠️ **注意**：`lianbang999` 是一个相对简单的密码，建议：

1. **仅用于开发/测试环境**
2. **生产环境使用更强的密码**，例如：
   - `Foyue@2026!Admin`
   - `PureLand#999#Secure`
   - 或使用密码生成器生成随机密码

3. **定期更换密码**

## 如何修改密码

随时可以通过 Cloudflare Dashboard 修改密码，修改后需要重新部署才能生效。

## 忘记密码怎么办？

如果忘记密码，可以通过 Cloudflare Dashboard 查看或重置 `ADMIN_TOKEN` 环境变量。

---

**重要提示**：密码存储在 Cloudflare，不在代码仓库中，这样更安全。不要将密码提交到 Git！
