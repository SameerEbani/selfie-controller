const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const QRCode = require('qrcode');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: (origin, callback) => {
      callback(null, origin); // ✅ Use dynamic origin (secure it further if needed)
    },
  },
});

app.use(express.static(path.join(__dirname, 'public')));

app.get("/soc/:id", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "mobile.html"));
});

app.get("/generate", async (req, res) => {
  const { text } = req.query;
  try {
    const qr = await QRCode.toDataURL(text || "http://localhost:3000");
    res.type("image/png");
    res.send(Buffer.from(qr.split(",")[1], "base64"));
  } catch (err) {
    console.error("QR generation error:", err);
    res.status(500).send("Error generating QR code");
  }
});

const pairings = {};
const hosts = {};

io.on("connection", (socket) => {
  console.log("🟢 Client connected:", socket.id);

  socket.on("registerAsHost", () => {
    console.log(`🖥️  Desktop ${socket.id} registered as host`);
    hosts[socket.id] = true;
    socket.emit("socket_id", socket.id);
  });

  socket.on("register", (desktopId) => {
    console.log(`📱 Mobile ${socket.id} registered to desktop ${desktopId}`);
    pairings[socket.id] = desktopId;
    io.to(desktopId).emit("mobileConnected", { mobileId: socket.id });
    socket.emit("paired", { desktopId });
  });

  socket.on("selfieTaken", (dataUrl) => {
    const desktopId = pairings[socket.id];
    if (desktopId) {
      console.log(`📷 Forwarding selfie from ${socket.id} to ${desktopId}`);
      io.to(desktopId).emit("selfieTaken", dataUrl);
    }
  });

  socket.on("disconnect", () => {
    console.log("🔴 Disconnected:", socket.id);

    if (hosts[socket.id]) {
      delete hosts[socket.id];
      const mobileId = Object.keys(pairings).find(key => pairings[key] === socket.id);
      if (mobileId) {
        io.to(mobileId).emit("hostDisconnected");
        delete pairings[mobileId];
      }
    } else if (pairings[socket.id]) {
      const desktopId = pairings[socket.id];
      delete pairings[socket.id];
      io.to(desktopId).emit("mobileDisconnected");
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});