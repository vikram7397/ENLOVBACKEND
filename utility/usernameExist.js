const register = require("../models/register");

async function UserNameExist(req, res) {
    const { username } = req.body;
    console.log(req.body)

    const user = await register.findOne({ username });

    if (user) {
        return res.status(200).json({
            exists: true,
            message: "Username already exists",
        });
    } else {
        return res.status(200).json({
            exists: false,
            message: "Username is available",
        });
    }
}
module.exports = UserNameExist