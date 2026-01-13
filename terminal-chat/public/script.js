// Terminal Chat - Main Application
class TerminalChat {
    constructor() {
        this.socket = null;
        this.token = null;
        this.username = null;
        this.displayName = null;
        this.currentCommunity = 'global';
        this.communities = new Set(['global']);
        this.isGhost = false;
        this.messageCount = 0;
        
        this.init();
    }
    
    init() {
        this.setupEventListeners();
        this.updateTime();
        setInterval(() => this.updateTime(), 1000);
        
        // Check for existing session
        this.checkExistingSession();
    }
    
    setupEventListeners() {
        // Login screen
        const loginBtn = document.getElementById('login-btn');
        const usernameInput = document.getElementById('username');
        const passwordInput = document.getElementById('password');
        
        if (loginBtn) {
            loginBtn.addEventListener('click', () => this.handleLogin());
        }
        
        if (usernameInput && passwordInput) {
            usernameInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') passwordInput.focus();
            });
            
            passwordInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') this.handleLogin();
            });
        }
        
        // Chat screen
        const chatInput = document.getElementById('chat-input');
        const addTabBtn = document.getElementById('add-tab-btn');
        const ghostBtn = document.getElementById('ghost-btn');
        const clearBtn = document.getElementById('clear-btn');
        const logoutBtn = document.getElementById('logout-btn');
        
        if (chatInput) {
            chatInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') this.sendMessage();
            });
        }
        
        if (addTabBtn) {
            addTabBtn.addEventListener('click', () => this.addNewCommunity());
        }
        
        if (ghostBtn) {
            ghostBtn.addEventListener('click', () => this.toggleGhostMode());
        }
        
        if (clearBtn) {
            clearBtn.addEventListener('click', () => this.clearChat());
        }
        
        if (logoutBtn) {
            logoutBtn.addEventListener('click', () => this.handleLogout());
        }
        
        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            // Ctrl+Number to switch tabs
            if (e.ctrlKey && e.key >= '1' && e.key <= '9') {
                e.preventDefault();
                const tabIndex = parseInt(e.key) - 1;
                this.switchToTabByIndex(tabIndex);
            }
            
            // Ctrl+T for new tab
            if (e.ctrlKey && e.key === 't') {
                e.preventDefault();
                this.addNewCommunity();
            }
            
            // Ctrl+L for clear
            if (e.ctrlKey && e.key === 'l') {
                e.preventDefault();
                this.clearChat();
            }
            
            // Ctrl+/ for help
            if (e.ctrlKey && e.key === '/') {
                e.preventDefault();
                this.showHelp();
            }
        });
    }
    
    checkExistingSession() {
        const savedToken = localStorage.getItem('terminal_chat_token');
        const savedUsername = localStorage.getItem('terminal_chat_username');
        
        if (savedToken && savedUsername) {
            this.token = savedToken;
            this.username = savedUsername;
            this.displayName = localStorage.getItem('terminal_chat_displayname') || savedUsername;
            
            this.showChatScreen();
            this.connectWebSocket();
        } else {
            this.showLoginScreen();
        }
    }
    
    showLoginScreen() {
        document.getElementById('login-screen').classList.add('active');
        document.getElementById('chat-screen').classList.remove('active');
        
        // Focus on username input
        setTimeout(() => {
            const usernameInput = document.getElementById('username');
            if (usernameInput) usernameInput.focus();
        }, 100);
    }
    
    showChatScreen() {
        document.getElementById('login-screen').classList.remove('active');
        document.getElementById('chat-screen').classList.add('active');
        
        // Update UI elements
        this.updateUserInfo();
        this.updateCommunityDisplay();
        
        // Focus on chat input
        setTimeout(() => {
            const chatInput = document.getElementById('chat-input');
            if (chatInput) chatInput.focus();
        }, 100);
    }
    
    updateUserInfo() {
        const userInfo = document.getElementById('user-info');
        if (userInfo) {
            userInfo.textContent = this.displayName || this.username;
        }
        
        const currentUser = document.getElementById('current-user');
        if (currentUser) {
            currentUser.textContent = this.displayName || this.username;
        }
    }
    
    updateCommunityDisplay() {
        const currentCommunity = document.getElementById('current-community');
        const activeCommunity = document.getElementById('active-community');
        
        if (currentCommunity) {
            currentCommunity.textContent = this.currentCommunity;
        }
        
        if (activeCommunity) {
            activeCommunity.textContent = this.currentCommunity;
        }
    }
    
    updateTime() {
        const now = new Date();
        const timeStr = now.toLocaleTimeString([], { 
            hour: '2-digit', 
            minute: '2-digit'
        });
        
        const timeElement = document.getElementById('current-time');
        if (timeElement) {
            timeElement.textContent = timeStr;
        }
    }
    
    async handleLogin() {
        const usernameInput = document.getElementById('username');
        const passwordInput = document.getElementById('password');
        
        if (!usernameInput || !passwordInput) return;
        
        const username = usernameInput.value.trim();
        const password = passwordInput.value.trim();
        
        if (!username || !password) {
            this.showSystemMessage('[ERROR] Please enter username and password');
            return;
        }
        
        if (username.length < 3) {
            this.showSystemMessage('[ERROR] Username must be at least 3 characters');
            return;
        }
        
        if (password.length < 4) {
            this.showSystemMessage('[ERROR] Password must be at least 4 characters');
            return;
        }
        
        // Show loading state
        const loginBtn = document.getElementById('login-btn');
        if (loginBtn) {
            loginBtn.disabled = true;
            loginBtn.innerHTML = '<span class="loading"></span> CONNECTING...';
        }
        
        this.username = username;
        this.showChatScreen();
        this.connectWebSocket();
        
        // Wait for connection and send login
        setTimeout(() => {
            if (this.socket && this.socket.readyState === WebSocket.OPEN) {
                this.socket.send(JSON.stringify({
                    type: 'login',
                    username: username,
                    password: password
                }));
            } else {
                this.showSystemMessage('[ERROR] Cannot connect to server');
                this.showLoginScreen();
            }
        }, 1000);
    }
    
    connectWebSocket() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}`;
        
        this.socket = new WebSocket(wsUrl);
        
        this.socket.onopen = () => {
            console.log('Connected to chat server');
            this.updateConnectionStatus('connected');
            
            if (this.token) {
                // Restore existing session
                this.socket.send(JSON.stringify({
                    type: 'restore_session',
                    token: this.token
                }));
            }
            
            // Start ping interval
            setInterval(() => {
                if (this.socket && this.socket.readyState === WebSocket.OPEN) {
                    this.socket.send(JSON.stringify({ type: 'ping' }));
                }
            }, 30000);
        };
        
        this.socket.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                this.handleSocketMessage(data);
            } catch (error) {
                console.error('Error parsing message:', error);
            }
        };
        
        this.socket.onclose = () => {
            console.log('Disconnected from server');
            this.updateConnectionStatus('disconnected');
            
            // Try to reconnect after 3 seconds
            setTimeout(() => {
                if (!this.socket || this.socket.readyState === WebSocket.CLOSED) {
                    this.connectWebSocket();
                }
            }, 3000);
        };
        
        this.socket.onerror = (error) => {
            console.error('WebSocket error:', error);
            this.updateConnectionStatus('error');
        };
    }
    
    updateConnectionStatus(status) {
        const statusElement = document.getElementById('connection-status');
        const statusDot = statusElement?.querySelector('.status-dot');
        
        if (statusElement && statusDot) {
            statusDot.classList.remove('connected');
            
            switch (status) {
                case 'connected':
                    statusElement.textContent = 'CONNECTED';
                    statusDot.classList.add('connected');
                    break;
                case 'disconnected':
                    statusElement.textContent = 'DISCONNECTED';
                    break;
                case 'error':
                    statusElement.textContent = 'ERROR';
                    break;
                default:
                    statusElement.textContent = 'CONNECTING...';
            }
        }
    }
    
    handleSocketMessage(data) {
        switch (data.type) {
            case 'login_success':
                this.handleLoginSuccess(data);
                break;
                
            case 'session_restored':
                this.handleSessionRestored(data);
                break;
                
            case 'community_joined':
                this.handleCommunityJoined(data);
                break;
                
            case 'chat_message':
                this.displayMessage(data);
                break;
                
            case 'system':
                this.showSystemMessage(data.content);
                break;
                
            case 'users_list':
                this.updateUserList(data);
                break;
                
            case 'user_joined':
                if (!this.isGhost) {
                    this.showSystemMessage(`${data.username} joined ${data.community}`);
                }
                break;
                
            case 'user_left':
                if (!this.isGhost) {
                    this.showSystemMessage(`${data.username} left ${data.community}`);
                }
                break;
                
            case 'display_name_changed':
                this.displayName = data.displayName;
                this.updateUserInfo();
                this.showSystemMessage(`Display name changed to: ${data.displayName}`);
                break;
                
            case 'ghost_toggled':
                this.isGhost = data.isGhost;
                this.showSystemMessage(`Ghost mode ${this.isGhost ? 'enabled' : 'disabled'}`);
                break;
                
            case 'command_response':
                this.showSystemMessage(data.content);
                break;
                
            case 'chat_history':
                this.loadChatHistory(data);
                break;
                
            case 'error':
                this.showSystemMessage(`[ERROR] ${data.message}`);
                break;
        }
    }
    
    handleLoginSuccess(data) {
        this.token = data.token;
        this.username = data.username;
        this.displayName = data.displayName;
        
        // Save to localStorage
        localStorage.setItem('terminal_chat_token', data.token);
        localStorage.setItem('terminal_chat_username', data.username);
        localStorage.setItem('terminal_chat_displayname', data.displayName);
        
        // Update UI
        this.updateUserInfo();
        this.showSystemMessage('Login successful! Welcome to Terminal Chat.');
        
        // Join global community
        this.joinCommunity('global');
        
        // Reset login button
        const loginBtn = document.getElementById('login-btn');
        if (loginBtn) {
            loginBtn.disabled = false;
            loginBtn.innerHTML = '<span class="btn-text">LOGIN TO CHAT</span><span class="blink">_</span>';
        }
    }
    
    handleSessionRestored(data) {
        this.displayName = data.displayName;
        this.updateUserInfo();
        this.showSystemMessage(`Session restored. Welcome back, ${data.username}!`);
        
        // Load existing communities and join current
        this.joinCommunity(this.currentCommunity);
    }
    
    handleCommunityJoined(data) {
        this.currentCommunity = data.community;
        this.updateCommunityDisplay();
        
        // Add community to tabs if not exists
        this.addCommunityTab(data.community, data.users.length);
        
        // Update user list
        this.updateUserList(data);
        
        // Load chat history
        if (data.history && data.history.length > 0) {
            this.loadChatHistory({ messages: data.history });
        }
    }
    
    addCommunityTab(communityName, userCount = 0) {
        if (this.communities.has(communityName)) return;
        
        this.communities.add(communityName);
        
        const tabsContainer = document.getElementById('community-tabs');
        const existingTab = document.querySelector(`.tab[data-community="${communityName}"]`);
        
        if (existingTab) return;
        
        const tab = document.createElement('div');
        tab.className = 'tab';
        tab.dataset.community = communityName;
        
        const tabName = document.createElement('span');
        tabName.className = 'tab-name';
        tabName.textContent = communityName;
        
        const tabCount = document.createElement('span');
        tabCount.className = 'tab-count';
        tabCount.textContent = userCount;
        
        tab.appendChild(tabName);
        tab.appendChild(tabCount);
        
        tab.addEventListener('click', () => {
            this.switchToTab(tab);
        });
        
        // Insert before add button
        const addTabBtn = document.getElementById('add-tab-btn');
        if (addTabBtn && tabsContainer) {
            tabsContainer.insertBefore(tab, addTabBtn);
        }
    }
    
    switchToTab(tabElement) {
        // Remove active class from all tabs
        document.querySelectorAll('.tab').forEach(tab => {
            tab.classList.remove('active');
        });
        
        // Add active class to clicked tab
        tabElement.classList.add('active');
        
        // Join the community
        const communityName = tabElement.dataset.community;
        this.joinCommunity(communityName);
    }
    
    switchToTabByIndex(index) {
        const tabs = document.querySelectorAll('.tab:not(.tab-add)');
        if (index < tabs.length) {
            this.switchToTab(tabs[index]);
        }
    }
    
    addNewCommunity() {
        const communityName = prompt('Enter community name:');
        if (communityName && communityName.trim()) {
            const cleanName = communityName.trim().toLowerCase();
            if (cleanName.length >= 2 && cleanName.length <= 20) {
                this.joinCommunity(cleanName);
            } else {
                this.showSystemMessage('[ERROR] Community name must be 2-20 characters');
            }
        }
    }
    
    joinCommunity(communityName) {
        if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;
        
        this.socket.send(JSON.stringify({
            type: 'join_community',
            community: communityName
        }));
        
        // Clear messages for new community
        this.clearMessages();
    }
    
    sendMessage() {
        const input = document.getElementById('chat-input');
        if (!input || !this.socket || this.socket.readyState !== WebSocket.OPEN) return;
        
        const content = input.value.trim();
        if (!content) return;
        
        // Send message
        this.socket.send(JSON.stringify({
            type: 'chat_message',
            content: content
        }));
        
        // Clear input
        input.value = '';
        input.focus();
        
        // Handle commands locally
        if (content.startsWith('/')) {
            this.handleCommand(content);
        }
    }
    
    handleCommand(command) {
        const parts = command.split(' ');
        const cmd = parts[0].toLowerCase();
        const args = parts.slice(1);
        
        switch (cmd) {
            case '/help':
                this.showHelp();
                break;
                
            case '/com':
                if (args.length > 0) {
                    this.joinCommunity(args[0]);
                } else {
                    this.showSystemMessage('[ERROR] Usage: /com <community_name>');
                }
                break;
                
            case '/users':
                if (this.socket && this.socket.readyState === WebSocket.OPEN) {
                    this.socket.send(JSON.stringify({ type: 'get_users' }));
                }
                break;
                
            case '/whoami':
                this.showSystemMessage(`Username: ${this.username}\nDisplay: ${this.displayName}\nCommunity: ${this.currentCommunity}\nGhost: ${this.isGhost ? 'ON' : 'OFF'}`);
                break;
                
            case '/nick':
                if (args.length > 0) {
                    this.changeDisplayName(args.join(' '));
                } else {
                    this.showSystemMessage('[ERROR] Usage: /nick <display_name>');
                }
                break;
                
            case '/clear':
                this.clearChat();
                break;
                
            case '/ghost':
                this.toggleGhostMode();
                break;
                
            case '/wipe':
                if (confirm('Clear all local chat history?')) {
                    this.clearChat();
                    localStorage.removeItem('terminal_chat_messages');
                    this.showSystemMessage('Chat history cleared.');
                }
                break;
        }
    }
    
    showHelp() {
        const helpText = `
Available Commands:
  /help              - Show this help
  /com <name>        - Join/create community
  /users             - Show online users
  /whoami            - Show your info
  /nick <name>       - Change display name
  /ghost             - Toggle ghost mode
  /clear             - Clear chat
  /wipe              - Clear all history
  
Keyboard Shortcuts:
  Ctrl+1-9          - Switch tabs
  Ctrl+T            - New community
  Ctrl+L            - Clear chat
  Ctrl+/            - Show help
        `;
        
        this.showSystemMessage(helpText);
    }
    
    changeDisplayName(newName) {
        if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;
        
        this.socket.send(JSON.stringify({
            type: 'change_display_name',
            displayName: newName
        }));
    }
    
    toggleGhostMode() {
        if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;
        
        this.socket.send(JSON.stringify({
            type: 'toggle_ghost'
        }));
    }
    
    displayMessage(data) {
        const messagesContainer = document.getElementById('messages');
        if (!messagesContainer) return;
        
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${data.username === this.username ? 'self' : 'user'}`;
        
        const isSystem = data.isCommand && data.username === 'system';
        
        if (isSystem) {
            messageDiv.className = 'message system';
            messageDiv.textContent = data.content;
        } else {
            const time = data.timestamp || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            const user = data.displayName || data.username;
            
            messageDiv.innerHTML = `
                <div class="message-header">
                    <span class="message-time">[${time}]</span>
                    <span class="message-user">[${user}</span>
                    <span class="message-community">@${data.community}]</span>
                </div>
                <div class="message-content">&gt; ${this.escapeHtml(data.content)}</div>
            `;
        }
        
        messagesContainer.appendChild(messageDiv);
        this.scrollToBottom();
        
        // Update message count
        this.messageCount++;
        const countElement = document.getElementById('message-count');
        if (countElement) {
            countElement.textContent = `${this.messageCount} messages`;
        }
        
        // Play sound for new messages (except your own)
        if (data.username !== this.username) {
            this.playMessageSound();
        }
    }
    
    showSystemMessage(text) {
        const messagesContainer = document.getElementById('messages');
        if (!messagesContainer) return;
        
        const messageDiv = document.createElement('div');
        messageDiv.className = 'message system';
        messageDiv.textContent = text;
        
        messagesContainer.appendChild(messageDiv);
        this.scrollToBottom();
    }
    
    updateUserList(data) {
        const userList = document.getElementById('user-list');
        const onlineCount = document.getElementById('online-count');
        
        if (!userList || !onlineCount) return;
        
        // Update count
        onlineCount.textContent = data.count || data.users.length;
        
        // Update tab count for current community
        const currentTab = document.querySelector(`.tab[data-community="${this.currentCommunity}"]`);
        if (currentTab) {
            const countElement = currentTab.querySelector('.tab-count');
            if (countElement) {
                countElement.textContent = data.count || data.users.length;
            }
        }
        
        // Update user list
        userList.innerHTML = '';
        
        if (data.users && data.users.length > 0) {
            data.users.forEach(username => {
                const userItem = document.createElement('div');
                userItem.className = 'user-item';
                userItem.textContent = username;
                userList.appendChild(userItem);
            });
        } else {
            const emptyItem = document.createElement('div');
            emptyItem.className = 'user-item';
            emptyItem.textContent = 'No users online';
            userList.appendChild(emptyItem);
        }
    }
    
    loadChatHistory(data) {
        const messagesContainer = document.getElementById('messages');
        if (!messagesContainer || !data.messages) return;
        
        // Clear existing messages
        this.clearMessages();
        
        // Add historical messages
        data.messages.forEach(msg => {
            this.displayMessage(msg);
        });
    }
    
    clearMessages() {
        const messagesContainer = document.getElementById('messages');
        if (messagesContainer) {
            messagesContainer.innerHTML = '';
            this.messageCount = 0;
            
            const countElement = document.getElementById('message-count');
            if (countElement) {
                countElement.textContent = '0 messages';
            }
        }
    }
    
    clearChat() {
        if (confirm('Clear current chat?')) {
            this.clearMessages();
            this.showSystemMessage('Chat cleared.');
        }
    }
    
    scrollToBottom() {
        const messagesContainer = document.getElementById('messages-container');
        if (messagesContainer) {
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
        }
    }
    
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    playMessageSound() {
        // Simple notification sound
        try {
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();
            
            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);
            
            oscillator.frequency.value = 800;
            oscillator.type = 'sine';
            
            gainNode.gain.setValueAtTime(0, audioContext.currentTime);
            gainNode.gain.linearRampToValueAtTime(0.1, audioContext.currentTime + 0.01);
            gainNode.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.1);
            
            oscillator.start(audioContext.currentTime);
            oscillator.stop(audioContext.currentTime + 0.1);
        } catch (e) {
            // Audio not supported, silent fail
        }
    }
    
    handleLogout() {
        if (confirm('Are you sure you want to logout?')) {
            // Clear local storage
            localStorage.removeItem('terminal_chat_token');
            localStorage.removeItem('terminal_chat_username');
            localStorage.removeItem('terminal_chat_displayname');
            
            // Close socket
            if (this.socket) {
                this.socket.close();
            }
            
            // Reset state
            this.token = null;
            this.username = null;
            this.displayName = null;
            this.currentCommunity = 'global';
            this.communities.clear();
            this.communities.add('global');
            this.isGhost = false;
            this.messageCount = 0;
            
            // Clear tabs
            const tabsContainer = document.getElementById('community-tabs');
            if (tabsContainer) {
                tabsContainer.innerHTML = `
                    <div class="tab active" data-community="global">
                        <span class="tab-name">global</span>
                        <span class="tab-count">0</span>
                    </div>
                    <div class="tab-add" id="add-tab-btn" title="Join new community">
                        <i class="fas fa-plus"></i>
                    </div>
                `;
            }
            
            // Clear inputs
            const usernameInput = document.getElementById('username');
            const passwordInput = document.getElementById('password');
            const chatInput = document.getElementById('chat-input');
            
            if (usernameInput) usernameInput.value = '';
            if (passwordInput) passwordInput.value = '';
            if (chatInput) chatInput.value = '';
            
            // Show login screen
            this.showLoginScreen();
        }
    }
}

// Initialize the application when page loads
document.addEventListener('DOMContentLoaded', () => {
    window.terminalChat = new TerminalChat();
});