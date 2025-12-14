const mongoose = require("mongoose");

const RoomUserSchema = new mongoose.Schema({
  roomId: String,
  userId: Number,
  socketId: String,
  role: { type: String, enum: ["HOST", "VIEWER", "COHOST"] },
  isMuted: { type: Boolean, default: false },
  isConnected: Boolean,
  joinedAt: Date
});

module.exports = mongoose.model("RoomUser", RoomUserSchema);
