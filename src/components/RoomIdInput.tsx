import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Users } from "lucide-react";

export function RoomIdInput() {
  const [roomId, setRoomId] = useState("");
  const navigate = useNavigate();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (roomId.trim()) {
      navigate(`/nickname?roomId=${encodeURIComponent(roomId.trim())}`);
    }
  };

  return (
    <div className="min-h-screen bg-white flex items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-md mx-auto">
        {/* Logo-inspired header */}
        <div className="text-center mb-8 sm:mb-12">
          <img
            src="/irogame-logo.png"
            alt="Logo"
            className="h-12 w-auto sm:h-16 mx-auto mb-4 object-contain"
          />
          <h1 className="text-2xl sm:text-4xl font-bold text-black mb-3 sm:mb-4">
            入室画面
          </h1>
        </div>

        {/* Main form card */}
        <div className="bg-white border-3 sm:border-4 border-black p-4 sm:p-8 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] sm:shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label
                htmlFor="roomId"
                className="block text-base sm:text-lg font-bold text-black mb-3"
              >
                ルームID
              </label>
              <input
                type="text"
                id="roomId"
                value={roomId}
                onChange={(e) => setRoomId(e.target.value)}
                placeholder="ルームIDを入力 (例: room123)"
                className="w-full px-3 sm:px-4 py-3 sm:py-4 border-2 sm:border-3 border-black text-base sm:text-lg font-medium focus:outline-none focus:ring-0 focus:border-red-500 transition-colors duration-200"
                required
              />
            </div>

            <button
              type="submit"
              className="w-full bg-red-500 text-white py-3 sm:py-4 px-4 sm:px-6 border-2 sm:border-3 border-black font-bold text-base sm:text-lg hover:bg-red-600 transition-colors duration-200 flex items-center justify-center gap-2 sm:gap-3 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] sm:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] sm:hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[1px] hover:translate-y-[1px] sm:hover:translate-x-[2px] sm:hover:translate-y-[2px]"
            >
              続行
              <ArrowRight className="h-4 w-4 sm:h-5 sm:w-5" />
            </button>
          </form>

          {/* <div className="mt-6 sm:mt-8 text-center">
            <p className="text-gray-600 text-sm sm:text-base px-2">
              ルームIDを入力してルームを作成または参加
            </p>
          </div> */}
        </div>
      </div>
    </div>
  );
}
