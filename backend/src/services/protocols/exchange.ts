import {
  ExchangeService,
  ExchangeCredentials,
  WebCredentials,
  Uri,
  WellKnownFolderName,
  FolderView,
  ItemView,
  PropertySet,
  BasePropertySet,
  EmailMessage as EwsEmailMessage,
  Mailbox,
  FindFoldersResults,
  Folder,
  ItemId,
  FolderId,
  BodyType,
  EmailAddress as EwsEmailAddress
} from 'ews-javascript-api';
import { EmailFolder, EmailMessage, SyncOptions, EmailAddress, EmailAttachment } from '../../types/email';
import { BaseProtocolHandler } from './base';
import { logger } from '../../utils/logger';

// Define the shape of the auth object we expect
interface ExchangeAuth {
  username: string;
  password: string;
  host: string; // This should be the EWS endpoint URL, e.g., https://outlook.office365.com/EWS/Exchange.asmx
}

export class ExchangeHandler extends BaseProtocolHandler {
  protected connection: ExchangeService | null = null;


  async testConnection(auth: any): Promise<boolean> {
    try {
      await this.connect(auth);
      return true;
    } catch (error) {
      logger.error('Exchange connection test failed:', error);
      return false;
    } finally {
      await this.disconnect();
    }
  }

  async connect(auth: ExchangeAuth): Promise<boolean> {
    if (this.connected && this.connection) {
      return true;
    }

    try {
      const service = new ExchangeService();
      service.Credentials = new WebCredentials(auth.username, auth.password);
      service.Url = new Uri(auth.host);

      // The ews-javascript-api doesn't have a simple 'connect' or 'ping'.
      // We test the connection by making a lightweight request.
      await service.FindFolders(WellKnownFolderName.MsgFolderRoot, new FolderView(1));

      this.connection = service;
      this.connected = true;
      this.emit('connected');
      return true;
    } catch (error) {
      this.connection = null;
      this.connected = false;
      logger.error('Failed to connect to Exchange server:', error);
      throw error;
    }
  }

  async getFolders(): Promise<EmailFolder[]> {
    if (!this.connection) {
      throw new Error('Not connected to Exchange server');
    }

    try {
      const view = new FolderView(100);
      // Set property set to request the properties we need
      view.PropertySet = new PropertySet(BasePropertySet.FirstClassProperties);
      
      const results: FindFoldersResults = await this.connection.FindFolders(WellKnownFolderName.MsgFolderRoot, view);

      return results.Folders.map((folder: Folder) => {
        // Safely access properties with fallback values
        let messages = 0;
        let unseen = 0;
        
        try {
          messages = folder.TotalCount || 0;
        } catch (e) {
          // Property not available, use default
          messages = 0;
        }
        
        try {
          unseen = folder.UnreadCount || 0;
        } catch (e) {
          // Property not available, use default
          unseen = 0;
        }
        
        return {
          name: folder.DisplayName || 'Unknown Folder',
          path: folder.Id?.UniqueId || folder.Id?.toString() || '',
          delimiter: '/',
          flags: [],
          messages: messages,
          unseen: unseen
        };
      });
    } catch (error: any) {
      logger.error('Error fetching Exchange folders:', error);
      throw new Error(`Failed to fetch Exchange folders: ${error.message}`);
    }
  }

  private async *syncFolder(folderId: WellKnownFolderName | string, options: SyncOptions): AsyncGenerator<EmailMessage> {
    if (!this.connection) {
      throw new Error('Not connected to Exchange server');
    }

    const view = new ItemView(50); // page size
    view.PropertySet = new PropertySet(BasePropertySet.IdOnly);

    let offset = 0;
    let moreItems = true;

    while (moreItems) {
      view.Offset = offset;
                  const folder = new FolderId(folderId as any);
      const results = await this.connection.FindItems(folder, view);
            moreItems = (results as any).MoreAvailable;
            offset += (results as any).Items.length;

            if ((results as any).Items.length === 0) break;

      // Load full properties for the found items
      const propertySet = new PropertySet(BasePropertySet.FirstClassProperties);
            const items = await this.connection.BindToItems((results as any).Items.map((i: any) => i.Id), propertySet);

      for (const item of items.Responses) {
        const ewsMessage = item.Item as EwsEmailMessage;
        const email = this.mapEwsMessageToEmailMessage(ewsMessage);
        yield email;
        this.emit('message', email);
      }
    }
  }

  async *syncMessages(options: SyncOptions): AsyncGenerator<EmailMessage> {
    if (!this.connected) {
      throw new Error('Not connected to Exchange server');
    }
    const foldersToSync = options.folders?.length ? options.folders : ['inbox'];
    for (const folderName of foldersToSync) {
      const folderId = this.getWellKnownFolderName(folderName);
      yield* this.syncFolder(folderId, options);
    }
  }

  async getMessage(messageId: string): Promise<EmailMessage> {
    if (!this.connection) {
      throw new Error('Not connected to Exchange server');
    }
    const itemId = new ItemId(messageId);
    const propertySet = new PropertySet(BasePropertySet.FirstClassProperties);
    const ewsMessage = await EwsEmailMessage.Bind(this.connection, itemId, propertySet);
    return this.mapEwsMessageToEmailMessage(ewsMessage);
  }

  async disconnect(): Promise<void> {
    this.connection = null;
    this.connected = false;
    this.emit('disconnected');
  }

  // Helper to map EWS folder name to WellKnownFolderName enum
  private getWellKnownFolderName(name: string): WellKnownFolderName {
    const lowerName = name.toLowerCase().replace(/\s/g, '');
    const mapping: { [key: string]: WellKnownFolderName } = {
      inbox: WellKnownFolderName.Inbox,
      sentitems: WellKnownFolderName.SentItems,
      drafts: WellKnownFolderName.Drafts,
      deleteditems: WellKnownFolderName.DeletedItems,
      junkemail: WellKnownFolderName.JunkEmail,
      outbox: WellKnownFolderName.Outbox,
            trash: WellKnownFolderName.DeletedItems
    };
    return mapping[lowerName] || WellKnownFolderName.Inbox; // Default to Inbox
  }

  // Helper to map ews-javascript-api's EmailMessage to our internal EmailMessage type
  private mapEwsMessageToEmailMessage(ewsMsg: EwsEmailMessage): EmailMessage {
    const toRecipients = ewsMsg.ToRecipients?.GetEnumerator()?.map(this.mapEwsEmailAddressToLocal) || [];
    const ccRecipients = ewsMsg.CcRecipients?.GetEnumerator()?.map(this.mapEwsEmailAddressToLocal) || [];
    const bccRecipients = ewsMsg.BccRecipients?.GetEnumerator()?.map(this.mapEwsEmailAddressToLocal) || [];

    // Safe date handling
    const messageDate = ewsMsg.DateTimeSent ? new Date(ewsMsg.DateTimeSent.toString()) : new Date();

    // Safe folder name extraction
    const folderName = ewsMsg.ParentFolderId?.FolderName?.toString() || 
                       ewsMsg.ParentFolderId?.UniqueId || 
                       'Unknown';

    return {
      id: ewsMsg.Id?.UniqueId || 'unknown-id',
      subject: ewsMsg.Subject || 'No Subject',
      from: this.mapEwsEmailAddressToLocal(ewsMsg.From),
      to: toRecipients,
      cc: ccRecipients,
      bcc: bccRecipients,
      date: messageDate,
      body: ewsMsg.Body?.Text || '',
      html: ewsMsg.Body?.BodyType === BodyType.HTML ? ewsMsg.Body?.Text || '' : '',
      attachments: ewsMsg.Attachments?.GetEnumerator()?.map((a: any) => ({
        filename: a?.Name || 'unknown',
        size: a?.Size || 0,
        contentType: a?.ContentType || 'application/octet-stream',
        content: a?.Content ? Buffer.from(a.Content) : Buffer.from('')
      })) || [],
      flags: [], // EWS flags would require more complex mapping
      folder: folderName,
      labels: ewsMsg.Categories?.GetEnumerator() || []
    };
  }

      private mapEwsEmailAddressToLocal = (ewsAddress: EwsEmailAddress | Mailbox | null): EmailAddress => {
    if (!ewsAddress) {
      return { address: '', name: '' };
    }

    // Type guard to check if it's an EwsEmailAddress (which has a Name property)
    if ('Name' in ewsAddress && ewsAddress.Name) {
      return {
        name: ewsAddress.Name,
        address: ewsAddress.Address || '',
      };
    }

    // Otherwise, it's a Mailbox, which may only have an Address
    return {
      name: ewsAddress.Address || '',
      address: ewsAddress.Address || '',
    };
  }
}
