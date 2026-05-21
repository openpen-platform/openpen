---
title: 'Windows: Transparent overlay shows black background'
description: 診斷並修復 Windows 透明覆蓋層顯示黑色背景的問題，該問題導致 OpenPen 渲染為不透明黑色畫布。
translationType: machine
translatedFrom: 8e4d741
translatedAt: 2026-05-22T00:00:00Z
language: zh-Hant
---

# Windows: Transparent overlay shows black background

## 症狀

在 Windows 上執行 OpenPen 時，繪圖覆蓋層視窗（或浮動控制列）
出現**純黑色背景**，而非透明狀態。覆蓋層遮蓋了整個畫面，
使桌面與其他應用程式無法從背後顯示。

在較輕微的情況下，你可能會看到球形或列邊緣出現黑色閃爍，
或是在切換至另一個視窗至前景時，覆蓋層才變為黑色。

OpenPen 會在啟動時偵測此狀況，若偵測到問題則顯示警告橫幅。

---

## 原因

這是一個已知的 Electron 平台錯誤
（[Electron issue #40515](https://github.com/electron/electron/issues/40515)），
影響特定 GPU 硬體與顯示卡驅動程式的組合。

Windows 需要 GPU 合成器支援每個像素的 alpha 混合，才能呈現透明的
`layered windows`。部分 GPU 驅動程式——尤其是較舊的 Intel 整合式 GPU 驅動程式，
以及 Windows 10 上的部分 AMD 顯示驅動程式——回報支援合成器，但實際輸出不正確：
它們不是將透明區域與桌面混合，而是以純黑色（`RGBA 0,0,0,255`）填滿。

此錯誤發生在驅動程式層；Electron 與 OpenPen 無法在程序內可靠地修復。

---

## 受影響的設定

此故障與 GPU／驅動程式有關，目前尚未完整列舉所有情況。已回報的模式包括：

- Intel 整合式顯示卡（UHD 620、UHD 630、Iris Xe），驅動程式版本早於
  約 27.20.x / 2021。
- Windows 10（20H2 及更早版本）上的部分 AMD Radeon RX 500 系列驅動程式。
- 使用無硬體合成器之軟體渲染器的虛擬機器與遠端桌面工作階段
  （VMware、VirtualBox、使用基本顯示介面卡的 RDP）。

使用獨立 NVIDIA GPU 且驅動程式為最新版本的系統通常不受影響。

---

## 因應措施

請依序嘗試以下選項。第一個解決黑色背景問題的方法，
即是適合你系統的修復方式。

### 1. 更新顯示卡驅動程式（建議優先嘗試）

直接從 GPU 廠商下載最新驅動程式——不要透過 Windows Update，
因為 Windows Update 通常會落後數個月：

- **Intel**：https://www.intel.com/content/www/us/en/download-center/home.html
- **AMD**：https://www.amd.com/en/support/download/drivers.html
- **NVIDIA**：https://www.nvidia.com/download/index.aspx

更新後請重新開機，再重新啟動 OpenPen。

### 2. 強制 OpenPen 使用另一顆 GPU（筆記型電腦使用者）

如果你的筆電同時有整合式 GPU 與獨立 GPU（例如 Intel iGPU + NVIDIA dGPU），
Windows 可能正在用整合式 GPU 執行 OpenPen。請嘗試強制改用獨立 GPU：

1. 開啟 **Windows 設定 → 系統 → 顯示器 → 圖形** （Windows 11），或
   **控制台 → NVIDIA 控制台 → 管理 3D 設定**（Windows 10）。
2. 將 `OpenPen.exe` 加入應用程式清單。
3. 將 GPU 偏好設定設為**高效能**（獨立 GPU）。
4. 重新啟動 OpenPen。

### 3. 以相容性模式執行

右鍵點選 `OpenPen.exe` → **內容 → 相容性**：

- 勾選**「停用全螢幕最佳化」**。
- 勾選**「以系統管理員身分執行此程式」**（僅在你對此感到放心，
  且其他步驟均無效時才勾選）。

每次變更後請重新啟動 OpenPen。

---

## 為何 OpenPen 不自動修復此問題

停用硬體加速（`--disable-gpu` 旗標）可以避免黑色背景錯誤。
然而，OpenPen 是一款即時繪圖應用程式：硬體加速對於流暢的手繪筆觸、
壓力模擬與畫布合成至關重要。停用硬體加速會造成嚴重的幀率下降，
使應用程式在主要使用情境下無法正常操作。

與其靜默降低所有使用者的繪圖體驗，僅為了規避一個只影響少數使用者的
驅動程式錯誤，OpenPen 選擇偵測此狀況並通知你，讓你能直接針對根本原因
（即驅動程式）進行處理。

---

## 回報問題

若上述因應措施均無效，請至 GitHub 開立 issue 並附上以下資訊：

1. 你的 GPU 型號與驅動程式版本（位於**裝置管理員 → 顯示介面卡 →
   右鍵點選你的 GPU → 內容 → 驅動程式標籤**）。
2. 你的 Windows 版本（從開始功能表執行 `winver`）。
3. DirectX 診斷工具的輸出：按 `Win + R`，輸入 `dxdiag`，點選
   **顯示**標籤。點選**儲存所有資訊⋯**，並將產生的 `DxDiag.txt`
   附加至 issue（其中包含 GPU 驅動程式與功能層級詳細資料，
   可精確定位錯誤至特定驅動程式版本）。

此資訊有助於識別新的驅動程式組合，並追蹤上游 Electron 修復的進度。

**Electron 上游 issue：** https://github.com/electron/electron/issues/40515
