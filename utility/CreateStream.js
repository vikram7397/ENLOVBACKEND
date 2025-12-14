const Room = require("../models/Room");

async function CreateStream(req, res) {
    const { roomId, hostId,hostName, hostSocketId, StreamName, Interests, isLive, viewerCount, location, isPrivate, password } = req.body;

    const Stream = new Room({roomId, hostId,hostName, hostSocketId, StreamName, Interests, isLive, viewerCount, location, isPrivate, password});
    await Stream.save();

    res.status(200).json({
        message: "Stream Create successful ✅",
        roomId: roomId
    });
}

module.exports = CreateStream;
