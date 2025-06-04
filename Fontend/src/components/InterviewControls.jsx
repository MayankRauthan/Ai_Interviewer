import React from 'react';

function InterviewControls({
  isRecording,
  isSpeaking,
  canInteract,
  startRecording,
  stopRecording,
  stopSpeaking,
}) {
  return (
    <div className="controls">
      {isSpeaking && (
        <button
          onClick={stopSpeaking}
          className="stop-speech-btn"
          disabled={!canInteract}
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
  );
}

export default InterviewControls;