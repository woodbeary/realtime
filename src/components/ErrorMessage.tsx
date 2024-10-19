import React from 'react';
import { Button } from './button/Button';

interface ErrorMessageProps {
  message: string;
}

export const ErrorMessage: React.FC<ErrorMessageProps> = ({ message }) => {
  const handleRetry = () => {
    window.location.reload();
  };

  return (
    <div className="error-container">
      <h2>Oops! Our servers are a bit busy</h2>
      <p>
        We're experiencing high demand right now (max 100 users for this alpha version).
        Please try again in a few minutes.
      </p>
      <Button
        label="Try Again"
        buttonStyle="primary"
        onClick={handleRetry}
      />
      <p>
        If the problem persists, please contact us for support:{' '}
        <a href="https://twitter.com/imjacoblopez" target="_blank" rel="noopener noreferrer">
          @imjacoblopez
        </a>
      </p>
    </div>
  );
};
