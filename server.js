const express = require('express');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const multer = require('multer');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const app = express();
const port = 5500;

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadsDir = path.join(__dirname, 'uploads');
        if (!fs.existsSync(uploadsDir)) {
            fs.mkdirSync(uploadsDir);
        }
        cb(null, uploadsDir);
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + '-' + file.originalname);
    }
});

const upload = multer({ 
    storage: storage,
    fileFilter: function (req, file, cb) {
        if (file.mimetype !== 'application/pdf') {
            return cb(new Error('Only PDF files are allowed'));
        }
        cb(null, true);
    }
});

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
        
        // Create medical_reports table if it doesn't exist
        await pool.query(`
            CREATE TABLE IF NOT EXISTS medical_reports (
                object_id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id),
                prompt TEXT NOT NULL,
                medical_data JSONB NOT NULL,
                raw_text TEXT,
                img_text TEXT,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            )
        `);
        
        // Create chats table if it doesn't exist
        await pool.query(`
            CREATE TABLE IF NOT EXISTS chats (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id),
                title VARCHAR(255) DEFAULT 'New Chat',
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            )
        `);
        
        // Create chat_messages table if it doesn't exist
        await pool.query(`
            CREATE TABLE IF NOT EXISTS chat_messages (
                id SERIAL PRIMARY KEY,
                chat_id INTEGER REFERENCES chats(id) ON DELETE CASCADE,
                user_id INTEGER REFERENCES users(id),
                content TEXT NOT NULL,
                role VARCHAR(50) NOT NULL,
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

// Chat endpoints
// Create a new chat
app.post('/api/chats', authenticateToken, async (req, res) => {
    try {
        const { title } = req.body;
        const chatTitle = title || 'New Chat';
        
        const result = await pool.query(
            'INSERT INTO chats (user_id, title) VALUES ($1, $2) RETURNING *',
            [req.userId, chatTitle]
        );
        
        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error('Create chat error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Get user's chats
app.get('/api/chats', authenticateToken, async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT * FROM chats WHERE user_id = $1 ORDER BY created_at DESC',
            [req.userId]
        );
        
        res.status(200).json(result.rows);
    } catch (error) {
        console.error('Get chats error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Delete a chat
app.delete('/api/chats/:chatId', authenticateToken, async (req, res) => {
    try {
        const { chatId } = req.params;
        
        // Check if chat exists and belongs to user
        const chatCheck = await pool.query(
            'SELECT * FROM chats WHERE id = $1 AND user_id = $2',
            [chatId, req.userId]
        );
        
        if (chatCheck.rows.length === 0) {
            return res.status(404).json({ message: 'Chat not found or you do not have permission to delete it' });
        }
        
        // Delete the chat (messages will be cascade deleted due to foreign key constraint)
        await pool.query(
            'DELETE FROM chats WHERE id = $1',
            [chatId]
        );
        
        res.status(200).json({ message: 'Chat deleted successfully' });
    } catch (error) {
        console.error('Delete chat error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Add a message to a chat
app.post('/api/chats/:chatId/messages', authenticateToken, async (req, res) => {
    try {
        const { chatId } = req.params;
        const { content, role } = req.body;
        
        // Check if chat exists and belongs to user
        const chatCheck = await pool.query(
            'SELECT * FROM chats WHERE id = $1 AND user_id = $2',
            [chatId, req.userId]
        );
        
        if (chatCheck.rows.length === 0) {
            return res.status(404).json({ message: 'Chat not found or you do not have permission to add messages' });
        }
        
        // Add message
        const result = await pool.query(
            'INSERT INTO chat_messages (chat_id, user_id, content, role) VALUES ($1, $2, $3, $4) RETURNING *',
            [chatId, req.userId, content, role]
        );
        
        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error('Add message error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Get chat messages
app.get('/api/chats/:chatId/messages', authenticateToken, async (req, res) => {
    try {
        const { chatId } = req.params;
        
        // Check if chat exists and belongs to user
        const chatCheck = await pool.query(
            'SELECT * FROM chats WHERE id = $1 AND user_id = $2',
            [chatId, req.userId]
        );
        
        if (chatCheck.rows.length === 0) {
            return res.status(404).json({ message: 'Chat not found or you do not have permission to view messages' });
        }
        
        // Get messages
        const result = await pool.query(
            'SELECT * FROM chat_messages WHERE chat_id = $1 ORDER BY created_at ASC',
            [chatId]
        );
        
        res.status(200).json(result.rows);
    } catch (error) {
        console.error('Get messages error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

app.post('/api/upload-pdf', authenticateToken, upload.single('pdf'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ message: 'No PDF file uploaded' });
        }
        
        const { prompt } = req.body;
        if (!prompt) {
            return res.status(400).json({ message: 'Prompt is required' });
        }
        
        const filePath = req.file.path;
        
        // Get absolute path to Python script
        const pythonScriptPath = path.join(__dirname, 'extract_pdf.py');
        
        // Add proper error handling and logging
        console.log(`Executing: python "${pythonScriptPath}" "${filePath}" "${prompt}" ${req.userId}`);
        
        // Call Python script with absolute paths and proper escaping
        exec(`python "${pythonScriptPath}" "${filePath}" "${prompt}" ${req.userId}`, 
            { maxBuffer: 1024 * 1024 * 10 }, // Increase buffer size for large PDFs
            async (error, stdout, stderr) => {
                if (error) {
                    console.error(`Python script execution error:`, error);
                    console.error(`Python stderr:`, stderr);
                    return res.status(500).json({ 
                        message: 'Error processing PDF', 
                        error: error.message,
                        stderr: stderr
                    });
                }
                
                console.log('Python script output:', stdout);
                
                try {
                    // Parse output to extract object_id
                    const outputMatch = stdout.match(/Object ID: (\d+)/);
                    const objectId = outputMatch ? outputMatch[1] : null;
                    
                    if (!objectId) {
                        console.error('No object ID found in Python script output');
                        return res.status(500).json({ 
                            message: 'Error processing PDF: No object ID returned',
                            output: stdout
                        });
                    }
                    
                    // Get the processed data from database
                    const result = await pool.query(
                        'SELECT * FROM medical_reports WHERE object_id = $1',
                        [objectId]
                    );
                    
                    if (result.rows.length > 0) {
                        return res.status(200).json({
                            message: 'PDF processed successfully',
                            objectId: objectId,
                            data: result.rows[0]
                        });
                    } else {
                        return res.status(500).json({ 
                            message: 'PDF was processed but no database record was found',
                            objectId: objectId
                        });
                    }
                } catch (dbError) {
                    console.error('Database error after PDF processing:', dbError);
                    res.status(500).json({ 
                        message: 'Error retrieving processed data',
                        error: dbError.message 
                    });
                }
            }
        );
    } catch (error) {
        console.error('PDF upload error:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
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