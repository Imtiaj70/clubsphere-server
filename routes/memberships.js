const express = require("express");
const router = express.Router();
const { getCollections } = require("../config/db");
const { verifyToken, verifyManager } = require("../middleware/auth");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

//
// ─────────────────────────────────────────────
// GET MY MEMBERSHIPS
// ─────────────────────────────────────────────
//
router.get("/my", verifyToken, async (req, res) => {
  try {
    const { memberships, clubs } = getCollections();
    const userEmail = req.user.email;

    const myMemberships = await memberships
      .find({ userEmail })
      .sort({ joinedAt: -1 })
      .toArray();

    const enriched = await Promise.all(
      myMemberships.map(async (m) => {
        const club = await clubs.findOne({ _id: m.clubId });
        return { ...m, club };
      })
    );

    res.json(enriched);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

//
// ─────────────────────────────────────────────
// GET CLUB MEMBERS
// ─────────────────────────────────────────────
//
router.get("/club/:clubId", verifyToken, verifyManager, async (req, res) => {
  try {
    const { memberships, clubs, users } = getCollections();
    const clubId = req.params.clubId;

    const club = await clubs.findOne({ _id: clubId });

    if (!club || club.managerEmail !== req.user.email) {
      return res.status(403).json({ message: "Not authorized" });
    }

    const members = await memberships
      .find({ clubId })
      .sort({ joinedAt: -1 })
      .toArray();

    const enriched = await Promise.all(
      members.map(async (m) => {
        const user = await users.findOne({ email: m.userEmail });
        return {
          ...m,
          userName: user?.name,
          userPhoto: user?.photoURL,
        };
      })
    );

    res.json(enriched);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

//
// ─────────────────────────────────────────────
// JOIN FREE CLUB
// ─────────────────────────────────────────────
//
router.post("/join-free", verifyToken, async (req, res) => {
  try {
    const { memberships, clubs } = getCollections();
    const { clubId } = req.body;
    const userEmail = req.user.email;

    if (!clubId) {
      return res.status(400).json({ message: "clubId required" });
    }

    const club = await clubs.findOne({ _id: clubId });

    if (!club) return res.status(404).json({ message: "Club not found" });

    if (club.status !== "approved") {
      return res.status(400).json({ message: "Club not approved" });
    }

    if (club.membershipFee > 0) {
      return res.status(400).json({ message: "This club is paid" });
    }

    const existing = await memberships.findOne({ userEmail, clubId });

    if (existing) {
      return res.status(409).json({ message: "Already a member" });
    }

    const newMembership = {
      userEmail,
      clubId,
      status: "active",
      paymentId: null,
      joinedAt: new Date(),
      expiresAt: null,
    };

    await memberships.insertOne(newMembership);

    res.status(201).json({ message: "Joined club successfully" });
  } catch (err) {
    console.log("JOIN FREE ERROR:", err);
    res.status(500).json({ message: err.message });
  }
});

//
// ─────────────────────────────────────────────
// CREATE PAYMENT INTENT
// ─────────────────────────────────────────────
//
router.post("/create-payment-intent", verifyToken, async (req, res) => {
  try {
    const { clubs, memberships } = getCollections();
    const { clubId } = req.body;
    const userEmail = req.user.email;

    const club = await clubs.findOne({ _id: clubId });

    if (!club) return res.status(404).json({ message: "Club not found" });

    if (club.membershipFee <= 0) {
      return res.status(400).json({ message: "This club is free" });
    }

    const existing = await memberships.findOne({ userEmail, clubId });

    if (existing && existing.status === "active") {
      return res.status(409).json({ message: "Already a member" });
    }

    const amount = Math.round(club.membershipFee * 100);

    const paymentIntent = await stripe.paymentIntents.create({
      amount,
      currency: "usd",
      metadata: { userEmail, clubId },
    });

    res.json({ clientSecret: paymentIntent.client_secret });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

//
// ─────────────────────────────────────────────
// CONFIRM PAYMENT
// ─────────────────────────────────────────────
//
router.post("/confirm-payment", verifyToken, async (req, res) => {
  try {
    const { memberships, payments } = getCollections();
    const { clubId, paymentIntentId } = req.body;
    const userEmail = req.user.email;

    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

    if (paymentIntent.status !== "succeeded") {
      return res.status(400).json({ message: "Payment not completed" });
    }

    const existing = await memberships.findOne({
      userEmail,
      clubId,
      status: "active",
    });

    if (existing) {
      return res.status(409).json({ message: "Already member" });
    }

    const now = new Date();
    const expiresAt = new Date();
    expiresAt.setFullYear(now.getFullYear() + 1);

    await memberships.insertOne({
      userEmail,
      clubId,
      status: "active",
      paymentId: paymentIntentId,
      joinedAt: now,
      expiresAt,
    });

    await payments.insertOne({
      userEmail,
      amount: paymentIntent.amount / 100,
      type: "membership",
      clubId,
      stripePaymentIntentId: paymentIntentId,
      status: "succeeded",
      createdAt: now,
    });

    res.status(201).json({ message: "Membership activated" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

//
// ─────────────────────────────────────────────
// EXPIRE MEMBERSHIP
// ─────────────────────────────────────────────
//
router.patch("/:id/expire", verifyToken, verifyManager, async (req, res) => {
  try {
    const { memberships, clubs } = getCollections();
    const id = req.params.id;

    const membership = await memberships.findOne({ _id: id });

    if (!membership) {
      return res.status(404).json({ message: "Not found" });
    }

    const club = await clubs.findOne({ _id: membership.clubId });

    if (!club || club.managerEmail !== req.user.email) {
      return res.status(403).json({ message: "Not allowed" });
    }

    await memberships.updateOne(
      { _id: id },
      { $set: { status: "expired", updatedAt: new Date() } }
    );

    res.json({ message: "Membership expired" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;