import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing Supabase environment variables. Please click "Connect to Supabase" to set up your database.'
  );
}

// モバイル環境での接続設定を最適化
const isMobile = typeof window !== 'undefined' && /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
  realtime: {
    params: {
      eventsPerSecond: isMobile ? 5 : 10, // モバイルでは頻度を下げる
    },
    heartbeatIntervalMs: isMobile ? 60000 : 30000, // モバイルでは長めに設定
    reconnectAfterMs: (tries: number) => Math.min(tries * 1000, 30000), // 段階的に再接続間隔を延長
  },
  db: {
    schema: 'public',
  },
  global: {
    headers: {
      'X-Client-Info': isMobile ? 'mobile-browser' : 'desktop-browser',
    },
  },
});
// 接続テスト
const connectRealtime = async () => {
  try {
    console.log('Connecting to Supabase realtime...');
    supabase.realtime.connect();
    
    // モバイルでは接続確認を行う
    if (isMobile) {
      setTimeout(() => {
        const channels = supabase.realtime.channels;
        console.log(`Realtime connection status: ${channels.length > 0 ? 'Connected' : 'Disconnected'}`);
      }, 2000);
    }
  } catch (error) {
    console.error('Failed to connect to Supabase realtime:', error);
  }
};

connectRealtime();

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
