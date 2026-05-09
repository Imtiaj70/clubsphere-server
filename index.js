require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { connectDB, getCollections } = require("./config/db");

const authRoutes = require("./routes/auth");
const clubRoutes = require("./routes/clubs");
const eventRoutes = require("./routes/events");
const membershipRoutes = require("./routes/memberships");
const registrationRoutes = require("./routes/registrations");
const adminRoutes = require("./routes/admin");

const app = express();
const PORT = process.env.PORT || 5000;

app.use(
  cors({
    origin: [
      process.env.CLIENT_URL,
      "http://localhost:5173",
      "http://localhost:5000",
      "https://clubsp.netlify.app/"
    ],
    credentials: true,
  })
);
app.use(express.json());

app.use("/api/auth", authRoutes);
app.use("/api/clubs", clubRoutes);
app.use("/api/events", eventRoutes);
app.use("/api/memberships", membershipRoutes);
app.use("/api/registrations", registrationRoutes);
app.use("/api/admin", adminRoutes);

app.get("/", (req, res) => {
  res.json({ message: "ClubSphere API is running" });
});

// ── Connection test ────────────────────────────────────────────────────────
app.get("/test-connection", async (req, res) => {
  try {
    const { users } = getCollections();
    const count = await users.countDocuments();
    res.json({
      status: "✅ MongoDB connected",
      database: "clubsphereDB",
      usersCollection: `${count} documents found`,
    });
  } catch (err) {
    res.status(500).json({ status: "❌ MongoDB error", error: err.message });
  }
});

// ── Admin বানানোর route — কাজ শেষে মুছে ফেলবে ────────────────────────────
// app.get("/make-admin/:email", async (req, res) => {
//   try {
//     const { users } = getCollections();
//     const result = await users.updateOne(
//       { email: req.params.email },
//       { $set: { role: "admin" } }
//     );
//     if (result.matchedCount === 0) {
//       return res.json({ status: "❌ User not found", tip: "আগে register করো" });
//     }
//     res.json({ status: "✅ Done", message: `${req.params.email} is now admin` });
//   } catch (err) {
//     res.status(500).json({ error: err.message });
//   }
// });

app.use((req, res) => {
  res.status(404).json({ message: "Route not found" });
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: "Internal server error" });
});

connectDB()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`ClubSphere server running on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error("Failed to connect to MongoDB:", err);
    process.exit(1);
  });


module.exports = app;