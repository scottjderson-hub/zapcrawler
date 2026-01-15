export interface ProxyConfig {
  host: string;
  port: number;
  type: number; // 4 for SOCKS4, 5 for SOCKS5, 1 for HTTP
  userId?: string;
  password?: string;
}

export interface EmailAccount {
  id: string;
  email: string;
  provider: string;
  auth: {
    type: 'password' | 'oauth2' | 'appPassword';
    [key: string]: any;
  };
  status: 'connected' | 'disconnected' | 'error' | 'syncing';
  lastSync?: Date;
  createdAt: Date;
  updatedAt: Date;
  errorMessage?: string;
  proxy_id?: string;
  proxy?: ProxyConfig;
}

export interface SyncOptions {
  folders?: string[];
  since?: Date;
  batchSize?: number;
}

export interface ExportOptions {
  format: 'csv' | 'json' | 'xlsx';
  includeHeaders?: boolean;
  fields?: string[];
}

export interface EmailMessage {
  id: string;
  threadId?: string;
  subject: string;
  from: EmailAddress;
  to: EmailAddress[];
  cc?: EmailAddress[];
  bcc?: EmailAddress[];
  date: Date;
  body: string;
  html?: string;
  text?: string;
  attachments?: EmailAttachment[];
  flags?: string[];
  labels?: string[];
  folder?: string;
}

export interface EmailAddress {
  name?: string;
  address: string;
}

export interface EmailAttachment {
  filename: string;
  contentType: string;
  size: number;
  content: Buffer;
  contentId?: string;
  contentDisposition?: 'inline' | 'attachment';
}

export interface SyncProgress {
  processed: number;
  total: number;
  folder: string;
  status: 'idle' | 'syncing' | 'completed' | 'error';
  lastMessageDate?: Date;
  error?: string;
}

export interface EmailFolder {
  name: string;
  path: string;
  delimiter: string;
  flags: string[];
  specialUse?: string[];
  messages?: number;
  unseen?: number;
}

export type EmailProtocol = 'imap' | 'pop3' | 'exchange';

export interface EmailProtocolHandler {
  testConnection(auth: any): Promise<boolean>;
  getFolders(): Promise<EmailFolder[]>;
  syncMessages(options: SyncOptions): AsyncGenerator<EmailMessage>;
  getMessage(messageId: string): Promise<EmailMessage>;
  disconnect(): Promise<void>;
}
