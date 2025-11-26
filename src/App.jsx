import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Home from './components/Home';
import Sender from './components/Sender';
import Receiver from './components/Receiver';
import DebugLog from './components/DebugLog';

function App() {
  return (
    <Router>
      <div className="min-h-screen bg-gray-900 text-white font-sans relative">
        <DebugLog />
        <div className="container mx-auto px-4 py-8">
          <header className="mb-8 text-center">
            <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
              Universal File Transfer
            </h1>
            <p className="text-gray-400 mt-2">Send files securely to any device</p>
          </header>

          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/send" element={<Sender />} />
            <Route path="/receive" element={<Receiver />} />
          </Routes>
        </div>
      </div>
    </Router>
  );
}

export default App;
