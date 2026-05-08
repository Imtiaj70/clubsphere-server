const { MongoClient, ServerApiVersion } = require("mongodb");

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.xp73onh.mongodb.net/clubsphere?retryWrites=true&w=majority`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: false,
    deprecationErrors: true,
  },
});

let db;

const connectDB = async () => {
  await client.connect();
  db = client.db("clubsphere");
  console.log("MongoDB connected");
};

// Collection accessors — always call after connectDB()
const getCollections = () => ({
  users: db.collection("users"),
  clubs: db.collection("clubs"),
  memberships: db.collection("memberships"),
  events: db.collection("events"),
  eventRegistrations: db.collection("eventRegistrations"),
  payments: db.collection("payments"),
});

module.exports = { connectDB, getCollections };
// await connectDB();
