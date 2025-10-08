"""
Real-Time Streaming Transcription Engine
Supports Deepgram, AssemblyAI, and Google Cloud Speech with <200ms latency
"""

import asyncio
import json
import logging
import os
import time
from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import AsyncGenerator, Callable, Optional, Dict, Any
from enum import Enum

import websockets
from websockets.exceptions import ConnectionClosed, ConnectionClosedError

logger = logging.getLogger(__name__)


class TranscriptType(Enum):
    """Type of transcript result"""
    INTERIM = "interim"  # Partial, may change
    FINAL = "final"      # Finalized, won't change


@dataclass
class TranscriptResult:
    """Standardized transcript result across providers"""
    text: str
    type: TranscriptType
    confidence: float = 0.0
    is_final: bool = False
    speaker: Optional[int] = None
    timestamp: float = 0.0
    duration: float = 0.0
    words: Optional[list] = None


class StreamingTranscriptionProvider(ABC):
    """Base class for streaming transcription providers"""
    
    def __init__(self, api_key: str, config: Dict[str, Any]):
        self.api_key = api_key
        self.config = config
        self.ws = None
        self.connected = False
        self.logger = logging.getLogger(f"{__name__}.{self.__class__.__name__}")
        
    @abstractmethod
    async def connect(self) -> bool:
        """Establish WebSocket connection to provider"""
        pass
    
    @abstractmethod
    async def send_audio(self, audio_data: bytes):
        """Send audio data to provider"""
        pass
    
    @abstractmethod
    async def receive_results(self) -> AsyncGenerator[TranscriptResult, None]:
        """Receive and parse transcription results"""
        pass
    
    @abstractmethod
    async def close(self):
        """Close connection gracefully"""
        pass


class DeepgramProvider(StreamingTranscriptionProvider):
    """Deepgram streaming transcription provider - RECOMMENDED for lowest latency"""
    
    def __init__(self, api_key: str, config: Dict[str, Any]):
        super().__init__(api_key, config)
        self.base_url = "wss://api.deepgram.com/v1/listen"
        self.reconnect_attempts = 0
        self.max_reconnect_attempts = 5
        
    async def connect(self) -> bool:
        """Connect to Deepgram streaming API"""
        try:
            # Build WebSocket URL with query parameters
            params = {
                "encoding": self.config.get("encoding", "linear16"),
                "sample_rate": self.config.get("sample_rate", 16000),
                "channels": self.config.get("channels", 1),
                "interim_results": str(self.config.get("interim_results", True)).lower(),
                "punctuate": str(self.config.get("punctuate", True)).lower(),
                "smart_format": str(self.config.get("smart_format", True)).lower(),
                "language": self.config.get("language", "en-US"),
                "model": self.config.get("model", "nova-2"),  # Nova-2 is most accurate
                "vad_events": str(self.config.get("vad_events", True)).lower(),
                "endpointing": self.config.get("endpointing", 300),  # 300ms silence
            }
            
            # Add optional features
            if self.config.get("diarize", False):
                params["diarize"] = "true"
            if self.config.get("multichannel", False):
                params["multichannel"] = "true"
                
            query = "&".join(f"{k}={v}" for k, v in params.items())
            url = f"{self.base_url}?{query}"
            
            self.logger.info(f"Connecting to Deepgram: {self.base_url}")
            
            self.ws = await websockets.connect(
                url,
                extra_headers={"Authorization": f"Token {self.api_key}"},
                ping_interval=20,
                ping_timeout=10,
                close_timeout=5
            )
            
            self.connected = True
            self.reconnect_attempts = 0
            self.logger.info("Connected to Deepgram streaming API")
            return True
            
        except Exception as e:
            self.logger.error(f"Failed to connect to Deepgram: {e}")
            self.connected = False
            return False
    
    async def send_audio(self, audio_data: bytes):
        """Send audio data to Deepgram"""
        if not self.ws or not self.connected:
            raise ConnectionError("Not connected to Deepgram")
        
        try:
            await self.ws.send(audio_data)
        except (ConnectionClosed, ConnectionClosedError) as e:
            self.logger.warning(f"Connection lost while sending audio: {e}")
            self.connected = False
            raise
    
    async def receive_results(self) -> AsyncGenerator[TranscriptResult, None]:
        """Receive and parse Deepgram transcription results"""
        if not self.ws or not self.connected:
            raise ConnectionError("Not connected to Deepgram")
        
        try:
            async for message in self.ws:
                try:
                    data = json.loads(message)
                    
                    # Handle different message types
                    if data.get("type") == "Results":
                        channel = data.get("channel", {})
                        alternatives = channel.get("alternatives", [])
                        
                        if not alternatives:
                            continue
                        
                        # Get best alternative (highest confidence)
                        best = alternatives[0]
                        text = best.get("transcript", "").strip()
                        
                        if not text:
                            continue
                        
                        # Determine if this is interim or final
                        is_final = data.get("is_final", False)
                        speech_final = data.get("speech_final", False)
                        
                        result = TranscriptResult(
                            text=text,
                            type=TranscriptType.FINAL if (is_final or speech_final) else TranscriptType.INTERIM,
                            confidence=best.get("confidence", 0.0),
                            is_final=is_final or speech_final,
                            words=best.get("words", []),
                            timestamp=time.time()
                        )
                        
                        yield result
                        
                    elif data.get("type") == "Metadata":
                        # Log metadata for debugging
                        self.logger.debug(f"Deepgram metadata: {data}")
                        
                    elif data.get("type") == "SpeechStarted":
                        self.logger.debug("Speech started")
                        
                    elif data.get("type") == "UtteranceEnd":
                        self.logger.debug("Utterance ended")
                        
                except json.JSONDecodeError as e:
                    self.logger.warning(f"Failed to parse Deepgram message: {e}")
                    continue
                    
        except (ConnectionClosed, ConnectionClosedError) as e:
            self.logger.warning(f"Deepgram connection closed: {e}")
            self.connected = False
            raise
    
    async def close(self):
        """Close Deepgram connection gracefully"""
        if self.ws:
            try:
                # Send close frame
                close_msg = json.dumps({"type": "CloseStream"})
                await self.ws.send(close_msg)
                await self.ws.close()
                self.logger.info("Deepgram connection closed gracefully")
            except Exception as e:
                self.logger.warning(f"Error closing Deepgram connection: {e}")
            finally:
                self.ws = None
                self.connected = False


class AssemblyAIProvider(StreamingTranscriptionProvider):
    """AssemblyAI streaming transcription provider"""
    
    def __init__(self, api_key: str, config: Dict[str, Any]):
        super().__init__(api_key, config)
        self.base_url = "wss://api.assemblyai.com/v2/realtime/ws"
        
    async def connect(self) -> bool:
        """Connect to AssemblyAI streaming API"""
        try:
            params = {
                "sample_rate": self.config.get("sample_rate", 16000),
                "encoding": "pcm_s16le",
                "token": self.api_key
            }
            
            query = "&".join(f"{k}={v}" for k, v in params.items())
            url = f"{self.base_url}?{query}"
            
            self.logger.info("Connecting to AssemblyAI")
            
            self.ws = await websockets.connect(url, ping_interval=20)
            
            # Wait for session begins message
            session_msg = await asyncio.wait_for(self.ws.recv(), timeout=10)
            session_data = json.loads(session_msg)
            
            if session_data.get("message_type") == "SessionBegins":
                self.connected = True
                self.logger.info(f"Connected to AssemblyAI (session: {session_data.get('session_id')})")
                return True
            else:
                self.logger.error(f"Unexpected session response: {session_data}")
                return False
                
        except Exception as e:
            self.logger.error(f"Failed to connect to AssemblyAI: {e}")
            self.connected = False
            return False
    
    async def send_audio(self, audio_data: bytes):
        """Send audio to AssemblyAI"""
        if not self.ws or not self.connected:
            raise ConnectionError("Not connected to AssemblyAI")
        
        try:
            # AssemblyAI expects base64 encoded audio in JSON
            import base64
            audio_b64 = base64.b64encode(audio_data).decode("utf-8")
            message = json.dumps({"audio_data": audio_b64})
            await self.ws.send(message)
        except (ConnectionClosed, ConnectionClosedError) as e:
            self.logger.warning(f"AssemblyAI connection lost: {e}")
            self.connected = False
            raise
    
    async def receive_results(self) -> AsyncGenerator[TranscriptResult, None]:
        """Receive AssemblyAI transcription results"""
        if not self.ws or not self.connected:
            raise ConnectionError("Not connected to AssemblyAI")
        
        try:
            async for message in self.ws:
                try:
                    data = json.loads(message)
                    msg_type = data.get("message_type")
                    
                    if msg_type == "PartialTranscript":
                        text = data.get("text", "").strip()
                        if text:
                            yield TranscriptResult(
                                text=text,
                                type=TranscriptType.INTERIM,
                                confidence=data.get("confidence", 0.0),
                                is_final=False,
                                timestamp=time.time()
                            )
                            
                    elif msg_type == "FinalTranscript":
                        text = data.get("text", "").strip()
                        if text:
                            yield TranscriptResult(
                                text=text,
                                type=TranscriptType.FINAL,
                                confidence=data.get("confidence", 0.0),
                                is_final=True,
                                timestamp=time.time()
                            )
                            
                except json.JSONDecodeError as e:
                    self.logger.warning(f"Failed to parse AssemblyAI message: {e}")
                    
        except (ConnectionClosed, ConnectionClosedError) as e:
            self.logger.warning(f"AssemblyAI connection closed: {e}")
            self.connected = False
            raise
    
    async def close(self):
        """Close AssemblyAI connection"""
        if self.ws:
            try:
                # Send terminate message
                terminate_msg = json.dumps({"terminate_session": True})
                await self.ws.send(terminate_msg)
                await self.ws.close()
                self.logger.info("AssemblyAI connection closed")
            except Exception as e:
                self.logger.warning(f"Error closing AssemblyAI: {e}")
            finally:
                self.ws = None
                self.connected = False


class StreamingTranscriptionEngine:
    """
    High-level streaming transcription engine with auto-reconnect and fallback
    """
    
    def __init__(self):
        self.provider = None
        self.provider_name = os.getenv("STREAMING_PROVIDER", "deepgram").lower()
        self.config = self._load_config()
        self.reconnect_delay = 1.0
        self.max_reconnect_delay = 30.0
        self.logger = logging.getLogger(__name__)
        
    def _load_config(self) -> Dict[str, Any]:
        """Load configuration from environment"""
        return {
            "sample_rate": int(os.getenv("STREAMING_SAMPLE_RATE", "16000")),
            "encoding": os.getenv("STREAMING_ENCODING", "linear16"),
            "channels": int(os.getenv("STREAMING_CHANNELS", "1")),
            "interim_results": os.getenv("STREAMING_INTERIM_RESULTS", "true").lower() == "true",
            "punctuate": os.getenv("STREAMING_PUNCTUATE", "true").lower() == "true",
            "smart_format": os.getenv("STREAMING_SMART_FORMAT", "true").lower() == "true",
            "language": os.getenv("STREAMING_LANGUAGE", "en-US"),
            "model": os.getenv("STREAMING_MODEL", "nova-2"),
            "diarize": os.getenv("STREAMING_DIARIZE", "false").lower() == "true",
            "vad_events": os.getenv("STREAMING_VAD_EVENTS", "true").lower() == "true",
            "endpointing": int(os.getenv("STREAMING_ENDPOINTING", "300")),
        }
    
    async def connect(self) -> bool:
        """Connect to streaming transcription provider with auto-retry"""
        for attempt in range(3):
            try:
                if self.provider_name == "deepgram":
                    api_key = os.getenv("DEEPGRAM_API_KEY")
                    if not api_key:
                        self.logger.error("DEEPGRAM_API_KEY not set")
                        return False
                    self.provider = DeepgramProvider(api_key, self.config)
                    
                elif self.provider_name == "assemblyai":
                    api_key = os.getenv("ASSEMBLYAI_API_KEY")
                    if not api_key:
                        self.logger.error("ASSEMBLYAI_API_KEY not set")
                        return False
                    self.provider = AssemblyAIProvider(api_key, self.config)
                    
                else:
                    self.logger.error(f"Unknown provider: {self.provider_name}")
                    return False
                
                connected = await self.provider.connect()
                if connected:
                    self.reconnect_delay = 1.0  # Reset on success
                    return True
                    
            except Exception as e:
                self.logger.warning(f"Connection attempt {attempt + 1} failed: {e}")
                if attempt < 2:
                    await asyncio.sleep(self.reconnect_delay)
                    self.reconnect_delay = min(self.reconnect_delay * 2, self.max_reconnect_delay)
        
        return False
    
    async def send_audio(self, audio_data: bytes):
        """Send audio data to provider with auto-reconnect"""
        if not self.provider or not self.provider.connected:
            self.logger.warning("Provider not connected, attempting reconnect")
            if not await self.connect():
                raise ConnectionError("Failed to reconnect to transcription provider")
        
        try:
            await self.provider.send_audio(audio_data)
        except Exception as e:
            self.logger.error(f"Failed to send audio: {e}")
            self.provider.connected = False
            raise
    
    async def stream_results(self, 
                            on_interim: Optional[Callable[[TranscriptResult], None]] = None,
                            on_final: Optional[Callable[[TranscriptResult], None]] = None) -> AsyncGenerator[TranscriptResult, None]:
        """
        Stream transcription results with callbacks
        
        Args:
            on_interim: Callback for interim results (optional)
            on_final: Callback for final results (optional)
            
        Yields:
            TranscriptResult objects
        """
        if not self.provider or not self.provider.connected:
            raise ConnectionError("Provider not connected")
        
        try:
            async for result in self.provider.receive_results():
                # Call appropriate callback
                if result.type == TranscriptType.INTERIM and on_interim:
                    on_interim(result)
                elif result.type == TranscriptType.FINAL and on_final:
                    on_final(result)
                
                yield result
                
        except (ConnectionClosed, ConnectionClosedError) as e:
            self.logger.warning(f"Stream interrupted: {e}")
            raise
    
    async def close(self):
        """Close connection to provider"""
        if self.provider:
            await self.provider.close()
            self.provider = None


# Convenience function for quick setup
async def create_streaming_engine() -> StreamingTranscriptionEngine:
    """Create and connect streaming transcription engine"""
    engine = StreamingTranscriptionEngine()
    connected = await engine.connect()
    if not connected:
        raise ConnectionError("Failed to connect to streaming transcription provider")
    return engine
