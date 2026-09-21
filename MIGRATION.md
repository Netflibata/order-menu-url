# 云巷点餐站迁移说明

这个目录同时保留原 Sites 版本和新的 Netlify 版本。迁移测试通过以前，不需要修改 `yunxiang-menu.dynv6.net` 的 DNS。

新入口在没有配置 Turso 时会安全地反向代理现有站点的接口和图片，因此可以先上线测试，不丢失当前菜品数据。配置 Turso 后会自动切换到完全独立的数据存储。

## 新平台

- 网页与接口：Netlify
- 菜品、分类和订单：Turso
- 上传的菜品图片：Netlify Blobs

## Netlify 环境变量

在 Netlify 项目的环境变量页面设置：

- `TURSO_DATABASE_URL`
- `TURSO_AUTH_TOKEN`
- `ADMIN_PASSWORD`
- `SESSION_SECRET`（使用一段无法猜测的随机长字符串）

不要把真实密码或令牌写进代码、提交到 Git，或发送到公开聊天中。

## 首次部署顺序

1. 在 Turso 创建免费数据库并取得数据库地址与令牌。
2. 在本机临时设置上述两个 Turso 环境变量，运行 `pnpm run db:init` 创建表。
3. 将本目录连接到 Netlify，构建配置会自动读取 `netlify.toml`。
4. 在 Netlify 设置四个环境变量并部署。
5. 设置 `NETLIFY_SITE_ID` 和 `NETLIFY_AUTH_TOKEN`，运行 `pnpm run migration:import` 导入已经备份的菜品、分类、订单和图片。
6. 用此前被拦截的手机或电脑直接测试 Netlify 提供的 `.netlify.app` 地址，包括登录、下单、退款和图片上传。
7. 测试成功后，再把 dynv6 的域名记录改到 Netlify 显示的目标值。

迁移数据保存在本机 `migration` 目录并已加入忽略列表，不会跟随代码提交，以免订单中的姓名或电话外泄。

Netlify 免费套餐有用量限制；达到上限时站点可能暂停。它解决的是当前 Cloudflare 入口拦截问题，但任何境外免费平台都不能承诺中国大陆所有网络永远可达。
