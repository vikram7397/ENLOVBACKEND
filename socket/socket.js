const express = require('express');
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  pingInterval: 2000,
  pingTimeout: 2000,
  cors: { origin: '*', methods: ['GET', 'POST'], credentials: true },
});

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 5000;

const MAX_USERS = 6;
let roomUsers = {};
let StreamRequestList = {}
let StreamUser = {}
let ApprovedStreams = {};
let onlineUsers = new Map();
const RoomDetails = new Map();
let disconnectedUsers = {}; // Track temporarily disconnected users
let UserRoomID = {}
let RoomMessages = {}
let StreamingUserDetails = {};
let RoomTotalCount = {}
// Spin Wheel related variables

app.get('/', (_, res) => {
  res.send('🔗 WebRTC Signaling Server is live!');
});

io.on('connection', (socket) => {
  // identify the user with userid and name 
  socket.on('identity', (userId, name, avatar, gender) => {
    socket.Name = name;
    socket.CustomID = userId;
    onlineUsers.set(userId,
      {
        socketid: socket.id, Name: name, userid: userId, isOnline: true,
        avatar: avatar, Gender: gender, isHost: false, isCoHost: false, roomId: 0
      }
    );
    // Notify all users that a new user has connected
    onlineUsers.forEach((userdata) => {
      io.to(userdata?.socketid).emit('user-online', userId);
    });
    console.log(`✅ ${name} is online.`);
  });
  // Handle connection errors
  socket.on('connect_error', (err) => {
    console.error('❌ Connection failed:', err.message);
  });
  // Join a room as host or viewer
  socket.on('joinRoom', (IsHost, roomID, CustomID, Name, Address, avatar, gender) => {
    JoinRoom(socket, IsHost, roomID, CustomID, Name, Address, avatar, gender)
  });
  // send message to all users in the room
  socket.on('send-message', (message) => {
    try {
      if (!message) return;
      const roomID = UserRoomID[socket.id]
      if (!RoomMessages[roomID]) {
        RoomMessages[roomID] = []
      }
      RoomMessages[roomID].push(message)
      const roomId = roomUsers[roomID]
      if (roomId && roomUsers[roomID]) {
        const Roomusers = (roomUsers[roomID] || [])
        if (Roomusers) {
          Roomusers.forEach((user) => {
            io.to(user).emit('new-message', message);
          })
        }
      }
    } catch (error) {
      console.log(error);
    }
  });

  // Host controls: mute, unmute, stop stream
  socket.on('host-control', ({ targetId, action }) => {
    try {
      const roomID = UserRoomID[socket.id];
      const RoomDetailsInfo = RoomDetails.get(roomID)
      if (RoomDetailsInfo) {
        const UserInfo = RoomDetailsInfo.JoinedUsers.find(u => u.SocketId === targetId)
        const hostId = roomUsers[roomID]?.[0]; // first user is host
        // if action is stop-streaming then remove the user from StreamUser and notify to the all users
        if (action === 'stop-stream') {
          StreamUser[roomID] = (StreamUser[roomID] || []).filter(id => id !== targetId);
          if (UserInfo) {
            UpdateCoHost(roomID, UserInfo.UserId, "N");
            console.log(UserInfo);
          }
          // Remove the target user from   ApprovedStreams[roomID]
          if (ApprovedStreams[roomID]) {
            ApprovedStreams[roomID] = ApprovedStreams[roomID].filter(streamer => streamer.ID !== targetId);
          }
          if (StreamingUserDetails[roomID]) {
            StreamingUserDetails[roomID] = StreamingUserDetails[roomID].filter((streamer) => streamer.ID !== targetId)
          }
          // Notify the host about the updated approved streamers
          io.to(hostId).emit('approvedStreamers', ApprovedStreams[roomID]);
          // Notify all users and host in the room about the stopped stream 
          const Roomusers = (roomUsers[roomID] || [])
          if (Roomusers) {
            Roomusers.forEach((user) => {
              io.to(user).emit('User-streamStopped', targetId);
              io.to(user).emit('streamer-List', (StreamingUserDetails[roomID] || []))
            })
          }
          // Notify user to stop there stream
          io.to(targetId).emit('Stop-Stream', ApprovedStreams[roomID])
          RoomInfo(roomID);
        }
        // when action is mute or unmute then change the IsMuted property of the ApprovedStreams[roomID]
        if (action === 'mute' || action === 'unmute') {
          if (ApprovedStreams[roomID]) {
            const streamer = ApprovedStreams[roomID].find(streamer => streamer.ID === targetId);
            if (streamer) {
              streamer.IsMuted = (action === 'mute');
              io.to(hostId).emit('approvedStreamers', ApprovedStreams[roomID]);
            }
            let muteduser = (StreamingUserDetails[roomID] || []).find(streamer => streamer.ID === targetId);
            if (muteduser) {
              muteduser.isMuted = (action === 'mute')
              const Roomusers = (roomUsers[roomID] || [])
              if (Roomusers) {
                Roomusers.forEach((user) => {
                  io.to(user).emit('streamer-List', (StreamingUserDetails[roomID] || []))
                })
              }
            }
          }
        }
        io.to(targetId).emit('host-action', { action });
      }
    } catch (error) {
      console.log(error);
    }
  });

  // Host Stop the stream of the user and notify to all users in the room 
  socket.on('User-streamStopped', (targetId) => {
    try {
      const roomID = UserRoomID[socket.id];
      if (ApprovedStreams[roomID]) {
        const hostId = roomUsers[roomID]?.[0];
        ApprovedStreams[roomID] = ApprovedStreams[roomID].filter(streamer => streamer.ID !== targetId);
        io.to(hostId).emit('approvedStreamers', ApprovedStreams[roomID]);
      }
      const Roomusers = (roomUsers[roomID] || [])
      if (Roomusers) {
        Roomusers.forEach((user) => {
          io.to(user).emit('User-streamStopped', targetId);
        })
      }
    } catch (error) {
      console.log(error);
    }
  })

  // Relay WebRTC signaling data
  socket.on('signal', ({ to, data }) => {
    io.to(to).emit('signal', { from: socket.id, data });
  });

  // Stream request from a user to host
  socket.on('requestStream', ({ country, city, avatar, Gender }) => {
    try {
      const roomID = UserRoomID[socket.id]
      // if streamsuers is more than 6 then reject the request
      const hostId = roomUsers[roomID]?.[0]; // first user is host
      if (hostId && hostId !== socket.id) {
        if (!StreamRequestList[hostId]) {
          StreamRequestList[hostId] = [];
        }
        const existingRequest = StreamRequestList[hostId].find(req => req.CustomID === socket.CustomID);
        if (existingRequest) {
          socket.emit('requestAlreadyExists', 'You have already requested to stream.');
          return;
        }
        StreamRequestList[hostId].push({ roomID, CustomID: socket.CustomID, Name: socket.Name, ID: socket.id, country: country, city: city, avatar: avatar, Gender: Gender });
        const RoomDetailsInfo = RoomDetails.get(roomID)
        if (RoomDetailsInfo) {
          RoomDetailsInfo.StreamRequestList.push({ roomID, CustomID: socket.CustomID, Name: socket.Name, ID: socket.id, country: country, city: city, avatar: avatar, Gender: Gender })
        }
        // Notify the host all stream requests
        io.to(hostId).emit('streamRequest', StreamRequestList[hostId]);
      }
    } catch (error) {
      console.log(error);
    }
  });

  // when a user is ready to stream then notify to all users in the room
  socket.on('stream-negotiate', () => {
    try {
      const roomID = UserRoomID[socket.id];
      const otherUsers = (roomUsers[roomID] || []).filter((id) => id !== socket.id);
      otherUsers.forEach((userId) => {
        io.to(userId).emit('newUser', socket.id);
      });
    } catch (error) {
      console.log(error);
    }
  })
  // when a user resume the stream then notify to all users in the room
  socket.on('stream-Resume', () => {
    try {
      const roomID = UserRoomID[socket.id];
      const otherUsers = (roomUsers[roomID] || []).filter((id) => id !== socket.id);
      otherUsers.forEach((userId) => {
        io.to(userId).emit('stream-Resume', socket.id);
      });
    } catch (error) {
      console.log(error);
    }
  })

  // Host approves stream request
  socket.on('approveStream', (targetSocketId, address, name, CustomID, avatar) => {
    try {
      // stream started user add in StreamUser 
      const roomID = UserRoomID[socket.id]
      const hostId = roomUsers[roomID]?.[0]; // first user is host
      // if streamer count is 6 then avoid the action 
      if ((StreamingUserDetails[roomID] || []).length >= MAX_USERS) return
      StreamingUserDetails[roomID]?.push({ ID: targetSocketId, UserID: CustomID, Name: name, IsHost: false, isMuted: false, avatar: avatar })
      const RoomDetailsInfo = RoomDetails.get(roomID)
      if (RoomDetailsInfo) {
        const requestedList = RoomDetailsInfo.StreamRequestList.filter(req => req.ID !== targetSocketId);
        RoomDetailsInfo.ApprovedStreams.push({ ID: targetSocketId, UserID: CustomID, Name: name, IsHost: false, isMuted: false, avatar: avatar })
        RoomDetailsInfo.StreamRequestList = requestedList;
      }
      const Roomusers = (roomUsers[roomID] || [])
      if (Roomusers) {
        Roomusers.forEach((user) => {
          io.to(user).emit('streamer-List', (StreamingUserDetails[roomID] || []))
        })
      }
      if (!StreamUser[roomID]) {
        StreamUser[roomID] = [];
      }
      if (!StreamUser[roomID].includes(targetSocketId)) {
        StreamUser[roomID].push(targetSocketId);
      }
      io.to(targetSocketId).emit('streamApproved');
      ApprovedStreamers(roomID, targetSocketId, address, avatar);
      if (StreamRequestList[hostId]) {
        StreamRequestList[hostId] = StreamRequestList[hostId].filter(req => req.ID !== targetSocketId);
      }
      io.to(hostId).emit('streamRequest', StreamRequestList[hostId]);
      RoomInfo(roomID);
    } catch (error) {
      console.log(error);
    }
  });

  // Host rejects stream request from a user
  socket.on('rejectStream', (targetSocketId) => {
    try {
      const roomID = UserRoomID[socket.id]
      io.to(targetSocketId).emit('streamRejected', socket.Name);
      // Remove the rejected request from StreamRequestList
      const hostId = roomUsers[roomID]?.[0]; // first user is host
      if (StreamRequestList[hostId]) {
        StreamRequestList[hostId] = StreamRequestList[hostId].filter(req => req.ID !== targetSocketId);
      }
      // Notify the host about the updated request list
      io.to(hostId).emit('streamRequest', StreamRequestList[hostId], socket.id, socket.Name);
    } catch (error) {
      console.log(error);
    }
  });

  // when a user mute or unmute himself
  socket.on('IsMuted', (ismuted) => {
    try {
      const roomID = UserRoomID[socket.id]
      const hostId = roomUsers[roomID]?.[0]; // first user is host
      if (ApprovedStreams[roomID]) {
        const streamer = ApprovedStreams[roomID].find(streamer => streamer.ID === socket.id);
        if (streamer) {
          streamer.IsMuted = ismuted;
          io.to(hostId).emit('approvedStreamers', ApprovedStreams[roomID]);
        }
      }
      if (StreamingUserDetails[roomID]) {
        let muteduser = (StreamingUserDetails[roomID] || []).find(streamer => streamer.ID === socket.id);
        if (muteduser) {
          muteduser.isMuted = ismuted
          const Roomusers = (roomUsers[roomID] || [])
          if (Roomusers) {
            Roomusers.forEach((user) => {
              io.to(user).emit('streamer-List', (StreamingUserDetails[roomID] || []))
            })
          }
        }
      }
    } catch (error) {
      console.log(error);
    }
  })

  // Show like count to all users in the room
  socket.on('like-count', () => {
    try {
      const roomID = UserRoomID[socket.id];
      const RoomDetailsInfo = RoomDetails.get(roomID)
      UpdateLikeCount(roomID, "Like")
      if (RoomDetailsInfo) {
        RoomDetailsInfo.LikeCount += 1;
        RoomDetails.set(roomID, RoomDetailsInfo)
        const Roomusers = (roomUsers[roomID] || [])
        if (Roomusers) {
          Roomusers.forEach((user) => {
            io.to(user).emit('like-count', RoomDetailsInfo.LikeCount || 0)
          })
        }
      }
    } catch (error) {
      console.log(error);
    }
  })

  // Show dislike count to all users in the room
  socket.on('Dislike-count', () => {
    try {
      const roomID = UserRoomID[socket.id];
      const RoomDetailsInfo = RoomDetails.get(roomID)
      UpdateLikeCount(roomID, "Unlike")
      if (RoomDetailsInfo) {
        RoomDetailsInfo.LikeCount -= 1;
        const Roomusers = (roomUsers[roomID] || [])
        if (Roomusers) {
          Roomusers.forEach((user) => {
            io.to(user).emit('like-count', RoomDetailsInfo.LikeCount || 0)
          })
        }
      }
    } catch (error) {
      console.log(error);
    }
  })

  // when a user send a gift to the host or other users in the room
  socket.on('Send-gift', (username, isHost, receiverName, GiftID, giftValue) => {
    try {
      const roomID = UserRoomID[socket.id]
      const RoomDetailsInfo = RoomDetails.get(roomID)
      if (RoomDetailsInfo) {
        RoomDetailsInfo.TotalGiftValue += giftValue;
        RoomDetails.set(roomID, RoomDetailsInfo)
        const Roomusers = (roomUsers[roomID] || [])
        if (Roomusers) {
          Roomusers.forEach((user) => {
            io.to(user).emit('Total-GiftValue', RoomDetailsInfo.TotalGiftValue);
            io.to(user).emit('received-Gift', username, receiverName, GiftID)
          })
        }
      }
    } catch (error) {
      console.log(error);
    }
  })

  // Notify a user that someone sent them a friend request
  socket.on(`Sent-request`, (to, from) => {
    const user = onlineUsers.get(to)
    if (user) {
      const touser = onlineUsers.get(from)
      const message = `${touser.Name} Send A Friend Request.`
      io.to(user.socketid).emit('receive-request', message)
    }
  })

  // Handle client logs for debugging purpose
  socket.on("Clientlogs", (functionname, log) => {
    const targetSocket = io.sockets.sockets.get(socket.id);
    if (targetSocket?.Name) {
      console.log(`Error Come from username---> ${targetSocket.Name}, functionname is ---> ${functionname}, And Error Is ---> ${log}`);
    } else {
      console.log(`Error Come from socketID---> ${socket.id}, functionname is ---> ${functionname}, And Error Is ---> ${log}`);
    }
  })

  // Leave the room voluntarily
  socket.on('leaveRoom', () => {
    const roomID = UserRoomID[socket.id]
    leaveRoom(roomID, socket);
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    const roomID = UserRoomID[socket.id];
    for (let [userId, data] of onlineUsers) {
      if (data?.socketid === socket.id) {
        onlineUsers.delete(userId);
        console.log(`❌ ${data?.Name} went offline`);
        onlineUsers.forEach((userdata) => {
          io.to(userdata?.socketid).emit('user-offline', userId);
        })
        break;
      }

    }

    if (roomID) {
      handleDisconnect(roomID, socket);
    }
  });

  // Reconnect a user to the room after a temporary disconnection
  socket.on('reconnectUser', (CustomID, Name, roomID, isHost, avatar, gender) => {
    HandleReconnect(socket, CustomID, Name, roomID, isHost, avatar, gender)
  });

  // Leave from Spin Wheel
  socket.on('LeaveFromSpinWheel', (roomID, userID) => {
    LeaveUserInSpinWheel(roomID, userID)
  })

  // Check if a user is online or not
  socket.on('user-online', (userid) => {
    const Getuser = Array.from(onlineUsers.entries()).find(([key, value]) => value?.userid === userid);
    if (Getuser) {
      socket.emit('user-online', userid)
    }
  })

  // Typing indicator events handling
  socket.on('isTyping', (from, to) => {
    const Getuser = Array.from(onlineUsers.entries()).find(([key, value]) => value?.userid === from);
    if (Getuser) {
      io.to(Getuser[1].socketid).emit('isTyping', to);
    }
  })

  // when user stop typing then notify to the user
  socket.on('stopTyping', (from, to) => {
    const Getuser = Array.from(onlineUsers.entries()).find(([key, value]) => value?.userid === from);
    if (Getuser) {
      io.to(Getuser[1].socketid).emit('stopTyping', to);
    }
  })

  // Private messaging between users using 'send-msg' and 'receive-msg' events
  socket.on('send-msg', (message) => {
    const to = message.receiver_id;
    const from = message.sender_id;
    const touser = Array.from(onlineUsers.entries()).find(([key, value]) => value?.userid === to);
    const Getuser = Array.from(onlineUsers.entries()).find(([key, value]) => value?.userid === from);
    if (touser) {
      io.to(touser[1].socketid).emit('receive-msg', message);
      // if user is not online then change the status to delivered
      message.status = 'delivered';
    } else {
      //chng the status of the message to sent
      message.status = 'sent';
    }
    if (Getuser) {
      io.to(Getuser[1].socketid).emit('receive-msg', message);
    }
    if (message) {
      StoreMessage(message.sender_id, message.receiver_id, message.message, "text")
    }
  })

});

function JoinRoom(socket, IsHost, roomID, CustomID, Name, Address, avatar, gender) {
  try {
    socket.CustomID = CustomID;
    socket.avatar = avatar;
    socket.gender = gender;
    socket.Name = Name;
    UserRoomID[socket.id] = roomID
    // If the room does not exist, create it
    if (!roomUsers[roomID]) {
      roomUsers[roomID] = [];
    }
    const length = roomUsers[roomID].length;
    if (length === 0 && !IsHost) {
      socket.emit('StreamNotAvailable', 'Host is not available.');
      return;
    }
    const RoomDetailsInfo = RoomDetails.get(roomID)
    const User = { Name: Name, IsHost: IsHost, Address: Address, Avatar: avatar, Gender: gender, UserId: CustomID, SocketId: socket.id, JoinTime: new Date() }
    if (!RoomDetailsInfo) {
      RoomDetails.set(roomID, { JoinedUsers: [User], StreamingUsers: [], StartTime: IsHost ? new Date() : "", EndTime: "", StreamRequestList: [], ApprovedStreams: [], LikeCount: 0, TotalGiftValue: 0, RoomMessages: [], DisconnectedUsers: [], HostID: IsHost ? CustomID : "", HostSocketId: IsHost ? socket.id : "" })
    } else {
      RoomDetailsInfo.JoinedUsers.push(User)
      RoomDetails.set(roomID, RoomDetailsInfo)
    }
    if (IsHost) {
      console.log(`${Name} Create the Stream: ${roomID}, Socket id: ${socket.id}, UserID: ${CustomID}, Name: ${Name}`);
    } else {
      console.log(`🔗 ${Name} joined Stream: ${roomID}, Socket id: ${socket.id}, UserID: ${CustomID}, Name: ${Name}`);
    }
    if (!RoomTotalCount[roomID]) RoomTotalCount[roomID] = [];

    if (IsHost && length === 0) {
      const user = onlineUsers.get(CustomID)
      if (user) {
        user.isHost = true;
        user.roomId = roomID;
      }
      BroadcastToAll('new_stream');
      if (!StreamingUserDetails[roomID]) {
        StreamingUserDetails[roomID] = []
        StreamingUserDetails[roomID].push({ ID: socket.id, UserID: CustomID, Name: Name, IsHost: IsHost, isMuted: false, avatar: avatar, Gender: gender })
      }
    }
    const exists = RoomTotalCount[roomID].some(v => v.ViewerID === CustomID);
    if (!exists) {
      RoomTotalCount[roomID].push({ socketID: socket.id, ViewerName: Name, ViewerID: CustomID, country: Address?.country, city: Address?.city, avatar: avatar, Gender: gender });
    }
    roomUsers[roomID] = roomUsers[roomID] || [];

    socket.join(roomID);
    if (!roomUsers[roomID].includes(socket.id)) {
      roomUsers[roomID].push(socket.id);
    }
    const otherUsers = roomUsers[roomID].filter((id) => id !== socket.id);
    if (!RoomMessages[roomID]) RoomMessages[roomID] = []

    socket.emit('joined', { users: otherUsers, IsHost: IsHost, ChatMessages: RoomMessages[roomID], roomID: roomID });
    const Roomusers = (roomUsers[roomID] || [])
    if (Roomusers) {
      Roomusers.forEach((user) => {
        io.to(user).emit('streamer-List', (StreamingUserDetails[roomID] || []))
      })
    }
    // Notify others about new user
    otherUsers.forEach((userId) => {
      io.to(userId).emit('newUser', socket.id);
      io.to(userId).emit('reconnectWithNewPeer', socket.id);
    });

    const userData = { Name: Name, socketID: socket.id, customid: CustomID, avatar: avatar, Gender: gender }
    otherUsers.forEach((userid) => {
      io.to(userid).emit('newuser-joined', userData)
    })
    if (!IsHost) {
      HandleJoinRoomuser(roomID, CustomID, "N", "Y", Address)
      const UsersCount = RoomDetailsInfo.JoinedUsers?.length;
      if (UsersCount >= 1) {
        UpdateViewerCount(roomID, UsersCount - 1)
      } else {
        UpdateViewerCount(roomID, UsersCount)
      }
    } else {
      HandleJoinRoomuser(roomID, CustomID, "Y", "Y", Address)
    }
    if (Roomusers) {
      Roomusers.forEach((user) => {
        io.to(user).emit('Total-GiftValue', RoomDetailsInfo?.TotalGiftValue || 0);
      })
    }
    RoomInfo(roomID);
  } catch (error) {
    console.log(error);
  }
}
function ReJoinRoom(socket, IsHost, roomID, CustomID, Name, avatar, gender) {
  socket.CustomID = CustomID;
  socket.Name = Name;
  socket.avatar = avatar;
  socket.gender = gender;
  UserRoomID[socket.id] = roomID
  // If the room does not exist, create it
  if (!roomUsers[roomID]) {
    roomUsers[roomID] = [];
  }
  if (!roomUsers[roomID].includes(socket.id)) {
    roomUsers[roomID].push(socket.id);
  }
  const otherUsers = roomUsers[roomID].filter((id) => id !== socket.id);
  socket.emit('joined', { users: otherUsers, IsHost: IsHost, IsReconnect: true });
  console.log(`🔗 User rejoined room: ${roomID}, IsHost: ${IsHost}, User ID: ${socket.id}, CustomID: ${CustomID}, Name: ${Name}`);
  // if reconnected user is host then  start the stream 
  if (IsHost) {
    socket.emit('streamApproved');
    if (ApprovedStreams[roomID]) {
      socket.emit('approvedStreamers', ApprovedStreams[roomID]);
    }
    if (StreamRequestList[socket.id]) {
      socket.emit('streamRequest', StreamRequestList[socket.id]);
    }
    const Roomusers = (roomUsers[roomID] || [])
    if (Roomusers) {
      Roomusers.forEach((user) => {
        io.to(user).emit('streamer-List', (StreamingUserDetails[roomID] || []))
      })
    }
  }
  setTimeout(() => {
    // Notify others about new user
    otherUsers.forEach((userId) => {
      io.to(userId).emit('newUser', socket.id);
    });
  }, 2000);
  const RoomDetailsInfo = RoomDetails.get(roomID)
  const Roomusers = (roomUsers[roomID] || [])
  if (Roomusers) {
    Roomusers.forEach((user) => {
      io.to(user).emit('Total-GiftValue', RoomDetailsInfo.TotalGiftValue);
    })
  }
  RoomInfo(roomID);
}
function BroadcastToAll(eventType) {
  onlineUsers.forEach((data) => {
    io.to(data?.socketid).emit(eventType);
  });
}

function ApprovedStreamers(roomID, targetSocketId, address, avatar) {
  // using the targetSocketId get the socket information
  const targetSocket = io.sockets.sockets.get(targetSocketId);
  if (!targetSocket) {
    console.error(`Socket with ID ${targetSocketId} not found.`);
    return;
  }
  // add the approved stream user to ApprovedStreams
  if (!ApprovedStreams[roomID]) {
    ApprovedStreams[roomID] = [];
  }
  // store the name, id, and customid 
  ApprovedStreams[roomID].push({ ID: targetSocketId, CustomID: targetSocket.CustomID, Name: targetSocket.Name, IsMuted: false, country: address.country, city: address.city, avatar: avatar });
  // get the host ID from roomUsers
  const hostId = roomUsers[roomID]?.[0]; // first user is host
  // send the approved stream user to the host
  io.to(hostId).emit('approvedStreamers', ApprovedStreams[roomID]);
  const userinfo = (RoomTotalCount[roomID] || [])?.find(viewer => viewer.socketID === targetSocketId)
  if (userinfo) {
    UpdateCoHost(roomID, userinfo.ViewerID, "Y");
  }
}

function leaveRoom(roomID, socket) {
  try {
    socket.leave(roomID);
    const hostId = roomUsers[roomID]?.[0]; // first user is host
    if (hostId && hostId === socket.id) {
      const RoomDetailsInfo = RoomDetails.get(roomID)
      if (RoomDetailsInfo) {
        RoomDetailsInfo.EndTime = new Date()
        RoomDetailsInfo.StreamRequestList = []
        RoomDetailsInfo.ApprovedStreams = []
        RoomDetailsInfo.StreamingUsers = []
        RoomDetails.set(roomID, RoomDetailsInfo)
      }
      console.log(`${roomID} Stream Closed.`);
      BroadcastToAll('Close_stream');
      const otherUsers = roomUsers[roomID].filter((id) => id !== socket.id);
      const AllRoomUsers = RoomTotalCount[roomID] || [];
      AllRoomUsers.forEach((user) => {
        UpdateCoHost(roomID, user.ViewerID, "N");
        HandleLeftRoom(roomID, user.ViewerID, "N");
      });
      otherUsers.forEach((userId) => {
        io.to(userId).emit('Hostleft', socket.id);
      });
      delete roomUsers[roomID];
      delete StreamRequestList[hostId];
      delete RoomTotalCount[roomID]
      delete ApprovedStreams[roomID]
      delete RoomMessages[roomID]
      delete StreamUser[roomID];
      delete UserRoomID[socket.id]
      RoomInfo(roomID);
      return;
    }
    const RoomDetailsInfo = RoomDetails.get(roomID)
    if (RoomDetailsInfo) {
      RoomDetailsInfo.JoinedUsers = RoomDetailsInfo.JoinedUsers.filter(u => u.SocketId !== socket.id)
      RoomDetailsInfo.StreamRequestList = RoomDetailsInfo.StreamRequestList.filter(u => u.ID !== socket.id)
      RoomDetailsInfo.ApprovedStreams = RoomDetailsInfo.ApprovedStreams.filter(u => u.ID !== socket.id)
      RoomDetailsInfo.StreamingUsers = RoomDetailsInfo.StreamingUsers.filter(u => u.ID !== socket.id)
    }
    const UsersCount = RoomDetailsInfo.JoinedUsers?.length;
    if (UsersCount >= 1) {
      UpdateViewerCount(roomID, UsersCount - 1)
    } else {
      UpdateViewerCount(roomID, UsersCount)
    }
    delete UserRoomID[socket.id]
    const targetSocket = io.sockets.sockets.get(socket.id);
    let userInfo = { ID: socket.id, customid: targetSocket.CustomID, Name: targetSocket.Name, avatar: targetSocket.avatar, Gender: targetSocket.gender }
    // Remove user from roomUsers and StreamUser
    roomUsers[roomID] = (roomUsers[roomID] || []).filter((id) => id !== socket.id);
    StreamUser[roomID] = (StreamUser[roomID] || []).filter((id) => id !== socket.id);
    // remove stream request if exists
    if (StreamRequestList[hostId]) {
      StreamRequestList[hostId] = StreamRequestList[hostId].filter(req => req.roomID !== roomID || req.CustomID !== socket.CustomID);
      // Notify the host about the updated request list
      io.to(hostId).emit('streamRequest', StreamRequestList[hostId]);
    }
    if (ApprovedStreams[roomID]) {
      ApprovedStreams[roomID] = ApprovedStreams[roomID].filter(streamer => streamer.ID !== socket.id);
      // Notify the host about the updated approved streamers
      io.to(hostId).emit('approvedStreamers', ApprovedStreams[roomID]);
    }
    if (StreamingUserDetails[roomID]) {
      StreamingUserDetails[roomID] = StreamingUserDetails[roomID].filter((streamer) => streamer.ID !== socket.id)
    }
    const Roomusers = (roomUsers[roomID] || [])
    if (Roomusers) {
      Roomusers.forEach((user) => {
        io.to(user).emit('streamer-List', (StreamingUserDetails[roomID] || []))
      })
    }
    socket.to(roomID).emit('userLeft', socket.id, userInfo);
    const userinfo = (RoomTotalCount[roomID] || [])?.find(viewer => viewer.socketID === socket.id)
    if (userinfo) {
      UpdateCoHost(roomID, userinfo.ViewerID, "N");
      HandleLeftRoom(roomID, userinfo.ViewerID, "N");
    }
    RoomInfo(roomID);
  } catch (error) {
    console.log(error);
  }
}
function RoomInfo(roomID) {
  try {
    const RoomDetailsInfo = RoomDetails.get(roomID)
    let Totalcount = (RoomTotalCount[roomID] || []).length >= 1 ? (RoomTotalCount[roomID] || []).length - 1 : 0;
    const roomInfo = {
      roomID, users: roomUsers[roomID] || [],
      viewerCount: (roomUsers[roomID] || []).length - 1,
      HostID: roomUsers[roomID]?.[0] || null,
      StreamingUser: StreamUser[roomID] || [],
      LikeCount: RoomDetailsInfo?.LikeCount || 0,
      TotalViewerCount: Totalcount
    };
    const Roomusers = (roomUsers[roomID] || [])
    if (Roomusers) {
      Roomusers.forEach((user) => {
        io.to(user).emit('roomInfo', roomInfo);
      })
    }
  } catch (error) {
    console.log(error);
  }
}

function handleDisconnect(roomID, socket) {
  try {
    const hostId = roomUsers[roomID]?.[0];
    const Roomusers = (roomUsers[roomID] || [])
    if (Roomusers) {
      Roomusers.forEach((user) => {
        io.to(user).emit('Host-Disconnected', socket.id)
      })
    }

    console.log('disconnected user - ', {
      roomID,
      CustomID: socket.CustomID,
      Name: socket.Name,
      isHost: hostId === socket.id
    });
    if (hostId !== socket.id) {
      ApprovedStreams[roomID] = (ApprovedStreams[roomID] || []).filter(streamer => streamer.ID !== socket.id);
      StreamRequestList[hostId] = (StreamRequestList[hostId] || []).filter(streamer => streamer.ID !== socket.id);
      io.to(hostId).emit('approvedStreamers', ApprovedStreams[roomID]);
      io.to(hostId).emit('streamRequest', StreamRequestList[hostId], socket.id, socket.Name);
      if (StreamingUserDetails[roomID]) {
        StreamingUserDetails[roomID] = StreamingUserDetails[roomID].filter((streamer) => streamer.ID !== socket.id)
      }
      const Roomusers = (roomUsers[roomID] || [])
      if (Roomusers) {
        Roomusers.forEach((user) => {
          io.to(user).emit('streamer-List', (StreamingUserDetails[roomID] || []))
        })
      }
    }
    const RoomDetailsInfo = RoomDetails.get(roomID)
    if (RoomDetailsInfo) {
      RoomDetailsInfo.StreamRequestList = RoomDetailsInfo.StreamRequestList.filter(u => u.ID !== socket.id)
      RoomDetailsInfo.ApprovedStreams = RoomDetailsInfo.ApprovedStreams.filter(u => u.ID !== socket.id)
      RoomDetailsInfo.DisconnectedUsers.push({ UserId: socket.CustomID, Name: socket.Name, ID: socket.id, DisconnectedTime: new Date() })
    }
    disconnectedUsers[socket.id] = {
      roomID,
      CustomID: socket.CustomID,
      Name: socket.Name,
      isHost: hostId === socket.id,
      timeout: setTimeout(() => {
        delete disconnectedUsers[socket.id];

        if (hostId === socket.id) {
          const RoomDetailsInfo = RoomDetails.get(roomID)
          if (RoomDetailsInfo) {
            RoomDetailsInfo.EndTime = new Date()
            RoomDetailsInfo.StreamRequestList = []
            RoomDetailsInfo.ApprovedStreams = []
            RoomDetailsInfo.StreamingUsers = []
            RoomDetails.set(roomID, RoomDetailsInfo)
          }
          const AllRoomUsers = RoomTotalCount[roomID] || [];
          AllRoomUsers.forEach((user) => {
            UpdateCoHost(roomID, user.ViewerID, "N");
            HandleLeftRoom(roomID, user.ViewerID, "N");
          });
          ChangeLiveStatus(roomID)
          BroadcastToAll('Close_stream');
          const Roomusers = (roomUsers[roomID] || [])
          if (Roomusers) {
            Roomusers.forEach((user) => {
              io.to(user).emit('Hostleft', socket.id);
            })
          }

          delete roomUsers[roomID];
          delete StreamRequestList[hostId];
          delete StreamUser[roomID];
          delete ApprovedStreams[roomID];
          delete UserRoomID[socket.id]
          delete RoomMessages[roomID]
          delete RoomTotalCount[roomID]
        } else {
          const RoomDetailsInfo = RoomDetails.get(roomID)
          if (RoomDetailsInfo) {
            RoomDetailsInfo.JoinedUsers = RoomDetailsInfo.JoinedUsers.filter(u => u.SocketId !== socket.id)
            RoomDetailsInfo.StreamRequestList = RoomDetailsInfo.StreamRequestList.filter(u => u.ID !== socket.id)
            RoomDetailsInfo.ApprovedStreams = RoomDetailsInfo.ApprovedStreams.filter(u => u.ID !== socket.id)
            RoomDetailsInfo.StreamingUsers = RoomDetailsInfo.StreamingUsers.filter(u => u.ID !== socket.id)
          }
          const UsersCount = RoomDetailsInfo.JoinedUsers?.length;
          if (UsersCount >= 1) {
            UpdateViewerCount(roomID, UsersCount - 1)
          } else {
            UpdateViewerCount(roomID, UsersCount)
          }
          const userInfo = (RoomTotalCount[roomID] || []).find(v => v.socketID === socket.id);
          const userData = { ID: socket.id, customid: userInfo?.ViewerID, Name: userInfo?.ViewerName, avatar: userInfo?.avatar }
          roomUsers[roomID] = (roomUsers[roomID] || []).filter(id => id !== socket.id);
          StreamUser[roomID] = (StreamUser[roomID] || []).filter(id => id !== socket.id);
          const Roomusers = (roomUsers[roomID] || [])
          if (Roomusers) {
            Roomusers.forEach((user) => {
              io.to(user).emit('userLeft', socket.id, userData);
            })
          }
          const userinfo = (RoomTotalCount[roomID] || [])?.find(viewer => viewer.socketID === socket.id)
          if (userinfo) {
            UpdateCoHost(roomID, userinfo.ViewerID, "N");
            HandleLeftRoom(roomID, userinfo.ViewerID, "N");
          }
          RoomInfo(roomID);
        }
      }, 30000)
    };
  } catch (error) {
    console.log(error);
  }
}

function HandleReconnect(socket, CustomID, Name, roomID, isHost, avatar, gender) {
  try {
    console.log(`User ${Name} is reconnected`);

    UserRoomID[socket.id] = roomID
    const entry = Object.entries(disconnectedUsers).find(([_, user]) => user.CustomID === CustomID && user.roomID === roomID);
    if (entry) {
      const [oldSocketId, data] = entry;
      clearTimeout(data.timeout);
      delete disconnectedUsers[oldSocketId];

      if (isHost) {
        if (!roomUsers[roomID]) {
          roomUsers[roomID] = []
        }
        roomUsers[roomID][0] = socket.id;
        if (StreamRequestList[oldSocketId]) {
          StreamRequestList[socket.id] = StreamRequestList[oldSocketId]
          delete StreamRequestList[oldSocketId]
        }
        if (StreamingUserDetails[roomID]) {
          StreamingUserDetails[roomID] = StreamingUserDetails[roomID].filter((streamer) => streamer.ID !== oldSocketId)
          StreamingUserDetails[roomID].push({ ID: socket.id, UserID: CustomID, Name: Name, IsHost: isHost, isMuted: false, avatar: avatar, Gender: gender })
        }
      }
      //rejoin the same room
      roomUsers[roomID] = (roomUsers[roomID] || []).filter(id => id !== oldSocketId);
      ReJoinRoom(socket, isHost, roomID, CustomID, Name, avatar, gender)
      RoomInfo(roomID);
    }
  } catch (error) {
    console.log(error);
  }
}
async function ChangeLiveStatus(roomId) {
  try {
    const response = await fetch(`https://api.streamalong.live/rooms/updaterooms?roomID=${roomId}&isLive=0`,
      {
        headers: {
          'x-api-key': '6cca5d4e-719b-4c28-aabd-4aeb2618ee1d'
        }
      });
    const data = await response.json();
    if (data.status === 200) {
      return;
    }

  } catch (error) {
    console.log(error);
  }
}

async function HandleJoinRoomuser(roomId, userid, isCoHost, isConnected, Address) {
  try {
    if (!roomId && !userid) return console.log(`Room ID or User ID is missing for Join Room User`);
    let params = {
      user_id: userid,
      isCoHost: isCoHost,
      isConnected: isConnected,
      location: `${Address?.city || ''}, ${Address?.country || ''}`,
    }
    const response = await fetch(`https://api.streamalong.live/rooms/${roomId}/join`,
      {
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': '6cca5d4e-719b-4c28-aabd-4aeb2618ee1d'
        },
        method: 'POST',
        body: JSON.stringify(params)
      });
    if (response.ok) {
      return
    }

  } catch (error) {
    console.error('Error loading room users:', error);
  }
}
async function UpdateViewerCount(roomId, count) {
  try {
    if (!roomId && !userid) return console.log(`Room ID or User ID is missing for Join Room User`);

    const response = await fetch(`https://api.streamalong.live/rooms/updaterooms?roomID=${roomId}&viewerCount=${count}`,
      {
        headers: {
          'x-api-key': '6cca5d4e-719b-4c28-aabd-4aeb2618ee1d'
        }
      });
    const data = await response.json();
    if (data.status === 200) {
      return;
    }

  } catch (error) {
    console.error('Error loading room users:', error);
  }
}
async function HandleLeftRoom(roomId, userid, isConnected) {
  try {
    if (!roomId && !userid) return console.log(`Room ID or User ID is missing for Left Room User`);
    let params = {
      user_id: userid,
      isConnected: isConnected
    }
    const response = await fetch(`https://api.streamalong.live/rooms/${roomId}/connectionStatus`,
      {
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': '6cca5d4e-719b-4c28-aabd-4aeb2618ee1d'
        },
        method: 'POST',
        body: JSON.stringify(params)
      });
    if (response.ok) {
      return;
    }

  } catch (error) {
    console.error('Error loading room users:', error);
  }

}
async function UpdateCoHost(roomId, userid, isCoHost) {
  try {
    if (!roomId && !userid) return console.log(`Room ID or User ID is missing for Update Co-Host`);
    let params = {
      roomId: roomId,
      userId: userid,
      isCoHost: isCoHost
    }
    const user = onlineUsers.get(userid)
    if (user) {
      user.isCoHost = isCoHost === "Y" ? true : false
    }
    const response = await fetch(`https://api.streamalong.live/rooms/updateTocoHost`, {
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': '6cca5d4e-719b-4c28-aabd-4aeb2618ee1d'
      },
      method: 'POST',
      body: JSON.stringify(params)
    });
    if (response.ok) {
      return;
    }
  } catch (error) {
    console.error('Error in UpdateCoHost:', error);
  }

}
async function UpdateLikeCount(roomId, Type) {
  let params = {
    roomID: roomId,
    Type: Type
  }
  const response = await fetch(`https://api.streamalong.live/rooms/getLikesCounter`,
    {
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': '6cca5d4e-719b-4c28-aabd-4aeb2618ee1d'
      },
      method: 'POST',
      body: JSON.stringify(params)
    });
  if (response.ok) {
    return;
  }
}
async function StoreMessage(senderId, receiverId, Message, messageType) {
  try {
    const params = {
      sender_id: senderId,
      receiver_id: receiverId,
      message: Message,
      message_type: messageType
    }
    const response = await fetch(`https://api.streamalong.live/chatlogs`,
      {
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': '6cca5d4e-719b-4c28-aabd-4aeb2618ee1d'
        },
        method: 'POST',
        body: JSON.stringify(params)
      });
    const data = await response.json();
    if (data.status === 200) {
      return;
    }

  } catch (error) {
    console.log(error);
  }
}
server.listen(PORT, () => console.log(`✅ Signaling server running on port ${PORT}`));