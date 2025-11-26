import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Send, Download } from 'lucide-react';

const Home = () => {
    const navigate = useNavigate();

    return (
        <div className="flex flex-col md:flex-row gap-6 justify-center items-center mt-12">
            <button
                onClick={() => navigate('/send')}
                className="group relative w-full md:w-64 h-64 bg-gray-800 rounded-2xl p-6 flex flex-col items-center justify-center gap-4 hover:bg-gray-700 transition-all duration-300 border border-gray-700 hover:border-blue-500"
            >
                <div className="w-20 h-20 bg-blue-500/10 rounded-full flex items-center justify-center group-hover:bg-blue-500/20 transition-colors">
                    <Send className="w-10 h-10 text-blue-400 group-hover:scale-110 transition-transform" />
                </div>
                <div className="text-center">
                    <h2 className="text-2xl font-bold text-white mb-2">Send</h2>
                    <p className="text-gray-400 text-sm">Create a room and share files</p>
                </div>
            </button>

            <button
                onClick={() => navigate('/receive')}
                className="group relative w-full md:w-64 h-64 bg-gray-800 rounded-2xl p-6 flex flex-col items-center justify-center gap-4 hover:bg-gray-700 transition-all duration-300 border border-gray-700 hover:border-purple-500"
            >
                <div className="w-20 h-20 bg-purple-500/10 rounded-full flex items-center justify-center group-hover:bg-purple-500/20 transition-colors">
                    <Download className="w-10 h-10 text-purple-400 group-hover:scale-110 transition-transform" />
                </div>
                <div className="text-center">
                    <h2 className="text-2xl font-bold text-white mb-2">Receive</h2>
                    <p className="text-gray-400 text-sm">Scan QR or enter code</p>
                </div>
            </button>
        </div>
    );
};

export default Home;
