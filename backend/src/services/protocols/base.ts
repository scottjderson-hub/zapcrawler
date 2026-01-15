import { EventEmitter } from 'events';
import { EmailProtocolHandler, EmailFolder, EmailMessage, SyncOptions } from '../../types/email';

export abstract class BaseProtocolHandler extends EventEmitter implements EmailProtocolHandler {
  public connected: boolean = false;
  protected connection: unknown = null;
  
  abstract testConnection(auth: unknown): Promise<boolean>;
  abstract getFolders(): Promise<EmailFolder[]>;
  abstract syncMessages(options: SyncOptions): AsyncGenerator<EmailMessage>;
  abstract getMessage(messageId: string): Promise<EmailMessage>;
  
  async disconnect(): Promise<void> {
    this.connected = false;
    this.connection = null;
    this.emit('disconnected');
  }
  
  protected emitProgress(progress: {
    processed: number;
    total: number;
    folder: string;
    status: 'syncing' | 'completed' | 'error';
    error?: string;
  }): void {
    this.emit('progress', progress);
  }
  
  protected normalizeFolders(folders: Array<{
    name: string;
    path: string;
    delimiter?: string;
    flags?: string[];
    specialUse?: string[];
    messages?: number;
    unseen?: number;
  }>): EmailFolder[] {
    return folders.map(folder => ({
      name: folder.name,
      path: folder.path,
      delimiter: folder.delimiter || '/',
      flags: folder.flags || [],
      specialUse: folder.specialUse || [],
      messages: folder.messages || 0,
      unseen: folder.unseen || 0,
    }));
  }
}
