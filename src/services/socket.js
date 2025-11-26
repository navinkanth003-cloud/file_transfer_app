import io from 'socket.io-client';

// Server URL configuration
// Priority: localStorage > environment variable > auto-detect
const SERVER_PORT = 3001;

function getServerURL() {
    // Check localStorage first (for user configuration)
    const storedURL = localStorage.getItem('fileTransferServerURL');
    if (storedURL) {
        return storedURL;
    }

    // Check environment variable
    if (import.meta.env.VITE_SERVER_URL) {
        return import.meta.env.VITE_SERVER_URL;
    }

    // Auto-detect: if on localhost, use localhost; otherwise try current hostname
    const hostname = window.location.hostname;
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
        return `http://localhost:${SERVER_PORT}`;
    }

    // For cross-device: try current hostname (might need manual config)
    return `http://${hostname}:${SERVER_PORT}`;
}

let currentServerURL = getServerURL();
const hostname = window.location.hostname;
const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';
const hasConfiguredURL = localStorage.getItem('fileTransferServerURL');

// Always auto-connect for debugging
const shouldAutoConnect = true;

// Create socket instance
let socketInstance = io(currentServerURL, {
    autoConnect: shouldAutoConnect,
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionAttempts: 10,
    reconnectionDelayMax: 5000,
    timeout: 20000,
    transports: ['websocket', 'polling']
});

console.log('Initial socket connection to:', currentServerURL, 'autoConnect:', shouldAutoConnect);

socketInstance.on('connect', () => {
    console.log('Global socket connected:', socketInstance.id);
});

socketInstance.on('connect_error', (err) => {
    console.error('Global socket connect_error details:', {
        message: err.message,
        type: err.type,
        description: err.description,
        context: err
    });
});

// Export function to get current server URL
export function getCurrentServerURL() {
    return currentServerURL;
}

// Export function to update server URL
export function setServerURL(url) {
    if (url) {
        localStorage.setItem('fileTransferServerURL', url);
        currentServerURL = url;
    } else {
        localStorage.removeItem('fileTransferServerURL');
        currentServerURL = getServerURL();
    }

    // Disconnect old socket
    if (socketInstance) {
        socketInstance.removeAllListeners();
        socketInstance.disconnect();
    }

    // Create new socket with new URL
    console.log('Recreating socket connection to:', currentServerURL);
    socketInstance = io(currentServerURL, {
        autoConnect: true,
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionAttempts: 10,
        reconnectionDelayMax: 5000,
        timeout: 20000,
        transports: ['websocket', 'polling']
    });

    // Reload page to ensure all components use new socket
    window.location.reload();
}

// Export the socket instance
export const socket = socketInstance;
