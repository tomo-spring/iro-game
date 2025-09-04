import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing Supabase environment variables. Please click "Connect to Supabase" to set up your database.'
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// 接続テスト
supabase.realtime.connect();

export type Participant = {
  id: string;
  room_id: string;
  nickname: string;
  session_token: string;
  joined_at: string;
  last_seen: string;
  is_online: boolean;
};

export type Room = {
  id: string;
  name: string | null;
  created_at: string;
  last_activity: string;
  is_active: boolean;
};
