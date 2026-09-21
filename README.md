云乡菜单点餐项目创建与部署流程
当前生产架构与后续发布运行手册
本文记录云乡菜单点餐项目从本地源码、原始数据服务、公开访问入口，到免费菜品图片存储的创建和部署流程。它面向项目负责人和维护人员，用于复建、更新、排查和发布当前系统。

核心结论：当前生产环境采用“Netlify 公开站点加原 Sites 数据服务”的过渡架构。顾客访问 Netlify；菜单、订单和后台权限仍由原 Sites Worker 与 D1/R2 数据服务提供；新上传图片优先保存到 Netlify Blobs。

一 项目目标和功能边界
模块	已实现能力	权限边界
前台点餐	用户输入任意名称进入，浏览分类、搜索菜品、加入点菜单、填写桌号和备注、提交订单。	所有访问者可用。
订单查询和退款	按名称保留本机订单号，查看订单状态；待接单订单可申请退款。	顾客只操作自身入口。
后台管理	管理员登录、订单状态更新、单笔删除、按日期删除、菜品和分类维护。	仅管理员密码登录后可用。
图片管理	后台上传 JPG、PNG、WebP、GIF 图片，单张最大 5MB；图片自动同步。	仅后台新增或编辑菜品时可上传。

二 当前生产架构
当前部署不是单一平台，而是为解决原 Cloudflare 入口在部分中国大陆网络被拦截的问题，将公开访问入口迁移到 Netlify，同时保留原数据服务。未完成独立数据迁移前，不应关闭原 Sites 服务。
层级	当前服务	职责	关键文件或配置
浏览器	Netlify 公开站点	提供网页、静态资源和 API 网关。	public/app.js、worker/page.js
网关	Netlify Function	菜单缓存、API 转发、图片读取与上传。	netlify/functions/api.mjs
业务和数据	原 Sites Worker	管理员会话、菜单、订单、退款、分类、D1/R2 数据读写。	worker/index.js、.openai/hosting.json
图片	Netlify Blobs 加旧 R2	新图优先写入 Blobs；旧图首次读取时缓存迁移；旧 R2 保留回退。	netlify/functions/api.mjs、netlify.toml

访问路径：顾客设备 → Netlify 页面和函数 → 原 Sites Worker → D1 菜单与订单数据库 / R2 旧图片。新图片由 Netlify Function 写入 Netlify Blobs，并由同一入口读取。
三 源码目录和职责
位置	用途	变更注意事项
public	前端脚本和内置静态图片。	修改界面或交互后，需要重新构建 Netlify。
worker	原 Sites Worker 后端和 HTML 页面模板。	改订单、权限、数据库或原站页面时必须重新发布 Sites。
netlify/functions	Netlify API 网关、图片迁移逻辑。	改网关或图片逻辑后必须重新发布 Netlify。
drizzle	D1 / Turso 表结构 SQL。	修改表结构应先备份和验证。
migration	旧服务导出的菜单、订单与已下载图片。	包含业务数据，不应公开上传或提交到公开仓库。
scripts	构建、校验、迁移和预览脚本。	优先使用现有脚本，不要手动拼装发布目录。
.openai/hosting.json	原 Sites 项目绑定与 D1/R2 名称。	项目标识不可自行替换。

四 创建前准备
阶段	实施动作	输出或核验
源码	保存完整项目源码；安装 Node.js 及 pnpm，并在项目根目录安装 package.json 中的依赖。	node_modules 可生成，源码、迁移资料和环境变量不可丢失。
账号	准备原 Sites 项目访问权限、Netlify 项目访问权限、域名 DNS 管理权限。	维护人员可查看环境变量、部署记录和函数日志。
数据	确认原 D1 数据库和 R2 图片桶仍存在，且原 Sites Worker 可访问。	菜单、订单和旧图片均可从原站读取。
域名	先使用 Netlify 提供的 .netlify.app 地址验证，再处理自定义域名。	不在未验证前切换正式 DNS。

不要把真实密码、访问令牌、数据库令牌、会话密钥或上传密钥写进源码、压缩包、公开仓库和本文档。
五 原 Sites 服务创建和发布
5 1 服务职责
原 Sites 服务持有当前业务数据。它使用 D1 作为菜单、分类、订单和订单明细数据库，使用 R2 保存历史上传图片。Worker 入口为 worker/index.js，页面模板为 worker/page.js。
5 2 必需环境变量
变量	用途	设置要求
ADMIN_PASSWORD	后台登录密码。	使用强密码，只在服务端环境变量中保存。
SESSION_SECRET	生成管理员会话签名。	使用不可预测的长随机字符串；更换后旧后台会话失效。
ORDER_DELETE_
PASSWORD_HASH	按日期批量删除订单的密码校验值。	保存删除密码经 HMAC SHA 256 计算后的十六进制值。
ORDER_DELETE_
PASSWORD_PEPPER	批量删除密码的 HMAC 密钥。	随机长字符串；不得与删除密码本身相同。
MAX_UPLOAD_BYTES	可选的上传大小上限。	不设置时默认 5MB。

批量删除密码的配置方式：项目负责人离线生成随机 Pepper，以 HMAC SHA 256 算法计算“Pepper + 删除密码”的校验结果，将结果写入 ORDER_DELETE_PASSWORD_HASH，将 Pepper 写入 ORDER_DELETE_PASSWORD_PEPPER。生产环境只保存校验结果和 Pepper，不保存明文删除密码。
5 3 构建和发布
1. 在项目根目录执行 npm run build，生成 dist 目录。
2. 执行 npm run validate，确认 Worker 为有效 ESM 并且默认 fetch 入口存在。
3. 将当前源码提交到绑定的 Sites 源码仓库。发布时必须让提交版本、构建产物和发布版本对应同一个提交。
4. 将 dist 打包为发布归档，并在 Sites 中保存版本、部署版本。
5. 使用原 Sites 地址验证后台登录、菜单、下单、退款、菜品上传和订单删除。原地址在部分网络可能受 Cloudflare 影响，因此不作为最终公开入口。
npm run build
npm run validate
六 Netlify 公开入口创建和发布
6 1 Netlify 的职责
Netlify 是面向公众的访问入口。它发布页面和静态资源，并运行 api 函数。api 函数处理 /api/* 和 /uploads/*：菜单请求经过短时缓存，其他业务 API 转发到原 Sites 服务，图片读取优先使用静态迁移文件或 Netlify Blobs。
6 2 Netlify 配置
配置项	当前值或用途	说明
Build command	npm run build:netlify	生成 netlify-dist，并准备 functions-build。
Publish directory	netlify-dist	由 Netlify 对外发布的静态目录。
Functions directory	netlify/functions-build	构建脚本复制 api 函数和旧图片。
Node bundler	esbuild	用于打包函数。
External module	@netlify/blobs	必须保留，确保生产函数可以加载免费图片存储组件。
SOURCE_SITE_ORIGIN	原 Sites 服务地址	网关回源地址；必须是可由 Netlify 函数访问的 HTTPS 地址。

6 3 发布步骤
1. 确认原 Sites 服务先处于可用状态，并在 Netlify 环境变量中检查 SOURCE_SITE_ORIGIN。
2. 执行 npm run build:netlify，生成 netlify-dist 和 netlify/functions-build。
3. 执行 npm run validate:netlify，确认首页、前端脚本、静态图片和函数路由都已生成。
4. 在 Netlify 生产环境中执行构建和发布，或使用已连接项目的 Netlify CLI 发布生产版本。
5. 发布完成后，打开 .netlify.app 地址，测试菜单、图片、后台登录、下单和订单更新。
npm run build:netlify
npm run validate:netlify
netlify build --context production
netlify deploy --prod --no-build --skip-functions-cache
七 免费图片存储迁移流程
当前方案使用 Netlify Blobs 作为新上传菜品图片的免费存储。它解决了新图片必须直接写入原 R2、且手机网络有时回源失败的问题。旧图片不要求一次性手动迁移。
阶段	实施动作	输出或核验
旧图片准备	已下载的旧 R2 图片保存在 migration/uploads/dishes，构建时复制到 Netlify 静态资源和函数包。	已迁移的旧图可直接由 Netlify 静态资源返回。
首次访问缓存	未包含在静态迁移清单中的旧 /uploads 图片，首次访问时由 Netlify Function 从原站读取并写入 Blobs。	后续读取不再依赖浏览器直接回源旧图片。
后台新上传	管理员选择本地图片并保存菜品，Netlify Function 校验管理员会话、格式和大小后写入 Blobs。	接口返回新的 /uploads/dishes/... 图片地址。
失败回退	若 Blobs 临时不可用，网关将把未被消费的上传请求转发到原 Sites 上传接口。	避免因一次存储异常导致图片直接丢失。

图片格式仅支持 JPG、PNG、WebP、GIF，默认最大 5MB。图片读取失败时前端显示“图片暂不可用”占位图，不再错误使用其他菜品图片替代。
验证方法：在后台上传一张新图片并保存菜品；换无缓存的浏览器或手机打开菜品；检查该图片请求返回 200、Content Type 为 image/*、Cache Control 为一年缓存。
八 自定义域名和 DNS
1. 先确认 Netlify 的 .netlify.app 地址在目标网络、手机和电脑上均能访问。
2. 在 Netlify 项目中添加自定义子域名，例如 menu.example.com，记录平台给出的 CNAME 目标。
3. 在域名 DNS 服务商中为子域名添加 CNAME 记录，名称只写子域部分，记录值使用 Netlify 提供的目标。
4. 等待 DNS 和证书状态变为有效后，通过 HTTPS 打开自定义域名并完成验收。
5. 切换域名后不要立即删除旧入口，至少保留到菜单、订单、图片和后台操作验证完成。
如使用 DNS 或安全代理服务，应先使用“仅 DNS”方式验证站点；避免同时叠加多层代理，尤其不要把不兼容的回源规则应用到函数和图片路径。
九 上线验收清单
验收项目	验证动作	合格标准
首页和登录	电脑和手机直接打开公开网址，输入任意名称。	无需代理即可进入菜品页。
菜单同步	后台新增、编辑、下架一个测试菜品，刷新另一设备。	分类、价格和在售状态同步。
下单	选择菜品、填写桌号和备注，提交订单。	生成订单号，后台可看到订单。
退款	对待接单测试订单申请退款。	订单状态更新为已退款。
后台权限	退出后台后直接请求后台功能。	未登录时被拒绝；正确密码可重新登录。
图片	上传一张测试图片，在无缓存设备打开。	图片显示正确，不串图，不返回 404。
删除同步	删除测试订单或按日期清理测试数据，刷新另一设备。	已删除订单不再出现。

十 日常更新发布流程
阶段	实施动作	输出或核验
1 修改	在对应目录修改前端、Worker 或 Netlify 网关；避免直接编辑 dist、netlify-dist 和 functions-build。	源码改动清晰可追溯。
2 本地校验	按改动范围运行 npm run build / validate 和 npm run build:netlify / validate:netlify。	所有构建和校验命令成功。
3 提交	检查 git diff，提交一个描述明确的版本，并推送原 Sites 源码仓库。	提交号与部署版本一致。
4 发布	涉及 worker 时发布 Sites；涉及 public 或 netlify/functions 时发布 Netlify；跨两端改动则两端均发布。	生产部署成功。
5 回归	按上线验收清单测试变更点和关键链路。	无权限、订单或图片回归问题。

构建目录 dist、netlify-dist、netlify/functions-build 是自动生成结果。它们被覆盖时不应手工修复；应回到源码和构建脚本修改后重新生成。
十一 故障排查
现象	优先检查	处理方向
手机或某网络打不开	Netlify 公共地址是否可达；DNS 记录和证书状态；是否叠加安全代理。	先测试 .netlify.app，再检查自定义域名 DNS。
菜单能开但图片慢或缺失	图片 URL 是否为 /uploads；函数日志是否有 Blob 读取错误；原站图片是否 404。	重新上传 404 的原图；确认 Blobs 依赖被打包。
图片上传失败	后台登录状态、格式、大小、Netlify 函数日志。	确认文件不超过 5MB；检查 Blobs 配置和原站回退。
后台显示无订单	SOURCE_SITE_ORIGIN、原 Sites Worker 和 D1 数据库。	确认网关仍回源到正确的原服务。
批量删除无效	日期、删除校验密码、Hash 和 Pepper 环境变量。	不要重置为明文密码；重新生成 HMAC 配置。
新发布没有生效	部署是否为生产环境、浏览器缓存、函数缓存。	查看部署 ID、刷新无缓存页面，并检查函数日志。

十二 后续独立化建议
仓库中保留 Turso 兼容层、数据库初始化脚本和数据导入脚本，目标是将菜单、订单和图片完全迁移至 Netlify / Turso，最终不再依赖原 Sites 服务。当前公开生产网关尚未启用该独立数据层，因此不能只设置 TURSO_DATABASE_URL 和 TURSO_AUTH_TOKEN 就关闭原服务。
完整独立化应单独立项：补齐 Netlify 函数对 Turso 数据层的实际调用，导入 migration 中的分类、菜品、订单、订单明细和图片，执行并发和权限测试，再在回退窗口后解除 SOURCE_SITE_ORIGIN 依赖。
十三 安全和交接要求
将管理员密码、会话密钥、删除密码校验材料、Netlify 账号和原 Sites 账号放入受控密码管理工具。
迁移目录可能含订单姓名、桌号和备注；只在受控设备保存，不上传公共网盘或公开仓库。
更换维护人员时，重新设置后台密码、会话密钥和删除密码 Pepper，并撤销不再需要的平台访问权限。
每次重大调整都保留提交号、发布日期、发布平台、变更摘要和回退方案。
十四 发布记录
每次生产发布完成后填写下表，作为版本追踪和后续回退依据。
日期时间	提交号或版本	发布平台和部署 ID	验收结果和操作人
________________	________________	________________	________________
________________	________________	________________	________________
________________	________________	________________	________________

文档版本 2026年9月21日
