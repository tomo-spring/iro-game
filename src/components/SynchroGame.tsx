import React, { useState, useEffect } from "react";
import {
  Zap,
  X,
  Users,
  Clock,
  CheckCircle,
  RotateCcw,
  Target,
  Shuffle,
} from "lucide-react";
import { supabase } from "../lib/supabase";
import { gameService, type SynchroQuestion } from "../services/gameService";
import type { Participant } from "../lib/supabase";
import { roomService } from "../services/roomService";
import { synchroTopics, pickRandom } from "../services/topics";

interface SynchroGameProps {
  roomId: string;
  sessionId: string | null;
  participants: Participant[];
  onClose: () => void;
}

interface GameState {
  phase: "waiting_for_question" | "gm_selected" | "answering" | "results";
  question: string;
  questionId: string;
  responses: { [participantId: string]: string };
  gmId: string;
  gmName: string;
  sessionId: string;
}

export function SynchroGame({ roomId, sessionId, onClose }: SynchroGameProps) {
  const [gameState, setGameState] = useState<GameState>({
    phase: "waiting_for_question",
    question: "",
    questionId: "",
    responses: {},
    gmId: "",
    gmName: "",
    sessionId: sessionId || "",
  });
  const [currentQuestion, setCurrentQuestion] = useState("");
  const [currentAnswer, setCurrentAnswer] = useState("");
  const [hasAnswered, setHasAnswered] = useState(false);
  const [isGM, setIsGM] = useState(false);
  const [currentParticipant, setCurrentParticipant] =
    useState<Participant | null>(null);
  const [currentGameSessionId, setCurrentGameSessionId] = useState<string>(
    sessionId || ""
  );
  const [gameParticipants, setGameParticipants] = useState<Participant[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRestoringState, setIsRestoringState] = useState(true);

  // ゲーム開始時に参加者をDBから取得
  useEffect(() => {
    const fetchGameParticipants = async () => {
      if (!roomId) return;

      setLoading(true);

      try {
        const participants = await gameService.getParticipantsForGame(roomId);
        setGameParticipants(participants);

        const current = await roomService.getCurrentParticipantFromRoom(roomId);
        if (current) {
          setCurrentParticipant(current);
        } else {
        }
      } catch (error) {
      } finally {
        setLoading(false);
      }
    };

    fetchGameParticipants();
  }, [roomId]);

  // ページ読み込み時にゲーム状態を復元
  useEffect(() => {
    const restoreGameState = async () => {
      if (!roomId) return;
      
      setIsRestoringState(true);
      
      try {
        // まずDBから最新のゲーム状態を取得
        const activeSession = await gameService.getActiveGameSession(roomId);
        if (activeSession && activeSession.game_type === 'synchro') {
          setCurrentGameSessionId(activeSession.id);
          
          // アクティブな質問があるかチェック
          const { synchroQuestions } = await gameService.getActiveQuestions(activeSession.id);
          if (synchroQuestions.length > 0) {
            const activeQuestion = synchroQuestions[0];
            
            // GM情報を取得
            const gm = gameParticipants.find(p => p.id === activeQuestion.gm_id);
            
            // 自分の回答状況をチェック
            if (currentParticipant) {
              const responses = await gameService.getSynchroResponses(activeQuestion.id);
              const myResponse = responses.find(r => r.participant_id === currentParticipant.id);
              
              setGameState({
                phase: "answering",
                question: activeQuestion.question,
                questionId: activeQuestion.id,
                responses: responses.reduce((acc, r) => ({ ...acc, [r.participant_id]: r.answer }), {}),
                gmId: activeQuestion.gm_id,
                gmName: gm?.nickname || "不明",
                sessionId: activeSession.id,
              });
              
              setHasAnswered(!!myResponse);
              setCurrentAnswer(myResponse?.answer || "");
              setIsGM(activeQuestion.gm_id === currentParticipant.id);
            }
          }
        }
        
        const storedState = localStorage.getItem(`synchro_state_${roomId}`);
        if (storedState) {
          const state = JSON.parse(storedState);
          const now = Date.now();
          const stateTime = new Date(state.timestamp).getTime();
          
          // 状態が30分以内で、かつDBの状態と矛盾しない場合のみ復元
          if (now - stateTime < 30 * 60 * 1000 && !activeSession) {
            setGameState(state.gameState);
            setCurrentQuestion(state.currentQuestion || "");
            setCurrentAnswer(state.currentAnswer || "");
            setHasAnswered(state.hasAnswered || false);
            setIsGM(state.isGM || false);
            setCurrentGameSessionId(state.sessionId || "");
          } else {
            localStorage.removeItem(`synchro_state_${roomId}`);
          }
        }
      } catch (error) {
        console.error('Failed to restore synchro game state:', error);
        localStorage.removeItem(`synchro_state_${roomId}`);
      } finally {
        setIsRestoringState(false);
      }
    };

    restoreGameState();
  }, [roomId, gameParticipants, currentParticipant]);

  // ゲーム状態が変更されたときにローカルストレージに保存
  useEffect(() => {
    if (!roomId || isRestoringState) return;
    
    const stateToSave = {
      gameState,
      currentQuestion,
      currentAnswer,
      hasAnswered,
      isGM,
      sessionId: currentGameSessionId,
      timestamp: new Date().toISOString()
    };
    
    localStorage.setItem(`synchro_state_${roomId}`, JSON.stringify(stateToSave));
  }, [gameState, currentQuestion, currentAnswer, hasAnswered, isGM, currentGameSessionId, roomId, isRestoringState]);

  // リアルタイム同期
  useEffect(() => {
    if (!roomId) return;

    const channelName = `synchro-game-events-${roomId}`;
    const channel = supabase
      .channel(channelName)
      .on("broadcast", { event: "synchro_gm_selected" }, (payload) => {
        if (payload.payload) {
          setGameState((prev) => ({
            ...prev,
            phase: "gm_selected",
            gmId: payload.payload.gmId,
            gmName: payload.payload.gmName,
          }));
          if (
            currentParticipant &&
            payload.payload.gmId !== currentParticipant.id
          ) {
            setIsGM(false);
          }
        }
      })
      .on("broadcast", { event: "synchro_question_submitted" }, (payload) => {
        if (payload.payload) {
          setGameState((prev) => ({
            ...prev,
            phase: "answering",
            question: payload.payload.question,
            questionId: payload.payload.questionId,
            gmId: payload.payload.gmId,
            gmName: payload.payload.gmName,
            sessionId: payload.payload.sessionId,
            responses: {},
          }));
          setCurrentGameSessionId(payload.payload.sessionId);
          setHasAnswered(false);
          setCurrentAnswer("");
        }
      })
      .on("broadcast", { event: "synchro_answer_submitted" }, (payload) => {
        if (payload.payload) {
          setGameState((prev) => ({
            ...prev,
            responses: {
              ...prev.responses,
              [payload.payload.participantId]: payload.payload.answer,
            },
          }));
        }
      })
      .on("broadcast", { event: "synchro_show_results" }, () => {
        setGameState((prev) => ({ ...prev, phase: "results" }));
      })
      .on("broadcast", { event: "synchro_new_round" }, () => {
        setGameState({
          phase: "waiting_for_question",
          question: "",
          questionId: "",
          responses: {},
          gmId: "",
          gmName: "",
          sessionId: currentGameSessionId,
        });
        setCurrentQuestion("");
        setCurrentAnswer("");
        setHasAnswered(false);
        setIsGM(false);
      })
      .on("broadcast", { event: "game_end" }, async () => {
        if (currentGameSessionId) {
          try {
            await gameService.endGameSession(currentGameSessionId);
          } catch (error) {}
        }
        localStorage.removeItem(`synchro_state_${roomId}`);
        // ゲーム終了をロビーに通知
        const lobbyChannel = supabase.channel(`game-start-${roomId}`);
        await lobbyChannel.send({
          type: "broadcast",
          event: "game_end",
          payload: {},
        });
        onClose();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [roomId, currentGameSessionId, onClose, currentParticipant]);

  const handleBecomeGM = async () => {
    if (!currentParticipant) return;

    try {
      const channelName = `synchro-game-events-${roomId}`;
      const channel = supabase.channel(channelName, {
        config: {
          broadcast: { self: true },
        },
      });

      await new Promise((resolve) => setTimeout(resolve, 100));

      const result = await channel.send({
        type: "broadcast",
        event: "synchro_gm_selected",
        payload: {
          gmId: currentParticipant.id,
          gmName: currentParticipant.nickname,
        },
      });

      // 成功したらローカル状態を更新
      setIsGM(true);

      // ローカル状態も更新
      setGameState((prev) => ({
        ...prev,
        phase: "gm_selected",
        gmId: currentParticipant.id,
        gmName: currentParticipant.nickname,
      }));
    } catch (error) {
      alert(
        `GMの選択に失敗しました: ${
          error instanceof Error ? error.message : "もう一度お試しください。"
        }`
      );
    }
  };

  const handleSubmitQuestion = async () => {
    if (!currentQuestion.trim() || !currentParticipant) return;

    let sessionId = currentGameSessionId;
    if (!sessionId) {
      try {
        const session = await gameService.createGameSession(roomId, "synchro");
        sessionId = session.id;
        setCurrentGameSessionId(sessionId);
      } catch (error) {
        alert("ゲームセッションの作成に失敗しました。");
        return;
      }
    }

    try {
      const questionData = await gameService.createSynchroQuestion(
        sessionId,
        currentQuestion.trim(),
        currentParticipant.id
      );

      // まずローカル状態を更新（即座に画面遷移）
      setGameState((prev) => ({
        ...prev,
        phase: "answering",
        question: currentQuestion.trim(),
        questionId: questionData.id,
        gmId: currentParticipant.id,
        gmName: currentParticipant.nickname,
        sessionId: sessionId,
        responses: {},
      }));
      setHasAnswered(false);
      setCurrentAnswer("");

      const channelName = `synchro-game-events-${roomId}`;
      const channel = supabase.channel(channelName, {
        config: {
          broadcast: { self: true, ack: true },
          presence: { key: roomId }
        }
      });

      // チャンネルが準備できるまで待機
      await new Promise((resolve) => {
        const subscription = channel.subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            resolve(void 0);
          }
        });
        setTimeout(() => resolve(void 0), 2000);
      });

      const result = await channel.send({
        type: "broadcast",
        event: "synchro_question_submitted",
        payload: {
          question: currentQuestion.trim(),
          questionId: questionData.id,
          gmId: currentParticipant.id,
          gmName: currentParticipant.nickname,
          sessionId: sessionId,
        },
      });

      // ブロードキャストが失敗した場合の再試行
      if (result !== 'ok') {
        setTimeout(async () => {
          try {
            await channel.send({
              type: "broadcast",
              event: "synchro_question_submitted",
              payload: {
                question: currentQuestion.trim(),
                questionId: questionData.id,
                gmId: currentParticipant.id,
                gmName: currentParticipant.nickname,
                sessionId: sessionId,
              },
            });
          } catch (retryError) {
            console.warn('Broadcast retry failed:', retryError);
          }
        }, 1000);
      }

      setTimeout(() => {
        supabase.removeChannel(channel);
      }, 5000);

    } catch (error) {
      alert(
        `お題の送信に失敗しました: ${
          error instanceof Error ? error.message : "もう一度お試しください。"
        }`
      );
    }
  };

  const handleSubmitAnswer = async () => {
    if (
      !currentParticipant ||
      hasAnswered ||
      !currentAnswer.trim() ||
      !gameState.questionId
    )
      return;

    setHasAnswered(true);

    try {
      await gameService.submitSynchroResponse(
        gameState.questionId,
        currentParticipant.id,
        currentAnswer.trim()
      );

      const channelName = `synchro-game-events-${roomId}`;
      const channel = supabase.channel(channelName);

      const result = await channel.send({
        type: "broadcast",
        event: "synchro_answer_submitted",
        payload: {
          participantId: currentParticipant.id,
          answer: currentAnswer.trim(),
        },
      });

      setGameState((prev) => ({
        ...prev,
        responses: {
          ...prev.responses,
          [currentParticipant.id]: currentAnswer.trim(),
        },
      }));
    } catch (error) {
      setHasAnswered(false);
      alert(
        `回答の送信に失敗しました: ${
          error instanceof Error ? error.message : "もう一度お試しください。"
        }`
      );
    }
  };

  const handleShowResults = async () => {
    try {
      const channelName = `synchro-game-events-${roomId}`;
      const channel = supabase.channel(channelName);

      const result = await channel.send({
        type: "broadcast",
        event: "synchro_show_results",
        payload: {},
      });

      setGameState((prev) => ({ ...prev, phase: "results" }));
    } catch (error) {}
  };

  const handleNewRound = async () => {
    try {
      const channelName = `synchro-game-events-${roomId}`;
      const channel = supabase.channel(channelName);

      const result = await channel.send({
        type: "broadcast",
        event: "synchro_new_round",
        payload: {},
      });

      setGameState({
        phase: "waiting_for_question",
        question: "",
        questionId: "",
        responses: {},
        gmId: "",
        gmName: "",
        sessionId: currentGameSessionId,
      });
      setCurrentQuestion("");
      setCurrentAnswer("");
      setHasAnswered(false);
      setIsGM(false);
    } catch (error) {}
  };

  const totalResponses = Object.keys(gameState.responses).length;
  const allAnswered = totalResponses === gameParticipants.length;

  // 結果分析
  const responseValues = Object.values(gameState.responses);
  const uniqueAnswers = new Set(responseValues);
  const isSuccess = uniqueAnswers.size === 1 && responseValues.length > 0;
  const mostCommonAnswer = responseValues.length > 0 ? responseValues[0] : "";

  if (loading || isRestoringState) {
    return (
      <div className="fixed inset-0 bg-white flex items-center justify-center p-4 z-50">
        <div className="bg-white border-4 border-black p-8 text-center shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
          <div className="flex justify-center items-center gap-2 mb-6">
            <div className="w-4 h-4 bg-red-500 border border-black animate-pulse"></div>
            <div className="w-4 h-4 bg-yellow-400 border border-black animate-pulse"></div>
            <div className="w-4 h-4 bg-blue-500 border border-black animate-pulse"></div>
          </div>
          <p className="text-black font-bold text-lg">
            {loading ? "ゲームを準備中..." : "ゲーム状態を復元中..."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-white flex items-center justify-center p-2 sm:p-4 z-50">
      <div className="bg-white border-3 sm:border-4 border-black max-w-4xl w-full max-h-[95vh] sm:max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="bg-purple-500 text-white p-4 sm:p-6 border-b-3 sm:border-b-4 border-black">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-6 h-6 sm:w-8 sm:h-8 bg-white border-2 border-black flex items-center justify-center shrink-0">
                <Zap className="h-3 w-3 sm:h-4 sm:w-4 text-black" />
              </div>
              <h2 className="text-lg sm:text-2xl font-bold">シンクロゲーム</h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="bg-white text-black p-1.5 sm:p-2 border-2 border-black hover:bg-gray-100 transition-colors"
            >
              <X className="h-4 w-4 sm:h-5 sm:w-5" />
            </button>
          </div>
        </div>

        {/* Game Content */}
        <div className="p-4 sm:p-6">
          {/* Participants Status */}
          <div className="bg-gray-50 border-2 border-black p-3 sm:p-4 mb-4 sm:mb-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 sm:h-5 sm:w-5" />
                <span className="font-bold text-sm sm:text-base">
                  参加者: {gameParticipants.length}人
                </span>
              </div>
              {gameState.phase === "answering" && (
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  <span className="font-bold text-sm sm:text-base">
                    回答済み: {totalResponses}/{gameParticipants.length}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Phase: Waiting for Question */}
          {gameState.phase === "waiting_for_question" && (
            <div className="space-y-4 sm:space-y-6">
              <div className="text-center">
                <h3 className="text-xl sm:text-2xl font-bold text-black mb-4">
                  GMを決めましょう
                </h3>
                <p className="text-gray-700 mb-4 sm:mb-6 text-sm sm:text-base px-4">
                  誰かがGM（ゲームマスター）になって、シンクロのお題を考えてください。
                </p>
              </div>

              <div className="bg-purple-100 border-2 border-black p-4 sm:p-6 mb-4 sm:mb-6">
                <h4 className="text-base sm:text-lg font-bold text-black mb-3 flex items-center gap-2">
                  <Target className="h-5 w-5" />
                  ゲームの目標
                </h4>
                <p className="text-black mb-3 sm:mb-4 text-sm sm:text-base">
                  <strong>全員で答えを完全に一致させよう！</strong>
                </p>
                <div className="space-y-1 sm:space-y-2 text-xs sm:text-sm text-gray-700">
                  <p>
                    • 参加者全員の答えが完全に一致すればクリア（全員の勝利）
                  </p>
                  <p>• 一人でも違う答えを出すとチャレンジ失敗（全員の敗北）</p>
                  <p>• みんなが同じことを考えているかを読み取ろう</p>
                </div>
              </div>

              <div className="text-center">
                <button
                  type="button"
                  onClick={handleBecomeGM}
                  disabled={!currentParticipant}
                  className="bg-purple-500 text-white py-3 sm:py-4 px-6 sm:px-8 border-2 sm:border-3 border-black font-bold text-base sm:text-lg hover:bg-purple-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] sm:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] sm:hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[1px] hover:translate-y-[1px] sm:hover:translate-x-[2px] sm:hover:translate-y-[2px]"
                >
                  GMになる
                </button>
              </div>
            </div>
          )}

          {/* Phase: GM Selected */}
          {gameState.phase === "gm_selected" && (
            <div className="space-y-4 sm:space-y-6">
              {isGM && currentParticipant?.id === gameState.gmId ? (
                <div className="bg-purple-100 border-2 border-black p-4 sm:p-6">
                  <h4 className="text-lg sm:text-xl font-bold text-black mb-4">
                    シンクロのお題を入力してください
                  </h4>
                  <div className="bg-white border-2 border-black p-4 mb-4">
                    <p className="text-sm text-gray-600 mb-2">お題の例：</p>
                    <ul className="text-xs sm:text-sm text-gray-700 space-y-1">
                      <li>• 「赤い果物」といえば？</li>
                      <li>• 「夏の食べ物」といえば？</li>
                      <li>• 「朝一番にすること」といえば？</li>
                    </ul>
                  </div>
                  <textarea
                    value={currentQuestion}
                    onChange={(e) => setCurrentQuestion(e.target.value)}
                    placeholder="例: 「赤い果物」といえば？"
                    className="w-full p-3 sm:p-4 border-2 border-black text-base sm:text-lg resize-none h-20 sm:h-24 focus:outline-none focus:ring-0"
                    maxLength={200}
                  />
                  <div className="flex items-center justify-between mt-4">
                    <span className="text-sm text-gray-600">
                      {currentQuestion.length}/200文字
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setCurrentQuestion(pickRandom(synchroTopics))
                      }
                      className="bg-white text-black py-2 px-3 border-2 border-black font-bold hover:bg-gray-100 transition-colors text-sm sm:text-base mr-2"
                    >
                      <Shuffle className="h-4 w-4 inline mr-1" /> ランダムお題
                    </button>
                    <button
                      type="button"
                      onClick={handleSubmitQuestion}
                      disabled={!currentQuestion.trim()}
                      className="bg-purple-500 text-white py-2 px-4 sm:px-6 border-2 border-black font-bold hover:bg-purple-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm sm:text-base"
                    >
                      お題を送信
                    </button>
                  </div>
                </div>
              ) : (
                <div className="text-center bg-blue-100 border-2 border-black p-6">
                  <div className="flex items-center justify-center gap-2 mb-3 sm:mb-4">
                    <div className="w-6 h-6 bg-purple-500 border-2 border-black"></div>
                    <span className="font-bold text-black text-sm sm:text-base">
                      GM: {gameState.gmName}
                    </span>
                  </div>
                  <h3 className="text-xl sm:text-2xl font-bold text-black mb-4">
                    お題を待っています...
                  </h3>
                  <p className="text-gray-700 text-sm sm:text-base px-4">
                    {gameState.gmName}さんがシンクロのお題を考えています。
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Phase: Answering */}
          {gameState.phase === "answering" && (
            <div className="space-y-4 sm:space-y-6">
              <div className="bg-purple-100 border-2 border-black p-6">
                <div className="flex items-center gap-2 mb-3 sm:mb-4">
                  <div className="w-6 h-6 bg-purple-500 border-2 border-black"></div>
                  <span className="font-bold text-black text-sm sm:text-base">
                    GM: {gameState.gmName}
                  </span>
                </div>
                <h3 className="text-lg sm:text-2xl font-bold text-black mb-4">
                  シンクロお題
                </h3>
                <p className="text-base sm:text-xl text-black bg-white border-2 border-black p-3 sm:p-4">
                  {gameState.question}
                </p>
              </div>

              {!hasAnswered ? (
                <div className="space-y-4 sm:space-y-6">
                  <div className="text-center">
                    <h4 className="text-lg sm:text-xl font-bold text-black mb-4 px-4">
                      あなたの答えを入力してください
                    </h4>
                    <p className="text-gray-700 mb-4 sm:mb-6 text-sm sm:text-base px-4">
                      みんなが同じ答えを思い浮かべるように、一番一般的な答えを考えましょう！
                    </p>
                  </div>

                  <div className="px-4">
                    <input
                      type="text"
                      value={currentAnswer}
                      onChange={(e) => setCurrentAnswer(e.target.value)}
                      placeholder="答えを入力..."
                      className="w-full p-3 sm:p-4 border-2 border-black text-base sm:text-lg focus:outline-none focus:ring-0 mb-4"
                      maxLength={50}
                      onKeyPress={(e) => {
                        if (e.key === "Enter" && currentAnswer.trim()) {
                          handleSubmitAnswer();
                        }
                      }}
                    />
                    <div className="flex items-center justify-between mb-4">
                      <span className="text-sm text-gray-600">
                        {currentAnswer.length}/50文字
                      </span>
                    </div>
                  </div>

                  <div className="text-center">
                    <button
                      type="button"
                      onClick={handleSubmitAnswer}
                      disabled={!currentAnswer.trim()}
                      className="bg-purple-500 text-white py-3 sm:py-4 px-6 sm:px-8 border-2 sm:border-3 border-black font-bold text-base sm:text-lg hover:bg-purple-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] sm:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] sm:hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[1px] hover:translate-y-[1px] sm:hover:translate-x-[2px] sm:hover:translate-y-[2px]"
                    >
                      {currentAnswer.trim()
                        ? "答えを送信"
                        : "答えを入力してください"}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="text-center bg-gray-100 border-2 border-black p-6">
                  <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-4" />
                  <h4 className="text-lg sm:text-xl font-bold text-black mb-2">
                    回答完了！
                  </h4>
                  <p className="text-gray-700 text-sm sm:text-base">
                    他の参加者の回答を待っています...
                  </p>
                  <p className="text-sm text-gray-600 mt-2">
                    あなたの答え: {currentAnswer}
                  </p>
                </div>
              )}

              {allAnswered && gameState.gmId === currentParticipant?.id && (
                <div className="text-center">
                  <button
                    type="button"
                    onClick={handleShowResults}
                    className="bg-blue-500 text-white py-3 sm:py-4 px-6 sm:px-8 border-2 sm:border-3 border-black font-bold text-base sm:text-lg hover:bg-blue-600 transition-colors"
                  >
                    結果を表示
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Phase: Results */}
          {gameState.phase === "results" && (
            <div className="space-y-4 sm:space-y-6">
              <div className="bg-purple-100 border-2 border-black p-6">
                <h3 className="text-lg sm:text-xl font-bold text-black mb-4">
                  お題
                </h3>
                <p className="text-base sm:text-lg text-black bg-white border-2 border-black p-3 sm:p-4">
                  {gameState.question}
                </p>
              </div>

              <div className="text-center">
                <h3 className="text-2xl sm:text-3xl font-bold text-black mb-4 sm:mb-6">
                  結果発表
                </h3>
                <div
                  className={`border-3 sm:border-4 border-black p-6 sm:p-8 ${
                    isSuccess ? "bg-green-100" : "bg-red-100"
                  }`}
                >
                  <div className="text-4xl sm:text-6xl font-bold text-black mb-4">
                    {isSuccess ? "⚡" : "💥"}
                  </div>
                  <p className="text-xl sm:text-3xl font-bold text-black mb-4">
                    {isSuccess ? "シンクロ成功！" : "シンクロ失敗..."}
                  </p>
                  <p className="text-base sm:text-lg text-gray-700">
                    {isSuccess
                      ? "全員の答えが一致しました！"
                      : "答えがバラバラでした"}
                  </p>
                </div>
              </div>

              {/* 詳細結果 */}
              <div className="bg-gray-50 border-2 border-black p-6">
                <h4 className="text-lg sm:text-xl font-bold text-black mb-4">
                  全員の答え
                </h4>
                <div className="grid gap-2">
                  {gameParticipants.map((participant) => {
                    const answer = gameState.responses[participant.id];
                    const isUnique =
                      isSuccess ||
                      Object.values(gameState.responses).filter(
                        (a) => a === answer
                      ).length === 1;
                    return (
                      <div
                        key={participant.id}
                        className={`flex items-center justify-between p-2 sm:p-3 border-2 border-black ${
                          isSuccess
                            ? "bg-green-100"
                            : isUnique
                            ? "bg-white"
                            : "bg-yellow-100"
                        }`}
                      >
                        <span className="font-bold text-black text-sm sm:text-base">
                          {participant.nickname}
                        </span>
                        <span className="font-bold text-sm sm:text-base text-black">
                          {answer || "未回答"}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="text-center space-y-4 px-4">
                <button
                  type="button"
                  onClick={handleNewRound}
                  className="bg-green-500 text-white py-3 sm:py-4 px-6 sm:px-8 border-2 sm:border-3 border-black font-bold text-base sm:text-lg hover:bg-green-600 transition-colors flex items-center gap-2 sm:gap-3 mx-auto"
                >
                  <RotateCcw className="h-4 w-4 sm:h-5 sm:w-5" />
                  新しいお題で挑戦
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
