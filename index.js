const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");

const connectDB = require("./config/db");
const LoginUser = require("./utility/login");
const RegisterUser = require("./utility/register");
const UserNameExist = require("./utility/usernameExist");
const Streams = require("./utility/Stream");
const CreateStream = require("./utility/CreateStream");
const Room = require("./models/Room");
const streamList = require("./utility/streamList");

const app = express();
const PORT = 3000;
require("dotenv").config();
/* ================= MIDDLEWARE ================= */
app.use(cors());
app.use(express.json());

/* ================= STATIC DATA ================= */
const interests = [
  "Music", "Sports", "Gaming", "Travel", "Food", "Art", "Fitness",
  "Movies", "Tech", "Books", "Fashion", "Photography", "Dance",
  "Cooking", "Reading", "AI"
];

/* ================= HTTP SERVER ================= */
const server = http.createServer(app);

/* ================= SOCKET.IO ================= */
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

/* ================= DB CONNECTION ================= */
connectDB();

/* ================= SOCKET HANDLER ================= */
require("./socket/socket1")(io);

/* ================= ROUTES ================= */
app.get("/", (_, res) => {
  res.send("🚀 Server running successfully");
});

app.post("/register", async (req, res) => {
  try {
    await RegisterUser(req, res);
  } catch (err) {
    console.error(err);
    res.status(500).json({
      message: "Error saving user",
      error: err.message
    });
  }
});

app.post("/login", async (req, res) => {
  try {
    await LoginUser(req, res);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/register/checkUsername", async (req, res) => {
  try {
    await UserNameExist(req, res);
  } catch (err) {
    res.status(500).json({
      message: "Error checking username",
      error: err.message
    });
  }
});

app.get("/GetinterestList", (_, res) => {
  res.status(200).json({
    success: true,
    data: interests
  });
});

app.get("/StreamsCount", async (req, res) => {
  try {
    Streams(req, res)
  } catch (error) {
    console.log(error)
  }
})
app.post('/CreateStream', (req, res) => {
  try {
    CreateStream(req, res)
  } catch (error) {
    console.log(error)
  }
})

app.get("/StreamList", async (req, res) => {
  streamList(req, res)
});


/* ================= SERVER START ================= */
server.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
});
