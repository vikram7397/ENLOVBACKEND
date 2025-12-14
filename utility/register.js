const register = require("../models/register");
const bcrypt = require("bcrypt");

async function RegisterUser(req, res) {
  const { username, password, gender, email, interest, screenname, location, dob } = req.body;

  const isUserExist = await register.findOne({
    $or: [{ username }, { email }]
  });

  if (isUserExist) {
    return res.status(409).json({ message: "Username or Email already exists" });
  }

  const totalUsers = await register.countDocuments();
  const userid = 1000 + totalUsers + 1;

  const hashedPassword = await bcrypt.hash(password, 10);

  const user = new register({
    username,
    userid,
    gender,
    email,
    password: hashedPassword,
    interests: interest,
    screenname,
    dob,
    location
  });

  await user.save();

  res.status(201).json({
    message: "Registration successful ✅",
    userId: userid
  });
}

module.exports = RegisterUser;
