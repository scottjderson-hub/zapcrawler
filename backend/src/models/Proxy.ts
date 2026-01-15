import { Schema, model, Document } from 'mongoose';

export interface IProxy extends Document {
  name: string;
  host: string;
  port: number;
  type: 'SOCKS5' | 'HTTP';
  userId?: string;
  password?: string;
}

const ProxySchema = new Schema<IProxy>(
  {
    name: { type: String, required: true, unique: true },
    host: { type: String, required: true },
    port: { type: Number, required: true },
    type: { type: String, enum: ['SOCKS5', 'HTTP'], required: true },
    userId: { type: String },
    password: { type: String },
  },
  { timestamps: true }
);

export const Proxy = model<IProxy>('Proxy', ProxySchema);
