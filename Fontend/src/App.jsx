import React, { useState, useRef, useEffect, useCallback } from 'react';
import './App.css'; // Assuming you have this CSS file for styling

// Removed UploadSection and InterviewSection imports as their JSX will be integrated

function App() {
  const [file, setFile] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isInterviewStarted, setIsInterviewStarted] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [conversation, setConversation] = useState([]);
  const [error, setError] = useState(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [canInteract, setCanInteract] = useState(true);

  // New states for results page and feedback
  const [currentPage, setCurrentPage] = useState('interview'); // 'interview' | 'results'
  const [feedbackData, setFeedbackData] = useState(null); // Will store FeedbackItem[]
  const [isEvaluating, setIsEvaluating] = useState(false);

  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const streamRef = useRef(null);
  const synth = window.speechSynthesis;
  const utteranceRef = useRef(null);

  // --- Existing Helper Functions (createWavBlobFromAudioBuffer, writeString, splitTextIntoChunks) ---
  // These functions remain largely the same.

  const createWavBlobFromAudioBuffer = (audioBuffer) => {
    const numChannels = 1; // Mono
    const sampleRate = audioBuffer.sampleRate;
    const numSamples = audioBuffer.length;
    const audioData = audioBuffer.getChannelData(0);
    const buffer = new ArrayBuffer(44 + numSamples * 2);
    const view = new DataView(buffer);

    writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + numSamples * 2, true);
    writeString(view, 8, 'WAVE');
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * numChannels * 2, true);
    view.setUint16(32, numChannels * 2, true);
    view.setUint16(34, 16, true);
    writeString(view, 36, 'data');
    view.setUint32(40, numSamples * 2, true);

    const floatTo16BitPCM = (output, offset, input) => {
      for (let i = 0; i < input.length; i++, offset += 2) {
        const s = Math.max(-1, Math.min(1, input[i]));
        output.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
      }
    };
    floatTo16BitPCM(view, 44, audioData);
    return new Blob([buffer], { type: 'audio/wav' });
  };

  const writeString = (view, offset, string) => {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  };
  
  const splitTextIntoChunks = (text, maxChunkLength) => {
    const chunks = [];
    if (!text || text.length === 0) return [];
    if (text.length <= maxChunkLength) return [text];
    const sentences = text.split(/(?<=[.!?])\s+/);
    let currentChunk = "";
    for (const sentence of sentences) {
      if (currentChunk.length + sentence.length > maxChunkLength && currentChunk.length > 0) {
        chunks.push(currentChunk);
        currentChunk = sentence;
      } else {
        currentChunk += (currentChunk ? " " : "") + sentence;
      }
    }
    if (currentChunk) chunks.push(currentChunk);
    return chunks.length > 0 ? chunks : [text]; // Ensure at least one chunk
  };

  // --- Modified and New Core Logic Functions ---

  const stopSpeaking = useCallback(() => {
    if (synth.speaking) {
      synth.cancel(); // Stop current and clear queue
    }
    setIsSpeaking(false);
    setCanInteract(true);
    if (utteranceRef.current) {
        utteranceRef.current.onend = null;
        utteranceRef.current.onerror = null;
        utteranceRef.current = null;
    }
  }, [synth]);

  const speakText = useCallback((text) => {
    if (!text) return;
    stopSpeaking(); // Stop any previous speech

    const textChunks = splitTextIntoChunks(text, 180); // Slightly smaller chunks
    if (textChunks.length === 0) {
        setCanInteract(true);
        return;
    }
    let currentChunkIndex = 0;

    const speakChunk = () => {
      if (currentChunkIndex >= textChunks.length) {
        setIsSpeaking(false);
        setCanInteract(true);
        if (utteranceRef.current) {
            utteranceRef.current.onend = null;
            utteranceRef.current.onerror = null;
        }
        utteranceRef.current = null;
        return;
      }

      const chunk = textChunks[currentChunkIndex];
      const utterance = new SpeechSynthesisUtterance(chunk);
      utteranceRef.current = utterance; // Store current utterance

      utterance.onstart = () => {
        setIsSpeaking(true);
        setCanInteract(false);
      };

      utterance.onend = () => {
        currentChunkIndex++;
        speakChunk(); // Speak next chunk
      };

      utterance.onerror = (event) => {
        console.error("Speech synthesis error:", event);
        setError("Voice playback error. Please try refreshing.");
        setIsSpeaking(false);
        setCanInteract(true);
        utteranceRef.current = null;
      };
      
      // Workaround for potential issues on some browsers
      setTimeout(() => {
        if (synth && utteranceRef.current === utterance) { // Check if utterance is still the current one
            synth.speak(utterance);
        }
      }, 50);
    };

    speakChunk();
  }, [synth, stopSpeaking]); // Added splitTextIntoChunks implicitly, it's stable

  const fetchInterviewFeedback = useCallback(async (convHistory) => {
    setIsEvaluating(true);
    setError(null);
    setCanInteract(false);

    const cleanConvHistory = convHistory.filter(msg => msg.text !== 'Processing your response...');
    const formattedConversation = cleanConvHistory.map(msg => `${msg.role}: ${msg.text}`).join('\n');
    const prompt = `
      You are an expert interview evaluator. Based on the following conversation history, please evaluate the user's responses.
      The interview may have included an initial greeting/introduction from the interviewer which should not be rated as a question for the user.
      Identify the main questions asked by the interviewer and the corresponding user's answers.
      For each of these identified question-answer pairs (aim for up to 3-4 key questions if more were asked):
      1. The exact question text as asked by the interviewer.
      2. The user's full answer text.
      3. A rating for the user's answer on a scale of 1 to 10 (integer).
      4. Brief, constructive feedback for the user's answer (2-3 sentences).

      Format your response as a JSON array of objects. Each object should have the following keys: "question" (string), "userAnswer" (string), "rating" (number), "feedbackText" (string).
      Provide ONLY the JSON array in your response. Do not include any other text before or after the JSON array.

      Conversation History:
      ${formattedConversation}
    `;

    try {
      // IMPORTANT: Storing API keys in client-side code is insecure for production applications.
      // This key is used as per your backend example. Consider a backend proxy for API calls.
      const GEMINI_API_KEY = "AIzaSyBzPqWDaPNx0khUTwwxpXcmGQOmdaLUhmA"; // Replace with your actual key
      const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${GEMINI_API_KEY}`;


      const payload = {
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: "application/json",
           // The schema helps ensure the output is in the correct format.
           // For gemini-1.5-flash, the API directly uses responseMimeType: "application/json".
           // The more complex `responseSchema` is for older or specific model configurations.
        }
      };

      const response = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: { message: "Unknown API error" } }));
        console.error("Feedback API Error Response:", errorData);
        throw new Error(errorData.error?.message || `API request failed with status ${response.status}`);
      }

      const result = await response.json();
      
      // With responseMimeType: "application/json", the output should be directly usable JSON.
      if (result.candidates && result.candidates[0].content && result.candidates[0].content.parts && result.candidates[0].content.parts[0].text) {
        let parsedFeedback = result.candidates[0].content.parts[0].text;
        // The API is configured to return JSON directly, but if it's a string, try parsing.
        if (typeof parsedFeedback === 'string') {
           try {
              parsedFeedback = JSON.parse(parsedFeedback);
           } catch (e) {
              console.error("Failed to parse JSON feedback string:", e, "Raw text:", parsedFeedback);
              // Attempt to extract JSON from a potentially markdown-formatted response
              const jsonMatch = parsedFeedback.match(/```json\n([\s\S]*?)\n```/);
              if (jsonMatch && jsonMatch[1]) {
                try {
                    parsedFeedback = JSON.parse(jsonMatch[1]);
                } catch (e2) {
                    console.error("Failed to parse extracted JSON feedback:", e2);
                    throw new Error("Received malformed feedback data (could not parse extracted JSON).");
                }
              } else {
                throw new Error("Received malformed feedback data (not valid JSON and no markdown JSON block found).");
              }
           }
        }
        
        // Gemini with application/json often wraps the response in the schema, so we might need to access it directly
        if (result.candidates[0].content.parts[0].json) {
             parsedFeedback = result.candidates[0].content.parts[0].json;
        }


        if (!Array.isArray(parsedFeedback)) {
            // If the API directly returns the array without the "text" wrapper
            if (result.candidates && result.candidates[0].content && result.candidates[0].content.parts && Array.isArray(result.candidates[0].content.parts[0])) {
                parsedFeedback = result.candidates[0].content.parts[0];
            } else if (result.candidates && result.candidates[0].content && Array.isArray(result.candidates[0].content.parts)) {
                // Sometimes 'parts' itself is the array of objects
                parsedFeedback = result.candidates[0].content.parts;
            }
            // Check again if it's an array now
            if (!Array.isArray(parsedFeedback)) {
                console.error("Feedback data is not an array:", parsedFeedback, "Full result:", result);
                throw new Error("Feedback data is not in the expected array format.");
            }
        }
        setFeedbackData(parsedFeedback); // Cast as FeedbackItem[] if you have specific typing
      } else {
        console.error("Unexpected response structure from feedback API:", result);
        throw new Error("Unexpected response structure from feedback API.");
      }

    } catch (err) {
      console.error("Error fetching interview feedback:", err);
      setError(`Failed to get interview feedback: ${err.message}`);
      setFeedbackData([]); 
    } finally {
      setIsEvaluating(false);
      setCanInteract(true);
    }
  }, []); // Removed speakText, stopSpeaking from deps as they are stable useCallback

  const processBackendResponse = useCallback((data, currentConv) => {
    if (data.error) {
      setError(data.error);
      if (currentConv.length > 0 && currentConv[currentConv.length -1].role === 'user' && currentConv[currentConv.length -1].text.includes("Processing")) {
        setConversation(prev => {
            const updated = [...prev];
            if (updated.length > 0 && updated[updated.length - 1].text.includes("Processing your response...")) {
                 updated[updated.length - 1] = { role: 'user', text: 'Error: Could not process your response.' };
            }
            return updated;
        });
      }
    } else {
      const interviewerResponse = data.Response?.trim();
      if (interviewerResponse && interviewerResponse.toLowerCase() === "2118785") {
        setCurrentPage('results');
        // Pass the conversation *before* adding the "end" message or any final user transcription.
        // The snapshot `currentConv` might include "Processing...", filter it out in fetchInterviewFeedback.
        const historyForFeedback = data.transcribed_text 
            ? [...currentConv.slice(0, -1), { role: 'user', text: data.transcribed_text }]
            : [...currentConv];

        fetchInterviewFeedback(historyForFeedback.filter(msg => msg.text !== 'Processing your response...'));
        stopSpeaking();
      } else {
        if (data.transcribed_text) { // Response to user's audio
             setConversation(prev => {
                const updated = [...prev];
                if (updated.length > 0 && updated[updated.length -1].text.includes("Processing your response...")) {
                    updated[updated.length - 1] = { role: 'user', text: data.transcribed_text };
                } else {
                    updated.push({ role: 'user', text: data.transcribed_text });
                }
                if(interviewerResponse) updated.push({ role: 'interviewer', text: interviewerResponse });
                return updated;
            });
        } else { // Initial response after resume upload
            setConversation([{ role: 'interviewer', text: interviewerResponse }]);
        }
        if (interviewerResponse) speakText(interviewerResponse);
      }
    }
  }, [speakText, stopSpeaking, fetchInterviewFeedback]);


  const handleFileChange = (e) => {
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
      setIsInterviewStarted(true); 
      processBackendResponse(data, []); 

    } catch (err) {
      setError("Failed to upload resume. Please try again.");
      console.error(err);
      setIsInterviewStarted(false);
    } finally {
      setIsUploading(false);
      setCanInteract(true);
    }
  };

  const startRecording = async () => {
    try {
      setError(null);
      setCanInteract(false);
      audioChunksRef.current = [];
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true,
        }
      });
      streamRef.current = stream;
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm', 
      });
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };
      mediaRecorder.onstop = async () => {
        await sendAudioToBackend();
      };
      mediaRecorder.start(10); 
      mediaRecorderRef.current = mediaRecorder;
      setIsRecording(true);
      setCanInteract(true);
    } catch (err) {
      console.error("Microphone access error:", err);
      setError("Failed to access microphone. Please check permissions.");
      setCanInteract(true);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      setCanInteract(false); 
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    }
  };

  const sendAudioToBackend = async () => {
    if (audioChunksRef.current.length === 0) {
        setError("No audio recorded.");
        setCanInteract(true);
        return;
    }
    try {
      const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
      audioChunksRef.current = [];

      const currentConversationSnapshot = [...conversation, { role: 'user', text: 'Processing your response...' }];
      setConversation(currentConversationSnapshot);

      // No need for AudioContext conversion here if backend handles webm directly
      // If backend expects WAV, the conversion code from App.tsx should be used.
      // Assuming backend /transcribe can handle webm or you'll adapt it.
      // For this integration, I'm keeping the simpler path if your backend /transcribe can handle 'audio/webm'.
      // If not, re-insert the AudioContext and createWavBlobFromAudioBuffer logic here.

      // The original App.jsx sendAudioToBackend had WAV conversion. Let's re-add it for consistency with App.tsx.
      const audioContext = new AudioContext({ sampleRate: 16000 });
      const fileReader = new FileReader();
      
      fileReader.onload = async (e) => {
        if (!e.target?.result) return;
        
        try {
          const audioData = await audioContext.decodeAudioData(e.target.result);
          
          const offlineContext = new OfflineAudioContext(
            1, 
            audioData.length, 
            16000 
          );
          
          const source = offlineContext.createBufferSource();
          source.buffer = audioData;
          source.connect(offlineContext.destination);
          source.start(0);
          
          const renderedBuffer = await offlineContext.startRendering();
          const wavBlob = createWavBlobFromAudioBuffer(renderedBuffer);
          
          const formData = new FormData();
          formData.append('file', wavBlob, 'recording.wav');
          
          const response = await fetch('http://127.0.0.1:8000/transcribe', {
            method: 'POST',
            body: formData
          });
          
          const data = await response.json();
          processBackendResponse(data, currentConversationSnapshot);

        } catch (err) {
          console.error("Error processing audio:", err);
          setError("Failed to process audio. Please try again.");
          setConversation(prev => prev.filter(msg => msg.text !== 'Processing your response...'));
        } finally {
          setCanInteract(true);
        }
      };
      fileReader.readAsArrayBuffer(audioBlob);
      
    } catch (err) {
      setError("Failed to send audio to the server.");
      console.error(err);
      setCanInteract(true);
      setConversation(prev => prev.filter(msg => msg.text !== 'Processing your response...'));
    }
  };

  const resetInterview = () => {
    stopSpeaking();
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        mediaRecorderRef.current.stop();
    }
    mediaRecorderRef.current = null;
    audioChunksRef.current = [];

    setFile(null);
    setIsUploading(false);
    setIsInterviewStarted(false);
    setIsRecording(false);
    setConversation([]);
    setError(null);
    setIsSpeaking(false);
    setCanInteract(true);
    setCurrentPage('interview');
    setFeedbackData(null);
    setIsEvaluating(false);

    const fileInput = document.getElementById('file-upload');
    if (fileInput) {
        fileInput.value = "";
    }
  };

  useEffect(() => {
    return () => {
      stopSpeaking();
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, [stopSpeaking]);

  useEffect(() => {
    const container = document.querySelector('.conversation-container, .results-conversation-container');
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  }, [conversation, feedbackData, currentPage]); // Added feedbackData and currentPage

  // --- JSX Rendering ---

  if (currentPage === 'results') {
    return (
      <div className="app-container results-page">
        <header>
          <h1>Interview Results & Feedback</h1>
        </header>
        <main>
          {error && <div className="error-message">{error}</div>}
          
          {isEvaluating && <div className="loading-feedback">Evaluating interview, please wait... <div className="spinner"></div></div>}

          {feedbackData && feedbackData.length > 0 && (
            <div className="feedback-section">
              <h2>Evaluation:</h2>
              {feedbackData.map((item, index) => (
                <div key={index} className="feedback-item card">
                  <h3>Question {index + 1}:</h3>
                  <p><strong>Interviewer:</strong> {item.question}</p>
                  <p><strong>Your Answer:</strong> {item.userAnswer}</p>
                  <p><strong>Rating:</strong> <span className={`rating rating-${item.rating}`}>{item.rating}/10</span></p>
                  <p><strong>Feedback:</strong> {item.feedbackText}</p>
                </div>
              ))}
            </div>
          )}
          {feedbackData && feedbackData.length === 0 && !isEvaluating && !error && ( // Added !error here
            <p>No feedback could be generated for this interview, or the interview ended prematurely.</p>
          )}

          <div className="conversation-log-section">
            <h2>Full Conversation Log:</h2>
            <div className="results-conversation-container">
              {conversation.filter(msg => msg.text !== 'Processing your response...').map((message, index) => (
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
          </div>

          <button onClick={resetInterview} className="reset-btn control-btn">
            Start New Interview
          </button>
        </main>
        <footer>
          <p>Thank you for using the AI Interview Assistant!</p>
        </footer>
      </div>
    );
  }

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
            <p>Please upload your resume (PDF preferred) to begin.</p>
            
            <div className="file-input-container">
              <input 
                type="file" 
                accept=".pdf,.doc,.docx,.txt" 
                onChange={handleFileChange} 
                disabled={isUploading || !canInteract} 
                id="file-upload"
                className="file-upload-input"
              />
              <label htmlFor="file-upload" className={`file-upload-label ${!canInteract || isUploading ? 'disabled' : ''}`}>
                {file ? file.name : 'Choose Resume'}
              </label>
              
              <button 
                onClick={handleUpload} 
                disabled={!file || isUploading || !canInteract}
                className="upload-btn control-btn"
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
                  className="control-btn stop-speech-btn"
                  disabled={!canInteract && !isSpeaking} 
                >
                  Stop Playback
                </button>
              )}
              
              <button 
                onClick={isRecording ? stopRecording : startRecording}
                className={`control-btn record-btn ${isRecording ? 'recording' : ''}`}
                disabled={!canInteract || (isSpeaking && !isRecording) || isEvaluating}
              >
                {isRecording ? 'Stop Recording' : (conversation.length > 0 ? 'Record Answer' : 'Record Introduction')}
              </button>
              
              {isSpeaking && (
                <div className="speaking-indicator">
                  <span>Interviewer is speaking</span>
                  <div className="wave"></div><div className="wave"></div><div className="wave"></div>
                </div>
              )}
               {isRecording && (
                <div className="recording-indicator">
                  <span>Recording your answer...</span>
                   <div className="dot"></div><div className="dot"></div><div className="dot"></div>
                </div>
              )}
            </div>
          </div>
        )}
      </main>
      
      <footer>
        <p>Created by Mayank & Gaurav</p>
        {!isInterviewStarted && <p>Upload your resume to start the interview process.</p>}
      </footer>
    </div>
  );
}

export default App;