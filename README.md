## iro-game

リアルタイムに複数人で遊べるミニゲーム集（React + Vite + TypeScript + Tailwind CSS + Supabase）。ルームに参加し、ニックネームで入室して各種ゲーム（例: Werewolf/人狼 など）を遊べます。

### 必要要件

- **Node.js 18+**（Vite 5 の要件）
- **npm** もしくは **pnpm/yarn**
- **Supabase プロジェクト**（URL と anon キー）

### セットアップ

1. リポジトリを取得し依存関係をインストール

```bash
git clone <this-repo>
cd iro-game
npm install
```

2. 環境変数を設定（Vite 用 `.env.local`）

```bash
cp .env.example .env.local # ない場合は .env.local を新規作成
```

`.env.local` に以下を記載:

```bash
VITE_SUPABASE_URL=あなたのSupabaseプロジェクトURL
VITE_SUPABASE_ANON_KEY=あなたのSupabase anon キー
```

3. データベーススキーマの適用（任意・必要に応じて）

- 本リポジトリには `supabase/migrations/` に SQL が同梱されています。以下のいずれかの方法で適用します。
  - Supabase ダッシュボードの SQL Editor に各ファイルを貼り付けて実行
  - Supabase CLI を使用（リモート適用の例）:
    ```bash
    brew install supabase/tap/supabase # 未導入の場合（macOS）
    supabase login
    supabase link --project-ref <your-project-ref>
    supabase db push
    ```

### 実行

- 開発サーバー

```bash
npm run dev
```

ブラウザで `http://localhost:5173` を開きます。

- 本番ビルド / プレビュー

```bash
npm run build
npm run preview
```

### スクリプト

- `npm run dev`: Vite の開発サーバーを起動
- `npm run build`: 本番ビルドを作成
- `npm run preview`: ビルド成果物をローカルでプレビュー
- `npm run lint`: ESLint を実行

### ディレクトリ構成（抜粋）

```
iro-game/
  src/
    components/        # 画面/ゲーム用コンポーネント
    hooks/             # カスタムフック
    lib/supabase.ts    # Supabase クライアント生成
    services/          # ルーム/ゲームロジック
  public/              # 静的アセット
  supabase/migrations/ # DB スキーマ（SQL）
```

### 環境変数

- `VITE_SUPABASE_URL`: Supabase プロジェクトの URL
- `VITE_SUPABASE_ANON_KEY`: Supabase の anon キー

`src/lib/supabase.ts` では、これらが未設定の場合にエラーを投げます。

### よくあるエラーと対処

- エラー: `Missing Supabase environment variables...`
  - 対処: `.env.local` に `VITE_SUPABASE_URL` と `VITE_SUPABASE_ANON_KEY` を設定して再起動

### デプロイ

- Vercel/Netlify など任意のホスティングにビルド成果物を配置可能です。
- 環境変数（`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`）をデプロイ先にも設定してください。

### ライセンス

プロジェクトのライセンス方針に合わせて追記してください。
