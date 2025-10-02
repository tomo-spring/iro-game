import React, { useState, useEffect } from "react";
import {
  Trophy,
  X,
  Users,
  Clock,
  CheckCircle,
  RotateCcw,
  Target,
  Shuffle,
} from "lucide-react";
import { supabase } from "../lib/supabase";
import { gameService, type RankingQuestion } from "../services/gameService";
import type { Participant } from "../lib/supabase";
import { roomService } from "../services/roomService";
import { rankingTopics, pickRandom } from "../services/topics";

interface RankingGameProps {
  roomId: string;
  sessionId: string | null;
  participants: Participant[];
  onClose: () => void;
}

interface GameState {
  phase:
    | "waiting_for_question"
    | "questioner_selected"
    | "answering"
    | "results";
  question: string;
  questionId: string;
  responses: { [participantId: string]: number };
  questionerId: string;
  questionerName: string;
  sessionId: string;
}

export function RankingGame({ roomId, sessionId, onClose }: RankingGameProps) {
  const [gameState, setGameState] = useState<GameState>({
    phase: "waiting_for_question",
    question: "",
    questionId: "",
    responses: {},
    questionerId: "",
    questionerName: "",
    sessionId: sessionId || "",
  });
  const [currentQuestion, setCurrentQuestion] = useState("");
  const [selectedRank, setSelectedRank] = useState<number | null>(null);
  const [hasAnswered, setHasAnswered] = useState(false);
  const [isQuestioner, setIsQuestioner] = useState(false);
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
        if (activeSession && activeSession.game_type === 'ranking') {
          setCurrentGameSessionId(activeSession.id);
          
          // アクティブな質問があるかチェック
          const { rankingQuestions } = await gameService.getActiveQuestions(activeSession.id);
          if (rankingQuestions.length > 0) {
            const activeQuestion = rankingQuestions[0];
            
            // 質問者情報を取得
            const questioner = gameParticipants.find(p => p.id === activeQuestion.questioner_id);
            
            // 自分の回答状況をチェック
            if (currentParticipant) {
              const responses = await gameService.getRankingResponses(activeQuestion.id);
              const myResponse = responses.find(r => r.participant_id === currentParticipant.id);
              
              setGameState({
                phase: "answering",
                question: activeQuestion.question,
                questionId: activeQuestion.id,
                responses: responses.reduce((acc, r) => ({ ...acc, [r.participant_id]: r.rank_choice }), {}),
                questionerId: activeQuestion.questioner_id,
                questionerName: questioner?.nickname || "不明",
                sessionId: activeSession.id,
              });
              
              setHasAnswered(!!myResponse);
              setSelectedRank(myResponse?.rank_choice || null);
              setIsQuestioner(activeQuestion.questioner_id === currentParticipant.id);
            }
          }
        }
        
        const storedState = localStorage.getItem(`ranking_state_${roomId}`);
        if (storedState) {
          const state = JSON.parse(storedState);
          const now = Date.now();
          const stateTime = new Date(state.timestamp).getTime();
          
          // 状態が30分以内で、かつDBの状態と矛盾しない場合のみ復元
          if (now - stateTime < 30 * 60 * 1000 && !activeSession) {
            setGameState(state.gameState);
            setCurrentQuestion(state.currentQuestion || "");
            setSelectedRank(state.selectedRank || null);
            setHasAnswered(state.hasAnswered || false);
            setIsQuestioner(state.isQuestioner || false);
            setCurrentGameSessionId(state.sessionId || "");
          } else {
            localStorage.removeItem(`ranking_state_${roomId}`);
          }
        }
      } catch (error) {
        console.error('Failed to restore ranking game state:', error);
        localStorage.removeItem(`ranking_state_${roomId}`);
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
      selectedRank,
      hasAnswered,
      isQuestioner,
      sessionId: currentGameSessionId,
      timestamp: new Date().toISOString()
    };
    
    localStorage.setItem(`ranking_state_${roomId}`, JSON.stringify(stateToSave));
  }, [gameState, currentQuestion, selectedRank, hasAnswered, isQuestioner, currentGameSessionId, roomId, isRestoringState]);

  // リアルタイム同期
  useEffect(() => {
    if (!roomId) return;

    const channelName = `ranking-game-events-${roomId}`;
    const channel = supabase
      .channel(channelName)
      .on("broadcast", { event: "ranking_questioner_selected" }, (payload) => {
        if (payload.payload) {
          setGameState((prev) => ({
            ...prev,
            phase: "questioner_selected",
            questionerId: payload.payload.questionerId,
            questionerName: payload.payload.questionerName,
          }));
          if (
            currentParticipant &&
            payload.payload.questionerId !== currentParticipant.id
          ) {
            setIsQuestioner(false);
          }
        }
      })
      .on("broadcast", { event: "ranking_question_submitted" }, (payload) => {
        if (payload.payload) {
          setGameState((prev) => ({
            ...prev,
            phase: "answering",
            question: payload.payload.question,
            questionId: payload.payload.questionId,
            questionerId: payload.payload.questionerId,
            questionerName: payload.payload.questionerName,
            sessionId: payload.payload.sessionId,
            responses: {},
          }));
          setCurrentGameSessionId(payload.payload.sessionId);
          setHasAnswered(false);
          setSelectedRank(null);
        }
      })
      .on("broadcast", { event: "ranking_answer_submitted" }, (payload) => {
        if (payload.payload) {
          setGameState((prev) => ({
            ...prev,
            responses: {
              ...prev.responses,
              [payload.payload.participantId]: payload.payload.rankChoice,
            },
          }));
        }
      })
      .on("broadcast", { event: "ranking_show_results" }, () => {
        setGameState((prev) => ({ ...prev, phase: "results" }));
      })
      .on("broadcast", { event: "ranking_new_round" }, () => {
        setGameState({
          phase: "waiting_for_question",
          question: "",
          questionId: "",
          responses: {},
          questionerId: "",
          questionerName: "",
          sessionId: currentGameSessionId,
        });
        setCurrentQuestion("");
        setHasAnswered(false);
        setSelectedRank(null);
        setIsQuestioner(false);
      })
      .on("broadcast", { event: "game_end" }, async () => {
        if (currentGameSessionId) {
          try {
            await gameService.endGameSession(currentGameSessionId);
          } catch (error) {}
        }
        localStorage.removeItem(`ranking_state_${roomId}`);
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

  const handleBecomeQuestioner = async () => {
    if (!currentParticipant) return;

    try {
      const channelName = `ranking-game-events-${roomId}`;
      const channel = supabase.channel(channelName, {
        config: {
          broadcast: { self: true },
        },
      });

      await new Promise((resolve) => setTimeout(resolve, 100));

      const result = await channel.send({
        type: "broadcast",
        event: "ranking_questioner_selected",
        payload: {
          questionerId: currentParticipant.id,
          questionerName: currentParticipant.nickname,
        },
      });

      // 成功したらローカル状態を更新
      setIsQuestioner(true);

      // ローカル状態も更新
      setGameState((prev) => ({
        ...prev,
        phase: "questioner_selected",
        questionerId: currentParticipant.id,
        questionerName: currentParticipant.nickname,
      }));
    } catch (error) {
      alert(
        `質問者の選択に失敗しました: ${
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
        const session = await gameService.createGameSession(roomId, "ranking");
        sessionId = session.id;
        setCurrentGameSessionId(sessionId);
      } catch (error) {
        alert("ゲームセッションの作成に失敗しました。");
        return;
      }
    }

    try {
      const questionData = await gameService.createRankingQuestion(
        sessionId,
        currentQuestion.trim(),
        currentParticipant.id
      );

      const channelName = `ranking-game-events-${roomId}`;
      const channel = supabase.channel(channelName);

      await new Promise((resolve) => setTimeout(resolve, 100));

      const result = await channel.send({
        type: "broadcast",
        event: "ranking_question_submitted",
        payload: {
          question: currentQuestion.trim(),
          questionId: questionData.id,
          questionerId: currentParticipant.id,
          questionerName: currentParticipant.nickname,
          sessionId: sessionId,
        },
      });

      setGameState((prev) => ({
        ...prev,
        phase: "answering",
        question: currentQuestion.trim(),
        questionId: questionData.id,
        questionerId: currentParticipant.id,
        questionerName: currentParticipant.nickname,
        sessionId: sessionId,
        responses: {},
      }));
      setHasAnswered(false);
      setSelectedRank(null);
    } catch (error) {
      alert(
        `質問の送信に失敗しました: ${
          error instanceof Error ? error.message : "もう一度お試しください。"
        }`
      );
    }
  };

  const handleSubmitRank = async () => {
    if (
      !currentParticipant ||
      hasAnswered ||
      selectedRank === null ||
      !gameState.questionId
    )
      return;

    setHasAnswered(true);

    try {
      await gameService.submitRankingResponse(
        gameState.questionId,
        currentParticipant.id,
        selectedRank
      );

      const channelName = `ranking-game-events-${roomId}`;
      const channel = supabase.channel(channelName);

      const result = await channel.send({
        type: "broadcast",
        event: "ranking_answer_submitted",
        payload: {
          participantId: currentParticipant.id,
          rankChoice: selectedRank,
        },
      });

      setGameState((prev) => ({
        ...prev,
        responses: {
          ...prev.responses,
          [currentParticipant.id]: selectedRank,
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
      const channelName = `ranking-game-events-${roomId}`;
      const channel = supabase.channel(channelName);

      const result = await channel.send({
        type: "broadcast",
        event: "ranking_show_results",
        payload: {},
      });

      setGameState((prev) => ({ ...prev, phase: "results" }));
    } catch (error) {}
  };

  const handleNewRound = async () => {
    try {
      const channelName = `ranking-game-events-${roomId}`;
      const channel = supabase.channel(channelName);

      const result = await channel.send({
        type: "broadcast",
        event: "ranking_new_round",
        payload: {},
      });

      setGameState({
        phase: "waiting_for_question",
        question: "",
        questionId: "",
        responses: {},
        questionerId: "",
        questionerName: "",
        sessionId: currentGameSessionId,
      });
      setCurrentQuestion("");
      setHasAnswered(false);
      setSelectedRank(null);
      setIsQuestioner(false);
    } catch (error) {}
  };

  const totalResponses = Object.keys(gameState.responses).length;
  const allAnswered = totalResponses === gameParticipants.length;

  // 結果分析
  const responseValues = Object.values(gameState.responses);
  const uniqueRanks = new Set(responseValues);
  const isSuccess =
    uniqueRanks.size === responseValues.length && responseValues.length > 0;
  const duplicates = responseValues.filter(
    (rank, index) => responseValues.indexOf(rank) !== index
  );
  const duplicateRanks = [...new Set(duplicates)];

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
        <div className="bg-yellow-400 text-black p-4 sm:p-6 border-b-3 sm:border-b-4 border-black">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-6 h-6 sm:w-8 sm:h-8 bg-white border-2 border-black flex items-center justify-center shrink-0">
                <Trophy className="h-3 w-3 sm:h-4 sm:w-4 text-black" />
              </div>
              <h2 className="text-lg sm:text-2xl font-bold">
                ランキングゲーム
              </h2>
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
                  質問者を決めましょう
                </h3>
                <p className="text-gray-700 mb-4 sm:mb-6 text-sm sm:text-base px-4">
                  誰かが質問者になって、ランキングのお題を考えてください。
                </p>
              </div>

              <div className="bg-yellow-100 border-2 border-black p-4 sm:p-6 mb-4 sm:mb-6">
                <h4 className="text-base sm:text-lg font-bold text-black mb-3 flex items-center gap-2">
                  <Target className="h-5 w-5" />
                  ゲームの目標
                </h4>
                <p className="text-black mb-3 sm:mb-4 text-sm sm:text-base">
                  <strong>全員で協力して、順位の重複を避けよう！</strong>
                </p>
                <div className="space-y-1 sm:space-y-2 text-xs sm:text-sm text-gray-700">
                  <p>• 参加者全員が異なる順位を選べばクリア（全員の勝利）</p>
                  <p>• 一人でも順位が被ると失敗（全員の敗北）</p>
                  <p>• 空気を読んで、他の人が選びそうな順位を避けよう</p>
                </div>
              </div>

              <div className="text-center">
                <button
                  type="button"
                  onClick={handleBecomeQuestioner}
                  disabled={!currentParticipant}
                  className="bg-yellow-400 text-black py-3 sm:py-4 px-6 sm:px-8 border-2 sm:border-3 border-black font-bold text-base sm:text-lg hover:bg-yellow-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] sm:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] sm:hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[1px] hover:translate-y-[1px] sm:hover:translate-x-[2px] sm:hover:translate-y-[2px]"
                >
                  質問者になる
                </button>
              </div>
            </div>
          )}

          {/* Phase: Questioner Selected */}
          {gameState.phase === "questioner_selected" && (
            <div className="space-y-4 sm:space-y-6">
              {isQuestioner &&
              currentParticipant?.id === gameState.questionerId ? (
                <div className="bg-yellow-100 border-2 border-black p-4 sm:p-6">
                  <h4 className="text-lg sm:text-xl font-bold text-black mb-4">
                    ランキングのお題を入力してください
                  </h4>
                  <div className="bg-white border-2 border-black p-4 mb-4">
                    <p className="text-sm text-gray-600 mb-2">お題の例：</p>
                    <ul className="text-xs sm:text-sm text-gray-700 space-y-1">
                      <li>• この中で最もインドアな人ランキング</li>
                      <li>• この中で最も朝が弱そうな人ランキング</li>
                      <li>
                        • この中で最もスマホを見る時間が長そうな人ランキング
                      </li>
                    </ul>
                  </div>
                  <textarea
                    value={currentQuestion}
                    onChange={(e) => setCurrentQuestion(e.target.value)}
                    placeholder="例: この中で最もインドアな人ランキング"
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
                        setCurrentQuestion(pickRandom(rankingTopics))
                      }
                      className="bg-white text-black py-2 px-3 border-2 border-black font-bold hover:bg-gray-100 transition-colors text-sm sm:text-base mr-2"
                    >
                      <Shuffle className="h-4 w-4 inline mr-1" /> ランダムお題
                    </button>
                    <button
                      type="button"
                      onClick={handleSubmitQuestion}
                      disabled={!currentQuestion.trim()}
                      className="bg-red-500 text-white py-2 px-4 sm:px-6 border-2 border-black font-bold hover:bg-red-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm sm:text-base"
                    >
                      お題を送信
                    </button>
                  </div>
                </div>
              ) : (
                <div className="text-center bg-blue-100 border-2 border-black p-6">
                  <div className="flex items-center justify-center gap-2 mb-3 sm:mb-4">
                    <div className="w-6 h-6 bg-blue-500 border-2 border-black"></div>
                    <span className="font-bold text-black text-sm sm:text-base">
                      質問者: {gameState.questionerName}
                    </span>
                  </div>
                  <h3 className="text-xl sm:text-2xl font-bold text-black mb-4">
                    お題を待っています...
                  </h3>
                  <p className="text-gray-700 text-sm sm:text-base px-4">
                    {gameState.questionerName}
                    さんがランキングのお題を考えています。
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Phase: Answering */}
          {gameState.phase === "answering" && (
            <div className="space-y-4 sm:space-y-6">
              <div className="bg-blue-100 border-2 border-black p-6">
                <div className="flex items-center gap-2 mb-3 sm:mb-4">
                  <div className="w-6 h-6 bg-blue-500 border-2 border-black"></div>
                  <span className="font-bold text-black text-sm sm:text-base">
                    質問者: {gameState.questionerName}
                  </span>
                </div>
                <h3 className="text-lg sm:text-2xl font-bold text-black mb-4">
                  ランキングお題
                </h3>
                <p className="text-base sm:text-xl text-black bg-white border-2 border-black p-3 sm:p-4">
                  {gameState.question}
                </p>
              </div>

              {!hasAnswered ? (
                <div className="space-y-4 sm:space-y-6">
                  <div className="text-center">
                    <h4 className="text-lg sm:text-xl font-bold text-black mb-4 px-4">
                      あなたの順位を選んでください
                    </h4>
                    <p className="text-gray-700 mb-4 sm:mb-6 text-sm sm:text-base px-4">
                      他の人が選びそうな順位を避けて、被らない順位を選びましょう！
                    </p>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-3 px-4">
                    {Array.from(
                      { length: gameParticipants.length },
                      (_, i) => i + 1
                    ).map((rank) => (
                      <button
                        type="button"
                        key={rank}
                        onClick={() => setSelectedRank(rank)}
                        className={`py-3 sm:py-4 px-4 sm:px-6 border-2 sm:border-3 border-black font-bold text-base sm:text-lg transition-colors ${
                          selectedRank === rank
                            ? "bg-yellow-400 text-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] sm:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]"
                            : "bg-white text-black hover:bg-gray-100 shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] sm:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]"
                        }`}
                      >
                        {rank}位
                      </button>
                    ))}
                  </div>

                  <div className="text-center">
                    <button
                      type="button"
                      onClick={handleSubmitRank}
                      disabled={selectedRank === null}
                      className="bg-green-500 text-white py-3 sm:py-4 px-6 sm:px-8 border-2 sm:border-3 border-black font-bold text-base sm:text-lg hover:bg-green-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] sm:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] sm:hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[1px] hover:translate-y-[1px] sm:hover:translate-x-[2px] sm:hover:translate-y-[2px]"
                    >
                      {selectedRank
                        ? `${selectedRank}位で決定`
                        : "順位を選んでください"}
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
                    選択した順位: {selectedRank}位
                  </p>
                </div>
              )}

              {allAnswered &&
                gameState.questionerId === currentParticipant?.id && (
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
              <div className="bg-blue-100 border-2 border-black p-6">
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
                    {isSuccess ? "🎉" : "💥"}
                  </div>
                  <p className="text-xl sm:text-3xl font-bold text-black mb-4">
                    {isSuccess ? "ミッション成功！" : "ミッション失敗..."}
                  </p>
                  <p className="text-base sm:text-lg text-gray-700">
                    {isSuccess
                      ? "全員が異なる順位を選びました！"
                      : `${duplicateRanks.join("、")}位が重複しました`}
                  </p>
                </div>
              </div>

              {/* 詳細結果 */}
              <div className="bg-gray-50 border-2 border-black p-6">
                <h4 className="text-lg sm:text-xl font-bold text-black mb-4">
                  選択された順位
                </h4>
                <div className="grid gap-2">
                  {gameParticipants.map((participant) => {
                    const rank = gameState.responses[participant.id];
                    const isDuplicate = duplicateRanks.includes(rank);
                    return (
                      <div
                        key={participant.id}
                        className={`flex items-center justify-between p-2 sm:p-3 border-2 border-black ${
                          isDuplicate ? "bg-red-100" : "bg-white"
                        }`}
                      >
                        <span className="font-bold text-black text-sm sm:text-base">
                          {participant.nickname}
                        </span>
                        <span
                          className={`font-bold text-sm sm:text-base ${
                            isDuplicate ? "text-red-600" : "text-black"
                          }`}
                        >
                          {rank}位 {isDuplicate && "⚠️"}
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
