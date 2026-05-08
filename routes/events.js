const express = require("express");
const router = express.Router();
const { getCollections } = require("../config/db");
const { ObjectId } = require("mongodb");
const { verifyToken, verifyManager } = require("../middleware/auth");

// ── GET /api/events ─────────────────────────────────────────────────────────
// Public: upcoming events with optional filter/sort
router.get("/", async (req, res) => {
  try {
    const { events, clubs } = getCollections();
    const { clubId, sort } = req.query;

   const query = {};;
    if (clubId) query.clubId = clubId;

    let sortOption = { eventDate: 1 }; // default: soonest first
    if (sort === "latest") sortOption = { createdAt: -1 };
    if (sort === "oldest") sortOption = { createdAt: 1 };

    const result = await events.find(query).sort(sortOption).toArray();

    // Attach club name to each event
    const enriched = await Promise.all(
      result.map(async (event) => {
        const club = await clubs.findOne({ _id: new ObjectId(event.clubId) });
        return { ...event, clubName: club?.clubName || "Unknown" };
      })
    );

    res.json(enriched);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── GET /api/events/upcoming ─────────────────────────────────────────────────
// Public: 6 upcoming events for home page
router.get("/upcoming", async (req, res) => {
  try {
    const { events } = getCollections();

    const result = await events
      .find({})
      .sort({ createdAt: -1 })
      .limit(6)
      .toArray();

    res.json(result);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── GET /api/events/manager/my-events ──────────────────────────────────────
// Manager: events for clubs they manage
router.get("/manager/my-events", verifyToken, verifyManager, async (req, res) => {
  try {
    const { events, clubs } = getCollections();
    const managerEmail = req.user.email;

    // Find clubs managed by this user
    const myClubs = await clubs.find({ managerEmail }).toArray();
    const clubIds = myClubs.map((c) => c._id.toString());

    const myEvents = await events
      .find({ clubId: { $in: clubIds } })
      .sort({ eventDate: 1 })
      .toArray();

    res.json(myEvents);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── GET /api/events/:id ─────────────────────────────────────────────────────
// Public: single event detail
router.get("/:id", async (req, res) => {
  try {
    const { events, clubs, eventRegistrations } = getCollections();
    const event = await events.findOne({ _id: new ObjectId(req.params.id) });
    if (!event) return res.status(404).json({ message: "Event not found" });

    const club = await clubs.findOne({ _id: new ObjectId(event.clubId) });
    const registrationCount = await eventRegistrations.countDocuments({
      eventId: req.params.id,
      status: "registered",
    });

    res.json({ ...event, clubName: club?.clubName, registrationCount });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── POST /api/events ────────────────────────────────────────────────────────
// Manager: create event for their club
router.post("/", verifyToken, verifyManager, async (req, res) => {
  try {
    const { events, clubs } = getCollections();
    const {
      clubId,
      title,
      description,
      eventDate,
      location,
      isPaid,
      eventFee,
      maxAttendees,
    } = req.body;

    if (!clubId || !title || !eventDate || !location) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    // Verify manager owns this club
    const club = await clubs.findOne({ _id: new ObjectId(clubId) });
    if (!club || club.managerEmail !== req.user.email) {
      return res.status(403).json({ message: "You don't manage this club" });
    }
    if (club.status !== "approved") {
      return res.status(400).json({ message: "Club must be approved to create events" });
    }

    const newEvent = {
      clubId,
      title,
      description: description || "",
      eventDate: new Date(eventDate),
      location,
      isPaid: Boolean(isPaid),
      eventFee: isPaid ? Number(eventFee) || 0 : 0,
      maxAttendees: maxAttendees ? Number(maxAttendees) : null,
      createdAt: new Date(),
    };

    const result = await events.insertOne(newEvent);
    res.status(201).json({ message: "Event created", insertedId: result.insertedId });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── PATCH /api/events/:id ───────────────────────────────────────────────────
// Manager: update event
router.patch("/:id", verifyToken, verifyManager, async (req, res) => {
  try {
    const { events, clubs } = getCollections();
    const event = await events.findOne({ _id: new ObjectId(req.params.id) });
    if (!event) return res.status(404).json({ message: "Event not found" });

    // Verify manager owns the club this event belongs to
    const club = await clubs.findOne({ _id: new ObjectId(event.clubId) });
    if (!club || club.managerEmail !== req.user.email) {
      return res.status(403).json({ message: "Not authorized" });
    }

    const { title, description, eventDate, location, isPaid, eventFee, maxAttendees } =
      req.body;

    const updates = {
      ...(title && { title }),
      ...(description !== undefined && { description }),
      ...(eventDate && { eventDate: new Date(eventDate) }),
      ...(location && { location }),
      ...(isPaid !== undefined && { isPaid: Boolean(isPaid) }),
      ...(eventFee !== undefined && { eventFee: Number(eventFee) }),
      ...(maxAttendees !== undefined && { maxAttendees: Number(maxAttendees) }),
      updatedAt: new Date(),
    };

    await events.updateOne({ _id: new ObjectId(req.params.id) }, { $set: updates });
    res.json({ message: "Event updated" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── DELETE /api/events/:id ──────────────────────────────────────────────────
// Manager: delete event
router.delete("/:id", verifyToken, verifyManager, async (req, res) => {
  try {
    const { events, clubs } = getCollections();
    const event = await events.findOne({ _id: new ObjectId(req.params.id) });
    if (!event) return res.status(404).json({ message: "Event not found" });

    const club = await clubs.findOne({ _id: new ObjectId(event.clubId) });
    if (!club || club.managerEmail !== req.user.email) {
      return res.status(403).json({ message: "Not authorized" });
    }

    await events.deleteOne({ _id: new ObjectId(req.params.id) });
    res.json({ message: "Event deleted" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
