---
title: 信任模型
description: OpenPen plugin 的完整渲染进程访问权限说明，以及用户安全安装 plugin 的指南。
translationType: machine
translatedFrom: 8e4d741
translatedAt: 2026-05-22T00:00:00Z
language: zh-Hans
---

# 信任模型

OpenPen plugin 以**完整访问权限**运行于宿主渲染进程中。
本页说明这意味着什么，以及如何安全地安装 plugin。

---

## 用户安装的信任

当你安装一个 plugin 时，它将获得：

- 完整访问 `window.openPenApi` — 宿主暴露的所有 IPC 调用
- 完整访问共享的 Vue 实例及所有响应式状态
- 完整访问 DOM — 包括其他 plugin 和宿主所拥有的 UI
- 通过 `fetch` / `XMLHttpRequest` 进行网络访问

这是一个经过深思熟虑的选择。在生态系统的初创阶段，plugin 无需经历权限摩擦即可构建强大的集成能力。在 contribution slot API 经过充分验证之前强制引入沙箱，只会拖慢 plugin 开发，而在实际使用上收效甚微。

### 安装时的安全保障

Plugin 安装是纯文件解压操作——安装过程中不会执行任何代码。
OpenPen CLI 和 GUI 均强制执行以下规则：

- 安装过程中不执行 `npm install` / `npm run build`
- 任何阶段均不执行 shell 脚本
- Plugin 包仅包含预构建产物（`plugin.json` + `dist/`）

代码执行仅发生一次：即重启后由运行时**加载** plugin 时。这意味着安装步骤本身不存在代码执行风险；风险被推迟到加载步骤，届时模块加载器可以隔离并回滚失败。

### 基础防护措施

OpenPen 强制执行以下基础防护：

| 防护措施 | 作用说明 |
|------------|--------------|
| `contextIsolation: true` | Node.js 上下文与渲染进程上下文相互隔离——plugin 无法在渲染进程代码中直接调用原始 Node.js API |
| `nodeIntegration: false` | 渲染进程中不可使用 `require('fs')` 或 `require('path')` |
| `webSecurity: true` | 标准 CORS 和混合内容规则适用（Electron 默认值，未禁用） |
| 出站请求审计日志 | 任何 plugin 发起的出站 HTTP(S) 请求均记录在内存审计日志环形缓冲区中，可通过 DevTools 中的 openPenApi.getAuditLogEntries() 访问。专用 UI 面板正在规划中。 |

这些措施可减轻意外误用的风险，但**无法**阻止你所安装的 plugin 蓄意发动攻击。

---

## 此模型无法阻止的行为

你安装的 plugin 可以：

- 读取主目录中的文件（通过 `callMain` 桥接到主进程处理程序）
- 向你机器上的任意路径写入文件
- 向任意服务器发送 HTTP 请求
- 订阅所有 OpenPen 事件，包括绘图描边数据
- 以任意方式修改宿主 UI——包括隐藏按钮或注入内容

**在安装任何 plugin 之前，请自行评估其来源。** Plugin 是以你的权限在你的机器上运行的 JavaScript / TypeScript。请像对待从 GitHub 安装任意开源桌面应用程序一样对待它。

### 针对相同信任模型的一次有据可查的攻击

2026 年 4 月，Elastic Security Labs 记录了针对 Obsidian 用户的 **PHANTOMPULSE 活动**。攻击者利用社会工程学手段，向金融和加密货币领域的专业人士分享了一个恶意 vault。该 vault 包含两个合法的社区 plugin——**Shell Commands** 和 **Hider**——并预配置为静默执行攻击者控制的命令。

此次攻击无需利用 Obsidian 本身的任何漏洞，而是完全按照设计意图利用了信任模型：用户安装了 plugin，而 plugin 拥有运行任意 shell 命令的完整权限。

OpenPen 的模型具有相同的形态和相同的风险面。唯一可用的缓解措施是**用户对所安装内容保持警惕**。

参考资料：
- [Phantom in the vault — Elastic Security Labs](https://www.elastic.co/security-labs/phantom-in-the-vault)
- [Obsidian Plugin Abuse Delivers PHANTOMPULSE RAT — The Hacker News](https://thehackernews.com/2026/04/obsidian-plugin-abuse-delivers.html)

---

## 如何安全地安装 plugin

1. **优先选择知名、有署名的作者。** 来自拥有公开 GitHub 历史记录和其他已发布项目的开发者的 plugin，风险远低于匿名账户发布的 plugin。

2. **阅读源代码。** Plugin 是 JavaScript / TypeScript——通常是单个 `dist/renderer.js` 文件。如果你无法或不愿阅读它，请像对待来自未知来源的二进制文件一样对待它。

3. **关注审计日志。** 已安装 plugin 的网络请求会被记录在审计日志中。通过 DevTools 中的 openPenApi.getAuditLogEntries() 查询；专用 UI 面板正在规划中。意外的目标地址是危险信号。

4. **卸载未使用的 plugin。** 每个未激活的 plugin 仍会被加载。减小攻击面意味着减少潜在的入口点。

5. **举报可疑行为。** 如果某个 plugin 的行为异常——发出无法解释的网络请求、修改文件或改变宿主 UI——请举报。有关负责任的披露流程，请参阅 [`SECURITY.md`](../../SECURITY.md)。

---

## 举报问题

如果你发现某个 plugin 存在恶意行为，或 OpenPen 的 plugin 加载机制本身存在漏洞，请通过 [`SECURITY.md`](../../SECURITY.md) 进行举报。

请勿在 GitHub 上公开提交安全漏洞的 issue。
