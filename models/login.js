const mongoose = require("mongoose");

const loginSchema = new mongoose.Schema(
  {
    // userName: {
    //   type: String,
    //   required: true
    // },
    email:{
      type:String,
      required:true
    },
    password: {
      type: String,
      required: true
    }
  },
  {
    collection: "register" // ✅ Force collection name
  }
);

module.exports = mongoose.model("loginData", loginSchema);
