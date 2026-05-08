const express = require("express");
const router = express.Router();
const { getCollections } = require("../config/db");
const { ObjectId } = require("mongodb");
const { verifyToken, verifyManager } = require("../middleware/auth");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

// ── GET /api/registrations/my ───────────────────────────────────────────────
// Member: their event registrations
router.get("/my", verifyToken, async (req, res) => {
  try {
    const { eventRegistrations, events } = getCollections();
    const userEmail = req.user.email;

    const myRegs = await eventRegistrations
      .find({ userEmail })
      .sort({ registeredAt: -1 })
      .toArray();

    // Attach event info
    const enriched = await Promise.all(
      myRegs.map(async (reg) => {
        const event = await events.findOne({ _id: new ObjectId(reg.eventId) });
        return { ...reg, event };
      })
    );

    res.json(enriched);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── GET /api/registrations/event/:eventId ───────────────────────────────────
// Manager: who registered for their event
router.get("/event/:eventId", verifyToken, verifyManager, async (req, res) => {
  try {
    const { eventRegistrations, events, clubs, users } = getCollections();
    const event = await events.findOne({ _id: new ObjectId(req.params.eventId) });
    if (!event) return res.status(404).json({ message: "Event not found" });

    // Verify manager owns the club
    const club = await clubs.findOne({ _id: new ObjectId(event.clubId) });
    if (!club || club.managerEmail !== req.user.email) {
      return res.status(403).json({ message: "Not authorized" });
    }

    const registrations = await eventRegistrations
      .find({ eventId: req.params.eventId, status: "registered" })
      .sort({ registeredAt: -1 })
      .toArray();

    // Attach user info
    const enriched = await Promise.all(
      registrations.map(async (reg) => {
        const user = await users.findOne({ email: reg.userEmail });
        return { ...reg, userName: user?.name, userPhoto: user?.photoURL };
      })
    );

    res.json(enriched);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── POST /api/registrations/register-free ───────────────────────────────────
// Member: register for a free event
router.post("/register-free", verifyToken, async (req, res) => {
  try {
    const { eventRegistrations, events } = getCollections();
    const { eventId } = req.body;
    const userEmail = req.user.email;

    const event = await events.findOne({ _id: new ObjectId(eventId) });
    if (!event) return res.status(404).json({ message: "Event not found" });
    if (event.isPaid) {
      return res.status(400).json({ message: "This event requires payment" });
    }

    // Check max attendees
    if (event.maxAttendees) {
      const count = await eventRegistrations.countDocuments({
        eventId,
        status: "registered",
      });
      if (count >= event.maxAttendees) {
        return res.status(400).json({ message: "Event is full" });
      }
    }

    // Check already registered
    const existing = await eventRegistrations.findOne({ userEmail, eventId });
    if (existing && existing.status === "registered") {
      return res.status(409).json({ message: "Already registered" });
    }

    await eventRegistrations.insertOne({
      eventId,
      userEmail,
      clubId: event.clubId,
      status: "registered",
      paymentId: null,
      registeredAt: new Date(),
    });

    res.status(201).json({ message: "Registered for event" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── POST /api/registrations/create-payment-intent ───────────────────────────
// Member: Stripe intent for paid event
router.post("/create-payment-intent", verifyToken, async (req, res) => {
  try {
    const { events } = getCollections();
    const { eventId } = req.body;

    const event = await events.findOne({ _id: new ObjectId(eventId) });
    if (!event) return res.status(404).json({ message: "Event not found" });
    if (!event.isPaid || event.eventFee <= 0) {
      return res.status(400).json({ message: "This event is free" });
    }

    const amount = Math.round(event.eventFee * 100);

    const paymentIntent = await stripe.paymentIntents.create({
      amount,
      currency: "usd",
      metadata: { userEmail: req.user.email, eventId },
    });

    res.json({ clientSecret: paymentIntent.client_secret });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── POST /api/registrations/confirm-payment ─────────────────────────────────
// Member: confirm paid event registration after Stripe success
router.post("/confirm-payment", verifyToken, async (req, res) => {
  try {
    const { eventRegistrations, events, payments } = getCollections();
    const { eventId, paymentIntentId } = req.body;
    const userEmail = req.user.email;

    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
    if (paymentIntent.status !== "succeeded") {
      return res.status(400).json({ message: "Payment not confirmed" });
    }

    const event = await events.findOne({ _id: new ObjectId(eventId) });

    await eventRegistrations.insertOne({
      eventId,
      userEmail,
      clubId: event?.clubId,
      status: "registered",
      paymentId: paymentIntentId,
      registeredAt: new Date(),
    });

    await payments.insertOne({
      userEmail,
      amount: paymentIntent.amount / 100,
      type: "event",
      clubId: event?.clubId,
      eventId,
      stripePaymentIntentId: paymentIntentId,
      status: "succeeded",
      createdAt: new Date(),
    });

    res.status(201).json({ message: "Event registration confirmed" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── PATCH /api/registrations/:id/cancel ────────────────────────────────────
// Member: cancel registration
router.patch("/:id/cancel", verifyToken, async (req, res) => {
  try {
    const { eventRegistrations } = getCollections();
    const reg = await eventRegistrations.findOne({ _id: new ObjectId(req.params.id) });
    if (!reg) return res.status(404).json({ message: "Registration not found" });

    if (reg.userEmail !== req.user.email) {
      return res.status(403).json({ message: "Not authorized" });
    }

    await eventRegistrations.updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: { status: "cancelled" } }
    );

    res.json({ message: "Registration cancelled" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
