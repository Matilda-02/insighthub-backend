require("dotenv").config();
const express = require("express");
const cors = require("cors");
const bcrypt = require("bcrypt");

const pool = require("./database/db");

const app = express();

app.use(cors({
  origin: "*",
  methods: ["GET", "POST", "PUT", "DELETE"],
  allowedHeaders: ["Content-Type"]
}));

app.use(express.json());

app.get("/", (req, res) => {
  res.send("InsightHub API is running...");
});

app.post("/register", async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: "All fields are required" });
    }

    if (!email.includes("@")) {
      return res.status(400).json({ error: "Invalid email format" });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters" });
    }

    const existingUser = await pool.query(
      "SELECT * FROM users WHERE email = $1",
      [email]
    );

    if (existingUser.rows.length > 0) {
      return res.status(400).json({ error: "Email already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const result = await pool.query(
      "INSERT INTO users (name, email, password) VALUES ($1, $2, $3) RETURNING *",
      [name, email, hashedPassword]
    );

    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    const result = await pool.query(
      "SELECT * FROM users WHERE email = $1",
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ error: "User not found" });
    }

    const user = result.rows[0];

    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(400).json({ error: "Invalid password" });
    }

    res.json({
      message: "Login successful",
      user: user,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/create-research-table", async (req, res) => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS research (
        id SERIAL PRIMARY KEY,
        title VARCHAR(200),
        abstract TEXT,
        department VARCHAR(100),
        year VARCHAR(10),
        file_url TEXT,
        user_id INTEGER REFERENCES users(id),
        status VARCHAR(20) DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    res.send("Research table created");
  } catch (err) {
    res.status(500).send("Error creating table");
  }
});

app.post("/add-research", async (req, res) => {
  try {
    const { title, abstract, department, year, file_url, user_id } = req.body;

    const result = await pool.query(
      `INSERT INTO research (title, abstract, department, year, file_url, user_id)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [title, abstract, department, year, file_url, user_id]
    );

    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/research", async (req, res) => {
  try {
    const { search, department, year } = req.query;

    let query = "SELECT * FROM research WHERE 1=1";
    let values = [];

    if (search) {
      values.push(`%${search}%`);
      query += ` AND title ILIKE $${values.length}`;
    }

    if (department) {
      values.push(department);
      query += ` AND department = $${values.length}`;
    }

    if (year) {
      values.push(year);
      query += ` AND year = $${values.length}`;
    }

    query += " ORDER BY created_at DESC";

    const result = await pool.query(query, values);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put("/approve-research/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { user_id } = req.body;

    const userResult = await pool.query(
      "SELECT role FROM users WHERE id = $1",
      [user_id]
    );

    if (userResult.rows.length === 0) {
      return res.status(400).json({ error: "User not found" });
    }

    if (userResult.rows[0].role !== "admin") {
      return res.status(403).json({ error: "Access denied" });
    }

    const result = await pool.query(
      "UPDATE research SET status = 'approved' WHERE id = $1 RETURNING *",
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Research not found" });
    }

    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put("/update-research/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { title, abstract, department, year, file_url } = req.body;

    const result = await pool.query(
      `UPDATE research 
       SET title=$1, abstract=$2, department=$3, year=$4, file_url=$5
       WHERE id=$6 RETURNING *`,
      [title, abstract, department, year, file_url, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Research not found" });
    }

    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/delete-research/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      "DELETE FROM research WHERE id = $1 RETURNING *",
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Research not found" });
    }

    res.json({ message: "Research deleted" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});