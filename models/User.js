const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema({
  userid: Number,
  username: String,
  avatar: String,
  gender: String
});

module.exports = mongoose.model("User", UserSchema);
