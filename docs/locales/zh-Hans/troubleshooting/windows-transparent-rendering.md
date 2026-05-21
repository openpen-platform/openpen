---
title: 'Windows: Transparent overlay shows black background'
description: 诊断并解决 Windows 透明叠加层回归问题——OpenPen 渲染出纯黑色而非透明画布的情况。
translationType: machine
translatedFrom: 8e4d741
translatedAt: 2026-05-22T00:00:00Z
language: zh-Hans
---

# Windows：透明叠加层显示黑色背景

## 症状

在 Windows 上运行 OpenPen 时，绘图叠加层窗口（或浮动控制栏）显示**纯黑色背景**，而非透明状态。叠加层覆盖整个屏幕，使桌面及其他程序在其后方不可见。

情况较轻时，你可能会看到球或控制栏边缘出现黑色闪烁，或者当另一个窗口切换到前台时叠加层才变为黑色。

OpenPen 会在启动时检测此情况，并在发现时显示警告横幅。

---

## 原因

这是一个已知的 Electron 平台 bug
（[Electron issue #40515](https://github.com/electron/electron/issues/40515)），影响特定 GPU 硬件与显卡驱动的组合。

Windows 要求 GPU 合成器支持逐像素 alpha 混合以实现透明 `layered windows`。某些 GPU 驱动——尤其是较旧的 Intel 集成显卡驱动以及 Windows 10 上部分 AMD 显示驱动——声称支持合成器但产生错误输出：它们不会将透明区域与桌面混合，而是以纯黑色（`RGBA 0,0,0,255`）填充。

此 bug 位于驱动层面；Electron 和 OpenPen 在进程内无可靠修复方案。

---

## 受影响的配置

该故障与 GPU/驱动相关，尚未完整列举。已报告的模式包括：

- Intel 集成显卡（UHD 620、UHD 630、Iris Xe），驱动版本早于约 27.20.x / 2021 年。
- Windows 10（20H2 及更早版本）上部分 AMD Radeon RX 500 系列驱动。
- 使用无硬件合成器的软件渲染器的虚拟机和远程桌面会话（VMware、VirtualBox、使用基本显示适配器的 RDP）。

配备独立 NVIDIA GPU 且驱动为最新版的系统通常不受影响。

---

## 解决方法

按顺序逐一尝试以下选项。第一个解决黑色背景问题的方案即为适合你系统的修复方案。

### 1. 更新显卡驱动（推荐首选步骤）

直接从 GPU 厂商下载最新驱动——不要通过 Windows Update，因为它通常滞后数月：

- **Intel**：https://www.intel.com/content/www/us/en/download-center/home.html
- **AMD**：https://www.amd.com/en/support/download/drivers.html
- **NVIDIA**：https://www.nvidia.com/download/index.aspx

更新后，重启系统并重新启动 OpenPen。

### 2. 强制 OpenPen 使用另一块 GPU（笔记本用户）

如果你的笔记本同时配有集成显卡和独立显卡（例如 Intel iGPU + NVIDIA dGPU），Windows 可能正在用集成显卡运行 OpenPen。尝试强制使用独立显卡：

1. 打开 **Windows 设置 → 系统 → 显示 → 图形**（Windows 11）或
   **控制面板 → NVIDIA 控制面板 → 管理 3D 设置**（Windows 10）。
2. 将 `OpenPen.exe` 添加到应用列表。
3. 将 GPU 偏好设置为**高性能**（独立显卡）。
4. 重新启动 OpenPen。

### 3. 以兼容模式运行

右键点击 `OpenPen.exe` → **属性 → 兼容性**：

- 勾选**"禁用全屏优化"**。
- 勾选**"以管理员身份运行此程序"**（仅在你对此感到放心且其他步骤均无效时才勾选）。

每次更改后重新启动 OpenPen。

---

## 为什么 OpenPen 不自动修复此问题

禁用硬件加速（`--disable-gpu` 标志）可以防止黑色背景 bug。但 OpenPen 是一款实时绘图程序：硬件加速对于流畅的徒手笔触、压力模拟和画布合成至关重要。禁用硬件加速会导致严重的帧率下降，使程序无法正常用于其主要用途。

相比于为所有用户静默降级绘图体验来规避只影响少数人的驱动 bug，OpenPen 选择检测该情况并通知你，以便你直接针对根本原因（驱动）采取措施。

---

## 反馈报告

如果以上解决方法均无效，请在 GitHub 提交 issue 并附上以下信息：

1. 你的 GPU 型号和驱动版本（可在**设备管理器 → 显示适配器 → 右键点击你的 GPU → 属性 → 驱动程序选项卡**中查看）。
2. 你的 Windows 版本（从开始菜单运行 `winver`）。
3. DirectX 诊断工具的输出：按 `Win + R`，输入 `dxdiag`，然后点击 **显示**选项卡。点击**保存所有信息…** 并将生成的 `DxDiag.txt` 附加到 issue 中（其中包含 GPU 驱动和功能级别详细信息，可精确定位 bug 对应的驱动版本）。

此信息有助于识别新的驱动组合，并跟踪上游 Electron 修复的进展。

**Electron 上游 issue：** https://github.com/electron/electron/issues/40515
