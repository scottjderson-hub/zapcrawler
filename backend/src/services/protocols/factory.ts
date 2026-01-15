import { ImapHandler } from './imap';
import { Pop3Handler } from './pop3';
import { ExchangeHandler } from './exchange';
import { EmailProtocol, EmailProtocolHandler } from '../../types/email';

export class ProtocolHandlerFactory {
  static createHandler(protocol: EmailProtocol): EmailProtocolHandler {
    switch (protocol) {
      case 'imap':
        return new ImapHandler();
      case 'pop3':
        return new Pop3Handler();
      case 'exchange':
        return new ExchangeHandler();
      default:
        throw new Error(`Unsupported protocol: ${protocol}`);
    }
  }
}
