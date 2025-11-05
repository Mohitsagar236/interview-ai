/**
 * Node.js wrapper for Python Payment Verifier
 * Provides JavaScript interface to payment verification functions
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

class PaymentVerifier {
    constructor() {
        this.pythonScript = path.join(__dirname, '..', 'python', 'payment_verifier.py');
        this.dbPath = path.join(__dirname, '..', 'payments.db');
    }

    /**
     * Execute Python payment verifier function
     */
    async executePython(command, args = {}) {
        return new Promise((resolve, reject) => {
            const pythonProcess = spawn('python', [
                '-c',
                `
import sys
import json
sys.path.insert(0, '${path.join(__dirname, '..', 'python').replace(/\\/g, '\\\\')}')
from payment_verifier import get_payment_verifier

verifier = get_payment_verifier()
result = None

command = '${command}'
args = json.loads('${JSON.stringify(args).replace(/'/g, "\\'")}')

if command == 'create_payment_record':
    result = verifier.create_payment_record(args)
elif command == 'verify_payment':
    result = verifier.verify_payment(args['payment_id'], args['transaction_id'], args['gateway'])
elif command == 'get_payment_status':
    result = verifier.get_payment_status(args['payment_id'])
elif command == 'validate_download_token':
    result = verifier.validate_download_token(args['token'])

print(json.dumps(result))
                `
            ]);

            let output = '';
            let errorOutput = '';

            pythonProcess.stdout.on('data', (data) => {
                output += data.toString();
            });

            pythonProcess.stderr.on('data', (data) => {
                errorOutput += data.toString();
            });

            pythonProcess.on('close', (code) => {
                if (code !== 0) {
                    reject(new Error(`Python error: ${errorOutput}`));
                } else {
                    try {
                        const result = JSON.parse(output);
                        resolve(result);
                    } catch (error) {
                        reject(new Error(`Failed to parse Python output: ${output}`));
                    }
                }
            });
        });
    }

    /**
     * Create payment record
     */
    async createPaymentRecord(data) {
        return this.executePython('create_payment_record', data);
    }

    /**
     * Verify payment with payment gateway
     */
    async verifyPayment(paymentId, transactionId, gateway) {
        return this.executePython('verify_payment', {
            payment_id: paymentId,
            transaction_id: transactionId,
            gateway: gateway
        });
    }

    /**
     * Get payment status
     */
    async getPaymentStatus(paymentId) {
        return this.executePython('get_payment_status', {
            payment_id: paymentId
        });
    }

    /**
     * Validate download token
     */
    async validateDownloadToken(token) {
        return this.executePython('validate_download_token', {
            token: token
        });
    }

    /**
     * Get payment by transaction ID (direct DB query)
     */
    async getPaymentByTransactionId(transactionId) {
        const sqlite3 = require('sqlite3').verbose();
        const db = new sqlite3.Database(this.dbPath);

        return new Promise((resolve, reject) => {
            db.get(
                'SELECT * FROM payments WHERE transaction_id = ?',
                [transactionId],
                (err, row) => {
                    db.close();
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });
    }

    /**
     * Mark payment as verified (direct DB update)
     */
    async markPaymentVerified(paymentId, verificationData) {
        const sqlite3 = require('sqlite3').verbose();
        const db = new sqlite3.Database(this.dbPath);

        const downloadToken = this.generateDownloadToken(paymentId);
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
        const verifiedAt = new Date().toISOString();

        return new Promise((resolve, reject) => {
            db.run(
                `UPDATE payments 
                 SET status = 'verified',
                     download_token = ?,
                     token_expires_at = ?,
                     verified_at = ?,
                     metadata = ?
                 WHERE payment_id = ?`,
                [
                    downloadToken,
                    expiresAt,
                    verifiedAt,
                    JSON.stringify(verificationData),
                    paymentId
                ],
                function(err) {
                    db.close();
                    if (err) {
                        reject(err);
                    } else {
                        resolve({
                            success: true,
                            download_token: downloadToken,
                            expires_at: expiresAt
                        });
                    }
                }
            );
        });
    }

    /**
     * Generate download token
     */
    generateDownloadToken(paymentId) {
        const crypto = require('crypto');
        const data = `${paymentId}${Date.now()}${crypto.randomBytes(16).toString('hex')}`;
        return crypto.createHash('sha256').update(data).digest('hex');
    }
}

module.exports = PaymentVerifier;
