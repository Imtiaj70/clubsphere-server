# ClubSphere Server

## Setup

### 1. Install dependencies
```bash
npm install
```

### 2. Environment variables
Copy `.env.example` to `.env` and fill in your values:
```bash
cp .env.example .env
```

### 3. Firebase Service Account
Follow `FIREBASE_SETUP.md` to download your service account JSON.
Place it in this folder as `firebaseServiceAccount.json`.

### 4. Run
```bash
# Development
npm run dev

# Production
npm start
```

---

## API Endpoints

### Auth
| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| POST | /api/auth/register | None | Save user to MongoDB |
| GET | /api/auth/me | Token | Get current user profile |

### Clubs
| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| GET | /api/clubs | None | List approved clubs (search/filter/sort) |
| GET | /api/clubs/featured | None | 6 clubs for home page |
| GET | /api/clubs/categories | None | All categories |
| GET | /api/clubs/admin/all | Admin | All clubs |
| GET | /api/clubs/manager/my-clubs | Manager | Manager's clubs |
| GET | /api/clubs/:id | None | Single club |
| POST | /api/clubs | Manager | Create club |
| PATCH | /api/clubs/:id | Manager | Update club |
| PATCH | /api/clubs/:id/status | Admin | Approve/Reject |
| DELETE | /api/clubs/:id | Manager | Delete club |

### Events
| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| GET | /api/events | None | Upcoming events |
| GET | /api/events/upcoming | None | 6 events for home page |
| GET | /api/events/manager/my-events | Manager | Manager's events |
| GET | /api/events/:id | None | Single event |
| POST | /api/events | Manager | Create event |
| PATCH | /api/events/:id | Manager | Update event |
| DELETE | /api/events/:id | Manager | Delete event |

### Memberships
| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| GET | /api/memberships/my | Token | My memberships |
| GET | /api/memberships/club/:clubId | Manager | Club's members |
| POST | /api/memberships/join-free | Token | Join free club |
| POST | /api/memberships/create-payment-intent | Token | Stripe intent |
| POST | /api/memberships/confirm-payment | Token | Activate membership |
| PATCH | /api/memberships/:id/expire | Manager | Expire membership |

### Event Registrations
| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| GET | /api/registrations/my | Token | My registrations |
| GET | /api/registrations/event/:eventId | Manager | Event's registrants |
| POST | /api/registrations/register-free | Token | Register free event |
| POST | /api/registrations/create-payment-intent | Token | Stripe intent |
| POST | /api/registrations/confirm-payment | Token | Confirm paid event |
| PATCH | /api/registrations/:id/cancel | Token | Cancel registration |

### Admin
| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| GET | /api/admin/stats | Admin | Dashboard summary |
| GET | /api/admin/chart-data | Admin | Memberships per club |
| GET | /api/admin/users | Admin | All users |
| PATCH | /api/admin/users/:id/role | Admin | Change user role |
| GET | /api/admin/payments | Admin | All payments |

---

## Folder Structure
```
clubsphere-server/
├── config/
│   ├── db.js              # MongoDB connection
│   └── firebase.js        # Firebase Admin init
├── middleware/
│   └── auth.js            # verifyToken, verifyAdmin, verifyManager
├── routes/
│   ├── auth.js
│   ├── clubs.js
│   ├── events.js
│   ├── memberships.js
│   ├── registrations.js
│   └── admin.js
├── index.js               # Entry point
├── .env.example
├── .gitignore
└── package.json
```
