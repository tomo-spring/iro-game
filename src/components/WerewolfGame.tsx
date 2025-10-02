import React, { useState, useEffect, useCallback } from "react";
import {
  WholeWord as Wolf,
  X,
  Users,
  Clock,
  Vote,
  Eye,
  Target,
  RotateCcw,
  Crown,
} from "lucide-react";
import { supabase } from "../lib/supabase";
import {
  werewolfService,
  type WerewolfSession,
  type WerewolfAssignment,
} from "../services/werewolfService";
import type { Participant } from "../lib/supabase";
import { roomService } from "../services/roomService";

interface WerewolfGameProps {
  roomId: string;
  sessionId: string | null;
  participants: Participant[];
  onClose: () => void;
}

interface GameState {
  phase:
    | "setup"
    | "talk"
    | "vote"
    | "sudden_death"
    | "reverse_chance"
    | "finished";
  session: WerewolfSession | null;
  assignment: WerewolfAssignment | null;
  votes: { [participantId: string]: string };
  voteRound: number;
  gameResult: {
    winner: "citizen" | "werewolf" | null;
    eliminatedPlayer: string | null;
    werewolfGuess: string | null;
    isCorrectGuess: boolean;
  };
}

const TOPIC_PAIRS = [
  { citizen: "コーヒー", werewolf: "紅茶" },
  { citizen: "犬", werewolf: "猫" },
  { citizen: "夏", werewolf: "冬" },
  { citizen: "映画館", werewolf: "遊園地" },
  { citizen: "ラーメン", werewolf: "うどん" },
  { citizen: "山", werewolf: "海" },
  { citizen: "読書", werewolf: "ゲーム" },
  { citizen: "朝", werewolf: "夜" },
  { citizen: "電車", werewolf: "バス" },
  { citizen: "パン", werewolf: "ご飯" },
];

export function WerewolfGame({
  roomId,
  sessionId,
  onClose,
}: WerewolfGameProps) {
  const [gameState, setGameState] = useState<GameState>({
    phase: "setup",
    session: null,
    assignment: null,
    votes: {},
    voteRound: 1,
    gameResult: {
      winner: null,
      eliminatedPlayer: null,
      werewolfGuess: null,
      isCorrectGuess: false,
    },
  });

  const [currentParticipant, setCurrentParticipant] =
    useState<Participant | null>(null);
  const [gameParticipants, setGameParticipants] = useState<Participant[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedVote, setSelectedVote] = useState<string | null>(null);
  const [hasVoted, setHasVoted] = useState(false);
  const [reverseMode, setReverseMode] = useState(false);
  const [werewolfGuess, setWerewolfGuess] = useState("");

  // フェーズ移行ボタンの状態管理
  const [phaseButtonClicks, setPhaseButtonClicks] = useState<Set<string>>(
    new Set()
  );
  const [hasClickedPhaseButton, setHasClickedPhaseButton] = useState(false);
  const [isRestoringState, setIsRestoringState] = useState(true);

  // ゲーム開始時に参加者をDBから取得
  useEffect(() => {
    const fetchGameParticipants = async () => {
      if (!roomId) return;

      setLoading(true);

      try {
        const participants = await werewolfService.getParticipantsForGame(
          roomId
        );
        setGameParticipants(participants);

        const current = await roomService.getCurrentParticipantFromRoom(roomId);
        if (current) {
          setCurrentParticipant(current);
        }
      } catch {
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
        const activeSession = await werewolfService.getActiveSession(roomId);
        if (activeSession && currentParticipant) {
          // 自分の役職を取得
          const assignment = await werewolfService.getAssignment(activeSession.id, currentParticipant.id);
          
          if (assignment) {
            setGameState(prev => ({
              ...prev,
              phase: activeSession.phase,
              session: activeSession,
              assignment: assignment,
            }));
            
            // 投票フェーズの場合、投票状況を取得
            if (activeSession.phase === 'vote' || activeSession.phase === 'sudden_death') {
              const votes = await werewolfService.getVotes(activeSession.id, 1);
              const myVote = votes.find(v => v.voter_id === currentParticipant.id);
              
              setGameState(prev => ({
                ...prev,
                votes: votes.reduce((acc, v) => ({ ...acc, [v.voter_id]: v.target_id }), {}),
              }));
              
              setHasVoted(!!myVote);
              setSelectedVote(myVote?.target_id || null);
            }
            
            setReverseMode(activeSession.reverse_mode);
          }
        }
        
        const storedState = localStorage.getItem(`werewolf_state_${roomId}`);
        if (storedState) {
          const state = JSON.parse(storedState);
          const now = Date.now();
          const stateTime = new Date(state.timestamp).getTime();
          
          // 状態が30分以内で、かつDBの状態と矛盾しない場合のみ復元
          if (now - stateTime < 30 * 60 * 1000 && !activeSession) {
            setGameState(state.gameState);
            setSelectedVote(state.selectedVote || null);
            setHasVoted(state.hasVoted || false);
            setReverseMode(state.reverseMode || false);
            setWerewolfGuess(state.werewolfGuess || "");
            setPhaseButtonClicks(new Set(state.phaseButtonClicks || []));
            setHasClickedPhaseButton(state.hasClickedPhaseButton || false);
          } else {
            localStorage.removeItem(`werewolf_state_${roomId}`);
          }
        }
      } catch (error) {
        console.error('Failed to restore werewolf game state:', error);
        localStorage.removeItem(`werewolf_state_${roomId}`);
      } finally {
        setIsRestoringState(false);
      }
    };

    restoreGameState();
  }, [roomId, currentParticipant]);

  // ゲーム状態が変更されたときにローカルストレージに保存
  useEffect(() => {
    if (!roomId || isRestoringState) return;
    
    const stateToSave = {
      gameState,
      selectedVote,
      hasVoted,
      reverseMode,
      werewolfGuess,
      phaseButtonClicks: Array.from(phaseButtonClicks),
      hasClickedPhaseButton,
      timestamp: new Date().toISOString()
    };
    
    localStorage.setItem(`werewolf_state_${roomId}`, JSON.stringify(stateToSave));
  }, [gameState, selectedVote, hasVoted, reverseMode, werewolfGuess, phaseButtonClicks, hasClickedPhaseButton, roomId, isRestoringState]);

  const handleGameStart = useCallback(
    async (sessionId: string, reverseMode: boolean) => {
      try {
        const session = await werewolfService.getSession(sessionId);
        if (!session || !currentParticipant) return;

        const assignment = await werewolfService.getAssignment(
          sessionId,
          currentParticipant.id
        );

        setGameState((prev) => ({
          ...prev,
          session,
          assignment,
          phase: "talk",
        }));
        setReverseMode(reverseMode);
      } catch {}
    },
    [currentParticipant]
  );

  const handlePhaseChange = useCallback(
    async (sessionId: string, newPhase: GameState["phase"]) => {
      try {
        await werewolfService.updatePhase(sessionId, newPhase);

        const channel = supabase.channel(`werewolf-game-events-${roomId}`);
        await channel.send({
          type: "broadcast",
          event: "werewolf_phase_change",
          payload: {
            phase: newPhase,
          },
        });
      } catch {}
    },
    [roomId]
  );

  // リアルタイム同期
  useEffect(() => {
    if (!roomId) return;

    const channelName = `werewolf-game-events-${roomId}`;
    const channel = supabase
      .channel(channelName)
      .on("broadcast", { event: "werewolf_game_start" }, (payload) => {
        if (payload.payload) {
          handleGameStart(
            payload.payload.sessionId,
            payload.payload.reverseMode
          );
        }
      })
      .on("broadcast", { event: "werewolf_phase_change" }, (payload) => {
        if (payload.payload) {
          setGameState((prev) => ({
            ...prev,
            phase: payload.payload.phase,
            // 投票フェーズ開始時やサドンデス開始時は投票状態を初期化
            votes:
              payload.payload.phase === "vote" ||
              payload.payload.phase === "sudden_death"
                ? {}
                : prev.votes,
          }));
          if (
            payload.payload.phase === "vote" ||
            payload.payload.phase === "sudden_death"
          ) {
            setHasVoted(false);
            setSelectedVote(null);
          }
          // フェーズが変わったらボタンの状態をリセット
          setPhaseButtonClicks(new Set());
          setHasClickedPhaseButton(false);
        }
      })
      .on("broadcast", { event: "werewolf_vote_submitted" }, (payload) => {
        if (payload.payload) {
          setGameState((prev) => ({
            ...prev,
            votes: {
              ...prev.votes,
              [payload.payload.voterId]: payload.payload.targetId,
            },
          }));
        }
      })
      .on("broadcast", { event: "werewolf_phase_button_click" }, (payload) => {
        if (payload.payload) {
          setPhaseButtonClicks((prev) => {
            const newSet = new Set(prev);
            newSet.add(payload.payload.participantId);

            // 2人以上がクリックした場合、次のフェーズに移行
            if (newSet.size >= 2 && gameState.session) {
              // 少し遅延させて状態更新を待つ
              setTimeout(() => {
                const nextPhase = gameState.phase === "talk" ? "vote" : "vote";
                handlePhaseChange(gameState.session!.id, nextPhase);
              }, 100);
            }

            return newSet;
          });
        }
      })
      .on("broadcast", { event: "werewolf_game_end" }, (payload) => {
        if (payload.payload) {
          setGameState((prev) => ({
            ...prev,
            phase: "finished",
            gameResult: payload.payload.result,
          }));
        }
      })
      .on("broadcast", { event: "game_end" }, async () => {
        if (gameState.session?.id) {
          try {
            await werewolfService.endSession(gameState.session.id);
          } catch {}
        }
        localStorage.removeItem(`werewolf_state_${roomId}`);
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
  }, [
    roomId,
    gameState.session?.id,
    onClose,
    handleGameStart,
    handlePhaseChange,
    gameState.session,
    gameState.phase,
  ]);

  // フェーズ移行ボタンをクリックした時の処理
  const handlePhaseButtonClick = async () => {
    if (!currentParticipant || hasClickedPhaseButton) return;

    try {
      // ローカル状態を更新
      setHasClickedPhaseButton(true);
      setPhaseButtonClicks((prev) => {
        const newSet = new Set(prev);
        newSet.add(currentParticipant.id);
        return newSet;
      });

      // ボタンクリックをブロードキャスト
      const channel = supabase.channel(`werewolf-game-events-${roomId}`);
      await channel.send({
        type: "broadcast",
        event: "werewolf_phase_button_click",
        payload: {
          participantId: currentParticipant.id,
        },
      });

      // 2人以上がクリックした場合、次のフェーズに移行
      const newClickCount = phaseButtonClicks.size + 1;
      if (newClickCount >= 2) {
        if (gameState.session) {
          const nextPhase = gameState.phase === "talk" ? "vote" : "vote";
          await handlePhaseChange(gameState.session.id, nextPhase);
        }
      }
    } catch {}
  };

  const handleStartGame = async () => {
    if (!currentParticipant || gameParticipants.length < 3) {
      alert("ゲームを開始するには最低3人の参加者が必要です。");
      return;
    }

    try {
      // ランダムにお題ペアを選択
      const topicPair =
        TOPIC_PAIRS[Math.floor(Math.random() * TOPIC_PAIRS.length)];

      // セッション作成
      const session = await werewolfService.createSession(
        roomId,
        topicPair.citizen,
        topicPair.werewolf,
        reverseMode
      );

      // 役職割り当て
      await werewolfService.assignRoles(session.id, gameParticipants);

      // まずローカル状態を更新
      handleGameStart(session.id, reverseMode);

      // ゲーム開始をブロードキャスト
      const channel = supabase.channel(`werewolf-game-events-${roomId}`, {
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

      await channel.send({
        type: "broadcast",
        event: "werewolf_game_start",
        payload: {
          sessionId: session.id,
          reverseMode,
        },
      });

      setTimeout(() => {
        supabase.removeChannel(channel);
      }, 5000);

    } catch {
      alert("ゲームの開始に失敗しました。");
    }
  };

  const handleVote = async (targetId: string) => {
    if (!currentParticipant || !gameState.session || hasVoted) return;

    try {
      await werewolfService.submitVote(
        gameState.session.id,
        currentParticipant.id,
        targetId,
        gameState.voteRound
      );

      setSelectedVote(targetId);
      setHasVoted(true);

      // 自分の投票をローカルにも即時反映（最後の投票者でもボタンが表示されるように）
      setGameState((prev) => ({
        ...prev,
        votes: {
          ...prev.votes,
          [currentParticipant.id]: targetId,
        },
      }));

      // 投票をブロードキャスト
      const channel = supabase.channel(`werewolf-game-events-${roomId}`);
      await channel.send({
        type: "broadcast",
        event: "werewolf_vote_submitted",
        payload: {
          voterId: currentParticipant.id,
          targetId,
        },
      });
    } catch {
      alert("投票に失敗しました。");
    }
  };

  const handleShowResults = async () => {
    if (!gameState.session) return;

    try {
      const votes = await werewolfService.getVotes(
        gameState.session.id,
        gameState.voteRound
      );
      const assignments = await werewolfService.getAllAssignments(
        gameState.session.id
      );

      // 投票データが空の場合は処理しない
      if (votes.length === 0) {
        alert("投票データが見つかりません。");
        return;
      }

      // 票数集計
      const voteCount: { [participantId: string]: number } = {};
      votes.forEach((vote) => {
        voteCount[vote.target_id] = (voteCount[vote.target_id] || 0) + 1;
      });

      const maxVotes = Math.max(...Object.values(voteCount));
      const eliminatedCandidates = Object.keys(voteCount).filter(
        (id) => voteCount[id] === maxVotes
      );

      if (eliminatedCandidates.length > 1) {
        // サドンデス
        if (gameState.phase === "sudden_death") {
          // 言狼の勝利
          const result = {
            winner: "werewolf" as const,
            eliminatedPlayer: null,
            werewolfGuess: null,
            isCorrectGuess: false,
          };

          // ローカル状態を更新
          setGameState((prev) => ({
            ...prev,
            phase: "finished",
            gameResult: result,
          }));

          const channel = supabase.channel(`werewolf-game-events-${roomId}`);
          await channel.send({
            type: "broadcast",
            event: "werewolf_game_end",
            payload: { result },
          });
        } else {
          // サドンデスへ
          setGameState((prev) => ({ ...prev, voteRound: prev.voteRound + 1 }));
          await handlePhaseChange(gameState.session.id, "sudden_death");
        }
      } else {
        // 勝敗判定
        const eliminatedId = eliminatedCandidates[0];
        const eliminatedAssignment = assignments.find(
          (a) => a.participant_id === eliminatedId
        );
        const isWerewolfEliminated = eliminatedAssignment?.role === "werewolf";

        if (isWerewolfEliminated && reverseMode) {
          // 大逆転モード
          await handlePhaseChange(gameState.session.id, "reverse_chance");
        } else {
          // 通常の勝敗
          const result = {
            winner: isWerewolfEliminated
              ? ("citizen" as const)
              : ("werewolf" as const),
            eliminatedPlayer: eliminatedId,
            werewolfGuess: null,
            isCorrectGuess: false,
          };

          // ローカル状態を更新
          setGameState((prev) => ({
            ...prev,
            phase: "finished",
            gameResult: result,
          }));

          const channel = supabase.channel(`werewolf-game-events-${roomId}`);
          await channel.send({
            type: "broadcast",
            event: "werewolf_game_end",
            payload: { result },
          });
        }
      }
    } catch {
      alert("結果の表示に失敗しました。");
    }
  };

  const handleWerewolfGuess = async () => {
    if (!gameState.session || !currentParticipant || !werewolfGuess.trim())
      return;

    try {
      await werewolfService.submitGuess(
        gameState.session.id,
        currentParticipant.id,
        werewolfGuess.trim()
      );

      const isCorrect =
        werewolfGuess.trim() === gameState.session.citizen_topic;

      const result = {
        winner: isCorrect ? ("werewolf" as const) : ("citizen" as const),
        eliminatedPlayer: currentParticipant.id,
        werewolfGuess: werewolfGuess.trim(),
        isCorrectGuess: isCorrect,
      };

      const channel = supabase.channel(`werewolf-game-events-${roomId}`);
      await channel.send({
        type: "broadcast",
        event: "werewolf_game_end",
        payload: { result },
      });
    } catch {}
  };

  const totalVotes = Object.keys(gameState.votes).length;
  const allVoted = totalVotes === gameParticipants.length;
  const phaseButtonClickCount = phaseButtonClicks.size;

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
        <div className="bg-red-600 text-white p-4 sm:p-6 border-b-3 sm:border-b-4 border-black">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-6 h-6 sm:w-8 sm:h-8 bg-white border-2 border-black flex items-center justify-center shrink-0">
                <Wolf className="h-3 w-3 sm:h-4 sm:w-4 text-black" />
              </div>
              <h2 className="text-lg sm:text-2xl font-bold">言狼</h2>
            </div>
            <button
              onClick={onClose}
              type="button"
              className="bg-white text-black p-1.5 sm:p-2 border-2 border-black hover:bg-gray-100 transition-colors"
            >
              <X className="h-4 w-4 sm:h-5 sm:w-5" />
            </button>
          </div>
        </div>

        {/* Game Content */}
        <div className="p-4 sm:p-6">
          {/* Setup Phase */}
          {gameState.phase === "setup" && (
            <div className="space-y-4 sm:space-y-6">
              <div className="text-center">
                <h3 className="text-xl sm:text-2xl font-bold text-black mb-4">
                  ゲーム設定
                </h3>
                <p className="text-gray-700 mb-4 sm:mb-6 text-sm sm:text-base px-4">
                  会話に潜む"言葉の狼"を見つけ出す新感覚のトーク推理ゲームです。
                </p>
              </div>

              <div className="bg-gray-50 border-2 border-black p-4 mb-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Users className="h-5 w-5" />
                    <span className="font-bold">
                      参加者: {gameParticipants.length}人
                    </span>
                  </div>
                  <div className="text-sm text-gray-600">最低3人必要</div>
                </div>
              </div>

              <div className="bg-yellow-100 border-2 border-black p-4 mb-6">
                <label className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={reverseMode}
                    onChange={(e) => setReverseMode(e.target.checked)}
                    className="w-5 h-5 border-2 border-black"
                  />
                  <div>
                    <span className="font-bold text-black">大逆転モード</span>
                    <p className="text-sm text-gray-700 mt-1">
                      言狼が追放された時、市民のお題を当てれば逆転勝利のチャンス！
                    </p>
                  </div>
                </label>
              </div>

              <div className="text-center">
                <button
                  onClick={handleStartGame}
                  disabled={gameParticipants.length < 3}
                  type="button"
                  className="bg-red-600 text-white py-3 sm:py-4 px-6 sm:px-8 border-2 sm:border-3 border-black font-bold text-base sm:text-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] sm:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] sm:hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[1px] hover:translate-y-[1px] sm:hover:translate-x-[2px] sm:hover:translate-y-[2px]"
                >
                  ゲーム開始
                </button>
              </div>
            </div>
          )}

          {/* Talk Phase */}
          {(gameState.phase === "talk" || gameState.phase === "sudden_death") &&
            gameState.assignment && (
              <div className="space-y-4 sm:space-y-6">
                {/* Phase Button */}
                <div className="bg-blue-100 border-2 border-black p-4 text-center">
                  <div className="flex items-center justify-center gap-2 mb-2">
                    <Clock className="h-5 w-5" />
                    <span className="font-bold text-lg">
                      {gameState.phase === "sudden_death"
                        ? "サドンデス"
                        : "トークタイム"}
                    </span>
                  </div>
                  <div className="mb-4">
                    <p className="text-sm text-gray-700 mb-2">
                      話し合いが終わったら、次のフェーズに進むボタンを押してください
                    </p>
                    <p className="text-sm text-gray-600">
                      2人以上がボタンを押すと次のフェーズに進みます
                    </p>
                  </div>
                  <div className="bg-white border-2 border-black p-3 mb-3">
                    <p className="text-lg font-bold text-blue-600">
                      ボタン押下数: {phaseButtonClickCount}/
                      {gameParticipants.length}
                    </p>
                  </div>
                  <button
                    onClick={handlePhaseButtonClick}
                    disabled={hasClickedPhaseButton}
                    type="button"
                    className={`py-2 px-6 border-2 border-black font-bold transition-colors ${
                      hasClickedPhaseButton
                        ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                        : "bg-blue-500 text-white hover:bg-blue-600 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[1px] hover:translate-y-[1px]"
                    }`}
                  >
                    {hasClickedPhaseButton
                      ? "ボタン押下済み"
                      : "次のフェーズへ"}
                  </button>
                </div>

                {/* Your Topic */}
                <div className={"border-2 border-black p-6 bg-green-100"}>
                  <div className="bg-white border-2 border-black p-4">
                    <h4 className="font-bold text-black mb-2">あなたのお題</h4>
                    <p className="text-2xl font-bold text-black">
                      {gameState.assignment.topic}
                    </p>
                  </div>
                  <div className="mt-4 text-sm text-gray-700">
                    <p className="font-bold mb-2">ゲームの目標:</p>
                    <p>
                      会話を通じて他の参加者と協力し、ゲームを勝利に導きましょう！
                    </p>
                  </div>
                </div>

                {/* Rules Reminder */}
                <div className="bg-yellow-100 border-2 border-black p-4">
                  <h4 className="font-bold text-black mb-2 flex items-center gap-2">
                    <Target className="h-5 w-5" />
                    注意事項
                  </h4>
                  <ul className="text-sm text-gray-700 space-y-1">
                    <li>• お題そのものや、それに近い言葉を言うのは禁止</li>
                    <li>• お題が直接分かってしまうような質問も禁止</li>
                    <li>• 会話が噛み合わない人を探しましょう</li>
                  </ul>
                </div>
              </div>
            )}

          {/* Vote Phase */}
          {gameState.phase === "vote" && (
            <div className="space-y-4 sm:space-y-6">
              <div className="text-center bg-blue-100 border-2 border-black p-6">
                <Vote className="h-12 w-12 mx-auto mb-4 text-blue-600" />
                <h3 className="text-xl sm:text-2xl font-bold text-black mb-4">
                  投票タイム
                </h3>
                <p className="text-gray-700 text-sm sm:text-base">
                  「この人が言狼だ！」と思うプレイヤーに投票してください
                </p>
              </div>

              <div className="bg-gray-50 border-2 border-black p-4 mb-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Users className="h-5 w-5" />
                    <span className="font-bold">
                      投票済み: {totalVotes}/{gameParticipants.length}
                    </span>
                  </div>
                </div>
              </div>

              {!hasVoted ? (
                <div className="space-y-4">
                  <h4 className="text-lg font-bold text-black text-center">
                    投票先を選んでください
                  </h4>
                  <div className="grid gap-3">
                    {gameParticipants
                      .filter((p) => p.id !== currentParticipant?.id)
                      .map((participant) => (
                        <button
                          key={participant.id}
                          onClick={() => handleVote(participant.id)}
                          type="button"
                          className={`p-4 border-2 border-black font-bold text-left transition-colors ${
                            selectedVote === participant.id
                              ? "bg-red-200 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]"
                              : "bg-white hover:bg-gray-100 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]"
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 bg-gray-400 border-2 border-black flex items-center justify-center text-white font-bold">
                              {participant.nickname.charAt(0).toUpperCase()}
                            </div>
                            <span className="text-black">
                              {participant.nickname}
                            </span>
                          </div>
                        </button>
                      ))}
                  </div>
                </div>
              ) : (
                <div className="text-center bg-gray-100 border-2 border-black p-6">
                  <Eye className="h-12 w-12 text-green-500 mx-auto mb-4" />
                  <h4 className="text-lg font-bold text-black mb-2">
                    投票完了！
                  </h4>
                  <p className="text-gray-700">
                    他の参加者の投票を待っています...
                  </p>
                </div>
              )}

              {gameState.session && gameState.phase === "vote" && (
                <div className="text-center">
                  <button
                    onClick={handleShowResults}
                    type="button"
                    className="bg-red-600 text-white py-3 px-6 border-2 border-black font-bold hover:bg-red-700 transition-colors"
                  >
                    結果を表示 ({totalVotes}/{gameParticipants.length}人投票済み)
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Reverse Chance Phase */}
          {gameState.phase === "reverse_chance" &&
            gameState.assignment?.role === "werewolf" && (
              <div className="space-y-6">
                <div className="text-center bg-red-100 border-2 border-black p-6">
                  <Crown className="h-12 w-12 mx-auto mb-4 text-red-600" />
                  <h3 className="text-2xl font-bold text-black mb-4">
                    大逆転チャンス！
                  </h3>
                  <p className="text-gray-700">
                    市民のお題を当てることができれば、あなたの単独勝利です！
                  </p>
                </div>

                <div className="bg-white border-2 border-black p-6">
                  <h4 className="font-bold text-black mb-4">
                    市民のお題を推測してください
                  </h4>
                  <input
                    type="text"
                    value={werewolfGuess}
                    onChange={(e) => setWerewolfGuess(e.target.value)}
                    placeholder="市民のお題を入力..."
                    className="w-full p-4 border-2 border-black text-lg mb-4"
                    maxLength={20}
                  />
                  <button
                    onClick={handleWerewolfGuess}
                    disabled={!werewolfGuess.trim()}
                    type="button"
                    className="w-full bg-red-600 text-white py-3 px-6 border-2 border-black font-bold hover:bg-red-700 transition-colors disabled:opacity-50"
                  >
                    推測を提出
                  </button>
                </div>
              </div>
            )}

          {/* Results Phase */}
          {gameState.phase === "finished" && (
            <div className="space-y-6">
              <div className="text-center">
                <h3 className="text-2xl font-bold text-black mb-6">
                  ゲーム終了
                </h3>
                <div
                  className={`border-4 border-black p-8 ${
                    gameState.gameResult.winner === "citizen"
                      ? "bg-green-100"
                      : "bg-red-100"
                  }`}
                >
                  <div className="text-6xl font-bold text-black mb-4">
                    {gameState.gameResult.winner === "citizen" ? "🏆" : "🐺"}
                  </div>
                  <p className="text-3xl font-bold text-black mb-4">
                    {gameState.gameResult.winner === "citizen"
                      ? "市民の勝利！"
                      : "言狼の勝利！"}
                  </p>
                  {gameState.gameResult.werewolfGuess && (
                    <div className="mt-4 p-4 bg-white border-2 border-black">
                      <p className="font-bold text-black">
                        言狼の推測: {gameState.gameResult.werewolfGuess}
                      </p>
                      <p className="text-sm text-gray-700">
                        {gameState.gameResult.isCorrectGuess
                          ? "正解！"
                          : "不正解"}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              <div className="text-center">
                <button
                  onClick={onClose}
                  type="button"
                  className="bg-green-500 text-white py-3 px-6 border-2 border-black font-bold hover:bg-green-600 transition-colors flex items-center gap-2 mx-auto"
                >
                  <RotateCcw className="h-5 w-5" />
                  ロビーに戻る
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
