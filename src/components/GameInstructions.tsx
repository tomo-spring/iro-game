import React, { useState } from "react";
import {
  X,
  Play,
  Users,
  Eye,
  MessageCircle,
  Trophy,
  Zap,
  WholeWord as Wolf,
} from "lucide-react";
import { AnonymousSurveyGame } from "./AnonymousSurveyGame";
import { RankingGame } from "./RankingGame";
import { SynchroGame } from "./SynchroGame";
import { WerewolfGame } from "./WerewolfGame";
import { supabase } from "../lib/supabase";
import { gameService } from "../services/gameService";
import type { Participant } from "../lib/supabase";

interface GameInstructionsProps {
  onClose: () => void;
  roomId: string;
  participants: Participant[];
  gameType: "anonymous_survey" | "ranking" | "synchro" | "werewolf";
}

export function GameInstructions({
  onClose,
  roomId,
  participants,
  gameType,
}: GameInstructionsProps) {
  const [isStarting, setIsStarting] = useState(false);
  const [gameStarted, setGameStarted] = useState(false);

  const handleStartGame = async () => {
    setIsStarting(true);

    try {
      // ゲームセッションを作成
      const gameSession = await gameService.createGameSession(roomId, gameType);

      // 統一されたゲーム開始イベントを送信
      const channel = supabase.channel(`game-start-${roomId}`);

      // チャンネルが準備できるまで少し待つ
      await new Promise((resolve) => setTimeout(resolve, 100));

      const result = await channel.send({
        type: "broadcast",
        event: "game_start",
        payload: {
          roomId,
          sessionId: gameSession.id,
          gameType,
          timestamp: new Date().toISOString(),
        },
      });

      // 送信が成功したかチェック
      if (result !== "ok") {
        throw new Error("ゲーム開始の通知に失敗しました");
      }

      // 少し待ってから画面遷移
      setTimeout(() => {
        setGameStarted(true);
      }, 500);
    } catch (error) {
      alert(
        `ゲームの開始に失敗しました: ${
          error instanceof Error ? error.message : "もう一度お試しください。"
        }`
      );
    } finally {
      setIsStarting(false);
    }
  };

  if (gameStarted) {
    if (gameType === "werewolf") {
      return (
        <WerewolfGame
          roomId={roomId}
          sessionId={null}
          participants={participants}
          onClose={onClose}
        />
      );
    } else if (gameType === "ranking") {
      return (
        <RankingGame
          roomId={roomId}
          sessionId={null}
          participants={participants}
          onClose={onClose}
        />
      );
    } else if (gameType === "synchro") {
      return (
        <SynchroGame
          roomId={roomId}
          sessionId={null}
          participants={participants}
          onClose={onClose}
        />
      );
    } else {
      return (
        <AnonymousSurveyGame
          roomId={roomId}
          sessionId={null}
          participants={participants}
          onClose={onClose}
        />
      );
    }
  }

  const isAnonymousSurvey = gameType === "anonymous_survey";
  const isRanking = gameType === "ranking";
  const isSynchro = gameType === "synchro";
  const isWerewolf = gameType === "werewolf";

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-2 sm:p-4 z-50">
      <div className="bg-white border-3 sm:border-4 border-black max-w-3xl w-full max-h-[95vh] sm:max-h-[90vh] overflow-y-auto shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] sm:shadow-[12px_12px_0px_0px_rgba(0,0,0,1)]">
        {/* Header */}
        <div
          className={`${
            isAnonymousSurvey
              ? "bg-red-500 text-white"
              : isRanking
              ? "bg-yellow-400 text-black"
              : isSynchro
              ? "bg-purple-500 text-white"
              : "bg-red-600 text-white"
          } p-4 sm:p-6 border-b-3 sm:border-b-4 border-black`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div
                className={`w-6 h-6 sm:w-8 sm:h-8 bg-white border-2 border-black flex items-center justify-center shrink-0`}
              >
                {isAnonymousSurvey ? (
                  <Eye className="h-3 w-3 sm:h-4 sm:w-4 text-black" />
                ) : isRanking ? (
                  <Trophy className="h-3 w-3 sm:h-4 sm:w-4 text-black" />
                ) : isSynchro ? (
                  <Zap className="h-3 w-3 sm:h-4 sm:w-4 text-black" />
                ) : (
                  <Wolf className="h-3 w-3 sm:h-4 sm:w-4 text-black" />
                )}
              </div>
              <h2 className="text-lg sm:text-2xl font-bold">
                {isAnonymousSurvey
                  ? "ナイショのアンケート"
                  : isRanking
                  ? "ランキングゲーム"
                  : isSynchro
                  ? "シンクロゲーム"
                  : "言狼"}
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

        {/* Content */}
        <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
          {/* Description */}
          <div
            className={`${
              isAnonymousSurvey
                ? "bg-yellow-100"
                : isRanking
                ? "bg-blue-100"
                : isSynchro
                ? "bg-purple-100"
                : "bg-red-100"
            } border-2 border-black p-4`}
          >
            {isAnonymousSurvey ? (
              <p className="text-black font-bold text-base sm:text-lg">
                「YES」と答えたのは何人？みんなのホンネがこっそり分かる、ドキドキのアンケートツールです。
              </p>
            ) : isRanking ? (
              <p className="text-black font-bold text-base sm:text-lg">
                空気を読んで心を合わせろ！全員で協力して順位の重複を避ける、一体感チャレンジゲームです。
              </p>
            ) : isSynchro ? (
              <p className="text-black font-bold text-base sm:text-lg">
                奇跡の一致を目指せ！お題に対する答えを全員で合わせる、究極の以心伝心ゲームです。
              </p>
            ) : (
              <p className="text-black font-bold text-base sm:text-lg">
                会話に潜む"言葉の狼"を見つけ出せ！新感覚のトーク推理ゲームです。
              </p>
            )}
          </div>

          {/* Features */}
          <div>
            <h3 className="text-lg sm:text-xl font-bold text-black mb-4 flex items-center gap-2">
              <div className="w-6 h-6 bg-blue-500 border-2 border-black"></div>
              ルール説明
            </h3>
            <div className="bg-gray-50 border-2 border-black p-4">
              {isAnonymousSurvey ? (
                <p className="text-black leading-relaxed text-sm sm:text-base">
                  出された質問に対して、各プレイヤーが「YES」か「NO」で匿名回答します。結果には「YES」と答えた人数だけが表示されるため、誰が答えたかバレずに安心して楽しめます。
                </p>
              ) : isRanking ? (
                <div className="space-y-3">
                  <p className="text-black leading-relaxed text-sm sm:text-base">
                    <strong>【勝利条件】</strong>{" "}
                    参加者全員が、他の誰とも被らない順位を提出できればクリア（全員の勝利）！一人でも順位が被ってしまうと、その時点でミッション失敗（全員の敗北）となります。
                  </p>
                  <p className="text-black leading-relaxed text-sm sm:text-base">
                    <strong>【成功のコツ】</strong>{" "}
                    メンバーの性格を考え、「あの人なら1位を選びそうだから、自分は2位にしておこう」といった駆け引きがクリアの鍵です。
                  </p>
                </div>
              ) : isSynchro ? (
                <div className="space-y-3">
                  <p className="text-black leading-relaxed text-sm sm:text-base">
                    <strong>【勝利条件】</strong>{" "}
                    出されたお題に対して、参加者全員の答えが完全に一致すればクリア（全員の勝利）！一人でも違う答えを出すと、チャレンジ失敗（全員の敗北）となります。
                  </p>
                  <p className="text-black leading-relaxed text-sm sm:text-base">
                    <strong>【成功のコツ】</strong>{" "}
                    「『赤い果物』といえば？」のような問いに対して、みんなが同じことを考えているかを読み取ることが重要です。一番一般的で分かりやすい答えを選びましょう。
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-black leading-relaxed text-sm sm:text-base">
                    <strong>【市民の勝利条件】</strong>{" "}
                    話し合いで少数派の「言狼」を見つけ出し、投票で最多票を集めさせれば勝利！
                  </p>
                  <p className="text-black leading-relaxed text-sm sm:text-base">
                    <strong>【言狼の勝利条件】</strong>{" "}
                    正体を隠し通し、自分以外が最多票となれば勝利！
                  </p>
                  <p className="text-black leading-relaxed text-sm sm:text-base">
                    <strong>【大逆転モード】</strong>{" "}
                    言狼が追放された時、市民のお題を当てることができれば言狼の単独逆転勝利！
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* How to play */}
          <div>
            <h3 className="text-lg sm:text-xl font-bold text-black mb-4 flex items-center gap-2">
              <div
                className={`w-6 h-6 ${
                  isAnonymousSurvey
                    ? "bg-yellow-400"
                    : isRanking
                    ? "bg-green-400"
                    : isSynchro
                    ? "bg-purple-400"
                    : "bg-red-400"
                } border-2 border-black`}
              ></div>
              ゲームの流れ
            </h3>
            {isAnonymousSurvey ? (
              <div className="space-y-3 sm:space-y-4">
                <div className="bg-white border-2 border-black p-4">
                  <div className="flex items-start gap-3">
                    <div className="w-6 h-6 sm:w-8 sm:h-8 bg-red-500 border-2 border-black flex items-center justify-center shrink-0 text-white font-bold text-sm sm:text-base">
                      1
                    </div>
                    <div>
                      <h4 className="font-bold text-black mb-2 text-sm sm:text-base">
                        質問を決める
                      </h4>
                      <p className="text-gray-700 text-sm sm:text-base">
                        まず、質問をする出題者を決めます。出題者は、みんなに聞きたい質問を自由に考えましょう。
                      </p>
                    </div>
                  </div>
                </div>

                <div className="bg-white border-2 border-black p-4">
                  <div className="flex items-start gap-3">
                    <div className="w-6 h-6 sm:w-8 sm:h-8 bg-yellow-400 border-2 border-black flex items-center justify-center shrink-0 text-black font-bold text-sm sm:text-base">
                      2
                    </div>
                    <div>
                      <h4 className="font-bold text-black mb-2 text-sm sm:text-base">
                        全員で回答
                      </h4>
                      <p className="text-gray-700 text-sm sm:text-base">
                        出題者を含め、全員が質問に対して「YES」か「NO」で回答します。
                      </p>
                    </div>
                  </div>
                </div>

                <div className="bg-white border-2 border-black p-4">
                  <div className="flex items-start gap-3">
                    <div className="w-6 h-6 sm:w-8 sm:h-8 bg-blue-500 border-2 border-black flex items-center justify-center shrink-0 text-white font-bold text-sm sm:text-base">
                      3
                    </div>
                    <div>
                      <h4 className="font-bold text-black mb-2 text-sm sm:text-base">
                        結果を見る
                      </h4>
                      <p className="text-gray-700 text-sm sm:text-base">
                        「YES」と答えた人数が発表されます。「一体だれが押したんだろう？」と、結果を元に会話を弾ませましょう。
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            ) : isRanking ? (
              <div className="space-y-3 sm:space-y-4">
                <div className="bg-white border-2 border-black p-4">
                  <div className="flex items-start gap-3">
                    <div className="w-6 h-6 sm:w-8 sm:h-8 bg-red-500 border-2 border-black flex items-center justify-center shrink-0 text-white font-bold text-sm sm:text-base">
                      1
                    </div>
                    <div>
                      <h4 className="font-bold text-black mb-2 text-sm sm:text-base">
                        お題発表
                      </h4>
                      <p className="text-gray-700 text-sm sm:text-base">
                        出題者がお題を決めます。例えば「この中で最もインドアな人ランキング」のように、明確な正解がなく、感覚で順位が決まるお題が盛り上がります。
                      </p>
                    </div>
                  </div>
                </div>

                <div className="bg-white border-2 border-black p-4">
                  <div className="flex items-start gap-3">
                    <div className="w-6 h-6 sm:w-8 sm:h-8 bg-yellow-400 border-2 border-black flex items-center justify-center shrink-0 text-black font-bold text-sm sm:text-base">
                      2
                    </div>
                    <div>
                      <h4 className="font-bold text-black mb-2 text-sm sm:text-base">
                        順位を決定
                      </h4>
                      <p className="text-gray-700 text-sm sm:text-base">
                        お題に対して、参加者の中での自分の順位を予想して入力します。「自分は〇位くらいかな？」という自己評価と、「あの人は何位を選びそう？」という他者への予想を働かせ、被らない順位を目指しましょう。
                      </p>
                    </div>
                  </div>
                </div>

                <div className="bg-white border-2 border-black p-4">
                  <div className="flex items-start gap-3">
                    <div className="w-6 h-6 sm:w-8 sm:h-8 bg-blue-500 border-2 border-black flex items-center justify-center shrink-0 text-white font-bold text-sm sm:text-base">
                      3
                    </div>
                    <div>
                      <h4 className="font-bold text-black mb-2 text-sm sm:text-base">
                        結果発表
                      </h4>
                      <p className="text-gray-700 text-sm sm:text-base">
                        全員が入力した順位が一斉に公開されます。見事、全員の順位が異なっていればチャレンジ成功です！実際の順位と違っていても、被ってさえいなければ問題ありません。
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            ) : isSynchro ? (
              <div className="space-y-3 sm:space-y-4">
                <div className="bg-white border-2 border-black p-4">
                  <div className="flex items-start gap-3">
                    <div className="w-6 h-6 sm:w-8 sm:h-8 bg-purple-500 border-2 border-black flex items-center justify-center shrink-0 text-white font-bold text-sm sm:text-base">
                      1
                    </div>
                    <div>
                      <h4 className="font-bold text-black mb-2 text-sm sm:text-base">
                        GMを決める
                      </h4>
                      <p className="text-gray-700 text-sm sm:text-base">
                        ゲームの進行役となるGM（ゲームマスター）を一人決めます。
                      </p>
                    </div>
                  </div>
                </div>

                <div className="bg-white border-2 border-black p-4">
                  <div className="flex items-start gap-3">
                    <div className="w-6 h-6 sm:w-8 sm:h-8 bg-purple-400 border-2 border-black flex items-center justify-center shrink-0 text-white font-bold text-sm sm:text-base">
                      2
                    </div>
                    <div>
                      <h4 className="font-bold text-black mb-2 text-sm sm:text-base">
                        お題を決める
                      </h4>
                      <p className="text-gray-700 text-sm sm:text-base">
                        GMは「『赤い果物』といえば？」のような、全員の答えが揃いそうなお題を決め、発表します。
                      </p>
                    </div>
                  </div>
                </div>

                <div className="bg-white border-2 border-black p-4">
                  <div className="flex items-start gap-3">
                    <div className="w-6 h-6 sm:w-8 sm:h-8 bg-purple-300 border-2 border-black flex items-center justify-center shrink-0 text-black font-bold text-sm sm:text-base">
                      3
                    </div>
                    <div>
                      <h4 className="font-bold text-black mb-2 text-sm sm:text-base">
                        一斉に回答
                      </h4>
                      <p className="text-gray-700 text-sm sm:text-base">
                        GMを含む全員が、お題から連想する答えを（他の人に見られないように）入力します。
                      </p>
                    </div>
                  </div>
                </div>

                <div className="bg-white border-2 border-black p-4">
                  <div className="flex items-start gap-3">
                    <div className="w-6 h-6 sm:w-8 sm:h-8 bg-purple-200 border-2 border-black flex items-center justify-center shrink-0 text-black font-bold text-sm sm:text-base">
                      4
                    </div>
                    <div>
                      <h4 className="font-bold text-black mb-2 text-sm sm:text-base">
                        答え合わせ
                      </h4>
                      <p className="text-gray-700 text-sm sm:text-base">
                        全員の答えが一斉に公開されます。全員の答えがピッタリ一致していれば成功です！少しだけ表現が違うなど、微妙な回答については、全員で話し合って一致したかどうかを判断しましょう。
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-3 sm:space-y-4">
                <div className="bg-white border-2 border-black p-4">
                  <div className="flex items-start gap-3">
                    <div className="w-6 h-6 sm:w-8 sm:h-8 bg-red-600 border-2 border-black flex items-center justify-center shrink-0 text-white font-bold text-sm sm:text-base">
                      1
                    </div>
                    <div>
                      <h4 className="font-bold text-black mb-2 text-sm sm:text-base">
                        お題確認とトークタイム
                      </h4>
                      <p className="text-gray-700 text-sm sm:text-base">
                        各プレイヤーに2種類のお題のうち、どちらか一方が表示されます。多数派が「市民」、少数派が「言狼」となります。お題について自由に話し合い、会話が噛み合わないプレイヤーを探しましょう。
                      </p>
                    </div>
                  </div>
                </div>

                <div className="bg-white border-2 border-black p-4">
                  <div className="flex items-start gap-3">
                    <div className="w-6 h-6 sm:w-8 sm:h-8 bg-red-500 border-2 border-black flex items-center justify-center shrink-0 text-white font-bold text-sm sm:text-base">
                      2
                    </div>
                    <div>
                      <h4 className="font-bold text-black mb-2 text-sm sm:text-base">
                        投票
                      </h4>
                      <p className="text-gray-700 text-sm sm:text-base">
                        トークタイム終了後、「この人が言狼だ！」と思うプレイヤーに一斉投票します。自分自身には投票できません。
                      </p>
                    </div>
                  </div>
                </div>

                <div className="bg-white border-2 border-black p-4">
                  <div className="flex items-start gap-3">
                    <div className="w-6 h-6 sm:w-8 sm:h-8 bg-red-400 border-2 border-black flex items-center justify-center shrink-0 text-white font-bold text-sm sm:text-base">
                      3
                    </div>
                    <div>
                      <h4 className="font-bold text-black mb-2 text-sm sm:text-base">
                        結果発表
                      </h4>
                      <p className="text-gray-700 text-sm sm:text-base">
                        最も多くの票を集めたプレイヤーが追放されます。追放されたプレイヤーが「言狼」なら市民の勝ち、「市民」なら言狼の勝ちです。
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Tips */}
          <div>
            <h3 className="text-lg sm:text-xl font-bold text-black mb-4 flex items-center gap-2">
              <MessageCircle className="h-6 w-6" />
              楽しむためのヒント
            </h3>
            <div className="bg-blue-100 border-2 border-black p-4">
              {isAnonymousSurvey ? (
                <p className="text-black leading-relaxed text-sm sm:text-base">
                  このツールは、会話のきっかけを作るためのものです。誰が「YES」を押したか無理に詮索したり、告白を強要したりするのは避け、お互いのプライバシーを尊重しながら楽しみましょう。
                </p>
              ) : isRanking ? (
                <p className="text-black leading-relaxed text-sm sm:text-base">
                  「3回連続成功」などの目標を設定すると、さらに楽しめます。失敗しても責めずに、「次はどうする？」と作戦を練り直して再挑戦しましょう。
                </p>
              ) : isSynchro ? (
                <p className="text-black leading-relaxed text-sm sm:text-base">
                  「5回連続成功でクリア」といった目標を設定すると、より一体感が生まれて盛り上がります。微妙な答えについては全員で話し合って判断し、楽しい雰囲気を大切にしましょう。
                </p>
              ) : (
                <p className="text-black leading-relaxed text-sm sm:text-base">
                  お題そのものや、それに近い言葉を言うのは禁止です。お題が直接分かってしまうような質問も避けましょう。会話の中で自然に相手のお題を推測することが重要です。
                </p>
              )}
            </div>
          </div>

          {/* Participants */}
          <div>
            <h3 className="text-lg sm:text-xl font-bold text-black mb-4 flex items-center gap-2">
              <Users className="h-6 w-6" />
              参加者 ({participants.length}人)
            </h3>
            <div className="bg-gray-50 border-2 border-black p-4">
              <div className="flex flex-wrap gap-1 sm:gap-2">
                {participants.map((participant) => (
                  <div
                    key={participant.id}
                    className="bg-white border-2 border-black px-2 sm:px-3 py-1 font-bold text-black text-sm sm:text-base"
                  >
                    {participant.nickname}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="bg-gray-100 border-t-3 sm:border-t-4 border-black p-4 sm:p-6">
          <div className="flex gap-2 sm:gap-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 bg-gray-500 text-white py-2 sm:py-3 px-4 sm:px-6 border-2 sm:border-3 border-black font-bold hover:bg-gray-600 transition-colors text-sm sm:text-base"
            >
              キャンセル
            </button>
            <button
              type="button"
              onClick={handleStartGame}
              disabled={isStarting}
              className={`flex-1 ${
                isAnonymousSurvey
                  ? "bg-red-500 hover:bg-red-600 text-white"
                  : isRanking
                  ? "bg-yellow-400 hover:bg-yellow-500 text-black"
                  : isSynchro
                  ? "bg-purple-500 hover:bg-purple-600 text-white"
                  : "bg-red-600 hover:bg-red-700 text-white"
              } py-2 sm:py-3 px-4 sm:px-6 border-2 sm:border-3 border-black font-bold transition-colors flex items-center justify-center gap-1 sm:gap-2 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] sm:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] sm:hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[1px] hover:translate-y-[1px] sm:hover:translate-x-[2px] sm:hover:translate-y-[2px] disabled:opacity-50 disabled:cursor-not-allowed text-sm sm:text-base`}
            >
              {isStarting ? (
                <>
                  <div
                    className={`w-3 h-3 sm:w-4 sm:h-4 border-2 ${
                      isAnonymousSurvey || isSynchro || isWerewolf
                        ? "border-white"
                        : "border-black"
                    } border-t-transparent rounded-full animate-spin`}
                  ></div>
                  <span className="hidden sm:inline">開始中...</span>
                  <span className="sm:hidden">開始中</span>
                </>
              ) : (
                <>
                  <Play className="h-4 w-4 sm:h-5 sm:w-5" />
                  <span className="hidden sm:inline">ゲーム開始</span>
                  <span className="sm:hidden">開始</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
