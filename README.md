# Xiangqi Family Live - Technical Plan

## Technical Selection (技术选型)

Given the constraints (One developer, limited time, Android target, Real-time video/audio), the following stack is chosen for maximum efficiency and performance:

1.  **Core Framework: React 18 + TypeScript**
    *   **Why:** Component-based UI is perfect for the Chess Board. Strong ecosystem. TypeScript ensures logic safety for complex game rules.
2.  **Styling: Tailwind CSS**
    *   **Why:** Rapid UI development, mobile-first design (critical for Android usage).
3.  **Real-time & AI: Google Gemini Live API (Multimodal)**
    *   **Why:** Solves "Video/Audio" and "Ask for Helper" simultaneously.
4.  **Multiplayer Backend: Supabase**
    *   **Why:** Provides "Database as a Service" with Realtime capabilities out of the box. No backend code required to sync chess moves between phones.
5.  **Platform: Progressive Web App (PWA)**
    *   **Why:** "Android App" requirement is best met via PWA for a single dev.

## Database Setup (Supabase)

To enable online play, create a Supabase project and run the following SQL in the SQL Editor:

```sql
-- Create the games table
create table public.games (
  id text primary key, -- The 4-digit room code
  pieces jsonb not null, -- Current board state
  turn text not null, -- 'RED' or 'BLACK'
  last_move jsonb, -- The last move made (for highlighting)
  winner text, -- 'RED', 'BLACK', or null
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable Realtime
alter publication supabase_realtime add table public.games;

-- Disable Row Level Security (RLS) for this prototype (Simplicity)
-- For production, you should enable RLS and add policies.
alter table public.games disable row level security;
```

## Environment Variables

Create a `.env` file (or configure in your deployment platform):

```
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
API_KEY=your_gemini_api_key
```

## Task List (任务列表)

1.  **Project Setup**
    *   [x] Initialize React + Vite + TypeScript.
    *   [x] Configure Tailwind CSS.
2.  **Game Engine (Frontend)**
    *   [x] Define Data Structures (Board, Piece, Side).
    *   [x] Implement Xiangqi Rules.
3.  **Online Multiplayer (Supabase)**
    *   [x] Integrate Supabase Client.
    *   [x] Implement "Create Room" (Host plays Red).
    *   [x] Implement "Join Room" (Guest plays Black).
    *   [x] Real-time state synchronization.
4.  **AI Companion Integration**
    *   [x] Integrate `@google/genai` SDK.
    *   [x] Implement Audio/Video Streaming.
5.  **Deployment**
    *   [ ] Deploy to Vercel/Netlify.

## PWA

本项目启用了 PWA 支持（通过 `vite-plugin-pwa`）：

- 清单 (manifest): 由 `vite.config.ts` 中的 `VitePWA` 插件生成，构建产物为 `dist/manifest.webmanifest`。
- 应用图标: `icon.svg` 位于项目根目录，被作为可遮罩图标使用。
- Service Worker: 构建后 `dist/sw.js`（生产），开发时使用 `dev-sw.js`（由插件在 dev 环境注入）。

运行与测试：

开发（启用 dev SW）:
```bash
npm run dev
```
然后在浏览器打开 `http://localhost:5173`（或 Vite 提示的地址），打开开发者工具 -> Application -> Service Workers，可看到 `dev-sw.js` 已注册。

生产构建并本地预览：
```bash
npm run build
npm run preview
```
在预览页面打开开发者工具 -> Application -> Manifest 可查看应用清单；在 Application -> Service Workers 可查看 `sw.js` 是否已注册。

注意：将网站安装为 PWA 会把前端资源暴露到用户设备。若你需要更严格的后端安全（例如保护 API keys），请使用后端代理而不是把敏感密钥放到客户端。
