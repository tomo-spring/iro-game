import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowRight, User, ArrowLeft } from 'lucide-react';

export function NicknameInput() {
  const [nickname, setNickname] = useState('');
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const roomId = searchParams.get('roomId');

  React.useEffect(() => {
    if (!roomId) {
      navigate('/');
    }
  }, [roomId, navigate]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (nickname.trim() && roomId) {
      // Store room info in localStorage
      localStorage.setItem('current_room_id', roomId);
      localStorage.setItem('current_nickname', nickname.trim());
      navigate(`/lobby/${encodeURIComponent(roomId)}`);
    }
  };

  const handleBack = () => {
    navigate('/');
  };

  if (!roomId) return null;

  return (
    <div className="min-h-screen bg-white flex items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-md mx-auto">
        {/* Header with back button */}
        <div className="flex items-center mb-6 sm:mb-8">
          <button
            onClick={handleBack}
            className="p-2 sm:p-3 border-2 border-black hover:bg-gray-100 transition-colors duration-200 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]"
          >
            <ArrowLeft className="h-4 w-4 sm:h-5 sm:w-5 text-black" />
          </button>
          <div className="flex-1 text-center">
            <div className="flex justify-center items-center gap-2 mb-3 sm:mb-4">
              <div className="w-4 h-4 sm:w-6 sm:h-6 bg-yellow-400 border-2 border-black"></div>
              <div className="w-4 h-4 sm:w-6 sm:h-6 bg-blue-500 border-2 border-black"></div>
            </div>
          </div>
        </div>

        <div className="text-center mb-6 sm:mb-8">
          <h1 className="text-2xl sm:text-4xl font-bold text-black mb-3 sm:mb-4">ニックネーム選択</h1>
          <div className="bg-gray-100 border-2 border-black p-3 sm:p-4 mb-3 sm:mb-4">
            <p className="text-black font-bold text-sm sm:text-base">ルーム: {roomId}</p>
          </div>
          <p className="text-gray-600 text-base sm:text-lg px-4">他の人にどのように表示されたいですか？</p>
        </div>

        {/* Main form card */}
        <div className="bg-white border-3 sm:border-4 border-black p-4 sm:p-8 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] sm:shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label htmlFor="nickname" className="block text-base sm:text-lg font-bold text-black mb-3">
                ニックネーム
              </label>
              <input
                type="text"
                id="nickname"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                placeholder="ニックネームを入力"
                className="w-full px-3 sm:px-4 py-3 sm:py-4 border-2 sm:border-3 border-black text-base sm:text-lg font-medium focus:outline-none focus:ring-0 focus:border-yellow-400 transition-colors duration-200"
                required
                maxLength={20}
              />
              <p className="text-gray-600 text-sm mt-2">最大20文字</p>
            </div>

            <button
              type="submit"
              className="w-full bg-yellow-400 text-black py-3 sm:py-4 px-4 sm:px-6 border-2 sm:border-3 border-black font-bold text-base sm:text-lg hover:bg-yellow-500 transition-colors duration-200 flex items-center justify-center gap-2 sm:gap-3 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] sm:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] sm:hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[1px] hover:translate-y-[1px] sm:hover:translate-x-[2px] sm:hover:translate-y-[2px]"
            >
              ロビーに参加
              <ArrowRight className="h-4 w-4 sm:h-5 sm:w-5" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}