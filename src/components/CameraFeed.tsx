import React, { useRef, useEffect, forwardRef, ForwardedRef } from 'react';
import './CameraFeed.scss';

interface CameraFeedProps {
  stream: MediaStream | null;
}

export const CameraFeed = forwardRef(({ stream }: CameraFeedProps, ref: ForwardedRef<HTMLVideoElement>) => {
  const localVideoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const videoElement = ref ? (ref as React.RefObject<HTMLVideoElement>).current : localVideoRef.current;
    if (videoElement && stream) {
      videoElement.srcObject = stream;
    }
  }, [stream, ref]);

  return (
    <div className="camera-feed">
      {stream ? (
        <video ref={ref || localVideoRef} autoPlay playsInline />
      ) : (
        <div className="no-stream">Camera not started</div>
      )}
    </div>
  );
});