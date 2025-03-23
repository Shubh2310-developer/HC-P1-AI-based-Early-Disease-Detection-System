const express = require('express');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const app = express();
const port = 3001;

// PostgreSQL connection
const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'Chatbot_UI',
    password: 'ChampioN@123',  // Change this in production
    port: 5432,
});

pool.connect()
    .then(() => console.log('Connected to PostgreSQL'))
    .catch(err => console.error('PostgreSQL connection error:', err));

// Initialize database tables
const initDatabase = async () => {
    try {
        // Create users table if it doesn't exist
        await pool.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                email VARCHAR(255) UNIQUE NOT NULL,
                password VARCHAR(255) NOT NULL,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('Database tables initialized');
    } catch (error) {
        console.error('Error initializing database:', error);
    }
};

initDatabase();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public')); // Serve static files from 'public' directory

// Secret key for JWT
const JWT_SECRET = 'your-secret-key'; // Change this to a secure random string in production

// Signup route
app.post('/api/signup', async (req, res) => {
    try {
        const { name, email, password } = req.body;
        
        // Check if user already exists
        const existingUser = await pool.query(
            'SELECT * FROM users WHERE email = $1',
            [email]
        );
        
        if (existingUser.rows.length > 0) {
            return res.status(400).json({ 
                message: 'Email already in use',
                field: 'email'
            });
        }
        
        // Hash password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);
        
        // Insert new user
        const result = await pool.query(
            'INSERT INTO users (name, email, password) VALUES ($1, $2, $3) RETURNING id, name, email, created_at',
            [name, email, hashedPassword]
        );
        
        const user = result.rows[0];
        
        // Generate JWT token
        const token = jwt.sign(
            { id: user.id, email: user.email }, 
            JWT_SECRET,
            { expiresIn: '1d' }
        );
        
        // Send response
        res.status(201).json({
            message: 'User created successfully',
            userId: user.id,
            name: user.name,
            email: user.email,
            token
        });
    } catch (error) {
        console.error('Signup error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Login route
app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        // Find user
        const result = await pool.query(
            'SELECT * FROM users WHERE email = $1',
            [email]
        );
        
        if (result.rows.length === 0) {
            return res.status(400).json({ 
                message: 'Invalid email or password',
                field: 'email'
            });
        }
        
        const user = result.rows[0];
        
        // Verify password
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ 
                message: 'Invalid email or password',
                field: 'password'
            });
        }
        
        // Generate JWT token
        const token = jwt.sign(
            { id: user.id, email: user.email }, 
            JWT_SECRET,
            { expiresIn: '1d' }
        );
        
        // Send response
        res.status(200).json({
            message: 'Login successful',
            userId: user.id,
            name: user.name,
            email: user.email,
            token
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Protected route example
app.get('/api/user', authenticateToken, async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT id, name, email, created_at FROM users WHERE id = $1',
            [req.userId]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'User not found' });
        }
        
        res.json(result.rows[0]);
    } catch (error) {
        console.error('Get user error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Middleware to authenticate JWT token
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) {
        return res.status(401).json({ message: 'Access denied. No token provided.' });
    }
    
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.userId = decoded.id;
        next();
    } catch (error) {
        res.status(403).json({ message: 'Invalid token' });
    }
}

// Start server
app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
});