import React, { useState, useEffect } from "react";
import {
  Eye,
  X,
  Users,
  Clock,
  CheckCircle,
  XCircle,
  RotateCcw,
  Shuffle,
} from "lucide-react";
import { supabase } from "../lib/supabase";
import { gameService, type GameQuestion } from "../services/gameService";
import type { Participant } from "../lib/supabase";
import { roomService } from "../services/roomService";
import { anonymousYesNoTopics, pickRandom } from "../services/topics";

interface AnonymousSurveyGameProps {
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
  responses: { [participantId: string]: boolean };
  questionerId: string;
  questionerName: string;
  sessionId: string;
}

export function AnonymousSurveyGame({
  roomId,
  sessionId,
  onClose,
}: AnonymousSurveyGameProps) {
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
  const [hasAnswered, setHasAnswered] = useState(false);
  const [isQuestioner, setIsQuestioner] = useState(false);
  const [currentParticipant, setCurrentParticipant] =
    useState<Participant | null>(null);
  const [currentGameSessionId, setCurrentGameSessionId] = useState<string>(
    sessionId || ""
  );
  const [gameParticipants, setGameParticipants] = useState<Participant[]>([]);
  const [loading, setLoading] = useState(true);

  // ゲーム開始時に参加者をDBから取得
  useEffect(() => {
    const fetchGameParticipants = async () => {
      if (!roomId) return;

      setLoading(true);

      try {
        // DBから最新の参加者リストを取得
        const participants = await gameService.getParticipantsForGame(roomId);
        setGameParticipants(participants);

        // 現在の参加者を特定
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
      if (!roomId || !gameParticipants.length || !currentParticipant) {
        return;
      }

      try {
        console.log("🔄 Anonymous Survey ゲーム状態を復元中...");
        const activeSession = await gameService.getActiveGameSession(roomId);
        if (activeSession && activeSession.game_type === "anonymous_survey") {
          setCurrentGameSessionId(activeSession.id);

          const { gameQuestions } = await gameService.getActiveQuestions(activeSession.id);
          if (gameQuestions.length > 0) {
            const activeQuestion = gameQuestions[0];
            const questioner = gameParticipants.find((p) => p.id === activeQuestion.questioner_id);
            const responses = await gameService.getQuestionResponses(activeQuestion.id);
            const myResponse = responses.find((r) => r.participant_id === currentParticipant.id);

            setGameState({
              phase: "answering",
              question: activeQuestion.question,
              questionId: activeQuestion.id,
              responses: responses.reduce((acc, r) => ({ ...acc, [r.participant_id]: r.response }), {}),
              questionerId: activeQuestion.questioner_id,
              questionerName: questioner?.nickname || "不明",
              sessionId: activeSession.id,
            });

            setHasAnswered(!!myResponse);
            setIsQuestioner(activeQuestion.questioner_id === currentParticipant.id);
            console.log("✅ Anonymous Survey ゲーム状態復元完了");
          }
        }
      } catch (error) {
        console.error("ゲーム状態復元エラー:", error);
      }
    };

    restoreGameState();
  }, [roomId, gameParticipants.length, currentParticipant?.id]);

  // ゲーム状態が変更されたときにローカルストレージに保存
  useEffect(() => {
    if (!roomId) return;

    const stateToSave = {
      gameState,
      currentQuestion,
      hasAnswered,
      isQuestioner,
      sessionId: currentGameSessionId,
      timestamp: new Date().toISOString(),
    };

    localStorage.setItem(
      `anonymous_survey_state_${roomId}`,
      JSON.stringify(stateToSave)
    );
  }, [gameState, currentQuestion, hasAnswered, isQuestioner, currentGameSessionId, roomId]);

  // リアルタイム同期
  useEffect(() => {
    if (!roomId) return;

    const channelName = `game-events-${roomId}`;
    const channel = supabase
      .channel(channelName)
      .on("broadcast", { event: "questioner_selected" }, (payload) => {
        if (payload.payload) {
          setGameState((prev) => ({
            ...prev,
            phase: "questioner_selected",
            questionerId: payload.payload.questionerId,
            questionerName: payload.payload.questionerName,
          }));
          // 質問者以外は待機状態
          if (
            currentParticipant &&
            payload.payload.questionerId !== currentParticipant.id
          ) {
            setIsQuestioner(false);
          }
        }
      })
      .on("broadcast", { event: "question_submitted" }, (payload) => {
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
        }
      })
      .on("broadcast", { event: "answer_submitted" }, (payload) => {
        if (payload.payload) {
          console.log("Received answer broadcast:", payload.payload);
          setGameState((prev) => ({
            ...prev,
            responses: {
              ...prev.responses,
              [payload.payload.participantId]: payload.payload.answer,
            },
          }));
        }
      })
      .on("broadcast", { event: "sync_responses" }, (payload) => {
        if (payload.payload && payload.payload.responses) {
          console.log("Syncing responses:", payload.payload.responses);
          setGameState((prev) => ({
            ...prev,
            responses: payload.payload.responses,
          }));
        }
      })
      .on("broadcast", { event: "show_results" }, () => {
        setGameState((prev) => ({ ...prev, phase: "results" }));
      })
      .on("broadcast", { event: "new_round" }, () => {
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
        setIsQuestioner(false);
      })
      .on("broadcast", { event: "game_end" }, async () => {
        if (currentGameSessionId) {
          try {
            await gameService.endGameSession(currentGameSessionId);
          } catch (error) {}
        }
        // ゲーム終了時に状態をクリア
        localStorage.removeItem(`anonymous_survey_state_${roomId}`);
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
      const channelName = `game-events-${roomId}`;
      const channel = supabase.channel(channelName, {
        config: {
          broadcast: { self: true },
        },
      });

      // 少し待ってからブロードキャスト
      await new Promise((resolve) => setTimeout(resolve, 100));

      const result = await channel.send({
        type: "broadcast",
        event: "questioner_selected",
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
    if (!currentQuestion.trim() || !currentParticipant) {
      return;
    }

    // ゲームセッションを取得または作成
    let sessionId = currentGameSessionId;
    if (!sessionId) {
      try {
        const session = await gameService.createGameSession(roomId);
        sessionId = session.id;
        setCurrentGameSessionId(sessionId);
      } catch (error) {
        alert("ゲームセッションの作成に失敗しました。");
        return;
      }
    }

    try {
      // データベースに質問を保存
      const questionData = await gameService.createQuestion(
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
        questionerId: currentParticipant.id,
        questionerName: currentParticipant.nickname,
        sessionId: sessionId,
        responses: {},
      }));
      setHasAnswered(false);

      const channelName = `game-events-${roomId}`;
      const channel = supabase.channel(channelName, {
        config: {
          broadcast: { self: true, ack: true },
          presence: { key: roomId },
        },
      });

      // チャンネルが準備できるまで待機
      await new Promise((resolve) => {
        const subscription = channel.subscribe((status) => {
          if (status === "SUBSCRIBED") {
            resolve(void 0);
          }
        });
        // タイムアウト設定
        setTimeout(() => resolve(void 0), 2000);
      });

      const result = await channel.send({
        type: "broadcast",
        event: "question_submitted",
        payload: {
          question: currentQuestion.trim(),
          questionId: questionData.id,
          questionerId: currentParticipant.id,
          questionerName: currentParticipant.nickname,
          sessionId: sessionId,
        },
      });

      // ブロードキャストが失敗した場合でも、少し待ってから再試行
      if (result !== "ok") {
        setTimeout(async () => {
          try {
            await channel.send({
              type: "broadcast",
              event: "question_submitted",
              payload: {
                question: currentQuestion.trim(),
                questionId: questionData.id,
                questionerId: currentParticipant.id,
                questionerName: currentParticipant.nickname,
                sessionId: sessionId,
              },
            });
          } catch (retryError) {
            console.warn("Broadcast retry failed:", retryError);
          }
        }, 1000);
      }

      // チャンネルをクリーンアップ
      setTimeout(() => {
        supabase.removeChannel(channel);
      }, 5000);
    } catch (error) {
      alert(
        `質問の送信に失敗しました: ${
          error instanceof Error ? error.message : "もう一度お試しください。"
        }`
      );
    }
  };

  const handleAnswer = async (answer: boolean) => {
    if (!currentParticipant || hasAnswered) return;

    if (!gameState.questionId) {
      return;
    }

    // モバイル環境での処理最適化
    const isMobile =
      /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
        navigator.userAgent
      );

    setHasAnswered(true);

    try {
      // モバイルでは少し待機してから送信
      if (isMobile) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      // データベースに回答を保存
      await gameService.submitResponse(
        gameState.questionId,
        currentParticipant.id,
        answer
      );

      const channelName = `game-events-${roomId}`;
      const channel = supabase.channel(channelName, {
        config: {
          broadcast: { self: false, ack: isMobile }, // モバイルでは確認応答を有効化
        },
      });
      // モバイルでは接続確認
      if (isMobile) {
        await new Promise((resolve) => {
          const subscription = channel.subscribe((status) => {
            if (status === "SUBSCRIBED") {
              resolve(void 0);
            }
          });
          setTimeout(() => resolve(void 0), 2000);
        });
      }

      const result = await channel.send({
        type: "broadcast",
        event: "answer_submitted",
        payload: {
          participantId: currentParticipant.id,
          answer,
        },
      });

      // ブロードキャスト成功後にローカル状態を更新
      setGameState((prev) => ({
        ...prev,
        responses: {
          ...prev.responses,
          [currentParticipant.id]: answer,
        },
      }));

      // ブロードキャスト結果をログ出力
      console.log("Answer broadcast result:", result);

      // モバイルでブロードキャストが失敗した場合の再試行
      if (isMobile && result !== "ok") {
        setTimeout(async () => {
          try {
            await channel.send({
              type: "broadcast",
              event: "answer_submitted",
              payload: {
                participantId: currentParticipant.id,
                answer,
              },
            });
            // 再試行成功時もローカル状態を更新
            setGameState((prev) => ({
              ...prev,
              responses: {
                ...prev.responses,
                [currentParticipant.id]: answer,
              },
            }));
          } catch (retryError) {
            console.warn("Answer broadcast retry failed:", retryError);
          }
        }, 1000);
      }

      // チャンネルをクリーンアップ
      setTimeout(() => {
        supabase.removeChannel(channel);
      }, 3000);
    } catch (error) {
      setHasAnswered(false); // エラーの場合は回答状態をリセット
      console.error("Answer submission error:", error);
      alert(
        `回答の送信に失敗しました: ${
          error instanceof Error ? error.message : "もう一度お試しください。"
        }`
      );
    }
  };

  const handleShowResults = async () => {
    // 結果表示前に最新の回答状況を同期
    if (gameState.questionId) {
      try {
        const responses = await gameService.getQuestionResponses(
          gameState.questionId
        );
        const responseMap = responses.reduce(
          (acc, r) => ({ ...acc, [r.participant_id]: r.response }),
          {}
        );

        // 同期イベントをブロードキャスト
        const channelName = `game-events-${roomId}`;
        const syncChannel = supabase.channel(`${channelName}-sync`);
        await syncChannel.send({
          type: "broadcast",
          event: "sync_responses",
          payload: {
            responses: responseMap,
          },
        });

        // ローカル状態も更新
        setGameState((prev) => ({
          ...prev,
          responses: responseMap,
        }));

        setTimeout(() => {
          supabase.removeChannel(syncChannel);
        }, 1000);
      } catch (error) {
        console.error("Failed to sync responses:", error);
      }
    }

    try {
      const channelName = `game-events-${roomId}`;
      const channel = supabase.channel(channelName);

      const result = await channel.send({
        type: "broadcast",
        event: "show_results",
        payload: {},
      });

      // ローカル状態も更新
      setGameState((prev) => ({ ...prev, phase: "results" }));
    } catch (error) {}
  };

  const handleNewRound = async () => {
    try {
      const channelName = `game-events-${roomId}`;
      const channel = supabase.channel(channelName);

      const result = await channel.send({
        type: "broadcast",
        event: "new_round",
        payload: {},
      });

      // ローカル状態も更新
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
      setIsQuestioner(false);
    } catch (error) {}
  };

  const yesCount = Object.values(gameState.responses).filter(Boolean).length;
  const totalResponses = Object.keys(gameState.responses).length;
  const allAnswered = totalResponses === gameParticipants.length;

  if (loading) {
    return (
      <div className="fixed inset-0 bg-white flex items-center justify-center p-4 z-50">
        <div className="bg-white border-4 border-black p-8 text-center shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
          <div className="flex justify-center items-center gap-2 mb-6">
            <div className="w-4 h-4 bg-red-500 border border-black animate-pulse"></div>
            <div className="w-4 h-4 bg-yellow-400 border border-black animate-pulse"></div>
            <div className="w-4 h-4 bg-blue-500 border border-black animate-pulse"></div>
          </div>
          <p className="text-black font-bold text-lg">
            ゲームを準備中...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-white flex items-center justify-center p-2 sm:p-4 z-50">
      <div className="bg-white border-3 sm:border-4 border-black max-w-4xl w-full max-h-[95vh] sm:max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="bg-red-500 text-white p-4 sm:p-6 border-b-3 sm:border-b-4 border-black">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-6 h-6 sm:w-8 sm:h-8 bg-white border-2 border-black flex items-center justify-center shrink-0">
                <Eye className="h-3 w-3 sm:h-4 sm:w-4 text-black" />
              </div>
              <h2 className="text-lg sm:text-2xl font-bold">
                ナイショのアンケート
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
                  誰かが質問者になって、みんなに聞きたい質問を考えてください。
                </p>
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
                {!currentParticipant && (
                  <div className="mt-4 bg-red-100 border-2 border-red-500 p-4">
                    <p className="text-red-700 font-bold">
                      参加者情報が読み込まれていません
                    </p>
                    <div className="text-red-600 text-sm mt-2 space-y-1">
                      <p>ロビーページに戻って再度参加してください。</p>
                      <p className="text-xs">
                        参加者数: {gameParticipants.length}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Phase: Questioner Selected */}
          {gameState.phase === "questioner_selected" && (
            <div className="space-y-4 sm:space-y-6">
              {isQuestioner &&
              currentParticipant?.id === gameState.questionerId ? (
                <div className="bg-yellow-100 border-2 border-black p-6">
                  <h4 className="text-lg sm:text-xl font-bold text-black mb-4">
                    質問を入力してください
                  </h4>
                  <textarea
                    value={currentQuestion}
                    onChange={(e) => setCurrentQuestion(e.target.value)}
                    placeholder="例: 今日の朝ごはんを食べましたか？"
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
                        setCurrentQuestion(pickRandom(anonymousYesNoTopics))
                      }
                      className="bg-white text-black py-2 px-3 border-2 border-black font-bold hover:bg-gray-100 transition-colors text-sm sm:text-base mr-2"
                    >
                      <Shuffle className="h-4 w-4 inline mr-1" /> ランダム質問
                    </button>
                    <button
                      type="button"
                      onClick={handleSubmitQuestion}
                      disabled={!currentQuestion.trim()}
                      className="bg-red-500 text-white py-2 px-4 sm:px-6 border-2 border-black font-bold hover:bg-red-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm sm:text-base"
                    >
                      質問を送信
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
                    質問を待っています...
                  </h3>
                  <p className="text-gray-700 text-sm sm:text-base px-4">
                    {gameState.questionerName}
                    さんが質問を考えています。しばらくお待ちください。
                  </p>
                  <div className="flex justify-center items-center gap-2 mt-4">
                    <div className="w-3 h-3 bg-blue-500 border border-black animate-pulse"></div>
                    <div
                      className="w-3 h-3 bg-blue-500 border border-black animate-pulse"
                      style={{ animationDelay: "0.2s" }}
                    ></div>
                    <div
                      className="w-3 h-3 bg-blue-500 border border-black animate-pulse"
                      style={{ animationDelay: "0.4s" }}
                    ></div>
                  </div>
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
                  質問
                </h3>
                <p className="text-base sm:text-xl text-black bg-white border-2 border-black p-3 sm:p-4">
                  {gameState.question}
                </p>
              </div>

              {!hasAnswered ? (
                <div className="text-center space-y-4 sm:space-y-6">
                  <h4 className="text-lg sm:text-xl font-bold text-black px-4">
                    あなたの回答を選んでください
                  </h4>
                  <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center px-4">
                    <button
                      type="button"
                      onClick={() => handleAnswer(true)}
                      disabled={
                        !currentParticipant ||
                        !gameState.questionId ||
                        hasAnswered
                      }
                      className="bg-green-500 text-white py-4 sm:py-6 px-8 sm:px-12 border-2 sm:border-3 border-black font-bold text-lg sm:text-2xl hover:bg-green-600 transition-colors flex items-center justify-center gap-2 sm:gap-3 disabled:opacity-50 disabled:cursor-not-allowed shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] sm:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] sm:hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[1px] hover:translate-y-[1px] sm:hover:translate-x-[2px] sm:hover:translate-y-[2px]"
                    >
                      <CheckCircle className="h-6 w-6 sm:h-8 sm:w-8" />
                      YES
                    </button>
                    <button
                      type="button"
                      onClick={() => handleAnswer(false)}
                      disabled={
                        !currentParticipant ||
                        !gameState.questionId ||
                        hasAnswered
                      }
                      className="bg-red-500 text-white py-4 sm:py-6 px-8 sm:px-12 border-2 sm:border-3 border-black font-bold text-lg sm:text-2xl hover:bg-red-600 transition-colors flex items-center justify-center gap-2 sm:gap-3 disabled:opacity-50 disabled:cursor-not-allowed shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] sm:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] sm:hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[1px] hover:translate-y-[1px] sm:hover:translate-x-[2px] sm:hover:translate-y-[2px]"
                    >
                      <XCircle className="h-6 w-6 sm:h-8 sm:w-8" />
                      NO
                    </button>
                  </div>
                  {!currentParticipant && (
                    <div className="mt-4 bg-red-100 border-2 border-red-500 p-4">
                      <p className="text-red-700 font-bold">
                        参加者情報が読み込まれていません
                      </p>
                      <p className="text-xs">
                        参加者数: {gameParticipants.length}
                      </p>
                    </div>
                  )}
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
                </div>
              )}
              {gameState.questionId && (
                <div className="text-center">
                  <button
                    type="button"
                    onClick={handleShowResults}
                    className="bg-blue-500 text-white py-3 sm:py-4 px-6 sm:px-8 border-2 sm:border-3 border-black font-bold text-base sm:text-lg hover:bg-blue-600 transition-colors"
                  >
                    結果を表示 ({totalResponses}/{gameParticipants.length}
                    人回答済み)
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
                  質問
                </h3>
                <p className="text-base sm:text-lg text-black bg-white border-2 border-black p-3 sm:p-4">
                  {gameState.question}
                </p>
              </div>

              <div className="text-center">
                <h3 className="text-2xl sm:text-3xl font-bold text-black mb-4 sm:mb-6">
                  結果発表
                </h3>
                <div className="bg-yellow-100 border-3 sm:border-4 border-black p-6 sm:p-8">
                  <div className="text-4xl sm:text-6xl font-bold text-black mb-4">
                    {yesCount}人
                  </div>
                  <p className="text-lg sm:text-2xl font-bold text-black">
                    が「YES」と回答しました
                  </p>
                  <p className="text-base sm:text-lg text-gray-700 mt-2">
                    （全{gameParticipants.length}人中）
                  </p>
                </div>
              </div>

              <div className="text-center space-y-4 px-4">
                <p className="text-base sm:text-lg text-gray-700">
                  一体だれが「YES」を押したんでしょうね？🤔
                </p>
                <button
                  type="button"
                  onClick={handleNewRound}
                  className="bg-green-500 text-white py-3 sm:py-4 px-6 sm:px-8 border-2 sm:border-3 border-black font-bold text-base sm:text-lg hover:bg-green-600 transition-colors flex items-center gap-2 sm:gap-3 mx-auto"
                >
                  <RotateCcw className="h-4 w-4 sm:h-5 sm:w-5" />
                  新しい質問で遊ぶ
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
