# -*- coding: utf-8 -*-
"""
Silero Voice Activity Detection (VAD) - Local Implementation
Provides ultra-fast, local speech detection to reduce cloud API costs and latency.
"""

import logging
import os
import numpy as np
from typing import Optional, Tuple
from dataclasses import dataclass

logger = logging.getLogger(__name__)

# Lazy load torch to reduce startup time
_torch = None
_vad_model = None
_vad_utils = None


@dataclass
class VADConfig:
    """Configuration for Voice Activity Detection"""
    # Detection thresholds
    threshold: float = 0.5  # Speech probability threshold (0.0-1.0)
    min_speech_duration_ms: int = 250  # Minimum speech segment duration
    min_silence_duration_ms: int = 300  # Minimum silence to end speech
    
    # Audio parameters
    sample_rate: int = 16000
    
    # Padding
    speech_pad_ms: int = 30  # Padding around speech segments


class SileroVAD:
    """
    Local Voice Activity Detection using Silero VAD.
    
    Benefits:
    - Works offline (no API calls)
    - Ultra-low latency (<10ms per chunk)
    - Reduces cloud transcription costs by 30-50%
    - Better end-of-speech detection than cloud VAD
    """
    
    def __init__(self, config: Optional[VADConfig] = None):
        self.config = config or VADConfig()
        self.model = None
        self.initialized = False
        self._speech_buffer = []
        self._is_speaking = False
        self._silence_samples = 0
        
    def _load_model(self) -> bool:
        """Load Silero VAD model"""
        global _torch, _vad_model, _vad_utils
        
        if self.model is not None:
            return True
        
        try:
            import torch
            _torch = torch
            
            # Load model from torch hub (cached after first download)
            logger.info("Loading Silero VAD model...")
            model, utils = torch.hub.load(
                repo_or_dir='snakers4/silero-vad',
                model='silero_vad',
                force_reload=False,
                onnx=False
            )
            
            self.model = model
            _vad_model = model
            _vad_utils = utils
            
            # Get utility functions
            self.get_speech_timestamps = utils[0]
            self.save_audio = utils[1]
            self.read_audio = utils[2]
            self.VADIterator = utils[3]
            self.collect_chunks = utils[4]
            
            self.initialized = True
            logger.info("✅ Silero VAD model loaded successfully")
            return True
            
        except ImportError:
            logger.warning("torch not installed. Run: pip install torch")
            return False
        except Exception as e:
            logger.error(f"Failed to load Silero VAD: {e}")
            return False
    
    def detect_speech(self, audio_chunk: np.ndarray) -> Tuple[bool, float]:
        """
        Detect if audio chunk contains speech.
        
        Args:
            audio_chunk: Audio samples as numpy array (int16 or float32)
            
        Returns:
            Tuple of (is_speech, confidence)
        """
        if not self.initialized and not self._load_model():
            # Fallback to energy-based detection
            return self._energy_vad(audio_chunk)
        
        try:
            # Convert to float32 if needed
            if audio_chunk.dtype == np.int16:
                audio_float = audio_chunk.astype(np.float32) / 32768.0
            else:
                audio_float = audio_chunk.astype(np.float32)
            
            # Ensure correct shape
            if len(audio_float.shape) > 1:
                audio_float = audio_float.flatten()
            
            # Convert to torch tensor
            audio_tensor = _torch.from_numpy(audio_float)
            
            # Get speech probability
            with _torch.no_grad():
                speech_prob = self.model(audio_tensor, self.config.sample_rate).item()
            
            is_speech = speech_prob >= self.config.threshold
            
            return is_speech, speech_prob
            
        except Exception as e:
            logger.warning(f"VAD detection error: {e}")
            return self._energy_vad(audio_chunk)
    
    def _energy_vad(self, audio_chunk: np.ndarray) -> Tuple[bool, float]:
        """Fallback energy-based VAD when model is not available"""
        # Calculate RMS energy
        if audio_chunk.dtype == np.int16:
            audio_float = audio_chunk.astype(np.float32) / 32768.0
        else:
            audio_float = audio_chunk.astype(np.float32)
        
        rms = np.sqrt(np.mean(audio_float ** 2))
        
        # Adaptive threshold (adjust based on your environment)
        threshold = float(os.getenv("VAD_ENERGY_THRESHOLD", "0.01"))
        
        is_speech = rms > threshold
        confidence = min(rms / threshold, 1.0) if threshold > 0 else 0.5
        
        return is_speech, confidence
    
    def process_stream(
        self,
        audio_chunk: np.ndarray
    ) -> Tuple[bool, bool, Optional[np.ndarray]]:
        """
        Process streaming audio for speech segments.
        
        Args:
            audio_chunk: Audio samples
            
        Returns:
            Tuple of (is_speaking, speech_ended, speech_audio)
            - is_speaking: Currently detecting speech
            - speech_ended: A speech segment just ended
            - speech_audio: Complete speech audio if speech_ended, else None
        """
        is_speech, confidence = self.detect_speech(audio_chunk)
        
        speech_ended = False
        speech_audio = None
        
        if is_speech:
            self._speech_buffer.append(audio_chunk)
            self._is_speaking = True
            self._silence_samples = 0
        else:
            if self._is_speaking:
                # Count silence duration
                self._silence_samples += len(audio_chunk)
                silence_ms = (self._silence_samples / self.config.sample_rate) * 1000
                
                if silence_ms >= self.config.min_silence_duration_ms:
                    # Speech ended
                    speech_ended = True
                    self._is_speaking = False
                    
                    # Return accumulated speech
                    if self._speech_buffer:
                        speech_audio = np.concatenate(self._speech_buffer)
                        self._speech_buffer = []
                    
                    self._silence_samples = 0
                else:
                    # Still within tolerance, buffer the silence too
                    self._speech_buffer.append(audio_chunk)
        
        return self._is_speaking, speech_ended, speech_audio
    
    def reset(self):
        """Reset VAD state"""
        self._speech_buffer = []
        self._is_speaking = False
        self._silence_samples = 0
    
    def get_speech_segments(
        self,
        audio: np.ndarray,
        return_seconds: bool = False
    ) -> list:
        """
        Get all speech segments from audio.
        
        Args:
            audio: Complete audio as numpy array
            return_seconds: If True, return timestamps in seconds
            
        Returns:
            List of {'start': int/float, 'end': int/float} dictionaries
        """
        if not self.initialized and not self._load_model():
            logger.warning("VAD model not available, returning full audio as speech")
            return [{'start': 0, 'end': len(audio)}]
        
        try:
            if audio.dtype == np.int16:
                audio_float = audio.astype(np.float32) / 32768.0
            else:
                audio_float = audio.astype(np.float32)
            
            audio_tensor = _torch.from_numpy(audio_float)
            
            segments = self.get_speech_timestamps(
                audio_tensor,
                self.model,
                sampling_rate=self.config.sample_rate,
                threshold=self.config.threshold,
                min_speech_duration_ms=self.config.min_speech_duration_ms,
                min_silence_duration_ms=self.config.min_silence_duration_ms,
                speech_pad_ms=self.config.speech_pad_ms,
                return_seconds=return_seconds
            )
            
            return segments
            
        except Exception as e:
            logger.error(f"Error getting speech segments: {e}")
            return [{'start': 0, 'end': len(audio)}]


# Global instance
_silero_vad: Optional[SileroVAD] = None


def get_vad() -> SileroVAD:
    """Get or create the global Silero VAD instance"""
    global _silero_vad
    if _silero_vad is None:
        _silero_vad = SileroVAD()
    return _silero_vad


def filter_speech(
    audio: np.ndarray,
    sample_rate: int = 16000
) -> np.ndarray:
    """
    Filter audio to only include speech segments.
    Useful for reducing data sent to cloud transcription.
    
    Args:
        audio: Audio samples
        sample_rate: Sample rate
        
    Returns:
        Audio containing only speech segments
    """
    vad = get_vad()
    vad.config.sample_rate = sample_rate
    
    segments = vad.get_speech_segments(audio)
    
    if not segments:
        return np.array([], dtype=audio.dtype)
    
    speech_chunks = []
    for seg in segments:
        start = seg['start']
        end = seg['end']
        speech_chunks.append(audio[start:end])
    
    if speech_chunks:
        return np.concatenate(speech_chunks)
    return np.array([], dtype=audio.dtype)
