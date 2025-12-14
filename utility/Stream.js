const Room = require("../models/Room");

async function Streams(req, res) {
 const StreamsCount= await Room.countDocuments();
 
  res.json({StreamCount:StreamsCount+1})
}

module.exports = Streams;
