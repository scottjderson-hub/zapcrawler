# 📬 MailBox Crawler

**Advanced Email Management & Discovery Platform**

MailBox Crawler is a comprehensive email management platform that enables users to connect, sync, and extract data from multiple email accounts across different protocols. Built with enterprise-grade architecture, it supports bulk operations, real-time synchronization, and intelligent auto-detection.

![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)
![React](https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)
![Node.js](https://img.shields.io/badge/Node.js-43853D?style=for-the-badge&logo=node.js&logoColor=white)
![MongoDB](https://img.shields.io/badge/MongoDB-4EA94B?style=for-the-badge&logo=mongodb&logoColor=white)
![Supabase](https://img.shields.io/badge/Supabase-3ECF8E?style=for-the-badge&logo=supabase&logoColor=white)

## 🚀 Key Features

### 📧 **Multi-Protocol Email Support**
- **IMAP**: Full support with SSL/TLS encryption
- **Exchange**: Microsoft Exchange Web Services (EWS) integration
- **POP3**: Legacy protocol support
- **Auto-Detection**: Intelligent server configuration discovery

### 🔄 **Advanced Synchronization**
- **Real-time Sync**: Live progress tracking with WebSocket updates
- **Folder Management**: Selective folder synchronization
- **Batch Processing**: Optimized for large email volumes
- **Background Jobs**: Queue-based processing with BullMQ

### 🎯 **Bulk Operations**
- **Bulk Account Import**: CSV/JSON file support
- **Auto-Detection**: Instant IMAP server discovery
- **Proxy Support**: SOCKS5 proxy integration
- **Cancellation System**: True backend-level operation cancellation
- **Progress Tracking**: Real-time status updates for each account

### 🔐 **Security & Privacy**
- **Encrypted Storage**: Secure credential management
- **Proxy Integration**: Anonymous connection support
- **Input Validation**: Comprehensive security middleware
- **Error Handling**: Graceful failure management

## 🏗️ Architecture Overview

### **Frontend (React + TypeScript)**
```
src/
├── components/          # Reusable UI components
│   ├── BulkAddManager.tsx    # Bulk import functionality
│   ├── EmailAccountCard.tsx  # Account management
│   └── ui/                   # Shadcn/ui components
├── pages/               # Application pages
│   ├── EmailAccounts.tsx     # Main dashboard
│   └── Settings.tsx          # Configuration
├── hooks/               # Custom React hooks
├── contexts/            # React context providers
└── lib/                 # Utilities and API client
```

### **Backend (Node.js + Express)**
```
backend/src/
├── controllers/         # API route handlers
│   ├── emailController.ts    # Email operations
│   └── proxyController.ts    # Proxy management
├── services/            # Business logic
│   ├── emailService.ts       # Core email operations
│   ├── autoDetectionService.ts # Server auto-detection
│   ├── cancellationService.ts # Operation cancellation
│   └── protocols/            # Protocol handlers
│       ├── imap.ts           # IMAP implementation
│       ├── exchange.ts       # Exchange EWS
│       └── pop3.ts           # POP3 support
├── workers/             # Background job processing
│   └── emailWorker.ts        # Email sync worker
├── middleware/          # Express middleware
├── models/              # Data models
└── utils/               # Utilities
```

### **Data Layer**
- **Primary Database**: Supabase (PostgreSQL)
- **Real-time Updates**: Supabase Realtime
- **Job Queue**: Redis + BullMQ
- **Caching**: In-memory + Redis

## 🛠️ Technology Stack

| Component | Technology | Purpose |
|-----------|------------|----------|
| **Frontend** | React 18 + TypeScript | Modern UI with type safety |
| **Styling** | Tailwind CSS + Shadcn/ui | Responsive design system |
| **Backend** | Node.js + Express | RESTful API server |
| **Database** | Supabase (PostgreSQL) | Primary data storage |
| **Real-time** | Supabase Realtime | Live updates |
| **Queue** | BullMQ + Redis | Background job processing |
| **Email Protocols** | imapflow, ews-javascript-api | Protocol implementations |
| **State Management** | React Query (TanStack) | Server state management |
| **Validation** | Zod | Runtime type validation |

## 🚦 Getting Started

### Prerequisites
- Node.js 18+
- Redis server
- Supabase project

### Installation

1. **Clone the repository**
```bash
git clone <repository-url>
cd mail-discovery-central
```

2. **Install dependencies**
```bash
# Frontend
npm install

# Backend
cd backend
npm install
```

3. **Environment Configuration**
```bash
# Copy environment files
cp .env.example .env
cp backend/.env.example backend/.env
```

4. **Configure environment variables**
```env
# Frontend (.env)
VITE_API_BASE_URL=http://localhost:3001
VITE_WS_URL=ws://localhost:3001

# Backend (backend/.env)
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_supabase_key
REDIS_URL=redis://localhost:6379
PORT=3001
```

5. **Start the application**
```bash
# Terminal 1: Backend
cd backend
npm run dev

# Terminal 2: Frontend
npm run dev
```

## 📋 Usage Examples

### Adding Email Accounts

**Single Account:**
```typescript
// Auto-detection
const result = await autoDetectEmailSettings({
  email: 'user@domain.com',
  password: 'password',
  proxyId: 'optional-proxy-id'
});

// Manual configuration
const account = await addEmailAccount({
  email: 'user@domain.com',
  provider: 'IMAP',
  auth: {
    host: 'imap.domain.com',
    port: 993,
    secure: true,
    user: 'user@domain.com',
    pass: 'password'
  }
});
```

**Bulk Import:**
```json
[
  {
    "email": "user1@domain.com",
    "password": "password1"
  },
  {
    "email": "user2@domain.com",
    "password": "password2"
  }
]
```

### Synchronizing Emails

```typescript
// Start sync job
const syncJob = await startEmailSync({
  accountId: 'account-id',
  folders: ['INBOX', 'Sent'],
  options: {
    limit: 1000,
    since: new Date('2024-01-01')
  }
});

// Monitor progress
syncJob.on('progress', (progress) => {
  console.log(`Progress: ${progress.percentage}%`);
});
```

## 🔧 Configuration

### Proxy Configuration
```typescript
// SOCKS5 Proxy
const proxy = {
  type: 'SOCKS5',
  host: '127.0.0.1',
  port: 1080,
  auth: {
    username: 'user',
    password: 'pass'
  }
};
```

### Auto-Detection Settings
```typescript
// Server detection configuration
const detectionConfig = {
  maxAttempts: 3,
  timeout: 10000,
  protocols: ['IMAP', 'Exchange'],
  fallbackToPresets: false
};
```

## 📊 Monitoring & Debugging

### Real-time Updates
The application provides real-time updates for:
- Sync job progress
- Account status changes
- Error notifications
- System health metrics

### Logging
```bash
# Backend logs
tail -f backend/logs/app.log

# Worker logs
tail -f backend/logs/worker.log
```

## 🛣️ Roadmap

### Current Status ✅
- [x] Multi-protocol email support (IMAP, Exchange, POP3)
- [x] Bulk account import with auto-detection
- [x] Real-time synchronization with progress tracking
- [x] SOCKS5 proxy support
- [x] True backend cancellation system
- [x] Modern React UI with dark mode

### Next Phase 🚧
- [ ] Email parsing and contact extraction
- [ ] Advanced search and filtering
- [ ] Export functionality (CSV, JSON)
- [ ] Email analytics and insights
- [ ] API rate limiting and throttling
- [ ] Multi-tenant support

### Future Enhancements 🔮
- [ ] Machine learning for email categorization
- [ ] Advanced security features
- [ ] Mobile application
- [ ] Integration APIs
- [ ] Enterprise SSO support

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

### Development Workflow
1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

For support and questions:
- 📧 Email: support@mailboxcrawler.com
- 💬 Discord: [Join our community](https://discord.gg/mailboxcrawler)
- 📖 Documentation: [docs.mailboxcrawler.com](https://docs.mailboxcrawler.com)

---

**Built with ❤️ by the MailBox Crawler Team**