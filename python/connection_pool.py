"""
Connection Pool Manager for Interview AI
Provides optimized, persistent HTTP connections for maximum throughput.
"""

import asyncio
import logging
import os
import time
from typing import Dict, Optional, Any
import httpx

logger = logging.getLogger(__name__)


class ConnectionPoolManager:
    """
    Centralized HTTP connection pool manager.
    
    Benefits:
    - Reuses TCP connections (eliminates handshake latency)
    - HTTP/2 multiplexing (multiple requests over single connection)
    - Connection keep-alive management
    - Automatic retry with backoff
    """
    
    _instance: Optional['ConnectionPoolManager'] = None
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._initialized = False
        return cls._instance
    
    def __init__(self):
        if self._initialized:
            return
        
        self._clients: Dict[str, httpx.AsyncClient] = {}
        self._locks: Dict[str, asyncio.Lock] = {}
        self._stats = {
            'requests': 0,
            'connections_created': 0,
            'connection_reuses': 0,
            'errors': 0
        }
        self._initialized = True
        logger.info("ConnectionPoolManager initialized")
    
    async def get_client(
        self,
        base_url: str,
        headers: Optional[Dict[str, str]] = None,
        timeout: float = 60.0,
        http2: bool = True
    ) -> httpx.AsyncClient:
        """
        Get or create an async HTTP client for the given base URL.
        
        Args:
            base_url: The base URL for the client
            headers: Default headers for all requests
            timeout: Request timeout in seconds
            http2: Enable HTTP/2 (recommended for multiplexing)
            
        Returns:
            Configured AsyncClient instance
        """
        # Create lock for this base_url if not exists
        if base_url not in self._locks:
            self._locks[base_url] = asyncio.Lock()
        
        async with self._locks[base_url]:
            if base_url in self._clients:
                self._stats['connection_reuses'] += 1
                return self._clients[base_url]
            
            # Create new client with optimized settings
            timeout_config = httpx.Timeout(
                timeout,
                connect=5.0,
                read=timeout,
                write=15.0
            )
            
            limits = httpx.Limits(
                max_keepalive_connections=20,
                max_connections=50,
                keepalive_expiry=60.0
            )
            
            try:
                client = httpx.AsyncClient(
                    base_url=base_url,
                    timeout=timeout_config,
                    limits=limits,
                    headers=headers or {},
                    http2=http2
                )
                self._clients[base_url] = client
                self._stats['connections_created'] += 1
                logger.info(f"Created HTTP client for {base_url} (HTTP/2={http2})")
                return client
                
            except Exception as e:
                logger.error(f"Failed to create HTTP client: {e}")
                # Fallback to HTTP/1.1
                client = httpx.AsyncClient(
                    base_url=base_url,
                    timeout=timeout_config,
                    limits=limits,
                    headers=headers or {},
                    http2=False
                )
                self._clients[base_url] = client
                self._stats['connections_created'] += 1
                return client
    
    async def close_all(self):
        """Close all HTTP clients gracefully"""
        for base_url, client in self._clients.items():
            try:
                await client.aclose()
                logger.debug(f"Closed client for {base_url}")
            except Exception as e:
                logger.warning(f"Error closing client for {base_url}: {e}")
        
        self._clients.clear()
        logger.info("All HTTP clients closed")
    
    def get_stats(self) -> Dict[str, int]:
        """Get connection pool statistics"""
        return {
            **self._stats,
            'active_clients': len(self._clients)
        }


# Singleton instance
_pool_manager: Optional[ConnectionPoolManager] = None


def get_pool_manager() -> ConnectionPoolManager:
    """Get the global connection pool manager"""
    global _pool_manager
    if _pool_manager is None:
        _pool_manager = ConnectionPoolManager()
    return _pool_manager


async def make_request(
    method: str,
    url: str,
    headers: Optional[Dict[str, str]] = None,
    json: Optional[Dict[str, Any]] = None,
    timeout: float = 60.0,
    retries: int = 2
) -> httpx.Response:
    """
    Make an HTTP request using the connection pool.
    
    Args:
        method: HTTP method (GET, POST, etc.)
        url: Full URL to request
        headers: Request headers
        json: JSON body for POST/PUT
        timeout: Request timeout
        retries: Number of retry attempts
        
    Returns:
        httpx.Response object
    """
    pool = get_pool_manager()
    
    # Extract base URL
    from urllib.parse import urlparse
    parsed = urlparse(url)
    base_url = f"{parsed.scheme}://{parsed.netloc}"
    path = parsed.path
    if parsed.query:
        path += f"?{parsed.query}"
    
    client = await pool.get_client(base_url, timeout=timeout)
    
    last_error = None
    for attempt in range(retries + 1):
        try:
            pool._stats['requests'] += 1
            
            if method.upper() == 'GET':
                response = await client.get(path, headers=headers)
            elif method.upper() == 'POST':
                response = await client.post(path, headers=headers, json=json)
            elif method.upper() == 'PUT':
                response = await client.put(path, headers=headers, json=json)
            elif method.upper() == 'DELETE':
                response = await client.delete(path, headers=headers)
            else:
                raise ValueError(f"Unsupported method: {method}")
            
            return response
            
        except (httpx.TimeoutException, httpx.ConnectError) as e:
            last_error = e
            pool._stats['errors'] += 1
            
            if attempt < retries:
                delay = 1.0 * (attempt + 1)  # Linear backoff
                logger.warning(f"Request failed (attempt {attempt + 1}), retrying in {delay}s: {e}")
                await asyncio.sleep(delay)
            else:
                raise
    
    raise last_error


class RateLimiter:
    """
    Token bucket rate limiter for API calls.
    Prevents hitting rate limits and ensures smooth API usage.
    """
    
    def __init__(
        self,
        requests_per_second: float = 10.0,
        burst_size: int = 20
    ):
        """
        Args:
            requests_per_second: Sustained request rate
            burst_size: Maximum burst size
        """
        self.rate = requests_per_second
        self.burst_size = burst_size
        self.tokens = burst_size
        self.last_update = time.time()
        self._lock = asyncio.Lock()
    
    async def acquire(self):
        """Wait until a request can be made"""
        async with self._lock:
            now = time.time()
            elapsed = now - self.last_update
            self.last_update = now
            
            # Add tokens based on elapsed time
            self.tokens = min(
                self.burst_size,
                self.tokens + elapsed * self.rate
            )
            
            if self.tokens >= 1:
                self.tokens -= 1
                return
            
            # Wait for token
            wait_time = (1 - self.tokens) / self.rate
            await asyncio.sleep(wait_time)
            self.tokens = 0


# Global rate limiters for different APIs
_rate_limiters: Dict[str, RateLimiter] = {}


def get_rate_limiter(api_name: str, rps: float = 10.0) -> RateLimiter:
    """Get or create a rate limiter for an API"""
    if api_name not in _rate_limiters:
        _rate_limiters[api_name] = RateLimiter(requests_per_second=rps)
    return _rate_limiters[api_name]
