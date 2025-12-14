const Room = require("../models/Room");

async function streamList(req, res) {
 try {
    const { isLive } = req.query;

    const filter = {};
    if (isLive !== undefined) {
      filter.isLive = isLive === "true"; // convert string → boolean
    }

    const streams = await Room.find(filter)
      .sort({ createdAt: -1 }) // latest first
      .select("-password")     // hide password
      .lean();

    res.status(200).json({
      success: true,
      count: streams.length,
      data: streams
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch stream list"
    });
  }
}

module.exports = streamList;
