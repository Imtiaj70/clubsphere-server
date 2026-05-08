const admin = require("../config/firebase");
const { getCollections } = require("../config/db");

// ── Step 1: Verify Firebase ID token sent from client ──────────────────────
// Client must send: Authorization: Bearer <firebaseIdToken>
const verifyToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Unauthorized: no token" });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = await admin.auth().verifyIdToken(token);
    req.user = decoded; // contains uid, email, etc.
    next();
  } catch (err) {
    return res.status(401).json({ message: "Unauthorized: invalid token" });
  }
};

// ── Step 2: Check role from MongoDB (after verifyToken) ────────────────────
const verifyAdmin = async (req, res, next) => {
  const email = req.user?.email;
  if (!email) return res.status(401).json({ message: "Unauthorized" });

  const { users } = getCollections();
  const user = await users.findOne({ email });

  if (user?.role !== "admin") {
    return res.status(403).json({ message: "Forbidden: admins only" });
  }
  next();
};

const verifyManager = async (req, res, next) => {
  const email = req.user?.email;
  if (!email) return res.status(401).json({ message: "Unauthorized" });

  const { users } = getCollections();
  const user = await users.findOne({ email });

  if (user?.role !== "clubManager" && user?.role !== "admin") {
    return res.status(403).json({ message: "Forbidden: managers only" });
  }
  next();
};

module.exports = { verifyToken, verifyAdmin, verifyManager };
