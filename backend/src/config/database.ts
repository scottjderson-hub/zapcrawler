import mongoose from 'mongoose';
import { logger } from '../utils/logger';

const connectDB = async () => {
  try {
    const mongoURI = process.env.MONGO_URI;
    if (!mongoURI) {
      logger.info('MONGO_URI is not defined - running with Supabase only (no MongoDB).');
      return; // Don't exit, just continue without MongoDB
    }

    await mongoose.connect(mongoURI);

    logger.info('MongoDB Connected...');
  } catch (err: any) {
    logger.error('MongoDB connection error:', err.message);
    logger.info('Continuing without MongoDB - using Supabase only.');
    // Don't exit process, continue with Supabase
  }
};

export default connectDB;
