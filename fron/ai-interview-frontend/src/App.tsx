// File: src/App.tsx
import { useState, useRef, useEffect } from 'react';
import './App.css';

function App() {
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isInterviewStarted, setIsInterviewStarted] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [conversation, setConversation] = useState<Array<{ role: string; text: string }>>([]);
  const [error, setError] = useState<string | null>(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [canInteract, setCanInteract] = useState(true);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<BlobPart[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const synth = window.speechSynthesis;
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setError(null);
    }
  };

  const handleUpload = async () => {
    if (!file) {
      setError("Please select a resume file first");
      return;
    }

    try {
      setIsUploading(true);
      setError(null);
      setCanInteract(false);
      
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('http://127.0.0.1:8000/upload', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();
      
      if (data.error) {
        setError(data.error);
      } else {
        setIsInterviewStarted(true);
        setConversation([{ role: 'interviewer', text: data.Response }]);
        speakText(data.Response);
      }
    } catch (err) {
      setError("Failed to upload resume. Please try again.");
      console.error(err);
    } finally {
      setIsUploading(false);
      setCanInteract(true);
    }
  };

  const startRecording = async () => {
    try {
      setError(null);
      setCanInteract(false);
      
      // Reset audio chunks
      audioChunksRef.current = [];
      
      // Get audio stream
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true,
        } 
      });
      
      streamRef.current = stream;
      
      // Create MediaRecorder with specific MIME type
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm',
      });
      
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };
      
      mediaRecorder.onstop = async () => {
        // Convert audio to proper format
        await sendAudioToBackend();
      };

      // Set 10ms timeSlice to get frequent ondataavailable events
      mediaRecorder.start(10);
      mediaRecorderRef.current = mediaRecorder;
      setIsRecording(true);
      setCanInteract(true);
    } catch (err) {
      setError("Failed to access microphone. Please check your permissions.");
      console.error(err);
      setCanInteract(true);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      setCanInteract(false);
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      
      // Stop all audio tracks
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    }
  };

  const sendAudioToBackend = async () => {
    try {
      // Create blob from audio chunks
      const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
      
      // Create a placeholder in the conversation for the user's message
      setConversation(prev => [...prev, { 
        role: 'user', 
        text: 'Processing your response...' 
      }]);

      // Convert webm to wav using audio context
      const audioContext = new AudioContext();
      const fileReader = new FileReader();
      
      fileReader.onload = async (e) => {
        if (!e.target?.result) return;
        
        try {
          // Decode the audio data
          const audioData = await audioContext.decodeAudioData(e.target.result as ArrayBuffer);
          
          // Get audio buffer
          const offlineContext = new OfflineAudioContext(
            1, // Use mono
            audioData.length,
            16000 // Match sample rate with backend expectation
          );
          
          // Create audio source
          const source = offlineContext.createBufferSource();
          source.buffer = audioData;
          source.connect(offlineContext.destination);
          source.start(0);
          
          // Render audio
          const renderedBuffer = await offlineContext.startRendering();
          
          // Convert to WAV
          const wavBlob = createWavBlobFromAudioBuffer(renderedBuffer);
          
          // Send WAV file to backend
          const formData = new FormData();
          formData.append('file', wavBlob, 'recording.wav');
          
          const response = await fetch('http://127.0.0.1:8000/transcribe', {
            method: 'POST',
            body: formData
          });
          
          const data = await response.json();
          
          if (data.error) {
            setError(data.error);
            setConversation(prev => {
              const updated = [...prev];
              updated[updated.length - 1] = { role: 'user', text: 'Error: Could not understand audio' };
              return updated;
            });
          } else {
            // Extract transcribed text
            const transcribedText = data.transcribed_text || "Your response was recorded";
            
            // Update conversation
            setConversation(prev => {
              const updated = [...prev];
              // Replace the "Processing..." message with the actual transcription
              updated[updated.length - 1] = { role: 'user', text: transcribedText };
              // Add the interviewer's response
              updated.push({ role: 'interviewer', text: data.Response });
              return updated;
            });
            
            // Speak the interviewer's response
            speakText(data.Response);
          }
        } catch (err) {
          console.error("Error processing audio:", err);
          setError("Failed to process audio. Please try again.");
        } finally {
          setCanInteract(true);
        }
      };
      
      fileReader.readAsArrayBuffer(audioBlob);
      
    } catch (err) {
      setError("Failed to send audio to the server.");
      console.error(err);
      setCanInteract(true);
    }
  };

  // Function to create WAV blob from AudioBuffer
  const createWavBlobFromAudioBuffer = (audioBuffer: AudioBuffer): Blob => {
    // Get audio data
    const numChannels = 1; // Mono
    const sampleRate = audioBuffer.sampleRate;
    const numSamples = audioBuffer.length;
    const audioData = audioBuffer.getChannelData(0); // Get mono channel
    
    // Create buffer with WAV container
    const buffer = new ArrayBuffer(44 + numSamples * 2);
    const view = new DataView(buffer);
    
    // Write WAV header
    // "RIFF" chunk descriptor
    writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + numSamples * 2, true); // Chunk size
    writeString(view, 8, 'WAVE');
    
    // "fmt " sub-chunk
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true); // Subchunk1Size (16 for PCM)
    view.setUint16(20, 1, true); // AudioFormat (1 for PCM)
    view.setUint16(22, numChannels, true); // NumChannels
    view.setUint32(24, sampleRate, true); // SampleRate
    view.setUint32(28, sampleRate * numChannels * 2, true); // ByteRate
    view.setUint16(32, numChannels * 2, true); // BlockAlign
    view.setUint16(34, 16, true); // BitsPerSample
    
    // "data" sub-chunk
    writeString(view, 36, 'data');
    view.setUint32(40, numSamples * 2, true); // Subchunk2Size
    
    // Write PCM audio data
    const floatTo16BitPCM = (output: DataView, offset: number, input: Float32Array) => {
      for (let i = 0; i < input.length; i++, offset += 2) {
        const s = Math.max(-1, Math.min(1, input[i]));
        output.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
      }
    };
    
    floatTo16BitPCM(view, 44, audioData);
    
    return new Blob([buffer], { type: 'audio/wav' });
  };
  
  // Helper function to write string to DataView
  const writeString = (view: DataView, offset: number, string: string) => {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  };

  // Improved speech synthesis with better error handling
  const speakText = (text: string) => {
    // Cancel any ongoing speech
    if (synth.speaking) {
      synth.cancel();
    }
    
    // Create new utterance and store reference
    const utterance = new SpeechSynthesisUtterance(text);
    utteranceRef.current = utterance;
    
    // Split text into manageable chunks
    const textChunks = splitTextIntoChunks(text, 200);
    
    let currentChunkIndex = 0;
    
    // Set up event handlers
    utterance.onstart = () => {
      setIsSpeaking(true);
      setCanInteract(false);
    };
    
    utterance.onend = () => {
      currentChunkIndex++;
      
      if (currentChunkIndex < textChunks.length) {
        // Speak next chunk
        const nextUtterance = new SpeechSynthesisUtterance(textChunks[currentChunkIndex]);
        utteranceRef.current = nextUtterance;
        
        nextUtterance.onend = utterance.onend;
        nextUtterance.onerror = utterance.onerror;
        
        setTimeout(() => {
          synth.speak(nextUtterance);
        }, 300);
      } else {
        // All chunks completed
        setIsSpeaking(false);
        setCanInteract(true);
      }
    };
    
    utterance.onerror = (event) => {
      console.error("Speech synthesis error:", event);
      setIsSpeaking(false);
      setCanInteract(true);
      setError("Voice playback error. Please try refreshing the page.");
    };
    
    // Start with first chunk
    utterance.text = textChunks[0];
    synth.speak(utterance);
  };
  
  // Split long text into smaller chunks for better speech synthesis
  const splitTextIntoChunks = (text: string, maxChunkLength: number): string[] => {
    const chunks: string[] = [];
    
    // If text is short enough, return it as a single chunk
    if (text.length <= maxChunkLength) {
      return [text];
    }
    
    // Split by sentences first
    const sentences = text.split(/(?<=[.!?])\s+/);
    let currentChunk = "";
    
    for (const sentence of sentences) {
      // If adding this sentence would exceed max length, start a new chunk
      if (currentChunk.length + sentence.length > maxChunkLength && currentChunk.length > 0) {
        chunks.push(currentChunk);
        currentChunk = sentence;
      } else {
        // Add to current chunk
        currentChunk += (currentChunk ? " " : "") + sentence;
      }
    }
    
    // Add the last chunk if there's anything left
    if (currentChunk) {
      chunks.push(currentChunk);
    }
    
    return chunks;
  };

  // Function to stop speaking
  const stopSpeaking = () => {
    if (synth.speaking) {
      synth.cancel();
      setIsSpeaking(false);
      setCanInteract(true);
    }
  };

  // Clean up resources when component unmounts
  useEffect(() => {
    return () => {
      if (synth.speaking) {
        synth.cancel();
      }
      
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  // Auto-scroll to bottom of conversation
  useEffect(() => {
    const container = document.querySelector('.conversation-container');
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  }, [conversation]);

  return (
    <div className="app-container">
      <header>
        <h1>AI Interview Assistant</h1>
      </header>
      
      <main>
        {error && <div className="error-message">{error}</div>}
        
        {!isInterviewStarted ? (
          <div className="upload-section">
            <h2>Upload Your Resume</h2>
            <p>Please upload your resume in PDF format to begin the interview</p>
            
            <div className="file-input">
              <input 
                type="file" 
                accept=".pdf" 
                onChange={handleFileChange} 
                disabled={isUploading || !canInteract} 
                id="file-upload"
                className="file-upload-input"
              />
              <label htmlFor="file-upload" className={`file-upload-label ${!canInteract ? 'disabled' : ''}`}>
                {file ? file.name : 'Choose File'}
              </label>
              
              <button 
                onClick={handleUpload} 
                disabled={!file || isUploading || !canInteract}
                className="upload-btn"
              >
                {isUploading ? 'Processing...' : 'Start Interview'}
              </button>
            </div>
          </div>
        ) : (
          <div className="interview-section">
            <h2>Interview in Progress</h2>
            
            <div className="conversation-container">
              {conversation.map((message, index) => (
                <div 
                  key={index} 
                  className={`message ${message.role === 'interviewer' ? 'interviewer' : 'user'}`}
                >
                  <div className="message-header">
                    {message.role === 'interviewer' ? 'Interviewer' : 'You'}
                  </div>
                  <div className="message-body">{message.text}</div>
                </div>
              ))}
            </div>
            
            <div className="controls">
              {isSpeaking && (
                <button 
                  onClick={stopSpeaking}
                  className="stop-speech-btn"
                  disabled={!canInteract && !isSpeaking}
                >
                  Stop Playback
                </button>
              )}
              
              <button 
                onClick={isRecording ? stopRecording : startRecording}
                className={`record-btn ${isRecording ? 'recording' : ''}`}
                disabled={!canInteract || (isSpeaking && !isRecording)}
              >
                {isRecording ? 'Stop Recording' : 'Start Recording'}
              </button>
              
              {isSpeaking && (
                <div className="speaking-indicator">
                  <div className="wave"></div>
                  <div className="wave"></div>
                  <div className="wave"></div>
                  <div className="wave"></div>
                  <div className="wave"></div>
                </div>
              )}
            </div>
          </div>
        )}
      </main>
      
      <footer>
        <p>Created by Mayank & Gaurav </p>
        <p>Upload your resume to start the interview process</p>
      </footer>
    </div>
  );
}

export default App;