import React from 'react';
import { Button } from './button/Button';

interface ErrorMessageProps {
  message: string;
  onRetry: () => void;
}

export const ErrorMessage: React.FC<ErrorMessageProps> = ({ message, onRetry }) => {
  return (
    <div className="error-message">
      <p>{message}</p>
      <Button
        label="Try Again"
        buttonStyle="primary"
        onClick={onRetry}
      />
    </div>
  );
};
