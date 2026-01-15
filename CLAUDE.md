# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Frontend (React/Vite)
- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run build:dev` - Build in development mode
- `npm run lint` - Run ESLint
- `npm run preview` - Preview production build

### Backend (Node.js/Express)
- `cd backend && npm run dev` - Start both server and worker concurrently
- `cd backend && npm run dev:server` - Start API server only
- `cd backend && npm run dev:worker` - Start background worker only
- `cd backend && npm run build` - Compile TypeScript
- `cd backend && npm run start` - Start production server
- `cd backend && npm run test` - Run Jest tests

## Architecture Overview

This is an email management platform with React frontend and Node.js backend that supports multiple email protocols.

### Core Architecture Pattern
- **Frontend**: React 18 + TypeScript + Vite
- **Backend**: Node.js + Express + TypeScript  
- **Database**: Supabase (PostgreSQL) with Realtime
- **Queue System**: BullMQ + Redis for background jobs
- **UI Framework**: Shadcn/ui + Tailwind CSS
- **State Management**: TanStack Query (React Query)

### Key Services (Backend)
- **EmailService**: Core email operations orchestrator
- **Protocol Handlers**: Separate handlers for IMAP, Exchange, POP3 (extends BaseProtocolHandler)
- **AutoDetectionService**: Automatically detects email server settings
- **CancellationService**: Manages operation cancellation across the system
- **QueueService**: Background job processing with BullMQ
- **ProxyService**: SOCKS5 proxy support for connections

### Protocol Handler Pattern
All email protocol implementations extend `BaseProtocolHandler` and implement:
- `testConnection()` - Verify connection credentials
- `getFolders()` - Retrieve folder list
- `syncMessages()` - Stream email messages via AsyncGenerator
- `getMessage()` - Fetch individual message

### Database Adapter Pattern
Uses `databaseAdapter.ts` to abstract Supabase operations, allowing easy database switching if needed.

### Real-time Updates
- WebSocket connections for live progress updates
- Supabase Realtime for database change events
- Background workers emit progress events through the queue system

## Key Development Patterns

### Error Handling
- Use `express-async-errors` for automatic async error handling
- Custom error classes in `types/` directory
- Comprehensive logging with Winston

### TypeScript Configuration
- Strict TypeScript enabled
- Path aliases: `@/*` maps to `src/*` in backend
- Shared types in `types/` directories

### Bulk Operations
- Session-based operation tracking for cancellation
- AbortController integration for true backend cancellation
- Progress tracking with real-time UI updates

### Security
- SOCKS5 proxy support for anonymous connections
- Input validation with express-validator
- Helmet.js for security headers
- Rate limiting on API endpoints

## Testing
- Backend uses Jest (configured in package.json)
- No test files currently exist in project root
- Test files should follow `*.test.ts` pattern

## Important Notes
- The system supports Gmail, Outlook, Yahoo Mail, and other major providers
- Auto-detection works for 500+ email providers via server configuration presets
- Background jobs are cancellable at the database/worker level
- All email credentials are handled securely through the proxy system