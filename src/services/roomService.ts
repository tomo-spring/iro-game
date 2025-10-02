import { supabase } from "../lib/supabase";

// Generate a unique session token for this browser session
const getSessionToken = () => {
  let token = localStorage.getItem("room_session_token");
  if (!token) {
    token = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    localStorage.setItem("room_session_token", token);
  }
  return token;
};

// Store current participant info in localStorage
const setCurrentParticipant = (participant: any) => {
  localStorage.setItem("current_participant", JSON.stringify(participant));
};

const getCurrentParticipant = () => {
  const stored = localStorage.getItem("current_participant");
  return stored ? JSON.parse(stored) : null;
};

const clearCurrentParticipant = () => {
  localStorage.removeItem("current_participant");
  localStorage.removeItem("room_session_token");
};

export const roomService = {
  async joinRoom(roomId: string, nickname: string) {
    const sessionToken = getSessionToken();
    
    // モバイル環境での接続確認
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    const maxRetries = isMobile ? 5 : 3;
    let retryCount = 0;

    const attemptJoinRoom = async (): Promise<any> => {
      try {
        // モバイルでは少し待機してから実行
        if (isMobile && retryCount > 0) {
          await new Promise(resolve => setTimeout(resolve, 1000 * retryCount));
        }

      // First ensure room exists
      const { error: roomError } = await supabase.from("rooms").upsert(
        {
          id: roomId,
          name: roomId,
          is_active: true,
        },
        { onConflict: "id" }
      );

      if (roomError) {
        console.error("Error creating/updating room:", roomError);
        console.error("Room error details:", JSON.stringify(roomError, null, 2));
        throw roomError;
      }

      // Clean up any existing participant with same nickname in this room (but different session)
      await supabase
        .from("participants")
        .delete()
        .eq("room_id", roomId)
        .eq("nickname", nickname)
        .neq("session_token", sessionToken);

      // Join the room using upsert to handle existing session tokens
      const { data, error } = await supabase
        .from("participants")
        .upsert(
          {
            room_id: roomId,
            nickname: nickname,
            session_token: sessionToken,
            is_online: true,
            joined_at: new Date().toISOString(),
            last_seen: new Date().toISOString(),
          },
          {
            onConflict: "session_token",
            ignoreDuplicates: false,
          }
        )
        .select()
        .single();

      if (error) {
        console.error("Error joining room:", error);
        console.error("Join error details:", JSON.stringify(error, null, 2));
        throw error;
      }
      setCurrentParticipant(data);

      // Trigger broadcasts to notify other clients
      const channel = supabase.channel(`room-updates-${roomId}`);
      await channel.send({
        type: "broadcast",
        event: "participant_joined",
        payload: { participant: data },
      });

      // Also send to participants channel
      const participantsChannel = supabase.channel(`participants-${roomId}`);
      await participantsChannel.send({
        type: "broadcast",
        event: "participant_update",
        payload: { action: "joined", participant: data },
      });

      return data;
      } catch (error) {
        console.error(`Join room attempt ${retryCount + 1} failed:`, error);
        
        if (retryCount < maxRetries - 1) {
          retryCount++;
          console.log(`Retrying join room (attempt ${retryCount + 1}/${maxRetries})...`);
          return attemptJoinRoom();
        }
        
        throw error;
      }
    };

    try {
      return await attemptJoinRoom();
    } catch (error) {
      console.error("Failed to join room after all retries:", error);
      throw new Error(`ルームへの参加に失敗しました。ネットワーク接続を確認してください。(${error instanceof Error ? error.message : 'Unknown error'})`);
    }
  },

  async leaveRoom(participantId: string) {
    try {
      // Get participant info before deletion for broadcast
      const { data: participant } = await supabase
        .from("participants")
        .select("room_id")
        .eq("id", participantId)
        .single();

      const { error } = await supabase
        .from("participants")
        .delete()
        .eq("id", participantId);

      if (error) {
        console.error("Error leaving room:", error);
        throw error;
      }

      // Trigger broadcasts to notify other clients
      if (participant) {
        const channel = supabase.channel(`room-updates-${participant.room_id}`);
        await channel.send({
          type: "broadcast",
          event: "participant_left",
          payload: { participantId },
        });

        // Also send to participants channel
        const participantsChannel = supabase.channel(
          `participants-${participant.room_id}`
        );
        await participantsChannel.send({
          type: "broadcast",
          event: "participant_update",
          payload: { action: "left", participantId },
        });
      }

      clearCurrentParticipant();
    } catch (error) {
      console.error("Failed to leave room:", error);
      throw error;
    }
  },

  async updateLastSeen(participantId: string) {
    try {
      const { error } = await supabase
        .from("participants")
        .update({
          last_seen: new Date().toISOString(),
          is_online: true,
        })
        .eq("id", participantId);

      if (error) {
        console.error("Error updating last seen:", error);
        throw error;
      }
    } catch (error) {
      console.error("Failed to update last seen:", error);
    }
  },

  async cleanupInactiveParticipants(roomId: string) {
    try {
      // Remove participants inactive for more than 2 minutes
      const cutoff = new Date(Date.now() - 2 * 60 * 1000).toISOString();

      const { error } = await supabase
        .from("participants")
        .delete()
        .eq("room_id", roomId)
        .lt("last_seen", cutoff);

      if (error) {
        console.error("Error cleaning up inactive participants:", error);
      } else {
      }
    } catch (error) {
      console.error("Failed to cleanup inactive participants:", error);
    }
  },

  async getParticipants(roomId: string) {
    try {
      // Clean up inactive participants first
      await this.cleanupInactiveParticipants(roomId);

      // Fetch current participants
      const { data, error } = await supabase
        .from("participants")
        .select("*")
        .eq("room_id", roomId)
        .eq("is_online", true)
        .order("joined_at", { ascending: true });

      if (error) {
        console.error("Error fetching participants:", error);
        throw error;
      }

      return data || [];
    } catch (error) {
      console.error("Failed to fetch participants:", error);
      throw error;
    }
  },

  async getCurrentParticipantFromRoom(roomId: string) {
    const sessionToken = getSessionToken();

    try {
      const { data, error } = await supabase
        .from("participants")
        .select("*")
        .eq("room_id", roomId)
        .eq("session_token", sessionToken)
        .eq("is_online", true)
        .maybeSingle();

      if (error) {
        console.error("Error getting current participant:", error);
        throw error;
      }

      if (data) {
        setCurrentParticipant(data);
        // Update last seen
        await this.updateLastSeen(data.id);
        return data;
      }

      return null;
    } catch (error) {
      console.error("Failed to get current participant:", error);
      return null;
    }
  },

  getSessionToken,
  getCurrentParticipant,
  setCurrentParticipant,
  clearCurrentParticipant,
};
