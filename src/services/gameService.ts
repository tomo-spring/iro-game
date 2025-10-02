import { supabase } from '../lib/supabase';
import { roomService } from './roomService';

// 排他制御用のフラグとキュー
const gameOperationLocks = new Map<string, boolean>();
const gameOperationQueues = new Map<string, Array<() => Promise<any>>>();

// 回答取得のキャッシュ（重複リクエストを防ぐ）
const responseCache = new Map<string, { data: any[], timestamp: number }>();
const CACHE_DURATION = 2000; // 2秒間キャッシュ

// 排他制御ヘルパー関数
const withGameLock = async <T>(key: string, operation: () => Promise<T>): Promise<T> => {
  // 既に実行中の場合はキューに追加
  if (gameOperationLocks.get(key)) {
    return new Promise((resolve, reject) => {
      const queue = gameOperationQueues.get(key) || [];
      queue.push(async () => {
        try {
          const result = await operation();
          resolve(result);
        } catch (error) {
          reject(error);
        }
      });
      gameOperationQueues.set(key, queue);
    });
  }

  // ロックを取得
  gameOperationLocks.set(key, true);
  
  try {
    const result = await operation();
    return result;
  } finally {
    // ロックを解放
    gameOperationLocks.delete(key);
    
    // キューにある次の操作を実行
    const queue = gameOperationQueues.get(key);
    if (queue && queue.length > 0) {
      const nextOperation = queue.shift()!;
      gameOperationQueues.set(key, queue);
      // 次の操作を非同期で実行
      setTimeout(() => nextOperation(), 0);
    } else {
      gameOperationQueues.delete(key);
    }
  }
};

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
    return withGameLock(`createSession-${roomId}-${gameType}`, async () => {
      console.log('Creating game session for room:', roomId);
      
      const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      const maxRetries = isMobile ? 3 : 1;
      let retryCount = 0;
      
      const attemptCreateSession = async (): Promise<GameSession> => {
        try {
          if (isMobile && retryCount > 0) {
            await new Promise(resolve => setTimeout(resolve, 500 * retryCount));
          }

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
          console.error('Session creation error details:', JSON.stringify(error, null, 2));
          throw error;
        }

        console.log('Game session created:', data);
        return data;
        } catch (error) {
          console.error(`Create session attempt ${retryCount + 1} failed:`, error);
          
          if (retryCount < maxRetries - 1) {
            retryCount++;
            console.log(`Retrying create session (attempt ${retryCount + 1}/${maxRetries})...`);
            return attemptCreateSession();
          }
          
          throw error;
        }
      };

      try {
        return await attemptCreateSession();
      } catch (error) {
        console.error('Failed to create game session after all retries:', error);
        throw new Error(`ゲームセッションの作成に失敗しました。(${error instanceof Error ? error.message : 'Unknown error'})`);
      }
    });
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
          .order('created_at', { ascending: false }),
        supabase
          .from('ranking_questions')
          .select('*')
          .eq('session_id', sessionId)
          .eq('is_active', true)
          .order('created_at', { ascending: false }),
        supabase
          .from('synchro_questions')
          .select('*')
          .eq('session_id', sessionId)
          .eq('is_active', true)
          .order('created_at', { ascending: false })
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
    return withGameLock(`createQuestion-${sessionId}`, async () => {
      console.log('Creating question for session:', sessionId);
      
      const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      const maxRetries = isMobile ? 3 : 1;
      let retryCount = 0;
      
      const attemptCreateQuestion = async (): Promise<GameQuestion> => {
        try {
          if (isMobile && retryCount > 0) {
            await new Promise(resolve => setTimeout(resolve, 500 * retryCount));
          }

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
          console.error('Question creation error details:', JSON.stringify(error, null, 2));
          throw error;
        }

        console.log('Question created:', data);
        return data;
        } catch (error) {
          console.error(`Create question attempt ${retryCount + 1} failed:`, error);
          
          if (retryCount < maxRetries - 1) {
            retryCount++;
            console.log(`Retrying create question (attempt ${retryCount + 1}/${maxRetries})...`);
            return attemptCreateQuestion();
          }
          
          throw error;
        }
      };

      try {
        return await attemptCreateQuestion();
      } catch (error) {
        console.error('Failed to create question after all retries:', error);
        throw new Error(`質問の作成に失敗しました。(${error instanceof Error ? error.message : 'Unknown error'})`);
      }
    });
  },

  async submitResponse(questionId: string, participantId: string, response: boolean): Promise<GameResponse> {
    return withGameLock(`submitResponse-${questionId}-${participantId}`, async () => {
      console.log('Submitting response for question:', questionId);
      
      const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      const maxRetries = isMobile ? 3 : 1;
      let retryCount = 0;
      
      const attemptSubmitResponse = async (): Promise<GameResponse> => {
        try {
          if (isMobile && retryCount > 0) {
            await new Promise(resolve => setTimeout(resolve, 500 * retryCount));
          }

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
          console.error('Response submission error details:', JSON.stringify(error, null, 2));
          throw error;
        }

        console.log('Response submitted:', data);
        return data;
        } catch (error) {
          console.error(`Submit response attempt ${retryCount + 1} failed:`, error);
          
          if (retryCount < maxRetries - 1) {
            retryCount++;
            console.log(`Retrying submit response (attempt ${retryCount + 1}/${maxRetries})...`);
            return attemptSubmitResponse();
          }
          
          throw error;
        }
      };

      try {
        return await attemptSubmitResponse();
      } catch (error) {
        console.error('Failed to submit response after all retries:', error);
        throw new Error(`回答の送信に失敗しました。(${error instanceof Error ? error.message : 'Unknown error'})`);
      }
    });
  },

  async getQuestionResponses(questionId: string): Promise<GameResponse[]> {
    // キャッシュをチェック
    const cached = responseCache.get(`responses-${questionId}`);
    const now = Date.now();
    
    if (cached && (now - cached.timestamp) < CACHE_DURATION) {
      return cached.data;
    }
    
    try {
      const { data, error } = await supabase
        .from('game_responses')
        .select('*')
        .eq('question_id', questionId);

      if (error) {
        console.error('Error getting question responses:', error);
        throw error;
      }

      // キャッシュに保存
      responseCache.set(`responses-${questionId}`, {
        data: data || [],
        timestamp: now
      });

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
    // キャッシュをチェック
    const cached = responseCache.get(`ranking-responses-${questionId}`);
    const now = Date.now();
    
    if (cached && (now - cached.timestamp) < CACHE_DURATION) {
      return cached.data;
    }
    
    try {
      const { data, error } = await supabase
        .from('ranking_responses')
        .select('*')
        .eq('question_id', questionId);

      if (error) {
        console.error('Error getting ranking responses:', error);
        throw error;
      }

      // キャッシュに保存
      responseCache.set(`ranking-responses-${questionId}`, {
        data: data || [],
        timestamp: now
      });

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
    // キャッシュをチェック
    const cached = responseCache.get(`synchro-responses-${questionId}`);
    const now = Date.now();
    
    if (cached && (now - cached.timestamp) < CACHE_DURATION) {
      return cached.data;
    }
    
    try {
      const { data, error } = await supabase
        .from('synchro_responses')
        .select('*')
        .eq('question_id', questionId);

      if (error) {
        console.error('Error getting synchro responses:', error);
        throw error;
      }

      // キャッシュに保存
      responseCache.set(`synchro-responses-${questionId}`, {
        data: data || [],
        timestamp: now
      });

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

  // キャッシュをクリアする関数
  clearResponseCache(questionId?: string): void {
    if (questionId) {
      responseCache.delete(`responses-${questionId}`);
      responseCache.delete(`ranking-responses-${questionId}`);
      responseCache.delete(`synchro-responses-${questionId}`);
    } else {
      responseCache.clear();
    }
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

      // セッション終了時にキャッシュをクリア
      responseCache.clear();

      console.log('Game session ended:', sessionId);
    } catch (error) {
      console.error('Failed to end game session:', error);
      throw error;
    }
  }
};