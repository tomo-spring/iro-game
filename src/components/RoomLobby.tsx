import { useState, useEffect, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { LogOut, Clock, Wifi, User, Play } from "lucide-react";
import { Eye, Trophy, WholeWord as Wolf } from "lucide-react";
import { supabase } from "../lib/supabase";
import { useRoomParticipants } from "../hooks/useRoomParticipants";
import { roomService } from "../services/roomService";
import { GameInstructions } from "./GameInstructions";
import { AnonymousSurveyGame } from "./AnonymousSurveyGame";
import { RankingGame } from "./RankingGame";
import { SynchroGame } from "./SynchroGame";
import { WerewolfGame } from "./WerewolfGame";

export function RoomLobby() {
  const navigate = useNavigate();
  const { roomId: urlRoomId } = useParams();
  const [roomId, setRoomId] = useState<string | null>(null);
  const [nickname, setNickname] = useState<string | null>(null);
  const [participantId, setParticipantId] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<string>("接続中...");
  const lastSeenInterval = useRef<number>();
  const [showGameInstructions, setShowGameInstructions] = useState(false);
  const [gameActive, setGameActive] = useState(false);
  const [gameSessionId, setGameSessionId] = useState<string | null>(null);
  const [selectedGameType, setSelectedGameType] = useState<
    "anonymous_survey" | "ranking" | "synchro" | "werewolf"
  >("anonymous_survey");

  const { participants, loading } = useRoomParticipants(roomId || "");

  // Monitor Supabase connection status
  useEffect(() => {
    const checkConnection = () => {
      try {
        const status =
          supabase.realtime.channels.length > 0 ? "接続済み" : "切断";
        setConnectionStatus(status);
        setIsConnected(status === "接続済み");
      } catch {
        setConnectionStatus("接続エラー");
        setIsConnected(false);
      }
    };

    checkConnection();
    const interval = setInterval(checkConnection, 2000);

    return () => clearInterval(interval);
  }, []);

  // ゲーム開始の監視
  useEffect(() => {
    if (!roomId) return;

    // 統一されたゲーム開始イベントを監視
    const channel = supabase
      .channel(`game-start-${roomId}`)
      .on("broadcast", { event: "game_start" }, (payload) => {
        if (payload.payload) {
          setSelectedGameType(payload.payload.gameType);
          setGameSessionId(payload.payload.sessionId);
          setGameActive(true);
          setShowGameInstructions(false);
        }
      })
      .on("broadcast", { event: "game_end" }, () => {
        setGameActive(false);
        setGameSessionId(null);
      })
      .subscribe();

    channel.on("system", {}, () => {});

    return () => {
      supabase.removeChannel(channel);
    };
  }, [roomId]);

  useEffect(() => {
    // Get room info from localStorage or redirect to home
    const storedRoomId = urlRoomId || localStorage.getItem("current_room_id");
    const storedNickname = localStorage.getItem("current_nickname");

    if (!storedRoomId || !storedNickname) {
      navigate("/");
      return;
    }

    setRoomId(storedRoomId);
    setNickname(storedNickname);

    // Update localStorage if we got roomId from URL
    if (urlRoomId && urlRoomId !== localStorage.getItem("current_room_id")) {
      localStorage.setItem("current_room_id", urlRoomId);
    }
  }, [navigate, urlRoomId]);

  useEffect(() => {
    if (!roomId || !nickname) return;

    let mounted = true;

    const joinRoom = async () => {
      try {
        // Clean up inactive participants first
        await roomService.cleanupInactiveParticipants(roomId);

        // Try to get existing participant first
        let participant = await roomService.getCurrentParticipantFromRoom(
          roomId
        );

        if (!participant) {
          // Join as new participant
          participant = await roomService.joinRoom(roomId, nickname);
        } else {
          // Update last seen for existing participant
          await roomService.updateLastSeen(participant.id);
        }

        if (mounted) {
          setParticipantId(participant.id);
          setIsConnected(true);
          setConnectionStatus("接続済み");
        }
      } catch {
        if (mounted) {
          setIsConnected(false);
          setConnectionStatus("接続失敗");
        }
      }
    };

    joinRoom();

    return () => {
      mounted = false;
    };
  }, [roomId, nickname]);

  useEffect(() => {
    if (!participantId) return;

    const updateLastSeen = () => {
      roomService.updateLastSeen(participantId).catch(() => {});
    };

    // Update immediately
    updateLastSeen();

    // Then update every 15 seconds instead of 30
    lastSeenInterval.current = window.setInterval(updateLastSeen, 15000);

    return () => {
      if (lastSeenInterval.current) {
        clearInterval(lastSeenInterval.current);
      }
    };
  }, [participantId]);

  const handleLeave = async () => {
    if (participantId) {
      try {
        await roomService.leaveRoom(participantId);
      } catch {}
    }
    // Clear stored room info
    localStorage.removeItem("current_room_id");
    localStorage.removeItem("current_nickname");
    navigate("/");
  };

  useEffect(() => {
    const handleBeforeUnload = async () => {
      if (participantId) {
        try {
          await roomService.leaveRoom(participantId);
        } catch {}
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [participantId]);

  const formatJoinTime = (timestamp: string) => {
    return new Date(timestamp).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getAvatarColor = (nickname: string) => {
    const colors = ["bg-red-500", "bg-yellow-400", "bg-blue-500"];
    const index = nickname
      .split("")
      .reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return colors[index % colors.length];
  };

  const handleStartGame = (
    gameType: "anonymous_survey" | "ranking" | "synchro" | "werewolf"
  ) => {
    setSelectedGameType(gameType);
    setShowGameInstructions(true);
  };

  const handleCloseInstructions = () => {
    setShowGameInstructions(false);
  };

  const handleCloseGame = () => {
    setGameActive(false);
    setGameSessionId(null);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="bg-white border-4 border-black p-8 text-center shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
          <div className="flex justify-center items-center gap-2 mb-6">
            <div className="w-4 h-4 bg-red-500 border border-black animate-pulse"></div>
            <div className="w-4 h-4 bg-yellow-400 border border-black animate-pulse"></div>
            <div className="w-4 h-4 bg-blue-500 border border-black animate-pulse"></div>
          </div>
          <p className="text-black font-bold text-lg">ルームに参加中...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="min-h-screen bg-white p-3 sm:p-4 lg:p-6">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="bg-white border-3 sm:border-4 border-black p-3 sm:p-6 mb-4 sm:mb-6 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] sm:shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
            {/* Mobile Layout */}
            <div className="block sm:hidden">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <img
                    src="/irogame-logo.png"
                    alt="Logo"
                    className="h-8 w-auto object-contain shrink-0"
                  />
                  <h1 className="text-lg font-bold text-black">ルームロビー</h1>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1 bg-gray-100 border-2 border-black px-2 py-1">
                    <Wifi
                      className={`h-3 w-3 ${
                        isConnected ? "text-green-600" : "text-red-500"
                      }`}
                    />
                    <span
                      className={`text-xs font-bold ${
                        isConnected ? "text-green-600" : "text-red-500"
                      }`}
                    >
                      {connectionStatus}
                    </span>
                  </div>
                  <button
                    onClick={handleLeave}
                    type="button"
                    className="bg-red-500 text-white px-2 py-1 border-2 border-black font-bold hover:bg-red-600 transition-colors flex items-center gap-1 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[1px] hover:translate-y-[1px] text-xs"
                  >
                    <LogOut className="h-3 w-3" />
                  </button>
                </div>
              </div>
              <div className="bg-gray-100 border-2 border-black px-3 py-2 text-center">
                <span className="font-bold text-black text-sm">
                  ルーム: {roomId}
                </span>
              </div>
            </div>

            {/* Desktop Layout */}
            <div className="hidden sm:flex items-center justify-between">
              <div className="flex items-center gap-4">
                <img
                  src="/irogame-logo.png"
                  alt="Logo"
                  className="h-12 w-auto object-contain shrink-0"
                />
                <div>
                  <h1 className="text-2xl lg:text-3xl font-bold text-black">
                    ルームロビー
                  </h1>
                  <div className="bg-gray-100 border-2 border-black px-3 py-1 inline-block mt-2">
                    <span className="font-bold text-black text-sm lg:text-base">
                      ルーム: {roomId}
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2 bg-gray-100 border-2 border-black px-3 py-2">
                  <Wifi
                    className={`h-4 w-4 ${
                      isConnected ? "text-green-600" : "text-red-500"
                    }`}
                  />
                  <span
                    className={`text-sm font-bold ${
                      isConnected ? "text-green-600" : "text-red-500"
                    }`}
                  >
                    {connectionStatus}
                  </span>
                </div>
                <button
                  onClick={handleLeave}
                  type="button"
                  className="bg-red-500 text-white px-4 py-3 border-2 border-black font-bold hover:bg-red-600 transition-colors flex items-center gap-2 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[1px] hover:translate-y-[1px] text-sm lg:text-base"
                >
                  <LogOut className="h-4 w-4" />
                  <span>退出</span>
                </button>
              </div>
            </div>
          </div>

          {/* Participants List */}
          <div className="bg-white border-3 sm:border-4 border-black p-3 sm:p-6 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] sm:shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
            <div className="flex items-center justify-between mb-3 sm:mb-6">
              <h2 className="text-lg sm:text-2xl font-bold text-black">
                参加者
              </h2>
              <div className="bg-blue-500 text-white px-3 py-2 border-2 border-black font-bold shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
                <span className="text-sm sm:text-base">
                  {participants.length}人
                </span>
                {participants.length > 0 && (
                  <span className="ml-1 sm:ml-2 animate-pulse text-green-300">
                    ●
                  </span>
                )}
              </div>
            </div>

            {participants.length === 0 ? (
              <div className="text-center py-12 border-2 border-gray-300 border-dashed">
                <User className="h-16 w-16 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600 text-lg sm:text-xl font-bold mb-2">
                  まだ参加者がいません
                </p>
                <p className="text-gray-500">
                  このルームに最初に参加しましょう！
                </p>
              </div>
            ) : (
              <div className="grid gap-2 sm:gap-4">
                {participants.map((participant) => (
                  <div
                    key={participant.id}
                    className={`flex items-center gap-2 sm:gap-4 p-2.5 sm:p-4 border-2 sm:border-3 border-black transition-all duration-200 ${
                      participant.nickname === nickname
                        ? "bg-yellow-100 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]"
                        : "bg-gray-50 hover:bg-gray-100 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]"
                    }`}
                  >
                    <div
                      className={`w-10 h-10 sm:w-12 sm:h-12 border-2 border-black flex items-center justify-center text-white font-bold text-sm sm:text-lg shrink-0 ${getAvatarColor(
                        participant.nickname
                      )}`}
                    >
                      {participant.nickname.charAt(0).toUpperCase()}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 sm:gap-3">
                        <h3 className="font-bold text-black text-sm sm:text-lg truncate">
                          {participant.nickname}
                        </h3>
                        {participant.nickname === nickname && (
                          <span className="bg-black text-white text-xs px-1.5 py-0.5 sm:px-2 sm:py-1 font-bold whitespace-nowrap">
                            あなた
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1 text-xs text-gray-600 mt-0.5 sm:mt-1">
                        <Clock className="h-3 w-3 shrink-0" />
                        <span className="font-medium truncate">
                          {formatJoinTime(participant.joined_at)} に参加
                        </span>
                      </div>
                    </div>

                    <div
                      className="w-3 h-3 sm:w-4 sm:h-4 bg-green-500 border border-black animate-pulse shrink-0"
                      title="オンライン"
                    ></div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Room Info */}
          <div className="bg-white border-3 sm:border-4 border-black p-4 sm:p-6 mt-4 sm:mt-6 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] sm:shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
            <h3 className="text-xl sm:text-2xl font-bold text-black mb-4">
              ルーム情報
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-gray-100 border-2 border-black p-4">
                <p className="text-gray-600 font-bold mb-1 text-sm sm:text-base">
                  ルームID
                </p>
                <p className="font-bold text-black text-base sm:text-lg break-all">
                  {roomId}
                </p>
              </div>
              <div className="bg-gray-100 border-2 border-black p-4">
                <p className="text-gray-600 font-bold mb-1 text-sm sm:text-base">
                  あなたのニックネーム
                </p>
                <p className="font-bold text-black text-base sm:text-lg">
                  {nickname}
                </p>
              </div>
            </div>
          </div>

          {/* Game Section */}
          <div className="bg-white border-3 sm:border-4 border-black p-3 sm:p-6 mt-4 sm:mt-6 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] sm:shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
            <div className="flex items-center justify-between mb-3 sm:mb-6">
              <h3 className="text-lg sm:text-2xl font-bold text-black">
                ゲーム
              </h3>
              <div className="flex items-center gap-1 sm:gap-2">
                <div className="w-3 h-3 sm:w-4 sm:h-4 bg-red-500 border border-black shrink-0"></div>
                <div className="w-3 h-3 sm:w-4 sm:h-4 bg-yellow-400 border border-black shrink-0"></div>
                <div className="w-3 h-3 sm:w-4 sm:h-4 bg-blue-500 border border-black shrink-0"></div>
              </div>
            </div>

            <div className="space-y-3 sm:space-y-6 mb-3 sm:mb-6">
              {/* Werewolf Game */}
              <div className="bg-red-50 border-2 border-black p-3 sm:p-6">
                <div className="flex items-center gap-2 sm:gap-3 mb-2 sm:mb-3">
                  <div className="w-5 h-5 sm:w-6 sm:h-6 bg-red-600 border-2 border-black flex items-center justify-center shrink-0">
                    <Wolf className="h-2 w-2 sm:h-3 sm:w-3 text-white" />
                  </div>
                  <h4 className="text-base sm:text-xl font-bold text-black">
                    言狼
                  </h4>
                </div>
                <p className="text-gray-700 mb-3 sm:mb-4 text-sm sm:text-base overflow-hidden text-ellipsis sm:overflow-visible sm:text-clip">
                  会話に潜む"言葉の狼"を見つけ出せ！新感覚のトーク推理ゲームです。
                </p>
                <button
                  type="button"
                  onClick={() => handleStartGame("werewolf")}
                  className="w-full bg-red-600 text-white py-2.5 sm:py-4 px-3 sm:px-6 border-2 sm:border-3 border-black font-bold text-sm sm:text-lg hover:bg-red-700 transition-colors duration-200 flex items-center justify-center gap-2 sm:gap-3 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] sm:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] sm:hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[1px] hover:translate-y-[1px] sm:hover:translate-x-[2px] sm:hover:translate-y-[2px]"
                >
                  <Play className="h-4 w-4 sm:h-5 sm:w-5" />
                  <span className="hidden sm:inline">言狼ゲーム開始</span>
                  <span className="sm:hidden">言狼開始</span>
                </button>
              </div>

              {/* Ranking Game */}
              <div className="bg-yellow-50 border-2 border-black p-3 sm:p-6">
                <div className="flex items-center gap-2 sm:gap-3 mb-2 sm:mb-3">
                  <div className="w-5 h-5 sm:w-6 sm:h-6 bg-yellow-400 border-2 border-black flex items-center justify-center shrink-0">
                    <Trophy className="h-2 w-2 sm:h-3 sm:w-3 text-black" />
                  </div>
                  <h4 className="text-base sm:text-xl font-bold text-black">
                    ランキングゲーム
                  </h4>
                </div>
                <p className="text-gray-700 mb-3 sm:mb-4 text-sm sm:text-base overflow-hidden text-ellipsis sm:overflow-visible sm:text-clip">
                  空気を読んで心を合わせろ！全員で協力して順位の重複を避ける、一体感チャレンジゲームです。
                </p>
                <button
                  type="button"
                  onClick={() => handleStartGame("ranking")}
                  className="w-full bg-yellow-400 text-black py-2.5 sm:py-4 px-3 sm:px-6 border-2 sm:border-3 border-black font-bold text-sm sm:text-lg hover:bg-yellow-500 transition-colors duration-200 flex items-center justify-center gap-2 sm:gap-3 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] sm:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] sm:hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[1px] hover:translate-y-[1px] sm:hover:translate-x-[2px] sm:hover:translate-y-[2px]"
                >
                  <Play className="h-4 w-4 sm:h-5 sm:w-5" />
                  <span className="hidden sm:inline">ランキングゲーム開始</span>
                  <span className="sm:hidden">ランキング開始</span>
                </button>
              </div>
              {/* Anonymous Survey Game */}
              <div className="bg-red-50 border-2 border-black p-3 sm:p-6">
                <div className="flex items-center gap-2 sm:gap-3 mb-2 sm:mb-3">
                  <div className="w-5 h-5 sm:w-6 sm:h-6 bg-red-500 border-2 border-black flex items-center justify-center shrink-0">
                    <Eye className="h-2 w-2 sm:h-3 sm:w-3 text-white" />
                  </div>
                  <h4 className="text-base sm:text-xl font-bold text-black">
                    ナイショのアンケート
                  </h4>
                </div>
                <p className="text-gray-700 mb-3 sm:mb-4 text-sm sm:text-base overflow-hidden text-ellipsis sm:overflow-visible sm:text-clip">
                  「YES」と答えたのは何人？みんなのホンネがこっそり分かる、ドキドキのアンケートツールです。
                </p>
                <button
                  type="button"
                  onClick={() => handleStartGame("anonymous_survey")}
                  className="w-full bg-red-500 text-white py-2.5 sm:py-4 px-3 sm:px-6 border-2 sm:border-3 border-black font-bold text-sm sm:text-lg hover:bg-red-600 transition-colors duration-200 flex items-center justify-center gap-2 sm:gap-3 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] sm:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] sm:hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[1px] hover:translate-y-[1px] sm:hover:translate-x-[2px] sm:hover:translate-y-[2px]"
                >
                  <Play className="h-4 w-4 sm:h-5 sm:w-5" />
                  <span className="hidden sm:inline">アンケートゲーム開始</span>
                  <span className="sm:hidden">アンケート開始</span>
                </button>
              </div>

              {/* Synchro Game */}
              <div className="bg-purple-50 border-2 border-black p-3 sm:p-6">
                <div className="flex items-center gap-2 sm:gap-3 mb-2 sm:mb-3">
                  <div className="w-5 h-5 sm:w-6 sm:h-6 bg-purple-500 border-2 border-black flex items-center justify-center shrink-0">
                    <span className="text-white text-xs sm:text-sm font-bold">
                      ⚡
                    </span>
                  </div>
                  <h4 className="text-base sm:text-xl font-bold text-black">
                    シンクロゲーム
                  </h4>
                </div>
                <p className="text-gray-700 mb-3 sm:mb-4 text-sm sm:text-base overflow-hidden text-ellipsis sm:overflow-visible sm:text-clip">
                  奇跡の一致を目指せ！お題に対する答えを全員で合わせる、究極の以心伝心ゲームです。
                </p>
                <button
                  type="button"
                  onClick={() => handleStartGame("synchro")}
                  className="w-full bg-purple-500 text-white py-2.5 sm:py-4 px-3 sm:px-6 border-2 sm:border-3 border-black font-bold text-sm sm:text-lg hover:bg-purple-600 transition-colors duration-200 flex items-center justify-center gap-2 sm:gap-3 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] sm:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] sm:hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[1px] hover:translate-y-[1px] sm:hover:translate-x-[2px] sm:hover:translate-y-[2px]"
                >
                  <Play className="h-4 w-4 sm:h-5 sm:w-5" />
                  <span className="hidden sm:inline">シンクロゲーム開始</span>
                  <span className="sm:hidden">シンクロ開始</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {showGameInstructions && (
        <GameInstructions
          onClose={handleCloseInstructions}
          roomId={roomId || ""}
          participants={participants}
          gameType={selectedGameType}
        />
      )}

      {gameActive && (
        <>
          {selectedGameType === "ranking" ? (
            <RankingGame
              roomId={roomId || ""}
              sessionId={gameSessionId}
              participants={participants}
              onClose={handleCloseGame}
            />
          ) : selectedGameType === "synchro" ? (
            <SynchroGame
              roomId={roomId || ""}
              sessionId={gameSessionId}
              participants={participants}
              onClose={handleCloseGame}
            />
          ) : selectedGameType === "werewolf" ? (
            <WerewolfGame
              roomId={roomId || ""}
              sessionId={gameSessionId}
              participants={participants}
              onClose={handleCloseGame}
            />
          ) : (
            <AnonymousSurveyGame
              roomId={roomId || ""}
              sessionId={gameSessionId}
              participants={participants}
              onClose={handleCloseGame}
            />
          )}
        </>
      )}
    </>
  );
}
