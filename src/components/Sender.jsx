import React, { useState, useEffect, useRef } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { v4 as uuidv4 } from 'uuid';
import SimplePeer from 'simple-peer';
import { socket, getCurrentServerURL, setServerURL } from '../services/socket';
import { getIceServers } from '../config/iceServers';
import { Copy, Check, File as FileIcon, Loader, AlertCircle } from 'lucide-react';

const Sender = () => {
    const [roomId, setRoomId] = useState('');
    const [status, setStatus] = useState('generating-id'); // generating-id, waiting, connecting, connected, sending, completed
    const [file, setFile] = useState(null);
    const [progress, setProgress] = useState(0);
    const [copied, setCopied] = useState(false);
    const [socketConnected, setSocketConnected] = useState(false);
    const [debugLogs, setDebugLogs] = useState([]);

    const peerRef = useRef();
    const socketRef = useRef(socket);
    const statusRef = useRef(status);
    const roomIdRef = useRef(roomId);
    const connectionTimeoutRef = useRef();

    const addLog = (msg) => {
        console.log(msg);
        setDebugLogs(prev => [...prev.slice(-19), `${new Date().toLocaleTimeString()} - ${msg}`]);
    };

    // Keep refs in sync
    useEffect(() => {
        statusRef.current = status;
    }, [status]);

    useEffect(() => {
        roomIdRef.current = roomId;
    }, [roomId]);

    useEffect(() => {
        // Check initial connection state
        setSocketConnected(socketRef.current.connected);

        // Re-check connection state periodically (robustness fix)
        const checkConnection = setInterval(() => {
            console.log('Sender check:', {
                id: socketRef.current?.id,
                connected: socketRef.current?.connected,
                state: socketConnected
            });
            if (socketRef.current && socketRef.current.connected !== socketConnected) {
                setSocketConnected(socketRef.current.connected);
            }
        }, 1000);

        socketRef.current.on('connect', () => {
            addLog("Socket connected");
            setSocketConnected(true);
        });
        socketRef.current.on('disconnect', () => {
            addLog("Socket disconnected");
            setSocketConnected(false);
        });
        socketRef.current.on('connect_error', (error) => {
            console.error("Socket connection error:", error);
            setSocketConnected(false);
        });

        const id = uuidv4().slice(0, 6).toUpperCase();
        setRoomId(id);
        roomIdRef.current = id;

        setStatus('waiting');
        statusRef.current = 'waiting';

        addLog(`Joining room: ${id}`);
        socketRef.current.emit('join-room', id);

        socketRef.current.on('user-connected', (userId) => {
            addLog(`Receiver connected: ${userId}`);

            // Always restart connection if a user joins, even if we were already connecting
            if (statusRef.current === 'waiting' || statusRef.current === 'connecting') {
                addLog('Starting new connection...');
                setStatus('connecting');
                statusRef.current = 'connecting';

                // Small delay to ensure receiver peer is ready
                setTimeout(() => {
                    startPeerConnection(true);
                }, 1000);
            }
        });

        socketRef.current.on('signal', (data) => {
            // Ignore own signals
            if (data.callerID === socketRef.current.id) return;

            addLog(`Received signal: ${data.signal ? data.signal.type : 'candidate'}`);
            if (peerRef.current) {
                peerRef.current.signal(data.signal);
            }
        });

        return () => {
            socketRef.current.off('user-connected');
            socketRef.current.off('signal');
            socketRef.current.off('connect');
            socketRef.current.off('disconnect');
            socketRef.current.off('connect_error');
            if (peerRef.current) peerRef.current.destroy();
            if (connectionTimeoutRef.current) clearTimeout(connectionTimeoutRef.current);
            clearInterval(checkConnection);
        };
    }, []);

    const startPeerConnection = (initiator) => {
        // Destroy existing peer if any
        if (peerRef.current) {
            addLog('Destroying existing peer');
            peerRef.current.destroy();
            peerRef.current = null;
        }

        addLog(`Creating peer (initiator: ${initiator})`);
        const peer = new SimplePeer({
            initiator: initiator,
            trickle: false, // Disable trickle for better cross-device stability
            offerToReceiveAudio: false,
            offerToReceiveVideo: false,
            config: {
                iceServers: getIceServers()
            },
            channelConfig: {
                ordered: true,
                maxPacketLifeTime: 3000, // 3 seconds
            }
        });

        peer.on('signal', (data) => {
            if (socketRef.current) {
                const currentRoomId = roomIdRef.current;
                // Only log offers/answers, candidates are too noisy
                if (data.type !== 'candidate') {
                    addLog(`Sending signal: ${data.type}`);
                }
                socketRef.current.emit('signal', {
                    target: currentRoomId,
                    signal: data,
                    callerID: socketRef.current.id
                });
            }
        });

        // Add timeout for connection
        if (connectionTimeoutRef.current) clearTimeout(connectionTimeoutRef.current);
        connectionTimeoutRef.current = setTimeout(() => {
            if (peer && !peer.connected) {
                addLog('Peer connection timeout');
                peer.destroy();
                setStatus('waiting');
            }
        }, 60000); // 60 second timeout

        peer.on('connect', () => {
            addLog('Peer connected successfully!');
            if (connectionTimeoutRef.current) clearTimeout(connectionTimeoutRef.current);
            setStatus('connected');
            statusRef.current = 'connected';

            // Send HELLO back to receiver
            try {
                peer.send('HELLO');
            } catch (e) {
                console.error('Error sending hello:', e);
            }
        });

        // Add detailed debug logging
        if (peer._pc) {
            peer._pc.oniceconnectionstatechange = () => {
                addLog(`ICE State: ${peer._pc.iceConnectionState}`);
            };
            peer._pc.onsignalingstatechange = () => {
                addLog(`Signaling State: ${peer._pc.signalingState}`);
            };
        }

        peer.on('data', (data) => {
            handleData(data);
        });

        peer.on('error', (err) => {
            addLog(`Peer error: ${err.message}`);
            if (connectionTimeoutRef.current) clearTimeout(connectionTimeoutRef.current);
            setStatus((prevStatus) => {
                if (prevStatus !== 'completed' && prevStatus !== 'sending') {
                    statusRef.current = 'waiting';
                    return 'waiting';
                }
                return prevStatus;
            });
        });

        peer.on('close', () => {
            addLog('Peer closed');
            if (connectionTimeoutRef.current) clearTimeout(connectionTimeoutRef.current);
            setStatus((prevStatus) => {
                if (prevStatus === 'sending') {
                    statusRef.current = 'waiting';
                    return 'waiting';
                }
                if (prevStatus === 'completed') {
                    return prevStatus;
                }
                if (prevStatus !== 'connected') {
                    statusRef.current = 'waiting';
                    return 'waiting';
                }
                return prevStatus;
            });
        });

        peerRef.current = peer;
    };

    const handleData = (data) => {
        // Check if data is metadata (JSON string)
        try {
            const text = new TextDecoder().decode(data);
            if (text === 'HELLO') {
                console.log('Received keep-alive from receiver');
                if (statusRef.current !== 'connected') {
                    addLog('Forcing connected state via HELLO');
                    setStatus('connected');
                    statusRef.current = 'connected';
                    if (connectionTimeoutRef.current) clearTimeout(connectionTimeoutRef.current);
                }
                return;
            }
            // ... other data handling if needed
        } catch (e) {
            // Not text
        }
    };

    const copyToClipboard = () => {
        navigator.clipboard.writeText(roomId);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const sendFile = () => {
        if (!file || !peerRef.current) {
            console.error('Cannot send file: no file or peer connection');
            return;
        }

        if (!peerRef.current.connected) {
            console.error('Cannot send file: peer not connected');
            setStatus('waiting');
            statusRef.current = 'waiting';
            return;
        }

        setStatus('sending');
        statusRef.current = 'sending';

        // Send metadata first
        const metadata = {
            type: 'metadata',
            name: file.name,
            size: file.size,
            mimeType: file.type
        };

        try {
            peerRef.current.send(JSON.stringify(metadata));
        } catch (err) {
            console.error('Error sending metadata:', err);
            setStatus('waiting');
            statusRef.current = 'waiting';
            return;
        }

        // Send file
        const chunkSize = 16 * 1024; // 16KB
        const reader = new FileReader();
        let offset = 0;

        reader.onload = (e) => {
            if (!peerRef.current || !peerRef.current.connected) {
                console.error('Peer connection lost during send');
                setStatus('waiting');
                statusRef.current = 'waiting';
                return;
            }

            try {
                peerRef.current.send(e.target.result);
                offset += e.target.result.byteLength;

                const percent = Math.min(100, Math.round((offset / file.size) * 100));
                setProgress(percent);

                if (offset < file.size) {
                    readNextChunk();
                } else {
                    // Send completion message
                    if (peerRef.current && peerRef.current.connected) {
                        peerRef.current.send(JSON.stringify({ type: 'complete' }));
                    }
                    setStatus('completed');
                    statusRef.current = 'completed';
                }
            } catch (err) {
                console.error('Error sending chunk:', err);
                setStatus('waiting');
                statusRef.current = 'waiting';
            }
        };

        reader.onerror = () => {
            console.error('FileReader error');
            setStatus('waiting');
            statusRef.current = 'waiting';
        };

        const readNextChunk = () => {
            const slice = file.slice(offset, offset + chunkSize);
            reader.readAsArrayBuffer(slice);
        };

        readNextChunk();
    };

    return (
        <div className="max-w-md mx-auto bg-gray-800 rounded-xl p-6 border border-gray-700 shadow-xl">
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-center">Send Files</h2>
                <div className={`w-3 h-3 rounded-full ${socketConnected ? 'bg-green-500' : 'bg-red-500'}`} title={socketConnected ? 'Server Connected' : 'Server Disconnected'} />
            </div>

            {!socketConnected && (
                <div className="mb-4 bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2 text-yellow-400">
                            <Loader className="w-4 h-4 animate-spin" />
                            <span className="font-medium">Server Not Connected</span>
                        </div>
                    </div>

                    <div className="mt-3 space-y-3">
                        <div className="bg-gray-900/50 rounded p-2">
                            <p className="text-xs text-gray-400 mb-1">
                                Current: <span className="text-gray-300 font-mono break-all">{getCurrentServerURL()}</span>
                            </p>
                            <p className="text-xs text-red-400 mt-1">
                                ⚠️ Cannot connect to server.
                            </p>
                        </div>
                        <div>
                            <p className="text-xs text-gray-400 mb-2">
                                Enter Server IP (from PC terminal):
                            </p>
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    placeholder="192.168.x.x:3001"
                                    onKeyPress={(e) => {
                                        if (e.key === 'Enter') {
                                            const val = e.target.value.trim();
                                            if (val) {
                                                let input = val;
                                                let protocol = 'http://';
                                                let host = input;

                                                if (input.startsWith('http://')) {
                                                    protocol = 'http://';
                                                    host = input.slice(7);
                                                } else if (input.startsWith('https://')) {
                                                    protocol = 'https://';
                                                    host = input.slice(8);
                                                }

                                                if (!host.includes(':')) {
                                                    host = `${host}:3001`;
                                                }

                                                const url = `${protocol}${host}`;
                                                setServerURL(url);
                                            }
                                        }
                                    }}
                                    className="flex-1 bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-yellow-500"
                                    id="server-url-input-sender"
                                />
                                <button
                                    onClick={() => {
                                        const inputEl = document.getElementById('server-url-input-sender');
                                        if (inputEl && inputEl.value.trim()) {
                                            let input = inputEl.value.trim();
                                            let protocol = 'http://';
                                            let host = input;

                                            if (input.startsWith('http://')) {
                                                protocol = 'http://';
                                                host = input.slice(7);
                                            } else if (input.startsWith('https://')) {
                                                protocol = 'https://';
                                                host = input.slice(8);
                                            }

                                            if (!host.includes(':')) {
                                                host = `${host}:3001`;
                                            }

                                            const url = `${protocol}${host}`;
                                            setServerURL(url);
                                        }
                                    }}
                                    className="bg-yellow-600 hover:bg-yellow-700 text-white px-4 py-2 rounded-lg text-sm transition-colors whitespace-nowrap"
                                >
                                    Connect
                                </button>
                            </div>
                            <div className="flex justify-end">
                                <button
                                    onClick={async () => {
                                        try {
                                            const inputEl = document.getElementById('server-url-input-sender');
                                            let input = inputEl ? inputEl.value.trim() : getCurrentServerURL();
                                            if (!input) input = getCurrentServerURL();

                                            let protocol = 'http://';
                                            let host = input;

                                            if (input.startsWith('http://')) {
                                                protocol = 'http://';
                                                host = input.slice(7);
                                            } else if (input.startsWith('https://')) {
                                                protocol = 'https://';
                                                host = input.slice(8);
                                            }

                                            if (!host.includes(':')) {
                                                host = `${host}:3001`;
                                            }

                                            const url = `${protocol}${host}`;

                                            console.log('Testing connection to:', url);
                                            const res = await fetch(`${url}/socket.io/socket.io.js`);
                                            if (res.ok) {
                                                alert(`Success! Connected to ${url}`);
                                            } else {
                                                alert(`Failed to connect to ${url} (Status: ${res.status})`);
                                            }
                                        } catch (e) {
                                            alert(`Error connecting: ${e.message}. Check IP and Firewall.`);
                                        }
                                    }}
                                    className="text-xs text-blue-400 hover:text-blue-300 underline mt-1"
                                >
                                    Test Connection
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {status === 'generating-id' && (
                <div className="text-center py-12">
                    <Loader className="w-12 h-12 text-blue-500 animate-spin mx-auto mb-4" />
                    <p className="text-lg">Generating Room ID...</p>
                </div>
            )}

            {status === 'waiting' && (
                <div className="text-center space-y-6">
                    <div className="bg-white p-4 rounded-xl inline-block">
                        <QRCodeSVG value={roomId} size={200} />
                    </div>

                    <div>
                        <p className="text-gray-400 mb-2">Room ID</p>
                        <div className="flex items-center justify-center gap-3">
                            <span className="text-4xl font-mono font-bold tracking-wider">{roomId}</span>
                            <button
                                onClick={copyToClipboard}
                                className="p-2 hover:bg-gray-700 rounded-lg transition-colors"
                            >
                                {copied ? <Check className="w-6 h-6 text-green-500" /> : <Copy className="w-6 h-6 text-gray-400" />}
                            </button>
                        </div>
                    </div>

                    <p className="text-gray-400 animate-pulse">
                        Scan QR code or enter ID on receiver device
                    </p>
                </div>
            )}

            {status === 'connecting' && (
                <div className="text-center py-12">
                    <Loader className="w-12 h-12 text-purple-500 animate-spin mx-auto mb-4" />
                    <p className="text-lg">Connecting to receiver...</p>
                    <button
                        onClick={() => {
                            setStatus('waiting');
                            statusRef.current = 'waiting';
                            if (peerRef.current) peerRef.current.destroy();
                        }}
                        className="mt-4 text-sm text-red-400 hover:text-red-300 underline"
                    >
                        Reset / Stuck?
                    </button>
                </div>
            )}

            {status === 'connected' && (
                <div className="space-y-6">
                    <div className="text-center py-8 bg-green-500/10 rounded-xl border border-green-500/20">
                        <Check className="w-12 h-12 text-green-500 mx-auto mb-2" />
                        <p className="text-lg font-medium text-green-400">Receiver Connected!</p>
                    </div>

                    <div className="border-2 border-dashed border-gray-600 rounded-xl p-8 text-center hover:border-blue-500 transition-colors cursor-pointer relative">
                        <input
                            type="file"
                            onChange={(e) => setFile(e.target.files[0])}
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                        />
                        <FileIcon className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                        <p className="text-lg mb-2">Click to select a file</p>
                        <p className="text-sm text-gray-400">Any file type supported</p>
                    </div>

                    {file && (
                        <div className="bg-gray-700 rounded-lg p-4 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <FileIcon className="w-8 h-8 text-blue-400" />
                                <div>
                                    <p className="font-medium truncate max-w-[200px]">{file.name}</p>
                                    <p className="text-sm text-gray-400">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                                </div>
                            </div>
                            <button
                                onClick={sendFile}
                                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors"
                            >
                                Send
                            </button>
                        </div>
                    )}
                </div>
            )}

            {status === 'sending' && (
                <div className="space-y-6 py-8">
                    <div className="text-center">
                        <Loader className="w-12 h-12 text-blue-500 animate-spin mx-auto mb-4" />
                        <p className="text-lg mb-2">Sending {file?.name}...</p>
                        <p className="text-gray-400">{progress}%</p>
                    </div>
                    <div className="w-full bg-gray-700 rounded-full h-2">
                        <div
                            className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                            style={{ width: `${progress}%` }}
                        />
                    </div>
                </div>
            )}

            {status === 'completed' && (
                <div className="text-center py-12">
                    <div className="w-16 h-16 bg-green-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
                        <Check className="w-8 h-8 text-green-500" />
                    </div>
                    <p className="text-2xl font-bold text-white mb-2">Sent Successfully!</p>
                    <p className="text-gray-400 mb-8">{file?.name}</p>

                    <button
                        onClick={() => {
                            setFile(null);
                            setStatus('connected');
                            statusRef.current = 'connected';
                            setProgress(0);
                        }}
                        className="bg-gray-700 hover:bg-gray-600 text-white px-8 py-3 rounded-lg transition-colors"
                    >
                        Send Another File
                    </button>
                </div>
            )}

            {/* Debug Logs Section */}
            <div className="mt-8 border-t border-gray-700 pt-4">
                <details>
                    <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-400">Debug Logs</summary>
                    <div className="mt-2 bg-black/50 rounded p-2 text-[10px] font-mono text-green-400 h-32 overflow-y-auto">
                        {debugLogs.length === 0 ? (
                            <div className="text-gray-600 italic">No logs yet...</div>
                        ) : (
                            debugLogs.map((log, i) => (
                                <div key={i}>{log}</div>
                            ))
                        )}
                    </div>
                </details>
            </div>
        </div>
    );
};

export default Sender;
