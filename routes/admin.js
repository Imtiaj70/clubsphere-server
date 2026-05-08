const express = require("express");
const router = express.Router();
const { getCollections } = require("../config/db");
const { ObjectId } = require("mongodb");
const { verifyToken, verifyAdmin } = require("../middleware/auth");

// All admin routes require verifyToken + verifyAdmin
router.use(verifyToken, verifyAdmin);

// ── GET /api/admin/stats ────────────────────────────────────────────────────
// Dashboard summary cards
router.get("/stats", async (req, res) => {
  try {
    const { users, clubs, memberships, events, payments } = getCollections();

    const [
      totalUsers,
      totalClubs,
      pendingClubs,
      approvedClubs,
      rejectedClubs,
      totalMemberships,
      totalEvents,
      paymentsData,
    ] = await Promise.all([
      users.countDocuments(),
      clubs.countDocuments(),
      clubs.countDocuments({ status: "pending" }),
      clubs.countDocuments({ status: "approved" }),
      clubs.countDocuments({ status: "rejected" }),
      memberships.countDocuments({ status: "active" }),
      events.countDocuments(),
      payments.aggregate([{ $group: { _id: null, total: { $sum: "$amount" } } }]).toArray(),
    ]);

    const totalRevenue = paymentsData[0]?.total || 0;

    res.json({
      totalUsers,
      totalClubs,
      pendingClubs,
      approvedClubs,
      rejectedClubs,
      totalMemberships,
      totalEvents,
      totalRevenue,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── GET /api/admin/chart-data ───────────────────────────────────────────────
// Memberships per club (for bar/pie chart)
router.get("/chart-data", async (req, res) => {
  try {
    const { memberships, clubs } = getCollections();

    const data = await memberships
      .aggregate([
        { $match: { status: "active" } },
        {
          $group: {
            _id: "$clubId",
            count: { $sum: 1 },
          },
        },
        { $sort: { count: -1 } },
        { $limit: 8 },
      ])
      .toArray();

    const enriched = await Promise.all(
      data.map(async (item) => {
        try {
          const club = await clubs.findOne({
            _id:
              typeof item._id === "string"
                ? new ObjectId(item._id)
                : item._id,
          });

          return {
            clubName:
              club?.clubName ||
              club?.name ||
              "Unknown Club",

            members: item.count || 0,
          };
        } catch (err) {
          return {
            clubName: "Unknown Club",
            members: item.count || 0,
          };
        }
      })
    );

    res.json(enriched);
  } catch (err) {
    console.log("Chart Data Error:", err);

    res.status(500).json({
      message: err.message,
    });
  }
});

// ── GET /api/admin/users ────────────────────────────────────────────────────
// All users table
router.get("/users", async (req, res) => {
  try {
    const { users } = getCollections();
    const allUsers = await users.find({}).sort({ createdAt: -1 }).toArray();
    res.json(allUsers);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── PATCH /api/admin/users/:id/role ────────────────────────────────────────
// Change a user's role (admin cannot change their own role)
router.patch("/users/:id/role", async (req, res) => {
  try {
    const { users } = getCollections();
    const { role } = req.body;

    if (!["admin", "clubManager", "member"].includes(role)) {
      return res.status(400).json({ message: "Invalid role" });
    }

    const targetUser = await users.findOne({ _id: new ObjectId(req.params.id) });
    if (!targetUser) return res.status(404).json({ message: "User not found" });

    // Prevent admin from changing their own role
    if (targetUser.email === req.user.email) {
      return res.status(403).json({ message: "Cannot change your own role" });
    }

    await users.updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: { role, updatedAt: new Date() } }
    );

    res.json({ message: `User role changed to ${role}` });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── GET /api/admin/payments ─────────────────────────────────────────────────
// All payments table
router.get("/payments", async (req, res) => {
  try {
    const { payments, clubs } = getCollections();
    const allPayments = await payments.find({}).sort({ createdAt: -1 }).toArray();

    // Attach club name
    const enriched = await Promise.all(
      allPayments.map(async (p) => {
        let clubName = null;
        if (p.clubId) {
          const club = await clubs.findOne({ _id: new ObjectId(p.clubId) });
          clubName = club?.clubName;
        }
        return { ...p, clubName };
      })
    );

    res.json(enriched);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
