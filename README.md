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
