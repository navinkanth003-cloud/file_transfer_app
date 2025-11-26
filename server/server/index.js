const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');


const app = express();
app.use(cors());

app.get('/', (req, res) => {
  res.send('File Transfer Signaling Server is Running');
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('join-room', (roomId) => {
    socket.join(roomId);
    console.log(`User ${socket.id} joined room ${roomId}`);

    // Get all sockets in the room
    const room = io.sockets.adapter.rooms.get(roomId);
    if (room) {
      const socketsInRoom = Array.from(room);
      console.log(`Room ${roomId} has ${socketsInRoom.length} users`);

      // If there are other users in the room, notify them
      if (socketsInRoom.length > 1) {
        // Notify the first user (sender) that a new user (receiver) joined
        socketsInRoom.forEach(socketId => {
          if (socketId !== socket.id) {
            io.to(socketId).emit('user-connected', socket.id);
          }
        });
      }
    }
  });

  // Relay WebRTC signals
  socket.on('signal', (payload) => {
    console.log(`Relaying signal from ${payload.callerID} to room ${payload.target}`);
    const room = io.sockets.adapter.rooms.get(payload.target);
    if (room) {
      // Send to all sockets in the room except the sender
      room.forEach(socketId => {
        if (socketId !== payload.callerID) {
          io.to(socketId).emit('signal', {
            signal: payload.signal,
            callerID: payload.callerID
          });
          console.log(`  -> Sent to ${socketId}`);
        }
      });
    } else {
      console.log(`  -> Room ${payload.target} not found or empty`);
    }
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

const PORT = process.env.PORT || 3001;
const os = require('os');

function getLocalIPs() {
  const interfaces = os.networkInterfaces();
  const ips = [];
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      // Skip internal (loopback) and non-IPv4 addresses
      if (iface.family === 'IPv4' && !iface.internal) {
        ips.push({ name, address: iface.address });
      }
    }
  }
  return ips;
}

server.listen(PORT, '0.0.0.0', () => {
  const localIPs = getLocalIPs();
  console.log(`\n========================================`);
  console.log(`Signaling server running on port ${PORT}`);
  console.log(`Local: http://localhost:${PORT}`);
  console.log(`Available Network Interfaces:`);
  localIPs.forEach(({ name, address }) => {
    console.log(`  - ${name}: http://${address}:${PORT}`);
  });
  console.log(`========================================\n`);
  if (localIPs.length > 0) {
    console.log(`To connect from mobile, try the addresses listed above.`);
    console.log(`Note: Ensure your firewall allows access to port ${PORT}.`);
  }
});
