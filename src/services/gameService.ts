import { supabase } from '../lib/supabase';
import { roomService } from './roomService';

export interface GameSession {
  id: string;
  room_id: string;
  game_type: string;
  status: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface GameQuestion {
  id: string;
  session_id: string;
  question: string;
  questioner_id: string;
  created_at: string;
  is_active: boolean;
}

export interface GameResponse {
  id: string;
  question_id: string;
  participant_id: string;
  response: boolean;
  created_at: string;
}

export interface RankingQuestion {
  id: string;
  session_id: string;
  question: string;
  questioner_id: string;
  created_at: string;
  is_active: boolean;
}

export interface RankingResponse {
  id: string;
  question_id: string;
  participant_id: string;
  rank_choice: number;
  created_at: string;
}

export interface SynchroQuestion {
  id: string;
  session_id: string;
  question: string;
  gm_id: string;
  created_at: string;
  is_active: boolean;
}

export interface SynchroResponse {
  id: string;
  question_id: string;
  participant_id: string;
  answer: string;
  created_at: string;
}

export const gameService = {
  async createGameSession(roomId: string, gameType: string = 'anonymous_survey'): Promise<GameSession> {
    console.log('Creating game session for room:', roomId);
    
    try {
      // Get current participant to set as creator
      const currentParticipant = await roomService.getCurrentParticipantFromRoom(roomId);
      
      const { data, error } = await supabase
        .from('game_sessions')
        .insert({
          room_id: roomId,
          game_type: gameType,
          status: 'active',
          created_by: currentParticipant?.id || null
        })
        .select()
        .single();

      if (error) {
        console.error('Error creating game session:', error);
        throw error;
      }

      console.log('Game session created:', data);
      return data;
    } catch (error) {
      console.error('Failed to create game session:', error);
      throw error;
    }
  },

  async getActiveGameSession(roomId: string): Promise<GameSession | null> {
    try {
      const { data, error } = await supabase
        .from('game_sessions')
        .select('*')
        .eq('room_id', roomId)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        console.error('Error getting active game session:', error);
        throw error;
      }

      return data;
    } catch (error) {
      console.error('Failed to get active game session:', error);
      return null;
    }
  },

  async getActiveQuestions(sessionId: string): Promise<{
    gameQuestions: GameQuestion[];
    rankingQuestions: RankingQuestion[];
    synchroQuestions: SynchroQuestion[];
  }> {
    try {
      const [gameQuestionsResult, rankingQuestionsResult, synchroQuestionsResult] = await Promise.all([
        supabase
          .from('game_questions')
          .select('*')
          .eq('session_id', sessionId)
          .eq('is_active', true)
          .order('created_at', { ascending: false })
          .limit(1),
        supabase
          .from('ranking_questions')
          .select('*')
          .eq('session_id', sessionId)
          .eq('is_active', true)
          .order('created_at', { ascending: false })
          .limit(1),
        supabase
          .from('synchro_questions')
          .select('*')
          .eq('session_id', sessionId)
          .eq('is_active', true)
          .order('created_at', { ascending: false })
          .limit(1)
      ]);

      return {
        gameQuestions: gameQuestionsResult.data || [],
        rankingQuestions: rankingQuestionsResult.data || [],
        synchroQuestions: synchroQuestionsResult.data || []
      };
    } catch (error) {
      console.error('Failed to get active questions:', error);
      return {
        gameQuestions: [],
        rankingQuestions: [],
        synchroQuestions: []
      };
    }
  },

  async createQuestion(sessionId: string, question: string, questionerId: string): Promise<GameQuestion> {
    console.log('Creating question for session:', sessionId);
    
    try {
      const { data, error } = await supabase
        .from('game_questions')
        .insert({
          session_id: sessionId,
          question,
          questioner_id: questionerId,
          is_active: true
        })
        .select()
        .single();

      if (error) {
        console.error('Error creating question:', error);
        throw error;
      }

      console.log('Question created:', data);
      return data;
    } catch (error) {
      console.error('Failed to create question:', error);
      throw error;
    }
  },

  async submitResponse(questionId: string, participantId: string, response: boolean): Promise<GameResponse> {
    console.log('Submitting response for question:', questionId);
    
    try {
      // Use upsert to handle duplicate responses
      const { data, error } = await supabase
        .from('game_responses')
        .upsert({
          question_id: questionId,
          participant_id: participantId,
          response
        }, {
          onConflict: 'question_id,participant_id'
        })
        .select()
        .single();

      if (error) {
        console.error('Error submitting response:', error);
        throw error;
      }

      console.log('Response submitted:', data);
      return data;
    } catch (error) {
      console.error('Failed to submit response:', error);
      throw error;
    }
  },

  async getQuestionResponses(questionId: string): Promise<GameResponse[]> {
    try {
      const { data, error } = await supabase
        .from('game_responses')
        .select('*')
        .eq('question_id', questionId);

      if (error) {
        console.error('Error getting question responses:', error);
        throw error;
      }

      return data || [];
    } catch (error) {
      console.error('Failed to get question responses:', error);
      return [];
    }
  },

  // Ranking Game Methods
  async createRankingQuestion(sessionId: string, question: string, questionerId: string): Promise<RankingQuestion> {
    console.log('Creating ranking question for session:', sessionId);
    
    try {
      const { data, error } = await supabase
        .from('ranking_questions')
        .insert({
          session_id: sessionId,
          question,
          questioner_id: questionerId,
          is_active: true
        })
        .select()
        .single();

      if (error) {
        console.error('Error creating ranking question:', error);
        throw error;
      }

      console.log('Ranking question created:', data);
      return data;
    } catch (error) {
      console.error('Failed to create ranking question:', error);
      throw error;
    }
  },

  async submitRankingResponse(questionId: string, participantId: string, rankChoice: number): Promise<RankingResponse> {
    console.log('Submitting ranking response for question:', questionId);
    
    try {
      // Use upsert to handle duplicate responses
      const { data, error } = await supabase
        .from('ranking_responses')
        .upsert({
          question_id: questionId,
          participant_id: participantId,
          rank_choice: rankChoice
        }, {
          onConflict: 'question_id,participant_id'
        })
        .select()
        .single();

      if (error) {
        console.error('Error submitting ranking response:', error);
        throw error;
      }

      console.log('Ranking response submitted:', data);
      return data;
    } catch (error) {
      console.error('Failed to submit ranking response:', error);
      throw error;
    }
  },

  async getRankingResponses(questionId: string): Promise<RankingResponse[]> {
    try {
      const { data, error } = await supabase
        .from('ranking_responses')
        .select('*')
        .eq('question_id', questionId);

      if (error) {
        console.error('Error getting ranking responses:', error);
        throw error;
      }

      return data || [];
    } catch (error) {
      console.error('Failed to get ranking responses:', error);
      return [];
    }
  },

  // Synchro Game Methods
  async createSynchroQuestion(sessionId: string, question: string, gmId: string): Promise<SynchroQuestion> {
    console.log('Creating synchro question for session:', sessionId);
    
    try {
      const { data, error } = await supabase
        .from('synchro_questions')
        .insert({
          session_id: sessionId,
          question,
          gm_id: gmId,
          is_active: true
        })
        .select()
        .single();

      if (error) {
        console.error('Error creating synchro question:', error);
        throw error;
      }

      console.log('Synchro question created:', data);
      return data;
    } catch (error) {
      console.error('Failed to create synchro question:', error);
      throw error;
    }
  },

  async submitSynchroResponse(questionId: string, participantId: string, answer: string): Promise<SynchroResponse> {
    console.log('Submitting synchro response for question:', questionId);
    
    try {
      // Use upsert to handle duplicate responses
      const { data, error } = await supabase
        .from('synchro_responses')
        .upsert({
          question_id: questionId,
          participant_id: participantId,
          answer: answer
        }, {
          onConflict: 'question_id,participant_id'
        })
        .select()
        .single();

      if (error) {
        console.error('Error submitting synchro response:', error);
        throw error;
      }

      console.log('Synchro response submitted:', data);
      return data;
    } catch (error) {
      console.error('Failed to submit synchro response:', error);
      throw error;
    }
  },

  async getSynchroResponses(questionId: string): Promise<SynchroResponse[]> {
    try {
      const { data, error } = await supabase
        .from('synchro_responses')
        .select('*')
        .eq('question_id', questionId);

      if (error) {
        console.error('Error getting synchro responses:', error);
        throw error;
      }

      return data || [];
    } catch (error) {
      console.error('Failed to get synchro responses:', error);
      return [];
    }
  },

  async getParticipantsForGame(roomId: string) {
    console.log('Fetching participants for game in room:', roomId);
    return await roomService.getParticipants(roomId);
  },

  async endGameSession(sessionId: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('game_sessions')
        .update({ 
          status: 'completed', 
          updated_at: new Date().toISOString() 
        })
        .eq('id', sessionId);

      if (error) {
        console.error('Error ending game session:', error);
        throw error;
      }

      console.log('Game session ended:', sessionId);
    } catch (error) {
      console.error('Failed to end game session:', error);
      throw error;
    }
  }
};