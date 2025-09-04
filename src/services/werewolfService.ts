import { supabase } from '../lib/supabase';
import { roomService } from './roomService';

export interface WerewolfSession {
  id: string;
  room_id: string;
  citizen_topic: string;
  werewolf_topic: string;
  phase: 'setup' | 'talk' | 'vote' | 'sudden_death' | 'reverse_chance' | 'finished';
  talk_time_seconds: number;
  reverse_mode: boolean;
  created_at: string;
  updated_at: string;
}

export interface WerewolfAssignment {
  id: string;
  session_id: string;
  participant_id: string;
  role: 'citizen' | 'werewolf';
  topic: string;
  created_at: string;
}

export interface WerewolfVote {
  id: string;
  session_id: string;
  voter_id: string;
  target_id: string;
  vote_round: number;
  created_at: string;
}

export interface WerewolfGuess {
  id: string;
  session_id: string;
  werewolf_id: string;
  guessed_topic: string;
  created_at: string;
}

export const werewolfService = {
  async createSession(
    roomId: string, 
    citizenTopic: string, 
    werewolfTopic: string, 
    reverseMode: boolean = false
  ): Promise<WerewolfSession> {
    console.log('Creating werewolf session for room:', roomId);
    
    try {
      const { data, error } = await supabase
        .from('werewolf_sessions')
        .insert({
          room_id: roomId,
          citizen_topic: citizenTopic,
          werewolf_topic: werewolfTopic,
          phase: 'setup',
          reverse_mode: reverseMode,
          talk_time_seconds: 300
        })
        .select()
        .single();

      if (error) {
        console.error('Error creating werewolf session:', error);
        throw error;
      }

      console.log('Werewolf session created:', data);
      return data;
    } catch (error) {
      console.error('Failed to create werewolf session:', error);
      throw error;
    }
  },

  async assignRoles(sessionId: string, participants: any[]): Promise<WerewolfAssignment[]> {
    console.log('Assigning roles for session:', sessionId);
    
    try {
      // Get session data
      const { data: session, error: sessionError } = await supabase
        .from('werewolf_sessions')
        .select('*')
        .eq('id', sessionId)
        .single();

      if (sessionError) throw sessionError;

      // Randomly select werewolf (minority)
      const shuffled = [...participants].sort(() => Math.random() - 0.5);
      const werewolfCount = Math.max(1, Math.floor(participants.length / 3)); // 1/3 are werewolves
      
      const assignments = shuffled.map((participant, index) => {
        const isWerewolf = index < werewolfCount;
        return {
          session_id: sessionId,
          participant_id: participant.id,
          role: isWerewolf ? 'werewolf' : 'citizen',
          topic: isWerewolf ? session.werewolf_topic : session.citizen_topic
        };
      });

      const { data, error } = await supabase
        .from('werewolf_assignments')
        .insert(assignments)
        .select();

      if (error) {
        console.error('Error assigning roles:', error);
        throw error;
      }

      console.log('Roles assigned:', data);
      return data || [];
    } catch (error) {
      console.error('Failed to assign roles:', error);
      throw error;
    }
  },

  async getAssignment(sessionId: string, participantId: string): Promise<WerewolfAssignment | null> {
    try {
      const { data, error } = await supabase
        .from('werewolf_assignments')
        .select('*')
        .eq('session_id', sessionId)
        .eq('participant_id', participantId)
        .maybeSingle();

      if (error) {
        console.error('Error getting assignment:', error);
        throw error;
      }

      return data;
    } catch (error) {
      console.error('Failed to get assignment:', error);
      return null;
    }
  },

  async updatePhase(sessionId: string, phase: WerewolfSession['phase']): Promise<void> {
    try {
      const { error } = await supabase
        .from('werewolf_sessions')
        .update({ 
          phase,
          updated_at: new Date().toISOString()
        })
        .eq('id', sessionId);

      if (error) {
        console.error('Error updating phase:', error);
        throw error;
      }

      console.log('Phase updated to:', phase);
    } catch (error) {
      console.error('Failed to update phase:', error);
      throw error;
    }
  },

  async updateTalkTime(sessionId: string, seconds: number): Promise<void> {
    try {
      const { error } = await supabase
        .from('werewolf_sessions')
        .update({ 
          talk_time_seconds: seconds,
          updated_at: new Date().toISOString()
        })
        .eq('id', sessionId);

      if (error) {
        console.error('Error updating talk time:', error);
        throw error;
      }
    } catch (error) {
      console.error('Failed to update talk time:', error);
      throw error;
    }
  },

  async submitVote(sessionId: string, voterId: string, targetId: string, voteRound: number = 1): Promise<WerewolfVote> {
    console.log('Submitting vote:', { sessionId, voterId, targetId, voteRound });
    
    try {
      const { data, error } = await supabase
        .from('werewolf_votes')
        .upsert({
          session_id: sessionId,
          voter_id: voterId,
          target_id: targetId,
          vote_round: voteRound
        }, {
          onConflict: 'session_id,voter_id,vote_round'
        })
        .select()
        .single();

      if (error) {
        console.error('Error submitting vote:', error);
        throw error;
      }

      console.log('Vote submitted:', data);
      return data;
    } catch (error) {
      console.error('Failed to submit vote:', error);
      throw error;
    }
  },

  async getVotes(sessionId: string, voteRound: number = 1): Promise<WerewolfVote[]> {
    try {
      const { data, error } = await supabase
        .from('werewolf_votes')
        .select('*')
        .eq('session_id', sessionId)
        .eq('vote_round', voteRound);

      if (error) {
        console.error('Error getting votes:', error);
        throw error;
      }

      return data || [];
    } catch (error) {
      console.error('Failed to get votes:', error);
      return [];
    }
  },

  async submitGuess(sessionId: string, werewolfId: string, guessedTopic: string): Promise<WerewolfGuess> {
    console.log('Submitting guess:', { sessionId, werewolfId, guessedTopic });
    
    try {
      const { data, error } = await supabase
        .from('werewolf_guesses')
        .upsert({
          session_id: sessionId,
          werewolf_id: werewolfId,
          guessed_topic: guessedTopic
        }, {
          onConflict: 'session_id,werewolf_id'
        })
        .select()
        .single();

      if (error) {
        console.error('Error submitting guess:', error);
        throw error;
      }

      console.log('Guess submitted:', data);
      return data;
    } catch (error) {
      console.error('Failed to submit guess:', error);
      throw error;
    }
  },

  async getSession(sessionId: string): Promise<WerewolfSession | null> {
    try {
      const { data, error } = await supabase
        .from('werewolf_sessions')
        .select('*')
        .eq('id', sessionId)
        .maybeSingle();

      if (error) {
        console.error('Error getting session:', error);
        throw error;
      }

      return data;
    } catch (error) {
      console.error('Failed to get session:', error);
      return null;
    }
  },

  async getActiveSession(roomId: string): Promise<WerewolfSession | null> {
    try {
      const { data, error } = await supabase
        .from('werewolf_sessions')
        .select('*')
        .eq('room_id', roomId)
        .neq('phase', 'finished')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        console.error('Error getting active session:', error);
        throw error;
      }

      return data;
    } catch (error) {
      console.error('Failed to get active session:', error);
      return null;
    }
  },

  async getAllAssignments(sessionId: string): Promise<WerewolfAssignment[]> {
    try {
      const { data, error } = await supabase
        .from('werewolf_assignments')
        .select('*')
        .eq('session_id', sessionId);

      if (error) {
        console.error('Error getting all assignments:', error);
        throw error;
      }

      return data || [];
    } catch (error) {
      console.error('Failed to get all assignments:', error);
      return [];
    }
  },

  async getParticipantsForGame(roomId: string) {
    console.log('Fetching participants for werewolf game in room:', roomId);
    return await roomService.getParticipants(roomId);
  },

  async endSession(sessionId: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('werewolf_sessions')
        .update({ 
          phase: 'finished',
          updated_at: new Date().toISOString()
        })
        .eq('id', sessionId);

      if (error) {
        console.error('Error ending session:', error);
        throw error;
      }

      console.log('Werewolf session ended:', sessionId);
    } catch (error) {
      console.error('Failed to end session:', error);
      throw error;
    }
  }
};