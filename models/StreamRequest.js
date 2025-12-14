const mongoose = require("mongoose");

const StreamRequestSchema = new mongoose.Schema({
  roomId: String,
  userId: Number,
  socketId: String,
  status: { type: String, enum: ["PENDING", "APPROVED", "REJECTED"] }
});

module.exports = mongoose.model("StreamRequest", StreamRequestSchema);
