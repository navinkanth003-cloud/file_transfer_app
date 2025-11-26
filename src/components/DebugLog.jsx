import React, { useState, useEffect, useRef } from 'react';
import { Terminal, X, Minimize2, Maximize2 } from 'lucide-react';

const DebugLog = () => {
    const [logs, setLogs] = useState([]);
    const [isOpen, setIsOpen] = useState(false);
    const logsEndRef = useRef(null);

    useEffect(() => {
        // Override console methods to capture logs
        const originalLog = console.log;
        const originalError = console.error;
        const originalWarn = console.warn;

        const addLog = (type, args) => {
            const message = args.map(arg => {
                if (typeof arg === 'object') {
                    try {
                        return JSON.stringify(arg);
                    } catch (e) {
                        return String(arg);
                    }
                }
                return String(arg);
            }).join(' ');

            setLogs(prev => [...prev.slice(-49), { type, message, time: new Date().toLocaleTimeString() }]);
        };

        console.log = (...args) => {
            originalLog.apply(console, args);
            addLog('info', args);
        };

        console.error = (...args) => {
            originalError.apply(console, args);
            addLog('error', args);
        };

        console.warn = (...args) => {
            originalWarn.apply(console, args);
            addLog('warn', args);
        };

        return () => {
            console.log = originalLog;
            console.error = originalError;
            console.warn = originalWarn;
        };
    }, []);

    useEffect(() => {
        if (logsEndRef.current) {
            logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [logs, isOpen]);

    if (!isOpen) {
        return (
            <button
                onClick={() => setIsOpen(true)}
                className="fixed bottom-4 right-4 bg-gray-800 text-white p-3 rounded-full shadow-lg hover:bg-gray-700 z-50 border border-gray-600"
                title="Open Debug Logs"
            >
                <Terminal className="w-6 h-6" />
            </button>
        );
    }

    return (
        <div className="fixed bottom-4 right-4 w-96 h-96 bg-gray-900 border border-gray-700 rounded-lg shadow-2xl z-50 flex flex-col font-mono text-xs">
            <div className="flex items-center justify-between p-2 bg-gray-800 border-b border-gray-700 rounded-t-lg">
                <span className="font-bold text-gray-300 flex items-center gap-2">
                    <Terminal className="w-4 h-4" /> Debug Logs
                </span>
                <div className="flex items-center gap-2">
                    <button onClick={() => setLogs([])} className="text-gray-400 hover:text-white px-2">Clear</button>
                    <button onClick={() => setIsOpen(false)} className="text-gray-400 hover:text-white">
                        <Minimize2 className="w-4 h-4" />
                    </button>
                </div>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1 bg-black/50">
                {logs.map((log, i) => (
                    <div key={i} className={`break-words ${log.type === 'error' ? 'text-red-400' :
                            log.type === 'warn' ? 'text-yellow-400' : 'text-green-400'
                        }`}>
                        <span className="text-gray-600">[{log.time}]</span> {log.message}
                    </div>
                ))}
                <div ref={logsEndRef} />
            </div>
        </div>
    );
};

export default DebugLog;
