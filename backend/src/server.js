const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { v4: uuidv4 } = require("uuid");
const QRCode = require("qrcode");
require("dotenv").config();
const authRoutes = require("./routes/auth");

const { readDB, writeDB } = require("./utils/db");
const {
  authenticate,
  adminOnly
} = require("./middleware/auth");

const app = express();

app.use(cors());
app.use(express.json());
app.use("/api/auth", authRoutes);

const PORT = process.env.PORT || 5000;

/* =========================
   HEALTH CHECK
========================= */

app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    message: "Ticket Booking API running 🚀"
  });
});

/* =========================
   AUTH
========================= */

app.post("/api/auth/register", async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: "All fields are required"
      });
    }

    const db = readDB();

    const existingUser = db.users.find(
      user => user.email.toLowerCase() === email.toLowerCase()
    );

    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: "Email already registered"
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = {
      id: uuidv4(),
      name,
      email: email.toLowerCase(),
      password: hashedPassword,
      role: "USER",
      createdAt: new Date().toISOString()
    };

    db.users.push(user);

    writeDB(db);

    const token = jwt.sign(
      {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role
      },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.status(201).json({
      success: true,
      message: "Registration successful",
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    });

  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      message: "Registration failed"
    });
  }
});


app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    const db = readDB();

    const user = db.users.find(
      u => u.email.toLowerCase() === email.toLowerCase()
    );

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password"
      });
    }

    const validPassword = await bcrypt.compare(
      password,
      user.password
    );

    if (!validPassword) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password"
      });
    }

    const token = jwt.sign(
      {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role
      },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({
      success: true,
      message: "Login successful",
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    });

  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      message: "Login failed"
    });
  }
});


app.get("/api/auth/me", authenticate, (req, res) => {
  res.json({
    success: true,
    user: req.user
  });
});


/* =========================
   EVENTS
========================= */

app.get("/api/events", (req, res) => {
  const db = readDB();

  res.json({
    success: true,
    events: db.events
  });
});


app.get("/api/events/:id", (req, res) => {
  const db = readDB();

  const event = db.events.find(
    e => e.id === req.params.id
  );

  if (!event) {
    return res.status(404).json({
      success: false,
      message: "Event not found"
    });
  }

  res.json({
    success: true,
    event
  });
});


/* =========================
   ADMIN EVENTS
========================= */

app.post(
  "/api/events",
  authenticate,
  adminOnly,
  (req, res) => {

    const {
      title,
      description,
      date,
      time,
      venue,
      city,
      price
    } = req.body;

    if (!title || !date || !time || !venue || !price) {
      return res.status(400).json({
        success: false,
        message: "Required fields missing"
      });
    }

    const db = readDB();

    const event = {
      id: uuidv4(),
      title,
      description: description || "",
      date,
      time,
      venue,
      city: city || "",
      price: Number(price),
      status: "UPCOMING",
      seats: []
    };

    db.events.push(event);

    writeDB(db);

    res.status(201).json({
      success: true,
      message: "Event created",
      event
    });
  }
);


app.delete(
  "/api/events/:id",
  authenticate,
  adminOnly,
  (req, res) => {

    const db = readDB();

    const index = db.events.findIndex(
      e => e.id === req.params.id
    );

    if (index === -1) {
      return res.status(404).json({
        success: false,
        message: "Event not found"
      });
    }

    db.events.splice(index, 1);

    writeDB(db);

    res.json({
      success: true,
      message: "Event deleted"
    });
  }
);


/* =========================
   SEATS
========================= */

app.get("/api/events/:id/seats", (req, res) => {
  const db = readDB();

  const event = db.events.find(
    e => e.id === req.params.id
  );

  if (!event) {
    return res.status(404).json({
      success: false,
      message: "Event not found"
    });
  }

  /*
    Automatically create seats if they
    don't exist yet.
  */

  if (!event.seats || event.seats.length === 0) {

    const seats = [];

    for (let row = 0; row < 6; row++) {

      const rowName = String.fromCharCode(65 + row);

      for (let number = 1; number <= 10; number++) {

        seats.push({
          id: `${event.id}-${rowName}${number}`,
          number: `${rowName}${number}`,
          status: "AVAILABLE",
          holdExpiresAt: null
        });

      }
    }

    event.seats = seats;

    writeDB(db);
  }

  /*
    Release expired holds.
  */

  const now = Date.now();

  event.seats.forEach(seat => {

    if (
      seat.status === "HELD" &&
      seat.holdExpiresAt &&
      new Date(seat.holdExpiresAt).getTime() < now
    ) {

      seat.status = "AVAILABLE";
      seat.holdExpiresAt = null;
    }

  });

  writeDB(db);

  res.json({
    success: true,
    seats: event.seats
  });
});


/* =========================
   HOLD SEATS
========================= */

app.post(
  "/api/events/:id/hold",
  authenticate,
  (req, res) => {

    const { seatIds } = req.body;

    if (!Array.isArray(seatIds) || seatIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Select at least one seat"
      });
    }

    const db = readDB();

    const event = db.events.find(
      e => e.id === req.params.id
    );

    if (!event) {
      return res.status(404).json({
        success: false,
        message: "Event not found"
      });
    }

    if (!event.seats || event.seats.length === 0) {

      event.seats = [];

      for (let row = 0; row < 6; row++) {

        const rowName = String.fromCharCode(65 + row);

        for (let number = 1; number <= 10; number++) {

          event.seats.push({
            id: `${event.id}-${rowName}${number}`,
            number: `${rowName}${number}`,
            status: "AVAILABLE",
            holdExpiresAt: null
          });

        }
      }
    }

    const selectedSeats = event.seats.filter(
      seat => seatIds.includes(seat.id)
    );

    if (selectedSeats.length !== seatIds.length) {
      return res.status(400).json({
        success: false,
        message: "Invalid seat selection"
      });
    }

    const unavailable = selectedSeats.some(
      seat => seat.status !== "AVAILABLE"
    );

    if (unavailable) {
      return res.status(409).json({
        success: false,
        message: "One or more seats are no longer available"
      });
    }

    const expiry = new Date(
      Date.now() + 5 * 60 * 1000
    ).toISOString();

    selectedSeats.forEach(seat => {
      seat.status = "HELD";
      seat.holdExpiresAt = expiry;
    });

    writeDB(db);

    res.json({
      success: true,
      message: "Seats held for 5 minutes",
      expiresAt: expiry,
      seats: selectedSeats
    });
  }
);


/* =========================
   BOOKING
========================= */

app.post(
  "/api/bookings",
  authenticate,
  async (req, res) => {

    try {

      const {
        eventId,
        seatIds
      } = req.body;

      const db = readDB();

      const event = db.events.find(
        e => e.id === eventId
      );

      if (!event) {
        return res.status(404).json({
          success: false,
          message: "Event not found"
        });
      }

      const seats = event.seats.filter(
        seat => seatIds.includes(seat.id)
      );

      if (seats.length !== seatIds.length) {
        return res.status(400).json({
          success: false,
          message: "Invalid seats"
        });
      }

      const expired = seats.some(
        seat =>
          seat.status !== "HELD" ||
          !seat.holdExpiresAt ||
          new Date(seat.holdExpiresAt).getTime() < Date.now()
      );

      if (expired) {
        return res.status(409).json({
          success: false,
          message: "Seat hold expired. Please select seats again."
        });
      }

      const booking = {
        id: uuidv4(),

        bookingReference:
          "TB-" +
          Math.random()
            .toString(36)
            .substring(2, 8)
            .toUpperCase(),

        userId: req.user.id,

        eventId,

        seatIds,

        totalAmount:
          seatIds.length * Number(event.price),

        status: "CONFIRMED",

        createdAt: new Date().toISOString()
      };

      seats.forEach(seat => {
        seat.status = "BOOKED";
        seat.holdExpiresAt = null;
      });

      db.bookings.push(booking);

      writeDB(db);

      res.status(201).json({
        success: true,
        message: "Booking confirmed 🎉",
        booking
      });

    } catch (error) {

      console.error(error);

      res.status(500).json({
        success: false,
        message: "Booking failed"
      });
    }
  }
);


/* =========================
   MY BOOKINGS
========================= */

app.get(
  "/api/bookings/my",
  authenticate,
  (req, res) => {

    const db = readDB();

    const bookings = db.bookings
      .filter(
        booking => booking.userId === req.user.id
      )
      .map(booking => {

        const event = db.events.find(
          event => event.id === booking.eventId
        );

        return {
          ...booking,
          event
        };
      });

    res.json({
      success: true,
      bookings
    });
  }
);


/* =========================
   CANCEL BOOKING
========================= */

app.patch(
  "/api/bookings/:id/cancel",
  authenticate,
  (req, res) => {

    const db = readDB();

    const booking = db.bookings.find(
      b =>
        b.id === req.params.id &&
        b.userId === req.user.id
    );

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: "Booking not found"
      });
    }

    if (booking.status === "CANCELLED") {
      return res.status(400).json({
        success: false,
        message: "Booking already cancelled"
      });
    }

    const event = db.events.find(
      e => e.id === booking.eventId
    );

    if (event) {

      event.seats.forEach(seat => {

        if (booking.seatIds.includes(seat.id)) {

          seat.status = "AVAILABLE";
          seat.holdExpiresAt = null;

        }

      });

    }

    booking.status = "CANCELLED";

    writeDB(db);

    res.json({
      success: true,
      message: "Booking cancelled"
    });
  }
);


/* =========================
   QR CODE
========================= */

app.get(
  "/api/bookings/:id/qr",
  authenticate,
  async (req, res) => {

    try {

      const db = readDB();

      const booking = db.bookings.find(
        b =>
          b.id === req.params.id &&
          b.userId === req.user.id
      );

      if (!booking) {
        return res.status(404).json({
          success: false,
          message: "Booking not found"
        });
      }

      const qrData = JSON.stringify({
        bookingReference: booking.bookingReference,
        bookingId: booking.id,
        eventId: booking.eventId,
        seats: booking.seatIds
      });

      const qr = await QRCode.toDataURL(qrData);

      res.json({
        success: true,
        qr
      });

    } catch (error) {

      console.error(error);

      res.status(500).json({
        success: false,
        message: "QR generation failed"
      });
    }
  }
);


/* =========================
   WAITLIST
========================= */

app.post(
  "/api/waitlist",
  authenticate,
  (req, res) => {

    const {
      eventId,
      seatsRequested = 1
    } = req.body;

    const db = readDB();

    const event = db.events.find(
      e => e.id === eventId
    );

    if (!event) {
      return res.status(404).json({
        success: false,
        message: "Event not found"
      });
    }

    const existing = db.waitlist.find(
      item =>
        item.eventId === eventId &&
        item.userId === req.user.id &&
        item.status === "WAITING"
    );

    if (existing) {
      return res.status(409).json({
        success: false,
        message: "Already on waitlist"
      });
    }

    const item = {
      id: uuidv4(),
      userId: req.user.id,
      eventId,
      seatsRequested,
      status: "WAITING",
      createdAt: new Date().toISOString()
    };

    db.waitlist.push(item);

    writeDB(db);

    res.status(201).json({
      success: true,
      message: "Added to waitlist",
      waitlist: item
    });
  }
);


/* =========================
   ADMIN BOOKINGS
========================= */

app.get(
  "/api/admin/bookings",
  authenticate,
  adminOnly,
  (req, res) => {

    const db = readDB();

    const bookings = db.bookings.map(booking => {

      const user = db.users.find(
        u => u.id === booking.userId
      );

      const event = db.events.find(
        e => e.id === booking.eventId
      );

      return {
        ...booking,

        user: user
          ? {
              name: user.name,
              email: user.email
            }
          : null,

        event: event
          ? {
              title: event.title,
              date: event.date
            }
          : null
      };
    });

    res.json({
      success: true,
      bookings
    });
  }
);


/* =========================
   ADMIN STATS
========================= */

app.get(
  "/api/admin/stats",
  authenticate,
  adminOnly,
  (req, res) => {

    const db = readDB();

    const confirmedBookings =
      db.bookings.filter(
        b => b.status === "CONFIRMED"
      );

    const revenue =
      confirmedBookings.reduce(
        (sum, booking) =>
          sum + Number(booking.totalAmount),
        0
      );

    res.json({
      success: true,

      stats: {
        users: db.users.length,
        events: db.events.length,
        bookings: confirmedBookings.length,
        revenue,
        waitlist: db.waitlist.filter(
          item => item.status === "WAITING"
        ).length
      }
    });
  }
);


/* =========================
   START SERVER
========================= */

app.listen(PORT, () => {

  console.log(
    `🚀 Server running on http://localhost:${PORT}`
  );

});