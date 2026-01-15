/**
 * Represents a single email account connected to the system.
 */
export interface EmailAccount {
  _id: string;
  id: string;
  email: string;
  provider: string;
  protocol: 'IMAP' | 'POP3';
  status: 'connected' | 'error' | 'syncing' | 'disconnected';
  lastSync: string;
  totalEmails: number;
  authMethod: 'OAuth2' | 'App Password';
  auth: {
    host: string;
    port: number;
    secure: boolean;
    username: string;
  };
  folderCount?: number; // Optional folder count from account creation
}
