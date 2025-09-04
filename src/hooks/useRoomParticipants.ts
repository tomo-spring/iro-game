import { useState, useEffect } from "react";
import { supabase, type Participant } from "../lib/supabase";
import { roomService } from "../services/roomService";

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
      }
    };

    fetchParticipants();

    // Set up periodic refresh every 2 seconds for better responsiveness
    refreshInterval = window.setInterval(() => {
      if (mounted) {
        fetchParticipants();
      }
    }, 2000); // Refresh every 2 seconds

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

          // Refresh from database to ensure consistency
          fetchParticipants();
        }
      )
      .on("broadcast", { event: "participant_update" }, (payload) => {
        if (mounted) {
          fetchParticipants();
        }
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          // Force refresh after subscription
          setTimeout(() => {
            if (mounted) {
              fetchParticipants();
            }
          }, 1000);
        }
      });

    return () => {
      mounted = false;
      if (refreshInterval) {
        clearInterval(refreshInterval);
      }
      supabase.removeChannel(channel);
    };
  }, [roomId]);

  return { participants, loading, error };
}
