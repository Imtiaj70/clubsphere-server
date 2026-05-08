const express = require("express");
const router = express.Router();
const { getCollections } = require("../config/db");
const { verifyToken } = require("../middleware/auth");

// POST /api/auth/register
// Called after Firebase creates the user — saves to MongoDB with role: member
router.post("/register", async (req, res) => {
  try {
    const { name, email, photoURL } = req.body;

    if (!name || !email) {
      return res.status(400).json({ message: "Name and email are required" });
    }

    const { users } = getCollections();

    // Avoid duplicates (Google login may fire this multiple times)
    const existing = await users.findOne({ email });
    if (existing) {
      return res.status(200).json({ message: "User already exists", user: existing });
    }

    const newUser = {
      name,
      email,
      photoURL: photoURL || "",
      role: "member", // default role
      createdAt: new Date(),
    };

    const result = await users.insertOne(newUser);
    res.status(201).json({ message: "User registered", insertedId: result.insertedId });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/auth/me
// Returns the current user's DB record (role, etc.)
router.get("/me", verifyToken, async (req, res) => {
  try {
    const { users } = getCollections();
    const user = await users.findOne({ email: req.user.email });

    if (!user) return res.status(404).json({ message: "User not found" });

    res.json(user);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
