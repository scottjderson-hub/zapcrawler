import mongoose, { Document, Schema } from 'mongoose';

export interface ISyncJob extends Document {
  name: string;
  accountId: mongoose.Types.ObjectId;
  status: 'pending' | 'running' | 'completed' | 'failed';
  resultsKey?: string;
  error?: string;
  startedAt: Date;
  completedAt?: Date;
  // Email count and progress tracking
  resultCount?: number;
  currentCount?: number;
  processedFolders?: number;
  totalFolders?: number;
  // Batch sync support
  batchSyncJobId?: mongoose.Types.ObjectId;
  parentJobId?: mongoose.Types.ObjectId;
  childJobIds?: mongoose.Types.ObjectId[];
  batchProgress?: {
    completed: number;
    total: number;
    results: any[];
  };
}

const SyncJobSchema: Schema = new Schema(
  {
    name: { type: String, required: true },
    accountId: { type: Schema.Types.ObjectId, ref: 'EmailAccount', required: true },
    status: {
      type: String,
      enum: ['pending', 'running', 'completed', 'failed'],
      default: 'pending',
      required: true,
    },
    resultsKey: { type: String },
    error: { type: String },
    startedAt: { type: Date, default: Date.now },
    completedAt: { type: Date },
    // Email count and progress tracking
    resultCount: { type: Number, default: 0 },
    currentCount: { type: Number, default: 0 },
    processedFolders: { type: Number, default: 0 },
    totalFolders: { type: Number, default: 0 },
    // Batch sync support
    batchSyncJobId: { type: Schema.Types.ObjectId, ref: 'SyncJob' },
    parentJobId: { type: Schema.Types.ObjectId, ref: 'SyncJob' },
    childJobIds: [{ type: Schema.Types.ObjectId, ref: 'SyncJob' }],
    batchProgress: {
      completed: { type: Number, default: 0 },
      total: { type: Number, default: 0 },
      results: [{ type: Schema.Types.Mixed }],
    },
  },
  { timestamps: true }
);

export default mongoose.model<ISyncJob>('SyncJob', SyncJobSchema);
