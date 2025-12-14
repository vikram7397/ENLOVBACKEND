const mongoose = require("mongoose");
const RoomUserSchema = new mongoose.Schema({
  userId: Number,
  socketId: String,
  role: {
    type: String,
    enum: ["HOST", "COHOST", "VIEWER"],
    default: "VIEWER"
  },
  isConnected: {
    type: Boolean,
    default: true
  },
  joinedAt: {
    type: Date,
    default: Date.now
  },
  muted: {
    type: Boolean,
    default: false
  }
}, { _id: false });

const RoomSchema = new mongoose.Schema({
  roomId: String,
  hostId: Number,
  hostName:String,
  hostSocketId: String,
  StreamName:String,
  Interests:[String],
  isLive: Boolean,
  viewerCount: Number,
  RoomUsers: [RoomUserSchema],
  location:String,
  isPrivate:Boolean,
  password:String,
  likeCount: { type: Number, default: 0 },
  totalGiftValue: { type: Number, default: 0 },
  startTime: Date,
  endTime: Date
}, {
  collection: "streamlist", // ✅ Force collection name
  timestamps: true
});

module.exports = mongoose.model("Room", RoomSchema);
