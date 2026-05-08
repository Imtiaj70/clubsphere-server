const express = require("express");
const router = express.Router();
const { getCollections } = require("../config/db");
const { ObjectId } = require("mongodb");
const { verifyToken, verifyAdmin, verifyManager } = require("../middleware/auth");

// ── GET /api/clubs ──────────────────────────────────────────────────────────
router.get("/", async (req, res) => {
  try {
    const { clubs } = getCollections();
    const { search, category, sort } = req.query;
    const query = { status: "approved" };
    if (search) query.clubName = { $regex: search, $options: "i" };
    if (category) query.category = category;
    let sortOption = { createdAt: -1 };
    if (sort === "oldest") sortOption = { createdAt: 1 };
    if (sort === "fee_high") sortOption = { membershipFee: -1 };
    if (sort === "fee_low") sortOption = { membershipFee: 1 };
    const result = await clubs.find(query).sort(sortOption).toArray();
    res.json(result);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── GET /api/clubs/featured ─────────────────────────────────────────────────
router.get("/featured", async (req, res) => {
  try {
    const { clubs } = getCollections();
    const result = await clubs
      .find({ status: "approved" })
      .sort({ createdAt: -1 })
      .limit(6)
      .toArray();
    res.json(result);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── GET /api/clubs/categories ───────────────────────────────────────────────
// IMPORTANT: এই route /:id এর আগে থাকতে হবে
router.get("/categories", async (req, res) => {
  try {
    const { clubs } = getCollections();
    const categories = await clubs.distinct("category", { status: "approved" });
    res.json(categories || []);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── GET /api/clubs/admin/all ────────────────────────────────────────────────
router.get("/admin/all", verifyToken, verifyAdmin, async (req, res) => {
  try {
    const { clubs, memberships, events } = getCollections();
    const allClubs = await clubs.find({}).sort({ createdAt: -1 }).toArray();
    const enriched = await Promise.all(
      allClubs.map(async (club) => {
        const memberCount = await memberships.countDocuments({
          clubId: club._id.toString(),
          status: "active",
        });
        const eventCount = await events.countDocuments({
          clubId: club._id.toString(),
        });
        return { ...club, memberCount, eventCount };
      })
    );
    res.json(enriched);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── GET /api/clubs/manager/my-clubs ────────────────────────────────────────
router.get("/manager/my-clubs", verifyToken, verifyManager, async (req, res) => {
  try {
    const { clubs, memberships, events } = getCollections();
    const myClubs = await clubs
      .find({ managerEmail: req.user.email })
      .sort({ createdAt: -1 })
      .toArray();
    const enriched = await Promise.all(
      myClubs.map(async (club) => {
        const memberCount = await memberships.countDocuments({
          clubId: club._id.toString(),
          status: "active",
        });
        const eventCount = await events.countDocuments({
          clubId: club._id.toString(),
        });
        return { ...club, memberCount, eventCount };
      })
    );
    res.json(enriched);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── GET /api/clubs/:id ──────────────────────────────────────────────────────
// IMPORTANT: এই route সবার শেষে থাকতে হবে
router.get("/:id", async (req, res) => {
  try {
    const { clubs, memberships } = getCollections();
    const club = await clubs.findOne({ _id: req.params.id });
    if (!club) return res.status(404).json({ message: "Club not found" });
    const memberCount = await memberships.countDocuments({
      clubId: req.params.id,
      status: "active",
    });
    res.json({ ...club, memberCount });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── POST /api/clubs ─────────────────────────────────────────────────────────
router.post("/", verifyToken, verifyManager, async (req, res) => {
  try {
    const { clubs } = getCollections();
    const { clubName, description, category, location, bannerImage, membershipFee } = req.body;
    if (!clubName || !description || !category || !location) {
      return res.status(400).json({ message: "Missing required fields" });
    }
    const newClub = {
      clubName, description, category, location,
      bannerImage: bannerImage || "",
      membershipFee: Number(membershipFee) || 0,
      status: "pending",
      managerEmail: req.user.email,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const result = await clubs.insertOne(newClub);
    res.status(201).json({ message: "Club submitted for approval", insertedId: result.insertedId });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── PATCH /api/clubs/:id/status ─────────────────────────────────────────────
router.patch("/:id/status", verifyToken, verifyAdmin, async (req, res) => {
  try {
    const { clubs } = getCollections();
    const { status } = req.body;
    if (!["approved", "rejected"].includes(status)) {
      return res.status(400).json({ message: "Invalid status" });
    }
    const result = await clubs.updateOne(
      { _id: req.params.id },
      { $set: { status, updatedAt: new Date() } }
    );
    if (result.matchedCount === 0) return res.status(404).json({ message: "Club not found" });
    res.json({ message: `Club ${status}` });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── PATCH /api/clubs/:id ────────────────────────────────────────────────────
router.patch("/:id", verifyToken, verifyManager, async (req, res) => {
  try {
    const { clubs } = getCollections();
    const club = await clubs.findOne({ _id: new ObjectId(req.params.id) });
    if (!club) return res.status(404).json({ message: "Club not found" });
    if (club.managerEmail !== req.user.email) {
      return res.status(403).json({ message: "You don't manage this club" });
    }
    const { clubName, description, category, location, bannerImage, membershipFee } = req.body;
    const updates = {
      ...(clubName && { clubName }),
      ...(description && { description }),
      ...(category && { category }),
      ...(location && { location }),
      ...(bannerImage !== undefined && { bannerImage }),
      ...(membershipFee !== undefined && { membershipFee: Number(membershipFee) }),
      updatedAt: new Date(),
    };
    await clubs.updateOne({ _id: new ObjectId(req.params.id) }, { $set: updates });
    res.json({ message: "Club updated" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── DELETE /api/clubs/:id ───────────────────────────────────────────────────
router.delete("/:id", verifyToken, verifyManager, async (req, res) => {
  try {
    const { clubs } = getCollections();
    const club = await clubs.findOne({ _id: new ObjectId(req.params.id) });
    if (!club) return res.status(404).json({ message: "Club not found" });
    if (club.managerEmail !== req.user.email) {
      return res.status(403).json({ message: "You don't manage this club" });
    }
    await clubs.deleteOne({ _id: new ObjectId(req.params.id) });
    res.json({ message: "Club deleted" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
