import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { RoomIdInput } from './components/RoomIdInput';
import { NicknameInput } from './components/NicknameInput';
import { RoomLobby } from './components/RoomLobby';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<RoomIdInput />} />
        <Route path="/nickname" element={<NicknameInput />} />
        <Route path="/lobby" element={<RoomLobby />} />
        <Route path="/lobby/:roomId" element={<RoomLobby />} />
      </Routes>
    </Router>
  );
}

export default App;