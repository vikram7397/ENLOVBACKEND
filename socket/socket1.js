const Room = require("../models/Room");
const RoomUser = require("../models/RoomUser");
const StreamRequest = require("../models/StreamRequest");
const Message = require("../models/Message");

module.exports = (io) => {

  io.on("connection", (socket) => {
console.log(`user is Connnected ---> ${socket.id}`)
    socket.on('identity',(data)=>{
      socket.user = {userId: data.userId,name: data.name};
    console.log("✅ User identity set:", socket.user);
    })
    // 🔹 Join Room
    socket.on("joinRoom", async ({ roomId, userId, isHost }) => {

      let room = await Room.findOne({ roomId });

      if (!room && !isHost) {
        return socket.emit("StreamNotAvailable");
      }


      socket.join(roomId);

      const users = await RoomUser.find({ roomId, isConnected: true });
      io.to(roomId).emit("roomUsers", users);
    });

    // 🔹 Request Stream
    socket.on("requestStream", async ({ roomId, userId }) => {
      await StreamRequest.create({
        roomId,
        userId,
        socketId: socket.id,
        status: "PENDING"
      });

      const host = await RoomUser.findOne({ roomId, role: "HOST" });
      io.to(host.socketId).emit("streamRequest");
    });

    // 🔹 Approve Stream
    socket.on("approveStream", async ({ roomId, userId }) => {
      await StreamRequest.updateOne(
        { roomId, userId },
        { status: "APPROVED" }
      );

      await RoomUser.updateOne(
        { roomId, userId },
        { role: "COHOST" }
      );

      io.to(roomId).emit("streamApproved", userId);
    });

    // 🔹 Send Message
    socket.on("send-message", async ({ roomId, senderId, message }) => {
      const msg = await Message.create({ roomId, senderId, message });
      io.to(roomId).emit("new-message", msg);
    });

    // 🔹 Disconnect
    socket.on("disconnect", async () => {
      await RoomUser.updateOne(
        { socketId: socket.id },
        { isConnected: false }
      );
    });

  });
};
