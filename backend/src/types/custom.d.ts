// Type definitions for node-pop3
// Minimum TypeScript Version: 3.0

declare module 'node-pop3' {
  export interface Pop3SimpleConfig {
    host: string;
    port: number;
    tls: boolean;
    user: string;
    password: string;
    timeout?: number;
  }

  export interface Pop3MessageInfo {
    messageNumber: number;
    size: number;
  }

  export interface Pop3Message {
    header: string;
    body: string;
    size: number;
  }

  export default class Pop3Simple {
    constructor(config: Pop3SimpleConfig);
    QUIT(): Promise<void>;
    LIST(): Promise<Pop3MessageInfo[]>;
    RETR(messageNumber: number): Promise<string>;
    DELE(messageNumber: number): Promise<void>;
  }
}

// Type definitions for node-ews
declare module 'node-ews' {
  export interface EwsConfig {
    username: string;
    password: string;
    host: string;
    auth: string;
    rejectUnauthorized?: boolean;
  }

  export default class EWS {
    constructor(config: EwsConfig);
    run(
      ewsFunction: string,
      ewsArgs: Record<string, any>,
      options?: { headers?: Record<string, string> }
    ): Promise<any>;
  }
}

// Extend NodeJS.ProcessEnv to include our custom environment variables
declare namespace NodeJS {
  interface ProcessEnv {
    NODE_ENV: 'development' | 'production' | 'test';
    PORT?: string;
    CORS_ORIGIN?: string;
    RATE_LIMIT_WINDOW_MS?: string;
    RATE_LIMIT_MAX?: string;
    PYTHON_SERVICE_URL?: string;
    LOG_LEVEL?: 'error' | 'warn' | 'info' | 'http' | 'verbose' | 'debug' | 'silly';
    WS_PORT?: string;
  }
}
