/**
 * Resend Email Service
 *
 * Wrapper around Resend SDK for sending emails.
 * Handles initialization, configuration, and error handling.
 */
import { Resend } from 'resend';

export interface EmailParams {
    to: string;
    subject: string;
    text: string;
    from?: string;
    fromName?: string;
    replyTo?: string;
}

export interface EmailResult {
    emailId: string;
}

export interface ResendConfig {
    apiKey: string;
    fromAddress: string;
    fromName?: string | undefined;
    replyTo?: string | undefined;
}

export class ResendEmailService {
    private resend: Resend | null = null;
    private fromAddress: string = '';
    private fromName: string = 'WordRhyme';
    private replyTo: string | null = null;

    /**
     * Initialize the service with Resend API credentials
     */
    async initialize(config: ResendConfig): Promise<void> {
        this.resend = new Resend(config.apiKey);
        this.fromAddress = config.fromAddress;
        this.fromName = config.fromName || 'WordRhyme';
        this.replyTo = config.replyTo || null;
    }

    /**
     * Check if the service is configured and ready to send emails
     */
    isConfigured(): boolean {
        return this.resend !== null && this.fromAddress !== '';
    }

    /**
     * Send an email via Resend API
     *
     * @param params - Email parameters
     * @returns Result containing the email ID
     * @throws Error if service not initialized or API fails
     */
    async send(params: EmailParams): Promise<EmailResult> {
        if (!this.resend) {
            throw new Error('ResendEmailService not initialized');
        }

        const from = params.from || `${params.fromName || this.fromName} <${this.fromAddress}>`;

        const { data, error } = await this.resend.emails.send({
            from,
            to: params.to,
            subject: params.subject,
            text: params.text,
            ...(params.replyTo ? { replyTo: params.replyTo } : this.replyTo ? { replyTo: this.replyTo } : {}),
        });

        if (error) {
            throw new Error(`Resend API error: ${error.message}`);
        }

        return { emailId: data!.id };
    }

    /**
     * Send a test email to verify configuration
     */
    async sendTest(to: string): Promise<EmailResult> {
        return this.send({
            to,
            subject: 'WordRhyme Email Test',
            text: 'This is a test email from WordRhyme CMS. If you received this, your email configuration is working correctly!',
        });
    }
}

// Singleton instance for the plugin
export const emailService = new ResendEmailService();
