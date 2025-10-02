import { useState, useEffect } from "react";
import { supabase, type Participant } from "../lib/supabase";
import { roomService } from "../services/roomService";

// フェッチの重複実行を防ぐためのフラグ
const fetchingRooms = new Set<string>();

export function useRoomParticipants(roomId: string) {
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!roomId) return;

    let mounted = true;
    let refreshInterval: number;

    // Fetch initial participants
    const fetchParticipants = async () => {
      // 既に同じルームでフェッチ中の場合はスキップ
      if (fetchingRooms.has(roomId)) {
        return;
      }
      
      fetchingRooms.add(roomId);
      
      try {
        const data = await roomService.getParticipants(roomId);

        if (mounted) {
          setParticipants(data);
          setLoading(false);
          setError(null);
        }
      } catch (err) {
        if (mounted) {
          setError(
            err instanceof Error ? err.message : "Failed to fetch participants"
          );
          setLoading(false);
        }
      } finally {
        fetchingRooms.delete(roomId);
      }
    };

    fetchParticipants();

    // Set up periodic refresh every 3 seconds (頻度を下げて負荷軽減)
    refreshInterval = window.setInterval(() => {
      if (mounted) {
        fetchParticipants();
      }
    }, 3000); // Refresh every 3 seconds

    // Subscribe to real-time changes
    const channelName = `participants-${roomId}-${Date.now()}`;
    const channel = supabase
      .channel(channelName, {
        config: {
          broadcast: { self: false },
          presence: { key: roomId },
          private: false,
        },
      })
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "participants",
          filter: `room_id=eq.${roomId}`,
        },
        (payload) => {
          if (!mounted) return;

          // デバウンス処理でフェッチ頻度を制限
          setTimeout(() => {
            if (mounted) {
              fetchParticipants();
            }
          }, 500);
        }
      )
      .on("broadcast", { event: "participant_update" }, (payload) => {
        if (mounted && !fetchingRooms.has(roomId)) {
          // デバウンス処理
          setTimeout(() => {
            if (mounted) {
              fetchParticipants();
            }
          }, 300);
        }
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          // Force refresh after subscription
          setTimeout(() => {
            if (mounted && !fetchingRooms.has(roomId)) {
              fetchParticipants();
            }
          }, 1000);
        }
      });

    return () => {
      mounted = false;
      fetchingRooms.delete(roomId);
      if (refreshInterval) {
        clearInterval(refreshInterval);
      }
      supabase.removeChannel(channel);
    };
  }, [roomId]);

  return { participants, loading, error };
}
