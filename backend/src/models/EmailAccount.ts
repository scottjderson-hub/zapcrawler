import mongoose, { Schema, Document } from 'mongoose';

export interface IEmailAccount extends Document {
  email: string;
  provider: string;
  auth: Record<string, any>;
  status: 'connected' | 'disconnected' | 'error' | 'invalid' | 'syncing';
  proxy?: Schema.Types.ObjectId;
  folders?: any[];
  lastSync?: Date;
  errorMessage?: string;
  createdAt: Date;
  updatedAt: Date;
}

const EmailAccountSchema: Schema = new Schema(
  {
    email: { type: String, required: true, unique: true },
    provider: { type: String, required: true },
    auth: { type: Object, required: true },
    status: { type: String, enum: ['connected', 'disconnected', 'error', 'invalid', 'syncing'], required: true, default: 'disconnected' },
    proxy: { type: Schema.Types.ObjectId, ref: 'Proxy' },
    folders: { type: Array },
    lastSync: { type: Date },
    errorMessage: { type: String },
  },
  { timestamps: true }
);

export default mongoose.model<IEmailAccount>('EmailAccount', EmailAccountSchema);
