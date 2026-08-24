import { useEffect, useState } from "react";
import "./index.css";

const API = "http://localhost:5000/api";

type User = {
  id: string;
  name: string;
  email: string;
  role: "USER" | "ADMIN";
};

type Event = {
  id: string;
  title: string;
  description: string;
  date: string;
  time: string;
  venue: string;
  city: string;
  price: number;
  status: string;
  seats?: Seat[];
};

type Seat = {
  id: string;
  number: string;
  status: "AVAILABLE" | "HELD" | "BOOKED";
  holdExpiresAt?: string | null;
};

type Booking = {
  id: string;
  bookingReference: string;
  eventId: string;
  seatIds: string[];
  totalAmount: number;
  status: string;
  createdAt: string;
  event?: Event;
};

function App() {
  const [user, setUser] = useState<User | null>(() => {
    const saved = localStorage.getItem("user");
    return saved ? JSON.parse(saved) : null;
  });

  const [token, setToken] = useState(
    localStorage.getItem("token") || ""
  );

  const [events, setEvents] = useState<Event[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);

  const [page, setPage] = useState("home");
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [selectedSeats, setSelectedSeats] = useState<string[]>([]);

  const [authMode, setAuthMode] = useState<"login" | "register">("login");

  const [authForm, setAuthForm] = useState({
    name: "",
    email: "",
    password: ""
  });

  const [message, setMessage] = useState("");

  const [adminForm, setAdminForm] = useState({
    title: "",
    description: "",
    date: "",
    time: "",
    venue: "",
    city: "Bhopal",
    price: ""
  });

  const [qrCode, setQrCode] = useState("");

  useEffect(() => {
    loadEvents();
  }, []);

  useEffect(() => {
    if (token) {
      loadBookings();
    }
  }, [token]);

  async function loadEvents() {
    try {
      const response = await fetch(`${API}/events`);
      const data = await response.json();

      if (data.success) {
        setEvents(data.events);
      }
    } catch {
      setMessage("Unable to connect to backend");
    }
  }

  async function loadBookings() {
    try {
      const response = await fetch(`${API}/bookings/my`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      const data = await response.json();

      if (data.success) {
        setBookings(data.bookings);
      }
    } catch {
      console.log("Bookings unavailable");
    }
  }

  async function handleAuth(e: React.FormEvent) {
    e.preventDefault();
    setMessage("");

    const endpoint =
      authMode === "login"
        ? "/auth/login"
        : "/auth/register";

    try {
      const response = await fetch(`${API}${endpoint}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(authForm)
      });

      const data = await response.json();

      if (!response.ok) {
        setMessage(data.message || "Authentication failed");
        return;
      }

      localStorage.setItem("token", data.token);
      localStorage.setItem("user", JSON.stringify(data.user));

      setToken(data.token);
      setUser(data.user);

      setAuthForm({
        name: "",
        email: "",
        password: ""
      });

      setPage("home");
      setMessage(`Welcome, ${data.user.name}!`);
    } catch {
      setMessage("Backend server is not running");
    }
  }

  function logout() {
    localStorage.removeItem("token");
    localStorage.removeItem("user");

    setToken("");
    setUser(null);
    setBookings([]);
    setPage("home");
    setMessage("Logged out successfully");
  }

  async function openEvent(event: Event) {
    try {
      const response = await fetch(
        `${API}/events/${event.id}/seats`
      );

      const data = await response.json();

      if (data.success) {
        setSelectedEvent({
          ...event,
          seats: data.seats
        });

        setSelectedSeats([]);
        setPage("seats");
      }
    } catch {
      setMessage("Unable to load seats");
    }
  }

  function toggleSeat(seat: Seat) {
    if (!user) {
      setPage("login");
      return;
    }

    if (seat.status !== "AVAILABLE") return;

    setSelectedSeats(prev =>
      prev.includes(seat.id)
        ? prev.filter(id => id !== seat.id)
        : [...prev, seat.id]
    );
  }

  async function bookSelectedSeats() {
    if (!user || !selectedEvent || selectedSeats.length === 0) {
      return;
    }

    try {
      const holdResponse = await fetch(
        `${API}/events/${selectedEvent.id}/hold`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({
            seatIds: selectedSeats
          })
        }
      );

      const holdData = await holdResponse.json();

      if (!holdResponse.ok) {
        setMessage(holdData.message);
        return;
      }

      const bookingResponse = await fetch(
        `${API}/bookings`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({
            eventId: selectedEvent.id,
            seatIds: selectedSeats
          })
        }
      );

      const bookingData = await bookingResponse.json();

      if (!bookingResponse.ok) {
        setMessage(bookingData.message);
        return;
      }

      setMessage(
        `Booking confirmed! ${bookingData.booking.bookingReference}`
      );

      setSelectedSeats([]);

      await loadEvents();
      await loadBookings();

      setPage("bookings");
    } catch {
      setMessage("Booking failed");
    }
  }

  async function cancelBooking(id: string) {
    try {
      const response = await fetch(
        `${API}/bookings/${id}/cancel`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );

      const data = await response.json();

      setMessage(data.message);

      await loadBookings();
      await loadEvents();
    } catch {
      setMessage("Cancellation failed");
    }
  }

  async function getQR(id: string) {
    try {
      const response = await fetch(
        `${API}/bookings/${id}/qr`,
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );

      const data = await response.json();

      if (data.success) {
        setQrCode(data.qr);
      }
    } catch {
      setMessage("Unable to generate QR");
    }
  }

  async function createEvent(e: React.FormEvent) {
    e.preventDefault();

    try {
      const response = await fetch(`${API}/events`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          ...adminForm,
          price: Number(adminForm.price)
        })
      });

      const data = await response.json();

      if (!response.ok) {
        setMessage(data.message);
        return;
      }

      setMessage("Event created successfully!");

      setAdminForm({
        title: "",
        description: "",
        date: "",
        time: "",
        venue: "",
        city: "Bhopal",
        price: ""
      });

      await loadEvents();
    } catch {
      setMessage("Unable to create event");
    }
  }

  async function deleteEvent(id: string) {
    if (!confirm("Delete this event?")) return;

    try {
      const response = await fetch(
        `${API}/events/${id}`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );

      const data = await response.json();

      setMessage(data.message);
      await loadEvents();
    } catch {
      setMessage("Unable to delete event");
    }
  }

  async function joinWaitlist(eventId: string) {
    if (!user) {
      setPage("login");
      return;
    }

    try {
      const response = await fetch(`${API}/waitlist`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          eventId,
          seatsRequested: 1
        })
      });

      const data = await response.json();

      setMessage(data.message);
    } catch {
      setMessage("Unable to join waitlist");
    }
  }

  return (
    <div className="app">

      {/* NAVBAR */}

      <header className="navbar">

        <div
          className="logo"
          onClick={() => setPage("home")}
        >
          <span className="logoIcon">◆</span>
          Ticket<span>ly</span>
        </div>

        <nav>
          <button onClick={() => setPage("home")}>
            Home
          </button>

          <button onClick={() => setPage("events")}>
            Events
          </button>

          {user && (
            <button onClick={() => setPage("bookings")}>
              My Bookings
            </button>
          )}

          {user?.role === "ADMIN" && (
            <button onClick={() => setPage("admin")}>
              Admin
            </button>
          )}
        </nav>

        <div className="navRight">

          {user ? (
            <>
              <div className="userBadge">
                <div className="avatar">
                  {user.name.charAt(0).toUpperCase()}
                </div>

                <span>{user.name}</span>
              </div>

              <button
                className="outlineBtn"
                onClick={logout}
              >
                Logout
              </button>
            </>
          ) : (
            <button
              className="primaryBtn small"
              onClick={() => {
                setAuthMode("login");
                setPage("login");
              }}
            >
              Sign In
            </button>
          )}

        </div>
      </header>

      {/* MESSAGE */}

      {message && (
        <div className="toast">
          {message}
          <button onClick={() => setMessage("")}>×</button>
        </div>
      )}

      {/* HOME */}

      {page === "home" && (
        <>
          <section className="hero">

            <div className="heroContent">

              <div className="pill">
                ✦ Your gateway to unforgettable experiences
              </div>

              <h1>
                Experience More.
                <br />
                <span>Book Everything.</span>
              </h1>

              <p>
                Discover concerts, movies, sports and
                exclusive events. Pick your seats and
                book your experience in seconds.
              </p>

              <div className="heroButtons">
                <button
                  className="primaryBtn"
                  onClick={() => setPage("events")}
                >
                  Explore Events →
                </button>

                {!user && (
                  <button
                    className="outlineBtn"
                    onClick={() => {
                      setAuthMode("register");
                      setPage("login");
                    }}
                  >
                    Create Account
                  </button>
                )}
              </div>

            </div>

            <div className="heroVisual">
              <div className="ticketCard">

                <div className="ticketTop">
                  <span>LIVE EVENT</span>
                  <span>2026</span>
                </div>

                <div className="ticketIcon">
                  🎟️
                </div>

                <h3>
                  Your next
                  <br />
                  adventure awaits.
                </h3>

                <div className="ticketLine" />

                <div className="ticketInfo">
                  <span>VENUE</span>
                  <strong>Bhopal Arena</strong>
                </div>

              </div>
            </div>

          </section>

          <section className="section">

            <div className="sectionHeading">
              <div>
                <span className="eyebrow">
                  HANDPICKED FOR YOU
                </span>

                <h2>
                  Popular Events
                </h2>
              </div>

              <button
                className="textBtn"
                onClick={() => setPage("events")}
              >
                View all →
              </button>
            </div>

            <div className="eventGrid">
              {events.slice(0, 3).map(event => (
                <EventCard
                  key={event.id}
                  event={event}
                  onBook={() => openEvent(event)}
                  onWaitlist={() => joinWaitlist(event.id)}
                />
              ))}
            </div>

          </section>
        </>
      )}

      {/* EVENTS */}

      {page === "events" && (
        <section className="section pageSection">

          <div className="pageTitle">
            <span className="eyebrow">
              DISCOVER
            </span>

            <h1>
              All Events
            </h1>

            <p>
              Find your next unforgettable experience.
            </p>
          </div>

          <div className="eventGrid">

            {events.map(event => (
              <EventCard
                key={event.id}
                event={event}
                onBook={() => openEvent(event)}
                onWaitlist={() => joinWaitlist(event.id)}
              />
            ))}

          </div>

        </section>
      )}

      {/* LOGIN */}

      {page === "login" && (
        <section className="authPage">

          <div className="authCard">

            <div className="authLogo">
              ◆ Ticket<span>ly</span>
            </div>

            <h1>
              {authMode === "login"
                ? "Welcome back"
                : "Create your account"}
            </h1>

            <p>
              {authMode === "login"
                ? "Sign in to continue booking."
                : "Join Ticketly and start exploring."}
            </p>

            <form onSubmit={handleAuth}>

              {authMode === "register" && (
                <label>
                  Full Name
                  <input
                    required
                    value={authForm.name}
                    onChange={e =>
                      setAuthForm({
                        ...authForm,
                        name: e.target.value
                      })
                    }
                    placeholder="Enter your name"
                  />
                </label>
              )}

              <label>
                Email
                <input
                  required
                  type="email"
                  value={authForm.email}
                  onChange={e =>
                    setAuthForm({
                      ...authForm,
                      email: e.target.value
                    })
                  }
                  placeholder="you@example.com"
                />
              </label>

              <label>
                Password
                <input
                  required
                  type="password"
                  minLength={6}
                  value={authForm.password}
                  onChange={e =>
                    setAuthForm({
                      ...authForm,
                      password: e.target.value
                    })
                  }
                  placeholder="••••••••"
                />
              </label>

              <button className="primaryBtn full">
                {authMode === "login"
                  ? "Sign In"
                  : "Create Account"}
              </button>

            </form>

            <div className="switchAuth">

              {authMode === "login"
                ? "Don't have an account?"
                : "Already have an account?"}

              <button
                onClick={() =>
                  setAuthMode(
                    authMode === "login"
                      ? "register"
                      : "login"
                  )
                }
              >
                {authMode === "login"
                  ? "Create one"
                  : "Sign in"}
              </button>

            </div>

          </div>

        </section>
      )}

      {/* SEATS */}

      {page === "seats" && selectedEvent && (
        <section className="section pageSection">

          <button
            className="backBtn"
            onClick={() => setPage("events")}
          >
            ← Back to events
          </button>

          <div className="bookingHeader">

            <div>
              <span className="eyebrow">
                SELECT YOUR SEATS
              </span>

              <h1>
                {selectedEvent.title}
              </h1>

              <p>
                {selectedEvent.venue} ·{" "}
                {selectedEvent.date} ·{" "}
                {selectedEvent.time}
              </p>
            </div>

            <div className="priceBox">
              ₹{selectedEvent.price}
              <span>/ seat</span>
            </div>

          </div>

          <div className="seatLayout">

            <div className="screen">
              SCREEN
            </div>

            <div className="seatMap">

              {selectedEvent.seats?.map(seat => (
                <button
                  key={seat.id}
                  className={`seat ${
                    seat.status.toLowerCase()
                  } ${
                    selectedSeats.includes(seat.id)
                      ? "selected"
                      : ""
                  }`}
                  onClick={() => toggleSeat(seat)}
                  disabled={seat.status !== "AVAILABLE"}
                >
                  {seat.number}
                </button>
              ))}

            </div>

            <div className="seatLegend">

              <span>
                <i className="available" />
                Available
              </span>

              <span>
                <i className="selectedLegend" />
                Selected
              </span>

              <span>
                <i className="booked" />
                Booked
              </span>

            </div>

          </div>

          <div className="bookingBottom">

            <div>
              <span>Selected seats</span>
              <strong>
                {selectedSeats.length
                  ? selectedSeats
                      .map(id =>
                        selectedEvent.seats?.find(
                          s => s.id === id
                        )?.number
                      )
                      .join(", ")
                  : "None"}
              </strong>
            </div>

            <div>
              <span>Total</span>
              <strong>
                ₹
                {selectedSeats.length *
                  selectedEvent.price}
              </strong>
            </div>

            <button
              className="primaryBtn"
              disabled={selectedSeats.length === 0}
              onClick={bookSelectedSeats}
            >
              Confirm Booking →
            </button>

          </div>

        </section>
      )}

      {/* BOOKINGS */}

      {page === "bookings" && user && (
        <section className="section pageSection">

          <div className="pageTitle">
            <span className="eyebrow">
              YOUR TICKETS
            </span>

            <h1>
              My Bookings
            </h1>
          </div>

          {bookings.length === 0 ? (
            <div className="emptyState">
              <div>🎟️</div>
              <h2>No bookings yet</h2>
              <p>
                Your next adventure is waiting.
              </p>

              <button
                className="primaryBtn"
                onClick={() => setPage("events")}
              >
                Explore Events
              </button>
            </div>
          ) : (
            <div className="bookingList">

              {bookings.map(booking => (
                <div
                  className="bookingCard"
                  key={booking.id}
                >

                  <div className="bookingIcon">
                    🎫
                  </div>

                  <div className="bookingMain">

                    <span className="status">
                      {booking.status}
                    </span>

                    <h2>
                      {booking.event?.title}
                    </h2>

                    <p>
                      {booking.event?.venue} ·{" "}
                      {booking.event?.date}
                    </p>

                    <div className="bookingMeta">
                      <span>
                        Reference
                        <strong>
                          {booking.bookingReference}
                        </strong>
                      </span>

                      <span>
                        Seats
                        <strong>
                          {booking.seatIds.length}
                        </strong>
                      </span>

                      <span>
                        Total
                        <strong>
                          ₹{booking.totalAmount}
                        </strong>
                      </span>
                    </div>

                  </div>

                  <div className="bookingActions">

                    {booking.status === "CONFIRMED" && (
                      <>
                        <button
                          className="outlineBtn"
                          onClick={() =>
                            getQR(booking.id)
                          }
                        >
                          QR Ticket
                        </button>

                        <button
                          className="dangerBtn"
                          onClick={() =>
                            cancelBooking(booking.id)
                          }
                        >
                          Cancel
                        </button>
                      </>
                    )}

                  </div>

                </div>
              ))}

            </div>
          )}

        </section>
      )}

      {/* ADMIN */}

      {page === "admin" &&
        user?.role === "ADMIN" && (
          <section className="section pageSection">

            <div className="pageTitle">
              <span className="eyebrow">
                ADMINISTRATION
              </span>

              <h1>
                Admin Dashboard
              </h1>

              <p>
                Manage events and monitor bookings.
              </p>
            </div>

            <div className="statsGrid">

              <div className="statCard">
                <span>Events</span>
                <strong>{events.length}</strong>
              </div>

              <div className="statCard">
                <span>Bookings</span>
                <strong>{bookings.length}</strong>
              </div>

              <div className="statCard">
                <span>Role</span>
                <strong>ADMIN</strong>
              </div>

              <div className="statCard">
                <span>Status</span>
                <strong>ACTIVE</strong>
              </div>

            </div>

            <div className="adminLayout">

              <div className="adminFormCard">

                <h2>Create Event</h2>

                <form onSubmit={createEvent}>

                  <input
                    required
                    placeholder="Event title"
                    value={adminForm.title}
                    onChange={e =>
                      setAdminForm({
                        ...adminForm,
                        title: e.target.value
                      })
                    }
                  />

                  <textarea
                    placeholder="Description"
                    value={adminForm.description}
                    onChange={e =>
                      setAdminForm({
                        ...adminForm,
                        description: e.target.value
                      })
                    }
                  />

                  <div className="formRow">

                    <input
                      required
                      type="date"
                      value={adminForm.date}
                      onChange={e =>
                        setAdminForm({
                          ...adminForm,
                          date: e.target.value
                        })
                      }
                    />

                    <input
                      required
                      type="time"
                      value={adminForm.time}
                      onChange={e =>
                        setAdminForm({
                          ...adminForm,
                          time: e.target.value
                        })
                      }
                    />

                  </div>

                  <div className="formRow">

                    <input
                      required
                      placeholder="Venue"
                      value={adminForm.venue}
                      onChange={e =>
                        setAdminForm({
                          ...adminForm,
                          venue: e.target.value
                        })
                      }
                    />

                    <input
                      placeholder="City"
                      value={adminForm.city}
                      onChange={e =>
                        setAdminForm({
                          ...adminForm,
                          city: e.target.value
                        })
                      }
                    />

                  </div>

                  <input
                    required
                    type="number"
                    placeholder="Price"
                    value={adminForm.price}
                    onChange={e =>
                      setAdminForm({
                        ...adminForm,
                        price: e.target.value
                      })
                    }
                  />

                  <button className="primaryBtn full">
                    Create Event
                  </button>

                </form>

              </div>

              <div className="adminEvents">

                <h2>Manage Events</h2>

                {events.map(event => (
                  <div
                    className="adminEvent"
                    key={event.id}
                  >

                    <div>
                      <strong>{event.title}</strong>
                      <span>
                        {event.date} · ₹{event.price}
                      </span>
                    </div>

                    <button
                      className="dangerBtn"
                      onClick={() =>
                        deleteEvent(event.id)
                      }
                    >
                      Delete
                    </button>

                  </div>
                ))}

              </div>

            </div>

          </section>
        )}

      {/* QR MODAL */}

      {qrCode && (
        <div className="modal">

          <div className="qrCard">

            <button
              className="closeModal"
              onClick={() => setQrCode("")}
            >
              ×
            </button>

            <span className="eyebrow">
              DIGITAL TICKET
            </span>

            <h2>
              Your Ticket QR
            </h2>

            <img src={qrCode} alt="Ticket QR Code" />

            <p>
              Show this QR code at the venue.
            </p>

            <button
              className="primaryBtn"
              onClick={() => setQrCode("")}
            >
              Done
            </button>

          </div>

        </div>
      )}

      <footer>
        <strong>Ticketly</strong>
        <span>
          Smart event booking made simple.
        </span>
        <span>
          © 2026 Ticketly
        </span>
      </footer>

    </div>
  );
}


/* =========================
   EVENT CARD
========================= */

function EventCard({
  event,
  onBook,
  onWaitlist
}: {
  event: Event;
  onBook: () => void;
  onWaitlist: () => void;
}) {

  const emoji =
    event.title.toLowerCase().includes("concert")
      ? "🎤"
      : event.title.toLowerCase().includes("movie")
      ? "🎬"
      : "💡";

  return (
    <div className="eventCard">

      <div className="eventImage">
        <span>{emoji}</span>

        <div className="eventDate">
          <strong>
            {new Date(event.date).getDate()}
          </strong>

          <small>
            {new Date(event.date)
              .toLocaleString("en", {
                month: "short"
              })
              .toUpperCase()}
          </small>
        </div>
      </div>

      <div className="eventContent">

        <span className="eventType">
          {event.status}
        </span>

        <h3>
          {event.title}
        </h3>

        <p>
          {event.description}
        </p>

        <div className="eventDetails">
          <span>
            📍 {event.venue}
          </span>

          <span>
            🕐 {event.time}
          </span>
        </div>

        <div className="eventBottom">

          <strong>
            ₹{event.price}
          </strong>

          <button
            className="primaryBtn small"
            onClick={onBook}
          >
            Book Now
          </button>

        </div>

        <button
          className="waitlistBtn"
          onClick={onWaitlist}
        >
          Join Waitlist
        </button>

      </div>

    </div>
  );
}

export default App;