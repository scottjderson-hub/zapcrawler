declare module 'node-pop3' {
  interface Pop3SimpleConfig {
    host: string;
    port?: number;
    user: string;
    password: string;
    tls?: boolean;
    tlserrs?: boolean;
    timeout?: number;
  }

  interface MessageInfo {
    messageNumber: number;
    size: number;
  }

  interface EmailMessage {
    headers: Record<string, string | string[]>;
    body: string;
    text: string;
    html: string;
    attachments: any[];
  }

  export default class Pop3Simple {
    constructor(config: Pop3SimpleConfig);
    connect(): Promise<void>;
    QUIT(): Promise<void>;
    STAT(): Promise<{ count: number; size: number }>;
    LIST(): Promise<MessageInfo[]>;
    RETR(msgNumber: number): Promise<EmailMessage>;
    DELE(msgNumber: number): Promise<void>;
    NOOP(): Promise<void>;
  }
}
