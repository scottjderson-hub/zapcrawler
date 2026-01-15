const Pop3Command = require('node-pop3');
import { simpleParser, ParsedMail } from 'mailparser';
import { BaseProtocolHandler } from './base';
import { EmailMessage, EmailFolder, SyncOptions, EmailAddress, EmailAttachment } from '../../types/email';
import { logger } from '../../utils/logger';

// Extend SyncOptions to include markAsRead
interface Pop3SyncOptions extends SyncOptions {
  markAsRead?: boolean;
}

const toEmailAddress = (addr: any): EmailAddress => ({
  address: addr.address || '',
  name: addr.name || '',
});

const toEmailAddresses = (addresses: any[] | undefined): EmailAddress[] => {
  if (!addresses) return [];
  return addresses.map(toEmailAddress);
};

const toEmailAttachment = (attachment: any): EmailAttachment => ({
  filename: attachment.filename || 'untitled',
  contentType: attachment.contentType || 'application/octet-stream',
  size: attachment.size || 0,
  content: attachment.content || Buffer.from(''),
  contentId: attachment.contentId,
  contentDisposition: attachment.contentDisposition,
});

const toEmailAttachments = (attachments: any[] | undefined): EmailAttachment[] => {
  if (!attachments) return [];
  return attachments.map(toEmailAttachment);
};

export class Pop3Handler extends BaseProtocolHandler {
  private client: InstanceType<typeof Pop3Command> | null = null;
  private auth: any = null;
  private processedMessageIds: Set<number> = new Set();
  private logger = logger;

  async testConnection(auth: any): Promise<boolean> {
    try {
      await this.connect(auth);
      return true;
    } catch (error) {
      return false;
    } finally {
      if (this.client) {
        await this.disconnect();
      }
    }
  }

  async connect(auth: any): Promise<boolean> {
    if (this.connected && this.client) {
      return true;
    }
    const connectionInfo = `POP3 server: ${auth.host}:${auth.port || 110} (TLS: ${auth.tls || false})`;
    logger.debug(`Attempting to connect to ${connectionInfo}`);
    this.auth = auth;

    try {
      this.client = new Pop3Command({
        host: auth.host,
        port: auth.port || 110,
        user: auth.username,
        password: auth.password,
        tls: auth.secure || false,
        tlserrs: false,
        timeout: 30000,
      });
      await this.client.connect();
      this.connected = true;
      this.emit('connect');
      return true;
    } catch (error) {
      logger.error(`❌ POP3 connection failed for ${connectionInfo}:`, error);
      this.connected = false;
      this.client = null;
      throw error;
    }
  }

  async getFolders(): Promise<EmailFolder[]> {
    return [{
      name: 'INBOX',
      path: 'INBOX',
      delimiter: '/',
      flags: [],
      specialUse: ['\Inbox'],
    }];
  }

  private async parseRawMessage(msgNum: number, rawMessage: string): Promise<EmailMessage> {
    const parsed: ParsedMail = await simpleParser(rawMessage);

    const getAddresses = (input: any): any[] => {
      if (!input) return [];
      if (Array.isArray(input)) {
        return input.flatMap(addrObj => addrObj.value);
      }
      return input.value;
    };

    const fromAddresses = parsed.from?.value || [];
    const toAddresses = getAddresses(parsed.to);
    const ccAddresses = getAddresses(parsed.cc);
    const bccAddresses = getAddresses(parsed.bcc);

    return {
      id: `pop3-${this.auth.host}-${msgNum}`,
      threadId: parsed.messageId,
      subject: parsed.subject || '(No Subject)',
      from: toEmailAddress(fromAddresses[0]),
      to: toEmailAddresses(toAddresses),
      cc: toEmailAddresses(ccAddresses),
      bcc: toEmailAddresses(bccAddresses),
      date: parsed.date || new Date(),
      body: parsed.text || '',
      html: typeof parsed.html === 'string' ? parsed.html : '',
      text: parsed.text,
      attachments: toEmailAttachments(parsed.attachments),
      flags: [],
      folder: 'INBOX',
      labels: [],
    };
  }

  async *syncMessages(options: Pop3SyncOptions): AsyncGenerator<EmailMessage> {
    if (!this.connected || !this.client) {
      throw new Error('Not connected to POP3 server');
    }

    logger.debug('Starting POP3 sync for INBOX...');
    const [statResponse] = await this.client.command('STAT');
    const listResponse = await this.client.command('LIST');
    logger.debug({ msg: 'Raw POP3 LIST response', listResponse });
    const totalMessages = parseInt(statResponse.split(' ')[0], 10);

    // The first line of the LIST response is a status message, so we skip it.
    const messageList = listResponse.slice(1)
      .map((line: any) => {
        if (!line || (Array.isArray(line) && line.length === 0) || line === '.') return null;
        // line is expected to be an array like ['1', '1234']
        const msgNumStr = Array.isArray(line) ? line[0] : String(line).split(' ')[0];
        return parseInt(msgNumStr, 10);
      })
      .filter((num: number | null): num is number => num !== null && !isNaN(num));

    this.emitProgress({ processed: 0, total: totalMessages, folder: 'INBOX', status: 'syncing' });

    let processed = 0;
    for (const msgNum of messageList) {
      try {
        if (this.processedMessageIds.has(msgNum)) continue;

        const [, stream] = await this.client.command('RETR', msgNum);
        const rawMessage = await Pop3Command.stream2String(stream);
        const email = await this.parseRawMessage(msgNum, rawMessage);

        if (options.markAsRead) {
          await this.client.DELE(msgNum);
        }

        this.processedMessageIds.add(msgNum);
        processed++;
        this.emitProgress({ processed, total: totalMessages, folder: 'INBOX', status: 'syncing' });
        yield email;
      } catch (error) {
        logger.error(`❌ Error processing POP3 message number ${msgNum}:`, error);
        this.emitProgress({ processed, total: totalMessages, folder: 'INBOX', status: 'error', error: `Failed on message ${msgNum}` });
        // Re-throw the error to be caught by the service layer
        throw error;
      }
    }
    this.emitProgress({ processed, total: totalMessages, folder: 'INBOX', status: 'completed' });
  }

  async getMessage(messageId: string): Promise<EmailMessage> {
    if (!this.auth) {
      throw new Error('Not connected to POP3 server');
    }
    const client = new Pop3Command(this.auth);
    try {
      const msgNum = parseInt(messageId, 10);
      const [, stream] = await client.command('RETR', msgNum);
      const rawMessage = await Pop3Command.stream2String(stream);
      return this.parseRawMessage(msgNum, rawMessage);
    } finally {
      await client.QUIT();
    }
  }

  override async disconnect(): Promise<void> {
    if (this.client) {
      try {
        await this.client.QUIT();
      } catch (e) {
        // Ignore errors on disconnect
      }
      this.client = null;
    }
    await super.disconnect();
  }
}
