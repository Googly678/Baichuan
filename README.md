# 骑手非车险理赔系统 (V2 — Rider Claims System)

> **演示用系统**：面向外卖/快递骑手群体的非车险理赔（雇主责任险、团体意外险、第三者责任险）。
> 当前为**演示级 (Demo)**：已对接专家评审需要的核心场景。

---

## 🌐 在线演示地址（部署后填这里）

| 入口 | URL |
|---|---|
| 前端（GitHub Pages） | `https://googly678.github.io/Baichuan/` |
| 后端（Render）        | `https://rider-claims-api.onrender.com` |

> ⚠️ **首次访问冷启动 30-50 秒**（Render 免费档限制）。专家演示前务必先开一个标签页轮询一次让后端热起来。

---

## 🏗️ 架构

```
┌─────────────────────┐         ┌──────────────────────┐
│  GitHub Pages        │  HTTPS  │  Render Web Service   │
│  (静态前端)          │ ──────▶ │  (Express 后端)        │
│  React + Vite        │         │  Node.js + TS         │
│  HashRouter          │         │  JSON 文件回退存储     │
└─────────────────────┘         └──────────────────────┘
                                          │
                                          ▼
                                Render 临时磁盘
                                (重启会丢，演示级)
```

**前端栈**：React 18 + TypeScript + Vite + Ant Design 5 + React Router 6 (HashRouter)
**后端栈**：Node 20 + Express + TypeScript + Prisma（可选）+ JSON Fallback 存储

---

## 📁 目录结构

```
v2-rider-system/
├── .github/workflows/deploy.yml   # GitHub Actions：自动部署到 Pages
├── .gitignore                       # 排除 .pg-local/, .env, node_modules/
├── render.yaml                      # Render Blueprint
├── README.md
├── frontend/
│   ├── src/
│   │   ├── App.tsx                  # HashRouter 包裹
│   │   ├── main.tsx
│   │   ├── components/
│   │   ├── pages/                   # 5 个工作台 + 案件详情等
│   │   └── utils/api.ts             # 走 VITE_API_BASE_URL
│   ├── vite.config.ts               # base: './' (相对路径)
│   └── package.json
└── backend/
    ├── src/
    │   ├── index.ts                 # Express + CORS 白名单
    │   ├── pricing/                 # 自研定价引擎（演示级，未接路由）
    │   │   ├── types.ts
    │   │   ├── snapshot.ts
    │   │   ├── selfPay.ts
    │   │   ├── quotas.ts
    │   │   ├── calc.ts
    │   │   ├── seed.ts
    │   │   └── __tests__/pricing.test.ts   # 32 个单元测试
    │   ├── storage.ts               # KV + JSON 回退
    │   └── seedData.ts              # 5 条演示案件
    └── package.json                 # 含 start:prod 脚本
```

---

## 🚀 本地开发

### 前置依赖
- Node.js ≥ 20
- npm ≥ 10

### 启动后端
```bash
cd backend
npm install
npm run dev          # Windows：会自动跑 ensure-db.ps1 起本地 Postgres
```

### 启动前端
```bash
cd frontend
npm install
npm run dev          # 默认 http://localhost:5174，Vite 自动代理 /api → 3000
```

打开 http://localhost:5174 即可。

---

## 🧪 运行定价引擎测试

```bash
cd backend
# 一次性编译到临时目录
npx tsc --outDir build-test --module commonjs --target es2020 \
  --esModuleInterop --strict --skipLibCheck --moduleResolution node \
  src/pricing/types.ts src/pricing/snapshot.ts src/pricing/quotas.ts \
  src/pricing/selfPay.ts src/pricing/calc.ts src/pricing/seed.ts \
  src/pricing/__tests__/pricing.test.ts
# 跑测试
node --test build-test/__tests__/pricing.test.js
# 清理
rm -rf build-test
```

**当前状态**：32/32 通过。

---

## 🌐 部署到 GitHub Pages + Render

### 一次性准备（10 分钟）

#### 1. 推到 GitHub
```bash
cd v2-rider-system
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/Googly678/Baichuan.git
git push -u origin main
```

#### 2. 部署后端（Render）
1. 注册 https://render.com，连接 GitHub
2. **New → Blueprint**，选本仓库
3. Render 会读 `render.yaml`，自动建 web service
4. 等部署完成（5-8 分钟），拿到 URL 类似 `https://rider-claims-api-xxxx.onrender.com`

#### 3. 配置前端 secret（关键）
1. 仓库 **Settings → Secrets and variables → Actions → New repository secret**
2. Name: `VITE_API_BASE_URL`
3. Value: 第 2 步拿到的 Render URL（**带 https:// 前缀，无尾斜杠**）

#### 4. 启用 GitHub Pages
1. 仓库 **Settings → Pages → Source: GitHub Actions**
2. 下次 push 到 main 自动触发部署

### 验证清单

部署完成后，访问前端 URL，按这个清单验证：

- [ ] 能打开首页
- [ ] URL 改成 `#/dashboard/claim` 刷新仍是首页（HashRouter 起作用）
- [ ] 切换"客服专员"角色 → 左侧菜单只显示"报案工作台"和"案件查询"
- [ ] 点开任一案件 → 能加载数据（首次需等待 30 秒冷启动）
- [ ] 浏览器 console 无 CORS 报错

---

## ⚠️ 已知限制（演示级，非生产级）

| 限制 | 影响 | 何时解决 |
|---|---|---|
| Render 免费档无数据库 | 数据存 JSON 文件，**容器重启会丢** | 接 Render Postgres |
| Render 冷启动 30-50 秒 | 第一次访问慢 | 升级 Render 付费档 / 加 keep-alive |
| `pricing/` 引擎未接路由 | 32 个测试全通过，但 API 不调用 | 在 `LossItem` 计算里调用 `priceTask()` |
| 种子数据是假数据 | 专家可能识破 | 用真实脱敏数据替换 |
| 单文件 `TaskDetail.tsx` 3000+ 行 | 维护难 | 按业务域拆分 |

---

## 🎤 演示给专家的话术（参考）

### 自费药剔除
> "我们的设计是**两层解耦**：药品属性和地区结算参数都做成了数据表，按地区编码查询。优先级是就医地→就医省→国家，找不到就**强制走人工复核，绝不兜底默认**——因为默认值是合规雷区。"

### 跨地区报销
> "不一致。我们按 GB/T 2260 三级回溯：**就医地 → 就医省 → 国家**。所有数据带 `effective_date`，**保单立案时锁快照**，避免目录调整回溯。"

### 审计合规
> "每一次自动剔除 + 人工调整都记审计日志，含 step、rule、operator、ts——支持回放和等保审查。"

### 限额嵌套
> "per_person / per_incident / per_period 三层并行检查，**瓶颈处截断并标记**。超过部分触发上级审批流。"

---

## 📝 License

仅用于内部演示。