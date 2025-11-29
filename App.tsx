import React, { useState, useEffect, useRef, useCallback } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality, Type, FunctionDeclaration } from '@google/genai';
import { createPcmBlob, decodeAudioData } from './utils/audioUtils';
import Visualizer from './components/Visualizer';
import { Message, InterviewType, Difficulty } from './types';

// --- Configuration & Constants ---

const SYSTEM_INSTRUCTION = `
You are an AI Interview Voice Coach and Group Discussion (GD) facilitator.

========================
1. ROLE & VOICE
========================
Your role:
- Conduct mock interviews and group discussions with candidates.
- Speak and respond in a consistent, professional, calm voice persona.
- You must NOT change tone/personality randomly between turns.
- Persona: Polite, structured, encouraging. Sounds like a real interviewer.

========================
2. INTERFACE CONTROL (CRITICAL)
========================
You are communicating via a real-time voice API. 
- **SPEAK NATURALLY** to the user. Do not speak JSON. The audio you generate will be played to the user.
- **USE THE "update_ui" TOOL** to update the visual interface. Call this tool whenever you change the question, round, or have feedback.

========================
3. MODES
========================
1) "hr_interview": Behavioral / HR style questions.
2) "technical_interview": Role-related technical questions.
3) "group_discussion": GD-style discussion; you act as moderator + participant.

========================
4. INTERVIEW FLOW
========================
Start Phase:
- Start with a professional greeting.
- Then call update_ui with phase="start" and the first question (e.g., "Tell me about yourself").

Evaluation Phase:
- After the user answers, evaluate content, structure (STAR), clarity, and confidence.
- Call update_ui with phase="feedback" containing score, strengths, and improvements.
- Speak a short summary (40-80 words).

GD Mode:
- Give a topic.
- Debate with the user (support/oppose) for 2-4 cycles.
- Provide feedback at the end.
`;

const updateUiFunctionDeclaration: FunctionDeclaration = {
  name: "update_ui",
  description: "Update the user interface with the current interview state, questions, and feedback.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      center_panel_question: { type: Type.STRING, description: "The current question or topic to display." },
      status_message: { type: Type.STRING, description: "Short status text like 'Listening...' or 'Evaluating...'." },
      feedback: {
        type: Type.OBJECT,
        properties: {
          overall_score: { type: Type.NUMBER },
          strengths: { type: Type.ARRAY, items: { type: Type.STRING } },
          improvements: { type: Type.ARRAY, items: { type: Type.STRING } },
          short_summary: { type: Type.STRING },
          suggested_outline: { type: Type.ARRAY, items: { type: Type.STRING } }
        }
      },
      mode: { type: Type.STRING, enum: ["hr_interview", "technical_interview", "group_discussion"] }
    }
  }
};

const App: React.FC = () => {
  // --- State ---
  const [active, setActive] = useState(false);
  const [config, setConfig] = useState({
    role: InterviewType.SOFTWARE_ENGINEER,
    difficulty: Difficulty.MEDIUM,
    mode: 'hr_interview'
  });
  
  // UI Panels State
  const [history, setHistory] = useState<Message[]>([]);
  const [centerPanel, setCenterPanel] = useState({
    question: "Ready to start?",
    status: "Click the mic to begin",
    transcript: ""
  });
  const [feedback, setFeedback] = useState<any>(null);
  
  // Audio Refs
  const [volume, setVolume] = useState(0);
  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const inputSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sessionRef = useRef<any>(null);
  const nextStartTimeRef = useRef<number>(0);
  const audioQueueRef = useRef<AudioBufferSourceNode[]>([]);
  
  // Scroll Ref
  const historyEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll history
  useEffect(() => {
    historyEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [history]);

  // --- Gemini Live API Connection ---
  
  const connectToGemini = async () => {
    if (!process.env.API_KEY) {
      alert("API_KEY is missing in environment variables.");
      return;
    }

    // Initialize Audio Contexts
    inputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
    outputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });

    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

    // Initial config message to send context
    const initialContext = `
      Context:
      - Candidate Role: ${config.role}
      - Difficulty: ${config.difficulty}
      - Mode: ${config.mode}
    `;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-09-2025',
        config: {
          responseModalities: [Modality.AUDIO],
          systemInstruction: SYSTEM_INSTRUCTION + initialContext,
          tools: [{ functionDeclarations: [updateUiFunctionDeclaration] }],
          inputAudioTranscription: {}, 
          outputAudioTranscription: {},
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } }
          },
        },
        callbacks: {
          onopen: async () => {
            console.log("Session connected");
            setActive(true);
            setCenterPanel(prev => ({ ...prev, status: "Connected. Listening..." }));
            
            // Setup Microphone Stream
            if (!inputAudioContextRef.current) return;
            
            inputSourceRef.current = inputAudioContextRef.current.createMediaStreamSource(stream);
            processorRef.current = inputAudioContextRef.current.createScriptProcessor(4096, 1, 1);
            
            processorRef.current.onaudioprocess = (e) => {
                const inputData = e.inputBuffer.getChannelData(0);
                
                // Simple volume meter
                let sum = 0;
                for(let i=0; i<inputData.length; i++) sum += inputData[i] * inputData[i];
                setVolume(Math.sqrt(sum / inputData.length));

                const pcmBlob = createPcmBlob(inputData);
                sessionPromise.then(session => session.sendRealtimeInput({ media: pcmBlob }));
            };

            inputSourceRef.current.connect(processorRef.current);
            processorRef.current.connect(inputAudioContextRef.current.destination);
          },
          onmessage: async (msg: LiveServerMessage) => {
            // 1. Handle Tool Calls (UI Updates)
            if (msg.toolCall) {
                console.log("Tool Call:", msg.toolCall);
                const calls = msg.toolCall.functionCalls;
                const responses = [];

                for (const call of calls) {
                    if (call.name === "update_ui") {
                        const args = call.args as any;
                        
                        // Update Center Panel Question
                        if (args.center_panel_question) {
                            setCenterPanel(prev => ({ ...prev, question: args.center_panel_question }));
                        }
                        
                        // Update Status
                        if (args.status_message) {
                            setCenterPanel(prev => ({ ...prev, status: args.status_message }));
                        }

                        // Update Feedback
                        if (args.feedback) {
                            setFeedback(args.feedback);
                        }

                        responses.push({
                            id: call.id,
                            name: call.name,
                            response: { result: "success" }
                        });
                    }
                }

                // Send response back to model
                sessionPromise.then(session => session.sendToolResponse({ functionResponses: responses }));
            }

            // 2. Handle Transcriptions (History)
            const serverContent = msg.serverContent;
            if (serverContent) {
                if (serverContent.modelTurn?.parts) {
                    // Check for audio first
                    const audioPart = serverContent.modelTurn.parts.find(p => p.inlineData);
                     if (audioPart && audioPart.inlineData && outputAudioContextRef.current) {
                        const ctx = outputAudioContextRef.current;
                        const buffer = await decodeAudioData(
                            new Uint8Array(atob(audioPart.inlineData.data).split('').map(c => c.charCodeAt(0))),
                            ctx
                        );

                        const source = ctx.createBufferSource();
                        source.buffer = buffer;
                        source.connect(ctx.destination);

                        const now = ctx.currentTime;
                        // Schedule next chunk
                        const startTime = Math.max(now, nextStartTimeRef.current);
                        source.start(startTime);
                        nextStartTimeRef.current = startTime + buffer.duration;
                        
                        audioQueueRef.current.push(source);
                        source.onended = () => {
                            const idx = audioQueueRef.current.indexOf(source);
                            if (idx > -1) audioQueueRef.current.splice(idx, 1);
                        };
                    }
                }
                
                // Handle Output Transcription (Model Speech)
                if (serverContent.outputTranscription?.text) {
                     setHistory(prev => [...prev, {
                        id: Date.now().toString(),
                        role: 'model',
                        text: serverContent.outputTranscription.text,
                        timestamp: new Date()
                     }]);
                }

                // Handle Input Transcription (User Speech)
                if (serverContent.inputTranscription?.text) {
                     // We might get partials, but let's just append for now or handle turnComplete
                     // A simple way is to append on turnComplete if available, or just append stream.
                     // The API sends chunks. For simplicity in this demo, we append chunks to a "current" buffer 
                     // or just treat every event as a message (might be chatty).
                     // Better UX: Debounce or wait for turnComplete.
                     // For this simple implementation, we will append non-empty strings.
                     // Note: Input transcription events are frequent.
                     setCenterPanel(prev => ({...prev, transcript: serverContent.inputTranscription.text }));
                }
                
                if (serverContent.turnComplete && centerPanel.transcript) {
                     // Commit user transcript to history on turn complete
                     setHistory(prev => [...prev, {
                        id: Date.now().toString(),
                        role: 'user',
                        text: centerPanel.transcript,
                        timestamp: new Date()
                     }]);
                     setCenterPanel(prev => ({...prev, transcript: "" }));
                }
            }
          },
          onclose: () => {
            console.log("Session closed");
            setActive(false);
            setCenterPanel(prev => ({ ...prev, status: "Session Ended" }));
            cleanup();
          },
          onerror: (err) => {
            console.error("Session error:", err);
            setActive(false);
            setCenterPanel(prev => ({ ...prev, status: "Error connecting" }));
            cleanup();
          }
        }
      });
      sessionRef.current = sessionPromise;

    } catch (error) {
      console.error("Connection failed", error);
      alert("Could not access microphone or connect.");
    }
  };

  const cleanup = () => {
    if (processorRef.current) {
        processorRef.current.disconnect();
        processorRef.current = null;
    }
    if (inputSourceRef.current) {
        inputSourceRef.current.disconnect();
        inputSourceRef.current = null;
    }
    if (inputAudioContextRef.current) {
        inputAudioContextRef.current.close();
        inputAudioContextRef.current = null;
    }
    if (outputAudioContextRef.current) {
        outputAudioContextRef.current.close();
        outputAudioContextRef.current = null;
    }
    audioQueueRef.current.forEach(s => s.stop());
    audioQueueRef.current = [];
  };

  const handleEndSession = () => {
    sessionRef.current?.then((s: any) => s.close());
    setActive(false);
  };

  // --- Handlers ---
  const handleConfigChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setConfig({ ...config, [e.target.name]: e.target.value });
  };

  return (
    <div className="app-container">
      {/* LEFT COLUMN: HISTORY */}
      <div className="col col-left">
        <div className="col-header">
          <h2>Conversation History</h2>
          <p>Real-time transcript</p>
        </div>
        <div className="col-content history-list">
          {history.length === 0 && <div style={{textAlign:'center', color:'#94a3b8', marginTop: 20}}>No messages yet</div>}
          {history.map((msg, i) => (
            <div key={i} className={`history-item ${msg.role === 'user' ? 'user' : 'model'}`}>
              {msg.text}
            </div>
          ))}
          <div ref={historyEndRef} />
        </div>
      </div>

      {/* CENTER COLUMN: INTERACTION */}
      <div className="col col-center">
        <div className="col-header">
            <h2>AI Interview Voice Coach</h2>
            <p>Speak naturally to practice</p>
        </div>
        <div className="col-content center-content">
            
            {!active ? (
                 <div className="setup-form" style={{width: '100%', maxWidth: '300px', marginBottom: 20}}>
                    <label style={{fontSize: 12, fontWeight: 'bold', display:'block', marginBottom: 4}}>Role</label>
                    <select name="role" value={config.role} onChange={handleConfigChange}>
                        {Object.values(InterviewType).map(v => <option key={v} value={v}>{v}</option>)}
                    </select>

                    <label style={{fontSize: 12, fontWeight: 'bold', display:'block', marginBottom: 4}}>Difficulty</label>
                    <select name="difficulty" value={config.difficulty} onChange={handleConfigChange}>
                        {Object.values(Difficulty).map(v => <option key={v} value={v}>{v}</option>)}
                    </select>
                    
                     <label style={{fontSize: 12, fontWeight: 'bold', display:'block', marginBottom: 4}}>Mode</label>
                    <select name="mode" value={config.mode} onChange={handleConfigChange}>
                        <option value="hr_interview">HR Interview</option>
                        <option value="technical_interview">Technical Interview</option>
                        <option value="group_discussion">Group Discussion</option>
                    </select>
                 </div>
            ) : null}

            <div className="question-card">
                <h3 style={{color: '#6366f1', marginBottom: 8, textTransform:'uppercase', fontSize: 12, letterSpacing: 1}}>Current Question</h3>
                <p style={{fontSize: 18, fontWeight: 500}}>{centerPanel.question}</p>
            </div>

            <div className="mic-btn-container">
                <div className={`visualizer-ring ${active ? 'active' : ''}`}></div>
                <button 
                    className={`mic-btn ${active ? 'active' : ''}`}
                    onClick={active ? handleEndSession : connectToGemini}
                >
                    {active ? (
                       <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>
                    ) : (
                       <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" y1="19" x2="12" y2="23"></line><line x1="8" y1="23" x2="16" y2="23"></line></svg>
                    )}
                </button>
            </div>
            
            {active && <Visualizer isActive={active} color={volume > 0.01 ? "#4f46e5" : "#cbd5e1"} />}

            <div className="transcript-box">
               <p style={{fontWeight: 'bold', fontSize: 12, color: '#94a3b8', marginBottom: 4}}>LIVE TRANSCRIPT</p>
               <p>{centerPanel.status}</p>
               {centerPanel.transcript && <p style={{color: '#4f46e5', marginTop: 8}}>"{centerPanel.transcript}"</p>}
            </div>

        </div>
      </div>

      {/* RIGHT COLUMN: FEEDBACK */}
      <div className="col col-right">
        <div className="col-header">
            <h2>AI Suggestions</h2>
            <p>Real-time performance metrics</p>
        </div>
        <div className="col-content">
            {feedback ? (
                <div className="feedback-card">
                    <div className="feedback-label">Overall Score</div>
                    <div className="feedback-score">{feedback.overall_score || '-'}</div>
                    
                    <div className="feedback-label" style={{marginTop: 16}}>Summary</div>
                    <p className="feedback-text" style={{marginBottom: 16}}>{feedback.short_summary}</p>
                    
                    <div className="feedback-label">Strengths</div>
                    <ul className="feedback-list">
                        {feedback.strengths?.map((s: string, i: number) => <li key={i}>{s}</li>)}
                    </ul>

                    <div className="feedback-label" style={{marginTop: 16}}>Improvements</div>
                    <ul className="feedback-list">
                         {feedback.improvements?.map((s: string, i: number) => <li key={i}>{s}</li>)}
                    </ul>
                </div>
            ) : (
                <div style={{textAlign:'center', color:'#94a3b8', marginTop: 40}}>
                    <p>Start speaking to receive feedback.</p>
                </div>
            )}
        </div>
      </div>
    </div>
  );
};

export default App;