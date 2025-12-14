const register = require("../models/register");
const bcrypt = require("bcrypt");
const { generateToken } = require("./jwt");

async function LoginUser(req, res) {
  const { email, password } = req.body;

  const user = await register.findOne({ email });
  if (!user) {
    return res.status(401).json({ message: "Invalid credentials ❌" });
  }

  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) {
    return res.status(401).json({ message: "Invalid credentials ❌" });
  }

  const token = generateToken({
    userId: user.userid,
    username: user.username
  });

  res.json({
    message: "Login successful ✅",
    token,
    user: {
      userId: user.userid,
      username: user.username,
      Interest: user.interests,
      screenname: user.screenname,
      location: user.location,
      dob: user.dob
    }
  });
}

module.exports = LoginUser;
