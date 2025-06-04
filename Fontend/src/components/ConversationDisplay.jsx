import React, { useEffect } from 'react';

function ConversationDisplay({ conversation }) {
  useEffect(() => {
    const container = document.querySelector('.conversation-container');
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  }, [conversation]);

  return (
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
  );
}

export default ConversationDisplay;