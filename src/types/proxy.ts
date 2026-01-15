export interface Proxy {
  _id: string;
  name: string;
  host: string;
  port: number;
  type: 'SOCKS5' | 'HTTP';
  userId?: string;
  password?: string;
}
