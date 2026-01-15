🔧 Task: Add Debug Layer to POP3/IMAP Connector

I’m getting connection or login validation errors but I’m not sure which step is failing — DNS resolution, SSL handshake, login failure, or folder retrieval.

Request:
Please add a structured debug/log layer to the codebase that:

✅ Logs:
- Protocol being used (IMAP or POP3)
- Hostname, port, and TLS mode
- Step-by-step connection events (connect, handshake, login, folder fetch)
- IMAP/POP3 raw server responses (e.g. `+OK`, `NO`, or `BAD`)
- Any thrown exceptions with full trace
- Time taken for each step (optional)



🎯 Goal:
- Help me quickly locate the failure point when connection/login fails
- Make debugging email login failures reproducible across all providers

Language:
- This project is written in Node.js (for connector), and Python (for email parsing). Apply debug to both if relevant.

Example (Node.js IMAP):
```js
console.debug("Connecting to IMAP server: imap.gmail.com:993 (TLS: true)");
imap.connect().then(() => {
  console.debug("Connected.");
  return imap.login(email, password);
}).catch(err => {
  console.error("❌ Login failed:", err);
});
