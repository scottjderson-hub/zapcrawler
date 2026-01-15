You're working on a hybrid backend web app called **Mail List Fetcher**. It lets users log into their email accounts (IMAP, POP3, or Exchange), fetches emails from all folders (inbox, sent, spam, trash, custom), and extracts email addresses (from, to, cc) using a Node.js + Python architecture.

The codebase has a scaffolded frontend. The backend is divided into two services:
- A **Node.js API (Express)** that connects to email servers and fetches headers
- A **Python parser (FastAPI)** that parses those headers and returns unique email addresses

Here's how the project is structured:
