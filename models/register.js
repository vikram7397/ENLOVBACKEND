const mongoose = require("mongoose");

const RegiterSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: true
    },
    userid: {
      type: Number,
      required: true,
    },
    screenname: {
      type: String,
      required: true,
    },
    gender:{
      type:String,
      required:true,
      enum: ["Male", "Female", "Other"]
    },
    password: {
      type: String,
      required: true
    },
    email: {
      type: String,
      required: true
    },
    interests: {
      type: [String],
      required: true
    },
    location: {
      type: Object,
      required: false,
    },
    dob: {
      type: Date
    }
  },
  {
    collection: "register", // ✅ Force collection name
    timestamps: true
  }
);

module.exports = mongoose.model("RegiterSchema", RegiterSchema);
