import React from 'react';

function UploadSection({ file, isUploading, canInteract, handleFileChange, handleUpload }) {
  return (
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
  );
}

export default UploadSection;