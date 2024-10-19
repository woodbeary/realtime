/**
 * Running a local relay server will allow you to hide your API key
 * and run custom logic on the server
 *
 * Set the local relay server address to:
 * REACT_APP_LOCAL_RELAY_SERVER_URL=http://localhost:8081
 *
 * This will also require you to set OPENAI_API_KEY= in a `.env` file
 * You can run it with `npm run relay`, in parallel with `npm start`
 */
const RELAY_SERVER_URL = process.env.NODE_ENV === 'production'
  ? 'wss://realtimeroasts.onrender.com'
  : (process.env.REACT_APP_LOCAL_RELAY_SERVER_URL || 'ws://localhost:10000');

console.log('Using relay server:', RELAY_SERVER_URL);

import React, { useState, FormEvent, useEffect, useRef, useCallback } from 'react';

import { RealtimeClient } from '@openai/realtime-api-beta';
import { ItemType } from '@openai/realtime-api-beta/dist/lib/client.js';
import { WavRecorder, WavStreamPlayer } from '../lib/wavtools/index.js';
import { instructions } from '../utils/conversation_config.js';
import { WavRenderer } from '../utils/wav_renderer';

import { X, Edit, Zap, ArrowUp, ArrowDown, Camera, Maximize2, Minimize2, Mic, Lock, RotateCw } from 'react-feather';
import { Button } from '../components/button/Button';
import { Toggle } from '../components/toggle/Toggle';
import { Map } from '../components/Map';

import './ConsolePage.scss';
import { isJsxOpeningLikeElement } from 'typescript';
import { Buffer } from 'buffer';
import axios from 'axios';
import { CameraFeed } from '../components/CameraFeed';
import debounce from 'lodash/debounce';
import { useMediaQuery } from 'react-responsive';

/**
 * Type for result from get_weather() function call
 */
interface Coordinates {
  lat: number;
  lng: number;
  location?: string;
  temperature?: {
    value: number;
    units: string;
  };
  wind_speed?: {
    value: number;
    units: string;
  };
}

/**
 * Type for all event logs
 */
interface RealtimeEvent {
  time: string;
  source: 'client' | 'server';
  count?: number;
  event: { [key: string]: any };
}

interface PasswordModalProps {
  onCorrectPassword: () => void;
}

const PasswordModal: React.FC<PasswordModalProps> = ({ onCorrectPassword }) => {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (password === process.env.REACT_APP_PAGE_PASSWORD) {
      onCorrectPassword();
    } else {
      setError('Incorrect password');
    }
  };

  return (
    <div className="password-modal">
      <div className="modal-content">
        <h2>Enter Password</h2>
        <form onSubmit={handleSubmit}>
          <input
            type="password"
            value={password}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)}
            placeholder="Password"
            autoFocus
          />
          <button type="submit">Submit</button>
        </form>
        {error && <p className="error">{error}</p>}
      </div>
    </div>
  );
};

export function ConsolePage() {
  /**
   * Ask user for API Key
   * If we're using the local relay server, we don't need this
   */
  const apiKey = ''; // We don't need the API key in the frontend anymore

  /**
   * Instantiate:
   * - WavRecorder (speech input)
   * - WavStreamPlayer (speech output)
   * - RealtimeClient (API client)
   */
  const wavRecorderRef = useRef<WavRecorder>(
    new WavRecorder({ sampleRate: 24000 })
  );
  const wavStreamPlayerRef = useRef<WavStreamPlayer>(
    new WavStreamPlayer({ sampleRate: 24000 })
  );
  const clientRef = useRef<RealtimeClient>(
    new RealtimeClient({
      url: RELAY_SERVER_URL,
    })
  );

  /**
   * References for
   * - Rendering audio visualization (canvas)
   * - Autoscrolling event logs
   * - Timing delta for event log displays
   */
  const clientCanvasRef = useRef<HTMLCanvasElement>(null);
  const serverCanvasRef = useRef<HTMLCanvasElement>(null);
  const eventsScrollHeightRef = useRef(0);
  const eventsScrollRef = useRef<HTMLDivElement>(null);
  const startTimeRef = useRef<string>(new Date().toISOString());
  const videoRef = useRef<HTMLVideoElement>(null);

  /**
   * All of our variables for displaying application state
   * - items are all conversation items (dialog)
   * - realtimeEvents are event logs, which can be expanded
   * - memoryKv is for set_memory() function
   * - coords, marker are for get_weather() function
   */
  const [items, setItems] = useState<ItemType[]>([]);
  const [realtimeEvents, setRealtimeEvents] = useState<RealtimeEvent[]>([]);
  const [expandedEvents, setExpandedEvents] = useState<{
    [key: string]: boolean;
  }>({});
  const [isConnected, setIsConnected] = useState(false);
  const [canPushToTalk, setCanPushToTalk] = useState(true);
  const [isRecording, setIsRecording] = useState(false);
  const [memoryKv, setMemoryKv] = useState<{ [key: string]: any }>({});
  const [coords, setCoords] = useState<Coordinates | null>({
    lat: 37.775593,
    lng: -122.418137,
  });
  const [marker, setMarker] = useState<Coordinates | null>(null);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [isCapturingImage, setIsCapturingImage] = useState(false);
  const imageAnalysisResultRef = useRef<string | null>(null);

  const [isStarted, setIsStarted] = useState(false);
  const [isFullScreen, setIsFullScreen] = useState(false);

  const isMobile = useMediaQuery({ maxWidth: 767 });

  const [isFrontCamera, setIsFrontCamera] = useState(true);

  const [volume, setVolume] = useState(2);

  /**
   * Utility for formatting the timing of logs
   */
  const formatTime = useCallback((timestamp: string) => {
    const startTime = startTimeRef.current;
    const t0 = new Date(startTime).valueOf();
    const t1 = new Date(timestamp).valueOf();
    const delta = t1 - t0;
    const hs = Math.floor(delta / 10) % 100;
    const s = Math.floor(delta / 1000) % 60;
    const m = Math.floor(delta / 60_000) % 60;
    const pad = (n: number) => {
      let s = n + '';
      while (s.length < 2) {
        s = '0' + s;
      }
      return s;
    };
    return `${pad(m)}:${pad(s)}.${pad(hs)}`;
  }, []);

  /**
   * When you click the API key
   */
  const resetAPIKey = useCallback(() => {
    const apiKey = prompt('OpenAI API Key');
    if (apiKey !== null) {
      localStorage.clear();
      localStorage.setItem('tmp::voice_api_key', apiKey);
      window.location.reload();
    }
  }, []);

  /**
   * Connect to conversation:
   * WavRecorder taks speech input, WavStreamPlayer output, client is API client
   */
  const connectConversation = useCallback(async () => {
    console.log("Starting connection process...");
    const client = clientRef.current;
    const wavRecorder = wavRecorderRef.current;
    const wavStreamPlayer = wavStreamPlayerRef.current;

    // Set state variables
    startTimeRef.current = new Date().toISOString();
    setIsConnected(true);
    setRealtimeEvents([]);
    setItems(client.conversation.getItems());

    console.log("Connecting to microphone...");
    // Connect to microphone
    await wavRecorder.begin();
    console.log("Microphone connected successfully.");

    console.log("Connecting to audio output...");
    // Connect to audio output
    await wavStreamPlayer.connect();
    console.log("Audio output connected successfully.");

    console.log("Connecting to realtime API...");
    // Connect to realtime API
    await client.connect();
    console.log("Realtime API connected successfully.");

    // Set up push-to-talk mode by default
    console.log("Setting up push-to-talk mode...");
    await client.updateSession({ turn_detection: null });

    client.sendUserMessageContent([
      {
        type: `input_text`,
        text: `Hello!`,
      },
    ]);

    console.log("Push-to-talk mode set up successfully.");
  }, []);

  /**
   * Disconnect and reset conversation state
   */
  const disconnectConversation = useCallback(async () => {
    setIsConnected(false);
    setRealtimeEvents([]);
    setItems([]);
    setMemoryKv({});
    setCoords({
      lat: 37.775593,
      lng: -122.418137,
    });
    setMarker(null);

    const client = clientRef.current;
    client.disconnect();

    const wavRecorder = wavRecorderRef.current;
    await wavRecorder.end();

    const wavStreamPlayer = wavStreamPlayerRef.current;
    await wavStreamPlayer.interrupt();
  }, []);

  const deleteConversationItem = useCallback(async (id: string) => {
    const client = clientRef.current;
    client.deleteItem(id);
  }, []);

  /**
   * In push-to-talk mode, start recording
   * .appendInputAudio() for each sample
   */
  const startRecording = async () => {
    if (isRecording) return; // Don't start if already recording
    setIsRecording(true);
    const client = clientRef.current;
    const wavRecorder = wavRecorderRef.current;
    const wavStreamPlayer = wavStreamPlayerRef.current;
    const trackSampleOffset = await wavStreamPlayer.interrupt();
    if (trackSampleOffset?.trackId) {
      const { trackId, offset } = trackSampleOffset;
      await client.cancelResponse(trackId, offset);
    }
    await wavRecorder.record((data) => client.appendInputAudio(data.mono));
  };

  /**
   * In push-to-talk mode, stop recording
   */
  const stopRecording = async () => {
    if (!isRecording) return; // Don't stop if not recording
    setIsRecording(false);
    const client = clientRef.current;
    const wavRecorder = wavRecorderRef.current;
    await wavRecorder.pause();
    client.createResponse();
  };

  /**
   * Switch between Manual <> VAD mode for communication
   */
  const changeTurnEndType = async (value: string) => {
    const client = clientRef.current;
    const wavRecorder = wavRecorderRef.current;
    if (value === 'none' && wavRecorder.getStatus() === 'recording') {
      await wavRecorder.pause();
    }
    client.updateSession({
      turn_detection: value === 'none' ? null : { type: 'server_vad' },
    });
    if (value === 'server_vad' && client.isConnected()) {
      await wavRecorder.record((data) => client.appendInputAudio(data.mono));
    }
    setCanPushToTalk(value === 'none');
  };

  /**
   * Auto-scroll the event logs
   */
  useEffect(() => {
    if (eventsScrollRef.current) {
      const eventsEl = eventsScrollRef.current;
      const scrollHeight = eventsEl.scrollHeight;
      // Only scroll if height has just changed
      if (scrollHeight !== eventsScrollHeightRef.current) {
        eventsEl.scrollTop = scrollHeight;
        eventsScrollHeightRef.current = scrollHeight;
      }
    }
  }, [realtimeEvents]);

  /**
   * Auto-scroll the conversation logs
   */
  useEffect(() => {
    const conversationEls = [].slice.call(
      document.body.querySelectorAll('[data-conversation-content]')
    );
    for (const el of conversationEls) {
      const conversationEl = el as HTMLDivElement;
      conversationEl.scrollTop = conversationEl.scrollHeight;
    }
  }, [items]);

  /**
   * Set up render loops for the visualization canvas
   */
  useEffect(() => {
    let isLoaded = true;

    const wavRecorder = wavRecorderRef.current;
    const clientCanvas = clientCanvasRef.current;
    let clientCtx: CanvasRenderingContext2D | null = null;

    const wavStreamPlayer = wavStreamPlayerRef.current;
    const serverCanvas = serverCanvasRef.current;
    let serverCtx: CanvasRenderingContext2D | null = null;

    const render = () => {
      if (isLoaded) {
        if (clientCanvas) {
          if (!clientCanvas.width || !clientCanvas.height) {
            clientCanvas.width = clientCanvas.offsetWidth;
            clientCanvas.height = clientCanvas.offsetHeight;
          }
          clientCtx = clientCtx || clientCanvas.getContext('2d');
          if (clientCtx) {
            clientCtx.clearRect(0, 0, clientCanvas.width, clientCanvas.height);
            const result = wavRecorder.recording
              ? wavRecorder.getFrequencies('voice')
              : { values: new Float32Array([0]) };
            WavRenderer.drawBars(
              clientCanvas,
              clientCtx,
              result.values,
              '#0099ff',
              10,
              0,
              8
            );
          }
        }
        if (serverCanvas) {
          if (!serverCanvas.width || !serverCanvas.height) {
            serverCanvas.width = serverCanvas.offsetWidth;
            serverCanvas.height = serverCanvas.offsetHeight;
          }
          serverCtx = serverCtx || serverCanvas.getContext('2d');
          if (serverCtx) {
            serverCtx.clearRect(0, 0, serverCanvas.width, serverCanvas.height);
            const result = wavStreamPlayer.analyser
              ? wavStreamPlayer.getFrequencies('voice')
              : { values: new Float32Array([0]) };
            WavRenderer.drawBars(
              serverCanvas,
              serverCtx,
              result.values,
              '#009900',
              10,
              0,
              8
            );
          }
        }
        window.requestAnimationFrame(render);
      }
    };
    render();

    return () => {
      isLoaded = false;
    };
  }, []);

  /**
   * Core RealtimeClient and audio capture setup
   * Set all of our instructions, tools, events and more
   */
  useEffect(() => {
    // Get refs
    const wavStreamPlayer = wavStreamPlayerRef.current;
    const client = clientRef.current;

    // Set instructions
    client.updateSession({ instructions: instructions });
    // Set transcription, otherwise we don't get user transcriptions back
    client.updateSession({ input_audio_transcription: { model: 'whisper-1' } });

    // Add tools
    client.addTool(
      {
        name: 'set_memory',
        description: 'Saves important data about the user into memory.',
        parameters: {
          type: 'object',
          properties: {
            key: {
              type: 'string',
              description:
                'The key of the memory value. Always use lowercase and underscores, no other characters.',
            },
            value: {
              type: 'string',
              description: 'Value can be anything represented as a string',
            },
          },
          required: ['key', 'value'],
        },
      },
      async ({ key, value }: { [key: string]: any }) => {
        setMemoryKv((memoryKv) => {
          const newKv = { ...memoryKv };
          newKv[key] = value;
          return newKv;
        });
        return { ok: true };
      }
    );
    client.addTool(
      {
        name: 'get_weather',
        description:
          'Retrieves the weather for a given lat, lng coordinate pair. Specify a label for the location.',
        parameters: {
          type: 'object',
          properties: {
            lat: {
              type: 'number',
              description: 'Latitude',
            },
            lng: {
              type: 'number',
              description: 'Longitude',
            },
            location: {
              type: 'string',
              description: 'Name of the location',
            },
          },
          required: ['lat', 'lng', 'location'],
        },
      },
      async ({ lat, lng, location }: { [key: string]: any }) => {
        setMarker({ lat, lng, location });
        setCoords({ lat, lng, location });
        const result = await fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,wind_speed_10m`
        );
        const json = await result.json();
        const temperature = {
          value: json.current.temperature_2m as number,
          units: json.current_units.temperature_2m as string,
        };
        const wind_speed = {
          value: json.current.wind_speed_10m as number,
          units: json.current_units.wind_speed_10m as string,
        };
        setMarker({ lat, lng, location, temperature, wind_speed });
        return json;
      }
    );

    // Add this new tool
    client.addTool(
      {
        name: 'capture_image',
        description: 'Captures an image from the camera and analyzes it.',
        parameters: {
          type: 'object',
          properties: {},
          required: [],
        },
      },
      async () => {
        await captureAndSendImage();
        // Wait for the image analysis to complete
        while (isCapturingImage) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
        const result = imageAnalysisResultRef.current || "No image analysis result available.";
        imageAnalysisResultRef.current = null;
        return { 
          success: true, 
          message: 'Image captured and analyzed.',
          result: result
        };
      }
    );

    // handle realtime events from client + server for event logging
    client.on('realtime.event', (realtimeEvent: RealtimeEvent) => {
      setRealtimeEvents((realtimeEvents) => {
        const lastEvent = realtimeEvents[realtimeEvents.length - 1];
        if (lastEvent?.event.type === realtimeEvent.event.type) {
          // if we receive multiple events in a row, aggregate them for display purposes
          lastEvent.count = (lastEvent.count || 0) + 1;
          return realtimeEvents.slice(0, -1).concat(lastEvent);
        } else {
          return realtimeEvents.concat(realtimeEvent);
        }
      });
    });
    client.on('error', (event: any) => console.error(event));
    client.on('conversation.interrupted', async () => {
      const trackSampleOffset = await wavStreamPlayer.interrupt();
      if (trackSampleOffset?.trackId) {
        const { trackId, offset } = trackSampleOffset;
        await client.cancelResponse(trackId, offset);
      }
    });
    client.on('conversation.updated', async ({ item, delta }: any) => {
      const items = client.conversation.getItems();
      if (delta?.audio) {
        wavStreamPlayer.add16BitPCM(delta.audio, item.id);
      }
      if (item.status === 'completed' && item.formatted.audio?.length) {
        const wavFile = await WavRecorder.decode(
          item.formatted.audio,
          24000,
          24000
        );
        item.formatted.file = wavFile;
      }
      
      setItems(items);
    });

    setItems(client.conversation.getItems());

    return () => {
      // cleanup; resets to defaults
      client.reset();
    };
  }, []);

  const startCamera = useCallback(async () => {
    console.log("Starting camera...");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: isFrontCamera ? "user" : "environment" } 
      });
      setCameraStream(stream);
      console.log("Camera started successfully.");
      return true;
    } catch (error) {
      console.error('Error accessing camera:', error);
      return false;
    }
  }, [isFrontCamera]);

  const stopCamera = () => {
    if (cameraStream) {
      cameraStream.getTracks().forEach(track => track.stop());
      setCameraStream(null);
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
    }
  };

  const analyzeImage = async (base64Image: string): Promise<string> => {
    const apiKey = process.env.REACT_APP_OPENAI_API_KEY || '';
    
    if (!apiKey) {
      console.error('OpenAI API key is not set');
      return 'Error: API key not set';
    }

    try {
      console.log('Sending request to OpenAI Vision API...');
      const response = await axios.post(
        'https://api.openai.com/v1/chat/completions',
        {
          model: "gpt-4o",
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: "Describe this image in detail, focusing on the person's appearance, outfit, hairstyle, and any notable features or background elements. Be specific about colors, styles, and overall impression, but don't make any judgments or suggestions." },
                {
                  type: "image_url",
                  image_url: {
                    url: `data:image/jpeg;base64,${base64Image}`
                  }
                }
              ]
            }
          ],
          max_tokens: 300
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          }
        }
      );

      console.log('Received response from OpenAI Vision API:', response.data);
      return response.data.choices[0].message.content;
    } catch (error: any) {
      console.error('Error calling OpenAI Vision API:', error);
      if (error.response) {
        console.error('Response data:', error.response.data);
        console.error('Response status:', error.response.status);
        console.error('Response headers:', error.response.headers);
        return `Error analyzing image: ${error.response.status} - ${JSON.stringify(error.response.data)}`;
      } else if (error.request) {
        console.error('No response received:', error.request);
        return `Error analyzing image: No response received from the server`;
      } else {
        console.error('Error setting up request:', error.message);
        return `Error analyzing image: ${error.message}`;
      }
    }
  };

  const captureAndSendImage = useCallback(async () => {
    if (videoRef.current) {
      setIsCapturingImage(true);
      imageAnalysisResultRef.current = null;
      const video = videoRef.current;
      const canvas = document.createElement('canvas');
      
      // Resize the image to 512x512
      const size = 512;
      canvas.width = size;
      canvas.height = size;
      
      const ctx = canvas.getContext('2d');
      if (ctx) {
        // Draw the video frame onto the canvas, resizing it
        ctx.drawImage(video, 0, 0, video.videoWidth, video.videoHeight, 0, 0, size, size);
        
        // Convert to JPEG with 80% quality
        const imageDataUrl = canvas.toDataURL('image/jpeg', 0.8);
        const base64Image = imageDataUrl.split(',')[1];

        try {
          const visionResponse = await analyzeImage(base64Image);
          imageAnalysisResultRef.current = visionResponse;
        } catch (error) {
          console.error('Error in captureAndSendImage:', error);
          imageAnalysisResultRef.current = "Error: Unable to analyze the image.";
        } finally {
          setIsCapturingImage(false);
        }
      }
    }
  }, [videoRef, analyzeImage]);

  const enableAudio = () => {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const buffer = audioContext.createBuffer(1, 1, 22050);
    const source = audioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(audioContext.destination);
    source.start(0);
    audioContext.resume();
  };

  const toggleAll = useCallback(async () => {
    if (!isStarted) {
      enableAudio();
    }
    if (isStarted) {
      console.log("Stopping all systems...");
      await disconnectConversation();
      stopCamera();
      setIsStarted(false);
      console.log("All systems stopped.");
    } else {
      console.log("Starting all systems...");
      const cameraStarted = await startCamera();
      if (cameraStarted) {
        try {
          await connectConversation();
          setIsStarted(true);
          console.log("All systems started successfully.");
        } catch (error) {
          console.error("Error starting conversation:", error);
          stopCamera();
          setIsStarted(false);
        }
      } else {
        console.log("Failed to start all systems due to camera error.");
      }
    }
  }, [isStarted, connectConversation, disconnectConversation, startCamera, stopCamera]);

  const toggleFullScreen = useCallback(() => {
    const videoElement = videoRef.current;
    if (!videoElement) return;

    if (!document.fullscreenElement) {
      videoElement.requestFullscreen().then(() => {
        setIsFullScreen(true);
      }).catch(err => {
        console.error(`Error attempting to enable full-screen mode: ${err.message}`);
      });
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().then(() => {
          setIsFullScreen(false);
        }).catch(err => {
          console.error(`Error attempting to exit full-screen mode: ${err.message}`);
        });
      }
    }
  }, []);

  const handleCameraFlip = useCallback(async () => {
    setIsFrontCamera(!isFrontCamera);
    if (isStarted) {
      stopCamera();
      await startCamera();
    }
  }, [isFrontCamera, isStarted, stopCamera, startCamera]);

  // Add this function to handle volume changes
  const handleVolumeChange = useCallback((newVolume: number) => {
    setVolume(newVolume);
    wavStreamPlayerRef.current.setVolume(newVolume);
  }, []);

  /**
   * Render the application
   */
  return (
    <div data-component="ConsolePage">
      <div className="content-top">
        <div className="content-title">
          <img src="/logo.png" alt="Roasted.lol logo" />
          <span className="web-name">roasted.lol</span>
        </div>
      </div>
      <div className={`content-main centered`}>
        <div className="camera-container">
          <CameraFeed stream={cameraStream} ref={videoRef} isFullScreen={isFullScreen} />
          <div className="button-container">
            <Button
              label={isStarted ? "Stop" : "Start"}
              buttonStyle={isStarted ? "alert" : "action"}
              onClick={toggleAll}
              className={isStarted ? "small-button" : "large-button"}
            />
            {isStarted && (
              <>
                {!isMobile && (
                  <Button
                    icon={isFullScreen ? Minimize2 : Maximize2}
                    buttonStyle="icon"
                    onClick={toggleFullScreen}
                    className="small-button button-style-icon"
                  />
                )}
                <Button
                  icon={Mic}
                  label="Push to Talk"
                  buttonStyle={isRecording ? "alert" : "action"}
                  onMouseDown={startRecording}
                  onMouseUp={stopRecording}
                  onMouseLeave={stopRecording}
                  onTouchStart={startRecording}
                  onTouchEnd={stopRecording}
                  className="large-button"
                />
                {isMobile && (
                  <Button
                    icon={RotateCw}
                    buttonStyle="icon"
                    onClick={handleCameraFlip}
                    className="small-button button-style-icon"
                  />
                )}
                <input
                  type="range"
                  min="0"
                  max="4"
                  step="0.1"
                  value={volume}
                  onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
                />
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
