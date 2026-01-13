const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Database files
const DB_FILE = path.join(__dirname, 'users.json');
const MESSAGES_FILE = path.join(__dirname, 'messages.json');

// Initialize database
function initDatabase() {
    if (!fs.existsSync(DB_FILE)) {
        fs.writeFileSync(DB_FILE, JSON.stringify({ users: [], sessions: {} }));
    }
    
    if (!fs.existsSync(MESSAGES_FILE)) {
        fs.writeFileSync(MESSAGES_FILE, JSON.stringify({}));
    }
}

initDatabase();

// Helper functions
function readDB() {
    try {
        const data = fs.readFileSync(DB_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        return { users: [], sessions: {} };
    }
}

function writeDB(data) {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

function readMessages() {
    try {
        const data = fs.readFileSync(MESSAGES_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        return {};
    }
}

function writeMessages(data) {
    fs.writeFileSync(MESSAGES_FILE, JSON.stringify(data, null, 2));
}

// Simple hash function (use bcrypt in production)
function hashPassword(password) {
    return crypto.createHash('sha256').update(password).digest('hex');
}

function generateToken() {
    return crypto.randomBytes(32).toString('hex');
}

// In-memory storage for active connections
const activeUsers = new Map(); // token -> user data
const communities = new Map(); // community name -> Set of tokens
communities.set('global', new Set());

wss.on('connection', (ws, req) => {
    let userToken = null;
    let username = null;
    let displayName = null;
    let currentCommunity = 'global';
    let isGhost = false;

    // Send message to all users in community
    function broadcastToCommunity(message, excludeSelf = true) {
        const communityUsers = communities.get(currentCommunity) || new Set();
        
        wss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN && client.token) {
                const clientToken = client.token;
                if (communityUsers.has(clientToken)) {
                    if (!excludeSelf || clientToken !== userToken) {
                        client.send(JSON.stringify(message));
                    }
                }
            }
        });
    }

    ws.on('message', (data) => {
        try {
            const message = JSON.parse(data);
            
            switch (message.type) {
                case 'login':
                    handleLogin(message);
                    break;
                    
                case 'restore_session':
                    handleRestoreSession(message);
                    break;
                    
                case 'join_community':
                    handleJoinCommunity(message);
                    break;
                    
                case 'chat_message':
                    handleChatMessage(message);
                    break;
                    
                case 'get_users':
                    handleGetUsers();
                    break;
                    
                case 'change_display_name':
                    handleChangeDisplayName(message);
                    break;
                    
                case 'toggle_ghost':
                    isGhost = !isGhost;
                    ws.send(JSON.stringify({
                        type: 'ghost_toggled',
                        isGhost: isGhost
                    }));
                    break;
                    
                case 'get_history':
                    handleGetHistory(message);
                    break;
                    
                case 'ping':
                    ws.send(JSON.stringify({ type: 'pong' }));
                    break;
            }
        } catch (error) {
            console.error('Error processing message:', error);
        }
    });

    function handleLogin(message) {
        const { username: inputUsername, password } = message;
        
        if (!inputUsername || !password) {
            ws.send(JSON.stringify({
                type: 'error',
                message: 'Username and password required'
            }));
            return;
        }

        const db = readDB();
        const existingUser = db.users.find(u => u.username === inputUsername);
        
        if (existingUser) {
            // Login existing user
            if (existingUser.passwordHash === hashPassword(password)) {
                setupUserSession(inputUsername, existingUser.displayName || inputUsername);
            } else {
                ws.send(JSON.stringify({
                    type: 'error',
                    message: 'Invalid credentials'
                }));
            }
        } else {
            // Register new user
            const newUser = {
                username: inputUsername,
                passwordHash: hashPassword(password),
                displayName: inputUsername,
                createdAt: new Date().toISOString()
            };
            db.users.push(newUser);
            writeDB(db);
            
            setupUserSession(inputUsername, inputUsername);
        }
    }

    function setupUserSession(usernameParam, displayNameParam) {
        username = usernameParam;
        displayName = displayNameParam;
        userToken = generateToken();
        ws.token = userToken;
        
        // Save session
        const db = readDB();
        db.sessions[userToken] = {
            username: username,
            displayName: displayName,
            createdAt: new Date().toISOString()
        };
        writeDB(db);
        
        // Join global community
        communities.get('global').add(userToken);
        activeUsers.set(userToken, {
            username: username,
            displayName: displayName,
            community: 'global',
            isGhost: false
        });
        
        // Send success response
        ws.send(JSON.stringify({
            type: 'login_success',
            token: userToken,
            username: username,
            displayName: displayName
        }));
        
        // Broadcast join message
        if (!isGhost) {
            broadcastToCommunity({
                type: 'user_joined',
                username: username,
                community: 'global',
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            }, false);
        }
        
        console.log(`User ${username} logged in`);
    }

    function handleRestoreSession(message) {
        const db = readDB();
        const session = db.sessions[message.token];
        
        if (session) {
            userToken = message.token;
            ws.token = userToken;
            username = session.username;
            displayName = session.displayName;
            
            // Join global community
            communities.get('global').add(userToken);
            activeUsers.set(userToken, {
                username: username,
                displayName: displayName,
                community: 'global',
                isGhost: false
            });
            
            ws.send(JSON.stringify({
                type: 'session_restored',
                username: username,
                displayName: displayName
            }));
            
            console.log(`Session restored for ${username}`);
        }
    }

    function handleJoinCommunity(message) {
        if (!userToken) return;
        
        const communityName = message.community.toLowerCase();
        
        // Leave current community
        const oldCommunity = currentCommunity;
        if (oldCommunity && communities.has(oldCommunity)) {
            communities.get(oldCommunity).delete(userToken);
            
            if (!isGhost) {
                broadcastToCommunity({
                    type: 'user_left',
                    username: username,
                    community: oldCommunity,
                    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                });
            }
        }
        
        // Join new community
        currentCommunity = communityName;
        if (!communities.has(communityName)) {
            communities.set(communityName, new Set());
        }
        communities.get(communityName).add(userToken);
        
        // Update user data
        const userData = activeUsers.get(userToken);
        if (userData) {
            userData.community = communityName;
        }
        
        // Get community users
        const communityUsers = Array.from(communities.get(communityName))
            .map(token => activeUsers.get(token))
            .filter(Boolean)
            .map(user => ({
                username: user.username,
                displayName: user.displayName
            }));
        
        // Get chat history
        const messages = readMessages();
        const communityHistory = messages[communityName] || [];
        
        // Send response
        ws.send(JSON.stringify({
            type: 'community_joined',
            community: communityName,
            users: communityUsers,
            history: communityHistory.slice(-100)
        }));
        
        // Broadcast join message
        if (!isGhost) {
            broadcastToCommunity({
                type: 'user_joined',
                username: username,
                community: communityName,
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            }, false);
        }
    }

    function handleChatMessage(message) {
        if (!userToken || !message.content) return;
        
        const timestamp = new Date().toLocaleTimeString([], { 
            hour: '2-digit', 
            minute: '2-digit' 
        });
        
        const chatMessage = {
            type: 'chat_message',
            username: username,
            displayName: displayName,
            community: currentCommunity,
            content: message.content,
            timestamp: timestamp,
            isCommand: message.content.startsWith('/')
        };
        
        // Save message
        const messages = readMessages();
        if (!messages[currentCommunity]) {
            messages[currentCommunity] = [];
        }
        messages[currentCommunity].push({
            ...chatMessage,
            time: new Date().toISOString()
        });
        
        // Keep only last 1000 messages per community
        if (messages[currentCommunity].length > 1000) {
            messages[currentCommunity] = messages[currentCommunity].slice(-1000);
        }
        
        writeMessages(messages);
        
        // Broadcast
        broadcastToCommunity(chatMessage);
        
        // Handle commands
        if (chatMessage.isCommand) {
            handleCommand(chatMessage.content);
        }
    }

    function handleCommand(command) {
        const parts = command.split(' ');
        const cmd = parts[0].toLowerCase();
        
        switch (cmd) {
            case '/users':
                handleGetUsers();
                break;
            case '/whoami':
                ws.send(JSON.stringify({
                    type: 'command_response',
                    content: `Username: ${username}\nDisplay Name: ${displayName}\nCommunity: ${currentCommunity}\nGhost Mode: ${isGhost ? 'ON' : 'OFF'}`
                }));
                break;
            case '/nick':
                if (parts.length > 1) {
                    handleChangeDisplayName({ displayName: parts.slice(1).join(' ') });
                }
                break;
        }
    }

    function handleGetUsers() {
        const communityUsers = Array.from(communities.get(currentCommunity) || [])
            .map(token => activeUsers.get(token))
            .filter(Boolean)
            .map(user => user.displayName || user.username);
        
        ws.send(JSON.stringify({
            type: 'users_list',
            users: communityUsers,
            count: communityUsers.length
        }));
    }

    function handleChangeDisplayName(message) {
        if (!userToken || !message.displayName) return;
        
        const newDisplayName = message.displayName.trim();
        if (newDisplayName.length === 0) return;
        
        displayName = newDisplayName;
        
        // Update active user
        const userData = activeUsers.get(userToken);
        if (userData) {
            userData.displayName = newDisplayName;
        }
        
        // Update database
        const db = readDB();
        if (db.sessions[userToken]) {
            db.sessions[userToken].displayName = newDisplayName;
        }
        
        const user = db.users.find(u => u.username === username);
        if (user) {
            user.displayName = newDisplayName;
        }
        
        writeDB(db);
        
        ws.send(JSON.stringify({
            type: 'display_name_changed',
            displayName: newDisplayName
        }));
    }

    function handleGetHistory(message) {
        const community = message.community || currentCommunity;
        const messages = readMessages();
        const history = messages[community] || [];
        
        ws.send(JSON.stringify({
            type: 'chat_history',
            messages: history.slice(-100),
            community: community
        }));
    }

    ws.on('close', () => {
        if (userToken) {
            // Remove from active users
            activeUsers.delete(userToken);
            
            // Remove from all communities
            communities.forEach((users, community) => {
                if (users.has(userToken)) {
                    users.delete(userToken);
                    
                    // Notify other users
                    if (!isGhost) {
                        wss.clients.forEach(client => {
                            if (client !== ws && client.readyState === WebSocket.OPEN && client.token) {
                                const clientCommunity = activeUsers.get(client.token)?.community;
                                if (clientCommunity === community) {
                                    client.send(JSON.stringify({
                                        type: 'user_left',
                                        username: username,
                                        community: community,
                                        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                                    }));
                                }
                            }
                        });
                    }
                }
            });
            
            console.log(`User ${username} disconnected`);
        }
    });

    // Send welcome message
    setTimeout(() => {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
                type: 'system',
                content: '[SYS] > Connected to Terminal Chat'
            }));
        }
    }, 100);
});

// Serve static files
app.use(express.static(path.join(__dirname, '../public')));

// API endpoint for stats
app.get('/api/stats', (req, res) => {
    res.json({
        totalUsers: activeUsers.size,
        communities: Array.from(communities.entries()).map(([name, users]) => ({
            name,
            userCount: users.size
        }))
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`
╔══════════════════════════════════════╗
║  TERMINAL CHAT SERVER v1.0          ║
║                                      ║
║  Server running on port ${PORT}          ║
║  Ready for connections...           ║
╚══════════════════════════════════════╝
    `);
});