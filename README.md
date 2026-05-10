# Agenda Core - 社長タスク管理ダッシュボード

Chatworkのメッセージリンクを起点に、社長宛のタスクを秘書が管理するためのツール。
GitHub Pages + Private リポジトリ構成で、サーバー不要・無料で運用可能。

## 機能

- Chatworkメッセージリンクを貼り付けてタスク登録(手動入力も可)
- ステータス管理:未着手 / 進行中 / 引継ぎ済 / 対応不要 / 完了
- 期限・優先度・依頼者の管理
- 対応メモ欄(秘書↔社長のやりとりを時系列で蓄積)
- ステータス別の件数表示・絞り込み・検索
- 担当者管理(絶対管理者 / 管理者 / メンバー の3階層)
- 操作履歴(誰がいつ何を変えたか)を自動記録

## ファイル構成

```
Public リポジトリ(コード公開)
├── index.html              ダッシュボード(メイン)
├── login.html              共有ID/PWログイン
├── setup.html              初期設定(PAT保存)
├── operator-select.html    担当者選択
├── admin.html              管理画面(担当者管理 + リンク発行)
├── github-store.js         GitHub API + 認証ロジック
├── style.css               共通スタイル
├── assets/
│   ├── koala-wave.png      キャラクター(手振り)
│   ├── koala-wave2.png     キャラクター(手振り2)
│   ├── koala-thumbs.png    キャラクター(サムズアップ)
│   ├── koala-cheer.png     キャラクター(キラキラ)
│   └── koala-work.png      キャラクター(PC作業)
└── README.md

Private リポジトリ(データ保存先)
├── users.json              担当者一覧
└── tasks.json              タスクデータ(初回アクセス時に自動生成)
```

## 初回セットアップ手順

### 1. GitHubリポジトリを準備

1. **Private** リポジトリ `Agenda-Core-Data` を作成
2. リポジトリ直下に `users.json` を作成し、以下を保存:

```json
{
  "users": [],
  "version": 1
}
```

### 2. Fine-grained PAT を発行

1. GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens
2. 「Generate new token」をクリック
3. 設定:
   - **Token name**: `Agenda Core Token`
   - **Expiration**: 90日(期限切れ前に再発行)
   - **Repository access**: 「Only select repositories」→ `Agenda-Core-Data` を選択
   - **Permissions** → Repository permissions:
     - **Contents**: Read and write
     - **Metadata**: Read-only(自動付与)
4. 生成された `github_pat_xxx...` をコピーして安全な場所に保管

### 3. github-store.js の設定値を書き換え

`github-store.js` の冒頭を編集:

```javascript
const GITHUB_CONFIG = {
  owner: 'YOUR_GITHUB_USERNAME',     // ← あなたのGitHubユーザー名
  repo: 'Agenda-Core-Data',          // (そのまま)
  ...
};

const SUPER_ADMIN_EMAIL = 'admin@example.com';  // ← 絶対管理者(あなた)のメアド

const SHARED_LOGIN_ID = 'agenda';        // ← 二人で共有するID
const SHARED_LOGIN_PW = 'core2026';      // ← 二人で共有するPW
```

### 4. Public リポジトリにコードを配置

1. GitHub に `Agenda-Core` という名前で **Public** リポジトリを作成
2. 上記ファイル一式をコミット&プッシュ
3. リポジトリ設定 → Pages → Source: `main` ブランチ → 保存
4. 数分後、`https://<ユーザー名>.github.io/Agenda-Core/` で公開される

### 5. 初回アクセス(絶対管理者)

ブラウザで初期設定リンクを直接組み立てる:

```
https://<ユーザー名>.github.io/Agenda-Core/setup.html#token=<PAT>&email=<絶対管理者メアド>
```

このURLを開けば、PATがブラウザに保存され、以降は通常のログインフローで使えます。

### 6. 秘書(社長)の招待

1. login.html → operator-select.html で空状態 → 「絶対管理者として続行」
2. admin.html を開く
3. 「担当者を追加」で社長と秘書を登録
4. 「初期設定リンクを発行」で各担当者用のURLを生成
5. ChatworkダイレクトチャットでURLを送る
6. 受け取った人がリンクをクリック → そのPCで使えるようになる

## 日次の使い方

1. ブックマークから `https://<ユーザー名>.github.io/Agenda-Core/` を開く
2. 共有ID/PWでログイン
3. 担当者を選択(社長 or 秘書)
4. ダッシュボードが開く
5. Chatworkで社長宛のメッセージが来たら、メッセージのURLをコピーして「+ 新しいタスクを登録」から登録
6. ステータスを動かしながら案件を消化

## セキュリティについて

- **共有ID/PW** はソースコード上に書かれているので、技術的には漏れる可能性あり。ただし、ID/PWだけでは何もできない設計(PATがないとデータ取得不可)
- **PAT** はlocalStorageに保存。Fine-grained PATなのでデータリポジトリしか触れない
- 万一、PCを盗まれた場合や担当者が辞めた場合は、PATを失効(GitHub上で削除)+新しいPATを発行
- PATは90日で期限切れ → 失効する前に管理者が再発行 → 「初期設定リンク」を担当者に再送

## トラブルシューティング

- **ログインできない**: PATの有効期限切れの可能性。管理者に再発行を依頼
- **データが見られない**: ネットワーク・GitHubの稼働状態を確認
- **競合エラー**: 同時編集時の競合は自動リトライされるが、稀に失敗する。再読み込みで再試行

## 参考

このシステムは「Import Core 認証システム」仕様 v1 をベースに、
タスク管理用にカスタマイズしたもの。
