import pool from "../config/db.js";

export const getUserData = async (req, res) => {
        try {
            const userId = req.userId;

            const user = await pool.query(
                "SELECT id, name, is_account_verified FROM users WHERE id = $1",
                [userId]
            );

            if(user.rows.length === 0){
                return res.json({success: false, message: "User not Found"});
            }

            const userData = user.rows[0];
            res.json({
                success: true,
                userData: {
                    name: userData.name,
                    isAccountVerified: userData.is_account_verified
                }
            });
        } catch (error) {
            return res.json({success: false, message: error.message});
        }
}