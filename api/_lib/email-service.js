/**
 * Email Automation Service
 * Sends download links and payment confirmations
 * Supports: SendGrid, Mailgun, AWS SES
 */

class EmailService {
    constructor() {
        this.provider = process.env.EMAIL_PROVIDER || 'sendgrid';
        this.fromEmail = process.env.FROM_EMAIL || 'interviewai.space@gmail.com';
        this.replyTo = process.env.REPLY_TO_EMAIL || 'interviewai.space@gmail.com';
        
        // Initialize based on provider
        this.initProvider();
    }

    initProvider() {
        switch (this.provider) {
            case 'sendgrid':
                this.sgMail = require('@sendgrid/mail');
                this.sgMail.setApiKey(process.env.SENDGRID_API_KEY);
                break;
            case 'mailgun':
                const Mailgun = require('mailgun-js');
                this.mailgun = Mailgun({
                    apiKey: process.env.MAILGUN_API_KEY,
                    domain: process.env.MAILGUN_DOMAIN
                });
                break;
            case 'ses':
                const AWS = require('aws-sdk');
                AWS.config.update({
                    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
                    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
                    region: process.env.AWS_REGION || 'us-east-1'
                });
                this.ses = new AWS.SES();
                break;
        }
    }

    /**
     * Send download link email after payment verification
     */
    async sendDownloadEmail(data) {
        const { email, name, product, downloadUrl, downloadToken, amount } = data;

        const subject = 'Your Interview AI Download is Ready! 🎉';
        const html = this.getDownloadEmailHTML(name, product, downloadUrl, downloadToken);
        const text = this.getDownloadEmailText(name, product, downloadUrl);

        return this.send({
            to: email,
            subject,
            html,
            text
        });
    }

    /**
     * Send payment confirmation email
     */
    async sendPaymentConfirmation(data) {
        const { email, name, product, amount, transactionId } = data;

        const subject = 'Payment Confirmed - Interview AI';
        const html = this.getPaymentConfirmationHTML(name, product, amount, transactionId);
        const text = this.getPaymentConfirmationText(name, product, amount, transactionId);

        return this.send({
            to: email,
            subject,
            html,
            text
        });
    }

    /**
     * Send payment pending email
     */
    async sendPaymentPendingEmail(data) {
        const { email, name, product, amount, estimatedTime } = data;

        const subject = 'Payment Verification Pending - Interview AI';
        const html = this.getPaymentPendingHTML(name, product, amount, estimatedTime);
        const text = this.getPaymentPendingText(name, product, amount, estimatedTime);

        return this.send({
            to: email,
            subject,
            html,
            text
        });
    }

    /**
     * Send admin notification
     */
    async sendAdminNotification(paymentData) {
        const adminEmail = process.env.ADMIN_EMAIL;
        if (!adminEmail) return;

        const subject = `New Payment: ₹${paymentData.amount} - ${paymentData.product}`;
        const html = this.getAdminNotificationHTML(paymentData);
        const text = this.getAdminNotificationText(paymentData);

        return this.send({
            to: adminEmail,
            subject,
            html,
            text
        });
    }

    /**
     * Universal send method
     */
    async send({ to, subject, html, text }) {
        try {
            switch (this.provider) {
                case 'sendgrid':
                    return await this.sendWithSendGrid(to, subject, html, text);
                case 'mailgun':
                    return await this.sendWithMailgun(to, subject, html, text);
                case 'ses':
                    return await this.sendWithSES(to, subject, html, text);
                default:
                    throw new Error(`Unsupported email provider: ${this.provider}`);
            }
        } catch (error) {
            console.error('Email sending failed:', error);
            throw error;
        }
    }

    /**
     * Send via SendGrid
     */
    async sendWithSendGrid(to, subject, html, text) {
        await this.sgMail.send({
            to,
            from: this.fromEmail,
            replyTo: this.replyTo,
            subject,
            html,
            text
        });
        console.log(`Email sent via SendGrid to ${to}`);
    }

    /**
     * Send via Mailgun
     */
    async sendWithMailgun(to, subject, html, text) {
        await this.mailgun.messages().send({
            from: this.fromEmail,
            to,
            subject,
            html,
            text
        });
        console.log(`Email sent via Mailgun to ${to}`);
    }

    /**
     * Send via AWS SES
     */
    async sendWithSES(to, subject, html, text) {
        const params = {
            Source: this.fromEmail,
            Destination: {
                ToAddresses: [to]
            },
            Message: {
                Subject: {
                    Data: subject,
                    Charset: 'UTF-8'
                },
                Body: {
                    Html: {
                        Data: html,
                        Charset: 'UTF-8'
                    },
                    Text: {
                        Data: text,
                        Charset: 'UTF-8'
                    }
                }
            }
        };

        await this.ses.sendEmail(params).promise();
        console.log(`Email sent via AWS SES to ${to}`);
    }

    // ============ EMAIL TEMPLATES ============

    getDownloadEmailHTML(name, product, downloadUrl, token) {
        return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; }
        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
        .content { background: #f9fafb; padding: 30px; }
        .button { display: inline-block; background: #0066cc; color: white; padding: 15px 40px; text-decoration: none; border-radius: 6px; font-weight: bold; margin: 20px 0; }
        .button:hover { background: #0052a3; }
        .features { background: white; border-radius: 8px; padding: 20px; margin: 20px 0; }
        .feature-item { margin: 10px 0; padding-left: 25px; position: relative; }
        .feature-item:before { content: '✓'; position: absolute; left: 0; color: #10b981; font-weight: bold; }
        .footer { background: #1f2937; color: #9ca3af; padding: 20px; text-align: center; border-radius: 0 0 8px 8px; font-size: 14px; }
        .warning { background: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0; border-radius: 4px; }
    </style>
</head>
<body>
    <div class="header">
        <h1>🎉 Your Download is Ready!</h1>
    </div>
    
    <div class="content">
        <h2>Hi ${name},</h2>
        <p>Thank you for purchasing <strong>${product}</strong>!</p>
        <p>Your payment has been verified successfully. Click the button below to download your app:</p>
        
        <div style="text-align: center;">
            <a href="${downloadUrl}" class="button">
                Download Now →
            </a>
        </div>
        
        <div class="warning">
            <strong>⏰ Important:</strong> This download link expires in <strong>24 hours</strong> for security.
        </div>
        
        <div class="features">
            <h3>What You Get:</h3>
            <div class="feature-item">Real-time AI transcription</div>
            <div class="feature-item">Smart answer suggestions</div>
            <div class="feature-item">Screen capture OCR</div>
            <div class="feature-item">Unlimited interviews</div>
            <div class="feature-item">Free updates for 1 year</div>
            <div class="feature-item">Priority support</div>
        </div>
        
        <h3>Installation Instructions:</h3>
        <ol>
            <li>Click the download button above</li>
            <li>Run the installer file</li>
            <li>Follow the setup wizard</li>
            <li>Launch Interview AI and start practicing!</li>
        </ol>
        
        <p><strong>Need help?</strong> Reply to this email or visit our support page.</p>
        
        <p>Best regards,<br>
        <strong>Interview AI Team</strong></p>
    </div>
    
    <div class="footer">
        <p>Download Token: <code>${token.substring(0, 16)}...</code></p>
        <p>If you didn't make this purchase, please contact us immediately.</p>
        <p>&copy; 2025 Interview AI. All rights reserved.</p>
    </div>
</body>
</html>
        `;
    }

    getDownloadEmailText(name, product, downloadUrl) {
        return `
Hi ${name},

Thank you for purchasing ${product}!

Your payment has been verified successfully.

Download your app here:
${downloadUrl}

IMPORTANT: This download link expires in 24 hours for security.

What You Get:
✓ Real-time AI transcription
✓ Smart answer suggestions
✓ Screen capture OCR
✓ Unlimited interviews
✓ Free updates for 1 year
✓ Priority support

Installation Instructions:
1. Click the download link above
2. Run the installer file
3. Follow the setup wizard
4. Launch Interview AI and start practicing!

Need help? Reply to this email.

Best regards,
Interview AI Team
        `;
    }

    getPaymentConfirmationHTML(name, product, amount, transactionId) {
        return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; }
        .header { background: #10b981; color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
        .content { background: #f9fafb; padding: 30px; }
        .receipt { background: white; border-radius: 8px; padding: 20px; margin: 20px 0; border: 1px solid #e5e7eb; }
        .receipt-item { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #f3f4f6; }
        .footer { background: #1f2937; color: #9ca3af; padding: 20px; text-align: center; border-radius: 0 0 8px 8px; font-size: 14px; }
    </style>
</head>
<body>
    <div class="header">
        <h1>✓ Payment Confirmed</h1>
    </div>
    
    <div class="content">
        <h2>Hi ${name},</h2>
        <p>Your payment has been successfully verified!</p>
        
        <div class="receipt">
            <h3>Payment Receipt</h3>
            <div class="receipt-item">
                <span>Product:</span>
                <strong>${product}</strong>
            </div>
            <div class="receipt-item">
                <span>Amount Paid:</span>
                <strong>₹${amount.toLocaleString('en-IN')}</strong>
            </div>
            <div class="receipt-item">
                <span>Transaction ID:</span>
                <strong>${transactionId}</strong>
            </div>
            <div class="receipt-item">
                <span>Date:</span>
                <strong>${new Date().toLocaleString('en-IN')}</strong>
            </div>
        </div>
        
        <p>Your download link has been sent in a separate email.</p>
        
        <p>Best regards,<br>
        <strong>Interview AI Team</strong></p>
    </div>
    
    <div class="footer">
        <p>&copy; 2025 Interview AI. All rights reserved.</p>
    </div>
</body>
</html>
        `;
    }

    getPaymentConfirmationText(name, product, amount, transactionId) {
        return `
Hi ${name},

Your payment has been successfully verified!

Payment Receipt:
- Product: ${product}
- Amount Paid: ₹${amount.toLocaleString('en-IN')}
- Transaction ID: ${transactionId}
- Date: ${new Date().toLocaleString('en-IN')}

Your download link has been sent in a separate email.

Best regards,
Interview AI Team
        `;
    }

    getPaymentPendingHTML(name, product, amount, estimatedTime) {
        return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; }
        .header { background: #f59e0b; color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
        .content { background: #f9fafb; padding: 30px; }
        .info { background: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0; border-radius: 4px; }
        .footer { background: #1f2937; color: #9ca3af; padding: 20px; text-align: center; border-radius: 0 0 8px 8px; font-size: 14px; }
    </style>
</head>
<body>
    <div class="header">
        <h1>⏳ Payment Verification Pending</h1>
    </div>
    
    <div class="content">
        <h2>Hi ${name},</h2>
        <p>Thank you for your purchase of <strong>${product}</strong>!</p>
        
        <div class="info">
            <p><strong>Your payment of ₹${amount.toLocaleString('en-IN')} is being verified.</strong></p>
            <p>Estimated time: <strong>${estimatedTime}</strong></p>
        </div>
        
        <p>We'll send you the download link as soon as your payment is confirmed.</p>
        <p>This usually takes just a few minutes.</p>
        
        <p><strong>What happens next:</strong></p>
        <ol>
            <li>We verify your payment with the payment gateway</li>
            <li>Once confirmed, we generate your download link</li>
            <li>You receive an email with the download button</li>
        </ol>
        
        <p>If you have any questions, reply to this email.</p>
        
        <p>Best regards,<br>
        <strong>Interview AI Team</strong></p>
    </div>
    
    <div class="footer">
        <p>&copy; 2025 Interview AI. All rights reserved.</p>
    </div>
</body>
</html>
        `;
    }

    getPaymentPendingText(name, product, amount, estimatedTime) {
        return `
Hi ${name},

Thank you for your purchase of ${product}!

Your payment of ₹${amount.toLocaleString('en-IN')} is being verified.
Estimated time: ${estimatedTime}

We'll send you the download link as soon as your payment is confirmed.
This usually takes just a few minutes.

What happens next:
1. We verify your payment with the payment gateway
2. Once confirmed, we generate your download link
3. You receive an email with the download button

If you have any questions, reply to this email.

Best regards,
Interview AI Team
        `;
    }

    getAdminNotificationHTML(paymentData) {
        return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <style>
        body { font-family: monospace; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; }
        .header { background: #1f2937; color: white; padding: 20px; }
        .content { background: #f9fafb; padding: 20px; }
        .data { background: white; border: 1px solid #e5e7eb; padding: 15px; border-radius: 4px; }
        .data-item { margin: 5px 0; }
    </style>
</head>
<body>
    <div class="header">
        <h2>🔔 New Payment Notification</h2>
    </div>
    
    <div class="content">
        <h3>Payment Details:</h3>
        <div class="data">
            <div class="data-item"><strong>Customer:</strong> ${paymentData.name}</div>
            <div class="data-item"><strong>Email:</strong> ${paymentData.email}</div>
            <div class="data-item"><strong>Phone:</strong> ${paymentData.phone || 'N/A'}</div>
            <div class="data-item"><strong>Product:</strong> ${paymentData.product}</div>
            <div class="data-item"><strong>Amount:</strong> ₹${paymentData.amount.toLocaleString('en-IN')}</div>
            <div class="data-item"><strong>Transaction ID:</strong> ${paymentData.transactionId}</div>
            <div class="data-item"><strong>Gateway:</strong> ${paymentData.gateway}</div>
            <div class="data-item"><strong>Method:</strong> ${paymentData.paymentMethod}</div>
            <div class="data-item"><strong>Status:</strong> ${paymentData.status}</div>
            <div class="data-item"><strong>Time:</strong> ${new Date().toLocaleString('en-IN')}</div>
        </div>
        
        <p><strong>Action Required:</strong> ${paymentData.status === 'verified' ? 'None - Payment auto-verified ✓' : 'Verify payment manually'}</p>
    </div>
</body>
</html>
        `;
    }

    getAdminNotificationText(paymentData) {
        return `
New Payment Notification

Customer: ${paymentData.name}
Email: ${paymentData.email}
Phone: ${paymentData.phone || 'N/A'}
Product: ${paymentData.product}
Amount: ₹${paymentData.amount.toLocaleString('en-IN')}
Transaction ID: ${paymentData.transactionId}
Gateway: ${paymentData.gateway}
Method: ${paymentData.paymentMethod}
Status: ${paymentData.status}
Time: ${new Date().toLocaleString('en-IN')}

Action Required: ${paymentData.status === 'verified' ? 'None - Payment auto-verified ✓' : 'Verify payment manually'}
        `;
    }
}

// Singleton instance
let emailServiceInstance = null;

function getEmailService() {
    if (!emailServiceInstance) {
        emailServiceInstance = new EmailService();
    }
    return emailServiceInstance;
}

module.exports = { EmailService, getEmailService };
