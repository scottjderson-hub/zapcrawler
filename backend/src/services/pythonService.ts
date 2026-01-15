import axios, { AxiosInstance, AxiosResponse } from 'axios';
import { EmailMessage } from '../types/email';
import { logger } from '../utils/logger';

interface PythonServiceConfig {
  baseUrl: string;
  timeout?: number;
}

export class PythonService {
  private client: AxiosInstance;
  private initialized: boolean = false;

  constructor(config: PythonServiceConfig) {
    this.client = axios.create({
      baseURL: config.baseUrl,
      timeout: config.timeout || 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  async initialize(): Promise<boolean> {
    try {
      const response = await this.client.get('/health');
      this.initialized = response.status === 200;
      return this.initialized;
    } catch (error) {
      logger.error('Failed to initialize Python service:', error);
      this.initialized = false;
      return false;
    }
  }

  async parseEmailHeaders(headers: string): Promise<EmailMessage> {
    try {
      const response = await this.client.post<EmailMessage>('/parse/headers', { headers });
      return response.data;
    } catch (error) {
      logger.error('Failed to parse email headers:', error);
      throw new Error('Failed to parse email headers');
    }
  }

  async extractEmailAddresses(text: string): Promise<string[]> {
    try {
      const response = await this.client.post<{ addresses: string[] }>('/extract/addresses', { text });
      return response.data.addresses;
    } catch (error) {
      logger.error('Failed to extract email addresses:', error);
      throw new Error('Failed to extract email addresses');
    }
  }

  async validateEmailAddress(email: string): Promise<boolean> {
    try {
      const response = await this.client.post<{ valid: boolean }>('/validate/email', { email });
      return response.data.valid;
    } catch (error) {
      logger.error('Failed to validate email address:', error);
      return false;
    }
  }

  async analyzeEmailContent(content: string): Promise<{
    sentiment: 'positive' | 'negative' | 'neutral';
    categories: string[];
    isSpam: boolean;
  }> {
    try {
      const response = await this.client.post('/analyze/email', { content });
      return response.data;
    } catch (error) {
      logger.error('Failed to analyze email content:', error);
      return {
        sentiment: 'neutral',
        categories: [],
        isSpam: false,
      };
    }
  }

  async generateSummary(text: string, maxLength: number = 200): Promise<string> {
    try {
      const response = await this.client.post<{ summary: string }>('/summarize', {
        text,
        max_length: maxLength,
      });
      return response.data.summary;
    } catch (error) {
      logger.error('Failed to generate summary:', error);
      return text.substring(0, maxLength) + (text.length > maxLength ? '...' : '');
    }
  }

  async translateText(text: string, targetLang: string = 'en'): Promise<string> {
    try {
      const response = await this.client.post<{ translated_text: string }>('/translate', {
        text,
        target_lang: targetLang,
      });
      return response.data.translated_text;
    } catch (error) {
      logger.error('Failed to translate text:', error);
      return text; // Return original text if translation fails
    }
  }

  async isAvailable(): Promise<boolean> {
    if (!this.initialized) {
      return this.initialize();
    }
    return this.initialized;
  }
}

// Create a singleton instance
export const pythonService = new PythonService({
  baseUrl: process.env.PYTHON_SERVICE_URL || 'http://localhost:8000',
  timeout: parseInt(process.env.PYTHON_SERVICE_TIMEOUT || '30000'),
});
