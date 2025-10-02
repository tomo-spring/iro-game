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

    // Initial fetch
    fetchParticipants();

    // Subscribe to real-time changes via WebSocket (ポーリング削除、完全リアルタイム化)
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
          // データベース変更を即座に反映
          fetchParticipants();
        }
      )
      .on("broadcast", { event: "participant_update" }, (payload) => {
        if (mounted && !fetchingRooms.has(roomId)) {
          // ブロードキャストイベントを即座に反映
          fetchParticipants();
        }
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          console.log(`✅ リアルタイム接続確立: ${channelName}`);
        }
      });

    return () => {
      mounted = false;
      fetchingRooms.delete(roomId);
      supabase.removeChannel(channel);
    };
  }, [roomId]);

  return { participants, loading, error };
}
