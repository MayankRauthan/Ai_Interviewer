// src/components/InterviewControls.jsx
import React from 'react';

function InterviewControls({
  isRecording,
  isSpeaking,
  canInteract,
  startRecording,
  stopRecording,
  stopSpeaking,
  onEndInterview // <--- ADD THIS PROP
}) {
  return (
    <div className="controls">
      {isRecording ? (
        <button
          className="record-btn recording"
          onClick={stopRecording}
          disabled={!canInteract} // Disable if overall interaction is blocked
        >
          Stop Recording
        </button>
      ) : (
        <button
          className="record-btn"
          onClick={startRecording}
          // Disable if not interactable, or if speaking (cannot record while speaking)
          disabled={!canInteract || isSpeaking}
        >
          Start Recording
        </button>
      )}

      {isSpeaking && ( // Show Stop Speaking button only when speaking
        <button
          className="stop-speech-btn"
          onClick={stopSpeaking}
          disabled={!canInteract} // Disable if overall interaction is blocked
        >
          Stop Speaking
        </button>
      )}

      {isSpeaking && ( // Show speaking indicator only when speaking
        <div className="speaking-indicator">
          <div className="wave"></div>
          <div className="wave"></div>
          <div className="wave"></div>
          <div className="wave"></div>
          <div className="wave"></div>
        </div>
      )}

      {/* NEW: End Interview Button */}
      <button
        className="upload-btn" // Reusing upload-btn class, style as needed in App.css
        onClick={onEndInterview} // Call the passed handler
        disabled={!canInteract || isRecording || isSpeaking} // Disable if any other action is ongoing
        style={{ backgroundColor: '#dc3545', color: 'white' }} // Example: Red color for "End"
      >
        End Interview
      </button>
    </div>
  );
}

export default InterviewControls;