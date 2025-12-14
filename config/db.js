const mongoose = require("mongoose");
require("dotenv").config();
const connectDB = async () => {
  try {
    await mongoose.connect('mongodb+srv://vikram7397:Vi%407397@enlov.0tyhiql.mongodb.net/enlov?retryWrites=true&w=majority');
    console.log("✅ Database connected: enlov");
  } catch (error) {
    console.error("❌ DB connection failed:", error);
    process.exit(1);
  }
};

module.exports = connectDB;
