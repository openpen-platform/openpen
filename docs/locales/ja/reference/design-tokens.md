---
title: OpenPen デザイントークン
description: plugin コンポーネントにホストのビジュアル言語を公開する --openpen-* プレフィックス配下の CSS カスタムプロパティです。
translationType: machine
translatedFrom: 8e4d741
translatedAt: 2026-05-22T00:00:00Z
language: ja
---

# OpenPen デザイントークン

OpenPen は `--openpen-*` プレフィックス配下に CSS カスタムプロパティ (デザイントークン) のセットを公開しています。これらのトークンは、ホストアプリケーションのビジュアル言語、すなわちカラー、スペーシング、ラジウス、アニメーションタイミング、エフェクトを表します。

plugin 作者は、ハードコードされた生の値を使う代わりに、コンポーネントスタイル内でこれらのトークンを参照することが SHOULD です。トークンは、OpenPen リリースをまたいだビジュアルの一貫性と、ダーク/ライトテーマへの自動準拠を保証する唯一の確実な手段です。

---

## plugin がトークンを自動的に受け取る仕組み

OpenPen のデザイントークンは、ホストアプリケーションの起動時に (ホストの CSS カスケードにインポートされる `@openpen/module-api/uikit/tokens.css` を介して) 一度だけ読み込まれます。plugin はホストと**同じドキュメント**内で動作します。`openpen-plugin://` スキームと importmap によって、すべての plugin が共有の Vue インスタンスおよび共有のブラウジングコンテキストに接続されるため、CSS カスケードは自動的に継承されます。

具体的には、plugin SFC 内のスコープドスタイルに `var(--openpen-*)` を記述するだけで、追加セットアップなしに現在のテーマのトークン値に解決されます。

```css
/* Works out of the box in any plugin SFC */
.my-panel {
  background: var(--openpen-color-surface-popup);
  border: 1px solid var(--openpen-color-border-hi);
  border-radius: var(--openpen-radius-md);
  color: var(--openpen-color-text-primary);
}
```

plugin エントリに `import '@openpen/module-api/uikit/tokens.css'` を追加しないでください。ホストはすでにこれらの宣言を `:root` に注入しています。plugin バンドル内で再度インポートすると、冗長な (場合によっては競合する) 2 回目の注入が発生します。

---

## 明示的インポート (オプション)

ホストのドキュメントスコープ外でレンダリングするコンポーネントをビルドする場合、例えば独自の `BrowserWindow` を開く plugin では、そのウィンドウのドキュメントにトークンスタイルシートを直接インポートする必要があります。このシナリオは現在 plugin システムでサポートされていませんが、エクスポートパスは前方互換性のために予約されています。

```ts
// Only needed if your component renders in a completely separate window.
// In normal plugins this import is unnecessary.
import '@openpen/module-api/uikit/tokens.css'
```

---

## トークンリファレンス

すべてのトークンは `:root` (ダークテーマのデフォルト) に定義されており、ライトテーマ用の `[data-theme='light']` オーバーライドブロックがあります。以下の[ダーク/ライトテーマのセクション](#ダークライトテーマへの準拠)を参照してください。

### カラー — アクセント

| トークン | デフォルト (ダーク) | 説明 |
|---|---|---|
| `--openpen-color-accent` | `#818cf8` | プライマリブランド / インタラクティブハイライト |
| `--openpen-color-accent-hover` | `#6366f1` | `:hover` 状態用のより深いアクセント |
| `--openpen-color-accent-bg` | `rgba(129,140,248,0.18)` | アクティブアイテム用のティントされた背景 |
| `--openpen-color-accent-glow` | `rgba(129,140,248,0.35)` | アクティブ要素のボックスシャドウリング |

### カラー — サーフェス

| トークン | デフォルト (ダーク) | 説明 |
|---|---|---|
| `--openpen-color-surface` | `rgba(18,26,48,0.88)` | フローティングパネル / バーのメイン背景 |
| `--openpen-color-surface-hi` | `rgba(30,41,70,0.92)` | ネストされたパネル / ホバー用の高度なサーフェス |
| `--openpen-color-surface-popup` | `rgba(20,28,50,0.90)` | ポップオーバー / ドロップダウンパネルの背景 |

### カラー — ボーダー

| トークン | デフォルト (ダーク) | 説明 |
|---|---|---|
| `--openpen-color-border` | `rgba(255,255,255,0.10)` | デフォルトの控えめなボーダー |
| `--openpen-color-border-hi` | `rgba(255,255,255,0.20)` | フォーカスリング / ポップアップフレーム用の高コントラストボーダー |
| `--openpen-color-popover-frame` | `var(--openpen-color-border-hi)` | ポップオーバー用の共有ボーダー + 矢印フィル (1 本の連続したエッジを保証) |

### カラー — テキスト

| トークン | デフォルト (ダーク) | 説明 |
|---|---|---|
| `--openpen-color-text-primary` | `#f1f5f9` | メインコンテンツテキスト |
| `--openpen-color-text-dim` | `#94a3b8` | セカンダリ / ラベルテキスト |
| `--openpen-color-text-muted` | `#64748b` | プレースホルダー / 無効化テキスト |

### カラー — ツールチップ

| トークン | デフォルト (ダーク) | 説明 |
|---|---|---|
| `--openpen-color-tooltip-bg` | `rgba(15,23,42,0.96)` | ツールチップ背景 (常にダーク、テーマ非依存) |
| `--openpen-color-tooltip-text` | `#f1f5f9` | ツールチップテキスト (常にライト、テーマ非依存) |
| `--openpen-color-tooltip-border` | `rgba(255,255,255,0.15)` | ツールチップボーダー (常にダーク背景上のライト、テーマ非依存) |

### カラー — コントロールバークロム

| トークン | デフォルト (ダーク) | 説明 |
|---|---|---|
| `--openpen-color-control-hover` | `rgba(255,255,255,0.08)` | コントロールバーボタンのホバー背景 |
| `--openpen-color-control-group` | `rgba(255,255,255,0.04)` | コントロールバーグループコンテナの背景 |

### カラー — ステート (info / warning / success / error)

各セマンティックステートには `bg`、`border`、`text`、`icon` の 4 つのトークンがあります。

| トークン | デフォルト (ダーク) | 説明 |
|---|---|---|
| `--openpen-color-state-info-bg` | `rgba(59,130,246,0.10)` | info ステート背景 |
| `--openpen-color-state-info-border` | `rgba(59,130,246,0.26)` | info ステートボーダー |
| `--openpen-color-state-info-text` | `#93c5fd` | info ステートテキスト |
| `--openpen-color-state-info-icon` | `#60a5fa` | info ステートアイコンフィル |
| `--openpen-color-state-warning-bg` | `rgba(251,191,36,0.10)` | warning ステート背景 |
| `--openpen-color-state-warning-border` | `rgba(251,191,36,0.28)` | warning ステートボーダー |
| `--openpen-color-state-warning-text` | `#fde68a` | warning ステートテキスト |
| `--openpen-color-state-warning-icon` | `#fbbf24` | warning ステートアイコンフィル |
| `--openpen-color-state-success-bg` | `rgba(52,211,153,0.10)` | success ステート背景 |
| `--openpen-color-state-success-border` | `rgba(52,211,153,0.26)` | success ステートボーダー |
| `--openpen-color-state-success-text` | `#6ee7b7` | success ステートテキスト |
| `--openpen-color-state-success-icon` | `#34d399` | success ステートアイコンフィル |
| `--openpen-color-state-error-bg` | `rgba(248,113,113,0.10)` | error ステート背景 |
| `--openpen-color-state-error-border` | `rgba(248,113,113,0.26)` | error ステートボーダー |
| `--openpen-color-state-error-text` | `#fca5a5` | error ステートテキスト |
| `--openpen-color-state-error-icon` | `#f87171` | error ステートアイコンフィル |

### カラー — フォームコントロール

| トークン | デフォルト (ダーク) | 説明 |
|---|---|---|
| `--openpen-color-toggle-off` | `rgba(255,255,255,0.12)` | トグルスイッチの非アクティブ状態トラック |
| `--openpen-color-input-bg` | `rgba(255,255,255,0.07)` | テキスト入力背景 |

### レイアウト — ラジウス

| トークン | 値 | 説明 |
|---|---|---|
| `--openpen-radius-sm` | `6px` | 小要素: ツールチップ、バッジ |
| `--openpen-radius-md` | `10px` | 標準要素: ボタン、入力フィールド |
| `--openpen-radius-lg` | `14px` | 大パネル: ポップオーバー、ドロップダウン |

### レイアウト — スペーシング

| トークン | 値 | 説明 |
|---|---|---|
| `--openpen-space-xs` | `4px` | タイトなギャップ |
| `--openpen-space-sm` | `8px` | 標準の内側パディング |
| `--openpen-space-md` | `12px` | セクションギャップ |
| `--openpen-space-lg` | `16px` | 外側マージン / セクション間隔 |

### アニメーション — デュレーション

| トークン | 値 | 説明 |
|---|---|---|
| `--openpen-duration-fast` | `150ms` | マイクロインタラクション (ボタンホバー) |
| `--openpen-duration-base` | `250ms` | 標準トランジション (コラプス) |
| `--openpen-duration-bounce` | `400ms` | アニメーションエントリ (オーバーシュートつき展開) |

### アニメーション — イージング

| トークン | 値 | 説明 |
|---|---|---|
| `--openpen-easing-bounce` | `cubic-bezier(0.34,1.56,0.64,1)` | オーバーシュートのあるスプリングライクなエントランス |
| `--openpen-easing-standard` | `cubic-bezier(0.4,0,0.2,1)` | マテリアルスタイルの標準イーズ |

### エフェクト — シャドウ

| トークン | 値 | 説明 |
|---|---|---|
| `--openpen-shadow` | `0 8px 32px rgba(0,0,0,0.55), 0 1px 0 rgba(255,255,255,0.06) inset` | フルフローティングパネルシャドウ |
| `--openpen-shadow-sm` | `0 4px 16px rgba(0,0,0,0.40)` | 小要素用の軽いシャドウ |

### エフェクト — ブラー

| トークン | 値 | 説明 |
|---|---|---|
| `--openpen-blur` | `blur(18px) saturate(160%)` | すりガラスパネル用のバックドロップブラー |

---

## ダーク/ライトテーマへの準拠

ホストはドキュメントルートの `data-theme` 属性 (`<html data-theme="light">`) によってテーマ状態を管理します。`var(--openpen-*)` を使用している限り、トークンは自動的に値を切り替えるため、plugin コンポーネントは追加設定なしにテーマに追従します。

テーマ間で変化するトークングループ:

- サーフェス、ボーダー、テキスト、コントロールクロム、トグル、入力フィールド — すべてライトモードでオーバーライド
- ステートカラーバリアント (info / warning / success / error) — すべてライトモードでオーバーライド
- シャドウ — ライトモードでオーバーライド (より明るく、柔らかい値)
- **アクセント、ラジウス、スペーシング、デュレーション、イージング** — テーマ間で変化しない

**意図的にテーマ非依存**なトークン:

- `--openpen-color-tooltip-bg`、`--openpen-color-tooltip-text`、`--openpen-color-tooltip-border` — テーマに関わらず常にダーク背景にライトテキストとボーダーを使用し、可読性を確保します。

```vue
<style scoped>
/* This panel is theme-aware with no extra JS */
.status-card {
  background: var(--openpen-color-surface-hi);
  border: 1px solid var(--openpen-color-border);
  color: var(--openpen-color-text-primary);
  padding: var(--openpen-space-md);
  border-radius: var(--openpen-radius-md);
}
</style>
```

---

## アンチパターン

### ハードコードされたカラー値

```css
/* ❌ Hardcoded — breaks in light theme, breaks if host palette changes */
.my-button {
  background: #818cf8;
  border-color: rgba(255, 255, 255, 0.20);
  color: #f1f5f9;
}

/* ✅ Token-driven — follows theme automatically */
.my-button {
  background: var(--openpen-color-accent);
  border-color: var(--openpen-color-border-hi);
  color: var(--openpen-color-text-primary);
}
```

### plugin 内での tokens.css のインポート

```ts
// ❌ Redundant — host already injects tokens into :root
import '@openpen/module-api/uikit/tokens.css'

// ✅ Nothing to import — use var(--openpen-*) directly
```

### ホストのセマンティクスを複製するカスタム --my-plugin-* トークン

```css
/* ❌ Reinventing what the host already provides */
:root {
  --my-plugin-bg: #818cf8; /* same as --openpen-color-accent */
}

/* ✅ Reference the host token directly */
.item { background: var(--openpen-color-accent-bg); }
```

---

## 関連ドキュメント

- [UIKit コンポーネントラッパー](../uikit/index.md) — トークンを自動的に適用するビルド済みコンポーネント
- [プリミティブ、エスケープハッチ & ピア依存ルール](../uikit/primitives.md) — レイヤー 2/3 アクセスと importmap コントラクト
- [カスタム UIKit コンポーネントガイド](../uikit/custom-components.md) — トークンを使って独自コンポーネントをビルドする
