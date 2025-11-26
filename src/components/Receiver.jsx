import React, { useState, useEffect, useRef } from 'react';
import { Html5QrcodeScanner } from 'html5-qrcode';
import SimplePeer from 'simple-peer';
import { socket, setServerURL, getCurrentServerURL } from '../services/socket';
import { getIceServers } from '../config/iceServers';
import { Loader, Download, Check, AlertCircle, File as FileIcon, Settings } from 'lucide-react';
import { Buffer } from 'buffer';

const Receiver = () => {
    const [roomId, setRoomId] = useState('');
    const [debugLogs, setDebugLogs] = useState([]);
    const [status, setStatus] = useState('idle'); // idle, scanning, connecting, connected, receiving, completed
    const [progress, setProgress] = useState(0);
    const [receivedFile, setReceivedFile] = useState(null);
    const [error, setError] = useState('');
    const [socketConnected, setSocketConnected] = useState(false);
    const [showServerConfig, setShowServerConfig] = useState(false);
    const [serverURL, setServerURLInput] = useState(() => {
        return localStorage.getItem('fileTransferServerURL') || '';
    });

    const peerRef = useRef();
    const socketRef = useRef(socket);
    const chunksRef = useRef([]);
    const metadataRef = useRef(null);
    const receivedSizeRef = useRef(0);

    const addLog = (msg) => {
        console.log(msg);
        setDebugLogs(prev => [...prev.slice(-19), `${new Date().toLocaleTimeString()} - ${msg}`]);
    };

    // Expose addLog to window for global error handling
    useEffect(() => {
        window.addLog = addLog;
        return () => {
            delete window.addLog;
        };
    }, []);

    // Update socket ref when socket URL changes (socket instance is updated in place)
    useEffect(() => {
        // Re-check connection state periodically in case socket was recreated
        const checkConnection = setInterval(() => {
            console.log('Receiver check:', {
                id: socketRef.current?.id,
                connected: socketRef.current?.connected,
                state: socketConnected
            });
            if (socketRef.current && socketRef.current.connected !== socketConnected) {
                setSocketConnected(socketRef.current.connected);
            }
        }, 1000);

        return () => clearInterval(checkConnection);
    }, [socketConnected]);

    useEffect(() => {
        // Diagnostic Logging
        addLog(`User Agent: ${navigator.userAgent}`);
        addLog(`Environment Check:`);
        addLog(`- Buffer: ${typeof window.Buffer !== 'undefined'}`);
        addLog(`- Process: ${typeof window.process !== 'undefined'}`);
        addLog(`- Global: ${typeof window.global !== 'undefined'}`);

        // Check Stream Polyfill explicitly
        try {
            // We can't easily import 'stream' dynamically here without build support, 
            // but we can check if simple-peer's dependencies are likely to work.
            addLog(`- SimplePeer supported: ${SimplePeer.WEBRTC_SUPPORT}`);
        } catch (e) {
            addLog(`- SimplePeer check error: ${e.message}`);
        }

        // Check initial connection state
        setSocketConnected(socketRef.current.connected);

        // Check Buffer support
        addLog(`Buffer supported: ${typeof Buffer !== 'undefined'}`);

        socketRef.current.on('connect', () => {
            console.log("Socket connected");
            setSocketConnected(true);
        });
        socketRef.current.on('disconnect', () => {
            console.log("Socket disconnected");
            setSocketConnected(false);
        });
        socketRef.current.on('connect_error', (error) => {
            console.error("Socket connection error:", error);
            setSocketConnected(false);
            setError('Failed to connect to server. Configure server URL below.');
            setShowServerConfig(true); // Auto-show config on error
        });

        return () => {
            socketRef.current.off('signal');
            socketRef.current.off('connect');
            socketRef.current.off('disconnect');
            socketRef.current.off('connect_error');
            if (peerRef.current) peerRef.current.destroy();
        };
    }, []);

    const joinRoom = (id) => {
        if (!id) return;

        addLog(`Joining room: ${id}`);
        addLog(`My Socket ID: ${socketRef.current.id}`);

        // Wait for socket connection if not connected
        if (!socketRef.current.connected) {
            setError('Not connected to server. Please wait for connection...');
            const checkConnection = setInterval(() => {
                if (socketRef.current.connected) {
                    clearInterval(checkConnection);
                    joinRoom(id);
                }
            }, 500);
            setTimeout(() => {
                clearInterval(checkConnection);
                if (!socketRef.current.connected) {
                    setError('Failed to connect. Check server.');
                }
            }, 10000);
            return;
        }

        // Clean up previous listeners and peers
        socketRef.current.off('signal');
        if (peerRef.current) {
            console.log('Destroying existing peer connection');
            peerRef.current.destroy();
            peerRef.current = null;
        }

        setStatus('connecting');
        setError('');
        setRoomId(id);

        addLog('Creating peer (receiver)');
        const peer = new SimplePeer({
            initiator: false,
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

        peerRef.current = peer;

        // Set up fresh signal listener BEFORE joining
        socketRef.current.on('signal', (data) => {
            addLog(`Received signal: ${data.signal ? data.signal.type : 'candidate/other'} from ${data.callerID}`);

            // Ignore own signals (prevent echo)
            if (data.callerID === socketRef.current.id) {
                addLog('Ignoring own signal');
                return;
            }

            if (peerRef.current) {
                addLog('Signaling peer...');
                peerRef.current.signal(data.signal);
            } else {
                addLog('WARN: No peer to signal!');
            }
        });

        let connectionTimeout;

        peer.on('signal', (data) => {
            addLog(`Signal generated: ${data.type}`);
            if (socketRef.current && socketRef.current.connected) {
                socketRef.current.emit('signal', {
                    target: id,
                    signal: data,
                    callerID: socketRef.current.id
                });
            }
        });

        // Join room AFTER setting up listeners
        addLog('Emitting join-room...');
        socketRef.current.emit('join-room', id);

        // Add timeout for connection
        connectionTimeout = setTimeout(() => {
            if (peer && !peer.connected) {
                addLog('Peer connection timeout');
                setError('Connection timeout. Please try again.');
                peer.destroy();
                setStatus('idle');
            }
        }, 60000); // 60 second timeout

        peer.on('connect', () => {
            addLog('Peer connected!');
            clearTimeout(connectionTimeout);
            setStatus('connected');
            setError('');
            // Send a keep-alive message to force the sender to recognize the connection
            try {
                peer.send('HELLO');
                // Fallback: Send HELLO periodically until we get data or user action
                const helloInterval = setInterval(() => {
                    if (peer && peer.connected) {
                        try {
                            console.log('Sending Keep-Alive HELLO');
                            peer.send('HELLO');
                        } catch (e) {
                            clearInterval(helloInterval);
                        }
                    } else {
                        clearInterval(helloInterval);
                    }
                }, 2000);

                // Clear interval after 10 seconds
                setTimeout(() => clearInterval(helloInterval), 10000);
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
            clearTimeout(connectionTimeout);
            setError('Connection error: ' + err.message);
            setStatus('idle');
        });

        peer.on('close', () => {
            console.log('Peer connection closed');
            clearTimeout(connectionTimeout);
            // Only reset if we're not in completed state
            setStatus((currentStatus) => {
                if (currentStatus !== 'completed' && currentStatus !== 'receiving') {
                    setError('Connection closed');
                    return 'idle';
                }
                return currentStatus;
            });
        });
    };

    const handleData = (data) => {
        // Check if data is metadata (JSON string)
        try {
            const text = new TextDecoder().decode(data);
            if (text.startsWith('{')) {
                const msg = JSON.parse(text);
                if (msg.type === 'metadata') {
                    metadataRef.current = msg;
                    chunksRef.current = [];
                    receivedSizeRef.current = 0;
                    setStatus('receiving');
                    return;
                } else if (msg.type === 'complete') {
                    finalizeFile();
                    return;
                }
            }
        } catch (e) {
            // Not text, likely chunk
        }

        // It's a file chunk
        chunksRef.current.push(data);
        receivedSizeRef.current += data.byteLength;

        if (metadataRef.current) {
            const percent = Math.min(100, Math.round((receivedSizeRef.current / metadataRef.current.size) * 100));
            setProgress(percent);
        }
    };

    const finalizeFile = () => {
        const blob = new Blob(chunksRef.current, { type: metadataRef.current.mimeType });
        setReceivedFile({
            name: metadataRef.current.name,
            size: metadataRef.current.size,
            url: URL.createObjectURL(blob)
        });
        setStatus('completed');
    };

    const startScanning = () => {
        setStatus('scanning');
    };

    useEffect(() => {
        if (status === 'scanning') {
            const scanner = new Html5QrcodeScanner(
                "reader",
                { fps: 10, qrbox: { width: 250, height: 250 } },
            /* verbose= */ false
            );

            scanner.render((decodedText) => {
                setRoomId(decodedText);
                scanner.clear();
                joinRoom(decodedText);
            }, (error) => {
                // console.warn(error);
            });

            return () => {
                scanner.clear().catch(err => console.error(err));
            };
        }
    }, [status]);

    return (
        <div className="max-w-md mx-auto bg-gray-800 rounded-xl p-6 border border-gray-700 shadow-xl">
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-center">Receive Files</h2>
                <div className={`w-3 h-3 rounded-full ${socketConnected ? 'bg-green-500' : 'bg-red-500'}`} title={socketConnected ? 'Server Connected' : 'Server Disconnected'} />
            </div>

            {error && (
                <div className="mb-4 bg-red-500/10 border border-red-500/20 rounded-lg p-3 flex items-center gap-2 text-red-400 text-sm">
                    <AlertCircle className="w-4 h-4" />
                    <span>{error}</span>
                    <button onClick={() => setError('')} className="ml-auto text-red-400 hover:text-red-300">×</button>
                </div>
            )}

            {!socketConnected && (
                <div className="mb-4 bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2 text-yellow-400">
                            <AlertCircle className="w-4 h-4" />
                            <span className="font-medium">Server Not Connected</span>
                        </div>
                    </div>

                    <div className="mt-3 space-y-3">
                        <div className="bg-gray-900/50 rounded p-2">
                            <p className="text-xs text-gray-400 mb-1">
                                Current: <span className="text-gray-300 font-mono break-all">{getCurrentServerURL()}</span>
                            </p>
                            <p className="text-xs text-red-400 mt-1">
                                ⚠️ Cannot connect to this server. Check if server is running and IP is correct.
                            </p>
                            <ul className="text-xs text-gray-400 space-y-1 list-disc list-inside">
                                <li>Make sure both devices are on the same WiFi network</li>
                                <li>Ensure the server is running: <code className="bg-gray-800 px-1 rounded">cd server && npm start</code></li>
                            </ul>
                        </div>
                        <div>
                            <p className="text-xs text-gray-400 mb-2">
                                Enter the server IP address from the device running the server:
                            </p>
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    placeholder="192.168.1.100 or 192.168.1.100:3001"
                                    value={serverURL}
                                    onChange={(e) => setServerURLInput(e.target.value)}
                                    onKeyPress={(e) => {
                                        if (e.key === 'Enter') {
                                            if (serverURL.trim()) {
                                                let input = serverURL.trim();
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
                                            } else {
                                                setServerURL(null);
                                            }
                                        }
                                    }}
                                    className="flex-1 bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-yellow-500"
                                />
                                <button
                                    onClick={() => {
                                        if (serverURL.trim()) {
                                            let input = serverURL.trim();
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
                                        } else {
                                            setServerURL(null); // Reset to default
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
                                            let input = serverURL.trim() || getCurrentServerURL();
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
                        <div className="bg-blue-500/10 border border-blue-500/20 rounded p-2">
                            <p className="text-xs font-medium text-blue-400 mb-1">How to find server IP:</p>
                            <ul className="text-xs text-gray-400 space-y-1 list-disc list-inside">
                                <li>On the device running the server, check the terminal/console</li>
                                <li>Windows: Open CMD, type <code className="bg-gray-800 px-1 rounded">ipconfig</code> - look for "IPv4 Address"</li>
                                <li>Mac/Linux: Open Terminal, type <code className="bg-gray-800 px-1 rounded">ifconfig</code> or <code className="bg-gray-800 px-1 rounded">ip addr</code></li>
                            </ul>
                        </div>
                    </div>
                </div>
            )}

            {status === 'idle' && (
                <div className="space-y-6">
                    <div className="flex gap-2">
                        <input
                            type="text"
                            placeholder="Enter Room ID"
                            value={roomId}
                            onChange={(e) => setRoomId(e.target.value.toUpperCase())}
                            className="flex-1 bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500"
                        />
                        <button
                            onClick={() => joinRoom(roomId)}
                            disabled={!roomId || !socketConnected}
                            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-6 py-2 rounded-lg transition-colors"
                        >
                            Join
                        </button>
                    </div>

                    <div className="relative">
                        <div className="absolute inset-0 flex items-center">
                            <div className="w-full border-t border-gray-700"></div>
                        </div>
                        <div className="relative flex justify-center text-sm">
                            <span className="px-2 bg-gray-800 text-gray-400">Or scan QR code</span>
                        </div>
                    </div>

                    <button
                        onClick={startScanning}
                        className="w-full border border-gray-600 hover:bg-gray-700 text-white font-bold py-3 rounded-lg transition-colors"
                    >
                        Scan QR Code
                    </button>
                </div>
            )}

            {status === 'scanning' && (
                <div className="space-y-4">
                    <div id="reader" className="overflow-hidden rounded-lg"></div>
                    <button
                        onClick={() => setStatus('idle')}
                        className="w-full text-gray-400 hover:text-white"
                    >
                        Cancel
                    </button>
                </div>
            )}

            {status === 'connecting' && (
                <div className="text-center py-12">
                    <Loader className="w-12 h-12 text-purple-500 animate-spin mx-auto mb-4" />
                    <p className="text-lg">Connecting to sender...</p>
                </div>
            )}

            {status === 'connected' && (
                <div className="text-center py-12">
                    <div className="w-16 h-16 bg-green-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
                        <Check className="w-8 h-8 text-green-500" />
                    </div>
                    <p className="text-lg text-green-400">Connected!</p>
                    <p className="text-gray-400 mt-2">Waiting for file...</p>
                </div>
            )}

            {status === 'receiving' && (
                <div className="space-y-4 py-8">
                    <p className="text-center text-lg mb-2">Receiving {metadataRef.current?.name}</p>
                    <div className="w-full bg-gray-700 rounded-full h-2">
                        <div
                            className="bg-purple-500 h-2 rounded-full transition-all duration-300"
                            style={{ width: `${progress}%` }}
                        />
                    </div>
                    <p className="text-center text-gray-400">{progress}%</p>
                </div>
            )}

            {status === 'completed' && receivedFile && (
                <div className="text-center space-y-6 py-6">
                    <div className="bg-gray-700/50 rounded-xl p-6">
                        <FileIcon className="w-12 h-12 text-purple-400 mx-auto mb-2" />
                        <p className="font-medium truncate">{receivedFile.name}</p>
                        <p className="text-sm text-gray-400">{(receivedFile.size / 1024 / 1024).toFixed(2)} MB</p>
                    </div>

                    <a
                        href={receivedFile.url}
                        download={receivedFile.name}
                        className="block w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 rounded-lg transition-colors flex items-center justify-center gap-2"
                    >
                        <Download className="w-5 h-5" />
                        Download File
                    </a>

                    <button
                        onClick={() => {
                            setStatus('connected');
                            setReceivedFile(null);
                            setProgress(0);
                        }}
                        className="text-gray-400 hover:text-white text-sm"
                    >
                        Receive another file
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
        </div >
    );
};

export default Receiver;
