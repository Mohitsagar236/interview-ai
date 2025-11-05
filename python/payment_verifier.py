"""
Automated UPI Payment Verification System for Interview AI
Supports: Razorpay, Cashfree, Paytm, PhonePe
"""

import os
import json
import hashlib
import hmac
import time
import sqlite3
from datetime import datetime, timedelta
from typing import Optional, Dict, Any
import requests


class PaymentVerifier:
    """Handles automated payment verification with multiple gateways"""
    
    # Payment Gateway Types
    GATEWAY_RAZORPAY = "razorpay"
    GATEWAY_CASHFREE = "cashfree"
    GATEWAY_PAYTM = "paytm"
    GATEWAY_PHONEPE = "phonepe"
    
    def __init__(self, db_path: str = "payments.db"):
        self.db_path = db_path
        self.init_database()
        
        # Load gateway credentials from environment
        self.razorpay_key = os.getenv("RAZORPAY_KEY_ID")
        self.razorpay_secret = os.getenv("RAZORPAY_KEY_SECRET")
        
        self.cashfree_app_id = os.getenv("CASHFREE_APP_ID")
        self.cashfree_secret = os.getenv("CASHFREE_SECRET_KEY")
        
        self.paytm_mid = os.getenv("PAYTM_MID")
        self.paytm_key = os.getenv("PAYTM_MERCHANT_KEY")
        
        self.phonepe_merchant_id = os.getenv("PHONEPE_MERCHANT_ID")
        self.phonepe_salt_key = os.getenv("PHONEPE_SALT_KEY")
        self.phonepe_salt_index = os.getenv("PHONEPE_SALT_INDEX", "1")
    
    def init_database(self):
        """Initialize SQLite database for payment records"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS payments (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                payment_id TEXT UNIQUE NOT NULL,
                transaction_id TEXT,
                customer_email TEXT NOT NULL,
                customer_name TEXT NOT NULL,
                customer_phone TEXT,
                product_type TEXT NOT NULL,
                amount INTEGER NOT NULL,
                currency TEXT DEFAULT 'INR',
                payment_method TEXT,
                gateway TEXT,
                status TEXT DEFAULT 'pending',
                download_token TEXT,
                token_expires_at TEXT,
                created_at TEXT NOT NULL,
                verified_at TEXT,
                metadata TEXT
            )
        """)
        
        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_payment_id ON payments(payment_id)
        """)
        
        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_transaction_id ON payments(transaction_id)
        """)
        
        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_download_token ON payments(download_token)
        """)
        
        conn.commit()
        conn.close()
    
    def generate_payment_id(self) -> str:
        """Generate unique payment ID"""
        timestamp = str(int(time.time() * 1000))
        random_part = hashlib.sha256(os.urandom(32)).hexdigest()[:8]
        return f"PAY-{timestamp}-{random_part.upper()}"
    
    def generate_download_token(self, payment_id: str) -> str:
        """Generate secure one-time download token"""
        data = f"{payment_id}{time.time()}{os.urandom(32).hex()}"
        token = hashlib.sha256(data.encode()).hexdigest()
        return token
    
    def create_payment_record(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Create new payment record"""
        payment_id = self.generate_payment_id()
        created_at = datetime.utcnow().isoformat()
        
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        try:
            cursor.execute("""
                INSERT INTO payments (
                    payment_id, transaction_id, customer_email, customer_name,
                    customer_phone, product_type, amount, currency, payment_method,
                    gateway, status, created_at, metadata
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                payment_id,
                data.get("transaction_id"),
                data["email"],
                data["name"],
                data.get("phone"),
                data["product_type"],
                data["amount"],
                data.get("currency", "INR"),
                data.get("payment_method", "upi"),
                data.get("gateway", "manual"),
                "pending",
                created_at,
                json.dumps(data.get("metadata", {}))
            ))
            
            conn.commit()
            
            return {
                "success": True,
                "payment_id": payment_id,
                "status": "pending",
                "created_at": created_at
            }
            
        except sqlite3.IntegrityError:
            return {
                "success": False,
                "error": "Payment record already exists"
            }
        finally:
            conn.close()
    
    def verify_payment_razorpay(self, payment_id: str, transaction_id: str) -> Dict[str, Any]:
        """
        Verify payment via Razorpay API
        Docs: https://razorpay.com/docs/api/payments/
        """
        if not self.razorpay_key or not self.razorpay_secret:
            return {"verified": False, "error": "Razorpay credentials not configured"}
        
        try:
            url = f"https://api.razorpay.com/v1/payments/{transaction_id}"
            response = requests.get(
                url,
                auth=(self.razorpay_key, self.razorpay_secret),
                timeout=10
            )
            
            if response.status_code == 200:
                data = response.json()
                
                # Check if payment is captured/authorized
                if data.get("status") in ["captured", "authorized"]:
                    return {
                        "verified": True,
                        "amount": data.get("amount", 0) / 100,  # Convert paise to rupees
                        "method": data.get("method"),
                        "gateway": self.GATEWAY_RAZORPAY,
                        "data": data
                    }
                else:
                    return {
                        "verified": False,
                        "error": f"Payment status: {data.get('status')}",
                        "data": data
                    }
            else:
                return {
                    "verified": False,
                    "error": f"API error: {response.status_code}"
                }
                
        except Exception as e:
            return {
                "verified": False,
                "error": f"Verification failed: {str(e)}"
            }
    
    def verify_payment_cashfree(self, payment_id: str, order_id: str) -> Dict[str, Any]:
        """
        Verify payment via Cashfree API
        Docs: https://docs.cashfree.com/docs/order-verify
        """
        if not self.cashfree_app_id or not self.cashfree_secret:
            return {"verified": False, "error": "Cashfree credentials not configured"}
        
        try:
            url = f"https://api.cashfree.com/pg/orders/{order_id}"
            
            headers = {
                "x-api-version": "2023-08-01",
                "x-client-id": self.cashfree_app_id,
                "x-client-secret": self.cashfree_secret
            }
            
            response = requests.get(url, headers=headers, timeout=10)
            
            if response.status_code == 200:
                data = response.json()
                
                if data.get("order_status") == "PAID":
                    return {
                        "verified": True,
                        "amount": data.get("order_amount", 0),
                        "method": data.get("payment_method"),
                        "gateway": self.GATEWAY_CASHFREE,
                        "data": data
                    }
                else:
                    return {
                        "verified": False,
                        "error": f"Order status: {data.get('order_status')}",
                        "data": data
                    }
            else:
                return {
                    "verified": False,
                    "error": f"API error: {response.status_code}"
                }
                
        except Exception as e:
            return {
                "verified": False,
                "error": f"Verification failed: {str(e)}"
            }
    
    def verify_payment_paytm(self, payment_id: str, order_id: str) -> Dict[str, Any]:
        """
        Verify payment via Paytm API
        Docs: https://developer.paytm.com/docs/transaction-status-api/
        """
        if not self.paytm_mid or not self.paytm_key:
            return {"verified": False, "error": "Paytm credentials not configured"}
        
        try:
            url = "https://securegw.paytm.in/order/status"
            
            # Create checksum
            paytm_params = {
                "MID": self.paytm_mid,
                "ORDERID": order_id
            }
            
            checksum = self._generate_paytm_checksum(paytm_params)
            paytm_params["CHECKSUMHASH"] = checksum
            
            response = requests.post(url, json=paytm_params, timeout=10)
            
            if response.status_code == 200:
                data = response.json()
                
                if data.get("STATUS") == "TXN_SUCCESS":
                    return {
                        "verified": True,
                        "amount": float(data.get("TXNAMOUNT", 0)),
                        "method": data.get("PAYMENTMODE"),
                        "gateway": self.GATEWAY_PAYTM,
                        "data": data
                    }
                else:
                    return {
                        "verified": False,
                        "error": f"Transaction status: {data.get('STATUS')}",
                        "data": data
                    }
            else:
                return {
                    "verified": False,
                    "error": f"API error: {response.status_code}"
                }
                
        except Exception as e:
            return {
                "verified": False,
                "error": f"Verification failed: {str(e)}"
            }
    
    def verify_payment_phonepe(self, payment_id: str, merchant_transaction_id: str) -> Dict[str, Any]:
        """
        Verify payment via PhonePe API
        Docs: https://developer.phonepe.com/v1/docs/transaction-status-api
        """
        if not self.phonepe_merchant_id or not self.phonepe_salt_key:
            return {"verified": False, "error": "PhonePe credentials not configured"}
        
        try:
            url = f"https://api.phonepe.com/apis/hermes/status/{self.phonepe_merchant_id}/{merchant_transaction_id}"
            
            # Create X-VERIFY header
            checksum_string = f"/pg/v1/status/{self.phonepe_merchant_id}/{merchant_transaction_id}{self.phonepe_salt_key}"
            x_verify = hashlib.sha256(checksum_string.encode()).hexdigest() + "###" + self.phonepe_salt_index
            
            headers = {
                "Content-Type": "application/json",
                "X-VERIFY": x_verify,
                "X-MERCHANT-ID": self.phonepe_merchant_id
            }
            
            response = requests.get(url, headers=headers, timeout=10)
            
            if response.status_code == 200:
                data = response.json()
                
                if data.get("code") == "PAYMENT_SUCCESS":
                    payment_data = data.get("data", {})
                    return {
                        "verified": True,
                        "amount": payment_data.get("amount", 0) / 100,  # Convert paise to rupees
                        "method": payment_data.get("paymentInstrument", {}).get("type"),
                        "gateway": self.GATEWAY_PHONEPE,
                        "data": data
                    }
                else:
                    return {
                        "verified": False,
                        "error": f"Payment code: {data.get('code')}",
                        "data": data
                    }
            else:
                return {
                    "verified": False,
                    "error": f"API error: {response.status_code}"
                }
                
        except Exception as e:
            return {
                "verified": False,
                "error": f"Verification failed: {str(e)}"
            }
    
    def verify_payment(self, payment_id: str, transaction_id: str, gateway: str) -> Dict[str, Any]:
        """Universal payment verification router"""
        
        # Route to appropriate gateway
        if gateway == self.GATEWAY_RAZORPAY:
            result = self.verify_payment_razorpay(payment_id, transaction_id)
        elif gateway == self.GATEWAY_CASHFREE:
            result = self.verify_payment_cashfree(payment_id, transaction_id)
        elif gateway == self.GATEWAY_PAYTM:
            result = self.verify_payment_paytm(payment_id, transaction_id)
        elif gateway == self.GATEWAY_PHONEPE:
            result = self.verify_payment_phonepe(payment_id, transaction_id)
        else:
            return {
                "verified": False,
                "error": f"Unsupported gateway: {gateway}"
            }
        
        # Update database if verified
        if result.get("verified"):
            self._mark_payment_verified(payment_id, result)
        
        return result
    
    def _mark_payment_verified(self, payment_id: str, verification_data: Dict[str, Any]):
        """Mark payment as verified and generate download token"""
        download_token = self.generate_download_token(payment_id)
        token_expires_at = (datetime.utcnow() + timedelta(hours=24)).isoformat()
        verified_at = datetime.utcnow().isoformat()
        
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        cursor.execute("""
            UPDATE payments 
            SET status = 'verified',
                download_token = ?,
                token_expires_at = ?,
                verified_at = ?,
                metadata = ?
            WHERE payment_id = ?
        """, (
            download_token,
            token_expires_at,
            verified_at,
            json.dumps(verification_data),
            payment_id
        ))
        
        conn.commit()
        conn.close()
    
    def get_payment_status(self, payment_id: str) -> Optional[Dict[str, Any]]:
        """Get payment status by payment ID"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        cursor.execute("""
            SELECT payment_id, status, download_token, token_expires_at, 
                   customer_email, product_type, amount, verified_at
            FROM payments 
            WHERE payment_id = ?
        """, (payment_id,))
        
        row = cursor.fetchone()
        conn.close()
        
        if row:
            return {
                "payment_id": row[0],
                "status": row[1],
                "download_token": row[2],
                "token_expires_at": row[3],
                "customer_email": row[4],
                "product_type": row[5],
                "amount": row[6],
                "verified_at": row[7]
            }
        
        return None
    
    def validate_download_token(self, token: str) -> Optional[Dict[str, Any]]:
        """Validate download token and return payment info"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        cursor.execute("""
            SELECT payment_id, customer_email, product_type, token_expires_at, status
            FROM payments 
            WHERE download_token = ?
        """, (token,))
        
        row = cursor.fetchone()
        conn.close()
        
        if not row:
            return None
        
        # Check if token expired
        expires_at = datetime.fromisoformat(row[3])
        if datetime.utcnow() > expires_at:
            return None
        
        # Check if payment verified
        if row[4] != "verified":
            return None
        
        return {
            "payment_id": row[0],
            "customer_email": row[1],
            "product_type": row[2],
            "expires_at": row[3]
        }
    
    def _generate_paytm_checksum(self, params: Dict[str, Any]) -> str:
        """Generate Paytm checksum (simplified version)"""
        # In production, use Paytm's official checksum library
        params_string = json.dumps(params, separators=(',', ':'))
        checksum = hmac.new(
            self.paytm_key.encode(),
            params_string.encode(),
            hashlib.sha256
        ).hexdigest()
        return checksum


# Singleton instance
_verifier_instance = None

def get_payment_verifier() -> PaymentVerifier:
    """Get or create payment verifier singleton"""
    global _verifier_instance
    if _verifier_instance is None:
        _verifier_instance = PaymentVerifier()
    return _verifier_instance
